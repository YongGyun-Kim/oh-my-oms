# U4 논리 구성과 실패 경계

## 목적과 설계 원칙

[확인한 방향](nfr-design-questions.md)을 [security-design.md](security-design.md)의 SD01–SD11과 연결한다. U4 FinancialSettlement는 기존 실행 호스트 안의 업무 library다. 아래 행은 책임/데이터/실패 경계이며 새 서버·AWS 계정·독립 금융 서비스의 목록이 아니다. 실제 배포/용량/보호/복구 준비 완료를 의미하지 않는다.

## Logical Components

| ID | 논리 구성·소유 | 책임/적용 설계 | 공유 자원·실패 범위 |
| --- | --- | --- | --- |
| LC01 | 고객/직원 HTTP·worker 진입 / U1, 화면 U8/U9 | 등록된 U4 명령·조회, 세션/MFA·직원 접점·CSRF, parser/예산/입력 검증; SD01–SD03·SD08 | 기존 API 프로세스/HTTP 슬롯·공통 worker, 물리 도메인 격리 아님 |
| LC02 | 현재 신원·기업/조직·계약·대상 / U2/U3 | 정확한 권한/TargetScope·다른 사람 승인·현재 계획/의무·원래 주문/갱신 주문의 확인; SD01·SD10 | 원본 신뢰/권한·계약 불가면 관련 조회/명령 보류. U4가 원본 쓰기를 대신하지 않음 |
| LC03 | FinancialSettlement 업무 서비스 / U4 | Invoice·PaymentEvidence·PaymentAllocation·FinancialEligibility·RefundCase·RenewalFeeAdjustment·FinancialExchange·FinancialReconciliationCase·FinancialHistory의 단일 쓰기 소유; SD05–SD07 | 같은 API/worker 안의 library. 첫 배포에는 수동 지원 경로만 구현, 후속 모델이 자동화 완료를 뜻하지 않음 |
| LC04 | U4 repository·공통 보호 트랜잭션 / U4 + U1 | 같은 manager의 현재 권한/개정·원금/청구/공통 한도 검증, 원본/이력/후속 사실/요청·복구 후보 원자 기록; SD06–SD07 | primary DB·공통 commit counter/epoch 제어 공유. 병목/장애 전파를 숨기지 않음 |
| LC05 | 업무 식별·현재 연결/집계 보조 기록 / U4 | 실제 입금/환불 결과 식별·별칭, canonical payment의 현재 주문 binding, order/obligation의 현재 invoice binding, 원금/한도 소비 집계; SD05–SD06·SD09 | 기존 DB의 제약/등록 모델. 원래 보호된 U4 원본과 대조/복구되며 별도 원본 권위가 아님 |
| LC06 | 보호 DB·prefix/epoch 대조 / U1 | primary 뒤 보호 확인, 원래 요청/후보/버전 대조와 복구 쓰기 fence; SD07·SD09 | 별도 보호 저장의 실패 영역. primary와 단일 물리 트랜잭션/물리 재해 격리 보장 아님 |
| LC07 | Outbox·별도 큐·worker 전달 / U1 및 수신 소유자 | 원자 기록된 사실의 유한 전달·중복/역순/현재성 대조; SD07·SD08 | 큐 지연은 실제 자금/출고/발급 완료가 아님. 원본 성공을 자동 취소하지 않음 |
| LC08 | 실제 제공·회수/후속 허용 / U5/U6/U7 | 실제 완료/회수·계약상 기준·승인 root/한도 제공, 대금 판단의 실행 직전 재확인; SD06–SD07·SD10 | 신뢰 근거 부재/상충은 의존하는 처리 보류. 기간/실제 자금 이동을 U4가 대신하지 않음 |
| LC09 | 기존 증빙 보관처 / 실제 업무 보관 주체 | 직원이 실제 원본을 확인하고 참조/확인 근거만 OMS에 기록; SD04 | OMS 밖의 접근·국내 저장·보존 의무를 별도 확인. 자동 URL 호출/파일 보관 서비스 추가 없음 |
| LC10 | 권한별 금융 조회·화면·관측/알림 / U4 + U7/U8/U9/U10 | 허용된 금융 상태와 대조/남은 조치, 최소 진단·기존 Slack+이메일 경로; SD02·SD04·SD09–SD11 | 일반 관측이 은행 원문 저장소/거래 원장이 되지 않음. 실제 수신·운영 SLO 증거 별도 |

