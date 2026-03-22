import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { CloudinaryService, CloudinaryUploadResult } from '../cloudinary/cloudinary.service';
import { HookResult, HookScore } from '../common/interfaces/analysis-result.interface';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { spawn } from 'child_process';

export interface HookClipResult {
  hookText: string;
  hookType: string;
  confidence: number;
  explanation: string;
  suggestedHookVariations: string[];
  score: HookScore;
  priority: number;
  priorityLabel: string;
  timestamp: {
    start: number;
    end: number;
  };
  clip: {
    publicId: string;
    watchUrl: string;
    downloadUrl: string;
    duration: number;
    format: string;
    sizeBytes: number;
  };
}

@Injectable()
export class HookClipperService {
  private readonly logger = new Logger(HookClipperService.name);
  private readonly tempDir: string;
  private readonly ytdlpPath: string;

  constructor(
    private configService: ConfigService,
    private cloudinaryService: CloudinaryService,
  ) {
    this.tempDir =
      this.configService.get<string>('analysis.tempDir') ?? '/tmp/video-analyzer';
    this.ytdlpPath =
      this.configService.get<string>('ytdlp.path') ?? 'yt-dlp';

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  async createHookClips(
    videoUrl: string,
    hooks: HookResult[],
    userId: string,
  ): Promise<HookClipResult[]> {
    this.logger.log(`Creating ${hooks.length} hook clips from ${videoUrl}`);

    const results: HookClipResult[] = [];

    for (let i = 0; i < hooks.length; i++) {
      const hook = hooks[i];

      try {
        this.logger.log(
          `Clipping hook ${i + 1}/${hooks.length} [P${hook.priority}] (${hook.score.grade}): "${hook.hookText.substring(0, 50)}..."`,
        );

        const clipStart = Math.max(0, hook.hookTimestamp.start - 1);
        const clipEnd = hook.hookTimestamp.end + 2;
        const clipDuration = clipEnd - clipStart;

        const clipPath = await this.downloadVideoSegment(
          videoUrl,
          clipStart,
          clipDuration,
        );

        const uploadResult: CloudinaryUploadResult =
          await this.cloudinaryService.uploadVideoClip(clipPath, {
            folder: `video-analyzer/hooks/${userId}`,
            publicId: `hook-p${hook.priority}-${i + 1}-${randomUUID().substring(0, 8)}`,
            tags: [
              'hook',
              hook.hookType,
              `priority-${hook.priority}`,
              `grade-${hook.score.grade}`,
              userId,
            ],
          });

        this.deleteFile(clipPath);

        results.push({
          hookText: hook.hookText,
          hookType: hook.hookType,
          confidence: hook.confidence,
          explanation: hook.explanation,
          suggestedHookVariations: hook.suggestedHookVariations,
          score: hook.score,
          priority: hook.priority,
          priorityLabel: hook.priorityLabel,
          timestamp: {
            start: hook.hookTimestamp.start,
            end: hook.hookTimestamp.end,
          },
          clip: {
            publicId: uploadResult.publicId,
            watchUrl: uploadResult.secureUrl,
            downloadUrl: uploadResult.downloadUrl,
            duration: uploadResult.duration,
            format: uploadResult.format,
            sizeBytes: uploadResult.bytes,
          },
        });

        this.logger.log(
          `Hook ${i + 1} [P${hook.priority}] uploaded: ${uploadResult.secureUrl}`,
        );
      } catch (err: any) {
        this.logger.error(
          `Failed to clip hook ${i + 1}: ${err.message}`,
        );

        results.push({
          hookText: hook.hookText,
          hookType: hook.hookType,
          confidence: hook.confidence,
          explanation: hook.explanation,
          suggestedHookVariations: hook.suggestedHookVariations,
          score: hook.score,
          priority: hook.priority,
          priorityLabel: hook.priorityLabel,
          timestamp: {
            start: hook.hookTimestamp.start,
            end: hook.hookTimestamp.end,
          },
          clip: {
            publicId: '',
            watchUrl: '',
            downloadUrl: '',
            duration: 0,
            format: '',
            sizeBytes: 0,
          },
        });
      }
    }

    const uploaded = results.filter((r) => r.clip.watchUrl).length;
    this.logger.log(`Created ${uploaded}/${hooks.length} hook clips`);
    this.logger.log('Hook priority breakdown:');
    this.logger.log(`  🔥 FIRE (P1):   ${results.filter((r) => r.priority === 1).length}`);
    this.logger.log(`  ⚡ STRONG (P2): ${results.filter((r) => r.priority === 2).length}`);
    this.logger.log(`  💡 DECENT (P3): ${results.filter((r) => r.priority === 3).length}`);
    this.logger.log(`  ⚪ WEAK (P4):   ${results.filter((r) => r.priority === 4).length}`);

    return results;
  }

  private downloadVideoSegment(
    url: string,
    startSeconds: number,
    durationSeconds: number,
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const id = randomUUID();
      const outputPath = path.join(this.tempDir, `${id}-hook-clip.mp4`);

      const startTime = this.formatTime(startSeconds);
      const endTime = this.formatTime(startSeconds + durationSeconds);

      const args: string[] = [
        '--download-sections',
        `*${startTime}-${endTime}`,
        '--force-keyframes-at-cuts',
        '-f',
        'mp4/bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best',
        '--merge-output-format',
        'mp4',
        '-o',
        outputPath,
        '--no-playlist',
        '--no-warnings',
        '--quiet',
        url,
      ];

      this.logger.log(`yt-dlp clip: ${startTime} → ${endTime}`);

      const proc = spawn(this.ytdlpPath, args);
      let stderr = '';

      proc.stderr.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      proc.on('close', (code: number | null) => {
        if (code !== 0) {
          return reject(
            new Error(`yt-dlp clip failed (code ${code}): ${stderr}`),
          );
        }

        const actualPath = this.findOutputFile(outputPath);
        if (!actualPath) {
          return reject(new Error('yt-dlp clip completed but output file not found'));
        }

        this.logger.log(`Clip downloaded: ${actualPath}`);
        resolve(actualPath);
      });

      proc.on('error', (err: Error) => {
        reject(new Error(`yt-dlp not found: ${err.message}`));
      });

      setTimeout(() => {
        proc.kill('SIGTERM');
        reject(new Error('yt-dlp clip timed out after 60s'));
      }, 60000);
    });
  }

  private formatTime(totalSeconds: number): string {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    const hh = String(hours).padStart(2, '0');
    const mm = String(minutes).padStart(2, '0');
    const ss = seconds.toFixed(3).padStart(6, '0');

    return `${hh}:${mm}:${ss}`;
  }

  private findOutputFile(basePath: string): string | null {
    if (fs.existsSync(basePath)) return basePath;

    const dir = path.dirname(basePath);
    const base = path.basename(basePath, path.extname(basePath));
    const extensions = ['.mp4', '.mkv', '.webm', '.mp4.part'];

    for (const ext of extensions) {
      const candidate = path.join(dir, `${base}${ext}`);
      if (fs.existsSync(candidate)) return candidate;
    }

    try {
      const files = fs.readdirSync(dir);
      const match = files.find((f) => f.includes(base.substring(0, 8)));
      if (match) return path.join(dir, match);
    } catch {
      // ignore
    }

    return null;
  }

  private deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        this.logger.log(`Cleaned up: ${filePath}`);
      }
    } catch (err: any) {
      this.logger.warn(`Failed to delete ${filePath}: ${err.message}`);
    }
  }
}