import { createHash } from 'node:crypto';
import type { DataSource } from 'typeorm';
import { canonicalJson } from '@oms/contracts';
import { MODELS, primaryAttribute, tableName } from '@oms/persistence';
// A keyset stream hashes all material business originals, never a capped sample.
export async function preservationManifest(source: DataSource) {
  const models = MODELS.filter(
    (model) => !['WorkItem', 'RecoveryWorkHold', 'OutboxDelivery'].includes(model.name),
  );
  const results: Record<string, { rows: number; digest: string }> = {};
  for (const model of models) {
    const pk = primaryAttribute(model).name;
    const hash = createHash('sha256');
    let cursor: string | null = null;
    let rows = 0;
    for (;;) {
      const page = (await source.query(
        `SELECT to_jsonb(t) AS data FROM "${tableName(model.name)}" t ${cursor === null ? '' : `WHERE "${pk}">$1`} ORDER BY "${pk}" LIMIT 25`,
        cursor === null ? [] : [cursor],
      )) as { data: Record<string, unknown> }[];
      if (page.length === 0) break;
      for (const row of page) {
        hash.update(canonicalJson(row.data) + '\n');
        cursor = String(row.data[pk]);
        rows++;
      }
    }
    results[model.name] = { rows, digest: hash.digest('hex') };
  }
  for (const name of ['WorkItem', 'OutboxDelivery']) {
    const model = MODELS.find((model) => model.name === name)!;
    const pk = primaryAttribute(model).name;
    const hash = createHash('sha256');
    let cursor: string | null = null;
    let rows = 0;
    for (;;) {
      const page = (await source.query(
        `SELECT to_jsonb(t) AS data FROM "${tableName(name)}" t ${cursor === null ? '' : `WHERE "${pk}">$1`} ORDER BY "${pk}" LIMIT 25`,
        cursor === null ? [] : [cursor],
      )) as { data: Record<string, unknown> }[];
      if (!page.length) break;
      for (const row of page) {
        cursor = String(row.data[pk]);
        const data = { ...row.data };
        for (const field of ['state', 'revision', 'leaseOwner', 'leaseUntil', 'leaseGeneration'])
          delete data[field];
        hash.update(canonicalJson(data) + '\n');
        rows++;
      }
    }
    results[name + 'OriginalIdentity'] = { rows, digest: hash.digest('hex') };
  }
  // Tombstones are not copied back into material rows. Hash latest protected deleted IDs separately.
  const tombstoneHash = createHash('sha256');
  let afterModel = '';
  let afterId = '';
  let deleted = 0;
  for (;;) {
    // Bound the identity scan BEFORE looking up protected history. A global
    // DISTINCT over full after-images sorts the entire journal-sized table.
    // Advance over every identity, including live/unprotected candidates.
    const page = (await source.query(
      `SELECT c.model,c.id,latest.data,COALESCE(latest.deleted,false) AS deleted FROM (SELECT DISTINCT model,id FROM u1_entity_version WHERE (model,id)>($1,$2) ORDER BY model,id LIMIT 25) c LEFT JOIN LATERAL (SELECT v.data,v.deleted FROM u1_entity_version v JOIN u1_protected_prefix p ON p.epoch=v.epoch AND v.commit_order<=p.commit_order JOIN u1_epoch_sequence e ON e.epoch=v.epoch WHERE v.model=c.model AND v.id=c.id ORDER BY e.generation DESC,v.commit_order DESC LIMIT 1) latest ON true ORDER BY c.model,c.id`,
      [afterModel, afterId],
    )) as { model: string; id: string; data: unknown; deleted: boolean }[];
    if (!page.length) break;
    for (const row of page) {
      if (row.deleted) {
        const { model, id, data } = row;
        tombstoneHash.update(canonicalJson({ model, id, data }) + '\n');
        deleted++;
      }
      afterModel = row.model;
      afterId = row.id;
    }
  }
  return { models: results, tombstones: { rows: deleted, digest: tombstoneHash.digest('hex') } };
}
