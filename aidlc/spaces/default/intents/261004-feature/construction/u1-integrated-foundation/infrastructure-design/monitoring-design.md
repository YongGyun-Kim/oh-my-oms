# U1 Monitoring Design

**Unit:** u1-integrated-foundation  
**근거:** 확인된 인프라 Q&A와 ND-OBS-01–08. CloudWatch 중심/OTel·상세trace100% 대상, Slack+이메일을 유지한다. 아래는 설계이며 실제 수집/발송·수신/야간 대응·30일 가용성 실적을 확보한 결과가 아니다.

## Metrics and KPIs

MO-01. NLB는 전송/target 상태를 제공하고 업무 성공 판정은 브라우저/Next/Nest·지속 Receipt/Work·독립 관찰값으로 구성한다. NLB TCP health만으로 HTTP/기업 권한/보호 접수 성공을 선언하지 않는다.

| Metric | Source | Threshold | Why it matters |
|---|---|---|---|
| 핵심 경로별 가용성/미확인 | 승인 customer/staff ingress의 end-to-end·서버 결과/incident 증거 | 연속30일≥99.9%; 불가/미확인2592초 이내 | 다른 업무 성공·점검·외부 장애로 상쇄하지 않음 |
| HTTP read/write p95 | client 송신→본문 수신·동기 외부 대기/등록 결과 | normal1s/2s; whole5s/10s | 기술 실패/timeout·지속202와 전체 업무 완료를 구분 |
| 최초 유효 기술 오류율 | 최초 request outcome·실제 status |≤0.1% normal | retry/202가 최초 실패를 지우지 않음 |
| 화면 준비 | navigation→주요 허용 내용/필수 조작 |p95≤3s | skeleton/LCP만으로 판정하지 않음 |
| eligible work 첫 시작/age | 지속 Work eligible/due→첫 processing |normalp95≤10s | 승인/동의/due·unknown과 실행 적체 구분 |
| ACK 보호/연속 prefix/gap | primary candidate·journal/prefix·외부 ACK 관찰 | 미보호 ACK0; gap 시 보호 변경/실행 제한 | 두 store/순번/원본이 실제 접수 보호 권위 |
| 정확성8영역 | normal/error/중복/동시/배포/복구의 원본 대조 | 정의된 시험 위반0 | 기술 error budget으로 유출·금액/수량·중복을 허용하지 않음 |
| relay/consumer/DLQ | 원본 Work/Outbox/처리표지·queue 지표 | 실제 유한 cap/age 초과·기술/영구/불명 분류 | queue copy와 효과 원본/미확인 업무를 구별 |
| resource/connection/lock·drain | ECS/RDS·role별 pool/global in-flight | 검증된 NI-10/IG-04 cap | 복제 확장이 journal/DB/provider 병목을 숨기지 않음 |
| trace/export/buffer drop | OTel 생성/전달·collector/CloudWatch backend | 등록 요청/시도100% 계측; 실제 loss/cap 초과 관측 | 설정100%는 실제 저장 누락0 증명이 아님 |
| incident/delivery/ACK 지연 | 별도 운영 metadata·검증 provider 결과 | 아래 기한과 미확인 상태 | accept/read/ACK/manual start/recover 구별 |
| 운영 손작업/경과·비용 | 배포/복구 report·item usage | 정상≤30min/일·배포≤15min/회·대표1인작업≤30min | 기다림/전체RTO·야간 준비/실제 인력은 별도 검증 |

## Alerts

MO-02. CloudWatch ECS/RDS/queue/custom alarms·ECS 배포 EventBridge 이벤트와 독립 probe를 운영 Lambda/metadata에 연결한다. AWS native 경보의 실제 지연/누락·시작 ALARM/조회 throttling은 별도 감지로 대조한다. 실제 threshold/window·quota/SDK/finite buffer·max delivery attempts는 IG-04/05에서 고정한다.

