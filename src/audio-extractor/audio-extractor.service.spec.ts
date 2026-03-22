import { Test, TestingModule } from '@nestjs/testing';
import { AudioExtractorService } from './audio-extractor.service';

describe('AudioExtractorService', () => {
  let service: AudioExtractorService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AudioExtractorService],
    }).compile();

    service = module.get<AudioExtractorService>(AudioExtractorService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
