# U3 고객 동의 권한 생성 경로 보완

## 확인한 구현 공백

CommercialAgreement.recordConsent의 registry3 action은 null이며 U3Commands의 고객 명시 행위는 product.read/order.submit/order.read/contract.change.request뿐이었다. 기존 ActionScope/ScopeV2 및 C01 역할 등록·개정은 별도의 고객 동의 권한 원본을 생성하지 않는다. 모의 owner 포트를 만들거나 기본 미등록으로 차단하는 것만으로 승인된 현재 동의 권한·호스트 연결을 완료할 수 없다. 실제 producer의 구현 부재와 운영자가 실제 역할/근거를 아직 등록하지 않은 상태를 구분한다.

## 보완 방향

승인 계획의 현재 권한·U3 호스트 연결을 구현하기 위해 EnterpriseAccess가 소유한 기존 역할/범위/부여·보호 원본 경로에 최소한의 명시 버전 확장을 연결한다. 동의 행위는 별도로 닫힌 값으로 등록하며 기존 조회/주문/변경 요청 권한을 자동 승격하지 않는다. 구형 schema URI·권한 의미·원본 bytes를 보존하고 신규 버전/source contract가 명시된 원본만 현재 decoder와 등록 명령에서 사용한다. 기존 역할/부여에는 동의 권한을 추정하거나 자동 추가하지 않는다.

현재 기업·회원 관계·MFA·역할/부여·조직·제안 대상/개정과 내용·근거의 확인은 유지하며 변경 전후를 검증한다. 새 인프라나 별도 권한 시스템을 추가하지 않는다. 실제 source 모델/operation·migration 영향과 검사 결과는 구현 후 기록한다. 현재 이 보완과 제안/동의/수동 갱신은 미완료다.

## 완료 주장 제한

최소 지원 확장의 범위는 CustomerRole2·동의 전용 ScopeV2 model2와 기존 StaffRole2·RoleRevisionState2의 네 지원 정의다. U3 업무 엔티티 18개는 유지한다. CustomerRole·ScopeV2의 기존 테이블 각각에 modelVersion/sourceContract expand 컬럼을 명시하고 신규 물리 테이블을 추가하지 않는다. C01 registry3 define/revise/deactivate/readCustomerRole(s) 및 실제 현재 grant/revoke가 신규 권한 원본을 생산하도록 연결한다. RoleRevisionState2의 고객 분기는 CustomerRole2 및 동일 SourceContract를 요구하며 구형 role1·predicate1에 동의 의미를 부여하지 않는다. 현재 저장된 명시 버전으로만 술어 검증기를 선택하고 보호/historical decoder의 해당 버전을 함께 구현한다. 아직 구현·검증 전 범위이며 실제 결과는 이후 기록한다.

생성 가능한 실제 등록 경로·현재 권한 검사·폐쇄 producer DTO·거절/회수 회귀를 구현·검증한 뒤 호스트에서 연결한다. 운영용 고객 역할·범위·근거 생성 및 실제 설정은 별도의 출시 선행조건이다. 이 보완은 기존 U2 미해결 신뢰 문제 전체의 해결을 뜻하지 않는다. U3 전체 완료나 배포 가능을 미리 주장하지 않는다.

## 최초 검사 결과

제품·시험 소스를 고정한 뒤 Luna가 실행했다. 시작/종료 source identity는 HEAD `8fdeda38c3cfb2cd810ba07e42128998653c6043`, digest `36fc3aea40946ff977c9169281b4b66ed37c27671ff28cbe42b013531cde0da4`로 일치했다. root가 원본 JSON 집계를 확인했다.

| 검사 | 종료 코드 | 실제 결과 |
| --- | --- | --- |
| TypeScript noEmit | 2 | customer-consent-authority.spec.ts:172에서 존재하지 않는 EnterpriseQuery.read 사용 |
| 전체 U3 단위 | 1 | 202개 중 201개 통과 / 1개 실패 / pending 0; `.reports/u3/consent-authority-producer-unit.json` |
| 동의 권한·직원 역할·migration 통합 | 1 | 초기화 실패로 실행 0개 / pending 27개; `.reports/u3/consent-authority-producer-integration.json` |
| 지정 ESLint | 0 | 진단 없음 |

단위 실패는 신규 C01 명령 4개 등록 후 실제 operation 수가 31개인데 기존 검사에 27개가 남아 있던 것이다. 실제 추가 등록 및 폐쇄/unknown 검사의 의미를 보존해 정합화한다. 통합은 migrateMaterialModels의 원본 삭제 DDL 거절로 초기화에서 멈췄다. 이를 테스트 통과·동의 권한 사용 가능으로 해석하지 않는다.

