# U1 Code Summary

**Unit:** u1-integrated-foundation

고객·직원 PC 화면/BFF, NestJS + Express API, Nest standalone worker와 보호된 PostgreSQL 접수 기반을 구현했다. 아래 결과는 승인된 로컬 합성 자료에서 실제 HTTP·두 독립 PostgreSQL·프로세스 중단을 실행한 증거이다. 실제 회사망·Cognito·외부 수신·AWS 활성화와 연속30일 운영 실적은 아직 확인하지 않았다.

## Files Created/Modified

372개 제품 경로를 [source-manifest.json](source-manifest.json)에 전수 선언했다. 생성369개, 수정1개(.gitignore), 삭제2개(두 Next의 기존 next.config.ts→next.config.mjs)이다. 앱·패키지·CDK·실행 도구·시험·CI·문서·빌드 설정과 생성기로 작성한 소스를 포함한다. 사용자 hook/도구 및 memory 변경은 제품 소유 경로에서 제외했다. 기존 inception/canonical 원문은 변경하지 않았고 공통v1 제품 사본의 출처를 기록했다.

| 경로 | 구현 범위 |
|---|---|
| apps/customer-web, apps/staff-web | 한국어1280px+ PC 화면·독립 Next 빌드/BFF·세션/CSRF·직원 입장 경계 |
| apps/api, apps/worker | NestJS Express HTTP 및 standalone worker 실행 역할 |
| packages/contracts, packages/core | 등록 계약·신원/기업/현재 권한·상품·주문 접수/전체 확인 대기·최소 조회/통지 |
| packages/persistence | TypeORM 모델/migration·독립 보호원장·지속 접수/prefix·복구/현재보안·인증 응답 의도 |
| packages/integrations, packages/ui | 명시적 provider/SQS/운영 adapter·관측/배포 보호·공유 PC 컴포넌트 |
| infra/cdk, Dockerfile, .github | 한 AWS 계정4역할·두 PG 후보·TLS/최소권한·불변 CI·검증 이미지 |
| scripts/u1, tests/u1, docs/u1 | Unit 전용 실행/보안/50분 부하/실제 복구·준비 조건 |

## Key Implementation Decisions

- **Contracts:** Registered versioned canonical owners/operations and invocation targets; common v1 preserved, foundation/common v2 explicit; unknown/missing provider never invented success. 주요 파일: `packages/contracts/src/registry.ts`.

- **Protected persistence:** Same primary QueryRunner/EntityManager writes originals, Receipt/history, necessary facts/work/outbox, complete after-images; independent durable PG and continuous protected prefix before ACK/read/relay/effect; recovery holds auth fence. Restore alone does not reopen authentication; independently registered current-state owner oracle rechecks complete source/time/seal/current originals before fresh MFA, while old sessions remain denied. Actual production source remains unregistered. 주요 파일: `packages/persistence/src/protected-store.ts`, `packages/persistence/src/protected-transaction.ts`, `packages/persistence/src/recovery.ts`, `packages/persistence/src/recovery-security.ts`, `packages/persistence/src/recovery-security-policy.ts`.

- **Identity and authorization:** Stable Account/provider binding; password then purpose-limited MFA and recovery-code acknowledgement/single-use; staff confirmation and distinct initial administrator with explicit confirmed AccountRef; self current membership/action scopes via CE01, without auto trade grants. Real corporate admission/business evidence remains unregistered. 주요 파일: `packages/core/src/identity.ts`, `packages/core/src/authorization.ts`, `packages/core/src/enterprise-access.ts`.

- **Ordering:** Staff-only product registration, distinct HW/SW types, max100items separate from quantity, unresolved terms retain UNKNOWN; entire order REVIEW_REQUIRED, same original key receipt reconciliation. 주요 파일: `packages/core/src/catalog.ts`, `packages/core/src/order-acceptance.ts`, `packages/core/src/order-assessment.ts`.

