import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { UserLevel } from './enums/user-level.enum';

@Injectable()
export class UserService {
  private readonly logger = new Logger(UserService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { email } });
  }

  async create(
    email: string,
    hashedPassword: string,
    name?: string,
  ): Promise<User> {
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      name,
      level: UserLevel.FREE,
    });
    return this.userRepository.save(user);
  }

  async upgradeLevel(userId: string, newLevel: UserLevel): Promise<User> {
    const user = await this.findById(userId);
    if (!user) throw new Error('User not found');

    if (newLevel <= user.level) {
      throw new Error(
        `Cannot downgrade or set same level. Current: ${user.level}, Requested: ${newLevel}`,
      );
    }

    user.level = newLevel;
    const updated = await this.userRepository.save(user);
    this.logger.log(`User ${userId} upgraded to level ${newLevel}`);
    return updated;
  }
}