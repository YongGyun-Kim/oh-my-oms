# U2 코드·검증 산출 요약

## 현재 상태

IdentityRecovery/EnterpriseAccess의 U2 library와 기존 API·worker·BFF·최소 PC 접점을 구현했다. **전체 검증의 최종 결과는 FAIL이며 Unit 완료·배포 승인이 아니다.** 사용자는 부하 측정의 현재 결과를 기록하고 종료하며, 재해 복구 검증은 추후 진행하고, 최종 산출물 정리부터 진행하도록 지시했다. 이 문서 정리는 제품·시험·DB를 수정하거나 추가 실행하지 않는다.

제품 source identity는 `8972b7b0e26cbd9748c9ad80153dd9ecabe90e1ea066b70f421243f40a88d803`다. 같은 source의 단위/통합·전체 coverage·PC·형식/타입/린트·synth·이미지·보안·같은 이미지 runtime 검사는 통과했다. pilot 부하의 기술/정확성 오류는0이지만 NORMAL/RECOVERY/HOLD의 실제 측정 시간이 최소 구간보다 짧아 통과하지 못했다. DR·RTO/RPO·release 검증은 미실행이다.

전체 승인 기능 설계와 주 책임26AC/협력201AC 배정은 유지한다. 첫 배포 기능 범위 제안은 [PROPOSED 문서](../../../release-planning/first-release-scope-proposal.md)의 사용자 확인 전 제안이며 여기서 확정·제외·승인으로 반영하지 않는다. 실제 AWS/Cognito/SQS·회사망·국내 경로·신원/위임/법적 보관·외부 수신 근거는 UNVERIFIED/HOLD다.

## 실행 근거와 소스 경계

- 현재 receipt: `.reports/u2/validation-source.json` ·71454bytes·SHA256 `12cad3428cafd9cca3fc2b88abe9a37b12121fe711cbf1102f2cda885e183646`. 현재503개 source 파일·lock·도구 identity와 명령별 실제 child 결과/새 artifact를 결합한다.
- 원래 engine brief: `execution-brief.md` ·86132bytes·SHA256 `b0af4ba5a0db8929e5189a101ebc32b33860a1ec20d028a890132db9526d443c`. Testing Contract `sha256:13f152f4c3058c2b60200db7b5b96fba74e7d312052a9fb0e92c883f68c5628b`의 test-after·Standard·전체 testable 제품80%/미실행분모를 유지했다.
- native `aidlc engine testing-posture verify --unit u2-identity-enterprise-access`는 exit0/`execution_allowed=true`였다. effective check off/current content continuation이므로 stale binding을 새 사람 승인으로 표현하지 않는다. 초기 승인/receipt·brief는 보존하고 상태/audit/diary/guard를 직접 수정하지 않았다.
- [source-manifest.json](source-manifest.json)은 strict version1/stage/unit/writes의218개 실제 application byte 변경 경로다. main workspace라 repo는 없다. 무관한 U1·framework·다른 작업자 변경을 claim하지 않는다.
- [source-write-ledger.json](source-write-ledger.json)은 각 application exact path/before/after hash와 baseline, 현재7188개 ignored report/runtime/Next 생성물의 exact path·bytes·hash inventory를 분리한다. **현재 존재 inventory는 전체 과거 write/delete 이벤트나 작성 주체 증거가 아니다.** 확인된 parent brief 임시파일 삭제·Docker 환경 변경·보고서 덮어쓰기 사건을 별도 event로 기록했다.
- native `workspace-ce3422fdb1b1.tsv`는 U2 파일0개이며 reviewed U1 370개 hash와 모두 같다. 해당 원래 workspace snapshot→현재 source delta를 사용했다. 다음 fcb9의 최초 partial7과7ba의 P00–P05 일부 존재를 대조해7ba를 U2 시작 baseline으로 사용하지 않았다. 정확 snapshot/hash는 ledger에 있다.
- `package-lock.json`, `tsconfig.build.json`와 두 `apps/*-web/app/api/[...path]/route.ts`는 baseline과 동일 bytes로 재사용한 경계다. 실제 변경 claim에 넣지 않았다. strict 경로 인코딩을 위해 prefix가 필요할 경우만 두 api/ owning prefix를 사용할 수 있다는 기존 판단은 유지하지만 이번 manifest에 불필요 prefix를 추가하지 않았다. ignored 생성물은 native source claim 대신 ledger에 둔다.

