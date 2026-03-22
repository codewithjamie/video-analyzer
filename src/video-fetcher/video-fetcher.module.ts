import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { VideoFetcherService } from './video-fetcher.service';
import { GoogleDriveStrategy } from './strategies/google-drive.strategy';
import { DirectUrlStrategy } from './strategies/direct-url.strategy';
import { YtdlpStrategy } from './strategies/ytdlp.strategy';
import { LivestreamStrategy } from './strategies/livestream.strategy';

@Module({
  imports: [ConfigModule],
  providers: [
    VideoFetcherService,
    GoogleDriveStrategy,
    DirectUrlStrategy,
    YtdlpStrategy,
    LivestreamStrategy,
  ],
  exports: [VideoFetcherService],
})
export class VideoFetcherModule {}