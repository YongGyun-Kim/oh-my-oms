import { requireCondition } from '@oms/contracts';
import type { Ref, ServiceContext, TargetScope } from '@oms/contracts';
import { ProductCatalog } from './catalog.js';
import { ref } from './references.js';
import type { OrderingPolicy } from './scopes.js';
export class CatalogQuery {
  constructor(
    readonly catalog: ProductCatalog,
    private readonly now: () => Date,
  ) {}
  async list(
    context: ServiceContext,
    query: { scope: TargetScope | null; cursor: string | null; pageSize: number },
  ): Promise<unknown> {
    const { authorization, store } = this.catalog;
    if (context.audience === 'STAFF') await authorization.requireStaff(context, 'product.read');
    else {
      requireCondition(
        query.scope,
        400,
        'PRODUCT_SCOPE_REQUIRED',
        '상품을 조회할 기업 범위를 선택하세요.',
      );
      await authorization.relation(context, query.scope.enterpriseRef.id);
      const enterprise = await store.currentProtected('Enterprise', query.scope.enterpriseRef.id);
      requireCondition(enterprise, 404, 'NOT_FOUND', '대상을 확인할 수 없습니다.');
      await authorization.requireCustomer(
        context,
        'product.read',
        query.scope,
        enterprise.orderingContextPolicy as OrderingPolicy,
      );
    }
    const products = await store.list('Product', { cursor: query.cursor, limit: query.pageSize });
    const items = [];
    for (const product of products) {
      const offer = await store.read('CommonOfferRevision', (product.currentOfferRef as Ref).id);
      requireCondition(
        offer?.visible,
        503,
        'CATALOG_OFFER_UNCONFIRMED',
        '현재 판매 조건을 확인해야 합니다.',
      );
      items.push({
        knowledge: 'KNOWN',
        data: {
          productRef: ref('Product', product),
          commonOfferRevisionRef: ref('CommonOfferRevision', offer),
          productType: product.productType,
          softwareTermKind: product.softwareTermKind,
          label: product.label,
          salesDescription: product.salesDescription,
          visible: true,
          commonPrice: offer.commonPrice,
          resolvedPrice: null,
          salesConditionRefs: offer.salesConditionRefs,
          priceKnowledge: 'UNKNOWN',
        },
        sourceRefs: [ref('Product', product), ref('CommonOfferRevision', offer)],
        observedAt: this.now().toISOString(),
      });
    }
    return store.schema.validate('ProductViewResultPage', {
      items,
      nextCursor: products.length === query.pageSize ? String(products.at(-1)!.productId) : null,
      observedAt: this.now().toISOString(),
    });
  }
}
