# OMS Infrastructure Design 질문 — 최소 통합 실행 기반

**Unit:** u1-integrated-foundation  
**Mode:** Guide me — 기존의 한 질문씩 진행하는 방식을 유지한다.

## Prior Context

- U1 NFR Design의7개 산출물·62개 세부 NFR/14개 상위 요구 연결과 문서 점검이 완료됐고 독립 검토는 READY·Critical0/Major0/Minor0이다. 실제 성능/보안/30분복구/RPO0·실운영 달성은 아직 미검증이다. 기존 설계/검토는 수정하지 않는다. [S1–S6]
- TypeScript·Next App Router+React/BFF 고객/직원UI, NestJS+Express API/Nest standalone worker, PostgreSQL·TypeORM 중심/일반 pg driver, AWS·TypeScript CDK를 유지한다. 고객/직원/API/worker4역할과 업무 소유자의 단일 쓰기 권위를 actual AWS 실행/배치/자격에 연결한다. 특정 ECS/Lambda/EC2/EKS·RDS/Aurora·CDN/Redis를 이 선택만으로 확정하지 않는다. [S6·S8–S9]
- 첫 Cognito 고객/직원pool 분리·OMS API 로그인/password+TOTP/필수 사전 복구 코드와 출시 후 Keycloak 전환 계획, 직원 사설 접점/회사 승인 원격PC·모든 사람 MFA/현재권한·한국 내 고객/주문/계약·포함 로그/backup 저장을 유지한다. 회사 단말 관리 책임을 OMS에 포함하지 않는다. [S2·S6]
- Transactional Outbox·SQS Standard·업무 consumer별queue/전용DLQ·검증된 원래ID/허가/결과 대조를 유지한다. 별도 보호 DB 복구 원장은 독립 PostgreSQL 우선 후보이며 실제 제품/배치·role/DDL/backup/내구·commit 순서/보호 prefix와 현재 권한/복구/파기 경계를 함께 검증한다. [S3–S4·S6]
- CloudWatch 중심관리형 관측+OTel·상세trace100% 대상/실제누락0 보장 아님·독립2채널복구알림/명시ACK를 유지한다. 실제 메신저는 이 단계에서 비교/선정하고 actual 이메일/region/SDK/collector/수신자·야간휴일 대응과 원본을 확인한다. [S5–S6]
- 정상 조회p95 1초/변경2초·HTTP전체5/10초·첫화면p95 3초/실행가능work첫시작10초, 목록25/100건·표시중30초/max10분추가20회·세션미연장, 안전retry 최초1+추가3/max5분·개별30초·접점30초내5실패→30초제한/안전probe1개를 실제global cap/지원/부하와 연결한다. [S1·S3–S5]
- 1인 개발은 기능 제약이 아니며1인 기술운영 가능한 구조/손작업/실제 대응을 검증한다. 기존 보관 정책/고객조건·초기 기업/직원 준비 절차는 없다고 답변했고 실제 기간/신원/업무 근거/지원버전·비용/실수신/국내경로는 ND-RG01–10과 ND-OQ01–07의 선행조건이다. 합성 시험자료를 actual 사업/법 적용·제공자/실적/인력으로 전용하지 않는다. [S6·S8–S9]

## Q1. 첫 버전 인프라의 월 비용 상한이 이미 정해져 있나요?

AWS 실행 환경/primary·보호journal·network/queue/관측·독립복구알림과 환경 분리를 같은 예산에 연결해야 한다. 아직 actual resource/가격/사용량·예산은 확인되지 않았다. 이 질문은 기존 비용 조건을 확인하는 것이며1인 개발을 이유로 기능/보안·복구 목표를 줄이는 질문이 아니다. [S1–S6]

A. 아직 정한 월 비용 상한은 없다. 필요한 구성/정상·집중·회복 조건과 실제 가격/수집량을 대조한 견적을 비교한 뒤 예산과 유한 비용/자원 상한을 정한다. 미정 동안 무제한 과금/운영 배포를 승인한 뜻은 아니다. (정해진 예산이 없을 때 권장)
B. 이미 정한 월 비용 상한이 있다. 금액/통화와 적용 범위(예: production만 또는 staging 등 전체), 세금/외부 통지 비용 포함 여부를 알려준다. 그 조건과 기존 품질 목표를 함께 평가한다.
X. Other (please specify). 필요한 예산/비용 조건을 설명한다.

[Answer]: A. 아직 정한 월 인프라 비용 상한은 없다. 사용자 원문: "1". 필요한 구성/정상·집중·회복 조건과 실제 가격/사용량을 대조한 견적을 비교한 뒤 예산과 유한 비용/자원 상한을 정한다. actual production 활동/작업fanout/trace·byte/수명/국내경로와 환경별 상시/가변 비용·세금/외부 통지 포함 범위를 확인한다. 예산 미정을 무제한 과금/운영 배포나 기능·보안/복구/접수 보호·국내 저장/필수 검사 면제로 해석하지 않는다. 실제 구성/가격·지원/성능/복구/비용/운영 적합성은 아직 미검증이다.

### Q1 비용과 실제 사용량·선행 검증의 경계

예산/자원은 개발자 수나 HTTP합성20/100req/s·100세션에서 자동 도출하지 않는다. actual production 활동/동기 호출·작업fanout/due/trace span·byte/수명·국내경로·복제/backup/키·egress/NAT/endpoint/로그/알림·환경별 상시/가변 용량을 확인한다. 실제 견적은 사용일자/region/통화·가격출처/가정·포함/제외와 normal/집중/회복 수요를 표시하며 실적/지원/성능 증거와 구별한다. 미확인 금액/법 적용/보관 기간·실제 외부 제공자 접근/가격을 채우지 않는다.

비용을 맞추기 위해 성공ACK전보호·현재권한/직원망·국내저장·접수/키/작업 보존·필수검사/복구목표를 조용히 면제하지 않는다. 상한과 요구를 같이 만족할 수 없다면 actual 후보/차이/대안을 근거로 확인한다. replica/pool/외부호출·backup/trace·buffer와 billing 경보의 유한 상한/운영 감지·overspend 대응을 설계하며 billing 경보가 그 자체로 즉시 지출을 정지시키는 장치라고 가정하지 않는다.

## Q2. 고객·직원 화면과 API·worker는 AWS에서 어떻게 실행할까요?

Next 화면/BFF·NestJS+Express API·Nest standalone worker와4개 역할은 이미 선택했다. 이번 질문은 실제 AWS 실행 모델이며 framework/업무 소유 경계를 다시 고르는 질문이 아니다. Q1 A로 비용 상한은 아직 없고 후보의 actual 자원/사용량/가격을 비교한 뒤 고정한다. [S1–S6·S8–S9·W1–W4]

A. 고객UI/직원UI/API/worker를 모두 Amazon ECS on AWS Fargate의 관리형 컨테이너로 실행한다. 같은 container build/배포·runtime/관측 방식으로4역할을 구성하고 role별 실행/자격·수평확장과 worker 처리/종료를 검증한다. VM host 운영은 AWS에 맡기되 실제 이미지/라이브러리·CPU/메모리·network/IAM·min/max/health/drain·global pool과 비용을 OMS 운영 경계에서 관리한다. (권장)
B. 고객/직원 Next 화면은 ECS Fargate, API와 worker는 AWS Lambda로 실행하는 하이브리드로 한다. Nest Express API의 검증된 Lambda HTTP adapter와 standalone worker의 SQS event-source wrapper/등록 검증을 사용한다. 시작 지연·호출/batch/visibility/동시성·반복 전달/원본 시도 예산·DB/원장 연결과 직원 사설 ingress/원래 사용자 문맥을 실제 구성으로 검증한다. 두 실행 모델의 배포/관측·비용/호환을 관리한다.
X. Other (please specify). 원하는 실행 모델이나 비교할 대안을 설명한다.

[Answer]: A. 고객UI/직원UI/API/worker의4개 역할을 모두 Amazon ECS on AWS Fargate 관리형 컨테이너로 실행한다. 사용자 원문: "1". 기존 Next/BFF·NestJS+Express API/Nest standalone worker와 공유 업무 핵심/owner 권위를 유지하고 역할별 image/runtime·network/IAM·CPU/메모리/min/max/health/drain·관측/배포와 global DB/원장/provider 상한을 실제 구성으로 확인한다. VM host 관리 위임은 앱/라이브러리·설정/권한/자료/복구/운영 책임 면제가 아니다. 원본/세션/작업·복구를 ephemeral memory에만 저장하지 않으며 보호 전 ACK/실행 금지와 현재 권한/직원 사설 경계·한국 저장/시간/재시도 예산을 유지한다. Q1 A에 따라 실제 가격/사용량 견적 후 비용 상한을 정한다. actual task 수/자원/region/AZ/DB/network/관측·Spot/지원버전/계정/자격과 가격·성능/복구/1인운영 달성은 이 선택으로 확보/검증했다고 표시하지 않는다.

### Q2 권장 근거와 실제 지원·실행·비용의 경계

A의 권장은 현재 선택한 Next server/BFF·Nest HTTP server/별도 standalone worker를 동일한 배포 방식으로 운영하며 요청별 독립 복구 보호·지속 작업/lease·role별 자격/사설 접점·pool/global 상한·drain을 구성/시험하기 위한 설계 판단이다. Fargate의 VM host 관리 위임은 app 이미지/패치·의존성/설정·IAM/자원/네트워크·실제 서비스 운영 책임을 없애지 않는다. A가 항상 저렴/빠르거나1인운영/30분복구/RPO0을 자동 달성한다는 뜻이 아니다. [W1–W2·S1–S6]

B도 Nest standalone/Express 업무 모듈을 사용할 수 있다. 함수 lifecycle/HTTP mapping·standalone의명시검증·동시성/DB 연결·SDK와 event-source의 실제 retry/partial batch/visibility를 원래 Work/consumer/기한/permit/효과와 연결해야 한다. cold 시작/DB연결·queue delivery/batch 대기까지 첫시작p95 10초·조회p95 1초/변경2초·HTTP5/10초·원장보호를 검증하며 문서의 개발PC benchmark/기본 retry·maxReceiveCount/visibility·batch 수치를 OMS 설정으로 복사하지 않는다. 함수 scale/내장 retry가 같은 원래 작업의누적실행 예산을 초기화/곱하지 않도록 한다. [W3–W4·S1·S3–S4·S6]

