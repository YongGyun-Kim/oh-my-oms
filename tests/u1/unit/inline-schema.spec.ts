import { describe, expect, it } from 'vitest';
import { SchemaValidator } from '@oms/contracts';
describe('닫힌 inline 계약의 유한 canonical compile 재사용', () => {
  it('동일 계약의 새 객체10000개를 저장 행마다 다시 compile하지 않는다', () => {
    const validator = new SchemaValidator();
    for (let index = 0; index < 10000; index++)
      expect(validator.validateSchema({ type: 'integer', minimum: 1 }, 1)).toBe(1);
  });
  it('키 순서가 다른 같은 계약도 일관된 검증을 한다', () => {
    const validator = new SchemaValidator();
    validator.validateSchema({ type: 'integer', minimum: 1 }, 1);
    expect(validator.validateSchema({ minimum: 1, type: 'integer' }, 2)).toBe(2);
  });
  it('다른 계약은 같은 입력에도 기존 validator를 잘못 재사용하지 않는다', () => {
    const validator = new SchemaValidator();
    validator.validateSchema({ type: 'integer', minimum: 1 }, 2);
    expect(() => validator.validateSchema({ type: 'integer', minimum: 3 }, 2)).toThrow();
  });
  it('required/unknown 입력 거절은 재사용 후에도 유지한다', () => {
    const validator = new SchemaValidator();
    const schema = {
      type: 'object',
      required: ['a'],
      properties: { a: { type: 'string' } },
      additionalProperties: false,
    };
    validator.validateSchema(schema, { a: 'value' });
    for (const value of [{}, { a: 'value', b: true }, { a: null }])
      expect(() => validator.validateSchema({ ...schema }, value)).toThrow();
  });
  it('타입을 강제 변환하거나 오류 필드를 삭제하지 않는다', () => {
    const validator = new SchemaValidator();
    expect(() => validator.validateSchema({ type: 'integer' }, '1')).toThrow();
    const value = { a: 'x', unknown: true };
    expect(() =>
      validator.validateSchema(
        { type: 'object', properties: { a: { type: 'string' } }, additionalProperties: false },
        value,
      ),
    ).toThrow();
    expect(value.unknown).toBe(true);
  });
  it('등록된 canonical Ref의 closure도 그대로 검사한다', () => {
    const validator = new SchemaValidator();
    expect(() =>
      validator.validateSchema(
        { $ref: 'urn:oms:contract:common:2#/$defs/Ref' },
        { owner: 'Unknown', entity: 'Order', id: 'one', revision: 1 },
      ),
    ).toThrow();
  });
  it('서로 다른 inline 계약129개는 메모리 상한에서 fail closed한다', () => {
    const validator = new SchemaValidator();
    for (let i = 0; i < 128; i++) validator.validateSchema({ type: 'integer', minimum: i }, i);
    expect(() => validator.validateSchema({ type: 'integer', minimum: 128 }, 128)).toThrow(
      'compile',
    );
    expect(validator.validateSchema({ type: 'integer', minimum: 0 }, 0)).toBe(0);
  });
  it('같은$id에 다른 내용을 넣어 기존 등록을 조용히 바꾸지 않는다', () => {
    const validator = new SchemaValidator();
    validator.validateSchema({ $id: 'urn:oms:inline:test', type: 'integer' }, 1);
    expect(() =>
      validator.validateSchema({ $id: 'urn:oms:inline:test', type: 'string' }, 'one'),
    ).toThrow();
    expect(validator.validateSchema({ $id: 'urn:oms:inline:test', type: 'integer' }, 2)).toBe(2);
  });
});
