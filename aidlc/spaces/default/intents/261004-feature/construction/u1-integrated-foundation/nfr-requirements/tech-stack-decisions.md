# U1 기술 선정·개발 운영 요구사항

**Unit:** u1-integrated-foundation

## 범위와 판정 의미

U1은 최소 신원/기업 신청·승인/최초 관리자·현재 권한·직원 상품 등록·타입별 주문 접수/전체 확인 대기·지속 기록/worker·최소 고객/직원 UI와 진행 조회를 연결하는 첫 기반이다. 금융·HW·SW 전체 이행, 전체 U8/U9 화면과 U10 실운영 측정은 해당 소유 단위에서 확장한다. 미등록 공급자와 미확인 가격/계약/공급·외부 결과를 실제 가능/완료로 바꾸지 않는다. U1의 최소 MFA/망/권한·접수 보존·실행 준비를 후속 단위까지 미룬다는 뜻은 아니다. [S1–S4]

이 문서는 사용자 확인된 기준과 상위 계약에서 파생한 요구사항이다. 문서/trace의 OK는 정의 연결이고 코드·보안·성능·복구·접근성·국내 저장·상용 준비 통과가 아니다. 각 행의 NFRx.y는 S3의 NFRx를 상속하며 같은 ID의 정의 원본은 아래 표다. 요구사항 수치와 정책은 S5의 사용자 답변/요약 확인을 우선한다. 원본 기능/계약과 과거 검토 기록은 수정하지 않는다.

## 요구사항과 수락 기준

