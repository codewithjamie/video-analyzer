import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { UpgradeDto } from './dto/upgrade.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../user/user.entity';

@ApiTags('auth')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('signup')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new account',
    description: `
Creates a new user account with **Free tier (Level 1)**:
- ✅ 3 free video analyses
- ✅ Videos up to 3 minutes
- 🔒 Upgrade to unlock more
    `,
  })
  @ApiBody({ type: SignupDto })
  @ApiResponse({
    status: 201,
    description: 'Account created successfully. Returns JWT token.',
  })
  @ApiResponse({ status: 409, description: 'Email already registered' })
  async signup(@Body() dto: SignupDto) {
    return this.authService.signup(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Login to existing account',
    description: 'Returns JWT token and current usage limits.',
  })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('upgrade')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Upgrade account level',
    description: `
Upgrade your account:
- **Level 2 (Standard)**: Unlimited analyses, up to 10 min videos
- **Level 3 (Premium)**: Unlimited analyses, up to 30 min videos
    `,
  })
  @ApiBody({ type: UpgradeDto })
  @ApiResponse({ status: 200, description: 'Account upgraded' })
  @ApiResponse({ status: 400, description: 'Invalid level or already at that level' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async upgrade(@CurrentUser() user: User, @Body() dto: UpgradeDto) {
    return this.authService.upgradeUser(user.id, dto.level);
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Get current user profile & usage',
    description: 'Returns user info, current limits, and recent analysis history.',
  })
  @ApiResponse({ status: 200, description: 'Profile data' })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  async profile(@CurrentUser() user: User) {
    return this.authService.getProfile(user);
  }
}