# U1 Performance Design

**Unit:** u1-integrated-foundation  
**입력:** 확인된 [질문/요약](nfr-design-questions.md), 고정된 NFR/Functional Design·계약.  
**판정:** 설계 연결이며 실제 성능/보안/복구 통과가 아니다. U1 최소 통합 기반과 후속 업무/전체 UI·U10 검증을 구분한다.

## Performance Budgets

ND-PERF-01. 정상 합성 부하의 실제 허용 요청을 브라우저 송신부터 전체 응답까지 측정한다. 조회p95≤1초/변경p95≤2초·유효 요청 기술 오류율≤0.1%를 유지한다. 정상 의미의 거절과 잘못된 거절/과부하/timeout·기술 실패를 분리하고 재시도 성공으로 최초 오류를 지우지 않는다. 정확성/누출/접수 유실·중복 효과는 별도0 기준이다.

| 대상 | 선택한 기준 | 측정/제한 경계 |
|---|---|---|
| 조회 HTTP | 정상p95 1초; 전체 대기 최대5초 | browser→Next→Nest 현재 권한/원본→전체 본문 |
| 변경 HTTP | 정상p95 2초; 전체 대기 최대10초 | 업무/접수/이력/필요작업·독립 복구 보호 확인 포함 |
| PC 최초 화면 | 정상p95 3초 | navigation 시작→주요 허용 내용/필수 조작 준비; skeleton/LCP 단독 아님 |
| 내부 작업 첫 시작 | 정상p95 10초 | 원본상 실행 가능·due 도달→relay/queue/대기→첫 지속 processing 기록 |
| 비동기 완료 | 업무 소유자의 계약 기한 | 지급/배송/설치/발급 전체 완료를 HTTP/첫 시작으로 대체하지 않음 |

ND-PERF-02. 하나의 HTTP 예산을 BFF/Nest·인증/현재 권한·연결/lock/query·primary/원장·필요 동기 외부 호출·전송/정리에 잔여시간으로 배분한다. 하위 호출/SDK마다 타이머를 초기화하지 않는다. 서버는 검증된 자체 상한과 수신 시 잔여시간 중 작은 값을 쓰며 client header로 연장하지 않는다. 시계 차이·network 여유/취소·driver/query/lock 한도는 실제 제품 지원과 지연 분포를 확인해 ND-RG03/04에서 유한값으로 고정한다. 구성 누락 때 무한 기본값으로 시작하지 않는다. 구간p95 합으로 end-to-end p95 통과를 주장하지 않는다.

timeout/연결 종료/취소 성공은 실제 commit/외부 효과 부재를 증명하지 않는다. 변경은 같은 원래 request/operation·키/정규화 입력과 결과를 대조하고 접수 확인 필요를 안내한다. 새 ID 자동 제출을 금지한다. 실제 오류 status/Problem Details와 불명 상태를 구별한다. 이미 보호된 접수/작업의 별도 기한과 복구 보호는 HTTP 대기 종료 후에도 유지한다. [reliability-design.md](reliability-design.md)

## Caching Architecture

ND-PERF-03. Next는 화면/BFF이며 Nest 업무 소유자가 최종 권위를 가진다. 필요한 최초 보호 조회는 요청별 server rendering으로 처리하고 후속 조작은 등록된 operation만 호출한다. browser/BFF/서비스의 동일 요청 내 안전한 중복 조회 합치기는 허용하지만 다른 요청/주체의 보호 결과 재사용과 구별한다.

공개 JS/CSS/아이콘은 cache 후보이고 고객별 가격/주문/계약·신원/권한·직원 상품/HTML/RSC/API 결과는 요청 간 cache하지 않는다. 보호 응답은 no-store/dynamic 경계를 명시하고 빌드/prerender·CDN·Next data/router/prefetch·브라우저 상태·TypeORM query cache를 실제 채택 버전에 맞게 확인한다. 보호 내용을 정적 번들/공유 cache에 넣지 않는다. logout/계정 전환·세션 만료/권한 회수 시 이전 화면을 잠금/제거하고 현재 허용 조회 후 표시한다. 특정 Redis/CDN 제품을 선정하지 않는다. [security-design.md](security-design.md)

## Query Optimization and Pagination

ND-PERF-04. TypeORM Entity/Repository/QueryBuilder를 우선 사용하고 필요한 SQL은 같은 transaction EntityManager/QueryRunner에서 parameter binding한다. 별도 pg Pool/전역 repository로 원자 단위를 나누지 않는다. 외부 호출/사람 입력 동안 transaction/lock을 유지하지 않는다.

등록된 일반 목록은 pageSize 생략25·최대100건이다. invalid/초과는 실제400/등록된 입력 오류로 처리하고 조용히 잘라 완료처럼 표시하지 않는다. 현재 principal/audience/행위/기업·조직 및 보호 원본 가시성을 query에서 먼저 적용한 후 limit/최소 projection한다. 전체 결과를 받아 UI에서 숨기지 않는다. tenant/owner 필터·등록 sort와 고유 tie-break·커서 경계에 맞는 복합 인덱스를 실제 query plan으로 검증한다. 기본 생성 순서/ID는 안정된 순회 키이며 cursor는 주체/문맥·filter/sort와 결합해 교차 사용/변조를 거절한다. 큰 OFFSET·임의 sort·N+1·전수 count/scan을 기본 경로로 두지 않는다.

