# U3 기술 선택 적용과 유지보수 요구사항

## 목적과 결정 범위

[확인한 기준](nfr-requirements-questions.md)의 기존 선택을 U3에 적용한다. 새 프레임워크·제공자·AWS 계정·배포 단위를 선정하지 않는다. U3는 U1 실행 기반에 들어가는 ProductCatalog·CommercialAgreement·OrderAcceptance의 library이며, 이 문서는 선택/적용 의무를 정의하고 코드 구현·실제 서비스 지원·비용/운영 성과를 확인한 결과가 아니다.

## Technology Decisions

| 항목 | 적용할 기존 선택 | U3 적용과 추천 이유 | 검증/후속 경계 |
| --- | --- | --- | --- |
| 언어/공통 계약 | TypeScript 중심 | 공통 계약·도메인 타입·UI 연결을 같은 생태계로 관리하는 기존 방향. 런타임 입력 검증은 별도 필수 | 실제 dependency/lockfile·지원/보안·호환은 구현 준비에서 현재 근거 대조 |
| API | NestJS + Express | 기존 호스트의 입력/신원/권한/오류 경계를 재사용하고3개 도메인 소유자의 단일 쓰기 권위를 유지 | HTTP 보호만으로 공통 서비스/worker 진입이 보호됐다고 가정하지 않음 |
| worker | Nest standalone | 호스트의 공통 업무 서비스를 공유하면서 작업 진입 신뢰/입력·대상/개정/멱등성 검증 적용 | 신규 HTTP 서버·도메인별 microservice를 추가하지 않음 |
| 거래 기록 | TypeORM 위주 + PostgreSQL | 기존 지속 기록/개정/이력·원자 접수 경로를 재사용. ORM 선택으로 정확성/복구 목표를 보장하지 않음 | 상품/계약/주문·변경 결과/이력의 같은 성공 경계와 실제 정수 금액 표현·동시성 검증 |
| 사실 전달 | Transactional Outbox + 별도 큐 | 주문·승인/조건 변경과 전달 사실을 함께 보존해 기록/통지의 불일치 위험을 줄임 | dispatcher/큐 재전송은 가능한 것으로 취급. 수신 소유자의 동일 사실 효과 한 번과 개정 대조 필수 |
| 고객/직원 UI | Next.js App Router + React + TypeScript | U8/U9의 한국어 PC1280 이상에서 현재 상태/미확인/오류/다음 조치 연결 | 주문/조건/권한 최종 판단은 U3/Nest 업무 소유자. 민감 정보 캐시/세션 전달은 기존 보호 경계 준수 |
| 인프라 | AWS + CDK,한 AWS 계정 | 승인된 환경/배포 역할 재사용으로1인 기술 운영 목표와 설정 이력 연결 | 새로운 account 분리·단말 관리·법정 기간·서비스 기본값을 지침만으로 추가하지 않음. 실제 배포/국내 경로 증거 별도 |
| 인증 | Cognito 첫 제공자,출시 후 Keycloak 방향 | 공급자 신원과 OMS 기업/조직/업무 권한을 구분하고 제공자 변경 경계를 유지 | U3가 Cognito role/claim을 거래 권한 원본으로 직접 채택하지 않음. 전환 구현/실제 제공자 시험은 별도 |
| 복구 보호 | 별도 보호된 DB 복구 원상 사용 방향 유지 | 기존 복구 원본의 보호 의도를 보존하고 U3 성공 접수/원본/이력 대조와 연결 | 같은 AWS 계정의 보호 경계,실제 복구/논리 손상 대조와 RPO0/30분 실증은 후속. 자동 달성 선언 없음 |

이 표의 이유는 현재 프로젝트에 대한 적용 판단이다. 기존 선택 자체를 재승인한 사용자 답변을 만들어 기록하지 않는다. 주 실행 역할/배포·원본 저장·인증·알림의 책임은 기존 소유자에 유지한다.

## Maintainability and Operational Requirements

