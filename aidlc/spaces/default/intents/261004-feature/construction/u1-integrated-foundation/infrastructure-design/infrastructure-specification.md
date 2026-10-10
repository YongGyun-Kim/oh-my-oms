# U1 Infrastructure Specification

**Unit:** u1-integrated-foundation  
**근거:** [확인된 Q1–Q12와 요약 확인](infrastructure-design-questions.md).  
**범위:** 인프라 설계다. 실제 자원/권한·비밀·발송·배포/시험을 수행한 결과가 아니다. '검증 후보'는 사용자 확정과 구별하고 IG 선행조건을 통과한 값만 적용한다.

## Deployment

| Facet | Choice | Rationale |
|---|---|---|
| 계정 | AWS Account1개; 운영/합성 staging/보호 원장·복구의 stack/resource/role/secret 분리 | Q3 교정. 다계정/Organizations를 필수로 두지 않는다. 계정 관리자의 공통 권한·실패 범위는 남는다. |
| 실행 | 고객 Next UI/BFF·직원 Next UI/BFF·NestJS+Express API·Nest standalone worker의4개 ECS Fargate service | Q2. 공유 업무 모듈/owner 쓰기 권위와 typed HW/SW를 유지하며 도메인 microservice를 추가하지 않는다. |
| 지역/망 후보 | 한국 저장용 ap-northeast-2 단일 리전·VPC1개/2개 AZ | 실제 AZ ID/지원·국내/외부 자료 경로는 IG-01/08. 지역 확보 사실로 표현하지 않는다. |
| ingress 후보 | 공개 고객 NLB1개; 사설 직원 UI/API NLB1개; listener/SG 분리 | TCP TLS 통과로 브라우저/BFF가 실제 서버 인증서를 검증. [A1–A3] |
| egress 후보 | task별 제한 SG·공인 IPv4/IGW 송신; DB는 private subnet/공개 접근 없음 | NAT 상시 자원을 추가하지 않는 후보. task 공인 주소는 업무 공개 허가가 아니며 직접 접근 차단을 시험한다. |
| 저장 | 별도 Single-AZ RDS PostgreSQL 업무 DB/보호 원장2개, 서로 다른 AZ | Q5/Q6 C. 동일 instance의 두 DB/schema나 업무 복제본으로 원장을 대체하지 않는다. |
| 환경 | 로컬 Docker 합성 개발/시험; main 병합 후 생성하는 staging; CDK 운영 배포 | Q4/Q12. 검증/보고서·사람 확인 후 staging 실행 자원 정리, 승인 근거와 운영 자료 별도 보존. |
| IaC/승인 | TypeScript CDK·GitHub Actions/OIDC·staging 자동·production 본인 확인/수동 | 정확한 source/image/config/schema/report와 승인을 연결. 현재 IaC/정책 코드 생성 없음. |
| 배포 | ECS rolling·현재 상태와 호환을 검증한 이전 완료 앱 버전으로 조건부 자동 되돌림 | Q11. 원장/접수/작업·현재 권한/회수·외부 효과를 보존. |
| 최초 자원 후보 | 역할별 min1/max2; UI각0.25vCPU/0.5GiB, API/worker각0.5vCPU/1GiB; Linux x86_64 | 시험 시작 후보이며 실제 적합성/상한 승인값이 아니다. IG-03/04의 지원·부하/복구·비용 확인 전 운영 autoscale 활성화 금지. |

## Infrastructure Services

