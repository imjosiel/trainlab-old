import { ExerciseStorageService } from './exercise-storage.service';

describe('ExerciseStorageService (HLS)', () => {
  let service: ExerciseStorageService;
  const originalFetch = global.fetch;
  beforeEach(() => {
    service = new ExerciseStorageService();
    process.env.R2_BUCKET_NAME = 'test-bucket';
    process.env.R2_ACCOUNT_ID = 'acc';
    process.env.R2_ACCESS_KEY_ID = 'key';
    process.env.R2_SECRET_ACCESS_KEY = 'secret';
    (global as any).fetch = jest.fn().mockResolvedValue({ ok: true });
  });
  afterEach(() => { (global as any).fetch = originalFetch; delete process.env.GITHUB_ACTIONS_TOKEN; });

  it('dispararProcessamentoDeVideo: no-op sem token', async () => {
    delete process.env.GITHUB_ACTIONS_TOKEN;
    await expect(service.dispararProcessamentoDeVideo()).resolves.toBeUndefined();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('dispara GH Actions com token', async () => {
    process.env.GITHUB_ACTIONS_TOKEN = 'ghp_test';
    await service.dispararProcessamentoDeVideo();
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('dispatches'), expect.objectContaining({ method: 'POST' }));
  });

  it('apagarArquivos: no-op sem prefix ou bucket', async () => {
    await service.apagarArquivos('');
    expect(fetch).not.toHaveBeenCalled();
  });
});
