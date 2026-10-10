import { canonicalJson } from '@oms/contracts';
import type { ModelData } from './model-catalog.js';
import { U2_MODELS } from './u2-model-catalog.js';
export const U2_SECURITY_MODELS = Object.freeze(U2_MODELS.map((model) => model.name));
function unchanged(previous: ModelData, current: ModelData, allowed: string[]): boolean {
  const project = (data: ModelData) =>
    Object.fromEntries(
      Object.entries(data).filter(([key]) => !['revision', ...allowed].includes(key)),
    );
  return canonicalJson(project(previous)) === canonicalJson(project(current));
}
// Independent current-owner observations may REMOVE authority during restore.
// Ordinary business creation/resumption still uses its own protected command.
export function u2RecoverySecurityChangeAllowed(
  model: string,
  previous: ModelData,
  current: ModelData,
): boolean {
  if (!U2_SECURITY_MODELS.includes(model)) return false;
  if (model === 'AccountSecurityState')
    return (
      Number(current.securityGeneration) >= Number(previous.securityGeneration) &&
      unchanged(previous, current, ['securityGeneration'])
    );
  if (model === 'EnterpriseAccessFence')
    return (
      Number(current.accessRevision) >= Number(previous.accessRevision) &&
      unchanged(previous, current, ['accessRevision'])
    );
  if (model === 'StaffAuthorityFence')
    return (
      Number(current.authorityRevision) >= Number(previous.authorityRevision) &&
      unchanged(previous, current, ['authorityRevision'])
    );
  if (model === 'RoleRevisionState')
    return (
      !(previous.active === false && current.active === true) &&
      unchanged(previous, current, ['active'])
    );
  if (model === 'RecoveryHandoffGrant')
    return (
      Number(current.attemptCount) >= Number(previous.attemptCount) &&
      Number(current.attemptCount) <= 5 &&
      (current.state === previous.state ||
        (previous.state === 'ISSUED' &&
          ['EXPIRED', 'EXHAUSTED', 'REVOKED'].includes(String(current.state)))) &&
      unchanged(previous, current, ['state', 'attemptCount'])
    );
  const restrictive: Record<string, string[]> = {
    MembershipInvitation: ['REVOKED', 'EXPIRED', 'RECONFIRMATION_REQUIRED'],
    PartyClaimContext: ['REVOKED'],
    EnrollmentAuthority: ['EXPIRED', 'REVOKED', 'HOLD'],
    RecoveryCase: ['HOLD', 'CLOSED'],
    EmergencyRecoveryCase: ['HOLD', 'CLOSED'],
    AdministratorRestoration: ['HOLD', 'REJECTED', 'CLOSED'],
    RegisteredContact: ['UNCONFIRMED', 'REVOKED'],
    VerificationEvidence: ['REVOKED', 'UNCONFIRMED'],
    PersonVerification: ['UNCONFIRMED', 'CONFLICT', 'REVOKED'],
  };
  if (restrictive[model]) {
    const terminal = [
      'CLAIMED',
      'COMPLETED',
      'CLOSED',
      'ACCEPTED',
      'APPLIED',
      'REVOKED',
      'EXPIRED',
      'EXHAUSTED',
      'REJECTED',
    ];
    const state =
      current.state === previous.state ||
      (!terminal.includes(String(previous.state)) &&
        restrictive[model]!.includes(String(current.state)));
    return state && unchanged(previous, current, ['state', 'holdReason']);
  }
  if (model === 'VerificationPolicy' || model === 'EmergencyOperatorAuthority')
    return (
      !(previous.active === false && current.active === true) &&
      unchanged(previous, current, ['active'])
    );
  // UNKNOWN/provider operation slots, receipts and tombstones are immutable
  // here: restoring authentication never infers an old external effect ended.
  return unchanged(previous, current, []);
}
