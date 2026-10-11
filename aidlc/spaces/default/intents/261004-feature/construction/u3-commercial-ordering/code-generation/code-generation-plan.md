# U3 첫 배포 구현 계획

## 목적과 승인 범위

U3 ProductCatalog·CommercialAgreement·OrderAcceptance의 제한 파일럿 구현이다. [기능 명세](../functional-design/functional-spec.md)의 12개 US·42개 AC(첫 배포 연결 35, 후속 7), [업무 규칙](../functional-design/rules.md)의 29개 BR, [NFR 요구](../nfr-requirements/security-requirements.md) 및 [기술 적용](../nfr-requirements/tech-stack-decisions.md)의 33개 파생 NFR와 [CI 전달 설계](../infrastructure-design/cicd-pipeline.md)를 사용한다. 단계 체크박스는 아직 수행하지 않은 계획이다.

현재 TypeScript/Nest+Express API/Nest standalone worker·TypeORM/PostgreSQL·보호 DB·Outbox/큐·한 AWS 계정/CDK를 재사용한다. 한국어·KRW 원 단위 정수·100입력행·주문 JSON 1MiB/다른 64KiB·전체 직원 수락·FULL·단일 지급 종류를 구현한다. 신규 AWS 자원·실배포·main 병합, 자동 확정/갱신·혼합 지급·부분 제공·외부 자동 이행, 대량100k/50분·전체 DR/무중단 실증은 이 계획에 넣지 않는다.

아래 계획과 [시험 지침](unit-test-instructions.md)은 초기 Plan Approval 전이다. 승인 전 제품 코드·의존성·테스트/실행 설정을 변경하거나 검사 명령을 실행하지 않는다. 문서 검사는 제품 실행 성공이 아니다. 실제 provider/회사망/국내 경로/사업 근거·U2 신뢰 미해결은 실데이터/실거래 준비의 별도 선행조건이다.

## 현재 코드와 변경 영향

| 확인한 현재 경로 | 적용할 변경 / 영향 |
| --- | --- |
| packages/core/src/catalog.ts·catalog-query.ts | 기존 최소 상품/공통 조건 경로 확장, 기업별 승인 조건은 새 CommercialAgreement 소유자에 연결. 동일 도메인의 복제 구현을 만들지 않음 |
| packages/core/src/order-acceptance.ts·order-review.ts·order-assessment.ts | 현재 REVIEW 접수·단일 계약/미확인 캡처를 모든 행/조건별 원본 스냅샷으로 확장하고 전체 직원 판단·허용 변경을 추가 |
| packages/contracts/src/schema.ts·registry.ts·declarations.ts | 기존 common:1/common:2와 foundation 계약이 등록돼 있고 owner/name/version 키를 사용. 신규 U3 명세를 별도 profile/등록 버전으로 구분하고 기존 계약을 같은 ID로 재정의하지 않음 |
| packages/persistence/src/model-catalog.ts·migration.ts·protected-write.ts | 기존 모델/TypeORM DDL 및 primary→보호 저장 성공 경계 재사용. 동명 모델 중복 append 금지, U3 current decoder/기존 원본 호환·개정/권한 대조 추가 |
| apps/api/src/operations.ts·routes.ts·application.ts·main.ts | 실제 owner 구성·현재 primaryAtomicCommands·라우트/신뢰/등록 연결 및 parser 선택, 접수 미확정/원래 결과 조회 보존 |
| apps/worker/src/main.ts·공통 worker/queue 경로 | 새 도메인별 worker/queue를 만들지 않고 U3의 확정 사실·버전/decoder·중복/역순 검증을 기존 전달 경계에 연결 |
| .github/workflows/u1-validation.yml·scripts/u2/ci-full-proof.ts | 현재 전체 부하/복원 기본 집계를 파일럿과 별도 후속 모드로 구분. 원래 full-proof의 명령/기준·이력은 보존, 파일럿 집계는 새 명시 계약 사용 |

U1/U2 및 UI/다음 Unit이 공통 스키마·호스트·현재 원본/복구 decoder·허용 action·조회 결과의 영향 소비자다. U8/U9 전체 PC 화면은 여기서 구현하지 않는다. U1의 기존 상품/주문 회귀 fixture를 새 계약에 맞게 갱신할 수 있으나 업무/권한 assertion을 약화하지 않는다. 문서/미실행 변경만으로 기존 발견을 Resolved/Accepted risk로 바꾸지 않는다.

