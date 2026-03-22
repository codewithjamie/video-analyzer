import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CaptionService } from './caption.service';
import { CloudinaryModule } from '../cloudinary/cloudinary.module';

@Module({
  imports: [ConfigModule, CloudinaryModule],
  providers: [CaptionService],
  exports: [CaptionService],
})
export class CaptionModule {}