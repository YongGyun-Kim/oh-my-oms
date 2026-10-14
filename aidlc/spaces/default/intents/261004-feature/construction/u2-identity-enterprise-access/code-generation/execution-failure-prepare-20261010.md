# U2 두 번째 Retry 전체 검증 실패 인계

**FAIL / 사람의 Retry·Skip·Abort 결정 대기**다. 새 수정·시험·collector 재실행을 중지했으며 성공 code-summary·traceability·source-manifest·리뷰·완료 기록은 작성하지 않았다.

- 동결 source: `a90ace63f16023840ecf8314e0976f9514de4ee08ec1581f3e9766a23ec8571f`. 종료 후 재계산도 동일하다.
- 전체 명령: `OMS_U2_SYNTHETIC_PROFILE=approved-local-only node --import tsx scripts/u2/ci-full-proof.ts all` (Node22.23.3).
- controller session28053/PID23866: 실제 exit1 / `PROOF_EXECUTION_FAILED`. PID 종료 및 exact prepare 명령 프로세스 부재를 확인했다.

## 실제 결과와 준비 실패

U1 unit571/571·integration168/168·coverage739/739, U2 unit431/431·integration267/267·coverage698/698, whole type/lint/format, PC4/4(skip/flaky0), synth·image-build·security·runtime-security-tests·같은 image runtime-security가 통과했다. 현재 source의 직접 testable 제품 코드 실행행 합집합은 **9127/11369 = 80.27970797783446%**, 미실행 분모를 유지한 strict80% PASS다.

실제 image는 `sha256:d0ee372b4d51287bd73d74d6bea4d642c8b5ee6ce872452ece42868eefcaa280`이며 runtime 보고서의 passed=true·cleanupFailed=false를 확인했다. 실제 Cognito/회사망·실활성 증거로 승격하지 않는다.

실패 단계는 **performance-prepare**다. receipt의 명령은 `node --import tsx scripts/u2/performance.ts --prepare`, 시작 `2026-10-10T08:52:09.896Z` → 종료 `2026-10-10T08:52:10.683Z`, passed=false다. 준비 로그는 **실제0bytes**여서 stdout/stderr·구체 예외·실제 seed 진척을 관측하지 못했다. 준비 child의 개별 exit code는 receipt에 기록되지 않아 단정하지 않는다.

receipt의 실패 witness SHA `e3b0c442…`를 실제 profile 파일0byte로 읽은 중간 보고는 정정한다. 실제 `.runtime/u2/performance-profile.json`은 **72996bytes/SHA1a5e8b4d…**로 source792의 기존 원문과 동일하다. 새 source의 준비 산출물로 사용할 수 없으며 복사·복구·새 proof로 재분류하지 않았다. 구체 원인은 미확정이고, Retry 때 준비 명령의 실제 dispatcher/새 산출물 생성 연결부터 확인해야 한다.

현재 source의 **100k 규모 준비 명령은 실제 실행됐으나 실패하여 완료 미확인**이다. 실제 seed 진척은 미관측이며 시작되지 않았다고 추정하지 않는다. **50분 profile·large restore/RTO/RPO·최종 release gate는 미실행**이다. source792의 기존50분 FAIL·미실행restore는 그대로 역사적 근거로 남는다.

## exact 원문 보존

기존 owning archiver로 `.reports/u2/history/<SHA>-<basename>`에 보존하고 모든 원본/archive의 exact bytes 동일성을 확인했다.

| 원본 경로 | bytes | SHA256 |
|---|---:|---|
| `.reports/u2/validation-source.json` | 63135 | `fcd502966b473830fe4d43f96315a334ae837643ce4f950437c240013ba8cff8` |
| `.reports/u2/project-performance-prepare.log` | 0 | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855` |
| `.runtime/u2/performance-profile.json` (기존 source792 자료) | 72996 | `1a5e8b4da9085c7ea3f3df040de579763df80075ff1a9f53fe8f3a6e82a0d1e2` |
| `.reports/u2/security.json` | 697 | `1dbeecbab979396231dfdc77faf133c915bcd769710f1ecc435b3df849d06c3e` |
| `.reports/u2/runtime-security.json` | 2812 | `29e779d1e41670d413687e2f3b49da9273386e14d3591c82dea218d67d4572d3` |

원래 U1 unit 상세의 현재 보존 hash `b0d001e61fb14673305a56307ce38cd5de866f11d2e314826f59817ec4f2e745`, integration `dae93870ed96d64bd749dead288f90a9e2a0009bdd0a8bd4683153994b108269`, source792 performance FAIL `25ac624196470c9ae425e07d5fd64c4017ed3d1096e75dcf2d6f39ef245474f0`는 불변이다. 원래563 상세 및 최초 SAST 상세 원본의 두 gap은 **OPEN**, U1 R01/R02도 후속 독립 리뷰 전 **OPEN**이다.

이번 수정은 PC fixture의 진단 body 읽기 의존성을 실제 기능 gate와 분리한 것이다. 진단 CDP 실패만 주입한 RED→GREEN과 실제3PC파일4/4를 보존했고 BODY_UNAVAILABLE을 숨기지 않았다. 원래 CDP 오류 원인 규명과는 구분한다. 원래1df 실패 packet은 그대로이며 observer200 정정은 별도 status-addendum에 기록했다. 다음 행동은 parent의 사람 실패 질문이며, 새 실행은 그 결정 이후에만 진행한다.
