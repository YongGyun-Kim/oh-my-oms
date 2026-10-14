import { DynamoDBClient, GetItemCommand, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { ExecutionBudget, requireCondition } from '@oms/contracts';
import { validateIncident } from './incident-types.js';
import type { Incident, IncidentStore } from './incident-types.js';
export class DynamoIncidentStore implements IncidentStore {
  readonly kind = 'DYNAMODB' as const;
  constructor(
    private readonly table: string,
    private readonly client = new DynamoDBClient({ region: 'ap-northeast-2', maxAttempts: 1 }),
  ) {
    requireCondition(
      /^[A-Za-z0-9_.-]{3,255}$/.test(table),
      503,
      'OPERATION_TABLE',
      '서울의 별도 운영 metadata table이 필요합니다.',
    );
  }
  private signal() {
    return ExecutionBudget.current()?.signalWithin(5000) ?? AbortSignal.timeout(5000);
  }
  async read(id: string): Promise<Incident | null> {
    requireCondition(
      typeof id === 'string' && Array.from(id).length >= 1 && Array.from(id).length <= 128,
      503,
      'INCIDENT_ID',
      '원래 사건 ID가 필요합니다.',
    );
    const result = await this.client.send(
      new GetItemCommand({
        TableName: this.table,
        Key: { incidentId: { S: id }, recordId: { S: 'STATE' } },
        ConsistentRead: true,
      }),
      { abortSignal: this.signal() },
    );
    if (!result.Item) return null;
    const text = result.Item.metadata?.S;
    requireCondition(
      typeof text === 'string' && Buffer.byteLength(text) <= 65536,
      503,
      'INCIDENT_METADATA',
      '유한 운영metadata가 필요합니다.',
    );
    const data: unknown = JSON.parse(text);
    validateIncident(data);
    requireCondition(
      data.incidentId === id && result.Item.revision?.N === String(data.revision),
      503,
      'INCIDENT_METADATA',
      '원래 metadata identity/개정이 다릅니다.',
    );
    return data;
  }
  async compareAndSet(value: Incident, expectedRevision: number | null): Promise<void> {
    validateIncident(value);
    requireCondition(
      (expectedRevision === null && value.revision === 1) ||
        (Number.isInteger(expectedRevision) &&
          Number(expectedRevision) >= 1 &&
          value.revision === Number(expectedRevision) + 1),
      409,
      'INCIDENT_REVISION',
      '정확한 이전/다음 metadata 개정이 필요합니다.',
    );
    const text = JSON.stringify(value);
    requireCondition(
      Buffer.byteLength(text) <= 65536,
      503,
      'INCIDENT_LIMIT',
      '운영metadata 크기가 초과되었습니다.',
    );
    await this.client.send(
      new PutItemCommand({
        TableName: this.table,
        Item: {
          incidentId: { S: value.incidentId },
          recordId: { S: 'STATE' },
          revision: { N: String(value.revision) },
          metadata: { S: text },
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
