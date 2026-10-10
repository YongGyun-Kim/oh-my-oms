# U2 PC E2E 전체 검증 실패 인계 — 2026-10-10

**FAIL / 인간 Retry·Skip·Abort 결정 대기.** 새 source 수정·시험·collector 재실행을 중지했다. 성공 summary·manifest·review·단계 완료는 작성하지 않았다.

## 실제 종료·관측

- source `8b99266daba80c839c67b46629c45e3f55d84e6e857769153c46d4a3f74aafaf`; 종료 뒤 현재 digest 일치. command `OMS_U2_SYNTHETIC_PROFILE=approved-local-only node --import tsx scripts/u2/ci-full-proof.ts all`, controller71786/PID22543 실제 exit1, `PROOF_EXECUTION_FAILED` / `u2-e2e`.
- E2E child 12:56:27.188Z→12:56:41.057Z: exitCode1, signal=null, errorCode=null, expired=false, logFailed=false; stdout27401 / stderr4488 bytes. fresh JSON exists=true, fresh=true. deadline 초과나 spawn 오류로 기록되지 않았다.
- E2E5개 중4통과/1실패, skipped0/flaky0, 재시도0, runner errors0. 기존 초대 수락·진단 CDP 독립 gate·복구 conjunction·직원 경계 4개는 통과했다.
- 실패: `tests/u2/e2e/staff-boundary.spec.ts:43`, “파일럿 대표 고객/직원의 실제 MFA cookie 이관은 PC1280 두 문맥을 시작하고 연결을 정리한다”. 실제393ms, error location `tests/u2/fixtures/pc.ts:251:31`의 MFA factor 응답 HTTP200 기대/401 관측. 해당 helper는 status assertion을 body parse 전에 수행한다.
- 마지막 실패 흐름은 CHALLENGE_REQUIRED200→MFA_REQUIRED200→factor401/phase=null로 관측됐다. cookie 이관·소유 ProfileUi 브라우저 기동/종료 assertion에는 도달하지 않았다. code/secret/cookie 원문은 출력하지 않았다. 이번 error는 Network.getResponseBody/CDP 오류·timeout·closed target·browser launch 실패가 아니며, 과거 CDP 사건과 같은 원인으로 추정하지 않는다. 구체401 원인은 **미확정**이다.

## 앞선 통과·후속 미실행

같은 source에서 U1 unit571/571·integration168/168·coverage739/739, check PASS, U2 coverage718/718·unit448/448·integration270/270, 전체 합집합9245/11514=80.29355567135661%가 실제 통과했다. 이는 해당 source의 앞선 결과이며 전체 검증 완료를 뜻하지 않는다.

이번 synth·image·security·same-image runtime·pilot prepare·10분 부하·pilot 복구·최종 release는 미실행이다. 선택 PG22 GREEN의 생성·검증 step 분리와 권위 정각 만료/옛코드 거부는 별도 보존됐지만, 원래 source65f9 전체 TOTP 실패의 시각은 미관측으로 유지한다. 이전 선택 PC2/2는 이전 source65f9의 선택 증거이며 이번 전체 E2E 실패를 대체하지 않는다.

## exact 원문 보존

각 원본을 기존 `preserveOutput`으로 `.reports/u2/history/<전체SHA>-<basename>`에 보존하고 exact byte equality를 대조했다. U1/U2 coverage raw JSON·summary·lcov·evidence·reporter, 현재 U1/U2 unit/integration/check도 같은 방식으로 보존했다.

| 경로 | bytes | SHA256 |
|---|---:|---|
| `.reports/u2/validation-source.json` | 65237 | `aef3050bbee9246e36bf67bfbe67ea7b1772a36395914a09c532b4b2c06a9eed` |
| `.reports/u2/e2e.json` | 48945 | `2960a0a023a28b52e3f094c5d671bc16d52dfafef11b0fcc989efe31f913aac5` |
| `.reports/u2/project-u2-e2e.log` | 31889 | `54d7b3a325b0f4bf72cf7a9e2b38d1b8de5ab7441742824b37aec372d273cb8b` |
| `.reports/u2/integration.json` | 131370 | `dcf1c7c8fa40ac2dda9c544c57d3e3e01038684caf5c969c92ab0b8e619d68ff` |
| `.reports/u2/coverage/evidence.json` | 364060 | `3fa9085700b20c628a04cf8dae50cce8b1c57dace3e088be60f3c6afe59792a5` |
| `.reports/project/coverage-aggregate.json` | 379865 | `1ae7e3624fb76fa28aae20e6792490565dc6fa986a9bf2105ab0d91e0b79aaee` |

기존 U1 unit6818bytes/SHA `b0d001e61fb14673305a56307ce38cd5de866f11d2e314826f59817ec4f2e745`, integration77183bytes/SHA `dae93870ed96d64bd749dead288f90a9e2a0009bdd0a8bd4683153994b108269` 불변. 이전 source792 performance5739bytes/SHA `25ac624196470c9ae425e07d5fd64c4017ed3d1096e75dcf2d6f39ef245474f0`도 불변이며 현재 부하 결과가 아니다.

## 정리·다음 결정

PID22543 종료, 해당 collector/performance/recovery 명령 없음, TCP3300/3301/34800/34801 listener 없음을 확인했다. 새 DB reset·전역 Docker 정리·환경 변경은 하지 않았다. 이번 실패에서 기동하지 않은 ProfileUi의 partial cleanup을 실제 검증했다고 주장하지 않는다.

Retry 최소 후보는 단독 선택 실행과 전체 PC 순서에서 해당 대표 account의 현재 MFA 상태/fixture 입력 관계를 안전 boolean·고정 code로 대조해 401 원인을 좁히는 것이다. 재현 전 다른 시험의 상태 변경이나 stale secret을 원인으로 단정하지 않는다. 제품 권위·허용 skew·기한·보안/80%·처리정확성/ACK/RTO/RPO 기준을 유지하고, 인간 결정 전 새 진단·수정·실행은 하지 않는다.

확장100k/50분 Deferred, 원래 상세563건 U1 report와 최초 실패 SAST child 상세 원본의 provenance gap2건 **OPEN**, U1 R01/R02 **OPEN**, 실제 공급자·회사망·운영/수신 증거 UNVERIFIED/HOLD를 유지한다.