| Alert | Condition | Severity | Routes to |
|---|---|---|---|
| 자동 복구/앱 되돌림 시작 | 원래 incident의 새 복구 attempt 시작 | 운영/긴급 조건별 | 즉시 Slack+이메일 생성; 같은 incident/attempt dedup |
| 핵심 업무 불가/감지 누락 | 허용 end-to-end 실패/관측 미확인 | 긴급 |t0+2min 감지/분류 목표; 두채널·현 상태 기록 |
| 실패/수동 필요 | 자동 실패/권한·복구 근거 부족·불명 | 긴급 | 발견 즉시;7min까지 기다리지 않음 |
| 미복구 수동 병행 |t0+7min 아직 미복구 | 긴급 | 두채널 긴급 통지·필요한10min 이내 수동 시작 연결 |
| 미보호 ACK/권한·금액·중복 위반 | 정의한 불변조건/복구 대조 위반 | 긴급 | 보호 변경/새 효과 제한·원본 보존·즉시 통지 |
| 과부하/보호gap/eligible 적체 | 검증 cap/기한·정확성 위험 | 경고/긴급 분리 | role/owner/원래 job/원인·backpressure·두채널 |
| 채널 실패/불명·미확인 | Slack/SNS·담당자 ACK 실패/기한 초과 | 긴급 상태 유지 | 새 사실/지연·대체 정상 채널; 아래 추가알림 규칙 |
| 인증서/비밀 갱신 반영 실패 | 실제 expiry/지원·deploy/회수 확인 실패 | 경고→정의한 긴급 | 별도 운영 alert; 비밀/키 내용은 전송하지 않음 |
| 검증 완료·재개 확인 | 핵심 업무/접수·현재권한/8정확성 대조 완료 | 복구 결과 | 같은 incident/attempt의 두채널 통지; 증거 링크 |

| 시간/상태 | 처리 | 판정 |
|---|---|---|
| fault t0+2min | 감지/분류 | 실제 장애 시각 기준; 감지 시각으로 시계 초기화하지 않음 |
|t0+7min 미복구 | 긴급 수동 병행 | 알려진 실패/수동 필요는 더 일찍 즉시 |
| 필요한t0+10min | 수동 대응 시작 | 메시지 수락/읽음/ACK와 다름 |
|t0+30min | 검증된 핵심 업무 복구 목표 | 재시작/health200/배포COMPLETED만으로 완료 아님 |
| 통지 생성→1min | 각 채널 발송 수락 목표 | 실제 도착/read/담당자 ACK 아님 |
| 첫긴급→3min | 실제 담당자 명시 ACK | 수동 시작/복구 완료 아님 |
| ACK 미확인2min 간격 | 최대3회 추가알림 | ACK 또는 검증 복구 시 반복 종료; exhausted도 UNACK/UNRESOLVED 유지 |

## Independent Delivery and Acknowledgement

MO-03. 플랫폼 운영 Lambda/EventBridge·DynamoDB incident metadata는 OMS API/worker와 두 RDS를 필요로 하지 않는다. 직접 Slack HTTP 전송과 SNS confirmed email subscription의 발송 결과를 별도 기록한다. Slack webhook200/SNS Publish 수락은 채널 전달 서비스의 접수 상태이며 수신/read나 담당자 ACK가 아니다. 실제 지원 응답/불명/수락 정의·email 구독·송신/국내 경로·분 단위 지연을 IG-05/08에서 확인한다. 외부 메시지는 incident/attempt·원인 분류/필요 조치·접근 통제 링크만 포함하고 고객/주문/계약 상세·해당 ID·라이선스/비밀을 포함하지 않는다. 링크 preview의 업무 내용 반출도 막는다.

