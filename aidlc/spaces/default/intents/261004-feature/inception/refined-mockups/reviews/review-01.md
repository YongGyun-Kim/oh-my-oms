## Review

**Verdict:** NOT-READY
**Reviewer:** aidlc-product-lead-agent
**Date:** 2026-10-06T02:31:30Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261004-feature/inception/refined-mockups/preview/preview.js > orderRows(), statuses(), timeline(), bodyFor(C01/C04/S07) | 업무 조건을 ‘주문 조회만 허용’으로 선택해도 C01·S07 주문 표에 ‘지급 확인’·‘환불 결과 확인 필요’가 보이고, C04에는 ‘선불 확인 · 후불 별도’와 지급 근거 확인 시각·이력이 남는다. C04의 대금 상세만 숨기는 표현은 interaction-spec의 AC8.8.3·AC8.12.2 및 FR14.1의 별도 대금 조회 권한 경계와 모순된다. 독립 Chromium에서 재현했으며 실제 서비스의 접근 통제 실패를 주장하는 발견은 아니다. | 대금·발급의 미부여 사실을 요약·목록·알림·이력까지 동일하게 가리는 화면 규칙과 시안을 정리하고, 주문 조회 전용 조건의 대표 화면을 제시한다. 허용 주문 정보는 유지하며 숨긴 사실을 미지급·0원·실패로 바꾸지 않는다. | New |
| R-02 | Major | aidlc/spaces/default/intents/261004-feature/inception/refined-mockups/mockups.md > C04 주문 상세·C05 사용 권한·갱신; aidlc/spaces/default/intents/261004-feature/inception/refined-mockups/interaction-spec.md > CMP06·AC3.5.2–AC3.5.4·AC7.5.2–AC7.5.4; aidlc/spaces/default/intents/261004-feature/inception/refined-mockups/preview/preview.js > fieldsFor(US3.5/US7.5) | 주문·갱신 가격 변경 동의에 필요한 비교가 시안에서 빠졌다. 두 펼침 폼과 확인 대화상자는 ‘현재 선택한 주문·기업’ 및 사유·근거만 보여 주고, 제안 식별·원래/변경 금액과 조건·갱신 대상 회차를 표시하지 않는다. 문서는 전후 비교와 제안에 연결된 동의를 요구하지만 해당 화면의 구체 배치·동의/거절 조작은 지정하지 않는다. 고객이 무엇에 동의하는지 검토할 수 없으며 이 공백은 미정 계산 산식과 별개다. | 합성 예시로 주문 및 갱신 제안의 대상·식별/내용 버전·원래/변경 가격과 조건·해당 회차를 비교하는 화면을 제시하고, 동의·거절·제안 변경/미확인 시의 행동과 결과를 명세한다. OQ1·OQ2의 계산·유효 시점 정책은 계속 미정으로 보존한다. | New |
| R-03 | Major | aidlc/spaces/default/intents/261004-feature/inception/refined-mockups/mockups.md > C07 담당자·조직·C08 역할·업무 범위; aidlc/spaces/default/intents/261004-feature/inception/refined-mockups/interaction-spec.md > CMP09·AC1.3.1·AC1.3.3·AC1.4.1·AC1.5.4; aidlc/spaces/default/intents/261004-feature/inception/refined-mockups/preview/preview.js > fieldsFor(US1.3/US1.4) | 고객 조직·역할 관리의 핵심 편집 조작이 구체화되지 않았다. US1.3 폼은 대상·이름·이메일·근거뿐이라 부서/사업장 소속이나 활성 상태를 변경할 수 없다. US1.4 폼은 세 개의 고정 주문 권한 체크박스뿐이며 FR2.2의 나머지 행위, 행위별 사업장 전체·부서 전체·기업 전체/조합 범위, 역할의 사용자 부여·회수 방법을 보여 주지 않는다. CMP09의 actions/scopesPerAction 설명과 AC 재기재만으로는 이 조작의 입력·검토 흐름을 개발자나 검토자가 결정할 수 없다. | C07의 초대·소속/활성 변경과 C08의 역할 정의·사용자 부여/회수에 필요한 입력·선택·검토 화면을 명세한다. 확정된 전체 고객 행위 목록과 네 가지 범위 표현을 연결하고 마지막 관리자 회수 경고 및 행위별 최종 범위 검토 예시를 제시한다. OQ4의 신원·권한 효력 시점은 임의 확정하지 않는다. | New |

### Summary

단일 advisory 검토 결과, 확인한 제품 설계 공백 3개가 Major이므로 현재 시안은 승인 전 판단이 필요하다. 69개 스토리·227개 AC의 연결과 최신 Q5 기기 범위, 미정 정책·사용성·실제 승인 인력의 보존은 일관되지만, 연결 표만으로 위 권한 표현 및 핵심 편집·동의 화면의 구체화 공백을 해소하지는 못한다.

**검증 근거와 한계:** 필수 5개 문서의 required-sections·upstream-coverage는 모두 pass였고, screen-traceability.json의 69 US·227 AC는 상위 ID 누락·중복 및 유효하지 않은 화면 연결이 없었다. 정적 고객/직원 1280 이미지, HTML/CSS/JS와 선언된 상위 입력을 확인했고, 별도 headless Chromium 1280×900에서 주문 조회 전용 C01/C04/S07 및 US3.5·US7.5·US1.3·US1.4 폼/대화상자를 관찰했다. 실제 인증·API·외부 실행·스크린리더·지원 브라우저 전체 및 WCAG 적합성은 검증하지 않았다. 상위 승인 기록과 이번 산출물은 수정하지 않았다.
