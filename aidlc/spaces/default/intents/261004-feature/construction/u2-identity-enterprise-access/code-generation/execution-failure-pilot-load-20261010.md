# U2 파일럿 부하 전체 검증 실패 인계 — 2026-10-10

**FAIL / 인간 Retry·Skip·Abort 결정 대기.** 새 source 수정·시험·collector 재실행을 중지했다. 성공 summary·manifest·review·단계 완료는 작성하지 않았다.

## 실제 실행·종료

- source `8742456ec6f616371e60aea1c3730ca9923985f034caee49cd006a2599aed778`; 종료 뒤 현재 digest 일치. 전체 명령 `OMS_U2_SYNTHETIC_PROFILE=approved-local-only node --import tsx scripts/u2/ci-full-proof.ts all`, controller53887/PID4406 실제 exit1, `PROOF_EXECUTION_FAILED` / `performance`.
- 준비 child `node --import tsx scripts/u2/performance.ts --prepare`: 13:23:06.480Z→13:26:05.057Z, exit0/signal=null/errorCode=null/expired=false/logFailed=false, stdout336/stderr0 bytes, fresh=true.
- 실제 새 private profile id `6a680435-86a3-4256-a6b7-d41d8d6aee35`, seed `u2-pilot-v1`, prepared13:26:05.012Z. 선언규모는 기업10·고객100·직원10·상품1000·주문10000·평균5/최대50품목이다. 준비 완료와 profile 생성을 확인했으며 복구 단계의 독립 SQL 규모 실측은 미실행이다.
- 부하 child `npm run test:u2:performance`: 13:26:05.080Z→13:37:18.458Z, exit1/signal=null/errorCode=null/expired=false/logFailed=false, stdout4040/stderr119 bytes. report exists/fresh=true, `finished=true`, `passed=false`.

## 10분 실제 관측

NORMAL13:26:45.008Z→PEAK13:31:45.974Z→RECOVERY13:32:47.141Z→HOLD13:34:46.981Z로 네 단계 모두 실행됐다. 읽기80/변경20을 유지했다.

| 단계 | 요청 | 기술오류 | 오류율 | 읽기/변경 p95(ms) | 정확성실패 | 단계 판정 |
|---|---:|---:|---:|---|---:|---|
| NORMAL | 1500 | 92 | 6.1333% | 143.653 / 186.519 | 0 | FAIL |
| PEAK | 1200 | 74 | 6.1667% | 182.383 / 227.300 | 0 | 원래 정상 기준 제외 규칙으로 true; 전체 성공 아님 |
| RECOVERY | 600 | 38 | 6.3333% | 141.509 / 179.692 | 0 | FAIL |
| HOLD | 600 | 36 | 6% | 144.340 / 184.208 | 0 | FAIL |

NORMAL92건은 `reviseCustomerRole`23건 + `inviteMembership`69건이다. PEAK18+56, RECOVERY9+29, HOLD9+27건도 같은 두 행위다. 해당 sample은 모두 **status0 / problemCode INVALID_INPUT / accuracyReason EXCEPTION**이다. status0은 collector의 예외 sentinel이며 실제 HTTP0 응답을 뜻하지 않는다. 예외 sample의 accuracy=true 기록 때문에 정확성실패0은 이240건의 성공/정확성을 입증하지 않는다. invalidStatusContracts0·unexpectedResponseFailures0도 기술오류를 성공으로 바꾸지 않는다. 세부 schema/호출 경계 원인은 아직 미확정이다.

각 phase 종료의 worker reason5종은0이었으나 최종 합계 workerFailures1은 `vault-terminal-blocked`1이며 나머지4종0이다. 부하 기술오류와 별개로 유지한다. UI readiness/purpose probe/resource budget은 true, 통지 first-start12표본의 p95·max168ms는 true다. U2 first-start는0표본/started0/missingOrUnconfirmed0이지만 false, U2 worker recovery=false·workerRecoveryVerified=false다. 먼저 사용한 object 집계 helper가 boolean summary를 null이라고 잘못 설명한 보고는 이 실제 값으로 정정한다. 원문은 수정하지 않았다.

독립 ACK stream은542행(EnterpriseAccess100·OrderAcceptance32·ProductCatalog390·IdentityRecovery20)이다. 존재·행 수는 관측됐지만 부하 후 복구 전수대조/RPO0·유실/중복0를 증명한 것으로 승격하지 않는다.

