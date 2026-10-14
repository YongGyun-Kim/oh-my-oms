import { expect } from 'vitest';
import type { SchemaValidator } from '@oms/contracts';
import { decodePayload } from '@oms/persistence';
import type { RecoveryPayload } from '@oms/persistence';
import type { DataSource } from 'typeorm';

interface Entry {
  epoch: string;
  commit_order: string;
  payload_text: string;
  digest: string;
  previous_digest?: string | null;
  request_id?: string;
}
// Test-only lookup of one synthetic request. No column or production query is
// added to the append ledger; its original key stays (epoch, commit_order).
export async function assertProtectedCandidate(
  primary: DataSource,
  journal: DataSource,
  requestId: string,
  schema: SchemaValidator,
): Promise<RecoveryPayload> {
  const candidates: Entry[] = await primary.query(
    'SELECT epoch,commit_order,request_id,payload_text,digest FROM u1_recovery_candidate WHERE request_id=$1',
    [requestId],
  );
  expect(candidates.length).toBe(1);
  const candidate = candidates[0]!,
    original = decodePayload(candidate.payload_text, schema);
  expect(original.requestId).toBe(requestId);
  expect(original.epoch).toBe(candidate.epoch);
  expect(original.commitOrder).toBe(Number(candidate.commit_order));
  expect(original.contentDigest).toBe(candidate.digest);
  const entries: Entry[] = await journal.query(
    "SELECT epoch,commit_order,payload_text,digest,previous_digest FROM u1_protected_entry WHERE payload_text::jsonb->>'requestId'=$1",
    [requestId],
  );
  expect(entries.length).toBe(1);
  const entry = entries[0]!,
    protectedPayload = decodePayload(entry.payload_text, schema);
  expect(protectedPayload.requestId).toBe(requestId);
  expect(entry.epoch).toBe(original.epoch);
  expect(Number(entry.commit_order)).toBe(original.commitOrder);
  expect(entry.digest).toBe(original.contentDigest);
  expect(entry.previous_digest).toBe(original.previousDigest);
  expect(protectedPayload.epoch).toBe(entry.epoch);
  expect(protectedPayload.commitOrder).toBe(Number(entry.commit_order));
  expect(protectedPayload.contentDigest).toBe(entry.digest);
  expect(protectedPayload.previousDigest).toBe(entry.previous_digest);
  for (const [source, table] of [
    [primary, 'u1_protected_prefix'],
    [journal, 'u1_journal_prefix'],
  ] as const) {
    const prefix: { commit_order: string; digest: string | null }[] = await source.query(
      'SELECT commit_order,digest FROM ' + table + ' WHERE epoch=$1',
      [original.epoch],
    );
    expect(prefix.length).toBe(1);
    expect(Number(prefix[0]!.commit_order) >= original.commitOrder).toBe(true);
    if (Number(prefix[0]!.commit_order) === original.commitOrder)
      expect(prefix[0]!.digest).toBe(original.contentDigest);
  }
  // Compare bytes without printing the complete reconstruction payload on a failure.
  expect(entry.payload_text === candidate.payload_text).toBe(true);
  return protectedPayload;
}
