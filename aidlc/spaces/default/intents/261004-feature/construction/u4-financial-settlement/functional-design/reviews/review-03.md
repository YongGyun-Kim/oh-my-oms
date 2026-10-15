## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-15T08:47:07Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Critical | aidlc/spaces/default/intents/261004-feature/construction/u4-financial-settlement/functional-design/functional-spec.md > WF4.7 단계4–6 및 상태 전이의 RefundCase | 부분 성공 뒤 원래 작업의 나머지 결과를 확인하는 정상 경로가 상태표에서 막힌다. 100원 환불 중 60원 성공·40원 결과 불명은 WF4.7.4에 따라 확정액60·예약40과 PARTIAL로 남길 수 있다. 이후 같은 작업의 나머지40 성공을 확인하면 확정액100·예약0·COMPLETED가 되어야 하지만 PARTIAL→COMPLETED 전이는 없고, 허용된 PARTIAL→IN_PROGRESS는 실패 원인 해소 후 새 시도를 요구한다. 결과 불명분의 새 실행은 WF4.7.4–5가 금지하고 상태표 밖 전이도 명시적으로 거절하므로, 정상 확인을 거절하거나 명세를 어겨야 한다. COMPLETED 이후 잘못 등록한 결과를 정정하는 경로도 없다. 이는 AC8.6.1·AC8.6.3·AC8.6.4의 실제 결과·미완료 잔액·정정 연결을 충족하지 못한다. | 부분별 성공·실패·미확인의 상태와 합산한 RefundCase 상태를 정의한다. PARTIAL의 미확인분이 원래 작업 조회로 확정되는 전이와 완료 결과의 근거 정정 경로를 추가한다. 각 전이에 RA/RU·HA/HU·공통 승인 잔액의 원자적 변경과 원래 작업 식별 보존을 명시하고, 60성공+40불명→같은 작업40성공 및 완료 후 결과 정정 사례를 검증 시나리오에 넣는다. | Resolved (reviewer) |
| R-02 | Major | aidlc/spaces/default/intents/261004-feature/construction/u4-financial-settlement/functional-design/entities.md > Invoice·FinancialEligibility; functional-spec.md > WF4.1·WF4.5 및 계약 변경과 기존 동작 호환 | 첫 배포에 남아 있는 수동 갱신의 회차별 대금 연결이 사라졌다. 공유 components.md의 Invoice·FinancialEligibility 및 C00.FinancialEvidenceInput/EligibilityInput/View는 renewalCycleRefs를 보존하고, 첫 배포 실행 계획은 US7.1을 핵심으로 둔다. 그러나 현재 Invoice·FinancialEligibility에는 회차 참조가 없고 orderRef가 필수이며, 유일한 renewalCycleRef는 후속 보상 모델 RenewalFeeAdjustment에만 있다. 예를 들어 기존 주문이 지급 완료된 뒤 새 수동 갱신 회차의 청구·지급을 판단할 때 어느 주문/계획/의무를 새 회차에 연결하고 과거 지급 충족과 어떻게 구별할지 정의되지 않았다. traceability.json의 AC7.1.1–3이 가리키는 WF4.1·WF4.5와 BR4.20에도 그 연결은 없으며, 자동 갱신의 후속 분류로 수동 갱신의 이 경계를 생략할 수 없다. | 수동 갱신의 회차 식별과 승인 조건을 청구·배분·대금 판단에 연결한다. 기존 공유 계약의 회차 참조를 유지하거나 회차마다 새 주문을 사용하는 명시적 연결 계약을 정의하고, 이전 회차 지급을 새 회차 충족으로 재사용하지 않는 규칙을 적는다. 변경 계약 표와 AC7.1 협력 매핑에 해당 흐름을 연결하고 같은 회차 중복·다른 회차·미지급 갱신 사례를 추가한다. | Resolved (reviewer) |
| R-03 | Critical | aidlc/spaces/default/intents/261004-feature/construction/u4-financial-settlement/functional-design/functional-spec.md > WF4.7의 RefundCase 집계 정의·단계5/7 및 상태 전이의 PARTIAL/FAILED→IN_PROGRESS | 실패분만 재시도하는 정상 경로가 새 집계 정의와 충돌한다. 100원 중60원 성공·40원 확정 실패는 PARTIAL이다. 원인을 해소하고40원만 새 시도로 예약하면 성공60·진행40이므로 본문의 “일부 성공과 미완료가 함께 있으면 PARTIAL”에 따라 계속 PARTIAL이어야 한다. 그러나 재시도 전이는 PARTIAL→IN_PROGRESS를 요구하고, PARTIAL→PARTIAL 행은 같은 원래 작업의 미확인분 추가 확인으로만 제한한다. 나머지 전이는 거절하므로 구현자는 정상 재시도를 거절하거나 집계/전이 규칙 중 하나를 어겨야 한다. 이는 실제 부분 실패 재처리를 요구하는 AC8.6.3과 VS4.9의 실행 경로를 막는다. | RefundCase 전체 상태와 부분 시도의 진행 상태를 일치시키도록 전이표를 수정한다. 기존 성공분이 있는 실패분 재시도에는 PARTIAL→PARTIAL을 명시하고 성공액0인 FAILED 재시도만 IN_PROGRESS로 구분하는 등, 집계 정의와 동일한 조건을 사용한다. 60 성공·40 실패→40만 재예약→40 성공의 상태·확정액·예약액·공통 승인 잔액을 검증 시나리오에 추가한다. | Resolved (reviewer) |

