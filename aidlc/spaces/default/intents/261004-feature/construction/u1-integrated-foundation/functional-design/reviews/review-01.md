## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-06T17:01:30Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Minor | aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/functional-design/entities.md > types.OrderingContextPolicy / TargetScopeSnapshot; entity Enterprise; functional-spec.md > 논리 값과 원래 주문 문맥 / WF03 / WF05 | organisationRevision은 정책·조직 변경을 함께 반영하는 기업별 조직 평가 개정으로 정의하고, 개별 조직 변경 때 증가시켜 주문 커밋에서 대조하도록 요구한다. 그러나 Enterprise의 원본 속성에는 revision만 있고 organisationRevision의 원본 속성이나 Enterprise.revision과의 대응은 명시하지 않았다. 일관된 개정이 필요하다는 규칙은 분명하지만, 부서/사업장만 변경될 때 어느 원본 개정을 갱신하는지 데이터 모델의 연결을 구현자가 선택해야 한다. | organisationRevision의 소유 속성 또는 Enterprise.revision을 사용하는 명시적 대응을 정의한다. 조직 생성·활성 변경·정책 변경이 그 평가 개정을 어떻게 갱신하고, 과거 주문의 스냅샷 개정은 어떻게 보존하는지 연결한다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/functional-design/entities.md > entity WorkItem / RequestReceipt; functional-spec.md > 기존 명세의 적용 / WF06 | 적용한다고 선언한 C18의 Work는 correlationId가 필수다. WorkItem의 13개 속성에는 correlationId가 없고 RequestReceipt에도 없으며, 두 모델에서 wire 값을 얻는 매핑도 명시하지 않았다. FactEnvelope에는 해당 속성이 있다. 업무 중복 방지 ID 자체는 정의돼 있으나, sourceFactRef가 NULL인 작업의 전달·재시작 대조에서 상관 식별자를 보존하거나 도출하는 방법은 빠져 있다. | WorkItem 또는 원래 요청에 correlationId를 보존하거나, 기존 식별자에서 wire correlationId를 도출하는 규칙을 명시한다. sourceFactRef 없는 작업과 재전달/재시작에서도 적용할 매핑을 확인한다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| sensor-required-sections | PASS; entities/rules/functional-spec 각각 findings 0 | 지정된 세 MD의 필수 구조를 독립 확인했다. |
| sensor-upstream-coverage | PASS; unreferenced 0 | 현재 Unit의 세 MD에 unit-of-work, unit-of-work-story-map, requirements, components, contract-summary 참조가 있다. |
| sensor-traceability | PASS; gaps/orphans/invalid_targets 0 | JSON 구조와 BR 연결이 유효하다. 제품 구현 또는 수락 시험 통과를 뜻하지 않는다. |
| 독립 엔티티·규칙·관계 대조 | PASS; 엔티티 30개, 속성 237개, 관계 50개, 규칙 34개 | 모델/속성/규칙 ID 중복 없음, 관계 대상과 필드 및 선언 타입 유효. 규칙의 trigger/logic/violation/source가 있고 파생 규칙 표도 일치한다. 논리 값의 원본 매핑 공백은 R-01/R-02로 별도 기록했다. |
| 독립 AC 원문·추적 대조 | PASS; AC 61개 중 OK 30개, Deferred 31개; 주 책임 9개 모두 OK; reverse N/A 8개 | 원문에 AC가 존재하고 OK의 BR 대상이 모두 존재한다. 주 책임 9개는 신청·승인/별도 지정·대기 사유 흐름과 연결된다. 공동/협력의 OK는 기능 규칙 연결로 한정되고 Deferred는 소유 Unit/단계·남은 범위와 선행 조건을 명시한다. |
| 선언된 접근 범위의 합성 반례 대조 | PASS | 완성된 scope의 합집합에서 부서/사업장 교차 조합과 다른 action/기업 접근을 거절한다. 명시적 NOT_USED/NULL과 UNSET, 전체 부서/사업장 범위를 구별한다. 문서 판정표의 참조 모델 검사이며 실제 서버 권한 시험이 아니다. |
| 상위 계약·추가 경계 대조 | CE01–CE04의 추가 정의와 구현 전 등록/형식·권한·호환 조건 확인 | 기업 승인과 최초 관리자 지정은 별도 권한/결과다. 미확인 계약/가격/공급/납기는 조건별 knowledge로 보존하고, 기존 KNOWN OrderView를 만들 수 없으면 CE03의 별도 결과를 사용한다. 현행 OrderLineInput은 agreementRevisionRef의 NULL을 허용하므로 미등록 계약 때문에 가짜 Ref를 넣어야 하는 구조가 아니다. |
| 성공 접수·권한 경합·worker 절차 대조 | 필요한 논리 조건 명시 | WF05/BR3.6은 커밋 시점의 현재 권한/조직·대상 개정을 대조한다. 같은 요청은 현재 권한으로 원래 결과를 투영하고, WF06/BR7.4는 효과·다음 작업/사실·소비자 표지를 원자 연결한다. 실제 일관성·저장·재시도·복구 방법은 FD-OQ와 후속 NFR/Infra·실행 시험의 조건으로 남긴다. |
| Mermaid 문법 | PASS; erDiagram | 현재 functional-spec의 ER 문법과 24개 도식 관계의 엔티티 이름을 확인했다. 전체 50개 관계는 YAML 원본에 있으며 텍스트 대체도 있다. |
| linter / type-check | N/A | 실제 TS/JS snippet이 없다. 문서/논리 검사로 제품 코드 타입·실행 검증을 대신하지 않았다. |

### Summary

Critical 0건, Major 0건, Minor 2건으로 READY다. 원래 주문 문맥·현재 행위별 권한, 명시적 조직 미사용과 폐지 조직, 기업 승인/최초 지정의 분리, 미확인 보존과 지속 접수/반복 처리의 핵심 조건은 연결돼 있으며, 두 원본/wire 매핑은 보완이 필요하다. 실제 신원·기업 확인 정책, 물리 원자성·보존·전달·보안·운영 목표는 FD-OQ1–6 및 후속 구현/검증의 선행 조건으로 유지한다.
