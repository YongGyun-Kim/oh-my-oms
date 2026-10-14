# U3 상업 주문 관리

## 범위와 상태

B2B 고객사10곳 이내·하루 주문1,000건을 계획 목표로 하는 제한 파일럿 서버 구현이다. 목표 주문량을 실제 처리 용량/동시 사용자 실측 결과로 표현하지 않는다. 한국어·KRW·PC1280 전제를 사용하며 전체 화면은 U8/U9의 책임이다.

ProductCatalog·CommercialAgreement·OrderAcceptance와 필요한 EnterpriseAccess 권한 생산자/현재 검증을 구현했다. 계층별 합성 단위·격리 저장·HTTP·큐 검증과 현재 소스의 전체 품질·3기여 커버리지80%·보안·CI 결과는 Unit의 code-summary와 품질 기록을 확인한다. 시험·CI 성공은 AWS 배포/실거래 준비 완료를 뜻하지 않는다.

## 계약·저장·소유 경계

| 항목                  | 실제 연결                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| U3 profile / registry | `urn:oms:contract:u3-commercial:2` / 등록3. 서로 다른 버전 축이며 서버가 선택                                                              |
| 업무/지원 모델        | 논리 업무18개 + StaffRole2·CustomerRole2·RoleRevisionState2·ScopeV2 권한 지원4개. 동명 물리 테이블 중복 없음                               |
| 구형 호환             | common:1/common:2·등록1/2·wrapper1·과거 bytes 유지. 명시 혼합 wrapper2의 각 row/data 실제 버전 대조                                        |
| 역할/접수 호스트      | 등록31개(역할8개 포함) + grant2·C18조회3. 고객 신규 역할 목록은 `CONSENT_ROLES` 전용                                                       |
| 원본 소유             | 최초 snapshot·OrderChangeApplication은 OrderAcceptance, 제안/동의는 CommercialAgreement, 실제 지급/재고/발급/기간·회차/후처리 사실은 U4–U7 |

명시 DDL·synchronize=false·version-aware decoder를 사용한다. 구형 synthetic 상품/주문을 신규 U3 업무 변경으로 자동 승격하거나 미확인 데이터를 추정 backfill하지 않는다. 과거 성공 접수 조회/보호 재연은 신규 업무 변경 허용과 별개다. `u3Ref`는 등록 model2의 실제 개정 필드를 사용하고 legacy `ref()`는 유지한다. optional nullable SQL NULL/생략 차이는 비교용 사본에서만 정규화하며 원래 bytes/fingerprint는 변경하지 않는다.

## 업무 흐름

내부 직원만 상품·HW/영구SW/기간제SW·공통 조건을 등록/개정한다. draft와 판매 가능한 조건을 구분하고 현재 기업에 허용된 승인 조건만 제시한다. 기업 계약을 우선하며 같은 기업·상품·조건의 상충하는 유효 기간 중첩은 적용을 차단한다.

공통 공개 기본값과 판매 상태는 별개다. 완성·유효한 비공개 상품도 승인된 기업 공개 예외가 있으면 해당 기업이 조회·주문할 수 있다. 기업의 비공개 조건은 공통 공개보다 우선한다. 고객 응답은 비공개 공통 가격과 조건 참조를 숨기고 자기 기업의 확정 가격만 제공한다. 직원 공통 조회는 해당 기업의 최종 가격 확인을 대신하지 않는다.

saleState 입력은 선택적인 OFFERABLE/SUSPENDED이며 미완성·미래·만료 초안을 판매 가능으로 승격하지 않는다. 이미 중지된 상품은 상태를 생략한 설명 개정에서도 중지를 유지한다. 직원은 완전·유효한 현재 공통 원본과 정확한 근거를 확인해 명시적으로 재판매한다. 기업 공개 승인도 실제 판매 중지·미완성 상태를 우회하지 못한다. 기존 저장 상품 상태나 구매 스냅샷을 자동 변환하지 않는다.

등록자/승인자의 다른 사람 판정은 서버에 등록한 소유자와 정확한 현재 link·근거·목적·출처/확인자 권위·개정·approval digest를 대조한다. 계정/person-link ID 차이를 다른 사람 증거로 쓰지 않는다. 미등록/UNKNOWN/만료/불일치는 승인하지 않는다. 고객 변경 요청은 자기 기업의 현재 조직·대상 범위/권한에 한정하고 예외 등록은 자기 승인/즉시 효력을 뜻하지 않는다.

