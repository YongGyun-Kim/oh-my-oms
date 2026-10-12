# U3 현재 소스 품질 검증

## 고정 기준과 준비

Step17–18 구현/제어된 시험을 e850ebc로 커밋하고 같은 원격 브랜치에 push했다. Step19 실제 검사와 Step20 최종 산출물/별도 리뷰는 미완료다. 아직 main에 머지하지 않았으며 실제 AWS 배포·장시간 부하·전체 DR은 실행하지 않는다.

고정 Node22.23.3에서 npm run bootstrap:u2:ci와 node --import tsx scripts/u3/prepare-test-databases.ts를 각각 실행해 종료 코드0을 확인했다. 소유된 U2/U3 격리 검증 DB 준비와 기존 DB 보존을 확인했고 제품 tracked diff는 추가되지 않았다. 준비 전후 HEAD는 e850ebcac7e1e252435b613ec2fa57d9e50f4228, 파일럿 지문은 9fb3427bb239d3c5273cab263f4b9992d1bd29c901a008c6f9a3d5af3474ae57로 동일했다. 준비 성공은 실제 품질/보안/coverage 검사 성공을 의미하지 않는다.

## 실제 검사 순서와 판정

현재 제품/시험 소스를 고정해 ci-pilot-proof.ts의 u1, u2, u3, project를 로컬에서 순차 실행한다. 각 Unit은 정확한 격리 profile과 전체 unit/integration 및 같은 전체 제품 분모의 coverage를 사용한다. U2 PC는 별도 e2e profile이다. 세 기여와 project의 source/lock/보고서/이미지 및 실제 품질 검사 증거를 대조하기 전에는 전체80% 통과를 주장하지 않는다.

원문 log/scan/자격/trace는 private 로컬 파일에 보존하고 보고에는 비민감 count·종료 코드·source/HEAD·안전한 오류 정보만 사용한다. 실패/취소/skip/누락/source 변경/image 불일치는 보존하며 반복 통과로 실패를 대체하지 않는다. 로컬 collector 성공과 실제 GitHub CI 성공은 별도 증거로 취급하고, 최종 source/HEAD에서 CI를 확인한 뒤에만 main에 머지한다. 현재 U1 collector를 시작했으며 종료 결과는 아직 없다.

## U1 실제 로컬 기여

U1 collector는 종료 코드0이다. 새 u1-unit.json은 571 PASS, u1-integration.json은 168 PASS, u1-coverage-tests.json은 같은 739개 시험의 coverage 수집 재실행 PASS다. 각 실패/pending/todo0·success=true이며 중복 실행을 고유 시험1,478개로 표현하지 않는다. root가 validation-u1.json의 mode pilot-current와 같은 source/HEAD 및 각 reports의 실제 execution metadata를 확인했다. u1-unit/u1-integration/u1-coverage 모두 observed=true·exitCode0·signal=null·expired=false다.

Luna가 측정한 전후 HEAD/파일럿 지문은 위 고정 기준과 동일했다. 이는 로컬 U1 기여이며 실제 GitHub CI·3Unit 합집합80%·전체 품질/보안 성공으로 확대하지 않는다. U2 collector를 같은 고정 소스로 이어서 실행 중이다.

## U2 실제 로컬 수집 실패

U2 collector는 PILOT_CHILD_FAILED/u2-integration으로 종료 코드1이다. validation-u2.json의 새 execution은 u2-unit observed=true·exit0·passed=true, u2-integration observed=true·exit1·passed=false·signal=null·expired=false·logFailed=false다. u2-unit.json은465/465 PASS, u2-integration.json은274개 중273 PASS·1 FAIL·pending/todo0·success=false이며 root가 실제 JSON count를 확인했다. 이전 날짜의 e2e 보고서는 현재 proof로 인정하지 않고 이번 PC/coverage는 실패 후 미실행이다.

실패는 tests/u2/integration/runtime-security.spec.ts:58의 보호된 revision1 재seed 거절/원래 fence 보존 시험이다. setup 후 원래 StaffAuthorityFence revision2를 확인하고 seedVerifiedRecoveryParty가 REVISION_SEQUENCE로 거절할 것을 요구한다. 보고된 안전 프레임은 Vitest의 rejects getter이며 실제 거절 원인은 아직 확정하지 않았다. 제품/시험 소스를 바꾸거나 실패를 반복 통과로 치환하기 전에 원인과 최소 수정안을 조사한다. 전후 HEAD/파일럿 지문은 위 고정 기준과 같았다. 이 실패로 실제3기여/80%·전체 품질·CI·main 머지를 완료하지 않는다.

