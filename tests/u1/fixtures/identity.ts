import { randomBytes, randomUUID } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import type { Audience } from '@oms/contracts';
import type { IdentityProvider, PasswordProof, FactorProof } from '@oms/core';
import { ref } from '@oms/core';
import type { ProtectedStore } from '@oms/persistence';
export const syntheticPassword = randomBytes(24).toString('hex');
export const syntheticFactor = randomBytes(12).toString('hex');
export class SyntheticIdentityProvider implements IdentityProvider {
  readonly kind = 'SYNTHETIC' as const;
  constructor(
    private readonly requiresEnrolment = false,
    private readonly credentials = { password: syntheticPassword, factor: syntheticFactor },
  ) {}
  async password(
    audience: Exclude<Audience, 'SYSTEM'>,
    login: string,
    password: string,
  ): Promise<PasswordProof> {
    requireCondition(
      password === this.credentials.password,
      401,
      'AUTHENTICATION_DENIED',
      '합성 인증 실패',
    );
    return {
      issuer: 'urn:synthetic:identity:' + audience,
      subject: login,
      audience,
      evidenceRefs: [
        {
          owner: 'OperationalAssurance',
          entity: 'OperationalEvidence',
          id: randomUUID(),
          revision: 1,
        },
      ],
      providerHandle: randomUUID(),
      requiresEnrolment: this.requiresEnrolment,
    };
  }
  async factor(proof: PasswordProof, response: string): Promise<FactorProof> {
    requireCondition(response === this.credentials.factor, 401, 'MFA_DENIED', '합성 MFA 실패');
    return {
      issuer: proof.issuer,
      subject: proof.subject,
      audience: proof.audience,
      evidenceRefs: [
        {
          owner: 'OperationalAssurance',
          entity: 'OperationalEvidence',
          id: randomUUID(),
          revision: 1,
        },
      ],
      methodRef: 'synthetic-factor-reference',
      verified: true,
    };
  }
  async beginEnrolment() {
    return { secret: 'SYNTHETIC-NOT-A-REAL-TOTP-SECRET', providerHandle: randomUUID() };
  }
  async completeEnrolment(proof: PasswordProof, response: string) {
    return this.factor(proof, response);
  }
}
export async function seedSyntheticAccount(
  store: ProtectedStore,
  id: string,
  audience: 'CUSTOMER' | 'STAFF',
) {
  const account = {
    accountId: id,
    loginIdentifier: id + '@example.invalid',
    displayName: '합성 ' + id,
    contactAddress: id + '@example.invalid',
    active: true,
    identityBasis: [
      {
        owner: 'OperationalAssurance',
        entity: 'OperationalEvidence',
        id: id + '-basis',
        revision: 1,
      },
    ],
    revision: 1,
  };
  const binding = {
    bindingId: id + '-binding',
    accountRef: ref('Account', account),
    audience,
    issuer: 'urn:synthetic:identity:' + audience,
    subject: id + '@example.invalid',
    generation: 1,
    authRevision: 1,
    active: true,
    removalState: 'CLEAR',
    revision: 1,
  };
  await store.execute(
    {
      principalId: 'synthetic-bootstrap',
      audience: 'SYSTEM',
      owner: 'IdentityRecovery',
      operation: 'synthetic-initial-identity-profile',
      target: null,
      idempotencyKey: id,
      input: { id, audience },
      correlationId: id,
      epoch: await store.currentEpoch(),
    },
    async (transaction) => {
      await transaction.put('Account', account);
      await transaction.put('ProviderBinding', binding);
      await transaction.put('VerifiedPersonLink', {
        personLinkId: id + '-person-link',
        accountRefs: [ref('Account', account)],
        evidenceRefs: account.identityBasis,
        verifiedAt: new Date().toISOString(),
        revision: 1,
      });
    },
  );
  return { account, binding };
}