어느 후보도 앱/세션·권한/접수/Outbox/복구 자료를 ephemeral container/function memory에만 저장하지 않는다. actual 안정된 외부 persistence/원장·server session/binding과 처리 표지의 공유 권위를 사용한다. 역할4개가 도메인별 microservice나 완전 물리 장애 격리의 도입을 뜻하지 않는다. customer public/staff private와 승인 원래 ingress·MFA/현재 grant/CSRF·한국 저장/trace/backup·원장과 관리 자격의 독립 보호를 actual 배치에서 확인한다.

최소 ready 용량/유량·기동/재기동과global DB/원장/provider concurrency는 실제 목표/부하와 측정한 지원값으로 고정한다. idle 때0개로 줄여도10초 목표를 유지할 수 있다고 가정하지 않는다. min/max/task/function·AZ/ingress/secret/배포·관측/실제지원 버전/region/가격/retention과 운영 중단/복구 자료를 비교하며 초기월금액·instance/task 수·Lambda/VM/새 DB제품·Spot을 이 질문만으로 추가 선정하지 않는다.

## Q3. 운영·비운영·복구 보호 영역의 AWS 계정은 어떻게 나눌까요?

고정된4개 실행 역할과 업무 primary/별도 보호 journal·정상 앱/배포/복구/관리 자격의 분리를 actual AWS 계정/환경에 연결한다. 현재 AWS 계정/Organizations·기존 정책/운영 권한의 확보 여부는 미확인이다. 아래는 계정 구성 방향 제안이며 현재 계정이 준비됐거나 생성/권한 부여를 실행했다는 뜻이 아니다. [S2–S6·Q1 A·Q2 A·W5–W7]

A. AWS Organizations 아래 운영(production), 비운영(staging/시험), 복구 보호 영역의3개 workload 계정을 분리한다. 운영 앱/primary와 비운영 자원/자료를 구분하고 production 보호 journal/필요 복구 자료·관리 자격은 복구 보호 계정에 둔다. 별도 Organizations 관리 계정에는 OMS workload를 두지 않는다. 원래 업무 실행에는 필요한 journal append/제한 확인만 허용하고 배포/DDL·backup/키·복구 관리 권한은 별도로 제한한다. (권장)
B. 운영과 비운영의2개 workload 계정을 분리하고 production 보호 journal은 운영 계정 안의 별도 DB/자격·관리/배포 경계로 보호한다. 별도 Organizations 관리 계정에는 OMS workload를 두지 않는다. 계정간 복구 연결 범위를 줄이는 대신 운영 AWS 관리 범위와 보호 journal의 공통 실패/삭제·관리 권한 범위를 실제 정책/시험으로 검증한다.
X. Other (please specify). 기존 계정/조직 정책이나 원하는 분리 방식을 설명한다.

[Answer]: X. 사용자가 지정한 단일 AWS Account 구성으로 확정한다. 사용자 원문: "그정도로 분리할 필요는 없다 한 계정 안에서만 운영한다\n점점 1인 개발과 오픈소스 범주를 벗어나고있다". 운영·비운영·보호 복구 원장을 같은 AWS 계정 안에 배치한다. 별도 Organizations 관리 계정이나 추가 workload 계정을 요구하지 않는다. 환경별 자원·설정·비밀·IAM 역할과 업무 DB/보호 원장의 DB 권한·배포/복구 권한은 계정 내부에서 구분한다. 앞선 A/B는 채택하지 않은 제안이다. 1인이 기능 개발과 기술 운영을 감당할 수 있는 오픈소스 OMS라는 방향에 맞춰 불필요한 인프라 복잡성을 줄인다. 기능과 이미 합의한 가용성/복구/접수 보호 목표는 이 답변으로 변경하지 않는다.

### Q3 현재 적용 구성과 복잡성 점검

**확정:** AWS 계정은 하나만 사용한다. 아래 A/B 계정 구성 설명은 선택 전 제안의 기록이며 현재 설계에 적용하지 않는다. AWS Organizations 관리 계정·추가 운영/시험/복구 계정과 계정 간 연결을 필수 요소로 요구하지 않는다. 기존 계정의 실제 소유권/접근·자원과 자격은 아직 확인하지 않았다.

| 점검 항목 | 이번에 적용할 방향 | 상태 |
|---|---|---|
| 계정 | 운영·시험·복구 보호 영역을 하나의 AWS 계정 안에 둔다. | 사용자 확정 |
| 환경과 권한 | 환경별 자원/설정/비밀과 IAM 역할을 구분하고, 정상 앱에 복구 원장 삭제/관리 권한을 주지 않는 구성을 설계한다. | 계정 내부 설계 방향; 실제 정책/시험 필요 |
| 실행 구조 | 기존의 모듈화된 단일 업무 애플리케이션과 고객 UI·직원 UI·API·worker 역할을 유지한다. 도메인별 서비스/저장소를 추가로 분리하지 않는다. | 기존 승인 유지 |
| 복구 | 별도 보호 DB 원장은 같은 계정 안에 배치한다. DB/배포/복구 권한과 백업을 구분한다. 실제 제품/배치·복구 입증은 아직 미정이다. | 기존 복구 선택 유지; 다계정 제안 미채택 |
| 운영 부담 | 추가 인프라는 필요한 요구와 개발/배포/장애 대응 부담·비용을 근거로 제안한다. 상시 대형 시험 환경이나 별도 보안 플랫폼을 기본 요건으로 추가하지 않는다. | 사용자 교정 적용 |
| 오픈소스 범위 | AWS 조직/다계정을 설치 전제로 삼지 않는다. 로컬 실행과 실제 배포 지원 범위는 Q4로 확인한다. 라이선스나 AWS 외 운영 지원을 임의로 확정하지 않는다. | 후속 질문 |
| 품질 목표 | 기능 범위·99.9% 가용성·30분 복구·정의한 성공 접수 보존/정확성 목표는 유지한다. 구성 간소화를 목표 완화로 해석하지 않는다. | 기존 승인 유지 |

단일 계정에서의 환경/역할 분리는 서로 다른 AWS 계정의 관리 경계와 같지 않다. 계정의 광범위한 관리 권한과 공유 자원은 공통 실패 범위로 남으므로, 현재 목표 범위에서 앱/배포 실수·DB 손상/삭제·복구 자료 보호와 복구 시간을 실제 구성으로 확인한다. 다계정이 해당 목표의 유일한 해법이라고 가정하지 않는다. [S2–S6·W9]

1인 개발을 필요한 기능의 자동 제외 근거로 사용하지 않는 기존 결정과 이번 교정은 양립한다. 필요한 기능을 구현하면서 운영 요소와 반복 손작업을 최소화하는 방향이다. 이미 승인된 상위 문서는 변경하지 않고 이번 계정 선택과 교정을 현재 질문 및 이후 인프라 설계에 연결한다. [S6–S11]

### Q3 계정·환경·역할과 실제 독립성/운영의 경계

A의3개 또는 B의2개는 workload 계정 수이고 Organizations 관리 계정은 그 수에 포함하지 않는다. 기존 회사 Organization/관리 계정이 있으면 소유/권한/정책을 확인해 사용 여부를 판단하며 새 조직/계정 수를 이미 확보했다고 표시하지 않는다. 실제 계정 소유/관리 접근·담당자/복구 근거·CDK bootstrap/trust/deploy·allowlist/region/서비스 지원·SCP/IAM과 비용은 적용 전 확인한다. Organizations 관리 계정에 SCP가 적용되는 것으로 가정하지 않는다. [W5–W6]

계정은 IAM/공유 자원의 경계이며 기본 cross-account 접근은 별도 명시 허용이 필요하다. 연결은 등록된 목적/target/source·TLS/사설route·DB role/서비스권위/secret/key 정책으로 제한하고 prod 실행자는 필요한 journal append/내용 대조만 수행한다. production/app 배포 credential에 보호 journal 기존 자료 삭제/DDL·owner/superuser/키/backup 파기·복구 역할 승격을 주지 않는다. 정상 append·대조/복구 reader·관리/수명 role을 구분하며 동일 사람의 일상 운영과 승인된 복구/관리 역할 사용도 세션/권한/근거·이력으로 분리한다. 계정 이름만으로 권한 분리나 성공 접수 보호를 증명하지 않는다. [S2·S4·S6·W5–W7]

비운영과 실제 고객의 account/binding·비밀/자료/queue/작업/외부 실행을 분리한다. production과 같은 불변조건/계약·배포/회수·cross-account 연결을 검증할 합성 staging 구조를 actual 권한/역할과 함께 설계한다. staging 시험 접근이 production journal/키/backup에 쓰기/관리권한을 얻지 못하게 한다. staging/개발의 신원/외부모의·원장/복구 자료와 운영 자료의 mixing을 막고 시험 결과를 실제 기업/제공자/인력·상용 통과로 바꾸지 않는다. local개발/추가 dev계정·환경별resource 수/상시운영·region/서비스/보관 기간은 해당후속선택/견적에서 정한다.

A의 계정 분리는 production 배포/관리 실수나 자격 범위를 복구 보호 자격과 제한하기 위한 이 OMS의 설계 판단이며 AWS가3계정/특정 서비스로RPO0/30분/국내저장·1인운영을 보장한 근거가 아니다. B도 actual 별도 DB/role/DDL/backup·운영 관리 우회와 실패 범위를 검증해야 한다. 같은 region/AZ/조직 관리·key·backup/network/관측과 복구 실행의 공통 실패를 식별하고 사설직원 ingress/원래 사용자·현재권한·순서/연속보호/ACK·외부효과 불명과 파기/회수 원본을 보존한다. 추가 계정은 실제원장payload·동시protocol/복구 검증을 대신하지 않는다. [S2–S6]

구성/자격·cross-accountnetwork/secret/key/DB connection·CI/CD·독립 감지/알림/명시ACK·backup restore와 비용/손작업/야간대응을 함께 비교한다. 신규 security/logging OU·Control Tower/전체보안서비스·AWSroot/공유AdministratorAccess·특정IAMIdentityCenter/메일/담당자·모든region집계를 이 선택으로 추가 선정하지 않는다. 필요한 운영 증거/국내자료경로·발송/수신을 검증 전 확보했다고 주장하지 않는다. [Q1 A·S2–S6·W5–W7]