## 구현과 직접 검증 연결

| 묶음 | 실제 owning 파일/책임 | 직접 검증 |
|---|---|---|
| P00–P01 | contracts의 u2-access-additions/u2-operations·u2-types/declarations와 persistence u2 모델/catalog/migration/decoder를 additive 등록. 기존 stable ID/common bytes 보존 | contracts/models·postgres-models/migration-compatibility |
| P02 | purpose-verifier·purpose-secret-vault/u2-repository/recovery-payload/security-state. 후보 secret 정확 bytes+목적 metadata HMAC, 별도 vault 권한/AAD·단회/회수/파기·보호 prefix | purpose-verifier/secret-vault·protected-state/secret-lifecycle/repository |
| P03 | scope-v2/compatibility·authorization-fence/verified-person·원래 scopes/caller. 고객15행위/4kind의 동행위 완성 predicate OR·NOT_USED/UNSET/oldorder·현재 fence | scopes/scope-compatibility·authority-race/information-projection |
| P04 | enterprise-invitations/memberships/role-revisions·administrator-restoration과 기존 management caller | invitation-race/membership-role-race/administrator-restoration |
| P05–P06 | party-claim-context/recovery-handoff/enrollment-authority·직접 코드/검토/HOLD/비상/completion. 원래 case/challenge·5분/5실패/claim 후 별도5분·현재 세대·conjunction | handoff-race/recovery/concurrency/hold-transitions/completion |
| P07 | C21 capability/Cognito recovery adapter·identity-work/consumer·relay/SQS quarantine·private delivery. 만료 Work는 업무 effect 없이 보호 REVIEW control; malformed sibling 격리 | identity-worker/expired-work/mixed-sqs-batch·provider-unknown/worker-boundaries 및 직접 U1 회귀 |
| P08 | u2-operations/routes/authentication·server browser/purpose cookie·rate/crypto admission·SQL scope pushdown·원래 결과 continuation | http-identity/access/primary-ac/runtime-security·bff-purpose/resource-budget |
| P09 | login/portal/invitation-acceptance/recovery-claim/status/member/staff-role 최소 한국어PC1280 | purpose-ui/access-state-ui·Chromium PC5/5·axe/키보드 경계 |
| P10 | current-source full proof/coverage union/security/synth/image/runtime/pilot/load/recovery/release runner·CDK/CI·문서와 단일 u2-pilot-v1 | actual 아래 표. DR/release는 미실행, 측정 시간 하한 FAIL |
| P11 | 이번 code-summary/manifest/301ID trace/보류 기록/현재 계획 체크 정리 | 문서·경로·ID 검증만 별도 확인 예정. 새 독립 review는 conductor 후속 |

원래 operation/target/deadline/actual effect와 보호 원본을 유지한다. 초대 발급202/ACCEPTED·전달 Work/ACK·고객 실제 수락/RESULT_RECORDED는 서로 다른 결과다. 복구 완료 conjunction은 새 business session이 아니며 별도 일반 MFA 로그인이 필요하다. 직접 code 정기만료 없음, 초대7일/재발송 기한 연장 없음, 마지막 관리자0 허용/경고를 보존했다. 실제 capability/정책이 없으면 fixture를 실제 fact로 승격하지 않는다.

## 실제 명령과 현재 source 결과

전체 owning 명령은 `OMS_U2_SYNTHETIC_PROFILE=approved-local-only node --import tsx scripts/u2/ci-full-proof.ts all`이었다. Node22.23.3/npm10.9.9·pinned Vitest/V8/TypeScript와 격리 합성 DB만 사용했다. unit runner는 U2/직접 관련 exact U1 filter, project-validation은 같은 current source에서 별도 전체 수집과 파일·실행행 합집합을 사용했다. 원래 U1 default 보고서는 wrapper/hash guard로 보호했다.

