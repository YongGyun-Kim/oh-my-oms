# U3 주문 접수·조회·스냅샷 검증

## 구현 경계

기준 커밋은 315a7e42c96458d58ce553b0c4e227502b535ac0이다. 기존 OrderAcceptance/common1/2를 보존하고 같은 owning 파일에 명시 registry3 U3OrderAcceptance를 추가했다. 실제 등록 Order2 state/changeApplicationRefs와 OrderLine·PurchaseTermsSnapshot·ProvisionChoice·AcceptanceDecision을 같은 보호 후보로 저장한다. 자동 ACCEPT는 하지 않고 REVIEW/HOLD로 접수한다.

선택 닫힌 priceConfirmation은 전체 원 단위 금액과 현재 확인 직원·모든 합의 근거를 결합한다. 실제 현재 권위·입력 지문/기업/목적/출처 대조를 통과한 확인 자료만 확정 금액으로 캡처한다. 확인 자료가 없으면 상품 단가×수량·소계를 보존하되 total:null/UNKNOWN으로 저장하며 빈 adjustments를 비용 면제로 추정하지 않는다. 스냅샷의 선택 nullable 확인 필드는 비파괴 owner migration으로 확장하고 확인 내용과 저장 금액의 일치를 검증한다.

전체 직원 판단·두 조건 변경의 실제 적용·후속 제안 AppliedTerms 연결·HTTP/worker host는 이 슬라이스에 포함되지 않는다. Step 11–14는 아직 미완료이며 테스트 source는 로컬 합성 자료다.

## 검사와 실패 기록

Node 22.23.3과 기존 U3 격리 DB로 검증했다. Luna가 실행한 초기 검사 제품/source 지문은 85f407e13b48f597daa60bf032b34b09e344de67a71adfe4d2b845aa7b45b2ce이며 시작/종료가 동일했다. 지정 제품/시험 11개 파일 SHA-256도 실행 전후 같았다. 실패 원문 보고서는 별도 이름으로 보존하고 root는 비민감 JSON count/success만 확인한다. 실제/타 프로젝트 DB 초기화·AWS 배포·대량 부하·전체 DR는 수행하지 않는다.

| 초기 검사 | 실제 결과 / 보고서 |
| --- | --- |
| TypeScript | 종료 코드 2; order-submission.spec.ts:76에서 Promise의 agreementEvidenceRefs 접근 |
| U3 단위 | 242개 중 241 PASS·1 FAIL; order-submission-unit-20261012.json |
| 신규 주문 통합 | 7개 중 4 PASS·3 FAIL 및 unhandled async 오류 2건; order-submission-integration-20261012.json |
| migration·제안 영향 회귀 | 23/23 PASS; order-submission-snapshot-regression-20261012.json |
| 선택 ESLint | 종료 코드 0 |

단위 실패는 조회 output을 의도적으로 훼손한 시험의 input에 새 필수 targetScope가 누락돼 output 검증 전에 INVALID_INPUT으로 차단됐기 때문이다. 유효한 조회 input을 갖추어 원래 INVALID_PRODUCER 판정을 검증해야 하며 그 차단 기준을 완화하지 않는다. 통합 초기 실패는 등록 input factory의 검증에서 발생했고, 비동기 자료 사용·invalid input fixture가 실제 서비스 검증에 도달하는지 수정/재확인이 필요하다. 아직 이 주문 접수 슬라이스 전체 PASS 판정은 아니다.

## 수정 후 재검증

비동기 f.input()을 await하여 실제 agreementEvidenceRefs를 전달했고, 의도한 producer 오류 시험에는 유효한 view.targetScope를 추가했다. 입력 검증 기준·INVALID_PRODUCER 판정·제품 코드는 바꾸지 않았다. 처음의 미처리 비동기 query가 다음 테스트 DB reset과 겹칠 수 있었던 자료 생성 경계도 이 await 수정에 포함된다.

재검증 제품/source 지문은 85f407e13b48f597daa60bf032b34b09e344de67a71adfe4d2b845aa7b45b2ce으로 전후 동일하다. 두 변경 시험의 SHA-256도 전후 같았다(order-submission.spec.ts: 0b8c43891c3d1c16dce511a3099777c2ea077986ea6bcc3638389a038c2b090c, contracts.spec.ts: 6c2912143c6b51d6e9f433f6e8026dd2e8979c159150527019d64c7f5df5793e). TypeScript·선택 ESLint 종료 코드 0, 단위 242/242 PASS다. 주문 통합은 7개 중 5 PASS·2 FAIL이며 아직 통과 판정하지 않는다. root가 order-submission-fixture-fixed-{unit,integration}-20261012.json의 실제 count/success를 확인했다. 그대로인 스냅샷/제안 회귀 23개는 반복하지 않았다.

남은 실패는 기업 우선 가격의 상품 소계 대조 및 100행 주문의 저장 모델 검증에 있다. 확인 금액 자료와 실제 승인 가격, 저장 결과의 정확한 필드/유한 한도를 확인해 수정하며, 입력 행 자동 분할·절삭이나 구형 URI/전역 차단선 완화로 해결하지 않는다. 실패 원문은 보존한다.

두 원인을 확인했다. 기업별 승인 가격 900원 조회는 정상이었고, fixture의 productAmount/total이 같은 Money 객체를 공유해 total을 1900원으로 수정할 때 상품 소계 1800원도 같이 바뀌었다. 각각 독립 복사하고 1800/1900을 함께 검증하며 제품 계산/승인 가격/근거 검증은 바꾸지 않는다.

