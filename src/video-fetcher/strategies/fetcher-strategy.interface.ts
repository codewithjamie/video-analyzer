import { Readable } from 'stream';

/**
 * Two types of fetch results:
 * - 'stream': raw video stream (Google Drive, direct URLs)
 * - 'file': audio already extracted to a file (yt-dlp, livestream)
 */
export interface FetchResult {
  type: 'stream' | 'file';

  // For type: 'stream'
  stream?: Readable;
  mimeType?: string;
  fileName?: string;
  fileSize?: number;

  // For type: 'file' (audio already extracted)
  filePath?: string;

  // Common
  duration?: number;
  title?: string;
  isLive?: boolean;
  cleanup?: () => Promise<void>;
}

export interface IFetcherStrategy {
  canHandle(url: string): boolean;
  fetch(url: string, captureDuration?: number): Promise<FetchResult>;
}