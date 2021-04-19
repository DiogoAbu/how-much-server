import { ApolloError } from 'apollo-server';
import { authenticator } from 'otplib';
import { Arg, Args, Authorized, Ctx, FieldResolver, Mutation, Query, Resolver, Root } from 'type-graphql';

import { ALLOW_SHORT_LIVED_TOKEN } from '!/constants';
import User from '!/entities/User';
import {
  ChangePasswordInput,
  ChangePasswordResponse,
  CreateAccountInput,
  DevicesAuthorizedResponse,
  Enable2FAResponse,
  ForgotPasswordArgs,
  ListUsersArgs,
  ListUsersResponse,
  SignInInput,
  SignInResponse,
} from '!/inputs/user';
import { destroyToken, payloadToToken } from '!/services/authentication';
import debug from '!/services/debug';
import mailer from '!/services/mailer';
import { tokenRedis } from '!/services/redis';
import { Context, TokenRedisRow } from '!/types';
import randomInteger from '!/utils/random-integer';

const log = debug.extend('user');
const EXPIRE_HOURS = parseInt(process.env.PASSWORD_CHANGE_EXPIRE_HOURS!, 10) || 4;

@Resolver(() => User)
export class UserResolver {
  @Mutation(() => SignInResponse)
  async createAccount(@Arg('data') data: CreateAccountInput): Promise<SignInResponse> {
    const { name, email, password, pictureUri, deviceName } = data;

    const user = await User.create({
      name,
      email,
      password,
      pictureUri,
      lastAccessAt: new Date(),
    }).save();

    return {
      user,
      token: await payloadToToken(user, deviceName),
    };
  }

  @Mutation(() => SignInResponse, {
    description:
      'Verify existence of user and return token. A short-lived token is returned if 2FA is enabled, use signInWith2FA with the token to confirm the user.',
  })
  async signIn(@Arg('data') data: SignInInput): Promise<SignInResponse> {
    const { email, password, deviceName } = data;

    const user = await User.createQueryBuilder('user')
      .where('user.email = :email', { email })
      .andWhere('user.isDeleted = false')
      .addSelect('user.password')
      .addSelect('user.is2FAEnabled')
      .getOne();

    if (!user) {
      throw new ApolloError('User not found', 'NOT_FOUND');
    }

    if (!(await user.matchPassword(password))) {
      throw new ApolloError('User not found', 'UNAUTHORIZED');
    }

    if (user.is2FAEnabled) {
      return {
        user: undefined,
        token: await payloadToToken(user, deviceName, true),
        is2FAEnabled: true,
      };
    }

    // Update the last acccess datetime
    user.lastAccessAt = new Date();
    await user.save();

    return {
      user,
      token: await payloadToToken(user, deviceName),
      is2FAEnabled: false,
    };
  }

  @Authorized(ALLOW_SHORT_LIVED_TOKEN)
  @Mutation(() => SignInResponse, {
    description: 'Verify existence of a 2FA enabled user, check the TOTP, and return token.',
  })
  async signInWith2FA(@Arg('data') data: SignInInput): Promise<SignInResponse> {
    const { email, password, deviceName, totp } = data;

    const user = await User.createQueryBuilder('user')
      .where('user.email = :email', { email })
      .andWhere('user.isDeleted = false')
      .addSelect('user.password')
      .addSelect('user.is2FAEnabled')
      .addSelect('user.secret2FA')
      .getOne();

    if (!user?.secret2FA || !user?.is2FAEnabled || !totp) {
      throw new ApolloError('User not found', 'NOT_FOUND');
    }

    if (!(await user.matchPassword(password))) {
      throw new ApolloError('User not found', 'UNAUTHORIZED');
    }

    const isValidTOTP = authenticator.check(totp, user.secret2FA);
    if (!isValidTOTP) {
      throw new ApolloError('TOTP is invalid', 'UNAUTHORIZED');
    }

    // Update the last acccess datetime
    user.lastAccessAt = new Date();
    await user.save();

    return {
      user,
      token: await payloadToToken(user, deviceName),
    };
  }

