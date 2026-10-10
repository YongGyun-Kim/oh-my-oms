# U1 Reliability Design

**Unit:** u1-integrated-foundation  
**입력:** 확인된 Q&A/구체화·고정된 NFR/Functional Design·공통 계약.  
**판정:** 아래 절차는 설계다. 실제 독립 저장/권한·완전한 복구/30분·RPO0·외부 효과/한 사람 운영은 검증 전이다.

## Reliability Targets and Failure Domains

ND-REL-01. 핵심 업무별 연속30일 계획중단 포함99.9%를 유지한다.30일=2592000초, 허용 중단2592초=43분12초이며 SLA 보장/실적이 아니다. 고객 로그인/MFA·허용 주문 조회/접수·직원 허용 조회/판단을 각각 측정하고 한 업무 성공으로 다른 장애를 상쇄하지 않는다. 계산/누락은 [observability-design.md](observability-design.md) ND-OBS-01을 따른다.

| 장애 | 첫 필수30분/RPO0 시험 | 복구/잔여 한계 |
|---|---|---|
| 앱/API/worker 종료·재기동 | 포함 | 원래 Receipt/Work·claim/현재 권한/효과 대조 |
| 저장 구성요소 고장/전환 | 포함 | primary/journal 각각·commit 불명·독립 보호 |
| 잘못된 배포/되돌림 | 포함 | old/new schema/handler·대기 원본/세션·점검 예산 |
| 논리 손상/오삭제 | 포함 | 손상 전 snapshot 뒤의 정상 ACK/정정/회수도 재구성 |
| 단일AZ 일시 전원/망/서비스 장애 | 포함 | actual primary/journal/backup·관측의 실패 배치 검증 |
| 건물/시설 파괴·화재 등 센터 소실급 물리 재난 | 필수30분 시험에서 제외 | 물리 저장/시설이 파괴돼 해당 센터에서 복구 불가한 재난; 일반 저장 고장/AZ 일시 장애로 확대하지 않음 |
| 리전 전체·필수 외부 장기 중단 |30분 재개 별도 미검증 | 성공접수 보존/재개 대조·지원 범위/실제 중단 집계 유지 |

실제 물리 배치/복제/backup·native failover·restore 시간은 Infra ND-RG03/08에서 고정한다. multi-AZ/PITR/두 DB라는 이름만으로 목표를 달성했다고 표시하지 않는다. 센터 소실 제외와 리전 장기 장애 한계는 가용성 중단을 삭제하는 면제가 아니다.

## Atomic Persistence and Protected Recovery Journal

ND-REL-02. primary PostgreSQL이 business/Receipt의 단일 쓰기 권위다. TypeORM의 같은 EntityManager/QueryRunner transaction에 현재 권한/expectedRevision·업무 상태/필요 이력/Receipt·필요 Work/Fact/Outbox·복구 후보를 기록한다. 요청마다 불필요한 Work/Fact를 만들지 않는다. 원장 우선 후보는 별도 보호 PostgreSQL이며 actual AWS 제품/버전·실패 저장/권한/backup은 Infra에서 확인한다. same schema/replica/shared owner/backup을 독립 보호로 부르지 않는다.

| 복구 자료/확장 원본 | 필요한 내용/권위 |
|---|---|
| RecoveryEpoch/CommitOrder | 유효 쓰기 epoch·짧은 transaction의 순번 counter/개정; 등록된 writer/fence |
| RecoveryCandidate | epoch/commitOrder·원래 principal/audience/operation/target/request/key·정규화 입력 식별·schema/content 검증 |
| ReconstructionPayload | 실제 변경 row/개정·전후/참조·Receipt·이력/Work/Fact/Outbox·consumer/effect·tombstone/정정 관계·필요 보안 회수 원본 |
| ProtectedEntry | candidate와 동일한 내용·원장 durable 확인/이전 순서·참조 의존 검증; 기존 entry 덮어쓰기 금지 |
| ProtectedPrefix/View | epoch의 연속 보호 경계와 그 이하 원본 버전의 공개/실행 가시성; 원장에서 재검증/재구성 가능 |
| ExecutionPermit/EffectRecord | 원래 operation/key/target·현재 권한/개정/기한·실제 시작/불명/확정 효과·수신 source·consumer 표지 |

