# OMS NFR Requirements 질문 — 최소 통합 실행 기반

**Unit:** u1-integrated-foundation
**Mode:** Guide me

## Prior Context

- 첫 단위의 기능 명세·규칙과 별도 검토가 완료됐다. 원래 주문 조직 문맥 보존·현재 행위 권한·명시적 조직 미사용/누락 구분, 미확인 조건/접수/실제 완료 분리와 CE01–CE04의 필요한 추가 경계를 유지한다. [S1–S2]
- 최초 버전은 계획 중단 포함 연속30일 가용성99.9%, 정의한 장애의 발생부터 감지·판단·복원·검증을 포함해30분 복구, 정의한 범위의 성공접수 RPO0, 8영역 정확성 시험 위반0 목표다. 논리 손상/오삭제를 임의 제외하지 않는다. 무중단배포·10분복구는 후속 목표다. 목표값을 다시 묻지 않는다. [S3–S4]
- 정상 부하와 합성 자료·요청80%조회/20%변경·p95조회1초/변경2초·기술오류0.1%·집중 후 회복, 점검/사람 작업·80%커버리지·필수보안검사와실패차단은 기존 답변을 따른다. 합성 부하/문서 연결은 실제 수요·성과가 아니다. [S3–S4]
- 모든 고객/직원MFA, 직원사내망/승인원격PC, 한국어/KRW/한국시각, 고객/직원PC1280+·고객모바일미정/직원모바일제외, 한국 내 고객/주문/계약·포함로그/백업 저장을 유지한다. 상위 NFR12/옛 AC의 모바일 문구는 최신화면결정을 따른다. [S1·S3·S5]
- AWS·CDK는 확정됐고 Q3에서 TypeScript 중심 방향, Q4에서 Node.js/TypeScript 기반 NestJS + Express API와 Nest standalone worker, Q5에서 고객/직원 UI의 Next.js App Router + React + TypeScript, Q6에서 거래 DB PostgreSQL을 확인했다. 실제 AWS 서비스/인증·메일 제공자와 지원 버전은 아직 미선정이다. 승인한 도메인/기능·계약과 품질 요구를 바탕으로 선정 내용을 구체화한다. 실제 서비스 배치/복제·원자성·보존/비용과 운영 부담 달성은 후속 설계/실증에서 확인한다. [S3–S4·Q3–Q6]
- Functional Design 검토의 보완2건(기업별 organisationRevision의원본/갱신대응, WorkItem/원래요청의 correlationId 보존/도출)을 해당NFR/설계·코드전원본/전달매핑과검증조건으로이어받는다. 과거검토상태를소급수정하지않는다. [S6]
- 실제기업/최초관리자의확인증거·신원권위/초기직원준비·저장/보관/민감데이터처리·메일제공자는미확인이다. 관련코드/실데이터/실거래전차단조건을유지하며, 실제증거없는항목을확인된사실로가정하지않는다. [S1·S3–S4]

## Q1. 첫 버전의 30분 복구·접수 유실0 목표는 어떤 장애부터 필수 시험할까요?

기존 목표값은 유지하고, 아직 미정인 장애 범위만 정한다. 앱/worker 종료·저장 구성요소 고장/전환·배포 실패·논리 손상/오삭제는 기본 필수다. 물리적 데이터센터 소실급 재난은 앞서 제외 방향을 정했지만 실제 복구 가능한 범위와 구분할 상세 경계는 아직 검증되지 않았다. AWS 리전 전체 서비스 또는 필수 외부 주체가 오래 중단된 경우를 첫 필수복구시험에 포함할지에 따라 구성·대체경로·비용/검증범위가 달라진다. 모든 선택에서 실제 중단은 가용성에 집계하고 성공접수 보존 요구를 완화하지 않는다.

A. 기본 필수 장애와 단일 가용영역(AZ)의 일시 서비스 장애부터 검증한다. 물리 센터 소실과 같은 파괴 사건은 기존 제외 방향의 상세 경계를 문서화한다. AWS 리전 전체/필수외부 주체 장기 중단의 30분 재개는 별도 미검증 한계·대응 경로로 명시하고, 그 장애를 검증 통과·목표 달성으로 표시하지 않는다. 해당 장기중단 중에도 성공접수 데이터 보존·복구 후 대조와 중단 집계는 필요하다. (권장)
B. 기본 필수 장애에 더해 AWS 리전 전체/필수외부 주체 장기 중단에서도30분내핵심업무재개·접수유실0을첫필수시험범위로둔다. 국내저장·기존보안과동시에달성할대체실행/인증/저장경로의실현가능성·비용/운영부담을검증한다. 이룰수없으면첫버전목표충족으로표시하지않고사용자판단대상으로남긴다.
X. Other (please specify)

