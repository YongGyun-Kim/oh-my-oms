# U1 선택 회귀 보고서 덮어쓰기 실행 편차

## 확인된 사실

- Unit: u2-identity-enterprise-access, Code Generation P06. 엔진·과거 검토·상태·diary는 수정하지 않는다.
- tests/u1/unit/identity.spec.ts와 identity-browser.spec.ts 선택16/16은 통과했으나 명시 reporter/outputFile이 없어 tests/u1/vitest.unit.config.ts의 .reports/u1/unit.json 기본 출력을 덮어썼다.
- 출력 파일 mtime: 2026-10-09T16:09:49.906Z. 이는 파일 시각이며 보고서 생성 시점/원래 bytes의 출처를 대신하지 않는다.
- 현재 파일:6818bytes, SHA256 `b0d001e61fb14673305a56307ce38cd5de866f11d2e314826f59817ec4f2e745`. 해당16/16의 정확 payload bytes는 .reports/u2/incidents/u1-unit-overwrite-20261010.json의 base64와 source_sha256에 보존했고 재해석한 요약으로 대체하지 않았다.
- 최신 기존 handoff-recovery PG8/8, 선택 U1 회귀16/16은 각 범위의 중간 증거다. 최종 Unit/coverage/보안/성능/전체 현재 U1 통과를 뜻하지 않는다.

## 조사와 원래 근거의 상태

- 기존 U1 runner는 JSON reporter의 기본 outputFile을 .reports/u1/unit.json으로 지정한다. 승인된 단위 지침의 P00/P07 명령도 그 config를 쓰면서 명시 output을 누락했다. 일반적인 보존 문구만으로 출력 설정의 전파를 강제하지 못한 실행 경계다.
- 대상 report는 git 추적 파일이 아니다. bounded .reports/u1·.reports/u2·현재 intent verification/검토 기록에서 원래 상세 JSON의 정확 사본을 찾지 못했다. 외부/개인 백업 존재는 미확인이다.
- .reports/u1/developer-handoff-evidence.json의563/563·실패/보류0 요약과 U1 code-summary.md·원래 검토 기록은 남아 있다. 이 요약은 상세 testResults/시각/원래 raw bytes를 복원하는 사본이 아니다.
- .reports/u2/baseline-u1-unit.json·baseline-fixed-u1-unit.json·baseline-u1-integration.json은 별도 실행/소스 시점의 원본이며 손실한 report로 이름을 바꾸거나 복사하지 않는다.
- .reports/u1/unit.json은 지금 선택16개 보고서이며 U1 전체 보고서로 사용하면 안 된다. 과거 U1 결과/검토·source fingerprint를 수정해 이 편차를 숨기지 않는다.

## 열린 문제와 구체 보완

원래 상세 보고서 bytes는 확인한 범위에서 미복구다. 이 provenance gap을 열린 문제로 유지하며 과거 근거 복구나 위험 수용으로 처리하지 않는다. 저장소·실서비스 데이터의 손실은 관찰하지 않았고 변경은 테스트 보고서 출력에 한정된다. 애플리케이션 source가 안전하다는 최종 검증은 아직 미완료다.

현재 변경·시험을 중지하고 계획/단위 지침에 U1 정확 선택 회귀 실행기 scripts/u2/run-u1-regression.ts와 tests/u2/unit/u1-regression-output.spec.ts를 추가한다. 이 실행기는 U2 고유 output·원래 default report before/after hash 불변·정확 선택 경로·실패/미생성/skip 차단을 강제한다. U2 선택시험에도 selected output을 명시한다. 기존 U1 config·하한·DB admission/권한/외부 실행 범위는 바꾸지 않는다.

재승인 후 구현→해당 시험→정확 회귀 재수집을 진행한다. 최종 project-validation은 현재 source의 U1/U2 기여/전체80%를 새 namespace에서 수집하며 기존563/563/80.73%를 새 proof로 재사용하지 않는다. 새 측정은 원래 상세 보고서 복구와 구별한다.

## Sources

- [계획](code-generation-plan.md), [단위 실행 지침](unit-test-instructions.md).
- tests/u1/vitest.unit.config.ts:9의 기본 출력; package.json의 test:u1:unit 연결.
- .reports/u2/incidents/u1-unit-overwrite-20261010.json: 현재 선택 실행 raw bytes/해시 증거.
- .reports/u1/developer-handoff-evidence.json 및 [U1 코드 요약](../../u1-integrated-foundation/code-generation/code-summary.md): 과거 요약의 출처. 원본 상세 JSON 사본으로 취급하지 않는다.