정적 조사에서 ScopeV2.action의 새 논리 타입 U3Contract:ConsentAction이 기존 CustomerAction의 varchar 매핑 대신 기본 jsonb로 떨어지는 것을 확인했다. 실제 생성 DDL을 안전하게 대조해 원인인지 확인한 뒤 기존 물리 scalar 타입을 보존하는 최소 수정을 진행한다. 원본 삭제 거절을 완화하거나 컬럼을 삭제·재생성하지 않는다. 구형 action 값/원본과 반복 migration 보존 회귀를 함께 검증한다. 이전 실패 보고서는 유지한다.

개발자가 읽기 전용 schema-builder log로 원인을 확인했다. u1_scope_v2의 action에 DROP COLUMN 후 jsonb ADD를 생성했으며 해당 SQL은 실행하지 않았다. 폐쇄 문자열 ConsentAction의 물리 varchar4096 매핑을 명시하여 기존 컬럼과 저장값을 보존한다. 조회 시험은 실제 U2AccessDirectory.read로 연결하고, 등록 closure는 신규 C01 producer 네 개의 정확한 이름·행위·입력 및 전체 31개를 확인하도록 보완한다. 수정 후 검사는 별도 보고서로 기록한다.

## 물리 타입 수정 후 검사

Luna의 시작/종료 source identity는 HEAD `8fdeda38c3cfb2cd810ba07e42128998653c6043`, digest `7e5e19bea14eb146081e99c640a1826a228a3027ff0114d4cbff73184d9aa84a`로 일치했다. 타입·lint는 종료 코드 0, U3 단위는 203개 모두 통과했다. 통합은 28개 중 22개 통과/6개 실패/pending 0이며 원본 JSON 집계를 root가 확인했다. 보고서는 `.reports/u3/consent-authority-physical-fixed-unit.json`, `consent-authority-physical-fixed-integration.json`이다.

기존 ScopeV2 원본·보호 bytes·varchar4096 및 반복 expand migration을 포함한 migration 11개와 직원 역할 10개는 통과했다. 동의 권한 통합은 1개 통과/6개 실패다. 새 역할 생산의 응답에서 기존 Commands.receipt가 common:2 Receipt로만 검증하는 경계에서 INVALID_INPUT이 발생했다. 새 resultRefs의 ScopeV2와 U3의 실제 등록 출력 schema를 대조하여 정확한 실패 필드를 확인한다. 알려진 보호 sourceContract에 따른 새 출력 선택으로 보완하고 구형 Ref/Receipt의 닫힌 의미를 유지한다. 원본 보호 commit 이후의 응답 오류와 재전송이 추가 역할·이력을 만들지 않는 것도 확인한다. 아직 실제 동의 역할 전체 흐름의 통과를 주장하지 않는다.

## 응답 수정 및 영향 회귀

U3 Receipt가 common:2의 alias였으므로 새 profile 안에서만 같은 폐쇄 필드·null·시간·배열 의미를 유지하고 Ref를 등록 U3 union으로 연결했다. Commands.receipt는 보호 원본의 검증된 기록 sourceContract가 KNOWN profile2/registry3일 때 새 출력을 선택하고 미기록/null은 구형 의미를 유지한다. 요청의 marker로 출력 버전을 선택하지 않는다. 보호 후 응답 유실과 같은 요청의 원래 결과 재사용 시험을 추가했다.

HEAD `8fdeda38c3cfb2cd810ba07e42128998653c6043`, digest `50097a2e88d594c917fb0afe55715514047d9352474d0b5c63cca62fec562d58`에서 쓰기를 중지하고 Luna가 실행했다. 시작/종료 identity가 일치했고 root가 원본 JSON 집계를 확인했다.

| 검사 | 종료 코드 | 실제 결과 / `.reports/u3/` 보고서 |
| --- | --- | --- |
| TypeScript·지정 lint | 0 | 진단 없음 |
| 전체 U3 단위 | 0 | 211개 통과 / pending 0; `consent-authority-receipt-fixed-unit.json` |
| 동의 권한·직원 역할·migration 통합 | 0 | 29개 통과 / pending 0; `consent-authority-receipt-fixed-integration.json` |
| U1 선택 단위 회귀 | 0 | 45개 통과; `consent-authority-u1-unit-regression.json` |
| U2 선택 단위 회귀 | 0 | 70개 통과; `consent-authority-u2-unit-regression.json` |
| U1 선택 통합 회귀 | 0 | 84개 통과; `consent-authority-u1-integration-regression.json` |
| U2 선택 통합 회귀 | 1 | 53개 통과 / 2개 실패 / pending 0; `consent-authority-u2-integration-regression.json` |

U2의 information-projection과 membership-role-race에서 기존 역할 개정/비활성화의 현재 권한 대조가 실패했다. 신규 currentRoleState 고객 분기에 추가된 role lookup이 거래 안의 정상 after-image를 이전 보호 원본과 대조하는지 정확한 변경 필드/개정만 조사한다. 구형 model1 흐름의 의미와 신규 model2/source 일치·외부 변조 거절을 모두 보존하여 수정·회귀한다. 현재 이 지원 계층은 영향 회귀가 실패하므로 완료나 커밋 준비로 표시하지 않는다. 기존 U2의 별도 미해결 신뢰 문제와 이번 변경의 회귀를 혼동하지 않는다.