## U2 실패 원인과 수정 경계

해당 시험 한 곳에 안전한 결과/오류 코드/fence 개정 번호 진단만 추가하고 기존 거절·fence equality 단언은 유지했다. SHA는 ba075c3af70b9ad886e6768e5bb54e486ea0fda06ca27168432870147f152f15다. u2-runtime-security-reseed-diagnostic-20261012.json은 선택1 FAIL·필터로10 pending·success=false이며 root가 실제 count를 확인했다. 고정 HEAD는 그대로이고 진단 source 지문dcde1300071d5c006e64155607be127c38b07d71d95ec2d7138ee63d87a8c428는 전후 동일했다. 코드의 capture 경로와 synthetic observed Promise.resolve 분기에서 원래 seed가 거절되지 않은 것을 확인했다. 합성 observed Promise의 undefined를 원래 seed의 반환 값이라고 혼동하지 않는다.

개발자가 소유된 U2 검증 DB에 connection initialize와 read만 수행해 primary revision4/authorityRevision4, protected revision4/authorityRevision4를 확인했다. reset/migration/변경·식별자/근거/자격 출력은 없었다. 원래 setup revision2 뒤 현재+1 fixture와 정상 역할 개정이 순서대로 기록됐다. 공유 seedU2Enterprise는 다중 fixture를 위해 현재 fence를+1로 개정하므로 '재seed가 항상 고정revision1을 쓴다'는 기존 시험 전제와 달랐다.

수정은 해당 시험의 자극만 실제 고정revision1 tx.put으로 정합화한다. REVISION_SEQUENCE 거절과 전체 보호 fence equality·primary 개정 보존을 확인하며 제품/공유 fixture를 바꾸거나 보호 하한을 완화하지 않는다. 임시 진단을 제거한 뒤 같은 파일11개 시험과 타입/린트를 검증한다. 변경된 source/HEAD의 최종 proof는 새로 확인하며 이전 source의 실패/성공 보고서는 보존한다.

최소 수정 후 tests/u2/integration/runtime-security.spec.ts SHA는 e4fa099c0ed97742cadfe7404208c9e16f904403d87cb1e4840fe8a592adbc9c다. 제품·공유 fixture와 다른10개 사례는 변경하지 않았다. TypeScript·단일 파일 ESLint 종료 코드0, u2-runtime-security-fixed-overwrite-integration-20261012.json은 필터 없는 전체11/11 PASS·실패/pending/todo0·success=true이며 root가 실제 count를 확인했다. 검증 전후 HEAD는 e850ebcac7e1e252435b613ec2fa57d9e50f4228, 새 파일럿 지문a855b65ae7ee3320682de648a48eefd292d2a12a358174f34907a4562b8e08a0와 시험 SHA가 동일했다. 이전 실패를 지우지 않고 원인/수정/새 source 검증을 연결했다. 새로운 HEAD/source에서 실제 전체 수집을 다시 확인해야 하며 이11개 통과만으로 U2 전체/3기여80%/CI 성공을 주장하지 않는다.

## 수정 후 고정 HEAD의 새 U1 기여

최소 시험 수정과 원인 기록은25d8583으로 커밋·push했다. 이전 pilot 원문314개 파일은 .reports/u3/history/e850ebc-before-fence-test-fix-20261012에 복사해 디렉터리0700/파일0600으로 보존했다. 기존 source의 실패나 성공을 새 source의 증거로 섞지 않는다.

새 고정 HEAD는25d8583531d0494a2f5c77c20282ea9314b83cf8, 파일럿 지문은ed6df2a3ae042f765739513f64b51a8bb67f4523b3aeaa214a3c7141fb57434c다. U1 collector 종료 코드0, 새 unit571·integration168·동일739개 coverage 재실행은 모두 실패/pending/todo0·success=true다. root가 새 validation-u1.json의 위 source/HEAD와 u1-unit/u1-integration/u1-coverage 세 execution의 observed=true·passed=true·exit0·signal=null·expired=false를 확인했다. Luna의 전후 지문도 동일했다. 같은 새 소스로 U2 collector를 이어서 실행 중이며, 여전히3Unit 합집합80%·전체 품질·GitHub CI·main 머지 완료는 아니다.

## 수정 후 U2 실제 기여

