## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-14T07:21:47Z
**Iteration:** 2

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Critical | aidlc/spaces/default/intents/261004-feature/construction/u4-financial-settlement/functional-design/functional-spec.md > WF4.7 단계4–6 및 상태 전이의 RefundCase | 부분 성공 뒤 원래 작업의 나머지 결과를 확인하는 정상 경로가 상태표에서 막힌다. 100원 환불 중 60원 성공·40원 결과 불명은 WF4.7.4에 따라 확정액60·예약40과 PARTIAL로 남길 수 있다. 이후 같은 작업의 나머지40 성공을 확인하면 확정액100·예약0·COMPLETED가 되어야 하지만 PARTIAL→COMPLETED 전이는 없고, 허용된 PARTIAL→IN_PROGRESS는 실패 원인 해소 후 새 시도를 요구한다. 결과 불명분의 새 실행은 WF4.7.4–5가 금지하고 상태표 밖 전이도 명시적으로 거절하므로, 정상 확인을 거절하거나 명세를 어겨야 한다. COMPLETED 이후 잘못 등록한 결과를 정정하는 경로도 없다. 이는 AC8.6.1·AC8.6.3·AC8.6.4의 실제 결과·미완료 잔액·정정 연결을 충족하지 못한다. | 부분별 성공·실패·미확인의 상태와 합산한 RefundCase 상태를 정의한다. PARTIAL의 미확인분이 원래 작업 조회로 확정되는 전이와 완료 결과의 근거 정정 경로를 추가한다. 각 전이에 RA/RU·HA/HU·공통 승인 잔액의 원자적 변경과 원래 작업 식별 보존을 명시하고, 60성공+40불명→같은 작업40성공 및 완료 후 결과 정정 사례를 검증 시나리오에 넣는다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261004-feature/construction/u4-financial-settlement/functional-design/entities.md > Invoice·FinancialEligibility; functional-spec.md > WF4.1·WF4.5 및 계약 변경과 기존 동작 호환 | 첫 배포에 남아 있는 수동 갱신의 회차별 대금 연결이 사라졌다. 공유 components.md의 Invoice·FinancialEligibility 및 C00.FinancialEvidenceInput/EligibilityInput/View는 renewalCycleRefs를 보존하고, 첫 배포 실행 계획은 US7.1을 핵심으로 둔다. 그러나 현재 Invoice·FinancialEligibility에는 회차 참조가 없고 orderRef가 필수이며, 유일한 renewalCycleRef는 후속 보상 모델 RenewalFeeAdjustment에만 있다. 예를 들어 기존 주문이 지급 완료된 뒤 새 수동 갱신 회차의 청구·지급을 판단할 때 어느 주문/계획/의무를 새 회차에 연결하고 과거 지급 충족과 어떻게 구별할지 정의되지 않았다. traceability.json의 AC7.1.1–3이 가리키는 WF4.1·WF4.5와 BR4.20에도 그 연결은 없으며, 자동 갱신의 후속 분류로 수동 갱신의 이 경계를 생략할 수 없다. | 수동 갱신의 회차 식별과 승인 조건을 청구·배분·대금 판단에 연결한다. 기존 공유 계약의 회차 참조를 유지하거나 회차마다 새 주문을 사용하는 명시적 연결 계약을 정의하고, 이전 회차 지급을 새 회차 충족으로 재사용하지 않는 규칙을 적는다. 변경 계약 표와 AC7.1 협력 매핑에 해당 흐름을 연결하고 같은 회차 중복·다른 회차·미지급 갱신 사례를 추가한다. | Resolved (reviewer) |
| R-03 | Critical | aidlc/spaces/default/intents/261004-feature/construction/u4-financial-settlement/functional-design/functional-spec.md > WF4.7의 RefundCase 집계 정의·단계5/7 및 상태 전이의 PARTIAL/FAILED→IN_PROGRESS | 실패분만 재시도하는 정상 경로가 새 집계 정의와 충돌한다. 100원 중60원 성공·40원 확정 실패는 PARTIAL이다. 원인을 해소하고40원만 새 시도로 예약하면 성공60·진행40이므로 본문의 “일부 성공과 미완료가 함께 있으면 PARTIAL”에 따라 계속 PARTIAL이어야 한다. 그러나 재시도 전이는 PARTIAL→IN_PROGRESS를 요구하고, PARTIAL→PARTIAL 행은 같은 원래 작업의 미확인분 추가 확인으로만 제한한다. 나머지 전이는 거절하므로 구현자는 정상 재시도를 거절하거나 집계/전이 규칙 중 하나를 어겨야 한다. 이는 실제 부분 실패 재처리를 요구하는 AC8.6.3과 VS4.9의 실행 경로를 막는다. | RefundCase 전체 상태와 부분 시도의 진행 상태를 일치시키도록 전이표를 수정한다. 기존 성공분이 있는 실패분 재시도에는 PARTIAL→PARTIAL을 명시하고 성공액0인 FAILED 재시도만 IN_PROGRESS로 구분하는 등, 집계 정의와 동일한 조건을 사용한다. 60 성공·40 실패→40만 재예약→40 성공의 상태·확정액·예약액·공통 승인 잔액을 검증 시나리오에 추가한다. | New |

