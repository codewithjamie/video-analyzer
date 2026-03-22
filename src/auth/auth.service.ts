import {
  Injectable,
  Logger,
  UnauthorizedException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { UserService } from '../user/user.service';
import { UsageService } from '../usage/usage.service';
import { User } from '../user/user.entity';
import { UserLevel, USER_LEVEL_CONFIG } from '../user/enums/user-level.enum';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './strategies/jwt.strategy';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private userService: UserService,
    private usageService: UsageService,
    private jwtService: JwtService,
  ) {}

  async signup(dto: SignupDto) {
    // Check if email already exists
    const existing = await this.userService.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(dto.password, salt);

    // Create user
    const user = await this.userService.create(
      dto.email,
      hashedPassword,
      dto.name,
    );

    this.logger.log(`New user registered: ${user.email} (Level ${user.level})`);

    // Generate token
    const token = this.generateToken(user);
    const levelConfig = USER_LEVEL_CONFIG[user.level];

    return {
      message: 'Account created successfully',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        level: user.level,
        levelName: levelConfig.name,
      },
      limits: {
        maxAnalyses: levelConfig.maxAnalyses,
        maxVideoDuration: levelConfig.maxVideoDurationLabel,
        remaining: levelConfig.maxAnalyses,
      },
      accessToken: token,
    };
  }

  async login(dto: LoginDto) {
    const user = await this.userService.findByEmail(dto.email);
    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    this.logger.log(`User logged in: ${user.email}`);

    const token = this.generateToken(user);
    const usage = await this.usageService.getRemainingAnalyses(user);

    return {
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        level: user.level,
        levelName: usage.levelName,
      },
      limits: {
        maxAnalyses: usage.maxAllowed,
        maxVideoDuration: usage.maxVideoDuration,
        used: usage.used,
        remaining: usage.remaining,
      },
      accessToken: token,
    };
  }

  async upgradeUser(userId: string, newLevel: UserLevel) {
    if (![UserLevel.STANDARD, UserLevel.PREMIUM].includes(newLevel)) {
      throw new BadRequestException('Invalid upgrade level. Use 2 (Standard) or 3 (Premium).');
    }

    const user = await this.userService.upgradeLevel(userId, newLevel);
    const levelConfig = USER_LEVEL_CONFIG[user.level];
    const usage = await this.usageService.getRemainingAnalyses(user);

    this.logger.log(`User ${userId} upgraded to Level ${newLevel}`);

    return {
      message: `Successfully upgraded to ${levelConfig.name} (Level ${newLevel})`,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        level: user.level,
        levelName: levelConfig.name,
      },
      limits: {
        maxAnalyses: usage.maxAllowed,
        maxVideoDuration: usage.maxVideoDuration,
        used: usage.used,
        remaining: usage.remaining,
      },
    };
  }

  async getProfile(user: User) {
    const usage = await this.usageService.getRemainingAnalyses(user);
    const history = await this.usageService.getUsageHistory(user.id, 10);

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        level: user.level,
        levelName: usage.levelName,
        createdAt: user.createdAt,
      },
      limits: {
        maxAnalyses: usage.maxAllowed,
        maxVideoDuration: usage.maxVideoDuration,
        used: usage.used,
        remaining: usage.remaining,
      },
      recentAnalyses: history.map((h) => ({
        videoUrl: h.videoUrl,
        duration: `${Math.ceil(h.videoDurationSeconds / 60)} min`,
        success: h.success,
        date: h.createdAt,
      })),
    };
  }

  private generateToken(user: User): string {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      level: user.level,
    };
    return this.jwtService.sign(payload);
  }
}