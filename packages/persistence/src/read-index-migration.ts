import type { DataSource } from 'typeorm';
export async function migrateReadIndexes(source: DataSource): Promise<void> {
  // Explicit DDL role, bounded administrative build; never an app startup path.
  await source.transaction(async (manager) => {
    await manager.query('SET LOCAL ROLE u1_owner');
    await manager.query("SET LOCAL statement_timeout='60s'; SET LOCAL lock_timeout='1s'");
    await manager.query(
      'CREATE INDEX IF NOT EXISTS u1_entity_version_data_filter ON u1_entity_version USING gin(data jsonb_path_ops)',
    );
  });
}