### Q3 용어 확인 — 선택 전 설명

사용자 원문: "지금 여기서 말하는 계정 분리는 실제 어카운트를 따로 분리한다는거냐". 이는 계정 의미의 확인 질의이며 A/B 구성 선택이나 계정 생성/권한 부여 승인이 아니다. 이 용어 확인을 받은 당시에는 Q3의 [Answer]를 비워두었다. 이후 사용자의 단일 계정 선택을 현재 답변에 반영했다.

여기서 분리는 실제 서로 다른 AWS Account를 사용하는 뜻이다. A의3개 workload 계정은 production·non-production·recovery-protection 각각의 AWS Account이며 Organizations management account1개는 별도다. 한 AWS Account 안에 IAM user/role·VPC만 나누는 범위와 구분한다. AWS Account는 resource/관리·권한/청구 경계이고 IAM user/role은 그 계정의 신원/권한이다. [W5·W8–W9]

Organizations로 실제 계정들을 묶어 관리/청구를 통합할 수 있고 IAM Identity Center 같은 수단으로 운영자 접근을 통합할 수 있다. 해당 통합 접근 제품/설정·실제 계정 소유/자격은 아직 선택/확보하지 않았다. 분리 목적은 운영 배포/실수/권한 범위가 protected journal/복구 관리와 겹치지 않도록 경계를 두는 것이다. 실제 IAM/route/secret/key·DB/backup/DDL·복구/운영/비용 적합성은 여전히 검증 대상이다. [S2–S6·W8]

## Q4. 오픈소스 OMS의 첫 버전에서 지원할 실행·배포 범위는 어디까지인가요?

1인 개발·운영과 오픈소스 범위에 맞는 구성을 위해 배포 지원 범위를 확인한다. AWS·CDK 및 Q2의 Fargate 선택은 유지한다. 소스 공개의 라이선스는 아직 확인하지 않았으며 이 질문에서 결정하지 않는다.

A. 로컬에서는 Docker 기반으로 개발·시험할 수 있게 하고, 실제 운영은 단일 AWS 계정에 CDK로 배포하는 구성을 제공한다. 인증/큐 등 외부 서비스의 로컬 연결 또는 시험 대체 방식은 후속 설계에서 명시한다. 로컬 시험만으로 운영 보안/복구 목표 달성을 주장하지 않는다. (기존 AWS 선택을 유지하는 최소 지원 범위로 권장)
B. A에 더해 AWS 없이 자체 서버의 Docker 환경에서도 실제 운영을 지원한다. 해당 환경의 인증/큐/저장·직원 사설 접근·관측/백업/복구·배포와 품질 목표를 별도로 설계하고 검증한다. 선택 전에는 AWS 외 운영 지원을 확정하지 않는다.
X. Other (please specify). 원하는 오픈소스 실행·배포 범위를 설명한다.

[Answer]: A. 로컬에서는 Docker 기반 개발·시험을 지원하고, 실제 운영은 단일 AWS 계정에 CDK로 배포하는 구성을 제공한다. 사용자 원문: "1". Q2의 ECS Fargate·기존 TypeScript/Next/Nest/PostgreSQL/TypeORM 선택을 유지한다. 인증/큐 등 외부 서비스의 로컬 연결 또는 시험 대체 방식은 후속 설계에서 명시하고 실제 제공자/운영 환경과의 계약·보안/복구 차이를 검증한다. AWS 없이 자체 서버를 운영하는 지원 범위나 공개 라이선스는 이 선택으로 추가 확정하지 않는다. 실제 AWS 자원·계정/권한/자격을 생성하거나 운영 배포를 실행한 뜻이 아니다.

## Q5. 업무 DB와 보호 복구 원장의 PostgreSQL은 어떻게 운영할까요?

단일 AWS 계정 안에서 업무 DB와 보호 원장은 별도 저장·권한/관리 경계로 설계한다. 로컬 Docker 개발·시험과 실제 운영 DB의 관리 방식을 구분한다. 이번 질문은 DB 운영 책임을 정하며 용량·대기 복제본·가용영역 구성과 가격은 후속 구성/견적에 명시한다. [S2–S6·Q3 X·Q4 A·W10–W11]

A. 업무 DB와 보호 원장을 각각 별도의 Amazon RDS for PostgreSQL DB 구성으로 운영한다. 자동 백업·DB/OS 패치·장애 감지/복구 등의 관리형 기능을 활용해 서버 운영 부담을 줄인다. 데이터 모델/쿼리·접근 권한·백업 정책/복구 시험·운영 상태는 OMS 운영자가 관리한다. (권장)
B. EC2에서 PostgreSQL을 직접 운영한다. 업무 DB와 보호 원장의 저장/관리 경계를 분리하며 OS/DB 업데이트·백업/복제·장애 전환·복구를 직접 구성하고 관리한다. 로컬 Docker 실행 구성을 운영에 사용할 때에도 같은 품질 목표와 보호 경계를 검증해야 한다.
X. Other (please specify). 원하는 DB 운영 구성을 설명한다.

[Answer]: A. 업무 DB와 보호 복구 원장을 각각 별도의 Amazon RDS for PostgreSQL DB 구성으로 운영한다. 사용자 원문: "1". 같은 AWS 계정 안에서 별도 저장/DB 권한·설정/비밀과 배포/복구/백업 관리 경계를 설계한다. AWS의 자동 백업·DB/OS 패치·장애 감지/복구 기능을 활용하되 모델/쿼리·접근 권한·백업 정책/복구 시험·현재 운영 상태는 OMS 운영자가 관리한다. 로컬 Docker 개발·시험과 운영의 지원/권한/복구 차이를 검증한다. 같은 RDS 인스턴스의 두 DB/스키마나 업무 DB 복제본으로 보호 원장을 대체하지 않는다. 실제 DB 클래스/버전/스토리지·대기 복제본/AZ·백업 기간·비용/성능/30분 복구/성공 접수 보존 달성은 아직 선택 또는 검증되지 않았다.

RDS 사용의 권장은 1인 운영의 반복 작업을 줄이려는 설계 판단이며 최저 비용이나 실제 RPO0/30분 복구 달성의 증명이 아니다. 기존 원장 선택과 완전한 복구 자료/보호 전 ACK 금지·현재 권한/정확성은 그대로 적용한다. 같은 RDS 인스턴스 안의 두 DB나 스키마, 업무 DB의 복제본을 별도 보호 원장으로 간주하지 않는다. 실제 앱/배포/복구·DB 관리/백업 삭제 권한을 구분하고 공유 계정 관리 권한의 실패 범위도 확인한다. [S2–S6]

RDS PostgreSQL을 선택해도 Aurora·추가 읽기 복제본·RDS Proxy·Redis·멀티리전은 자동 추가하지 않는다. Multi-AZ 대기 복제본은 가용성을 위한 선택이며 오삭제/논리 손상까지 독립 보호하는 원장을 대신하지 않는다. 합의한 단일 AZ 일시 장애·접수 보존/복구 목표와 비용을 비교한 뒤 실제 배치와 상한을 명시하고 검증한다. 정확한 지원 버전/클래스/스토리지·백업/수명/국내 경로·보호 원장 권한은 아직 미확인이다. [S1–S6·W10–W11]

## Q6. 운영 DB와 보호 원장의 장애 대비 구성을 어디까지 둘까요?

Q5 A의 업무용/원장용 RDS PostgreSQL은 같은 AWS 계정 안의 두 별도 DB 구성이다. 각 구성에 다른 가용영역(AZ)의 동기 대기 DB를 붙이는 Multi-AZ DB instance 방식은 AWS가 장애 전환을 관리한다. 대기 DB는 읽기 확장용이 아니며 보호 원장/오삭제 복구를 대신하지 않는다. [S2–S6·Q3 X·Q5 A·W11–W12]

| 선택 | 업무 DB | 보호 원장 | 실제 DB 수 | DB 월 비용 예시 |
|---|---|---|---|---|
| A (권장) | Multi-AZ: 주 DB+대기1 | Multi-AZ: 주 DB+대기1 |4 | USD159.40 |
| B | Multi-AZ: 주 DB+대기1 | Single-AZ: 주 DB1 |3 | USD119.55 |
| C | Single-AZ: 주 DB1 | Single-AZ: 주 DB1 |2 | USD79.70 |

A. 운영의 두 DB 구성 모두 Multi-AZ DB instance로 한다. 각각 주 DB1/다른 AZ의 동기 대기1이며, 관리하는 RDS 구성/접점은 업무용·원장용2개다. 합의한 단일 AZ 일시 장애와30분 복구 목표의 빠른 자동 전환 경로를 우선한다. 추가 비용과 동기 쓰기 지연을 검증한다. (권장)
B. 업무 DB만 Multi-AZ, 보호 원장은 Single-AZ로 한다. 원장 장애 중에는 기존에 허용한 안전 조회만 제공하고 보호 변경/새 효과를 제한한다. 원장 재기동/다른 AZ의 복구·원본 대조 시간과 자료 보존을 실제 시험하며, 원장 장애의 자동 전환 경로는 없다.
C. 두 DB 모두 Single-AZ로 시작한다. 업무 DB와 원장은 서로 다른 AZ에 두고, 장애 시 정상 저장소/백업/보호 원본을 사용해 필요한 DB를 복구·대조한다. 대기 DB 자동 전환 경로는 없으며1인 복구 작업/시간·정합성 부담을 실제 시험한다.
X. Other (please specify). 원하는 장애 대비 구성을 설명한다.

[Answer]: C. 업무 DB와 보호 복구 원장을 모두 Single-AZ RDS PostgreSQL로 시작하며 두 DB는 서로 다른 가용영역(AZ)에 배치한다. 사용자 원문: "3". 같은 AWS 계정 안의 별도 업무용/원장용 DB2개이며 대기 DB 자동 전환 경로는 두지 않는다. 장애 시 정상 저장소/백업/완전 보호 원본을 사용해 필요한 DB를 복구하고 접수/권한/작업/외부 효과를 대조한다. 기존99.9%·실제 장애부터30분 복구·정의한 성공 접수 보존/정확성 목표는 유지하며 단일 AZ 일시 장애와 논리 손상/삭제의 복구를 시험한다. 부족한 경우 실제 차이와 운영 부담/비용·대안을 제시해 구성 또는 목표 변경을 명시적으로 확인한다. 서울·db.t4g.small·각20GiB·월730시간의 USD79.70/월은 compute/gp3만 포함한 비교 예시로, 실제 지역/버전/용량/비용 상한·성능/복구 달성을 확정한 값이 아니다. 운영 환경 선택을 상시 시험 환경의 자원/복제 수로 확대하지 않는다.

