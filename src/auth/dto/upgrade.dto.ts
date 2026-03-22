import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { UserLevel } from '../../user/enums/user-level.enum';

export class UpgradeDto {
  @ApiProperty({
    description: 'Target level to upgrade to',
    enum: [UserLevel.STANDARD, UserLevel.PREMIUM],
    example: 2,
  })
  @IsEnum(UserLevel)
  level: UserLevel;
}