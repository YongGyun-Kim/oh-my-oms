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

## 7d4df31의 실제 CI 검증

요청별 예산 정합화와 로컬 검증 기록은7d4df314d58810eef006037594a9a1441b4029b5로 커밋·push했다. 새 실제 CI run38206085977의 PR checkout HEAD는3d1b4f83e4879b42767975bc61e63fb9e873e285이며 branch HEAD와 구분한다. U1 성공 artifact의 sourceDigest는bc0a6336373fccfd0b921e576fb702fc6624d70715d50b2902354ec2afe36f1a다.

root가 새 U1 성공 artifact의 unit571/571·integration168/168·같은739개 coverage 재실행을 확인했다. 각각 fail/pending/todo/failedSuite0·success=true이고 validation-u1은 pilot-current·위 checkout/digest, 각 u1-unit/u1-integration/u1-coverage가 passed/observed/fresh=true·exit0·signal/errorCode=null·expired/logFailed=false다. U2/U3와 project 전체 품질·보안·80%는 아직 진행 중이다. 이전 실제 실패 기록은 보존한다.

같은 run은 failure로 종료됐다. U1·U2 job은 success이고 U3 integration159개 중152 PASS/7 FAIL·pending/todo0·failedSuites8·success=false다. U3 unit은 완료했고 integration은 observed=true·exit1·expired/logFailed=false·새 artifact/VALID_COUNTS, receipt/report validation 오류는 없다. 같은 sourceDigest/checkout을 확인했다. 선행 실패로 project 필수 검사·보안·전체80%는 skipped였다.

실패 파일/순번은 http-host1, order-change1/3/8, order-decision3/4, order-submission3이며 proposal은 통과했다. actual 받은 업무/DB code는 공개 요약에 없어 로컬32개 PASS나 요청별 예산 수정만으로 CI 문제가 해결됐다고 선언하지 않는다. 다른 정상 요청의 문맥 재사용과 현재 원본/보호 조회 비용, 실제 오류를 안전하게 관측하는 방법을 추가 조사한다. source/시간/100행/보호·권한·80% 기준은 유지하고 미완료 Step19/20을 완료로 바꾸지 않는다.

## 실제 받은 오류 코드의 안전 관측 검증

추가 source 조사에서 order-change는 이미 각 실제 요청에 새 context를 사용하고 HTTP도 요청마다 authenticate한다는 점을 확인했다. 해당 경로에 같은 수정이나 오류코드 추측을 반복하지 않는다. Vitest의 구조화된 오류에서 직접 받은 code/driverError.code를 닫힌 enum으로만 기록하고, matcher actual/expected·message 문자열은 해석하지 않는 시험 reporter를 연결했다. 실제 CI의 reporter 인수 override와 U3 전체 커버리지 설정까지 연결하며 기존 JSON counts/output·실패 차단은 부모 reporter대로 유지한다.

첫 TypeScript 검사는 테스트 metadata의 TS2339로 종료 코드2였고 단위 검사를 실행하지 않았다. TaskMeta의 전용3개 unknown 입력 선언을 정식 병합한 뒤 Luna의 타입·지정 ESLint·19파일 Prettier가 종료 코드0, 받은 오류 진단/collector 단위 두 파일21/21 PASS·fail/pending/todo/failedSuite0·success=true로 확인됐다. root도 해당 JSON count와 실제 파일 수2를 확인했다.

DB 없는 reporter probe는 기본 suite 밖에서 BASELINE/SAFE를 각각 실제 Vitest로 실행했다. 두 실행은 의도된 exit1이며 각4개 중1 PASS/3 FAIL·pending/todo0·failedSuite1·success=false·실제 파일 수1이다. 원래 count/파일·assertion status가 동일했고, SAFE의 직접 오류 EXECUTION_DEADLINE·직접 driver SQLSTATE55P03·matcher UNKNOWN과 READ_100 phase를 확인했다. 정상 예상 rejection에는 실패 meta가 없고 안전 meta에 private sentinel이 없었다. root도 실제 두 JSON에서 이 사실을 대조했다. 이 제어된3 FAIL을 실제 U3 업무 회귀 실패 또는 통과로 표현하지 않는다.

private probe 폴더는0700·로그0600이다. source-manifest176개 경로와 실제 전체 Git 변경+신규5경로176개를 root가 대조해 누락/추가0·모든 파일 존재를 확인했다. 실제 phase 연결의 관련 통합4파일은 아직 실행 중이며 새 전체 CI/80%·보안·공식 리뷰·main 머지는 미완료다.

관련 통합 실행은 종료 코드0으로 끝났다. received-code-phase-integration-20261012.json의 실제4파일37/37 PASS·fail/pending/todo/failedSuite0·success=true를 root도 확인했다. Luna가19개 입력의 전후 SHA 일치를 확인했고 private 통합 로그는0600이다. APPLY_REVIEW 2568.236ms·APPLY_RESPONSE_LOSS2649.275ms·HTTP_APPLY2803.397ms(그 안의 protectedExecute2630.977ms)·READ_1001920.292ms를 관측했다. 중첩 시간을 합산하지 않고 계측 overhead를 포함한 로컬 수치로 제한한다. 실제 CI의 받은 오류를 새 source에서 확인하기 전 DB 시간 초과나 업무 실패의 확정 원인으로 해석하지 않는다. source/시간/100행/보호/권한/80% 기준을 유지했다.

## ef17200의 실제 CI 관측

