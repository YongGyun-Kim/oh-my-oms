# U2 기술·호스트 품질 요구사항

**Unit:** u2-identity-enterprise-access

## 범위와 선정 의미

U2는 이미 선택한 모듈화된 API/별도 worker와 고객/직원 BFF의 신원·기업 접근 소유자 코드를 확장한다. 새 독립 서비스/클러스터·AWS 계정·인증 제공자를 이 단계에서 추가 선정하지 않는다. library/embedded이므로 성능/가용성/복구/관측의 독립 문서를 만들지 않고 관련 호스트 조건을 아래 NFR ID로 연결한다. 단위 종류가 보안/접수 보호/정확성·실제 검증의 면제를 뜻하지 않는다.

각 NFRx.y는 [상위 requirements.md](../../../inception/requirements-analysis/requirements.md)의 NFRx를 상속한다. 접근/정확성·자료/보안 검사는 [security-requirements.md](security-requirements.md)에 정의한다. 표의 OK 연결은 요구 정의이며 실계정/배포/성능/복구·1인 운영 목표 달성 사실이 아니다.

## 요구사항과 수락 기준

| ID | 요구사항 | 수락 기준·확인 조건 | 구현/검증 책임 | 근거 |
|---|---|---|---|---|
| NFR2.1 | 계획 중단 포함 연속30일 가용성99.9%와 핵심 업무별 측정을 유지한다. | U2가 영향 주는 고객 로그인/허용 주문 조회·접수 및 허용 직원 조회/판단의 실패를 다른 성공으로 상쇄하지 않는다. 정상 권한 거절과 허용 업무 실패를 구별하고 제공자 장기 중단도 실제 가용성에 집계한다. | 호스트/U10가 전체 측정, U2가 원인/결과 근거 제공 | NFR2; 기존 U1 가용성 결정 |
| NFR3.1 | 기본 앱/worker·저장/전환·배포 실패·논리 손상/오삭제와 단일 AZ 일시 장애의 핵심 업무30분 복구 목표를 유지한다. | 발생→감지/판단/복원/현재 보안/성공 접수 검증까지 포함한다. 복구 뒤 현재 권한/신원·단회 소비·업무 정확성을 함께 비교한다. 센터 물리 소실 및 리전/필수 외부 장기 중단의30분 재개는 기존 명시 한계로 남긴다. | U2 원본/검증·U1 보호 기반·Infra/U10 | NFR3; 기존 U1 Q1 |
| NFR3.2 | 인증 제공자 장애/불명·제한 허가 회수/새 연결 전환은 안전한 보류와 현재 원본 재검증으로 복구한다. | 제공자 요청 수락/회로 probe 성공을 실제 MFA/수단 변경/복구 완료로 표시하지 않는다. 원래 작업/기한·늦은 결과/새 수단 격리·old binding/session 거절을 대조하며 값이 없으면 실행 불가다. | U2 adapter/상세 설계·호스트 | FR16.2; BR5.4–5.6; NFR4 |
| NFR6.1 | 정상 승인 부하에서 조회p95≤1초·변경p95≤2초·유효 요청 기술 오류율≤0.1%를 유지한다. | 브라우저/클라이언트 송신부터 응답 본문 수신까지 동기 provider/권한/업무 원본·보호 기록을 포함한다. 접수 응답과 실제 재등록/초대/통지 완료를 구별한다. 최초 실패·잘못된 업무 거절/과부하 거절을 재시도로 숨기지 않는다. | U2 요청 구성·호스트/U10 실제 부하 검증 | NFR6; 기존 성능/정확성 기준 |
| NFR6.2 | 조회5초·변경10초의 HTTP 전체 대기 예산 및 정상 내부 실행 가능 작업 첫 시작p95≤10초를 유지한다. | 단계/재시도마다 예산을 초기화하지 않는다. 비밀번호/MFA 입력·사람 본인 확인/업무 검토 기간은 단일 HTTP/worker 실행 기한과 구분한다. 개별 작업30초·안전 재시도 최초+추가3회/첫 시도부터5분 및 원래 기한/현재 허가를 지키고 불명 결과는 원래 작업 대조부터 한다. | U2·호스트/relay/worker·각 adapter | 기존 U1 Q14/Q29/Q30; G09 |
| NFR7.1 | 기존 합성 규모·정상/집중/회복 시험 조건을 유지하며 U2 경로 구성을 명시한다. | 기업100/고객계정1000/내부시험10, 상품10000/주문100000/평균5품목·기존시험 최대50을 합성 기준으로 유지한다. 활동 세션100·20req/s30분·80%읽기/20%변경,100req/s5분 후20req/s로5분 내 회복/10분 유지. U2 신원/권한/초대/복구 호출·공통 호스트/worker·자료 분포와 최초 실패를 별도 기록한다. | U2 profile·호스트/U10 | NFR7; 상위 합성 기준; 실제 한도/수요 아님 |
| NFR7.2 | 대량 역할/소속/초대·공개 인증·제한 인계의 자원 사용은 유한 설정/대기·현재 권한으로 제한한다. | 계정/네트워크/전역·대상별 시도·동시성·payload/배열·page/cursor·DB/보호 기록/암호 검증의 상한·취소/회수·고갈 거절을 코드 전에 명시한다. 일반 목록 기본25/최대100건을 유지하고 이를 총 담당자/역할/기업 수 한도로 전용하지 않는다. 권한/보호를 끄고 과부하를 통과하지 않는다. | U2 상세 설계/호스트·성능 검증 | NFR7; 기존 U1 Q32; NFR1/NFR5 |
| NFR8.1 | 기존 계획 점검 시간/중단·안내와 전체 가용성 집계를 유지한다. | 한국 평일20:00–22:00, 회당≤10분/30일 누적≤20분·최소24시간 전 화면/기업 지정 이메일 안내. U2 schema/profile/세대 전환 실패는 배포 중단·복구/지연 안내로 연결하며30분RTO로 점검 한도를 연장하지 않는다. | 배포/호스트·U7/U8/U9·U10, U2 호환/복구 근거 | NFR8; 기존 점검 결정 |
| NFR9.1 | 1인 정상 기술 운영 반복 작업≤30분/일·일반 배포 사람 작업≤15분/회와 대표 한 사람 복구≤30분을 유지한다. | 실제 손 작업/자동 대기·총 경과/빈도·미해결 누적과 판매/신원 확인 업무를 구별한다. 합성/문서로 실제 운영 달성을 주장하지 않고 초과 시 구조/자동화 개선 후 검증한다. | U2 절차/자동화와 U10 실제 운영 | NFR9; 기존 인력/운영 원칙 |
| NFR9.2 | U2는 기존 API/별도 worker에서 공유하는 TypeScript 업무 모듈이며 기존 기술을 유지한다. | NestJS+Express API/Nest standalone worker·고객/직원 Next BFF·TypeORM/PostgreSQL·Outbox+SQS Standard·독립 보호 DB·AWS/CDK 단일계정을 확장한다. 코드/계약/현재 권한은 소유자별 동일 규칙이며 독립 인증 microservice나 관리 UI/단말 시스템을 새로 요구하지 않는다. | U2·공통 호스트/registry·Infra | 기존 사용자 기술 선택; Unit library/embedded |
| NFR9.3 | 비공개 초기/비상 준비와 실제 업무 권한/승인자의 책임은 분리한다. | 초기 직원 신원은 기존 Cognito 콘솔·최소 OMS grant 보호 절차를 따른다. 개발자1을 기업/신원 확인자·계약의 다른 승인자 확보로 가정하지 않는다. 비상 복구는 원래 정당한 계정/권한 재검증이며 상시 공유 관리자·영구 MFA 해제를 만들지 않는다. | U2·실제 운영/업무 확인자 | 기존 U1 Q24/Q24-F1; 기능 Q3 |
| NFR10.1 | 자동 복구 시도 시작부터 기존 Slack/이메일의 개발자 통지와 실패/수동 필요 긴급 통지를 유지한다. | U2/인증 장애로 OMS 정상 경로가 막혀도 기존 독립 통지 조건을 대조한다. 시도/관측·허가/인계·보류/현재 재개·완료/전달의 실제 근거를 최소 metadata로 연결하고 발송 요청을 수신/명시 확인/복구 완료로 표시하지 않는다. 새 메신저/수신자를 선정하지 않는다. | 호스트/Infra/U10, U2 원인/상태 근거 | NFR10; 기존 Slack·이메일/관측 결정 |
| NFR12.1 | 한국어/KRW/한국 시각과 고객/직원 PC1280+·고객 모바일 추후/직원 모바일 제외를 유지한다. | 초대/복구/보류/남은 조치·역할/범위·세션 만료는 허용 정보로 표현한다. 단말 폭을 보안 증거로 쓰지 않고 영어(미국) 방향이 USD/해외 저장/미국 출시를 자동 승인하지 않는다. | U2 상태/접점·U8/U9 실제 UI | NFR12; 최신 PC/언어 결정 |
| NFR12.2 | 기존 WCAG2.2 AA 목표와 고객 Chrome/Edge/Safari/Firefox·직원 Chrome/Edge의 출시 최신/직전 안정 버전 검증을 유지한다. | label/키보드/focus·색 외 상태/오류·만료/재인증/복구·PC 확대/reflow를 실제 UI에서 확인한다. U2 요구 문서를 UI 적합성 인증/전체 화면 통과로 표시하지 않는다. | U2 결과/입력 계약·U8/U9/품질 | NFR12; 기존 Refined Mockups/U1 |
| NFR13.1 | 닫힌 C01/C02/C21/E01과 CE-U2-01–07의 profile/목적·target·입출력/오류·version을 실행 중 검증한다. | TypeScript/Nest 타입만으로 canonical schema/현재 권한을 대신하지 않는다. 초대/복구의 제한 target/challenge·허가 인계/단회·관리자 근거·원래 receipt/knowledge 형식을 producer/consumer·버전 병행/되돌림과 함께 명시/등록·negative fixture 검증 후 활성화한다. | U2·호스트/공통 registry·U7/U8/U9 | NFR13; G19/G22/G23; 기능 CE-U2-01–07 |
| NFR13.2 | 기존 유효 scope/소속·계정/원래 문맥·대기 자료와 새 표현의 호환을 손실 없이 검증한다. | U1 SITE_ALL_DEPARTMENTS의 여러 사업장·DEPARTMENT_ALL_SITES의 여러 부서 ID는 같은 행위의 개별 완성 술어로 분해해 허용 집합을 보존한다. 거절은 의미 미확인·정책/개정 누락·모호한 쌍/곱집합에 한정한다. 구/신 소비자·role/grant 세대·초대/복구/옛 외부 작업·rollback에서 접근 확대/누락·소비/회수 부활0. | U2 상세 호환 매핑/차분 시험·호스트 | G03/G04; 기능 설계 R-03; NFR1/NFR5 |
| NFR13.3 | test-after·Standard 단위/통합과 제품 코드 라인 커버리지≥80%·로컬/CI 같은 필수 검사를 유지한다. | 직접 작성한 테스트 가능한 제품 파일의 미실행도 분모 포함, 제외는 근거 기록. 주 책임26AC·협력/품질·보완별 정상/거절/경계/동시/재시작·복구·형식/권한/인계·호환 시험을 별도 연결한다. 미실행/보고서 누락·flaky 우연 통과/하한 완화로 통과하지 않는다. | U2·Build and Test·기존 CI | NFR13/NFR14; 팀 Testing Posture |

