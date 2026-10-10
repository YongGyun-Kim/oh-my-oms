import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { Ajv2020 } from 'ajv/dist/2020.js';
import type { FormatsPlugin } from 'ajv-formats';
import type { AnySchema, ValidateFunction } from 'ajv';
import { OmsError } from './errors.js';
import { canonicalJson } from './canonical.js';

const BASE = 'urn:oms:contract:common:2';
// ajv-formats ships CommonJS; use the documented plugin interface across NodeNext interop.
const addFormats = createRequire(import.meta.url)('ajv-formats') as FormatsPlugin;
export class SchemaValidator {
  private readonly ajv = new Ajv2020({
    allErrors: true,
    strictSchema: true,
    strictTypes: false,
    coerceTypes: false,
    removeAdditional: false,
  });
  private readonly compiled = new Map<string, ValidateFunction>();
  private readonly inlineCompiled = new Map<string, ValidateFunction>();
  constructor() {
    addFormats(this.ajv);
    for (const version of [1, 2]) {
      const file = new URL(`../schemas/c00-v${version}.json`, import.meta.url);
      this.ajv.addSchema(JSON.parse(readFileSync(file, 'utf8')) as AnySchema);
    }
    this.ajv.addSchema(
      JSON.parse(
        readFileSync(new URL('../schemas/foundation-v1.json', import.meta.url), 'utf8'),
      ) as AnySchema,
    );
    this.ajv.addSchema(
      JSON.parse(
        readFileSync(new URL('../schemas/u2-access-additions-v1.json', import.meta.url), 'utf8'),
      ) as AnySchema,
    );
  }
  register(schema: AnySchema): void {
    this.ajv.addSchema(schema);
  }
  validateSchema<T>(schema: AnySchema, data: unknown): T {
    // Callers pass closed server-owned schemas, never a request-supplied schema.
    // Ajv's object-identity compile cache otherwise retains a new validator for
    // every row even when the inline contract is identical.
    const key = canonicalJson(schema);
    let validator = this.inlineCompiled.get(key);
    if (!validator) {
      if (this.inlineCompiled.size >= 128)
        throw new OmsError(
          503,
          'SCHEMA_CACHE_LIMIT',
          '등록 계약의 유한 compile 범위를 확인해야 합니다.',
        );
      validator = this.ajv.compile(schema);
      this.inlineCompiled.set(key, validator);
    }
    if (!validator(data))
      throw new OmsError(400, 'INVALID_INPUT', '등록된 계약과 다른 입력입니다.');
    return data as T;
  }
  validate<T>(definition: string, data: unknown, version = 2): T {
    const uri = `${version === 2 ? BASE : 'urn:oms:contract:common:1'}#/$defs/${definition}`;
    return this.validateUri<T>(uri, data);
  }
  validateUri<T>(uri: string, data: unknown): T {
    const validator = this.compiled.get(uri) ?? this.ajv.compile({ $ref: uri });
    this.compiled.set(uri, validator);
    if (!validator(data))
      throw new OmsError(400, 'INVALID_INPUT', '등록된 계약과 다른 입력입니다.');
    return data as T;
  }
}