같은 고정 HEAD/source의 U2 collector도 종료 코드0이다. 새 unit465·integration274·동일739개 coverage 재실행은 모두 실패/pending/todo0·success=true다. 최신 PC 보고서의 stats는 expected5·skipped0·unexpected0·flaky0이다. 오래된 PC 보고서나 원래 실패 report를 새 기여로 사용하지 않았고 중복 coverage 재실행을 고유 시험 수에 더하지 않는다.

root가 새 validation-u2.json의 source/HEAD와 u2-unit/u2-integration/u2-coverage/u2-e2e 네 execution observed=true·passed=true·exit0·signal=null·expired=false 및 실제 PC stats를 확인했다. Luna의 전후 지문은 위 새 고정 기준과 같았다. 이는 로컬 U2 기여이며 아직 U3/project·합집합80%·공통 보안/image·GitHub CI 완료는 아니다. 같은 고정 소스로 U3 collector를 시작했다.

## U3 전체 통합 수집 기한 초과

같은 고정 HEAD/source의 U3 unit은280/280 PASS다. 통합 child는600,000ms 실행 한도를 넘겨 exit143·expired=true로 종료했고 parent는 PILOT_CHILD_FAILED/u3-integration으로 종료 코드1이다. root가 validation-u3.json의 observed=true·passed=false·signal=null·logFailed=false와 fresh artifact=false를 확인했다. 새 통합 보고서가 없어 개별 통합 시험의 성공/실패 수를 판정하지 않는다. coverage와 project는 미실행이며 전체 검증 완료로 취급하지 않는다.

제품/시험 소스를 고정한 채 비공개 실행 log와 실제 시험 구성을 읽어 전체 실행량과 개별 정체 여부를 조사한다. 재실행이나 한도 변경은 아직 하지 않았다. 요청 처리·DB 시간 제한과 전체 검증 프로세스 실행 한도는 별도 기준이며, 원인 없이 제품 제한을 완화하지 않는다.

조사에서 완료된11파일·104시험의 표시 시간 합계587,215ms, child wall600,028ms를 확인했다. 초기 수동 집계114는104로 정정한다. 개별30초 timeout/실패 프레임/오류 코드는 없었다. 남은7파일의 과거 실행 시간 합계63,618ms는 현재 source 성공 증거가 아닌 예산 추정 참고값이다. 이를 더해도 준비 시간을 제외한 예상650,833ms로 기본600,000ms보다 길다.

최소 변경은 U3 integration 전체 프로세스에1,200,000ms, U3 whole coverage에1,800,000ms를 명시하는 것이다. 후자는 전체 통합 재실행과 V8 수행을 포함할 여유 가정이며 아직 실측 검증 전이다. 나머지 기본/legacyfull 명령, 개별 test/hook30초, 서비스/DB 제한, 전체18파일과80% 분모는 유지한다. CI units90분과 project120분은 변경하지 않는다. 새 source의 실제 결과는 변경 후 별도로 수집한다.

## 수집 예산 수정의 선택 검사

Luna가 고정 Node22.23.3에서 전체 TypeScript와 지정3파일 ESLint를 실행해 각각 종료 코드0을 확인했다. pilot-ci-budget-fixed-20261012.json은 해당 선택 파일10/10 PASS·실패/pending/todo0·success=true다. U3 통합/coverage 두 명령에만 전체 프로세스 예산을 명시하고 나머지 Unit 명령의 기본값을 유지하는 경계를 확인했다. 전체 통합이나 전체 커버리지 재실행 성공을 의미하지 않는다.

선택 실행 전후 SHA는 pilot-commands.ts 735617dea337e12d478fb1449e9a0208901b5b2cb6e90c7f8619bee0f379e22a, pilot-tools.ts ce7db6e2f1beafc9093d7de9e3be2005babc1a8e7309c4dabaab2b8b53f60e81, pilot-ci.spec.ts 80e2658ce234070d09beecf81b347fa0a439741bdf243be434e48d674b913894로 동일했다. 문서/record JSON 작성은 병행했으므로 전체 source가 고정됐다고 주장하지 않는다.

최종 문서와 source 목록을 정리하고 커밋한 뒤 실제 CI의 격리된 U1/U2/U3 matrix에서 최종 소스를 병렬 검증한다. 기존 HEAD의 로컬 기여를 새 소스로 재표기하지 않고 현재 CI 결과를 별도로 대조한다. 실제 CI·전체80%·공통 품질/보안·main 머지는 아직 미완료다.

