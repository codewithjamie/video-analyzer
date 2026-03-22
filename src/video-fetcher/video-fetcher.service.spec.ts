import { Test, TestingModule } from '@nestjs/testing';
import { VideoFetcherService } from './video-fetcher.service';

describe('VideoFetcherService', () => {
  let service: VideoFetcherService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VideoFetcherService],
    }).compile();

    service = module.get<VideoFetcherService>(VideoFetcherService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