  @Authorized()
  @Mutation(() => Enable2FAResponse, {
    description:
      'Add authenticator secret to user, and return qr code link. Use verify2FA to confirm and enable the 2FA',
  })
  async enable2FA(@Ctx() ctx: Required<Context>): Promise<Enable2FAResponse> {
    // Signed in user
    const { userId } = ctx;

    const user = await User.createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .andWhere('user.isDeleted = false')
      .addSelect('user.secret2FA')
      .getOne();

    if (!user) {
      throw new ApolloError('User not found', 'NOT_FOUND');
    }

    if (!user.secret2FA) {
      let secret2FA;
      while (!secret2FA || (await User.findOne({ secret2FA }))) {
        secret2FA = authenticator.generateSecret();
      }

      user.secret2FA = secret2FA;
      await user.save();

      return {
        success: true,
        secret: user.secret2FA,
      };
    }

    return {
      success: true,
    };
  }

  @Authorized()
  @Mutation(() => Boolean, {
    description: 'Given a Time-based One Time Password, verify it, and enable 2FA for the user',
  })
  async verify2FA(@Arg('totp') totp: string, @Ctx() ctx: Required<Context>): Promise<boolean> {
    // Signed in user
    const { userId } = ctx;

    const user = await User.createQueryBuilder('user')
      .where('user.id = :userId', { userId })
      .andWhere('user.isDeleted = false')
      .addSelect('user.secret2FA')
      .getOne();

    if (!user?.secret2FA) {
      throw new ApolloError('User not found', 'NOT_FOUND');
    }

    const isValidTOTP = authenticator.check(totp, user.secret2FA);
    if (!isValidTOTP) {
      throw new ApolloError('TOTP token is invalid', 'UNAUTHORIZED');
    }

    user.is2FAEnabled = true;
    await user.save();

    return true;
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

    // Get date and calc expiration date
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
    const { code, email, password, deviceName } = data;

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

    // If today is greater than the expiration date
    if (now > expires) {
      user.passwordChangeCode = null;
      user.passwordChangeExpires = null;
      await user.save();

      throw new ApolloError('Code is invalid', 'NOT_ACCEPTABLE');
    }

    await destroyToken(user.id);

    // Update user document, password will get hashed
    user.password = password;
    user.passwordChangeCode = null;
    user.passwordChangeExpires = null;
    user.lastAccessAt = new Date();

    await user.save();

    return {
      token: await payloadToToken(user, deviceName),
    };
  }

  @Authorized()
  @Query(() => User)
  async me(@Ctx() ctx: Required<Context>): Promise<User> {
    // Signed in user
    const { userId } = ctx;

    const user = await User.findOne({ where: { id: userId, isDeleted: false } });
    if (!user) {
      throw new ApolloError('User not found', 'NOT_FOUND');
    }

    return user;
  }

  @Authorized()
  @Query(() => [DevicesAuthorizedResponse])
  async devicesAuthorized(@Ctx() ctx: Required<Context>): Promise<DevicesAuthorizedResponse[]> {
    // Signed in user
    const { userId } = ctx;

    const tokens: TokenRedisRow[] = JSON.parse((await tokenRedis.get(userId)) ?? '[]');

    return tokens.map<DevicesAuthorizedResponse>(({ deviceName, lastAccessAt, createdAt }) => ({
      deviceName,
      lastAccessAt: new Date(lastAccessAt),
      createdAt: new Date(createdAt),
    }));
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
    @Ctx() ctx: Required<Context>,
  ): Promise<boolean> {
    // Signed in user
    const { userId } = ctx;

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
    @Ctx() ctx: Required<Context>,
  ): Promise<boolean> {
    // Signed in user
    const { userId } = ctx;

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
    const { userId } = ctx;

    if (!userId || userId === user.id) {
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
    const { userId } = ctx;

    if (!userId || userId === user.id) {
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
