import {
  Injectable,
  Logger,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsageRecord } from './usage.entity';
import { User } from '../user/user.entity';
import { UserLevel, USER_LEVEL_CONFIG } from '../user/enums/user-level.enum';

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    @InjectRepository(UsageRecord)
    private usageRepository: Repository<UsageRecord>,
  ) {}

  /**
   * Check if user can analyze a video based on their level
   */
  async validateUsage(
    user: User,
    videoDurationSeconds?: number,
  ): Promise<void> {
    const config = USER_LEVEL_CONFIG[user.level];

    if (!config) {
      throw new ForbiddenException('Invalid user level');
    }

    // 1. Check usage count for FREE users
    if (user.level === UserLevel.FREE) {
      const usageCount = await this.getUsageCount(user.id);
      if (usageCount >= config.maxAnalyses) {
        throw new ForbiddenException({
          message: `Free tier limit reached. You have used all ${config.maxAnalyses} free analyses.`,
          currentUsage: usageCount,
          maxAllowed: config.maxAnalyses,
          currentLevel: user.level,
          upgrade: 'Upgrade to Standard (Level 2) for unlimited analyses up to 10 min videos.',
        });
      }
      this.logger.log(
        `Free user ${user.id}: ${usageCount}/${config.maxAnalyses} analyses used`,
      );
    }

    // 2. Check video duration limit
    if (videoDurationSeconds && videoDurationSeconds > config.maxVideoDurationSeconds) {
      throw new BadRequestException({
        message: `Video duration ${Math.ceil(videoDurationSeconds / 60)} min exceeds your ${config.maxVideoDurationLabel} limit.`,
        videoDurationSeconds,
        maxAllowedSeconds: config.maxVideoDurationSeconds,
        maxAllowedLabel: config.maxVideoDurationLabel,
        currentLevel: user.level,
        currentLevelName: config.name,
        upgrade: this.getUpgradeMessage(user.level),
      });
    }
  }

  /**
   * Record a usage attempt
   */
  async recordUsage(
    userId: string,
    videoUrl: string,
    videoDurationSeconds: number,
    userLevel: UserLevel,
    success: boolean,
    errorMessage?: string,
  ): Promise<UsageRecord> {
    const record = this.usageRepository.create({
      userId,
      videoUrl,
      videoDurationSeconds,
      userLevelAtTime: userLevel,
      success,
      errorMessage,
    });
    return this.usageRepository.save(record);
  }

  /**
   * Get total successful analyses count for a user
   */
  async getUsageCount(userId: string): Promise<number> {
    return this.usageRepository.count({
      where: { userId, success: true },
    });
  }

  /**
   * Get usage history for a user
   */
  async getUsageHistory(
    userId: string,
    limit = 20,
  ): Promise<UsageRecord[]> {
    return this.usageRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get remaining analyses for a user
   */
  async getRemainingAnalyses(user: User): Promise<{
    used: number;
    remaining: number | 'unlimited';
    maxAllowed: number | 'unlimited';
    maxVideoDuration: string;
    level: number;
    levelName: string;
  }> {
    const config = USER_LEVEL_CONFIG[user.level];
    const used = await this.getUsageCount(user.id);

    return {
      used,
      remaining:
        config.maxAnalyses === Infinity
          ? 'unlimited'
          : Math.max(0, config.maxAnalyses - used),
      maxAllowed:
        config.maxAnalyses === Infinity ? 'unlimited' : config.maxAnalyses,
      maxVideoDuration: config.maxVideoDurationLabel,
      level: user.level,
      levelName: config.name,
    };
  }

  private getUpgradeMessage(currentLevel: UserLevel): string {
    switch (currentLevel) {
      case UserLevel.FREE:
        return 'Upgrade to Standard (Level 2) for unlimited analyses up to 10 min, or Premium (Level 3) for up to 30 min.';
      case UserLevel.STANDARD:
        return 'Upgrade to Premium (Level 3) for videos up to 30 minutes.';
      default:
        return 'You are on the highest tier.';
    }
  }
}