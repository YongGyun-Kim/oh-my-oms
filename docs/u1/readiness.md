# U1 구현 준비와 실제 적용 차단

## 확인 범위

2026-10-08 확인. 계획 및 시험 계약의 승인 검증은 `receiptValid:true`, `execution_allowed:true`다. 추가 질문 Q1/Q2의 summary-confirmation도 부모가 기록했다. 이 문서는 로컬 합성 구현의 기술 선택과 아직 필요한 실제 적용 증거를 분리한다. 구현·시험·운영 통과 보고서가 아니다.

주문은 HW/SW 각각 최대100항목이며 구매 수량과 별개다.101항목은 전체 입력을 거절하고 자동 분할하거나 부분 접수하지 않는다. 사전 복구 코드는 정기 만료 없이 단회 사용하며 재발급·회수·계정/인증 연결 세대 무효화 때 거절한다. 복구는 비밀번호 검증 및 재등록 목적 제한을 유지한다.

## 지원 조합과 확인 근거

로컬은 macOS26.6.2 arm64, Node22.23.1, npm10.9.8이다. Docker CLI/서버29.8.0이 Linux aarch64로 응답한다. 호스트 PostgreSQL CLI는 없으므로 두 독립 Docker PostgreSQL 인스턴스를 사용한다.

| 구성                                             | 고정할 버전                         | 선택 근거와 남은 검증                                                                                     |
| ------------------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Node                                             | 22.23.3                             | 공식 security patch22.23.2와 후속 수정 포함; 전용 런타임 사용, EOL2027-04-30 전 갱신 필요                 |
| Next/React/ReactDOM                              | 16.4.0/19.3.0/19.3.0                | Next16 Active LTS, Node>=20.9·React19 peer 만족                                                           |
| Nest core/common/platform-express                | 12.1.2                              | 동일 major; 공식 v12 guide의 Node22.12+·ESM 및 TS6/Vitest 경로 적용                                       |
| Express                                          | 5.2.1                               | Nest Express adapter와 같은 major/지원 선언                                                               |
| TypeScript                                       | 6.0.3                               | Nest 공식 v12 전환 대상; TS7 native compiler는 선택하지 않음                                              |
| TypeORM/pg                                       | 1.1.2/8.23.1                        | Node22.13+·pg8 peer; 공식1.0 변경 내용을 검토하고 EntitySchema/DataSource/같은 EntityManager 사용         |
| PostgreSQL                                       | 17.11                               | 현재 지원 minor, major17의 upstream 지원은2029-11-08까지; RDS 해당 minor 가용성은 실제 AWS 적용 전에 확인 |
| Ajv/formats                                      | 8.20.0/3.0.1                        | Ajv2020 class·canonical2020-12 사용                                                                       |
| Vitest/coverage-v8/Vite                          | 5.0.3/5.0.3/8.3.3                   | Node22.12+ 및 정확한 runner/coverage peer                                                                 |
| Playwright/axe/jsdom                             | 1.64.0/4.13.0/30.1.2                | 프로젝트 전용 Node22.23.3이 engine 만족; 실제 브라우저 실행·접근성 시험 필요                              |
| CDK lib/CLI/constructs                           | 2.272.0/2.1145.0/10.8.1             | Node22 지원·constructs10 peer; synth 호환은 실제 검사                                                     |
| Prettier/ESLint/typescript-eslint                | 3.9.9/10.12.0/8.71.1                | TS>=4.8.4,<6.1 및 ESLint10 peer                                                                           |
| AWS Cognito/SQS/SNS/DynamoDB SDK                 | 3.1147.0                            | Node20+; 실제 제공자 지원·계정/설정은 별도 차단                                                           |
| OTel api/sdk-node/exporter/sdk-trace/sdk-metrics | 1.9.1/0.223.0/0.223.0/2.12.0/2.12.0 | api<1.10 peer; 상세 계측에 payload/credential 수집 금지                                                   |

공식 npm registry의 해당 exact version engine/peer/deprecated 정보를 확인했다. OSV querybatch에서 Next16.4.0, React19.3.0, Nest12.1.2 세 패키지, TypeORM1.1.2, TS6.0.3, pg8.23.1, Vitest5.0.3, Vite8.3.3, Express5.2.1, CDK lib2.272.0에 현재 일치하는 advisory가 없었다. 이는 전체 전이 의존성이나 미래 취약점의 안전 보장이 아니다. lock 설치 후 전체 dependency 검사와 실제 compiler/runtime 시험이 필수다. 이미 낡은 이전 major를 안전하다고 자동 채택하지 않는다.

