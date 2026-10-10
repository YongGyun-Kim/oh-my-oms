import { requireCondition } from '@oms/contracts';
import type { InvocationTarget, Ref } from '@oms/contracts';
import type { Request } from 'express';
import type { ApiRoute } from './routes.js';
export function routeTarget(route: ApiRoute, request: Request): InvocationTarget {
  if (route.target === 'NONE') return { kind: 'NONE' };
  const id = request.params.id;
  requireCondition(
    typeof id === 'string' && id.length > 0 && Array.from(id).length <= 128,
    400,
    'TARGET_ID',
    '작업 대상을 확인하세요.',
  );
  if (route.target === 'REQUEST') return { kind: 'REQUEST', requestId: id };
  if (route.target === 'CHALLENGE') return { kind: 'CHALLENGE', challengeId: id };
  const raw = request.headers['x-target-revision'];
  const revision = raw === undefined && request.method === 'GET' ? 1 : Number(raw);
  requireCondition(
    Number.isSafeInteger(revision) && revision > 0,
    400,
    'TARGET_REVISION',
    '화면에서 확인한 대상 개정이 필요합니다.',
  );
  const value: Ref = {
    owner:
      route.operation === 'readRecordHistory'
        ? String(request.params.recordOwner)
        : route.operation === 'readHistory'
          ? 'OrderAcceptance'
          : route.target === 'ENTERPRISE'
            ? 'EnterpriseAccess'
            : route.owner,
    entity:
      route.operation === 'readRecordHistory'
        ? String(request.params.entity)
        : route.target === 'ENTERPRISE'
          ? 'Enterprise'
          : route.entity!,
    id,
    revision,
  };
  return route.target === 'ENTERPRISE'
    ? { kind: 'ENTERPRISE', enterpriseRef: value }
    : { kind: 'RECORD', recordRef: value };
}
export function routeInput(route: ApiRoute, request: Request, target: InvocationTarget): unknown {
  if (request.method !== 'GET') {
    const data = request.body as Record<string, unknown>;
    requireCondition(
      data && typeof data === 'object' && !Array.isArray(data),
      400,
      'JSON_INPUT',
      'JSON 작업 입력이 필요합니다.',
    );
    const meta = data.meta as { clientRequestId?: string } | undefined;
    if (meta)
      requireCondition(
        request.headers['idempotency-key'] === meta.clientRequestId,
        400,
        'IDEMPOTENCY_HEADER_MISMATCH',
        '원래 요청 키를 확인하세요.',
      );
    const record = data.targetRef as Ref | undefined;
    if (record && target.kind === 'RECORD')
      requireCondition(
        record.id === target.recordRef.id &&
          record.owner === target.recordRef.owner &&
          record.entity === target.recordRef.entity &&
          record.revision === target.recordRef.revision,
        400,
        'PATH_TARGET_MISMATCH',
        '경로와 원래 대상이 다릅니다.',
      );
    if (target.kind === 'CHALLENGE')
      requireCondition(
        data.challengeId === target.challengeId,
        400,
        'PATH_TARGET_MISMATCH',
        '경로와 인증 대상이 다릅니다.',
      );
    return data;
  }
  if (route.operation === 'readCustomerContexts') {
    const keys = [
      'cursor',
      'pageSize',
      'enterpriseRef',
      'departmentCursor',
      'siteCursor',
      'scopeCursor',
    ];
    requireCondition(
      Object.keys(request.query).every((key) => keys.includes(key)),
      400,
      'QUERY_FIELD',
      '등록된 현재문맥 조건만 허용합니다.',
    );
    let enterpriseRef: unknown = null;
    if (request.query.enterpriseRef !== undefined) {
      try {
        enterpriseRef = JSON.parse(String(request.query.enterpriseRef));
      } catch {
        requireCondition(false, 400, 'CONTEXT_QUERY', '현재 기업 참조를 확인하세요.');
      }
    }
    return {
      cursor: request.query.cursor ?? null,
      pageSize: request.query.pageSize === undefined ? 25 : Number(request.query.pageSize),
      enterpriseRef,
      departmentCursor: request.query.departmentCursor ?? null,
      siteCursor: request.query.siteCursor ?? null,
      scopeCursor: request.query.scopeCursor ?? null,
    };
  }
  const allowed = ['lookupOriginalReceipt', 'probeOriginalReceipt'].includes(route.operation)
    ? ['owner', 'operation', 'target', 'clientRequestId']
    : ['cursor', 'pageSize', 'scope', 'status'];
  requireCondition(
    Object.keys(request.query).every((key) => allowed.includes(key)),
    400,
    'QUERY_FIELD',
    '등록된 조회 조건만 사용할 수 있습니다.',
  );
  const cursor = request.query.cursor ?? null;
  const pageSize = request.query.pageSize === undefined ? 25 : Number(request.query.pageSize);
  requireCondition(
    (cursor === null || typeof cursor === 'string') &&
      Number.isInteger(pageSize) &&
      pageSize >= 1 &&
      pageSize <= 100,
    400,
    'QUERY_PAGE',
    '조회 페이지 조건을 확인하세요.',
  );
  if (['lookupOriginalReceipt', 'probeOriginalReceipt'].includes(route.operation)) {
    let originalTarget: unknown;
    try {
      originalTarget = JSON.parse(String(request.query.target));
    } catch {
      requireCondition(false, 400, 'ORIGINAL_TARGET', '원래 요청 대상을 확인하세요.');
    }
    return {
      owner: request.query.owner,
      operation: request.query.operation,
      target: originalTarget,
      clientRequestId: request.query.clientRequestId,
    };
  }
  if (['listApplications', 'listOwnApplications'].includes(route.operation))
    return { status: request.query.status ?? null, cursor, pageSize };
  if (route.operation === 'readReceipt')
    return { requestId: target.kind === 'REQUEST' ? target.requestId : null };
  if (['readApplication', 'readReviewAssessment'].includes(route.operation))
    return { targetRef: target.kind === 'RECORD' ? target.recordRef : null };
  let scope: unknown = null;
  if (request.query.scope !== undefined) {
    requireCondition(
      typeof request.query.scope === 'string' && request.query.scope.length <= 8192,
      400,
      'QUERY_SCOPE',
      '조회 범위를 확인하세요.',
    );
    try {
      scope = JSON.parse(request.query.scope);
    } catch {
      requireCondition(false, 400, 'QUERY_SCOPE', '조회 범위를 확인하세요.');
    }
  }
  return {
    targetRef:
      target.kind === 'ENTERPRISE'
        ? target.enterpriseRef
        : target.kind === 'RECORD'
          ? target.recordRef
          : null,
    scope,
    cursor,
    pageSize,
    sourceRevision: null,
  };
}
