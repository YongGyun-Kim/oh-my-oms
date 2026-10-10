# U1 Scalability Design

**Unit:** u1-integrated-foundation  
**범위:** 공유 업무 핵심의 고객UI/직원UI/API/worker4역할·Outbox relay, 별도 보호 원장과 consumer 전달 경계. 설계/합성 profile이며 실제 용량/비용 통과가 아니다.

## Load Profile and Capacity

ND-SCALE-01. 기업100·고객계정1000·직원시험계정10·상품10000·주문100000·평균5/시험최대50품목을 seed/개정/분포와 생성한다. 허용/거절·조직 NULL/폐지·미확인/확인·경합·대기 자료를 포함한다. 실제 사업 고객/인력·제품 품목 한도로 전용하지 않는다.

| 구간 | 총 HTTP 부하 | 판정 |
|---|---|---|
| 정상 |100활동세션·20req/s·30분·조회80/변경20% | 조회/변경p95와 최초 오류율·첫 시작·UI 목표 |
| 집중 | 같은 비율100req/s·5분 | 지연/거절/보호 접수/backlog 공개·정확성0 유지 |
| 회복 |20req/s로 감소 |5분 내 정상 기준 회복 후10분 유지 |

경로/audience·page/filter/행 byte·최초 표시/poll·provider delay·fanout·due work 분포를 고정한다. HTTP 요청 수·원래 업무 operation·작업/외부 호출·span 수를 별도로 측정한다. 집중 부하에서 정상 latency와 같은 보장은 선택하지 않았지만 정확성/권한/접수 보존은 완화하지 않는다.

## Scaling Architecture and Load Distribution

ND-SCALE-02. 첫 버전부터 상한 있는 측정 기반 수평 autoscaling을 설계한다. Next BFF의 업무 원본/세션 권위는 server persistence에 두고 동일 사용자라도 어떤 허용 replica에서 현재 검증하도록 한다. API/worker는 등록된 owner/handler·같은 원자 persistence와 실행 permit/lease/fence를 사용한다. 도메인별 network microservice·sharding을 추가 선정하지 않는다.

| 역할 | 확대 관찰값 | 증감/실패 제약 |
|---|---|---|
| 고객UI | request 지연/동시·CPU/메모리·BFF pool | 보호 cache 금지·현재 사용자 전달·고객 공개 경계 |
| 직원UI | 같은 관찰값·사설 ingress 오류 | replica 증가가 직원 공개 경로를 만들지 않음 |
| API/relay | HTTP p95/error·연결/lock·원장 보호 지연/미발행 | DB/원장 병목이면 scale만으로 해결하지 않음 |
| worker | 실제 eligible work age/첫 시작·처리량·lease·provider wait | consumer/외부 접점 총량과 효과/표지 보호·drain |

CPU 하나나 SQS 표시 queue 길이만으로 작업 부하를 판단하지 않는다. notBefore/승인/동의 대기·불명/미등록 작업과 실행 가능한 적체를 구별한다. 공개/직원UI와 업무별 queue/DLQ는 논리 분리이며 공유 API/DB·계정/region 장애를 완전 격리했다는 증거가 아니다.

## Capacity Thresholds and Auto-scaling Rules

ND-SCALE-03. 실제 제품/환경의 min/max replica·ready 시간·cooldown·측정 창·global concurrency/연결/비용 상한은 ND-RG04에서 고정한다. 검증할 용량 조건은 아래와 같다.

- primary 연결: 모든 역할의 최대 replica×각 pool 한도 합+운영/복구 여유≤검증된 primary 용량. journal은 별도 계산한다.
- external 접점: 모든 replica/consumer의 허용 in-flight 합≤provider 계약/실측 한도. 회로 HALF_OPEN 확인은 접점 전체1개 권위로 조정한다.
- queue/worker: 실제 arrival/fanout·due와 처리량/first-start를 대조하고 backlog가 계속 증가하면 수락/실행 유량을 제한한다. 자동 확대는 검증된 max와 비용 범위 안이다.
- trace/발행 buffer: finite byte/항목/시간 한도와 누락/적체 metric을 둔다. 무한 메모리/재시도로 가용성을 흉내 내지 않는다.

