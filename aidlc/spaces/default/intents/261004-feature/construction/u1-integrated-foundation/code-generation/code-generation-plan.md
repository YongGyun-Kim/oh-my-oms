# U1 Code Generation Plan

**Unit:** u1-integrated-foundation
**상태:** 구현 전 검토용 계획. Plan Approval 전에는 제품 소스·패키지 설치·DB migration·AWS 자원 생성·외부 발송을 시작하지 않는다.

## Scope and Acceptance

U1은 승인된 첫 통합 실행 기반이다. 고객/직원 인증·필수 MFA, 기업 신청/확인·기업 승인과 별도 최초 관리자 지정, 최소 조직/행위 권한, 직원 상품 등록, HW/SW 별도 다품목 주문의 지속 접수·전체 확인 대기, 원래 접수/진행 조회, 필요한 worker·최소 화면/통지를 연결한다. 공유 업무 핵심과 고객 Next UI/BFF·직원 Next UI/BFF·NestJS+Express API·Nest standalone worker의 4개 실행 역할을 유지한다.

주 책임 스토리는 US1.1·US1.2·US3.3이며 AC1.1.1–3, AC1.2.1–3, AC3.3.1–3의 9개 기준을 직접 구현/검증한다. Functional Design에 연결된 공통/협력 AC 52개는 해당 U1 부분과 후속 소유자의 남은 범위를 구분한다. 61개 AC의 30개 OK·31개 Deferred라는 상위 설계 분류를 제품 시험 통과로 옮기지 않는다. 62개 세부 NFR과 BR1.1–BR8.4 및 BR3.8을 실제 소스/시험·미해결 조건에 추적한다.

금융/재고 예약·HW 출고/배송·SW 발급/기간/갱신의 완성은 U3–U7, 전체 화면은 U8/U9, 전체 운영 실증은 U10과 관련 운영 단계가 소유한다. 미등록 계약/공급/대금/발급 포트는 미등록·미확인으로 유지하고 실제 성공을 반환하는 stub으로 대체하지 않는다. 기본 FULL·명시적 PARTIAL 동의와 전체 수락 판단은 기존 규칙을 유지한다.

## Workspace and Ownership

| 예정 경로 | 책임 |
|---|---|
| apps/customer-web | 고객 Next App Router·React·TypeScript 화면/BFF. CUSTOMER operation만 중계 |
| apps/staff-web | 직원 Next 화면/BFF. 직원망·STAFF·현재 행위 권한 경계 |
| apps/api | NestJS Express 진입점·canonical HTTP/Problem Details·owner 호출 |
| apps/worker | Nest standalone 진입점·보호 Outbox relay·등록 consumer |
| packages/contracts | 공통 canonical schema2020-12·operation/version registry·CE01–04 |
| packages/core | IdentityRecovery·EnterpriseAccess·ProductCatalog·OrderAcceptance·WorkInquiry·NotificationDelivery의 U1 구현 |
| packages/persistence | TypeORM Entity/DataSource/migration·원자 기록·별도 journal·보호 가시성/복구 |
| packages/integrations | Cognito·SQS·통지·관측의 명시적 adapter와 신뢰 경계 |
| packages/ui | 한국어 메시지/입력·오류/상태·공유 PC 컴포넌트 |
| infra/cdk | 한 AWS Account·4개 Fargate 역할·서로 다른 AZ의 별도 Single-AZ PG 등 확인된 인프라의 구성 코드 |
| tests/u1, scripts/u1, docs/u1 | 이 Unit의 시험·시연·검증/준비/복구 지침과 증거 |

npm workspaces를 구성 후보로 사용하며 추가 monorepo 제품이나 도메인 microservice를 요구하지 않는다. 경로는 이번 구현 계획의 제안이며 기존 제품 경로라는 주장이 아니다. 애플리케이션 소스는 저장소 루트에 두고 이 기록 디렉터리는 계획/승인/요약/추적만 보관한다. main 기준의 짧은 작업 브랜치·본인 검토·squash 원칙을 따른다. 다른 사람이 수정한 파일을 되돌리지 않는다. 첫 구현에 필요한 기존 자료는 읽고, 검토가 완료된 설계/리뷰/상태·감사 기록을 직접 변경하지 않는다.