### Q6 비용 예시의 가정과 적용 범위

예시만 서울 ap-northeast-2·각 DB db.t4g.small·gp3 논리 용량 각20GiB·월730시간·On-Demand USD 요율을 사용한다. 이는 실제 지역/지원 버전/클래스/용량/성능·월 전체 OMS 비용을 확정한 값이 아니다. 실제 시작 용량과 유한 자원/비용 상한은 부하/복구 시험과 전체 견적에서 정한다. 합성 HTTP 수요를 실제 상시 사용량/DB 적합성으로 바꾸지 않는다.

AWS 공개 요금표의 게시 시각은2026-10-06T22:40:50Z, 아래 요율의 적용 시각은2026-10-01T00:00:00Z이다. Single-AZ compute USD0.051/시간·gp3 USD0.131/GB-month, Multi-AZ(one standby) compute USD0.102/시간·gp3 USD0.262/GB-month이다. Multi-AZ 요율에 대기 DB/복제 저장 비용이 포함된 값을 다시2배하지 않는다. [W13–W14]

- A:2×(730×0.102+20×0.262)=USD159.40/월.
- B:730×(0.102+0.051)+20×(0.262+0.131)=USD119.55/월.
- C:2×(730×0.051+20×0.131)=USD79.70/월.

DB compute와 gp3 저장만 포함한다. CPU credit·추가 backup/사용량/전송·관측·기타 AWS 자원/외부 통지/세금·환율은 포함하지 않았다. 월730시간은 견적 가정이며 SLO의 연속30일 측정 창과 구별한다. Free Tier/예약/장기 약정 할인을 가정하지 않는다.

### Q6 복구 목표와 검증

A의 권장은 AWS의 자동 전환을 활용해 운영 손작업을 줄이면서 단일 AZ 일시 장애도30분 복구 시험에 포함하는 기존 목표에 대응하려는 설계 판단이다. AWS가 OMS 전체99.9%/30분/RPO0을 보장한 결론이 아니다. 실제 접속 재설정·TypeORM/pg pool과 원래 요청/키·commit 불명/현재 권한·원장 보호 prefix·work/외부 효과 대조/알림·회수/복구 확인까지 시험해야 한다. 문서의 전환 시간 예시는 OMS의 확정 복구 시간이 아니다. [S1–S6·W11–W12]

B/C의 비용 절감 선택도 기존 목표를 자동 완화하지 않는다. 대기 DB 없는 저장소의 단일 AZ 일시 장애와 실제 원장/백업/권한·삭제/논리 손상 복구가30분/성공 접수 보존을 만족하는지 검증한다. 부족한 경우 실제 부족 항목·운영 부담/비용/대안을 제시하고 구성 또는 목표 변경은 명시적으로 확인한다. 백업/PITR만으로 이후 성공 접수 자료를 버리지 않으며 복제본은 오삭제/논리 손상에 대한 별도 보호 원장이 아니다. 이 선택은 운영 환경 범위이고 시험 환경의 상시 복제/자원 수를 추가 확정하지 않는다. [S2–S6]

## Q7. 사내 내부망과 AWS 사이에 사용할 사설 연결이 이미 준비되어 있나요?

직원용 UI·인증/복구/API는 사무실 또는 회사 승인 원격 PC의 사설 접속 경로에서만 허용하는 기존 선택을 유지한다. 이번 질문은 실제 망 연결 준비 여부를 확인한다. 공개 직원 접점으로 변경하거나 OMS에 단말 등록/인증서·MDM 기능을 추가하는 질문이 아니다. [S2·S6·S10]

A. 기존 연결이 없다. 사내망과 AWS 사이의 사설 연결을 새로 설계하고 실제 준비/접근·회수 검증을 직원 서비스 출시의 선행조건으로 둔다.
B. 기존 연결이 있다. 사용할 VPN/전용선 등 연결 방식과 연결 대상 VPC·관리 주체 등 확인 가능한 범위를 설명한다. 사용자에게 비밀/자격증명을 요구하지 않는다.
C. 아직 준비 여부를 확인하지 못했다. 현재는 미확인으로 기록하고 실제 연결/관리 주체를 회사 네트워크 운영 측과 확인한다.
X. Other (please specify). 현재 연결 상황이나 원하는 접속 범위를 설명한다.

[Answer]: A. 사내 내부망과 AWS 사이에 사용할 기존 사설 연결이 없다. 사용자 원문: "1". 승인된 사무실/회사 승인 원격 PC에서 직원용 사설 접점에 접근하도록 망 연결을 새로 설계하고 실제 준비·접근/회수 및 공개 우회 차단 검증을 직원 서비스 출시의 선행조건으로 둔다. 회사 네트워크 운영은 망/단말 입장·회수를 담당하고 OMS/인프라는 승인 경로의 직원 접점과 현재 계정/MFA/행위 권한을 검증한다. 특정 VPN 제품·라우터/고정 주소·담당자/실제 연결 권한·회수/준비 완료를 확보했다고 가정하지 않는다. OMS에 단말 등록/인증서/MDM 기능을 추가하지 않으며 로컬 격리 시험을 운영 사설망 준비로 간주하지 않는다.

회사 네트워크 운영은 망/단말 입장·회수를 소유하고 OMS/인프라는 승인된 경로의 직원 접점과 현재 계정/MFA/행위 권한을 검증한다. 특정 VPN 제품·회사 라우터·고정 주소·담당자/실제 준비 완료는 이 질문으로 임의 확정하지 않는다. 로컬 Docker의 격리된 합성 접속 시험은 진행할 수 있지만 실제 직원망 준비나 운영 접근 통과의 근거로 바꾸지 않는다. 공개 고객 ingress/BFF 또는 직접 API를 통한 직원 접근 우회도 출시 전 검증한다. [S2·S6]

## Q8. 개발자 장애 알림에 사용할 메신저 제품은 무엇으로 할까요?

기존 NFR Design Q19 C로 메신저를 이 단계에서 선정하기로 했다. 자동 복구 시도 시작 즉시 통지와 장애/수동 병행/복구 결과의 메신저+이메일2채널을 유지한다. 현재 사용 중인 메신저/워크스페이스·설치 권한/수신자·요금/자료 경로는 미확인이다. 실제 메시지 발송이나 외부 계정/채널 생성은 이 질문에서 실행하지 않는다. [S5–S6·S10]

A. Slack+이메일을 사용한다. Slack의 incoming webhook 등 메시지 API로 최소 운영 알림을 전달하고, 기존 OMS 앱/worker·업무 DB/원장 장애와 분리된 운영 경로에서 발송/담당자 확인을 관리한다. 이미 Slack을 사용하는지와 워크스페이스/앱 설치 권한은 적용 전에 확인한다. (기존 메신저 지정이 없을 때 권장)
B. Microsoft Teams+이메일을 사용한다. 실제 조직/채널·사용 가능한 Workflows 또는 지원되는 통합 방식/권한을 확인한다. 종료 예정인 기존 Microsoft365 Connector만을 신규 설계의 전제로 두지 않는다. 이미 Teams 사용 기반이 있으면 이를 활용하는 후보이다.
X. Other (please specify). 원하는 다른 메신저 이름이나 현재 사용 환경을 설명한다. 이메일과 실제 담당자 확인의 기존 조건을 함께 검토한다.

[Answer]: A. 개발자 장애 알림은 Slack+이메일을 사용한다. 사용자 원문: "1". 자동 복구 시도 시작 즉시 통지와 장애/수동 병행/복구 결과·발송 수락/명시 ACK/미확인 추가 알림의 기존 조건을 유지한다. Slack 메시지 API 연동과 OMS 앱/worker·업무 DB/원장에만 의존하지 않는 운영 발송/확인 경계를 설계한다. 실제 workspace/앱 설치·수신자/채널·지원 ACK 방식/요금·국내 자료 경로/수명은 적용 전에 확인한다. webhook 성공을 담당자 확인이나 복구 완료로 판정하지 않고 외부 메시지는 고객/주문/계약 상세·해당 ID·비밀 없는 최소 운영 정보와 접근 통제 링크로 제한한다. 실제 외부 메시지 발송/워크스페이스·앱·채널 생성/권한 부여나 유료 요금제를 실행/확정한 뜻이 아니다.

Slack webhook으로 알림을 보내는 것과 메시지를 읽었거나 담당자가 확인했다는 것은 다르다. 각 채널의 발송 수락1분/첫 긴급 명시 ACK3분·미확인2분 간격 최대3회 추가 알림을 원래 incident/담당자·근거와 연결한다. webhook200·메일발송 성공·읽음·AWS 관리형 통합 설치만으로 명시 ACK나 복구 완료를 판정하지 않는다. 실제 ACK 방식/신뢰된 담당자 식별·권한과 운영 경로는 선택한 채널에 맞춰 설계·검증한다. [S5–S6·W15–W17]

외부 메시지는 최소 incident/attempt·장애 분류/필요 조치·접근 통제된 추적 링크만 포함한다. 주문/고객/계약 상세나 해당 ID·라이선스 키/비밀/세션을 넣지 않고 링크 미리보기의 자료 반출도 제한한다. 실제 전송/외부 저장·운영자 식별 자료와 국내 경로/수명·설치/발송 권한을 실자료 전에 확인하며 채널 선택이 국내 저장 요구의 면제가 아니다. webhook URL/토큰은 비밀로 관리하고 공개 소스/구성/로그에 넣지 않는다. [S2·S5–S6·W16]

A의 권장은 단순한 알림 연동 경로를 우선하는 설계 판단이다. Slack이 항상 최저 비용이거나 기존 회사 환경에 적합하다는 확인 사실은 아니다. Teams도 실제 사용 기반/권한이 있다면 후보가 될 수 있다. AWS의 Amazon Q Developer in chat applications는 Slack/Teams 통합 후보로 조사했지만 이 질문으로 필수 채택하지 않으며 챗 명령의 AWS 운영/업무 변경 권한을 부여하지 않는다. 추가 장애 대응 제품/직원 모바일 업무 화면·SMS/전화나 유료 요금제를 자동 추가하지 않는다. 두 채널·관측 서비스 자체의 실패/불명 시나리오와 실제 야간 대응·1인 손작업도 검증한다. [S2·S5–S6·W15–W17]

