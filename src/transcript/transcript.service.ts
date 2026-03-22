import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpeg = require('fluent-ffmpeg');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface TranscriptResult {
  fullText: string;
  segments: TranscriptSegment[];
  language: string;
}

const CHUNK_DURATION_SECONDS = 20 * 60; // 20 min chunks (~4-5MB at 32kbps)
const MAX_FILE_BYTES = 24 * 1024 * 1024; // 24MB safety buffer for OpenAI 25MB limit

@Injectable()
export class TranscriptService {
  private readonly logger = new Logger(TranscriptService.name);
  private readonly openai: OpenAI;
  private readonly whisperModel: string;
  private readonly tempDir: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('openai.apiKey') ?? '';
    this.openai = new OpenAI({ apiKey });
    this.whisperModel =
      this.configService.get<string>('openai.whisperModel') ?? 'whisper-1';
    this.tempDir =
      this.configService.get<string>('analysis.tempDir') ?? '/tmp/video-analyzer';

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async transcribe(audioPath: string, language?: string): Promise<TranscriptResult> {
    this.logger.log(`Transcribing audio: ${audioPath}`);

    if (!fs.existsSync(audioPath)) {
      throw new Error(`Audio file not found: ${audioPath}`);
    }

    const fileSize = fs.statSync(audioPath).size;

    if (fileSize > MAX_FILE_BYTES) {
      this.logger.warn(
        `Large audio file (${(fileSize / 1024 / 1024).toFixed(2)}MB) — chunking...`,
      );
      return this.transcribeLargeFile(audioPath, language);
    }

    return this.transcribeSingleFile(audioPath, language);
  }

  // ---------------------------------------------------------------------------
  // Single-file transcription
  // ---------------------------------------------------------------------------

  private async transcribeSingleFile(
    audioPath: string,
    language?: string,
  ): Promise<TranscriptResult> {
    const file = fs.createReadStream(audioPath);

    const response = await this.openai.audio.transcriptions.create({
      file,
      model: this.whisperModel,
      language: language ?? 'en',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const segments: TranscriptSegment[] = (response.segments ?? []).map((seg: any) => ({
      start: seg.start ?? 0,
      end: seg.end ?? 0,
      text: (seg.text ?? '').trim(),
    }));

    const fullText = response.text ?? '';

    this.logger.log(
      `Transcription complete: ${segments.length} segments | Language: ${response.language}`,
    );

    return {
      fullText,
      segments,
      language: response.language ?? language ?? 'en',
    };
  }

  // ---------------------------------------------------------------------------
  // Large-file transcription (chunked)
  // ---------------------------------------------------------------------------

  private async transcribeLargeFile(
    audioPath: string,
    language?: string,
  ): Promise<TranscriptResult> {
    const duration = await this.getFileDuration(audioPath);
    const numChunks = Math.ceil(duration / CHUNK_DURATION_SECONDS);

    this.logger.log(`Splitting into ${numChunks} chunks of ${CHUNK_DURATION_SECONDS}s each`);

    let allSegments: TranscriptSegment[] = [];
    let detectedLanguage = language ?? 'en';

    for (let i = 0; i < numChunks; i++) {
      const offset = i * CHUNK_DURATION_SECONDS;
      const chunkPath = path.join(this.tempDir, `${randomUUID()}-chunk-${i}.mp3`);

      try {
        await this.extractChunk(audioPath, chunkPath, offset, CHUNK_DURATION_SECONDS);

        const chunkResult = await this.transcribeSingleFile(chunkPath, language);

        // Offset timestamps to match the full file
        const adjustedSegments: TranscriptSegment[] = chunkResult.segments.map((seg) => ({
          start: seg.start + offset,
          end: seg.end + offset,
          text: seg.text,
        }));

        allSegments = [...allSegments, ...adjustedSegments];

        // Use first chunk's detected language
        if (i === 0) detectedLanguage = chunkResult.language;

        this.logger.log(`Chunk ${i + 1}/${numChunks} done — ${chunkResult.segments.length} segments`);
      } finally {
        // Always clean up chunk, even if transcription fails
        await this.deleteFile(chunkPath);
      }
    }

    // Filter out empty segments that can appear at chunk boundaries
    allSegments = allSegments.filter((s) => s.text.trim().length > 0);

    const fullText = allSegments.map((s) => s.text).join(' ');

    this.logger.log(
      `Large transcription complete: ${allSegments.length} segments from ${numChunks} chunks`,
    );

    return {
      fullText,
      segments: allSegments,
      language: detectedLanguage,
    };
  }

  // ---------------------------------------------------------------------------
  // ffmpeg helpers
  // ---------------------------------------------------------------------------

  private getFileDuration(filePath: string): Promise<number> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err: any, metadata: any) => {
        if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
        const duration = metadata?.format?.duration;
        if (typeof duration !== 'number') {
          return reject(new Error('Could not determine duration from metadata'));
        }
        resolve(duration);
      });
    });
  }

  private extractChunk(
    inputPath: string,
    outputPath: string,
    start: number,
    duration: number,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .setStartTime(start)
        .setDuration(duration)
        .noVideo()
        .audioCodec('libmp3lame')
        .audioBitrate('32k')
        .output(outputPath)
        .on('end', () => resolve())
        .on('error', (err: any) => reject(new Error(`Chunk extraction failed: ${err.message}`)))
        .run();
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