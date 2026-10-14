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
import type { CommercialAgreement } from './commercial-agreement.js';
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
  constructor(
    readonly catalog: U3ProductCatalog,
    private readonly commercial?: Pick<CommercialAgreement, 'resolve'>,
  ) {}
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
            (product.saleState === 'OFFERABLE' ||
              (context.audience === 'STAFF' && product.saleState === 'SUSPENDED')) &&
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
            canonicalJson(offer.productRef) === canonicalJson(ref('Product', product)) &&
            withinEffectiveWindow(offer.effectiveWindow as EffectiveWindow, now()) &&
            conditions.every((value) => withinEffectiveWindow(value.effectiveWindow, now())),
          503,
          'CATALOG_OFFER_UNCONFIRMED',
          '현재 유효한 공통 조건을 확인해야 합니다.',
        );
        const termsQuery = {
          targetScope: query.targetScope!,
          productRef: ref('Product', product),
          commonOfferRevisionRef: offerRef,
        };
        requireCondition(
          context.audience === 'STAFF' || (this.commercial && query.targetScope),
          503,
          'CATALOG_OFFER_UNCONFIRMED',
          '현재 기업의 최종 공개 조건을 확인해야 합니다.',
        );
        const terms =
          context.audience === 'STAFF' ? null : await this.commercial!.resolve(context, termsQuery);
        const price = terms?.conditionBindings.find((value) => value.conditionKey === 'PRICE');
        // 직원은 공통 원본을, 고객은 자기 기업에 허용된 최종 상품 정보만 관측한다.
        const result = {
          knowledge: 'KNOWN',
          data: {
            productRef: ref('Product', product),
            commonOfferRevisionRef: offerRef,
            productType: product.productType,
            softwareTermKind: product.softwareTermKind,
            label: product.label,
            salesDescription: product.salesDescription,
            visible: terms ? true : offer.visible,
            commonPrice: !terms || offer.visible === true ? offer.commonPrice : null,
            resolvedPrice: price?.conditionKey === 'PRICE' ? price.value : null,
            priceKnowledge: terms ? 'KNOWN' : 'UNKNOWN',
            salesConditionRefs: !terms || offer.visible === true ? offer.salesConditionRefs : [],
          },
          sourceRefs: [ref('Product', product), offerRef, ...(terms?.agreementRevisionRefs ?? [])],
          observedAt: now().toISOString(),
        };
        // 데이터 관측 중의 원본/권한/망 변경을 성공 조회로 반환하지 않는다.
        await commands.repository.current(ref('Product', product));
        await commands.repository.current(offerRef);
        if (terms)
          requireCondition(
            canonicalJson(await this.commercial!.resolve(context, termsQuery)) ===
              canonicalJson(terms),
            409,
            'STALE_CATALOG_OFFER',
            '조회 중 기업의 최종 조건이 변경됐습니다.',
          );
        await this.catalog.requireIngress(context, ingressProof);
        return result;
      },
    );
  }
}