## 유지하는 기술 선택과 이유

| 경계 | 기존 선택 | U2 적용과 검증할 영향 |
|---|---|---|
| 언어/실행 | TypeScript·Node.js | 기존 공통 계약/호스트/업무 모듈과 같은 도구 체계를 사용한다. 정적 타입은 실행 중 입력/현재 권한 검증을 대신하지 않는다. 실제 유지보수/운영 부담은 측정 대상이다. |
| API / worker | NestJS+Express API / Nest standalone worker | IdentityRecovery/EnterpriseAccess 규칙을 공유하며 HTTP 객체/Guard 자동 실행에 의존하지 않는다. 목적/원본/실행 허가·예상 개정·기한·실패는 양쪽 진입점에 명시한다. |
| 고객/직원 접점 | Next.js App Router+React+TypeScript, 별도 BFF/배포 경계 | 업무 원본·인증/권한 최종 판단은 owner에 둔다. 요청별 필요한 조회/세션·origin/CSRF·비밀/cache·직원 사설 ingress 조건을 보존한다. 공개 고객 경로로 직원/비상 절차를 연결하지 않는다. |
| 원본/DB 접근 | PostgreSQL·TypeORM 위주 | 기존 같은 transaction·예상 개정/lock·현재 상태/조회와 보호 변경을 확장한다. ORM 저장만으로 권한/멱등성·RPO0/복구·실효 내구를 충족했다고 주장하지 않는다. 실제 모델/driver/조회·validator/지원 조합을 대조한다. |
| 비동기 | Transactional Outbox+SQS Standard·consumer/소유자별 필요한 queue/DLQ | 같은 원래 work/operation/consumer·현재 허가/입력·기한/누적 시도·실제 효과를 대조한다. 중복/역순/누락·수신 불명·redrive는 전달 성공 또는 업무 완료와 구별한다. 큐 분리를 도메인별 network service로 확대하지 않는다. |
| 성공 접수/논리 복구 보호 | 업무 원본과 별도 보호된 독립 DB 복구 원장 | 복구 원장은 업무 DB의 단순 복제본/다른 스키마로 대체하지 않는다. 원래 payload/순서·소속/역할/회수·코드/허가 상태·현재 보안 세대/이력·정정/파기를 실제 보호/복구 시험에 연결한다. |
| 인증 제공자 | 첫 Cognito 고객 공용/직원 전용 pool 분리·자체 화면/서버 adapter, 출시 후 Keycloak 계획 | 안정 Account와 외부 issuer/subject/audience·binding 세대·실제 MFA/복구 지원/현재 권한을 분리한다. 제공자 group/token/email로 사람/기업·역할을 자동 합치지 않고 전환/회수/되돌림·목적/옛 작업 격리를 검증한다. 실제 계정/자격·전환 시점/credential 이동은 미확인이다. |
| AWS/IaC | 단일 AWS 계정·CDK | 기존 환경/업무 DB·보호 원장/비밀·IAM/배포/복구 역할과 사설 직원 접점 경계를 계정 안에서 유지한다. 추가 AWS 계정·단말 등록/인증서/MDM/NAC 기능을 요구하지 않는다. 실제 지역/권한/서비스·국내 경로/비용/실증은 별도 확인한다. |
| 관측/장애 통지 | CloudWatch 중심·OpenTelemetry 계측, 기존 Slack/이메일 | 등록 요청/worker trace100% 대상·실제 누락/자원/비용·최소 metadata/국내 저장을 검증한다. 업무 이력/보호 원장을 trace로 대체하지 않는다. 자동 시도부터 독립 통지·실제 수신/명시 확인·실패/수동 필요를 기존 기준으로 연결한다. |
| 검사/호환 | 기존 formatter/linter/type/canonical schema·단위/통합/보안/이미지/인프라 검사 | 관련 공통 계약/모델·adapter/호스트·설정/회수·복구·전환 영향과 exact versions/lockfile을 명시한다. 이미 고정한 기술을 최신 후보로 다시 선정하지 않는다. 새 의존성 필요 시 지원/보안·등록/호환 근거를 먼저 확보한다. |