| 단계 | 실제 명령 | 결과 | 보고서 |
|---|---|---|---|
| u1-unit | `npm run test:u1:unit -- --reporter=default --reporter=json --outputFile=.reports/project/current-u1-unit.json` | PASS · 571/571 | [.reports/project/current-u1-unit.json](/Users/gyun/Project/oh-my-oms/.reports/project/current-u1-unit.json) |
| u1-integration | `npm run test:u1:integration -- --reporter=default --reporter=json --outputFile=.reports/project/current-u1-integration.json` | PASS · 168/168 | [.reports/project/current-u1-integration.json](/Users/gyun/Project/oh-my-oms/.reports/project/current-u1-integration.json) |
| check | `npm run check:u2` | PASS | [.reports/u2/check.json](/Users/gyun/Project/oh-my-oms/.reports/u2/check.json) |
| u1-coverage | `npx vitest run --config tests/project/vitest.u1.coverage.config.ts --coverage` | PASS · 739/739 | [.reports/project/current-u1-coverage/evidence.json](/Users/gyun/Project/oh-my-oms/.reports/project/current-u1-coverage/evidence.json) |
| u2-coverage | `npm run test:u2:coverage` | PASS · 721/721 | [.reports/u2/coverage/evidence.json](/Users/gyun/Project/oh-my-oms/.reports/u2/coverage/evidence.json) |
| coverage-aggregate | `node --import tsx scripts/u2/coverage-aggregate.ts` | PASS · 9246/11518 = 80.27435318631707% | [.reports/project/coverage-aggregate.json](/Users/gyun/Project/oh-my-oms/.reports/project/coverage-aggregate.json) |
| u2-unit | `npm run test:u2:unit` | PASS · 449/449 | [.reports/u2/unit.json](/Users/gyun/Project/oh-my-oms/.reports/u2/unit.json) |
| u2-integration | `npm run test:u2:integration` | PASS · 272/272 | [.reports/u2/integration.json](/Users/gyun/Project/oh-my-oms/.reports/u2/integration.json) |
| u2-e2e | `npm run test:u2:e2e` | PASS · 5/5 | [.reports/u2/e2e.json](/Users/gyun/Project/oh-my-oms/.reports/u2/e2e.json) |
| synth | `npm run synth:u2` | PASS | [.reports/u2/synth.json](/Users/gyun/Project/oh-my-oms/.reports/u2/synth.json) |
| image-build | `docker build --platform linux/amd64 --label oms.unit=u2-identity-enterprise-access -t oms-u2-local:verification .` | PASS | [.reports/u2/project-image-build.log](/Users/gyun/Project/oh-my-oms/.reports/u2/project-image-build.log) |
| security | `npm run security:u2` | PASS | [.reports/u2/security.json](/Users/gyun/Project/oh-my-oms/.reports/u2/security.json) |
| runtime-security-tests | `npm run test:u2:runtime-security -- --outputFile=.reports/u2/selected/project-runtime-security.json` | PASS · 현재 선택 경계 통과 | [.reports/u2/selected/project-runtime-security.json](/Users/gyun/Project/oh-my-oms/.reports/u2/selected/project-runtime-security.json) |
| runtime-security | `node --import tsx scripts/u2/runtime-security-report.ts` | PASS | [.reports/u2/runtime-security.json](/Users/gyun/Project/oh-my-oms/.reports/u2/runtime-security.json) |
| performance-prepare | `node --import tsx scripts/u2/performance.ts --prepare` | PASS | [.runtime/u2/performance-profile.json](/Users/gyun/Project/oh-my-oms/.runtime/u2/performance-profile.json) |
| performance | `npm run test:u2:performance` | FAIL · 3900 요청, 시간 하한 FAIL | [.reports/u2/performance.json](/Users/gyun/Project/oh-my-oms/.reports/u2/performance.json) |

coverage는 같은 head/lock/source inventory/도구의 U1+U2 raw V8 contribution을 소스 파일/실행 행으로 합집합했다. 겹친 행을 중복 계산하지 않고 미실행 직접 testable 제품 파일을 분모에 포함했다. **9246/11518=80.27435318631707%**는 현재 source의 coverage PASS이며 전체 collector PASS를 뜻하지 않는다. partial report/과거 U1 측정/다른 source를 재사용하지 않았다. 실제 CI push/run·AWS synth 이후 배포는 하지 않았다.

