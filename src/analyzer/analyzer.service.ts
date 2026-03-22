import { Injectable, Logger } from '@nestjs/common';
import { VideoFetcherService } from '../video-fetcher/video-fetcher.service';
import { AudioExtractorService } from '../audio-extractor/audio-extractor.service';
import { TranscriptService } from '../transcript/transcript.service';
import { HookAnalyzerService } from '../hook-analyzer/hook-analyzer.service';
import { HookClipperService } from '../hook-clipper/hook-clipper.service';
import { CaptionService } from '../caption/caption.service';
import { AnalyzeVideoDto } from '../common/dto/analyze-video.dto';
import { User } from '../user/user.entity';
import { UsageService } from '../usage/usage.service';

@Injectable()
export class AnalyzerService {
  private readonly logger = new Logger(AnalyzerService.name);

  constructor(
    private readonly videoFetcherService: VideoFetcherService,
    private readonly audioExtractorService: AudioExtractorService,
    private readonly transcriptService: TranscriptService,
    private readonly hookAnalyzerService: HookAnalyzerService,
    private readonly hookClipperService: HookClipperService,
    private readonly captionService: CaptionService,
    private readonly usageService: UsageService,
  ) {}

  async analyzeVideo(dto: AnalyzeVideoDto, user: User): Promise<any> {
    const startTime = Date.now();

    // Step 0: Validate usage
    this.logger.log(`Step 0: Validating usage for user ${user.id} (Level ${user.level})`);
    await this.usageService.validateUsage(user);

    // Step 1: Fetch video
    this.logger.log(`Step 1: Fetching video from ${dto.url}`);
    const fetchResult = await this.videoFetcherService.fetch(dto.url);

    // Step 2: Extract / normalize audio
    this.logger.log('Step 2: Processing audio');
    const audioResult = await this.audioExtractorService.processFetchResult(fetchResult);

    try {
      // Step 2.5: Validate duration against user level
      this.logger.log(
        `Step 2.5: Validating duration ${audioResult.duration}s against user level`,
      );
      await this.usageService.validateUsage(user, audioResult.duration);

      // Step 3: Transcribe
      this.logger.log('Step 3: Transcribing audio with Whisper');
      const transcript = await this.transcriptService.transcribe(
        audioResult.audioPath,
        dto.language,
      );

      // Step 4: Generate captions and upload to Cloudinary
      this.logger.log('Step 4: Generating captions + uploading to Cloudinary');
      const captions = await this.captionService.generateCaptionsWithDownloads(
        transcript.segments,
        user.id,
        audioResult.title,
      );

      // Step 5: Analyze hooks
      this.logger.log('Step 5: Analyzing hooks with GPT');
      const hooks = await this.hookAnalyzerService.analyzeHooks(
        transcript.fullText,
        transcript.segments,
      );

      // Step 6: Create and upload hook clips to Cloudinary
      this.logger.log('Step 6: Creating hook clips + uploading to Cloudinary');
      const hooksWithClips = await this.hookClipperService.createHookClips(
        dto.url,
        hooks,
        user.id,
      );

      // Record successful usage
      await this.usageService.recordUsage(
        user.id,
        dto.url,
        audioResult.duration,
        user.level,
        true,
      );

      const processingTimeMs = Date.now() - startTime;
      this.logger.log(
        `Analysis complete for user ${user.id} in ${processingTimeMs}ms`,
      );

      return {
        videoUrl: dto.url,
        duration: audioResult.duration,
        transcript,
        captions,
        hooks: hooksWithClips,
        metadata: {
          analyzedAt: new Date().toISOString(),
          processingTimeMs,
          title: audioResult.title,
          isLive: audioResult.isLive,
        },
      };
    } finally {
      // Always clean up temp audio file
      await audioResult.cleanup();
      this.logger.log('Temp files cleaned up');
    }
  }
}