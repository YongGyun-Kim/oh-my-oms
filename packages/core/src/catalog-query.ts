import { requireCondition } from '@oms/contracts';
import { canonicalJson } from '@oms/contracts';
import type {
  Ref,
  ServiceContext,
  TargetScope,
  U3CommonOfferQuery,
  ConditionBinding,
  EffectiveWindow,
} from '@oms/contracts';
import { ProductCatalog, U3ProductCatalog } from './catalog.js';
import { ref } from './references.js';
import type { OrderingPolicy } from './scopes.js';
import { withinEffectiveWindow } from './catalog-conditions.js';
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

export class U3CatalogQuery {
  constructor(readonly catalog: U3ProductCatalog) {}
  async readCommonOffer(
    context: ServiceContext,
    query: U3CommonOfferQuery,
    ingressProof: unknown = null,
  ) {
    await this.catalog.requireIngress(context, ingressProof);
    const { commands, now } = this.catalog;
    return commands.read(
      context,
      'ProductCatalog',
      'readCommonOffer',
      query,
      { scope: query.targetScope },
      async () => {
        const target = await commands.repository.current(query.targetRef);
        const product =
          query.targetRef.entity === 'Product'
            ? target
            : await commands.repository.current(target.productRef as Ref);
        requireCondition(
          product.modelVersion === 2 &&
            product.saleState === 'OFFERABLE' &&
            product.currentOfferRef,
          404,
          'NOT_FOUND',
          '유효한 공통 판매 조건을 확인할 수 없습니다.',
        );
        const offerRef = product.currentOfferRef as Ref;
        requireCondition(
          query.targetRef.entity !== 'CommonOfferRevision' ||
            canonicalJson(query.targetRef) === canonicalJson(offerRef),
          409,
          'STALE_CATALOG_OFFER',
          '이전 공통 조건을 현재 조건으로 제시할 수 없습니다.',
        );
        const offer = await commands.repository.current(offerRef),
          conditions = offer.conditionBindings as ConditionBinding[];
        requireCondition(
          offer.modelVersion === 2 &&
            offer.visible &&
            canonicalJson(offer.productRef) === canonicalJson(ref('Product', product)) &&
            withinEffectiveWindow(offer.effectiveWindow as EffectiveWindow, now()) &&
            conditions.every((value) => withinEffectiveWindow(value.effectiveWindow, now())),
          503,
          'CATALOG_OFFER_UNCONFIRMED',
          '현재 유효한 공통 조건을 확인해야 합니다.',
        );
        // 기업 조건을 조회하지 않았으므로 최종 기업 가격/구매 가능 여부는 미확인이다.
        const result = {
          knowledge: 'KNOWN',
          data: {
            productRef: ref('Product', product),
            commonOfferRevisionRef: offerRef,
            productType: product.productType,
            softwareTermKind: product.softwareTermKind,
            label: product.label,
            salesDescription: product.salesDescription,
            visible: true,
            commonPrice: offer.commonPrice,
            resolvedPrice: null,
            priceKnowledge: 'UNKNOWN',
            salesConditionRefs: offer.salesConditionRefs,
          },
          sourceRefs: [ref('Product', product), offerRef],
          observedAt: now().toISOString(),
        };
        // 데이터 관측 중의 원본/권한/망 변경을 성공 조회로 반환하지 않는다.
        await commands.repository.current(ref('Product', product));
        await commands.repository.current(offerRef);
        await this.catalog.requireIngress(context, ingressProof);
        return result;
      },
    );
  }
}