| Service | Role | Configuration | Notes |
|---|---|---|---|
| ECS Fargate/ECR |4역할·image | role별 service/task role/health/drain·digest 고정 | 임시 배포 task까지 global pool·외부 호출/비용 예산 포함. image에 비밀/실제 고객 seed 없음. |
| NLB2개 | 공개 고객·사설 직원/API | 고객 TCP443→고객 task; internal TCP443→직원 task, TCP8443→API task; cross-zone 활성화 후보 | 직원443은 승인 회사망만,8443은 등록 BFF/실행 SG만. 고객 BFF는 직원443에 접근 불가. STAFF 행위는 현재 신원/원래 직원망 증거 별도 필요. [A1–A3] |
| DNS/ACM exportable public certificates | 서버 이름/TLS | 고객/직원/API별 실제 소유 FQDN·서로 다른 인증서; TCP 통과 후 task TLS adapter 종료 | 발급/내보내기·키/갱신 배포·도메인·실제 지원은 IG-01/08. Private CA/단말 CA 필수 도입 없음. [A4] |
| 업무 RDS PostgreSQL | 업무/권한·Receipt/Work/Outbox/복구 후보 | private endpoint·저장/backup 암호화·동일 TypeORM transaction | 현재 권한/개정/단일 쓰기 권위. 실제 engine/pool/DDL/backup 설정은 IG-02/03/04. |
| 보호 RDS PostgreSQL | 완전 복구 원본/연속 prefix | 다른 AZ/instance·append/제한 대조·복구/관리 role 분리 | 앱에 기존 entry UPDATE/DELETE/TRUNCATE·owner/superuser/DDL/승격·backup/key 파기 권한 없음. 실제 관리 우회/공통 실패 시험. |
| SQS Standard/consumer별DLQ | 전달 copy | registry별 queue·암호화·원래 허가/lease/attempt 대조 | 같은 Nest worker 역할에서 소비. queue 순서를 재고 FIFO/효과 부재로 해석하지 않음. |
| Cognito pool2개 | 고객/직원 신원 | 고객 공용1·직원1·password+TOTP·필수 OMS 복구 코드 | Account/bindingGeneration/목적/현재 grant는 OMS 권위. 출시 후 Keycloak 전환·실제 provider 지원 IG-02. |
| Secrets Manager/KMS | 기술 비밀/암호화 | 환경/목적/role별 조회; 원장 관리/복구 secret 앱에 비노출 | IAM 임시 자격과 raw password/MFA/code/token을 혼동하지 않음. 교체/반영·키 회수/국내 경로 IG-02/08. |
| CloudWatch Logs/Metrics·OTel/X-Ray 전달 후보 | 최소 진단/SLI | 서버/worker 상세trace100% 계측 대상·유한 buffer·누락 지표 | 서울 feature/SDK/collector·기간/비용 IG-05; 자동계측/새 plan 일괄 활성화 없음. |
| EventBridge/Lambda·DynamoDB 운영 metadata | 독립 감지/incident/통지/ACK | AWS 이벤트/등록 probe·별도 실행/role/자료 | 플랫폼 감시는 업무 API/worker가 아님. incident/attempt/기한·수신자/ACK만 보관, 업무 원본/원장 대체 금지. |
| Slack adapter/SNS email |2채널 운영 알림 | 운영 Lambda의 Slack HTTP·SNS email 별도 delivery 대조 | 구독/설치/수신자·accept/ACK/외부 저장 IG-05/08. 실제 발송 없음. |
| regional API Gateway IAM/운영 ACK Lambda | 담당자 명시 확인 | SigV4·임시 operator role·원래 incident/expectedRevision·조건부 metadata 갱신 | OMS 직원 세션/업무 grant와 별도 권위. operator/MFA/trust·검증된 caller identity 확보 전 적용 금지. |
| 한국 S3 | 빌드/시험·복구 대조 증거 | 암호화·환경/role/prefix·확인된 수명/파기 marker | journal 자체는 PG다. 진단 로그나 S3를 원장 선택 변경/보호 누락 대체로 쓰지 않는다. |

## Shared Infrastructure

| Shared Resource | Owner Unit | Consumer Units | Access Boundary |
|---|---|---|---|
| 업무 PG/보호 journal | U1 기반·업무 owner별 쓰기 | U2–U7; U8/U9는 API; U10 허용 진단 | owner의 현재 권한/승인·TypeORM 원자 기록을 거침 |
| 신원/Account·세션/binding | U1/U2 | UI·업무 owner | 기업 승인/첫 관리자 지정/상품 등록은 각각 grant 필요 |
| queue/DLQ/worker host | U1 | U2–U7 registry consumer; U10 관측 | 필요한 queue만 send/receive; SYSTEM/사용자 위임 검증 구분 |
| image/계약 registry/배포 | U1/CI | 확장 Unit 전체 | 승인 digest·schema/operation/handler 호환; 외부 PR에 운영 자격 없음 |
| 운영 metadata/관측 | U1 플랫폼/U10 운영 검증 | owner는 최소 진단 값 공급 | 읽기 증거/incident ACK가 업무 변경·재처리·기업 승인 권한이 아님 |