[Answer]: A. 기본 필수 장애와 단일 가용영역(AZ)의 일시 서비스 장애부터 검증한다. 물리 센터 소실과 같은 파괴 사건은 기존 제외 방향의 상세 경계를 문서화한다. AWS 리전 전체/필수 외부 주체 장기 중단의 30분 재개는 별도 미검증 한계·대응 경로로 명시하고, 그 장애를 검증 통과·목표 달성으로 표시하지 않는다. 해당 장기 중단 중에도 성공 접수 데이터 보존·복구 후 대조와 중단 집계는 필요하다. 사용자 선택: "1" (기본 장애 + 단일 AZ 일시 장애부터 필수 검증).

## Q2. 고객·직원 로그인 세션의 기본 만료 시간은 어떻게 둘까요?

모든 사용자의 MFA와 매 요청 현재 권한 검증은 이미 정해졌다. 이 질문은 자리를 비운 PC에서 업무 화면·세션이 계속 열려 있는 시간을 제한하는 기준이다. 숫자는 확인 전 제안이며, 실제 인증 제품과 관계없이 서버에서 적용하고 검증해야 한다. 유휴 시간은 사용자의 상호작용을 기준으로 하며 백그라운드 재조회만으로 연장하지 않는다. 로그아웃·계정 전환과 권한 회수는 별도로 즉시 적용하고, 만료된 세션은 MFA를 포함한 인증 경로로 다시 접속한다. [W8]

A. 직원은 15분, 고객은 30분 유휴 시 만료하고 둘 다 로그인 후 최대 8시간에 만료한다. 자리를 비운 화면은 잠그고 로그인·MFA로 재개한다. 고객 입력의 세션 내 보존과 만료·재로그인·계정 전환 처리는 최소 정보 원칙과 함께 구체화한다. (권장)
B. 직원·고객 모두 30분 유휴, 로그인 후 최대 8시간으로 둔다. 직원 망 통제와 MFA·현재 권한은 그대로 유지하고 같은 만료 규칙을 사용한다.
C. 유휴·최대 시간 값을 직접 지정한다. 고객·직원 각각의 기준을 알려준다.
X. Other (please specify)

[Answer]: A. 직원은 15분, 고객은 30분 유휴 시 만료하고 둘 다 로그인 후 최대 8시간에 만료한다. 자리를 비운 화면은 잠그고 로그인·MFA로 재개한다. 고객 입력의 세션 내 보존과 만료·재로그인·계정 전환 처리는 최소 정보 원칙과 함께 구체화한다. 사용자 선택: "1" (직원 유휴 15분·고객 유휴 30분·둘 다 최대 8시간).

## Q3. 초기 제품의 구현 기술은 어느 구성을 출발점으로 삼을까요?

AWS·CDK는 유지한다. 비교는 승인한 UI·API·worker, 원자 접수·개정·이력 모델과 1인 개발·기술 운영 목표를 위한 것이며, 개발자 1명을 이유로 기능을 줄이지 않는다. 아래 후보의 공식 문서에서 CDK 언어 지원·정적 타입·웹 구성·트랜잭션 개념을 확인했다. 같은 생태계가 실제 유지보수 부담을 줄인다는 예상과 개별 성능·보존 달성은 검증 전 가정이다. TypeScript 타입은 외부 입력의 실행 중 검증을 대체하지 않으며, PostgreSQL 선택만으로 복구·RPO0을 달성했다고 주장하지 않는다. [W1–W7]

| 후보 | 구성 | 이 OMS에서 비교할 영향 |
|---|---|---|
| TypeScript 중심 | 고객/직원UI React+TypeScript, API/worker Node.js+TypeScript(HTTP는Fastify), CDK TypeScript, 거래DB PostgreSQL | 언어/도구/공통계약검사를함께관리할수있다는가정. JSON Schema2020-12·기존오류/권한·원자접수계약을실제검증기로적용해야함 |
| Go 서버 + TypeScript UI | UI React+TypeScript, API/worker Go(HTTP는Gin), CDK TypeScript, 거래DB PostgreSQL | 서버실행/정적타입과별도도구체인을검증. 언어간명세/타입동기화와테스트·배포준비의부담을추가대조 |

A. TypeScript 중심 후보로 진행한다. 실제 지원 버전·의존성/취약점·스키마/계약 호환을 확인해 고정하고, 구체적인 AWS 서비스·DB 운영 방식·신원/메일 제공자·저장/복구 구성은 NFR Design/Infrastructure Design에서 조건과 근거로 선정한다. (권장)
B. Go 서버+TypeScript UI 후보로 진행한다. 언어 간 계약·테스트·배포 부담과 같은 품질/보존 조건을 검증하고, 실제 버전·AWS 서비스·제공자는 같은 후속 조건으로 선정한다.
C. 다른 기술 조합을 검토한다. 바꿀 언어·프레임워크·DB 또는 선호 조건을 직접 설명한다.
X. Other (please specify)