선정은 기존 사용자 답변을 상속한 것이다. 환경 또는 실제 provider 준비가 없으면 합성 profile/격리 실행으로 구조/경계를 검증하고 실제 capability/신원/회사망·국내 저장/성능/운영 준비는 미확인으로 남긴다. 과거 U1 보고서/고정 측정 원본을 새 U2 소스의 실적으로 다시 표기하지 않는다.

## 상세 설계·구현 전 확인 항목

| ID | 필요한 원본/값·검증 | 책임 / 적용 전 차단 조건 |
|---|---|---|
| U2-ND01 | 제한 허가/세션의 실제 당사자·원래 target/challenge·계정/binding/security 세대·확인 결정/근거·목적/기한 결합과 안전한 인계/청구·단회/회수/재시도 모델 | U2 IdentityRecovery. NFR1.12를 충족하는 명시적 상태/원본/전달·negative/동시/복구 검증 없이 관련 접점을 활성화하지 않는다. |
| U2-ND02 | 비공개 비상 권위/본인 확인·관리자 위임의 인정 정책/현재성, HOLD 재개/종료·새 원본/옛 효과 연결 | U2와 실제 업무/보안/운영 확인자. NFR1.16/5.2. 실제 근거/자격·provider 지원 미확인은 실행 불가이며 합성 proof를 실계정에 쓰지 않는다. |
| U2-ND03 | 초대 발급/기한7일·token/verifier/연락 경로·재발송/회수/예정 역할·소속 개정·현재 권한/원자 수락·한도/상태·안전 전달 | U2/U7/호스트. NFR1.10/1.13·유한 시도/자원 설정·경계/동시/비밀/전달 검증 전 관련 구현을 완료로 표시하지 않는다. |
| U2-ND04 | 기존 scope의 실제 버전/정책·개정과 새 닫힌 selector/profile의 손실 없는 분해, 현재 grant/역할 영향·권한 개정/회수/원래 주문 문맥 | U2 EnterpriseAccess. NFR1.3/1.14/1.15/13.2. 서울/부산 등 기존 유효 다중 ID의 전후 허용 집합 동일·과거 문맥/rollback proof가 필요하다. |
| U2-ND05 | CE-U2-01–07의 닫힌 입출력/목적·target·등록/원래 receipt/knowledge, 기존 호스트/provider/consumer·schema/이미지/모델/새 migration 영향 | U2·호스트/공통 registry. NFR13.1–13.3. 원래 계약/완료 기록을 수정해 등록된 것처럼 표시하지 않고 explicit profile/compatibility 시험 후 적용한다. |
| U2-ND06 | 신원·허가/코드·grant/회수·접수/이력의 실제 보호/복구 mapping·현재 상태/세대·기한·자료 수명/정정/파기 | U2·기존 보호 DB/복구/Infra. NFR4/11. 관련 모델/코드/실자료 적용 전 실제 원장/권한/내구·원본 비교·부활 방지/지역 경로를 검증한다. |
| U2-ND07 | 실제 U2 부하/호스트·auth/조직/역할 자료·bounded query/암호 검증/전달·profile/시계·응답/비동기/현재 권한·시험 분모/보안 보고서 | U2·품질/U10. NFR6/7/9/13/14. 사용자 합성 규모를 사업 한도로 전용하지 않고 기존 성능/정확성 기준과 현재 소스의 실제 증거를 연결한다. |

