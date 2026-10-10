# U1 Observability Design

**Unit:** u1-integrated-foundation  
**방향:** CloudWatch 중심 AWS관리형 관측 backend·OpenTelemetry 계측, 등록된 서버 요청/worker 시도 상세trace100% 수집 대상. 실제 SDK/region/collector/trace 저장제품·비용/기간/전달/24시간 대응은 검증 전이다.

## Metrics Collection, SLI and SLO

ND-OBS-01. 고객 login/MFA·허용 주문 조회·허용 주문 접수·직원 사설 조회/판단을 별도 경로/조건으로 관측한다. 각 경로의 연속30일 분모2592000초에 불가 또는 관측 미확인 시간의 합집합을 적용한다. Availability=1-(불가/미확인 초÷2592000), 목표≥99.9%·budget2592초다. 같은 시간의 중복 원인을 합산해 시간을 두 배 세지 않고 원인은 별도로 표시한다. 다른 경로 성공·계획 점검·필수 외부 장애로 특정 경로 실패를 상쇄/제외하지 않는다.

| 관측 | 지점/분모 | 분류 |
|---|---|---|
| 가용성 | 실제 허용 고객/직원 ingress에서 핵심 end-to-end 경로·server/실제 incident 증거 | 가능한/불가/미확인·계획/비계획·원인·관측 오차 |
| HTTP latency/error | client 송신→전체본문·normal valid 최초 요청 분모 | read/write p95·timeout/technical/overload/잘못된 업무 거절 vs정당한 거절 |
| 화면 준비 | navigation→주요허용내용/필수조작 | 최초p95 3초·미표시/오류·cache/network/PC/browser |
| Work | 원본 eligible/due→첫지속 processing |p95 10초·대기/실행/대조/미등록·consumer/기한 |
| 보호/복구 | candidate/prefix/ACK·fault t0→verify | gap/commit 불명/보호지연·ACK 누락/중복·복구epoch |
| 자원 | 역할/접점별pool/lock/CPU/memory/eligible age/collector | actual cap·loss/limit·scale/drain/비용 |

독립 end-to-end probe는 최대60초 간격의 관측을 설계 후보로 하고 실제 scheduling/호출/ingest/알람 지연 합이 t0+2분 감지 안에 들어가는지 ND-RG06/10에서 검증한다. 최초 관측 실패는 즉시 장애 평가에 연결하며 p955분 window만 기다려 기본 장애 감지를 늦추지 않는다. 마지막 정상/최초 실패/실제 injection t0와 timestamp/해상도 차이를 함께 보존한다. real fault t0를 확정하지 못하면 관측 범위/최초 가능한 시각·불확실성을 표시하고 감지 시각으로30분 시계를 새로 시작하지 않는다.

운영 probe는 실제 MFA/직원 승인 경로·최소 test 자격과 등록된 합성 원본/허용 operation을 사용한다. 보호된 실제 접수 경로를 검증하되 실제 지급/출고 등 부작용을 만들거나 production 인증 우회 endpoint를 추가하지 않는다. probe의 sandbox/fixture 제한·실제 provider 사용 범위와 real request/incident 증거를 구분한다. 단순health/read probe로 실제접수·provider 장애를 정상이라고 덮지 않는다. business REVIEW/정당한 권한거절과 기술 실패 때문에 정상 경로가 불가한 경우를 등록된 결과 의미로 분리한다. 통계 누락을100%성공으로 채우지 않고 보수적 미확인 budget과 데이터부족 표시로 남긴다.

ND-OBS-02. 최초 valid 요청의 기술 오류율≤0.1%와8정확성 영역 위반0을 별도 기록한다. retry/202가 최초 외부 기술 실패를 지우지 않는다. 실제 정상 업무상 확인 대기와 기술적 공급자 실패 원인을 따로 계측하며 허용된 Receipt/진행 결과·실제 전체완료를 구분한다. 노출·금액/수량·중복/접수유실은 오류budget의 일부로 허용하지 않는다.

## Structured Logging and Distributed Tracing

ND-OBS-03. OTel은 생성/수집/전달 경계이며 저장/조회 backend나 업무 원본이 아니다. 서버/worker의 등록된 요청/시도 trace를100%계측 대상으로 두고 실제 span 수/byte·collector queue/memory/export deadline/누락·cardinality/국내저장·비용을 검증한다. actual CloudWatch/X-Ray 등 trace feature/SDK/exporter/collector·서울 지원 조합은 Infra에서 선정하며 전체 자동계측/새 plan을 자동 채택하지 않는다. finite buffer/전송 실패·drop을 관측하고 진단 수집 장애를 무한 동기 대기로 업무 처리에 결합하지 않는다.100%설정은 실제 전달/내구 보관/누락0의 증거가 아니다.