## 계약 버전과 구형 원본 처리

U3 기능 설계의 “C00/C05 v2”는 복수 계약 개정·조건 매핑 및 두 changeKind를 담는 U3 명세 개정이다. 현재 source의 common:2와 operation 등록 :2에는 그 변경 이전 형태가 이미 있다. 따라서 새 `urn:oms:contract:u3-commercial:2` profile과 명시적 registry version 3을 사용해 기존 등록과 충돌하지 않게 연결한다. profile 개정 2와 registry 번호 3은 서로 다른 식별 축이며 이를 문서/시험에서 명확하게 표시한다. 현재 common:1/common:2 원본을 U3 필수 의미가 바뀐 같은 URI로 재정의하지 않는다.

HTTP 라우트가 서버측으로 정확한 U3 등록 버전을 선택하며 클라이언트의 version/operation 주장으로 parser·업무 검증을 우회하지 못한다. U3 노출 시 기존 상품/주문 변경 진입을 U3 검증 경로에 연결하거나 거절하고, 구형 경로로 정수 금액/100행/승인/조건 보존을 우회하지 못한다. 이를 기존 U1 PC/API 회귀에서 검증한다. 구형 조회/접수 이력은 그때의 schema/source version을 따라 읽고 새 조건/확정 계약을 임의 추정해 채우지 않는다.

18개 논리 엔티티를 현재 영속 모델/이력 구조와 매핑한다. 기존 모델의 동명 버전은 단일 current 정의와 version-aware legacy decoder로 관리한다. migration은 명시 DDL 권위 아래 수행하고 앱 시작의 synchronize/파괴적 down/전체 원본 삭제를 허용하지 않는다. 이미 존재하는 보호 원본·성공 접수/이력과 queue의 version이 새 decoder에서도 보존/대조되는지 시험한다. 과거 미확인은 그대로 확인 필요다.

## 구현 순서와 테스트 후 작성

각 테스트 가능한 계층을 구현한 다음 해당 계층의 시험을 작성·실행한다. 아래 원본 Testing Contract가 순서/품질의 기준이다. 새 테스트 설정은 첫 실행 전에 준비하며 초기 승인은 이 계획/지침을 함께 묶는다.