[Answer]: 부분 답변 — 사용자 원문: "타입스크립트 중심으로 하는데 API, worker에 Fastify를 추천하는 이유는? 그리고 nest를 추천하지 않은 이유는?" TypeScript 중심 방향은 확인됐다. Fastify/NestJS 및 API·worker 구성은 비교 설명 후 추가 선택한다(Q4에서 별도 선택 기록). 기존 A 후보 전체를 승인한 것으로 해석하지 않는다. UI 구성과 PostgreSQL은 아직 제안이며 별도로 확인한다(Q5–Q6).

## Q4. TypeScript 중심 서버의 API·worker 구성은 어떻게 둘까요?

Q3에서 TypeScript 중심 방향을 확인했으므로 서버 프레임워크를 따로 비교한다. 이전 Fastify 추천은 JSON Schema 기반 HTTP 검증과 플러그인 경계, 얇은 HTTP 계층을 우선한 제안이었다. OMS의 모듈별 책임·의존성 구성과 API·worker 로직 공유에 대한 NestJS 비교가 부족했다. Nest를 제외할 성능 측정, 실제 개발 경험 또는 지원 제약의 근거는 없으며, 개발자 1명을 이유로 Nest가 부적합하다고 단정하지 않는다. [S1–S4·W5·W9–W12]

Fastify는 스키마 검증·직렬화와 플러그인별 hook/route 범위를 제공한다. Nest는 모듈의 import/export와 의존성 주입으로 구성하며 FastifyAdapter를 공식 지원한다. 따라서 NestJS와 Fastify는 함께 사용할 수 있다. Nest+Fastify에서는 Express 전용 middleware/recipe 호환을 가정하지 않는다. 어느 구성도 기존 JSON Schema 2020-12 계약을 자동 충족하거나 접수 유실0·30분 복구를 보장하지 않는다. 실제 스키마 검증·응답·오류 매핑과 의존성/플러그인 호환, 부하/복구 시험이 필요하다. [W5·W9–W11·W13]

worker에는 HTTP 서버가 필수는 아니다. Nest standalone application context는 HTTP listener 없이 모듈·provider를 사용할 수 있지만 HTTP Guard/Pipe/Interceptor가 provider 호출에 자동 실행되지 않는다. worker 진입점에서 필요한 신뢰/입력 검사와 공통 업무 계층의 권한·멱등성·개정/트랜잭션 검증을 명시적으로 적용한다. 고객 세션이 없는 작업에 고객 로그인을 요구하는 것으로 해석하지 않는다. 실제 작업 수신/저장·재시도/종료 방식과 AWS 서비스는 후속 설계에서 선택한다. [S1–S4·W12]

| 후보 | API | worker | 비교할 운영·개발 영향 |
|---|---|---|---|
| NestJS + Fastify | Node.js/TypeScript, NestJS + FastifyAdapter | Node.js/TypeScript, Nest standalone context + 작업 진입점 | 업무별 모듈·의존성 구성 규칙을 활용한다. 학습·decorator/DI 복잡성과 HTTP 플러그인·계약 연결을 검증한다. |
| Fastify 직접 사용 | Node.js/TypeScript + Fastify | Node.js/TypeScript + 별도 작업 진입점 | HTTP 계층을 직접 구성한다. API·worker 공통 서비스 조립·의존성 수명·검증/오류 규칙을 일관되게 유지할 자체 규약이 필요하다. |
| NestJS + Express | Node.js/TypeScript, NestJS 기본 Express adapter | Node.js/TypeScript, Nest standalone context + 작업 진입점 | Nest 모듈·DI를 동일하게 활용하며 Express용 연결을 검증한다. 현재 성능 목표만으로 Express가 부적합하다고 단정하지 않는다. |

위 비교를 바탕으로 이 OMS에서는 업무 모듈·API/worker 서비스 공유의 유지보수 가치를 우선해 NestJS를 권장 후보로 수정한다. HTTP adapter는 Fastify를 우선 검토하되 모듈·DI와 공통 업무 서비스 재사용의 이점은 Express adapter에서도 동일하다. Fastify 우선 검토의 별도 근거는 스키마 기반 HTTP 구성·처리 효율이며, 이 OMS의 실제 효율이나 통합 부담 우위는 아직 검증되지 않았다. 실제 유지보수 부담 감소는 설계적 예상이며 측정된 결과가 아니다. API와 worker는 별도 실행 진입점으로 유지하고 핵심 업무 규칙은 HTTP 요청 객체나 controller에 종속시키지 않는다. Nest 선택을 도메인별 microservice 분리 또는 특정 queue/broker 도입으로 해석하지 않는다.

### Q4 추가 설명 요청 — Fastify와 Express 비교

사용자 원문: "Fastify 와 Express의 장단점, 차이 설명". 프레임워크/adapter 선택 답변으로 해석하지 않으며 아래 [Answer]는 미선택 상태로 유지한다.

