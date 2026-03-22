import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // Create the NestJS application
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug', 'verbose'],
  });

  // Create a logger instance
  const logger = new Logger('Bootstrap');

  // ─── CORS ────────────────────────────────────────────────
  app.enableCors({
    origin: '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type,Authorization,Accept',
    credentials: true,
  });

  // ─── Global Validation Pipe ──────────────────────────────
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ─── Swagger / OpenAPI Setup ─────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('Video & Audio Analyzer ')
    .setDescription(
      [
        '## 🎬 Video Analysis API',
        '',
        'Analyze videos from **any URL** — extracts hooks, generates captions & transcripts for YouTube.',
        '',
        '---',
        '',
        '### 🔐 Authentication',
        'All analysis endpoints require a JWT token.',
        '',
        '**Quick Start:**',
        '1. `POST /api/v1/auth/signup` — Create an account (Free tier)',
        '2. Copy the `accessToken` from the response',
        '3. Click the **Authorize 🔒** button above → paste the token',
        '4. `POST /api/v1/analyze` — Analyze any video',
        '',
        '---',
        '',
        '### 📊 User Levels',
        '',
        '| Level | Name | Analyses | Max Video Duration |',
        '|-------|------|----------|--------------------|',
        '| 1 | **Free** | 3 total | 3 minutes |',
        '| 2 | **Standard** | Unlimited | 10 minutes |',
        '| 3 | **Premium** | Unlimited | 30 minutes |',
        '',
        '---',
        '',
        '### 🎬 Supported Video Sources',
        '- **YouTube** — youtube.com, youtu.be, shorts, live',
        '- **Google Drive** — public/shared files',
        '- **Direct URLs** — MP4, WebM, MOV',
        '- **Social Media** — Vimeo, Dailymotion, Twitter/X, Instagram, TikTok',
        '- **Live Streams** — HLS (.m3u8), DASH (.mpd)',
        '- **1000+ sites** — powered by yt-dlp',
        '',
        '---',
        '',
        '### 📦 What You Get',
        '- **Transcript** — Full text + timestamped segments',
        '- **Captions** — SRT + VTT format (YouTube-ready)',
        '- **Hooks** — AI-identified attention-grabbing moments with variations',
        '',
        '---',
        '',
        '### 💡 Tips',
        '- For **live streams**, set `captureDurationSeconds` (default: 120s, max: 300s)',
        '- Use `/transcript-only`, `/hooks-only`, or `/captions-only` for single outputs',
        '- Check `GET /api/v1/auth/profile` to see your remaining analyses',
      ].join('\n'),
    )
    .setVersion('1.0')   
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'Authorization',
        description: 'Enter your JWT token from /auth/signup or /auth/login',
        in: 'header',
      },
      'JWT-auth',
    )
    .addTag('auth', 'Signup, login, upgrade, and profile management')
    .addTag('analyzer', 'Video analysis — transcript, captions, hooks')
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);

  SwaggerModule.setup('api/documentation', app, document, {
    swaggerOptions: {
      persistAuthorization: true,
      docExpansion: 'list',
      filter: true,
      showRequestDuration: true,
      syntaxHighlight: {
        activate: true,
        theme: 'monokai',
      },
      tagsSorter: 'alpha',
      operationsSorter: 'method',
    },
    customSiteTitle: 'Video Analyzer API — Swagger',
    customCss: `
      .swagger-ui .topbar { display: none; }
      .swagger-ui .info .title { font-size: 4em; }
      .swagger-ui .info .description { max-width: 900px; }
    `,
  });

  // ─── Start Server ────────────────────────────────────────
  const port: number = parseInt(process.env.PORT ?? '3000', 10);

  await app.listen(port);

  logger.log('');
  logger.log('╔════════════════════════════════════════════════════╗');
  logger.log('║            🎬 Video Analyzer API                   ║');
  logger.log('╠════════════════════════════════════════════════════╣');
  logger.log(`║  🚀 Server:   http://localhost:${port}                  ║`);
  logger.log(`║  📚 Swagger:  http://localhost:${port}/api/documentation ║`);
  logger.log('╠════════════════════════════════════════════════════╣');
  logger.log('║  Auth Endpoints:                                    ║');
  logger.log('║    POST /api/v1/auth/signup      → Create account   ║');
  logger.log('║    POST /api/v1/auth/login       → Get JWT token    ║');
  logger.log('║    POST /api/v1/auth/upgrade     → Upgrade level    ║');
  logger.log('║    GET  /api/v1/auth/profile     → View usage       ║');
  logger.log('╠════════════════════════════════════════════════════╣');
  logger.log('║  Analyzer Endpoints (JWT required):                 ║');
  logger.log('║    POST /api/v1/analyze          → Full analysis    ║');
  logger.log('║    POST /api/v1/analyze/transcript-only             ║');
  logger.log('║    POST /api/v1/analyze/hooks-only                  ║');
  logger.log('║    POST /api/v1/analyze/captions-only               ║');
  logger.log('╠════════════════════════════════════════════════════╣');
  logger.log('║  User Levels:                                       ║');
  logger.log('║    Level 1 (Free)     → 3 analyses, max 3 min       ║');
  logger.log('║    Level 2 (Standard) → Unlimited,  max 10 min      ║');
  logger.log('║    Level 3 (Premium)  → Unlimited,  max 30 min      ║');
  logger.log('╚════════════════════════════════════════════════════╝');
  logger.log('');
}

bootstrap();