- [x] **Step 1 — 현재 기준·source inventory 준비.** 변경 영향과 구형 원본/등록 경계를 고정한다. 승인 뒤 기존 관련 U1/U2 정상·권한·호스트/저장 회귀의 현재 baseline을 기록한다. 대량 부하/전체 DR collector는 실행하지 않는다. 기존 FAIL/미실행은 보존한다.
- [x] **Step 2 — U3 runner·격리 fixture 준비.** tests/u3의 Vitest unit/integration/coverage 설정과 로컬 전용 DB/profile·clock/queue/기업/직원/근거 fixture를 준비한다. 아래 지침의 정확 명령을 등록하고 passWithNoTests:false·DB 이름/로컬 admission을 확인한다. 다른 프로젝트/실제 DB를 reset하지 않는다.
- [x] **Step 3 — v2 profile·값/등록 계약 구현.** 새로운 profile/schema·타입/operations에 TargetScope·닫힌 Ref·조건별 모든 계약 개정·Money/Period·100행·두 changeKind를 반영한다. 현재 schema/등록 :2를 같은 ID로 덮어쓰지 않고 서버측 :3 연결을 정의한다.
- [x] **Step 4 — 계약/값 시험 후 실행.** closed input/producer·unknown owner/entity/field·wrong version/target/null·enum 대응·정수/범위·100행·조건 합집합·구/신 schema 구분을 독립 검사한다.
- [x] **Step 5 — 영속 모델·migration·보호 decoder 구현.** 논리 18엔티티/값 객체를 단일 current 모델·제약/인덱스·구형 version decoding에 매핑한다. 새 모델/필드의 원본/보호 후보·복구 대조·DB 역할 경계를 연결한다.
- [x] **Step 6 — 모델/migration 시험 후 실행.** 신규/구형 원본·정확 금액/기간·unknown field·누락·외래 대상/개정·이력 보존·명시 DDL/최소 역할·같은 모델 중복 등록·구형 미확인 승격 차단을 격리 DB에서 검증한다.
- [x] **Step 7 — U3 repository/현재 전제 구현.** 기존 보호 쓰기와 같은 primary transaction 안에 원본/전체 행·스냅샷/결과/이력/Outbox·요청 식별을 기록한다. 현재 권한/근거/개정 전후 대조·별도 보호 ack·원래 결과 조회를 연결한다.
- [x] **Step 8 — 저장/재전송/경쟁 시험 후 실행.** primary rollback·commit 후 보호 실패/timeout/응답 유실·같은 key 같은/다른 input·동시 요청·현재 원본 변경·보호 세대 불일치에서 부분 주문/중복/오래된 적용이 없는지 확인한다. 짧은 제어된 장애 시험이며 전체 DR 실증이 아니다.
- [x] **Step 9 — ProductCatalog 구현.** 내부 직원만 상품/타입/공통 조건 개정을 등록하고 허용 기업 조회·정확한 공통 조건/가격·이력과 원래 스냅샷을 보존한다.
- [x] **Step 10 — 상품 시험 후 실행.** 5–8개 이상 핵심 정상/오류/경계: 고객/외부망·타 기업 노출·타입/기간·소수 가격·오래된 offer·최초 가격 보존·현재 권한 회수.
- [ ] **Step 11 — CommercialAgreement 구현.** 계약/변경 요청·예외·정확한 다른 사람 승인·유효 구간 충돌 차단·기업 우선·제안/동의·수동 갱신 대상/회차 근거와 단일 원본/이력을 연결한다. 원본 신뢰 미확인은 적용 차단한다.
- [ ] **Step 12 — 계약/제안 시험 후 실행.** 5–8개 이상 핵심 정상/오류/경계와 필요 세부 사례: 같은 사람 다른 계정·오래된/목적 다른 근거·승인자 부재·상충/정상 우선·수정된 제안/이전 동의·잘못된 기업/갱신 회차·미확인 U2 원본.
- [ ] **Step 13 — OrderAcceptance 구현.** 모든 행/조건의 구매 당시 스냅샷과 원 단위 합계·확인한 추가 항목을 보존하고 REVIEW 접수→직원 전체 수락/거절/HOLD와 두 changeKind의 한 번 적용을 연결한다. 최초 기간과 실제 SW 기간을 구분한다.
- [ ] **Step 14 — 주문 시험 후 실행.** 5–8개 이상 핵심 정상/오류/경계와 세부 사례: 1/100/0/101행·타입/지급/FULL·미확인/0원/중복 비용·단가/합계 범위·부분 준비 HOLD·모든 계약 개정·수락/변경 경쟁·U7 없는 수락 후 변경 거절·원래 결과 조회.
- [ ] **Step 15 — HTTP·in-process/worker 호스트 연결.** U3 owner/operation/현재 action·대상/version/route·예산/보안/단일 parser 선택을 실제 등록한다. 주문/변경만 1MiB, 다른 64KiB·413/무효 JSON 응답을 연결한다. 공유 notice/fact 전달·worker 진입 및 복구 decoder에 U3 version을 등록한다.
- [ ] **Step 16 — HTTP/worker·소비자 계약 시험 후 실행.** 실제 왕복 input/response/producer·MFA/내부망·CSRF/타 기업·worker 우회·unknown operation/version·byte 이하/초과/압축·기존 상업 경로 우회 차단·큐 중복/역순/malformed 대조를 검사한다. U1/U2 영향 회귀는 별도 명령/결과로 기록한다.
- [ ] **Step 17 — 파일럿 CI·전체 분모 집계 구현.** U1/U2/U3 job의 현재 같은 source/lock/image 결과와 전체 라인 실행 합집합·80%를 대조한다. pilot-current의 필수 검사/보안·minimal artifact와 별도 명시 full-proof를 연결한다. 원래 full-proof 기준/이력은 그대로 유지한다.
- [ ] **Step 18 — CI/집계·보고서 시험 후 실행.** 실패/취소/skip·누락·source/SHA mismatch·좁은 분모·오래된 coverage/image·같은 key 다른 보고서·Deferred를 PASS로 바꾸는 경우를 거절한다. collector 시험은 제어된 fake child/report 자료로 수행하고 실제 장시간 부하/DR를 호출하지 않는다.
- [ ] **Step 19 — 변경에 맞는 공통 품질/보안 검증.** type/lint/format·비밀/SAST/의존성·필요 합성 CDK/해당 image/격리 runtime를 기존 차단선으로 수행한다. tool 설치/공간 부족·미실행·미지원은 성공으로 치환하지 않고 필요한 증거/실패를 보존한다.
- [ ] **Step 20 — 문서·source manifest·추적/검토 준비.** 구현/시험/명령·파일/모드/버전·제외/후속/미해결을 정리한다. source-manifest.json에 실제 생성/수정/삭제한 모든 제품/시험/설정 경로를 주장하고 code-summary/traceability에 실제 파일/실행 근거만 연결한다. 42 AC·29 BR·33 NFR를 누락 없이 보존하고 별도 리뷰를 받는다.

