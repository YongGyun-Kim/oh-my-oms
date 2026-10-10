# U2 인프라·CI/CD 설계 확인

## 범위와 답변 방식

기존 Guide me 방식을 유지한다. U2는 library/embedded로 기존 API·worker·고객/직원 BFF와 공통 저장/보호·관측에 연결한다. 이번 engine 산출물은 cicd-pipeline.md와 traceability.json이다. 새 서비스/계정/관리 UI를 만들거나 독립 인프라 문서를 채우기 위해 자원을 발명하지 않는다.

기존 사용자 결정과 현재 저장소를 대조했고 다시 선택할 플랫폼 질문은 없다. 아래는 그 결정을 U2에 적용할 설계 내용의 통합 확인이다. 과거 선택을 새로 답변했다고 기록하지 않으며, 실제 자격/환경·실행 미확인은 적용 차단 조건으로 남긴다.

## 기존 결정·확인한 원본

- 단일 AWS 계정·AWS/CDK, NestJS+Express API/Nest standalone worker·Next BFF·TypeORM/PostgreSQL·Outbox/SQS Standard·독립 보호 DB, 첫 Cognito/향후 Keycloak 방향을 유지한다.
- 기존 U1 CI/CD 설계의 GitHub Actions·main/staging/production 승인·rolling/호환 되돌림 방향을 상속한다. 현재 .github/workflows/u1-validation.yml의 실제 job은 contents:read·AWS 자격 없는 합성 검증이다. 설계상 배포 방향을 실제 배포 workflow/권한 확보로 표시하지 않는다.
- 기존 Node22.23.3/npm10.9.9·lock/도구·현재 필수 check/unit/integration/PC/coverage/security·성능/복구 검증을 기준으로 U2 변경 영향을 연결한다. 후보와 아직 등록되지 않은 U2 명령/프로파일은 구별한다.
- 테스트는 test-after/Standard·직접 작성한 테스트 가능한 제품 코드 전체 라인80% 이상·필수 검사 실패/미실행/보고서 누락 차단이다. 이전 U1 소스의 측정/성공을 새 U2 소스의 실적으로 재사용하지 않는다.
- 현재 작업은 로컬 설계·합성 검증이며 AWS deploy/bootstrap/실계정 변경·실 Slack/메일 발송/실데이터 사용은 실행하지 않는다.

## U2에 적용할 설계 내용

1. 기존 검증 pipeline에 U2의 현재 신원/목적·초대/소속/역할·범위·인계/단회·HOLD/복구·새 profile과 모델/adapter 검사를 연결한다. U1 관련 회귀와 U2 신규 시험을 구별하고 전체 제품 커버리지·필수 보안 검사 하한을 유지한다.
2. CE-U2-01–07과 NFR Design의 명시 추가 profile, 현재 조직/역할/세대·보호 원장 payload/파기 marker를 등록·호환 검증한다. legacy 다중 범위는 허용 집합을 보존하고 구/신 consumer·원래 대기 작업/기한/불명 효과·rollback 후 회수/소비 상태를 대조한다.
3. build/이미지·source SHA/lock/schema/config·실제 검사 보고서를 같은 release identity로 묶는다. expand/호환 decoder→차분/통합 검증→관련 feature 활성화 순서를 따르고 rollback으로 DB/원래 ACK/소비·회수를 과거 상태로 덮지 않는다.
4. 일반 CI에는 운영 신원/DB·보호 원장/복구·secret decrypt·실 통지 권한을 주지 않는다. 합성 키/자료와 최소 결과 보고서만 사용한다. 실제 국내 처리/저장·사설 ingress·인증 provider capability/IAM/SDK·운영/본인 확인 정책·수신자 자격은 별도 적용 전제다.
5. 인프라를 공유하는 모듈 관점에서 기존 역할/DB pool·한시 목적 암호 자료·관측/알림·migration과 비용/운영 영향을 명시한다. 별도 AWS 계정/인증 microservice·MDM/기기 인증·모바일을 추가 요구하지 않는다. 실제 비용/30분 복구·30일99.9%/1인 운영 달성은 현재 증거가 없다.
6. NFR Design 리뷰 Minor R-01을 코드 생성 전 조건으로 연결한다. HMAC verifier의 정규화 입력에 목적/domain/version·대상/세대 및 검증할 후보 비밀의 정확한 바이트를 포함하고, 같은 metadata의 비밀 한 바이트 변경/다른 목적 비밀이 실패하는 fixture를 정의한다. 이전 설계/검토 상태는 수정하지 않는다.
7. 기능 설계의 인계/보류/범위 보완과 U1의 만료 작업·혼합 큐 메시지 미해결 문제를 해당 구현/통합 회귀의 선행조건으로 유지한다. 이 설계 확인만으로 해결·위험 수용 또는 전체 UI/실제 cloud/provider 통과를 주장하지 않는다.

