# U3 파일럿 CI·coverage 집계 검증

## 첫 집계 계층

기준 HEAD는 0108847aa9745a63129d4c4f792c57e51b3531b4다. 기존 full-proof와 그 source 계약/목표를 보존하며 pilotSourceIdentity가 U3 scripts/tests/docs를 추가한다. pilotProductInventory는 현재 실제 전체 제품 코드 목록을, pilotTestInventory는 각 Unit의 전체 unit/integration 목록을 정의한다. 같은 전체 분모의 U1/U2/U3 coverage 기여를 검사하고 80% 합집합 집계로 연결한다. 구형 converter는 기존 기본값을 보존하고 명시 inventory 전달만 추가했다.

새 reporter·집계는 원문 hash·실제 coverage map·시험 목록·실패/취소/skip·source/lock/layout 불일치를 거절한다. 반례 7개는 전체 source 실제 읽기, 구형 converter 기본 의미, 정확한 3기여/전체 분모/80% 경계, 부분/중복/옛 모드, 실패/취소/skip/비정수 count, source/lock/workflow/raw/hash/map 교환을 검사한다. coverage 설정은 제품 runtime import를 시작 단계에 실행하지 않으며 실제 reporter는 runner 단계에서 로드한다.

## 실제 검사와 근거 범위

고정 Node22.23.3의 TypeScript·지정 ESLint는 종료 코드0이다. pilot-coverage-adapter-unit-20261012.json은 U3 271/271 PASS, pilot-coverage-adapter-u2-regression-20261012.json은 기존 U2 converter/CI 보고서 gate 영향 117/117 PASS, pilot-coverage-config-smoke-20261012.json은 7/7 PASS다. root가 실제 JSON count를 확인했다. 실패/pending/todo0·success=true, 미처리 오류0이다.

마지막 smoke는 custom coverage reporter를 CLI에서 제외하고 설정 로드와 7개 단위 시험만 실행했다. --coverage·child collector·장시간 부하·전체 DR을 실행하지 않았다. 이 결과는 실제 제품 coverage80%나 실제 CI 성공의 증거가 아니다.

검사 전후 HEAD는 위 기준과 같고 구형 runtimeSourceIdentity 지문은 27cf1d0e6df2df5275e124dd88fce9fc7f17d208776c68803df7fc4f85429614, 파일럿 pilotSourceIdentity 지문은 fe51ab62408536773e783dc84c094c6579bd6706e7af003656911b43b29adb0e로 각각 동일했다. 선택6개 파일 SHA도 전후 동일했다. 두 source inventory의 범위가 다르므로 같은 지문으로 혼동하지 않는다.

## 남은 범위

Step17–18의 구현·제어된 시험은 아래 후속 계층 검사로 완료했다. 실제 전체3기여 coverage80%·CI·품질/보안·같은 이미지 검사와 Step20 최종 산출물/별도 리뷰는 미완료이며 main 머지는 아직 수행하지 않았다.

## collector·workflow 후속 구현

첫 집계 계층은 7f2d551로 커밋하고 같은 원격 브랜치에 push했다. 후속 10개 파일은 pilot 명령·collector·최종 validation·도구 adapter와 기본/별도 전체 검증 workflow 및 fake-child 시험이다. 실제 유한 child runner의 void 결과는 성공으로 인정하지 않으며 실제 종료·신선한 report/hash·같은 source/lock/image를 대조한다. 보안/offline synth/same-image runtime helper는 명시 서버 identity를 선택적으로 전달받고 기본 동작을 보존한다. 기본 workflow는 U1/U2/U3와 project gate를 실행하며 기존 full-proof의 원래 명령/목표는 별도 manual-only oms-full-proof.yml로 보존한다. 50분 부하·전체 DR을 기본 pilot 명령에 넣지 않는다.

새 단위9개는 제어된 작은 Node child의 exit7/timeout과 fake report/port로 종료·신선도·report 누락·같은 source/lock/image·충돌·coverage와 Deferred를 대조한다. 설치된 yaml parseDocument로 두 workflow syntax·기본 trigger/3Unit/project 성공 gate·manual-only 전체 검증·안전한 artifact 구조를 확인한다. actionlint는 PATH에 없어 실행/설치하지 않았고 통과로 표시하지 않는다.

## 후속 계층 실제 검사

TypeScript·지정 ESLint·두 workflow Prettier는 종료 코드0이다. pilot-ci-unit-20261012.json은 U3 280/280 PASS, pilot-ci-u2-compatibility-20261012.json은 기존 U2 gate/converter 영향117/117 PASS다. root가 실제 JSON count를 확인했으며 실패/pending/todo0·success=true다. 실행은 단위의 제어된 child/fake 보고서에 한정했고 실제 CI·coverage·보안 scan·image·부하·DR을 실행하지 않았다.

검사 전후 HEAD는 7f2d551dbe0ddcd2c06965094b6df314fdf08d78이다. 구형 identity 지문428e9de263ec02d40bd6d77320942f4cc8d7cd6f77f2e5feacbcd7ea5f45e09c, 파일럿 identity 지문b424f18473777397f856c36c3a5ca2d4c18530c8d92c87ea970f5e655c24be4b가 각각 전후 동일하고 선택10개 SHA도 동일했다. 실제 전체 coverage80%·CI·공통 품질/보안·최종 문서/리뷰는 아직 미검증이다.