MO-04. 명시 ACK는 regional API Gateway의 AWS_IAM SigV4 접근/제한된 임시 operator role과 운영 Lambda를 후보로 한다. 실제 IAM authenticated request의 검증된 caller와 확인된 담당자 mapping·원래 incident/expectedRevision/기한을 대조해 metadata를 조건부 갱신한다. body의 actor/role·임의 session name·링크 클릭·읽음만으로 담당자를 판정하지 않는다. assume-role/MFA/trust·실제 caller context·감사와 해당 operator 준비는 IG-05의 코드 선행 검증이다. ACK 권위는 OMS 기업/직원 업무 grant·재처리/복구 실행 승인을 발급하지 않는다. 이 경로는 운영자 도구이고 직원 모바일 업무 UI를 추가한 것이 아니다.

MO-05. CloudWatch 중단 시 EventBridge 기반 독립 probe/운영 실행에서 직접 상태를 평가하고 두채널 전송을 시도한다. app/worker/RDS 고장과 CloudWatch·Slack·email/SNS·운영 metadata·scheduler/secret의 실패를 각각/조합으로 시험한다. metadata가 불가하면 명시 ACK/기한 완료를 허위 기록하지 않고 native AWS 상태 이벤트/경보의 최소 긴급 통지 경로로 연결한다. 같은 원래 사건·이벤트 ID와 지속 기록 복구를 대조해 재알림 횟수/시계가 초기화되지 않게 한다. 이 fallback의 중복/허용 정보·store가 없는 동안 수락/횟수 근거·추후 대조가 실제로 성립해야 한다. 확인되지 않으면 해당 운영 경로와 상용 대응을 허용하지 않는다. 모든 필수 서비스/리전 동시 불가 시 실제 한계·UNCONFIRMED와 나중 대조를 유지하고 전달 완료로 주장하지 않는다. 야간/휴일1개발자의3min ACK/30min 복구 능력은 아직 미검증이다.

## SLIs and SLOs

| SLI | SLO target | Measurement window |
|---|---|---|
| 고객 login/MFA·허용 주문조회/접수·직원 사설조회/판단 각각 | all-cause≥99.9% | rolling30일=2592000s; downtime/unknown union≤2592s |
| 허용 최초 HTTP read/write |normalp95≤1s/2s·최초 기술오류≤0.1% | 정의한 normal20req/s·30min 및 실제 normal 분모 별도 |
| 집중/회복 |100req/s·5min 뒤20req/s·5min 내 정상회복/10min 유지 | 합성 seed/role/operation·대기/거절/보호 접수 모두 공개 |
| 첫 화면/eligible 작업 첫 시작 |p95≤3s/10s | 실제 주요 조작/eligible/due→첫 지속 processing |
| RTO·ACK 복구 RPO |t0→검증≤30min·정의한 성공 접수 누락0 | 앱/worker/store/배포/오삭제·단일AZ 일시 장애 시험 |
|8정확성 | 정의한 시나리오 위반0 | normal/error/중복/동시/배포/복구·현재 권한/업무 원본 대조 |

MO-06. Availability=1−(불가/미확인 초의 합집합÷2592000). audience/업무별 분모와 시간 interval을 유지하고 같은 시간의 중복 원인을 두 배 합산하지 않는다. 계획중단/필수 외부 중단·부분 조회·관측 누락을 성공으로 채우지 않는다. probe 최대60s 간격은 후보이며 scheduling/호출/ingest/알람 합이2min 감지 안에 드는지 시험한다. 실제t0 미확인 시 마지막 정상/최초 실패/관측 해상도와 보수적 미확인 범위를 남긴다. 운영 probe는 실제 MFA/승인 ingress·최소 합성 자격/등록된 안전 operation으로 핵심 경로를 평가하고 실제 지급/출고/SW 제공을 만들거나 인증 우회 endpoint를 두지 않는다. 직원 실제 ingress 준비가 없으면 그 경로는 검증 완료로 보지 않는다.

## Logs and Tracing