복구 payload는 원래 HTTP 요청을 handler로 재실행하기 위한 로그가 아니다. 재구성 가능한 상태/원본·작업/효과 참조를 보존한다. raw password/MFA/복구 코드·cookie/token/서비스 secret을 payload로 복제하지 않는다. provider binding·권한/회수·코드 verifier/사용 세대 등 필요한 보안 상태는 보호된 목적별 자료와 참조로 검증한다. 파기/세션 복원은 ND-REL-06/ND-SEC-09를 따른다. 위 부가 원본/필드·schema/호환·전체 쓰기 경로는 ND-RG03/07에서 코드 전에 등록한다.

ND-REL-03. 논리 프로토콜은 다음 순서를 따른다.

1. 서버가 원래 ID/정규화 입력·현재 principal/action/target·기대 개정을 확인한다. 같은 key+다른 내용은409다.
2. primary transaction에서 business/Receipt/필요 작업·history와 완전 복구 후보를 commit한다. epoch 순번 counter를 같은 transaction에서 잠금/증가해 commit까지 유지한다. 모든 보호 대상 writer가 같은 순번 권위를 사용하고 consistent lock order·유한 lock 기한을 따른다. timestamp/nextval·worker/queue 순서는 commit 순서가 아니다.
3. primary transaction 종료 후 독립 journal에 같은 candidate를 append하고 durable commit/동일 내용과 앞선 순서/참조를 대조한다. 외부 DB commit 대기 중 primary transaction lock을 유지하지 않는다. 정상 append role은 기존 entry UPDATE/DELETE/TRUNCATE·owner/DDL/승격 권한이 없다.
4. 원장에 끊기지 않고 보호된 연속 prefix를 검증한다. 중간 공백/내용 충돌이면 뒤 기록이 있어도 prefix/ACK를 전진시키지 않는다. 보호 경계/완전 payload 확인 전 success ACK/Receipt 공개·공개 상태 투영/Outbox relay·Work 실행/외부 효과 허가를 금지한다.
5. primary의 보호된 가시성을 갱신한다. 이는 journal에서 검증 가능한 파생 표지이며 표지 유실/부분 갱신을 원래 결과 대조로 복원한다. current view는 미보호 최신 row를 그대로 공개하지 않고 보존된 보호 버전과 prefix를 사용한다.
6. 실제 성공 ACK는 durable primary+필요 독립 보호/prefix 확인 뒤에만 반환한다. 응답이 유실돼도 같은 원래 ID/키의 기록을 대조하고 현재 허용 결과만 투영한다.

권한 회수/계정·factor 무효화의 미보호 최신 변경은 옛 grant/session 허용으로 fallback하지 않는다. 해당 판정이 확정될 때까지 보호 행위를 차단하고 접수 원본은 보존한다. 단순 rollback으로 실패를 숨기거나 primary row의 상태 ACCEPTED만 읽어202를 반환하지 않는다. raw 내부 상태/보호 대기와 공개 Receipt.ACCEPTED를 구분하며 필요한 wire 확장은 먼저 등록한다.

