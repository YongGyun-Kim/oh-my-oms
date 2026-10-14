# U3 파일럿 CI·전달 설계

## 범위와 적용 근거

[확인한 전체 기준](infrastructure-design-questions.md)을 U3 첫 배포에 적용한다. U3는 ProductCatalog·CommercialAgreement·OrderAcceptance library이며 기존 실행 자원을 재사용한다. 산출물은 이 문서와 [traceability.json](traceability.json)이다. CI workflow/명령·U3 모델/계약/테스트·실제 AWS 배포가 이 문서로 구현되거나 실행됐다고 주장하지 않는다.

[보안 설계](../nfr-design/security-design.md)의 SD01–SD10, [논리 구성](../nfr-design/logical-components.md)의 L01–L11과 33개 파생 NFR를 전달/검사/공유 설정에 연결한다. 기존 full-proof 성공 기준·과거 FAIL·U2 미해결과 실제 준비 조건을 보존하며 첫 배포 파일럿의 검사 결과를 원래 Unit 전체 완료로 표시하지 않는다.

<a id="ip01"></a>
## IP01. Existing Infrastructure and Pipeline Baseline

| 항목 | 현재 확인한 근거 | U3 설계 / 적용 한계 |
| --- | --- | --- |
| 기존 CI | [u1-validation.yml](../../../../../../../../.github/workflows/u1-validation.yml): PR/main push/manual, U1/U2 job와 project 집계, project에 50분 부하·복원 포함 | 기본 파일럿 검사와 후속 full-proof를 명시적으로 구분하도록 후속 코드 변경 필요. 현재 workflow는 아직 변경하지 않음 |
| 도구/명령 | [package.json](../../../../../../../../package.json): exact Node/npm·workspace/lockfile·U1/U2 check/test/security/synth | 같은 도구를 사용하고 새 U3 검사 명령/현재 source 집계 연결을 추가할 대상. U3 명령은 현재 존재/실행한다고 표시하지 않음 |
| 기존 AWS/CDK | [profile.ts](../../../../../../../../infra/cdk/src/profile.ts): SYNTHETIC_SYNTH·합성 계정/서울 profile만 허용 | 새 AWS 계정·서비스·U3 독립 task/DB/queue를 추가하지 않음. 합성 synth는 실제 계정/회사망/운영 배포 증거가 아님 |
| 실행/데이터 경계 | L01–L10의 기존 API/worker·primary/보호 DB·Outbox/별도 큐·관측 | U3 모델/행위/decoder·등록된 공유 계약을 기존 호스트에 연결. 공유 자원 사용이 업무 원본의 쓰기 권한 공유를 뜻하지 않음 |
| 비용/용량 | U3 전용 신규 AWS 자원 없음이라는 설계, 기존 공유 자원 실제 사용량/CI 시간 미측정 | 새 자원 증가를 계획하지 않으나 실제 청구액/CI 분 비용이 0이라고 주장하지 않음. job 시간/호스트·저장 비용과 운영 부담을 실제 실행/배포 준비에서 대조 |

첫 배포 고객사 10곳 이내·일 1,000건은 계획이다. 현재 합성 instance/pool·로그 7일·저장 20GiB 등 값을 실제 고객 용량·법적 보관·확정 요금으로 채택하지 않는다. 한 계정/CDK·기존 deployment 역할·환경 구분을 유지하고 U3 때문에 console 자원 생성·새 multi-account/multi-region을 추가하지 않는다.

<a id="ip02"></a>
## IP02. Build Stages and Source-Bound Aggregate

기존 workflow를 확장하되 **기본 `pilot-current` 검사와 별도 명시 실행 `full-proof`의 결과/manifest 의미를 분리**한다. PR/첫 배포 후보는 파일럿 기준을 사용한다. 기존 전체 부하/복원 코드·원문은 보존하고 후속 full-proof는 사람이 재개할 때 선택한다. 파일럿 통과를 full-proof 보고서에 성공으로 덮어쓰지 않는다. 실제 모드 입력/명령·파일명·필수 결과 이름은 Code Generation 계획에서 명시한다.

