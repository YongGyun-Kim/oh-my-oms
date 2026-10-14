# U1 관측·알림 요구사항

**Unit:** u1-integrated-foundation

## 범위와 판정 의미

U1은 최소 신원/기업 신청·승인/최초 관리자·현재 권한·직원 상품 등록·타입별 주문 접수/전체 확인 대기·지속 기록/worker·최소 고객/직원 UI와 진행 조회를 연결하는 첫 기반이다. 금융·HW·SW 전체 이행, 전체 U8/U9 화면과 U10 실운영 측정은 해당 소유 단위에서 확장한다. 미등록 공급자와 미확인 가격/계약/공급·외부 결과를 실제 가능/완료로 바꾸지 않는다. U1의 최소 MFA/망/권한·접수 보존·실행 준비를 후속 단위까지 미룬다는 뜻은 아니다. [S1–S4]

이 문서는 사용자 확인된 기준과 상위 계약에서 파생한 요구사항이다. 문서/trace의 OK는 정의 연결이고 코드·보안·성능·복구·접근성·국내 저장·상용 준비 통과가 아니다. 각 행의 NFRx.y는 S3의 NFRx를 상속하며 같은 ID의 정의 원본은 아래 표다. 요구사항 수치와 정책은 S5의 사용자 답변/요약 확인을 우선한다. 원본 기능/계약과 과거 검토 기록은 수정하지 않는다.

## 요구사항과 수락 기준

| ID | 요구사항 | 수락 기준·확인 조건 | 구현/검증 책임과 범위 | 근거 |
|---|---|---|---|---|
| NFR2.2 | 가용성 계측은 실제 허용 업무를 audience·업무별로 관측한다. | 로그인/MFA·허용 주문 조회/접수·직원 망/판단의 측정 지점·주기·분모·누락/부분 장애 산식을 운영 전 고정한다. 정상 보안 거절과 허용 업무 장애를 분리하되 auth provider 실패를 숨기지 않는다. | U1 metrics·U10; ND-OQ06 | NFR2; OQ6 |
| NFR2.3 | 대시보드는 연속30일/원인별 중단과 실제 증거 범위를 보여 준다. | 각 업무 SLI·계획/비계획 중단·2592초 기준 소진·데이터 부족과 시험/실제 관측 구분을 확인한다. 전체 원인 중단을 외부 장애라는 이유로 제외하지 않는다. probe/집계 해상도에 따른 한계를 표시한다. | U1 값 공급·U10 dashboard; ND-OQ06 | NFR2; NFR8 |
| NFR10.1 | 자동 복구 시도 시작부터 개발자 업무 메신저·이메일 통지를 생성한다. | 시도 ID·시작/원인·허용된 추적 링크와 두 채널의 발송 결과를 남긴다. 실패가 나올 때까지 시작 알림을 미루지 않는다. 개별 기술 retry마다 새 고객/개발자 알림을 무제한 발행하지 않는다. | U1 사실/작업·U10/외부 통지 경로; ND-OQ06 | NFR10; G18; Q1 |
| NFR10.2 | 복구 실패/수동 판단 필요는 즉시 긴급 알림으로 연결한다. | 실패/수동 필요를 확인한 최초 시점과 알림 생성/전송 결과를 대조한다. provider·수신자·허용 전달 지연/재알림/미확인·수신 확인·복구 통지 수치는 설계/통지 시험 전에 정한다. 실제 수신 보장으로 발송 수락을 표시하지 않는다. | U10/U7 제공자·ND-OQ06 | NFR10; OQ7 |
| NFR10.3 | OMS/API/worker 중단에도 복구 알림 경로를 검증한다. | 동일 실패 구성요소에만 의존하는 감지/전송은 장애 시험으로 확인한다. 독립 경로·fallback·중복/반복·복구 종결과 두 채널 실패를 대조 가능해야 한다. 특정 messenger/mail 서비스는 아직 미선정이다. | U1 diagnostic facts·Infra/U10; ND-OQ06 | NFR10; G18; C26 |
| NFR10.4 | 작업 backlog·기술 실패·권한 거절·provider 미확인은 구별해 관측한다. | work/consumer/시도·처리/대기/원본 참조·expected/현재 version·deadline/불명 결과와 실패 종류를 최소 자료로 연결한다. auth/무효입력 거절·업무 review 상태를 기술 장애와 섞지 않는다. 측정/alert thresholds는 NFR3 시간 예산 안에서 설계한다. | U1 worker/조회·각 owner/U10; ND-OQ03/06 | NFR10; G07–G09/G16 |
| NFR5.4 | 업무 추적은 원본/개정/행위자/근거/정정 관계를 유지한다. | API→Receipt→Work/Fact→consumer/result→조회/진단이 원래 requestId/operationId/target/actor와 연결된다. 업무 근거와 operational trace는 구별하고 공개 trace 링크로 민감 결과를 우회하지 않는다. Work의 correlationId 원본/전달 매핑은 코드 전에 확정한다. | U1·각 owner/U10; FD R-02·ND-OQ03 | NFR5; FR15.4; C18/C19 |
| NFR4.5 | 복구 대조 자료는 접근 통제된 읽기 증거로 제공한다. | 성공 접수·업무/이력/작업/효과 목록의 대조 근거·복구 epoch·소실/충돌/미확인과 관측 시각을 보존한다. 진단 결과를 원본 수정/완료 근거로 오인하지 않는다. 수명·국내 저장·접근은 NFR11.1–11.3을 따른다. | U1 C19 자료·각 owner/U10; ND-OQ03/05 | NFR4; C19 |

## 계측·추적·로그의 의미