security는 dependency physical bundle+audit/SAST/secret/CDK template/IaC adjudication/container OS·library 검사다. 같은 제품 이미지 `sha256:3fbc22de58dc28e912715e3ecb653ad193006bc4b285657f26c9563befc36721`로4role/6boundary runtime를 검사했다. TLS 준비는 customer/staff/API3개이며 worker는 TLS 서비스가 아니다. `cleanupFailed=false`지만 startup raw stdout/stderr 전체가 저장됐다는 뜻은 아니다(`rawLogPersisted=false`). 실제 Cognito/회사망 검증과 real activation은 false다. 경고/adjudication·원래 실패 raw/사고 기록은 유지한다.

### 결과 파일 exact bytes/hash

아래는 현재 receipt가 결합한 원문이다. history는 `.reports/u2/history/<SHA256>-<basename>`이며 각 실패 packet의 실제 보존 목록과 연결한다. 동일 source의 각 결과를 다른 source 또는 최초 손실 원문으로 표현하지 않는다.

| 결과 | bytes | SHA256 |
|---|---:|---|
| u1-unit | 257239 | `2236b35300ec12c0b3149703369120cd11ffddfe5ddb62a9244e768675435e92` |
| u1-integration | 77211 | `785fb823abc38da42ba748d8e4ed65e78fdd4b7b2b72f86b7393f771e5a2b5cb` |
| check | 157 | `52c138d120e7682aaed86b48080943e8c9dff16325189196ce9b7aa19039e644` |
| u1-coverage | 334384 | `686cad4ca05f1a3686118a7b51f66f069bdf7728e42f4fd7d1ce755a2836b520` |
| u2-coverage | 364130 | `086fbcf2ff3b542e37c2c534ce69ff8a757c0678988e55423758e0aaf460c8eb` |
| coverage-aggregate | 379977 | `3af05c9ce454d4d3844dabccc677787cbd5e311c1a3ead09e88fad2c64a08ed5` |
| u2-unit | 189004 | `f9813b28870e357df3f03f16a042da19bbdba57a09329a75e3b44c15d4c5199c` |
| u2-integration | 132378 | `fd05d374d21844b9f0d761ec3b560f42022cb868ec400da9611a1522850c839e` |
| u2-e2e | 56693 | `6e09d4cf0feef145f9090f25aaff1d0e192b908c73c3d71d099adf464f1f280a` |
| synth | 276 | `fa3b28fa69a5de7d512662f44ad344c9db5aaa18e2c2c6457ea77e1294f82291` |
| image-build | 6577 | `b3489f24df05de9a3fd3b597252b480bc48f705ba98a9f05596d4ee9c6f9c05b` |
| security | 697 | `2cca04fffdb629fedc8f5acdf498a21baced2000ffe7804e6e6409da3a9d10bd` |
| runtime-security-tests | 5980 | `bffd063c263fc0d2c4e291775f28004f713a0e802c4da5876bbdaec65b68ab16` |
| runtime-security | 2812 | `05d53830baf11624006730d012f35c0e3cca31970a98681b88bf2a79af49c296` |
| performance-prepare | 32309 | `2534882b4bf6b0f266a2dbafacf565829c4b96c96aca19b128074bf64e322c0e` |
| performance | 6785 | `9b86fc08bbe2232bade505a5bc8a38c7a8684871011fed93a66a696be9450183` |

## 파일럿 측정의 실패와 보류

계획 목표는 기업10곳·일주문1000이며 실제 고객/수요 관측이 아니다. u2-pilot-v1의 합성 가정은10기업/100고객/10직원/1000상품/누적10000주문/20세션, 평균5·최대50품목이다. 실제 새 준비 profile32309bytes/SHA256 `2534882b4bf6b0f266a2dbafacf565829c4b96c96aca19b128074bf64e322c0e`가 현재 source에 생성됐다. 순차 fixture 생성과 profile 선언은 확인됐으나 DR의 독립 SQL 규모 대조는 실행하지 않았다.

| 구간 | 요청 | 실제 경과ms | 최소ms | 판정 |
|---|---:|---:|---:|---|
| NORMAL | 1500 | 299885.091333 | 300000 | FAIL |
| PEAK | 1200 | 60030.027875 | 60000 | PASS |
| RECOVERY | 600 | 119838.427 | 120000 | FAIL |
| HOLD | 600 | 119882.437041 | 120000 | FAIL |

