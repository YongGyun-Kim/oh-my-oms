# U2 PC fixture 수리 — 선택 검증 및 준비 실패

## 현재 결과

사용자가 승인한 두 fixture 보완과 신규 회귀 시험을 구현했다. 단위16개·타입·lint·format과 선택 PostgreSQL11개는 통과했지만, **U1 PC 준비가 실패해 실제 시나리오는0개 실행됐다.** U2 PC5는 시작하지 않았다. U2는 미완료이며 독립 검토·정식 체크포인트도 이번 수리 후 실행하지 않았다. 재시도·추가 진단·권한/시간 제한 변경은 하지 않았다.

실제 오류는 `FIXTURE_STAFF_SOURCE`, 오류 객체의 status는503이다. 위치는 `tests/u1/fixtures/staff-bootstrap.ts:17` → `tests/u1/fixtures/local-service.ts:97`이다. 현재 보호 STAFF Account 조건을 만족하지 못했음을 관측했으며 구체 원인은 미확정이다. API 개방 전 실패여서 실제 HTTP503 응답을 관측한 것으로 표현하지 않는다. 앞선 directory `SECURITY_BACKFILL_REQUIRED` 실패와 이번 준비 실패를 구분한다.

native 실행 brief는 stdout exact bytes를 유지했다. staged `git diff --check`가 그 원문의 EOF 빈 줄1개를 지적했으며, 원문 SHA 보존을 위해 정규화하지 않았다. 제품/시험 소스와 수기 산출물의 diff 검사는 별도로 확인한다.

## 소스와 변경 범위

검증 당시 HEAD는 `5de6f546f7db63f853c922729a74f64c5875bf94`, source identity는 `1d44a821cf09b90796ff755dc14a2effd2468d0299584ceae6d1db2d5533f990` /504파일이며 실행 전후 동일했다. 수정2·신규1·삭제0, 제품 코드 변경0이다. 후속 커밋으로 HEAD가 바뀌면 이 검증을 새 identity의 proof로 재라벨하지 않는다.

| 파일 | bytes | SHA256 |
|---|---:|---|
| tests/u1/fixtures/local-service.ts | 6896 | `8ab7ae0b01bb40d36070f3d547235de4d35b8bbcb32393a80184845144e1d4fb` |
| tests/u1/fixtures/staff-bootstrap.ts | 4213 | `2acc1efbca3f5f420030b1d999fd69f2659d77798d896dd7fbfe17406f194496` |
| tests/u2/unit/u1-pc-fixture-preparation.spec.ts | 15028 | `473f722f182832c7d8478f93fd5f80d22eb088ccbf9faf0bbaa4f5faef81a8dd` |

기존 backfill을 계정 seed 뒤/manager seed 앞에 연결하고, 격리된 로컬 대상 확인과 최초 fence의 보호 transaction 기록을 추가했다. 기존 보호 fence 보존·불일치 거절·최소 권한과 원래 resultRefs를 유지한다. 신규 단위 시험은 함수 호출/준비 순서·거절·보존·transaction rollback16case다. 통과한 mock 시험은 실제 PostgreSQL fixture 준비 성공을 대신하지 않는다.

## 실행 결과와 원문 보존

명령은 [승인 지침](../construction/u2-identity-enterprise-access/code-generation/unit-test-instructions.md)의 exact 선택 명령을 사용했다. 첫 format 실패 후 소유 두 파일의 형식만 정리하고 새 source로 Luna가 네 단순 검사를 다시 실행했다. 각 첫 결과와 두 번째 결과를 분리 보존했다.

| 검증 | 실제 결과 | 보고서 / bytes / SHA256 |
|---|---|---|
| Luna 단위 | exit0,16PASS/실패0 | `.reports/u2/selected/pc-fixture-repair-unit-20261011-2.json` /6464 /`e1f3f083092672d433330ebe8359afa5173bcce6636f0584e912c0655413a20f` |
| Luna 타입·ESLint·Prettier | 각각 exit0 | private `run-summary-2.json` 및 명령별 stdout/stderr/exit 원문 |
| PG legacy backfill/admission | exit0,선택10PASS/실패0,필터 미선택8 | `.reports/u2/selected/pc-fixture-repair-backfill-20261011-1.json` /8426 /`32fb08ee35d16696c192191ba0e624d703d126e05aff297bd41a9035f6737bf1` |
| PG 기존 보호 fence | exit0,선택1PASS/실패0,필터 미선택10 | `.reports/u2/selected/pc-fixture-repair-fence-20261011-1.json` /5704 /`7903802db248eb933f83ad750e28e2953553fc4f153464421eb128acee42f9e4` |
| U1 PC4 | exit1,준비 실패/실행0case | `.reports/u2/selected/pc-fixture-repair-u1-pc4-20261011-1.json` /3028 /`92888c42aac128351815e800d1ac68b24ca44c80f12581720889fcd1c1bb8064` |
| U2 PC5 | 미실행 | 결과 없음 |

Luna의 권한 제한 원문/요약은 private `/var/folders/p7/nswgd_5919z69r72m_ykpvdc0000gn/T/oms-u2-unit-preservation-gc3fuqok/`에 있다. PG/PC 원문은 기존 private archive `/var/folders/p7/nswgd_5919z69r72m_ykpvdc0000gn/T/oms-u2-before-fixture-plan-2unbpqo_/execution-pc-fixture-repair-20261011/`에 보존했다. PC tool 반환 원문1700bytes/SHA256 `51ae82eeba2471c90070f0c52f369bcd921c2ac0c7551a984962e3e4f2813a2f`는 `u1-pc4-tool-output.json`의 combined stdout/stderr이며 각 stream은 구분 관측하지 못했다. `u1-pc4-report-exact.json`의 실패 reporter exact-byte base64 사본도 대조 일치했다. private/ignored 원문은 Git에 게시하지 않았으며 이 문서는 안전한 결과 metadata를 보존한다.

사전 보호10보고서와 첫 신규 unit 보고서를 합한11개 보고서는 hash가 유지됐다. 대상4포트 listener0 및 소유 fixture/Next 프로세스 잔여0을 확인했다. 이전503파일의 `8972b7b0…` proof는 역사적 기록이며 현재 source와 fixture2개의 bytes가 다르고 신규 시험1개가 추가됐다. 이전 전체 coverage·보안/성능 결과를 현재 source PASS로 표현하지 않는다.

## 남은 작업과 보류

다음 처리는 실제 보호 STAFF Account 준비 조건의 실패 원인을 좁혀 확인하는 것이다. 원인을 확인하기 전 추가 수정이나 같은 PC 시험 재실행은 하지 않는다. 그 뒤 필요한 최소 수정·관련 Luna 회귀·기존 U1 PC4/U2 PC5, 산출물/strict manifest/쓰기 ledger 정리, 새 독립 검토와 정식 체크포인트가 남아 있다.

기존 Major finding·설계 보완·과거 보고서 provenance gap·부하 시간 하한 FAIL·DR 후속·실제 활성화 HOLD는 그대로 유지한다. 이번 실행에서 전체 collector/coverage/image/scanner·대규모 부하/DR·AWS/Cognito/SQS 실제 연동·실제 메시지·배포를 수행하지 않았다. U3는 시작하지 않았다.
