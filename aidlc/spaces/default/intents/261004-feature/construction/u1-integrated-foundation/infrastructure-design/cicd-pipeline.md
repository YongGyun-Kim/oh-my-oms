# U1 CI/CD Pipeline

**Unit:** u1-integrated-foundation  
**근거:** [확인된 Q1–Q12/요약](infrastructure-design-questions.md)·팀 방식·아래9개 consumed artifact.  
**범위:** GitHub Actions/CDK 배포 설계다. workflow/IaC/앱·검사 도구를 실행하거나 실계정/권한·운영 배포를 만든 결과가 아니다.

## Source and Release Identity

CI-01. main에서 짧은 작업 branch를 만들고 개발자 본인이 변경/필수 검사·보고서를 확인한 뒤 main으로 squash 병합한다. main 병합 후 staging 자동 배포/검사, 같은 검증 산출물을 본인이 확인한 뒤 production 수동 승인/배포한다. 다른 필수 리뷰 인력을 가정하지 않는다.

release manifest는 source SHA·lock/dependency/tool version·빌드 image digest·CDK/합성 template digest·schema/operation/handler registry·config revision·test/scan report·staging 실행/seed/핵심 검증·되돌림 가능 조합을 묶는다. 사람이 확인/승인한 manifest와 실제 적용 manifest가 다르면 진행하지 않고 재검증/확인한다. 최신 tag·새 main HEAD·오래된 보고서로 승인 대상을 바꾸지 않는다. staging 확인 뒤 image를 다시 빌드해 다른 digest를 배포하지 않는다.

정확한 Node/TS/Next/React/Nest/Express/CDK/PostgreSQL/TypeORM/pg·canonical2020-12 검증기/format·TLS adapter·관측 SDK·package manager/lock·보안/시험 도구 버전은 관련 코드/실행 전에 지원/보안/호환 근거로 고정한다. 최신 웹 문서 예제/action major를 자동 선정하지 않는다. organisationRevision=Enterprise.revision과 원래 주문 snapshot/현재 scope의 구분, RequestReceipt/WorkItem의 지속 correlationId/sourceFactRef NULL 경로·provider binding과 CE01–04의 실제 schema/registry를 코드 전에 등록한다. upstream 검토 finding은 과거 provenance이며 과거 판정/산출물을 수정하지 않는다.

## Pipeline Stages and Gates

| Stage | Trigger/동작 | Gate | Evidence/Failure |
|---|---|---|---|
| PR/local 검증 | 외부 자격 없는 합성 코드/계약·동일 도구 실행 | CI-02의 필수 검사/보고서·권한/정확성 회귀 | 실패/미실행/보고서 누락은 merge 보류; 외부 PR/fork에 운영 역할/secret 없음 |
| main build | 신뢰된 main SHA·lock·4역할 image/CDK template 생성 | 검사된 산출물/digest·지원/계약과 비밀 비포함 | 승인 identity를 고정; 빌드 실패/불명 보존 |
| staging 준비 | 제한 OIDC role로 검증용 stack/resource 생성·합성 seed/provider test 모드 | environment/target/role·실제 권한/원본 분리·선행조건 | actual 생성/준비 시간·오류/잔여 자원 기록 |
| staging deploy/runtime | 같은 digest·계약/설정·필요 migration·공개/사설/worker/복구 검증 | 실제 접점/현재 MFA/grant·보호 접수·실행/8정확성·security/load | 실제 회사/외부 경로 미준비는 미확인/해당 release 차단; 합성을 실제 통과로 표현하지 않음 |
| 사람 확인 | 개발자 본인이 특정 결과/핵심 동작·원장/되돌림·잔여 위험 확인 | 특정 manifest/보고서·현재 선행조건이 만족 | 추가 확인 필요 시 같은 대상을 재구성/시험 |
| staging 정리 | 보고서/산출물·승인 근거 보관 및 필요한 사람 확인 완료 뒤 | 검증 resource만·동시 실행/확인·정리 경쟁 제어 | 실패/취소도 잔여 자원/상태 확인; production/보호 원본/키 삭제 금지 |
| production 승인 | 같은 manifest에 대한 명시 사람 수동 실행/승인 | CI-03/04·정확한 승인 주체·권한·지원/검사/staging | 실제 GitHub plan/visibility의 환경 보호 기능 확인; self-review 금지로1인 승인 불능을 만들지 않음 |
| production 적용 | 검증 migration→호환 API/worker/UI 순서·rolling | 이전 완료 버전/현재DB·work/wire/key/grant 호환·유한 cap·release별 단일 제어 | CI-04/05의 종료/실패·native 감시·conditional rollback |
| 후검증/운영 연결 | 실제 허용 핵심 동작/접수·current scope·worker/SLI/원본 대조 | 정상/부분/미확인·복구 완료 근거 | ECS COMPLETED/health200만으로 업무 정상 또는30일 SLO 주장 금지 |