## 로컬 합성 profile과 원본 등록

NFR Design Q24/Q24-F1, WF02, BR2.1–2.3, ND-SEC-03에 따라 기업A/B와 합성 계정·근거를 사용한다. 동일인 다른 계정·미확인 관계는 VerifiedPersonLink로 대조한다. 초기 직원의 비공개 최소 staff.role.manage 이후 일반 역할 관리, 일반 기업 신청, 현재 enterprise.approve, CE02 별도 최초 지정, 최소 기업 관리 grant를 거친다. 기업 승인과 관리자 지정·거래 권한을 자동 결합하지 않는다.

합성 identity/ingress/provider 대역은 tests/u1에서만 등록하며 production 등록을 거절한다. 실제 PostgreSQL·Nest API·Next/BFF의 업무/접수·현재 권한·원장 경계는 대역으로 치환하지 않는다. 초기 APPROVED 기업/관리자를 삽입해 승인 경로를 우회하지 않는다.

기존 canonical common:1을 보존하고 제한 및 확장을 새 common:2/foundation 계약에 명시적으로 등록한다. CE01–04의 owner/operation/audience/target/입출력, organisationRevision=Enterprise.revision, Receipt/Work의 원래 correlationId, 안정 Account와 provider binding generation, 복구 after-image/보안 회수·파기/작업/효과/decoder를 등록·검증한 뒤 handler를 연결한다. 미등록 후속 owner는 성공 binding을 갖지 않는다.

## 유한 기술 설정

다음은 로컬 합성 시작값이다. 검증된 실환경 용량/비용이나 성능 통과값이 아니다. 실제 활성화 전에 측정 및 전체 허용 replica 합계를 대조한다.

- 입력1MiB·응답4MiB·복구 payload4MiB; 식별자128자·일반 문자열4096자·근거 참조64개. 구체 field에서 더 작은 제한이 필요하면 등록 계약에 명시한다. 구매 수량은 canonical 양수 정수와 정확한 표현 가능성 검증이며 새 사업 최대 수량을 발명하지 않는다.
- 일반 목록25/최대100, 주문 최대100항목. 제한 초과는 전체400 오류이고 조용한 clamp/분할은 없다.
- primary/journal 각각 API/worker pool8, steady 최대 API2+worker2의 합32+운영/복구 여유8=40. rolling overlap 최대 API4+worker4에서8×8+운영/복구8=72/DB이고 UI4+4는DB연결 없음; 총16tasks 경계와 대조한다. UI는 DB 직접 접속하지 않는다. 로컬 PG max_connections100. 실제 RDS 용량은 별도 확인한다.
- DB 연결2초·lock1초·statement2초, HTTP 조회5초/변경10초의 잔여 예산 안에서 적용한다. timeout은 commit 부재의 증거가 아니다.
- worker concurrency4/replica, relay batch25, claim/drain30초. 누적 retry 최초1+추가3·전체5분·개별30초, jitter0–5/20/80초 및 원래 더 짧은 기한 우선.
- session ID32 random bytes, 복구 코드10개/각128bit CSPRNG. 목적/계정·발급 세대에 결합한 keyed SHA256 verifier와 constant-time 대조, 원자 단회 사용. key는 환경/비밀 저장소 경계 밖으로 복제하지 않는다. 정기 code 만료는 없고 세션은 직원 idle15분/고객30분·절대8시간이다.
- 인증 시도는 주체/신뢰 경로/전체 계층에서 유한 제한을 적용하고 단일 실패로 계정 전체를 영구 잠그지 않는다. 주체10/신뢰 경로100/전체1000회·60초 고정 창을 같은 PG 원본으로 원자 기록한다. 한도 초과는429이며 영구 계정 잠금이 아니다. 공격/동시성 시험 결과와 실제 용량은 별도다.
- 상세 trace 계측100% 대상, buffer512 spans/batch64/flush1초, 허용 metadata만. 누락/drop을 측정하며100% 전달·보존을 주장하지 않는다.

복구 재생 후 auth-ready는 false로 유지한다. 미보호 최신 회수와 현재 제공자/권한/위임·파기 근거의 독립 대조가 없으면 이전 grant/session을 허용하지 않는다. 복구 완료 자체로 인증 재개를 승인하지 않는다.

## 실제 적용 전에 차단할 조건