## Implementation Readiness

Plan Approval은 아래 미확인을 해결했다는 증거가 아니다. Step 1에서 각 항목의 확인 자료·지원·선택 값·담당·차단 대상과 상태를 docs/u1/readiness.md에 기록한다. 관련 구현 전에 조건을 확인하며 사용자에게 필요한 사업/실제 환경 정보는 해당 작업을 멈추고 질문한다. 불명 값을 실거래 정책으로 발명하거나 먼저 구현한 뒤 승인된 것으로 표시하지 않는다.

| Gate | 구현 전 필요한 것 | 미확인 처리 |
|---|---|---|
| CG-R01 | Node/TS/Next/React/Nest/Express/TypeORM/pg/CDK/PG·Ajv2020·test/검사/TLS/OTel의 exact versions, OS, 지원·peer/engine·보안 근거 | 관련 제품 소스·handler/도구 실행 전에 조합과 lock을 확정. latest라는 이유만으로 선택하지 않음 |
| CG-R02 | C00–C26 중 U1 실제 사용 계약·CE01–04·organisationRevision/Work correlationId/provider binding·복구 payload의 등록/required/null/호환 | 기존 closed schema에 새 필드를 조용히 추가하지 않음. version/producer/consumer·복구 decoder 대조 전 binding 없음 |
| CG-R03 | Cognito 고객/직원 pool·challenge/TOTP/복구 지원·binding 전환, 초기 직원 최소 grant와 기업/첫 관리자 확인 profile | 콘솔 준비 선택 유지. 실제 정책 또는 명시적 합성 profile을 먼저 확인. 실제 신원/기업 확인·권한 준비 완료라고 주장하지 않음 |
| CG-R04 | 요청/응답/문자열/주문 항목/필터·pool/consumer/fanout/buffer·deadline/drain의 유한 값과 전체 replica 합계 | 시험 최대50품목·목록 최대100을 주문 제품 한도로 전용하지 않음. 새 사업 한도는 사용자 확인 필요 |
| CG-R05 | 실제 회사 사설 ingress/신뢰 전달/TLS·host/cookie/CSRF·회수 경계 및 실제 AWS 지역/Account/AZ/role | 합성 격리 경계와 실제 회사망을 구분. 준비되지 않은 직원 공개 fallback·MDM/단말CA 추가 없음 |
| CG-R06 | PG/journal 전체 상태 재구성·순서/prefix·DDL/role/backup/key·보안 회수/파기·epoch/fence의 구현 명세 | 보호 전 ACK·공개/relay/외부 효과 금지. 일반 앱에 원장 기존 entry 변경/관리 권한 없음 |
| CG-R07 | 국내 저장/처리·실제 보관/파기·통지/Slack/SNS/관측의 자료/수신자/지원·비용 | 실제 민감 자료/외부 발송/운영 활성화 차단. 합성 fixture를 actual 합의·전달 결과로 쓰지 않음 |
| CG-R08 | U1 통합 시연·실제 provider/접속 시험의 실행 가능 환경/명령과 미실행 판정 | 계약/단위 시험을 실제 Cognito·직원망·AWS 장애·30일 가용성·RPO/RTO 실증으로 바꾸지 않음 |

2026-10-08 공식 자료에서 관측한 검증 후보는 Node24.21.0(LTS), Next16.4.0, React19.3.0, Nest12.0.3, Express5.2.1, TypeORM1.1.1, TypeScript7.0.2다. 후보의 발행 사실만 확인한 것이며 이 조합의 decorator/compiler API·Nest/ORM·Next/검사 도구·OS 호환, advisory·RDS minor 지원과 모든 나머지 exact version은 아직 검증하지 않았다. 특히 새 TypeScript/TypeORM major를 자동 적용하지 않는다. CG-R01에서 지원되는 조합과 실제 명령을 확정한 후 제품 파일을 생성한다.

## Ordered Implementation Steps