## Required Checks and Reports

CI-02. test-after/Standard·전체 직접 작성한 테스트 가능 제품 파일의 line coverage≥80%를 적용하며 미실행 파일도 분모에 포함한다. generated/외부 코드 제외는 사유를 기록한다. AC→실제 unit/integration/브라우저/실패·동시/복구 시험의 mapping·실행/미실행·분모/seed/시간·결과를 보존한다. 다른 Unit의 전체 기능을 U1 통과로 대체하지 않는다. 테스트 없는 파일을 분모에서 빼거나 flaky 재실행/하한 완화로 우연한 성공을 통과 근거로 쓰지 않는다.

| Check | 실제 대상 | 도구 후보/고정 시점 | 차단/보고서 |
|---|---|---|---|
| format/lint/type | 제품/시험/설정/작성 IaC | Prettier/ESLint/TypeScript; 정확한 지원/명령 CI 실행 전 | 불일치/미실행/누락 차단 |
| 계약 runtime/producer/consumer |2020-12·closed 입력/producer·unknown response 정책·C/CE registry | Ajv2020 및 등록 contract check; binding 코드 전 | 정적 TypeScript/Nest DTO만으로 적용 주장 금지 |
| unit/integration/coverage | 권한/전이·TypeORM/PG·원장/receipt/work·중복/동시·unknown | Vitest·격리 PostgreSQL/Docker 후보; 실제 harness/명령 코드/시험 전 |80%/AC mapping·실행 상태/제외 사유 |
| 브라우저/접근성 | 허용 PC1280+·고객4/staff2 browser 최신/직전·ko-KR/KRW/Seoul·keyboard/zoom/reflow | Playwright/axe-core 후보; 출시 실제 버전/OS·검사 전 | 모바일 제외가 보안/확대·WCAG2.2AA 면제 아님 |
| secret·SAST·dependency | 소스/image/번들·코드 패턴·lock/의존성/advisory | Gitleaks/Semgrep/OSV-Scanner 후보; 실제 tool/명령/차단 기준 CI 전 | 발견/미실행/누락 차단; 노출 비밀 폐기/교체/영향 확인 |
| IaC/generated infra | CDK source와합성 template·IAM/망/저장/키/삭제/교체 | Checkov 등 source/template 지원 도구 후보; 실제 범위/예외 CI 전 | 미지원 file/누락을 통과로 처리하지 않음 |
| 격리 runtime security | 실제 test ingress/세션·권한/CSRF·에러/캐시/로그 표식 | OWASP ZAP/브라우저·소유 대상만; auth/접점·실행/보고서 방식 적용 전 | actual scope/token/PC·private route 미준비면 해당 경로 통과 없음 |
| 성능/복구/운영 | normal/peak/recover·8정확성·ACK/오삭제/AZ·1인시간 | k6/실제 장애 주입·ACK 대조 후보; profile/권한/명령 시험 전 | 비어 있는 데이터/빠른 경로만으로 전체 통과 주장 금지 |

이 목록은 후보/책임/검사 범위의 설계이며 실제 설치된 버전/실행 명령의 증거가 아니다. 실제 package manager/명령·exact version·대상·차단 기준·보고서 경로·finite 자원과 예외를 IG-03/04/05/07 및 ND-RG07 시점까지 고정한다. 준비되지 않은 필수 검사를 실행했다고 표시하거나 CI 주석/미실행 task로 통과시키지 않는다. 예외는 사유/담당/만료/재검토·잔여 위험을 기록하고 검사 성공과 구별한다.

## Identity, Secrets and Private Execution

CI-03. GitHub OIDC의 실제 issuer/aud/sub·저장소 owner/repository 식별 형식·허용 main/environment/실행 주체를 조건으로 AWS 임시 role을 제한한다.2026년7월 이후 immutable subject 형식 여부를 실제 확인하며 문서 wildcard를 복사하지 않는다. image publishing·staging deploy/cleanup·일반 production deploy·DDL·보호 journal 관리/복구·관측/통지 role과 trust를 구분한다. CI 정상 role은 production journal/backup/key 파기나 관리자 승격을 하지 못한다.

production 승인 경로는 실제 GitHub plan/visibility/권한의 지원을 확인해 보호 environment 또는 특정 manifest를 고르는 권한 제한 수동 실행으로 구성한다. 어느 방식이든 staged proof/승인자/시각/manifest를 검증하고 자동 main push만으로 production을 시작하지 않는다. 운영 자격은 검증된 해당 수동 단계에만 부여하고 branch/workflow 변경으로 검사를 우회할 수 있는 실제 범위를 시험한다.1인 개발자가 승인한다는 기존 결정은 유지하되 별도2인 개발자를 가정하지 않는다.

