import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiResponse } from 'cloudinary';
import * as fs from 'fs';

export interface CloudinaryUploadResult {
  publicId: string;
  url: string;
  secureUrl: string;
  downloadUrl: string;
  duration: number;
  format: string;
  bytes: number;
}

@Injectable()
export class CloudinaryService {
  private readonly logger = new Logger(CloudinaryService.name);

  constructor(private configService: ConfigService) {
    const cloudName =
      this.configService.get<string>('cloudinary.cloudName') ?? '';
    const apiKey = this.configService.get<string>('cloudinary.apiKey') ?? '';
    const apiSecret =
      this.configService.get<string>('cloudinary.apiSecret') ?? '';

    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });

    if (!cloudName || !apiKey || !apiSecret) {
      this.logger.warn(
        '⚠️ Cloudinary credentials not fully set. Hook clip uploads will fail.',
      );
    } else {
      this.logger.log(`✅ Cloudinary configured: ${cloudName}`);
    }
  }

  /**
   * Upload a video clip to Cloudinary
   */
  async uploadVideoClip(
    filePath: string,
    options: {
      folder?: string;
      publicId?: string;
      tags?: string[];
    } = {},
  ): Promise<CloudinaryUploadResult> {
    this.logger.log(`Uploading to Cloudinary: ${filePath}`);

    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const result: UploadApiResponse = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        filePath,
        {
          resource_type: 'video',
          folder: options.folder ?? 'video-analyzer/hooks',
          public_id: options.publicId,
          tags: options.tags ?? ['hook', 'video-analyzer'],
          overwrite: true,
          // Enable download
          access_mode: 'public',
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('No result from Cloudinary'));
          resolve(result);
        },
      );
    });

    const downloadUrl = cloudinary.url(result.public_id, {
      resource_type: 'video',
      flags: 'attachment',
      secure: true,
    });

    this.logger.log(`Uploaded: ${result.secure_url}`);

    return {
      publicId: result.public_id,
      url: result.url,
      secureUrl: result.secure_url,
      downloadUrl,
      duration: result.duration || 0,
      format: result.format,
      bytes: result.bytes,
    };
  }

  /**
   * Upload a text file (SRT/VTT) to Cloudinary
   */
  async uploadCaptionFile(
    filePath: string,
    options: {
      folder?: string;
      publicId?: string;
      format?: string;
    } = {},
  ): Promise<{ url: string; secureUrl: string; downloadUrl: string }> {
    this.logger.log(`Uploading caption file: ${filePath}`);

    const result: UploadApiResponse = await new Promise((resolve, reject) => {
      cloudinary.uploader.upload(
        filePath,
        {
          resource_type: 'raw',
          folder: options.folder ?? 'video-analyzer/captions',
          public_id: options.publicId,
          overwrite: true,
          access_mode: 'public',
        },
        (error, result) => {
          if (error) return reject(error);
          if (!result) return reject(new Error('No result from Cloudinary'));
          resolve(result);
        },
      );
    });

    const downloadUrl = cloudinary.url(result.public_id, {
      resource_type: 'raw',
      flags: 'attachment',
      secure: true,
    });

    return {
      url: result.url,
      secureUrl: result.secure_url,
      downloadUrl,
    };
  }

  /**
   * Delete a resource from Cloudinary
   */
  async delete(publicId: string, resourceType: 'video' | 'raw' = 'video'): Promise<void> {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    this.logger.log(`Deleted from Cloudinary: ${publicId}`);
  }
}