## exact 원문 보존

기존 `preserveOutput`으로 각 파일을 `.reports/u2/history/<전체SHA>-<basename>`에 보존하고 원본/archive byte equality를 확인했다. 추가 worker starts/consume·first-start/recovery·UI/resources/purpose 원문도 같은 방식으로 보존했다.

| 경로 | bytes | SHA256 |
|---|---:|---|
| `.reports/u2/validation-source.json` | 71458 | `84a17ddd6cc7c74d8cf7d091bb7b1df01983aa7ecc75250add66d538e5982634` |
| `.reports/u2/performance.json` | 6445 | `036e1c0e27c1c3d9eb2b4858ecea6b45da1db323aaa6ef5bcb0e752e817be104` |
| `.reports/u2/project-performance.log` | 4159 | `d2fa04632de98d3fefb874f11c771285af5824571cc6bc9613e1986c07eab4e2` |
| `.reports/u2/performance-samples.jsonl` | 1195833 | `0640b09d519e99138137cdd16da65c1805d57541be6c5101f8f936dfa6598dbe` |
| `.reports/u2/performance-ack.jsonl` | 279935 | `36bbee1e2b5805931172ad4fbaf15be81ef84b7d7c26ccbff2347f15c2524132` |
| `.reports/u2/performance-source.json` | 58308 | `dc1306b1ae974efce4f48690195f582ce87899d94c55abf4e43079c4cd4ef72f` |
| `.runtime/u2/performance-profile.json` | 32309 | `bbc7ade895041ba26ec3ecfd281cd321672c5b78f18cb80a2deebb7218b24edb` |
| `.reports/u2/project-performance-prepare.log` | 336 | `495aabf9de1fb8b585fc9e2203495cf79d6657c05fcf772a8363937c2216379e` |
| `.reports/u2/work-first-start-profile.json` | 7342 | `6e8c7359f3ce38855d715661717f403d4d1094caae365a0c38f3d8c3c00c02d7` |
| `.reports/u2/worker-recovery-profile.json` | 78174 | `a525566e2fa0d47be555f3a7d03138c27e07c409ee86358cfe0032b8e16ad455` |

## 앞선 통과·미실행·정리

같은 source의 U1 unit571/integration168/coverage739, U2 unit448/integration270/coverage718, PC5/5(skip/flaky0), check/synth/image/security/same-image runtime은 통과했다. 전체 coverage9245/11514=80.29355567135661%이며 image는 `sha256:51945deebc6aa1abee010962c23920674cd8b526ccb1f4dfe62b6d1a1e9d4d64`이다. 이를 부하·전체 Unit 통과로 승격하지 않는다.

파일럿 복구·RTO/RPO·최종 release는 미실행이다. PID4406 종료, 해당 collector/performance/recovery 명령 없음, TCP3300/3301/34800/34801 listener 없음을 확인했다. 추가 DB reset·전역 Docker 정리·환경 변경은 하지 않았다.

기존 U1 unit6818bytes/SHA `b0d001e61fb14673305a56307ce38cd5de866f11d2e314826f59817ec4f2e745`, integration77183bytes/SHA `dae93870ed96d64bd749dead288f90a9e2a0009bdd0a8bd4683153994b108269`는 불변이다. source792의 이전 performance5739bytes/SHA `25ac624196470c9ae425e07d5fd64c4017ed3d1096e75dcf2d6f39ef245474f0`도 history의 exact bytes로 보존했다.

Retry 후보는 두 행위의 예외가 발생한 등록 schema·준비·HTTP 경계와 별개 terminal vault blocked/U2 first-start0의 원인을 고정 code/boolean으로 좁게 재현하는 것이다. 하한·분류·권한·ACK 조건을 완화하지 않으며, 인간 결정 전 새 진단·수정·시험은 하지 않는다.

확장100k/50분 Deferred, 원래 U1 상세563건 및 최초 실패 SAST child 상세 원본의 provenance gap2건 OPEN, U1 R01/R02 OPEN, 실제 제공자·회사망·운영/수신 증거 UNVERIFIED/HOLD를 유지한다. 원래 TOTP 전체 실패 시각의 미관측 제한도 유지한다.