## Story-to-Step Traceability

| US / 적용 부분 | 구현 Step | 시험 Step / 핵심 연결 |
| --- | --- | --- |
| US2.1 상품 등록 | 3,5,7,9,15 | 4,6,8,10,16; BR1.1–1.4 |
| US2.3 기업 공개/가격 예외 | 3,5,7,11 | 4,6,8,12,16; BR1.3·BR2.3–2.7 |
| US2.4 계약 등록 | 3,5,7,11 | 4,6,8,12; BR2.1·BR2.7 |
| US2.5 계약 변경 요청 | 3,5,7,11,15 | 4,6,8,12,16; BR2.2 |
| US2.6 다른 사람 승인 | 3,5,7,11,15 | 4,6,8,12,16; BR2.3–2.5·NFR1.5 |
| US2.7 기업 계약 우선 | 3,5,7,11,13 | 4,8,12,14; BR2.5–2.7·BR5.1 |
| US3.1 동일 타입 다품목 | 3,5,7,13,15 | 4,6,8,14,16; BR3.1–3.3 |
| US3.2 직원 검토 범위만 | 7,13 | 8,14; BR3.4·자동 확정 AC3.2.1–3 후속 |
| US3.4 전체 수락 판단 | 3,5,7,13,15 | 4,6,8,14,16; BR3.7–3.8 |
| US3.5 가격/조건 변경 합의 | 3,5,7,11,13,15 | 4,6,8,12,14,16; BR4.1–4.6 |
| US3.6 FULL 범위만 | 3,5,7,13 | 4,8,14; BR3.5–3.6·부분 제공 AC3.6.2 후속 |
| US7.5 수동 갱신 합의만 | 3,5,7,11 | 4,6,8,12; BR5.1–5.4·자동 갱신 AC7.5.1 후속 |

AC3.1.1의 혼합 지급·AC3.1.4의 모바일 및 위 자동/부분 AC를 포함한 7개 Deferred는 최초 FD 추적 상태를 유지한다. 수동 갱신 제안/동의는 U6의 정확한 권한/회차를 검증할 포트이며 실제 갱신/요금·기간을 U3가 수정하지 않는다. U4/U5/U6/U7의 미등록/미확인 실제 사실은 기본 HOLD로 처리하며 로컬 합성 port를 실제 운영 권위로 등록하지 않는다.

## Planned Source Boundary

아래는 예정 파일이다. 실제 구현 전 현재 선언/의존을 대조하고 필요한 정확 경로를 plan에 반영한다. 동일 이름의 _modified 복제나 전체 workspace 재구성을 하지 않는다. 아래 새 파일이 이미 있다고 주장하지 않으며 실제 source-manifest는 구현 후 작성한다.