U2-ND01/02/04는 기능 설계 보완의 후속 조건이다. 요구를 기록한 현재 단계와, 상세 설계가 원본/전이를 명시한 상태와, 실제 구현/검증으로 해소한 상태를 구별한다. 이전 검토 기록/상태를 소급 바꾸거나 위험 수용을 추론하지 않는다.

## 인계와 완료 책임

NFR Design은43개 하위 ID의 패턴/원본·수명·현재 권위/실패/검증 조건을 정의한다. Infrastructure Design은 library가 공유할 호스트/국내 저장·실제 직원 접점/서비스 자격·보호/관측/복구와 비용/운영을 대조한다. Code Generation은 현재 소스/새 profile·모델/호스트/adapter 변경을 명시하고 필수 선행조건을 해소한 뒤 구현한다. Build and Test는 관련 실제 단위/통합/접점·동시/부정·복구·호환/보안/커버리지 결과를 기록한다.

전체 UI/수신/실계정·실제 회사망/법적 적합성·30일 가용성/야간/1인 운영 실증은 해당 협력 단위/실환경의 근거가 필요하다. 라이브러리 단위의 문서 또는 이전 소스의 시험은 그것을 대신하지 않는다. 성공 접수/현재 보안 상태·접근 위반0의 필수 조건을 이 협력 구분으로 미루거나 줄이지 않는다.