총3900 요청의 기술/정확성/계약 오류와 worker failure는0이다. NORMAL 읽기p95141.42325ms/변경194.623625ms, notice 첫시작12개p95/max163ms, U2첫시작58개p95494ms/missing0, UI/purpose/resource/worker recovery 관측은 true였다. 이 결과가 부족한 구간 시간을 보완하거나 전체 성능 성공을 만들지는 않는다.

실제 child는2026-10-10T15:11:43.002Z–15:22:55.978Z에 실행돼 exit1/signal=null/errorCode=null/expired=false/logFailed=false/stdout4228bytes/stderr0였다. controller40381/PID80449도 exit1로 종료했고 owned process/해당 서비스 listener는 남지 않은 것으로 종료 시 확인했다. 최종 [실패 packet](execution-failure-duration-20261011.md)4788bytes/SHA256 `df257d27fc2ac91a6fbd450a894fd8e4a78f873e9e641348cb4d2575d6b1bd18`의 원문과 측정 로그·samples·ACK·work/worker 근거는 exact history로 보존했다.

현재 loop는 예정 요청을 시작하고 마지막 완료 후 경과를 계산하지만 고정 구간 종료까지 기다리지 않는다. NORMAL은114.908667ms 부족했다. 이는 관측된 측정 유효성 FAIL이며 시간 반올림/허용 오차/기준 변경으로 통과 처리하지 않는다. 실제 종료 경계까지 계측하는 최소 보완은 **추후 사용자 실행 결정 이후**의 후보다.

독립 ACK782개(EnterpriseAccess340/OrderAcceptance32/ProductCatalog390/IdentityRecovery20)를 수집했다. 이것은 실제 재해 복원 전수 비교·성공접수 RPO0·중복/유실0·RTO30분 증명이 아니다. 사용자의 결정으로 pilot DR는 추후 진행하며,100k/50분 확장 검증도 Deferred로 유지한다.

## 추적표 해석과 미완료 책임

[traceability.json](traceability.json)은227AC+31BR+43NFR=301ID를 모두 보존한다. `OK`52개는 단일 존재 구현/시험 파일에 연결된 **U2 local 책임의 직접 증거**다. `Deferred`249개는201협력AC와 실제 외부/업무/UI/운영·보류 검증을 포함하며 원래 owner와 남은 근거를 설명한다. 전체69스토리·301요구 완료율로 해석하지 않는다.26주책임 중 실제 확인 정책/제공자/회사망/전체UI·원본 업무 승인 등이 필요한 조건도 Deferred로 남겼다.

- 부하 시간 하한 FAIL·pilot DR 미실행·expansion100k/50분 Deferred; 새로운 첫 배포 기능 범위는 미승인.
- U1 code review R-01(만료 PUBLISHED), R-02(혼합 SQS poison)는 현재 owning fix/회귀가 있어도 **OPEN**. 과거 review/state를 수정하거나 native finding을 폐쇄하지 않았다.
- 최초 U1 상세563건 report와 최초 실패 SAST child 상세JSON provenance gap은 **OPEN**. 현재16건 exact bytes/새 baseline/전체 proof/current scanner raw는 원래 상세 원문 복구가 아니다. 외부 백업 존재는 미확인이다.
- 과거 전체 TOTP 실패의 생성/검증 step·시각과 과거 terminalblocked1의 code는 미관측. 후속 deterministic 재현/current 관측이 과거 누락을 복원하지 않는다. CDP 오류 자체의 원인은 미확정이며 BODY_UNAVAILABLE 의존성 회귀는 실제 UI/MFA/보관 ACK/단회 수락을 대체하지 않는다.
- 실제 자격/위임/비상 authority·국내 path/법적retention·회사망/provider/receiver·30일99.9%·1인 운영 시간·전체 출시 UI/browser/접근성은 미검증.
- 독립 최신 review와 native 단계 완료/배포 승인/배포는 미진행. 이 문서는 READY·risk acceptance·Skip 결정을 기록하지 않는다.

원래 보고서 사건은 [보고서 격리 기록](test-report-isolation-incident.md), [SAST 원본/NoSpace 기록](test-security-raw-provenance-incident.md), 사용자 보류와 다음 작업은 [follow-up-status-20261011.md](follow-up-status-20261011.md)에 연결했다. 이번 문서 작성 중 제품 source·시험·DB·runtime를 변경하거나 새 검증을 실행하지 않았다.

