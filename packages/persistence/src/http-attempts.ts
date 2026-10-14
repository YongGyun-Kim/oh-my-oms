import { randomUUID } from 'node:crypto';
import { fingerprint, requireCondition } from '@oms/contracts';
import type { InvocationTarget, ServiceContext } from '@oms/contracts';
import type { DataSource } from 'typeorm';
export interface OriginalRequest {
  owner: string;
  operation: string;
  target: InvocationTarget;
  clientRequestId: string;
}
export const atomicRejectionCodes = new Set([
  'ACTION_DENIED',
  'NOT_FOUND',
  'STAFF_REQUIRED',
  'CUSTOMER_REQUIRED',
  'ENTERPRISE_NOT_ENABLED',
  'STALE_REVISION',
  'STALE_ORGANISATION',
  'STALE_MEMBERSHIP',
  'ORGANISATION_REVISION',
  'GRANT_EXISTS',
  'PERSON_LINK_CHANGED',
  'PARTIAL_CONSENT_UNCONFIRMED',
  'INVALID_INPUT',
  'CREATE_REVISION',
  'PRODUCT_OFFER_CHANGED',
]);
export function originalScopedKey(context: ServiceContext, request: OriginalRequest): string {
  return fingerprint({
    principalId: context.principalId,
    audience: context.audience,
    owner: request.owner,
    operation: request.operation,
    target: request.target,
    key: request.clientRequestId,
  });
}
// Transport execution evidence is not a success Receipt/business record and is never an ACK.
// Crash/expiry/recovery or an unknown technical failure cannot become NOT_ACCEPTED.
export class HttpAttempts {
  constructor(private readonly source: DataSource) {}
  async begin(context: ServiceContext, request: OriginalRequest, epoch: string): Promise<string> {
    const id = randomUUID();
    const key = originalScopedKey(context, request);
    await this.source.transaction(async (manager) => {
      await manager.query(
        'SELECT singleton FROM u1_http_attempt_capacity WHERE singleton=true FOR UPDATE',
      );
      await manager.query(
        "DELETE FROM u1_http_attempt WHERE state='COMMITTED' OR state='REJECTED' AND finished_at<clock_timestamp()-interval '15 minutes'",
      );
      const count = (await manager.query(
        'SELECT count(*)::integer AS count FROM u1_http_attempt',
      )) as { count: number }[];
      requireCondition(
        count[0]!.count < 1000,
        503,
        'HTTP_ATTEMPT_CAPACITY',
        '원래 요청 대조 공간을 먼저 확인해야 합니다.',
      );
      await manager.query(
        "INSERT INTO u1_http_attempt(id,scoped_key,epoch,state,deadline_at) VALUES($1,$2,$3,'RUNNING',$4)",
        [id, key, epoch, context.deadlineAt],
      );
    });
    return id;
  }
  async finish(id: string, rejectedCode: string | null, primaryAtomic: boolean): Promise<void> {
    await this.source.query(
      `UPDATE u1_http_attempt SET state=CASE WHEN EXISTS(SELECT 1 FROM u1_request_key k WHERE k.scoped_key=u1_http_attempt.scoped_key) THEN 'COMMITTED' ELSE $2 END,finished_at=clock_timestamp() WHERE id=$1 AND state='RUNNING'`,
      [
        id,
        primaryAtomic && rejectedCode && atomicRejectionCodes.has(rejectedCode)
          ? 'REJECTED'
          : 'UNKNOWN',
      ],
    );
  }
  async provenNotAccepted(
    context: ServiceContext,
    request: OriginalRequest,
    epoch: string,
  ): Promise<boolean> {
    const rows = (await this.source.query(
      `SELECT count(*) FILTER(WHERE state='REJECTED')::integer AS rejected,count(*) FILTER(WHERE state IN ('RUNNING','UNKNOWN'))::integer AS unresolved FROM u1_http_attempt WHERE scoped_key=$1 AND epoch=$2`,
      [originalScopedKey(context, request), epoch],
    )) as { rejected: number; unresolved: number }[];
    return rows[0]!.rejected > 0 && rows[0]!.unresolved === 0;
  }
}
