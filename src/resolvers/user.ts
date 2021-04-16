import { ApolloError } from 'apollo-server';
import { Arg, Args, Authorized, Ctx, FieldResolver, Mutation, Query, Resolver, Root } from 'type-graphql';

import User from '!/entities/User';
import {
  ChangePasswordInput,
  ChangePasswordResponse,
  CreateAccountInput,
  ForgotPasswordArgs,
  ListUsersArgs,
  ListUsersResponse,
  SignInInput,
  SignInResponse,
} from '!/inputs/user';
import { destroyToken, payloadToToken } from '!/services/authentication';
import debug from '!/services/debug';
import mailer from '!/services/mailer';
import { Context } from '!/types';
import randomInteger from '!/utils/random-integer';

const log = debug.extend('user');
const EXPIRE_HOURS = parseInt(process.env.PASSWORD_CHANGE_EXPIRE_HOURS!, 10) || 4;

@Resolver(() => User)
export class UserResolver {
  @Authorized(['read:own:account'])
  @Query(() => User)
  async me(@Ctx() ctx: Context): Promise<User> {
    // Signed in user
    const userId = ctx.userId!;

    const user = await User.findOne(userId);

    if (!user) {
      throw new ApolloError('User not found', 'NOT_FOUND');
    }

    return user;
  }

  @Mutation(() => SignInResponse)
  async createAccount(@Arg('data') data: CreateAccountInput): Promise<SignInResponse> {
    const { name, email, password, pictureUri, uniqueIdentifier } = data;

    const user = await User.create({
      name,
      email,
      password,
      pictureUri,
      lastAccessAt: new Date(),
    }).save();

    return {
      user,
      token: await payloadToToken(user, uniqueIdentifier),
    };
  }

  @Mutation(() => SignInResponse)
  async signIn(@Arg('data') data: SignInInput): Promise<SignInResponse> {
    const { email, password, uniqueIdentifier } = data;

    const user = await User.createQueryBuilder('user')
      .where('user.email = :email AND user.isDeleted = false', { email })
      .addSelect('user.password')
      .getOne();

    if (!user) {
      throw new ApolloError('User not found', 'NOT_FOUND');
    }

    if (!(await user.matchPassword(password))) {
      throw new ApolloError('User not found', 'UNAUTHORIZED');
    }

    // Update the last acccess datetime
    user.lastAccessAt = new Date();
    await user.save();

    return {
      user,
      token: await payloadToToken(user, uniqueIdentifier),
    };
  }

  @Mutation(() => Boolean, {
    description: 'Find the user, store an one-time-password, and send it to the user`s email.',
  })
  async forgotPassword(@Args() data: ForgotPasswordArgs): Promise<boolean> {
    const { email } = data;

    const user = await User.findOne({ email });
    if (!user) {
      // Returns true even if not found to not disclose the existence of the email
      return true;
    }

    // Create code
    const code = randomInteger(6);

    // Get date and add expiration days
    const date = new Date();
    date.setHours(date.getHours() + EXPIRE_HOURS);

    // Update user document
    user.passwordChangeCode = code;
    user.passwordChangeExpires = date;

    await user.save();
    try {
      await mailer(email, code, EXPIRE_HOURS);
    } catch (err) {
      // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
      const msg = `${err.name}:${err.message}`;
      throw new ApolloError("Failed to send code to user's email (" + msg + ')');
    }

    return true;
  }

  @Mutation(() => ChangePasswordResponse, {
    description:
      'Find the user related to the one-time-password, check its validity, and update the password. All tokens will get revoked and a new one will be returned',
  })
  async changePassword(@Arg('data') data: ChangePasswordInput): Promise<ChangePasswordResponse> {
    const { code, email, password, uniqueIdentifier } = data;

    const user = await User.createQueryBuilder('user')
      .where('user.passwordChangeCode = :code', { code })
      .andWhere('user.email = :email', { email })
      .andWhere('user.isDeleted = false')
      .addSelect('user.passwordChangeCode')
      .addSelect('user.passwordChangeExpires')
      .getOne();

    if (!user?.passwordChangeExpires) {
      throw new ApolloError('Code not found', 'NOT_FOUND');
    }

    const now = Date.now();
    const expires = user.passwordChangeExpires.getTime();

    // If today is greater than the expire date
    if (now > expires) {
      throw new ApolloError('Code is invalid', 'NOT_ACCEPTABLE');
    }

    await destroyToken(user.id);

    // Update user document, password will get hashed
    user.password = password;
    user.passwordChangeCode = null;
    user.passwordChangeExpires = null;

    await user.save();

    return {
      success: true,
      token: await payloadToToken(user, uniqueIdentifier),
    };
  }

