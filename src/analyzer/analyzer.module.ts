import { Module } from '@nestjs/common';
import { AnalyzerController } from './analyzer.controller';
import { AnalyzerService } from './analyzer.service';
import { VideoFetcherModule } from '../video-fetcher/video-fetcher.module';
import { AudioExtractorModule } from '../audio-extractor/audio-extractor.module';
import { TranscriptModule } from '../transcript/transcript.module';
import { CaptionModule } from '../caption/caption.module';
import { HookAnalyzerModule } from '../hook-analyzer/hook-analyzer.module';
import { HookClipperModule } from '../hook-clipper/hook-clipper.module';
import { UsageModule } from '../usage/usage.module';

@Module({
  imports: [
    VideoFetcherModule,
    AudioExtractorModule,
    TranscriptModule,
    CaptionModule,
    HookAnalyzerModule,
    HookClipperModule,
    UsageModule,
  ],
  controllers: [AnalyzerController],
  providers: [AnalyzerService],
})
export class AnalyzerModule {}