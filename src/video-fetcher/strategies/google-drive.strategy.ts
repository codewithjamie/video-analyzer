import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { Readable } from 'stream';
import { IFetcherStrategy, FetchResult } from './fetcher-strategy.interface';
import { UrlParser } from '../../common/utils/url-parser.util';

@Injectable()
export class GoogleDriveStrategy implements IFetcherStrategy {
  private readonly logger = new Logger(GoogleDriveStrategy.name);
  private readonly apiKey: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('google.apiKey') ?? '';
  }

  canHandle(url: string): boolean {
    return UrlParser.isGoogleDriveUrl(url);
  }

  async fetch(url: string): Promise<FetchResult> {
    const fileId = UrlParser.extractGoogleDriveFileId(url);
    if (!fileId) {
      throw new Error('Could not extract Google Drive file ID from URL');
    }

    this.logger.log(`Fetching Google Drive file: ${fileId}`);

    // Get metadata
    let metadata: any = {};
    try {
      const metaUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size&key=${this.apiKey}`;
      const metaRes = await axios.get(metaUrl);
      metadata = metaRes.data;
      this.logger.log(`File: ${metadata.name} | ${metadata.mimeType} | ${metadata.size} bytes`);
    } catch (err: any) {
      this.logger.warn(`Metadata fetch failed: ${err.message}`);
    }

    // Stream download
    const downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${this.apiKey}`;
    const response = await axios.get(downloadUrl, {
      responseType: 'stream',
      timeout: 120_000,
    });

    return {
      type: 'stream',
      stream: response.data as Readable,
      mimeType: metadata.mimeType || response.headers['content-type'],
      fileName: metadata.name,
      fileSize: metadata.size ? parseInt(metadata.size) : undefined,
      title: metadata.name,
    };
  }
}