## Sources

- S1: [functional-spec.md](../functional-design/functional-spec.md) — U2 범위·WF01–WF09·CE-U2-01–07·상태/추가 profile·U2-OQ.
- S2: [rules.md](../functional-design/rules.md) — BR1.1–BR7.5·현재 권한/목적·행위별 범위·복구·접수/이력.
- S3: [requirements.md](../../../inception/requirements-analysis/requirements.md) — NFR1–NFR14·8정확성·합성 부하·보존/복구/운영 목표.
- S4: [contract-summary.md](../../../inception/contract-design/contract-summary.md) — G01–G23·C01/C02/C16/C17/C21/C20-E01·닫힌 입력/출력과 원래 기한/대상.
- S5: [nfr-requirements-questions.md](nfr-requirements-questions.md) — 초대7일과 별도 Looks correct; 기존 조건 보존.
- S6: [U1 보안 요구사항](../../u1-integrated-foundation/nfr-requirements/security-requirements.md), [U1 기술·품질 요구사항](../../u1-integrated-foundation/nfr-requirements/tech-stack-decisions.md), [U1 NFR 요구 답변](../../u1-integrated-foundation/nfr-requirements/nfr-requirements-questions.md) — 기존 정책/숫자·최신 PC 결정의 연결.
- S7: [U1 NFR 설계 답변](../../u1-integrated-foundation/nfr-design/nfr-design-questions.md) — Q1 BFF·Q2 Outbox·Q4/5/6/7 신원/수단·Q8/10 queue·Q12/13 직원 접점·Q14 시작·Q15 보호DB·Q23 TypeORM·Q24-F1 초기 직원·Q25 cache·Q26/27 관측·Q29/30 기한/재시도·Q32 page, [U1 구현 준비 답변](../../u1-integrated-foundation/code-generation/implementation-readiness-questions.md) — 복구 코드 정기 만료 없음.
- S8: [U1 인프라 답변](../../u1-integrated-foundation/infrastructure-design/infrastructure-design-questions.md) — 단일 AWS 계정·DB/보호/접점·이미 정한 Slack/이메일 및 실제 준비/비용/운영 한계.
- S9: [이전 기능 설계 검토](../functional-design/reviews/review-01.md) — 기능 설계 보완의 후속 요구/상세 설계·검증 조건. 이 문서의 요구 정의는 이전 검토의 상태/위험 수용/실행 결과를 바꾸지 않는다.

기술/운영 선택은 사용자 기록에서 상속하며 일반 보안 지침의 예시값을 새 의무·서비스/인원/계정 요구로 채택하지 않는다. 현 단계는 요구/문서 검증이며 실계정/실제 데이터·제공자/회사망·운영 가용성/복구 보장 근거를 새로 만들지 않는다.