| 순서 / 논리 job | 입력과 검사 | 통과/실패 경계 |
| --- | --- | --- |
| 준비 | 같은 commit/source inventory·exact lockfile의 설치·기존 도구 bootstrap·격리 합성 DB/profile | 설치/도구/필수 입력 실패면 실행 불가. 실제 자격/실데이터 사용 없음 |
| U1 영향 회귀 | 공유 schema/호스트/보호 쓰기/복구 decoder·등록 변경의 현재 회귀와 커버리지 기여 | 기존 assertion을 줄이거나 실패 하한을 낮추지 않음. 원래 공식 체크포인트와 별도 proof 종류 표시 |
| U2 영향 회귀 | 현재 신원/MFA·기업/조직/권한·다른 사람/출처·직원망·공통 입구의 변경 영향 | 기존 미해결을 skip/PASS로 소거하지 않음. 실제 승인 신뢰 선행조건 별도 |
| U3 검사 | IP03의 단위/통합·계약·경계/실패/동시성, 새 U3 모델/현재 원본/이력/Outbox·등록/응답 | 구현된 실제 지원 경로 대상. 아직 없는 테스트/PC 전체 UI를 실행 성공으로 표시하지 않음 |
| 공통 집계/보안·포장 | 세 job의 같은 source 증거·전체 커버리지 합집합·check/필수 보안·필요 합성 CDK·해당 image | 아래 manifest와 source 대조 필요. 기존 pinned 도구/동일 image 증거 재사용 조건 검증 |
| 후보 기록 | 필수 검사 결과·미실행/후속·미해결·배포 선행조건의 최소 비민감 보고서 | 파일럿 검사 성공, 전체 실증 미실행, 실제 배포 준비 상태를 별도 필드/결과로 표현 |

job별 격리된 DB/profile/report namespace를 사용하고 전체 제품 source inventory를 동일하게 고정한다. 커버리지는 같은 파일/바이트의 실제 실행 라인을 합집합으로 집계하며 백분율 평균이나 한 job의 좁은 분모로 대체하지 않는다. 직접 작성한 테스트 가능 제품 파일 전체와 미실행 파일을 분모에 포함하고 생성물/외부 코드 제외 근거를 기록한다. 최소 라인 커버리지 80%와 필수 검사 하한은 유지한다.

집계 manifest는 source/commit·검사 모드·필수 job/대상·실제 종료 상태·보고서 식별/지문·커버리지 inventory·미실행/제외/후속 사유를 연결한다. 필수 job 실패/취소/skip·누락·다른 source/SHA·보고서 검증 실패는 통과를 막는다. 후속 full-proof의 미실행은 별도로 명시된 Deferred이며 기본 필수 검사의 skip와 혼동하지 않는다. 기존 `ci-full-proof.ts`/전체 release-validation의 의미를 이름만 바꿔 낮추지 않고 파일럿용 집계 계약을 명시한다.

동일 source 결과를 재사용할 때는 대상/도구/검사 모드·최종 제품 image와 증거의 일치가 확인된 경우만 인정한다. 새 U3 코드가 생기면 이전 U1/U2 전체 분모 보고서만으로 현재 전체 분모 성공을 주장하지 않는다. 문서 수정 단계에서 긴 앱/이미지/부하 검사를 재실행하지 않는다. 단순 검사는 Luna, 공식 체크포인트 검증은 주 실행자가 수행한다. 적용: NFR13.2, NFR13.4, NFR14.1.

<a id="ip03"></a>
## IP03. Test Automation and Security Gates