## 최종 산출물 준비 확인

Luna의8파일 Prettier 검사와 strict JSON/traceability/manifest assertion은 모두 종료 코드0이다. 집계는167개 경로·42AC·29BR·33NFR·원래 Deferred AC7개이며 모든 대상 파일 존재와 중복 없는104ID를 확인했다. 해당8파일은 검사 전후 지문이 동일했다. root의 전체 repository Git 대조에서도 baseline a2d694f 이후166개 tracked 제품 변경과 신규 README를167개 manifest 경로로 모두 주장했고 누락/추가가 없었다.

최종 문서 검토에서 project 성공 보고서를 release-validation.json으로 정확히 표기하고 요약의 format/JSON 결과를 실제 완료로 갱신했다. 이 두 문서의 포맷을 다시 확인하며 타입/린트/단위 시험은 문서 변경 때문에 반복하지 않는다. 최초 승인 답변은 유지하고 PATH aidlc의 testing-posture brief가 현재 지침의 실행 허용을 종료 코드0으로 확인했다. Step19 전체 CI/80%/보안과 Step20 별도 리뷰·공식 완료는 미완료다.

문서 정정 뒤 Luna의 두 문서 Prettier 검사도 종료 코드0이다. README SHA add64c3d5b8b8cdc2889c6fdadc2f07c0a47b47b53107eacd54cde33c9300d34, code-summary SHA16e2525e0574d36f8b1fac3cfeeaf9b0ea90c6302a61d9eac4e36b2493ed562c는 전후 동일했다. 이제 제품/시험/문서를 고정해 실제 CI에 제출한다.

## 최초 실제 CI 실패와 관측 경계

최종 준비는04b2859bd3719f14a7906931c25091f335452991로 커밋·push하고 draft PR1을 생성했다. 실제 GitHub CI run38197711760의 headSha는 해당 브랜치 HEAD이며 PR 체크아웃 mergeSHA5900a7385b8a73f2eff65c5198c32c4b5faa103e와 구분한다. U1/U2/U3를 격리해 병렬 실행했고 전체 run은 failure로 종료됐다. U1은 PILOT_CHILD_FAILED/u1-integration, U2/U3는 각각 u2-unit/u3-unit에서 실패했다. project는 선행 Unit 실패를 차단했고 실제 전체 품질 단계는 실행되지 않았다.

완료 job 원문은 .reports/u3/github/38197711760의 private log에만 보존했다. 내려받은 U2/U3 공개 summary는 passed=false·completed=[]·realActivationAllowed=false이며 같은 sourceDigest8f2e2e027be9d7fa3c8c538b8f94fadeb040b778306fab378be664fa48e7ecee였다. 현재 공개 job log에는 개별 시험 이름/수/오류 코드나 상세 execution/artifact metadata가 없어 실제 테스트 실패와 child 시작/보고서 검증 실패를 구분할 수 없다. 통합 기한 초과를 이번 실패 원인으로 추정하지 않는다.

실패 원인을 소거하지 않고 공개 요약에 고정된 안전 진단 코드·실제 종료/기한 정보·artifact 존재/신규 여부·strict numeric 시험 수만 추가한다. private 원문/payload/환경/자격은 업로드하지 않고 검증 기준·실패 차단·source/80%를 유지한다. 이 관측 공백 수정은 원인 해결/CI 성공을 의미하지 않는다. 다음 소스의 실제 CI가 상세 원인을 제공해야 하며 현재 Step19/20·main 머지는 미완료다.

## 안전한 실패 관측 보완의 검사

실패 요약에 allowlist 종료/검증 코드·scalar 실행/보고서 상태·엄격한 시험 수·등록 파일/실패 순번 최대10개·source inventory 프레임 최대3개를 추가했다. 제목/message/SQL/request/env/token/미등록 경로/임의 code는 투영하지 않고 프레임이 없으면 빈 배열이다. receipt와 command-report 검증 실패는 단계와 실제 허용 code를 구분하며 성공/실패 차단 규칙은 유지한다.

Luna의 전체 TypeScript·지정 ESLint·선택 Prettier는 모두 종료 코드0이다. pilot-ci-safe-failure-diagnostic-unit-20261012.json은 단일 파일14/14 PASS·실패/pending/todo0·success=true이며 root도 실제 JSON count를 확인했다. mock4개를 추가해 단계/JSON/count·원문 제외·한도·UNKNOWN fallback을 확인했고 전체 Unit/CI 성공으로 확대하지 않는다.