같은 보호 원장 순번 경계·DB lock의 병목은 worker/API 복제만으로 풀리지 않는다. 정상/집중·재기동/scale 전후에 최대 보호 gap/claim/외부 concurrency와 정확성을 대조한다. 값/실제 resource profile이 없으면 운영 autoscaling을 활성화하지 않는다. source와 CDK/배포 config에 상한을 함께 등록하고 부하 시험을 통과한 조합만 사용한다.

ND-SCALE-04. scale-in/배포 때 새 claim을 막고 진행중 work/lease·실제 외부 결과를 기록/대조한다. 제어된 drain 기한 뒤 old worker는 권위를 잃고 늦은 결과가 새 개정을 덮지 못한다. 임대 만료만으로 외부 효과가 없다고 판단하지 않는다. 새 worker는 이전 원본/누적 attempt/기한·실행 허가/결과를 이어 확인하며 key/message/접수를 삭제하지 않는다. [reliability-design.md](reliability-design.md)

## Data Partitioning, Isolation and Backpressure

ND-SCALE-05. 단일 primary의 owner별 원본/쓰기 책임·query/index·service credential 경계를 유지하고 queue/DLQ는 업무 consumer별로 분리한다. tenant/행위 filtering은 query/현재 권한으로 적용하며 schema 이름/queue 분리만으로 tenant 완전 물리격리를 주장하지 않는다. 실제 한정 재고 배정은 owner가 조건 충족 후보로 확인/기록한 순서와 재고 단일 권위의 원자 예약으로 수행한다. SQS Standard 순서/worker 도착 순서를 business FIFO로 전용하지 않는다.

요청 admission은 실제 유효 입력/현재 권한과 자원/보호 가능성을 확인한다. 미접수 유효 요청은 실제429/503로 안내하고, 지속 보호 접수된 작업은 원래 Receipt/진행 상태로 보존한다. 미확인 provider/결과·권한/업무 review를 동일 overload code로 섞지 않는다. 이미 접수한 work는 전달 copy expiry/backpressure로 삭제하지 않는다. journal 단독 장애는 보호 필요한 변경을 제한하고 검증된 안전한 현재 조회만 유지한다.

## Verification and NFR Mapping

| NFR | 설계 | 후속 검증 |
|---|---|---|
| NFR7.1 | ND-SCALE-01 | seed/분포·NULL/미확인/경합·시험 계정 근거 |
| NFR7.2 | ND-SCALE-01/02 |20req/s의 실제 경로/작업/poll·지연/오류 분모 |
| NFR7.3 | ND-SCALE-01/03 |100→20 부하·5분 회복/10분 유지·정확성 |
| NFR7.4 | ND-SCALE-02–04 | global cap·준비/drain·중복/늦은 효과·journal 병목 |
| NFR7.5 | ND-SCALE-03/05 | 한도/실제429/503·접수 원본 유지·deadline/키 수명 |

## Assumptions & Open Questions

ND-RG03/04/08/10의 actual runtime/AWS 제품·자원/비용·fanout/외부 한도·원장 독립성/부하·야간 대응은 미확인이다.50시험 품목과 page100을 주문 품목 상한으로 쓰지 않는다. 역할별 자동 확대가1인 운영 목표를 만족하는지는 실제 운영 작업 시간/적체와 함께 검증한다. [logical-components.md](logical-components.md)

## Sources

- [scalability-requirements.md](../nfr-requirements/scalability-requirements.md), [performance-requirements.md](../nfr-requirements/performance-requirements.md), [tech-stack-decisions.md](../nfr-requirements/tech-stack-decisions.md)
- [질문과 확인](nfr-design-questions.md): Q8–11/15/20/21/28–32.
- [functional-spec.md](../functional-design/functional-spec.md), [contract-summary.md](../../../inception/contract-design/contract-summary.md)
- [AWS Application Auto Scaling](https://docs.aws.amazon.com/autoscaling/application/userguide/what-is-application-auto-scaling.html): 지원 자원별 조건을 actual 제품/region에서 확인하며 수치/성능 증거로 전용하지 않는다.
