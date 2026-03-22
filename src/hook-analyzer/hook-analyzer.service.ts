import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  TranscriptSegment,
  HookResult,
  HookScore,
} from '../common/interfaces/analysis-result.interface';

// Extended result that includes rewrite metadata
export interface HookAnalysisResult extends HookResult {
  needsRewrite: boolean;
  rewriteSuggestions: string[];
  extractedContext: ExtractedContext;
}

export interface ExtractedContext {
  people: string[];
  topic: string;
  eventOrSetting: string;
  keyTension: string;
}

@Injectable()
export class HookAnalyzerService {
  private readonly logger = new Logger(HookAnalyzerService.name);
  private readonly openai: OpenAI;
  private readonly model: string;

  constructor(private configService: ConfigService) {
    const apiKey = this.configService.get<string>('openai.apiKey') ?? '';
    this.openai = new OpenAI({ apiKey });
    this.model = this.configService.get<string>('openai.model') ?? 'gpt-4o';
  }

  async analyzeHooks(
    fullText: string,
    segments: TranscriptSegment[],
  ): Promise<HookAnalysisResult[]> {
    this.logger.log('Analyzing hooks with GPT...');

    if (!fullText || fullText.trim().length < 10) {
      this.logger.warn('Transcript too short — returning fallback');
      return [this.buildFallbackResult(fullText, segments)];
    }

    // Step 1: Extract entities and context from the full transcript
    const context = await this.extractContext(fullText);
    this.logger.log(
      `Extracted context — People: [${context.people.join(', ')}] | Topic: ${context.topic}`,
    );

    const segmentsText = segments
      .slice(0, 60) // First 60 segments covers ~5 min — enough for hook detection
      .map((s) => `[${s.start.toFixed(1)}s - ${s.end.toFixed(1)}s]: "${s.text}"`)
      .join('\n');

    const prompt = `You are an expert YouTube hook analyst specializing in viral short-form content.

## CONTEXT (already extracted from this video):
- People / entities: ${context.people.length ? context.people.join(', ') : 'unknown'}
- Topic: ${context.topic}
- Event / setting: ${context.eventOrSetting}
- Key tension or stakes: ${context.keyTension}

## YOUR JOB:
1. Scan the FULL opening (first 0-30 seconds) — do NOT stop at the first sentence.
2. Identify the BEST hook moment in the opening. The best hook is often NOT the first line.
3. Score it honestly (0-100).
4. If overall < 60, set needsRewrite: true and generate context-aware replacement hooks.

## HOW GREAT HOOKS ARE STRUCTURED (3-step formula):
Strong hooks often follow this pattern — look for it:
  Step 1 — Context lean: Establish topic + get viewer leaning in ("Today we're talking about hooks")
  Step 2 — Scroll-stop interjection: A contrasting stun line using "but", "however", "yet"
  Step 3 — Contrarian snapback: The haymaker that flips expectations ("I'm not giving you a list of 25 hooks — you need to understand the psychology")
If you find this 3-step pattern, the hookText should capture steps 2+3 (the payoff), not step 1 (the setup).

## HOOK TYPES:
question, bold_statement, story_opener, statistic, controversy, curiosity_gap,
emotional_appeal, pattern_interrupt, relatable_problem, show_result_first,
narrative_intro, warning, milestone

## SCORING (0-100, honest):
- attentionGrab: Does it stop the scroll instantly?
- curiosityGap: Must the viewer know what happens next?
- emotionalPull: Does it trigger emotion?
- scrollStopPower: Would this stop someone mid-scroll?
- openingStrength: Is this a strong first impression?

## GRADE THRESHOLDS:
S: 90-100 | A: 80-89 | B: 70-79 | C: 55-69 | D: 40-54 | F: 0-39

## SCORING BENCHMARKS:
- "Today we're talking about hooks" (first sentence only) → 20-35 (narrative_intro, F)
- "Ladies and gentlemen..." (live event narration) → 30-45 (narrative_intro, D/F)
- "But here's the thing — I'm not going to give you a list of 25 hooks" → 65-75 (pattern_interrupt, C/B)
- "I'm not going to give you a list of 25 proven viral hooks because that's not what you need. What you need is to understand the psychology behind why those hooks worked" → 75-85 (pattern_interrupt, B/A)
- "I lost $50,000 in one day" → 75-85 (bold_statement, B/A)
- "Stop doing this one thing that's ruining your career" → 80-90 (warning, A)
- A specific shocking claim with immediate stakes and urgency → 90-100 (S)

## REWRITE RULES (when needsRewrite: true):
- Use extracted entities: people, topic, tension — never raw transcript fragments
- Each suggestion must be a complete standalone hook under 15 words
- Target short-form social media scroll-stopping impact
- Make each suggestion a DIFFERENT angle (curiosity, warning, result-first, bold claim)

## OPENING SEGMENTS TO ANALYZE:
${segmentsText}

Return a JSON object:
{
  "hookText": "the best hook phrase from the opening — could be 1-3 sentences spanning steps 2+3 of the formula",
  "hookTimestamp": { "start": 0.0, "end": 15.0 },
  "hookType": "one type from the list above",
  "confidence": 0.0-1.0,
  "needsRewrite": true/false,
  "explanation": "which part of the opening you selected, why it works or doesn't, and whether the 3-step formula is present",
  "rewriteSuggestions": [
    "hook 1 — curiosity/gap angle using real topic/entities",
    "hook 2 — warning or mistake angle",
    "hook 3 — bold claim or result-first angle",
    "hook 4 — emotional or personal stakes angle"
  ],
  "score": {
    "attentionGrab": 0-100,
    "curiosityGap": 0-100,
    "emotionalPull": 0-100,
    "scrollStopPower": 0-100,
    "openingStrength": 0-100
  }
}

IMPORTANT:
- Return ONLY the JSON object, no markdown, no extra text.
- hookText must be the actual best phrase from the transcript — not a rewrite.
- needsRewrite is true when overall < 60.
- rewriteSuggestions use real context — never inject raw transcript sentences into templates.`;

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content:
              'You are a YouTube hook scoring expert. Return ONLY a valid JSON object. No markdown, no code blocks. Score 0-100 honestly — most openings score below 60. When hooks are weak, generate context-aware rewrites using the provided entities.',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
        max_tokens: 2000,
        response_format: { type: 'json_object' },
      });

      const content = response.choices[0]?.message?.content ?? '{}';
      const raw = JSON.parse(content);

      if (!raw.hookText || !raw.score) {
        this.logger.warn('GPT returned incomplete hook data — using fallback');
        return [this.buildFallbackResult(fullText, segments, context)];
      }

      const hook = this.buildHookResult(raw, context);

      this.logger.log(
        `Hook: [${hook.priorityLabel}] Score: ${hook.score.overall}/100 (${hook.score.grade}) needsRewrite:${hook.needsRewrite} — "${hook.hookText.substring(0, 60)}"`,
      );

      return [hook];
    } catch (error: any) {
      this.logger.error(`Hook analysis failed: ${error.message}`);
      return [this.buildFallbackResult(fullText, segments)];
    }
  }

  // ---------------------------------------------------------------------------
  // Context extraction — separate GPT call focused purely on entities
  // ---------------------------------------------------------------------------

  private async extractContext(fullText: string): Promise<ExtractedContext> {
    // Use first 2000 chars — enough context, saves tokens
    const excerpt = fullText.substring(0, 2000);

    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'Extract structured context from video transcripts. Return ONLY valid JSON.',
          },
          {
            role: 'user',
            content: `Extract the key context from this video transcript excerpt.

TRANSCRIPT:
${excerpt}

Return a JSON object:
{
  "people": ["Name 1", "Name 2"],
  "topic": "one sentence describing what this video is about",
  "eventOrSetting": "what event, show, or setting is this",
  "keyTension": "what is the main conflict, stakes, or reason to watch"
}

Rules:
- people: real names only, max 5, empty array if none found
- topic: specific, not generic ("WWE Royal Rumble championship match", not "a sports event")
- eventOrSetting: be specific ("Royal Rumble 2024", not "a show")
- keyTension: this is the HOOK — what makes someone want to watch ("Randy Orton chasing 15th world title", "underdog vs champion")
- Return ONLY the JSON object.`,
          },
        ],
        temperature: 0.1,
        max_tokens: 300,
        response_format: { type: 'json_object' },
      });

      const raw = JSON.parse(response.choices[0]?.message?.content ?? '{}');
      return {
        people: Array.isArray(raw.people) ? raw.people.slice(0, 5) : [],
        topic: raw.topic?.trim() || 'Unknown topic',
        eventOrSetting: raw.eventOrSetting?.trim() || 'Unknown setting',
        keyTension: raw.keyTension?.trim() || 'Unknown stakes',
      };
    } catch (err: any) {
      this.logger.warn(`Context extraction failed: ${err.message} — using empty context`);
      return { people: [], topic: 'Unknown', eventOrSetting: 'Unknown', keyTension: 'Unknown' };
    }
  }

  // ---------------------------------------------------------------------------
  // Score building — derives all fields from GPT scores, no manual overrides
  // ---------------------------------------------------------------------------

  private buildScore(rawScore: any): HookScore {
    const attentionGrab   = this.clamp(rawScore?.attentionGrab   ?? 30);
    const curiosityGap    = this.clamp(rawScore?.curiosityGap    ?? 30);
    const emotionalPull   = this.clamp(rawScore?.emotionalPull   ?? 30);
    const scrollStopPower = this.clamp(rawScore?.scrollStopPower ?? 30);
    const openingStrength = this.clamp(rawScore?.openingStrength ?? 30);

    const overall = this.roundTo(
      attentionGrab   * 0.15 +
      curiosityGap    * 0.25 +
      emotionalPull   * 0.20 +
      scrollStopPower * 0.20 +
      openingStrength * 0.20,
      1,
    );

    // Grade is ALWAYS derived from overall — never manually set
    const grade   = this.getGrade(overall);
    const verdict = this.getVerdict(overall, openingStrength);

    return { overall, attentionGrab, curiosityGap, emotionalPull, scrollStopPower, openingStrength, grade, verdict };
  }

  // ---------------------------------------------------------------------------
  // Result assembly
  // ---------------------------------------------------------------------------

  private buildHookResult(raw: any, context: ExtractedContext): HookAnalysisResult {
    const hookText = raw.hookText?.trim() || 'No hook detected';
    const score    = this.buildScore(raw.score ?? {});

    // Apply small penalty for clearly generic openers (max -5pts)
    const penalizedOverall = this.penalizeGeneric(hookText, score.overall);
    const finalScore: HookScore = penalizedOverall !== score.overall
      ? { ...score, overall: penalizedOverall, grade: this.getGrade(penalizedOverall), verdict: this.getVerdict(penalizedOverall, score.openingStrength) }
      : score;

    const needsRewrite = raw.needsRewrite === true || finalScore.overall < 60;

    // Use GPT's rewrite suggestions if provided and valid, else generate from context
    const rewriteSuggestions: string[] =
      Array.isArray(raw.rewriteSuggestions) && raw.rewriteSuggestions.length >= 2
        ? raw.rewriteSuggestions
        : this.generateContextHooks(context);

    const hookType     = raw.hookType ?? this.classifyHook(hookText);
    const priority     = this.calculatePriority(finalScore.overall);
    const priorityLabel = this.getPriorityLabel(priority, needsRewrite);

    return {
      hookText,
      hookTimestamp: {
        start: raw.hookTimestamp?.start ?? 0,
        end:   raw.hookTimestamp?.end   ?? 5,
      },
      hookType,
      confidence: typeof raw.confidence === 'number' ? raw.confidence : 0.5,
      explanation: raw.explanation?.trim() || 'No explanation provided.',
      suggestedHookVariations: rewriteSuggestions,
      score: finalScore,
      priority,
      priorityLabel,
      needsRewrite,
      rewriteSuggestions,
      extractedContext: context,
    };
  }

  private buildFallbackResult(
    fullText: string,
    segments: TranscriptSegment[],
    context?: ExtractedContext,
  ): HookAnalysisResult {
    const openingSegments = segments.slice(0, 3);
    const hookText = openingSegments.map((s) => s.text).join(' ').trim()
      || fullText.split(/[.!?]/)[0]?.trim()
      || 'No transcript content found';

    const ctx = context ?? { people: [], topic: 'Unknown', eventOrSetting: 'Unknown', keyTension: 'Unknown' };

    const score: HookScore = {
      overall: 20,
      attentionGrab: 20,
      curiosityGap: 20,
      emotionalPull: 20,
      scrollStopPower: 20,
      openingStrength: 20,
      grade: 'F',
      verdict: 'No hook detected. This opening needs a complete rewrite for short-form content.',
    };

    return {
      hookText,
      hookTimestamp: {
        start: openingSegments[0]?.start ?? 0,
        end:   openingSegments[openingSegments.length - 1]?.end ?? 5,
      },
      hookType: this.classifyHook(hookText),
      confidence: 0.2,
      explanation: 'Analysis failed or transcript was too short. This is the literal opening of the video.',
      suggestedHookVariations: this.generateContextHooks(ctx),
      score,
      priority: 4,
      priorityLabel: '⚪ WEAK — Replace hook entirely',
      needsRewrite: true,
      rewriteSuggestions: this.generateContextHooks(ctx),
      extractedContext: ctx,
    };
  }

  // ---------------------------------------------------------------------------
  // Context-aware hook generation — uses real entities, never raw transcript
  // ---------------------------------------------------------------------------

  private generateContextHooks(context: ExtractedContext): string[] {
    const mainPerson = context.people[0];
    const tension    = context.keyTension !== 'Unknown' ? context.keyTension : null;
    const topic      = context.topic      !== 'Unknown' ? context.topic      : null;
    const event      = context.eventOrSetting !== 'Unknown' ? context.eventOrSetting : null;

    const hooks: string[] = [];

    // Priority 1: person + tension (most specific)
    if (mainPerson && tension) {
      hooks.push(`${mainPerson} just revealed the real reason your ${topic ?? 'content'} isn't working`);
      hooks.push(`Most people do this wrong — ${mainPerson} explains the fix`);
      hooks.push(`${mainPerson}: "${tension}"`);
      hooks.push(`This is why your ${topic ?? 'videos'} keep failing (and how to fix it)`);
    }
    // Priority 2: topic + tension
    else if (topic && tension) {
      hooks.push(`The real reason your ${topic} isn't working`);
      hooks.push(`Stop doing this one thing that's killing your ${topic}`);
      hooks.push(`${tension} — here's what nobody tells you`);
      hooks.push(`Everything you know about ${topic} is wrong`);
    }
    // Priority 3: topic only
    else if (topic) {
      hooks.push(`This changes everything about ${topic}`);
      hooks.push(`The ${topic} mistake 99% of people make`);
      hooks.push(`Nobody talks about this part of ${topic}`);
      hooks.push(`Why your ${topic} strategy isn't working`);
    }
    // Priority 4: event/setting
    else if (event) {
      hooks.push(`What really happened at ${event}`);
      hooks.push(`The moment everything changed at ${event}`);
      hooks.push(`Nobody saw this coming at ${event}`);
      hooks.push(`${event} just changed everything`);
    }
    // Last resort — generic but clean
    else {
      hooks.push('Stop doing this — it\'s killing your results');
      hooks.push('Nobody tells you this part');
      hooks.push('This is the real reason it\'s not working');
      hooks.push('Everything you know about this is wrong');
    }

    return hooks.slice(0, 4);
  }

  // ---------------------------------------------------------------------------
  // Classifiers and helpers
  // ---------------------------------------------------------------------------

  private classifyHook(hook: string): string {
    const t = hook.toLowerCase();
    if (/\?/.test(t))                                                          return 'question';
    if (/but here'?s the thing|but here'?s what|the truth is|here'?s why/i.test(t)) return 'pattern_interrupt';
    if (/i('m| am) not going to give you|forget (everything|what you)/i.test(t))    return 'pattern_interrupt';
    if (/did you know|why\b.*\?|the reason|here'?s the secret/i.test(t))      return 'curiosity_gap';
    if (/stop|don't|never|avoid|warning/i.test(t))                             return 'warning';
    if (/mistake|wrong|fail|broken|problem with/i.test(t))                     return 'relatable_problem';
    if (/\d+x|\d+%|\d+ (times|wins|years|days|hours|million|billion)/i.test(t)) return 'statistic';
    if (/record|history|milestone|legacy|all.?time|greatest/i.test(t))        return 'milestone';
    if (/ladies and gentlemen|welcome (back\s)?to|joining us|today we('re| are)/i.test(t)) return 'narrative_intro';
    if (/shocking|secret|nobody (knows|tells|talks)/i.test(t))                return 'bold_statement';
    if (/how (i|we|to)\b/i.test(t))                                           return 'show_result_first';
    if (/i (lost|made|spent|earned|built|went)/i.test(t))                     return 'story_opener';
    return 'bold_statement';
  }

  private penalizeGeneric(hookText: string, overall: number): number {
    const genericPatterns = [
      /^welcome (back\s)?(to|everybody|guys)/i,
      /^ladies and gentlemen/i,
      /^today (we('re)?|i('m)?)\s+(going to|will|talking|discussing|covering|looking)/i,
      /^in this video/i,
      /^(hi|hello|hey),?\s+(guys|everyone|folks)/i,
      /^joining us (now|today|live)/i,
      /^(so\s+)?today (we're|i'm|i am)\s+(going to|talking|discussing)/i,
      /^(alright|all right|okay|ok),?\s*(guys|so|today|welcome)/i,
      /^what('?s| is) (up|going on),?\s*(guys|everyone|folks)/i,
    ];
    const isGeneric = genericPatterns.some((p) => p.test(hookText.trim()));
    return isGeneric ? Math.max(0, this.roundTo(overall - 5, 1)) : overall;
  }

  private calculatePriority(overall: number): number {
    if (overall >= 80) return 1;
    if (overall >= 70) return 2;
    if (overall >= 55) return 3;
    return 4;
  }

  private getPriorityLabel(priority: number, needsRewrite: boolean): string {
    if (needsRewrite) return '⚪ WEAK — Replace hook entirely';
    switch (priority) {
      case 1: return '🔥 FIRE — Use this hook!';
      case 2: return '⚡ STRONG — Good hook, minor tweaks needed';
      case 3: return '💡 DECENT — Has potential, needs improvement';
      default: return '⚪ WEAK — Replace hook entirely';
    }
  }

  private getGrade(score: number): string {
    if (score >= 90) return 'S';
    if (score >= 80) return 'A';
    if (score >= 70) return 'B';
    if (score >= 55) return 'C';
    if (score >= 40) return 'D';
    return 'F';
  }

  private getVerdict(overall: number, openingStrength: number): string {
    if (overall >= 90 && openingStrength >= 90) {
      return 'Elite-tier hook. Creates immediate commitment — use this as your opening.';
    }
    if (overall >= 80) {
      return 'Strong open. Will retain most viewers. Creates immediate commitment.';
    }
    if (overall >= 70) {
      return 'Good opening strength. Sets clear stakes and gives viewers a reason to stay.';
    }
    if (overall >= 55) {
      return 'Decent hook with room for improvement. Consider the rewrite suggestions.';
    }
    if (overall >= 40) {
      return "Below average. Doesn't create enough commitment. Use the rewrite suggestions.";
    }
    return 'Weak hook. Viewers will scroll past. Replace with one of the rewrite suggestions.';
  }

  private clamp(value: number): number {
    return Math.min(100, Math.max(0, value));
  }

  private roundTo(value: number, decimals: number): number {
    const f = Math.pow(10, decimals);
    return Math.round(value * f) / f;
  }
}