각 구현 계층을 구현한 다음 그 계층의 시험을 작성/실행한다. 아래 순서와 Testing Contract를 함께 준수하고 실행한 단계만 체크한다. 선행 조건·필수 시험·보고서가 부족하면 중단하고 남은 작업을 명시한다.

- [x] **Step 1 — 준비 조건과 지원 조합 확인.** CG-R01–08과 ND-RG01–10/IG-01–08을 대조한다. 공식 package metadata/지원·실제 사용 조건·schema/필드·유한 config와 합성/실제 profile을 확정하고 불명 항목의 담당/차단을 기록한다. 소스 생성 전 버전·계약·필요 정책을 확인한다.
- [x] **Step 2 — 구조·runner 준비.** 확인한 버전으로 4개 app/공유 package의 production 구성과 npm lock·TS/format/lint를 만들고 U1 전용 Vitest/Playwright·커버리지 설정과 아래 명령을 준비한다. 첫 실행 시험 전에 runner/환경/단위 filter가 동작해야 한다.
- [x] **Step 3 — 계약/레지스트리 구현.** C00/C01/C02/C03/C05/C10/C11/C13–C21/C25의 U1 접점과 필요한 공통 타입을 기존 source에서 연결한다. CE01–04·provider binding·지속 correlationId·조직 개정/복구 확장을 명시적으로 등록하고 HTTP/worker 같은 canonical 검증을 사용한다.
- [x] **Step 4 — 계약 시험.** tests/u1/unit/contracts.spec.ts와 tests/u1/integration/contract-bindings.spec.ts에서 required/null/unknown input·Money/date·enum·owner/audience/operation/version·CE01–04·old/new producer/consumer와 복구 decoder를 검증한다. 미등록 handler의 성공 binding을 금지한다.
- [x] **Step 5 — DB 모델/migration 구현.** entities.md의 U1 원본·관계와 상위 ND 매핑을 TypeORM으로 구현한다. 같은 EntityManager/QueryRunner transaction을 사용하고 journal은 별도 DataSource/DB/자격이다. organisationRevision=Enterprise.revision, sourceFactRef NULL에서도 원래 Work correlationId를 보존한다.
- [x] **Step 6 — 모델/DB 시험.** tests/u1/unit/models.spec.ts와 tests/u1/integration/postgres-models.spec.ts에서 실제 PostgreSQL의 FK/unique/NULL/expectedRevision·Money 정밀도·migration과 app/journal/DDL 역할을 검증한다. in-memory DB로 PG transaction proof를 대체하지 않는다.
- [x] **Step 7 — 원자 저장/보호 원장 구현.** business/Receipt/history/필요 Work/Fact/Outbox/완전 RecoveryCandidate를 같은 primary transaction에 기록한다. epoch/counter의 실제 commit 순서·별도 durable journal·연속 prefix·내용/참조·보호 가시성·복구/원래 ID 대조를 구현한다. 외부 DB 대기 중 primary lock을 유지하거나 2PC로 표현하지 않는다.
- [x] **Step 8 — 저장/복구 시험.** tests/u1/integration/protected-receipts.spec.ts 및 recovery.spec.ts에서 primary/journal/표지/응답 전후 종료·보호 gap/충돌·나중 ACK·오삭제/정정/권한 회수·파기 marker·key/effect 보존과 old epoch 차단을 시험한다. 보호 전 조회/ACK/relay/효과가 없어야 한다.
- [x] **Step 9 — 신원/기업 접근 구현.** Cognito adapter·안정 Account/binding·실제 password/TOTP 목적/상태·사전 복구 코드 발급/보관 확인·최소 session/current grant/CSRF를 구현한다. 기업 신청/승인과 CE02 최초 지정, CE01 정책·조직/역할 최소 경로를 연결한다. 전체 복구/역할 확장은 U2 범위로 구분한다.
- [x] **Step 10 — 신원/권한 시험.** tests/u1/unit/identity.spec.ts, enterprise-access.spec.ts 및 integration/auth-access.spec.ts에서 불완전 MFA·audience/목적·같은 행위 scope 합집합/Cartesian 거절·타기업 비노출·UNSET/NULL/폐지 조직·회수/조직 변경 경합·관리/거래 권한 분리·최초 지정의 별도 권한을 검증한다. 실제 provider 시험의 미실행을 통과로 처리하지 않는다.
- [x] **Step 11 — 상품/주문/조회/최소 통지 구현.** 직원만 상품을 등록하고 HW/SW별 다품목·원래 조건/targetScope·idempotency·전체 REVIEW_REQUIRED/사유를 기록한다. CE03/04와 현재 권한의 원래 접수/이력/최소 통지를 연결한다. 미확인 가격/계약/납기/공급/금액을 가짜 값/0원/KNOWN으로 채우지 않는다.
- [x] **Step 12 — 업무 규칙 시험.** tests/u1/unit/catalog.spec.ts, order-acceptance.spec.ts, work-inquiry.spec.ts, notification.spec.ts 및 integration/business-flow.spec.ts에서 9개 주 책임 AC·공통 U1 기준과 BR를 검증한다. 같은 키/다른 내용409·부분 확인에도 전체 대기·초과/무효 입력·현재 정보 권한을 포함한다.
- [x] **Step 13 — relay/worker/외부 adapter 구현.** 보호 Outbox만 SQS Standard에 전달하고 원래 Work/consumer/permit·현재 위임/SYSTEM·lease/fence·expectedRevision·consumer marker/효과·누적 attempt/deadline를 적용한다. unknown external result는 원래 operation 대조를 먼저 하고 SDK retry/queue copy가 횟수/업무 ID를 초기화하지 않는다.
- [x] **Step 14 — worker/adapter 시험.** tests/u1/unit/worker.spec.ts, adapters.spec.ts 및 integration/outbox-worker.spec.ts에서 send/표지/consumer 종료·중복/역순·권한 회수·old epoch·미등록 handler·원래 기한·최초+추가3/5분/30초·jitter·접점 전체 HALF_OPEN1개·DLQ/unknown 대조를 검증한다.
- [x] **Step 15 — HTTP/API 구현.** Nest Express에 CUSTOMER/STAFF/public 목적의 등록 operation·canonical 입력/출력·실제 status/RFC9457·현재 신원/target/commit 권한·deadline/한도·liveness/readiness를 연결한다. worker에 HTTP guard가 자동 적용된다고 가정하지 않는다.
- [x] **Step 16 — API 시험.** tests/u1/unit/http.spec.ts와 integration/http-boundaries.spec.ts에서 400/401/403/404/409/429/503·잘못된 origin/CSRF·client principal/role/직원망 위조·처리 불명/응답 유실·허용 조회/보호 변경의 readiness 분리를 검증한다.
- [x] **Step 17 — 고객/직원 최소 PC 화면/BFF 구현.** 인증/MFA·기업 신청/결과·직원 확인/별도 지정·고객 조직/역할·상품/주문 제출·원래 접수/전체 대기 조회를 실제 API와 연결한다. ko-KR/KRW/Asia/Seoul·1280+·직원 모바일 제외·label/focus/오류·no-store/host-bound cookie/현재 권한과 late response 차단을 구현한다.
- [x] **Step 18 — 화면/접근성 시험.** tests/u1/unit/customer-ui.spec.tsx, staff-ui.spec.tsx 및 e2e/customer.spec.ts, staff.spec.ts, accessibility.spec.ts에서 1280 PC·키보드/zoom/reflow·타기업/계정 전환·세션 회수·보호 RSC/cache·30초/최대10분20회 polling/idle 미연장을 확인한다. 모의 권한을 실제 회사망 증거로 표시하지 않는다.
- [x] **Step 19 — 실행/인프라/배포 구성 구현.** Docker/합성 개발 환경, 확인된 AWS/CDK 구성·4역할/Fargate·공개/사설 NLB·검증 TLS·2개 PG/별도 AZ·SQS/DLQ·Secrets/IAM·유한 replica/pool/drain·image/schema identity·staging 자동/운영 수동·조건부 안전 rollback을 연결한다. 자원 생성/운영 배포는 별도 승인 절차다.
- [x] **Step 20 — 구성/관측 시험.** tests/u1/unit/config.spec.ts, infrastructure.spec.ts, telemetry.spec.ts와 integration/deployment-compatibility.spec.ts에서 SG/직접 우회·권한/비밀·원장 DDL 보호·old/new decoder·drain/rollback·유한 trace buffer/redaction·같은 correlationId·준비/오류 상태를 검증한다. U10 독립 운영 감지/Slack+SNS email/명시ACK의 최소 연결과 남은 실제 증거를 구분한다.
- [x] **Step 21 — 통합 시연/필수 검사.** 합성 기업2개·고객/직원 각 최소 역할로 MFA→신청→승인→별도 지정→조직/권한→직원 상품→HW/SW별 주문→보호 접수/전체 대기→worker/원래 ID 조회·재기동 보존·타기업 거절을 실행한다. AC별·NFR별 unit/integration/E2E·필수 보안/부하/복구 보고서를 수집한다.
- [-] **Step 22 — 인계/추적/완료 검증.** 실제 쓴 source-manifest.json·code-summary.md·traceability.json과 docs/u1 실행/복구/미해결 지침을 작성한다. 모든 assigned AC/62개 NFR/34개 BR의 실제 파일 또는 이유/후속 소유자를 연결한다. 구성/커버리지/필수보고서·독립 리뷰 후 Unit 완료를 확인하고 실제 통합 검증 명령·최초 동작의 사용자 확인은 별도 절차를 따른다.