### Q8 이전 결정 확인 — 제품 선택 전 설명

사용자 원문: "장애 알림에 사용할 메신저 이미 정했던 것 같은데?". 이는 이전 결정 확인 질의이며 Slack/Teams 제품 선택으로 해석하지 않는다. 이 질의를 받은 당시에는 Q8의 [Answer]를 비워두었다. 이후 사용자의 Slack+이메일 선택을 현재 답변에 반영했다.

Requirements Analysis Q32 B에서 업무 메신저+이메일의2채널을 확정했다. 당시 사용자 선택은 "2"이며 특정 제품/계정/수신 확인 기능은 미확인으로 남겼다. 이후 NFR Design Q19 C에서 실제 운영 메신저 제품은 "아직 미정"으로 두고 Infrastructure Design에서 후보를 비교·선정하기로 했다. 해당 사용자 원문은 "3"이다. 따라서 알림 채널 종류를 다시 선택하는 질문이 아니라 당시 보류한 실제 메신저 제품을 정하는 질문이다. 기존2채널과 자동 복구 시작 통지·발송/담당자 확인/재알림의 합의는 유지한다. [S5·S10·S12]

## Q9. 운영 서비스의 접속 비밀값은 어디에서 관리할까요?

대상은 DB 접속 자격·외부 서비스 API 비밀·Slack webhook 등 기술 실행에 필요한 비밀값이다. 직원/고객 비밀번호·MFA/복구 코드 원문을 이 저장소에 복제하거나 모든 업무 자료를 비밀 관리 서비스로 옮기는 선택이 아니다. 환경/실행·배포·원장 관리/복구·알림 역할별로 필요한 비밀만 읽도록 한다. [S2·S6·Q3 X·Q8 A·W18–W20]

A. AWS Secrets Manager에 기술 비밀값을 모아 관리한다. 실행 역할의 제한된 접근과 서비스의 비밀 수명/버전·지원되는 자격증명 교체 기능을 활용한다. 비민감 설정은 별도 검증된 배포 설정으로 관리한다. 비밀 관리 서버를 직접 운영하지 않는다. (권장)
B. AWS Systems Manager Parameter Store의 SecureString을 사용한다. 역할/환경별 읽기·암호화 권한을 제한하고 비밀값 교체/관련 서비스 반영과 검증 절차를 직접 관리한다. Standard tier 중심 비용 절감 후보이며 실제 크기/요청량·KMS/추가 처리 비용과 교체 부담을 함께 비교한다.
X. Other (please specify). 원하는 관리 방식을 설명한다.

[Answer]: A. DB 접속 자격·외부 서비스 API 비밀·Slack webhook 등 기술 비밀값을 AWS Secrets Manager로 관리한다. 사용자 원문: "1". 환경/실행·배포·원장 관리/복구·알림 역할별로 필요한 비밀만 읽도록 제한하고 런타임의 승인된 신원으로 조회한다. 비민감 설정은 검증된 배포 설정으로 관리하며 비밀을 소스/image·CI build/로그·CDK output·브라우저 번들/일반 trace에 넣지 않는다. 정상 앱에 원장 관리자/삭제·DDL/backup/키 파기·복구 역할의 비밀을 노출하지 않는다. 로컬은 운영과 분리한 시험 자격/연결 설정을 사용한다. 서비스 선택은 모든 비밀 자동 교체나 즉시 반영·교체 주기/비밀 수·실제 접근 권한/생성/비용을 확정한 뜻이 아니며 지원 대상·교체/회수/조회 실패/반영·DB 연결과 기존 작업의 대조를 검증한다. 공개 요금 예시와 실제 총비용을 구별한다.

정상 앱에 원장 관리자/DDL·삭제·backup/키 파기/복구 역할의 비밀을 노출하지 않는다. 기술 비밀은 런타임의 승인 신원으로 필요한 목적만 조회하고 소스·컨테이너 image·CI build/로그·CDK output·브라우저 번들/일반 trace에 포함하지 않는다. AWS 접근은 실행 IAM 역할의 자격 경계를 사용하고 영구 AWS access key를 앱 비밀의 기본값으로 두지 않는다. 로컬 Docker는 운영과 분리한 시험 자격/외부 연결 설정을 사용하며 공개 저장소에는 실제 비밀을 기록하지 않는다. [S2·S6·W18–W20]

선택한 서비스가 모든 비밀을 자동 교체하거나 실행 중인 모든 앱에 즉시 반영한다고 가정하지 않는다. ECS의 시작 시 환경 변수 주입은 값 교체 후 새 task/배포가 필요한 방식이며 앱의 런타임 조회/제한된 캐시 방식과 구별한다. 실제 지원 대상·교체/회수·조회 실패/기한/반영·DB 연결/원래 요청/작업 대조를 설계하고 검증한다. 구체 교체 주기나 추가 sidecar/Vault/새 계정·과금/실제 비밀 생성은 이 질문에서 자동 확정하지 않는다. 암호키의 보호와 정상 앱/원장 관리·복구 권한을 동일화하지 않는다. [S2·S6·W18–W20]

공개 Secrets Manager 요금 예시는 비밀1개 월 USD0.40와 API10000회 USD0.05다. 실제 비밀 수/조회량·KMS/교체 실행·네트워크/관측/세금 등을 포함한 전체 비용은 미확인이다. Parameter Store Standard parameter의 기본 저장 비용 없음은 KMS/추가 처리량/Advanced와 전체 운영이 무료라는 뜻이 아니다. 실제 적용 지역/기능과 총비용을 확인한다. [W19·W21–W22]

## Q10. 검사와 배포 자동화를 실행할 CI/CD 플랫폼은 무엇으로 할까요?

로컬 git 설정에서 origin의 host가 github.com임을 확인했다. 이는 저장소 가시성/요금제·관리 권한/실행 자격이 확보됐다는 뜻이 아니다. 기존 팀 결정은 main squash 병합·필수 검사/보고서 확인·main 병합 후 staging 자동 배포·개발자 본인의 검사/핵심 동작 확인 후 production 수동 배포다. 이번 질문은 이 흐름의 실행 플랫폼을 정하며 기존 승인/검사 조건을 다시 선택하지 않는다. [S11·E1·W23–W27]

A. GitHub Actions를 사용한다. 저장소와 workflow를 함께 관리하고 검증된 OIDC 신원으로 AWS의 제한된 임시 배포 역할에 접근한다. staging 자동 배포와 production의 특정 검증 산출물에 대한 사람 확인/수동 승인을 연결한다. 자체 CI 서버 운영 부담을 줄이는 방향으로 설계한다. (권장)
B. GitHub 소스를 연결한 AWS CodePipeline+CodeBuild를 사용한다. AWS의 관리형 pipeline/build와 제한된 서비스 역할을 사용하고 production 수동 승인 단계를 둔다. 소스 연결/지원 지역/관리 권한·빌드/검사/보고서·비용을 실제 설정으로 확인한다.
X. Other (please specify). 원하는 플랫폼이나 기존 CI/CD 환경을 설명한다.

[Answer]: A. GitHub Actions로 검사·빌드·CDK 배포 흐름을 실행한다. 사용자 원문: "1". 검증된 OIDC 신원으로 제한된 AWS 임시 역할에 접근하고 main squash·필수 검사/보고서·main 병합 후 staging 자동 배포·개발자 본인의 검사/핵심 동작 확인 후 production 수동 승인 흐름을 연결한다. 실제 repository 식별/가시성·요금제/runner/환경 보호·승인 지원과 issuer/aud/sub·허용 브랜치/환경/실행 주체·trust/권한은 적용 전에 확인한다. 특정 source SHA/image digest·config/schema/검사 보고서/staging 결과에 승인 근거를 묶고 변경 시 재검증한다. 외부 PR/fork·미검증 commit에 운영 자격을 주지 않으며 사설 DB/직원 접점을 runner 연결 목적으로 공개하지 않는다. GitHub 선택을 자체 상시 runner/별도 CodeBuild·추가 리뷰 인력/유료 plan 도입이나 실제 workflow/권한 생성·배포 실행으로 해석하지 않는다.

A의 권장은 현재 GitHub 저장소와1인 개발·운영 흐름을 같은 위치에서 관리하려는 설계 판단이다. 실제 runner/요금·환경 보호/승인 지원은 미확인이다. GitHub 요금제/저장소 가시성에 따라 required reviewer 등의 제공 범위가 다르므로 존재를 가정하지 않는다. 본인이 배포를 확인/승인하는 기존 팀 결정에 맞는 수동 경로를 적용하고 별도 필수 리뷰 인력이나 유료 plan을 자동 추가하지 않는다. 실제 승인 방식은 특정 source SHA/image digest·config/schema/검사 보고서/staging 결과에 결합되며 입력/산출물 변경 시 재검증한다. [S11·W23·W25]

OIDC는 영구 AWS key를 저장하지 않는 접근 경로이며 그 자체로 모든 workflow에 배포 권한을 주는 장치가 아니다. 실제 issuer/aud/sub·owner/repository의 식별 형식·허용 브랜치/환경/실행 주체와 역할 trust/최소 권한을 검증한다.2026년7월15일 이후 생성된 저장소 등의 immutable ID subject 지원을 실제 저장소에서 확인하고 문서 예시의 문자열/포괄 wildcard를 그대로 채택하지 않는다. 외부 PR/fork·미검증 commit에 운영 자격을 주지 않는다. staging/prod·image publishing/일반 app 배포/DDL·보호 원장 관리/복구의 범위를 구분한다. [S2·S6·W23]

hosted runner에서 실제 회사망·직원 사설 접점·DB에 접근할 수 있다고 가정하거나 이를 위해 공개 접점으로 바꾸지 않는다. private migration/runtime 검사 등은 실제 AWS 사설 경로의 제한된 일회 실행 역할 등으로 연결하고 준비/권한·실행/보고서/실패를 검증한다. self-hosted runner 상시 운영이나 별도 CodeBuild를 A 선택의 기본 요소로 추가하지 않는다. 코드/합성 시험과 실제 고객/주문/계약/비밀을 구분하며 CI 결과·로그·artifact의 국내 자료 경로/접근/수명을 확인한다. [S2·S6·W23–W27]

