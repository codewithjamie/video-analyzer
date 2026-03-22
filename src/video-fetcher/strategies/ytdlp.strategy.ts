import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { IFetcherStrategy, FetchResult } from './fetcher-strategy.interface';
import { UrlParser } from '../../common/utils/url-parser.util';

@Injectable()
export class YtdlpStrategy implements IFetcherStrategy {
  private readonly logger = new Logger(YtdlpStrategy.name);
  private readonly ytdlpPath: string;
  private readonly tempDir: string;
  private readonly maxLiveDuration: number;

  constructor(private configService: ConfigService) {
    this.ytdlpPath = this.configService.get<string>('ytdlp.path') ?? 'yt-dlp';
    this.tempDir =
      this.configService.get<string>('analysis.tempDir') ?? '/tmp/video-analyzer';
    this.maxLiveDuration =
      this.configService.get<number>('livestream.maxDurationSeconds') ?? 120;

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  canHandle(url: string): boolean {
    return UrlParser.isYouTubeUrl(url) || UrlParser.isSupportedPlatform(url);
  }

  async fetch(url: string, captureDuration?: number): Promise<FetchResult> {
    this.logger.log(`yt-dlp fetching: ${url}`);

    // 1. Get video info
    const info = await this.getVideoInfo(url);
    this.logger.log(
      `Video: "${info.title}" | Duration: ${info.duration}s | Live: ${info.isLive}`,
    );

    // 2. Download audio only
    const audioPath = await this.downloadAudio(
      url,
      info.isLive,
      captureDuration,
    );

    return {
      type: 'file',
      filePath: audioPath,
      duration: info.duration,
      title: info.title,
      isLive: info.isLive,
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

  private getVideoInfo(
    url: string,
  ): Promise<{ title: string; duration: number; isLive: boolean }> {
    return new Promise((resolve, reject) => {
      const args = ['--dump-json', '--no-download', '--no-warnings', url];
      const proc = spawn(this.ytdlpPath, args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => (stdout += data.toString()));
      proc.stderr.on('data', (data) => (stderr += data.toString()));

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`yt-dlp info failed: ${stderr}`));
        }
        try {
          const json = JSON.parse(stdout);
          resolve({
            title: json.title || 'Unknown',
            duration: json.duration || 0,
            isLive: json.is_live === true,
          });
        } catch (err) {
          reject(new Error(`Failed to parse yt-dlp output: ${err}`));
        }
      });

      proc.on('error', (err) =>
        reject(new Error(`yt-dlp not found. Install it: ${err.message}`)),
      );
    });
  }

  private downloadAudio(
    url: string,
    isLive: boolean,
    captureDuration?: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const outputTemplate = path.join(this.tempDir, `${id}-audio`);
      const expectedOutput = `${outputTemplate}.mp3`;

      const args: string[] = [
        // Extract audio only
        '-x',
        '--audio-format', 'mp3',
        '--audio-quality', '5', // decent quality, small file
        // Output
        '-o', `${outputTemplate}.%(ext)s`,
        // No playlist
        '--no-playlist',
        // Quiet
        '--no-warnings',
        '--quiet',
      ];

      // For live streams: limit capture duration
      if (isLive) {
        const duration = captureDuration ?? this.maxLiveDuration;
        args.push(
          '--download-sections', `*0:00-0:${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`,
        );
        this.logger.log(`Live stream: capturing ${duration}s`);
      }

      // Add URL last
      args.push(url);

      this.logger.log(`yt-dlp args: ${args.join(' ')}`);

      const proc = spawn(this.ytdlpPath, args);
      let stderr = '';

      proc.stderr.on('data', (data) => (stderr += data.toString()));

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(`yt-dlp download failed (code ${code}): ${stderr}`));
        }

        // yt-dlp may output with slightly different extension
        // Find the actual output file
        const actualPath = this.findOutputFile(outputTemplate);
        if (!actualPath) {
          return reject(new Error('yt-dlp completed but output file not found'));
        }

        this.logger.log(`Audio downloaded: ${actualPath}`);
        resolve(actualPath);
      });

      proc.on('error', (err) =>
        reject(new Error(`yt-dlp not found: ${err.message}`)),
      );

      // Timeout for safety
      const timeout = isLive
        ? (captureDuration ?? this.maxLiveDuration) * 1000 + 30000
        : 300000; // 5 min for regular videos

      setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error(`yt-dlp timed out after ${timeout / 1000}s`));
      }, timeout);
    });
  }

  /**
   * yt-dlp sometimes outputs .mp3, sometimes .m4a, etc.
   * Find whatever file was actually created.
   */
  private findOutputFile(basePath: string): string | null {
    const dir = path.dirname(basePath);
    const base = path.basename(basePath);
    const extensions = ['.mp3', '.m4a', '.opus', '.ogg', '.wav', '.webm'];

    // Check exact match first
    for (const ext of extensions) {
      const candidate = `${basePath}${ext}`;
      if (fs.existsSync(candidate)) return candidate;
    }

    // Fallback: scan directory for files starting with our UUID
    try {
      const files = fs.readdirSync(dir);
      const match = files.find((f) => f.startsWith(base));
      if (match) return path.join(dir, match);
    } catch {
      // ignore
    }

    return null;
  }
}