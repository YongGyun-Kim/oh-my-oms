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
