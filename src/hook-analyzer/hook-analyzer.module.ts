import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // ✅
import { HookAnalyzerService } from './hook-analyzer.service';

@Module({
  imports: [ConfigModule], // ✅
  providers: [HookAnalyzerService],
  exports: [HookAnalyzerService],
})
export class HookAnalyzerModule {}