| 검사 영역 | 구체 대상 / 기대 결과 | 상위 연결 |
| --- | --- | --- |
| 현재 접근/대상 | HTTP·worker 진입, MFA/세션·기업/조직/TargetScope·직원 내부망·타 기업 목록/이력/결과 비노출 | NFR1.1–1.4, SD01 |
| 다른 사람 계약 승인 | 같은 사람의 다른 계정·오래된 사람/근거 개정·계정/목적/출처/확인 권위 불일치·승인 대상 변경·승인자 부재 차단 | NFR1.5, NFR9.2, SD01 |
| JSON/업무 입력 | 주문 전용 1MiB/다른 64KiB의 parser 선택·정확 byte 경계/초과·압축 해제 후 한도·추가 필드, 1/100행·0/101행·무효 수량·지원 밖 타입/지급/제공 | NFR5.3, SD02 |
| 정확한 금액/기간/조건 | 원 단위 정확 산식·범위 초과/소수 거절, 포함 세금/할인 중복·미확인 비용, 모든 행별 조건/계약 개정과 합집합·불변 구매 기간 | NFR5.2–5.3, NFR12.1, SD02/SD10 |
| 접수/멱등/보호 | 원자 primary 기록과 별도 보호 ack·현재 세대, primary 실패·commit 후 보호 실패/timeout/응답 유실·같은 키 동일/다른 입력·동시 요청 | NFR4.1, NFR5.1, SD03 |
| 상태/동의/경쟁 | 현재 개정·승인/제안·고객 동의·수락/변경 경쟁, REVIEW_PRICE_CHANGE와 ACCEPTED_AFTERSALES_CHANGE의 정확 전제/U7 원본 | NFR5.4, SD04 |
| 이력/사실 전달/완료 구분 | 전후/정정·원래 결과·Outbox 같은 commit·큐 중복/역순·현재 개정/소비 표지, FULL 일부 준비 HOLD·지급/출고/발급 원본 구분 | NFR5.5–5.6, NFR9.3, SD03/SD04 |
| 공유 계약/영속/복구 | C00/C05 v2 runtime schema/닫힌 Ref·enum/nullable/TargetScope·전송/등록/조회/응답/소비자, U3 모델 및 보호 후보/현재 원본 decoder·migration 호환 | NFR13.1, NFR13.3, IP05 |
| 품질/보안 | 기존 formatter/linter/type-check·비밀/SAST/의존성·CDK/생성 template·해당 image·격리 runtime의 변경 영향과 필수 보고서 | NFR13.2–13.4, NFR14.1–14.2 |

외부 원본 조회 실패를 부재/0원/허용/완료로 바꾸지 않는 negative case를 포함한다. 무효/미확인 근거로 성공하는 기존 U2 발견은 해당 소유자의 해소 증거 없이 실제 계약 승인 준비를 막는다. U3 모의 근거/단위 시험은 그 발견을 해결한 증거가 아니다.

기존 U1/U2 PC 시험의 변경 영향은 대조한다. U3 전체 고객/직원 PC 화면은 U8/U9의 실제 연결 전이며 아직 없는 화면의 E2E 성공을 선언하지 않는다. 지원 경로의 API/in-process 계약 검증과 후속 PC 통합을 구분한다. 새 명령은 `check:u3`·`test:u3:unit/integration/coverage` 등으로 계획할 수 있지만 실제 이름/대상/보고서/계약은 코드 계획에서 승인 후 구현한다. 이 문서의 예시 이름을 이미 등록된 실행 명령처럼 호출하지 않는다.

보안 검사 정책의 기존 도구/차단선·예외 방식은 유지한다. 변경된 소스·의존성·image·공개 진입/인프라별 실제 적용 대상을 명시하고 미지원/미실행/보고서 누락을 PASS로 취급하지 않는다. 발견/오탐 예외는 사유·영향·담당·만료·재검토·해소 근거를 추적하며 실제 비밀 노출은 폐기/교체·영향 확인한다. 긴 부하/전체 재해 복구를 분리하는 선택은 기본 보안·정확성 검사 면제가 아니다.

<a id="ip04"></a>
## IP04. Shared Resource and Configuration Mapping

