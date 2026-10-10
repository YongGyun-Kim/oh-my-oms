# U1 확장성 요구사항

**Unit:** u1-integrated-foundation

## 범위와 판정 의미

U1은 최소 신원/기업 신청·승인/최초 관리자·현재 권한·직원 상품 등록·타입별 주문 접수/전체 확인 대기·지속 기록/worker·최소 고객/직원 UI와 진행 조회를 연결하는 첫 기반이다. 금융·HW·SW 전체 이행, 전체 U8/U9 화면과 U10 실운영 측정은 해당 소유 단위에서 확장한다. 미등록 공급자와 미확인 가격/계약/공급·외부 결과를 실제 가능/완료로 바꾸지 않는다. U1의 최소 MFA/망/권한·접수 보존·실행 준비를 후속 단위까지 미룬다는 뜻은 아니다. [S1–S4]

이 문서는 사용자 확인된 기준과 상위 계약에서 파생한 요구사항이다. 문서/trace의 OK는 정의 연결이고 코드·보안·성능·복구·접근성·국내 저장·상용 준비 통과가 아니다. 각 행의 NFRx.y는 S3의 NFRx를 상속하며 같은 ID의 정의 원본은 아래 표다. 요구사항 수치와 정책은 S5의 사용자 답변/요약 확인을 우선한다. 원본 기능/계약과 과거 검토 기록은 수정하지 않는다.

## 요구사항과 수락 기준

| ID | 요구사항 | 수락 기준·확인 조건 | 구현/검증 책임과 범위 | 근거 |
|---|---|---|---|---|
| NFR7.1 | 기준 자료는 합성 기업100·고객계정1000·직원시험계정10·상품10000·주문100000이다. | 주문당 평균5·시험 최대50품목을 생성한다. 소유/조직·허용/거절·미확인/확인·경합 자료를 포함하고 seed/분포/개정을 기록한다. 실제 고객 수·상용 인력·제품 품목 한도로 사용하지 않는다. | U1 데이터 생성/기반·각 owner/U10 | NFR7; 합성 시험 데이터 |
| NFR7.2 | 정상 부하는 활동 세션100·총20req/s·30분·조회80%/변경20%다. | 고객/직원·각 경로/조회 필터·동기 외부/worker 부하와 동시 변경 구성을 시험 전에 명시한다. 빠른 임시 데이터/빈 응답으로 NFR6 달성을 가장하지 않는다. | U1 기반·U10 전체 시험; ND-OQ04 | NFR7; NFR6 |
| NFR7.3 | 집중 부하는 같은 비율100req/s·5분이며 이후20req/s로 낮춘다. | 5분 내 NFR6으로 회복하고10분 유지한다. 집중 구간 지연·오류·거절/접수/backlog를 공개한다. 집중 중 정상과 같은 응답시간 보장은 미선택이지만 접근·금액·보존 등 정확성 위반은 허용하지 않는다. | U1 pressure handling·U10 검증 | NFR7; NFR5–NFR6 |
| NFR7.4 | 확장/제한은 측정한 자원·작업 적체와 정확성 조건에 근거한다. | API/worker·DB 연결/lock/저장·외부 병목의 지표/trigger/상한·drain/회복을 설계한다. replica 수를 늘려도 같은 요청/작업의 효과는 한 번이며 불명 커밋을 재실행하지 않는다. CPU%·replica/예산·자동 scaling 제품은 아직 미선정이다. | U1·각 owner/Infra; ND-OQ03–04 | NFR7; G06–G09 |
| NFR7.5 | 과부하/자원 부족은 유효한 실패·지속 접수·진행 조회 의미를 보존한다. | 입출력/페이지·키/작업 대기·DB 연결·deadline/안전 재시도 상한을 관련 코드 전에 결정한다.50품목을 제품 상한으로 적용하거나 한도 초과를 성공/업무 거절로 숨기지 않는다. C18 작업과 접수/근거를 backpressure 때문에 삭제하지 않는다. | U1/U8/U9·업무/Infra; ND-OQ03–04 | NFR7; G13/G17; OQ8/OQ9 |

## 합성 용량과 성장 해석

| 항목 | 초기 합성 시험 기준 |
|---|---|
| 기업/계정 | 구매 기업100·고객 계정 총1000·직원 시험 계정10 |
| 상품/주문 | 상품10000·주문100000·평균5/시험 최대50품목 |
| 정상 | 활동 세션100·총20req/s·30분·조회80%/변경20% |
| 집중/회복 | 총100req/s5분→20req/s·5분 내 정상 목표 회복·10분 유지 |

현재 실제 수요/자료 증가율/상용 용량/저장 예산·고객/사업 인력 수가 확인되지 않았다. 더 큰 운영 목표는 실제 관측·사업 판단으로 정하며 시험용50품목이나1000계정을 제품 기능 제한으로 쓰지 않는다. 수명/복구·백업/중복 보호 자료 증가까지 포함해용량을 설계한다.

## 확장·한도 검증 조건

API/worker를 별도 실행하는4배포 역할 안에서 실제 bottleneck·동시 lock/commit·외부/기술 실패·client polling·작업 backlog를 관측한다. 확장/worker 재기동·종료 drain·retry/failover 중 원래 식별자와 원본/이력/작업/processed marker를 보존한다. 자원 부족을 확인되지 않은 대금/공급/발급 실패로 바꾸지 않는다. 실제 queue/broker·autoscaling 제품/replica/임계값은 ND-OQ03–04의 선택이다.

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

