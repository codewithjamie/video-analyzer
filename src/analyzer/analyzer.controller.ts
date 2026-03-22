import { Controller, Post, Body, HttpCode, HttpStatus, Logger, UseGuards, BadRequestException, InternalServerErrorException, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBody, ApiBearerAuth, ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { AnalyzerService } from './analyzer.service';
import { AnalyzeVideoDto } from '../common/dto/analyze-video.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../user/user.entity';

class TranscriptSegmentDto { @ApiProperty({ example: 0.0 }) start: number; @ApiProperty({ example: 4.5 }) end: number; @ApiProperty({ example: 'Welcome to this video' }) text: string; }
class TranscriptDto { @ApiProperty({ example: 'Welcome to this video about...' }) fullText: string; @ApiProperty({ type: [TranscriptSegmentDto] }) segments: TranscriptSegmentDto[]; @ApiProperty({ example: 'en' }) language: string; }
class CaptionEntryDto { @ApiProperty({ example: '00:00:00.000' }) startTime: string; @ApiProperty({ example: '00:00:04.500' }) endTime: string; @ApiProperty({ example: 'Welcome to this video' }) text: string; }
class CaptionFileDto { @ApiProperty({ example: 'https://res.cloudinary.com/xxx/raw/upload/v123/captions/video.srt' }) url: string; @ApiProperty({ example: 'https://res.cloudinary.com/xxx/raw/upload/fl_attachment/v123/captions/video.srt' }) downloadUrl: string; }
class CaptionDownloadsDto { @ApiProperty({ type: CaptionFileDto }) srt: CaptionFileDto; @ApiProperty({ type: CaptionFileDto }) vtt: CaptionFileDto; }
class CaptionsDto { @ApiProperty({ example: '1\n00:00:00,000 --> 00:00:04,500\nWelcome\n' }) srt: string; @ApiProperty({ example: 'WEBVTT\n\n00:00:00.000 --> 00:00:04.500\nWelcome\n' }) vtt: string; @ApiProperty({ type: [CaptionEntryDto] }) entries: CaptionEntryDto[]; @ApiProperty({ type: CaptionDownloadsDto }) downloads: CaptionDownloadsDto; }

class HookTimestampDto { @ApiProperty({ example: 0 }) start: number; @ApiProperty({ example: 5 }) end: number; }

class HookScoreDto {
  @ApiProperty({ example: 85, description: 'Weighted overall score 0-100' }) overall: number;
  @ApiProperty({ example: 90, description: 'How instantly does this capture attention?' }) attentionGrab: number;
  @ApiProperty({ example: 80, description: 'How much does viewer NEED to know what happens next?' }) curiosityGap: number;
  @ApiProperty({ example: 75, description: 'How strongly does it trigger emotion?' }) emotionalPull: number;
  @ApiProperty({ example: 88, description: 'In a feed of infinite content, does this STOP the scroll?' }) scrollStopPower: number;
  @ApiProperty({ example: 92, description: 'How well does this work as the FIRST thing a viewer sees?' }) openingStrength: number;
  @ApiProperty({ example: 'A', enum: ['S', 'A', 'B', 'C', 'D', 'F'], description: 'Letter grade' }) grade: string;
  @ApiProperty({ example: 'Strong open. This moment creates immediate commitment.' }) verdict: string;
}

class HookClipDto {
  @ApiProperty({ example: 'video-analyzer/hooks/user-uuid/hook-p1-1-abc12345' }) publicId: string;
  @ApiProperty({ example: 'https://res.cloudinary.com/xxx/video/upload/v123/hooks/hook-1.mp4' }) watchUrl: string;
  @ApiProperty({ example: 'https://res.cloudinary.com/xxx/video/upload/fl_attachment/v123/hooks/hook-1.mp4' }) downloadUrl: string;
  @ApiProperty({ example: 5.2 }) duration: number;
  @ApiProperty({ example: 'mp4' }) format: string;
  @ApiProperty({ example: 524288 }) sizeBytes: number;
}

class HookResultDto {
  @ApiProperty({ example: 'Did you know 90% of startups fail in the first year?' }) hookText: string;
  @ApiProperty({ example: 'statistic', enum: ['question', 'bold_statement', 'story_opener', 'statistic', 'controversy', 'curiosity_gap', 'emotional_appeal', 'pattern_interrupt', 'relatable_problem', 'show_result_first'] }) hookType: string;
  @ApiProperty({ example: 0.95 }) confidence: number;
  @ApiProperty({ example: 'Opens with a surprising statistic that creates urgency' }) explanation: string;
  @ApiProperty({ example: ['9 out of 10 startups are doomed...', 'The startup failure rate will shock you'] }) suggestedHookVariations: string[];
  @ApiProperty({ type: HookScoreDto, description: 'Detailed scoring breakdown' }) score: HookScoreDto;
  @ApiProperty({ example: 1, enum: [1, 2, 3, 4], description: '1=🔥FIRE, 2=⚡STRONG, 3=💡DECENT, 4=⚪WEAK' }) priority: number;
  @ApiProperty({ example: '🔥 FIRE — Use this hook!' }) priorityLabel: string;
  @ApiProperty({ type: HookTimestampDto }) timestamp: HookTimestampDto;
    @ApiProperty({ type: HookClipDto }) clip: HookClipDto;
}

class MetadataDto { @ApiProperty({ example: '2024-01-15T10:30:00.000Z' }) analyzedAt: string; @ApiProperty({ example: 35000 }) processingTimeMs: number; @ApiPropertyOptional({ example: 'My Video Title' }) title?: string; @ApiPropertyOptional({ example: false }) isLive?: boolean; }
class AnalysisResultDto { @ApiProperty({ example: 'https://www.youtube.com/watch?v=abc123' }) videoUrl: string; @ApiProperty({ example: 125.4 }) duration: number; @ApiProperty({ type: TranscriptDto }) transcript: TranscriptDto; @ApiProperty({ type: CaptionsDto }) captions: CaptionsDto; @ApiProperty({ type: [HookResultDto], description: 'Hooks sorted by priority (best first)' }) hooks: HookResultDto[]; @ApiProperty({ type: MetadataDto }) metadata: MetadataDto; }
class ErrorResponseDto { @ApiProperty({ example: 400 }) statusCode: number; @ApiProperty({ example: 'Video duration exceeds your limit' }) message: string; @ApiPropertyOptional({ example: 'Bad Request' }) error?: string; }
class ForbiddenResponseDto { @ApiProperty({ example: 403 }) statusCode: number; @ApiProperty({ example: 'Free tier limit reached.' }) message: string; @ApiPropertyOptional({ example: 3 }) currentUsage?: number; @ApiPropertyOptional({ example: 3 }) maxAllowed?: number; @ApiPropertyOptional({ example: 1 }) currentLevel?: number; @ApiPropertyOptional({ example: 'Upgrade to Standard (Level 2)...' }) upgrade?: string; }

@ApiTags('analyzer')
@Controller('api/v1/analyze')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class AnalyzerController {
  private readonly logger = new Logger(AnalyzerController.name);

  constructor(private readonly analyzerService: AnalyzerService) {}

  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Full video analysis — transcript, captions, scored hooks with clips',
    description: `
**Requires JWT authentication.**

Returns transcript, downloadable captions (SRT/VTT), and scored hooks with Cloudinary video clips.

### Hook Scoring System
Each hook is scored 0-100 on five criteria:
- **attentionGrab** — How instantly does this capture attention?
- **curiosityGap** — How much does the viewer NEED to know what happens next?
- **emotionalPull** — How strongly does it trigger emotion?
- **scrollStopPower** — Does this STOP the scroll in a feed?
- **openingStrength** — "Strong open. Creates immediate commitment."

### Priority Levels (sorted best first)
- 🔥 **P1 FIRE** (80-100) — Use this hook! Creates immediate commitment.
- ⚡ **P2 STRONG** (60-79) — Good hook, minor tweaks needed.
- 💡 **P3 DECENT** (40-59) — Has potential, needs improvement.
- ⚪ **P4 WEAK** (0-39) — Not recommended.

### Grades: S (90+), A (80+), B (70+), C (60+), D (50+), F (<50)
    `,
  })
  @ApiBody({ type: AnalyzeVideoDto })
  @ApiResponse({ status: 200, type: AnalysisResultDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, type: ForbiddenResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async analyzeVideo(@Body() dto: AnalyzeVideoDto, @CurrentUser() user: User): Promise<AnalysisResultDto> {
    this.logger.log(`Full analysis | User: ${user.email} (Level ${user.level}) | URL: ${dto.url}`);
    return this.runAnalysis(dto, user);
  }

  @Post('transcript-only')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Transcript only', description: 'Returns only the transcript. Counts as one analysis.' })
  @ApiBody({ type: AnalyzeVideoDto })
  @ApiResponse({ status: 200, type: TranscriptDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, type: ForbiddenResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async transcriptOnly(@Body() dto: AnalyzeVideoDto, @CurrentUser() user: User): Promise<TranscriptDto> {
    this.logger.log(`Transcript-only | User: ${user.email} (Level ${user.level}) | URL: ${dto.url}`);
    const result: AnalysisResultDto = await this.runAnalysis(dto, user);
    return result.transcript;
  }

  @Post('hooks-only')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Hooks only — scored & ranked with Cloudinary video clips',
    description: `
      **Returns only the hook analysis with scores, priorities, and video clips.**
      
      Each hook includes:
      - 📊 **Score** — 5 criteria scored 80-100 + overall + grade (S/A/B/C/D/F)
      - 🏆 **Priority** — P1 🔥 FIRE (95+), P2 ⚡ STRONG (90+), P3 💡 DECENT (85+), P4 ⚪ WEAK (80+)
      - 🎬 **Video clip** — Hosted on Cloudinary with watch + download URLs
      - ✍️ **Variations** — Content-specific rewritten hook suggestions
      - 💬 **Verdict** — Honest assessment with improvement advice
      
      **Sorted by priority (best hooks first).**
      Counts as one analysis toward your limit.
    `,
  })
  @ApiBody({ type: AnalyzeVideoDto })
  @ApiResponse({ status: 200, type: [HookResultDto] })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, type: ForbiddenResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async hooksOnly(
    @Body() dto: AnalyzeVideoDto,
    @CurrentUser() user: User,
  ): Promise<HookResultDto[]> {
    this.logger.log(
      `Hooks-only | User: ${user.email} (Level ${user.level}) | URL: ${dto.url}`,
    );
    const result: AnalysisResultDto = await this.runAnalysis(dto, user);
 
    // Return all hooks sorted by score — no score gate.
    // The analyzer always returns at least a fallback hook, so this is never empty.
    if (!result.hooks || result.hooks.length === 0) {
      this.logger.warn(`No hooks returned for user ${user.email} — video may have no detectable opening`);
      return [];
    }
 
    this.logger.log(
      `Returning ${result.hooks.length} hook(s) for user ${user.email} | Best: ${result.hooks[0].score.overall}/100 (${result.hooks[0].score.grade})`,
    );
 
    return result.hooks;
  }

  @Post('captions-only')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Captions only — SRT + VTT with Cloudinary download links',
    description: 'Returns YouTube-ready captions with Cloudinary download URLs. Counts as one analysis.',
  })
  @ApiBody({ type: AnalyzeVideoDto })
  @ApiResponse({ status: 200, type: CaptionsDto })
  @ApiResponse({ status: 400, type: ErrorResponseDto })
  @ApiResponse({ status: 401, description: 'Not authenticated' })
  @ApiResponse({ status: 403, type: ForbiddenResponseDto })
  @ApiResponse({ status: 500, type: ErrorResponseDto })
  async captionsOnly(@Body() dto: AnalyzeVideoDto, @CurrentUser() user: User): Promise<CaptionsDto> {
    this.logger.log(`Captions-only | User: ${user.email} (Level ${user.level}) | URL: ${dto.url}`);
    const result: AnalysisResultDto = await this.runAnalysis(dto, user);
    return result.captions;
  }

  private async runAnalysis(dto: AnalyzeVideoDto, user: User): Promise<AnalysisResultDto> {
    try {
      const result = await this.analyzerService.analyzeVideo(dto, user);
      return result as AnalysisResultDto;
    } catch (error: unknown) {
      const err = error as Error & { status?: number };
      const message: string = err.message || 'Unknown error';
      this.logger.error(`Analysis error for user ${user.email}: ${message}`);
      if (error instanceof BadRequestException) { throw error; }
      if (error instanceof ForbiddenException) { throw error; }
      if (message.includes('duration') || message.includes('limit') || message.includes('URL') || message.includes('fetch') || message.includes('not found') || message.includes('file ID')) { throw new BadRequestException(message); }
      if (message.includes('Free tier') || message.includes('usage') || message.includes('upgrade')) { throw new ForbiddenException(message); }
      throw new InternalServerErrorException(`Video analysis failed: ${message}`);
    }
  }
}