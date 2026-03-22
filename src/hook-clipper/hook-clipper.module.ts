import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HookClipperService } from './hook-clipper.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [ConfigModule, CloudinaryModule],
  providers: [HookClipperService],
  exports: [HookClipperService],
})
export class HookClipperModule {}