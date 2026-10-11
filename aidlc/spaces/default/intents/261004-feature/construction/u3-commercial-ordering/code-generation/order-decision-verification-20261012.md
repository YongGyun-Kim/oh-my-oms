# U3 전체 직원 판단·준비 조회 검증

## 구현 경계

기준 커밋은 96a02db5dd01c7d78df6dc6ad4c35a53078a4990이다. 기존 보호된 실제 주문 제출 결과·불변 구매 스냅샷·전체 행·고정 기업 범위를 대조하여 직원의 전체 ACCEPT/REJECT/HOLD 판단을 새 AcceptanceDecision과 Order 개정에 원자 기록한다. 금액·상업 조건의 현재 효력과 정확한 소유자의 전체 준비가 확인되지 않으면 HOLD로 남긴다. 원래 구매 조건은 수정하지 않는다.

준비 조회는 서버에서 등록한 FinancialSettlement와 상품 타입에 맞는 HardwareFulfillment/SoftwareLifecycle의 읽기 전용 포트다. 주문·기업·범위·세대·판단 지문·전체 행/수량·현재 원본 개정과 조회 기한을 대조한다. 미등록·부분 준비·미확인 금액·기간 불일치의 근거 부재는 전체 수락 근거가 아니다. 합성 콜백은 로컬 시험 자료이며 실제 U4/U5/U6 운영 생산자나 지급·재고 확보·발급 완료를 증명하지 않는다.

## 최초 검사

Luna가 고정 Node 22.23.3과 기존 verification-isolated U3 DB에서 실행했다. 제품/source 지문 d955d2764258f0808a0fa676891ec0c20cf1e45e925874fd96b2a06ee035bf2a와 변경 6개 파일 SHA-256은 실행 전후 동일했다. root는 보고서의 실제 count/success를 확인했다. 원문 보고서는 .reports/u3에 보존하며 민감 내용은 이 문서에 복사하지 않는다.

| 검사 | 실제 결과 |
| --- | --- |
| TypeScript | 종료 코드 0 |
| U3 단위 | 246/246 PASS, 실패/pending/todo 0; order-decision-unit-20261012.json |
| 직원 판단 통합 | 11개 중 5 PASS·6 FAIL, pending 0, 미처리 오류 보고 없음; order-decision-integration-20261012.json |
| 주문 제출 회귀·선택 ESLint | 통합 실패 후 중단하여 미실행 |

정상 전체 수락의 ACCEPTED 기대가 REVIEW로 남았고, 수락 직전 원본 변경의 거절 기대도 REVIEW_REQUIRED 접수로 끝났다. CommonOfferRevision의 현재 효력 검사에서 존재하지 않는 state를 OFFERABLE과 비교한 제품 매핑 오류를 확인했다. 등록 모델·카탈로그 builder·기존 조건 조회는 CommonOfferRevision.visible와 Product.saleState를 구분한다. 현재 구매 원본의 visible===true와 기존 유효 구간·보호 개정·근거 검증을 유지하는 최소 수정으로 재검증한다. 새 판매 가격을 원래 구매 조건에 섞거나 차단선을 완화하지 않는다.

## 매핑 수정 후 검사

CommonOfferRevision.visible 한 줄을 실제 모델에 맞춰 수정했다. 재검증 제품/source 지문은 cea0881da69bcf84f9bc4329d5bdafa5273cba06efd563610c0ae423877da4e9이며 전후 동일했다. Luna의 최초 결과 회신에 이전 지문이 섞여 있었으나 기존 실행 기록을 확인해 이 값으로 정정했다. 변경 6개 파일 SHA-256도 전후 같았다. order-acceptance.ts의 지문은 6552aa50a8f1f67568dfc11a7013de03c561572b16d7def097889e7892258cfb이다.

TypeScript 종료 코드 0이다. 요청에서는 단위 반복을 생략했으나 Luna가 단위 시험을 실제 반복 실행해 같은 order-decision-unit-20261012.json을 갱신했다. 실제 결과는 246/246 PASS이며 이 갱신 보고서는 수정 후 지문에 속한다. 이후 검사에서는 새 보고서 이름을 사용하고 요청한 검사만 실행한다.

