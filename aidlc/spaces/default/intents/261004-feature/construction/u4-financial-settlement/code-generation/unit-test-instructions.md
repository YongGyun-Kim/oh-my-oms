# U4 단위·통합 시험 지침

## 적용 기준과 순서

계획의 Testing Contract는 test-after/Standard다. 계층 구현 뒤 해당 시험을 작성·실행하며 runner/config를 첫 시험 전에 준비한다. 새 도구/패키지 버전을 임의 도입하지 않고 기존 Node22.23.3/npm10.9.9·Vitest/V8/TypeORM/PostgreSQL을 사용한다. 단순 시험 실행 담당은 별도 Luna이며 실패 원인/금액·권한 의미 판단은 개발 담당이 맡는다.

아래 신규 U4 설정/명령은 구현 계획 Step1에서 만들 대상이다. 지금 실행 가능하거나 통과했다고 표시하지 않는다. package.json의 기존 U1/U2/U3 스크립트·보고서와 혼합하지 않는다. 모든 실행은 저장소 root에서 하며 U4 정확한 config/파일로 제한한다.

## Runner and Commands

첫 실제 실행은 Step3 계약 계층 구현/시험 파일 작성 뒤 아래 명령이다. 무시험 성공/더미 시험을 만들어 준비 통과로 사용하지 않는다.

```sh
npx --no-install vitest run --config tests/u4/vitest.unit.config.ts tests/u4/unit/contracts.spec.ts tests/u4/unit/input-boundaries.spec.ts
```

단위 전체(U4만):

```sh
npm run test:u4:unit
```

실제 PostgreSQL 통합(U4만; pretest가 두 U4 격리 DB를 준비):

```sh
npm run test:u4:integration
```

U4 coverage 기여(U4 정확한 단위/통합 목록; 전체 제품 파일을 분모에 포함):

```sh
npm run test:u4:coverage
```

특정 경합/보호 시험을 재현할 때도 정확한 U4 파일을 지정한다. 먼저 위 통합 명령의 DB 준비가 완료돼야 한다.

```sh
OMS_U4_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u4/vitest.integration.config.ts tests/u4/integration/concurrency.spec.ts tests/u4/integration/protection-replay.spec.ts
```

configs는 passWithNoTests:false, U4 unit/integration glob만 사용하고 integration은 fileParallelism:false다. DB 준비는 script에서 실제 Docker/127.0.0.1·DB 이름·역할/포트를 대조한다. 로컬 Node가 기본 PATH와 다르면 이미 설치된 해당 Node를 도구 실행 환경에서 선택하며 사용자 원래 환경이나 비밀값을 출력하지 않는다. 비어 있거나 안전하지 않은 DB/profile이면 실패한다.

공식 Unit 체크포인트는 현재 U1 PC 전용 명령을 자동 교체하지 않는다. 계획 Step17에서 U4+완료 Unit의 실제 결과를 입증하는 script를 만든 뒤 정상적인 별도 명령 확인/등록을 거친다. 이 지침의 unit 실행 명령에 project 전체 검사를 넣어 Unit별 반복하지 않는다. 프로젝트 전체 합집합/기존 회귀/보안 검사는 계획 Step16–17의 공통 job가 수행한다.

## Unit Test Inventory

각 구성5–8개 이상의 정상·실패·경계 예시를 아래 파일에 작성한다. 동일 구현을 그대로 복사한 assertion이나 always-pass 시험은 쓰지 않는다. 하한을 채우기 위해 하나의 의미를 임의로 분할하지 않는다.

| 파일(tests/u4/unit/) | 필수 관찰 결과 |
| --- | --- |
| contracts.spec.ts | 새 profile/registry/닫힌 request/result·등록 owner/target·구버전 거절·유효 원본 Ref |
| input-boundaries.spec.ts | 정확 정수/범위·100/101 code point·2000/2001·256/257·배분1/100/0/101·중복 항목·다바이트 |
| models.spec.ts | 업무9개·기술 보조 기록의 필수값/원본 소유·모델 버전·NULL/유일성 우회 차단 |
| repository.spec.ts | 같은 원본/개정·보호 확인·원래 요청 재확인·counter/lock 순서·완전 집계·다른 owner 쓰기 거절 |
| recovery-payload.spec.ts | 옛 model/version과 U4/new U3 형식·식별/별칭/binding/예약·모호한 혼합 거절 |
| payment-plan.spec.ts | 승인총액=의무합계·명칭 자유·의무키 안정성·현재 계약/동의·혼합/미확인 구별 |
| financial-commands.spec.ts | 실제 확인·전역 중복·한 주문·청구별 수동 배분·정정/환불 원금 보존 |
| eligibility.spec.ts | 수락/제공 목적·필수 미발행·전액후불의 명시 빈 집합·현재 회차·미등록 HOLD |
| due-basis.spec.ts | KST actual completion+N·N0·월말/윤일/연말·기한일포함·정정/역순·부분 미완료 |
| refund.spec.ts | 승인 root/원금·확정/예약·원래 작업 추가 확인·완료 결과 정정·불명/성공 재실행 금지 |

host-contracts.spec.ts와 pilot-evidence.spec.ts는 추가 경계 시험이다. 동일 요청 다른 입력, 조회 권한과 쓰기 권한 분리, 서버 source 등록을 body로 위조, 보고서 누락/미실행/다른 source·전체 분모 제외를 거절한다.

## Integration Test Inventory