일반 build에 실제 운영 DB/원장/Slack secret을 주지 않는다. Secrets Manager ARN·환경/목적별 runtime 조회를 사용하며 source/template/output/로그/브라우저에 값을 넣지 않는다. hosted runner의 사설망/DB 접근을 가정하거나 이를 위해 DB/직원 ingress를 공개하지 않는다. 사설 migration/검사는 제한된 일회 ECS task 등 실제 AWS 경로에서 실행하고 role/원본/결과 report를 수집한다. 자체 상시 runner/추가 CodeBuild는 기본으로 도입하지 않는다. GitHub 밖 고객/주문/계약·실자료 로그 반출이 생기면 IG-06/08의 국내 저장 조건을 해결하기 전 진행하지 않는다.

## Deployment Strategy and Compatibility

CI-04. Q11 A의 rolling 배포를 사용한다. max task/global pool/provider cap·healthy/maximum percent·기동/drain/stop/health/감시 기한을 IG-04에서 검증한다. NI-10의1–2 replica/100%·200%는 시험 후보이고 실제 최적/운영 적용값이 아니다. API·worker·UI/등록 producer-consumer는 각 단계의 구/신 버전 공존을 시험하고 지원 가능한 조합만 순서대로 배포한다. source SHA/image digest를 고정해 서로 다른 재빌드를 배포하지 않는다.

schema/operation/handler/복구 decoder는 expand/compatible 전환으로 구/신 앱·새/대기 원본과 공존한다. breaking required/null/enum/시간/Money 의미는 새 version과 등록 소비/출력으로 연결하고 이전 version의 pending key/work/근거·decoder를 배출/복구 증거 없이 제거하지 않는다. migration은 별도 허가된 현재 source/schema target과 원장 보호·backup/삭제 역할 경계를 확인한다. 일반 app deploy의 rollback이 raw DB downgrade/snapshot restore가 되지 않게 한다.

worker scale-in/배포는 새 claim을 중단하고 진행중 permit/lease/외부 효과·원래 attempt/deadline을 지속 기록·대조한다. 종료 뒤 old 권위를 fence하고 late 결과가 새 개정을 덮지 못하게 한다. 새 worker는 원래 Work/consumer/correlation·누적 예산을 이어 확인한다. lease 만료·새message·배포가 원래 외부 효과 부재나 attempt 초기화의 근거가 아니다.

## Rollback and Failure Handling

CI-05. ECS deployment circuit breaker·등록 CloudWatch deployment alarm을 사용해 안전한 이전 COMPLETED revision으로 조건부 자동 되돌림한다. target가 없거나 현재DB/wire/작업·설정/키·binding/회수 상태와 호환 근거가 없으면 자동 되돌림으로 성공을 가장하지 않고 보류/수동 조치를 연결한다. ALARM 상태로 시작하는 배포·조회 throttling/누락·ECS 지연/불명과 CI 제어기 실패를 별도 운영 경로로 대조한다.

같은 실패 배포에 자동 되돌림을 무한 재발행하지 않는다. 원래 release/incident/attempt와t0/누적 상태·현재 적용 digest를 확인하고 시도 시작 즉시 Slack+이메일, 실패/수동 필요/검증 복구 결과를 같은 원래 사건으로 알린다. t0+2/7/10/30min·채널수락1min/명시3min·추가2min 간격3회의 기존 조건을 적용한다. 단일 native 경보 성공을 전체30min/RPO0/정확성 증명으로 쓰지 않는다.

성공 접수/업무/이력/원장·Outbox/Work/consumer·현재권한/회수/파기·외부 효과는 보존한다. 논리 손상 복구는 NI-07/08의 격리 새 epoch·snapshot 뒤 성공 ACK 재구성/대조 경로이며 일반 rollback과 구별한다. external unknown은 원래 operation/key로 조회하고 무조건 재송신하지 않는다.

## Validation and Operations Handoff

CI-06. 합성 기업100/고객1000/직원시험10/상품10000/주문100000·평균5/시험최대50품목과 정상100세션·20req/s30min(80%조회/20%변경),100req/s5min 후20req/s·5min 내 normal회복/10min 유지 profile을 seed/분포/허용/거절·조직 NULL/폐지·미확인/경합과 함께 고정한다. 이는 실제 사업 규모/인력·제품 품목 한도가 아니다. HTTP≠jobs/fanout/span/bytes이며 UI3s/첫eligible10s·동기 외부 예산/실제429·503/Receipt 보호를 모두 계측한다.

앱/worker 종료·primary/journal 고장·baddeploy·논리 손상/오삭제·단일AZ 일시 장애의 실제t0→검증30min/독립 ACK목록·원본/권한/8정확성0을 동시에 시험한다. 물리센터 소실급 제외를 일반AZ 장애로 확대하지 않는다. Single-AZ 신규DB/복원/재구성 시간은 미검증이다. actual 목표 미달이면 차이/비용·운영 대안을 근거로 명시적 구성/목표 변경을 확인한다.