## 등록된 자체 역할 쓰기 대조 수정

두 실패는 정상 CustomerRole model1의 tx.put revision +1 뒤 기존 술어를 읽는 순서에서 발생했다. 새 lookup이 해당 거래의 등록 after-image를 이전 보호 before-image와 비교하던 회귀였다. 고객 역할의 정확한 등록 transaction row·실제 tx.get 전체 일치, 원래 보호 원상 존재, 단일 revision 증가, 모델/version/source·기업/ID 보존을 확인한 자체 쓰기만 허용하도록 수정했다. 직원 경로 및 자체 row 없는 strict lookup·외부 primary 변조 거절은 유지한다. 새 역할을 원래 보호 원상 없이 권위로 추정하지 않는다.

HEAD `8fdeda38c3cfb2cd810ba07e42128998653c6043`, digest `4576dd86e2b6cfedfe416d3e4eb95f28c97188a23309c71e86c8aef943e96bd5`에서 쓰기를 중지하고 Luna가 실행했다. 시작/종료 identity가 일치했고 root가 세 JSON의 집계를 확인했다.

| 검사 | 종료 코드 | 실제 결과 / `.reports/u3/` 보고서 |
| --- | --- | --- |
| TypeScript·변경 파일 lint | 0 | 진단 없음 |
| 전체 U3 단위 | 0 | 220개 통과; `consent-authority-own-write-fixed-unit.json` |
| 실제 고객 동의 역할 통합 | 0 | 10개 통과; `consent-authority-own-write-fixed-integration.json` |
| 기존 U2 실패 두 파일 회귀 | 0 | 23개 통과; `consent-authority-own-write-u2-failures-fixed.json` |

세 JSON 모두 success:true, 실패·pending 0이다. 실제 고객에게 별도로 부여된 동의 역할의 개정에서 상태 저장 후 고의 실패의 role/scope/receipt/fence rollback, 같은 입력의 정상 재시도, 비활성화와 기존 관리 권위 보존을 확인했다. 구형 역할의 직접 개정·비활성화·현재 조회 및 자체 쓰기 거절 경계도 포함한다. 같은 현재 소스로 남은 U1/U2 영향 회귀를 이어가며, 그 결과 전에는 지원 계층 전체 검증 완료를 주장하지 않는다.

## 현재 소스의 영향 회귀 통과

동일 HEAD 및 digest `4576dd86e2b6cfedfe416d3e4eb95f28c97188a23309c71e86c8aef943e96bd5`에서 추가 쓰기 없이 Luna가 남은 영향 회귀를 실행했다. 시작/종료 identity가 일치했고 root가 네 JSON의 실제 집계를 확인했다.

| 검사 | 종료 코드 | 실제 결과 / `.reports/u3/` 보고서 |
| --- | --- | --- |
| U1 선택 단위 회귀 | 0 | 45개 통과; `consent-authority-current-u1-unit-regression.json` |
| U2 선택 단위 회귀 | 0 | 70개 통과; `consent-authority-current-u2-unit-regression.json` |
| U1 선택 통합 회귀 | 0 | 84개 통과; `consent-authority-current-u1-integration-regression.json` |
| U2 나머지 선택 통합 회귀 | 0 | 32개 통과; `consent-authority-current-u2-integration-regression.json` |

네 JSON 모두 success:true, 실패·pending 0이다. U2의 앞서 수정한 두 파일 23개와 나머지 세 파일 32개가 같은 현재 소스에서 모두 통과했다. 타입/lint, U3 단위 220개 및 고객 동의 역할 통합 10개의 현재 소스 검사와 함께 이 지원 구현 구간을 커밋한다. 전체 제품 coverage·전체 U3 단계·실제 운영 설정의 완료를 주장하지 않는다. 제안·동의 기록·수동 갱신과 호스트 연결 및 나머지 승인 계획은 계속 남아 있으며 Step 11–12는 미완료다.

U3 신규 역할 목록은 profile/modelVersion/sourceContract와 viewKind=CONSENT_ROLES를 명시하는 동의 역할 전용 조회다. 구형 전체 역할/문맥 조회가 새 원본을 빈 역할로 표시하는 대신 새 조회 버전 필요를 명시한다. 실제 C01 registry3 호스트와 이후 UI 소비자는 이 계약 범위를 구분하여 연결해야 한다.

검사는 pinned Node 22.23.3에서 `npx --no-install`로 실행했다. U3는 tests/u3/vitest.unit.config.ts 및 verification-isolated 통합 config, U1/U2는 각 Unit의 config와 정확 선택 파일을 사용했으며 source/lock/image 전체 검증이나 장시간 부하·전체 재해 복구를 실행한 결과가 아니다. 실패 보고서는 교체하지 않았다.
