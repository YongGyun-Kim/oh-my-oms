import type {
  ActionScope,
  CommandMeta,
  Receipt,
  Ref,
  ServiceContext,
  TargetScope,
} from '@oms/contracts';
import { requireCondition } from '@oms/contracts';
import type { ModelData, ProtectedStore, ProtectedTransaction } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { Commands } from './commands.js';
import {
  EnterpriseDecision,
  EnterpriseInput,
  EnterpriseInternal,
  InitialAdministratorInput,
} from './enterprise-access-state.js';
import * as enterpriseapplication from './enterprise-application.js';
import * as enterprisedesignation from './enterprise-designation.js';
import * as enterprisepolicy from './enterprise-policy.js';
import * as enterpriseroles from './enterprise-roles.js';
import * as enterprisescopes from './enterprise-scopes.js';
import type { EnterpriseVerification } from './enterprise-verification.js';
import type { EnterpriseU2Runtime } from './enterprise-access-state.js';
import { EnterpriseMemberships } from './enterprise-memberships.js';
import { EnterpriseRoleRevisions } from './enterprise-role-revisions.js';
import { EnterpriseInvitations } from './enterprise-invitations.js';
import { AdministratorRestoration } from './administrator-restoration.js';
export type {
  EnterpriseDecision,
  EnterpriseInput,
  InitialAdministratorInput,
} from './enterprise-access-state.js';
export class EnterpriseAccess {
  private readonly internal: EnterpriseInternal;
  readonly authorization: Authorization;
  readonly commands: Commands;
  private readonly invitations: EnterpriseInvitations | null;
  constructor(
    readonly store: ProtectedStore,
    readonly verification: EnterpriseVerification,
    private readonly now: () => Date,
    synthetic: boolean,
    u2?: EnterpriseU2Runtime,
  ) {
    requireCondition(
      verification.kind !== 'SYNTHETIC' || synthetic,
      503,
      'SYNTHETIC_VERIFICATION_FORBIDDEN',
      '운영에 합성 기업 확인을 등록할 수 없습니다.',
    );
    this.authorization = new Authorization(store, now);
    this.commands = new Commands(store, now);
    requireCondition(
      !u2 || synthetic,
      503,
      'REALACTIVATION_HOLD',
      '실제 정책/경로/제공자 증거 전 U2 실활성은 보류합니다.',
    );
    this.invitations = u2
      ? new EnterpriseInvitations(this, u2.verifier, u2.vault, u2.authorities, now)
      : null;
    this.internal = {
      store,
      verification,
      now,
      authorization: this.authorization,
      commands: this.commands,
      apply: this.apply.bind(this),
      approve: this.approve.bind(this),
      designate: this.designate.bind(this),
      validateScope: this.validateScope.bind(this),
      createRole: this.createRole.bind(this),
      setOrderingPolicy: this.setOrderingPolicy.bind(this),
      managementTarget: this.managementTarget.bind(this),
      defineCustomerRole: this.defineCustomerRole.bind(this),
      grantCustomerRole: this.grantCustomerRole.bind(this),
      readApplication: this.readApplication.bind(this),
    };
  }
  apply(context: ServiceContext, input: EnterpriseInput): Promise<Receipt> {
    return enterpriseapplication.apply(this.internal, context, input);
  }
  approve(context: ServiceContext, input: EnterpriseDecision): Promise<Receipt> {
    return enterpriseapplication.approve(this.internal, context, input);
  }
  designate(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: InitialAdministratorInput,
  ): Promise<Receipt> {
    return enterprisedesignation.designate(this.internal, context, enterpriseRef, input);
  }
  validateScope(
    scope: ActionScope,
    enterpriseId: string,
    transaction?: ProtectedTransaction,
  ): Promise<void> {
    return enterprisescopes.validateScope(this.internal, scope, enterpriseId, transaction);
  }
  private createRole(
    transaction: ProtectedTransaction,
    enterpriseRef: Ref,
    memberRef: Ref,
    label: string,
    scopes: ActionScope[],
    actor: Ref,
  ): Promise<Ref[]> {
    return enterprisescopes.createRole(
      this.internal,
      transaction,
      enterpriseRef,
      memberRef,
      label,
      scopes,
      actor,
    );
  }
  setOrderingPolicy(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: {
      meta: CommandMeta;
      departmentUsage: 'USED' | 'NOT_USED';
      siteUsage: 'USED' | 'NOT_USED';
    },
  ): Promise<Receipt> {
    return enterprisepolicy.setOrderingPolicy(this.internal, context, enterpriseRef, input);
  }
  managementTarget(enterprise: ModelData): TargetScope {
    return enterprisescopes.managementTarget(this.internal, enterprise);
  }
  defineCustomerRole(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: { meta: CommandMeta; label: string; actionScopes: ActionScope[] },
  ): Promise<Receipt> {
    return enterpriseroles.defineCustomerRole(this.internal, context, enterpriseRef, input);
  }
  grantCustomerRole(
    context: ServiceContext,
    enterpriseRef: Ref,
    input: { meta: CommandMeta; accountRef: Ref; roleRef: Ref; decision: 'GRANT' | 'REVOKE' },
  ): Promise<Receipt> {
    return enterpriseroles.grantCustomerRole(this.internal, context, enterpriseRef, input);
  }
  readApplication(context: ServiceContext, id: string): Promise<unknown> {
    return enterpriseapplication.readApplication(this.internal, context, id);
  }
  updateMembership(
    context: ServiceContext,
    input: Parameters<EnterpriseMemberships['update']>[1],
  ): Promise<Receipt> {
    return new EnterpriseMemberships(this, this.now).update(context, input);
  }
  reviseCustomerRole(
    context: ServiceContext,
    input: Parameters<EnterpriseRoleRevisions['customer']>[1],
  ): Promise<Receipt> {
    return new EnterpriseRoleRevisions(this, this.now).customer(context, input);
  }
  deactivateCustomerRole(
    context: ServiceContext,
    input: Parameters<EnterpriseRoleRevisions['deactivateCustomer']>[1],
  ): Promise<Receipt> {
    return new EnterpriseRoleRevisions(this, this.now).deactivateCustomer(context, input);
  }
  reviseStaffRole(
    context: ServiceContext,
    input: Parameters<EnterpriseRoleRevisions['staff']>[1],
  ): Promise<Receipt> {
    return new EnterpriseRoleRevisions(this, this.now).staff(context, input);
  }
  deactivateStaffRole(
    context: ServiceContext,
    input: Parameters<EnterpriseRoleRevisions['deactivateStaff']>[1],
  ): Promise<Receipt> {
    return new EnterpriseRoleRevisions(this, this.now).deactivateStaff(context, input);
  }
  restoreAdministrator(
    context: ServiceContext,
    input: Parameters<AdministratorRestoration['restore']>[1],
  ): Promise<Receipt> {
    return new AdministratorRestoration(this, this.now).restore(context, input);
  }
  resumeAdministratorRestoration(
    context: ServiceContext,
    input: Parameters<AdministratorRestoration['resume']>[1],
  ): Promise<Receipt> {
    return new AdministratorRestoration(this, this.now).resume(context, input);
  }
  closeAdministratorRestoration(
    context: ServiceContext,
    input: Parameters<AdministratorRestoration['close']>[1],
  ): Promise<Receipt> {
    return new AdministratorRestoration(this, this.now).close(context, input);
  }
  private invitationService(): EnterpriseInvitations {
    requireCondition(
      this.invitations,
      503,
      'U2_INVITATION_NOT_REGISTERED',
      '명시 초대 목적 host가 등록되지 않았습니다.',
    );
    return this.invitations;
  }
  issueMembershipInvitation(
    context: ServiceContext,
    input: Parameters<EnterpriseInvitations['issue']>[1],
  ): Promise<Receipt> {
    return this.invitationService().issue(context, input);
  }
  acceptMembershipInvitation(
    context: ServiceContext,
    input: Parameters<EnterpriseInvitations['accept']>[1],
  ): Promise<Receipt> {
    return this.invitationService().accept(context, input);
  }
  revokeMembershipInvitation(
    context: ServiceContext,
    input: Parameters<EnterpriseInvitations['revoke']>[1],
  ): Promise<Receipt> {
    return this.invitationService().revoke(context, input);
  }
  resendMembershipInvitation(
    context: ServiceContext,
    input: Parameters<EnterpriseInvitations['resend']>[1],
  ): Promise<Receipt> {
    return this.invitationService().resend(context, input);
  }
  readOwnInvitation(context: ServiceContext, sourceRef: Ref): Promise<unknown> {
    return this.invitationService().readOwn(context, sourceRef);
  }
}
