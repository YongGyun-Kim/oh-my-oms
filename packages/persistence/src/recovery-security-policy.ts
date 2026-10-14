import { canonicalJson } from '@oms/contracts';
import { modelDefinition } from './model-catalog.js';
import type { ModelData } from './model-catalog.js';
import { U2_SECURITY_MODELS, u2RecoverySecurityChangeAllowed } from './u2-security-state.js';
export const RECOVERY_SECURITY_MODELS = Object.freeze([
  'Account',
  'VerifiedPersonLink',
  'ProviderBinding',
  'MfaEnrollment',
  'RecoveryCodeSet',
  'Enterprise',
  'EnterpriseMembership',
  'Department',
  'BusinessSite',
  'CustomerRole',
  'ActionScope',
  'CustomerRoleGrant',
  'StaffRole',
  'StaffRoleGrant',
  ...U2_SECURITY_MODELS,
]);
function sameExcept(model: string, left: ModelData, right: ModelData, ignored: string[]): boolean {
  const fields = modelDefinition(model).attributes.filter((field) => !ignored.includes(field.name));
  const projection = (data: ModelData) =>
    Object.fromEntries(
      fields
        .filter(
          (field) =>
            data[field.name] !== undefined && (field.required || data[field.name] !== null),
        )
        .map((field) => [field.name, data[field.name]]),
    );
  return canonicalJson(projection(left)) === canonicalJson(projection(right));
}
export function canonicalSecurityData(model: string, data: ModelData): ModelData {
  return Object.fromEntries(
    modelDefinition(model)
      .attributes.filter(
        (field) => data[field.name] !== undefined && (field.required || data[field.name] !== null),
      )
      .map((field) => [field.name, data[field.name]]),
  );
}
export function recoverySecurityChangeAllowed(
  model: string,
  previous: ModelData,
  current: ModelData,
): boolean {
  if (!RECOVERY_SECURITY_MODELS.includes(model)) return false;
  if (U2_SECURITY_MODELS.includes(model))
    return u2RecoverySecurityChangeAllowed(model, previous, current);
  switch (model) {
    case 'Account':
      return (
        !(previous.active === false && current.active === true) &&
        sameExcept(model, previous, current, ['revision', 'active'])
      );
    case 'Department':
    case 'BusinessSite':
      return (
        !(previous.active === false && current.active === true) &&
        sameExcept(model, previous, current, ['revision', 'active', 'label'])
      );
    case 'EnterpriseMembership':
      return (
        !(previous.active === false && current.active === true) &&
        !(previous.administrator === false && current.administrator === true) &&
        sameExcept(model, previous, current, ['revision', 'active', 'administrator'])
      );
    case 'Enterprise':
      return (
        !(previous.usageEnabled === false && current.usageEnabled === true) &&
        (current.approvalState === previous.approvalState || current.usageEnabled === false) &&
        sameExcept(model, previous, current, ['revision', 'usageEnabled', 'approvalState'])
      );
    case 'CustomerRoleGrant':
    case 'StaffRoleGrant':
      return (
        !(previous.revokedAt !== null && current.revokedAt === null) &&
        sameExcept(model, previous, current, ['revision', 'revokedAt'])
      );
    case 'MfaEnrollment':
      return (
        !(previous.state !== 'VERIFIED' && current.state === 'VERIFIED') &&
        sameExcept(model, previous, current, ['revision', 'state'])
      );
    case 'ProviderBinding':
      return (
        !(previous.active === false && current.active === true) &&
        !(previous.removalState === 'COMPLETED' && current.removalState !== 'COMPLETED') &&
        Number(current.generation) >= Number(previous.generation) &&
        Number(current.authRevision) >= Number(previous.authRevision) &&
        sameExcept(model, previous, current, [
          'revision',
          'active',
          'generation',
          'authRevision',
          'removalState',
        ])
      );
    case 'RecoveryCodeSet': {
      if (
        (previous.invalidated === true && current.invalidated !== true) ||
        (previous.confirmed === false && current.confirmed === true) ||
        !sameExcept(model, previous, current, ['revision', 'invalidated', 'confirmed', 'verifiers'])
      )
        return false;
      const before = previous.verifiers as { digest: string; usedAt: string | null }[],
        after = current.verifiers as { digest: string; usedAt: string | null }[];
      return (
        before.length === after.length &&
        before.every(
          (value, index) =>
            value.digest === after[index]!.digest &&
            (value.usedAt === null || value.usedAt === after[index]!.usedAt),
        )
      );
    }
    default:
      return sameExcept(model, previous, current, ['revision']);
  }
}