| ID | 요구사항 | 수락 기준·확인 조건 | 구현/검증 책임과 범위 | 근거 |
|---|---|---|---|---|
| NFR9.1 | 정상일 반복 기술 운영 사람 작업은≤30분/일이다. | 작업 종류·실제 손 작업 시간·자동 대기·경과·빈도/미해결 누적·판매 업무를 각각 기록한다. 실제 정상 부하에서 미검증이고 초과하면 구조/자동화 개선 후 재검증한다. 기능/승인 정책을 자동 축소하지 않는다. | U1 자동화 진입·U10 실제 운영 | NFR9; Q3–Q6 |
| NFR9.2 | 일반 배포 사람 작업은≤15분/회다. | main 짧은 branch·squash/self review·merge staging 자동·prod 수동 승인과 필수 검사/보고서 차단을 유지한다. 자동 대기와 총 경과를 사람 작업에 숨기지 않고 점검 중단 예산은 NFR8로 별도 대조한다. | U1 build/deploy 기반·CI/배포/U10 | NFR9; NFR13; 기존 운영 제약 |
| NFR9.3 | 대표 장애의 한 사람 복구 작업은≤30분이며 전체 RTO와 별도 기록한다. | 다른 사람의 숨은 수동 복구 없이 정상/야간·휴일 절차와 자동 시도부터 알림을 실증한다. 사람 작업·반응/대기·감지/복원·검증 경과를 분리한다. 기술 운영 인원1은 계약 등록자와 다른 승인자 확보를 면제하지 않는다. | U1 복구 인터페이스·Infra/U10·실제 업무 확인자 | NFR9; NFR3/NFR10; OQ10 |
| NFR9.4 | 선택한 스택은 공유된 업무 핵심과4개 배포 역할을 유지한다. | Next.js App Router+React+TypeScript 고객/직원 UI, Node.js/TypeScript+NestJS+Express API, Nest standalone worker, PostgreSQL, AWS+TypeScript CDK다. framework 선택으로 도메인별 microservice나 broker를 추가하지 않고 업무 소유자의 단일 쓰기 권위와 handler 등록을 유지한다. | U1 기반·모든 확장 Unit; Q3–Q6 | NFR9; FD 실행 역할; Q3–Q6 |
| NFR12.1 | 첫 제품은 한국어·KRW·한국 시각이며 영어(미국) 확장 방향을 보존한다. | 명시적 locale/currency/timezone과 거래 당시 금액/기간의 원본을 사용한다. 정확한10진 문자열 Money를 이진float으로 왕복/계산해 변형하지 않고 날짜/종료 경계는 합의 ruleRef에 따른다. 영어 선택으로 USD/미국 출시/해외 저장을 승인하지 않는다. | U1 최소 화면/계약·U8/U9·각 업무 | NFR12; G13; Q3/Q5 |
| NFR12.2 | 고객/직원 화면은1280 CSS px 이상 PC를 대상으로 한다. | 직원 모바일 UI는 제공하지 않고 고객 모바일 지원 여부는 추후 결정한다.1280은 보안 판별/인증 우회 기준이 아니다. PC 확대/축소·키보드·reflow의 접근성 조건을 실제 화면에서 검증하며 가로폭만으로 데이터 보안을 주장하지 않는다. | U1 최소 화면·U8/U9 전체 UI | NFR12; 최신 mockup Q5; Q5 |
| NFR12.3 | 브라우저는 출시 시점 고객 Chrome/Edge/Safari/Firefox, 직원 Chrome/Edge의 최신·직전 안정 버전을 검증한다. | 실제 버전·OS/대표 PC 조건을 출시 검증 전에 확인하고 지정 흐름/오류/세션/새로고침을 시험한다. 현재 버전을 임의 고정하거나 고객 모바일 브라우저 지원을 승인됐다고 표시하지 않는다. | U1 최소·U8/U9·Build and Test | NFR12; 최신 mockup Q5 |
| NFR12.4 | WCAG2.2 AA는 전체 적용 가능한 업무 흐름의 설계/검증 목표다. | label·키보드·focus·상태/오류의 색 외 전달·세션 만료/재인증/복구를 자동/수동으로 확인한다.1280 PC 범위가 확대/reflow 검증을 면제하지 않는다. 목표 선택을 적합성 인증/달성으로 표시하지 않는다. | U1 최소·U8/U9 전체 흐름 | NFR12; mockup Q4–Q5 |
| NFR13.2 | test-after·Standard 단위/통합 시험과 제품 코드 라인 커버리지≥80%를 적용한다. | 작성한 테스트 가능한 제품 코드의 미실행 파일도 분모에 포함한다. 제외는 근거를 남기고 AC별 정상/실패/경계·계약/접수/권한/동시/복구 시험과 연결한다.80%만으로8영역 정확성/전체 수락 완료를 주장하지 않는다. | U1 작성 코드·각 확장 Unit/Build and Test | NFR13; NFR5 |
| NFR13.3 | 로컬/CI 같은 포매터·린터·타입/계약/필수 검사와 보고서를 사용한다. | 실패·미실행·보고서 누락이면 병합/배포 보류다. flaky 우연 통과·하한 완화로 완료하지 않는다. 실제 검증 명령/도구·분모/대상은 코드/CI 전 확정하며 존재하지 않는 제품 검사를 통과했다고 표시하지 않는다. | U1/CI·Build and Test; ND-OQ07 | NFR13; NFR14; OQ9 |
| NFR13.4 | 실제 버전/패키지는 지원·보안·계약 호환 근거를 확보해 고정한다. | Node/TS/Nest/Express/Next/React/CDK/PostgreSQL과 schema/DB adapter 조합을 code generation 전에 명시한다. exact versions·lockfile·지원 기간/운영 OS와 격리 시험을 기록한다. RDS/Aurora·broker·auth/mail·ORM·queue 라이브러리를 framework 선택에서 자동 선정하지 않는다. | U1/NFR Design·Infra; ND-OQ01–07 | NFR13; Q3–Q6 |
| NFR13.5 | UI/API/worker와 대기 원본의 호환 전환/되돌림을 검증한다. | C13–C18·CE01–04와 canonical schema/operation/error/version을 함께 갱신한다. breaking 변화는 새 version 병행·구/신 소비자/세션/대기 자료/복구 조건을 대조한 뒤 이전 종료한다. 변경 중 접수/작업/키 삭제를 금지한다. | U1 공통 등록·각 provider/consumer/배포 | NFR13; 계약 변경 규칙; FD CE01–04 |

## 최종 기술 선택과 대안의 해석

| 역할 | 사용자 선택 | 근거/대가·미선정 부분 |
|---|---|---|
| 공통 언어/서버 runtime | TypeScript 중심·Node.js | UI/API/worker/CDK 공통 생태계의 유지보수 이점은 가정; 정적 타입은 runtime 검증이 아님 |
| 고객/직원 UI | Next.js App Router + React + TypeScript | 사용자 Q5 B. SPA 제안은 비교 이력; 실제SSR/CSR/static·캐시·세션 전달·동적 경로/지역·지원 버전은 후속 확인 |
| API | NestJS + Express | 사용자 Q4 C. module/provider/DI와 HTTP adapter 구성; Fastify 권장은 채택 안 됨. 기존canonical schema/오류·현재 권한 연결을 실제 검증 |
| worker | Nest standalone context·별도 진입점 | HTTP server/Express 필수 아님. worker 수신/신뢰·business validation·현재 위임 권한/멱등·transaction은 명시 적용 |
| 거래 DB | PostgreSQL | 사용자 Q6 A. 원자transaction 기능은 근거지만 복구/내구·RPO0 실증을 대신하지 않음 |
| cloud/IaC | AWS + TypeScript CDK | 기존AWS/CDK+TS 방향. 실제지역/서비스/호스팅/DB·권한/비용/내구와 생성infra 검사는 후속 선정 |