| 대상 | 설정/보호 | 검증 |
|---|---|---|
| 서버/worker | OTel의 등록 요청/시도 상세trace100% 생성 대상·CloudWatch/X-Ray 지원 exporter/collector 후보 | IG-03/05의 실제 서울/SDK·유한 byte/queue/timeout·발생량/비용·loss |
| log/span | timestamp/role/version·등록operation·원래 request/correlation/work/consumer/attempt·outcome/latency·최소 참조 | password/MFA/recovery code/cookie/token/license/계약상세·민감SQL/headers/query/payload export 전 제거 |
| 원래 correlation | RequestReceipt/WorkItem 지속 field; sourceFactRef 비NULL은 검증 Fact, NULL은 원래 요청 | 재송달/재기동에서 새 correlation으로 대체하지 않음;span/attempt/messageID는 별도 |
| telemetry 장애 | 유한 buffer/전송·drop 관측 | 업무 원장/접수 보호를 telemetry 대기/내구에 의존시키지 않음 |
| 업무 근거 | PG/보호 원본의 actor/time/reason/전후/정정·증거 관계 | trace는 현재 진단 권한으로 원본을 대조하는 링크이며 수정 권위 아님 |
| 수명/접근 | 한국 log/trace/S3·operator role/정해진 수명·삭제 marker | 실제 법/계약/자료 분류 후 확정; 임의 연수/무기한 보관/자동파기 승인 없음 |

## Dashboard Specifications

| View | 표시 | 목적 |
|---|---|---|
| 경로별 SLO | rolling30일/2592s budget·planned/unplanned/원인별·미확인/해상도 | 특정 업무 실패를 전체 정상으로 숨기지 않음 |
| 지연/queue/store | HTTP 분모/normal/peak·화면/eligible age·global cap/보호 gap/불명/DLQ | 기술/권한/승인/동의/provider 미확인 구분 |
| incident/대응 |t0/감지/각attempt·2채널수락/불명·명시ACK/수동시작/복구검증·추가3회/초과 | 시간 기준/최대횟수·미해결/실제 종결 근거 |
| build/시험/운영 | 정확한digest/config/schema/seed·사람작업/대기·elapsed·실적/합성 구분·비용/잔여staging |1인 운영/목표/지원 검증과 실제 빈도·backlog |
| C19/복구 대조 | 독립 ACK목록↔복구 Receipt/business/history/work/consumer/effect·epoch/prefix·현재회수/파기 | 읽기 증거·누락/중복/충돌/불명·허용 export만 제공 |

## Verification and Readiness

MO-07. infrastructure IG-03/04/05/07/08 및 ND-RG05/06/07/08/10을 적용한다. 실제 tools/SDK/support·자원/retention/시계·채널/ACK/operator·회사망/secret/국내 경로·false positive/missing·failover와 모든 정상/실패/미확인 상태를 시험한다. 독립 ACK 관찰/원본 대조와 민감 표식 redaction·role access 시험은 telemetry 양/비용 시험과 별개다. 문서/설정 검사 통과를 실제 수신/24시간 인력/30일 SLO/RPO0의 증명으로 쓰지 않는다.

## Assumptions & Open Questions

운영 metadata/ACK·probe·collector·fallback은 설계 후보이며 실제 역할/기능/지연/중복·권한/외부 저장/기간·비용은 미확인이다. NI/IG 및 ND-RG의 선행조건을 통과해야 적용한다. 메신저+이메일·시간/횟수 목표는 user 확정이고 그 달성은 미검증이다.

## Sources

- [Observability Design](../nfr-design/observability-design.md),[Reliability Design](../nfr-design/reliability-design.md),[Security Design](../nfr-design/security-design.md),[논리 경계/선행조건](../nfr-design/logical-components.md).
- [Infrastructure Specification](infrastructure-specification.md),[확인된 Q&A](infrastructure-design-questions.md),[C19/운영 계약](../../../inception/contract-design/contract-summary.md).
- [SNS email 설정](https://docs.aws.amazon.com/sns/latest/dg/sns-email-notifications.html),[Slack webhook](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/).
