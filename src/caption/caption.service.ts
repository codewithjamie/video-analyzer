import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TranscriptSegment, CaptionEntry } from '../common/interfaces/analysis-result.interface';
import { CloudinaryService } from '../cloudinary/cloudinary.service';
import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';

export interface CaptionResult {
  srt: string;
  vtt: string;
  entries: CaptionEntry[];
}

export interface CaptionWithDownloads extends CaptionResult {
  downloads: {
    srt: {
      url: string;
      downloadUrl: string;
    };
    vtt: {
      url: string;
      downloadUrl: string;
    };
  };
}

@Injectable()
export class CaptionService {
  private readonly logger = new Logger(CaptionService.name);
  private readonly tempDir: string;

  constructor(
    private configService: ConfigService,
    private cloudinaryService: CloudinaryService,
  ) {
    this.tempDir =
      this.configService.get<string>('analysis.tempDir') ?? '/tmp/video-analyzer';

    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }
  }

  generateCaptions(segments: TranscriptSegment[]): CaptionResult {
    const entries: CaptionEntry[] = segments.map((seg) => ({
      startTime: this.formatVttTime(seg.start),
      endTime: this.formatVttTime(seg.end),
      text: seg.text,
    }));

    const srt = this.generateSrt(entries);
    const vtt = this.generateVtt(entries);

    return { srt, vtt, entries };
  }

  async generateCaptionsWithDownloads(
    segments: TranscriptSegment[],
    userId: string,
    videoTitle?: string,
  ): Promise<CaptionWithDownloads> {
    const captions = this.generateCaptions(segments);

    const id = randomUUID().substring(0, 8);
    const safeName = (videoTitle ?? 'video')
      .replace(/[^a-zA-Z0-9-_]/g, '_')
      .substring(0, 50);

    const srtPath = path.join(this.tempDir, `${id}-${safeName}.srt`);
    fs.writeFileSync(srtPath, captions.srt, 'utf-8');

    const vttPath = path.join(this.tempDir, `${id}-${safeName}.vtt`);
    fs.writeFileSync(vttPath, captions.vtt, 'utf-8');

    try {
      const srtUpload = await this.cloudinaryService.uploadCaptionFile(
        srtPath,
        {
          folder: `video-analyzer/captions/${userId}`,
          publicId: `${safeName}-${id}.srt`,
        },
      );

      const vttUpload = await this.cloudinaryService.uploadCaptionFile(
        vttPath,
        {
          folder: `video-analyzer/captions/${userId}`,
          publicId: `${safeName}-${id}.vtt`,
        },
      );

      this.logger.log('Captions uploaded to Cloudinary');

      return {
        ...captions,
        downloads: {
          srt: {
            url: srtUpload.secureUrl,
            downloadUrl: srtUpload.downloadUrl,
          },
          vtt: {
            url: vttUpload.secureUrl,
            downloadUrl: vttUpload.downloadUrl,
          },
        },
      };
    } catch (err: any) {
      this.logger.error(`Caption upload failed: ${err.message}`);

      // Return captions without download links if Cloudinary fails
      return {
        ...captions,
        downloads: {
          srt: { url: '', downloadUrl: '' },
          vtt: { url: '', downloadUrl: '' },
        },
      };
    } finally {
      this.deleteFile(srtPath);
      this.deleteFile(vttPath);
    }
  }

  private generateSrt(entries: CaptionEntry[]): string {
    return entries
      .map((entry, index) => {
        const start = entry.startTime.replace('.', ',');
        const end = entry.endTime.replace('.', ',');
        return `${index + 1}\n${start} --> ${end}\n${entry.text}\n`;
      })
      .join('\n');
  }

  private generateVtt(entries: CaptionEntry[]): string {
    const header = 'WEBVTT\n\n';
    const body = entries
      .map((entry) => `${entry.startTime} --> ${entry.endTime}\n${entry.text}\n`)
      .join('\n');
    return header + body;
  }

  private formatVttTime(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;

    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = s.toFixed(3).padStart(6, '0');

    return `${hh}:${mm}:${ss}`;
  }

  private deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch (err: any) {
      this.logger.warn(`Failed to delete ${filePath}: ${err.message}`);
    }
  }
}