## Step and Story Traceability

| 스토리/범위 | 계획 단계 | 관찰 결과 |
|---|---|---|
| US1.1 / AC1.1.1–3 | 3–10,15–18,21 | 자기 신청 지속 기록·미승인 주문 거절·타기업/다른 신청자 비노출 |
| US1.2 / AC1.2.1–3 | 3–10,15–18,21 | 확인 근거/권한별 기업 승인·별도 최초 관리자 지정·불명 근거 승인 금지 |
| US3.3 / AC3.3.1–3 | 3–8,11–18,21 | 사유별 전체 검토 대기·일부 확인만으로 부분 수락 없음·직원 정보 권한 |
| U1 공통 신원/조직/상품/주문/이력·통지 | 3–18 | FD trace의 OK 부분 구현·후속 Unit의 전체 완료와 구분 |
| 62개 NFR / ND·IG gate | 1–22 | 구현·시험·운영 증거의 상태와 차단 조건을 각각 추적 |

## Test Execution and Completion

unit-test-instructions.md의 U1 전용 명령만 사용한다. 각 해당 계층의 기본 정상과 최소2개 오류/경계, Standard의 논리 컴포넌트별5–8개 기본 시험과 필요 계약/동시/보안/복구/E2E를 준비한다. 직접 작성한 테스트 가능한 제품 코드 전체(미실행 파일 포함)의 line coverage80% 하한을 유지한다. 숫자 충족만으로 AC/8영역 정확성·실연동 통과를 주장하지 않는다.

