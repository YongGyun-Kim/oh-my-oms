# U1 Logical Components and Implementation Handoff

**Unit:** u1-integrated-foundation  
**판정:** 네트워크 제품/IaC가 아닌 논리 경계·원본·실패/검증 책임이다. 확인된 [질문/구체화](nfr-design-questions.md)의7개 설계 산출물과62개 NFR을 연결한다. 실제 코드/AWS 자원/계정·검사·상용 목표 달성은 아직 없다.

## Logical Component Inventory and Service Boundaries

ND-LOG-01. 공유된 Nest 업무 핵심의 단일 owner 쓰기 권위와 고객UI/직원UI/API/worker4개 실행 역할을 유지한다. 각 업무의 typed port/operation/schema registry를 바꾸지 않고 신규 binding 전에 필요한 확장을 등록한다.

| 논리 구성 | 소유/입출력·원본 | 주요 보호 |
|---|---|---|
| 고객 Next UI/BFF | C13/C14·등록된 customer operation/최소 DTO | host/audience·현재사용자/CSRF·보호 no-store·PC1280+ |
| 직원 Next UI/BFF | C13/C15·staff operation | 회사 승인 사설 ingress·MFA/현재grant·모바일제외 |
| Nest Express API | C00/C16/C17·공유 owner 호출 | canonical2020-12·신뢰된 ServiceContext·실제 status |
| IdentityRecovery/provider adapter | C01/C21·Account/Challenge/Session/VerifiedPersonLink | pool/audience·목적/MFA·bindingGeneration·회수/복구 |
| EnterpriseAccess | C02·Enterprise/Membership/Role/Grant/Application | 기업/첫admin/동일인근거·현재 scope·조직개정 |
| 업무 owner modules | C03–C12·원래 계약/상품/주문/이행/통지 | owner가 의미/원본/전이/실행 허가 책임 |
| primary persistence kernel | business/Receipt/History/Work/Fact/Outbox/복구후보 | 같은 TypeORM tx·key/expectedRevision/epoch·순서/가시성 |
| 보호 journal | 독립 복구자료·prefix/참조/내용대조 | 별도append/read/복구/관리·DDL/backup/국내경로 |
| Outbox relay | protected 원본→consumer별 queue | send 불명/중복·원래Work/consumer·발행표지 |
| Nest standalone worker | C18·등록handler/원래Work/Fact/permit | 명시 schema/current권한·lease/fence·효과/표지 보호 |
| 업무별 SQS Standard/DLQ | 전달 copy | queue expiry/redrive≠원본삭제/새업무; 원래IDs |
| 외부 owner adapters | C21–C25·실제 승인 작업/결과 대조 | 실제 provider/source/target/지원·unknown·breaker |
| C19/OperationalAssurance | 진단/검증자료 읽기 | 원본변경권한 아님·ACK목록/복구epoch 대조 |
| 독립 운영 감지/incident/통지/ACK | C26·최소 운영 metadata/수신자 | app/worker/stores와 다른 실패 경로·2채널·명시ACK |
| CloudWatch/OTel 경계 | 최소 metrics/log/trace | backend/계측분리·finite buffer/국내/수명/접근 |

U1은 신원/기업 신청·승인/첫admin·현재권한/직원상품등록·HW 또는SW 한 타입의 다품목 주문 접수/전체 확인대기·지속기록/worker·최소 고객/직원UI·진행 조회를 연결한다. U2–U7 소유자 확장·U8/U9 전체화면·U10 실운영/전체측정 책임을 U1에서 완료로 바꾸지 않는다. 실제WMS/재고/배송·SW runtime·금융/ERP/CRM/PIM은 각 port 바깥 실행/원본 권위이며 연결이 미확인이면 UNCONFIRMED다.

## Failure Domains, Isolation and Blast Radius

ND-LOG-02. queue/consumer·역할/credential·ingress 분리는 실패를 제한하지만 공유자원을 제거하지 않는다.

| 장애/공유자원 | 영향을 받는 것 | 유지 가능한 경계/필수 대응 |
|---|---|---|
| 고객UI | 고객 화면/직접 UI 관측 | 직원 경계/API별 실제 가용성 측정·BFF fallback 우회 금지 |
| 직원UI/회사접속 | 직원 인증/화면/판단 | 고객 가용성 별도; 공개 staff fallback 금지 |
| 공유API/core registry | 모든 business HTTP·현재 평가 | 독립감지/알림·work/원본보존·단독health로 완료 금지 |
| primary DB/자격/현재권한 | 보호 조회/변경·worker 실행권위 | fail closed·journal/backup 격리복구·늦은외부결과 대조 |
| journal/prefix/공유순번 | 보호변경/ACK/후속실행 | primary/current권한/정합성 정상 확인된 조회만 |
| 특정queue/consumer | 해당 원래work 전달/처리 | 다른 consumer는검증cap 아래·Outbox/원본대조·DLQ |
| 외부접점 | 해당 실제확인/효과·허용예외/Review | 원래unknown·한도/breaker·다른경로 성공으로 숨기지않음 |
| 관측/메일/메신저 | 진단/감지/수락/ACK·실적근거 | 독립대체관찰/미확인·channel별실패·업무원본과분리 |
| region/관리/배포/IAM/key/backup | 복수role/store/복구/통지 | actual 실패범위/독립자격·장기한계·접수보존/대조 |

