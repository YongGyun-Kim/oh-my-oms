import { readFileSync } from 'node:fs';
import type { Operation, OperationRegistry } from './registry.js';

// Profile revision and operation-registry version are separate axes.
export const U3_PROFILE = 'urn:oms:contract:u3-commercial:2';
export const U3_REGISTRY_VERSION = 3;
export function declareU3Operations(registry: OperationRegistry): void {
  const operations = JSON.parse(
    readFileSync(new URL('../schemas/u3-operations-v2.json', import.meta.url), 'utf8'),
  ) as Operation[];
  for (const operation of operations) registry.declare(operation);
}
// 업무31개와 구분한 기존 C01 grant 및 접수 조회 소비자의 버전 연결이다.
export function declareU3HostOperations(registry: OperationRegistry): void {
  for (const [name, input, targetKind, action] of [
    ['grantStaffRole', 'RoleGrantInput', 'NONE', 'staff.role.manage'],
    ['grantCustomerRole', 'RoleGrantInput', 'ENTERPRISE', 'role.manage'],
  ] as const)
    registry.declare({
      owner: 'EnterpriseAccess',
      name,
      contract: 'u3-commercial',
      version: 3,
      audience: [name === 'grantStaffRole' ? 'STAFF' : 'CUSTOMER'],
      action,
      kind: 'command',
      input: 'urn:oms:contract:common:2#/$defs/' + input,
      output: U3_PROFILE + '#/$defs/Receipt',
      targetKind,
    });
  for (const [name, input, output, targetKind] of [
    ['readReceipt', 'urn:oms:contract:common:2#/$defs/ReceiptReadRequest', 'Receipt', 'REQUEST'],
    [
      'lookupOriginalReceipt',
      'urn:oms:contract:foundation:1#/$defs/OriginalReceiptLookup',
      'Receipt',
      'NONE',
    ],
    [
      'probeOriginalReceipt',
      'urn:oms:contract:foundation:1#/$defs/OriginalReceiptLookup',
      'OriginalReceiptProbe',
      'NONE',
    ],
  ] as const)
    registry.declare({
      owner: 'WorkInquiry',
      name,
      contract: 'u3-commercial',
      version: 3,
      audience: ['CUSTOMER', 'STAFF'],
      action: null,
      kind: 'query',
      input,
      output: U3_PROFILE + '#/$defs/' + output,
      targetKind,
    });
}
