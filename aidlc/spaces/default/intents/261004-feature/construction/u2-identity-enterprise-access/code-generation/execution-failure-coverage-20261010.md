# U2 전체 검증 실패 인계 — 2026-10-10

상태: **FAIL / 인간 Retry·Skip·Abort 결정 대기**. 새 source 수정·시험·collector 재실행을 중지했다. 성공 산출물·manifest·review·단계 완료를 작성하지 않았다.

## 실제 실행과 종료

- source: `65f9e5e3746e39bef13a57dd77e5463b5baa205bb5549e187fe569886eb8be6e`. 종료 뒤 현재 identity와 receipt의 identity가 일치한다.
- 전체 명령: `OMS_U2_SYNTHETIC_PROFILE=approved-local-only node --import tsx scripts/u2/ci-full-proof.ts all` (Node22.23.3 private runtime PATH). controller session75530 / PID42024, 실제 exit1, `PROOF_EXECUTION_FAILED` / `u2-coverage`.
- 이번 source의 U1 unit571/571, integration168/168, check PASS, U1 coverage739/739가 완료됐다.
- 실패 child 명령 `npm run test:u2:coverage`: 11:29:18.441Z→11:33:31.725Z, exitCode1, signal=null, errorCode=null, expired=false, logFailed=false, stdout37622 / stderr2222 bytes. deadline 초과·spawn 오류로 기록되지 않았다.
- U2 시험716개 중715통과 / 1실패 / pending0 / todo0. 파일57개 중56통과 / 1실패. 실패 뒤 `coverage-final.json`·`coverage-summary.json`·`lcov.info`·`evidence.json`이 없고 reporter는 coverage-final 읽기 ENOENT를 기록했다. 전체80% 합집합은 미판정이며 부분 결과를 전체 통과로 인정하지 않는다.

## 관측된 실패와 제한

`tests/u2/integration/recovery-completion.spec.ts`의 “실제 password challenge→새 합성 TOTP 확인→새 10코드 보관 ACK→완료의 전 경로를 연결하며 업무 권한을 만들지 않는다” 시험이 실패했다. 고정 오류 문구는 “원래 새 challenge/실제 합성 TOTP를 확인하세요.”이다.

실제 stack: `tests/u2/fixtures/provider.ts:239:5` → `packages/core/src/identity-factor.ts:756:32` 및 `754:20` → `tests/u2/integration/recovery-completion.spec.ts:461:18` (contracts/errors.ts:17:21·execution-budget.ts:49:22·identity-consumer.ts:52:12 포함). 원래 challenge/TOTP 비교가 거절된 것은 관측됐지만, 생성·검증 step/시각·실제 비교 피연산자는 수집되지 않아 구체 원인은 **미확정**이다. 시간 경계나 제품 결함으로 단정하지 않는다.

직전 선택 PC 회귀는 같은 source에서 실제2/2·skip/flaky0으로 통과했고, 대표 고객/직원 MFA cookie 이관 및 소유 Playwright 브라우저 disconnect를 확인했다. 이 선택 결과는 전체 PC·20세션·10분 부하·복구 완료의 대체 근거가 아니다.

## 원문 보존

아래 canonical bytes를 기존 `preserveOutput`으로 `.reports/u2/history/<전체SHA>-<basename>`에 exact 보존하고 원본·archive byte equality를 대조했다.

| 경로 | bytes | SHA256 |
|---|---:|---|
| `.reports/u2/validation-source.json` | 61788 | `e17c958420f5a8b42274bf7b39f6e1258588b290a6146553e8074ffecd679965` |
| `.reports/u2/project-u2-coverage.log` | 39844 | `3d2679c35447b026164549f15a929427b9a41e5ed32e20241024e35b2f468b43` |
| `.reports/u2/coverage.json` | 3356265 | `3db656350c2d7066930867859677660ad2863c6a43287bb245d8f3ac2592cf98` |
| `.reports/project/current-u1-unit.json` | 257187 | `dfbef38f542d818859ab29c185323ae747fe70737ab6e90ca427054852aabffe` |
| `.reports/project/current-u1-integration.json` | 77237 | `5ae516b0d270d8acc959e5ff322ccb52823d50c068fb9c22ffc2d65cd315714b` |
| `.reports/project/current-u1-coverage/evidence.json` | 334328 | `04c3173f21ce7bfa45f07ded181899b0346a1eda4732bf88dc0893ec2add280e` |
| `.reports/u2/check.json` | 157 | `46d17aa4d2677bd18569d7560d6c466a02542a2b299cedf1a3efaf928baa8bfa` |

기존 U1 unit6818bytes/SHA `b0d001e61fb14673305a56307ce38cd5de866f11d2e314826f59817ec4f2e745`, integration77183bytes/SHA `dae93870ed96d64bd749dead288f90a9e2a0009bdd0a8bd4683153994b108269`는 불변이다. 이전 source792 performance5739bytes/SHA `25ac624196470c9ae425e07d5fd64c4017ed3d1096e75dcf2d6f39ef245474f0`도 그대로며 현재 부하 결과가 아니다.

## 미실행·정리·다음 인간 결정

전체 aggregate·이번 전체 PC·synth·image·security·same-image runtime·pilot prepare·10분 부하·pilot 대규모 복구·최종 release gate는 이번 collector에서 미실행이다. 이후 PID42024 및 소유 child53981 종료를 확인했고, 해당 collector/performance/recovery 명령과 TCP3300/3301/34800/34801 listener가 없었다. DB data 변경·추가 reset·전역 Docker 정리는 하지 않았다. 모든 호스트 프로세스나 컨테이너 부재를 이 관측으로 주장하지 않는다.

Retry 후보는 해당 실패 시험의 실제 challenge/주입 시각과 TOTP 생성·검증 경계를 안전한 enum/boolean/step로 좁게 재현하는 것이다. 원인 관측→실패 회귀→최소 owning 수정→관련 선택 검증 뒤 새 source의 전체 proof가 필요하다. 허용 skew·기한·권위·skip·80%·성능·ACK·RTO/RPO 기준을 바꾸거나 우연한 반복으로 통과시키지 않는다. 아직 새 진단/수정/재실행은 시작하지 않았다.

확장100k/50분은 Deferred 유지. 원래 U1 상세563건 report 및 최초 실패 SAST child 상세 원본의 provenance gap **2건 OPEN**, U1 R01/R02 **OPEN**, 실제 공급자·회사망·운영 권위/수신 증거는 UNVERIFIED/HOLD를 유지한다. 새 결과는 과거 원본 복구·위험 수용·review 폐쇄 근거가 아니다.
