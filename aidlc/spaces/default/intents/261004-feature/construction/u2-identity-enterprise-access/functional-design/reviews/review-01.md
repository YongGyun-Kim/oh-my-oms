## Review

**Verdict:** READY
**Reviewer:** aidlc-architecture-reviewer-agent
**Date:** 2026-10-09T08:05:26Z
**Iteration:** 1

### Findings

| ID | Severity | Location | Finding | Required action | Status |
|---|---|---|---|---|---|
| R-01 | Major | aidlc/spaces/default/intents/261004-feature/construction/u2-identity-enterprise-access/functional-design/functional-spec.md > WF07 단계 1–5, WF06 단계 4, CE-U2-01/05; entities.md > IdentitySession | 비밀번호·코드를 확인할 수 없는 담당자 복구는 직원 권한과 대상 신원 근거를 확인한 뒤 곧바로 ENROLMENT_ONLY로 진행하지만, 확인된 당사자가 제한 권위를 받거나 청구하는 단계가 없다. 미인증 요청자가 타인의 RecoveryCase를 먼저 생성한 경우 그 요청자에게 재등록 세션을 반환해도 되는지 결정할 수 없다. 또한 CE-U2-01은 단일 invitation target을 요구하나 IdentitySession 원본에는 account/binding/purpose만 있고 원래 invitation/case/challenge의 결합 관계가 없다. C01 LimitedIdentityContext의 challengeId·verificationBasisRefs 및 G19/G23의 목적/subject/challenge 검증을 새 흐름에 어떻게 이어 붙이는지 불완전하다. 이는 실제 확인 정책이나 제공자 선정의 미완료와 별개의 기능 설계 공백이다. | WF07/08에서 직원·비상 작업자의 확인 권위와 당사자의 재등록 권위를 구별하고, 확인된 당사자만 원래 복구 허가를 청구·소비할 수 있는 인계 순서를 명시한다. 제한 문맥의 원래 case 또는 invitation, challenge/확인 근거, 계정·binding 세대·목적·기한의 논리 결합을 IdentitySession 또는 명시적으로 참조하는 제한 허가 원본에 정의한다. 최초 미인증 요청·식별자만으로 허가를 받지 못하고 다른 case/초대·다른 사람·다른 목적에 재사용하지 못하는 조건과 재시도/회수 동작을 추가한다. 후속 검증에 타인 선행 요청→정상 본인 확인, 다른 요청자의 결과 조회/허가 청구, case·초대 교체 및 동일 허가 중복 소비를 포함한다. 특정 전달 제품·추가 인원 승인·실계정 실행은 요구하지 않는다. | New |
| R-02 | Minor | aidlc/spaces/default/intents/261004-feature/construction/u2-identity-enterprise-access/functional-design/functional-spec.md > 상태 전이 — EmergencyRecoveryCase/AdministratorRestoration 및 HOLD 재개 문단 | RecoveryCase에는 HOLD에서 재개할 목적 상태가 명시되어 있으나 EmergencyRecoveryCase와 AdministratorRestoration은 HOLD로 들어가는 전이만 있다. 뒤의 일반 문단은 원래 기한/대상을 유지한다고 설명하지만 각 원본에서 근거 보완 후 어느 상태로 재개하고 어떤 종료를 허용하는지 밝히지 않는다. 따라서 비상 복구의 권위 보완이나 관리자 재지정의 위임 근거 보완 후 동작이 상태표에서 닫히지 않는다. | 두 원본의 HOLD 재개 또는 종료 전이를 상태표에 추가하고 현재 권위·근거·예상 개정·원래 대상/기한·외부 작업 대조 조건을 붙인다. 새 요청을 요구하는 경우에는 기존 보류 원본의 종료/연결 규칙을 명시한다. 근거 미확인→보완→재검증→적용과 기한/권한 변경 후 재개 거절의 후속 검증 관점을 추가한다. | New |
| R-03 | Minor | aidlc/spaces/default/intents/261004-feature/construction/u2-identity-enterprise-access/functional-design/functional-spec.md > CE-U2-04 기존 계약과 차이 | v1 배열을 손실 없이 변환한다고 하면서 '불명/다중 조합은 거절'한다고만 기술한다. 전달된 U1 functional-spec.md의 행위별 범위 판정 표는 SITE_ALL_DEPARTMENTS의 siteRefs 및 DEPARTMENT_ALL_SITES의 departmentRefs에 1개 이상 ID를 명시적 합집합으로 허용한다. 이 유효한 다중 ID와 의미가 불명한 쌍/곱집합을 구별하지 않으면 새 단일 EXACT 술어로 옮기는 과정에서 기존 유효 grant의 접근이 불필요하게 거절될 수 있다. | 알려진 U1 v1 의미에서 다중 사업장/부서 ID를 같은 행위의 개별 완성 술어로 분해하는 변환 규칙을 명시하고, 거절 대상은 의미 미확인·정책/개정 누락·모호한 조합으로 구별한다. 예를 들어 한 SITE_ALL_DEPARTMENTS scope의 서울/부산 ID를 두 개의 EXACT 사업장 scope로 변환한 전후 허용 집합이 동일함을 후속 호환 검증에 포함한다. 현재 접근 권한이나 과거 주문 문맥을 자동 확대하지 않는다. | New |