| 비교 | Fastify | Express |
|---|---|---|
| HTTP 구성 | 플러그인 경계와 요청 lifecycle hook으로 적용 범위를 나눈다. | 등록한 middleware와 router로 요청 처리 순서·경로를 구성한다. |
| 계약/타입 | JSON Schema 요청 검증·응답 직렬화와 Type Provider 연계를 제공한다. 실제 기존 2020-12 계약의 호환은 검증한다. | 검증·타입 연계를 선택한 middleware/라이브러리 또는 Nest Pipe로 구성한다. TypeScript 사용도 가능하다. |
| 통합 | Fastify 전용 plugin을 사용하거나 middleware bridge를 검토한다. Express용 middleware를 모두 그대로 사용할 수 있다고 가정하지 않는다. | 넓은 middleware 생태계와 Nest 기본 adapter를 활용한다. 필요한 실제 패키지의 지원·버전·취약점은 별도로 확인한다. |
| 로깅 | 활성화하면 Pino 기반 logger를 사용한다. 기본 상태에서는 logging이 꺼져 있다. | HTTP logging middleware/선택 logger를 별도로 구성한다. |
| 성능 | HTTP 처리 효율을 중시하며 공식 Nest 문서의 비교 benchmark에서는 이점이 있다. 해당 수치를 OMS의 응답시간/비용 개선 결과로 적용하지 않는다. | 현재 OMS 목표에서 성능 미달 근거는 없다. 같은 계약/인증/DB 접근·로그·오류 조건의 시험으로 비교한다. |
| Nest에서의 영향 | 같은 Nest 모듈·DI를 쓰되 platform-specific 패키지·검증/직렬화 연결을 검토한다. | 같은 Nest 모듈·DI를 쓰며 기본 Express 연동을 활용한다. |

[W5·W11·W13–W19]

장점의 대가는 Fastify에서는 스키마/플러그인/hook 학습과 개별 통합 확인, Express에서는 별도 검증/직렬화/로깅 구성의 일관성 유지다. Nest를 사용할 때는 그중 상당 부분을 Nest의 공통 구성으로 관리할 수 있으므로 direct-framework 비교를 그대로 개발 부담 차이로 적용하지 않는다. 실제 필요한 연동이 Express 중심이라면 Express를 선택하는 것이 합리적이며, 양쪽 연동이 모두 충분하다면 Fastify를 우선 검증한다. 현재 개발 경험/연동 목록은 미확인이므로 어느 쪽이 1인 운영에 더 유리하다고 단정하지 않는다.

버전 주의: 현재 Express 5 문서는 Promise를 반환하는 handler의 reject/throw를 자동 오류 처리하므로 Express 4의 비동기 처리 제약을 Express 전체의 단점으로 일반화하지 않는다. 현재 Nest 파일 업로드 문서에는 v12.1 이후 Fastify multipart integration이 설명돼 있다. 업로드 불가로 일반화하지 않으며 실제 선택 버전에서 사용 가능 여부를 확인한다. HTTP adapter를 바꾸는 것만으로 Nest의 검증/직렬화 설정이나 기존 JSON Schema 계약이 자동 적용되는 것으로 해석하지 않는다. [W16·W18–W19]

### Q4 추가 설명 요청 — Nest와 HTTP 기반의 역할

사용자 원문: "nest와 express 차이, express 나 fasitfy는 필 수 인가". 구성 선택으로 해석하지 않는다.

Express는 HTTP 라우팅·middleware·요청/응답 처리를 제공한다. Nest는 그 위에서 controller/module/provider와 DI 등 애플리케이션 구성 규칙을 제공하며, HTTP 애플리케이션에서는 adapter를 통해 실제 HTTP 기반을 연결한다. Nest로 HTTP API를 실행하려면 HTTP adapter가 필요하고 기본은 Express, 공식 지원 대안은 Fastify다. 두 가지를 동시에 쓰라는 의미가 아니다. 기본 Express를 사용하는 경우에도 Express가 없어지는 것이 아니라 Nest의 platform-express 기반으로 사용된다. 정확히는 특정 두 제품 이름이 모든 Nest 프로그램에 필수인 것이 아니라 HTTP 애플리케이션에 맞는 기반/adapter가 필요한 것이다. [W14·W20–W21]

HTTP를 받지 않는 worker/배치/CLI는 Nest standalone context로 모듈·provider만 사용할 수 있어 Express/Fastify와 HTTP listener가 필수는 아니다. HTTP request pipeline의 Guard/Pipe/Interceptor는 그 서비스 호출에 자동 실행되지 않으며 앞서 정한 worker/공통 업무 검증 조건을 유지한다. OMS의 현재 제안은 API에 Nest+HTTP adapter, worker에 별도 실행 진입점+Nest standalone, 두 진입점에 필요한 공통 업무 서비스를 공유하는 구성이다. 실제 HTTP adapter는 사용자 선택 전 미정이다. [W12]

