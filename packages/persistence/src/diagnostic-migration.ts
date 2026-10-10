import type { DataSource } from 'typeorm';
// Metadata-only view: no recovery payload, business JSON, credentials, codes or provider token.
// The migration principal grants SELECT explicitly to a separately prepared read-only role.
export async function migrateDiagnosticView(source: DataSource): Promise<void> {
  await source.transaction(async (manager) => {
    await manager.query('SET LOCAL ROLE u1_owner');
    await manager.query(`CREATE OR REPLACE VIEW u1_diagnostic_metadata WITH (security_barrier=true) AS
      WITH visible AS (SELECT DISTINCT ON(v.model,v.id) v.model,v.id,v.revision,v.data,v.deleted
        FROM u1_entity_version v JOIN u1_protected_prefix p ON v.epoch=p.epoch AND v.commit_order<=p.commit_order
        JOIN u1_epoch_sequence e ON e.epoch=v.epoch ORDER BY v.model,v.id,e.generation DESC,v.commit_order DESC)
      SELECT v.model,v.id,v.revision,
        CASE WHEN v.model='FactEnvelope' THEN v.data->>'sourceOwner' ELSE v.data->>'owner' END AS owner,
        COALESCE(v.data->>'requestId',v.data->>'causationRequestId') AS request_id,
        COALESCE(v.data->>'occurredAt',v.data->>'acceptedAt',r.data->>'acceptedAt') AS occurred_at,
        COALESCE(v.data->>'state',v.data->>'requestState') AS state
      FROM visible v LEFT JOIN visible r ON r.model='RequestReceipt' AND r.id=COALESCE(v.data->>'requestId',v.data->>'causationRequestId') AND NOT r.deleted
      WHERE NOT v.deleted AND (v.model IN ('RequestReceipt','FactEnvelope','WorkItem') OR v.model LIKE '%History');
      REVOKE ALL ON u1_diagnostic_metadata FROM PUBLIC;`);
  });
}
