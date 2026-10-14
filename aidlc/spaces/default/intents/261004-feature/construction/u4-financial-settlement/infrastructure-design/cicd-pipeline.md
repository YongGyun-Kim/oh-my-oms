# U4 파일럿 검사·배포 전달 설계

## 목적과 현재 상태

[확인한 방향](infrastructure-design-questions.md)의 Looks correct에 따라 U4 library의 검사·공유 실행 기반·영속 변경/전달 호환을 설계한다. [보안 설계](../nfr-design/security-design.md) SD01–SD11과 [논리 구성](../nfr-design/logical-components.md) LC01–LC10을 재사용한다. 이번 산출물은 본 문서와 [추적표](traceability.json)다. 실제 workflow/코드·CDK 변경이나 검사·AWS 배포를 실행한 결과가 아니다. [S1–S5]

현재 `.github/workflows/u1-validation.yml`의 파일럿 matrix와 `scripts/u3/`의 명령/증거 집계는 U1/U2/U3만 포함한다. U4의 job/명령·실행 보고서는 아직 없다. 아래 IP01–IP08은 이를 확장할 구현/검증 의무이며 현재 전체 검증이 U4를 이미 포함한다고 표시하지 않는다. 과거 U3 인프라 문서의 당시 구현 전 상태를 현재 사실로 복사하지 않는다.

## Shared Runtime and Infrastructure

### IP01

| 구성 | 기존 기반에 연결할 U4 책임 | 추가/검증 경계 |
| --- | --- | --- |
| 실행·전송 | 기존 Nest+Express API/Nest standalone worker에 U4 포트/명령·조회 등록 | 새 금융 service/계정/독립 배포 없음. 고객/직원 신뢰·현재 권한/CSRF/망·일반 JSON64KiB 경계 유지 |
| primary·보호 DB | 기존 PostgreSQL/TypeORM·보호 쓰기에 금융 원본·식별/별칭·binding·집계/이력·요청/후속 사실 연결 | U4 모델/제약·registry/decoder/replay 확장은 구현 필요. DB 자원 증설/재구성·성능 달성 주장은 없음 |
| Outbox·별도 큐 | 기존 전달/중복·역순 대조와 worker 처리 등록 | 금융망 자동 실행·새 큐 도입 없음. 실제 지원 계약·source profile은 별도 확인 |
| 증빙 | 기존 보관처의 문서/거래 참조와 확인 정보 | 새 bucket/업로드/OCR/URL 수집 서비스 없음. 실제 보관처 접근/국내 저장/보존 의무 유지 |
| 관측/알림 | 기존 최소 진단·Slack+이메일 경로에 U4 기술 실패/대조·복구 시도 연결 | 금융 원문/계좌/거래 참조/근거 요약 일반 출력 제외. 실제 수신·운영/국내 경로는 별도 증거 |
| IaC/환경 | 단일 AWS 계정·CDK와 현행 합성 profile | 현재 profile은 SYNTHETIC_SYNTH·합성 계정만 허용. 실제 계정/망·이미지·용량/보관 기간으로 간주하지 않음. 지금 deploy/bootstrap/자원 생성 없음 |

U4 논리 분리는 API·primary/보호 DB·전역 counter의 물리 실패/성능 격리가 아니다. 실부하·공유 pool·저장/보호 이력 증가와 비용 영향은 실제 배포 준비에서 측정한다. 새 자원을 제안하지 않는다는 이유로 추가 비용0원이나 기존 용량 충족을 단정하지 않는다. 실제 sizing/비용/월간 예산을 근거 없이 만들지 않는다.

## Pilot CI Stages and Gates

### IP02

기존 PR/main push/manual 파일럿 진입을 유지하고 U4를 같은 source의 필수 기여에 추가하는 방향이다. 실제 workflow·명령·모드/보고서 버전과 영향 파일은 Code Generation 계획에서 구체화한다. 기존 full-proof를 U4 파일럿의 기본 명령으로 실행하지 않는다.

