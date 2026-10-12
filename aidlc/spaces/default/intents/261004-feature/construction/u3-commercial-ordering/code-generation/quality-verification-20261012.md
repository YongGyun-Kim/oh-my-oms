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