텍스트 흐름: PC의 LC01 → LC02의 현재 신뢰/대상 검증 → LC03 명령 → LC04/LC05의 같은 primary 원자 변경 → LC06 보호 확인 → 원래 요청 결과 응답. 같은 원본의 LC07 사실은 LC08 소유자와 LC10 통지/조회로 연결된다. LC09는 실제 확인의 원본 보관 경계이며 자동 수집 경로가 아니다.

## 원본·보조 기록과 복구 등록

U4 업무 원본은 기존 카탈로그에 등록한 모델·원본 개정/이력을 통해 기록한다. 새 물리 제약/보조 기록이 필요하므로 아래 항목을 명시적으로 확장한다. 아직 해당 코드/DDL을 구현한 것으로 표시하지 않는다.

| 대상 | 설계 의무 | 누락 시 처리 |
| --- | --- | --- |
| 업무 식별/별칭 예약 | SD05의 NOT NULL/UNIQUE key와 canonical payment/원래 환불 부분 연결. 기술 기록도 U4 소유 등록 모델 또는 보호 원본의 명시 필드로 포함 | 보호 payload/decoder와 불일치하면 쓰기 준비 차단 |
| 입금당 현재 주문 / 의무당 현재 청구 | SD05의 안정 business key당 단일 current pointer와 정정 이력. 기업/계획/개정으로 유일성 범위 쪼개기 금지 | 모호한 과거 연결/동시 current는 대조, 자동 병합/재등록 금지 |
| 원금·공통 승인 한도 집계 | 모든 배분/확정/예약·같은 승인 root의 case/시도/개정을 반영. 전체 원본과 원자 갱신·보호되며 재구성 가능 | 페이지100건 합계/오래된 집계로 검증 금지, 재구성 불일치 시 추가 소비 보류 |
| 물리 유일 인덱스·검색 투영 | 보호 원본에서 생성하는 파생 상태. 같은 primary 트랜잭션 안 제약 적용과 epoch fence 아래 재생성 | 누락/충돌이면 준비 차단. 인덱스 삭제를 업무 예약 해제로 해석하지 않음 |
| 모델/계약·복구 버전 | U4 신규 profile·closed schema·명령/포트/호스트 등록·지속 사실, model catalog/validation/decoder/replay 경로를 일치시킴 | U3 전용 sourceContract를 U4로 위장하거나 새 행을 구형 model로 기록하지 않음 |

기술 보조 모델은 domain 책임을 새로 나누지 않는다. FinancialSettlement가 의미를 소유하고 U1은 지속/보호/복구 호스트를 제공한다. U3/U5/U6/U7 테이블의 직접 수정이나 스냅샷의 암묵 변환을 허용하지 않는다. 기존 보호 모델 확장은 [protected-transaction.ts](../../../../../../../../packages/persistence/src/protected-transaction.ts)·[model-catalog.ts](../../../../../../../../packages/persistence/src/model-catalog.ts)·복구 payload/decoder의 실제 변경/검증과 연결한다. 기존 코드에 U3 전용 분기가 있다는 사실을 U4 지원의 근거로 삼지 않는다.

## 동시 변경·복구의 경계

LC04의 primary 변경은 SD06의 READ COMMITTED·현재 counter/epoch 잠금 이후 읽기·고정 순서의 대상 잠금과 같은 EntityManager를 사용한다. U4 한 명령에 포함한 배분은 전체 적용/전체 거절이며, 별개의 직원 명령 여러 건을 하나의 원자 묶음이라고 보장하지 않는다. 기술 제약은 원본 저장 시점에 적용하고 사전 lookup만으로 대체하지 않는다.

원래 request key 재전송과 다른 key의 실제 거래 중복을 구분한다. 실거래 중복 원본은 LC05에서 검출하더라도 LC10 응답은 현재 기업 권한 안에서만 구성한다. 원래 거래 식별이 다른 기업을 가리킨다는 사실을 고객에게 반환하지 않는다.

LC06 확인 전에는 성공을 반환하지 않으며 primary commit 가능성을 유지한 원래 request 재대조를 사용한다. restore/replay는 fence 아래 원본/별칭/연결/예약·집계와 제약을 재구성하고 준비 검증을 마친 후 쓰기를 연다. 어느 한 자료가 누락되면 자동 예약 해제·신규 거래 생성·부분 준비로 진행하지 않는다.

## Failure and Blast Radius Map

