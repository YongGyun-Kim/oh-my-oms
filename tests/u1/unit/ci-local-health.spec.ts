import { describe, it, expect, vi } from 'vitest';
import { ciLocalHealth } from '../../../scripts/u1/ci-local-health.js';
const env = () => ({
  CI: 'true',
  OMS_U1_SYNTHETIC_PROFILE: 'approved-local-only',
  NODE_ENV: 'test' as const,
});
const transport = () =>
  vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 200 }));
describe('CI 공개 합성 loopback 준비 probe의 목적 제한', () => {
  it('등록된 API liveness만 localhost로 자격 없이 조회한다', async () => {
    const send = transport();
    expect(await ciLocalHealth(34700, '/health/live', env(), send)).toBe(true);
    expect(String(send.mock.calls[0]![0])).toBe('http://127.0.0.1:34700/health/live');
    expect(send.mock.calls[0]![1]).toMatchObject({
      method: 'GET',
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
  });
  it('두 UI public root는 business/인증 조회 없이 확인한다', async () => {
    for (const port of [3100, 3200])
      expect(await ciLocalHealth(port, '/', env(), transport())).toBe(true);
  });
  it('운영/CI미확인/합성 profile 미등록은 네트워크 호출 전에 거절한다', async () => {
    const send = transport();
    for (const change of [
      { NODE_ENV: 'production' as const },
      { CI: 'false' },
      { OMS_U1_SYNTHETIC_PROFILE: 'other' },
    ])
      await expect(
        ciLocalHealth(34700, '/health/live', { ...env(), ...change }, send),
      ).rejects.toThrow('합성');
    expect(send).not.toHaveBeenCalled();
  });
  it('등록되지 않은port/계정/업무 path는 public probe가 아니다', async () => {
    const send = transport();
    for (const [port, path] of [
      [443, '/'],
      [34700, '/identity'],
      [3100, '/health/live'],
    ] as const)
      await expect(ciLocalHealth(port, path as '/', env(), send)).rejects.toThrow('접점');
    expect(send).not.toHaveBeenCalled();
  });
  it('redirect/503/예상 밖 상태는 healthy로 바꾸지 않는다', async () => {
    for (const status of [302, 401, 503])
      expect(
        await ciLocalHealth(
          34700,
          '/health/live',
          env(),
          vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status })),
        ),
      ).toBe(false);
  });
  it('transport 실패는 실제 준비 불명으로 전파한다', async () => {
    await expect(
      ciLocalHealth(
        34700,
        '/health/live',
        env(),
        vi.fn<typeof fetch>().mockRejectedValue(new Error('redirect denied')),
      ),
    ).rejects.toThrow('denied');
  });
  it('본문을 업무 근거로 읽지 않고 종료 시 cancel한다', async () => {
    const value = new Response('{}');
    const cancel = vi.spyOn(value.body!, 'cancel');
    await ciLocalHealth(
      34700,
      '/health/live',
      env(),
      vi.fn<typeof fetch>().mockResolvedValue(value),
    );
    expect(cancel).toHaveBeenCalledOnce();
  });
  it('각 공개 조회에는1초 signal이 있고 caller가 연장할 값이 없다', async () => {
    const send = transport();
    await ciLocalHealth(34700, '/health/live', env(), send);
    expect(send.mock.calls[0]![1]!.signal).toBeInstanceOf(AbortSignal);
  });
});