live 목록은 페이지마다 현재 원본/권한을 확인한다. 여러 페이지의 고정 snapshot/동시 변경 중 완전한 전수 추출을 약속하지 않는다. 상세/보고서·파일/필터/요청 byte와 상품/주문라인 한도는 각 계약의 ND-RG04에서 고정한다.25/100·시험50품목은 총 등록 건수/주문 품목 한도가 아니다.

## Resource Pooling and Async Processing

ND-PERF-05. API/worker/relay·복구/관리의 pool과 업무 consumer/외부 접점 concurrency를 분리하고 상한을 전역 용량에 맞춘다. 모든 허용 replica의 pool 합+관리/복구 여유≤실측 DB 연결 용량이며 원장도 별도 합계를 검증한다. queue wait/연결 대기·buffer와 응답 byte를 제한하고 한도 도달 시 실제429/503 또는 이미 보호된 접수의 대기 의미를 유지한다. 자원 부족을 가짜 성공/Review·작업 삭제로 감추지 않는다. CPU/메모리·pool/replica·fanout은 [scalability-design.md](scalability-design.md)의 용량 gate를 따른다.

Outbox는 protected 원본만 relay한다. DB/queue의 지속 기록·consumer 효과/표지·복구 가시성 때문에 생기는 비용을 성능 측정에 포함한다. worker 수신/첫 시작과 전체 완료·externally confirmed 결과는 다른 값이다. HTTP20req/s를 job/s로 환산하지 않는다.

진행 화면은 표시 중30초 간격·한 구간 최대10분/추가20회, 최초/다시 표시·수동 현재 조회를 사용한다. 중복 동시 조회와 밀린 timer 폭주를 막고 숨김/이탈·만료/회수/현재 권한 불명 때 중단한다. 상한 후 마지막 확인 시각·수동 조회를 안내한다. polling은 세션 유휴를 연장하지 않고 timer/외부 상태30초 도착을 보장하지 않는다. 늦은 응답은 계정/필터/대상·개정을 검증해 새 화면을 덮어쓰지 않는다.

## Verification and NFR Mapping

| NFR | 설계 | 필요한 후속 검증 |
|---|---|---|
| NFR6.1 | ND-PERF-01/02/04 | 실제 조회/동기 외부/권한·필터/행 크기별 end-to-end p95 |
| NFR6.2 | ND-PERF-01/02/05 | primary+원장 지속/연속 보호까지2초·timeout/ACK 유실 대조 |
| NFR6.3 | ND-PERF-01 | 최초 valid 요청 분모/잘못된 거절·timeout/재시도 오류 보존 |
| NFR6.4 | ND-PERF-01/05 | seed·network/OS/browser/version·warm/cold·경로/기간/분포/표본 |
| NFR6.5 | ND-PERF-02–05 | 화면 준비/first-start·pool/입출력/작업 완료·visibility/회수 시험 |

시험은 합성 기업100/고객1000/직원시험계정10/상품1만/주문10만·평균5/시험최대50품목,100활동세션·20req/s 30분·조회80%/변경20%를 사용한다. 실제 polling/최초 표시·staff/customer/worker 및 동기 외부 지연을 profile에 포함한다.100req/s 5분 후20으로 낮추고5분 내 정상 기준 회복·10분 유지, 집중 구간의 실패/적체도 보고한다. 단기 정상 시험을30일 가용성/실연동·실거래 증거로 전용하지 않는다.

## Assumptions & Open Questions

성능 적합성은 assumption이며 실제 수요/연동/자원/비용은 미확인이다. ND-RG02/03/04/07/10의 값과 지원/측정 근거를 해당 코드/시험 전에 확인한다. 목록 외 입력/응답 byte·MFA/실제 네트워크/회사 접속 근거와 실제 browser는 미확인으로 인계한다. [logical-components.md](logical-components.md)

## Sources

- [performance-requirements.md](../nfr-requirements/performance-requirements.md), [scalability-requirements.md](../nfr-requirements/scalability-requirements.md)
- [질문과 확인](nfr-design-questions.md): Q1/14/16/21/23/25/28/29/32 및 별도 요약 확인.
- [functional-spec.md](../functional-design/functional-spec.md), [contract-summary.md](../../../inception/contract-design/contract-summary.md)
- [Next data security](https://nextjs.org/docs/app/guides/data-security), [caching previous model](https://nextjs.org/docs/app/guides/caching-without-cache-components): 적용 버전/모드를 별도 확인한다.
- [TypeORM transactions](https://typeorm.io/docs/transactions/), [PostgreSQL LIMIT](https://www.postgresql.org/docs/current/queries-limit.html): 동일 연결/정렬·부분 결과의 기술 근거이며 OMS 수치/성능 증거가 아니다.
