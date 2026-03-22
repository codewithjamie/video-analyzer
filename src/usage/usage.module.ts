import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsageRecord } from './usage.entity';
import { UsageService } from './usage.service';

@Module({
  imports: [TypeOrmModule.forFeature([UsageRecord])],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}