형식/lint/type·계약/secret/SAST/의존성·CDK/생성infra·격리 runtime 검사·전체 테스트 가능 제품코드80%/미실행 파일 분모·필수 보고서 누락/실패 차단/예외 근거 조건은 유지한다. 실제 도구/버전/명령/차단 기준·보고서·테스트 접근은 해당 실행 전에 고정한다. CI/CD 선택은 실제 workflow 생성/외부 권한 부여·배포/운영 데이터 접근을 실행한 승인이 아니다. [S2·S6·S11]

## Q11. 첫 버전의 앱 배포와 실패 시 되돌림은 어떻게 할까요?

첫 버전은 기존 ECS task를 새 task로 순차 교체하는 rolling 배포를 제안한다. 향후 무중단 배포 목표와 첫 버전의 계획중단 포함99.9%·30분 복구 목표를 구분하고 현재 구성의 무중단 달성을 가정하지 않는다. 검사/호환 확인과 production의 사람 승인은 Q10 A/기존 팀 결정을 적용한다. [S1–S6·S11·Q10 A·W28–W30]

A. ECS rolling 배포와 조건부 자동 되돌림을 사용한다. 기동/건강 검사 또는 등록된 배포 지표가 실패할 때, 현재 DB/작업·계약/보안 상태와 호환됨을 검증한 이전 완료 버전으로 되돌린다. ECS 배포 circuit breaker와 배포 CloudWatch alarm의 지원/조건을 실제 구성에서 확인한다. 되돌림 시도 시작 즉시 Slack+이메일을 보내고, 완료/실패·수동 필요를 대조한다. (권장)
B. ECS rolling 배포를 사용하고 실패 시 되돌림은 개발자가 결정한다. 실패 시 배포를 중단하고 Slack+이메일로 알리며 개발자가 호환 가능한 이전 버전과 현재 원본/안전 조건을 확인해 수행한다. 기존 자동 감지/기타 안전 복구의 합의는 유지한다.
X. Other (please specify). 원하는 배포·되돌림 방식을 설명한다.

[Answer]: A. 첫 버전의 앱은 ECS rolling 배포와 조건부 자동 되돌림을 사용한다. 사용자 원문: "1". 기동/건강 검사 또는 등록된 배포 지표가 실패할 때 현재 DB/작업·계약/설정/보안 상태와 호환됨을 검증한 이전 완료 버전으로 되돌린다. 시도 시작 즉시 Slack+이메일로 알리고 완료/실패·수동 필요와 실제 핵심 동작을 대조한다. 성공 접수/업무 상태·처리 이력/원장·Outbox/대기 작업·현재 권한/회수·외부 효과를 보존하고 DB를 과거 snapshot으로 되돌리는 행위와 구별한다. 구/신 앱·schema/decoder/대기 원본과 UI/API/worker의 배포/되돌림 조합을 먼저 검증한다. 이전 완료 버전/호환 근거가 없으면 안전한 보류/수동 대응을 연결하며 무한 되돌림이나 복구 시계 초기화를 하지 않는다. 실제 task 용량·건강/종료·감시 기한/알람 지원·비용/복구 달성은 미확인으로 두고 적용 전에 검증한다.

앱 되돌림은 DB를 과거 snapshot으로 되돌리는 행위가 아니다. 성공 접수/업무 상태·이력/원장·Outbox/대기 작업·현재 권한/회수·외부 효과 원본을 보존한다. DB 변경은 구/신 앱의 호환을 먼저 검증하고 기존 필드/decoder·대기 원본을 조기에 제거하지 않는다. UI/API/worker·계약/설정의 배포 순서와 되돌림 가능한 조합을 고정하며 현재 권한·비밀/키/binding의 회수 상태를 옛 값으로 복원하지 않는다. [S2·S4·S6]

A에서도 호환 근거 없는 대상이나 완료된 이전 버전이 없는 첫 배포는 자동 되돌림으로 해결했다고 표시하지 않는다. 배포 실패/보류와 원인을 기록하고 안전한 현재 동작 보존 또는 수동 조치를 연결한다. 같은 실패 배포의 자동 되돌림을 무한 반복하거나 새 시도로 원래 incident/30분 복구 시계를 초기화하지 않는다. 외부 결과 불명은 같은 원래 ID/효과를 대조하고 이미 실행한 작업을 맹목적으로 다시 보내지 않는다. [S4–S6·W28]

ECS 배포 circuit breaker/알람은 새 task의 기동/건강 또는 등록된 배포 지표에 대한 도구다. ALARM 상태로 시작하는 배포·알람 조회 제한/누락·명시 실패/완료/기존 target 유무와 관측 지연을 검증한다. 일반 health200/배포 COMPLETED만으로 핵심 업무 복구를 선언하지 않고 실제 접점/현재 권한·보호 접수·작업·정확성/현재 incident를 확인한다. provider/원장 장애에 대해 앱 재시작/되돌림만으로 원인이 해결된다고 가정하지 않는다. 실제 최대 임시 task/용량·건강/종료·감시 기한/알람 조건과 비용을 설정/부하·장애 시험으로 고정하며 문서의 예제 task 수/시간·전환 인자를 그대로 채택하지 않는다. [S1–S6·W28–W30]

## Q12. staging 검증 환경은 상시 유지할까요, 검증할 때만 구성할까요?

main 병합 후 staging 자동 배포·검사와 사람 확인 후 production 수동 배포는 유지한다. 실제 고객 자료/운영 비밀을 넣지 않는 별도 합성 검증 환경의 실행 수명을 정한다. 동일 AWS 계정 안에서 staging과 production의 자원/자격·원장/백업/회수/관리 권한을 구분한다. [S2–S6·S11·Q3 X·Q4 A·Q10 A]

A. 검증할 때 staging 자원을 자동 생성하고, 검증·보고서 보관·필요한 사람 확인을 마친 뒤 검증용 자원을 정리한다. main 병합 시 자동 시작하는 배포/검사 흐름을 포함하고 로컬 Docker 개발·시험을 함께 사용한다. 구성/데이터 준비와 정리는 자동화하며 재생성 대기와 잔여 자원 비용을 측정한다. (최초1인 개발·운영의 상시 비용을 줄이는 방향으로 권장)
B. 최소 크기의 staging 환경을 상시 유지한다. main 병합 시 해당 환경에 자동 배포·검증하고 언제든 사람이 접근/확인할 수 있게 한다. 초기 기동 대기를 줄이는 대신 DB/컨테이너/망 등 상시 비용과 상태 정리/격리를 관리한다.
X. Other (please specify). 원하는 검증 환경의 운영 수명을 설명한다.

[Answer]: A. staging은 검증할 때 자동 생성하고 검증·보고서 보관·필요한 사람 확인을 마친 뒤 검증용 자원을 정리한다. 사용자 원문: "1". main 병합 후 환경 생성/배포/검사를 자동 실행하고 로컬 Docker 개발·시험을 함께 사용한다. 특정 source SHA/image digest·config/schema·검사/실행 결과와 사람 확인/production 수동 승인 근거를 연결하며 보고서/산출물은 검증 실행 자원과 분리해 보존한다. 추가 확인이나 변경 시 같은 대상의 환경을 재구성·검증하고 동시 배포/확인·정리 경쟁을 제어한다. 자동 정리는 검증용 자원만 대상으로 하며 production·보호 원장/backup·키·운영 자료/신원을 정리 권한에 포함하지 않는다. 실제 생성/검사/확인/정리 시간·손작업·잔여 저장/backup/secret 비용과 역할/삭제·교체 정책을 검증한다. RDS의 일시 중지나 stack 삭제를 무기한 비용0으로 가정하지 않는다. 실제 AWS 자원 생성/삭제·권한 부여를 실행한 선택은 아니다.

A에서 main 병합→staging 배포/검사→사람의 확인→production 수동 승인에 필요한 특정 source SHA/image digest·config/schema·검사 보고서/실행 결과를 연결한다. 검증 환경을 정리해도 확인 근거/산출물이 사라지지 않게 하고, 이후 변경이나 추가 runtime 확인이 필요하면 같은 대상의 환경을 재구성·검증한다. 불완전/실패·누락/오래된 결과를 성공으로 표시하지 않는다. 동시에 진행되는 배포/사람 확인과 정리의 경쟁을 제어한다. 실제 생성/검사/확인/정리·오류 처리의 대기/총 경과와 사람 손작업을 구분해 검증한다. [S4·S6·S11]

자동 정리는 검증용 자원만 대상으로 한다. production 및 보호 원장/backup·키·실제 자료/운영 신원을 staging 작업의 삭제/중지 대상으로 두지 않는다. 확인 근거/빌드 산출물은 검증 실행 자원과 분리해 승인·추적에 필요한 수명/접근을 고정한다. 합성 시험 자격과 실제 외부 제공자의 시험 자격/자료를 구분하며 실제 신원/자료·외부 작업의 파기는 별도 확인된 정책으로 다룬다. 현재 단계에서는 AWS 자원 생성/삭제·계정/권한 부여를 실행하지 않는다. [S2·S4·S6]

필요할 때마다 자원을 생성/정리하는 방식과 RDS의 일시 중지를 구분한다. RDS를 중지해도 저장/backup 등 비용이 남고7일 후 자동 재시작하므로 무기한 무료 중지로 가정하지 않는다. CDK stack 삭제에서도 Retain/Snapshot·잔여 자원/secret과 과금이 생길 수 있다. 실제 역할·stack/resource 범위·삭제/교체 정책/보고서 보관·잔여 자원 정합성을 설계·검증한다. 최소 ready 용량·검증 data/profile/망은 생산 경계를 검증할 수 있게 구성하며 상시 비용 절감을 이유로 필수 검사/복구·접수 보존 시험을 생략하지 않는다. [S1–S6·W31–W33]

## Answer Analysis and Design Readiness