| 공유 자원/소유자 | U3에 적용할 구체 설정/등록 | 실제 검증 경계 |
| --- | --- | --- |
| Nest API/worker / U1 | C03/C04/C05 v2 operation·신뢰 context·권한/대상·registered handler, 주문 전용 parser 1MiB·다른 64KiB | 직접 API/worker 우회·unknown operation/버전·실제 input/response 연결, 현재 U2 근거 |
| 공통 ingress/인증 / U1/U2 | 기존 고객/직원 접점·내부망 원본·Cognito bridge·MFA·CSRF/출처/민감 no-store | 실제 provider/issuer/audience·회사망/header 신뢰 준비; Keycloak 전환 구현은 후속 |
| primary PostgreSQL/TypeORM / U1+U3 원본 | U3 모델/개정·원자 요청/결과/행/스냅샷/이력/Outbox·migration·단일 원본 쓰기 권위 | 신규 테이블/제약/인덱스·DB 역할의 현재 최소 쓰기/조회·같은 commit 여부를 구현에서 확인 |
| 별도 보호 DB/원상 / U1 | U3 보호 후보·모든 개정/결과/이력·현재 세대·원래 요청 대조 및 decoder 등록 | primary와 별도 ack·현재 fence·접근/복구 권위. 전체 DR/RPO0 실증 성공 아님 |
| Outbox/별도 큐/worker / U1+수신 소유자 | 보호된 확정 사실·정확 원본/operation/event/work 식별·소비 개정·유한 재시도 | v2 envelope/consumer·중복 효과/late 결과·대기 메시지 호환, 잘못된 메시지가 정상 사실을 삭제하지 않음 |
| 기존 pool/admission/budget / U1 | API 25슬롯·GET 5초/변경 10초·잔여 예산에 따른 statement/lock 제한·유한 목록·원래 결과 조회 | 현재 설정을 실제 p95/용량으로 보지 않음. U3 추가로 공유 연결 예산을 임의 확대하지 않음 |
| 원본 소유 포트 / U4/U5/U6/U7 | 대금/공급/HW·SW 실제 결과/후속 판단의 확인된 대상·개정과 U3 전제 대조 | U3가 재고 FIFO/예약·결제 실행·실제 기간을 소유/완료로 추정하지 않음 |
| 기존 운영 관측/알림 / U10/U7 | 최소 operation/request/correlation·원본/개정·실패 단계·자동 복구 시도부터 기존 메신저/이메일 | 실제 전송/수신·독립 장애 경로 준비 필요, 새 메신저 선정/복구 자동 실행 없음 |

정확한 U3 영속/등록/검사 변경은 Code Generation 계획의 파일·의존·source manifest에 명시한다. 별도 DB를 만들지 않되 일반 업무 역할에 과거 이력/보호 원상 덮어쓰기 권한을 부여하지 않는다. 같은 계정 내 보호/복구·CI·실행 권위는 기존 최소 권한 경계를 유지한다. 기술 인력 1명이 사업의 등록자/다른 승인자 역할을 대체하는 것으로 해석하지 않는다. 적용: NFR1.1–1.5, NFR4.1, NFR5.1–5.6, NFR9.1–9.3, NFR11.2.

<a id="ip05"></a>
## IP05. Contract, Migration and Rollback Strategy

1. 코드 계획에서 C00/C05 v2 schema/operation·호출자/응답·영속 모델/보호 후보·복구/queue decoder의 영향 파일과 지원 version을 묶어 지정한다. 최초 v1 명세는 역사적 원본이다. 행·조건별 모든 계약 개정/TargetScope·두 changeKind를 누락하거나 v2를 v1으로 표시하지 않는다.
2. 합성 격리 DB에서 신규/기존 원본의 migration·등록·정확한 Money/Period·current revision·조회/복구 decoding을 검증한다. 변경 전후 같은 원본/접수/개정/결과·불변 스냅샷/이력·전달 사실의 보존을 대조한다. 실제 원본/queue를 삭제하거나 권한/기간을 임의 기본값으로 채우는 변환은 금지한다.
3. API/worker 및 실제 소비자의 지원 version·현재 대기 메시지·호환 원본을 확인하고 허용된 버전만 노출한다. 모든 필요한 경로 준비 전 U3 신규 접수/변경을 준비 완료로 표시하지 않는다. worker와 API의 일부 교체 성공만으로 전환 완료라 하지 않는다.
4. rollback 후보 image가 신규 모델/보호 후보·현재 U3 원본과 v2 접수/대기 메시지를 처리할 수 있는지 확인한다. 불가하면 무조건 이전 image로 되돌리지 않고 영향을 받는 신규 쓰기를 보류하고 현재 원본/원래 요청 결과 대조·호환 수정/승인된 복구 경로를 사용한다. snapshot restore로 새 접수를 잃거나 외부 사실을 다시 실행하는 방식은 rollback이 아니다.
5. 실제 배포에서 바뀐 schema/consumer/image·전후 핵심 동작/현재 개정·접수 결과·다음 조치와 실패/보류를 기록한다. 배포 전환 방식은 기존 호스트 계획을 재사용하고 무중단/10분 복구·전체 DR의 성과를 주장하지 않는다. 실제 전환/복구 허용 여부는 그 시점의 현재 데이터·queue/consumer·권한/세대 증거로 판단한다.

