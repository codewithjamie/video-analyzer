export default () => ({
  port: parseInt(process.env.PORT ?? '3000', 10),

  supabase: {
    url: process.env.SUPABASE_URL ?? '',
    anonKey: process.env.SUPABASE_ANON_KEY ?? '',
  },

  database: {
    host: process.env.DB_HOST ?? 'localhost',
    port: parseInt(process.env.DB_PORT ?? '6543', 10),
    username: process.env.DB_USERNAME ?? 'postgres',
    password: process.env.DB_PASSWORD ?? '',
    name: process.env.DB_NAME ?? 'postgres',
  },

  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME ?? '',
    apiKey: process.env.CLOUDINARY_API_KEY ?? '',
    apiSecret: process.env.CLOUDINARY_API_SECRET ?? '',
  },

  jwt: {
    secret: process.env.JWT_SECRET ?? 'default-secret-change-me',
    expiration: process.env.JWT_EXPIRATION ?? '7d',
  },

  openai: {
    apiKey: process.env.OPENAI_API_KEY ?? '',
    model: process.env.OPENAI_MODEL ?? 'gpt-4o',
    whisperModel: process.env.WHISPER_MODEL ?? 'whisper-1',
  },

  google: {
    apiKey: process.env.GOOGLE_API_KEY ?? '',
  },

  analysis: {
    maxVideoDurationSeconds: parseInt(
      process.env.MAX_VIDEO_DURATION_SECONDS ?? '18000',
      10,
    ),
    tempDir: process.env.TEMP_DIR ?? '/tmp/video-analyzer',
  },

  ytdlp: {
    path: process.env.YTDLP_PATH ?? 'yt-dlp',
  },

  livestream: {
    maxDurationSeconds: parseInt(
      process.env.LIVESTREAM_MAX_DURATION_SECONDS ?? '120',
      10,
    ),
  },
});