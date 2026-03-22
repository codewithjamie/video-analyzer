import { Test, TestingModule } from '@nestjs/testing';
import { HookAnalyzerService } from './hook-analyzer.service';

describe('HookAnalyzerService', () => {
  let service: HookAnalyzerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HookAnalyzerService],
    }).compile();

    service = module.get<HookAnalyzerService>(HookAnalyzerService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
