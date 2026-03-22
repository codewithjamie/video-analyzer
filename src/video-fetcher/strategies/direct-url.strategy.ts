import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { Readable } from 'stream';
import { IFetcherStrategy, FetchResult } from './fetcher-strategy.interface';

@Injectable()
export class DirectUrlStrategy implements IFetcherStrategy {
  private readonly logger = new Logger(DirectUrlStrategy.name);

  canHandle(): boolean {
    return true;
  }

  async fetch(url: string): Promise<FetchResult> {
    this.logger.log(`Fetching direct URL: ${url}`);

    const response = await axios.get(url, {
      responseType: 'stream',
      timeout: 120_000,
      headers: { 'User-Agent': 'VideoAnalyzerBot/1.0' },
    });

    let fileName: string | undefined;
    const cd = response.headers['content-disposition'];
    if (cd) {
      const match = cd.match(/filename="?(.+?)"?$/);
      if (match) fileName = match[1];
    }

    return {
      type: 'stream',
      stream: response.data as Readable,
      mimeType: response.headers['content-type'],
      fileName,
      fileSize: response.headers['content-length']
        ? parseInt(response.headers['content-length'])
        : undefined,
      title: fileName,
    };
  }
}