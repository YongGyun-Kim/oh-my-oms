# U3 파일럿 CI·coverage 집계 검증

## 첫 집계 계층

기준 HEAD는 0108847aa9745a63129d4c4f792c57e51b3531b4다. 기존 full-proof와 그 source 계약/목표를 보존하며 pilotSourceIdentity가 U3 scripts/tests/docs를 추가한다. pilotProductInventory는 현재 실제 전체 제품 코드 목록을, pilotTestInventory는 각 Unit의 전체 unit/integration 목록을 정의한다. 같은 전체 분모의 U1/U2/U3 coverage 기여를 검사하고 80% 합집합 집계로 연결한다. 구형 converter는 기존 기본값을 보존하고 명시 inventory 전달만 추가했다.

새 reporter·집계는 원문 hash·실제 coverage map·시험 목록·실패/취소/skip·source/lock/layout 불일치를 거절한다. 반례 7개는 전체 source 실제 읽기, 구형 converter 기본 의미, 정확한 3기여/전체 분모/80% 경계, 부분/중복/옛 모드, 실패/취소/skip/비정수 count, source/lock/workflow/raw/hash/map 교환을 검사한다. coverage 설정은 제품 runtime import를 시작 단계에 실행하지 않으며 실제 reporter는 runner 단계에서 로드한다.

## 실제 검사와 근거 범위

고정 Node22.23.3의 TypeScript·지정 ESLint는 종료 코드0이다. pilot-coverage-adapter-unit-20261012.json은 U3 271/271 PASS, pilot-coverage-adapter-u2-regression-20261012.json은 기존 U2 converter/CI 보고서 gate 영향 117/117 PASS, pilot-coverage-config-smoke-20261012.json은 7/7 PASS다. root가 실제 JSON count를 확인했다. 실패/pending/todo0·success=true, 미처리 오류0이다.

마지막 smoke는 custom coverage reporter를 CLI에서 제외하고 설정 로드와 7개 단위 시험만 실행했다. --coverage·child collector·장시간 부하·전체 DR을 실행하지 않았다. 이 결과는 실제 제품 coverage80%나 실제 CI 성공의 증거가 아니다.

검사 전후 HEAD는 위 기준과 같고 구형 runtimeSourceIdentity 지문은 27cf1d0e6df2df5275e124dd88fce9fc7f17d208776c68803df7fc4f85429614, 파일럿 pilotSourceIdentity 지문은 fe51ab62408536773e783dc84c094c6579bd6706e7af003656911b43b29adb0e로 각각 동일했다. 선택6개 파일 SHA도 전후 동일했다. 두 source inventory의 범위가 다르므로 같은 지문으로 혼동하지 않는다.

## 남은 범위

Step17–18은 미완료다. 기본 workflow/실제 child collector·같은 source/lock/image 검사 gate, 해당 반례 시험과 실제 전체 3기여 coverage/CI 실행이 남아 있다. Step19 품질/보안과 Step20 최종 산출물/별도 리뷰도 미완료이며 main 머지는 아직 수행하지 않았다.
