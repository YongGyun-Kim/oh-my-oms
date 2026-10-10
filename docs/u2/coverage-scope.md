# U2와 현재 프로젝트 coverage

## 전체 분모와 합집합

현재 제품의 80% 하한은 `.reports/project/coverage-aggregate.json`의 `numerator / denominator`로 판정한다. U2 부분 보고서의 percentage는 전체 통과 근거가 아니다. `scripts/u2/runtime-source.ts`가 수정·미추적 파일까지 현재 bytes와 lock·HEAD·도구 버전으로 묶는다.

분모는 apps의 TS/TSX/JS/MJS/CJS, packages의 src, infra/cdk의 TS, scripts/u1·u2의 직접 작성한 실행 source다. 미실행 파일도 V8 exporter의 실제 executable map에 포함한다. 선언용 `.d.ts`, 외부 node_modules, 생성 `.next`·dist·cdk.out은 제외하며, 자체 runner·script·React·CDK를 낮은 coverage 때문에 제외하지 않는다. `.reports/project/source-inventory.json`은 정확한 현재 목록이다.

고정 Vitest5.0.3/V85.0.3의 실제 Istanbul JSON export를 사용한다. `coverage-export.json`은 실제 exporter의 변환 golden fixture이며 현재 측정이 아니다. statement 시작 line의 실제 실행 집합을 파일별로 합친다. 같은 line은 두 suite가 실행해도 한 번만 센다. raw V8 또는 summary percentages를 평균/합산하지 않는다.

## 수집과 차단

U1 기여는 tests/project/vitest.u1.coverage.config.ts의 U1 unit/integration, U2 기여는 tests/u2/vitest.coverage.config.ts의 U2 unit/integration만 실행한다. 둘 다 동일 전체 제품 inventory를 내보낸다. 기존 U1 coverage 설정의 하한을 수정하거나 비활성하지 않는다.

각 collector는 명령 시작·종료 source, 정확 suite 목록, 실행/실패/skip 수, exporter raw hash, source-map/line layout과 파일 hash를 기록한다. 누락·미실행 suite·stale/source/lock/tool 불일치·미지원 JSON·line layout 불일치·미실행 파일 누락·전체 80% 미달은 aggregate/release를 차단한다. 과거 U1 80.73% 또는 변경 전 baseline은 최종 입력이 아니다.

실제 최신 분자·분모와 미실행 line은 aggregate JSON에서 확인하며, 현재 Unit의 code-summary가 source identity와 검증 결과를 연결한다. 이 문서는 미실행 검증을 통과로 선언하지 않는다.