- **Worker:** Transactional Outbox + Standard queue; current epoch/grant/permit and original Work IDs, attempts and five-minute deadline. Shared runtime processes at most10 messages with bounded4 concurrency and per-message failure isolation; failure is never ACKed. Local queue implements30-second visibility/maxReceive5/DLQ. NORMAL/RECOVERY/HOLD proof matches every new order ACK to original eligible Work, protected first processing, terminal result and actual consume/ACK. 주요 파일: `packages/core/src/worker.ts`, `packages/core/src/external-policy.ts`, `apps/worker/src/main.ts`.

- **UI and HTTP:** Nest Express API/Nest standalone worker/two Next PC BFFs; Korean1280+, host-bound session/CSRF, no-store reads, original-request references partitioned by verified account; separate company context selection and role/user/org management facets. Response generations and old logout cookies cannot replace a new verified identity. Bounded shared-PG browser auth lineage/generation rejects superseded challenges/completion headers; emitted browser aliases use the same next binding; transient intentions are discarded on restore without account-wide session revocation. 주요 파일: `apps/api/src/application.ts`, `packages/ui/src/portal.tsx`, `packages/ui/src/bff.ts`, `packages/persistence/src/http-auth-intents.ts`.

- **Infrastructure:** 4 task roles, one AWS account, two independent PG instances separate AZ candidate, NLB TLS pass-through, restricted roles/queues/secrets. Offline synth and local container are not real AWS activation. 주요 파일: `Dockerfile`, `infra/cdk/src/stack.ts`.

- **Independent operations metadata:** 승인된MO03/MO04가 platform incident metadata/notification/ACK를업무IAM과분리한다. DynamoDB용독립CAS/발송및ACK등록경계,2분간격최대3회reminder를구현했다. 실제endpoint/operator/recipient와네트워크발송은미등록이므로차단된다. 주요 파일: `packages/integrations/src/incidents.ts`, `packages/integrations/src/operational-sender.ts`, `packages/integrations/src/incident-store.ts`, `packages/integrations/src/operational-connection.ts`.

- **Observability:** Actual OTel SDK/API/worker wiring; AlwaysOn, bounded512/64/1s, sanitized enum/correlation hash; observe drop, finite failure and original eligible-to-protected PROCESSING latency. Conservative route interval union; actual30-day operation remains separate. 주요 파일: `packages/integrations/src/telemetry.ts`, `packages/integrations/src/telemetry-policy.ts`, `packages/integrations/src/availability.ts`.

- **Deployment safety:** Independent original incident/attempt CAS; start notice and fresh manifest/security/pending decoder checks; exact application image digest only, no DB downgrade. Unknown operation/role/security proof denies before action; accepted deployment is not recovered business. 주요 파일: `packages/integrations/src/deployment-compatibility.ts`, `packages/integrations/src/deployment-control.ts`, `packages/integrations/src/deployment-store.ts`.

- **Security reporting:** Security findings remain raw; explicit exceptions validate owner/reason/expiry/review/residual risk without waiving high/critical gates. Secret incidents separately track revocation/replacement, use, impact, logs and backups; currently both explicit lists are empty, not a claimed response to an observed incident. 주요 파일: `scripts/u1/security.ts`, `scripts/u1/security-policy.ts`.


## Test Coverage Summary

Testing Contract는 test-after/Standard이다. 직접 작성한 앱·패키지·CDK·실행 도구 전체의 미실행 파일도 분모에 포함하여 line80% 하한을 유지했다. 생성물/외부 의존/시험 fixture의 제외는 실행 config에 명시한다.

| 실제 검사 | 결과 | 증거 |
|---|---|---|
| unit | 70파일563/563, skip/pending0 | .reports/u1/unit.json |
| integration | 13파일168/168, skip/pending0 | .reports/u1/integration.json |
| 전체 coverage 실행 | 83시험파일731/731, 4359/5399 lines=80.73% | .reports/u1/coverage.json, coverage/coverage-summary.json·LCOV/HTML |
| PC E2E | 4/4, skipped/unexpected/flaky0 | .reports/u1/e2e.json, accessibility.json |
| profile 경계 probe | 16/16 | .reports/u1/profile-probes.json |
| 형식/타입/계약/소스 경계 | PASS | .reports/u1/check.json |
| 실제 보안5종 | 물리 bundled 의존성/audit·SAST·secret·IaC·컨테이너 모두 PASS | .reports/u1/security.json 및 원시 scanner 자료 |
|4역할 실제 로컬 실행/TLS|PASS, actualProvider/회사망/AWS는false|.reports/u1/container-positive.json|
|최종 통합 보고서 admission|PASS ·04:01:14.279Z|.reports/u1/skeleton.json|

