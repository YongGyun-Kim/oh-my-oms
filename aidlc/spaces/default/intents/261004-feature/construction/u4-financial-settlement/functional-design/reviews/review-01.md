## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-14T07:07:32Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Critical | aidlc/spaces/default/intents/261004-feature/construction/u4-financial-settlement/functional-design/functional-spec.md > WF4.7 단계4–6 및 상태 전이의 RefundCase | 부분 성공 뒤 원래 작업의 나머지 결과를 확인하는 정상 경로가 상태표에서 막힌다. 100원 환불 중 60원 성공·40원 결과 불명은 WF4.7.4에 따라 확정액60·예약40과 PARTIAL로 남길 수 있다. 이후 같은 작업의 나머지40 성공을 확인하면 확정액100·예약0·COMPLETED가 되어야 하지만 PARTIAL→COMPLETED 전이는 없고, 허용된 PARTIAL→IN_PROGRESS는 실패 원인 해소 후 새 시도를 요구한다. 결과 불명분의 새 실행은 WF4.7.4–5가 금지하고 상태표 밖 전이도 명시적으로 거절하므로, 정상 확인을 거절하거나 명세를 어겨야 한다. COMPLETED 이후 잘못 등록한 결과를 정정하는 경로도 없다. 이는 AC8.6.1·AC8.6.3·AC8.6.4의 실제 결과·미완료 잔액·정정 연결을 충족하지 못한다. | 부분별 성공·실패·미확인의 상태와 합산한 RefundCase 상태를 정의한다. PARTIAL의 미확인분이 원래 작업 조회로 확정되는 전이와 완료 결과의 근거 정정 경로를 추가한다. 각 전이에 RA/RU·HA/HU·공통 승인 잔액의 원자적 변경과 원래 작업 식별 보존을 명시하고, 60성공+40불명→같은 작업40성공 및 완료 후 결과 정정 사례를 검증 시나리오에 넣는다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261004-feature/construction/u4-financial-settlement/functional-design/entities.md > Invoice·FinancialEligibility; functional-spec.md > WF4.1·WF4.5 및 계약 변경과 기존 동작 호환 | 첫 배포에 남아 있는 수동 갱신의 회차별 대금 연결이 사라졌다. 공유 components.md의 Invoice·FinancialEligibility 및 C00.FinancialEvidenceInput/EligibilityInput/View는 renewalCycleRefs를 보존하고, 첫 배포 실행 계획은 US7.1을 핵심으로 둔다. 그러나 현재 Invoice·FinancialEligibility에는 회차 참조가 없고 orderRef가 필수이며, 유일한 renewalCycleRef는 후속 보상 모델 RenewalFeeAdjustment에만 있다. 예를 들어 기존 주문이 지급 완료된 뒤 새 수동 갱신 회차의 청구·지급을 판단할 때 어느 주문/계획/의무를 새 회차에 연결하고 과거 지급 충족과 어떻게 구별할지 정의되지 않았다. traceability.json의 AC7.1.1–3이 가리키는 WF4.1·WF4.5와 BR4.20에도 그 연결은 없으며, 자동 갱신의 후속 분류로 수동 갱신의 이 경계를 생략할 수 없다. | 수동 갱신의 회차 식별과 승인 조건을 청구·배분·대금 판단에 연결한다. 기존 공유 계약의 회차 참조를 유지하거나 회차마다 새 주문을 사용하는 명시적 연결 계약을 정의하고, 이전 회차 지급을 새 회차 충족으로 재사용하지 않는 규칙을 적는다. 변경 계약 표와 AC7.1 협력 매핑에 해당 흐름을 연결하고 같은 회차 중복·다른 회차·미지급 갱신 사례를 추가한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| aidlc engine sensor-traceability --output-path [U4]/traceability.json --stage functional-design | PASS; findings_count=0 | 구조적 GAP·ORPHAN·누락·잘못된 BR target 없음. 상태 전이 및 회차 의미의 완전성을 증명하지는 않는다. |
| aidlc engine sensor-required-sections --output-path [U4]/functional-spec.md --stage functional-design | PASS; H2 12개; findings_count=0 | 명세의 섹션 구조 확인. |
| aidlc engine sensor-upstream-coverage --output-path [U4]/functional-spec.md --stage functional-design | pass=true이나 reason=no upstream, consumes=[] | 실질 상위 대조가 수행되지 않았다. 전달받은 Unit·story-map·요구사항·컴포넌트·공유 계약·첫 배포 문서와 직접 대조했다. |
| aidlc engine sensor-linter --stage functional-design --file-path [U4]/functional-spec.md | pass=true; errorCount=0, warningCount=1; matching configuration 없음으로 Markdown 제외 | 제품/문서 lint 통과의 증거로 확대하지 않는다. 최초 --output-path 호출은 플래그 오류였고 도움말의 --file-path로 재실행했다. |
| aidlc engine sensor-type-check --stage functional-design --file-path [U4]/functional-spec.md | PASS; errors=[]; findings_count=0 | 해당 Markdown에 JS/TS 구현 표본이 없어 동작 정확성의 증거가 아니다. 최초 플래그 오류 후 도움말에 맞춰 재실행했다. |
| 읽기 전용 Python JSON·YAML 및 story-map 대조 | PASS; 엔티티9, 규칙22, 주 책임AC26, 협력AC147, 고유AC173; OK18/Deferred8/N/A147 | 원본 stories와 할당 집합이 일치하고 참조 BR가 존재한다. 협력 N/A의 주 책임·U4 기여 구분 자체는 타당하나 수동 갱신 기여의 내용은 위 Major에 해당한다. |
| WF4.7·RefundCase 상태표 직접 대조 | FAIL; PARTIAL에서 원래 미확인 작업의 완료 결과를 수용할 전이 없음 | 60원 성공·40원 불명 반례가 위 Critical을 확인한다. |

[U4]는 `aidlc/spaces/default/intents/261004-feature/construction/u4-financial-settlement/functional-design`이다. 모든 AI-DLC 명령은 원래 PATH의 `aidlc`로 실행했다. 제품 코드·형제 Unit 산출물·작성자의 diary/plan은 읽거나 수정하지 않았다.

### 검토 범위와 판단 근거

거래 유일성은 기업·주문·요청 키·입력 채널·프로필 버전과 독립적으로 정의되어 있으며 정정 후 별칭 예약도 보존한다. 한 주문 결합과 입금·청구·환불 공통 잔액 보호, 확정/예약 환불을 배분 가능액으로 되살리지 않는 식, 목적별 수락/제공 판단, U3 승인 계획과 구버전 호환 경계는 명시돼 있다. 실제 source profile 미확인은 출시 준비 조건으로 남아 있어 실제 은행 연동이 입증된 것으로 해석하지 않았다.

범위 변경으로 승인된 복수 청구·고정 유형 없는 약정·제공 전후 혼합과 FULL 제공을 기준으로 검토했다. 자동 수금·자동 배분·부분 제공·자동 갱신·대량 부하·재해 실증은 후속 범위를 유지하며, 이를 새 필수 기능으로 요구하지 않는다.

### Summary

환불 부분 결과의 후속 확인이 닫힌 상태표와 충돌하므로 현재 명세대로는 지원하기로 한 정상 경로를 완료할 수 없다. 수동 갱신의 회차별 대금 연결도 구체화해야 하며, 위 Critical 1건과 Major 1건을 근거로 NOT-READY로 판단한다.
