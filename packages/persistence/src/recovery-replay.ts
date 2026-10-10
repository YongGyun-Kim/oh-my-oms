import { In } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { modelDefinition, physicalData, primaryAttribute } from './model-catalog.js';
import type { RecoveryPayload, RecoveryRow } from './recovery-types.js';
// Called only after complete closed-schema/digest/prefix verification, inside
// the fenced restore transaction. Bounded chunks preserve all after-images.
export async function replayRows(manager: EntityManager, payload: RecoveryPayload): Promise<void> {
  const byModel = new Map<string, RecoveryRow[]>();
  for (const row of payload.rows) {
    const group = byModel.get(row.model) ?? [];
    group.push(row);
    byModel.set(row.model, group);
  }
  // Delete tombstones before any create/upsert. Immediate unique constraints
  // must not observe an old deleted holder while its replacement is inserted.
  for (const [name, rows] of byModel) {
    if (name === 'RequestKey') continue;
    const deleted = rows.filter((row) => row.deleted);
    const key = primaryAttribute(modelDefinition(name)).name;
    for (let offset = 0; offset < deleted.length; offset += 100)
      await manager
        .getRepository(name)
        .delete({ [key]: In(deleted.slice(offset, offset + 100).map((row) => row.id)) });
  }
  for (const [name, rows] of byModel) {
    for (let offset = 0; offset < rows.length; offset += 100) {
      const chunk = rows.slice(offset, offset + 100);
      if (name === 'RequestKey') {
        const values = chunk.flatMap((row) => [row.id, row.data.requestId, row.data]);
        await manager.query(
          'INSERT INTO u1_request_key VALUES ' +
            chunk.map((_row, i) => `($${i * 3 + 1},$${i * 3 + 2},$${i * 3 + 3})`).join(','),
          values,
        );
        continue;
      }
      const definition = modelDefinition(name);
      const key = primaryAttribute(definition).name;
      const living = chunk
        .filter((row) => !row.deleted)
        .map((row) => {
          // An after-image is complete: omission of an optional value must clear
          // its former value, rather than silently keep a pre-delete value.
          const data = { ...row.data };
          for (const attribute of definition.attributes)
            if (data[attribute.name] === undefined) data[attribute.name] = null;
          return physicalData(name, data);
        });
      if (living.length) await manager.getRepository(name).upsert(living, { conflictPaths: [key] });
      const values = chunk.flatMap((row) => [
        row.model,
        row.id,
        row.revision,
        payload.epoch,
        payload.commitOrder,
        row.data,
        row.deleted,
      ]);
      await manager.query(
        'INSERT INTO u1_entity_version VALUES ' +
          chunk
            .map(
              (_row, i) =>
                `(${Array.from({ length: 7 }, (_value, j) => '$' + (i * 7 + j + 1)).join(',')})`,
            )
            .join(','),
        values,
      );
    }
  }
}