- Q1–Q12의 일반 질문은 모두 답변됐다. 과거 A/B 계정 제안은 미채택이며 Q3의 사용자 지정 단일 계정이 현재 선택이다. 이전 메신저 제품 미정은 Q8의 Slack 선택으로 해소했다. 현재 질문 간에 사용자 선택이 충돌하는 항목은 발견하지 않았다.
- 1인 개발은 기능 제외 근거가 아니며 필요한 기능을 구현하면서 운영 구성/반복 손작업을 줄이는 기존 결정과 Q3의 인프라 간소화 교정을 함께 적용한다. 로컬 Docker는 개발/시험 범위이고 실제 AWS 밖 서버 운영/공개 라이선스를 선택한 뜻은 아니다.
- staging의 자동 생성/검증/필요 사람 확인/정리는 기존 main 자동 staging 배포·production 수동 승인과 양립한다. 특정 검증 대상/보고서·변경/동시성·정리 권한을 설계에서 연결한다. rolling/앱 되돌림은 DB/접수/작업/현재 회수를 과거 상태로 복원하는 뜻이 아니다.
- 서로 다른 AZ의 Single-AZ 업무 DB/보호 원장은 관리/저장 경계를 분리하는 설계 방향이다. 대기 DB가 없는 실제 장애/새 DB 준비/복구·완전 payload/prefix/ACK 대조가30분 및 접수 보존을 만족하는지 미검증이다. Q6 C를 목표 완화나 검증 통과로 해석하지 않는다.
- 비용 상한 미정과 공개 가격 예시는 실제 운영 budget/자원 수/월 총비용 확정이 아니다. 구체 인프라 설계에는 선택한 서비스의 배치/자원·측정 기반 유한 상한/비용 항목과 검증 후보를 명시하고 실제 사용량/부하/복구 결과를 대조해 적용 값을 고정한다. 미확인 값을 실제 측정치나 사용자 확정치로 채우지 않는다.
- AWS 실제 계정/소유·region/AZ/지원 버전·resource/role/trust/망·비밀/교체·DB/원장 payload/삭제/복구·회사 망 준비·Slack/이메일/명시 확인/국내 자료 경로·retention/실제 계약·외부 provider/야간 대응은 미확인이다. S6의 ND-RG01–10/실제 적용 전 시점과 책임에 연결한다. 필수 선행조건이 없는 경로는 실제 운영/상용 보장/실자료 처리로 진행하지 않는다.
- 이 확인은 선택된 방향으로4개 인프라 설계 산출물을 작성하도록 하는 확인이다. AWS 자원·계정/권한/알림 발송/배포/앱 코드 실행은 별도 후속 작업이며 현재 실행/검증을 완료한 것으로 표시하지 않는다.

## Assumptions & Open Questions

- Q1은 기존 월 비용 상한 없음·견적 후 상한 결정, Q2는4개 실행 역할의 ECS Fargate, Q3은 사용자 지정 단일 AWS 계정으로 확정했다. 1인 개발·운영 가능한 오픈소스 OMS에 필요한 범위로 인프라 복잡성을 줄인다. 운영/시험/보호 원장과 실행/배포/복구 권한은 계정 안에서 구분한다. 실제 계정 소유/접근·제품/지원버전/자원/경로/내구/복구/비용·운영 적합성은 미확인이다. Q4는 로컬 Docker 개발·시험 및 단일 AWS 계정의 CDK 운영 배포로 확정했다. Q5는 업무 DB와 보호 원장을 별도 RDS PostgreSQL 구성으로 운영하도록 확정했다. Q6은 업무 DB와 보호 원장을 모두 Single-AZ로, 서로 다른 AZ에 배치하도록 확정했다. 대기 DB 자동 전환 없이 기존 복구/성공 접수 보존 목표를 실제 시험한다. Q7은 기존 사내망–AWS 사설 연결 없음으로 확인했다. 실제 사설 경로 준비/권한·입장/회수와 직원 공개 우회 차단을 출시 전 검증한다. Q8은 Slack+이메일로 확정했다. 실제 연동/권한·수신자·발송/명시 확인과 국내 자료 경로/수명은 적용 전 검증한다. Q9는 기술 비밀값을 AWS Secrets Manager로 관리하도록 확정했다. 실제 비밀/역할·조회/교체/회수/반영과 지원·비용을 적용 전에 검증한다. Q10은 GitHub Actions 및 제한된 OIDC 임시 AWS 역할로 확정했다. 실제 저장소/plan·신뢰 조건/승인/runner·보고서/사설 실행 경로는 적용 전에 검증한다. Q11은 ECS rolling 및 호환 검증한 이전 완료 앱 버전으로의 조건부 자동 되돌림으로 확정했다. 시도 시작부터 Slack+이메일로 알리고 현재 업무/권한/작업 원본을 보존한다. 실제 감시/호환/반영/정확성·복구 달성은 적용 전에 검증한다. Q12는 main 병합 후 검증 환경 자동 생성/배포/검사·보고서 보관/필요 사람 확인 후 검증 자원 정리로 확정했다. production·보호 원본/키는 정리 범위에서 제외하고 실제 자원 준비/정리·검사/동시성·증거/잔여 비용을 검증한다. 이번 단계의12개 일반 질문은 답변을 마쳤다. 실제 미확인 입력은 아래 분석/선행 검증으로 명시하며 산출물 작성 전 통합 확인을 받는다. main squash·필수 검사/보고서·staging 자동/production 본인 수동 승인 흐름은 유지한다. 서울·db.t4g.small·각20GiB·월730시간의 비용은 공개 요율에 따른 비교 예시이며 실제 자원/지역/예산 상한·성능/복구 달성의 확정이 아니다.
- 이 단계는 설계이며4개 Infrastructure 산출물/실제CDK 코드·AWS 자원/계정/발송/배포를 아직 생성/실행하지 않는다. 질문/별도 요약 확인 후 concrete resource/config·관측·CI/CD와 NFR별 추적을 작성·검토한다.
- test-after/Standard·작성가능 전체 제품코드80%·필수검사 실패/미실행/누락 차단·main squash/staging자동/prod수동승인을 유지한다. 해당실행 전 actual 검사 도구/명령/지원/보고서/예외를 고정한다.

## Sources