현재 immutable image는 `sha256:425ee2db8a540800c5d550f5fa6d7062d8f3a40792baf2390e52797520f39f0a`이다. 컨테이너 OS/라이브러리 high/critical0, medium23/low8을 그대로 보존했다. 보안 예외와 실제 secret 사고의 대응 기록은 서로 다른 명시적 목록이며 현재 두 목록 모두 비어 있다. GitHub CI는 작성됐지만 이 작업에서 실행·병합·배포했다고 보고하지 않는다.

## Integrated Performance and Recovery

50분100세션·READ80%/WRITE20%의 정확한84,000개 원문을 독립 재계산했다. NORMAL/RECOVERY/HOLD HTTP 기술 실패와 정의한 정확성 위반은0이었다. PEAK는 승인된 안전/저하 관측 기준을 적용했으며 정상 처리량 목표 달성으로 해석하지 않는다.

| 구간 | 실제 요청 | READ p95(ms) | WRITE p95(ms) | 기술 실패 |
|---|---:|---:|---:|---:|
| NORMAL20req/s·30분 |36000|102.848|227.987|0|
| PEAK100req/s·5분 |30000|1160.522|3238.068|22205(74.0167%)|
| RECOVERY20req/s·5분 |6000|95.446|263.345|0|
| HOLD20req/s·10분 |12000|106.109|227.132|0|

정상 PC 주요 상품/조작 준비30표본의 p95는566.418ms로3초 기준 이내다. 부가 UI probe traffic은 별도로 기록했고 HTTP84k 분모에 섞지 않았다. 원래 신규 주문ACK에 연결한 NORMAL Work6480개 p95851ms, HOLD2160개 p95912ms이다. RECOVERY1080개는 원래 기한/결과/실제ACK를 모두 확인했으며 전체p9550890ms·처음두60초창62632/21763ms를 보존한다. 뒤세창905/909/879ms로 지속 정상창 끝02:40:34.028Z에180초 회복을 확인하고 이어10분 유지했다. 집중 구간7개 원래Work는 기한 뒤 처음 소비되어5회 BUSINESS_REFUSAL/noACK·PENDING·효과없음이다(HTTP접수성공4/응답불명3). 전체 후속 업무를 완료했다고 주장하지 않는다.

대규모 복구는 주문125823/행629115/상품12843개 규모에서 논리 손상을 주입하고 실제50payload 재생 뒤SIGKILL한 다음 같은 고정 원장·최초t0로 재시작했다. 원장205255개/행재생2602899회와 원래Work보류3707개를 처리했다. 고유업무건수와 행재생 연산수를 구별한다. 최초fault `2026-10-09T03:30:27.185Z`에서 현재보안6772개 대조·새MFA·실제Nest HTTP 원래 주문조회까지 **1606633ms(26분46.633초)** 로30분 내 통과했다. 성공ACK28152개 유실/내용변경0,42개model 및 tombstone 전수manifest 원문동일을 확인했다. 실제AWS/AZ/저장소전환 장애를 검증했다는 뜻은 아니다.

원시/대조 증거: `.reports/u1/performance.json`, `worker-recovery-profile.json`, `ui-under-load.json`, `profile-resources.json`, `current-ack-preservation.json`, `large-recovery.json`, `large-restore-result.json`. root 독립 대조는 `root-provenance-independent.json`, `root-worker-windows-independent.json`, `root-large-recovery-independent.json` 및 HTTP84k 대조 기록에 보존했다.

## Measurement Provenance