| 순서 | 단계/범위 | 필요한 결과와 차단 조건 |
| --- | --- | --- |
| 1 | source/lock·검증 환경 고정 | exact checkout/lockfile·합성 격리 profile·실행 도구 준비 확인. 다른 SHA/자료 재사용 금지 |
| 2 | 기존 U1/U2/U3 기여 + U4 기여 | 현행 기여의 단위/통합·PC 등 필수 결과 보존. U4 단위·실제 PostgreSQL 통합·신규 계약/공유 경로 영향 회귀를 추가. job 실패/취소/skip·필수 보고서 없음은 집계 차단 |
| 3 | U4 경계/정확성 시험 | 실제 거래 중복·다른 주문/기업 재등록·입금/청구 양쪽 동시 소비·공통 환불 한도·정정·미확인/보호 실패·권한/오류 비노출·기한/회차 연결·상한/상한+1 검증 |
| 4 | 전체 제품 커버리지·타입/린트/형식 | 같은 작성 제품 source inventory와 전체 분모에 U4 포함. 미실행 제품 파일도 분모 포함하고 라인80% 하한 유지. 누락/과거 source·보고서 재사용/제외 사유 없음 차단 |
| 5 | 변경 영향의 필수 보안·합성 IaC | 기존 비밀/SAST/의존성/CDK·생성 인프라/격리 실행 검사를 U4 이미지·호스트/변경 경계까지 연결. 도구/대상/보고서 누락·원래 실패를 통과로 가장하지 않음 |
| 6 | 계약·model/제약·보호 payload/replay 호환 | 새 U4 의미·profile/registry/모델·보조 기록과 호출자/worker·대기 사실·원래 결과의 호환/거절을 검사. 불일치·식별/예약 누락은 준비 차단 |
| 7 | 전체 source/image/실행 증거 집계 | 네 Unit의 실제 성공·source/lock·필수 시험 inventory·동일 image·보고서 신선도를 대조. 단위 성공만으로 전체/실거래 준비 완료 선언 금지 |

실패 시 원래 실패·비민감 종료 요약을 보존하고 보고서 누락도 성공으로 채우지 않는다. 같은 실패를 반복 실행해 우연히 통과한 결과로 필수 검증을 대체하지 않는다. 지원 경로의 금액/접근·중복/동시성 위반은 기술 오류율0.1% 안의 허용 오류가 아니다.

R-03의 부분 실패 재시도 상태 모순은 알려진 미해결 의존이다. 그 시험을 삭제·skip하고 전체 환불 검증을 통과로 표시하지 않는다. 실제 해소/새로운 처리 근거가 생기기 전 관련 결과를 미해결/미검증으로 보고한다. NFR 단계 진행 선택을 배포 준비/검사 예외 승인으로 확대하지 않는다.

### IP03

**명령·inventory·증거 계약을 함께 확장.** U4 job을 추가하는 것만으로 완료하지 않는다. 현행 고정 PilotUnit/scope·pilot command manifest·source/test inventory·coverage 기여·보고서 parser/allowlist·required job 집계와 project의 지원 범위를 함께 확장한다. 정식 U4 명령/경로는 구현 계획에 정의하며 존재하지 않는 npm script를 실제 명령이라고 기록하지 않는다.

- 같은 current source에 U1/U2/U3/U4 기여와 작성 제품 파일/lockfile·필수 시험 파일을 묶는다. U4 source/시험이 inventory 밖에서 실행되거나 기존 regex/scope가 U4를 조용히 제외하면 실패로 검출한다.
- 명령/환경/profile·시작/종료·관측된 exit/signal/timeout과 보고서의 freshness·source digest를 대조한다. command 종료/테스트 수치만으로 실제 대상 전체가 실행됐다고 추정하지 않는다.
- coverage 합집합은 같은 전체 source 분모를 사용하며 U4 미실행 파일도 남긴다. 서로 다른 source·같은 기여의 중복·누락 파일/지점·원래 실패·모드 혼용은 집계를 차단한다.
- 최종 실행 이미지는 해당 source/lock·검증 모드를 연결한다. 기존 U2 명칭/image label이 있다는 사실만으로 U4 명령 등록/실제 실행이 검증됐다고 보지 않는다. 신규 U4 지원과 worker/호스트 바인딩을 별도로 확인한다.
- 원시 금융 payload·증빙/계좌·실제 개인정보·토큰/환경·scanner 원문/trace를 CI artifact에 올리지 않는다. 허용된 scalar 코드·필수 시험 수/안전한 파일 위치·source digest·실행/결과만 비민감 투영으로 보존한다. 실제 보고서/allowlist의 신규 금융 경계 누출 회귀를 포함한다.

현재 workflow의 artifact 보관7일은 합성 검증 결과의 현행 설정이다. 실제 고객 거래/증빙·법적 보존 정책으로 채택하지 않는다. 실제 운영 자료는 국내 저장과 확인된 정책을 별도로 따른다.

## Contract and Persistent-Data Transition

### IP04

