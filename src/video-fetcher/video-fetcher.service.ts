import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { GoogleDriveStrategy } from './strategies/google-drive.strategy';
import { DirectUrlStrategy } from './strategies/direct-url.strategy';
import { YtdlpStrategy } from './strategies/ytdlp.strategy';
import { LivestreamStrategy } from './strategies/livestream.strategy';
import { FetchResult } from './strategies/fetcher-strategy.interface';
import { UrlParser } from '../common/utils/url-parser.util';
import { VideoSource } from '../common/dto/analyze-video.dto';

@Injectable()
export class VideoFetcherService {
  private readonly logger = new Logger(VideoFetcherService.name);

  constructor(
    private googleDriveStrategy: GoogleDriveStrategy,
    private directUrlStrategy: DirectUrlStrategy,
    private ytdlpStrategy: YtdlpStrategy,
    private livestreamStrategy: LivestreamStrategy,
  ) {}

  async fetch(
    url: string,
    source?: VideoSource,
    captureDuration?: number,
  ): Promise<FetchResult> {
    const resolved =
      source === VideoSource.AUTO || !source
        ? UrlParser.detectSource(url)
        : source;

    this.logger.log(`Source resolved: ${resolved} for URL: ${url}`);

    try {
      switch (resolved) {
        case VideoSource.GOOGLE_DRIVE:
          return await this.googleDriveStrategy.fetch(url);

        case VideoSource.YOUTUBE:
          return await this.ytdlpStrategy.fetch(url, captureDuration);

        case VideoSource.LIVESTREAM:
          return await this.livestreamStrategy.fetch(url, captureDuration);

        case VideoSource.DIRECT_URL:
        default:
          // Try yt-dlp first for unknown URLs (it supports 1000+ sites)
          if (this.ytdlpStrategy.canHandle(url)) {
            try {
              return await this.ytdlpStrategy.fetch(url, captureDuration);
            } catch (err: any) {
              this.logger.warn(
                `yt-dlp failed, falling back to direct download: ${err.message}`,
              );
            }
          }
          return await this.directUrlStrategy.fetch(url);
      }
    } catch (error: any) {
      this.logger.error(`Fetch failed: ${error.message}`);
      throw new BadRequestException(`Failed to fetch video: ${error.message}`);
    }
  }
}