A. API는 NestJS + FastifyAdapter, worker는 Nest standalone context로 진행한다. 공통 업무 서비스와 명시적 worker 검증·기존 스키마/오류 계약 호환을 확인한다. (권장)
B. API는 Fastify 직접 사용, worker는 별도 Node.js/TypeScript 진입점으로 진행한다. 공통 업무 서비스의 조립·검증·오류와 수명 관리 규약을 명시한다.
C. API는 NestJS + Express, worker는 Nest standalone context로 진행한다. Express 연동과 기존 스키마/오류 계약 호환을 확인한다.
X. Other (please specify)

[Answer]: C. API는 Node.js/TypeScript 기반 NestJS + Express, worker는 Nest standalone context로 진행한다. Express 연동과 기존 스키마/오류 계약 호환을 확인한다. HTTP를 받지 않는 worker에 Express/Fastify를 필수로 두지 않으며, 공통 업무 서비스와 명시적 worker 입력·권한·멱등성·개정/트랜잭션 검증 조건을 유지한다. 사용자 원문: "ㅇㅋ 그럼 3. NestJS + Express API / Nest standalone worker 로 한다". 사용자 선택은 앞서 제안한 Fastify 우선 검토보다 우선하며, 실제 버전/패키지 및 작업 수신·재시도/종료·AWS 서비스는 후속 설계에서 확인한다.

## Q5. 고객·직원 UI의 React 기반 앱 구성은 무엇으로 둘까요?

사용자 원문: "왜 next가 아니라 react를 추천했지?" 기존 Q5의 React+TypeScript/PostgreSQL 후보를 승인한 답변으로 해석하지 않는다. 질문을 UI 구성(Q5)과 거래 DB(Q6)로 나눠 확인한다. 이전에는 React 기반 UI를 제안하면서 빌드·라우팅·렌더링 구성을 명시하지 않았다. Next.js는 React를 사용하는 프레임워크이므로 React와 Next.js를 서로 배타적인 후보처럼 표현한 비교는 불완전했다. React 공식 문서는 신규 앱에 프레임워크를 권장하며 Next.js와 React Router를 예로 든다. [W22–W23]

앞선 제안의 방향은 별도 Nest API가 업무를 소유하고, 로그인 후 조회·입력·승인 작업 중심의 UI가 API를 호출하는 구성이었다. 현재 승인 범위에는 공개 페이지 SEO나 요청 시 서버 렌더링이 필수라는 요구가 확인되지 않았다. 이를 근거로 브라우저 중심 UI·정적 배포를 우선 검토할 수 있다는 설계적 예상이 있으며, SEO가 영구 불필요하거나 초기 표시/접근성·인증의 요구가 자동 충족된다고 단정하지 않는다. 실제 1인 개발/운영 부담은 미검증이며 기능 범위를 축소하는 근거로 사용하지 않는다. [S1–S5]

| 후보 | 구성·역할 | 확인할 대가/조건 |
|---|---|---|
| React Router + Vite SPA | React/TypeScript와 React Router Framework SPA mode를 사용하고 브라우저에서 Nest API를 호출한다. 실행 시 UI 서버 렌더링을 끄고 정적 배포를 검토한다. | root shell은 빌드 시 생성된다. 실제 기업/주문/개인 자료를 빌드에 포함하지 않고 동적 경로 새로고침, route/data/error 처리와 최초 표시를 검증한다. |
| Next.js App Router | React/TypeScript에 라우팅·공유 layout·loading/error 및 server/client rendering의 프레임워크 규약을 활용한다. 실제 업무 명령·조회 계약은 기존 Nest API가 소유한다. | 서버 기능을 쓰면 UI 실행·배포와 세션 전달·캐시/개정 일관성을 검증한다. static export도 가능하지만 요청 시 server 기능과 빌드 시 미정인 동적 경로에는 제한이 있다. |

[W22–W27]

Next.js는 Nest API와 함께 사용할 수 있으며 UI 선택으로 업무 규칙·권한의 권위를 Next에 복제하거나 Nest를 대체하지 않는다. SSR은 SEO 이외에도 초기 표시·서버측 데이터 결합에 가치가 있을 수 있고, Next의 라우팅/layout 규약만으로도 개발에 도움이 될 수 있다. 반대로 서버 기능이 필요하지 않다면 React Router Framework SPA가 프레임워크 규약과 정적 배포를 함께 제공하는 후보다. Next.js를 반드시 별도 실행 서버가 필요한 제품으로 일반화하지 않으며, static export를 선택하면 실제 OMS의 동적 주문 상세 경로/인증 흐름과 양립하는지 검증해야 한다.

현재 승인한 업무 UI·별도 Nest API 범위를 기준으로 정적 배포 후보인 React Router + Vite SPA를 우선 권장한다. 이 권장은 Next가 부적합하다는 사실이나 실제 비용/운영 성과가 아니다. UI 구성 선택 후 실제 지원 버전·라우팅/데이터 처리·렌더링/배포·인증과 캐시 경계는 NFR Design/Infrastructure Design에서 근거로 결정한다.