제안은 원래 조건과 새로운 인라인 조건/금액/근거를 고정한다. immutable content proposalRevision·display fingerprint와 상태 변경의 저장 row revision을 구분한다. 고객 응답은 실제 별도 `contract.consent` role/grant/scope 생산자에 연결하며 읽기/주문 권한을 동의로 추정하지 않는다. 변경/superseded 내용에 이전 동의를 재사용하지 않는다. 구형 역할 조회는 새 profile을 빈 일반 역할로 투영하지 않고 명시 거절한다.

주문은 동일 타입1–100행·양수 정수 수량·FULL·단일 지급 종류다. 직원 전체 ACCEPT/REJECT/HOLD 판단을 기록하며 HOLD는 AcceptanceDecision에 남고 Order의 상태 alias를 추가하지 않는다. 부분 준비/소유자 원본 미확인은 전체 수락을 허용하지 않는다.

KRW는 비음수 원 단위 정수 문자열을 BigInt로 계산하며 선언된 Money 길이 한도를 지킨다. 수량/개정의 Number 한도를 금액 ceiling으로 오용하지 않는다. 직원/현재 근거가 확인한 세금 포함·비용/할인 적용 여부/금액만 검증하며 자동 세율 정책을 만들지 않는다. 빈 adjustment/client KNOWN은 면제·0원 증거가 아니며 UNKNOWN은 그대로 보존한다.

최초 PurchaseTermsSnapshot·모든 조건별 상품/계약 개정·행의 합의 SW 기간은 주문당 한 번 불변 저장한다. 요청 활성화 날짜·합의 기간·실제 이용 기간은 다르다. REVIEW_PRICE_CHANGE는 명시 null U7, ACCEPTED_AFTERSALES_CHANGE는 정확한 등록 U7 허용 판단을 요구한다. 적용은 실제 OrderChangeApplication 인라인 AppliedTerms와 보호된 제안/동의/현재 권한으로 한 번 기록한다. 현재 조건은 Order.changeApplicationRefs의 실제 체인에서 해석하여 다음 제안의 원래 조건/가격으로 사용한다. 제안 조회의 APPLIED는 실제 application refs에서 도출하며 제안 결과를 cross-owner 갱신하지 않는다.

## 접수·호스트·전달

원본/행/스냅샷/결과/이력/사실/Outbox/요청 식별은 같은 primary transaction에 기록하고 별도 보호 ACK 뒤 성공을 반환한다. primary commit 후 보호 미확인은 rollback 성공이 아니다. 같은 key/input 재전송은 원래 결과를 먼저 재사용해 callback을 재실행하지 않는다. 다른 input/epoch/writer/stale 현재 전제는 차단한다. 유한55P03 거절은 부분 성공이 아니다.

HTTP는 서버 고정 registry3/profile2, 현재 MFA·기업/조직/대상·직원 내부망·CSRF를 검증한다. verifiedPersonRef는 실제 보호된 유일한 현재 link이며 synthetic fallback/임의 첫 link 선택은 없다. 단일 parser는 주문 제출/승인 조건 적용만1MiB(1,048,576bytes), 나머지64KiB(65,536bytes)다. 무효 JSON도 raw byte 한도 대상이고 초과413·압축/지원 밖 encoding 거절을 유지한다. U3 활성 상태의 legacy 상업 변경 우회는 차단하고 비활성 기존 정당한 U1/U2 경로는 보존한다.

공유 worker는 U3 Work/Fact/Receipt의 정확한 sourceContract·생산자registry3·보호 candidate/bytes/digest/sequence를 확인하고 기존 NotificationDelivery.materialiseInApp:2 consumer wire를 사용한다. 과거 생산 원본과 현재 permit/epoch를 구분하여 나중 주문 개정만으로 정당한 원래 통지가 무효화되지 않는다. 중복 효과는 한 번이며 역순/malformed/source오염/현재 permit 회수는 차단한다. worker가 업무 승인/MFA를 대신하지 않는다.

## 시험과 CI

Node22.23.3·npm10.9.9·exact lockfile을 사용한다. 로컬 Node 경로를 PATH 선두에 두고 아래 명령을 실행한다. 격리 profile/DB는 verification-isolated, oms_u3_verification·oms_u3_journal_verification이며 다른 namespace/실제 DB를 reset하지 않는다. 단순 시험은 Luna가 수행한다.