  @Authorized()
  @Query(() => ListUsersResponse)
  async listUsers(@Args() data: ListUsersArgs): Promise<ListUsersResponse> {
    const { where, order, skip, take } = data;

    let query = User.createQueryBuilder('u')
      .select('u.id')
      .where('u.isDeleted = false')
      .andWhere('u.name IS NOT null');

    if (where?.name) {
      query = query.andWhere('u.name ILIKE :name', { name: where.name });
    }

    if (order?.name) {
      query = query.addOrderBy('u.name', order.name === 'DESC' ? 'DESC' : 'ASC');
    }

    const count = await query.distinct(true).getCount();

    const users = await query
      .addSelect('u.name')
      .addSelect('u.pictureUri')
      .addSelect('u.isDeleted')
      .skip(skip)
      .take(take)
      .getMany();

    return {
      count,
      results: users,
    };
  }

  @Authorized()
  @Mutation(() => Boolean, {
    description: 'Add signed user as follower',
  })
  async startFollowing(
    @Arg('userId', { nullable: false }) userIdToFollow: string,
    @Ctx() ctx: Context,
  ): Promise<boolean> {
    // Signed in user
    const userId = ctx.userId!;

    if (userId === userIdToFollow) {
      log('User cannot follow itself');
      return false;
    }

    const userFound = await User.findOne(userId);
    if (!userFound) {
      throw new ApolloError('User not found', 'NOT_FOUND');
    }

    const userToFollow = await User.findOne(userIdToFollow, { relations: ['followers'] });
    if (!userToFollow) {
      throw new ApolloError('User not found', 'NOT_FOUND');
    }

    // Add self as follower of user
    userToFollow.followers.push(userFound);

    await userToFollow.save();

    return true;
  }

  @Authorized()
  @Mutation(() => Boolean, {
    description: 'Remove signed user as follower',
  })
  async stopFollowing(
    @Arg('userId', { nullable: false }) userIdToUnfollow: string,
    @Ctx() ctx: Context,
  ): Promise<boolean> {
    // Signed in user
    const userId = ctx.userId!;

    if (userId === userIdToUnfollow) {
      log('User cannot unfollow itself');
      return false;
    }

    const userToUnfollow = await User.findOne(userIdToUnfollow, { relations: ['followers'] });
    if (!userToUnfollow) {
      throw new ApolloError('User not found', 'NOT_FOUND');
    }

    // Remove self from followers of user
    userToUnfollow.followers = userToUnfollow.followers.filter((each) => each.id !== userId);

    await userToUnfollow.save();

    return true;
  }

  @FieldResolver(() => Boolean, {
    nullable: true,
    description: 'If user is following the signed user',
  })
  async isFollowingMe(@Root() user: User, @Ctx() ctx: Context): Promise<boolean | null> {
    // Signed in user
    const userId = ctx.userId!;

    if (userId === user.id) {
      return null;
    }

    // Signed user has the specified user as follower
    const userFound = await User.createQueryBuilder('user')
      .leftJoinAndSelect('user.followers', 'follower')
      .where('user.id = :userId AND user.isDeleted = false', { userId })
      .andWhere('follower.id = :id', { id: user.id })
      .getOne();

    return !!userFound;
  }

  @FieldResolver(() => Boolean, {
    nullable: true,
    description: 'If signed user is following the user',
  })
  async isFollowedByMe(@Root() user: User, @Ctx() ctx: Context): Promise<boolean | null> {
    // Signed in user
    const userId = ctx.userId!;

    if (userId === user.id) {
      return null;
    }

    // Specified user has the signed user as follower
    const userFound = await User.createQueryBuilder('user')
      .leftJoinAndSelect('user.followers', 'follower')
      .where('user.id = :id AND user.isDeleted = false', { id: user.id })
      .andWhere('follower.id = :userId', { userId })
      .getOne();

    return !!userFound;
  }
}