> R-03 Reviewer note: `aidlc/spaces/default/intents/261004-feature/construction/u4-financial-settlement/functional-design/functional-spec.md`의 WF4.7 단계5·부분 집계·상태 전이·VS4.16–VS4.17·실패분 재시도 금액 대조가 일치한다. 60원 성공·40원 확정 실패 뒤 실패한40원만 재예약하면 PARTIAL을 유지하고, 그 시도의 실제 성공 확인으로 COMPLETED가 된다. 성공액0·불명분 없음·활성 예약 없음인 FAILED의 재예약은 IN_PROGRESS로 구별한다. `entities.md`의 RefundCase 제약, `rules.md` BR4.19, `traceability.json` AC8.6.3도 같은 조건과 경로를 연결한다. 기존 성공액·목표액을 보존하므로 이전 집계/전이 모순이 해소됐다.

### Validation Tool Results

검토 범위는 지정된 U4 질문·4개 산출물과 소비 계약5개다. 아래 센서는 PATH의 원래 `aidlc`로 실행했다. 다른 Unit의 construction 파일이나 프레임워크 소스를 조사하지 않았다.

| Tool | Result | Interpretation |
|---|---|---|
| `aidlc engine sensor-required-sections --stage functional-design --output-path …` | PASS: entities.md H2 6개, rules.md 5개, functional-spec.md 12개; 각각 findings_count=0 | 지정 Markdown 세 문서의 제목 구조 검사다. 업무 정확성 증명은 아니다. |
| `aidlc engine sensor-upstream-coverage --stage functional-design --output-path …/functional-spec.md --consumes unit-of-work,unit-of-work-story-map,requirements,components,contract-summary` | PASS: 소비5개, unreferenced=[], findings_count=0 | 반환된 scanned_files는 functional-spec.md 한 파일이다. 그 문서에 상위5개 산출물 참조가 존재함을 확인했다. |
| `aidlc engine sensor-traceability --stage functional-design --output-path …/traceability.json` | PASS: gaps/orphans/missing_from_table/missing_from_upstream_ids/invalid_entries/invalid_targets 모두 빈 목록 | 추적 JSON의 구조·대상·누락 검사다. 수락 기준의 실제 실행 통과를 뜻하지 않는다. |
| `aidlc engine sensor-linter --stage functional-design --file-path …/functional-spec.md` | pass=true, errorCount=0, warningCount=1: `File ignored because no matching configuration was supplied.` | Markdown이 린트 대상에서 제외됐다. 제품 코드 또는 문서 내 코드의 린트 통과로 해석하지 않는다. |
| `aidlc engine sensor-type-check --stage functional-design --file-path …/functional-spec.md` | pass=true, errors=[], findings_count=0 | 지정 문서 경로에 해당하는 타입 오류가 반환되지 않았다. 제품 전체 타입 검사나 환불 로직 검증 결과로 확대하지 않는다. |
| 읽기 전용 Python/PyYAML·JSON 대조 | PASS: 엔티티9개·규칙24개, 명명된 교차 소유자 참조17개가 components.md에 해결됨. 추적173개: OK18·Deferred8·N/A147. OK의 BR 대상 존재·중복 upstream ID 없음. 검토 산출물4개에 NUL/U+FFFD 없음 | U4 모델의 명명 참조와 추적 형식을 독립 확인했다. 계약 전체 및 모든 의미적 참조를 전수 검증했다는 주장은 아니다. |
| 읽기 전용 금액 산술 및 상태표 대조 | PASS: VS4.16의 실제 표3행을 읽어 `(상태, RA, HA, A, 공통 승인 가용액)`이 `(PARTIAL,60,0,40,40) → (PARTIAL,60,40,40,0) → (COMPLETED,100,0,0,0)`임을 확인. 모든 행에서 P100 보존·A≥HA·공통 한도100의 소비 보존 성립 | 문서의 논리 산술 확인이다. VS4.17의 성공0 재예약도 RA0/HA0/A100/가용100에서 RA0/HA100/A100/가용0으로 일치한다. 제품 코드·DB 동시성·실거래 시험은 수행하지 않았다. |

### 기존 경로와 불변조건 대조

- WF4.7 단계7과 상태표는 같은 원래 작업의 불명40원 추가 성공 확인을 새 실행 없이 HA/HU에서 RA/RU로 옮긴다. 실패분의 새 현재 시도 예약 및 결과 확인은 별도 행으로 구별되어 기존 확인 경로를 대체하지 않는다.
- WF4.7 단계8–9, BR4.24 및 VS4.13은 완료 정정 시 RECONCILING과 기존 소비 보호를 유지한다. 100원 완료를60원 성공·40원 불명으로 확인 정정하면 확정액 감소40과 예약 증가40을 원자 반영해 공통 가용액을 늘리지 않는다. 뒤늦은 실제 성공 확인으로 COMPLETED에 복귀한다.
- RefundPortion과 WF4.7은 원래 부분·작업·현재 시도·옛 실패 이력을 연결하고 목표액 재가산을 금지한다. FinancialExchange의 거래 유일성 제약과 BR4.19는 같은 실제 환불을 다른 작업/RefundCase의 새 성공으로 중복 반영하지 못하게 한다. 이는 공유 계약 G09·G15·G16 및 FR13.4·FR15.1–FR15.4의 미확인 보존·실제 결과·재처리·정정 경계와 일치한다.

### Summary

R-03의 정상 실패분 재처리 경로를 막던 집계·전이 모순은 해소됐으며, 검토 범위에서 새로 입증된 지적은 없다. 이 판정은 U4 기능 설계의 준비 상태에 한하며 제품 구현·실제 저장 경로·DB 경합·금융 원본·AWS 운영의 검증 완료를 뜻하지 않는다.
