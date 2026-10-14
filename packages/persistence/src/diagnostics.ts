import type { DataSource } from 'typeorm';
import { requireCondition, SchemaValidator } from '@oms/contracts';
import type { Ref } from '@oms/contracts';
import { modelDefinition } from './model-catalog.js';
export interface DiagnosticRequest {
  owner: string;
  requestRefs: string[];
  factRefs: Ref[];
  from: string;
  to: string;
}
export interface AckObservation {
  requestRefs: string[];
  observedAt: string;
  complete: boolean;
}
export interface IndependentAcknowledgements {
  observe(request: DiagnosticRequest): Promise<AckObservation>;
}
interface Metadata {
  model: string;
  id: string;
  revision: string;
  owner: string;
  request_id: string;
  occurred_at: string | null;
  state: string | null;
}
// C19 internal read port. Database role and owner profile are server configuration,
// not a caller's claim. No public HTTP operation or business-write handler is bound.
export class OwnerDiagnostics {
  private readonly schema = new SchemaValidator();
  constructor(
    private readonly source: DataSource,
    private readonly expectedRole: string,
    private readonly allowedOwners: ReadonlySet<string>,
    private readonly acknowledgements?: IndependentAcknowledgements,
  ) {}
  async read(input: DiagnosticRequest): Promise<unknown> {
    this.schema.validate('DiagnosticInput', input);
    requireCondition(
      this.allowedOwners.has(input.owner) &&
        input.requestRefs.length > 0 &&
        input.requestRefs.length <= 100 &&
        input.factRefs.length <= 64 &&
        Date.parse(input.from) <= Date.parse(input.to),
      403,
      'DIAGNOSTIC_SCOPE',
      '등록된 대조 소유자·원래 접수·기간 범위가 필요합니다.',
    );
    const runner = this.source.createQueryRunner();
    await runner.connect();
    try {
      await runner.startTransaction('REPEATABLE READ');
      await runner.query('SET TRANSACTION READ ONLY');
      await runner.query("SET LOCAL statement_timeout='2000ms'; SET LOCAL lock_timeout='1000ms'");
      const admitted = async () => {
        const rows = await runner.query(`SELECT current_user AS role,
          has_table_privilege(current_user,'u1_diagnostic_metadata','SELECT') AS readable,
          EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') AND has_table_privilege(current_user,c.oid,'INSERT,UPDATE,DELETE,TRUNCATE')) AS writable`);
        requireCondition(
          rows[0]?.role === this.expectedRole && rows[0].readable && !rows[0].writable,
          403,
          'DIAGNOSTIC_READER_REQUIRED',
          '현재 등록된 읽기 전용 대조 역할이 필요합니다.',
        );
      };
      await admitted();
      const rows = (await runner.query(
        `SELECT model,id,revision,owner,request_id,occurred_at,state FROM u1_diagnostic_metadata WHERE owner=$1 AND request_id=ANY($2::text[]) AND occurred_at::timestamptz >= $3::timestamptz AND occurred_at::timestamptz <= $4::timestamptz ORDER BY model,id LIMIT 101`,
        [input.owner, input.requestRefs, input.from, input.to],
      )) as Metadata[];
      await admitted();
      await runner.commitTransaction();
      const page = rows.slice(0, 100);
      const refs = (predicate: (row: Metadata) => boolean): Ref[] =>
        page
          .filter(predicate)
          .slice(0, 64)
          .map((row) => ({
            owner: modelDefinition(row.model).owner,
            entity: row.model,
            id: row.id,
            revision: Number(row.revision),
          }));
      const storedReceiptRefs = refs((row) => row.model === 'RequestReceipt');
      const committedFactRefs = refs((row) => row.model === 'FactEnvelope');
      const pendingWorkRefs = refs((row) => row.model === 'WorkItem' && row.state !== 'COMPLETED');
      const historyRefs = refs((row) => row.model.endsWith('History'));
      const limitations = [
        '업무 원본·기업 확인·신원/MFA·외부 효과의 승인 근거로 사용할 수 없는 기술 대조입니다.',
        '현재 epoch/prefix, 처리 효과, 파기 및 정정의 독립 증거는 별도 대조가 필요합니다.',
      ];
      if (
        rows.length > 100 ||
        [storedReceiptRefs, committedFactRefs, pendingWorkRefs, historyRefs].some(
          (refs) => refs.length === 64,
        )
      )
        limitations.push('유한 출력 범위를 넘어선 원본은 추가 범위 대조가 필요합니다.');
      const missing = input.requestRefs.filter(
        (id) => !storedReceiptRefs.some((ref) => ref.id === id),
      );
      if (missing.length)
        limitations.push(
          '요청 범위 중 보호 Receipt를 현재 기간·소유자에서 확인하지 못한 원래 접수가 있습니다.',
        );
      const ack = await this.acknowledgements?.observe(input);
      if (!ack || !ack.complete)
        limitations.push(
          '독립 성공 ACK 관찰 증거가 없거나 불완전합니다. 저장된 Receipt를 성공 ACK로 간주하지 않습니다.',
        );
      for (const fact of input.factRefs)
        if (
          !committedFactRefs.some(
            (ref) =>
              ref.id === fact.id &&
              ref.revision === fact.revision &&
              ref.owner === fact.owner &&
              ref.entity === fact.entity,
          )
        )
          limitations.push('요청한 사실 참조를 현재 대조 범위에서 확인하지 못했습니다.');
      return this.schema.validate('DiagnosticView', {
        owner: input.owner,
        acknowledgedRequestRefs:
          ack?.requestRefs.filter((id) => input.requestRefs.includes(id)).slice(0, 100) ?? [],
        storedReceiptRefs,
        committedFactRefs,
        pendingWorkRefs,
        historyRefs,
        correctionRefs: [],
        coverage: page.length ? 'PARTIAL' : 'UNAVAILABLE',
        observedAt: new Date().toISOString(),
        limitations,
      });
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }
}