Next와 Nest는 함께 사용한다. Next UI의 server 기능을 사용해도 주문/권한의 최종 권위·명령/조회 계약은 Nest의 업무 소유자다. 단일핵심의4배포 역할(고객UI/직원UI/API/worker)을 유지하며 framework 선택을 도메인별 network service·event sourcing·특정 queue/ORM로 확대하지 않는다. worker에 HTTP server를 붙이는 실제 health/관리 기능은 필요와 접근 경계를 확인한 후 선택한다.

## 구현 전 확인 항목과 책임

| ID | 아직 미확인인 선택/근거 | 담당 역할 | 해소 시점·차단 영향 |
|---|---|---|---|
| ND-OQ01 | actual identity/MFA·purpose/session cookie/origin·직원 network/PC·기업/첫 관리자/동일인 근거·초기 직원 grant·권한/organisationRevision 효력 | 개발/업무/보안 확인자·U1/U2/Infra | NFR/Infra 설계에서 구체화; 관련 승인/신원/접속 코드·실제 계정 처리 전에 원본/규칙/근거 확인. 합성fixture는 실제 확인의 대체가 아님 |
| ND-OQ02 | Next server/client/static 전략·Nest 세션 전달·민감HTML/RSC/캐시·동적 경로·배포/버전·화면 최초 표시 | 개발/설계·U1/U8/U9/Infra | U1 최소UI 코드 전 전략/동적경로/인증을 확인; 전체UI/실데이터·부하 전 해당 수치/지역/캐시 proof 확인 |
| ND-OQ03 | PostgreSQL atomic/내구 ack·키/consumer 수명·Work correlationId·권한/원본 개정 대응·전달/재시도/총deadline·장애별30분/RPO0·논리복구·물리 제외 | 개발/Infra·U1/각 owner/U10 | persistence/worker/복구 관련 코드 전 원본/매핑·동시/계약/배치 근거 확인; 실제 장애/상용 약속 전 동시 목표 실증 |
| ND-OQ04 | 기능별load/네트워크/필터·입출력/페이지·최초 표시/비동기완료·연결/자원/적체·scale/backpressure trigger/상한 | 개발/품질·U1/각 owner/U10 | 관련한도/timeout/scaling코드·성능시험 전에 profile/값을 고정.50품목/시험계정을 제품 한도로 전용하지 않음 |
| ND-OQ05 | 데이터분류·참조/키/원본/로그/백업 보관/정정/파기·실제 적용 의무·지역/제공자별 data path/키·비용 | 개발/업무/필요시준수·각 owner/Infra | provider/Infra선정·실데이터처리 전 확인. 실제의무·국내저장·암호화/복구달성 추측 금지 |
| ND-OQ06 | 실제monitors/probe/가용성산식/해상도·독립복구알림·2채널 provider/수신자·허용지연/재알림/미확인/수신/복구종결 | 개발/운영·Infra/U10 | 계측/알림설계·적용/운영시험 전 값/경로/30분 예산 확인. 발송 수락=실제 수신이라는 주장 금지 |
| ND-OQ07 | actual supported version matrix/lock·canonical2020-12검증·formatter/linter/type·제품verification command·test denominator·secret/SAST/deps/IaC/runtime검사 도구/차단선/주기/예외 | 개발/보안/품질·U1/CI/U10 | 지원조합/계약검증기를 Code Generation전 선정, 검사/CI/배포 전 해당대상·차단선/보고서·실제명령을 고정. 미확인/누락 보고서는 완료/배포 불가 |

확인 역할은 인력/제공자 확보 사실이 아니다. 담당 Unit은 현재 관련 요구를 구현/검증할 책임이지 전체 제품 기능을 앞 단위가 대신 완료했다는 뜻이 아니다. NFR Design에서 남은 값/원본·세부 배치 선택을 근거로 결정하고 필요한 실제 고객/제공자 정보는 그 해소 시점까지 확보한다. 이전 단계의 기록/판정을 소급 수정하지 않는다.

