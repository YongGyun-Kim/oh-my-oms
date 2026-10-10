import type { AnySchema } from 'ajv';
import type {
  Audience,
  InvocationTarget,
  ServiceContext,
  PreIdentityContext,
  LimitedIdentityContext,
} from './types.js';
import { OmsError, requireCondition } from './errors.js';
import { SchemaValidator } from './schema.js';
import type { U2PurposeContext, U2PrivateOperatorContext } from './u2-types.js';

export interface Operation {
  owner: string;
  name: string;
  contract: string;
  version: number;
  audience: Audience[];
  action: string | null;
  kind: 'command' | 'query';
  input: string;
  output: string;
  targetKind: InvocationTarget['kind'];
  targetSchema?: AnySchema;
  context?: string;
}
export interface Invocation {
  context: ServiceContext | PreIdentityContext | LimitedIdentityContext;
  target: InvocationTarget;
  data: unknown;
}
export interface U2Invocation {
  context: U2PurposeContext | U2PrivateOperatorContext;
  target: InvocationTarget;
  data: unknown;
}
export type Handler = (invocation: Invocation | U2Invocation) => Promise<unknown>;
export class OperationRegistry {
  private readonly operations = new Map<string, Operation>();
  private readonly handlers = new Map<string, Handler>();
  constructor(private readonly validator: SchemaValidator) {}
  declare(operation: Operation): void {
    const key = this.key(operation.owner, operation.name, operation.version);
    requireCondition(
      !this.operations.has(key),
      409,
      'DUPLICATE_OPERATION',
      '작업 등록이 중복됐습니다.',
    );
    this.operations.set(key, Object.freeze({ ...operation, audience: [...operation.audience] }));
  }
  bind(owner: string, name: string, version: number, handler: Handler): void {
    const key = this.key(owner, name, version);
    requireCondition(
      this.operations.has(key),
      503,
      'MODULE_NOT_REGISTERED',
      '작업 계약이 등록되지 않았습니다.',
    );
    requireCondition(
      !this.handlers.has(key),
      409,
      'DUPLICATE_BINDING',
      '작업 구현이 중복됐습니다.',
    );
    this.handlers.set(key, handler);
  }
  lookup(owner: string, name: string, version = 2): Operation {
    const operation = this.operations.get(this.key(owner, name, version));
    requireCondition(operation, 503, 'MODULE_NOT_REGISTERED', '작업 계약이 등록되지 않았습니다.');
    return operation;
  }
  async invoke(
    owner: string,
    name: string,
    version: number,
    invocation: Invocation | U2Invocation,
  ): Promise<unknown> {
    const operation = this.lookup(owner, name, version);
    const handler = this.handlers.get(this.key(owner, name, version));
    requireCondition(
      handler,
      503,
      'MODULE_NOT_REGISTERED',
      '확인할 업무 구현이 등록되지 않았습니다.',
    );
    requireCondition(
      operation.audience.includes(invocation.context.audience),
      403,
      'WRONG_AUDIENCE',
      '허용된 접근 경로가 아닙니다.',
    );
    requireCondition(
      operation.targetKind === invocation.target.kind,
      400,
      'TARGET_MISMATCH',
      '작업 대상 형식이 다릅니다.',
    );
    this.validator.validateUri(
      operation.context ?? 'urn:oms:contract:common:2#/$defs/ServiceContext',
      invocation.context,
    );
    if (operation.contract === 'u2-access-additions')
      this.validator.validateUri(
        'urn:oms:contract:u2-access-additions:1#/$defs/InvocationTarget',
        invocation.target,
      );
    else this.validator.validate('InvocationTarget', invocation.target);
    if (operation.targetSchema)
      this.validator.validateSchema(operation.targetSchema, invocation.target);
    this.validator.validateUri(operation.input, invocation.data);
    const result = await handler(invocation);
    try {
      return this.validator.validateUri(operation.output, result);
    } catch (error) {
      if (error instanceof OmsError)
        throw new OmsError(503, 'INVALID_PRODUCER', '작업 결과를 확인할 수 없습니다.');
      throw error;
    }
  }
  private key(owner: string, name: string, version: number): string {
    return `${owner}:${name}:${version}`;
  }
}