- W31: [RDS 일시 중지](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/USER_StopInstance.html) — 중지 중 저장/backup 등 과금·최대7일/자동 재시작과 실제 시작/중지 시간. staging을 무기한 비용0으로 두는 근거가 아니다.
- W32: [CDK stack 정리](https://docs.aws.amazon.com/cdk/v2/guide/ref-cli-cmd-destroy.html) — stack 삭제와 Retain 자원의 경계·실제 target/의존 자원 확인. 현재 단계에서 해당 명령을 실행하지 않는다.
- W33: [CloudFormation DeletionPolicy](https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-attribute-deletionpolicy.html) — 삭제/Retain/Snapshot·교체 경계와 잔여 과금. 실제 검증 자원 정리와 운영 보호/산출물 수명을 분리해 적용 전에 고정한다.
- W28: [ECS 배포 circuit breaker](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-circuit-breaker.html) — rolling controller의 실패 판정/되돌림·이전 COMPLETED target 유무·배포 이벤트. OMS의 호환/원본/복구 검증을 대체하지 않는다.
- W29: [ECS 배포 CloudWatch alarms](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-alarm-failure.html) — 등록 지표 기반 실패/rollback·초기 ALARM 무시·조회 제한/누락·감시 기간과 실제 기한 확인.
- W30: [ECS rolling task 교체](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/deployment-type-ecs.html) — 최소 healthy/최대 task·기동/교체/부하·image digest와 실패 감지 방식. 정확한 지원/인자는 실제 배포 전에 고정한다.
- E1:2026-10-08 KST 로컬 git origin 설정의 host만 확인한 결과 github.com. URL 전체/자격증명은 출력하지 않았으며 저장소 visibility/요금제·연결/실행 권한이나 CI 제품 준비를 조회한 증거가 아니다.
- W23: [GitHub Actions의 AWS OIDC](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws) — 임시 자격·issuer/aud/sub·저장소/환경 trust와 immutable ID subject의 실제 형식 확인. 문서 workflow/action 버전이나 wildcard를 그대로 선정하지 않는다.
- W24: [AWS CodePipeline](https://docs.aws.amazon.com/codepipeline/latest/userguide/welcome.html) — 소프트웨어 release pipeline의 관리형 실행 모델. 실제 source 연결/지원/권한/비용은 미확인이다.
- W25: [GitHub 배포 환경과 보호](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments) — required reviewer/자기 승인·요금제/가시성에 따른 지원 범위·환경 자격과 보호. 실제 제품 기능을 검증한 뒤 기존1인 확인/승인 흐름에 맞춘다.
- W26: [AWS CodeBuild](https://docs.aws.amazon.com/codebuild/latest/userguide/welcome.html) — 관리형 빌드/테스트/산출물과 CodePipeline 연계. B 비교 후보이며 A 선택에 자동 추가하지 않는다.
- W27: [CodePipeline 수동 승인](https://docs.aws.amazon.com/codepipeline/latest/userguide/approvals.html) — 승인 역할/단계와 결과별 진행 제어. 문서 승인 기한/예제 알림을 OMS의 장애/배포 조건으로 전용하지 않는다.
- W18: [AWS Secrets Manager](https://docs.aws.amazon.com/secretsmanager/latest/userguide/intro.html) — DB/API 자격 등 비밀 수명/조회·지원 교체 기능과 IAM/KMS의 역할. 모든 비밀의 자동 교체나 OMS의 실제 반영/복구 달성을 주장하지 않는다.
- W19: [Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html) — SecureString/KMS·IAM·표준/고급 비용과 Secrets Manager의 자격증명 관리 기능 차이.
- W20: [ECS 민감 데이터 전달](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/specifying-sensitive-data.html) — 제한 IAM 접근·비밀 관리 서비스와 환경 변수 주입의 값 변경 후 새 task/배포 필요. 런타임 조회/캐시와 전달 방식은 실제 구성으로 검증한다.
- W21: [Secrets Manager 가격](https://aws.amazon.com/secrets-manager/pricing/) — 공개 예시의 비밀 월 USD0.40/API10000회 USD0.05와 사용량 기반 비용. 예시의 secret 수/앱 규모/교체 주기를 OMS 사용량으로 전용하지 않는다.
- W22: [Systems Manager 가격](https://aws.amazon.com/systems-manager/pricing/) — Parameter Store 비용 확인 경로. 실제 tier/처리량·KMS/네트워크를 포함한 총비용은 적용 전 확인한다.
- S12: [Requirements Analysis Q32](../../../inception/requirements-analysis/requirements-analysis-questions.md) — 업무 메신저+이메일은 이미 확정; 특정 메신저 제품은 당시 미선정. 이후 NFR Design Q19 C의 사용자 선택 "3"으로 Infrastructure Design에서 제품을 비교·선정하도록 보류했다.
- W15: [Amazon Q Developer in chat applications](https://docs.aws.amazon.com/chatbot/latest/adminguide/what-is.html) — SNS를 통한 Slack/Teams 알림과 채널/앱 관리 권한·사용 가능한 관리 명령의 경계. 조사 후보이며 필수 채택이나 명시 ACK/실제 전달·국내 저장/운영 달성의 근거가 아니다.
- W16: [Slack incoming webhooks](https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/) — 메시지 API·설치/채널 권한·비밀 URL·응답 오류와 전송 수락. webhook 전송을 사람 확인으로 바꾸지 않으며 공개 저장소에 비밀을 기록하지 않는다.
- W17: [Microsoft Teams webhook 및 Workflows](https://learn.microsoft.com/en-us/microsoftteams/platform/webhooks-and-connectors/how-to/add-incoming-webhook) — 신규 Workflows 경로와 Microsoft365 Connector의 종료 예정 안내. 실제 tenant/지원 방식·권한/요금/담당자 확인 기능은 적용 전 검증한다.
- W12: [RDS Multi-AZ DB instance 장애 전환](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZ.Failover.html) — AWS의 자동 전환과 실제 활동에 따른 시간 차이·기존 연결 재설정. 예시 전환 시간을 OMS 전체 복구 보장으로 전용하지 않는다.
- W13: [RDS PostgreSQL 가격](https://aws.amazon.com/rds/postgresql/pricing/) — Single-AZ/one standby/two readable standbys의 구분·과금/CPU credit·가격 변수. Q6은 one standby와 Single-AZ만 비교하며3개 AZ DB cluster를 선정하지 않는다.
- W14: [AWS 공개 서울 리전 RDS 요금표](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonRDS/current/ap-northeast-2/index.json) —2026-10-06T22:40:50Z 게시/2026-10-01 요율의 PostgreSQL db.t4g.small·gp3 Single-AZ/Multi-AZ On-Demand 값. Q6 수식/가정과 미포함 항목을 명시한다. 공개 가격 원본을 직접 읽었고 실제 계정 과금/견적을 조회하지 않았다.
- W10: [Amazon RDS 개요와 관리 책임](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Welcome.html) — RDS/EC2의 DB/OS·백업/복구 관리 책임, PostgreSQL 지원과 계정/네트워크 접근 경계. 실제 OMS 지원 버전/배치·비용/복구 목표 달성은 별도 검증한다.
- W11: [RDS Multi-AZ DB instance](https://docs.aws.amazon.com/AmazonRDS/latest/UserGuide/Concepts.MultiAZSingleStandby.html) — 다른 AZ의 동기 대기 복제본·장애 전환·읽기 확장과의 구분. Q5로 Multi-AZ 구성이나 자원 수를 자동 선택하지 않으며 원장/백업/오삭제 복구를 대체하지 않는다.
- S1: [performance-design.md](../nfr-design/performance-design.md)
- S2: [security-design.md](../nfr-design/security-design.md)
- S3: [scalability-design.md](../nfr-design/scalability-design.md)
- S4: [reliability-design.md](../nfr-design/reliability-design.md)
- S5: [observability-design.md](../nfr-design/observability-design.md)
- S6: [logical-components.md](../nfr-design/logical-components.md) — ND-RG01–10·field/원본·실제확인/차단 조건.
- S7: [components.md](../../../inception/domain-design/components.md)
- S8: [functional-spec.md](../functional-design/functional-spec.md)
- S9: [contract-summary.md](../../../inception/contract-design/contract-summary.md)
- S10: [확인된 NFR 질문](../nfr-design/nfr-design-questions.md), [독립 NFR 검토](../nfr-design/reviews/review-01.md)
- S11: [team-practices.md](../../../inception/practices-discovery/team-practices.md)
- W1: [Amazon ECS on Fargate](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/AWS_Fargate.html) — container task·VM host 관리 위임과 자원/network/IAM·서비스 지원 범위. 실제 OMS 구성/지역/가격·운영/보안/복구 달성은 별도 검증이다.
- W2: [Next self-hosting](https://nextjs.org/docs/app/guides/self-hosting) — Node/Docker·복수 instance/cache/환경/종료 경계. 예제 cache/추가저장·grace기간/현재major를 OMS 결정으로 전용하지 않는다.
- W3: [Nest serverless](https://docs.nestjs.com/faq/serverless) — Express HTTP adapter/standalone·cold start/DB 연결·실제 handler boundary. 예제runtime/Serverless framework/개발PC benchmark를 OMS 지원 조합/성능으로 채택하지 않는다.
- W4: [Lambda SQS event source](https://docs.aws.amazon.com/lambda/latest/dg/services-sqs-configure.html) — same-region·timeout/visibility·batch/partial failure·concurrency/retry 역할. 문서 권장 maxReceiveCount/visibility/신규 poller mode/기본값을 OMS 원본 작업 한도/효과/10초시작 달성으로 전용하지 않는다.
- W5: [Organizing AWS with multiple accounts](https://docs.aws.amazon.com/whitepapers/latest/organizing-your-aws-environment/organizing-your-aws-environment.html) — 계정 IAM/명시 cross-account 공유·환경 분리/자동화와 실제 business 필요에 따른 조정. OMS의계정수/서비스·실제권한/비용/독립내구/복구 달성은 별도 선택/검증이다.
- W6: [Organizations management account best practices](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_best-practices_mgmt-acct.html) — 관리계정 workload 분리/접근 제한·SCP의 관리계정 미적용. 문서의기본control/신규기능/기존기업접근·계정확보를 OMS 환경의 사실로 전용하지 않는다.
- W7: [AWS security tooling account](https://docs.aws.amazon.com/prescriptive-guidance/latest/security-reference-architecture/security-tooling.html) — 제한된 별도 security/monitoring/response 권위의 참고. SRA 모든제품/OU·ControlTower·실제역할/자료region이나 OMS 복구원장3계정/RPO0 달성의 채택 근거가 아니다.
- W8: [AWS Organizations overview](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_introduction.html) — 실제 account의 중앙 관리/단일청구·IAMIdentityCenter 접근 연동의 역할. OMS 실제 account/자격·통합접근 제품선정이나 별도보호/복구의 달성 증거가 아니다.
- W9: [Organizations terminology](https://docs.aws.amazon.com/organizations/latest/userguide/orgs_getting-started_concepts.html) — AWS Account와 IAM user/role·management/member account 및 organization의 구별. actual 계정소유/설정/권한/비용은 별도로 확인한다.

## Consolidated Summary Confirmation

- AWS 계정은 하나를 사용한다. 운영/시험/보호 복구 원장은 계정 안에서 자원·비밀·DB/IAM·배포/복구 권한을 구분하고1인 개발·운영 가능한 오픈소스 OMS에 필요한 인프라 범위로 설계한다.
- 고객 UI/직원 UI/API/worker4역할은 ECS on Fargate에서 실행한다. 기존 Next/BFF·NestJS+Express API/Nest standalone worker·모듈화된 단일 업무 핵심과 PostgreSQL/TypeORM을 유지한다.
- 로컬은 Docker 개발·시험을 지원하고 실제 운영은 단일 AWS 계정의 TypeScript CDK 배포를 제공한다. AWS 밖 자체 서버 운영 지원/공개 라이선스는 미정이다.
- 업무 DB와 보호 원장은 별도 RDS PostgreSQL의 Single-AZ DB2개이며 서로 다른 AZ에 둔다. 대기 DB 자동 전환은 두지 않는다. 성공 접수 전 보호/복구 원본·현재 권한/정확성을 유지하고 실제30분 복구/접수 보존을 시험한다.
- 기존 월 비용 상한은 없다. 필요한 전체 구성·실제 가격/사용량 견적 후 유한 budget/자원 상한을 정한다. 서울/db.t4g.small/각20GiB gp3/월730시간의 DB USD79.70/월은 compute+gp3만 포함한 비교 예시이며 실제 region/용량·총비용/성능 확정이 아니다.
- 기존 사내망–AWS 사설 연결은 없다. 직원 UI/인증/API의 승인 사설 경로를 준비하고 실제 접근/회수·공개 우회 차단을 출시 전에 검증한다. 단말 등록/인증서·MDM은 회사 네트워크 운영의 책임이다.
- 장애 알림은 Slack+이메일이다. 자동 복구/되돌림 시도 시작부터 알리고 기존 발송 수락/명시 ACK/추가 알림·독립 장애 경로 조건을 적용한다. 실제 연동 권한/수신자/국내 자료 경로·발송/확인 기능은 적용 전에 검증한다.
- 기술 비밀값은 Secrets Manager에서 환경/목적·역할별로 제한해 런타임에서 조회한다. 소스/빌드/image/번들·일반 로그에 비밀을 노출하지 않고 실제 지원 교체/회수/반영을 검증한다.
- CI/CD는 GitHub Actions와 제한된 OIDC 임시 AWS 역할이다. main squash·필수 검사/보고서·전체 테스트 가능 제품코드80% 조건과 main 병합 후 staging 자동·본인 확인 후 production 수동 승인 흐름을 적용한다.
- 앱은 ECS rolling 배포하며 현재 DB/작업·계약/설정/보안 상태와 호환을 검증한 이전 완료 버전으로 조건부 자동 되돌림한다. 성공 접수/주문/작업/이력·현재 권한/회수/외부 효과를 보존하고 되돌림 시도 시작부터 Slack+이메일로 알린다.
- staging은 필요할 때 자동 생성/배포/검사하고 보고서 보관·필요 사람 확인 후 검증 자원을 정리한다. 보고서/산출물·승인 근거를 실행 자원과 분리해 보존하고 운영·보호 원본/키는 정리 대상에서 제외한다.
- 전체 가용성99.9%·실제 장애부터30분 복구·정의한 성공 접수 보존/8영역 정확성 목표를 유지한다. 실제 자원/지원 버전·성능/복구/보안·국내 경로/보관·비용/1인 운영 달성은 미검증이며 명시한 선행 확인/시험을 통과한 뒤 적용한다.

Does this all look correct before I generate the artifact?
- Looks correct
- Request changes

[Answer]: Looks correct
