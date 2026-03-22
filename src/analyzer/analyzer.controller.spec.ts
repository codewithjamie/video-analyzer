import { Test, TestingModule } from '@nestjs/testing';
import { AnalyzerController } from './analyzer.controller';

describe('AnalyzerController', () => {
  let controller: AnalyzerController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AnalyzerController],
    }).compile();

    controller = module.get<AnalyzerController>(AnalyzerController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