순번 row는 짧은 commit 구간을 직렬화하고 prefix 앞 공백은 뒤 ACK를 막으므로 성능/가용성 공통 실패 범위다. 정상20/집중100req/s와 p95변경2초·HTTP10초·첫 시작10초·원장 장애/복구에서 검증한다. 소유자별 복구 stream으로 바꾸려면 cross-stream 참조/순서/ACK 보호가 별도 입증돼야 하며 임의 partition으로 우회하지 않는다. [PostgreSQL locking](https://www.postgresql.org/docs/current/explicit-locking.html)

ND-REL-04. 두 저장소는 하나의 원자 transaction/2PC가 아니다. 원장 부재/응답 불명은 같은 ID/내용으로 확인한다.

| 실제 관측 | public 응답/후속 효과 | 보존/대조 |
|---|---|---|
| primary 미commit 확인 | 실제 실패; 성공접수 아님 | 원래 키/오류·허용 retry 조건 |
| primary commit 불명 | 성공/실패 지어내지 않음 | 원래 candidate/Receipt/key 조회부터 |
| primary commit·journal 미확인 | 성공 ACK/노출/실행 금지 | 후보/필요 work 보존·journal 원래 내용 대조 |
| journal durable·가시성 표지/응답 유실 | 확인된 prefix/원본 조건으로 재대조 | 같은 원래 결과·파생 표지 복원 |
| 기존 ACK 뒤 primary 손상 | 새 effects 제한·안전 복구 | 독립 journal+backup·ACK 목록/현재 회수/외부 효과 대조 |
| journal 단독 일시 중단 | 보호 변경 제한; 안전한 현재 조회만 | Q20: primary/current auth/직원망/정합성 확인 필수 |
| 두 store/현재 권한/원본 판정 불가 | 보호 조회/변경 거절 | 미해결/접수 보존·독립 장애 알림 |

Q20의 부분 조회 가용성은 전체 업무 복구/SLO 성공이 아니다. journal 복구 뒤 gaps/dependencies·현재 grant/회수·불명 결과와 보호 prefix를 검증한 후 변경을 재개한다. admin/superuser/DDL·backup 삭제/권한과 배포 blast radius의 실제 분리/보호 시험은 ND-RG03/08이다.

## Outbox, Worker, Idempotency and Retry Policies

ND-REL-05. protected Outbox만 relay가 consumer별 SQS Standard queue에 전달한다. send→발행 표지 사이 종료/불명은 같은 Work/consumer/operation 원본으로 다시 대조한다. messageID는 transport copy이며 workId/원래 key를 대체하지 않는다. queue TTL/DLQ/visibility는 원본 수명이 아니다.

worker는 registry·신뢰된 original/Fact·현재 실행 허가/expectedRevision/deadline·epoch/lease를 확인하고 같은 consumer 처리 표지와 내부 효과/후속 사실/작업을 원자 기록·독립 보호한다. 외부 호출은 lock 밖에서 실행하되 먼저 보호된 원래 ExecutionPermit/시작 의도를 확보한다. 외부 결과/consumer 완료도 별도 원자/보호 경계에 연결한다. external unknown이면 같은 operation/key의 observeOriginalOperation으로 대조하고 재송신하지 않는다. epoch/lease 만료만으로 이미 보낸 호출의 실제 효과 부재를 증명하지 않는다. 미등록 handler/schema gap·stale/권한 거절·provider 미확인은 삭제/성공이 아닌 보존된 확인 경로다.

| 항목 | 확인된 기본값 | 불변조건 |
|---|---|---|
| 비동기 안전 retry | 최초1+추가3·최초시도부터5분·개별30초 | 안전 transient만·원래 Work/ApprovedOperation 기한이 더 짧으면 우선 |
| 추가 delay | full jitter0–5/0–20/0–80초 | notBefore/Retry-After·남은 기한/전체한도 안에서 |
| circuit breaker | 접점30초내 연속5회 기술 실패→30초 제한 | business/auth/input/conflict/permanent config 오류와 구별 |
| HALF_OPEN | 부작용 없는 검증 probe 전체1개 | probe 없으면 제한/대조·담당자 확인 유지 |
| DLQ/replay | 업무별 전용DLQ·담당자 원인/결과 확인 뒤 대상 지정 | 원래 IDs/input/이력/효과/현재허가/기한 보존 |

재시도 권위는 owner의 지속 attempt 원본 하나다. SDK/HTTP 자동 retry를 그 경계에서 제어하고 actual sends/대기/실행/정리가 같은 총 예산 안에 있어야 한다. replica/새 message/배포로 횟수·시작 시각을 초기화하지 않는다. queue receive/차단으로 실제 실행하지 않은 호출을 효과/실행 attempt로 위조하지 않고 transport/제어 시도는 별도 계측한다.

breaker/probe 상태는 접점별 검증된 원자 조정 원본으로 전체 replica 상한을 지킨다. 정상 primary가 가용할 때 제한된 operational row/lease를 우선 조정 후보로 두고 실제 제품/접근·시각·실패/기동 조건은 ND-RG04/08에서 고정한다. 조정 원본 불가면 보호 필요한 신규 외부 효과를 제한한다. 추가 요청이 최초 제한 종료 시각을 끝없이 미루지 않는다. probe 성공은 이전 effect/전체복구 성공이 아니며 bounded concurrency 아래 재개한다.

소진/안전 조건 상실 때 work/접수·result/effect·미해결 근거를 보존해 실제 대조/격리한다. DLQ 전송 불명/실패도 source Work를 삭제하지 않는다. 수동 재개는 현재 허가/원래 결과·기한/안전 확인 뒤 지정된 새 실행 구간과 누적 이력을 연결하며 새로운 업무 동의/주문으로 가장하지 않는다. 시스템 자동 복구 시작 통지는 첫 시도부터이며 개별 technical retry마다 무한 알림을 발행하지 않는다. 필요한 수동 병행을5분/회로 종료까지 미루지 않는다.

## Failover, Backup, Logical Recovery and Health Checks

ND-REL-06. 정상 credentials와 독립 journal append/read·복구/관리/backup/수명 권위를 분리한다. restore 권위/도구가 primary가 손상돼도 journal·정상 backup/삭제·회수 marker·외부 결과에 접근할 수 있어야 한다. backup/PITR는 기반 snapshot이며 이후 ACK 자료를 버리는 단독 rollback 수단이 아니다.

복구 실행 절차는 최초 fault t0에 연결된 incident/attempt와 수행한다.

1. 새 변경/claim·영향받는 external effects를 제한하고 old writer/worker epoch를 fence한다. credential/네트워크 회수와 진행중 외부 intent/불명 결과를 확인한다.
2. actual 장애 경계·마지막 검증 snapshot/protected prefix·ACK manifest/원장 entry·파기/회수·schema/code 개정을 수집한다. 같은 장애가 감지/통지/복구 자료도 지우지 않는 독립 경로를 사용한다.
3. 격리된 새 복구 대상/epoch를 만들고 승인 snapshot과 journal의 완전 payload를 순서/참조로 재구성한다. 손상/불법 변경과 유효 이력/정정·나중 ACK를 구분하고 원본 handler/외부효과를 무조건 재실행하지 않는다.
4. 복구 이후 파기/회수·binding 변경 원본을 대조한다. 옛 grant·원래 폐지 조직의 잘못된 재해석·expired key/session·합법 파기 자료를 되살리지 않는다. 세션은 복구 epoch 변경 후 재인증 정책으로 무효화하고 실제 현재 권한으로 재개한다.
5. 독립 시험 주체가 관측한 성공 ACK 목록과 복구 Receipt/업무·history/work/Fact/consumer/effect를 대조해 누락0·중복0·불명 보존을 검증한다. 외부 effect는 원래 provider 조회/근거로 확인하고 미해결이면 추가 효과를 제한한다.
6. 허용 고객 login/MFA·조회/접수·직원망/판단·worker를 실제 확인한다. 신뢰된 새 쓰기 epoch를 한 개만 활성화하고 미발행/미해결 work를 원래 IDs/예산으로 대조/재개한다. 완료 통지/접근 통제된 C19 근거를 남긴다.

Liveness는 프로세스 heartbeat이며 journal/provider 실패 때문에 무한 restart loop를 만들지 않는다. readiness는 현재 실행 역할의 실제 경계/계약/보호 가능성을 분류한다. primary/현재권한·schema가 불가하면 보호 업무 불가, journal만 불가하면 조회와 변경 readiness를 분리한다. 단일health200/probe 성공·프로세스재시작은 복구 완료가 아니다. actual failover 제품/암호키·새DB restore/검증 시간은30분 전체 예산 안에서 ND-RG03/08/10에 실증한다.

## Accuracy, Compatibility and Deployment

ND-REL-07. 아래8영역은 정의한 정상/오류·중복/동시/역순·배포/복구 시험에서 위반0이다.0.1%기술 오류 budget과 상쇄하지 않으며 보편적인 실운영 무오류 보장으로 표시하지 않는다.

| 영역 | U1 보호/후속 owner 검증 |
|---|---|
| 유실/중복 | durable 접수/prefix·같은 원래 key·consumer/effect/ACK 대조 |
| 금액 | Money 정확10진문자열/원래 산식·미확인0원 금지; U3/U4/U6/U7 산식/초과환불 검증 |
| 수량 | 양수/원래 품목·확보/지급/부분동의; U4–U7 실제 예약/출고/취소/발급 원본 |
| 상태/동시 | registered transition/expectedRevision·late fence·상충완료 금지 |
| SW 권한/기간 | 계약/실제기간·갱신/유예/보상 관계; U6/U7 실제 lifecycle·OMS 밖 runtime 구분 |
| 승인/접근 | 현재 grant/원래 조직·망/MFA·확인된 사람/업무별 승인 규칙 |
| 외부 결과 | source/target/observedAt/원래 operation·UNKNOWN/CONFLICT/UNAVAILABLE 보존 |
| 추적/정정 | actor/time/reason·before/after/근거·원래Receipt/Work/correlation·정정관계 |

ND-REL-08. schema/operation/handler·원본/지속 대기자료는 등록된 version으로 해석한다. 새 field/필수/null/enum·Money/time 의미의 breaking 변화는 새 version과 old/new producer/consumer·UI/API/worker를 병행한다. pending키/작업/자료와 recovery payload decoder를 삭제하지 않고 구version 배출/복구 근거 후 종료한다. 일반 배포는 main→staging 자동·production 검사 확인 후 수동 승인·사람작업15분 목표와 점검을 별도 기록한다.

필요 점검은 KST평일20–22시·회당중단≤10분/연속30일누적≤20분·최소24시간 고객화면/기업지정메일 안내다. 예상초과/실패면 배포 중단/안전되돌림·지연안내·복구로 전환하며30분 RTO로 점검 budget을 늘리지 않는다. 모든 계획중단은 가용성에 포함한다. 무중단배포/10분복구는 고도화 목표이며 첫 버전 달성으로 표시하지 않는다. rollback이 데이터 원본/후속 ACK·권한/새schema를 되돌리지 않는지 실제 시험한다.

## Verification and NFR Mapping

| NFR | 설계 | 필요한 검증 |
|---|---|---|
| NFR2.1 | ND-REL-01/ND-OBS-01 | 업무별30일/all-cause·누락/부분장애·2592초 |
| NFR3.1 | ND-REL-01/06 | 각 필수fault·실제 t0→검증≤30분/RPO0 |
| NFR3.2 | ND-REL-01 | 물리제외/일시AZ 구분·region장기중단 보존/집계 |
| NFR3.3 | ND-REL-06 | MFA/망/핵심업무·ACK/효과/현재권한 대조 |
| NFR3.4 | ND-REL-02–06 | logical delete 뒤의 나중ACK·회수/정정/파기 |
| NFR4.1 | ND-REL-02–04 | commit/protection/visibility/ACK 전후 강제종료·gap |
| NFR4.2 | ND-REL-04/05 | 키 동일/내용충돌409·응답유실·external unknown |
| NFR4.3 | ND-REL-06 | 독립ACK목록 vs복구 원본/이력/작업/effect 누락0 |
| NFR4.4 | ND-REL-05 | duplicate/reorder·claim/fence·효과/소비표지 원자/보호 |
| NFR5.1 | ND-REL-07 |8영역·각 owner 실제 모델/산식·U1범위 구분 |
| NFR5.2 | ND-REL-04/07 | 오류budget와 정확성0 분리·불명/존재누출 |
| NFR5.3 | ND-REL-03/05/08 | concurrency·expectedRevision/epoch·migration/rollback |
| NFR8.1 | ND-REL-08 | 공지/전송·실제점검10/20분·모든중단 집계 |
| NFR8.2 | ND-REL-08 | 초과예상/실패중단·되돌림/대기자료/지연안내 |

## Assumptions & Open Questions

독립PGjournal·완전payload/순서/보호 가시성과1인 복구가 목표에 적합하다는 설계 가정이다. ND-RG03/04/05/07/08/10의 actual engine/권한/전환/키·부하/복구/비용·retention/provider 지원은 미확인이다. 필수mapping/상한 없이 persistence/외부 handler를 실행하거나 문서 검사를 실제복구로 표시하지 않는다. actual proof 전 성공접수 RPO0/30분·1인 운영을 상용 보장하지 않는다. [logical-components.md](logical-components.md)

## Sources

- [reliability-requirements.md](../nfr-requirements/reliability-requirements.md), [security-requirements.md](../nfr-requirements/security-requirements.md), [tech-stack-decisions.md](../nfr-requirements/tech-stack-decisions.md)
- [확인된 질문/구체화](nfr-design-questions.md): Q2/8–11/15/17/20/23/29–31.
- [functional-spec.md](../functional-design/functional-spec.md), [contract-summary.md](../../../inception/contract-design/contract-summary.md)
- [AWS Outbox](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/transactional-outbox.html), [SQS Standard](https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/standard-queues.html): 전달 패턴이며 전체원자/효과/RPO0 증거가 아니다.
- [AWS idempotent retries](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/), [retry limits](https://docs.aws.amazon.com/wellarchitected/latest/framework/rel_mitigate_interaction_failure_limit_retries.html), [circuit breaker](https://docs.aws.amazon.com/prescriptive-guidance/latest/cloud-design-patterns/circuit-breaker.html): 안전/호출제한 참고이며 OMS 숫자/실제 지원/회복의 근거로 전용하지 않는다.
- [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html), [RDS PITR](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_PIT.html): 실제제품/전체내구/독립보호/복구 달성은 별도시험이다.
