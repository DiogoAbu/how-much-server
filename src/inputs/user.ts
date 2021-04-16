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
  uniqueIdentifier: string;
}

@InputType()
export class SignInInput implements Partial<User> {
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
  uniqueIdentifier: string;
}

@ArgsType()
export class ForgotPasswordArgs implements Partial<User> {
  @Field()
  @IsEmail()
  @IsNotEmpty()
  email: string;
}

@InputType()
export class ChangePasswordInput implements Partial<User> {
  @Field()
  @IsNotEmpty()
  code: number;

  @Field()
  @Length(2, undefined, { message: messageLength })
  @IsNotEmpty()
  password: string;

  @Field()
  @IsNotEmpty()
  uniqueIdentifier: string;
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
export class SignInResponse {
  @Field(() => User)
  user: User;

  @Field()
  token: string;
}

@ObjectType()
export class ChangePasswordResponse {
  @Field()
  success: boolean;

  @Field()
  token: string;
}
