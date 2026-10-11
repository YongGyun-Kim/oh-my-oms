# U2 PC 준비 실패 — STAFF 원본 계약 조사

## 확인된 원인

사용자는 Astra의 피드백을 토대로 실제 소스 조사를 요청했다. U2 code-generation을 native Unit resume으로 재개하고 현재 계획의 실행 허용을 확인했다. Astra는 코드 읽기만 수행했으며 DB 조회·시험·코드 수정·정식 reviewer 판정은 수행하지 않았다. 조사 baseline은 Git `7693486`이다.

`tests/u1/fixtures/staff-bootstrap.ts:18`의 `protectedAccount?.audience === 'STAFF'`는 잘못된 원본을 검사한다. Account에는 audience가 없고 ProviderBinding에 있다. 정상 seed로 준비해도 이 비교는 `undefined === 'STAFF'`로 실패하여 `FIXTURE_STAFF_SOURCE`를 발생시킨다. 이는 앞선 준비 실패를 설명하는 확정된 코드 결함이다. 당시 DB에 추가 문제가 있었는지는 확인하지 않았다.

| 소스 | 확인한 계약 |
|---|---|
| `tests/u1/fixtures/identity.ts:72`, `:91` | 실제 Account seed에는 audience가 없고 ProviderBinding seed에 저장한다 |
| `packages/persistence/models/u1-v2.json:180`, `:3016` | 정식 Account 정의와 ProviderBinding.audience 정의가 같은 분리를 명시한다 |
| `packages/persistence/src/u2-migration.ts:62` | backfill은 AccountSecurityState를 추가하며 Account에 audience를 넣지 않는다 |
| `packages/persistence/src/protected-store.ts:152`, `:288` | read/currentProtected는 저장된 보호 버전을 반환하며 Account audience를 주입하지 않는다 |
| `packages/core/src/identity-password.ts:87` | 제품의 audience 확인은 ProviderBinding을 사용하며 보호 Account를 별도로 확인한다 |

## 기존 시험이 결함을 놓친 이유

`tests/u2/unit/u1-pc-fixture-preparation.spec.ts:83`, `:238`의 시험 데이터는 실제 Account에 없는 audience를 만들었다. service 시험에서는 backfill과 manager도 mock으로 대체한다. 따라서 실제 seed의 결과와 실제 bootstrap 입력 계약의 불일치를 가렸다. 기존 PG 선택11개는 새 fixture의 직접 연결 시험이 아니다.

앞선 단위16·PG11 통과는 해당 시험 결과 그대로 보존한다. 그 결과를 실제 `seedSyntheticAccount → backfillU2SecurityState → seedMinimumStaffManager` 준비 성공으로 표현하지 않는다. 앞선 PC 실행은 준비 실패로0case이며 과거 실패 원문과 [실패 기록](u2-pc-fixture-repair-failure-20261011.md)을 수정하지 않는다.

## 최소 정정 방향과 검증 경계

원래 승인된 fixture2+시험1 범위 안에서 Account의 보호 일치 확인을 유지하고 STAFF 판정을 실제 보호 ProviderBinding으로 옮긴다. 실제 모델의 계정 연결·활성·제거 여부·단일 활성 STAFF binding과 현재 보호 일치를 확인하고 transaction 안에서 Account와 binding을 다시 대조한다. 기존 fence 보존·최초 생성·최소 권한·결과 Ref·원자 rollback은 유지한다. Account에 audience를 추가하거나 보호 검사를 제거하거나 raw 원본을 대신 허용하지 않는다.

신규 단위 데이터도 실제 Account/ProviderBinding 계약에 맞춘다. 이 조사에서 준비 순서를 다시 바꿀 근거는 없다. 제품 코드·model/schema·dependency/config·보안 하한·상품 정책·부하/DR 범위를 확대하지 않는다. 실제 연결 검증은 승인된 기존 U1 PC4와 U2 PC5를 별도로 실행해 판단한다. 추가 PG 파일을 생성하거나 전체 collector를 다시 실행하지 않는다.

