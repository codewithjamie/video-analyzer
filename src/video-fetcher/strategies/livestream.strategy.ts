import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { IFetcherStrategy, FetchResult } from './fetcher-strategy.interface';
import { UrlParser } from '../../common/utils/url-parser.util';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg = require('fluent-ffmpeg');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

@Injectable()
export class LivestreamStrategy implements IFetcherStrategy {
  private readonly logger = new Logger(LivestreamStrategy.name);
  private readonly tempDir: string;
  private readonly maxDuration: number;

  constructor(private configService: ConfigService) {
    this.tempDir =
      this.configService.get<string>('analysis.tempDir') ?? '/tmp/video-analyzer';
    this.maxDuration =
      this.configService.get<number>('livestream.maxDurationSeconds') ?? 120;

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  canHandle(url: string): boolean {
    return UrlParser.isLivestreamUrl(url);
  }

  async fetch(url: string, captureDuration?: number): Promise<FetchResult> {
    const duration = captureDuration ?? this.maxDuration;
    this.logger.log(`Capturing live stream for ${duration}s: ${url}`);

    const id = randomUUID();
    const audioPath = path.join(this.tempDir, `${id}-live-audio.mp3`);

    await this.captureStream(url, audioPath, duration);

    return {
      type: 'file',
      filePath: audioPath,
      duration,
      title: 'Live Stream Capture',
      isLive: true,
      cleanup: async () => {
        try {
          if (fs.existsSync(audioPath)) fs.unlinkSync(audioPath);
          this.logger.log(`Cleaned up: ${audioPath}`);
        } catch (err: any) {
          this.logger.warn(`Cleanup failed: ${err.message}`);
        }
      },
    };
  }

  private captureStream(
    url: string,
    outputPath: string,
    durationSeconds: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const command = ffmpeg(url)
        .inputOptions([
          '-t', String(durationSeconds), // capture duration
          '-reconnect', '1',
          '-reconnect_streamed', '1',
          '-reconnect_delay_max', '5',
        ])
        .noVideo()
        .audioCodec('libmp3lame')
        .audioFrequency(16000)
        .audioChannels(1)
        .audioBitrate('64k')
        .output(outputPath)
        .on('start', (cmd: string) => {
          this.logger.log(`FFmpeg started: ${cmd}`);
        })
        .on('progress', (progress: any) => {
          if (progress.timemark) {
            this.logger.debug(`Capturing: ${progress.timemark}`);
          }
        })
        .on('end', () => {
          this.logger.log('Live stream capture complete');
          resolve();
        })
        .on('error', (err: any) => {
          this.logger.error(`Live stream capture failed: ${err.message}`);
          reject(err);
        });

      command.run();

      // Safety timeout
      const timeout = (durationSeconds + 30) * 1000;
      setTimeout(() => {
        try {
          command.kill('SIGTERM');
        } catch {
          // ignore
        }
      }, timeout);
    });
  }
}