import type {
  ActionScope,
  CommandMeta,
  Receipt,
  Ref,
  ServiceContext,
  TargetScope,
} from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { Commands } from './commands.js';
import type { EnterpriseVerification } from './enterprise-verification.js';
import type { PurposeVerifier } from './purpose-verifier.js';
import type { PurposeSecretVault } from '@oms/persistence';
import type { EnrollmentAuthorities } from './enrollment-authority.js';
export interface EnterpriseU2Runtime {
  readonly verifier: PurposeVerifier;
  readonly vault: PurposeSecretVault;
  readonly authorities: EnrollmentAuthorities;
}
export interface EnterpriseInput {
  meta: CommandMeta;
  legalName: string;
  registrationEvidenceRefs: Ref[];
  designatedContact: string;
}
export interface EnterpriseDecision {
  meta: CommandMeta;
  targetRef: Ref;
  decision: 'APPROVE' | 'DECLINE';
  basisRefs: Ref[];
}
export interface InitialAdministratorInput {
  meta: CommandMeta;
  accountRef: Ref;
  basisRefs: Ref[];
  label: string;
  actionScopes: ActionScope[];
}
export interface EnterpriseInternal {
  readonly store: ProtectedStore;
  readonly verification: EnterpriseVerification;
  readonly now: () => Date;
  readonly authorization: Authorization;
  readonly commands: Commands;
  apply(context: ServiceContext, input: EnterpriseInput): Promise<Receipt>;
  approve(context: ServiceContext, input: EnterpriseDecision): Promise<Receipt>;
  designate(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: InitialAdministratorInput,
  ): Promise<Receipt>;
  validateScope(
    scope: ActionScope,
    enterpriseId: string,
    transaction?: ProtectedTransaction,
  ): Promise<void>;
  createRole(
    transaction: ProtectedTransaction,
    enterpriseRef: Ref,
    memberRef: Ref,
    label: string,
    scopes: ActionScope[],
    actor: Ref,
  ): Promise<Ref[]>;
  setOrderingPolicy(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: {
      meta: CommandMeta;
      departmentUsage: 'USED' | 'NOT_USED';
      siteUsage: 'USED' | 'NOT_USED';
    },
  ): Promise<Receipt>;
  managementTarget(enterprise: ModelData): TargetScope;
  defineCustomerRole(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: { meta: CommandMeta; label: string; actionScopes: ActionScope[] },
  ): Promise<Receipt>;
  grantCustomerRole(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: { meta: CommandMeta; accountRef: Ref; roleRef: Ref; decision: 'GRANT' | 'REVOKE' },
  ): Promise<Receipt>;
  readApplication(context: ServiceContext, id: string): Promise<unknown>;
}
