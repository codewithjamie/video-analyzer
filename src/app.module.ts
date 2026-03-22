import { Module, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { join } from 'path';
import configuration from './config/configuration';
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { UsageModule } from './usage/usage.module';
import { AnalyzerModule } from './analyzer/analyzer.module';
import { User } from './user/user.entity';
import { UsageRecord } from './usage/usage.entity';
import { CloudinaryModule } from './cloudinary/cloudinary.module';
import { HookClipperModule } from './hook-clipper/hook-clipper.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      envFilePath: '.env',
    }),

    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: () => {
        const databaseUrl: string = process.env.DATABASE_URL ?? '';

        let host = process.env.DB_HOST ?? 'localhost';
        let port = parseInt(process.env.DB_PORT ?? '5432', 10);
        let username = process.env.DB_USERNAME ?? 'postgres';
        let password = process.env.DB_PASSWORD ?? '';
        let database = process.env.DB_NAME ?? 'postgres';

        if (databaseUrl) {
          try {
            const url = new URL(databaseUrl);
            host = url.hostname;
            port = parseInt(url.port, 10) || 5432;
            username = decodeURIComponent(url.username);
            password = decodeURIComponent(url.password);
            database = url.pathname.replace('/', '') || 'postgres';
          } catch (err) {
            console.error('🚨 Failed to parse DATABASE_URL:', err);
          }  
        } else {
          console.error('🚨 DATABASE_URL is not set in .env!');
        }

        return {
          type: 'postgres' as const,
          host,
          port,
          username,
          password,
          database,
          entities: [User, UsageRecord],
          autoLoadEntities: true,
          synchronize: true,
          logging: false,
          ssl: { rejectUnauthorized: false },
          retryAttempts: 3,
          retryDelay: 3000,
        };
      },
    }),

    AuthModule,
    UserModule,
    UsageModule,
    AnalyzerModule,
    CloudinaryModule,
    HookClipperModule,
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  constructor(private configService: ConfigService) {}
    

  onModuleInit(): void {
    const supabaseUrl: string =
      this.configService.get<string>('supabase.url') ?? '';
    const dbUrl: string = process.env.DATABASE_URL ?? '';
    const openaiKey: string =
      this.configService.get<string>('openai.apiKey') ?? '';
    const googleKey: string =
      this.configService.get<string>('google.apiKey') ?? '';
    const jwtSecret: string =
      this.configService.get<string>('jwt.secret') ?? '';

    this.logger.log('');
    this.logger.log('╔════════════════════════════════════════════╗');
    this.logger.log('║          ⚙️  Configuration Check             ║');
    this.logger.log('╠════════════════════════════════════════════╣');

    this.logger.log(
      `║  Database: ${
        supabaseUrl ? `✅ ${supabaseUrl}` : '⚠️  URL not set'
      }`,
    );

    // this.logger.log(
    //   `║  Database: ${
    //     dbUrl ? '✅ Connected via DATABASE_URL' : '❌ MISSING'
    //   }`,
    // );

    this.logger.log(
      `║  OpenAI:   ${
        openaiKey
          ? `✅ Set (${openaiKey.substring(0, 12)}...)`
          : '❌ MISSING'
      }`,
    );

    this.logger.log(
      `║  Google:   ${
        googleKey
          ? `✅ Set (${googleKey.substring(0, 12)}...)`
          : "⚠️  Not set"
      }`,
    );

    this.logger.log(
      `║  JWT:      ${
        jwtSecret && jwtSecret !== 'default-secret-change-me'
          ? '✅ Custom secret'
          : '⚠️  Using default'
      }`,
    );

    this.logger.log('╚════════════════════════════════════════════╝');
    this.logger.log('');
  }
}