## 모호성·충돌 점검

- 기존 플랫폼·승인 방식·검사/품질 목표에 대한 새 선택 질문은 필요하지 않다. 미확인 actual capability/신원/회사망·국내 경로/보관/가격은 실제 적용 차단 항목이며 합성 자료로 사실을 대신하지 않는다.
- CI/CD 설계와 실제 구현·CI 실행·cloud 배포는 구별한다. 새 U2 명령/registration/보고서 경로와 실제 binding은 후속 Code Generation/Build and Test에서 구현·확인한다.
- 로컬 합성 검증은 실제 SQS/Cognito/회사망의 증거가 아니다. pipeline의 future staging/production 방향은 지금 cloud를 실행한다는 뜻이 아니다.
- 보완 finding의 연결은 후속 조건이다. 이전 산출물/리뷰는 그대로 두고 코드·검증 증거 전에는 해소/위험 수용으로 바꾸지 않는다.

## Sources

- [security-design.md](../nfr-design/security-design.md), [logical-components.md](../nfr-design/logical-components.md), [NFR Design 검토](../nfr-design/reviews/review-01.md) — 43개 NFR·목적/보호/실행 차단·한시 비밀·현재 권위/보류·구/신 호환·보완 조건.
- [functional-spec.md](../functional-design/functional-spec.md), [components.md](../../../inception/domain-design/components.md), [contract-summary.md](../../../inception/contract-design/contract-summary.md) — 업무/owner·기존 닫힌 profile/원래 작업.
- [U1 cicd-pipeline.md](../../u1-integrated-foundation/infrastructure-design/cicd-pipeline.md) — 이미 정한 delivery 방향·같은 release·실제 자격/보고서/rollback 조건.
- 현재 저장소 .github/workflows/u1-validation.yml·package.json을 읽어 실제 local/CI 검증 명령·지원 snapshot과 설계상 future cloud 배포를 구별했다. 이 확인에서 해당 job/검사를 실행하거나 파일을 변경하지 않았다.

## Consolidated Summary Confirmation

Does this all look correct before I generate the artifact?

- 기존 단일 AWS 계정/호스트·GitHub Actions 검증 구조에 U2의 새 계약·모델/목적·인계/초대·현재 권한·HOLD/보호/호환·회귀 검사를 추가하는 CI/CD 설계를 작성한다.
- test-after/Standard·전체 제품 코드80%와 필수 보안/보고서 차단, 같은 release identity·expand/호환/안전 rollback, 실제 권위/국내 경로·사설 접점/제공자 준비 전 차단을 유지한다.
- HMAC 후보 비밀 결합 Minor와 이전 미해결 문제를 코드 생성/통합 검증 선행조건으로 연결하며 이전 기록을 소급 수정하지 않는다.
- 현재는 로컬 설계/합성 검증이다. 이 확인으로 AWS 배포·실계정·실 통지/실자료 작업을 실행하지 않는다.

- Looks correct
- Request changes

[Answer]: Looks correct

