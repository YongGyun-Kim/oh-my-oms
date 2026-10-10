import type { DataSource } from 'typeorm';
import { requireCondition } from '@oms/contracts';

export async function migrateMaterialModels(source: DataSource): Promise<void> {
  requireCondition(
    source.options.synchronize === false,
    503,
    'UNSAFE_DDL',
    '자동 synchronize는 허용하지 않습니다.',
  );
  const log = await source.driver.createSchemaBuilder().log();
  // Schema construction runs only in the explicit DDL connection, never on app startup.
  const runner = source.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();
  try {
    await runner.query('SET LOCAL ROLE u1_owner');
    for (const query of log.upQueries) await runner.query(query.query, query.parameters);
    await runner.commitTransaction();
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
  }
}
