import { SchemaValidator, requireCondition } from '@oms/contracts';
import type { EntityManager } from 'typeorm';
import { U4_PERSISTENCE_MODELS } from './u4-model-catalog.js';
import {
  primaryAttribute,
  storedModelData,
  tableName,
  validateModel,
  type ModelData,
} from './model-catalog.js';
import { u4IdentityClaimId } from './u4-model-decoder.js';

const indexes = [
  'u4_payment_identity',
  'u4_refund_identity',
  'u4_obligation_invoice',
  'u4_order_line_position',
  'u4_purchase_snapshot_order',
];
// Called under the restore fence before writers open; absence never creates new cash.
export async function verifyU4RecoveryState(manager: EntityManager): Promise<void> {
  const found = await manager.query(
    'SELECT indexname FROM pg_indexes WHERE schemaname=current_schema() AND indexname=ANY($1::text[])',
    [indexes],
  );
  requireCondition(
    found.length === indexes.length,
    503,
    'U4_RECOVERY_CONSTRAINTS',
    '금융 복구의 모든 유일 제약을 확인해야 합니다.',
  );
  const schema = new SchemaValidator();
  for (const model of U4_PERSISTENCE_MODELS) {
    const key = primaryAttribute(model).name;
    let cursor: string | null = null;
    for (;;) {
      const page: ModelData[] = await manager.query(
        'SELECT * FROM "' +
          tableName(model.name) +
          '" WHERE ($1::text IS NULL OR "' +
          key +
          '" > $1) ORDER BY "' +
          key +
          '" LIMIT 100',
        [cursor],
      );
      for (const raw of page) {
        for (const attribute of model.attributes) {
          if (['Revision', 'PositiveInteger'].includes(attribute.type))
            raw[attribute.name] = Number(raw[attribute.name]);
          const value = raw[attribute.name];
          if (attribute.type === 'Instant' && value instanceof Date)
            raw[attribute.name] = value.toISOString();
        }
        const data = storedModelData(model.name, raw);
        validateModel(model.name, data, schema);
        if (model.name === 'PaymentEvidence' && data.identity !== null) {
          const identity = data.identity as {
            sourceNamespace: string;
            canonicalIdentity: string;
            aliases: string[];
          };
          for (const alias of [identity.canonicalIdentity, ...identity.aliases]) {
            const claim = await manager
              .getRepository<ModelData>('FinancialIdentityClaim')
              .findOneBy({ claimId: u4IdentityClaimId(identity.sourceNamespace, alias) });
            requireCondition(
              claim &&
                claim.canonicalPaymentId === data.paymentEvidenceId &&
                claim.sourceNamespace === identity.sourceNamespace &&
                claim.canonicalIdentity === alias,
              503,
              'U4_RECOVERY_IDENTITY',
              '원래 금융 식별/별칭 예약이 누락되거나 충돌합니다.',
            );
          }
        }
      }
      if (page.length < 100) break;
      cursor = String(page.at(-1)![key]);
    }
  }
  const missing = await manager.query(`
    SELECT p."paymentEvidenceId" FROM u1_payment_evidence p
    LEFT JOIN u1_financial_payment_binding b ON b."paymentId"=p."paymentEvidenceId"
    LEFT JOIN u1_financial_payment_balance s ON s."paymentId"=p."paymentEvidenceId"
    WHERE p.lifecycle='CONFIRMED' AND (b."paymentId" IS NULL OR s."paymentId" IS NULL OR b."orderRef" IS DISTINCT FROM p."boundOrderRef" OR s.principal IS DISTINCT FROM p.amount) LIMIT 1`);
  requireCondition(
    missing.length === 0,
    503,
    'U4_RECOVERY_BINDING',
    '입금 연결/원금 집계의 보호 원상을 대조해야 합니다.',
  );
  const allocation = await manager.query(`
    WITH totals AS (SELECT "paymentEvidenceRef"->>'id' AS id, sum((amount->>'value')::numeric) AS amount FROM u1_payment_allocation WHERE effect='APPLIED' GROUP BY "paymentEvidenceRef"->>'id')
    SELECT b."paymentId" FROM u1_financial_payment_balance b LEFT JOIN totals t ON t.id=b."paymentId"
    WHERE (b."allocatedPrincipal"->>'value')::numeric<>COALESCE(t.amount,0) LIMIT 1`);
  requireCondition(
    allocation.length === 0,
    503,
    'U4_RECOVERY_AGGREGATE',
    '전체 배분 원본과 집계가 다릅니다.',
  );
  const refund = await manager.query(
    'SELECT c."refundCaseId" FROM u1_refund_case c LEFT JOIN u1_financial_approval_balance b ON b."approvalRootId"=c."approvalRootId" WHERE b."approvalRootId" IS NULL LIMIT 1',
  );
  requireCondition(
    refund.length === 0,
    503,
    'U4_RECOVERY_APPROVAL',
    '환불 공통 승인 root의 보호 원상이 누락되었습니다.',
  );
  const reservation = await manager.query(`
    WITH portions AS (
      SELECT c."approvalRootId" AS root, p.value->'paymentEvidenceRef'->>'id' AS payment,
        p.value->'allocationRef' IS DISTINCT FROM 'null'::jsonb AS allocated,
        (p.value->'currentResult'->'succeeded'->>'value')::numeric AS success,
        (p.value->'currentResult'->'unknown'->>'value')::numeric+(p.value->'currentResult'->'pending'->>'value')::numeric AS reserved
      FROM u1_refund_case c CROSS JOIN jsonb_array_elements(c.portions) p
    ), roots AS (SELECT root,sum(success) AS success,sum(reserved) AS reserved FROM portions GROUP BY root),
    payments AS (SELECT payment,sum(success) FILTER(WHERE allocated) AS ra,sum(success) FILTER(WHERE NOT allocated) AS ru,sum(reserved) FILTER(WHERE allocated) AS ha,sum(reserved) FILTER(WHERE NOT allocated) AS hu FROM portions GROUP BY payment)
    SELECT 'approval' AS kind FROM u1_financial_approval_balance b LEFT JOIN roots r ON r.root=b."approvalRootId" WHERE (b.confirmed->>'value')::numeric<>COALESCE(r.success,0) OR (b.reserved->>'value')::numeric<>COALESCE(r.reserved,0)
    UNION ALL SELECT 'payment' AS kind FROM u1_financial_payment_balance b LEFT JOIN payments p ON p.payment=b."paymentId" WHERE
      (b."allocatedRefunded"->>'value')::numeric<>COALESCE(p.ra,0) OR (b."unallocatedRefunded"->>'value')::numeric<>COALESCE(p.ru,0) OR (b."allocatedReserved"->>'value')::numeric<>COALESCE(p.ha,0) OR (b."unallocatedReserved"->>'value')::numeric<>COALESCE(p.hu,0) LIMIT 1`);
  requireCondition(
    reservation.length === 0,
    503,
    'U4_RECOVERY_RESERVATION',
    '환불 부분 원상과 공통 원금/승인 예약 집계가 다릅니다.',
  );
}
