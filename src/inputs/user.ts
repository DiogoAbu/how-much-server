import { IsEmail, IsNotEmpty, IsOptional, Length, Max, Min } from 'class-validator';
import { ArgsType, Field, InputType, Int, ObjectType } from 'type-graphql';

import User from '!/entities/User';
import { messageLength } from '!/utils/validation';

import { IsEmailNotUnique } from './validators/is-email-not-unique';

@InputType()
export class CreateAccountInput implements Partial<User> {
  @Field()
  @IsOptional()
  name?: string;

  @Field()
  @IsEmailNotUnique()
  @IsEmail(undefined, { message: 'Must be a valid email' })
  @IsNotEmpty()
  email: string;

  @Field()
  @Length(2, undefined, { message: messageLength })
  @IsNotEmpty()
  password: string;

  @Field()
  @IsOptional()
  pictureUri?: string;

  @Field()
  @IsNotEmpty()
  deviceName: string;
}

@InputType()
export class SignInInput {
  @Field()
  @IsEmail(undefined, { message: 'Must be a valid email' })
  @IsNotEmpty()
  email: string;

  @Field()
  @Length(2, undefined, { message: messageLength })
  @IsNotEmpty()
  password: string;

  @Field()
  @IsNotEmpty()
  deviceName: string;

  @Field()
  @IsOptional()
  totp?: string;
}

@ObjectType()
export class SignInResponse {
  @Field(() => User)
  user?: User;

  @Field()
  is2FAEnabled?: boolean;

  @Field()
  token: string;
}

@ArgsType()
export class ForgotPasswordArgs {
  @Field()
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

@InputType()
export class ChangePasswordInput {
  @Field()
  @IsNotEmpty()
  code: string;

  @Field()
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @Field()
  @Length(2, undefined, { message: messageLength })
  @IsNotEmpty()
  password: string;

  @Field()
  @IsNotEmpty()
  deviceName: string;
}

@ObjectType()
export class ChangePasswordResponse {
  @Field()
  token: string;
}

@InputType()
export class ListUsersWhere {
  @Field()
  @IsNotEmpty()
  name: string;
}

@InputType()
export class ListUsersOrder {
  @Field()
  @IsNotEmpty()
  name: 'ASC' | 'DESC';

  @Field()
  @IsNotEmpty()
  email: 'ASC' | 'DESC';
}

@ArgsType()
export class ListUsersArgs {
  @Field()
  @IsNotEmpty()
  where: ListUsersWhere;

  @Field()
  @IsOptional()
  order?: ListUsersOrder;

  @Field(() => Int, { defaultValue: 0 })
  @Min(0)
  @IsOptional()
  skip?: number;

  @Field(() => Int, { defaultValue: 10 })
  @Min(1)
  @Max(50)
  @IsOptional()
  take?: number;
}

@ObjectType()
export class ListUsersResponse {
  @Field()
  count: number;

  @Field(() => [User])
  results: User[];
}

@ObjectType()
export class DevicesAuthorizedResponse {
  @Field()
  deviceName: string;

  @Field()
  lastAccessAt: Date;

  @Field()
  createdAt: Date;
}

@ObjectType()
export class Enable2FAResponse {
  @Field()
  success: boolean;

  @Field()
  secret?: string;
}