A. React + TypeScript + React Router Framework SPA mode + Vite 후보로 진행한다. Nest API 중심 업무 경계와 정적 배포·동적 경로·최초 표시를 검증한다. (권장)
B. Next.js App Router + React + TypeScript 후보로 진행한다. Nest API 중심 업무 경계를 유지하고 server/client 기능·배포/인증·캐시와 동적 경로를 후속 설계에서 확인한다.
C. 다른 UI 구성을 검토한다. 선호 기술 또는 비교할 조건을 설명한다.
X. Other (please specify)

[Answer]: B. 고객/직원 UI는 Next.js App Router + React + TypeScript 후보로 진행한다. Nest API 중심 업무 경계를 유지하고 server/client 기능·배포/인증·캐시와 동적 경로를 후속 설계에서 확인한다. 사용자 원문: "2". 앞서 제안한 React Router + Vite SPA 권장보다 사용자의 Next.js 선택이 우선한다. 이 답변만으로 모든 화면의 SSR 또는 static export, 특정 AWS 실행 서비스/버전이나 PostgreSQL을 선정하지 않는다.

## Q6. 거래 DB는 PostgreSQL 후보로 진행할까요?

Q3–Q5의 언어/서버/UI 관련 답변을 PostgreSQL 승인으로 해석하지 않는다. 기존 제안인 PostgreSQL은 원자 트랜잭션으로 복수 변경을 함께 처리할 수 있다는 점을 근거로 검토한다. 실제 운영 구성·복제·논리 손상 복구·버전·국내 저장과 운영 부담은 후속 설계/검증이 필요하며 DB 선택만으로 성공 접수 보존·품질 목표 달성을 주장하지 않는다. [S1–S4·W3]

A. PostgreSQL 후보로 진행하고 실제 지원 버전·운영 구성·목표 충족을 설계/검증한다. (권장)
B. 다른 거래 DB 후보를 검토한다. 선호 기술 또는 비교할 조건을 설명한다.
X. Other (please specify)

[Answer]: A. 거래 DB는 PostgreSQL 후보로 진행하고 실제 지원 버전·운영 구성·목표 충족을 설계/검증한다. 사용자 원문: "1". 이 선택만으로 특정 AWS DB 서비스·복제/백업/논리 손상 복구 구성을 선정하거나 성공 접수 보존·가용성·복구 목표 달성을 주장하지 않는다.

## Assumptions & Open Questions

- Q1–Q6의 최종 선택은 각 사용자 답변으로 확인됐다. 선택하지 않은 대안과 과거 권장 표시는 비교 이력이며 승인된 요구/기술 선정으로 기록하지 않는다.
- Q1의 필수시험범위는 물리복제·저널/백업·논리손상복구·실제야간/1인작업 증거로설계/실증한다. 단기시험으로실제30일가용성을대체하지않는다.
- Q2의 만료 시간·백그라운드활동판정·인증/직원망의실제근거는후속세션설계/코드에서확인한다. 기존MFA/권한/기업/조직·직원망요구를완화하지않는다.
- Q3의 후보비교는사업수요/성능/보존/비용달성사실이아니다. 특정AWS서비스·인증/메일제공자를지금이미확보했다고표시하지않는다.
- TypeScript 중심 방향, NestJS + Express API / Nest standalone worker, 고객/직원 UI의 Next.js App Router + React + TypeScript, 거래 DB PostgreSQL은 Q3–Q6의 사용자 답변으로 확인됐다. Fastify와 React Router + Vite SPA에 대한 앞선 권장은 비교 이력이며 최종 선택이 아니다. Next.js의 실제 렌더링/배포·인증·캐시 구성과 DB 서비스/복제·백업/복구 구성은 후속 설계에서 확인하며 프레임워크의 API 기능이 worker에 자동 적용된다고 가정하지 않는다.
- 데이터분류/보관/삭제·실제적용의무·외부처리/저장위치와실제제공자접근은기존OQ를유지한다. 법률/인증적합성을추측하거나일반지식자료의숫자를이미선택한기준으로사용하지않는다.

## Sources