원측정 runId `68288451-1787-4ec1-8ded-ae4b1ff3ee30`, capturedAt `2026-10-09T01:59:36.860Z`, full digest `6c65de39f44c6b776205b8bef9b2494b8cd96efa46cf77bf928726d2d19e90fc`를 유지했다. 현재 평가 source digest는 `160fc1eb30e10f0720f28cde2f8ee964f590b43cdd8b6b8fb7488be3bbdbcf10`이다. 명시적11파일 delta는 판정기/별도복구 전수 verifier·oracle 및 관련시험뿐이며 runtime/config/load scheduling/serving fixture와 root설정·lock·문서는 바뀌지 않았다. `performance-evaluation-source.json`이 양쪽 fullidentity와 파일별 원래/current hash를 기록한다. 원래 passed:false 보고서·84k원문·fullsource/config사본은 `recovery-window-original-performance/`에 보존했다.

원측정 rootfreeze에서 빠졌던 `tsconfig.build.json`은 측정 당시 immutable425 `/app` 사본과 current SHA `cd67ebfd095cc8e6127a248d12cac8997b188119b02ce1a8761716a02360bf5a`가 같았다. 중지 상태 임시container만 추출·제거했고 기존capturedAt/fullhash를 바꾸지 않았다. 누락 보완은 `build-config-preservation.json`에 명시했다.

## Deviations and Remaining Conditions

- **지원 조합:** 계획의 발행 관측 후보와 제품 선택을 구별; 호스트 Node22.23.1 대신 검증 전용22.23.3/npm10.9.9, peer/security rationale documented; global runtime unchanged.

- **CDK bundled dependency:** Actual vulnerable bundled brace-expansion5.0.9 removed; exact5.0.12 root install plus physical source/integrity/minimatch checks; ignored-scripts negative and default fresh ci verified. Lock-only fix rejected.

- **Container:** Apple ARM의 amd64 QEMU Next 빌드139 실패 자료를 보존하고 native build platform + amd64 production dependency로 수정했다. 현재 sha256:425ee2db8a540800c5d550f5fa6d7062d8f3a40792baf2390e52797520f39f0a 이미지는4역할 실제 로컬 TLS·보호 접수·worker 긍정 실행과 실제 보안 검사5종이 통과했다. 이후11개 변경은 성능 판정/복구 보존 verifier와 관련 시험뿐이며 실행 소스·설정·부하 스케줄·serving fixture의 측정 hash는 유지한다. 실제 AWS는 미배포이다.

- **Tests:** 직접 작성한 앱·패키지·CDK·실행 도구의 미실행 파일도 포함하는 전체 분모와80% 하한을 유지했다. 최신 unit563 +integration168 =731개 모두 통과·skip/pending0, line4359/5399=80.73%이다. check 및 실제 보안5종도 통과했다. 이전71.40%/78.42% 실패와 수리 전681개/81.02%·712개/81.33%는 최종 근거로 사용하지 않는다.

- **Failure repair:** First failed load exposed benign activity revision mistaken for revocation and expired pending worker starvation; actual revocation/epoch/absolute expiry checks retained, scoped regressions passed. Second run interrupted incomplete because remaining runtime body changes; no performance pass claimed.

- **대규모 복구:** 같은 원본 주문125,823개·주문행629,115개·상품12,843개에서 논리 손상을 주입하고50개payload 재생 후 실제SIGKILL/재시작을 수행했다. 고정 protected prefix205,255개/행 재생2,602,899회, 원래 미처리Work보류3,707개를 처리했다. fault03:30:27.185Z에서 현재보안대조·새MFA·실제Nest HTTP 원래주문조회 재개까지1,606,633ms(26분46.633초)로30분내 통과했다.28,152개 성공ACK의유실·내용변경0,42model/tombstone전수manifest원문동일,현재보안6,772개대조·변경0이다. 행재생수는고유업무건수가아니다. 별도복구전수verifier의tombstone statement-timeout과oracle페이지2quoting실패는fault주입전에원본불변상태로보존했고,25개keyset/실제페이지회귀를수리했다. 실제AWS/AZ전환·30일가용성·사람작업시간을달성했다는주장이아니다.

- **Worker 회복 관측:** 첫50분의HTTP84,000표본이 통과했어도 RECOVERY/HOLD worker 정체가 있어 전체 완료false로 보존했다. expired head→배치 중단을 실제PG로 재현하고 실패 격리/visibility/DLQ를 수정한 후 새50분을 실행했다. 현재 NORMAL6480개/p95851ms, RECOVERY1080개 모두 원래기한 내 결과/actualACK·누락0, HOLD2160개/p95912ms이다. 집중 부하7건은 원래5분 기한 이후 처음 소비되어5회 BUSINESS_REFUSAL/noACK·PENDING·효과없음으로 남았다.4건은HTTP접수 성공,3건은응답불명이며 원본은 모두 보존됐다. 집중 구간 후속처리를 완료했다고 보고하지 않는다.