| 단계 | 준비/대조 | 실패 시 처리 |
| --- | --- | --- |
| 명세/registry 준비 | 새 지급 계획/의무·복수 청구·거래 식별/별칭·배분 묶음·목적별 자격과 회차 참조의 입력/응답·model version/지속 사실 등록 | 닫힌 구버전의 임의 필드/가짜 Ref/목적 추정 금지. 변경 계약 미지원은 명시 거절/HOLD |
| expand migration | 기존 주문/snapshot·청구/입금 이력 보존, U4 물리 제약/보조 기록·검증/decoder·보호 rows/replay를 함께 등록 | 필수 식별/개정/계획을 합성 default로 채우지 않음. 모호한 원본/유일 충돌은 쓰기 준비 보류·대조 |
| 호스트/worker/호출자 연결 | 같은 source/image의 U4 포트·명령/조회·후속 사실과 U3/U5/U6/U7·UI caller의 버전/의미 대조 | 새 data를 구형 consumer가 성공 처리하도록 위장하지 않음. 메시지/계약 불일치는 보류/명시 실패 |
| 합성 호환/경합 검증 | 원래 request/결과, 식별/별칭·한 주문·의무별 청구·집계/확정/예약, 보호 실패·response loss·epoch 변경의 실제 DB 회귀 | 새 접수·한도·식별/예약 삭제로 통과 금지. 잘린 목록 합계/부분 복구·인덱스 누락 검출 |
| 준비 판정 | 확인된 protected prefix/epoch·원본/보조 기록/제약·현재 권한·계약/이미지·검사 증거 일치 | 하나라도 불일치하면 영향 쓰기/활성화 보류. 실제 준비 미확인을 CI 합성 성공으로 대체하지 않음 |

필수 제약/decoder/registry가 있는 새 자료를 이미 기록했다면, 그 자료를 읽지 못하는 과거 image로 무조건 되돌리지 않는다. 지원 쓰기를 보류하고 원래 접수/보호 기록과 호환성을 대조한 뒤 compatible image 또는 호환 수정/복구 경로를 사용한다. DB snapshot을 과거로 돌려 새 접수/거래 별칭·binding·환불 예약을 잃는 rollback은 금지한다. 큐/대기 사실 삭제로 준비 상태를 맞추지 않는다.

원래 거래와 과거 계약/snapshot은 보존한다. 기존 PREPAY/POSTPAY가 승인된 혼합 계획으로 자동 변환되거나 과거 회차 지급이 새 갱신 주문을 충족하지 않게 회귀한다. 호환된 expand 방식은 전환 위험을 줄이기 위한 설계이며 무중단 배포 달성/전체 DR 성공을 보장하지 않는다.

## Verification Environment and Official Checkpoint

### IP05

합성·격리 데이터만 사용하며 실제 계정·회사망·은행 거래/증빙·환불 원본을 test fixture로 넣지 않는다. 기존 primary/보호 DB 격리·준비/정리 도구와 합성 queue/worker 검증 경계를 재사용하고 신규 U4 모델/제약·payload/replay를 준비 절차에 포함한다. 운영 profile/실제 AWS 자격/실제 금융망으로 이어지는 실행은 차단한다. profile 이름만으로 격리가 입증됐다고 주장하지 않고 실제 연결/DB 대상을 기존 안전 검사로 대조한다.

CI secrets에는 필요한 검증 도구만 연결하고 원문 secret/env를 요약/로그에 복사하지 않는다. 실제 배포 자격/권한은 U10 환경/배포 단계의 별도 준비·승인 대상이다. dependency/도구/이미지는 기존 lock/pin·현재 보안 검사를 유지하며 지침 예시의 제공자/보관 수치/계정을 추가하지 않는다.

### IP06

공식 Unit 체크포인트의 검증 명령은 같은 source에서 현재 U4 결과와 기존 완료 Unit의 통합 결과를 실제로 입증해야 한다. 원래 U1 PC 통합 성공이나 U4 문서 검사만으로 U4 금융 결과를 통과 처리하지 않는다. Code Generation 계획에서 기존 기록 명령의 U4 적용 범위를 대조하고 필요한 검증 script/명령·실제 실행 호스트를 구체화한다. 공식 명령을 바꿔야 한다면 정상적인 사용자 확인과 명령 등록 경로를 사용하며 상태 필드/명령을 임의 변경하지 않는다.

U4의 지원 명령/API·같은 저장/보호/worker 경로와 각 소유자 경계를 먼저 검증한다. 고객/직원 PC의 전체 금융 UI는 U8/U9 범위와 구별하며, API/합성 호스트 통합을 그 UI 전체 완료라고 표시하지 않는다. 단순 실행은 Luna에 위임할 수 있으나 실행된 명령/현재 source/실제 결과·체크포인트의 최종 판단은 주 실행자가 대조한다.

## Deferred Evidence and Actual Deployment Readiness

### IP07