실제 AZ/region/네트워크·계정/role/관리·원장/backup 저장 분리와 관측 대체 경로는 Infra에서 검증한다. C12/OperationalAssurance와 회사 IT/보안 역할은 실제 사람이 확보됐다는 뜻이 아니다. 독립journal은 normal앱 삭제/DDL와 primary 논리손상에서 보호되어야 하고 superuser/owner로 강제로변경 가능한 범위를 시험한다. 앱이 같은 superuser/backup 자격을 가진 두 DB는 독립복구 보호가 아니다.

## Contract, Revision and Correlation Mapping

ND-LOG-03. C00–C26의 typed port·owner/operation/target/audience/error·C13–C18의canonical schema와 CE01–04를 실제 registry에 연결한다. 새 required field/null/enum/의미는 closed input/producer에서 binding 전에 version/compat를 검증한다. unknown consumer field 무시와 producer 검증을 혼동하지 않는다.

| 대응 | 원본/변경 조건 | 기존 원본 보존 |
|---|---|---|
| organisationRevision | EnterpriseAccess.Enterprise.revision; 조직 생성/활성/계층/정책 변경과 같은 tx로 증가 | 신규문맥 commit 대조; 과거 주문 snapshot/NULL·폐지ID 유지·현재 행위 별도평가 |
| Work correlationId | 최초 RequestReceipt/WorkItem persisted 확장; Fact 있을 때 검증Fact의 연결 | sourceFactRef NULL도원래요청 값; retry/message/span으로교체금지 |
| provider binding | 안정 Account + issuer/subject/audience/generation/상태/근거 | 옛 subject/session 무효화·새 신원으로 업무참조 재작성금지 |
| RecoveryCandidate/Entry | material business/auth/접수/작업/효과·원래key/schema/순서/epoch | after-image/참조/tombstone·correction/회수·재구성완전성 |
| effect/permit/consumer marker | 원래 operation/key/target·current권한/기한/개정·epoch/lease | duplicate/reorder/unknown/late-recovery 대조·효과무조건재실행금지 |

FD R-01/R-02와 NFR 문구 보완은 이 후속 매핑/신규·기존 적용으로 연결한다. 이전 FD/NFR/리뷰 파일을 수정하거나 과거 finding의 판정을 소급 바꾸지 않는다. actual field/schema/driver/키수명·원본 migration·역호환은 ND-RG01/03/07의 코드 전 조건이다.

ND-LOG-04. 실제 Node/TypeScript/Nest/Express/Next/React/CDK/PostgreSQL·TypeORM/pg/validator 조합의 supported major/exact version·OS/운영지원·advisory·lock/migration/driver를 Code Generation 전에 확인·고정한다. 최신 docs의major를 곧바로 채택하거나 Nest가 ORM/queue제품을 자동 선정했다고 표시하지 않는다. code 생성 이후에는 그 lock과 canonical 계약을 로컬/CI/격리환경에서 동일하게 검증한다. 허용된 incremental 변화는 consumers/대기자료/세션/원장 decoder까지 함께 확인하고 breaking 변화는 새version 병행·safe rollback을 시험한다.

## Locale, PC and Accessibility

ND-LOG-05. 첫 제품은 ko-KR/KRW/Asia-Seoul이고 영어(en-US) 추가를 위한 message/date/number formatting 경계를 분리한다. 거래 Money는 정확10진문자열/통화·계약 당시 산식/rounding ruleRef로 보존하고 binary float로 왕복/계산하지 않는다. 시간은 실제 instant/달력경계·합의timezone/기간 ruleRef를 원본과 함께 해석하고 표시locale로 이용기간/기산을 재작성하지 않는다. 영어 지원을 USD/미국시장/해외저장으로 확대하지 않는다.

고객/직원은1280 CSS px 이상PC 대상이고 직원모바일 UI를 제공하지 않으며 고객모바일은미정이다. 실제 출시시점 고객Chrome/Edge/Safari/Firefox·직원Chrome/Edge 최신/직전안정버전과 대표OS/PC·cold/warm 조건을 확인한다.1280은 단말/인증 판별이 아니며 PC zoom/reflow·키보드/label/focus·색 외 상태/오류·만료/재인증/복구·live조회 안내의 WCAG2.2AA 검증을 면제하지 않는다. 자동갱신/만료 알림이 focus/사용자작업을 불필요하게 뺏지 않도록 최소 UI와 전체U8/U9 흐름을 실제 자동/수동 확인한다. 적합성 인증/달성을 아직 주장하지 않는다.

