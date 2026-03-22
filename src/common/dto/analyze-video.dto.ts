import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUrl, IsOptional, IsEnum, IsNumber, Max, Min } from 'class-validator';

export enum VideoSource {
  GOOGLE_DRIVE = 'google_drive',
  YOUTUBE = 'youtube',
  DIRECT_URL = 'direct_url',
  LIVESTREAM = 'livestream',
  AUTO = 'auto',
}

export class AnalyzeVideoDto {
  @ApiProperty({
    description: 'Video URL — supports YouTube, Google Drive, direct links, live streams, and 1000+ sites',
    examples: {
      youtube: { value: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' },
      youtubeShort: { value: 'https://youtu.be/dQw4w9WgXcQ' },
      googleDrive: { value: 'https://drive.google.com/file/d/1AbC123/view' },
      directMp4: { value: 'https://example.com/video.mp4' },
      hls: { value: 'https://example.com/stream/playlist.m3u8' },
      vimeo: { value: 'https://vimeo.com/123456789' },
      twitter: { value: 'https://twitter.com/user/status/123456789' },
    },
  })
  @IsString()
  @IsUrl({}, { message: 'Please provide a valid URL' })
  url: string;

  @ApiPropertyOptional({
    description: 'Source type — auto-detected if not provided',
    enum: VideoSource,
    default: VideoSource.AUTO,
  })
  @IsOptional()
  @IsEnum(VideoSource)
  source?: VideoSource = VideoSource.AUTO;

  @ApiPropertyOptional({
    description: 'Language hint for transcription (ISO 639-1)',
    example: 'en',
  })
  @IsOptional()
  @IsString()
  language?: string;

  @ApiPropertyOptional({
    description: 'For live streams: how many seconds to capture (max 300)',
    example: 120,
    default: 120,
  })
  @IsOptional()
  @IsNumber()
  @Min(10)
  @Max(300)
  captureDurationSeconds?: number;
}