- S1: [functional-spec.md](../functional-design/functional-spec.md) — U1 흐름·미확인/접수/권한·FD-OQ1–6.
- S2: [rules.md](../functional-design/rules.md) — 원래문맥·현재권한·지속접수/반복처리·최소UI.
- S3: [requirements.md](../../../inception/requirements-analysis/requirements.md) 및 [이전답변](../../../inception/requirements-analysis/requirements-analysis-questions.md) — NFR1–NFR14·장애/세션/국내저장/기술미정.
- S4: [contract-summary.md](../../../inception/contract-design/contract-summary.md) — G03–G09·G19–G23, 실패/시간/운영·OQ4–OQ9.
- S5: [최신화면답변](../../../inception/refined-mockups/refined-mockups-questions.md) — Q5 고객PC1280+·모바일미정.
- S6: [Functional Design 검토](../functional-design/reviews/review-01.md) — 원본조직개정·작업correlationId의매핑보완.
- W1: [AWS CDK 지원 언어](https://docs.aws.amazon.com/cdk/v2/guide/languages.html) — TypeScript/Go 등을 공식지원한다.
- W2: [TypeScript Handbook](https://www.typescriptlang.org/docs/handbook/intro.html) — JavaScript의정적타입검사도구.
- W3: [PostgreSQL Transactions](https://www.postgresql.org/docs/current/tutorial-transactions.html) — 복수갱신의원자트랜잭션개념. 실제복구구성의보존증거를대신하지않음.
- W4: [React Quick Start](https://react.dev/learn) — 컴포넌트/조건/상태/상호작용의공식기본문서.
- W5: [Fastify TypeScript](https://fastify.dev/docs/latest/Reference/TypeScript/) 및 [Validation and Serialization](https://fastify.dev/docs/latest/Reference/Validation-and-Serialization/) — 타입/검증경계;실제선택버전과기존JSON Schema2020-12의설정·호환을검증해야함.
- W6: [Node.js 소개](https://nodejs.org/learn/getting-started/introduction-to-nodejs) — JavaScript서버런타임의공식설명.
- W7: [Go REST/Gin 튜토리얼](https://go.dev/doc/tutorial/web-service-gin) — Go/Gin 서버구성의공식예시.
- W8: [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — 유휴/절대만료·서버측세션통제참고. Q2의숫자는사용자확인전제품제안이다.
- W9: [NestJS Modules](https://docs.nestjs.com/modules) — 기능 모듈의 imports/exports와 provider 공개 경계.
- W10: [NestJS Providers](https://docs.nestjs.com/providers) — 의존성 주입과 controller/provider 책임 구성.
- W11: [NestJS FastifyAdapter](https://docs.nestjs.com/techniques/performance) — Fastify를 HTTP provider로 사용 가능하며 Express 전용 recipe 호환에는 제한이 있다. 문서의 HTTP benchmark를 이 OMS의 측정 결과로 사용하지 않는다.
- W12: [NestJS Standalone applications](https://docs.nestjs.com/standalone-applications) — 네트워크 listener 없는 application context와 request handling 기능이 자동 실행되지 않는 경계.
- W13: [Fastify Encapsulation](https://fastify.dev/docs/latest/Reference/Encapsulation/) — 플러그인별 decorator/hook/route의 적용 범위.
- W14: [Express Middleware](https://expressjs.com/en/guide/using-middleware/) — 순서대로 실행하는 middleware, router별 범위와 TypeScript 예시.
- W15: [Fastify Middleware](https://fastify.dev/docs/latest/Reference/Middleware/) — Express-style bridge와 native plugin, raw req/res와 Fastify wrapper의 차이.
- W16: [Express Error Handling](https://expressjs.com/en/guide/error-handling/) — 현재 Express 5 Promise 반환 handler의 throw/reject 자동 오류 전달.
- W17: [Fastify Logging](https://fastify.dev/docs/latest/Reference/Logging/) 및 [Type Providers](https://fastify.dev/docs/latest/Reference/Type-Providers/) — 활성화한 Pino logging과 inline JSON Schema의 TypeScript 타입 추론.
- W18: [NestJS Validation](https://docs.nestjs.com/techniques/validation) — class/schema 기반 Pipe와 HTTP adapter와 별도로 구성하는 검증 경계.
- W19: [NestJS File Upload](https://docs.nestjs.com/techniques/file-upload) — Express/Multer 및 v12.1 이후 Fastify/multipart 대응. 실제 버전 선정의 확인 항목이며 버전을 확정하지 않는다.
- W20: [NestJS Introduction](https://docs.nestjs.com/) — Express/Fastify 위의 애플리케이션 추상화, 기본 Express와 선택 Fastify.
- W21: [NestJS HTTP Adapter](https://docs.nestjs.com/faq/http-adapter) — HTTP 기반을 감싸는 adapter와 애플리케이션 context의 연결.
- W22: [React Creating a React App](https://react.dev/learn/creating-a-react-app) — 신규 앱의 프레임워크 권장, Next.js/React Router 및 CSR/SPA·정적 배포 지원.
- W23: [React Build from Scratch](https://react.dev/learn/build-a-react-app-from-scratch) — Vite 등 빌드 도구와 라우팅/데이터 처리 구성의 별도 선택 비용.
- W24: [Next.js Layouts and Pages](https://nextjs.org/docs/app/getting-started/layouts-and-pages) 및 [Getting Started](https://nextjs.org/docs/app/getting-started) — React 기반 App Router와 layout·server/client 기능 규약.
- W25: [Next.js Static Exports](https://nextjs.org/docs/app/guides/static-exports) — 정적 배포 가능, 빌드 시 미정인 동적 경로와 요청 시 server 기능의 제한.
- W26: [Next.js Self-hosting](https://nextjs.org/docs/app/guides/self-hosting) — 서버 기능을 사용하는 경우 실제 배포·캐시/다중 실행 구성의 확인 항목. 특정 AWS 서비스/버전을 선택하지 않는다.
- W27: [React Router SPA Mode](https://reactrouter.com/how-to/spa) — Framework SPA mode의 runtime SSR 비활성화, root shell 빌드와 clientLoader/clientAction·정적 호스팅 fallback.

## Consolidated Summary Confirmation

- Q1: 첫 버전은 기존 목표인 계획 중단 포함 연속 30일 가용성 99.9%, 정의한 장애 발생부터 검증까지 30분 복구, 정의한 범위의 성공 접수 데이터 유실0을 유지한다. 앱/worker 종료·저장 구성요소 고장/전환·배포 실패·논리 손상/오삭제와 단일 AZ 일시 서비스 장애를 필수 시험한다. 물리 센터 소실급 재난은 기존 제외 방향의 상세 경계를 문서화한다. 리전 전체/필수 외부 주체 장기 중단의 30분 재개는 미검증 한계·대응 경로로 명시하며, 성공 접수 보존·복구 후 대조와 실제 중단 집계는 유지한다. 무중단 배포·10분 복구는 후속 고도화 목표다.
- Q2: 직원 유휴 15분, 고객 유휴 30분, 둘 다 로그인 후 최대 8시간에 세션을 만료한다. 백그라운드 재조회는 유휴 시간을 연장하지 않는다. 화면 잠금 후 로그인·MFA로 재개하고 로그아웃/계정 전환·권한 회수의 즉시 적용과 매 요청 현재 권한 검증을 유지한다.
- Q3–Q4: TypeScript 중심으로 API는 Node.js/TypeScript + NestJS + Express, worker는 별도 실행 진입점의 Nest standalone context로 구성한다. 공통 업무 서비스를 사용하고 HTTP를 받지 않는 worker에 Express/Fastify를 필수로 두지 않는다. HTTP Guard/Pipe가 서비스 호출에 자동 실행되지 않으므로 worker에 필요한 신뢰/입력 검사와 공통 업무 권한·멱등성·개정/트랜잭션 검증을 명시한다.
- Q5: 고객/직원 UI는 Next.js App Router + React + TypeScript다. 주문·계약·권한의 업무 규칙과 실제 명령/조회 계약은 Nest API가 소유한다. UI 선택만으로 모든 화면 SSR 또는 static export를 확정하지 않는다. 실제 렌더링/배포·인증/세션 전달·캐시/개정 일관성·동적 경로를 후속 설계에서 확인한다.
- Q6: 거래 DB는 PostgreSQL이다. 실제 지원 버전과 AWS DB 서비스·복제/백업·논리 손상 복구·원자성/보존·국내 저장/비용과 운영 부담을 후속 설계/시험으로 확인한다. DB 선택 자체를 성공 접수 보존이나 품질 목표 달성의 증거로 사용하지 않는다.
- 기존 성능/정확성 기준: 합성 자료·정상 100동시 세션/20req/s 30분·조회80%/변경20%·p95 조회1초/변경2초(처리 결과 또는 추적 가능한 접수)·기술 오류0.1% 이하, 100req/s 5분 집중 후 정상 부하로 5분 내 회복/10분 유지와 정의한 8영역 정확성 시험 위반0을 유지한다. 동기 외부 연동을 포함하는 기존 측정 경계를 유지하고 집중 부하에서도 정확성 오류를 허용하지 않는다. 미확인 조건의 접수/실제 완료 구분·계약/스키마·현재 권한 요구를 완화하지 않는다. 단기 시험과 문서 연결을 실제 운영 성과로 표시하지 않는다.
- 기존 운영/보안/화면 조건: 개발자 1명이 개발·기술 운영을 커버할 수 있는 구조를 목표로 하고 인원수로 기능을 줄이지 않는다. AWS·TypeScript CDK, 한국어/KRW/한국 시각·고객/주문/계약과 포함 로그/백업의 한국 내 저장, 모든 사람의 MFA·직원 사내망/승인 원격 PC, 고객/직원 PC1280+·직원 모바일 제외/고객 모바일 미정을 유지한다. 기존 점검·알림·작업 시간, test-after/80% 커버리지·필수 보안 검사와 실패 차단 기준을 유지한다.
- 미확인/후속 확인: 실제 제공자·접근 자격, 데이터 분류/보관/삭제·적용 의무·저장/처리 위치, 기업/최초관리자 신원 확인과 초기 직원 준비는 기존 확인 조건을 유지한다. Functional Design 보완 2건(organisationRevision의 원본/갱신 대응, WorkItem/원래 요청 correlationId 보존/도출)은 후속 설계와 구현 전 매핑/검증 조건으로 이어받으며 과거 검토 상태를 소급 수정하지 않는다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