## Operations, Verification and Delivery

ND-LOG-06. 기능범위를1인개발 때문에 줄이지 않는다. 정상일 반복 기술 손작업≤30분/일·일반 배포≤15분/회·대표장애 한 사람복구 손작업≤30분 목표는 자동대기/총경과·빈도/누적미해결·판매업무와 별도측정한다. 야간/휴일 반응/감지/복원/검증을 합친RTO30분은 별도이며 숨은추가 수동복구 인력을 빼지 않는다. 계약등록과 다른승인자 필요/업무별권한을 기술운영1명으로 면제하지 않는다.

main의짧은branch·본인검토/검사·squash·main병합후staging자동·production검사/핵심동작 확인 후 수동승인을 유지한다. 배포호환/actual 점검중단·rollback·공지와hands-on/대기를 기록한다. 문서작성은 지금의commit/push/deploy 요청이 아니다.

ND-LOG-07. test-after/Standard 단위·통합과 직접작성한 테스트가능 제품전체의 line coverage≥80%를 따른다. 미실행 파일도분모에포함하고 생성물/외부코드 제외사유를 기록한다. AC별 정상/실패/경계·권한/계약/동시/중복/복구와 실작성 계층을 연결한다.80%/문서 trace OK를8영역/전체AC/실연동 통과로 전용하지 않는다. 로컬/CI의 formatter/linter/type/canonical contract·secret/SAST/deps/CDK/생성infra/격리runtime검사 도구/명령/분모/차단선·보고서는 ND-RG07에서 적용 전에 고정한다. 실패/미실행/누락과 flaky재실행으로 우연통과한 경우 병합/해당배포를 보류한다. 예외는담당/사유/만료/재검토를 보존하며 actualsecret은폐기/교체/사용·영향대조한다.

## Implementation Readiness Gates

아래gate는 실제사실/값을 확인할 책임과 차단시점을 고정한다. 설계연결을 missing fact의해소나 상용준비 통과로표시하지않는다. 작성 가능한패턴을 앞단계로 소급변경하지 않는다.

| ID | 확인할 사실/유한값·증거 | 책임 | 선행시점/차단 영향 |
|---|---|---|---|
| ND-RG01 | 실제identity/MFA지원·등록/복구purpose/entropy/개수/verifier·수명/시도·factor 종료/격리 또는 검증rebind·binding/기본계정/동일인/최소grant | U1/U2·보안/업무확인자·Infra | 해당인증/승인코드·실계정전; 미확인경로는 업무완료/접근불가 |
| ND-RG02 | actualNext/host/cookie/origin/CSRF/proxy·SSR/RSC/cache/prefetch/첨부·세션활동/회수·첫표시 | U1/U8/U9·Infra/품질 | 최소UI/전송코드·실자료/화면시험전 등록/경계시험 |
| ND-RG03 | primary/journal engine·완전payload/schema/순서/prefix/가시성·commit불명/내구·role/DDL/backup·키/consumer수명·epoch/fence/recovery decoder | U1/각owner·Infra/U10 | persistence/worker/복구코드전; actualRPO/복구/상용약속전시험 |
| ND-RG04 | request/response/filter/cursor/file/라인한도·fanout/due/부하·pool/concurrency/buffer·SDK/기한/cancel·replica/trigger/drain/CPU/메모리/비용·breaker/probe조정 | U1/owner/품질·Infra/U10 | 해당계약/handler/자원/부하시험전 유한config고정; 누락운영활성금지 |
| ND-RG05 | 실제기간/근거·법/고객조건/자료분류·정정/파기/marker/key/backup·국내data path | 자료/업무확인자·각owner/Infra | 실제provider적용/실데이터전; 무기한보관/임의파기금지 |
| ND-RG06 | actualCW/OTel/tracefeature/SDK/collector·SLI/분모/probe≤60초와2분감지증거·독립incident/2채널/ACK·수신자/추가반복·시계/국내/비용 | 운영/개발·Infra/U10 | 계측/통지코드/운영시험전; 수락을수신/명시ACK로표시금지 |
| ND-RG07 | supportedexactversions/OS/driver/migration/lock·canonical2020-12validator·CE01–04/추가field·local/CI검사명령/도구/차단선/보고서/예외 | 개발/품질/보안·U1/CI | version/validator는CodeGeneration전; 검사/CI/배포전실제고정·미실행차단 |
| ND-RG08 | 실제회사단말/망승인/회수·staff직접/공개우회·AZ/저장실패범위/자격/backup/key·독립관측/통지대체경로 | 회사IT/보안·Infra/U1/U10 | 해당직원접속/infra코드·출시전actual경계/장애시험; OMS MDM으로대체금지 |
| ND-RG09 | 기업/첫admin/계약·산식/기간/수량/부분동의/증거·실제WMS/재고/지급/배송/SW권위/지원/결과대조 | 실제업무확인자·U2–U7/adapterowner | 해당업무code/실거래전; fixture를actual합의/효과로표시금지 |
| ND-RG10 | 실제30일경로별SLI·8영역/전체부하/기본fault·ACK대조/30분·야간휴일반응/2채널수신·1인hands-on/자동대기/적체 | U10/Infra·운영/품질·각owner | 운영/상용약속전; 목표를실적/보장으로전용금지 |