원래 접수/효과·권한 누출·중복/유실은 정의한 시험에서0건이다. 정상 부하 HTTP 조회p95 1초/변경2초·기술오류0.1%/화면3초/eligible 작업첫시작10초·20→100→20 합성 profile·기한/복구 조건을 유지한다. 실제99.9%/30분/RPO0/한사람 작업·국내 저장의 운영 증거는 관련 별도 검증과 구분한다. 시험을 누락하거나 flaky 우연 통과/하한 완화로 완료하지 않는다.

완료 시 실제 구현/검사 결과·파일과 남은 조건만 보고하고, source-manifest는 생성기/쉘/수정/삭제로 변경한 제품 경로도 모두 선언한다. OK target은 실제 파일 하나다. 현재 계획 단계에서는 code-summary/source-manifest/구현 trace의 완료 값을 미리 생성하지 않는다.

## Testing Contract

```json
{
  "version": 1,
  "methodology": "test-after",
  "source": "team",
  "ordering": "테스트 가능한 각 계층을 구현한 뒤 그 계층의 테스트를 작성하고 실행한다. [Q3]",
  "scope": "feature",
  "test_strategy": "standard",
  "project_type": "greenfield",
  "applicable_notes": [
    {
      "layer": "org",
      "text": "We treat tests as a first-class deliverable in every Bolt. The specific\nmethodology (TDD, BDD, ATDD, or classic test-after) is affirmed at\npractices-discovery and recorded in `team.md` under this heading with explicit\n`Methodology` and `Ordering` fields; Code Generation resolves those fields\nindependently from coverage, tooling, and scope notes.\n\nWhen no posture has been affirmed, our default per scope is:\n- **Methodology**: test-after\n- **Ordering**: implement each applicable testable layer, then write and run\n  that layer's tests.\n- `mvp`, `enterprise`, `feature`, `infra`, `classic` add an 80% line-coverage\n  floor and CI execution before merge.\n- `bugfix`, `security-patch` add a targeted regression for the specific\n  bug/vulnerability and require the existing suite to remain green.\n- `express` uses the Minimal strategy: requirement-driven unit tests (one per\n  requirement, with a happy-path floor per component); existing tests remain\n  green.\n- `poc`, `refactor`, `workshop` add no extra new-test floor and require the\n  existing suite to remain green.\n\nThe active `Test Strategy` still applies in every scope and determines test\nvolume/types. Scope floors are additive; they never reduce or replace the\nselected strategy.\n\nBuild and Test verifies defined coverage floors and affirmed quality targets;\nthey may not be weakened to make a step pass.\n\nAffirm a stricter posture in `team.md` if the team commits to one."
    },
    {
      "layer": "team",
      "text": "- **Methodology**: test-after\n- **Ordering**: 테스트 가능한 각 계층을 구현한 뒤 그 계층의 테스트를 작성하고 실행한다. [Q3]\n- 단위·통합 테스트를 포함하는 `Standard` 전략을 유지하고 병합 전 CI에서 검사한다. [Q3; 현재 실행 설정]\n- 직접 작성한 테스트 가능한 제품 코드 전체에 라인 커버리지 80% 하한을 적용한다. 미실행 제품 파일도 분모에 포함하고 생성물·외부 코드 등의 제외 사유를 기록한다. 수락 기준별 정상·실패·경계 검증을 별도로 추적한다. [Q4]\n- 비밀 유입, 코드 취약 패턴(SAST), 의존성 취약점, CDK·생성 인프라 보안 설정, 격리된 검증 환경과 합성 데이터를 사용하는 실행 중 서비스 보안 검사를 필수 계획에 포함한다. [Q7]\n- 언어·구조가 정해진 뒤 도구·대상·실행 시점·차단 기준을 구체화하고 실제 적용 전에 확인한다. 검사 실패·누락은 Way of Working의 차단 원칙을 따른다. 아직 검사가 구현되거나 통과한 상태로 표시하지 않는다. [Q7–Q8]"
    }
  ],
  "obligations": {
    "strategy": "standard",
    "strategy_volume": [
      "Five to eight tests per component.",
      "Unit tests plus integration tests for key boundaries.",
      "Add E2E, performance, or security tests when requirements demand them."
    ],
    "scope_floor": [
      "Meet an 80% line-coverage floor.",
      "Run the selected tests in CI before merge."
    ],
    "combination_rule": "Apply every selected-strategy obligation and every scope-floor obligation; neither replaces the other, and a targeted scope regression may add the narrowest necessary test type beyond the strategy default."
  },
  "plan_profile": {
    "methodology": "test-after",
    "runner_step": "Bootstrap the minimal test runner/configuration and record the exact unit-scoped command.",
    "runner_ready_before_first_test": true,
    "testable_layers": [
      "Data model / database behavior",
      "Repository / data access",
      "Business logic",
      "API / endpoint",
      "Frontend behavior"
    ],
    "steps": [
      "Project structure and production configuration skeleton.",
      "Bootstrap the minimal test runner/configuration and record the exact unit-scoped command.",
      "Data model / database behavior - implement.",
      "Data model / database behavior - write and run its tests after implementation.",
      "Repository / data access - implement.",
      "Repository / data access - write and run its tests after implementation.",
      "Business logic - implement.",
      "Business logic - write and run its tests after implementation.",
      "API / endpoint - implement.",
      "API / endpoint - write and run its tests after implementation.",
      "Frontend behavior - implement.",
      "Frontend behavior - write and run its tests after implementation.",
      "Environment/build configuration.",
      "Documentation and traceability."
    ]
  },
  "input_sha256": "sha256:f0f09f6d1b55c87564cb3db20873ab60f5b42924e0726c0b5089998b3080bfed",
  "contract_sha256": "sha256:13f152f4c3058c2b60200db7b5b96fba74e7d312052a9fb0e92c883f68c5628b"
}
```