## Network and Trust Boundaries

NI-01. 고객 PC→공개 NLB443→고객 Next TLS; 승인 회사망/회사 승인 원격 PC→회사 사설 연결→internal NLB443→직원 Next TLS; 등록 BFF→internal NLB8443→Nest TLS다. worker는 inbound 업무 HTTP를 제공하지 않는다. target SG는 관련 NLB SG/health port만 허용하고 task 공인 IP 직접 접근을 거절한다. internal443과8443의 ingress SG를 각각 승인 회사 CIDR과 BFF/실행 SG로 제한한다. NLB 생성 시 SG·source preservation/proxy protocol·cross-zone·health/fail-open을 실제 시험한다. 원래 망 근거는 신뢰한 ingress/직원 TLS edge에서 구성하며 client X-Forwarded-For/UA만으로 증명하지 않는다.

NI-02. 기존 회사 연결은 없다. 회사 네트워크 운영이 입장/회수·라우터/주소·회사 관리 VPN 등 사설 VPC 연결을 준비한다. 실제 제품/장비·CIDR/경로·담당자/자격/국내 경로 확인 전 설치 완료로 보지 않는다. OMS에 단말 등록/MDM/기기 CA를 추가하지 않는다. 미준비 동안 합성 격리 시험과 실제 직원망 검증을 구분하고 직원 출시를 허용하지 않는다.

NI-03. TLS adapter는 해당 실행 task의 전송 구성이다. 브라우저/BFF/SDK가 host/chain/SNI를 검증하고 task 내부 앱 연결은 같은 신뢰 경계의 local socket로 제한한다. 실제 Next/Nest adapter/package·TLS1.3/필요한TLS1.2·파일 권한·메모리/갱신·rolling 반영은 IG-01/03/08에서 고정한다. 검증을 끄지 않는다. certificate export/갱신 관리 역할과 해당 key의 runtime Secret 조회를 분리한다. exported certificate는 실제 소유한 DNS 이름/지원/비용이 필요하다. [A1·A4]

NI-04. 고객 BFF는 CUSTOMER operation만 중계한다. Nest는 원래 opaque session/binding·현재 grant를 검증하고 STAFF에는 승인 ingress 증거와 staff BFF의 검증된 서비스 문맥을 함께 요구한다. 공유 자격/body role·MFA로 승격하지 않는다. 별도 host-bound cookie·민감 HTML/RSC/API no-store·public 인증 POST의 CSRF/origin을 유지한다. 권한 판정 불가/미보호 최신 회수는 옛 grant fallback을 금지한다. [S2·S6·S8–S9]

## Persistence and Recovery

NI-05. ND-REL-02–06의 같은 primary TypeORM transaction에 업무/현재 개정·Receipt/필요 history/Work/Fact/Outbox와 완전 RecoveryCandidate를 기록한다. epoch counter를 commit까지 잠금/증가하고 transaction 종료 후 별도 journal에 동일 candidate를 durable append/대조한다. 연속 protected prefix·내용/참조 확인 전 ACK/공개 상태·Receipt/relay/실행/외부 permit을 금지한다. 가시성 표지는 journal에서 재구성 가능한 파생 자료다. 두 저장소는2PC/하나의 원자 transaction이 아니다. [S4]

NI-06. journal 단독 장애는 현재 primary/auth/직원망/정합성이 확인된 안전 조회만 유지하고 보호 변경/새 효과를 제한한다. commit/보호/응답 유실은 같은ID/key/내용으로 대조한다. external unknown은 원래 operation을 확인하고 lease 만료/되돌림을 효과 부재로 해석하지 않는다. worker 효과/표지·후속 Work/Fact의 원자 기록과 독립 보호·누적 예산/현재 허가를 유지한다. SQS copy/DLQ 만료가 원본 삭제로 이어지지 않는다.

NI-07. Single-AZ에는 대기 전환이 없다. 정상 저장소/검증 backup·완전 journal로 다른 AZ의 격리된 새 DB/epoch를 준비하고 이후 ACK/권한 회수·파기/work/effect를 대조한다. old writer/worker 자격을 fence하고 새 복구 epoch의 세션을 적용한다. journal 복구는 살아 있는 primary의 완전 후보/보호 근거와 backup을 대조하며 최신 counter만으로 ACK를 증명하지 않는다. 전체 payload·snapshot 기준/원장 수명·보호 marker 근거가 부족하면 재개하지 않는다. 원래 handler/외부 효과를 자동 재실행하지 않는다.

