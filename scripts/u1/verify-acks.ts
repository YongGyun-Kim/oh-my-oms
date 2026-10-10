import { createReadStream, statSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { canonicalJson } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';
interface Ack {
  requestId: string;
  targetRef: Ref;
  owner: string;
  clientRequestId: string;
  company: number;
  observedAt: string;
}
export async function verifyAcknowledgements(store: ProtectedStore, path: string) {
  if (statSync(path).size > 64 * 1024 * 1024)
    throw new Error('독립 ACK 보고서의 유한 범위를 초과했습니다.');
  const input = createReadStream(path, { highWaterMark: 65536 });
  let bytes = 0;
  input.on('data', (chunk) => {
    bytes += chunk.length;
    if (bytes > 64 * 1024 * 1024) input.destroy(new Error('독립 ACK 보고서 범위 초과'));
  });
  const lines = createInterface({ input, crlfDelay: Infinity });
  let count = 0;
  const ids = new Set<string>();
  try {
    for await (const line of lines) {
      if (Buffer.byteLength(line) > 4096 || ++count > 100000)
        throw new Error('독립 ACK 항목의 유한 범위를 초과했습니다.');
      const ack = JSON.parse(line) as Ack;
      store.schema.validate('Id', ack.requestId);
      store.schema.validate('Ref', ack.targetRef);
      store.schema.validate('Id', ack.clientRequestId);
      if (
        ids.has(ack.requestId) ||
        !Number.isInteger(ack.company) ||
        ack.company < 0 ||
        ack.company >= 100 ||
        !['OrderAcceptance', 'ProductCatalog'].includes(ack.owner)
      )
        throw new Error('독립 ACK의 scope/중복/owner가 다릅니다.');
      ids.add(ack.requestId);
      const receipt = await store.read('RequestReceipt', ack.requestId);
      const target = await store.readRevision(
        ack.targetRef.entity,
        ack.targetRef.id,
        ack.targetRef.revision,
      );
      const principal =
        ack.company >= 90 ? 'nfr-staff-' + (ack.company - 90) : 'nfr-customer-' + ack.company * 10;
      const key = (await store.primary.query(
        'SELECT data FROM u1_request_key WHERE request_id=$1 LIMIT 1',
        [ack.requestId],
      )) as { data: Record<string, unknown> }[];
      if (
        !receipt ||
        !target ||
        receipt.principalId !== principal ||
        receipt.owner !== ack.owner ||
        receipt.idempotencyKey !== ack.clientRequestId ||
        !Array.isArray(receipt.resultRefs) ||
        !receipt.resultRefs.some((ref) => canonicalJson(ref) === canonicalJson(ack.targetRef)) ||
        key[0]?.data.principalId !== principal ||
        key[0].data.owner !== ack.owner ||
        key[0].data.requestId !== ack.requestId
      )
        throw new Error(
          '성공 ACK의 원래 protected Receipt/target/Key 대조에 실패했습니다: ' + ack.requestId,
        );
    }
  } finally {
    lines.close();
    input.destroy();
  }
  if (!count) throw new Error('빈 ACK 목록을 RPO0 통과로 만들 수 없습니다.');
  return {
    acknowledgements: count,
    missingOrChanged: 0,
    source: path,
    verifiedAt: new Date().toISOString(),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  if (
    process.env.NODE_ENV === 'production' ||
    process.env.OMS_U1_SYNTHETIC_PROFILE !== 'approved-local-only'
  )
    throw new Error('등록된 로컬 합성 ACK 대조만 허용합니다.');
  const { localSources } = await import('../../tests/u1/fixtures/databases.js');
  const { ProtectedStore } = await import('@oms/persistence');
  const sources = localSources();
  await sources.primaryApp.initialize();
  await sources.journalAppend.initialize();
  try {
    const result = await verifyAcknowledgements(
      new ProtectedStore(sources.primaryApp, sources.journalAppend),
      process.argv[2] ?? '.reports/u1/performance-ack.jsonl',
    );
    writeFileSync('.reports/u1/ack-preservation.json', JSON.stringify(result, null, 2), {
      mode: 0o600,
    });
    console.log(JSON.stringify(result));
  } finally {
    await sources.primaryApp.destroy();
    await sources.journalAppend.destroy();
  }
}