100행 실패는 OrderHistory.resultRefs의 실제 등록 RefList 한도 100이었다. submit 반환은 주문/스냅샷/선택/판단 4개와 100행으로 104개였고 접수 결과에는 이력까지 105개가 됐다. 전체 100행은 주문·불변 스냅샷 graph에 원자 저장/보호하고, 반환 refs는 정확한 4개 집계로 고정한다(이력 4·접수 5·조회 source 4). 임의 slice·행 절삭·스키마/한도 완화 없이 보호 후보 100행과 조회 100행을 대조하는 실제 시험을 추가했다. 이 수정의 재검증은 아직 진행 중이다.

집계 참조 수정 검사 결과: 제품/source 지문 cd9fd8978f1f7415ddf31671d9eee85a43a24c3965e9446ed3aa6934c5ea5d9f과 변경 제품/시험 두 파일 SHA-256은 전후 동일했다. TypeScript/선택 ESLint 종료 코드 0, 통합 7개 중 6 PASS·1 FAIL이다. 기업 우선 금액과 100행 정상 저장/보호·조회 대조는 통과했고 마지막 stale 조건 음성 입력이 evidenceRefs를 비워 필수 형식 검증에서 INVALID_INPUT으로 차단됐다. 형식이 유효한 stale 조건으로 ORDER_CONDITIONS_CHANGED 판정을 검증하는 자료 수정이 필요하다. root가 실제 JSON을 확인했으며 order-submission-aggregate-fixed-integration-20261012.json 실패 원문을 보존한다.

stale 음성 자료의 sourceRef만 revision+1로 바꾼 재검증도 입력 내부 매핑 검사에서 차단됐다. condition.sourceRef와 line.commonOfferRevisionRef의 정확한 매핑을 유지해야 하므로 INVALID_INPUT은 올바른 차단이며 업무 대조까지 도달하지 못했다. 제품 지문 cd9fd8978f1f7415ddf31671d9eee85a43a24c3965e9446ed3aa6934c5ea5d9f 및 시험 SHA-256 88742269133a1b2ebf626f1ece28f6b1923b443d0ce81470aa8512dc3553437a은 전후 같았다. TypeScript/ESLint 0·통합 6/7 PASS이며 root가 실제 count/success를 확인했다. order-submission-stale-condition-fixed-integration-20261012.json을 보존하고, 유효한 참조 매핑 안에서 PRICE 내용이 실제 원본과 다른 자료로 다음 업무 검증을 준비한다. 입력 매핑·내용 대조의 두 차단선을 모두 유지한다.

최종 자료 수정은 원래 참조 매핑을 유지하고 PRICE의 정수 Money만 독립 객체로 value+1하여 실제 입력 preflight 뒤 현재 원본과의 조건 불일치를 검증했다. 제품/스키마/차단선을 바꾸지 않았다. TypeScript·선택 ESLint 종료 코드 0, 통합 7/7 PASS이며 실패/pending/todo/unhandled error는 0이다. root가 order-submission-price-condition-fixed-integration-20261012.json의 실제 count/success를 확인했다. 제품 지문 cd9fd8978f1f7415ddf31671d9eee85a43a24c3965e9446ed3aa6934c5ea5d9f 및 시험 SHA-256 d719485a8a62fbf0ad3073f87fd915a610342dfe2a3d99e73ed0d572fe819190은 실행 전후 같았다. 모든 초기/수정 실패 보고서를 보존한다.

## 현재 슬라이스 판정

| 대상 | 검증 결과 |
| --- | --- |
| 타입·변경 파일 린트 | 최종 종료 코드 0 |
| U3 단위 | fixture 정합 후 242/242 PASS; 이후 단위/해당 제품 helper 변경 없음 |
| 주문 접수·조회 통합 | 최종 7/7 PASS; 100행 실제 저장/보호/조회와 명시 집계 참조 포함 |
| migration·기존 제안 영향 | 23/23 PASS; 이후 해당 DDL/owning 코드 변경 없음 |

실제 명령은 고정 Node PATH의 npx --no-install tsc --noEmit, Vitest tests/u3/vitest.unit.config.ts 및 tests/u3/vitest.integration.config.ts의 order-submission.spec.ts/migration-compatibility.spec.ts/commercial-proposal.spec.ts, 변경 파일별 ESLint다. 통합에는 verification-isolated profile을 지정했다. 위 결과는 서로 다른 수정 단계의 실제 보고서이며 전체 current source 집계·80%·CI 성공으로 재명명하지 않는다. 이번 접수/조회 계층의 검증을 통과했으므로 이어지는 직원 판단/조건 적용 계층으로 진행한다.

## 남은 검증과 연결

수정 후 실제 주문 접수·조회/보호 원상·100행 경계·정수 합계/확인 근거·권한/기업/내부망·응답 유실과 원래 결과·rollback·SW 합의기간 보존을 검증한다. 전체 수락 판단은 정확한 현재 외부 소유 근거 없이는 차단하고 실제 U4–U7 준비를 합성 source로 대체하지 않는다. 원래 UNKNOWN 합계는 그대로 보존하며 이후 확인 제안/적용이 원래 스냅샷을 수정하지 않아야 한다. 전체 U3·전체 80%·CI/병합·운영 준비는 별도 검증이다.

requestedActivationDate는 요청 원본, agreedPeriod는 확인된 계약 PERIOD 원본으로 각각 저장한다. FD functional-spec.md:53/184와 요구 FR10.2는 요청/계약/실제 기간 분리를 정의하나 서로 다른 요청일과 계약 시작일의 허용 규칙을 자동 결정하지 않는다. 현재 접수는 항상 REVIEW/HOLD이며 기간을 자동 이동하지 않는다. 이후 전체 수락에서는 이 차이에 필요한 합의/소유 근거를 확인하기 전 수락하지 않도록 연결해야 한다. 실제 기간/조기 사용/보상 연장은 U6 소유이며 최초 합의기간을 바꾸지 않는다.
