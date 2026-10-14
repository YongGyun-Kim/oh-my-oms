# U3 테스트 실행 지침

## 상태와 실행 전제

현재 tests/u3 runner·fixture·계층별 시험·host/worker·pilot-current가 구현되어 있다. 원래 20단계의 구현·검사 이력과 이번 공개 예외 보완의 Step21–24를 구분한다. 현재 실행에 전달한 실제 계획/지침과 Testing Contract는 .aidlc-engine/u3-current-execution-brief-20261013.md에 보존한다. 인간의 답변/fingerprint를 재발행하거나 허용된 후속 문구 정리까지 새로 승인받았다고 표현하지 않는다. 수정 전 전체 CI 성공은 품질 기록에 보존하며 이번 수정 후 source의 전체 품질/보안·3기여80%·실제 CI 결과와 별도 완료 검증을 새로 확인한다.

원본 Testing Contract는 계획에 있으며 test-after / Standard를 따른다. Node 22.23.3·npm 10.9.9와 repository의 exact lockfile/기존 Vitest·Ajv·TypeORM을 사용한다. PATH의 원래 aidlc만 프레임워크 명령에 사용한다. 새 패키지/제공자를 임의 설치하거나 테스트 하한을 변경하지 않는다.

## Unit-Scoped Commands

아래 명령은 **U3만** 실행한다. 로컬은 Node22.23.3을 PATH 선두에 두고 명시 격리 profile/기존 소유 DB를 사용한다. 빈 runner 통과를 허용하지 않고 각 설정의 include는 tests/u3 경로로 고정한다. U1/U2 회귀와 전체 집계는 별도 CI job이 맡으며 Unit마다 프로젝트 전체 suite를 반복 실행하지 않는다.