큐 전달은 반복될 수 있으며 지원하지 않는/오래된/상충 메시지를 현재 완료로 승격하지 않는다. 요청/result ID와 원본 version을 유지하고 안전하지 않은 외부 부작용 재전송을 막는다. 고객 동의/계약 승인/원본이 바뀌면 자동으로 최신값에 재판단하지 않는다. 적용: NFR4.1–4.2, NFR5.1/5.4–5.6, NFR13.3.

<a id="ip06"></a>
## IP06. Secrets, Artifact Protection and Data Residency

| 자료/권위 | CI·전달 설계 | 실제 준비 조건 |
| --- | --- | --- |
| CI 자격 | 로컬/기본 검증은 합성 profile, repository의 기존 read-only/도구 권한·pinned action 사용 | 실제 AWS deploy 권위와 분리. 비밀/key·실계정 내용을 소스/로그/일반 artifact에 넣지 않음 |
| 제품 image/도구 | 같은 source/lockfile·image digest와 검사 증거 연결 | 다른/과거 image 검사 원문으로 최종 제품 보안 통과를 대체하지 않음 |
| 결과 artifact | 비민감 job/검사 mode/source·커버리지/종료 요약·미실행/발견·제외 근거만 허용 | raw request/토큰/신원/계약 전문·고객 실제 자료/원시 trace 업로드 금지. 실패/누락도 확인 가능 |
| 업무 원본·이력/근거 | 목적별 접근·전송/저장 보호·현재 단일 소유자·불변 과거 조건과 승인 정정 연결 | 실제 암호화/권한/삭제 정책 증거 필요, 일반 CI 로그를 거래 원본으로 사용하지 않음 |
| 실제 로그/백업/외부 처리 | 포함 민감 내용의 국내 저장/경로·목적/최소화·보관/삭제 정책 확인 | GitHub 등 외부 CI가 실제 고객 데이터를 저장해도 된다고 가정하지 않음. 실데이터 처리 전 사업/법적 근거·실제 저장 경로 대조 |

기존 합성 보고서 retention 7일이나 일반 가이드의 기간을 실제 고객 자료의 법적 보관으로 정하지 않는다. 실제 사업 확인자·원본 소유자·Infra/U10이 분류/보관/정정·외부 처리 의무를 확인한다. 이미 접수된 거래 조건의 불변성과 개인 데이터 최소화 충돌은 확인된 정책/정정 절차로 처리한다. 보안 발견/예외·실제 비밀 노출 대응은 IP03 정책을 따른다. 적용: NFR11.1–11.3, NFR14.1–14.2.

<a id="ip07"></a>
## IP07. Environment Promotion, Operations and Deferred Evidence

현재 작업은 설계와 로컬 합성 검증 준비다. AWS deploy·main 병합·운영 승인을 수행하지 않는다. 향후 기존 방향인 main 병합·필수 검사 후 staging 자동 배포와 개발자의 실제 핵심 동작/선행조건 확인 후 운영 승인을 유지한다. 이 방향은 현재 실제 배포 workflow나 AWS 준비 완료의 증거가 아니다.

