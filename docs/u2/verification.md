# U2 local 합성 검증

## 단위 검증과 프로젝트 역할

Code Generation의 승인된 unit-test-instructions.md가 U2 exact 경로와 계층별 test-after 순서의 원본이다. 선택 실행은 `.reports/u2/selected/`에만 쓴다. U1 선택 회귀는 scripts/u2/run-u1-regression.ts의 허용 경로와 고유 output을 사용하며, 기존 U1 unit/integration report의 전후 byte hash가 달라지면 차단한다.

전체 프로젝트 담당은 같은 source identity의 전체 증거를 한 번 수집한다. Node22.23.3/npm10.9.9, 고정 lock, 승인된 local 두 PostgreSQL17.11, verification-isolated/e2e-isolated U2 namespace만 사용한다. credentials는 `.runtime/u2/`의0600 파일이며 출력·업로드하지 않는다.

```bash
npm run bootstrap:u2:ci
NODE_ENV=test OMS_U2_SYNTHETIC_PROFILE=approved-local-only node --import tsx scripts/u2/ci-full-proof.ts
```

프로젝트 실행기의 실제 argv는 PROJECT_COMMANDS가 고정한다. U1 전체 unit/integration은 명시 project output, U1/U2 coverage는 별도 contribution, check:u2는 기존 U1의 type/lint/format 대상·하한과 U2를 함께 검사한다. legacy check:u1 default report를 별도로 덮어쓰지 않는다. synth는 offline 합성, image는 동일 linux/amd64 제품의 content ID로 고정하며, 필수 보안 scanner와 same-image runtime 공격 결과를 대조한다.

CI는 U1/U2 별도 job의 성공 원문과 동일 source receipt를 받아 단일 project job에서 합친다. 실패/취소/skip·누락·bytes/hash/SHA/lock/tool 불일치를 거절한다. 한 source에서 이미 수집한 명령은 검증해 사용하며 우연한 재실행으로 실패를 대체하지 않는다. 원래 실패와 source 변경 후 보완 결과는 별도 namespace/receipt로 보존해야 한다. 실제 push·CI 실행·배포는 이 문서 작성으로 수행되지 않는다.

## 부하·복원과 실활성 차단

성능 준비는 [현재 pilot 정의](runtime-profile.json)의 u2-pilot-v1을 소비하여10기업/100고객/10직원·1000상품/10000주문·평균5/max50품목을 만든다. 고객사10·일주문1000은 계획 목표이고 나머지는 검증 가정이다. 암호 자료는 예측 가능한 seed로 생성하지 않는다. 명시 local verification admission과 등록 reset에서만 기존 private profile/ACK의 exact archive를 확인하고 새로운 profile을 실제 생성한다. 단순 touch/재직렬화 또는 다른 규모 자료는 현재 준비 근거가 아니다. [상위 기준 변경과 후속 확장](pilot-verification-change.md)을 따른다.

부하의20 활동 MFA 세션은 실제 BFF→HTTP→현재 권한/primary/journal 경계를 사용한다.5req/s5분80/20→20req/s1분→5req/s회복2분/유지2분의 총10분을 측정한다. 요청률은 일주문량과 같지 않으며 사업 상한이 아니다. 기존100k주문/50분은 후속 확장으로 연기하며 과거 FAIL/미실행을 성공으로 바꾸지 않는다. 조회p95≤1초·변경≤2초·유효 기술 오류≤0.1%, eligible first-start≤10초·PC 필수 조작≤3초를 검사한다. API10/worker5/admin2는 primary 정상17/rolling32, append4+2/vault1+1/admin2는 journal 정상10/rolling18이다. snapshot/control은 같은 admin pool의2개 예약이며 별도 pool을 더하지 않는다. 복구는 같은 pilot의 실제 DB 규모·현재 source/원문hash·독립 ACK와 RTO30분/RPO0을 검증한다.

복원은 원래 전체 profile의 논리 손상·실제 child SIGKILL·재시작, 독립 ACK/원래 Key·Ref, ALL_MODELS와 현재 보안 원본을 비교한다. 재생은 provider effect 재호출이 아니다. auth-ready는 독립 synthetic owner snapshot 재대조 후에만 열며 fresh MFA와 실제 허용 주문 조회까지 원래 t0의30분 안에 확인한다. 보호 commit 세 경계·두PG·회수/단회/5실패/파기·UNKNOWN은 실제 integration 시험과 함께 확인한다.

실제 Fargate/AZ·국내 provider/DB/vault/로그/backup/전달 path,30일99.9%, 운영 자격/법적 정책·회사망·실제 수신자·Cognito capability는 이 local 결과로 입증되지 않는다. realActivationAllowed는 false이고 해당 기능은 HOLD/미등록으로 닫힌다.

## 남은 provenance 문제

원래 U1 unit 상세 report bytes의 손실은 현재 Unit의 test-report-isolation-incident.md에서 OPEN이다. 현재 source 재검증·다른 baseline·요약을 그 상세 원본의 복구로 다루지 않는다. P09 failed browser 진단에서 발생한 합성 코드 원문은 incident ledger에 before hash와 선택 redaction을 남겼으며 byte-identical 원본 보존이라고 표현하지 않는다. trace/screenshot/video·자동 DOM context·landing query 로그는 수집하지 않고 비민감 boolean/metadata로만 판정한다.