| 영역 | 예정 생성/수정 경로 |
| --- | --- |
| 계약 | packages/contracts/schemas/u3-commercial-v2.json; packages/contracts/schemas/u3-operations-v2.json; packages/contracts/src/u3-types.ts; packages/contracts/src/u3-declarations.ts; packages/contracts/src/schema.ts·index.ts·registry.ts |
| 모델/저장 | packages/persistence/models/u3-v1.json; packages/persistence/src/u3-model-catalog.ts·u3-model-decoder.ts·u3-migration.ts·u3-repository.ts·u3-recovery-payload.ts; 기존 model-catalog.ts·model-attribute.ts·data-source.ts·recovery-types.ts·recovery-replay.ts·index.ts·필요 runtime DB-role/migration 연결 |
| 상품/계약/주문 | packages/core/src/catalog.ts·catalog-query.ts·order-acceptance.ts·order-review.ts·order-assessment.ts·commands.ts·references.ts·history-query.ts·index.ts; 새 commercial-agreement.ts·commercial-proposal.ts·commercial-terms.ts·order-decision.ts·order-change.ts·u3-current-basis.ts |
| 실행 연결 | apps/api/src/u3-operations.ts·u3-routes.ts; 기존 operations.ts·routes.ts·transport-input.ts·application.ts·main.ts; apps/worker/src/main.ts 및 packages/integrations/src의 실제 runtime/migration/queue 등록 owning file |
| 테스트 설정/합성 자료 | tests/u3/vitest.unit.config.ts·vitest.integration.config.ts·vitest.coverage.config.ts; tests/u3/fixtures/{databases,clock,identity,commercial,queue,http}.ts; scripts/u3/prepare-test-databases.ts; 기존 영향을 받는 tests/u1·tests/u2 fixture/spec의 정확 경로는 회귀 실패/의미 차이에 따라 기록 |
| 테스트 파일 | tests/u3/unit/{contracts,catalog,commercial-agreement,commercial-proposal,order-acceptance,order-price,order-change,ci-pilot,coverage-aggregate}.spec.ts; tests/u3/integration/{migration-compatibility,repository-integrity,commercial-ordering,http-contracts,worker-delivery}.spec.ts |
| CI/검사 | scripts/u3/{check,security,runtime-source,coverage-evidence,coverage-aggregate,ci-pilot-proof,pilot-validation}.ts; .github/workflows/u1-validation.yml; package.json; tests/project/vitest.u1.coverage.config.ts 및 tests/u2/vitest.coverage.config.ts의 같은 전체 inventory 연결; 필요한 scripts/u1/u2 공통 검사/보안·source inventory owning file |
| 문서 | docs/u3/commercial-ordering.md; 현재 Unit code-generation/{code-generation-plan,unit-test-instructions,code-summary,traceability,source-manifest} |

package-lock.json은 기존 exact dependencies를 재사용해 원칙적으로 변경하지 않는다. 의존성 추가가 실제 필요하면 변경 사유/영향을 먼저 식별하며 임의 업그레이드/새 제공자/서비스를 넣지 않는다. infra/cdk의 실제 자원 수/용량·실제 credential/회사 CIDR는 이 계획으로 수정/등록하지 않는다. aidlc_change.sh와 tests/u1/.reports/의 기존 미추적 자료는 건드리지 않는다.

## Verification, Failure and Handoff

시험 상세 명령·격리 환경·분모·후속 경계는 unit-test-instructions.md에 있다. 단순 시험/문서 검사는 Luna에 위임한다. 검증 실패는 사유·영향·현재 source·원문 결과와 필요한 수정으로 추적하고 우연한 반복 통과·테스트 하한 완화로 대체하지 않는다. 필수 검사 실패/미실행·보고서 누락은 병합/해당 배포 보류다.

이 계획의 구현 뒤 별도 review는 실제 산출물과 source manifest에 대해 수행한다. 코드 완료·CI 검사 성공·공식 체크포인트·실제 배포/실거래 준비를 별도로 판정한다. 기존 U2 검증 미해결의 신뢰 문제를 이 계획에서 일괄 해결/위험 수용하지 않는다. 실제 다른 사람 승인 근거를 검증할 수 없으면 U3 계약 적용을 차단하고 해당 선행조건을 유지한다.

## Sources

- [기능 명세](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md), [엔티티](../functional-design/entities.md), [AC 추적](../functional-design/traceability.json): 첫 배포/후속·원본/조건/기간·42AC/29BR.
- [NFR 요구](../nfr-requirements/security-requirements.md), [기술 적용](../nfr-requirements/tech-stack-decisions.md), [보안 설계](../nfr-design/security-design.md), [CI 설계](../infrastructure-design/cicd-pipeline.md): 33 NFR·실제 검증/선행조건.
- [Unit 정의](../../../inception/units-generation/unit-of-work.md), [스토리 할당](../../../inception/units-generation/unit-of-work-story-map.md), [요구사항](../../../inception/requirements-analysis/requirements.md), [공통 계약](../../../inception/contract-design/contract-summary.md): 소유/의존·버전/호환.
- [첫 배포 계획](../../../release-planning/first-release-delivery-plan.md): 제한 파일럿·후속·기존 미해결.
- 현재 source는 이 계획의 현재 코드 표의 경로를 읽어 확인했다. U3 profile/runtime version 연결은 기존 :2 충돌을 피하기 위한 이 계획의 구현 제안이며 아직 실행/승인된 변경이 아니다.

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