ND-OQ01→RG01/02/08/09,02→RG02,03→RG03/04/10,04→RG02/04/10,05→RG05/08,06→RG06/10,07→RG07로 연결한다. 기업/업무인력·제공자가 없으면 해당 실제실행은차단하지만 합성/패턴설계가 실제인력 확보라고 표현하지 않는다.

## NFR Mapping and Design Navigation

| NFR | 설계 | 후속검증 |
|---|---|---|
| NFR9.1 | ND-LOG-06 | 정상일손작업/대기·판매업무·누적·개선후재측정 |
| NFR9.2 | ND-LOG-06/07 | branch/본인검토·staging/prod승인·15분손작업·검사차단 |
| NFR9.3 | ND-LOG-06/RG10 | 한사람대표fault≤30분손작업·야간/전체RTO·승인자별개 |
| NFR9.4 | ND-LOG-01/02 |4역할·공유core/단일owner·NestExpress/Next/PG/CDK·runtime |
| NFR12.1 | ND-LOG-05 | ko-KR/KRW/Seoul·decimalMoney/원래rule/기간·en-US경계 |
| NFR12.2 | ND-LOG-05 |1280PC·직원모바일제외·zoom/reflow·단말보안별개 |
| NFR12.3 | ND-LOG-05 | 출시시점실제browser/OS·최신/직전안정 흐름/오류 |
| NFR12.4 | ND-LOG-05 |WCAG2.2AA keyboard/label/focus·만료/복구·자동/수동 |
| NFR13.2 | ND-LOG-07 |test-after/Standard·작성가능전체/미실행파일80%·AC별시험 |
| NFR13.3 | ND-LOG-07 |same local/CI명령·reports/실패차단·flaky위장금지 |
| NFR13.4 | ND-LOG-04/RG07 |actualexact lock/지원·보안/driver/schema·코드전고정 |
| NFR13.5 | ND-LOG-03/04 |producer/consumer/version·대기/원장/세션/되돌림 |

- [performance-design.md](performance-design.md): ND-PERF-01–05/조회·변경/표시·first-start·cache/page/pool.
- [security-design.md](security-design.md): ND-SEC-01–11/신원·현재권한/망·CSRF·자료/검사.
- [scalability-design.md](scalability-design.md): ND-SCALE-01–05/부하·global cap/scale/drain.
- [reliability-design.md](reliability-design.md): ND-REL-01–08/원자접수·보호prefix/복구·효과/retry·정확성/배포.
- [observability-design.md](observability-design.md): ND-OBS-01–08/SLI·trace·독립알림/명시ACK·C19.
- [traceability.json](traceability.json):14개상위NFR의62개세부ID별설계연결. OK는실제구현/시험PASS가아니다.

## Assumptions & Open Questions

위구조/독립journal·4역할의bounded autoscale·CloudWatch/OTel과제공자교체가 기능범위/1인운영/성능/보안/복구 목표에적합하다는 assumption이다. actual서비스/계정/조건은ND-RG표에미확인으로남긴다. 실제가용성·아키텍처검증과품질보고서 없이 출시/인력/법준수를 주장하지 않는다.

## Sources

- [performance](../nfr-requirements/performance-requirements.md), [security](../nfr-requirements/security-requirements.md), [scalability](../nfr-requirements/scalability-requirements.md), [reliability](../nfr-requirements/reliability-requirements.md), [observability](../nfr-requirements/observability-requirements.md), [tech-stack](../nfr-requirements/tech-stack-decisions.md)
- [확인된 질문/요약](nfr-design-questions.md), [functional-spec.md](../functional-design/functional-spec.md), [contract-summary.md](../../../inception/contract-design/contract-summary.md)
- [components.md](../../../inception/domain-design/components.md), [unit-of-work.md](../../../inception/units-generation/unit-of-work.md), [team-practices.md](../../../inception/practices-discovery/team-practices.md)
- [FD 검토](../functional-design/reviews/review-01.md), [NFR 검토](../nfr-requirements/reviews/review-01.md): 후속매핑/적용근거이며과거판정을소급수정하지않는다.
