import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserLevel } from './enums/user-level.enum';
import { UsageRecord } from '../usage/usage.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  email: string;

  @Column()
  password: string;

  @Column({ nullable: true })
  name: string;

  @Column({
    type: 'int',
    default: UserLevel.FREE,
  })
  level: UserLevel;

  @OneToMany(() => UsageRecord, (usage) => usage.user)
  usageRecords: UsageRecord[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}