## 후속 설계·코드·시험 인계

- NFR Design은62개ID별 구현 패턴/원본·수명·실패 경계/검증 조건을 연결하고 실제 기술 조합을 고정한다. 관련 세부사항이 unresolved인 채 실행/원자성/현재 권한·복구 proof를 생성하지 않는다.
- Infrastructure Design은 실제국내배치·직원접근·서비스자격/비밀·원자/내구 저장/복구·Next/API/worker runtime과 관측/알림·비용/운영 부담을 같은 요구로 검증한다.
- Code Generation은 U1의실제source·CE01–04 등록/계약·검증기·최소흐름과 논리원본/worker를 준비한다. Build and Test는 test-after·80%전체분모·필수보고서와 실제정상/오류/동시/재시작/계약 시험을 수행한다. 문서 검사로 제품 검증 명령을 대신하지 않는다.
- U1 skeleton의최소통합검증과사용자확인을유지한다. 전체기능·30일실적·사업/제공자/보존/야간운영 증거는 해당후속단위/단계에서 별도로 확보한다.

## 추적과 완료 책임

상위 NFR1–NFR14는 [traceability.json](traceability.json)의14개 행에서62개 하위 요구사항으로 연결한다. 각 문서의 행은 한 곳에서 정의하고 교차 문서는 ID로 참조한다. 전 제품의 모든 시험/AC를 U1로 완료 표시하지 않는다. 관련 Code Generation/Build and Test는 실제 작성 코드·계약·단위/통합·경계/동시/오류·복구 시험과 커버리지/보안 보고서를 연결해야 한다. 전체 부하·30일 실제 가용성·야간/한 사람 운영 증거는 U10/실운영과 관련 Infra 검증 범위다.

## Assumptions & Open Questions

- [assumption] 선택한 스택과 공유 핵심/별도 실행 역할이 기능 범위를 줄이지 않고1인 개발·기술 운영과 품질 목표에 적합하다. 실제 의존성·비용·부하/복구/운영 증거는 아직 없다.
- 합성 시험/fixture는 실제 기업·신원/연동·지급/재고/발급·사업 인력/합의의 확인이 아니다. 기존 HB-01–HB-08과 S1의 FD-OQ를 해소해야 하는 경계를 유지한다.
- 관련 세부 선택의 담당·해소 시점·차단 영향은 [tech-stack-decisions.md](tech-stack-decisions.md)의 ND-OQ01–07을 따른다. 해당 미확인을 코드/실데이터·실거래 전에 해소해야 한다는 요구를 문서 승인으로 면제하지 않는다.

## Sources

- S1: [functional-spec.md](../functional-design/functional-spec.md) — U1 범위·4실행 역할·현재 권한·원래 주문 문맥·CE01–04·WF·FD-OQ.
- S2: [rules.md](../functional-design/rules.md) — numbered 업무 규칙의 원본, BR1.1–BR8.4/BR3.8.
- S3: [requirements.md](../../../inception/requirements-analysis/requirements.md) — NFR1–NFR14·8정확성 영역·합성 시험·기존 OQ/운영 기준.
- S4: [contract-summary.md](../../../inception/contract-design/contract-summary.md) — G01–G23·C00–C26·wire/등록/호환·실패/시간/운영/소유권.
- S5: [nfr-requirements-questions.md](nfr-requirements-questions.md) — Q1–Q6 및 별도 Looks correct 확인. 지원 버전·실제 제공자/운영 구성은 미선정.
- S6: [최신 화면 답변](../../../inception/refined-mockups/refined-mockups-questions.md) — Q4 WCAG2.2 AA, Q5 고객/직원 PC1280+·브라우저·고객 모바일 미정.
- S7: [이전 기능 검토](../functional-design/reviews/review-01.md) — R-01 조직 평가 개정 매핑, R-02 correlationId 매핑의 후속 확인 근거.
- S8: [team-practices.md](../../../inception/practices-discovery/team-practices.md) — test-after/Standard·80%·보안 검사·Git/배포·1인 구조와 측정 범위.
- 기술 공식 근거: S5의 W1–W27(React/Next/Nest/Express/TypeScript/PostgreSQL/CDK 등). 미선택 대안/외부 문서의 숫자를 제품 요구로 채택하지 않는다.
- 이 greenfield 기록에는 brownfield `technology-stack` 입력이 없다. 현재 스택은 S5에서 선택한 값이고 별도 RE/기존 제품 실적을 만들지 않는다.