> R-01 Reviewer note: functional-spec.md의 WF4.7.7–9와 상태표가 같은 원래 작업의 추가 확인에 의한 PARTIAL→COMPLETED 및 완료 결과의 RECONCILING 정정을 명시한다. entities.md의 RefundPortion, rules.md의 BR4.24, VS4.12–13이 원래 식별·확정액/예약액·공통 승인 잔액의 원자 변경을 연결한다. 60 성공·40 불명→100 성공 및 완료 후 60 성공·40 불명 정정의 금액 보존을 독립 계산으로 확인했다. 아래 새 지적은 추가된 집계 정의와 기존 실패분 재시도 전이 사이의 충돌이다.

> R-02 Reviewer note: Invoice·PaymentAllocation·FinancialEligibility에 renewalCycleRefs가 있고, WF4.8 및 BR4.23이 U6 회차→U3 별도 갱신 주문/승인 계획→U4 청구·배분·목적별 자격을 연결한다. 동일 회차의 주문 중복, 과거 회차 지급 재사용, 미지급·회차 결합 미확인을 차단한다. 계약 변경 표와 AC7.1.1–3 협력 매핑, VS4.14–15도 연결돼 있다.

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| aidlc engine sensor-traceability | PASS: pass=true, findings_count=0 | 추적표의 누락·잘못된 규칙 참조·설명 없는 규칙 고아는 검출되지 않았다. 업무 상태 전이의 의미적 일관성까지 증명하지 않는다. |
| aidlc engine sensor-required-sections | PASS: entities 6개·rules 5개·functional-spec 12개 H2, 각 findings_count=0 | 세 문서의 기본 구조를 확인했다. |
| aidlc engine sensor-upstream-coverage | PASS: 명시한 소비 항목5개 모두 참조, findings_count=0 | unit-of-work, unit-of-work-story-map, requirements, components, contract-summary를 --consumes로 지정하고 세 문서의 합집합을 확인했다. 인수 없이 실행한 최초 결과는 no upstream이므로 검증 근거에서 제외했다. |
| aidlc engine sensor-linter | pass=true, warningCount=1: Markdown에 맞는 설정이 없어 파일 제외 | 린트 통과 증거로 확대하지 않는다. 검토 대상은 제품 코드가 없는 설계 문서다. |
| aidlc engine sensor-type-check | pass=true, errors=[], findings_count=0 | 호출 결과는 오류 없음이다. 문서의 업무 규칙이나 제품 구현을 검증한 결과가 아니다. |
| Python YAML/JSON 및 참조 검사 | PASS: 엔티티9개, 고유 BR24개, 중복 없는 AC173개, 참조한 BR 모두 존재 | 주 책임26개와 협력147개 집합을 분리하고 합집합이 upstream_ids와 일치함을 확인했다. |
| 환불 금액 독립 계산·상태표 대조 | 금액 보존 PASS, 실패분 재시도 상태 대조 FAIL | P100/L100에서 RA60/HA40→RA100/HA0→RA60/HA40 모두 U0과 보존식을 만족한다. 반면 성공60·재시도 진행40의 집계 PARTIAL과 전이표 IN_PROGRESS는 양립하지 않는다. 제품 실행 시험은 아니다. |

### Summary

이전 두 지적의 대상 경로는 보완됐다. 그러나 부분 성공 후 확정 실패분을 재시도할 때 전체 환불 상태의 집계와 허용 전이가 충돌하므로, 정상 재처리를 일관되게 구현할 수 없는 Critical 지적1건이 남는다.
