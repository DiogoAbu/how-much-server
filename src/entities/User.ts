import { Field, ID, ObjectType } from 'type-graphql';
import {
  AfterLoad,
  BaseEntity,
  BeforeInsert,
  BeforeUpdate,
  Column,
  CreateDateColumn,
  Entity,
  JoinTable,
  ManyToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

import { comparePass, hashPass } from '!/services/encryption';

@ObjectType()
@Entity('users')
export default class User extends BaseEntity {
  @Field(() => ID)
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Field()
  @Column({ type: 'text', nullable: true })
  name?: string;

  @Field()
  @Column({ type: 'text', nullable: true })
  pictureUri?: string;

  @Field()
  @Column({ type: 'text', unique: true })
  email: string;

  @Column({ type: 'text', select: false })
  password: string;

  @Column({ type: 'text', unique: true, nullable: true, select: false })
  passwordChangeCode: number | null;

  @Column({ type: 'timestamptz', nullable: true, select: false })
  passwordChangeExpires: Date | null;

  @ManyToMany(() => User, (user) => user.followersInverse, {
    cascade: false,
  })
  @JoinTable()
  followers: User[];

  @ManyToMany(() => User, (user) => user.followers, {
    cascade: ['insert', 'update'],
  })
  followersInverse: User[];

  @Field()
  @Column({ type: 'timestamptz', select: false })
  lastAccessAt: Date;

  @Column({ default: false })
  isDeleted: boolean;

  @Field()
  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Field()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  // Only on GraphQL
  @Field(() => Boolean, { nullable: true })
  isFollowingMe: boolean | null;

  // Only on GraphQL
  @Field(() => Boolean, { nullable: true })
  isFollowedByMe: boolean | null;

  private tempPassword: string;

  @AfterLoad()
  private _loadTempPassword(): void {
    this.tempPassword = this.password;
  }

  /**
   * Check if password is modified and replace it with its encrypted version.
   */
  @BeforeInsert()
  @BeforeUpdate()
  async hashPassword(): Promise<void> {
    // Only hash if password have been modified, or is new
    if (this.tempPassword === this.password) {
      return;
    }

    try {
      this.password = await hashPass({ plain: this.password });
      this._loadTempPassword();
      return;
    } catch (err) {
      return;
    }
  }

  async matchPassword(plain: string): Promise<boolean> {
    return await comparePass({ plain, hashed: this.password });
  }
}
