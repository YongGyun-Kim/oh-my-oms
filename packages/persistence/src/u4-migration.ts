import type { DataSource, EntityManager } from 'typeorm';
import { requireCondition } from '@oms/contracts';
import { migrateMaterialModels } from './migration.js';
import { U4_MODELS, U4_SUPPORT_MODELS } from './u4-model-catalog.js';
import { tableName } from './model-catalog.js';

export async function applyU4ModelConstraints(
  manager: Pick<EntityManager, 'query'>,
): Promise<void> {
  await manager.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS u4_payment_identity ON u1_financial_identity_claim("sourceNamespace","canonicalIdentity");
    CREATE UNIQUE INDEX IF NOT EXISTS u4_refund_identity ON u1_financial_refund_identity_claim("sourceNamespace","canonicalIdentity");
    CREATE UNIQUE INDEX IF NOT EXISTS u4_obligation_invoice ON u1_financial_invoice_binding("orderId","obligationKey");
    CREATE UNIQUE INDEX IF NOT EXISTS u4_order_line_position ON u1_order_line("orderRefKey","position") WHERE "modelVersion"=3;
    CREATE UNIQUE INDEX IF NOT EXISTS u4_purchase_snapshot_order ON u1_purchase_terms_snapshot("orderRefKey") WHERE "modelVersion"=3;
    CREATE OR REPLACE FUNCTION u4_preserve_immutable() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
    BEGIN
      IF NOT pg_has_role(session_user,'u1_owner','MEMBER') THEN
        RAISE EXCEPTION 'immutable financial identity or history' USING ERRCODE='42501';
      END IF;
      IF TG_OP='DELETE' THEN RETURN OLD; END IF;
      RETURN NEW;
    END $function$;
    REVOKE ALL ON FUNCTION u4_preserve_immutable() FROM PUBLIC;
  `);
  for (const model of [
    'FinancialIdentityClaim',
    'FinancialRefundIdentityClaim',
    'FinancialHistory',
    'FinancialExchange',
  ]) {
    const table = tableName(model);
    await manager.query('DROP TRIGGER IF EXISTS u4_preserve ON "' + table + '"');
    await manager.query(
      'CREATE TRIGGER u4_preserve BEFORE UPDATE OR DELETE ON "' +
        table +
        '" FOR EACH ROW EXECUTE FUNCTION u4_preserve_immutable()',
    );
  }
  for (const model of [...U4_MODELS, ...U4_SUPPORT_MODELS]) {
    const table = tableName(model.name);
    for (const attribute of model.attributes.filter(
      (attribute) => attribute.required && !attribute.nullable,
    ))
      await manager.query(
        'ALTER TABLE "' + table + '" ALTER COLUMN "' + attribute.name + '" SET NOT NULL',
      );
  }
}
export async function migrateU4Models(source: DataSource): Promise<void> {
  requireCondition(
    source.options.type === 'postgres' && source.options.synchronize === false,
    503,
    'UNSAFE_DDL',
    '명시적 PostgreSQL owner migration이 필요합니다.',
  );
  const authority = await source.query(
    "SELECT pg_has_role(session_user,'u1_owner','MEMBER') AS allowed",
  );
  requireCondition(
    authority[0]?.allowed === true,
    403,
    'DDL_AUTHORITY',
    '원본 DDL owner 권위가 필요합니다.',
  );
  await migrateMaterialModels(source);
}
