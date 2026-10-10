import type { DataSource } from 'typeorm';
import { MODELS, tableName } from '@oms/persistence';
export async function assertEmptyPerformanceStores(
  primary: DataSource,
  journal: DataSource,
): Promise<void> {
  const address = (source: DataSource) =>
    source.options.type === 'postgres' ? new URL(source.options.url!) : null;
  const p = address(primary),
    j = address(journal);
  if (
    !p ||
    !j ||
    p.hostname !== '127.0.0.1' ||
    p.port !== '15432' ||
    p.pathname !== '/oms_u1' ||
    j.hostname !== '127.0.0.1' ||
    j.port !== '25432' ||
    j.pathname !== '/oms_u1_journal'
  )
    throw new Error('등록된 로컬 성능 DB 원본만 준비할 수 있습니다.');
  // Fresh preparation never truncates a previously accepted profile or journal.
  for (const model of MODELS) {
    const rows = (await primary.query(
      'SELECT EXISTS(SELECT 1 FROM "' + tableName(model.name) + '") AS present',
    )) as { present: boolean }[];
    if (rows[0]?.present !== false)
      throw new Error('기존 성능/ACK 원본이 있으므로 새 준비/reset을 금지합니다.');
  }
  const entries = (await journal.query(
    'SELECT EXISTS(SELECT 1 FROM u1_protected_entry) AS present',
  )) as { present: boolean }[];
  if (entries[0]?.present !== false) throw new Error('기존 보호 원장을 초기화할 수 없습니다.');
  const control = (await primary.query(
    'SELECT epoch,enabled,auth_ready FROM u1_recovery_control WHERE singleton=true',
  )) as { epoch: string; enabled: boolean; auth_ready: boolean }[];
  if (
    control.length !== 1 ||
    control[0]!.epoch !== 'initial' ||
    control[0]!.enabled !== true ||
    control[0]!.auth_ready !== true
  )
    throw new Error('새 초기 실행/인증 준비를 대조해야 합니다.');
}