3파일 실행 전후 SHA는 ci-pilot-proof.ts 3894e05e7f4f24718a7138ffdefe73ffd0e59611edb29c24111de068be9c7cf6, pilot-validation.ts 1b1a7fd48f2f31934be544dde8875ae87890ebd6047ecf92dd1e13df306be3e9, pilot-ci.spec.ts 7eb0fffb94eb01c8d362e16ef2b6f6cbc16d9e7b5f37be0ff8946154d1462060로 동일했다. 실제 CI 원인은 아직 미확정이며 새 source의 CI에서 안전 metadata를 확인한다. 이미 주장한 source-manifest 경로3개 안의 변경이며 새 제품 파일/인프라/운영 원본은 만들지 않았다.

## 상세 진단을 포함한 새 CI

관측 보완은06a5b358861da30f7a9da1a36a7015848d492320로 커밋·push했다. 실제 새 run38198940994의 브랜치 HEAD와 PR checkout mergeSHA392e20a129d9a0c0bfa9bd55a3b9c0ba81a031f5를 구분한다. 새 U2/U3 summary의 sourceDigest는36950bc390a7e60ae6fc86577cac5e6df9edb0f95fe29a6ca5d3e6ea992e9391로 동일하다.

U2 unit은465개 중464 PASS·1 FAIL, U3 unit은285개 중284 PASS·1 FAIL이며 둘 다 pending/todo0·success=false다. 실제 execution은 observed=true·exit1·signal=null·expired=false·logFailed=false·errorCode=null이고 artifact exists/fresh=true·VALID_COUNTS이며 receipt/report validation 실패가 아니다. 등록된 실패 위치는 tests/u2/unit/u1-regression-output.spec.ts의 순번1/57행, tests/u3/unit/order-readiness.spec.ts의 순번3/171행이다. 따라서 이번 두 실패는 실제 개별 시험 실패로 판정하며 통합 시간 초과나 보고서 검증 실패로 추정하지 않는다.

현재 U1 작업은 진행 중이고 project 전체 gate는 아직 실행되지 않았다. 공개 summary는 private .reports/u3/github/38198940994에 보존해 source/실패 metadata를 유지했다. 두 사례의 실제 원인을 조사하기 전 제품 제한/시험 단언을 바꾸거나 새 source 성공을 선언하지 않는다.

U1도 실패로 종료됐다. 실제 summary는 completed=[u1-unit]·동일 sourceDigest, u1-integration observed=true·exit1·expired=false·logFailed=false·새 artifact/VALID_COUNTS다. assertion168개가 모두 통과해 fail/pending/todo0이지만 numFailedTestSuites1·success=false이고 assertion 실패 목록은 비어 있다. 실제 Vitest JSON reporter의 suite 판정은 assertion과 독립이며 이를 전체 통합 성공으로 표현하지 않는다. project는 선행 실패로 차단됐다.

## 독립 CI의 시험 전제 정합화

U2 실패는 native 시험57행에서 선행 .reports/u1/unit.json과 integration.json을 무조건 읽은 것이었다. 독립 U2 runner는 그 보고서를 생성/다운로드하지 않으며 실제 regression snapshot은 이미 ENOENT를 null로 보존한다. 시험만 현재 파일의 hash 또는 ENOENT 부재와 전후 equality·실제 archive hash/null을 대조하도록 수정했고 다른 IO 오류는 재throw한다. 가짜 U1 PASS 자료·CI 직렬 의존·제품/shared fixture 변경은 없다.

U3의 부모25ms는 선행 스키마/소유자 확인 시간도 포함한다. 실제 받은 CI 오류 코드는 미확정이며, 시험이 의도한 callback 무응답 취소 전에 wall 시간을 소모할 수 있는 전제를 확인했다. 테스트에서만 ExecutionBudget의 now와 AbortSignal.timeout을 제어해 callback 진입/같은 부모 신호/호출1을 먼저 확인하고25ms 전진+abort 뒤 ORDER_READINESS_UNCONFIRMED와 늦은 결과 미반환을 확인한다. 실제 timer 전파 시험과 제품/서비스/DB 제한은 유지한다.

U1 suite 판정 관측에는 등록된 failed suite 파일/상태/실제 assertion 수 최대10개와 기존 source whitelist 프레임 최대3개를 추가했다. 실제 reporter의 suite.message가 stack을 담지 않으면 빈 프레임을 기록하며 raw message/title을 공개하지 않는다. mock afterAll 형태는 전체 assertion PASS와 suite FAIL의 구분 및 민감 값 제외를 확인한다. U1 실제 suite 원인은 아직 미확정이다.

