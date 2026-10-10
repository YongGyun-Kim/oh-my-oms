import { decodePayload } from '@oms/persistence';
import type { ProtectedStore, RecoveryPayload } from '@oms/persistence';
// Small isolated-test assertion convenience; never a production journal export.
export async function journalEntries(
  store: ProtectedStore,
  epoch: string,
): Promise<RecoveryPayload[]> {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.OMS_U1_DATABASE_PROFILE !== 'verification-isolated'
  )
    throw new Error('격리된 소규모 원장 회귀 자료만 수집합니다.');
  const result: RecoveryPayload[] = [];
  let cursor = 0;
  for (;;) {
    const rows = (await store.journal.query(
      'SELECT commit_order,payload_text FROM u1_protected_entry WHERE epoch=$1 AND commit_order>$2 ORDER BY commit_order LIMIT 1',
      [epoch, cursor],
    )) as { commit_order: string; payload_text: string }[];
    if (!rows.length) return result;
    if (result.length >= 25)
      throw new Error(
        '소규모 원장 시험 자료 한도 초과: 전수 복구는 실제 streaming 포트를 사용하세요.',
      );
    const row = rows[0]!;
    result.push(decodePayload(row.payload_text, store.schema));
    cursor = Number(row.commit_order);
  }
}
