import type { InvocationTarget } from '@oms/contracts';
export interface OriginalIntent {
  owner: string;
  operation: string;
  target: InvocationTarget;
  clientRequestId: string;
  delivery: 'PREPARING' | 'SENDING' | 'UNKNOWN';
}
const owners = ['EnterpriseAccess', 'ProductCatalog', 'OrderAcceptance', 'NotificationDelivery'];
function valid(value: unknown): value is OriginalIntent {
  if (!value || typeof value !== 'object') return false;
  const row = value as OriginalIntent;
  return (
    Object.keys(row).sort().join(',') === 'clientRequestId,delivery,operation,owner,target' &&
    owners.includes(row.owner) &&
    typeof row.operation === 'string' &&
    row.operation.length > 0 &&
    row.operation.length <= 128 &&
    typeof row.clientRequestId === 'string' &&
    row.clientRequestId.length > 0 &&
    row.clientRequestId.length <= 128 &&
    ['PREPARING', 'SENDING', 'UNKNOWN'].includes(row.delivery) &&
    !!row.target &&
    typeof row.target === 'object' &&
    ['NONE', 'RECORD', 'ENTERPRISE', 'REQUEST', 'CHALLENGE'].includes(row.target.kind) &&
    JSON.stringify(row.target).length <= 4096
  );
}
export class OriginalIntents {
  private key: string | null = null;
  private rows: OriginalIntent[] = [];
  private readonly listeners = new Set<() => void>();
  constructor(
    private readonly storage: () => Storage | undefined = () =>
      typeof sessionStorage === 'undefined' ? undefined : sessionStorage,
  ) {}
  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  snapshot = (): OriginalIntent | null => (this.key ? (this.rows[0] ?? null) : null);
  private emit() {
    for (const listener of this.listeners) listener();
  }
  activate(audience: 'CUSTOMER' | 'STAFF', principalId: string): void {
    if (!principalId || principalId.length > 128)
      throw new Error('검증된 현재 계정 문맥이 필요합니다.');
    const key = 'oms-u1-original:' + audience + ':' + encodeURIComponent(principalId);
    const raw = this.storage()?.getItem(key);
    let rows: unknown = [];
    if (raw) {
      if (raw.length > 65536) throw new Error('원래 요청 참조 크기를 확인하세요.');
      rows = JSON.parse(raw);
    }
    if (!Array.isArray(rows) || rows.length > 64 || !rows.every(valid))
      throw new Error('원래 요청 참조 형식을 확인하세요.');
    this.key = key;
    this.rows = rows.map((row) => ({ ...row, delivery: 'UNKNOWN' }));
    this.emit();
  }
  suspend(): void {
    this.key = null;
    this.rows = [];
    this.emit();
  }
  private persist(): void {
    if (!this.key) throw new Error('현재 계정의 원래 요청 문맥을 먼저 확인하세요.');
    const storage = this.storage();
    if (!storage) throw new Error('현재 브라우저 세션에 원래 요청 참조를 보관할 수 없습니다.');
    const encoded = JSON.stringify(this.rows);
    if (encoded.length > 65536) throw new Error('원래 요청 참조가 유한 크기를 초과했습니다.');
    storage.setItem(this.key, encoded);
  }
  record(row: OriginalIntent): void {
    if (!valid(row) || this.rows.length >= 64)
      throw new Error('남은 원래 요청을 먼저 대조해 주세요.');
    this.rows.push(row);
    try {
      this.persist();
    } catch (error) {
      this.rows.pop();
      throw error;
    }
    this.emit();
  }
  delivery(key: string, state: OriginalIntent['delivery']): void {
    if (!this.rows.some((value) => value.clientRequestId === key)) return;
    this.rows = this.rows.map((row) =>
      row.clientRequestId === key ? { ...row, delivery: state } : row,
    );
    this.persist();
    this.emit();
  }
  resolve(key: string): void {
    const previous = this.rows;
    this.rows = this.rows.filter((value) => value.clientRequestId !== key);
    try {
      this.persist();
    } catch (error) {
      this.rows = previous;
      throw error;
    }
    this.emit();
  }
}