Luna가 타입·지정 린트·선택 Prettier를 각각 종료 코드0으로 확인했다. u2-regression-report-absence-fixed-unit-20261012.json은9/9 PASS·success=true, ci-suite-diagnostic-and-deterministic-readiness-unit-20261012.json은19/19 PASS·success=true다. strict manifest/traceability 검사도168경로·104ID(42AC/29BR/33NFR)·원래 Deferred AC7개로 통과했다. 지정5파일 SHA는 전후 동일하다. ci-pilot-proof.ts c8c074c24e27201b7fa5d8118185cd9a84ac27d35cda2cc6abb9807c63684d10, pilot-ci.spec.ts adddd52f17575e661619f64091a2bc34bc000930581780b5291c68dd34eb6995, order-readiness.spec.ts 03bce0338df7138bac10f3b6c55be05bed9402db247c8471a4c0f202910e712c, u1-regression-output.spec.ts bc71f79bae6f06695e7f54a7dd213b421c4bf99cd06b857204e756126feb89a8, source-manifest.json b9ad6e8220779d397fa1297768fcaa7efe45607ebdc029d559bf67b543b03722다.

위 선택 성공은 새 전체 Unit/CI/80%·공통 품질·공식 리뷰나 main 머지 성공이 아니다. 실제 새 source의 CI에서 수정 경로와 U1 failed suite를 함께 확인한다.

## 759e578 CI의 통합 실패와 소유 보고서 준비

새 CI run38200072923은 branch HEAD759e5780d394378601a6785281dc3da0f82788ae·PR checkout mergeSHAa2a85d60d8d3b056bb11bee3cbad8e980d532f9e·sourceDigest232ab0867d43f85ee7fe7c099bd602dd5e2dde89b607d7f79e7b9a3c6d245f22의 failure로 종료됐다. 세 Unit summary는 각각 자신의 unit child가 실제 완료됐음을 기록했다. U1 integration assertion168/168 PASS였으나 failedSuite1·success=false의 실제 파일은 tests/u1/integration/deployment-compatibility.spec.ts(8assertions)다. U2 integration274개 중272 PASS/2 FAIL의 실제 위치는 http-primary-ac.spec.ts 순번5/605행과7/873행이다.

U1 afterAll의 deployment-compatibility.json 쓰기와 U2의 실제 ACK 증거 JSONL 쓰기에 필요한 부모 .reports/u1/.reports/u2/selected가 깨끗한 CI에서는 준비되지 않은 것을 source와 bootstrap 경로에서 확인했다. 실제 OS 오류 코드는 summary에 없으며 새로 관측했다고 주장하지 않는다. U2 업무/HTTP/ACK 단언 뒤 실제 write 위치에서 실패했고 로컬의 기존 폴더 의존을 제거한다. 두 시험의 소유 부모만 recursive/mode0700으로 준비하고 기존0600 쓰기와 모든 업무 단언은 유지한다. U1 write 실패도 전파하면서 finally에서 source.destroy로 정리를 보장한다.

Luna의 타입/지정 린트/포맷은 종료 코드0이다. ci-owned-report-dir-u1-deployment-integration-20261012.json은 단일 파일8/8 PASS, ci-owned-report-dir-u2-http-integration-20261012.json은 단일 파일7/7 PASS다. root가 두 JSON의 fail/pending/todo/failedSuite0·success=true를 직접 확인했다. strict manifest/traceability170경로·104ID·Deferred AC7개 검사도 통과했고 전후3파일 SHA가 동일했다. U1 deployment spec39eff50fe22c5e08c86e113627f57c4244d4e58c3706269c4ee8cf819fa0f3cc, U2 HTTP spec8d0ffb25d6f66574242224619da477a7aa17ac01928f896903d485450cff5654, source-manifest35e1ed4b5d5acb7f600a2d22a732345df55c630934976ffd5fa57d89c2c3a451다.

## 100행 저장·동일 phase 조회 개선