계획 점검은 KST 평일20–22시·회당중단10min/rolling30일누적20min,24h 전 in-app/지정email 안내 조건을 유지한다. 실제 중단은 가용성 budget에 포함하고 필요 중단초과/배포 실패는 중단/복구/지연 안내로 연결한다. 미래 무중단 배포/10min 복구 방향을 첫 버전 달성으로 쓰지 않는다. 정상 반복작업30min/일·배포15min/회·대표1인복구작업30min은 실제 손작업/대기/elapsed·빈도·backlog와 별도로 측정한다.

CI-07. staging lifecycle은 환경/원장·비밀/계정·queue/외부모의/시험 role을 production과 구분하고 main 검증 target별 직렬 제어/동시 확인·정리 보호를 둔다. 검증/보고서 보관·필요 사람 확인 뒤만 검증용 자원을 정리한다. 실패/취소된 생성/검사도 잔여 자원/누락 보고서·기한을 대조하고 success로 종결하지 않는다. 승인 manifest·ECR image·report/S3/감사/원본은 별도 수명/권한으로 보존하고 새로운 변경/검증 필요 시 같은 대상 환경을 재구성한다. 삭제/교체 정책은 실제 synthetic 자원만 대상으로 고정한다. production/보호 원장/backup/key/운영 신원의 삭제 권한을 cleanup에 주지 않으며 잔여 snapshot/secret/network 과금을 별도 확인한다. 실제 업체 시험 자격/자료를 합성으로 간주해 자동 파기하지 않는다.

## Upstream Coverage

다음 입력의 전체 경로를 명시하고 실행/검증·원본/승인 경계로 연결한다. 문서 참조는 실제 코드/시험 통과의 증거가 아니다.

| Upstream artifact | 사용한 근거 | 적용 설계 |
|---|---|---|
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-design/performance-design.md | HTTP/화면/work 예산 | CI-02/06 및 NI-10·MO-01 |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-design/security-design.md | 신원/권한·망/비밀/수명 | CI-01/03/06 및 NI-01–04·IG-02/08 |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-design/scalability-design.md | 자료·부하/유한 cap·확장 | CI-02/06 및 NI-10·IG-04 |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-design/reliability-design.md | ACK/원장/불명·복구/정확성 | CI-04–07 및 NI-05–09 |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-design/observability-design.md | SLI·trace/통지/ACK | CI-05/06 및 MO-01–07 |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-design/logical-components.md | 매핑/버전·선행조건 | CI-01–07/IG-01–08 |
| aidlc/spaces/default/intents/261004-feature/inception/domain-design/components.md | 논리 owner/책임 경계 | CI-02/04·Shared Infrastructure |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/functional-design/functional-spec.md | 실제 모델/전이·CE/등록 | CI-01/02/04 및원본 확장 |
| aidlc/spaces/default/intents/261004-feature/inception/contract-design/contract-summary.md | wire/schema/operation·원본/소비 호환 | CI-01/02/04/07·registry |

## Verification and Readiness

CI-01–07은 infrastructure IG-01–08과 ND-RG01–10을 유지한다. 실제 지원/버전/command·계정/권한/도메인/회사망·원장/DB/키·유한 cap/retention/가격·Slack/email/ACK/operator/야간 대응이 미확인인 경로는 해당 코드/실자료/실행·상용 약속의 선행조건으로 차단한다. 설계/문서 sensors 결과를 package 검증·실제 deploy/security/load/복구/수신/운영 실적이라고 표현하지 않는다.

## Assumptions & Open Questions

플랫폼/배포/자동 되돌림/검증 환경 수명은 user 선택이다. 실제 GitHub plan/visibility·auth/trust/지원·CLI/SDK/tools·resource/feature·승인/보고서·사설 회사/외부 경로·비용/수명·1인 달성은 미확인이다. 실제값 고정/검증 전 app 원본/보호 접수/외부 handler를 안전하게 제공했다고 주장하지 않는다. 이런 선행조건은 구현/실행 계획에서 책임/차단선/증거로 연결한다.

## Sources

- [확인된 Q&A](infrastructure-design-questions.md),[팀 방식](../../../inception/practices-discovery/team-practices.md).
- [Infrastructure Specification](infrastructure-specification.md),[Monitoring Design](monitoring-design.md); 위9개 Upstream Coverage의 실제 입력.
- [GitHub AWS OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws),[GitHub 배포 환경/지원](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments).
- [ECS rolling](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html),[배포 circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html),[배포 alarm](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-alarm-failure.html).
- [CDK 자원 정리](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-destroy.html),[DeletionPolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-deletionpolicy.html).
