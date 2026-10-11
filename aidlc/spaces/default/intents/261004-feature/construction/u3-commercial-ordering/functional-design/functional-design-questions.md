# U3 상품·계약·주문 기능 설계 질문

## 확정 범위와 조사 근거

기존 Guide me 방식으로 미확정 업무 기준만 확인한다. 고객사10곳 이내 제한 파일럿·일주문1000 계획 목표와 한국어 PC1280 이상을 유지한다. 원래12개 주 책임 스토리와 전체 AC는 보존하지만 첫 배포 적용 부분과 후속을 구분한다. 원래 Unit 전체 완료 또는 실제 용량·배포 실증으로 표시하지 않는다.

첫 배포는 직원 상품 등록, 기업에 허용된 상품·확인된 조건, 다른 사람의 근거 확인/계약 승인, HW/SW 별도 다품목 주문과 구매 당시 조건 보존, 주문 전체 직원 수락을 제공한다. 자동 확정·부분 제공·같은 주문의 혼합 지급·복잡한 조건 자동화·자동 갱신은 후속이다. 공급·대금 조건 미확인과 접근/입력 오류를 직원 확인으로 우회하지 않는다.

책임은 ProductCatalog의 상품/공통 조건, CommercialAgreement의 기업 조건/근거/승인, OrderAcceptance의 접수/스냅샷/전체 판단으로 유지한다. 실제 대금·HW 이행·SW 실제 기간·배송 시스템의 원본을 U3가 대신 소유하지 않는다. U2 체크포인트 승인은 그 작업 검증의 승인으로서, 기존 동일인/필수 출처 검증 문제·미실증 실제 연동/신뢰 근거와 운영 배포 HOLD를 없애지 않는다.

## Sources

- [첫 배포 실행 계획](../../../release-planning/first-release-delivery-plan.md): 첫 배포 부분 범위와 후속 책임.
- [Unit 정의](../../../inception/units-generation/unit-of-work.md): U3의12스토리·3개 논리 소유·기존 U1/U2 의존.
- [스토리 할당](../../../inception/units-generation/unit-of-work-story-map.md): U3 주 책임과 내부 검증 순서.
- [요구사항](../../../inception/requirements-analysis/requirements.md): FR4–FR7과 OQ1/OQ2/OQ8.
- [컴포넌트](../../../inception/domain-design/components.md): ProductCatalog/CommercialAgreement/OrderAcceptance의 원본·변경 책임.
- [공통 계약](../../../inception/contract-design/contract-summary.md): C03/C04/C05와 G13의 정확한10진 금액, 정수 수량. 단가 정밀도·반올림·입력 한도는 미확정이며 임의 기본값을 만들지 않는다.

## Q1 — 첫 배포의 상품 단가 정밀도

첫 배포의 KRW 상품 단가 입력에서 원 미만 소수를 허용할 것인가? 이는 세율·세무 처리나 법적 계약 효력을 확정하는 질문이 아니며 상품 입력/구매 조건 보존의 정밀도만 정한다.

- A. 원 단위 정수만 허용: 예를 들어1000원은 입력하고1000.5원은 자동 반올림하지 않고 지원 밖 입력으로 안내한다. 소수 단가 지원은 후속이다.
- B. 소수 단가도 허용: 소수 단가를 정확히 보존하며 허용 자릿수와 합계 처리 기준을 추가로 확인한다.
- X. Other (please specify)

[Answer]:

## 아직 확인하지 않은 항목

- 단가 정밀도 답변에 따라 필요한 금액 계산/반올림 경계.
- 같은 기업·상품의 승인 조건이 중첩될 때 등록·적용·확인 대기 처리.
- 실제 주문 입력 한도. 시험의50품목을 제품 상한으로 자동 적용하지 않는다.

답변은 받은 원문으로 기록한다. 필요한 업무 질문과 별도 Consolidated Summary Confirmation을 완료하기 전 entities/rules/functional-spec/traceability를 생성하지 않는다.
