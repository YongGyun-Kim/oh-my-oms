# U2 Retry 전체 검증 실패 인계

현재 상태는 **FAIL / 사람의 Retry·Skip·Abort 결정 대기**다. 성공 단계 산출물·source-manifest·리뷰·완료 기록은 작성하지 않았다.

- 현재 source: `1df7c60cdbae0d18c372d8f80f9413870a9e339fae845cffd6c9c38485e38a8a` (500 files). 종료 뒤 재계산도 동일하다.
- 명령: `OMS_U2_SYNTHETIC_PROFILE=approved-local-only node --import tsx scripts/u2/ci-full-proof.ts all` (Node22.23.3).
- controller session `27253`, PID `22912`: 실제 exit1 / `PROOF_EXECUTION_FAILED`; PID 종료 확인. 새 실행·소스 수정은 중지했다.

## 실제 결과와 실패 경계

U1 unit571/571·integration168/168·coverage739/739, U2 unit431/431·integration267/267·coverage698/698, 전체 type/lint/format은 통과했다. 동일 source의 실행행 합집합은 **9127/11369 = 80.27970797783446%**, 미실행 제품 파일을 포함한 원래80% 기준 PASS다. 이것이 전체 실행 성공을 뜻하지 않는다.

E2E는 **2 passed / 1 failed / 0 skipped / 0 flaky**였다. 보고서 시작 `2026-10-10T08:03:36.410Z`, duration11870.635ms. 실패 title은 `PC1280의 실제 초대 landing→본인 MFA→목적 조회→명시 수락 및 보호된 소속 단회`다. 실패 위치는 `tests/u2/fixtures/pc.ts:129`의 `await observed.json()`이며, 원문에서 확인한 정제된 marker는 **Protocol error / Network.getResponseBody**다. assertion 기대 status의 불일치로 확인된 실패가 아니다. 해당 응답의 status·phase 및 실제 제품 인증 성공/거절은 이 실패 기록에서 미관측이다. API→BFF→browser의 원인은 아직 미확정이며, 원문 비밀·DOM·예외 본문을 이 문서에 복제하지 않았다.

후속 synth·현재 image build·security/scanners·same-image runtime·100k 규모 준비/50분 profile·large restore/RTO/RPO는 **실행되지 않았다**. 남아 있는 source792의 performance FAIL이나 이전 이미지/보안 자료는 현재 source의 증거가 아니다.

## 원문 보존

아래 모두 기존 owning `preserveOutput`으로 `.reports/u2/history/<SHA>-<basename>`에 보존했고, 원본과 archive의 exact bytes 동일성을 확인했다.

| 원본 경로 | bytes | SHA256 |
|---|---:|---|
| `.reports/u2/validation-source.json` | 60601 | `39ad174089e4724c901f001412cbddc1f7d1f7dd4c35962bba6b3080b4432507` |
| `.reports/u2/e2e.json` | 11551 | `b341cb1e76b61e80972c449828a9225966c86b4eda6b856393cf365381ed675e` |
| `.reports/u2/project-u2-e2e.log` | 7338 | `bdb19dc4b1ae97c801ff43c66fab24080554ddf65979e3bd1b2240b4b26b4545` |
| `.reports/project/coverage-aggregate.json` | 375547 | `535f0f8db744502182b26b2b08701d23eaa26ac6326ee1a21bfa66203a1e68c3` |
| `.reports/u2/integration.json` | 129678 | `8873e5e093419f402679dea0789729e88726073b6dd3db6bd44ced4443c358f1` |

원래 U1 unit 상세의 현재 보존 bytes hash `b0d001e61fb14673305a56307ce38cd5de866f11d2e314826f59817ec4f2e745`, integration `dae93870ed96d64bd749dead288f90a9e2a0009bdd0a8bd4683153994b108269`는 변하지 않았다. 원래563 상세 원본과 최초 SAST 상세 원본의 두 provenance gap은 **OPEN**이며, 새 승인·archive·시험으로 복구 또는 수용 처리하지 않았다.

## 재시도 전에 필요한 확인

이번 Retry는 실제 공개 복구 입력/200 통계·초대 ACCEPTED 보호 receipt 결합·현재 기업 scope·현재 초대 정책에 따른 별도 새 발급/Work/ACK·비식별 worker 관측을 보완했다. 선택 HTTP6/6·관측unit13/13·공유통계12/12가 통과했으며, 과거404/409/126 및 workerFailures1의 미보존 원인을 복구했다고 주장하지 않는다.

다음 행동은 parent의 실패 질문이다. Retry가 선택되면 현재 E2E 원문을 읽기 전용으로 대조하여 응답 body 관측의 browser lifecycle과 실제 API/BFF 응답 경계를 구분하는 최소 재현부터 진행해야 한다. 새 timeout/retry·권위·기한·분모·하한 변경, 우연한 재실행, 미실행 후속 PASS는 허용하지 않는다. 실제 AWS/provider/회사망/수신 경로·실활성은 계속 UNVERIFIED/HOLD다.