fixture는 합성 enterprise/서로 다른 검증 사람/현재 권한·서버 등록 합성 profile·승인 계획과 정확 개정으로 구성한다. U5/U6/U7 미구현 경계는 owner/version/대상/현재성을 검사하는 포트 fixture를 사용하며 production 등록 성공으로 만들지 않는다. persistence/제약/직렬화/보호/권한 동시 변경은 실제 DB를 사용한다.

| 파일(tests/u4/integration/) | 중요한 정상·실패·경계 |
| --- | --- |
| persistence.spec.ts | additive migration/old bytes/new 모델·NOT NULL/UNIQUE·정정 후 별칭 유지·예외 전체 rollback |
| concurrency.spec.ts | 다른 요청/연결의 동일 거래 등록·입금100에80+80·두 입금의 청구100·같은 승인 root 소비·권한/정정 경합 |
| protection-replay.spec.ts | primary 뒤 보호 실패/응답 유실·epoch 변경·미보호 선행 의존 HOLD·원본/보조/제약 재구성 누락 차단 |
| commercial-plan.spec.ts | U3 다른 사람 승인→혼합 계획→전체 수락·승인/동의 우회 차단·갱신 회차 안정 주문·구형 snapshot 보존 |
| financial-flow.spec.ts | 청구→직원 입금확인→60/40 수동 배분→조회/정정·다른 주문/기업 차단·100개 초과 누적 잔액 정확 |
| owner-facts.spec.ts | 제공 전200/후800·완료 원본/높은 정정·후불 기한·현재 회차/약정·미등록/공백/충돌·수동 제한 |
| refund-flow.spec.ts | 실제 근거의 예약/결과·같은 root 여러case·60성공/40불명 뒤 확인·높은 정정·이미 환불한 원금 재배분 차단 |
| http-worker.spec.ts | Nest/Express64KiB·기본 인증/망/CSRF·권한별 목록/합계/이력/오류·민감 출력·queue 중복/역순/원본 재조회 |

핵심 통합 시나리오20건 이상을 계획하며 실제 목록/관찰 건수와 미실행을 결과에 기록한다. 테스트용 clock·외부 원본 포트는 stub 가능하나 primary/보호 저장·원금/유일 제약 검증을 인메모리 모의로 대체하지 않는다. 경합은 독립 요청 키/별도 DB 연결을 barrier로 겹치고 일정 sleep만으로 동시성을 주장하지 않는다. admission/time budget 시험은 작은 유한 fixture를 사용하고 대량 부하/50분 시험을 가져오지 않는다.

## Coverage and Evidence

U4 coverage config는 U4 시험만 실행한다. 기존 apps/packages/infra/scripts의 작성 제품 전체와 scripts/u4까지 같은 분모로 수집하고 미실행 파일도 포함한다. 생성물/외부 코드 제외는 근거를 기록한다. U4 한 기여가 전체 제품80%를 단독 달성해야 한다고 오해하지 않으며, 같은 source의 U1/U2/U3/U4 기여를 공통 집계해 전체 라인80%를 판정한다.

필수 실패·취소·skip·필수 inventory/보고서 누락·다른 source/이전 결과 혼합은 성공이 아니다. 커버리지 하한 완화·미실행 파일 제외·expect-failure를 전체 완료로 바꾸지 않는다. 최초 실패를 보존하며 수정 없이 우연 통과를 얻기 위한 반복 실행을 하지 않는다. JSON reporter는 assertion message/원문 payload/env를 폐기한 허용 scalar 투영만 기록하고 콘솔/trace에도 금융 원문·계좌·거래 참조·요약/토큰을 출력하지 않는다.

## Test Data and Cleanup

기존 합성 PostgreSQL 두 컨테이너를 재사용하되 DB는 oms_u4_verification / oms_u4_journal_verification으로 분리하고 U4 전용 역할을 사용한다. 실제 연결 대상과 synthetic container 검사가 먼저다. U1/U2/U3 DB를 drop/truncate하거나 실제 AWS/은행/메신저로 요청하지 않는다. profile/env 파일은 .runtime/u4/의 gitignored·제한 권한 파일로 두고 .reports/u4/에는 비민감 결과만 쓴다.

각 통합 suite는 자신의 합성 데이터만 정리한다. 부분 실패에서도 연결/worker 정리를 보장하고, 보호 DB append/업무 이력 역할과 migration/검증 관리자 역할을 구별한다. fixture의 source namespace·별칭은 합성값이며 실제 은행의 정규화/원본 권위로 문서화하지 않는다.

## Assumptions & Open Questions

- R-03:60성공/40확정실패 뒤40만 새 시도의 부모 상태는 미해결이다. 기능 수정 판단 전 이 경로를 임의 구현/정상 성공/skip된 전체 PASS로 처리하지 않는다. 불일치 재현과 미완료 AC8.6.3을 보존하며 해당 시험·전체 환불 준비가 해결될 때까지 미완료로 보고한다.
- 기존 U2/U3 미해결 및 실제 source/보관/국내 경로·운영 준비는 별도다. 이 지침과 합성 시험 통과가 실데이터 준비나 배포 승인·전체 목표 달성을 뜻하지 않는다.

## Sources

- [구현 계획](code-generation-plan.md), [기능/시나리오](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md), [NFR](../nfr-requirements/security-requirements.md), [상세 설계](../nfr-design/security-design.md), [CI 전달](../infrastructure-design/cicd-pipeline.md).
