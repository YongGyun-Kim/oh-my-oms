# U2 파일럿 시간 하한 실패 인계 — 2026-10-11 KST

**FAIL / 인간 Retry·Skip·Abort 결정 대기.** 실제 시각은 아래 UTC2026-10-10이다. 새 source 수정·시험·DB 변경·collector 재실행을 중지했다. 성공 summary·manifest·review·완료는 작성하지 않았다.

## 실제 종료와 판정

- source `8972b7b0e26cbd9748c9ad80153dd9ecabe90e1ea066b70f421243f40a88d803`; 종료 뒤 현재 digest 일치. 전체 명령 `OMS_U2_SYNTHETIC_PROFILE=approved-local-only node --import tsx scripts/u2/ci-full-proof.ts all`, controller40381/PID80449 실제 exit1, `PROOF_EXECUTION_FAILED` / `performance`.
- child `npm run test:u2:performance`: 15:11:43.002Z→15:22:55.978Z, exit1/signal=null/errorCode=null/expired=false/logFailed=false, stdout4228/stderr0 bytes. report fresh=true·finished=true·passed=false.
- 총3900요청, 네 단계 모두 읽기80/변경20을 유지했고 기술·정확성 오류는 모두0이다. NORMAL p95 읽기141.42325ms/변경194.623625ms, status-contract/예상외 응답 오류0, 최대 응답52388bytes, worker5종0이다. 실패는 응답시간·기술오류가 아니라 **실측 시간 하한 미달**이다.

| 단계 | 요청 | 실제 elapsed(ms) | 원래 하한(ms) | 판정 |
|---|---:|---:|---:|---|
| NORMAL | 1500 | 299885.091333 | 300000 | FAIL, 약114.9ms 부족 |
| PEAK | 1200 | 60030.027875 | 60000 | PASS |
| RECOVERY | 600 | 119838.427 | 120000 | FAIL |
| HOLD | 600 | 119882.437041 | 120000 | FAIL |

NORMAL 시작15:12:22.897Z, 첫 sample(number0/readOrderAssessment)15:12:23.105Z, 마지막 sample(number1499/registerProduct)15:17:22.791Z, PEAK 시작15:17:22.793Z가 원문에 있다. 현재 source의 요청 loop는 `due=start+issued*1000/rate`로 전체 요청을 발행하고 `Promise.all(running)` 직후 elapsed를 측정한다(`scripts/u2/performance.ts`의 run 함수). 마지막 완료 뒤 고정 phase 종료 경계까지 기다리는 호출은 없다. evaluator는 elapsed≥seconds*1000 및 ≤seconds*1000+10000을 그대로 요구한다. 요청 완료와 전체 계측 기간은 같은 조건이 아니며 이번 값을 반올림·수정·성공 재분류하지 않는다.

## 실제 부가 결과·미실행

최종 workerFailures0/5종0, UI·purpose·resource budget 및 worker recovery=true이다. 통지 first-start12표본 p95/max163ms, U2 first-start58표본 p95494ms/missing0이 실제 통과했다. independent ACK782행(EnterpriseAccess340·OrderAcceptance32·ProductCatalog390·IdentityRecovery20)을 보존했지만, 이를 복구 전수대조·RPO0 증거로 승격하지 않는다.

앞선 U1 unit571/integration168/coverage739, U2 unit449/integration272/coverage721, 전체9246/11518=80.27435318631707%, PC5/5, check/synth/image/security/same-image runtime·파일럿 준비는 해당 source에서 통과했다. **파일럿 복구/RTO·RPO 및 최종 release는 미실행**이다.

PID80449 종료, 해당 collector/performance/recovery 명령 없음, TCP3300/3301/34800/34801 listener 없음을 확인했다. 추가 reset·전역 Docker 정리·환경 변경 없이 기존 finally 정리를 마쳤다.

## exact 원문 보존

기존 `preserveOutput`으로 `.reports/u2/history/<전체SHA>-<basename>`에 보존하고 원본/archive byte equality를 확인했다.

| 경로 | bytes | SHA256 |
|---|---:|---|
| `.reports/u2/validation-source.json` | 71454 | `12cad3428cafd9cca3fc2b88abe9a37b12121fe711cbf1102f2cda885e183646` |
| `.reports/u2/performance.json` | 6785 | `9b86fc08bbe2232bade505a5bc8a38c7a8684871011fed93a66a696be9450183` |
| `.reports/u2/project-performance.log` | 4228 | `69287832b56077f22412d120ba7ed00e455ff828d4310371da200a5b93a4cbe6` |
| `.reports/u2/performance-samples.jsonl` | 1201794 | `2acc17ca23c415190a64f06bdff3b268e8aa962fdb8e950835adf521767feaa7` |
| `.reports/u2/performance-ack.jsonl` | 468966 | `88c8b2f77753131bdb806d895aae7df750217cba4c6018accd46167b735dc9df` |
| `.reports/u2/work-first-start-profile.json` | 27355 | `7c273906645391909ccbe1fc38d8ca679c41c354a1086f4282672390596e71ae` |
| `.reports/u2/worker-recovery-profile.json` | 154085 | `30b51ee3717e9885118408e7273b6af92f701de1ea3722df1783ec5aba6f512b` |

performance-source 및 새 private profile 원문도 exact history에 보존했다. Retry 최소 후보는 요청 수·비율·응답 측정·상하한을 그대로 둔 채 고정 phase 종료 경계까지 **실제로** 계측하는 대기를 좁은 회귀로 검증하는 것이다. 아직 새 진단·수정·실행은 하지 않았다.

확장100k/50분 Deferred, 원래 U1 상세563건/SAST child 상세 원본 provenance2건 OPEN, U1 R01/R02 OPEN, 실제 제공자·회사망·운영/수신 증거 UNVERIFIED/HOLD를 유지한다. 과거 TOTP 실패 시각과 terminal blocked1 code의 미관측 제한도 유지한다.
