import { VideoSource } from '../dto/analyze-video.dto';

export class UrlParser {
  static detectSource(url: string): VideoSource {
    if (this.isGoogleDriveUrl(url)) return VideoSource.GOOGLE_DRIVE;
    if (this.isYouTubeUrl(url)) return VideoSource.YOUTUBE;
    if (this.isLivestreamUrl(url)) return VideoSource.LIVESTREAM;
    if (this.isSupportedPlatform(url)) return VideoSource.YOUTUBE; // yt-dlp handles these
    return VideoSource.DIRECT_URL;
  }

  static isGoogleDriveUrl(url: string): boolean {
    return [
      /drive\.google\.com\/file\/d\//,
      /drive\.google\.com\/open\?id=/,
      /docs\.google\.com\/.*\/d\//,
      /drive\.google\.com\/uc\?/,
    ].some((p) => p.test(url));
  }

  static isYouTubeUrl(url: string): boolean {
    return [
      /youtube\.com\/watch/,
      /youtube\.com\/shorts\//,
      /youtu\.be\//,
      /youtube\.com\/live\//,
      /youtube\.com\/embed\//,
    ].some((p) => p.test(url));
  }

  static isLivestreamUrl(url: string): boolean {
    return [
      /\.m3u8(\?|$)/i,
      /\.mpd(\?|$)/i,
      /\/live\//i,
      /\/stream\//i,
      /isLive=true/i,
    ].some((p) => p.test(url));
  }

  /**
   * Platforms supported by yt-dlp (partial list — yt-dlp supports 1000+)
   */
  static isSupportedPlatform(url: string): boolean {
    return [
      /vimeo\.com/,
      /dailymotion\.com/,
      /twitter\.com/,
      /x\.com/,
      /instagram\.com/,
      /tiktok\.com/,
      /facebook\.com/,
      /fb\.watch/,
      /twitch\.tv/,
      /reddit\.com/,
      /streamable\.com/,
      /soundcloud\.com/,
      /bilibili\.com/,
      /rumble\.com/,
    ].some((p) => p.test(url));
  }

  static extractGoogleDriveFileId(url: string): string | null {
    const patterns = [
      /\/file\/d\/([a-zA-Z0-9_-]+)/,
      /[?&]id=([a-zA-Z0-9_-]+)/,
      /\/d\/([a-zA-Z0-9_-]+)/,
    ];
    for (const p of patterns) {
      const match = url.match(p);
      if (match) return match[1];
    }
    return null;
  }

  static extractYouTubeVideoId(url: string): string | null {
    const patterns = [
      /[?&]v=([a-zA-Z0-9_-]{11})/,
      /youtu\.be\/([a-zA-Z0-9_-]{11})/,
      /\/shorts\/([a-zA-Z0-9_-]{11})/,
      /\/embed\/([a-zA-Z0-9_-]{11})/,
      /\/live\/([a-zA-Z0-9_-]{11})/,
    ];
    for (const p of patterns) {
      const match = url.match(p);
      if (match) return match[1];
    }
    return null;
  }
}