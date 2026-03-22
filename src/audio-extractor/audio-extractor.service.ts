import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { FetchResult } from '../video-fetcher/strategies/fetcher-strategy.interface';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg = require('fluent-ffmpeg');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface AudioExtractionResult {
  audioPath: string;
  duration: number;
  title?: string;
  isLive: boolean;
  cleanup: () => Promise<void>;
}

/** Shared ffmpeg audio output settings — single source of truth */
const AUDIO_SETTINGS = {
  codec: 'libmp3lame',
  frequency: 16000,
  channels: 1,
  bitrate: '64k',
} as const;

const COMPRESS_BITRATE = '32k';
const MAX_FILE_BYTES = 24 * 1024 * 1024; // 24MB (safety buffer for OpenAI 25MB limit)

@Injectable()
export class AudioExtractorService {
  private readonly logger = new Logger(AudioExtractorService.name);
  private readonly tempDir: string;
  private readonly maxDuration: number;

  constructor(private configService: ConfigService) {
    this.tempDir =
      this.configService.get<string>('analysis.tempDir') ?? '/tmp/video-analyzer';
    this.maxDuration =
      this.configService.get<number>('analysis.maxVideoDurationSeconds') ?? 600;

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  /**
   * Entry point — handles both fetch result types:
   * - 'file': audio already extracted by yt-dlp / livestream strategy
   * - 'stream': raw video stream that needs audio extraction via ffmpeg
   */
  async processFetchResult(fetchResult: FetchResult): Promise<AudioExtractionResult> {
    if (fetchResult.type === 'file') {
      return this.handleFileResult(fetchResult);
    }
    return this.handleStreamResult(fetchResult);
  }

  // ---------------------------------------------------------------------------
  // File result (yt-dlp already gave us audio)
  // ---------------------------------------------------------------------------

  private async handleFileResult(fetchResult: FetchResult): Promise<AudioExtractionResult> {
    const { filePath } = fetchResult;

    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error('Audio file not found from fetch result');
    }

    const duration = await this.getFileDuration(filePath);
    this.logger.log(`File result: ${filePath} | Duration: ${duration}s`);

    await this.assertDuration(duration, fetchResult.cleanup);

    const id = randomUUID();
    let outputPath = path.join(this.tempDir, `${id}-normalized.mp3`);
    await this.runFfmpeg(filePath, outputPath, AUDIO_SETTINGS.bitrate);

    outputPath = await this.compressIfNeeded(outputPath, id);

    // Original yt-dlp file no longer needed
    if (fetchResult.cleanup) await fetchResult.cleanup();

    return this.buildResult(outputPath, duration, fetchResult.title, fetchResult.isLive ?? false);
  }

  // ---------------------------------------------------------------------------
  // Stream result (Google Drive / direct URL)
  // ---------------------------------------------------------------------------

  private async handleStreamResult(fetchResult: FetchResult): Promise<AudioExtractionResult> {
    if (!fetchResult.stream) {
      throw new Error('No stream in fetch result');
    }

    const id = randomUUID();
    const tempVideoPath = path.join(this.tempDir, `${id}-video.mp4`);
    let tempAudioPath   = path.join(this.tempDir, `${id}-audio.mp3`);

    try {
      await this.streamToFile(fetchResult.stream, tempVideoPath);
      this.logger.log(`Temp video saved: ${tempVideoPath}`);

      const duration = await this.getFileDuration(tempVideoPath);
      this.logger.log(`Video duration: ${duration}s`);

      await this.assertDuration(duration);

      await this.runFfmpeg(tempVideoPath, tempAudioPath, AUDIO_SETTINGS.bitrate);
      this.logger.log(`Audio extracted: ${tempAudioPath}`);

      tempAudioPath = await this.compressIfNeeded(tempAudioPath, id);

      // Temp video no longer needed after audio is extracted
      await this.deleteFile(tempVideoPath);

      return this.buildResult(tempAudioPath, duration, fetchResult.title, false);
    } catch (error) {
      await this.deleteFile(tempVideoPath);
      await this.deleteFile(tempAudioPath);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Shared helpers
  // ---------------------------------------------------------------------------

  /**
   * Runs ffmpeg to convert/normalize audio to 16kHz mono mp3.
   * Used for both normalization (from yt-dlp file) and extraction (from video stream).
   */
  private runFfmpeg(
    inputPath: string,
    outputPath: string,
    bitrate: string,
    stripMetadata = false,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      let cmd = ffmpeg(inputPath)
        .noVideo()
        .audioCodec(AUDIO_SETTINGS.codec)
        .audioFrequency(AUDIO_SETTINGS.frequency)
        .audioChannels(AUDIO_SETTINGS.channels)
        .audioBitrate(bitrate)
        .output(outputPath);

      if (stripMetadata) {
        cmd = cmd.addOutputOption('-map_metadata', '-1');
      }

      cmd
        .on('end', () => resolve())
        .on('error', (err: any) => reject(err))
        .run();
    });
  }

  /**
   * Checks file size and re-encodes at lower bitrate if over 24MB.
   * Returns the path to use (may be a new compressed file).
   */
  private async compressIfNeeded(inputPath: string, id: string): Promise<string> {
    const fileSize = fs.statSync(inputPath).size;

    if (fileSize <= MAX_FILE_BYTES) return inputPath;

    this.logger.warn(
      `Audio too large (${(fileSize / 1024 / 1024).toFixed(2)}MB) — compressing to ${COMPRESS_BITRATE}...`,
    );

    const compressedPath = path.join(this.tempDir, `${id}-compressed.mp3`);
    await this.runFfmpeg(inputPath, compressedPath, COMPRESS_BITRATE, true);

    const newSize = fs.statSync(compressedPath).size / 1024 / 1024;
    this.logger.log(`Compressed to ${newSize.toFixed(2)}MB: ${compressedPath}`);

    // Remove the uncompressed version — no longer needed
    await this.deleteFile(inputPath);

    return compressedPath;
  }

  /**
   * Throws if duration exceeds the configured max.
   * Optionally calls cleanup before throwing (e.g. to remove a yt-dlp temp file).
   */
  private async assertDuration(duration: number, cleanup?: (() => Promise<void>) | null): Promise<void> {
    if (duration > this.maxDuration) {
      if (cleanup) await cleanup();
      throw new Error(
        `Video duration ${duration}s exceeds max allowed ${this.maxDuration}s`,
      );
    }
  }

  /**
   * Builds the final AudioExtractionResult with a cleanup callback.
   */
  private buildResult(
    audioPath: string,
    duration: number,
    title: string | undefined,
    isLive: boolean,
  ): AudioExtractionResult {
    return {
      audioPath,
      duration,
      title,
      isLive,
      cleanup: async () => {
        await this.deleteFile(audioPath);
        this.logger.log(`Cleaned up: ${audioPath}`);
      },
    };
  }

  private streamToFile(stream: Readable, filePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const writeStream = fs.createWriteStream(filePath);

      stream.pipe(writeStream);

      writeStream.on('finish', resolve);
      writeStream.on('error', (err) => {
        stream.destroy();
        reject(err);
      });
      stream.on('error', (err) => {
        writeStream.destroy();
        reject(err);
      });
    });
  }

  private getFileDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
        if (err) return reject(err);
        const duration = metadata?.format?.duration;
        if (typeof duration !== 'number') {
          return reject(new Error('Could not determine duration'));
        }
        resolve(duration);
      });
    });
  }

  private async deleteFile(filePath: string): Promise<void> {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err: any) {
      this.logger.warn(`Failed to delete ${filePath}: ${err.message}`);
    }
  }
}