안전한 오류/phase 관측과 검증 기록은ef17200315539d6de079fea8e621fe26b1a02d63으로 커밋·push했다. 실제 CI run38210116465의 PR checkout HEADa889f07a44a8927218ea205524839b844cd6894d와 branch HEAD를 구분한다. 새 U1 성공 artifact의 sourceDigest는4328dc4b1a92c0477f3955c749340de16093f01615ee195799aef837da5c4ac4다.

root가 U1의 unit571/571·integration168/168·같은739개 coverage 재실행을 확인했다. 각각 fail/pending/todo/failedSuite0·success=true이고 validation-u1은 pilot-current·위 checkout/digest·각 검사 passed/observed/fresh=true·exit0·signal/errorCode=null·expired/logFailed=false다. U2/U3와 project 전체80%·품질·보안은 아직 진행 중이다. 이전 CI 실패와 Step19/20 미완료는 그대로 유지한다.

run38210116465은 전체 failure로 종료됐다. U1·U2는 success, U3 integration159개 중151 PASS/8 FAIL·pending/todo0·failedSuites8·success=false다. U3 unit은 완료했으나 통합은 observed=true·exit1·expired/logFailed=false·새 VALID_COUNTS이며 receipt/report validation 오류는 없다. 같은 sourceDigest를 확인했다. project 전체80%·품질·보안은 선행 실패로 skipped다.

