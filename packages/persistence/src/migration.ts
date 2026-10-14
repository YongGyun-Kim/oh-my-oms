import type { DataSource } from 'typeorm';
import { requireCondition } from '@oms/contracts';
import { applyU3ModelConstraints } from './u3-migration.js';
import { applyU4ModelConstraints } from './u4-migration.js';

export async function migrateMaterialModels(source: DataSource): Promise<void> {
  requireCondition(
    source.options.synchronize === false,
    503,
    'UNSAFE_DDL',
    '자동 synchronize는 허용하지 않습니다.',
  );
  const log = await source.driver.createSchemaBuilder().log();
  requireCondition(
    !log.upQueries.some((query) =>
      /\b(DROP\s+TABLE|DROP\s+COLUMN|TRUNCATE|DELETE\s+FROM)\b/i.test(query.query),
    ),
    503,
    'DESTRUCTIVE_DDL',
    '명시 expand migration에서 원본 삭제 DDL은 허용하지 않습니다.',
  );
  // Schema construction runs only in the explicit DDL connection, never on app startup.
  const runner = source.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query('SET LOCAL ROLE u1_owner');
    for (const query of log.upQueries) await runner.query(query.query, query.parameters);
    await applyU3ModelConstraints(runner.manager);
    await applyU4ModelConstraints(runner.manager);
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}