| ID | 요구사항 | 수락 기준과 검증 경계 | 책임 |
| --- | --- | --- | --- |
| NFR9.1 |1명이 개발·기술 운영할 수 있는 구조로 유지한다. | 공유 호스트/기록/큐/보호 경계를 재사용하고 별도 U3 배포/새 수동 동기화 절차를 임의 추가하지 않음. 실제 정상일 반복 작업≤30분·일반 배포 작업≤15분·대표 장애 사람 복구≤30분 목표와 자동 대기/총 경과를 구분. 실제 운영 증거는 후속 | U3 + U1/U10 |
| NFR9.2 | 기술 인력1명이 계약 등록자/다른 승인자의 사업 역할을 대신하는 것으로 해석하지 않는다. | 다른 승인자 부재 시 적용 보류·확인 필요를 유지. 개발 인원수 때문에 자기 승인 허용/기능 자동 축소/검증 하한 완화 없음 | 실제 사업 승인 담당 + U3/U2 |
| NFR9.3 | 원본 소유자와 최소 운영 대조 경로를 명확히 유지한다. | 상품/공통 조건·기업 합의/제안·주문/스냅샷/판단/적용을 각각 소유. 실제 대금U4·HWU5·SWU6·후속U7 원본을 복제 승격하지 않음. 요청/결과/현재 개정·미확인/실패를 권한 있는 담당자가 추적 | U3 + 각 원본 소유자 |
| NFR13.3 | 공유 계약을 소유자·버전·의미에 맞게 구현한다. | C00/C05 v2의 필수 TargetScope·행/조건별 모든 계약 개정·원본/값 매핑·수락 전/후 changeKind를 실제 스키마/명령/조회/응답에 함께 적용. 닫힌 Ref enum/추가 속성·정확한 Money/Period·논리/전송 enum 대응을 계약 시험으로 검증. v2를 v1으로 표시/전송하지 않음 | U3 Code Generation + U1/U8/U9 |
| NFR13.4 | 버전/도구·품질 결과를 현재 적용 바이트와 연결한다. | 기존 exact versions/lockfile·formatter/linter·표준 test-after/80% 하한을 재사용. 변경한 source/계약과 해당 검사·분모/미실행/제외·보고서 연결. 앱 코드/의존성이 바뀌지 않은 문서 검사를 제품 실행 성공으로 대체하지 않음 | 개발/품질·공유 CI |

## C00/C05 v2 Implementation Obligations

기능 설계가 정의한 명세의 구체화 대상이며 별도 제품 기능 추가가 아니다.

1. OrderInput/OrderView의 TargetScope를 정확히 고정하고 현재 원본/조직 효력·대상 권한을 검증한다.
2. OrderLineInput/OrderLineView/PurchaseTermsSnapshot/OrderView의 agreementRevisionRefs와 conditionBindings를 함께 보존/조회한다. 행·조건별 실제 개정 합집합이 일치하고 계약 없음/조회 실패를 구분한다.
3. 값 객체는 인라인 또는 기존 허용 원본의 정확한 하위 내용으로 매핑한다. 가상의 타입명을 C00.Ref.entity로 전송하지 않고 저장 내용/대상/목적/개정을 역참조한다.
4. REVIEW_PRICE_CHANGE는 REVIEW 주문과 명시 null afterSalesDecisionRef,ACCEPTED_AFTERSALES_CHANGE는 ACCEPTED 주문과 확인된 U7 원본을 요구한다. 공통 고객 동의/새 조건/expectedRevision/고정 TargetScope의 전제를 모두 대조한다.
5. 연계된 고객/직원 호출·진단/결과·지속 사실의 버전을 일치시키고 기존 v1과의 불일치를 계약 검사로 확인한다. 원래 승인 inception v1은 과거 원본으로 보존한다.
6. 계약 변경의 실제 적용·호환·검증 증거를 확보한 후에만 해당 코드/연결 준비 완료를 판정한다. 명세 문서 존재는 이 완료 근거가 아니다.

## 첫 배포 검사와 후속 구분

첫 배포는 U3가 지원하는 권한·승인·원래 조건·금액·상태·중복·동시 변경·조건/신뢰 근거의 단위/통합·계약 검증을 포함한다. 전체 커버리지/필수 보안 검사 요구를 완화하지 않으며, 대량100k/50분·과거 부하 시간 하한 FAIL 재실행·재해 복구·무중단·장기간1인 운영 실증을 작은 변경마다 새로 실행하지 않는다.

성능/규모·가용성/복구·점검·운영 알림 목표는 [security-requirements.md](security-requirements.md)의 NFR2/3/4/6/7/8/10 파생 ID와 첫 배포 계획에 연결한다. 실제 provider/국내 저장/회사망/동일인/합의 근거·데이터 분류/보관/삭제와 외부 원본이 미확인이면 그 실데이터·실거래/배포 경로는 준비 완료로 표시하지 않는다. 명세의 책임 경계는 실제 운영/연동 증거를 대체하지 않는다.

## Sources

- [확인한 기준](nfr-requirements-questions.md): 추천안 적용과 기존 결정 재사용.
- [U3 기능 명세](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md): 소유자·동시성·불변 조건·v2 변경.
- [상위 요구사항](../../../inception/requirements-analysis/requirements.md): NFR9/13/14와 운영 목표.
- [첫 배포 실행 계획](../../../release-planning/first-release-delivery-plan.md): 파일럿 범위/검증 분리.
- [공통 계약](../../../inception/contract-design/contract-summary.md): C00/C03–C05·기존 공유 계약.
- [기존 기술/세션 답변](../../u1-integrated-foundation/nfr-requirements/nfr-requirements-questions.md), [기존 후속 기술 적용](../../u2-identity-enterprise-access/nfr-requirements/nfr-requirements-questions.md): 실제 과거 선택을 확인하는 경로.
