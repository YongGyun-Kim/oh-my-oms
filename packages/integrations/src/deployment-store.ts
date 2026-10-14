import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { ExecutionBudget, requireCondition } from '@oms/contracts';
import type { DeploymentAttempt, DeploymentControlStore } from './deployment-control.js';
export function validateDeploymentAttempt(value: unknown): asserts value is DeploymentAttempt {
  requireCondition(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    503,
    'DEPLOYMENT_METADATA',
    '등록된 최소 배포metadata가 필요합니다.',
  );
  const data = value as DeploymentAttempt;
  requireCondition(
    Object.keys(data).sort().join(',') ===
      'attemptId,evidenceFingerprint,incidentId,revision,state,targetImage',
    503,
    'DEPLOYMENT_METADATA',
    '등록된 배포 필드만 허용합니다.',
  );
  for (const id of [data.incidentId, data.attemptId])
    requireCondition(
      typeof id === 'string' && Array.from(id).length >= 1 && Array.from(id).length <= 128,
      503,
      'DEPLOYMENT_ID',
      '원래 사건/시도 ID가 필요합니다.',
    );
  requireCondition(
    Number.isInteger(data.revision) &&
      data.revision >= 1 &&
      typeof data.evidenceFingerprint === 'string' &&
      /^[a-f0-9]{64}$/.test(data.evidenceFingerprint),
    503,
    'DEPLOYMENT_REVISION',
    '원래 배포 근거와 현재 개정을 대조해야 합니다.',
  );
  requireCondition(
    ['CLAIMED', 'APPLIED_UNVERIFIED', 'UNKNOWN', 'MANUAL_REQUIRED'].includes(data.state) &&
      (data.targetImage === null ||
        (typeof data.targetImage === 'string' && /^sha256:[a-f0-9]{64}$/.test(data.targetImage))) &&
      (data.state !== 'MANUAL_REQUIRED' || data.targetImage === null),
    503,
    'DEPLOYMENT_STATE',
    '적용 수락/불명/수동 상태와 정확한 digest를 대조해야 합니다.',
  );
}
export class DynamoDeploymentStore implements DeploymentControlStore {
  readonly kind = 'DYNAMODB' as const;
  constructor(
    private readonly table: string,
    private readonly client = new DynamoDBClient({ region: 'ap-northeast-2', maxAttempts: 1 }),
  ) {
    requireCondition(
      /^[A-Za-z0-9_.-]{3,255}$/.test(table),
      503,
      'DEPLOYMENT_TABLE',
      '별도 서울 운영metadata table이 필요합니다.',
    );
  }
  private signal() {
    return ExecutionBudget.current()?.signalWithin(5000) ?? AbortSignal.timeout(5000);
  }
  async read(incidentId: string, attemptId: string): Promise<DeploymentAttempt | null> {
    for (const id of [incidentId, attemptId])
      requireCondition(
        typeof id === 'string' && Array.from(id).length >= 1 && Array.from(id).length <= 128,
        503,
        'DEPLOYMENT_ID',
        '원래 사건/시도 ID가 필요합니다.',
      );
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.table,
        Key: { incidentId: { S: incidentId }, recordId: { S: 'DEPLOYMENT#' + attemptId } },
        ConsistentRead: true,
      }),
      { abortSignal: this.signal() },
    );
    if (!result.Item) return null;
    const text = result.Item.metadata?.S;
    requireCondition(
      typeof text === 'string' && Buffer.byteLength(text) <= 4096,
      503,
      'DEPLOYMENT_METADATA',
      '유한 배포metadata가 필요합니다.',
    );
    const value: unknown = JSON.parse(text);
    validateDeploymentAttempt(value);
    requireCondition(
      value.incidentId === incidentId &&
        value.attemptId === attemptId &&
        result.Item.revision?.N === String(value.revision),
      503,
      'DEPLOYMENT_IDENTITY',
      '원래 metadata identity가 다릅니다.',
    );
    return value;
  }
  async compareAndSet(value: DeploymentAttempt, expectedRevision: number | null): Promise<void> {
    validateDeploymentAttempt(value);
    requireCondition(
      (expectedRevision === null && value.revision === 1) ||
        (Number.isInteger(expectedRevision) &&
          Number(expectedRevision) >= 1 &&
          value.revision === Number(expectedRevision) + 1),
      409,
      'DEPLOYMENT_REVISION',
      '정확한 이전/다음 개정이 필요합니다.',
    );
    const text = JSON.stringify(value);
    requireCondition(
      Buffer.byteLength(text) <= 4096,
      503,
      'DEPLOYMENT_METADATA',
      '유한 배포metadata가 필요합니다.',
    );
    await this.client.send(
      new PutItemCommand({
        TableName: this.table,
        Item: {
          incidentId: { S: value.incidentId },
          recordId: { S: 'DEPLOYMENT#' + value.attemptId },
          metadata: { S: text },
          revision: { N: String(value.revision) },
        },
        ConditionExpression:
          expectedRevision === null ? 'attribute_not_exists(incidentId)' : 'revision = :revision',
        ...(expectedRevision === null
          ? {}
          : { ExpressionAttributeValues: { ':revision': { N: String(expectedRevision) } } }),
      }),
      { abortSignal: this.signal() },
    );
  }
}
