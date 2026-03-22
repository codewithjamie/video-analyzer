import { Test, TestingModule } from '@nestjs/testing';
import { CaptionService } from './caption.service';

describe('CaptionService', () => {
  let service: CaptionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CaptionService],
    }).compile();

    service = module.get<CaptionService>(CaptionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