NI-08. 한국의 암호화된 backup·journal 관리/키·복구 역할은 일반 app/deploy와 구별한다. DeletionPolicy뿐 아니라 replacement·DB owner/superuser/membership·실제 backup/key 삭제·동일 계정 관리자 우회를 시험한다. 실제 보관/파기는 계약/정정·중복 보호/복구 목표와 함께 확정하고 restore 후 삭제 자료/옛 권한을 부활시키지 않는다. 계정 분리와 같은 장애 격리로 표현하지 않는다.

NI-09. 실제 t0부터30분/ACK RPO0은 목표다. 새 DB 생성·backup 복원·원장 재구성 시간이 미검증이며 일반 저장 고장·논리 손상/삭제·단일 AZ 일시 장애는 필수 시험이다. 센터 소실급 물리 파괴만 제외하고 리전/필수 외부 장기 중단은30분 재개 미검증 한계를 보존한다. 이후에도 접수 보존/실제 중단 집계가 필요하다. 목표 미달이면 차이/운영 부담·비용 대안을 근거로 명시적 구성/목표 변경을 확인한다.

## Capacity and Cost

NI-10. 다음은 격리 시험 시작 후보이며 실측/운영 승인값이 아니다. 실제 지원/quota·byte/fanout/자료량·normal/peak·jobs/trace·DB/provider 한도를 대조해 유한 적용 값을 고정한다.

| 대상 | 후보/제어 | 적용 전 확인 |
|---|---|---|
| task/배포 | 역할min1/max2·rolling healthy100%/maximum200% 후보 | steady최대8/전체 동시 배포최대16task까지 CPU/memory·pool/egress·비용 포함 |
| DB | db.t4g.small/gp3 각20GiB 비교 후보 | engine/연결/backup·100000주문/완전 journal·수명/성장·복구 적합성 미검증 |
| pool/buffer/provider | 최대 replica×pool+운영/복구 여유≤검증 DB 용량; journal 별도; 외부 총 in-flight 한도 | ND-RG04의 값/지원/측정 근거가 없으면 관련 실행/autoscale 활성화 금지 |
| 자동 확장 | API/UI 지연·CPU/memory/연결·보호 gap, worker eligible age/첫 시작/처리량 | CPU/queue 길이만으로 확대하지 않음; DB/journal/provider 병목은 admission/backpressure로 보호 |
| HTTP/work | normal p95조회1s/변경2s·전체read5s/write10s·화면3s·eligible 첫 시작10s | 모든 홉이 같은 남은 예산 사용;202는 보호 접수, timeout은 rollback/미접수 증거 아님 |
| 관측/통지 | finite byte/항목/시간·누락 계측·원래 correlation/incident |100% 계측은 전달/저장 누락0 증명 아님; IG-05 cap/수명/지원/가격 |
| 비용 | 기본/집중/staging 생성·확인 대기·정리/복구별 item 식 | 지역/통화·현재 가격/usage/포함·제외/상한 공개; billing 경보는 지출 정지 장치 아님 |

기존 두 Single-AZ db.t4g.small·각20GiB gp3·월730시간 예시:2×(730×USD0.051+20×USD0.131)=USD79.70/월.2026-10-06 게시 요율의 비교이며 실제 region/크기/사용량/총비용 선택이 아니다. [Q6·P1]

compute 견적은 역할별 시간×(vCPU×Fargate단가+GiB×memory단가)다. IPv4·NLB시간/NLCU·cross-AZ 전송·DNS/certificate 발급/갱신/배포·SNS/Slack·queue·SM/KMS·운영 metadata/API·logs/trace·S3/backup·회사망/staging/복구 사용량을 별도 포함한다. 미확인 가격/사용량을 채우거나 합성20req/s를 상시 실제 수요로 바꾸지 않는다. 유한 자원/비용 cap을 확인한 조합만 실제 운영에 적용한다.

## Verification and Readiness