같은 CI의 U3 integration은157개 중155 PASS/2 FAIL·pending/todo0·failedSuites4·success=false였으며 observed=true·exit1·expired=false·새 VALID_COUNTS다. order-decision.spec.ts 순번3와 order-submission.spec.ts 순번3는 모두100행 사례다. 허용 프레임은 protected-transaction.ts77/150의 조회, order-acceptance.ts1006의 판단 저장, u3-repository.ts105의 최종 primary 전제 대조다. 실제 업무/DB 오류 코드나 timeout은 아직 미확정이며 단순히시간 초과라고 선언하지 않는다.

root가 기존 putNewBatch의 HEAD 존재·working 동일과2ce965a 도입을 확인했다. 이 메서드는1~100개 새 revision1/정확 버전/고유ID를 검증하고 upsert 없는 INSERT·FK/COMMIT 제약과 전체 changes 원본 등록을 유지한다. 두 callsite만 개선해 새 OrderLine100개의 개별 get/save를 배치 INSERT로 바꾸고, 같은 currentOrderTerms phase가 검증한 snapshot/choice/lines를 재사용한다. 독립 최종 assertPremises와 현재 권한·보호 전후 대조는 그대로이며 전역/다른 phase cache는 추가하지 않았다. 서비스10초·DB3초·stmt2초·lock500ms·100행과80% 기준은 유지한다.

Luna의 타입·지정 린트·포맷은 종료 코드0이다. order-100-row-batch-same-phase-integration-20261012.json은 두 파일20/20 PASS(접수8/판단12), order-100-row-optimization-change-regression-20261012.json은 한 파일11/11 PASS다. root가 실제 파일 수와 fail/pending/todo/failedSuite0·success=true를 확인했다. 모의 duplicate·실제 deferred FK23503 전체 rollback과 마지막100번째 행의 후단 미보호 변경 거절·판단 rollback·원래 snapshot 보존을 추가하고 기존100행/candidate/응답 유실·재전송·주문 변경 흐름을 검증했다.

전후3파일 SHA는 order-acceptance.ts 263f0def760c9400db52c95fdc1f4a77225bf2591480b536ed166ad484bb7a0f, order-submission.spec.ts 0c608870f7bb6cf64bea24e51eeccd6f04c795e7fd6023ed814c9c58eae59082, order-decision.spec.ts c7838a955b9817f6a15e9b15fc0e3a3a6fe4a64414c8f9c3637725e6aaef3c04로 동일했다. root의 실제 전체 Git 변경/manifest 대조는170/170·누락/추가0이다. 보호 source/bytes·100행·전제·원자성·시간 기준을 줄이지 않았으며 실제 새 source의 전체 CI/80%·공통 품질/보안·공식 리뷰는 아직 미완료다.

## 9ca3cfc의 실제 CI U1 기여 통과

보고서 폴더·100행 개선과 검증 기록은9ca3cfc05cecbb11c866c8ec702d99a0f1714712로 커밋·push했다. 현재 실제 CI run38202950687은 해당 branch HEAD이며 PR checkout4461f526d86d85642fed6f0eea0d657cb8351a14의 sourceDigest9ef0f7d8a8f33acde49692adee31bf0f073b8ea15bfd056ece35c80e6f757977에 각 증거를 결합한다. 이전 실패3회는 보존하고 취소/성공 재표기를 하지 않았다.

U1 job114660128439가 실제 success로 완료됐다. 해당 성공 artifact를 private .reports/u3/github/38202950687/u1-current에 내려받아 root가 JSON과 validation을 확인했다. unit571·integration168·같은739개 coverage 재실행은 모두 fail/pending/todo/failedSuite0·success=true다. validation의 u1-unit/u1-integration/u1-coverage는 각각 passed/observed/fresh=true·exit0·signal/errorCode=null·expired/logFailed=false·pilot-current/위 source/checkout HEAD였다. 기존 suite 실패를 지우지 않고 새로운 source에서의 전체 성공을 별도로 기록한다.

739개 coverage 재실행을 새 고유739개로 더하지 않는다. U1 기여 성공만으로3기여80%·전체 품질/보안·실제 전체 CI·최종 리뷰·main 머지 성공을 주장하지 않는다.

## 9ca3cfc CI 종료와 U3 남은 실패

run38202950687은 전체 failure로 종료됐다. U1과 U2 job은 success이며 U2의 상세 성공 artifact 수는 아직 별도로 대조하지 않았다. U3는 unit을 완료했으나 integration159개 중155 PASS/4 FAIL·pending/todo0·failedSuites6·success=false다. 실행은 observed=true·exit1·expired=false·logFailed=false이고 새 artifact/VALID_COUNTS이며 receipt/report validation 오류는 없다. 선행 실패로 project 품질·보안·전체80% 검증은 차단됐다.

