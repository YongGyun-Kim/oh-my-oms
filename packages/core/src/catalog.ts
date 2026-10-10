import { randomUUID } from 'node:crypto';
import { requireCondition } from '@oms/contracts';
import type { CommandMeta, Money, Receipt, Ref, ServiceContext } from '@oms/contracts';
import type { ProtectedStore } from '@oms/persistence';
import { Authorization } from './authorization.js';
import { Commands } from './commands.js';
import { ref } from './references.js';
export interface ProductInput {
  meta: CommandMeta;
  productType: 'HARDWARE' | 'SOFTWARE';
  softwareTermKind: 'PERPETUAL' | 'TERM' | null;
  label: string;
  salesDescription: string;
  commonPrice: Money;
  salesConditionRefs: Ref[];
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