| 순서/용도                            | 정확 명령                                                                                                                                                                       | 대상/증거                                                                          |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| U3 unit runner 준비 확인과 단위 시험 | `npx --no-install vitest run --config tests/u3/vitest.unit.config.ts`                                                                                                           | tests/u3/unit/*.spec.ts, .reports/u3/unit.json                                     |
| 격리 U3 DB 준비                      | `node --import tsx scripts/u3/prepare-test-databases.ts`                                                                                                                        | 명시 로컬 합성 DB/profile·최소 역할 준비. 실제/다른 namespace reset 금지           |
| U3 통합 시험                         | `OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts`                                                      | tests/u3/integration/*.spec.ts, .reports/u3/integration.json                       |
| U3 커버리지 기여                     | `OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.coverage.config.ts --coverage`                                              | U3 unit/integration, .reports/u3/coverage의 현재 source/기여 증거                  |
| U3 계약/값 선택 검증                 | `npx --no-install vitest run --config tests/u3/vitest.unit.config.ts tests/u3/unit/contracts.spec.ts`                                                                           | Step 4의 runtime schema/등록/정확 값 사례                                          |
| U3 migration 선택 검증               | `OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/migration-compatibility.spec.ts` | Step 6의 신규/구형 원본·명시 DDL/decoder                                           |
| U3 저장/실패 선택 검증               | `OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/repository-boundaries.spec.ts`   | Step 8의 원자/보호/재전송·동시성                                                   |
| U3 HTTP 왕복 선택 검증               | `OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/http-host.spec.ts`               | Step 16의 실제 host/byte/parser/권한·버전·결과                                     |
| U3 worker 전달 선택 검증             | `OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/worker-handoff.spec.ts`          | Step 16의 확정 사실·소비/중복·역순·미확인                                          |
| U3 pilot 기여                        | `NODE_ENV=test OMS_U2_SYNTHETIC_PROFILE=approved-local-only NEXT_TELEMETRY_DISABLED=1 node --import tsx scripts/u3/ci-pilot-proof.ts u3`                                        | 현재 U3 unit/integration/whole coverage 증거, .reports/u3/pilot/validation-u3.json |

선택 실행은 전체 U3 suite 성공을 대신하지 않는다. scripts/config·명령/출력/보고서와 현재 source를 대조한다. 통합18파일 순차·passWithNoTests:false·test/hook30초·격리 profile과 서비스/DB 예산은 유지한다. pilot U3 integration child만20분, whole coverage child만30분이며 다른 명령의 기본/legacy 예산은 변경하지 않는다. 600초 실패의 전체 실행량이 예산 수정 근거다. coverage30분은 V8를 포함한 유한 수집 한도이며 운영 처리 목표가 아니다. 실제 결과는 해당 source의 보고서로 확인하고 DB 준비 실패는 통합 미실행으로 남긴다.

## Required Cases and Acceptance

각 논리 컴포넌트는 Standard의 5–8개 이상 핵심 정상·오류·경계 시험을 갖고, 다음 독립 수락/실패 경로를 빠짐없이 분담한다. 숫자가 케이스 상한은 아니며 필수 불변조건을 줄이는 이유가 아니다.

| 파일/계층                                                                                                                     | 꼭 확인할 결과                                                                                                                                                      |
| ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| unit/contracts.spec.ts                                                                                                        | 기존 common:1/common:2 유지와 U3 profile 개정2/registry3의 명시 매핑, closed field·Ref/enum·TargetScope·행별 개정 합집합·변경 두 분기·producer 검증                 |
| unit/catalog.spec.ts                                                                                                          | 직원/내부망/현재 action·타입/기간·필수 조건·정수 금액·타 기업 공개/가격 비노출·현재 offer와 최초 조건 보존                                                          |
| integration/commercial-agreement.spec.ts·commercial-owner-port.spec.ts·commercial-change-request.spec.ts                      | 등록/변경 요청·정확 다른 사람·오래된/목적/출처/권위 불일치·승인자 부재·중첩 충돌 차단/정상 기업 우선·이력                                                           |
| unit/proposal-terms.spec.ts·renewal-source.spec.ts·integration/commercial-proposal.spec.ts·customer-consent-authority.spec.ts | 원래/새 조건·실제 동의 권한 producer/grant·수정된 제안에 이전 동의 거절·수동 갱신 권한/회차/기업 대조·알림은 동의/연장 아님                                         |
| integration/order-submission.spec.ts·order-decision.spec.ts                                                                   | HW/SW 분리·동일 SW 영구/기간제·단일 지급/FULL·1/100행 및0/101·양수 정수 수량·전체 REVIEW/수락/거절/HOLD·구매 당시 조건/기간                                         |
| unit/order-price.spec.ts                                                                                                      | 정확 원 단위 합계·범위 초과/소수·포함 세금·추가 항목/할인 중복·미확인과0원/적용 없음·음수 합계·새 금액의 동의                                                       |
| unit/order-change-input.spec.ts·after-sales-source.spec.ts·integration/order-change.spec.ts                                   | REVIEW_PRICE_CHANGE와 명시 null U7 원본 / ACCEPTED_AFTERSALES_CHANGE와 확인 U7 원본, 정확 동의/대상/expectedRevision·이전 스냅샷 불변·적용→다음 제안·수락/적용 경쟁 |
| integration/migration-compatibility.spec.ts                                                                                   | 동명 current 모델 중복 없음·18개 논리 모델 매핑·명시 DDL/역할·구형/신규 원본·보호 payload/decoder·미확인 임의 backfill 금지·새 접수 유실 rollback 금지              |
| integration/repository-boundaries.spec.ts                                                                                     | primary atomic commit와 별도 보호 ack·commit 전/후 실패/응답 유실·원래 요청 조회·same/different input key·동시성/권한·근거 개정/복구 세대                           |
| integration/order-submission.spec.ts·order-decision.spec.ts·order-change.spec.ts                                              | 상품→기업 계약/다른 승인→주문 전체 검토/수락→새 가격 제안/고객 동의/적용의 실제 도메인/저장 연결, 부분 준비/외부 원본 조회 실패 HOLD                                |
| integration/http-host.spec.ts·in-process-host.spec.ts·owner-query.spec.ts                                                     | 실제 schema/route/binding input/response·서버 version 선택·legacy 변경 경로 우회 차단·MFA/CSRF/직원망·타 기업·1MiB 이하/초과/압축 및 다른64KiB·원래 결과            |
| integration/worker-handoff.spec.ts                                                                                            | current 원본/operation/event/work/version·동일 사실 재전달 효과 한 번·역순/상충·malformed/미확인 처리, U4/U5/U6/U7 원본 소유 유지                                   |
| unit/pilot-ci.spec.ts·pilot-coverage.spec.ts                                                                                  | pilot-current/full-proof 의미·필수 job 실패/취소/skip/누락·source/SHA/보고서 mismatch·전체 분모/합집합·80%·오래된 image/coverage·후속을PASS로 바꾸지 않음           |

현재 계획의 baseline에서 모든 케이스를 이미 실행했다고 주장하지 않는다. 금액·상태·원본/권한·중복 불변조건 위반 목표는 0건이며 기술 오류0.1%를 허용 거래 오류율로 적용하지 않는다. 통지/직원 수락·동의와 실제 지급/예약/출고/발급/연장은 각각 다른 사실이다.

## Fixture, Mocking and Data Boundaries

합성 기업 A/B·현재 직원/등록자/검증된 다른 승인자·동일인/UNKNOWN·회수/만료·정확한 원본 개정과 목적/출처/권위의 fixture를 사용한다. clock/queue·외부 원본 port를 주입하고 실패/timeout/미확인/상충을 제어한다. business repository를 mock한 단위 결과만으로 실제 primary/보호 DB 원자성·현재 개정 대조 통과를 선언하지 않는다. 그 경계는 별도 통합 시험으로 확인한다.

DB/profile 이름은 U3 전용 oms_u3_verification/oms_u3_journal_verification로 고정하고 현재 localSynthetic·loopback·실제 DB 이름을 확인한 격리 경로만 초기화한다. CI 각 job은 독립 namespace/report를 사용한다. U1/U2/다른 프로젝트/실계정/실데이터를 준비 대상으로 선택하지 않는다. 합성 secrets는 일반 로그/trace/CI 업로드에서 제외하고 실제 credential을 fixture에 넣지 않는다.

U4/U5/U6/U7 미구현/미등록 원본은 기본 UNKNOWN/HOLD다. 정상 합성 원본은 owner/entity·정확한 대상/개정·현재 보호 근거와 연결하고 실제 외부 이행/사업 근거라고 주장하지 않는다. 실제 U2 사람/출처 검증의 기존 미해결을 모의 DIFFERENT 값으로 해결 표시하지 않는다.

## Coverage, Security and Report Meaning

U3 coverage config의 테스트 include는 U3만이지만 coverage inventory는 U1/U2/U3의 같은 전체 작성 제품 파일을 사용한다. 미실행 파일도 분모에 남긴다. U3의 개별 퍼센트는 기여이며 전체 80% 통과 판정은 같은 source/파일 실행 라인의 합집합 집계가 맡는다. 새 scripts/u3도 제품 inventory에 포함하고 생성물/외부 코드 제외 근거를 공개한다. 평균 퍼센트/좁은 분모/과거 source 보고서로 대체하지 않는다.

필수 type/lint/format·비밀/SAST/의존성·CDK/생성 template·image/격리 runtime 보안 검사는 실제 변경에 맞는 shared CI/검사 계획으로 수행한다. 이 파일의 unit/integration 명령이 해당 보안 검사를 모두 실행하는 것처럼 표시하지 않는다. 실패·미실행·보고서 누락은 차단하며 도구/설치/디스크·네트워크 오류를 제품 PASS로 바꾸지 않는다. 발견/예외는 담당·사유·만료·재검토·해소 근거를 보존한다.

각 실행은 명령·시간·exit/취소·대상/모드·source/lock/inventory·보고서 지문·실제 결과를 연결하고 이전 실패 원문을 보존한다. 단순 시험/문서 검사는 Luna에 위임하며, 공식 checkpoint verifier는 주 실행자가 맡는다. 실패 원인을 확인·수정한 뒤 의미 있는 재검증을 수행하고 실패를 우연한 반복 통과로 치환하지 않는다.

## Deferred and Separate Verification

100행 byte/DB 경계·제어된 crash/queue 중복·동시 변경 시험은 제품 정확성 검증이며 대량 부하·전체 재해 복구 실증이 아니다. 본 명령들은 100k 준비/50분 부하·기존 시간 하한 FAIL 재실행·전체 DR·무중단·30일 가용성/장기 운영 실증을 호출하지 않는다. 기존 full-proof 결과/미실증/보류는 그대로 유지한다.

동시 사용자·짧은 파일럿 부하의 정확 조건/기간은 해당 시험 설계에서 확인한다. 하루1,000건을 임의 초당 요청/동시 사용자 수로 환산해 달성했다고 표시하지 않는다. U3 전면 PC UI는 U8/U9, 실제 provider/회사망/국내 원본·로그/백업·알림/배포 준비는 해당 소유자의 실증 책임이다. 문서·합성/CI 시험 성공은 그 선행조건을 면제하지 않는다.

## 공개 예외의 추가 회귀 검증

현재 보완은 FR4.2·BR1.3의 기존 기업별 공개 예외를 충족하는 작업이다. 새 입력 한도·시간 예산·커버리지 하한·기능 범위는 추가하거나 완화하지 않는다.

| 기존 시험 파일                                                       | 추가로 확인할 관찰                                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| tests/u3/unit/catalog.spec.ts                                        | 완성·유효·공통 비공개 조건은 판매 가능한 상품과 비공개 기본값을 별도로 보존. 실제 중지·미완성·미래·만료는 공개 예외로 우회되지 않음 |
| tests/u3/integration/catalog.spec.ts·commercial-agreement.spec.ts    | 실제 현재 등록/승인 원본의 기업A 공개 예외 조회, 공통 공개+기업 비공개, 기업B·미승인·미래/만료·조회 실패의 비노출/차단              |
| tests/u3/integration/order-submission.spec.ts·order-decision.spec.ts | 승인된 기업A의 공통 비공개 상품 제출→전체 직원 수락, 타 기업/중지/미완성 차단, 조건 개정과 최초 스냅샷 보존                         |
| tests/u3/integration/http-host.spec.ts                               | 실제 호스트에서 기업 최종 조건 조회와 주문 경로의 동일 판단, 권한/직원망/현재 승인 근거 우회·타 기업 정보 노출 없음                 |

선택 단위 명령은 `npx --no-install vitest run --config tests/u3/vitest.unit.config.ts tests/u3/unit/catalog.spec.ts`이다. 선택 통합 명령은 `OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/catalog.spec.ts tests/u3/integration/commercial-agreement.spec.ts tests/u3/integration/order-submission.spec.ts tests/u3/integration/order-decision.spec.ts tests/u3/integration/http-host.spec.ts`이다. pinned Node22.23.3을 PATH에 적용하며 문서의 전체 U3 및 같은 source CI 검증도 별도로 수행한다. 선택 통과를 전체 source/운영 성공으로 승격하지 않는다.

## Sources

- [구현 계획](code-generation-plan.md): 20개 test-after 순서와 실제/예정 source 경계·Testing Contract.
- [기능 명세](../functional-design/functional-spec.md), [업무 규칙](../functional-design/rules.md), [엔티티](../functional-design/entities.md): 42AC/29BR·현재 원본/조건·두 변경 분기.
- [NFR 요구](../nfr-requirements/security-requirements.md), [기술 적용](../nfr-requirements/tech-stack-decisions.md), [보안 설계](../nfr-design/security-design.md), [CI 설계](../infrastructure-design/cicd-pipeline.md): 33 NFR·100행/1MiB·품질/보호·같은source/전체분모.
- [첫 배포 계획](../../../release-planning/first-release-delivery-plan.md): 제한 파일럿과 후속 실증.
