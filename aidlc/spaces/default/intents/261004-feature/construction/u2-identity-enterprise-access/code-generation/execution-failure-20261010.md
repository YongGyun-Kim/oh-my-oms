# U2 실행 실패 인계 — 2026-10-10

controller session29181은 **exit1 / PROOF_EXECUTION_FAILED(performance)**로 종료했다. 명령은 OMS_U2_SYNTHETIC_PROFILE=approved-local-only node --import tsx scripts/u2/ci-full-proof.ts all, 성능 receipt 실행05:46:52.729Z–06:40:32.823Z다. **finished=true / passed=false**. 새 실행·소스 수정은 중지했으며 완료 산출물·READY·리뷰/상태 기록은 만들지 않았다.

현재 workspace 재계산·receipt·report source digest는 모두 **792ed039819b926f9e9f86ff53c2705ebc395dd0eed4b37ba6d10a1508c08965**로 일치한다. controller7289/preparer38262 및 자원 보고서의 BFF PID91682/91683은 종료 후 실제 조회에서 부재였다. owning finally의 stream/UI/API/worker/DB/telemetry 종료 뒤 collector가 반환했으며 별도 정리 실행은 없다.

## 실제 실패

원래30+5+5+10분·84000요청을 수행했지만 전 구간 FAIL이다. 원래 실패 분류와 하한을 유지한다.

| 구간 | 요청 | 기술 실패 / 오류율 | 정확성 실패 |
|---|---:|---:|---:|
| NORMAL |36000|3015 / 8.375%|3151|
| PEAK |30000|14783 / 49.276667%|4131|
| RECOVERY |6000|651 / 10.85%|558|
| HOLD |12000|1295 / 10.791667%|1117|

HOLD 실제600087.87325ms/read p95=225.725083ms/write p95=247.035708ms다. U2 first-start는445표본/p95=3259ms지만 **미확인126건**으로 FAIL이며 workerFailures=1 / workerRecoveryVerified=false / u2WorkerRecovery=false다. 자원·UI 및 같은 source의9065/11297=80.24254226785872% coverage/scanner/same-image runtime 통과는 성능 실패와 분리한다. **대규모 restore는 미실행**이며 recovery receipt/event/report/log가 없다. RTO≤30분/RPO0을 충족했다고 표현하지 않는다.

## 보존된 canonical 원문

종료 후 읽기 전용으로 확인한 정확 bytes/SHA256다. 현재 원문을 그대로 보존하며 동일 hash-history 사본은 아직 없다.

| 경로 | bytes | SHA256 |
|---|---:|---|
| .reports/u2/performance.json |5739|25ac624196470c9ae425e07d5fd64c4017ed3d1096e75dcf2d6f39ef245474f0|
| .reports/u2/project-performance.log |5124|5f91446f5d7c583659834729de64224d69388af0ac11683d964d2800e1382bfe|
| .reports/u2/validation-source.json |63497|0c9845eda3e3a29bf27566f58ec9efd05e063bd8149040d2545ff77b1ea2660c|
| .reports/u2/performance-samples.jsonl |15913933|d116c1bf7ecddf375e5fe419af2c911662c18940dfafbbcbee86558f7b9e4fe9|
| .reports/u2/performance-ack.jsonl |4604451|9f2f35083737f909595c8b6ca649d2796cd4a2c1b6690f672f1572c0c1c60fd3|

U1 기존 보고서 해시는 불변이다. 손실된 원래 U1 상세563/563 및 첫 SAST 상세 원문은 [보고서 사건](test-report-isolation-incident.md)·[보안 원문 사건](test-security-raw-provenance-incident.md) 모두 **OPEN**이며 복구·위험 수용으로 표시하지 않는다.

## Retry 전 최소 관측

부모 readonly 집계의 NORMAL 내역은 초대4042377건·202445건·복구400329건·주문409309건이며 기술/정확성 겹침2706이다. 원래404/400 problem-code·피연산자와 catch의 원인 예외는 미보존이므로 원인을 확정하지 않는다.

- performance.ts1707–1714의 복구 response와 packages/contracts/schemas/c00-v2.json의 recoveryResponse/additionalProperties:false를 실제 등록 계약 회귀로 대조한다. 정적 불일치는 원래400의 직접 관측을 대신하지 않는다.
- 초대202445건의 보호 receipt ACCEPTED와1861–1866의 RESULT_RECORDED 비교, 미관측 response requestState를 구분한다. 접수 ACK/Work를 실제 외부 완료로 취급하지 않는다.
- 비식별 고정 problem-code·low-cardinality 정확성 reason·response/receipt-state 및 U2 누락126건/worker 실패1의 원래 Work/message/ACK를 선택 관측한다. 새 실행 전 기존 실패/ACK/sample 보존과 고유 output/guard 지원을 확인한다.

이는 미실행 후보다. 부모가 **Retry/Skip/Abort**를 인간에게 제시한다. 권위·기한·pool·80%·보안/성능 기준을 바꾸지 않는다. 실제 AWS/Cognito/회사망/외부 효과는 미검증·실활성 HOLD/false다.
