import { describe, expect, it, vi } from 'vitest';
import { DeploymentControl } from '@oms/integrations';
import type {
  DeploymentAttempt,
  DeploymentControlStore,
  DeploymentPlatform,
  RollbackEvidence,
} from '@oms/integrations';
const release = {
  sourceSha: 'a'.repeat(40),
  imageDigest: 'sha256:' + 'b'.repeat(64),
  schemaDigest: 'c'.repeat(64),
  registryDigest: 'd'.repeat(64),
  recoveryDecoderDigest: 'e'.repeat(64),
  configRevision: 'synthetic-config',
  keyGeneration: 'original-key',
  bindingGeneration: 'original-binding',
  epoch: 'original-epoch',
  acceptedWorkVersions: [2],
};
const evidence = (): RollbackEvidence => ({
  incidentId: 'incident',
  attemptId: 'original-attempt',
  current: { ...release },
  previous: { ...release, imageDigest: 'sha256:' + 'f'.repeat(64) },
  previousState: 'COMPLETED',
  pendingWorkVersions: [2],
  originalKeysRetained: true,
  currentSecurityConfirmed: true,
  stagedCompatibilityPassed: true,
  manifestApproved: true,
});
class Store implements DeploymentControlStore {
  readonly kind = 'SYNTHETIC';
  value: DeploymentAttempt | null = null;
  async read() {
    return this.value ? { ...this.value } : null;
  }
  async compareAndSet(value: DeploymentAttempt, revision: number | null) {
    if ((this.value?.revision ?? null) !== revision) throw new Error('CAS conflict');
    this.value = { ...value };
  }
}
function setup() {
  const store = new Store();
  const platform: DeploymentPlatform = {
    observe: vi.fn(async () => evidence()),
    notifyStarted: vi.fn(async () => undefined),
    applyApplicationImage: vi.fn(async () => undefined),
  };
  const control = new DeploymentControl(store, platform, true, async () => true);
  return { store, platform, control, signal: AbortSignal.timeout(1000) };
}
describe('조건부배포 제어의 원래claim·현재재대조·callback·불명', () => {
  it('독립지속claim→두채널시작통지→현재재대조→같은digest적용이며업무복구아니다', async () => {
    const { store, platform, control, signal } = setup();
    vi.mocked(platform.notifyStarted).mockImplementation(async () => {
      expect(store.value?.state).toBe('CLAIMED');
    });
    const result = await control.rollback('incident', 'original-attempt', signal);
    expect(result.state).toBe('APPLIED_UNVERIFIED');
    expect(platform.observe).toHaveBeenCalledTimes(2);
    expect(platform.applyApplicationImage).toHaveBeenCalledWith(
      evidence().previous.imageDigest,
      'original-attempt',
      signal,
    );
  });
  it('같은원래시도재송달은두번째통지/적용을만들지않는다', async () => {
    const { platform, control, signal } = setup();
    const result = await control.rollback('incident', 'original-attempt', signal);
    expect(await control.rollback('incident', 'original-attempt', signal)).toEqual(result);
    expect(platform.applyApplicationImage).toHaveBeenCalledOnce();
    expect(platform.notifyStarted).toHaveBeenCalledOnce();
  });
  it('실제준비미확인또는합성store의운영사용은외부port전에거절한다', async () => {
    const { store, platform, signal } = setup();
    await expect(
      new DeploymentControl(store, platform, true).rollback('incident', 'original-attempt', signal),
    ).rejects.toMatchObject({ code: 'DEPLOYMENT_ACTIVATION_UNVERIFIED' });
    expect(platform.observe).not.toHaveBeenCalled();
    expect(() => new DeploymentControl(store, platform, false)).toThrow();
  });
  it('현재보안/원래workdecoder호환미확인은수동으로남고적용하지않는다', async () => {
    const { platform, control, signal } = setup();
    vi.mocked(platform.observe).mockResolvedValue({
      ...evidence(),
      currentSecurityConfirmed: false,
    });
    expect((await control.rollback('incident', 'original-attempt', signal)).state).toBe(
      'MANUAL_REQUIRED',
    );
    expect(platform.applyApplicationImage).not.toHaveBeenCalled();
  });
  it('claim뒤현재권한/manifest변경은외부적용없이UNKNOWN으로보존한다', async () => {
    const { platform, control, signal } = setup();
    vi.mocked(platform.observe)
      .mockResolvedValueOnce(evidence())
      .mockResolvedValueOnce({ ...evidence(), currentSecurityConfirmed: false });
    expect((await control.rollback('incident', 'original-attempt', signal)).state).toBe('UNKNOWN');
    expect(platform.applyApplicationImage).not.toHaveBeenCalled();
  });
  it('platformtimeout/결과불명은새시도자동반복을만들지않는다', async () => {
    const { platform, control, signal } = setup();
    vi.mocked(platform.applyApplicationImage).mockRejectedValue(new Error('synthetic unknown'));
    expect((await control.rollback('incident', 'original-attempt', signal)).state).toBe('UNKNOWN');
    await control.rollback('incident', 'original-attempt', signal);
    expect(platform.applyApplicationImage).toHaveBeenCalledOnce();
  });
  it('늦은이전callback은현재제어개정을덮지않는다', async () => {
    const { store, platform, control, signal } = setup();
    vi.mocked(platform.applyApplicationImage).mockImplementation(async () => {
      store.value = { ...store.value!, revision: 2, state: 'UNKNOWN' };
    });
    await expect(control.rollback('incident', 'original-attempt', signal)).rejects.toMatchObject({
      code: 'DEPLOYMENT_CALLBACK_FENCED',
    });
    expect(store.value?.state).toBe('UNKNOWN');
  });
  it('원래ID불일치/같은키다른근거와미전송abort는적용하지않는다', async () => {
    const { platform, control, signal } = setup();
    vi.mocked(platform.observe).mockResolvedValueOnce({ ...evidence(), attemptId: 'different' });
    await expect(control.rollback('incident', 'original-attempt', signal)).rejects.toMatchObject({
      code: 'DEPLOYMENT_ORIGINAL_ID',
    });
    await control.rollback('incident', 'original-attempt', signal);
    vi.mocked(platform.observe).mockResolvedValue({ ...evidence(), manifestApproved: false });
    await expect(control.rollback('incident', 'original-attempt', signal)).rejects.toMatchObject({
      code: 'DEPLOYMENT_ORIGINAL_CONFLICT',
    });
    const stopped = AbortSignal.abort();
    await expect(control.rollback('incident', 'original-attempt', stopped)).rejects.toThrow();
    expect(platform.applyApplicationImage).toHaveBeenCalledOnce();
  });
});
