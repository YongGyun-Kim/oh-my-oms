# 파일럿 부하 시작 전 실패 인계

현재 source는 `2a3f7c0881614cf4cb2cf82f07131764976f1751284433acfc8ceb4f09351d45`다. 단일 collector session98622/PID73668은 performance FAIL로 exit1을 반환했다. 추가 source/시험/DB 변경·재실행을 중단했으며 성공 summary/traceability/manifest/review/완료 기록을 만들지 않았다.

## 실제 완료와 미실행

현재 source의 U1 unit571/571·integration168/168·coverage739/739, U2 unit442/442·integration268/268·coverage710/710, PC4/4(skip/flaky0), check/synth/image/scanner/동일 이미지 runtime 보안은 통과했다. 전체 직접 testable 제품·미실행 포함 coverage 합집합은9234/11501=80.28867055038693%다. image는 `sha256:8355b3517190e8bda8d5e084c550d92daf1845a32c03b70504cc2ee5107eab82`다. 이 결과는 부하/복구 성공을 뜻하지 않는다.

새 준비는10:35:59.804Z→10:38:58.197Z, child exitCode0/signal null/errorCode null/expired false/logFailed false, stdout336/stderr0bytes, artifact fresh=true다. 새 private profile은 `u2-pilot-v1`, profileId `b2725c1b-181c-42f0-97b6-7a3e6b0c44aa`, preparedAt10:38:58.149Z다. 선언 규모는기업10/고객100/직원10/상품1000/주문10000·평균5/max50이며 실제 저장된 Ref 배열은기업/role/member/contact 각각10, cachedProducts100이다. 준비 command 완료와 이 metadata를 확인했으며 전체 DB 행 수는 별도 SQL로 실측하지 않았다. 실제 복구 전 규모 대조는 미실행이다.

performance는10:38:58.219Z→10:39:38.174Z, child exitCode1/signal null/errorCode null/expired false/logFailed false, stdout285/stderr624bytes다. 로그에는 실제 MFA 세션10/20·20/20 checkpoint와 `TypeError`, `ProfileUi.start`의 scripts/u1/profile-ui.ts:23 stack이 남았다. 해당 owning source는17–35행에서 고객/직원 index `[0,90]`을 고정 선택한다. 현재20개 client에서 index90의 cookieSnapshot 접근이 없는 client를 참조하는 정합성 결함을 확인했다. raw error message·cookie·DOM·credentials는 인계하지 않는다.

NORMAL phase-start는0건, 샘플 파일은0bytes다. 목적 흐름의 원래 보호된 독립 ACK2행까지 생성됐고10분 부하는 시작되지 않았다. restore와 최종 release 검증은 미실행이다. performance.json은 이전 source792의5739bytes 실패 보고서가 그대로 남았으므로 current report가 아니다. receipt의 empty SHA는 stale witness이며 이 실제 파일의 SHA와 구분한다.

## 원문과 종료

아래 원문은 `.reports/u2/history/<SHA>-<basename>`에서 exact bytes를 확인했다.

| 경로 | bytes | SHA256 |
|---|---:|---|
| .reports/u2/validation-source.json | 71350 | 3375f4d5cf589175ec8a590eb1990809b255602f8d4336c23f02efc12808c2d2 |
| .reports/u2/project-performance.log | 909 | 41ece4b81ae7e1f0e94db3485485ad6b684f428540647dce7e86e1758cca73a6 |
| .reports/u2/project-performance-prepare.log | 336 | 495aabf9de1fb8b585fc9e2203495cf79d6657c05fcf772a8363937c2216379e |
| .runtime/u2/performance-profile.json | 32309 | 59f2447e3c8d2aa339569ae669d2be667d2e3e7c30830ec01e466d279eb55f7e |
| .reports/u2/performance-ack.jsonl | 1340 | 384e706fe187b964226351db06c733b84f3cdbbc57ff164893a8f011230e0b8f |
| .reports/u2/performance-samples.jsonl | 0 | e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855 |
| .reports/u2/performance-source.json | 58198 | 0a70ade66b9e60a4ed3cdc966312629857d383570dc0897b94732fd3ff231fb9 |
| .reports/project/all-job-summary.json | 518 | dd215144c58125bbf7b2af647ee8e4882dcfd9f835c59ee12caeafcf26a8af16 |

PID73668과 collector/performance 명령은 남지 않았다.3300/3301/34800/34801 LISTEN도 없다. 부분 browser startup의 개별 PID/종료 이벤트는 수집하지 않았으므로 전역 browser 부재를 별도로 주장하지 않는다. 기존 U1 unit/integration의 b0d001…/dae938… 원문 hash는 유지된다.

## 다음 인간 결정

conductor의 Retry/Skip/Abort 결정을 기다린다. Retry 후보는 U1 기본 `[0,90]`을 보존하면서 U2의 등록된 고객/직원 대표 index를 명시 주입하고, 부분 startup 실패 cleanup을 같은 owning 경계에서 검증하는 최소 회귀/수정이다. 현재 수정/재실행하지 않았다. 기존100k/50분은 Deferred이며 역사적 FAIL·사용자 interruption·원본 provenance gap2건과 U1 R01/R02는 OPEN을 유지한다. 실제 AWS/Cognito/회사망/수신자 증거와 real activation은 계속 미검증/HOLD다.