허용 log/span은 timestamp·service/role/version·audience/등록 operation·원래 request/correlation/work/consumer/attempt·실제 outcome/error/latency와 필요한 비민감 원본/개정 참조다. 식별자는 접근/국내 저장/수명의 대상이며 label cardinality를 제한한다. payload/민감SQL parameter/password·MFA/복구code/cookie/token·license/계약상세는 source 계측·propagation/export 전 제거한다. 업무 근거/승인/정정은 보호 원본에 보존하고 trace link는 현재 진단 권한으로만 연다. canary·cache/오류/번들/메일/로그 반출 시험으로 검증한다.

ND-OBS-04. FD R-02의 후속 매핑으로 최초 요청의 검증/생성 correlationId를 RequestReceipt와 생성 WorkItem에 지속 보존하는 부가 필드를 등록한다. sourceFactRef가 있으면 검증된 FactEnvelope의 correlation 연결을 사용하고 NULL이면 원래 요청의 persisted 값을 사용한다. 생성/전달/재기동에서 새 correlation을 만들지 않는다. span/attempt/messageID는 별도이고 원래 operation/key/target/actor·개정·근거/정정 관계와 연결한다. Work wire C18 필수 correlationId는 이 원본에서 구성한다. public trace ID는 업무 권한/ID 존재 증거가 아니다. 기존 FD/검토 판정을 수정하지 않는다.

## Alerting Rules, Escalation and Independent Delivery

ND-OBS-05. fault t0/원래 incident/attempt를 기준으로 다음 상태를 지속 대조한다.

| 사건/기한 | 동작 | 의미 |
|---|---|---|
| 자동 복구 시도 시작 | 바로 메신저/메일 통지 생성 | 실패까지 기다리지 않음·같은 incident/attempt로 dedup |
| t0+2분 이내 | 감지/분류 | 앱/worker/store/핵심경로·관측누락·원인/범위 |
| 미복구 t0+7분 | 긴급 수동병행 통지 | 실패/수동필요 확인이면7분 전에도 즉시 |
| 필요한 t0+10분 | 수동 대응 시작 | 채널수락/read/명시ACK와 별개 |
| t0+30분 | 핵심 업무/정확성 검증 완료 목표 | health200/재기동/probe 성공만으로 종결 불가 |
| 생성 후1분 | 각 채널 발송 수락 목표 | 실제 도착/read/담당자확인 아님 |
| 첫긴급 후3분 | 신뢰된 담당자 명시ACK | 수동대응/복구완료와 별개 |
| 미확인2분 간격 | 최대3회 추가알림 | ACK 또는 검증복구 시 반복종료 |

실제 수신자/채널 제품·권한/명시ACK 기능/운영 scheduling은 ND-RG06/10이다. 최대 추가알림 뒤에는 UNACK/UNRESOLVED·지연/수신미확인 근거를 유지하고 조용히 종료하지 않는다. 새 실패/수동필요·복구 결과 통지는 유지한다. 개별 technical retry마다 새 개발자/고객 통지를 무한발행하지 않으며 incident/attempt 관계와 channel delivery attempt를 분리한다. A/B채널 각각 Send/accept·불명/실패·delivered/read가 실제 지원되는 범위를 기록하고 이를 명시ACK로 자동 승격하지 않는다.

ND-OBS-06. 장애감지/최소 incident·발송/명시ACK 경로는 OMS API/worker·primary/journal에만 의존하지 않는 별도 운영 실행/자격/자료 경계로 둔다. 메시지는 incident/attempt·시작/원인 분류/필요조치·접근통제된 추적 링크만 포함한다. 회사/주문/계약 상세·provider/세션/복구 secret을 외부 메신저/메일에 보내지 않는다. ACK는 실제 담당자·원래 incident·발송/수신자와 검증된 source/기한/반복 표지로 연결한다. 운영 ACK 권위는 OMS 직원 업무 token/기업승인/재처리 grant를 발급하지 않는다.

실제 messenger는 Q19 C로 다음 Infra에서 선정하고 이메일 provider/국내자료 경로·primary/journal/app/관측 실패 시 대체 감지/발송·두채널 모두 실패/불명과 store 접근은 함께 검증한다. fallback도 허용한 두채널/현재 접근·자료 최소화를 유지하며 SMS/전화·직원 모바일 업무화면을 추가 선정하지 않는다. CloudWatch/메일/메신저 자체가 실패하는 시나리오의 독립 관찰/자료를 실제 선정 전 미확인으로 남긴다.