- **인증 메타데이터 용량 후보:** 이전기술후보1000행은유효520행을보존한채새100MFA최대700메타를준비하는1220행을수용하지못했다. 실제720행평균191/최대192byte·인덱스포함270336byte를확인하고유한2000행으로조정했다. 8h fence/5분challenge/MFA/idle·절대기한/rate와다른1000버퍼는유지한다. 실제PG 경계1999+2거절·정당한만료정리·정확2000/추가거절·기존세션/늦은MFA쿠키25회귀통과. defined NFR나보호정책완화가아니며수리후현재전체proof/이미지/부하를갱신한다. 수리 후 전체 검사와 현재425이미지·4역할 TLS·실제100MFA 준비/50분 측정을 수행했다.

- **회복 판정기의 적용 범위:** 승인된 ND-PERF-01 정상first-start p95≤10초와 집중 후20req/s에서5분 내 정상 회복·10분 유지를 적용했다. 이전 판정기는 회복 구간 전체에도 즉시10초를 요구했으므로 passed:false 원본을 보존했다. 현재 동일84k 원문을 재계산한 보고서는 passed:true이며 원측정run/capturedAt/fullsource digest와 현재평가 fullsource/11개 명시 delta를 별도로 기록했다. RECOVERY 전체p9550890ms, 첫두60초창62632/21763ms, 뒤세창905/909/879ms를 유지한다. 첫 지속 정상창 끝02:40:34.028Z, 회복180초이며 이후HOLD10분을 확인했다. root가 모든 원문 ACK/start/consume의45개고정창과fullsource/설정/원문보존을 독립 재계산했다. 원래 측정 기준을 낮추거나 실패 원문을 덮지 않았다.


`docs/u1/readiness.md`84/122 및 `docs/u1/runtime.md`의 당시 미검증/별도증거 필요 메모는 측정 시점 bytebinding을 위해 원문으로 보존한다. 로컬 대규모 복구와4역할 양성 실행의 최신 상태는 이 요약 및 연결 보고서가 제공한다. 실제provider/회사망/수신자/운영과 AWS 조건은 계속 미확인이다.

## Traceability and Handoff

[traceability.json](traceability.json)은 assigned157개(AC61/NFR62/BR34)를 전수 연결했다. OK108개는 실제 파일 하나를 가리키며 AC30/NFR44/BR34의 **U1 구현 부분**이다. Deferred49개(AC31/NFR18)는 선행 설계에서 지정한 후속 전체 기능/실제 운영 증거의 책임과 사유를 보존한다. U1 필수 구현·시험·복구 누락의 면제가 아니다. 주 책임 AC1.1.1–3/AC1.2.1–3/AC3.3.1–3의 실제 HTTP 시험은 `tests/u1/integration/http-primary-ac.spec.ts`에 있다.

실행·fixture/DB 격리·원래자료 보호·명령은 [unit-test-instructions.md](unit-test-instructions.md)에 정리했다. 실제 전체운영/30일99.9%·AWS RTO/RPO·국내저장 경로·사람 작업시간과 U2–U10 전체 기능은 별도 책임이다. 현재 미등록 실제환경은 활성화하지 않는다.

## Sources

- [계획과 Testing Contract](code-generation-plan.md), [최초 Q&A](code-generation-questions.md), [추가 준비 Q&A](implementation-readiness-questions.md)
- [U1 기능 설계](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md), [엔티티](../functional-design/entities.md)
- [성능](../nfr-design/performance-design.md), [보안](../nfr-design/security-design.md), [인프라](../infrastructure-design/infrastructure-specification.md)
- [요구사항](../../../inception/requirements-analysis/requirements.md), [계약](../../../inception/contract-design/contract-summary.md), [Unit 정의](../../../inception/units-generation/unit-of-work.md)