CG-R03/05/07/08·ND-RG01–10·IG-01–08의 실제 부분은 미해소다. 실제 Cognito 자격/pool/challenge/TOTP/복구·binding 전환, 실제 회사 사설 ingress/회수/TLS, 실제 Account/AZ/role·RDS minor/backup/key, 기업/사람·위임 수용 기준, 자료 보관/파기·국내 경로·의무, Slack/email/SNS 수신/ACK와 운영/30일 가용성·야간/단일AZ·1인 부담은 해당 실계정/실자료/연동/출시 전에 증거가 필요하다.

미등록/지원 불명 provider는 성공을 반환하지 않는다. 합성 시연을 실제 확인·회사망·외부 전달·99.9%/30분/RPO0의 운영 실적으로 쓰지 않는다. 서울 리전 이름만으로 모든 외부 경로의 국내 저장을 입증하지 않는다. AWS 생성/배포·외부 발송·실거래·commit/push/merge는 이번 구현에서 수행하지 않는다.

## 근거

- [Node 지원](https://github.com/nodejs/Release), [Next 지원](https://nextjs.org/support-policy), [Next16 요구](https://nextjs.org/docs/app/guides/upgrading/version-16)
- [Nest12 전환](https://docs.nestjs.com/migration-guide), [TypeORM1 전환](https://typeorm.io/docs/releases/1.0/upgrading-from-0.3/), [PG 지원](https://www.postgresql.org/support/versioning/)
- [TS6](https://www.typescriptlang.org/docs/handbook/release-notes/typescript-6-0.html), [npm registry](https://registry.npmjs.org/), [OSV API](https://google.github.io/osv.dev/api/)
- 저장소 U1 code-generation 승인 계획/지침 및 implementation-readiness-questions.md의 Q1/Q2; NFR Design logical-components/security/reliability/performance와 Infrastructure Design의 현재 gate.

## Node 보안 패치 반영

호스트22.23.1 관측값을 제품 고정값으로 채택한 초안을 수정했다. 공식22.23.2의 HTTP2/permission·HTTPS 수정과22.23.3 후속 release를 확인해 프로젝트 전용22.23.3/npm10.9.9로 변경했다. 전역 Node는 변경하지 않았다. 공식 darwin-arm64 archive SHA256 `23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53`와 배포 SHASUMS256.txt의 일치를 확인했다. 캐시 경로는 `/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin`이다.

[Node22.23.2 security](https://nodejs.org/en/blog/release/v22.23.2), [Node22.23.3](https://nodejs.org/en/blog/release/v22.23.3).

## CDK 전이 취약점 차단

전체 npm audit는 CDK2.272.0의 bundled brace-expansion5.0.9 high1건으로 실패했다. npm audit fix 및 제한된 root override 시도는 bundled 항목을 고치지 못했다. 효과 없는 override는 제거했다.2.271/2.268/2.260/2.250/2.240도 동일 취약 범위이며2.236/2.230/2.220/2.210/2.200의 전체 bundled metadata를 OSV와 대조했을 때 추가 기존 취약점이 확인됐다. 깨끗한 버전/공식 보안 수정 또는 검증된 목적 한정 dependency patch가 확보되기 전 IaC 실행·필수 보안 완료는 차단한다. 다운그레이드/임계값 완화/감사 제외로 숨기지 않는다. [현재 advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7).

## 구현 중 기술 경계 보완

- 인증 challenge는 API instance의 Map이 아니라 primary의 별도 AES-256-GCM 암호화 임시 저장소를 사용한다. HKDF-SHA256으로 verifier root key와 용도를 분리하고 nonce12byte/tag16byte/AAD와5분TTL·전체1000개·30초lease를 적용한다. business/Outbox/journal에는 provider token·등록 secret·credential 원문을 넣지 않는다. 복구 시 임시 자료를 제거한다. 실제 key 배포/회전 및 모든 replica의 동일 세대는 배포 검증 조건이다.
- 유휴 활동은 서버의 등록·권한 확인 후 성공한 업무 operation으로만 갱신한다. readReceipt/heartbeat/preload/health/임의 activity flag는 갱신하지 않고8시간절대deadline은 유지한다. 실제 API/BFF에서 이 정책을 연결·시험해야 한다.
- SDK concrete adapter는 AWS Cognito/SQS3.1147.0·maxAttempts1을 사용한다. password-only 인증을 MFA로 승격하지 않고, Cognito 실제 응답 requestId/subject/audience·검증단계를 ProviderVerificationEvidence로 독립 보호한다. 최초 비밀번호 변경 및 provider 제거/격리·관측 지원의 미등록 phase는 성공이 아닌 준비 오류다. 실제 pool/회사망 시험을 대역 시험으로 대신하지 않는다.
- 공유 retry/circuit은 ExternalAttempt/EndpointCircuit 원본과 독립 보호를 사용한다. attemptCount는 호출 전에 보호한 실행 예산이며 그 자체가 실제 외부 효과 성공/실제 전송수의 증거는 아니다. UNKNOWN·진행불명은 원래 제공자 결과 대조 전 재송신하지 않는다. SDK/broker의 실제 경로 연결·DLQ/전역probe/늦은 결과 시험이 남아 있다.
- 복구는 append권한을 차단하고 REPEATABLE READ의 고정 prefix를 전수 두 번 순회한다. epoch25개/entry1개 keyset을 사용하며 한 자료4MiB, 보고서ID샘플64개다. 전수 manifest digest와 선택적 VERIFIED/REPLAYED metadata observer를 제공한다. 누락/손상/재생 실패는 writer/auth fence를 유지한다.100k자료의 실제복구시간/메모리·합법파기 및 외부효과 대조는 미검증이다.
- 로컬 실제DB·합성 provider/기업profile만으로 운영 TLS/국내저장/실제 신원·위임·가용성/복구목표를 충족했다고 표시하지 않는다. 현재 변경에는 사용자 상태/전역 hook/승인질문/일지를 직접 수정하지 않았다.

### 공개 인증·HTTP 준비 증거

- 공개 `LoginInput`에는 `loginIdentifier`만 받는다. `startLogin`은 암호화된 공유 PG의 PASSWORD 목적 challenge를 만들고, canonical `ChallengeInput.response`로 password를 확인한다. 성공 뒤 서버 브라우저 결합을 회전한 별도 MFA challenge를 만든다. 현재 host/audience·브라우저 결합이 다른 요청과 이전 결합은 challenge를 사용할 수 없다.
- `IdentityBrowser`의 ALS 문맥은 HTTP 서버가 Host·Origin·서버 서명 browser cookie·CSRF를 확인한 뒤 설정한다. 클라이언트 principal/MFA/망 header는 권위가 없고 명시적으로 거절한다. 운영에서는 서버 문맥 없는 합성 결합을 허용하지 않는다.
- C01 v2에는 `prepareMfa`, `verifyMfaEnrolment`, `issueRecoveryCodes`, `acknowledgeRecoveryCodes`의 purpose-limited 입력/출력·CHALLENGE target을 명시 등록했다. MFA secret/복구 코드 원문은 이 transient 응답에만 있고 Receipt/업무/Outbox/복구 원장에 복제하지 않는다. 기존 C01 v1 snapshot은 유지한다. 전체 U2 등록/실제 수단 제거 대조는 완료가 아니다.
- host-bound `__Host-oms-customer`/`__Host-oms-staff`는 별도 audience의 Secure/HttpOnly/SameSite=Strict cookie다. 현재 세션에 묶인 CSRF와 정확한 Origin을 업무 변경에 적용한다. JSON에는 opaque session token을 반환하지 않는다. password 단계 및 최종 MFA에서 브라우저 결합을 회전하고 로그아웃/idle/8시간·현재 binding/회수/epoch 판단은 서버 원본을 따른다.
- 실제 Nest Express 통합 HTTP와 canonical owner registry를 연결했다. GET5초/POST10초의 단일 ExecutionBudget을 owner/SDK/DB로 전달하며 client disconnect는 같은 abort 문맥에 연결한다. 단순 응답 race만으로 SDK/후속 쓰기를 계속하지 않는다. 전체 지연/응답 유실/재시작 및 실환경 증거는 추가 검증 대상이다.
- 실제 회사 IT 신뢰 전달·인증서·회사 사설 접점은 아직 준비되지 않았다. 운영 `staffAdmission`은 승인된 실제 신뢰 연결 없이는 거절해야 한다. tests/u1의 loopback 합성 접점을 실제 직원망/PC 증거로 사용할 수 없다. 공용 고객 접점에 직원 operation을 등록하지 않는다.

### 최소 조회·조직/소속 확장

- 상품 C00 v2 `ProductView.commonPrice`는 등록된 공통 가격이다. `resolvedPrice=null`/`priceKnowledge=UNKNOWN`인 기업 적용 가격과 구별하며 계약/예외 포트 미등록을 확인된 가격으로 바꾸지 않는다. v1 snapshot은 변경하지 않았다.
- C00 v2 `EnterpriseView.orderingContextPolicy`는 원래 `UNSET`과 명시된 `USED`/`NOT_USED`를 구별한다. 조직 목록은25/100 keyset 페이지이며 `sectionCursors`가 각 조직 페이지의 남은 부분을 나타낸다. 이는 조직 등록 총량이나 주문 항목의 새로운 사업 제한이 아니다.
- 현재 본인 소속/행위 문맥은 CE01 v2 `readCustomerContexts`로 제공한다. 별도 최초 관리자와 거래 전용 구매자는 자기 신청·organisation.manage 없이 기업과 허용 주문 문맥을 선택한다. 관리 투영은 organisation.manage/role.manage/user.manage를 각각 확인하고 역할·담당자 directory를 해당 행위에만 제공한다. 선택은 거래 grant를 만들지 않으며 변경 시 서버가 현재 target을 다시 확인한다. U8/U9 전체 화면 완성과 실제 회사 접근 검증은 별도다.
- 기업 관리·역할·조직 경로는 현재 주체의 대상 기업 관계를 먼저 확인한다. 관계 밖의 실제 기업과 존재하지 않는 기업은 같은 비노출404다. 주문 경로의 기업 이용 준비 미완료403 설명은 유지한다. 외부 판단 owner는 현재 `order.submit` 확인 뒤에만 호출하고, 커밋 때 현재 권한을 다시 확인한다.
- 조직 CREATE/UPDATE는 안정 ID·현재 기업/조직 개정과 같은 기업 parent를 대조하고 Enterprise 조직 평가 개정을 함께 올린다. 비활성화로 과거 주문 조직/판매/접수를 재작성하거나 원본을 삭제하지 않는다.
- 소속 변경은 현재 `user.manage`·계정/고객 binding·동일인/기업 관계 확인을 필요로 한다. 관리자 부여에는 별도 위임 확인을 적용하고 거래 grant를 자동 부여하지 않는다. 회수는 추가 외부 확인을 기다리지 않고 원래 개정으로 적용한다. 관리자0명 상태는 원본/이력에 기록하며 다른 구성원의 유효 거래 권한을 자동 중지하지 않는다. 실제 기업/관계 수용 기준의 준비 차단은 유지한다.

## 추가 실행 근거: 원래 요청·최소 이력·진단

HTTP 원래 요청 metadata buffer는 current principal/audience/owner/operation/target/key/epoch별로 1000개까지 유한 보관한다. 완료 Receipt가 있는 시도는 원래 접수로 대조하며, primary-atomic 종료가 확인된 명시적 업무 거절만 미접수 후보로 인정한다. REJECTED 관찰15분 경과는 증거 부재로 돌아가며 미접수로 추정하지 않는다. 진행/기술 결과불명은 자동 만료·새키 재전송으로 해소하지 않고 공간이 차면503으로 추가 접수를 차단한다. 브라우저는 비밀·업무 원문 없이 원래 참조만 검증된 계정 namespace/sessionStorage에 보관하고, NOT_ACCEPTED도 명시적 입력/권한 검토와 새 의도 선택을 요구한다. 성공/원래 Receipt 확인된 주문 초안은 재제출 잠금과 명시적 새 주문 작성으로 구분한다.

최소 이력 readRecordHistory/readHistory는 현재 원본별 직원 행위 또는 고객 원래 주문 범위를 대조하고 SQL 대상 필터를 적용한25/100 keyset 페이지를 반환한다. 후속 재무/라이선스 원본 우회·타기업·현재 grant 회수는 허용하지 않는다. 고객/판단 권한 없는 직원의 주문 이력은 내부 판단 근거/결과 참조를 축소한다. 이력 자체는 쓰기/정정 업무가 아니다.

C19 OwnerDiagnostics는 별도 읽기 DB 역할과 metadata-only security-barrier view에 대한 현재 ACL, 명시 server-side owner profile, 원래 접수/기간을 확인한다. 저장 Receipt를 ACK로 변환하지 않으며 독립 ACK source가 없거나 epoch/효과/파기/정정 독립 증거가 없으면 PARTIAL/UNAVAILABLE와 누락 사유를 반환한다. 실제 운영 identity·company/operator profile과 독립 observer·export 보관 정책은 실제 운영 진단 활성화 전에 확인해야 한다. 합성 역할 검증은 실제 운영 접근 승인 증거가 아니다.

## 합성 CDK 기반과 실제 적용 경계

AWS 공식 2026-08-25 공지가 RDS PostgreSQL17.11 지원을 확인한다: https://aws.amazon.com/about-aws/whats-new/2026/08/amazon-rds-postgresql-18-6-17-11-16-15-15-19-14-24/ . CDK2.272.0의 명명 constant는17.9까지여서 공식 지원17.11을 PostgresEngineVersion.of('17.11','17')로 명시했다. 실제 서울 account/AZ별 제공·quota/instance/pool 검증은 아직 수행하지 않았다. Fargate CPU/memory 후보는 공식 표와 대조했다: https://docs.aws.amazon.com/AmazonECS/latest/developerguide/fargate-tasks-services.html . TCP443/8443 NLB는 공식 TLS 통과 설명에 따른다: https://docs.aws.amazon.com/elasticloadbalancing/latest/network/load-balancer-listeners.html .

현재 Infra profile은 account000000000000·합성AZ명/CIDR·placeholder image digest로 offline synth 전용이다. 실제 deploy profile을 통과시키지 않는다. 4role min1/max2·rolling100/200·DB pool72/100, UI0.25vCPU/512MiB와API/worker0.5vCPU/1024MiB, 두 Single-AZ db.t4g.small/각20GiB/gp3는 합성 구성을 검증하는 후보다. 보관7일/queue4일/DLQ14일은 합성 기술 자료 후보로서 실제 법/기업 보관 정책이 아니다. 실제 용량/비용/기간·image/schema identity·TLS export/회전·DB 제한 역할·직원 회사망·알림 수신/operator profile 확인 전에 활성화하지 않는다.

## 2026-10-09 구현 회귀 관찰(최종 전체 통과 아님)

- 본인 문맥·관리 facet·기업/업무 실제 PG 회귀52/52, PC 신청자 관리자/별도 관리자·일반 구매자/role.manage 단독/user.manage 단독4/4를 실행했다. 실제 운영 IAM·사람/기업·회사망 증거로 사용하지 않는다.
- payload 복구는 고정 journal snapshot을 전수 검증한 뒤 writer/auth fence 아래 초기 clear commit, 각 원래 payload atomic commit, 마지막 guarded epoch/enable 순서다. 단일 전체원장 transaction은 사용하지 않는다. 실패/부분 replay에서는 writer/auth 차단을 유지하고 같은 원래 journal로 재시작한다. 실제100k/SIGKILL/5647+최종ACK 대조·30분RTO는 최종 검사에 남아 있다.
- 전체 unit/integration52개 파일474시험의 중간 coverage는 직접 작성 미실행 파일 포함 line85.92%였다. 이후 배포 제어 소스 추가/format·나머지 시험/이미지 변경이 있으므로 최종 source 분모·검사는 다시 실행한다.

브라우저 인증 의도는 primary의 별도 임시 digest metadata 표(전체2000행·challenge5분·계보/session8시간)로 replica 간 공유한다. 새 로그인 시작은 해당 브라우저 계보만 supersede하고, password challenge·회전 alias·MFA 결과·쿠키 발행 직전 세대를 대조한다. 같은 계보의 이전 session-token은 새 세대의 HTTP 인증에 쓰지 못한다. 다른 브라우저의 독립 세션은 일괄 폐기하지 않는다. metadata에는 credential/token 원문·Account·권한을 넣지 않고 복구 시 폐기한다. 헤더 발행 전 지연은 쿠키를 보내지 않으며, 이미 전송된 헤더의 네트워크 지연은 회수할 수 없어 이전 쿠키가 덮인 브라우저에는 재인증을 요구한다. 옛 Account로 되돌아가지는 않는다. 실제 HTTP/PG 회귀는 이 두 경계를 별도로 확인한다.

2026-10-09 로컬 PG에서는 기존 인증의 유효 ROOT104/BROWSER312/SESSION104=520행과 만료 CHALLENGE200행을 확인했다. 현재 행은 평균191byte/최대192byte, 전체720행과 index는270,336byte였다. 기존 fence를 삭제하지 않고100개의 새로운 독립 브라우저 인증을 준비하면 회전alias·session·5분challenge가 최대700행 추가되어1220행이 필요하다. 기술 후보cap을1000에서 유한2000으로 조정하며8시간fence·5분challenge·세션 idle/절대deadline·MFA·인증요청 rate·권한 정책은 유지한다. 별도의 암호화된 provider challenge1000개 및 원래 HTTP시도1000개 한도는 변경하지 않는다. 실제 환경 용량/공격·비용 검증은 여전히 활성화 조건이다.