실패 위치는 commercial-proposal 순번1, order-decision 순번3·4, order-submission 순번3이다. 공개 summary에는 실제 받은 업무/DB 오류 code가 없으므로 모두 시간 초과라고 단정하지 않는다. proposal의 execution-budget.ts26 프레임은 소스의 EXECUTION_DEADLINE 분기에 대응한다는 추론이며, 정상 create/read/consent가 seed 시점의 요청 budget을 재사용하는 시험 전제를 확인했다. 정상 요청마다 기존 실제 재인증 closure로 새 context를 만드는 정합화를 진행한다.

100행 후단에서는 현재 보호/원본/트랜잭션 조회와 write 목록 탐색이 반복된다. submit의 새100행이 모두 premises인 것은 아니므로 실패를 전제100회만으로 설명하지 않는다. 같은 assertPremises 호출 내 write Map 개선과 테스트 한정 aggregate 시간/횟수 관측으로 실제 병목을 구분한다. 서비스10초·DB3초·statement2초·lock500ms·최대100행·최종 현재성/보호/권한 대조·전체80% 기준은 유지한다. Step19/20·별도 리뷰·main 머지는 미완료다.

root가 같은 run의 U2 성공 artifact와 PC artifact를 private 폴더에 내려받아 확인했다. unit465/465·integration274/274·같은739개 coverage 재실행은 모두 fail/pending/todo/failedSuite0·success=true다. PC 통계는 expected5·skipped/unexpected/flaky0이다. validation-u2는 pilot-current·동일 checkout HEAD/digest이며 u2-unit/u2-integration/u2-coverage/u2-e2e 각각 passed/observed/fresh=true·exit0·signal/errorCode=null·expired/logFailed=false다. 다른 소스나 전체 제품 성공으로 확대하지 않는다.

추가 source 조사에서 submission의 입력 준비/제출/후속 조회와 decision의 긴 seed 뒤 직원 판단도 최초 요청 context를 재사용함을 확인했다. 따라서 현재 CI 프레임을 한 요청10초 초과로 해석하지 않는다. 각 실제 정상 요청은 기존 재인증 closure로 새 context를 받도록 시험 전제를 정합화하며, 명시 부정 actor/기업/외부 ingress/권한 회수/변조 입력 단언은 유지한다. opt-in aggregate 계측은 입력 준비 뒤 실제 요청 context를 사용한다. 계측 자체 overhead가 포함되고 중첩 누적 시간을 합산하지 않는다. 선택 시험 및 새로운 source의 전체 CI 결과는 아직 없다.

## 요청별 예산 정합화의 로컬 검증

Luna가 고정된 제품/시험7경로를 검사했다. TypeScript·지정 ESLint·Prettier는 종료 코드0이다. fresh-request-budget-map-unit-20261012.json은 두 파일22/22 PASS, fresh-request-budget-profile-integration-20261012.json은 세 파일32/32 PASS다. root도 실제 JSON에서 각각 fail/pending/todo/failedSuite0·success=true와 testResults.length2/3을 확인했다. proposal·100행 접수/판단·권한 거절·보호 변조·rollback·재시도·경쟁의 기존 단언을 유지한다.

새 helper는 테스트의 명시 OMS_U3_BUDGET_PROFILE=1에서만 동작하며 원본/식별자/SQL/오류 문자열을 수집하지 않는다. 숫자 집계는 준비 구간 이후 실제 요청을 측정하고 중첩 메서드 시간을 합산하지 않는다. source-manifest171개 경로와 실제 전체 Git 변경+신규 helper171개를 root가 대조해 누락/추가0·전체 파일 존재를 확인했다. 이 로컬 선택 결과는 새 전체 CI/전체80%·보안·별도 리뷰·main 머지의 성공을 의미하지 않는다.

고정7파일의 SHA는 검사 전후 동일했다. 계측된 실제 제출/판단 구간은 SUBMISSION_100 859.772ms, DECISION_100 1634.920ms, 판단용 seed 제출 두 회1094.776ms/1052.294ms이며 각각 요청 진입 잔여9990/9984/9990/9989ms다. 단계별 중첩 시간을 합산하지 않고 계측 overhead를 포함한 로컬 관측으로 제한한다. 이 실행에서100행 요청 자체10초 초과는 관측되지 않았으며 운영 지연/용량 목표나 CI 시간 보장으로 확대하지 않는다.