직원 판단 통합은 11개 중 9 PASS·2 FAIL이며 pending 0, 별도 미처리 오류 보고 없음이다. root가 order-decision-visible-fixed-integration-20261012.json의 실제 count/success를 확인했다. 정상 전체 수락과 기간 확인 등은 통과했고 두 실패는 시험의 보호 후보 행 분류 및 동시 쓰기의 잠금 거절 기대에 있다. 원문 실패 보고서는 보존한다. 제출 회귀·ESLint는 실패 후 중단해 아직 실행하지 않았다.

보호 payload에는 등록 업무 모델과 별도로 RequestKey 행이 존재한다. 모든 행에 modelDefinition을 호출하는 시험은 이 특별 행을 잘못 분류했다. 동시 쓰기는 기존 유한 잠금 기한 내에 완료되지 않으면 PostgreSQL 55P03으로 거절될 수 있다. 정확히 한 판단만 성공하고 패자 재시도가 stale로 차단되며 부분 저장이 없는지 검증해야 한다. 전역 잠금 기한이나 제품 차단선을 완화하지 않는다.

## 최종 재검증

제품 코드는 유지하고 order-decision.spec.ts의 두 검사만 수정했다. RequestKey는 폐쇄 decoder를 통과한 접수 식별 행으로 owner=OrderAcceptance/operation=decideOrder를 별도 확인하고 나머지 모든 모델의 소유권 검사를 유지한다. 동시 판단은 정확히 한 성공과 한 거절이며, 실제 QueryFailedError/55P03인 패자만 정확한 동일 입력으로 재시도해 STALE_U3_REFERENCE를 확인한다. 패자 접수 없음·직원 판단 하나·결정 이력 하나·Order 개정2·원래 스냅샷/행 bytes 불변을 함께 확인한다. 그 밖의 오류를 정상 거절로 치환하지 않는다.

제품 지문 cea0881da69bcf84f9bc4329d5bdafa5273cba06efd563610c0ae423877da4e9과 변경 6개 파일 SHA-256은 최종 검사 전후 동일했다. 수정 시험 SHA-256은 beede4f6862b6a5fde4dffc625c6e7a83c642943ab0ee5d131c0ca38b4c3a85d이다. root가 아래 두 JSON 보고서의 실제 count/success를 확인했다.

| 최종 검사 | 실제 결과 |
| --- | --- |
| TypeScript | 종료 코드 0 |
| 직원 판단 통합 | 11/11 PASS; order-decision-metadata-concurrency-fixed-integration-20261012.json |
| 주문 제출 영향 회귀 | 7/7 PASS; order-decision-submission-regression-20261012.json |
| 변경 6개 파일 ESLint | 종료 코드 0 |

두 통합 모두 실패/pending/todo/미처리 오류 0이다. 단위 246/246 결과는 같은 제품 지문에서 앞선 실행이며 이후 단위 owning 소스/시험은 변경하지 않아 다시 실행하지 않았다. 실제 명령은 고정 Node PATH의 npx --no-install tsc --noEmit, Vitest tests/u3/vitest.integration.config.ts의 order-decision.spec.ts 및 order-submission.spec.ts(verification-isolated), 위 변경 6개 파일 ESLint다. 실패 보고서와 최종 보고서를 모두 보존한다. 이 판단/준비 조회 계층의 검증을 통과했으며 전체 현재 제품 coverage/80%·CI·운영 원본 준비나 U3 단계 완료로 확대 해석하지 않는다.

## 남은 작업

실제 두 changeKind 적용·AppliedTerms 및 다음 제안의 현재 조건 연결·HTTP/worker·파일럿 CI·전체 제품 coverage·별도 검토는 아직 완료하지 않았다. Step 11–14도 미완료로 유지한다. 대량 부하·전체 DR·AWS 배포는 수행하지 않는다.
