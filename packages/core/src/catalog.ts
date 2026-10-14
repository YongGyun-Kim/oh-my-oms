import { randomUUID } from 'node:crypto';
import { canonicalJson, requireCondition } from '@oms/contracts';
import type {
  CommandMeta,
  ConditionBinding,
  Money,
  Receipt,
  Ref,
  ServiceContext,
  U3ProductInput,
} from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { Commands } from './commands.js';
import { ref } from './references.js';
import { U3Commands } from './u3-commands.js';
import {
  buildCommonOffer,
  commonOfferSources,
  withinEffectiveWindow,
} from './catalog-conditions.js';
import type { EffectiveWindow } from '@oms/contracts';
export interface ProductInput {
  meta: CommandMeta;
  productType: 'HARDWARE' | 'SOFTWARE';
  softwareTermKind: 'PERPETUAL' | 'TERM' | null;
  label: string;
  salesDescription: string;
  commonPrice: Money;
  salesConditionRefs: Ref[];
}

// registry3 연결은 호스트가 명시적으로 선택한다. 구형 ProductCatalog 입력/원본은 유지한다.
export class U3ProductCatalog {
  readonly commands: U3Commands;
  readonly authorization: Authorization;
  constructor(
    readonly store: ProtectedStore,
    readonly now: () => Date,
    private readonly staffIngress: (proof: unknown) => Promise<boolean>,
  ) {
    this.commands = new U3Commands(store, now);
    this.authorization = this.commands.authorization;
  }
  async requireIngress(context: ServiceContext, proof: unknown): Promise<void> {
    requireCondition(
      context.audience !== 'STAFF' || (await this.staffIngress(proof)),
      403,
      'STAFF_NETWORK_REQUIRED',
      '등록된 회사 내부망 경로가 필요합니다.',
    );
  }
  async register(
    context: ServiceContext,
    input: U3ProductInput,
    existingRef: Ref | null = null,
    ingressProof: unknown = null,
  ): Promise<Receipt> {
    await this.requireIngress(context, ingressProof);
    return this.commands.run(
      context,
      'ProductCatalog',
      existingRef ? 'reviseProduct' : 'registerProduct',
      existingRef ? { kind: 'RECORD', recordRef: existingRef } : { kind: 'NONE' },
      input,
      { scope: null },
      async (scope) => {
        await this.requireIngress(context, ingressProof);
        const previous = existingRef ? await scope.current(existingRef) : null;
        requireCondition(
          existingRef || input.meta.expectedRevision === null,
          409,
          'STALE_REVISION',
          '신규 상품의 예상 개정은 null이어야 합니다.',
        );
        requireCondition(
          !previous || previous.productType === input.productType,
          400,
          'PRODUCT_TYPE_IMMUTABLE',
          '기존 상품 타입은 유지합니다.',
        );
        // 이전 성공/이력 조회와 현재 상업 변경은 구분한다. 자동 backfill을 하지 않는다.
        requireCondition(
          !previous || previous.modelVersion === 2,
          409,
          'MODEL_UPGRADE_REQUIRED',
          '구형 상품은 별도 원본 재검증이 필요합니다.',
        );
        for (const source of commonOfferSources(input)) {
          const value = await scope.current(source);
          if (source.entity === 'CommonOfferRevision') {
            const product = await scope.current(value.productRef as Ref);
            const conditions = value.conditionBindings as ConditionBinding[];
            requireCondition(
              value.modelVersion === 2 &&
                product.modelVersion === 2 &&
                ['OFFERABLE', 'SUSPENDED'].includes(String(product.saleState)) &&
                canonicalJson(product.currentOfferRef) === canonicalJson(source) &&
                withinEffectiveWindow(value.effectiveWindow as EffectiveWindow, this.now()) &&
                ['PRICE', 'VISIBILITY', 'PAYMENT', 'PROVISION', 'COMPLETION'].every((key) =>
                  conditions.some((condition) => condition.conditionKey === key),
                ) &&
                (product.softwareTermKind !== 'TERM' ||
                  conditions.some((condition) => condition.conditionKey === 'PERIOD')) &&
                (value.revisionEvidenceRefs as Ref[]).length > 0 &&
                conditions.every(
                  (condition) =>
                    condition.evidenceRefs.length > 0 &&
                    withinEffectiveWindow(condition.effectiveWindow, this.now()),
                ),
              503,
              'CATALOG_BASIS_UNCONFIRMED',
              '유효한 공통 조건 원본이 필요합니다.',
            );
          }
        }
        const productRef: Ref = {
            owner: 'ProductCatalog',
            entity: 'Product',
            id: existingRef?.id ?? randomUUID(),
            revision: Number(previous?.revision ?? 0) + 1,
          },
          offerRef: Ref = {
            owner: 'ProductCatalog',
            entity: 'CommonOfferRevision',
            id: randomUUID(),
            revision: 1,
          };
        const { product, offer } = buildCommonOffer(
          this.store,
          {
            ...input,
            saleState:
              input.saleState ?? (previous?.saleState === 'SUSPENDED' ? 'SUSPENDED' : 'OFFERABLE'),
          },
          productRef,
          offerRef,
          this.now(),
        );
        await scope.transaction.put(
          'Product',
          product,
          previous ? Number(previous.revision) : null,
        );
        if (offer) await scope.transaction.put('CommonOfferRevision', offer);
        await this.requireIngress(context, ingressProof);
        return {
          target: productRef,
          refs: offer ? [productRef, offerRef] : [productRef],
          before: existingRef,
          state: 'RESULT_RECORDED',
        };
      },
    );
  }
}
export class ProductCatalog {
  readonly authorization: Authorization;
  readonly commands: Commands;
  constructor(
    readonly store: ProtectedStore,
    private readonly now: () => Date,
  ) {
    this.authorization = new Authorization(store, now);
    this.commands = new Commands(store, now);
  }
  async register(
    context: ServiceContext,
    input: ProductInput,
    existingRef: Ref | null = null,
  ): Promise<Receipt> {
    this.store.schema.validate('ProductInput', input);
    requireCondition(
      input.productType === 'HARDWARE'
        ? input.softwareTermKind === null
        : input.softwareTermKind !== null,
      400,
      'PRODUCT_TERM_KIND',
      'HW/SW의 기간 종류를 확인하세요.',
    );
    if (existingRef)
      requireCondition(
        existingRef.owner === 'ProductCatalog' && existingRef.entity === 'Product',
        400,
        'PRODUCT_TARGET',
        '상품 원본 대상이 필요합니다.',
      );
    return this.commands.run(
      context,
      'ProductCatalog',
      existingRef ? 'reviseProduct' : 'registerProduct',
      existingRef ? { kind: 'RECORD', recordRef: existingRef } : { kind: 'NONE' },
      input,
      'CatalogHistory',
      (transaction) =>
        this.authorization.requireStaff(
          context,
          existingRef ? 'product.revise' : 'product.register',
          transaction,
        ),
      async (transaction) => {
        const previous = existingRef ? await transaction.get('Product', existingRef.id) : null;
        requireCondition(
          existingRef
            ? previous &&
                input.meta.expectedRevision === previous.revision &&
                existingRef.revision === previous.revision
            : input.meta.expectedRevision === null,
          409,
          'STALE_REVISION',
          '상품 개정을 다시 확인하세요.',
        );
        requireCondition(
          !previous || previous.productType === input.productType,
          400,
          'PRODUCT_TYPE_IMMUTABLE',
          '상품 타입은 기존 원본을 유지합니다.',
        );
        const productId = existingRef?.id ?? randomUUID();
        const offerId = randomUUID();
        const revision = Number(previous?.revision ?? 0) + 1;
        const product = {
          productId,
          productType: input.productType,
          softwareTermKind: input.softwareTermKind,
          label: input.label,
          salesDescription: input.salesDescription,
          currentOfferRef: {
            owner: 'ProductCatalog',
            entity: 'CommonOfferRevision',
            id: offerId,
            revision: 1,
          },
          revision,
        };
        const offer = {
          offerRevisionId: offerId,
          productRef: ref('Product', product),
          visible: true,
          commonPrice: input.commonPrice,
          salesConditionRefs: input.salesConditionRefs,
          publishedAt: this.now().toISOString(),
          revision: 1,
        };
        await transaction.put('Product', product, previous ? Number(previous.revision) : null);
        await transaction.put('CommonOfferRevision', offer);
        return {
          target: ref('Product', product),
          refs: [ref('Product', product), ref('CommonOfferRevision', offer)],
          scope: null,
          state: 'RESULT_RECORDED',
          before: previous ? ref('Product', previous) : null,
        };
      },
    );
  }
}