| Gate | 책임/시점 | 필요한 증거 | 미확인 처리 |
|---|---|---|---|
| IG-01 | U1/Infra; 관련 IaC/TLS·실계정 적용 전 | 계정/role/region/AZ ID·Fargate/NLB/RDS/cert feature/domain/회사 route | 지원/권한 없는 후보 실제 생성 금지 |
| IG-02 | U1/U2/보안; 해당 auth/persistence/복구 코드 전 | ND-RG01/03:provider/MFA/code/factor 종료·binding/최초 최소grant;PG/journal 전체 schema/내구·관리 경계 | 실제 미확인 인증/접수 성공 경로 허용 금지 |
| IG-03 | U1/품질; 관련 코드/CI 실행 전 | 정확한 Node/TS/Next/React/Nest/Express/TypeORM/pg/CDK/PG/validator/TLS adapter/OTel·도구/lock·2020-12/CE01–04/필드 | 미확인 package/검증기/contract binding 사용 금지 |
| IG-04 | Infra/U1/U10; 관련 코드/설정/운영 autoscale 전 | byte/첨부/품목/fanout·pool/buffer/global cap·ready/drain·20/100부하·복구·비용/측정 | 시험50품목을 제품 한도로 전용하지 않음; 수치 없는 경로 활성화 금지 |
| IG-05 | U1/U10; 계측/통지 적용·운영 전 | trace feature/finite cap·probe/2min 감지·2채널/ACK·operator/MFA/trust·독립 실패/야간 대응/가격 | 관측/인력·실제 전달/국내 저장 확보를 주장하지 않음 |
| IG-06 | 업무/자료 확인자·owner; 실자료/계약 전 | 실제 보관/파기/법·provider/기업/승인/수량/산식/기간·국내 저장/외부 경로 | 임의 연수·사업 인력·외부 재고/금융 권위 생성 금지 |
| IG-07 | Infra/U1/U10; 실제 운영/상용 약속 전 | 앱/worker·DB/journal·오삭제/배포·단일AZ;ACK/현재권한/8정확성·t0→검증30min·1인 시간 | 실제 시험 없이 목표 달성/SLA/실적 주장 금지 |
| IG-08 | 회사 네트워크 운영/Infra/보안; 접속/인프라 코드·직원 출시 전 | 승인망/원격PC·입장/회수·SG/route/source·TLS/host·공인 IP 우회·DB/backup/key/국내 경로 | 망/단말/자료 보호를 NLB/URL/폭 이름만으로 증명하지 않음 |

## Assumptions & Open Questions

지역/VPC/NLB/TLS/certificate·자원 후보·플랫폼 운영 경로는 설계 가정이다. Q&A의 사용자 확정과 다르며 실제 지원/계정/구성/가격·권한/수명/망/provider/1인 대응은 미확인이다. IG는 ND-RG01–10을 대체/완화하지 않는다. 특히 Single-AZ30분 복구는 미증명이다. organisationRevision/지속correlationId/provider binding 확장·CE01–04를 코드 전 등록하고 다른 Unit의 전체 업무를 U1 완료로 표현하지 않는다. 외부 WMS/재고/금융/배송/SW runtime 책임을 OMS로 확대하지 않는다.

## Sources

- S1–S6:[performance](../nfr-design/performance-design.md),[security](../nfr-design/security-design.md),[scalability](../nfr-design/scalability-design.md),[reliability](../nfr-design/reliability-design.md),[observability](../nfr-design/observability-design.md),[logical components](../nfr-design/logical-components.md).
- S7–S9:[components](../../../inception/domain-design/components.md),[functional spec](../functional-design/functional-spec.md),[contract summary](../../../inception/contract-design/contract-summary.md).
- [인프라 Q&A/가격·지원 근거](infrastructure-design-questions.md),[team practices](../../../inception/practices-discovery/team-practices.md).
- A1:[NLB TCP TLS 통과](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-listeners.html).
- A2:[NLB SG](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-security-groups.html).
- A3:[NLB target attributes](https://docs.aws.amazon.com/elasticloadbalancing/latest/network/edit-target-group-attributes.html).
- A4:[ACM exportable certificates](https://docs.aws.amazon.com/acm/latest/userguide/acm-exportable-certificates.html).
- P1:[서울 RDS 요금](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-northeast-2/index.json).
