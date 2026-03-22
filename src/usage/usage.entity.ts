import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

@Entity('usage_records')
export class UsageRecord {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  userId: string;

  @ManyToOne(() => User, (user) => user.usageRecords)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  videoUrl: string;

  @Column({ type: 'float' })
  videoDurationSeconds: number;

  @Column({ type: 'int' })
  userLevelAtTime: number;

  @Column({ default: true })
  success: boolean;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;
}