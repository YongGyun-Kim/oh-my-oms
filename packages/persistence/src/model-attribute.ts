import { SchemaValidator, requireCondition } from '@oms/contracts';
import type { EntitySchemaColumnOptions } from 'typeorm';
import type { Attribute, Model } from './model-catalog.js';
export function validateAttribute(
  attribute: Attribute,
  value: unknown,
  context: {
    schema: SchemaValidator;
    findModel: (name: string) => Model | undefined;
    columnType: (attribute: Attribute) => EntitySchemaColumnOptions['type'];
    u2?: boolean;
    u2DecisionBasis?: boolean;
  },
): void {
  const { schema } = context;
  if (attribute.type.startsWith('U2Contract:')) {
    schema.validateUri(
      'urn:oms:contract:u2-access-additions:1#/$defs/' + attribute.type.slice(11),
      value,
    );
    return;
  }
  if (attribute.type === 'U2TextList' || attribute.type === 'U2StaffActionList') {
    if (attribute.type === 'U2StaffActionList') {
      schema.validateSchema(
        {
          type: 'array',
          maxItems: 12,
          uniqueItems: true,
          items: {
            $ref: 'urn:oms:contract:u2-access-additions:1#/$defs/StaffRoleRevisionInput/properties/actions/items',
          },
        },
        value,
      );
      return;
    }
    schema.validateSchema(
      {
        type: 'array',
        maxItems: 100,
        uniqueItems: true,
        items: { type: 'string', minLength: 1, maxLength: 128 },
      },
      value,
    );
    return;
  }

  const snapshots: Record<string, string> = {
    DecisionBasis: 'DecisionBasisSnapshot',
    OrderingContextPolicy: 'OrderingContextPolicySnapshot',
    CapturedLineTerms: 'CapturedLineTermsSnapshot',
    CapturedLineTermsList: 'CapturedLineTermsListSnapshot',
    LineAssessmentList: 'LineAssessmentListSnapshot',
    SourceRevisionList: 'SourceRevisionListSnapshot',
  };
  if (snapshots[attribute.type]) {
    if (attribute.type === 'DecisionBasis' && context.u2DecisionBasis) {
      schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/DecisionBasis', value);
      return;
    }
    schema.validateUri('urn:oms:contract:foundation:1#/$defs/' + snapshots[attribute.type], value);
    return;
  }
  const scalar: Record<string, string[]> = {
    Audience: ['CUSTOMER', 'STAFF', 'SYSTEM'],
    BusinessOwner: [
      'IdentityRecovery',
      'EnterpriseAccess',
      'ProductCatalog',
      'CommercialAgreement',
      'OrderAcceptance',
      'FinancialSettlement',
      'HardwareFulfillment',
      'SoftwareLifecycle',
      'AfterSalesDecision',
      'WorkInquiry',
      'NotificationDelivery',
      'OperationalAssurance',
    ],
    ReceiptState: [
      'ACCEPTED',
      'PROCESSING',
      'RESULT_RECORDED',
      'REVIEW_REQUIRED',
      'TECHNICAL_FAILED',
    ],
    KnowledgeState: ['KNOWN', 'UNKNOWN', 'CONFLICT', 'UNAVAILABLE'],
    ScopeKind: [
      'DEPARTMENT_SITE',
      'SITE_ALL_DEPARTMENTS',
      'DEPARTMENT_ALL_SITES',
      'ENTERPRISE_ALL',
    ],
    LoginPath: ['/orders', '/enterprise-applications', '/enterprises', '/identity'],
  };
  if (scalar[attribute.type]) {
    requireCondition(
      typeof value === 'string' && scalar[attribute.type].includes(value),
      400,
      'MODEL_ENUM',
      '등록된 원본 상태가 필요합니다.',
    );
    return;
  }
  if (attribute.type === 'RequestTarget') {
    if (value === null) return;
    if (context.u2)
      schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/InvocationTarget', value);
    else schema.validate('InvocationTarget', value);
    return;
  }
  if (attribute.type === 'StaffActionList') {
    schema.validateSchema(
      {
        type: 'array',
        minItems: 1,
        maxItems: 9,
        uniqueItems: true,
        items: {
          enum: [
            'application.read',
            'enterprise.approve',
            'enterprise.initial-administrator.designate',
            'product.register',
            'product.revise',
            'product.read',
            'order.read',
            'order.review.read',
            'staff.role.manage',
          ],
        },
      },
      value,
    );
    return;
  }
  if (attribute.allowed_values)
    requireCondition(
      attribute.allowed_values.includes(String(value)),
      400,
      'MODEL_ENUM',
      '지원하지 않는 원본 상태입니다.',
    );
  if (['Identifier', 'Revision', 'Instant', 'Money'].includes(attribute.type)) {
    schema.validate(attribute.type === 'Identifier' ? 'Id' : attribute.type, value);
    return;
  }
  if (attribute.type === 'LocalDate') {
    schema.validate('Date', value);
    return;
  }
  if (attribute.type === 'Ref' || attribute.type === 'ExternalRef') {
    if (context.u2) schema.validateUri('urn:oms:contract:u2-access-additions:1#/$defs/Ref', value);
    else schema.validate('Ref', value);
    const target = attribute.references && context.findModel(attribute.references);
    if (target)
      requireCondition(
        (value as { owner: string; entity: string }).owner === target.owner &&
          (value as { entity: string }).entity === target.name,
        400,
        'REFERENCE_OWNER',
        '원본 참조 소유자와 종류가 다릅니다.',
      );
    return;
  }
  if (attribute.type === 'TargetScopeSnapshot') {
    schema.validate('TargetScope', value);
    return;
  }
  if (attribute.type === 'Boolean') {
    requireCondition(
      typeof value === 'boolean',
      400,
      'MODEL_BOOLEAN',
      '원본 boolean이 필요합니다.',
    );
    return;
  }
  if (['PositiveInteger', 'NonNegativeInteger'].includes(attribute.type)) {
    requireCondition(
      typeof value === 'number' &&
        Number.isSafeInteger(value) &&
        value >= (attribute.minimum ?? (attribute.type === 'PositiveInteger' ? 1 : 0)),
      400,
      'MODEL_QUANTITY',
      '원본 정수 범위를 확인하세요.',
    );
    return;
  }
  if (
    attribute.type.endsWith('List') ||
    attribute.type === 'EvidenceRefs' ||
    attribute.type === 'ContactRefList'
  ) {
    requireCondition(
      Array.isArray(value) && value.length >= (attribute.min_items ?? 0),
      400,
      'MODEL_LIST',
      '원본 목록이 필요합니다.',
    );
    if (
      attribute.type === 'RefList' &&
      ['lineRefs', 'catalogRevisionRefs'].includes(attribute.name)
    )
      schema.validateSchema(
        {
          type: 'array',
          minItems: 1,
          maxItems: 100,
          items: { $ref: 'urn:oms:contract:common:2#/$defs/Ref' },
        },
        value,
      );
    else if (
      attribute.type === 'RefList' ||
      attribute.type === 'EvidenceRefs' ||
      attribute.type === 'ContactRefList'
    )
      schema.validateSchema(
        {
          type: 'array',
          maxItems: 100,
          items: {
            $ref: context.u2
              ? 'urn:oms:contract:u2-access-additions:1#/$defs/Ref'
              : 'urn:oms:contract:common:2#/$defs/Ref',
          },
        },
        value,
      );
    const target = attribute.references && context.findModel(attribute.references);
    if (target && attribute.type === 'RefList')
      for (const item of value)
        requireCondition(
          item.owner === target.owner && item.entity === target.name,
          400,
          'REFERENCE_OWNER',
          '목록 참조의 원본 소유자/종류가 다릅니다.',
        );
    if (attribute.type === 'CodeVerifierList')
      for (const verifier of value)
        requireCondition(
          verifier &&
            Object.keys(verifier).sort().join(',') === 'digest,used' &&
            /^[a-f0-9]{64}$/.test(verifier.digest) &&
            typeof verifier.used === 'boolean',
          400,
          'CODE_VERIFIER_SCHEMA',
          '코드 검증 자료가 다릅니다.',
        );
    return;
  }
  if (context.columnType(attribute) === 'varchar')
    requireCondition(
      typeof value === 'string' && value.length > 0 && value.length <= 4096,
      400,
      'MODEL_TEXT',
      '원본 문자열 범위를 확인하세요.',
    );
  else
    requireCondition(
      typeof value === 'object' && !Array.isArray(value),
      400,
      'MODEL_OBJECT',
      '원본 객체가 필요합니다.',
    );
}