새 안전 summary의 received는 실제 오류를 보존했다. APPLY_PROTECTION과100행 판단 후단 변조 사례의 메서드 rejectedErrors에서 SQLSTATE25P04를 관측했다. 이는 [PostgreSQL17 공식 오류 코드](https://www.postgresql.org/docs/17/errcodes-appendix.html)의 transaction_timeout이다. 해당 protectedExecute는 약3004ms였고 실제 설정 transaction_timeout3000과 대조했다. 나머지 HTTP_APPLY/APPLY_REVIEW/APPLY_RESPONSE_LOSS/DECISION_100/READ_100에서도 약3002~3008ms에 QUERY_RUNNER_RELEASED를 관측했지만 직접25P04가 없는 사례까지 동일 DB 오류를 받은 것으로 표현하지 않는다. HTTP 실제 응답은503/REQUEST_UNAVAILABLE다.

100행 제출 자체 protectedExecute1851.296ms는 성공했고 후속 READ_1003113.126ms가 실패했다. HTTP_APPLY의 currentProtected1085회/1929.778ms·transactionGet1027회/477.645ms, APPLY_REVIEW의 currentProtected1104회·transactionGet1053회,100행 판단의 validateUri7913회/1926.344ms, READ_100의 validateUri9121회/2163.850ms를 구분해 관측했다. 중첩 시간은 합산하지 않는다. 별도 order-change 순번10은 phase 없는 ASSERTION/UNKNOWN이므로 확정 원인을 만들지 않는다.

소스에서 확인한 같은 phase 중복 조회를 제거하되 최종 현재성/권한/보호 대조를 유지하는 좁은 수정과 후단 변조 거절 시험을 진행한다. 새 DB 구조·전역/phase간 현재성 cache·시간/100행/80% 완화는 하지 않는다. 실제 새 source 재검증·별도 리뷰·main 머지는 미완료다.

## 같은 구간의 조회·상품 원본 재사용 검증

currentOrderTerms에서 같은 조회 구간에 검증한 snapshot/choice/lines를 출력에 재사용하고 applicationSource의 검증된 Product를 정확 u3Ref와 대조해 apply 경계에 전달했다. 독립적인 applicationSource 전후·권한/근거/U7와 최종 assertPremises는 유지한다. 후단100번째 primary 행 변조 거절과 application 기록 뒤 Product 미보호 개정 변경의 전체 rollback 시험을 추가했다.

Luna의4파일 TypeScript·ESLint·Prettier는 종료 코드0이고 same-phase-read-product-integration-20261012.json의 두 실제 파일21/21 PASS·fail/pending/todo/failedSuite0·success=true를 root도 확인했다. 네 파일 SHA는 검사 전후 동일했다. 로컬 READ_100은1445.695ms/1337.722ms이며 APPLY_RESPONSE_LOSS는2929.544ms였다. 계측 overhead를 포함하고 중첩 시간을 합산하지 않는다. 부분적인 개선이 모든 CI 실패를 해결했다는 증거가 아니며, 적용의 직원 권위검증에서 발견한 동일 StaffRole 연속 재조회만 추가로 줄이되 전후 권위검증·grant 전체 scan은 유지한다. 실제 새 전체 CI와 공식 리뷰는 미완료다.

## 직원 권위 검사 내부의 동일 역할 재조회 제거

검증된 조회/상품 수정4파일과 당시 품질 기록은960d2dd로 로컬 커밋했다. 추가 Authorization의 private staffRoleAuthority가 lookup으로 보호/primary 전체 원상 대조를 마친 StaffRole을 private roleState에 전달한다. public currentRoleState(kind,id,transaction)의3인수·독립 재조회·출력, CustomerRole 자체 쓰기, 권위 전후 검사와 전체 grant 순회는 유지한다. 외부 호출자가 RoleData를 제공하는 public 인수나 전역/phase간 proof cache는 추가하지 않는다. 역할/개정/profile 혼동·전체 이미지 오염·뒤쪽 grant 오염·다음 검사 권한 회수/변조·원래 보호 이미지와 패자 요청 미생성 시험을 보완했다.

첫 타입 검사는 새 테스트 request.audience의 넓은 string 추론으로 TS2345/exit2였고 후속 검사를 중단했다. 실제 WriteRequest 타입을 명시한 뒤 Luna의 타입·지정 ESLint·Prettier가 모두 exit0이다. 전체 U3 단위는 staff-authority-private-unit-20261012.json의31파일303/303 PASS, 영향 U1 단위는1파일8/8, U2 단위는2파일18/18이다. root도 실제 JSON의 fail/pending/todo/failedSuite0·success=true와 파일 수를 확인했다. 관련 U3 통합과 U1/U2 통합 회귀는 아직 실행 중이며 전체 CI/80%·보안·별도 리뷰·main 머지는 미완료다.

## 2026-10-13 스트림 복구와 저장된 통합 결과

요청85fbe283-fc4c-4d49-a8f8-e093eaf0724e 중단 후 원래 PATH aidlc로 같은 U3 Code Generation과 기존 승인 상태를 복구했다. 작업 소스는 로컬960d2dd와 직원 권위 수정3파일이며, 수정3파일과 기존4파일의 SHA가 앞선 고정값과 동일함을 root가 확인했다. 미추적 aidlc_change.sh·tests/u1/.reports는 보존한다.

Luna와 root가 기존 JSON을 읽기 전용으로 대조했다. staff-authority-private-integration-20261012.json은7파일65/65 PASS, staff-authority-u2-integration-20261012.json은2파일17/17 PASS다. 모두 fail/pending/todo/failedSuite0·success=true다. staff-authority-u1-selected-integration-20261012.json은1파일의 총53개 중선택3 PASS·50 pending/미실행·fail/todo/failedSuite0·success=true다. 선택 밖50개를 통과로 표시하지 않는다. 앞선 U3 단위303·U1 단위8·U2 단위18의 성공도 같은 source 지문에서 확인했다.

진행 중인 Vitest 프로세스는 없었고 이전 프로세스의 최종 exit scalar는 복구 시 확인하지 못했다. JSON success를 새 observed exit0 receipt로 만들지 않으며, 소스 변경이나 새 실패가 없는 선택 검사를 반복하지 않는다. 저장된 로컬 결과와 새 커밋의 실제 CI·전체80%/품질·보안·별도 리뷰·main 머지는 별도 판정한다. Step19/20 미완료는 유지한다.

## bb89b1f의 실제 CI 검증

조회·상품 원본 재사용960d2dd와 직원 권위 검사 내부 재조회 제거bb89b1f2679892bd880c7ecda4be73485e52c83a를 push했다. 실제 CI run38337443760의 PR checkout HEAD는f1917fb62be3b5a1d658012cd428c3c2397d24c3이며 branch HEAD와 구분한다. U1·U2 성공 artifact의 sourceDigest는b8a58550e03fdd492e041ce7419c8fb2f94948f3755140f2d1a0a75b161322d1이다.

root가 U1 단위571/571·통합168/168과 U2 단위465/465·통합274/274를 실제 JSON에서 확인했다. 각 기여의 같은739개 coverage 재실행도 통과했으며 고유시험 수에 중복 합산하지 않는다. 모두 fail/pending/todo/failedSuite0·success=true다. 같은 checkout/digest의 validation-u1·validation-u2는 pilot-current이고 해당 검사마다 passed/observed/exists/fresh=true·exit0·signal/errorCode=null·expired/logFailed=false다.

U2 PC 보고서는 expected5·skipped/unexpected/flaky0·errors0이며 validation-u2의 u2-e2e도 같은 source에서 observed=true·exit0·fresh=true다. U1·U2 job은 success로 끝났지만 U3와 project 전체80%·품질·보안은 아직 진행 중이다. Step19/20·공식 리뷰·main 머지는 완료로 처리하지 않는다.

run38337443760은 failure로 종료됐다. U3 통합162개 중158 PASS·4 FAIL, pending/todo0·failedSuites4·success=false다. 실제 child는 observed=true·exit1·signal/errorCode=null·expired/logFailed=false이고 새 artifact/VALID_COUNTS이며 validationFailure/validationErrorCode=null이다. 선행 실패로 project의 전체80%·품질·보안 검증은 실행되지 않았고, 성공 결과가 없어 최종 결과 artifact 보존 단계도 실패했다.

실패는 order-decision 순번3/4와 order-submission 순번3/4다. READ_100의 최종 assertPremises에서 실제SQLSTATE25P04를 받았고 protected 원본 대조는1608.206ms, validateUri는9082회/2109.323ms였다. DECISION_100은protectedExecute3008.141ms·assertPremises1059.827ms에서QUERY_RUNNER_RELEASED를 받았다. 변조 거절 시험의 최종 assertion은UNKNOWN이고 내부 메서드에서는 같은 약3초 QUERY_RUNNER_RELEASED를 관측했다. 이 실패들이 모두 직접25P04를 받았다고 확대하지 않고 중첩 시간을 합산하지 않는다.

최종 현재성·권한·보호 원상 검사를 유지하면서 실제 검증/조회 호출 경로의 남은 비용을 조사한다. HTTP·변경 적용이 실패목록에서 빠졌다는 사실을 최종 전체통과나 운영용량 실증으로 바꾸지 않는다. 시간/100행/80% 기준과 Step19/20 미완료를 보존한다.

## 스키마 검증의 오류 목록 수집 비용 축소

SchemaValidator의 Ajv allErrors 설정만 false로 변경했다. private validator 오류 목록을 소비하는 제품 경로는 없으며 공개 결과는 기존 boolean 판정과400 INVALID_INPUT으로 유지한다. coerceTypes/removeAdditional·closed schema·oneOf/anyOf 및 U3 교차 필드 의미 검증을 보존한다. 데이터 또는 현재성 증명 캐시를 추가하지 않고 최종 assertPremises·보호/primary 전체 이미지·현재 권한/개정 대조는 그대로 수행한다.

기존 allErrors:true Ajv를 독립 판정 기준으로 모든 등록 Ref owner/entity의 정상·다중 오류·누락·추가 필드·개정 경계를 비교하고 입력 무변경을 확인했다. 같은 객체의 후속 변조 재검증과 AJV 이후 역순 기간 의미 검증도 추가했다. source schema.ts의 SHA는794d3eef6c98f9cb3d6032c8868e95ba69ac9d24d198cc3f45b271c080e8d81e이고 contracts.spec.ts의 최종 SHA는45bf20fec26472118d9c105e6fd178a067837e6434e9c045e941b6fe05587a63이다.

Luna의 TypeScript·지정 ESLint는 exit0이다. 첫 Prettier 검사는 contracts.spec.ts 형식으로 exit1이라 의미 테스트를 중단했고 개발자가 해당 파일 형식만 정리한 후 check exit0을 확인했다. U3 선택5파일77/77·U1 선택2파일23/23·U2 선택2파일20/20이 exit0으로 통과했다. root도 각 실제 JSON의 fail/pending/todo/failedSuite0·success=true를 확인했다.

첫 격리 DB 준비는 Docker daemon unavailable로 exit1이었다. root가 Docker를 시작하고 등록된 synthetic/oms-u1 primary·journal 두 기존 컨테이너만 재시작했다. 다음 소유 DB 준비는 exit0이며 이름/격리 admission을 바꾸지 않았다. 두100행 통합 시험은 exit0, order-decision12개·order-submission9개 총21/21 PASS·fail/pending/todo/failedSuite0·success=true다. root도 실제2파일 JSON을 대조했다. 후단 변조 거절과 실제 최종 원본 대조를 포함하며 아직 새 전체 CI·전체80%·품질/보안·공식 리뷰를 대체하지 않는다.

소유 private 로그의 고정 U3_BUDGET_AGGREGATE JSON만 허용 수치로 투영했다. READ_100 두 관측은554.3~655.4ms, DECISION_100 두 관측은888.0~1001.8ms다. 정상·변조 거절 관측을 포함하므로 운영 평균이나 용량으로 해석하지 않는다. 의도된 후단 변조는CURRENT_AUTH_NOT_PROTECTED로 거절됐다. 중첩 시간을 합산하지 않고 계측 overhead가 포함된 로컬 관측으로 제한한다.

독립 Ajv 비교는 같은5개 서버 schema를 warm compile한 뒤 순서를 교차해 설정별5회씩 총10개 관측을 만들었다. 관측마다 Ref9000회와100행 OrderInput30회를 따로 측정했다. Ref9000회는 allErrors:true5.636~6.391ms·false1.637~2.358ms, OrderInput30회는true134.858~158.824ms·false8.606~18.754ms다. 입력 JSON 불변·exit0과 실제 숫자 JSON을 root가 확인했다. 앞선5개 혼합 duration은 Ref/Order를 함께 측정해 이 분리 비교의 증거로 사용하지 않는다. 이 비교는 boolean schema 검증 비용만이며 DB·의미 검증·보호 저장·최종 전제 검증·실제CI 시간은 포함하지 않는다.

검사 전후 두 source SHA가 같았고 root가 baseline a2d694f 이후 실제176개 source 경로와 manifest176개를 대조해 누락/추가0을 확인했다. 같은 수정의 새 실제 CI를 실행한 뒤 전체 품질·보안·80%와 별도 리뷰를 판정한다.

## 10349e2의 실제 CI 검증

스키마 비용 수정과 회귀·품질 기록은10349e2993f7d16a499f8ef1f1b5f811d0651f1f로 커밋·push했다. 새 실제 CI run38339978025의 PR checkout HEAD는ffd5413d342642a9b03b384b56fd897d4f65f11d이고 sourceDigest는f7e3f923ce5c9af5bdd198e8110d19651a54652cd62114288fb2821a4f92f843이다.

root가 새 U1 성공 artifact의 단위571/571·통합168/168·같은739개 coverage 재실행을 확인했다. fail/pending/todo/failedSuite0·success=true이고 validation-u1은pilot-current·위 checkout/digest를 보존한다. 각 검사마다 passed/observed/exists/fresh=true·exit0·signal/errorCode=null·expired/logFailed=false다. U2/U3와 project 전체80%·품질·보안은 아직 진행 중이며 Step19/20을 완료로 바꾸지 않는다.

같은 run의 U2 job도 success로 종료됐다. root가 실제 artifact에서 단위465/465·통합274/274·같은739개 coverage 재실행을 확인했으며 fail/pending/todo/failedSuite0·success=true다. validation-u2의 각 검사와 u2-e2e는 위 같은 checkout/digest·observed/exists/fresh/passed=true·exit0·signal/errorCode=null·expired/logFailed=false다. 실제 PC 보고서도 expected5·skipped/unexpected/flaky0·errors0을 확인했다. U3와 project는 아직 진행 중이다.

run38339978025은 failure로 종료됐다. 새 U3 안전 summary는completed에u3-unit·u3-integration을 기록했지만u3-coverage는observed=true·exit1·signal/errorCode=null·expired/logFailed=false, artifact.exists/fresh=false·bytes=null·reportStatus NOT_APPLICABLE·tests=null이다. 완료되지 않은 커버리지의 테스트 수를 추정하지 않으며 새 U3 성공 원문 artifact도 없어 전체 unit/integration의 상세 개수는 이 기록에서 확정하지 않는다.

project 전체80%·품질/보안은 선행 실패로 실행되지 않았고 최종 성공 결과가 없어 보존 단계도 실패했다. source와 제품/DB/시험 기한을 유지한 채 coverage 실행/보고서 미생성 원인을 조사한다. root가 내려받은 job 로그는 소유0700 경로/0600 파일로만 보존하고 원문은 공개하지 않는다. 지금까지의 제한된 고정 패턴 검사만으로 OOM·디스크 부족·DB timeout 또는 다른 원인을 확정하지 않는다. Step19/20·별도 리뷰·main 머지는 미완료다.

추가 소스 대조에서 실패 spec.path는u3-coverage/evidence.json이며 coverage-tests.json이나coverage-final.json 존재 여부는 summary에 포함되지 않는 점을 확인했다. 실제 명령은tests/project/vitest.pilot.coverage.config.ts를 사용한다. job 로그에는child 원문이 없고 고정 분류PILOT_CHILD_FAILED만 확인돼, 실행·V8·exporter·증명 변환 중 어느 원인인지 확정할 수 없다. 같은 설정의 계약/두100행 선택 진단으로 이 경계를 조사하며 선택 범위의completeScope:false 차단은 기대된 실패로 따로 보존한다. 전체 inventory·80%·각 시간 제한을 바꾸지 않는다.

## 로컬 임시 런타임 복구와 증거 정정

같은 config의 첫 로컬 진단은SOURCE_TOOL_VERSION으로 테스트 시작 전에 실패했고 종료 reporter의PILOT_COVERAGE_RUN도 발생했다. source guard가 요구하는22.23.3과 실제 기본Node22.23.1이 달랐으며 root가 기존/tmp/oms-u1-runtime 경로가 사라져 있음을 확인했다. 이 실행에서 V8·DB 예산·exporter 원인을 재현했다고 주장하지 않는다.

이번 복구의 앞선 로컬 타입/선택120개·통합21개·Ajv 비교는 실제 pinned 버전 확인 없이 실행된 증거로 정정한다. 진단 때 임시 경로 부재와 기본Node22.23.1이 확인됐지만 앞선 각 실행의process.version은 기록하지 않아 당시 버전을 확정하지 않는다. source 지문과 당시 판정은 보존하되 요구 runtime의 최종 품질 증거로 재사용하지 않는다. 반면 새 CI의 U1/U2 원문 source.tools는Node22.23.3·Vitest/V85.0.3·TypeScript6.0.3을 실제로 보존하므로 이 로컬 불일치가 CI 실패 원인이라는 결론은 내리지 않는다.

root가 공식nodejs.org의v22.23.3 darwin-arm64 archive를 내려받고 같은 공식SHASUMS256.txt로 checksum OK를 확인해 임시 runtime을 복구했다. 직접 고정 경로에서Node22.23.3/npm10.9.9를 확인했다. 다음 검증은 실행 전 실제 버전과 경로를 확인하고 기존 결과와 구분한다. source/lock/기한/하한은 변경하지 않았다.

위임된 동적 사전 확인 명령은 실행 전에 차단됐다. 루트의 고정 경로 버전 확인을 사용하고 중첩 셸/명령 치환 없이 같은 Node의 CLI를 직접 호출해 검증을 진행했다. 제한을 낮추거나 차단된 명령을 숨겨 실행하지 않았다. Node22.23.3의 TypeScript·지정 ESLint·Prettier는exit0이며 새220233 결과의 U3 선택77/77·U1 선택23/23·U2 선택20/20을 root가 실제 JSON에서 확인했다. 각각 fail/pending/todo/failedSuite0·success=true이고 두 source SHA는 전후 동일하다.

같은 Node의 실제pilot coverage config로 계약·두100행 파일을 선택한 진단은70/70 PASS·fail/pending/todo/failedSuite0·success=true·3파일이다. coverage-final.json·evidence.json은 새로 생성됐고 evidence는passed=true·completeScope=false·tests70/70/0/0·source.tools Node22.23.3을 보존한다. root가 원문 hash7362fc355128304575ca0f5ee7ab840cb516a0eb5c18f2a10da285947f1087cb 일치를 확인했다. 실제exit1은 전체 시험 범위가 아닌 선택 실행을 차단한PILOT_COVERAGE_FAILED다. V8/JSON exporter/증명 변환은 이 진단에서 정상이며 전체 CI/80%의 성공으로 승격하지 않는다.

로컬 V8 진단의READ_100은780.3~904.6ms·DECISION_100은1180.9~1198.3ms이며 정상과 변조 거절 관측을 포함한다. 중첩 시간을 합산하지 않고 CI 수치/운영용량으로 일반화하지 않는다. 이번 진단은 실제 CI의 구체 실패를 재현하지 못했다. 다음 실패에서 고정된 소유 coverage-tests.json이 새로 존재하면 허용된 counts·위치·받은 오류만 요약해 조사할 수 있도록 보완한다. 실패 판정·source·원문 보호·전체 분모/하한·시간 제한은 유지한다.

## 커버리지 실패의 별도 테스트 결과 관측

실제 실패 spec의evidence.json과 별개로 U3 coverage-tests.json을 읽지 않는 관측 누락을 확인했다. U3 커버리지 실패에만coverageTests.diagnosticOnly=true를 추가한다. 실제child exit/receipt/source/기여 판정은 보존하며 source/key/path/command/env·관측 여부·시각 창을 대조한다. 고정된 소유 경로의 새8MiB 이하 일반 파일만O_NOFOLLOW·parent realpath·읽기 전후inode/dev/mtime/ctime/size로 확인한다. missing/stale/source불일치 등은UNCONFIRMED, 잘못된JSON/count/foreign/중복/enum은INVALID이며 선택 범위는completeScope:false로 관측한다. 원문/로그/SQL/입력은 공개하거나 성공 증거로 승격하지 않는다. 새child 전 기존 시험 JSON도 원래archive로 보존한다.

첫 진단 회귀는36개 중34 PASS/2 FAIL, 다음은37개 중34 PASS/3 FAIL이었다. 당시 타입·린트·형식은exit0이었다. Vitest는파일과 중첩describe를 모두suite로 세므로 실패 파일 수와numFailedTestSuites의 동일성 강제가 잘못된 것을 확인해 제거했고 실제JsonReporter hierarchy 회귀를 추가했다. 별도의 테스트 fixture가 동일 argv를 가진U1/U2/U3 coverage 명령을argv만으로 선택해U1을 골라U3 JSON을 쓰지 않는 원인을 확인했다. 단일 선택 진단은총21개 중1 FAIL·20 미실행이며 bufferPresent:false·bytes0·modified0을 관측했다. 새U3 fake runner3곳의scope 선택만 정정하고 중간 계측을 제거했다. 원래reader/source/receipt guard는 완화하지 않았다.

최종r4는Node22.23.3에서 타입·해당 lint/format exit0이고 두 실제 파일37/37 PASS·fail/pending/todo/failedSuite0·success=true·exit0이다. root도r4 JSON을 확인했다. 안정된4파일 SHA는ci-pilot-proof.ts a2b1e15e1f08fa5c9253816daaff0e91f99fc2b3eb7e2589fb6396e92fd52e1b, pilot-safe-diagnostics.ts caa3f3b6385a7e5ff12f8ae5ba12fa8a93eb5255da594dd9e5ca7bfbee7519f8, pilot-ci.spec.ts8058d42107a97439efc93078556fb433c0676f7d20ea04e179b4cc86827b4f37, safe-diagnostics.spec.ts811be878ed2f811075c1a3ef92b244994635d19aa49ad2b6c0d04593ba364246이다. 검사 전후 지문이 같았고 root가 실제176개 경로와manifest176개를 대조해 누락/추가0을 확인했다. 실제 CI 실패 원인의 해소나 전체80%·품질/보안·별도 리뷰 완료는 아직 주장하지 않는다.

## eec8998의 전체 로컬 커버리지와 실제 CI

진단 보완·회귀·당시 품질 기록은eec89980ba7f689246734a6cc68d99bf0d125546으로 커밋·push했다. 소스를 고정한 뒤 Node22.23.3의 실제pilot coverage config를 파일 필터 없이 직접 실행했다. 소유 U3 DB 준비exit0, 전체 coverage 실제exit0·484/484 PASS·fail/pending/todo/failedSuite0·success=true·49파일을 root도 JSON에서 확인했다.

새 evidence는passed=true·completeScope=true·tests484/484/0/0·시험49파일·source inventory628경로다. local source HEAD는위eec8998, sourceDigest203b272f2467f428379f7de7acaa6133918ae8f594c4740a9d64f6221bcd310d이며 실제Node22.23.3/Vitest·V85.0.3/TypeScript6.0.3을 보존한다. 실행구간은2026-10-13T04:31:55.906Z~04:41:35.065Z다. rawHashb97246c00bd911f73a68e209d349bf6e441d0a58c818da01f5c1b60a8fd6767c를 root가 실제coverage-final.json과 대조했다. 기존 U3 출력만 타임스탬프를 보존해 별도archive했고 다른 Unit/사용자 보고서는 보존했다.

로컬 전체 제품 분모의U3 기여 line36.71%는 U3 시험의 기여율이지3개 Unit 합집합80%의 판정이 아니다. 이 로컬 성공으로 이전 실제CI의 coverage 실패 원인이 해결됐다고 확정하지 않고, 로컬과 PR checkout의 서로 다른head/digest 보고서를 합치지 않는다.

새 실제 CI run38346792092의 PR checkout HEAD는f8779d82035c2ab5fc7e471d0be96e3d175d718b이고 sourceDigest68a5b59e6d14b172396bd894ecb4fa03f195185a6fa183daf6cad733bac7a7d0다. root가 U1의 실제 단위571/571·통합168/168·같은739개 coverage 재실행을 확인했으며 fail/pending/todo/failedSuite0·success=true다. 각 검사는위checkout/digest·passed/observed/exists/fresh=true·exit0·signal/errorCode=null·expired/logFailed=false를 보존한다. U2/U3와 project 전체80%·품질·보안은 아직 진행 중이며 Step19/20·별도 리뷰·main 머지는 미완료다.

같은 run의 U2도success로 종료됐다. root가 단위465/465·통합274/274·같은739개 coverage 재실행을 확인했고 fail/pending/todo/failedSuite0·success=true다. 각 검사와u2-e2e는위 같은checkout/digest·Node22.23.3·passed/observed/exists/fresh=true·exit0·signal/errorCode=null·expired/logFailed=false다. 실제 PC 보고서는expected5·skipped/unexpected/flaky0·errors0이다. U3와 project 결과는 아직 기다리고 있다.

run38346792092은failure로 종료됐다. U3 단위·일반 통합은completed에 기록됐고 coverage child는observed=true·exit1·signal/errorCode=null·expired/logFailed=false다. evidence.json은미생성이다. 새 별도시험관측은diagnosticOnly=true·VALID_COUNTS·completeScope=true이며484개 중482 PASS/2 FAIL·pending/todo0·failedSuites4·success=false다. 이 관측으로 원래receipt의 실패나 미생성 증명을 성공으로 바꾸지 않는다. project 전체80%·품질/보안은 선행 실패로 실행되지 않았다.

실패는http-host 순번1과order-change 순번1이다. HTTP_APPLY는실제503/REQUEST_UNAVAILABLE·protectedExecute3003.048ms·currentProtected933회/1875.064ms·transactionGet880회/480.531ms·validateUri13605회/163.249ms다. APPLY_REVIEW는protectedExecute3003.960ms·currentProtected944회/1855.655ms·transactionGet898회/468.480ms·validateUri13719회/164.116ms다. 직접 받은 오류는QUERY_RUNNER_RELEASED이며 이 run에서25P04는 관측되지 않았다. 중첩 시간은 합산하지 않는다.

Ajv 내부 오류 수집 비용은 줄었지만 같은 Linux V8 실행의 적용 경로가 여전히 약3초에 실패한다. 로컬484개 성공을 이 실패의 해소로 일반화하지 않는다. 보호 원본 조회 경로의 실제 중복을 조사하고 독립적인 전후 현재 권한/원상·최종 전제 검증을 유지하는 좁은 개선을 진행한다. 기한/100행/80%·source 신뢰를 완화하지 않으며 Step19/20·별도 리뷰·main 머지는 미완료다.

## 적용 조회 분포의 로컬 선택 진단

기존 order-change 시험의 APPLY_REVIEW에 opt-in 로컬 계측을 추가했다. 첫 계측 source SHA는5c7d9832b3136cdbf8d7d62e6edfce86b4c98b002fd20cc84ec962c96560b08d이며 Node22.23.3의 타입·해당 lint/format은exit0이었다. 기존 U3 출력의 타임스탬프를 보존해 archive하고 합성 U3 DB 준비exit0 후 실제pilot coverage config로 대상 한 건을 선택했다.

첫 선택 실행은exit1·총12개 중0 PASS/1 FAIL/11 pending·1파일이었다. 고정 모델 집계는OTHER1553회·등록19종 모두0회였으며 APPLY_REVIEW5.772ms·validateUri3회/2.5234ms였다. 안전 실패 코드는UNKNOWN이며 등록 프레임이 없고 raw coverage/evidence는 생성되지 않았다. source SHA는 전후 동일했다. 이 관측은 기존 Linux CI의 약3초 실패를 재현하거나 제품 결함을 입증하지 않는다. 계측의 인수 분류·원래 메서드 위임을 먼저 조사하며 불완전한 선택 결과를 전체 기여/품질 통과로 승격하지 않는다.

원인은 계측의 instance spy가 이미 mock인 상속 prototype 메서드를 재사용해, 저장한 함수의 구현까지 변경하고 자기 자신으로 위임한 재귀였다. 첫 조회 IdentitySession은 등록 모델 밖이라 OTHER에 재귀 횟수가 쌓였다. private 로그의 고정 분류 STACK_OVERFLOW=true·QUERY_RUNNER_RELEASED=false와 실제 메서드 signature를 대조했다. 계측을 독립 own descriptor wrapper로 바꾸어 원래 profiler 메서드에 한 번만 위임하고 finally에서 원래 descriptor 또는 상속 상태로 복구한다. 같은 시험 파일 SHA708fee7a09fc80ea14c4df2b513d7da82db135c4b4aa426379baa6b20f6fa3b6으로 고정했으며 제품 코드나 원래 profiler 구현은 바꾸지 않았다.

수정 후 r2의 타입·해당 lint/format·합성 DB 준비는exit0이었다. 선택 assertion은1 PASS/0 FAIL·나머지11 pending이며 실제coverage 명령exit1이다. evidence는passed=false·completeScope=false·tests12/1/11/0으로 부분 범위 차단을 유지한다. root가 새 시험 JSON과 evidence의Node22.23.3·HEAD eec8998을 확인했다. 이것은 전체 CI 또는 전체 기여 통과가 아니다.

private 닫힌 집계는 Account98·ProviderBinding69·StaffRoleGrant201·StaffRole216·RoleRevisionState163·VerificationEvidence30·VerificationPolicy28·PersonVerification8·VerifiedPersonLink8·IdentityHistory8·RequestReceipt18·AgreementHistory14·AgreementRevision5·EnterpriseContract7·Product5·CommonOfferRevision11·CustomerRole9·CustomerRoleGrant9·ScopeV2 3·OTHER81이었다. root가 합계991을 확인해 기존profiler currentProtected991과 일치했다. 앞의 계정/Binding/직원 grant/role/state 5종이747회로 약75.4%를 차지했다.

APPLY_REVIEW1854.2ms·protectedExecute1748.6ms·currentProtected1175.7ms·transactionGet925회/287.5ms·validateUri14241회/47.4ms·validateSchema1905회/11.9ms·assertPremises1회/96.8ms이며 관측 rejection은0이다. 중첩 시간을 합산하지 않는다. source SHA는 전후 동일했다. Linux CI의944회/약3초와 같다고 주장하지 않고, 같은 권위 검사 내부에서 검증 완료된 원본을 재사용할 수 있는 좁은 경계만 조사한다.

계측과 이 기록은7fed1c1f21ff9ba73edc2acbd932f64832348dc6으로 커밋·push했다. 새 실제 CI run38351299356이 시작됐으며 아직 완료 판정은 없다. 다음 production 수정의 성공 증거로 이 이전 source의 결과를 재사용하지 않는다.

조사에서 authorization-fence의 역할/상태 중복 조회 약15회를 확인했으나 관측991회의 작은 일부라 시간 초과 해결을 확약할 수 없었다. 현 저장 API는 보호 list(ids)만 지원하고 physical/transaction 원상의 안전한 배치는 새 저장 API와 추가 검증 경계가 필요해 이번 수정에는 도입하지 않는다. 대신 기존 requireStaff/requireStaffSource의 grant별 lookup→역할→상태 검사를 한 독립 권위 검사 안에서 최대4개씩 실행하는 좁은 수정에 착수했다. 캐시 없이 기존 검사를 모두 실행하고 pre/post 권위 조회·완전한 grant scan·Source2000 상한·현재 원상/profile/개정 검증을 유지한다. 모든 시작 조회의 종료를 기다리고 원래 scan 순서의 첫 오류를 반환한다. 실제 성능 개선·현재 CI 통과는 아직 미확정이다.

새 authorization.ts SHA df9b849c72838294de05ada9ab6453f207b04d2be492fab018fbb03701384f10과 role-own-write 시험 SHA c98d4ad67429e9fff4affad5fc9d48dac1e7e96d860e1b61b5e0bf672ea1ed81을 고정했다. Node22.23.3 타입/해당 lint/format은exit0이고 첫 단위 회귀는28개 중27 PASS/1 FAIL·pending/todo0·exit1이었다. 실패 순번28의 matcher 위치는role-own-write.spec.ts:460:6이며 추가 U2 회귀는 실행하지 않았다.

처음 보고된 CURRENT_AUTH_NOT_PROTECTED는 최종 matcher의 기대 코드였으며 직접 받은 오류로 확정할 수 없어 정정한다. 이 fixture의 transaction.get은 기존 vi.fn이고 bind한 mock에 다시 spyOn 구현을 설치해 자기 자신으로 위임하는 재귀가 발생했다. private JSON의 고정 분류 RangeError=true·callStackMention=true와 실제 mock 구성을 대조했다. 원래 getMockImplementation 함수 자체를 캡처해 위임하도록 시험만 수정하며 최종 guard 거절 기대와 production 검증을 유지한다.

시험의 원래 구현 캡처만 수리한 새 SHA는3df51435ffaf16d759ac8c5ef0b13999cdaa4bd6d262784d3e4e86cccb19b962이고 production SHA는df9b849c 그대로다. r2의Node22.23.3 타입/해당 lint/format은exit0이며 U3 역할 회귀28/28·공유 U2 authorization10/emergency-recovery8/role-revisions8 합계26/26 PASS·fail/pending/todo0·success=true·실제exit0이다. root가 두 private JSON의 개수/상태를 확인했고 두 source 지문은 전후 동일했다. 영향 통합·V8 계측·새 전체 CI는 다음 확인 대상이며 이 선택 단위 통과를 전체 품질 판정으로 확대하지 않는다.

이후 U1 recovery-security-policy8/8·U3 order-change12/http-host6 합계18/18 PASS·fail/pending/todo0·success=true·실제exit0을 root가 새 JSON에서 확인했다. 합성 U3 DB 준비exit0이며 원래 보고서/로그는 private0600으로 별도 보존한다. 별도 산출물 검사는 manifest176개와 실제 기준 이후 경로의 누락/추가/중복0·4개 produces 존재/비어 있지 않음을 확인했다. traceability104개는 upstream과 고유하게 일치하며 OK87/Deferred17이고 이 중 AC Deferred7을 유지한다. OK는 파일 연결이지 운영 목표 달성 판정이 아니다. 전체 source diff 검사에서 기존 oms-full-proof.yml의 EOF 빈 줄 한 개만 발견해 제거했으며 workflow 실행 의미는 동일하다.

같은 실제pilot config의 r3 선택 V8 assertion은1 PASS/0 FAIL·11 pending이고 evidence passed=false·completeScope=false·tests12/1/11/0·실제exit1이다. root가 rawHash87986a77a442d6103906ab9309a5e566beea67ca732c2a468b34037623466363 일치를 확인했다. source HEAD7fed1c1f21ff9ba73edc2acbd932f64832348dc6·digest ea5913e62a7c436b4af5a0de42feb266a2236065db77caf13a4ddd8dc929529e·inventory628경로를 보존하며 최종 변경은 실제source bytes에 포함된다. 전체 분모나 전체 기여 성공으로 승격하지 않는다.

r3 닫힌 모델별 조회는 r2와 같고 합계991회다. APPLY_REVIEW1376.8ms·protectedExecute1295.9ms·currentProtected991회/1281.4ms·transactionGet925회/357.3ms·validateUri14241회/46.0ms·validateSchema1905회/11.7ms·assertPremises1회/98.6ms이며 모든 관측 rejection은0이다. 중첩 시간을 합산하지 않는다. 같은 로컬 선택의 보호 실행1748.6→1295.9ms 감소를 관측했지만 Linux CI 예산 통과나 운영 용량을 확정하지 않는다. 네 source 지문은 전후 동일했고 workflow SHA는34ec762ce0915a55ccd5bd3620dbbcf28ed1cdd70050cb460b8247261ee5d58c다. 새 최종 CI·전체80%·품질/보안·별도 리뷰·공식완료·main 병합은 아직 남아 있다.