### Validation Tool Results

| Tool | Result | Interpretation |
|---|---|---|
| PATH 실행파일 확인 | /Users/gyun/.local/bin/aidlc | 모든 엔진 호출은 PATH의 aidlc로 실행했다. lifecycle/routing/판정 기록 명령은 실행하지 않았다. |
| aidlc engine sensor-required-sections --output-path …/functional-spec.md --stage functional-design | PASS; H2 10개, findings_count 0 | 필수 문서 구조가 존재한다. 기능 권위 인계나 전이의 의미 완전성은 별도 검토가 필요하다. |
| aidlc engine sensor-upstream-coverage --output-path …/functional-spec.md --stage functional-design --consumes unit-of-work,unit-of-work-story-map,requirements,components,contract-summary --deliverables entities.md,rules.md,functional-spec.md | PASS; 5개 consumes, unreferenced 없음, findings_count 0 | 전달된 상위 산출물 참조가 확인된다. |
| aidlc engine sensor-traceability --output-path …/traceability.json --stage functional-design | PASS; gaps/orphans/invalid_targets 등 모두 없음 | 추적 ID와 규칙 연결은 유효하다. |
| Python/PyYAML·JSON 읽기 검증 | PASS; 24개 엔티티, 25개 관계, 31개 규칙, 미해결 모델 참조 없음; 227개 고유 AC 중 OK 26개/Deferred 201개; 규칙 orphan/잘못된 OK target 없음 | 주 책임/협력의 구별과 구조는 일치한다. IdentitySession에 원래 제한 대상/challenge 관계가 없는 점은 R-01의 데이터 근거다. |
| 파일 링크·문자 검사 | PASS; 산출물 내 파일 링크 존재, 대체 문자 없음 | 읽기 검증 범위에서 링크/문자 손상을 발견하지 않았다. |
| linter / type-check 적용성 확인 | N/A; 4개 산출물에 TypeScript/JavaScript fenced snippet 없음 | 단계 정의가 검사 대상으로 지정한 코드 조각이 없다. 제품 코드의 린트/타입 검증이나 실행 보안 통과로 해석하지 않는다. |
| 계약/U1 통합 접점 대조 | C01/C02/common, C20-E01, C21 및 전달된 두 U1 파일의 관련 항목 spot-check | 닫힌 계약을 몰래 확장하지 않는 CE-U2-01–07/후속 등록 경계, 현재 권한 재검증, 외부 수단 제거 불명/격리, CE01/CE02 및 관리자 0명 허용 정책은 보존된다. |

### Summary

Critical 0건, Major 1건, Minor 2건으로 정해진 판정 기준에 따라 READY다. 담당자 확인 결과를 당사자의 제한 재등록 권위로 안전하게 넘기는 순서와 원래 대상 결합을 기능 설계에서 보완해야 하며, 실제 확인 근거·제공자 지원·wire profile 등록·UI/운영 실증은 명시된 후속 선행조건을 유지한다.
