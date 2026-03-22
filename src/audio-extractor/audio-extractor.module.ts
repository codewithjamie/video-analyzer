import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config'; // ✅
import { AudioExtractorService } from './audio-extractor.service';

@Module({
  imports: [ConfigModule], // ✅
  providers: [AudioExtractorService],
  exports: [AudioExtractorService],
})
export class AudioExtractorModule {}  