위 절들은 조사 시점의 근거와 정정 방향이다. 정정 후 실제 선택 검증은 다음 절에 별도로 기록하며 Unit 완료·배포 승인을 뜻하지 않는다. 이후 검증에서 실패하면 그 결과를 별도로 보존하고 추가 원인을 구분한다. 원본 값·PII·비밀은 수집하지 않았으며, 확인된 코드 결함을 설명하는 데 추가 DB 조회는 필요하지 않았다.

## 정정 후 선택 검증

위 조사 이후 원래 승인된 범위 안에서 bootstrap과 신규 단위시험 두 파일을 정정했다. local-service 준비 순서와 제품 코드·schema·설정은 바꾸지 않았다. Account는 실제 active/보호 일치로 확인하고, STAFF는 같은 계정에 연결된 단일 활성 보호 ProviderBinding의 audience/CLEAR/현재 일치로 확인한다. transaction 내부 Account·binding 재대조와 fence 보존·원자 rollback을 유지했다. 단위 Account 데이터는 실제 seed 함수와 모델 필드로 구성한다.

검증 당시 HEAD는 `7693486b2de30148d7843ff8670252ab73368ff0`, source identity는 `f0e45bd5be202d247da21e79b88bece5f4b08290b8cf4ccf02602efbf9cd4169` /504파일이며 전후 동일했다. 후속 커밋의 identity로 재라벨하지 않는다.

| 실행 | 결과 | 고유 보고서 / bytes / SHA256 |
|---|---|---|
| Luna 단위 | exit0,16/16 | `.reports/u2/selected/pc-binding-repair-unit-20261011-1.json` /6606 /`51fa7ba24059b1eb89c2b506e46da31599b1fbb091393846cda13b95181073cd` |
| Luna 타입·ESLint·Prettier | 각각 exit0 | private `oms-u2-binding-preservation-11cnfc8a/binding-1-run/binding-run-summary.json` 및 개별 stdout/stderr/exit |
| 기존 U1 PC4 | exit0,4PASS/실패·skip·flaky0 | `.reports/u2/selected/pc-binding-repair-u1-pc4-20261011-1.json` /7616 /`0db2e8f0b2790f17487fcdad3aff69313d6b62c291f86bfef7907d35760c1e40` |
| 기존 U2 PC5 | exit0,5PASS/실패·skip·flaky0 | `.reports/u2/selected/pc-binding-repair-u2-pc5-20261011-1.json` /56938 /`18cc80686ab67b0245e6a0728d5476ac889726913a25a06857834db25aeb574f` |

PC는 기존 승인 명령을 새 report/output 경로로 각각 한 번씩 직렬 실행했다. 기존 selector/timeout·권한·MFA·시나리오를 유지하고 실제 seed/backfill/manager 및 업무 흐름을 통과했다. 이전 PG11은 `1d44a821…` source의 기존 결과로만 보존하고, 관련 제품/PG 시험 bytes가 바뀌지 않아 반복하지 않았다. 이전 전체 coverage는 `8972b7b0…` source의 역사적 결과이며 이번 source 전체 coverage PASS가 아니다.

사전 단순 검증에서 원래15보고서 모두 불변이었다. 이어 PC 실행 전 기준16보고서 중15개는 불변이고, 기존 runner의 `.reports/u1/context-http-diagnostics.json`만230→604bytes/SHA256 `8ec4dd1e6c38d2e1bad72a6651adfa2bc2a81d4ee05bc35cece79cf895d6dc8a`로 자동 갱신됐다. 이전/새 exactbytes를 모두 보존했으며 이전 원문을 복원해 덮어쓰지 않았다. PC reporter와 tool의 combined stdout/stderr는 private `/var/folders/p7/nswgd_5919z69r72m_ykpvdc0000gn/T/oms-u2-before-fixture-plan-2unbpqo_/execution-pc-binding-repair-20261011/`에 보존했다. stream 개별 구분은 관측하지 못했다. 종료 후 대상8포트 listener0 및 해당 fixture/Next/Playwright 프로세스 잔여0을 확인했다.

이 선택 검증으로 확인한 것은 이번 fixture 원인 수정과 기존 PC9의 실제 연결 성공이다. 산출물 정리·독립 검토·정식 Construction 체크포인트는 아직 별도 절차로 남았다. 기존 미해결 문제·과거 실패/원문 손실·실제 활성화 HOLD·부하/DR 후속은 바꾸지 않는다.
