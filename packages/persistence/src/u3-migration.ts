import type { DataSource, EntityManager } from 'typeorm';
import { requireCondition } from '@oms/contracts';
import { MODELS, tableName } from './model-catalog.js';
import { U3_MODELS } from './u3-model-catalog.js';
import { migrateMaterialModels } from './migration.js';

const quoted = (name: string) => {
  requireCondition(
    /^[A-Za-z][A-Za-z0-9_]*$/.test(name),
    503,
    'DDL_IDENTIFIER',
    '등록된 DDL 식별자만 허용합니다.',
  );
  return '"' + name + '"';
};
const requiredFields = (model: (typeof U3_MODELS)[number]) =>
  model.attributes
    .filter(
      (attribute) =>
        attribute.required && !attribute.nullable && attribute.type !== 'OptionalPurpose',
    )
    .map((attribute) => quoted(attribute.name) + ' IS NOT NULL')
    .join(' AND ');

// Called inside the same explicit owner DDL transaction as expand material DDL.
export async function applyU3ModelConstraints(
  manager: Pick<EntityManager, 'query'>,
): Promise<void> {
  for (const current of U3_MODELS) {
    const legacy = MODELS.find((old) => old.name === current.name);
    if (!legacy) continue;
    const name = tableName(current.name),
      constraint = 'u3_' + name + '_version';
    await manager.query(
      'ALTER TABLE ' + quoted(name) + ' DROP CONSTRAINT IF EXISTS ' + quoted(constraint),
    );
    await manager.query(
      'ALTER TABLE ' +
        quoted(name) +
        ' ADD CONSTRAINT ' +
        quoted(constraint) +
        ' CHECK (("modelVersion" IS NULL AND ' +
        requiredFields(legacy) +
        ') OR ' +
        '("modelVersion"=2 AND ' +
        requiredFields(current) +
        '))',
    );
  }
  await manager.query(`
    CREATE UNIQUE INDEX IF NOT EXISTS u3_order_line_position ON u1_order_line("orderRefKey","position") WHERE "modelVersion"=2;
    CREATE UNIQUE INDEX IF NOT EXISTS u3_purchase_snapshot_order ON u1_purchase_terms_snapshot("orderRefKey") WHERE "modelVersion"=2;
    CREATE UNIQUE INDEX IF NOT EXISTS u3_applied_consent ON u1_order_change_application("consentRefKey") WHERE "actualApplicationResult"='APPLIED';
    CREATE UNIQUE INDEX IF NOT EXISTS u3_approved_exact_revision ON u1_agreement_approval("revisionRefKey",("revisionRef"->>'revision')) WHERE decision='APPROVE';
    CREATE INDEX IF NOT EXISTS u3_contract_enterprise ON u1_enterprise_contract("enterpriseRefKey");
    CREATE INDEX IF NOT EXISTS u3_agreement_contract_window ON u1_agreement_revision("contractRefKey",state);
    CREATE INDEX IF NOT EXISTS u3_proposal_enterprise ON u1_commercial_proposal("enterpriseRefKey",result);
    CREATE INDEX IF NOT EXISTS u3_exception_enterprise_product ON u1_enterprise_offer_exception("enterpriseRefKey","productRefKey");
    CREATE OR REPLACE FUNCTION u3_preserve_immutable() RETURNS trigger
      LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $function$
      BEGIN
        IF NOT pg_has_role(session_user,'u1_owner','MEMBER') AND
           (TG_ARGV[0]='ALL' OR to_jsonb(OLD)->>'modelVersion'='2') THEN
          RAISE EXCEPTION 'immutable business history' USING ERRCODE='42501';
        END IF;
        IF TG_OP='DELETE' THEN RETURN OLD; END IF;
        RETURN NEW;
      END $function$;
    REVOKE ALL ON FUNCTION u3_preserve_immutable() FROM PUBLIC;
  `);
  for (const [model, scope] of [
    ['CommonOfferRevision', 'ALL'],
    ['PurchaseTermsSnapshot', 'ALL'],
    ['CatalogHistory', 'ALL'],
    ['AgreementHistory', 'ALL'],
    ['OrderHistory', 'ALL'],
    ['AgreementApproval', 'ALL'],
    ['CustomerConsent', 'ALL'],
    ['AcceptanceDecision', 'CURRENT'],
    ['OrderChangeApplication', 'ALL'],
  ] as const) {
    const table = tableName(model),
      trigger = 'u3_' + table + '_immutable';
    await manager.query('DROP TRIGGER IF EXISTS ' + quoted(trigger) + ' ON ' + quoted(table));
    await manager.query(
      'CREATE TRIGGER ' +
        quoted(trigger) +
        ' BEFORE UPDATE OR DELETE ON ' +
        quoted(table) +
        " FOR EACH ROW EXECUTE FUNCTION u3_preserve_immutable('" +
        scope +
        "')",
    );
  }
}
export async function migrateU3Models(source: DataSource): Promise<void> {
  requireCondition(
    source.options.type === 'postgres' && source.options.synchronize === false,
    503,
    'UNSAFE_DDL',
    '명시 PostgreSQL DDL 연결과 synchronize=false가 필요합니다.',
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