## Dashboard Specifications and Recovery Evidence

ND-OBS-07. 대시보드는 역할/업무·시간/자료부족을 구분하고 다음 views를 제공한다.

- 연속30일 경로별SLI·실제 planned/unplanned/원인별 downtime·2592초 소진/남은budget·관측오차.
- 정상/집중 HTTP·p95/error 표본/분모·최초실패·최초화면/eligible work age·DB/원장 보호 gap/queue/consumer/DLQ/불명.
- incident/attempt·t0/감지/자동시작/각채널수락/명시ACK/수동시작/복원/검증·시간초과/미확인/추가3회/종결.
- exact build/schema/config/seed/provider 모드·시험/실운영 구분·정상일/배포/대표복구의 실제 손작업/대기/총경과·미해결 누적.

ND-OBS-08. C19는 접근통제된 읽기 증거다. ACK목록과 복구 Receipt/business/history/work/consumer/effect·epoch/prefix·차이/소실/충돌/불명/관측시각·파기/현재권한 대조와 export 범위를 보존한다. 진단 view가 원본 변경/승인·실제 provider 효과/복구 완료를 생성하지 않는다. RecoveryReport은 NFR4.3 실제 독립ACK 관찰과 owner/Infra 검증 근거를 연결하고 telemetry loss와 business loss를 구분한다.

## Verification and NFR Mapping

| NFR | 설계 | 후속 검증 |
|---|---|---|
| NFR2.2 | ND-OBS-01/02 | actual 허용 login/MFA/직원망·read/write·부분/누락 분모 |
| NFR2.3 | ND-OBS-01/07 |30일/all-cause·2592초·미확인/해상도·단기시험 구분 |
| NFR10.1 | ND-OBS-05/06 | 시작 즉시2채널·attempt dedup·retry 알림폭주 방지 |
| NFR10.2 | ND-OBS-05/06 | 최초 실패/수동필요·수락1/명시3/추가2분×3·지연/미확인 |
| NFR10.3 | ND-OBS-06 | app/worker/primary/journal/CW/mail/messenger 중단·독립 경로/ACK |
| NFR10.4 | ND-OBS-02/03/05 | eligible vs보류/권한거절/provider미확인·실제attempt/deadline |
| NFR5.4 | ND-OBS-04 | sourceFactRef NULL/비NULL·재송달/재기동·현재진단권한 |
| NFR4.5 | ND-OBS-08 | 원본읽기/C19·ACK/복구epoch/외부결과·정정·허용export |

## Assumptions & Open Questions

ND-RG05/06/07/08/10: 실제 도구/지원·수집량/기간/국내경로·시계/해상도·두채널/ACK·야간휴일 운영 인력/자격은 미확인이다.1개발자라는 사실은24/7 3분ACK/30분복구의 확보 증거가 아니다. 검증 전 실제 메시지를 보내거나 서비스/collector를 생성하지 않는다. 합성 관측을 실적/상용통과로 표시하지 않는다. [logical-components.md](logical-components.md)

## Sources

- [observability-requirements.md](../nfr-requirements/observability-requirements.md), [performance-requirements.md](../nfr-requirements/performance-requirements.md), [reliability-requirements.md](../nfr-requirements/reliability-requirements.md)
- [질문과 확인](nfr-design-questions.md): Q14/16–19/26–31·구체화/요약.
- [functional-spec.md](../functional-design/functional-spec.md), [contract-summary.md](../../../inception/contract-design/contract-summary.md)
- [CloudWatch](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/WhatIsCloudWatch.html), [alarms](https://docs.aws.amazon.com/AmazonCloudWatch/latest/monitoring/CloudWatch_Alarms.html): 기능/actual 지원이 OMS 감지/독립수신 달성의 증거는 아니다.
- [OpenTelemetry](https://opentelemetry.io/docs/what-is-opentelemetry/), [Sampling](https://opentelemetry.io/docs/concepts/sampling/): 계측/backend·head/tail 범위 구별이며100% 전달 보장이 아니다.
- [SES event publishing](https://docs.aws.amazon.com/ses/latest/dg/monitor-using-event-publishing.html): 채널수락/전달/read와 실제담당자ACK를 구별한다. SES 도입선택은 아니다.
