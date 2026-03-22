export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

export interface CaptionEntry {
  startTime: string;
  endTime: string;
  text: string;
}

export interface CaptionDownloads {
  srt: {
    url: string;
    downloadUrl: string;
  };
  vtt: {
    url: string;
    downloadUrl: string;
  };
}

export interface HookScore {
  overall: number;
  attentionGrab: number;
  curiosityGap: number;
  emotionalPull: number;
  scrollStopPower: number;
  openingStrength: number;
  grade: string;
  verdict: string;
}

export interface HookResult {
  hookText: string;
  hookTimestamp: {
    start: number;
    end: number;
  };
  hookType: string;
  confidence: number;
  explanation: string;
  suggestedHookVariations: string[];
  score: HookScore;
  priority: number;
  priorityLabel: string;
}

export interface HookClipData {
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

export interface AnalysisResult {
  videoUrl: string;
  duration: number;
  transcript: {
    fullText: string;
    segments: TranscriptSegment[];
    language: string;
  };
  captions: {
    srt: string;
    vtt: string;
    entries: CaptionEntry[];
    downloads: CaptionDownloads;
  };
  hooks: HookClipData[];
  metadata: {
    analyzedAt: string;
    processingTimeMs: number;
    title?: string;
    isLive?: boolean;
  };
}