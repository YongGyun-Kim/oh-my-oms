// Only public local synthetic startup probes; never credentials or real readiness evidence.
export async function ciLocalHealth(
  port: number,
  path: '/' | '/health/live',
  env: NodeJS.ProcessEnv = process.env,
  transport: typeof fetch = fetch,
): Promise<boolean> {
  if (
    env.CI !== 'true' ||
    env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only' ||
    env.NODE_ENV === 'production'
  )
    throw new Error('명시 합성 CI의 공개 local health만 확인합니다.');
  if (!(
    (port === 34700 && path === '/health/live') ||
    ([3100, 3200].includes(port) && path === '/')
  ))
    throw new Error('등록되지 않은 CI 공개 probe 접점입니다.');
  const url = new URL(path, 'http://127.0.0.1:' + port);
  const response = await transport(url, {
    method: 'GET',
    credentials: 'omit',
    redirect: 'error',
    cache: 'no-store',
    signal: AbortSignal.timeout(1000),
  });
  try {
    return response.status === 200;
  } finally {
    await response.body?.cancel();
  }
}