| 항목 | 현재 검사/설계 의무 | 실제/후속 증거 경계 |
| --- | --- | --- |
| 가용성/복구/점검 | 업무별 실패·접수/보호 자료·같은 원금/예약·전환 호환·최소 진단 준비 | 30일99.9%·30분/정의한 장애 RPO0·무중단·야간/전체 재해 실증은 후속. 기본 백업/대응 준비는 유지 |
| 파일럿 규모/비용 | 유한 JSON/문자/배분·HTTP/DB 예산·현재 분모/호스트 검사 |10곳/일 주문1000건은 계획. 동시 사용자/정확한 짧은 profile·공유 DB/pool·증가 저장/비용은 미확정 |
| 실제 접근/국내 저장/증빙 | 현재 권한·직원망 신뢰·민감 output 제외·합성 profile 실활성화 차단 | 실제 인증·회사망·source profile/은행/환불 원본·보관/국내 로그/백업·보존 의무·사업 확인자 필요 |
| 운영/알림 | 최소 코드/식별·실패/대조·자동 복구 경로의 시도 시작 알림 인계 | Slack+이메일 실제 수신·실패/수동 필요 경로·사람 작업/운영 부담의 실제 증거 필요 |
| 알려진 미해결 | R-03·기존 U2/U3 위험과 과거 FAIL/보류의 원래 기록 유지 | 해소/별도 판단 없이 수정/배포 준비 완료로 표시하지 않음. 이번 범위는 일괄 위험 수용 아님 |

`.github/workflows/oms-full-proof.yml`의 기존 명시 후속 의미/성공 기준/원문 실패는 보존한다. 기본 파일럿에 그 전체 묶음을 다시 넣거나 전체 모드를 실행하지 않은 것을 PASS로 바꾸지 않는다. U4의 전체 부하/재해 실증을 그 기존 U1/U2 결과에 암묵적으로 추가하지 않는다.

### IP08

현재 검증 workflow는 실제 AWS 배포/고객 활성화를 실행하는 경로가 아니다. 이번 단계에서는 synth/deploy/bootstrap·AWS 자원 생성/증설/외부 메시지 전송을 실행하지 않는다. 코드 구현 이후 main 병합·필수 검사와 staging 방향, production의 별도 사람 승인이라는 기존 정책을 유지한다. 실제 배포 pipeline·계정/망/이미지/국내 경로·원본 확인·기본 백업/알림/핵심 동작 증거는 U10의 환경/배포 준비에서 확보한다.

필수 검사 실패/미실행/보고서 누락·source 불일치와 실제 준비 미확인을 성공으로 가장하지 않는다. R-03의 단계 진행 선택은 운영 배포·전체 환불 시험 성공의 승인이 아니다. actual activation readiness와 파일럿 합성 검증의 성공을 별도 결과로 유지한다.

## Assumptions & Open Questions

- 새 U4 테스트/명령·job·inventory/전체 coverage·소스/image·보고서 투영/집계/공식 체크포인트 범위는 아직 미구현이며 Code Generation 계획에서 영향 파일·실제 명령을 확정한다.
- 금융 source profile·원본/보관·적용 의무·실제 인증/직원망/국내 저장/기본 운영 증거와 R-03·기존 위험의 원래 상태는 유지한다. 실제 은행 거래 확인과 실제 배포 준비를 합성 CI로 대신하지 않는다.
- 기존 자원 재사용이 파일럿 실제 성능/비용·1인 운영 목표를 충족할 수 있다는 것은 검증할 전제이며 성과가 아니다.

## Sources

- S1: [확인 질문](infrastructure-design-questions.md), [보안 설계](../nfr-design/security-design.md), [논리 구성](../nfr-design/logical-components.md), [NFR 요구](../nfr-requirements/security-requirements.md): 승인한 전달/실행 경계·36개 NFR.
- S2: [기능 명세](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md), [기능 검토](../functional-design/reviews/review-02.md): 금액·계약 변경·R-03.
- S3: [공통 계약](../../../inception/contract-design/contract-summary.md), [컴포넌트](../../../inception/domain-design/components.md), [첫 배포 실행 계획](../../../release-planning/first-release-delivery-plan.md): 원본/업무 경계와 실제 준비/후속 실증.
- S4: [현행 파일럿 workflow](../../../../../../../../.github/workflows/u1-validation.yml), [현행 전체 후속 workflow](../../../../../../../../.github/workflows/oms-full-proof.yml), [package.json](../../../../../../../../package.json): 현재 U1/U2/U3 지원·기존 후속·신규 U4 미구현 상태.
- S5: [기존 명령 manifest](../../../../../../../../scripts/u3/pilot-commands.ts), [수집/집계](../../../../../../../../scripts/u3/ci-pilot-proof.ts), [합성 IaC profile](../../../../../../../../infra/cdk/src/profile.ts): scope/비민감 증거·모드·합성 환경 경계. 기존 코드를 U4 지원 완료로 설명하지 않음.