| 영역 | 첫 배포 후보에 연결할 조건 | 후속 실증/확장 |
| --- | --- | --- |
| 실제 신뢰/접근 | provider/MFA·조직/기업 분리·직원망·정확한 다른 사람 승인 및 U2 발견 해소 | 공급자 Keycloak 전환·고급 관리 후속 |
| 실제 데이터/이행 | 국내 원본/포함 로그/백업·기본 저장 보호·실제 대금/HW/SW/후속 원본 | 외부 자동 연동/고급 이행 후속 |
| 기본 대응/알림 | 현재 로그/상태·실제 메신저/이메일 수신·장애 대응·기본 백업 준비, 자동 복구 시도부터 알림 | 전체 DR/RPO0/30분 복구·독립 장애 전달의 전체 실증 후속 |
| 가용성/점검/운영 | 계획 중단 포함 30일 99.9%·발생~복원 검증 30분 목표, 기존 점검/안내와 사람 작업 목표를 관측에 연결 | 30일 실증·무중단/10분 복구·장기간 1인 부담 후속 |
| 규모/성능 | 10곳/일 1,000건 계획, 현재 유한 입력/시간·정확성 보호. 짧은 시험의 동시 사용자/기간/구성은 시험 설계에서 확인 | 원래 p95/오류율/집중·회복 의미 보존, 100k/50분/전체 부하·과거 FAIL 재실행 후속 |
| UI/언어 | U3 계약의 한국어/KRW/한국 시간·미확인/0원/없음·최초/실제 기간 의미, 고객/직원 PC1280은 U8/U9 통합 | 모바일·미국 영어 지원 여부/구현 후속 |

99.9%/30분 및 원래 조회 p95 1초·변경 p95 2초·유효 기술 오류 0.1%는 목표다. 현재 25슬롯/5초·10초/합성 synth나 CI 통과를 목표 달성으로 쓰지 않는다. 거래 금액/상태/중복·권한 위반을 기술 오류 허용률로 허용하지 않는다. 실제 배포 후보에는 미해결·후속·지원 밖 업무와 현재 준비 상태를 분리해서 남긴다.

원래 전체 부하/복구의 미실행은 원래 full-proof/전체 Unit 완료를 보장하지 않는다. 실제 최초 운영 전의 기본 신뢰/국내 저장/백업/알림·보안/핵심 업무 준비를 미실증 장기 목표와 함께 뒤로 미루지 않는다. 단계별 정확한 실행 명령/manifest·source/검사 증거·알림/배포 권위는 해당 코드/배포 계획에서 구체화하고 검증한다. 적용: NFR2.1, NFR3.1, NFR4.2, NFR6.1, NFR7.1, NFR8.1, NFR9.1, NFR10.1, NFR12.1–12.2.

## Assumptions and Open Conditions

| 항목 | 미확인/미구현과 확인 책임 |
| --- | --- |
| 파일럿 CI/전체 집계 | 현재는 기존 U1/U2 full-proof workflow. U3 명령·새 manifest/집계·분모·모드·필수 결과의 실제 구현/검사는 개발·품질 책임 |
| U3 v2/모델·보호/queue 호환 | schema/등록/소비자·DB 역할·decoder·전환/되돌림의 실제 증거는 U3/U1 및 영향 소비자 책임 |
| U2 현재 근거 신뢰 | 기존 미해결의 실제 영향/해소 증거는 U2 책임이며 해당 실제 계약 승인 전 선행조건 |
| 실제 클라우드/데이터/고객 | 미배포/합성 profile. 실제 국내 경로/회사망/제공자/사업 합의·보관/알림·비용/용량 증거는 해당 원본/Infra/U10/사업 확인자 책임 |
| 장기 목표/보류 | 과거 FAIL 및 100k/50분·DR·무중단/장기 관측 보류를 보존. 사용자 재개 시 해당 실증 목적에 맞는 증거 확보 |

## Sources

- [확인한 인프라 설계 기준](infrastructure-design-questions.md): 전체 Looks correct.
- [U3 보안 설계](../nfr-design/security-design.md), [논리 구성](../nfr-design/logical-components.md), [NFR 추적](../nfr-design/traceability.json): SD01–SD10·L01–L11·33개 파생 요구.
- [U3 기능 명세](../functional-design/functional-spec.md), [공통 계약](../../../inception/contract-design/contract-summary.md), [컴포넌트](../../../inception/domain-design/components.md): 원본/접수/실제 결과·C00/C05 v2·버전/호환.
- [첫 배포 실행 계획](../../../release-planning/first-release-delivery-plan.md): 파일럿/필수 준비/후속 실증과 기존 미해결.
- [현재 workflow](../../../../../../../../.github/workflows/u1-validation.yml), [현재 명령](../../../../../../../../package.json), [합성 profile](../../../../../../../../infra/cdk/src/profile.ts): 변경 전 현재 코드 근거.
