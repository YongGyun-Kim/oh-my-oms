# U1 성능 요구사항

**Unit:** u1-integrated-foundation

## 범위와 판정 의미

U1은 최소 신원/기업 신청·승인/최초 관리자·현재 권한·직원 상품 등록·타입별 주문 접수/전체 확인 대기·지속 기록/worker·최소 고객/직원 UI와 진행 조회를 연결하는 첫 기반이다. 금융·HW·SW 전체 이행, 전체 U8/U9 화면과 U10 실운영 측정은 해당 소유 단위에서 확장한다. 미등록 공급자와 미확인 가격/계약/공급·외부 결과를 실제 가능/완료로 바꾸지 않는다. U1의 최소 MFA/망/권한·접수 보존·실행 준비를 후속 단위까지 미룬다는 뜻은 아니다. [S1–S4]

이 문서는 사용자 확인된 기준과 상위 계약에서 파생한 요구사항이다. 문서/trace의 OK는 정의 연결이고 코드·보안·성능·복구·접근성·국내 저장·상용 준비 통과가 아니다. 각 행의 NFRx.y는 S3의 NFRx를 상속하며 같은 ID의 정의 원본은 아래 표다. 요구사항 수치와 정책은 S5의 사용자 답변/요약 확인을 우선한다. 원본 기능/계약과 과거 검토 기록은 수정하지 않는다.

## 요구사항과 수락 기준

| ID | 요구사항 | 수락 기준·확인 조건 | 구현/검증 책임과 범위 | 근거 |
|---|---|---|---|---|
| NFR6.1 | 정상 부하의 허용 조회는 p95 ≤1초다. | NFR7.1–7.2 자료·부하에서 요청 송신부터 본문 수신까지 측정한다. 동기 외부 대기도 포함하고 결과/원본 확인 상태를 사실대로 반환한다. | U1 조회/전송 기반; U2–U7 제공자 확장·U10 전체 시험 | NFR6; G16–G17 |
| NFR6.2 | 정상 부하의 변경 응답은 p95 ≤2초다. | 실제 결과와 지속 접수(202/Receipt)를 구별한다. 2초를 모든 비동기 업무 완료 기한으로 바꾸지 않는다. 성공 접수는 NFR4.1 커밋 확인 후만 가능하다. | U1 명령/Receipt; 업무 소유자 후속 결과 | NFR6; G07; Q4 |
| NFR6.3 | 정상 부하 유효 요청의 기술 오류율은 ≤0.1%다. | 최초 오류·timeout·잘못된 업무 거절·과부하 거절을 성공으로 숨기지 않는다. 정당한 입력/권한 거절은 별도 집계한다. 재시도 성공이 최초 실패를 삭제하지 않는다. NFR5 위반은 별도 0 기준이다. | U1 분류/측정 기반; U10 검증 | NFR5–NFR6; 실패·시간·운영 계약 |
| NFR6.4 | 성능 보고서는 재현 가능한 분모·분포·시험 조건을 보존한다. | 조회/변경별 표본·p95·오류 종류·동기 외부 대기·기간을 공개한다. 실행 위치/네트워크·warm-up·페이지/필터·작업 부하·동시 갱신 구성을 시험 전에 고정한다. 빠른 경로만 골라 전 업무 달성으로 표시하지 않는다. | U1 측정 값; U10 전체 프로필; ND-OQ04 | NFR6–NFR7; OQ8 |
| NFR6.5 | 화면 최초 표시·비동기 완료와 자원 예산은 HTTP 응답 목표와 별도로 정한다. | Next의 렌더링/세션 전달·읽기 최신성, 작업 backlog/최장 대기·처리 시간, CPU/메모리/DB 연결·외부 timeout 예산을 NFR Design에서 정하고 관련 코드/시험 전에 검증한다. 미정 수치를 임의 기본값으로 넣지 않는다. | U1/U8/U9/U10 및 각 업무; ND-OQ02–04 | NFR6; OQ8; Q5 |

## 측정 경계와 재현 자료

정상 구간의 조회/변경 모집단을 나누고 p95를 각각 산정한다. 요청의 송신과 응답 본문 수신 시각을 같은 시험 주체/측정 기준으로 연결한다. workload 일정과 실제 보내진/수신된 요청을 함께 남겨 지연으로 발생한 요청 누락이나 도구의 속도 저하가 성능 결과를 유리하게 만들지 않도록 한다. 정상 거절은 별도 거절 시험에서 성공 여부를 확인하고 허용돼야 하는 요청의 오거절은 기술/기능 실패로 남긴다.

보고서는 fixture seed/자료 분포·소유/조직/권한 개정, 실행/네트워크 위치, source/build/schema/설정 버전, 고객/직원·기능별 요청 구성, 페이지/필터·외부/worker 동시 부하, 표본/분포/최초 오류·재시도·접수/실제 결과를 포함한다. 인증·현재 권한·실제 저장/worker 경로를 생략한 빈 HTTP benchmark로 대체하지 않는다. 같은 조건에서 Node/Nest/Express와 실제 저장/선택 제공자 경로를 검증한다.

## 자원·비동기·UI 예산의 후속 결정

U1은 순수 placeholder handler의 속도를 제품 성능으로 기록하지 않는다. provider가 미등록이면 사실대로 확인 대기를 저장/조회하는 동작을 시험할 수 있지만 실제 계약/HW/SW 완료 성능으로는 표시할 수 없다. HTTP2초는 장기 업무 완료를 보장하지 않는다. Next 최초 표시/입력 피드백과 worker 완료/적체·polling·timeout/총 deadline·연결/입출력 상한은 ND-OQ02–04에서 관련 구현 전에 결정한다.

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