| 흐름 | 필요한 최소 연결 | 금지할 혼동 |
|---|---|---|
| HTTP/Next→업무 | audience·허용된 action/target·request/operation/trace·응답 분류/시간·원본 개정 | UI의 허용 표시를 서버 권한 검사로 대체 |
| 지속 접수→worker | Receipt/Work/Fact·workId/consumer·correlationId 원본·processed marker/resultRefs·재시도/불명 |202를 실제 지급/출고/발급 완료로 취급 |
| 외부/통지 | 신뢰 source/target/observedAt·attempt/전송 수락·실제 확인/전달·재확인/대조 | 발송 수락을 수신/업무 동의로 취급 |
| 복구→대조 | 최초 장애·감지/시도/알림/복원/검증·ack목록·원본/이력/작업/효과·차이/미확인 | health 응답만으로 복구/유실0 판정 |
| 배포/점검 | source/build/schema/설정·검사/승인·공지·실제 중단/rollback·작업 시간 | 자동 대기/총 경과를 손 작업과 섞기 |

operational trace/log는 민감 payload를 대신 저장하는 원본이 아니다. 계정/기업/주문 식별자도 접근/국내 저장·보존 분류의 대상이다. S7 R-02의 원래 correlationId 매핑을 U1 WorkItem/원래 요청에서 확정해 재시작·재전달 및 sourceFactRef가 없는 작업에서도 C18 필수 값을 일관되게 만든다.

## 알림·시간 예산과 검증

시도 시작·실패/수동 필요·반복/미확인·복구 종결을 구별하고 incident/attempt의 중복 관계를 보존한다. 업무 메신저/이메일의 수신자/실제 제품·허용 지연·재알림/미확인·수신 확인은 ND-OQ06에서 정한다. 감지/통지/대응/복원/검증 합계는 필수 장애의30분 예산 안에서 설계한다. 업무 통지는 고객의 현재 허용 상태·최소 내용과 로그인 링크를 사용한다.

OMS/API/worker 중단·mail/messenger 각 실패·관측 중단·clock/collector 누락·중복 시작/재시도·복구 종결을 시험한다. 알림 생성/발송/수신 각 단계의 확인 범위를 기록하며 미확인 수신을 성공으로 표시하지 않는다. 선택 도구가 없거나 실제 시험이 없으면 관측/두 채널 전달이 완성됐다고 주장하지 않는다.

## 추적과 완료 책임

상위 NFR1–NFR14는 [traceability.json](traceability.json)의14개 행에서62개 하위 요구사항으로 연결한다. 각 문서의 행은 한 곳에서 정의하고 교차 문서는 ID로 참조한다. 전 제품의 모든 시험/AC를 U1로 완료 표시하지 않는다. 관련 Code Generation/Build and Test는 실제 작성 코드·계약·단위/통합·경계/동시/오류·복구 시험과 커버리지/보안 보고서를 연결해야 한다. 전체 부하·30일 실제 가용성·야간/한 사람 운영 증거는 U10/실운영과 관련 Infra 검증 범위다.

## Assumptions & Open Questions

- [assumption] 선택한 스택과 공유 핵심/별도 실행 역할이 기능 범위를 줄이지 않고1인 개발·기술 운영과 품질 목표에 적합하다. 실제 의존성·비용·부하/복구/운영 증거는 아직 없다.
- 합성 시험/fixture는 실제 기업·신원/연동·지급/재고/발급·사업 인력/합의의 확인이 아니다. 기존 HB-01–HB-08과 S1의 FD-OQ를 해소해야 하는 경계를 유지한다.
- 관련 세부 선택의 담당·해소 시점·차단 영향은 [tech-stack-decisions.md](tech-stack-decisions.md)의 ND-OQ01–07을 따른다. 해당 미확인을 코드/실데이터·실거래 전에 해소해야 한다는 요구를 문서 승인으로 면제하지 않는다.

## Sources

- S1: [functional-spec.md](../functional-design/functional-spec.md) — U1 범위·4실행 역할·현재 권한·원래 주문 문맥·CE01–04·WF·FD-OQ.
- S2: [rules.md](../functional-design/rules.md) — numbered 업무 규칙의 원본, BR1.1–BR8.4/BR3.8.
- S3: [requirements.md](../../../inception/requirements-analysis/requirements.md) — NFR1–NFR14·8정확성 영역·합성 시험·기존 OQ/운영 기준.
- S4: [contract-summary.md](../../../inception/contract-design/contract-summary.md) — G01–G23·C00–C26·wire/등록/호환·실패/시간/운영/소유권.
- S5: [nfr-requirements-questions.md](nfr-requirements-questions.md) — Q1–Q6 및 별도 Looks correct 확인. 지원 버전·실제 제공자/운영 구성은 미선정.
- S6: [최신 화면 답변](../../../inception/refined-mockups/refined-mockups-questions.md) — Q4 WCAG2.2 AA, Q5 고객/직원 PC1280+·브라우저·고객 모바일 미정.
- S7: [이전 기능 검토](../functional-design/reviews/review-01.md) — R-01 조직 평가 개정 매핑, R-02 correlationId 매핑의 후속 확인 근거.
- S8: [team-practices.md](../../../inception/practices-discovery/team-practices.md) — test-after/Standard·80%·보안 검사·Git/배포·1인 구조와 측정 범위.
- 기술 공식 근거: S5의 W1–W27(React/Next/Nest/Express/TypeScript/PostgreSQL/CDK 등). 미선택 대안/외부 문서의 숫자를 제품 요구로 채택하지 않는다.
- 이 greenfield 기록에는 brownfield `technology-stack` 입력이 없다. 현재 스택은 S5에서 선택한 값이고 별도 RE/기존 제품 실적을 만들지 않는다.