## Assumptions & Open Questions

- [assumption] 제안한 npm workspace/경로와 공유 핵심이 1명의 개발·기술 운영에 적합하다. 실제 시간/부하/비용·회수/복구 검증 전이다.
- 지원 조합·exact version·유한 정책/자원 값·canonical 확장, 실제 Cognito/직원망/기업 확인·국내 저장/수명/통지 정보는 CG-R01–08에서 해당 구현/적용 전에 확인한다. 공개 release 후보를 최종 호환 조합으로 단정하지 않는다.
- 주문당 상품 항목 상한은 기존 자료에 확정돼 있지 않다. 시험50품목/목록100은 대체 값이 아니다. 사업 제한을 새로 정해야 하면 사용자에게 묻고 계약/시험에 연결한다.
- actual 통합에 필요한 계정/서비스/비밀·사업 확인자·알림 수신자·환경이 없으면 그 경로를 중단한다. 합성 확인과 실제 준비를 별도로 기록하고 해당 미실행을 성공으로 처리하지 않는다.
- 이 Plan Approval은 실제 자원 생성·운영 배포·고객 데이터 처리·외부 발송 또는 다른 Unit 완료의 승인이 아니다. 기존 실행/배포 절차와 사용자 승인 범위를 따른다.

## Sources

- [Unit 정의](../../../inception/units-generation/unit-of-work.md), [스토리 할당](../../../inception/units-generation/unit-of-work-story-map.md), [requirements](../../../inception/requirements-analysis/requirements.md), [stories](../../../inception/user-stories/stories.md)
- [functional spec](../functional-design/functional-spec.md), [entities](../functional-design/entities.md), [rules](../functional-design/rules.md), [FD trace](../functional-design/traceability.json)
- [contracts](../../../inception/contract-design/contract-summary.md), [component ownership](../../../inception/domain-design/components.md)
- [NFR 원본](../nfr-requirements/tech-stack-decisions.md), [logical components/readiness](../nfr-design/logical-components.md), [performance](../nfr-design/performance-design.md), [security](../nfr-design/security-design.md), [reliability](../nfr-design/reliability-design.md), [scalability](../nfr-design/scalability-design.md), [observability](../nfr-design/observability-design.md), [NFR trace](../nfr-design/traceability.json)
- [infrastructure](../infrastructure-design/infrastructure-specification.md), [monitoring](../infrastructure-design/monitoring-design.md), [CI/CD](../infrastructure-design/cicd-pipeline.md)
- Testing Contract는 aidlc engine testing-posture render의 출력 전체를 위에 변경 없이 삽입했다. source=team·methodology=test-after·strategy=standard·80% 하한이다.
- 발행 관측 후보: [Node releases](https://nodejs.org/en/about/previous-releases), [Next npm](https://registry.npmjs.org/next/latest), [React npm](https://registry.npmjs.org/react/latest), [Express npm](https://registry.npmjs.org/express/latest), [TypeScript npm](https://registry.npmjs.org/typescript/latest), [Nest releases](https://github.com/nestjs/nest/releases), [TypeORM releases](https://github.com/typeorm/typeorm/releases). 확인일2026-10-08이며 실제 lock/조합·지원/보안 proof는 CG-R01에서 별도로 확보한다.