| 실패 지점 | 영향 범위 | 보존·후속 처리 |
| --- | --- | --- |
| LC01 과대/잘못된 JSON·필드·배분 건수 | 해당 명령 | 변경 전 전체 거절. 자동 절삭/분할/부분 적용 없음 |
| LC02 현재 권한·직원망·계약/신뢰 부재 | 해당 접근/명령, 공통 인증 장애라면 더 넓은 접근 | 미확인을 허용으로 바꾸지 않음. 현재 원본/근거 확인 |
| LC03/LC05 식별 충돌·잔액/개정 충돌 | 해당 입금/청구/환불·의존 이행 | 원래 결과·정정 관계 보존, 권한 있는 대조. 다른 기업 정보 비노출 |
| LC04 counter/primary·epoch 준비 불가 | 공유 쓰기/DB 의존 조회 | 공통 쓰기 준비 차단 가능. library 경계가 물리 격리를 제공한다고 주장하지 않음 |
| LC06 보호 저장/현재 prefix 불가 | 안전한 성공 응답·확인된 원본 조회 | 원래 접수/후보와 대조·재보호. 응답 실패를 미기록으로 간주하지 않음 |
| LC07 큐/worker 지연·중복/역순 | 후속 상태 갱신/해당 진행 | 원본 유지, 유한 재시도·미완료/실패 관측, 동일 사실 효과 한 번 |
| LC08 제공/회수/승인 원본 상충 | 관련 기산/추가 이행/환불 소비 | 충돌/미확인 보존, 미확인 완료·연체·예약 해제 금지 |
| LC09 원본 접근·국내/보존 미확인 | 해당 실제 입금/환불 확정 준비 | REVIEW/준비 미완료, 합성 자료로 실거래 완료 금지 |
| LC10 알림 실패·관측 미확인 | 통지·운영 대응 | 발송 수락/수신 구별, 기존 실패 경로로 추적. 원금/업무 완료를 일반 로그로 대체하지 않음 |

## 검증·운영 인계

SD11의 단위/통합·실제 DB 동시성·closed contract·복구 자료 호환·권한/정보 비노출을 구현 검증 대상으로 둔다. 단순 구조 검사는 Luna가 실행하고 독립 검토로 문서 의미를 점검한다. 문서 검사만으로 제품 전체80%·PC 통합/실거래·운영 달성을 선언하지 않는다.

원래99.9%/30분/RPO0·p95 조회1초/변경2초·점검 한도·1인 사람 작업 목표는 U1/U10의 실제 관측과 연결한다. 기본 배포·국내 저장·백업·알림 준비는 첫 배포 의무다. 대량100k/50분·재해 복구·무중단·장기간 실증은 후속이며 새로 실행하지 않는다. 고객사10곳/일 주문1000건은 계획이며 처리 용량이 아니다.

R-03의 환불 부분 실패 재시도 전체 상태 모순은 LC03/LC04에 남은 기능 의존이다. 공통 원금/한도 보호 설계와 해당 상태 전이의 해소를 구별한다. 기존 U2/U3 위험·실제 source profile·보관/접근/국내 경로·적용 의무의 미확인도 각각 유지한다. 해당 경로의 구현/실데이터 준비 완료에는 별도 해소/검증 근거가 필요하다.

## Assumptions & Open Questions

- 기술 인덱스/보조 예약·집계의 구체 모델/DDL·registry/model version·codec/replay와 U4 실제 구현은 다음 구현 계획/검증에서 일치시킨다. 이 설계의 존재가 기존 공통 호스트의 자동 지원을 뜻하지 않는다.
- 실제 원본 profile/업무 권위·증빙 보존/국내 경로·신뢰·운영 목표는 별도 실제 근거가 필요하다. 정책을 임의 생성하거나 검증 후속을 첫 배포 안전 의무의 면제로 해석하지 않는다.

## Sources

- [상세 설계 확인](nfr-design-questions.md), [보안 설계](security-design.md), [NFR 요구](../nfr-requirements/security-requirements.md), [기술 적용](../nfr-requirements/tech-stack-decisions.md): 범위/수치·패턴·상세36개 NFR.
- [기능 명세](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md), [기능 검토](../functional-design/reviews/review-02.md): 데이터/처리·금액·R-03.
- [공통 계약](../../../inception/contract-design/contract-summary.md), [컴포넌트](../../../inception/domain-design/components.md), [Unit 정의](../../../inception/units-generation/unit-of-work.md): 원본·in-process 포트와 전달 경계.
- [첫 배포 실행 계획](../../../release-planning/first-release-delivery-plan.md): 지원 경로·후속 실증/기존 미해결.
- [공통 보호 쓰기](../../../../../../../../packages/persistence/src/protected-write.ts), [모델 쓰기](../../../../../../../../packages/persistence/src/protected-transaction.ts), [현재 모델 등록](../../../../../../../../packages/persistence/src/model-catalog.ts): 재사용 경계와 새 U4 확장/검증의 실제 연결 지점.