```sh
node --import tsx scripts/u3/prepare-test-databases.ts
npx --no-install vitest run --config tests/u3/vitest.unit.config.ts
OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts
OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.coverage.config.ts --coverage
NODE_ENV=test OMS_U2_SYNTHETIC_PROFILE=approved-local-only NEXT_TELEMETRY_DISABLED=1 node --import tsx scripts/u3/ci-pilot-proof.ts u3
```

U3 저장/HTTP/worker 선택 시험의 실제 경로는 repository-boundaries.spec.ts·http-host.spec.ts·worker-handoff.spec.ts다. 선택 성공은 전체 성공을 대신하지 않는다. 계층 구현→시험 작성/실행의 test-after/Standard를 유지한다. 통합18파일 순차·개별 test/hook30초·passWithNoTests:false, 서비스10초/DBtransaction3초/stmt2초/lock최대500ms는 유지한다. U3 integration child만20분, U3 whole coverage child만30분이다. 600초 수집 실패 당시 완료11파일/104시험587.215초와 미완료7파일의 과거63.618초가 예산 수정 근거다. coverage30분은 V8를 포함한 유한 수집 한도이며 서비스 요청 처리 시간이나 운영 용량 목표가 아니다. 실제 실행 시간과 성공 여부는 해당 소스의 보고서로 확인한다.

PR/main 기본 `.github/workflows/u1-validation.yml`은 독립 U1/U2/U3 runner의 unit/integration/전체 제품 coverage 기여와 project gate를 실행한다. 로컬 collector는 u1→u2→u3→project 순차로 사용할 수 있다. project가 실제 실행 라인의3기여 합집합80%·같은 source/HEAD/lock/image·필수 type/lint/format·비밀/SAST/의존성·offline CDK/인프라·격리 runtime 보안을 판정한다. 평균/좁은 분모/오래된 보고서/실패·취소·skip/누락/같은 key 다른 증거는 차단한다. 작성 apps/packages/infra/scripts 전체를 포함하고 생성 .d.ts/.next/dist/cdk.out만 제외한다.

성공 증거는 `.reports/u3/pilot/validation-{u1,u2,u3}.json`·Unit 보고서/coverage evidence·project의 `.reports/u3/pilot/release-validation.json`·최소 aggregate/check/image/security/runtime 결과다. private raw log/scan/trace/credential은 공개 artifact에서 제외하고 이전 실패는 history에 보존한다. `.github/workflows/oms-full-proof.yml`은 원래 full-proof의 명시 manual-only 경로이며 그 U1/U2 중심 원본을 U3 전체 현재 proof로 사용하지 않는다.

## 후속·미해결

원래 AC의7개 Deferred를 유지한다: AC3.1.1 혼합 지급, AC3.1.4 모바일, AC3.2.1–3 자동 판단 전체, AC3.6.2 부분 제공, AC7.5.1 자동 갱신 전체. 첫 배포 부분 구현을 전체 AC 완료로 승격하지 않는다. 수동 갱신 제안/동의는 U6의 정확한 권한/회차 readonly 포트이며 실제 지급/연장 완료가 아니다.

서버 구성 `OMS_U3_RUNTIME_PROFILE=UNREGISTERED`는 미등록 경계를 가진 host만 켠다. 실제 사람/증빙 소유자·U4/U5/U6 준비·U6갱신회차·U7후처리 원본 미등록/UNKNOWN은 차단/HOLD다. 로컬 합성 callback은 운영 생산자 등록 증거가 아니다. U2 Major의 동일인/필수 출처 전역 문제는 해소/위험수용으로 선언하지 않는다.

실데이터 전에 provider/회사망·국내 원본/로그/백업/외부 처리·목적/보관/삭제/정정·실제 알림/운영 복구를 해당 소유자가 확인해야 한다. 저장 동의 receipt는 당시 생산자 검증 근거이며 새 고객 Session/MFA까지 증명하지 않는다. 적용자는 실제 현재 MFA를 사용하고 고객의 현재 소속/권한은 전후 재대조한다. 단말 인증서/승인PC 관리까지 OMS로 확대하지 않는다.

가용성99.9%·첫버전30분 복구 목표, 향후10분 복구/무중단 배포와 전체 RPO0·p95/용량·100k/50분·재해/야간 복구·실제 알림·모바일/영어 실증은 별도 후속이다. controlled crash/100행/byte/경쟁/보호 재연을 대량 트래픽·전체 DR 증거로 부르지 않는다. 현재 코드 연결·동일소스 품질/80%·실제 CI·공식 리뷰/단계 완료·실배포/실거래 준비를 각각 판정한다.
