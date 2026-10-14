# U3 제안 저장·정확 동의 검증

## 구현 경계

기준 커밋은 ca50c50ecd19ac679faf35cd1711c31d443bc29f이며, 검증 시작 제품 소스 지문은 83716dac85ddf9f2a42a3a96134567291ef0ad8cce5705b0aade3234a445e324이다. 구현자는 소스를 고정했고 단순 검사는 Luna에 위임했다. 이 기록은 U3 전체 완료·CI 통과·실배포 증거가 아니다.

CommercialProposal의 생성·조회·정확한 고객 동의/거절과 기존 보호 저장을 연결했다. 제안 내용 개정과 저장 상태 개정을 구분하고, 최초 생성의 보호 이력·접수 결과에서 제안자를 확인하여 현재 사람·합의 근거를 동의 전후 재검증한다. 동의는 실제 contract.consent 역할과 별도 grant를 사용한다. 제안/동의 자체가 주문 조건 적용이나 SW 기간 변경을 수행하지 않는다.

originalPriceBreakdown·termsFingerprint·supersedesRef를 기존 모델의 선택 nullable 필드로 확장했다. 과거 미상 자료는 추정 보충하지 않고 새 동의 대상에서 차단한다. U6 조회는 정확한 기업·권한·회차·목적·소유자·보호 세대·요청 지문 및 유한 기한을 대조하며, 생산자 미등록은 기본 차단한다.

## 실행 결과

Node 22.23.3 및 기존 격리 U3 DB를 사용한다. 다른 DB 초기화·AWS 배포·대량 부하·전체 재해 복구 검증은 수행하지 않는다. 실제 실행 명령과 비민감 결과를 아래에 기록하며, 실패 원문 보고서는 삭제하거나 덮어쓰지 않는다.

- 첫 검사 진행 중: TypeScript 종료 코드 0, U3 단위 시험 237/237 PASS다. 신규 통합 시험은 공통 fixture 준비에서 12/12 FAIL이며 업무 경로는 실행되지 않았다. 두 JSON의 실제 count/success 값을 root가 확인했다. 기존 회귀 시험 및 종료 소스 동일성은 아직 확인 전이다.
- 원인: 서비스와 fixture가 등록 Order2에 없는 acceptance/currentTermsRef를 사용했다. 실제 등록 계약은 state(REVIEW/ACCEPTED/REJECTED)와 changeApplicationRefs다. validateModel 차단을 유지하고 서비스·fixture를 등록 계약에 맞추는 수정이 필요하다. 실패 보고서 proposal-service-integration-20261012.json은 보존한다.
- 첫 검사의 종료 source identity는 시작과 동일하다. 기존 계약 등록/승인·소유자·변경 요청 통합 시험 27/27 PASS, migration·고객 동의 권한 시험 21/21 PASS, 변경 파일 ESLint 종료 코드 0이다. root가 두 회귀 JSON의 실제 count/success를 확인했다. 이 결과는 실패한 제안 통합 시험을 대신하지 않는다.
- Order2 정합 수정 검사: source 지문 d289e69cc2c6d54d030237b53d7127ad4eaee2ff9631931f4c7741c52b60a043이며 시작/종료가 동일하다. 서비스·fixture·시험을 실제 state/changeApplicationRefs에 맞췄고 모델 검증을 완화하지 않았다. TypeScript/선택 ESLint 종료 코드 0, 단위 237/237 PASS다. 통합 12/12 FAIL은 공통 fixture의 주문 쓰기 commit에서 u1_order 외래 키 위반으로 발생했다. root가 새 unit/integration JSON의 count/success를 확인했으며 실패 원문은 proposal-service-order-aligned-integration-20261012.json에 보존한다. 필요한 실제 등록 참조 행을 로컬 합성 fixture 안에 갖추는 수정이 필요하다. 계약/모델 회귀 코드는 바뀌지 않아 앞서 통과한 27/21 시험을 반복하지 않았다.
- Fixture 그래프 수정 검사: 누락된 외래 키는 u1_order.provisionChoiceRefKey(FK_5ecc62a76de2bfaea2fb87313bc)였다. 실제 등록 OrderLine/ProvisionChoice/Order/PurchaseTermsSnapshot을 같은 보호 후보로 연결했으며 nullable acceptanceRef/consentRef는 null로 유지했다. TypeScript/fixture ESLint 종료 코드 0, 통합은 12개 중 1 PASS·11 FAIL이다. 외래 키 setup 실패는 해소됐으나 제안 조회·동의의 현재 원본 대조가 실패해 업무 검증은 아직 완료되지 않았다. 실패 원문 proposal-service-graph-aligned-integration-20261012.json을 보존하고 root가 실제 count/success를 확인했다.
- 마지막 실행의 제품/source 지문은 d289e69cc2c6d54d030237b53d7127ad4eaee2ff9631931f4c7741c52b60a043으로 시작/종료가 같았다. 이 지문은 시험 파일 동일성 증거를 대신하지 않는다. 실행 후 fixture SHA-256은 c6b43e2a52808cade6d160b36605677344644ea5e539de90a3b6ad9e201418f3, spec SHA-256은 1ef174637bb6734a64efdfaed123796ecf8714e24a7a7b137aeeed3e88c1ff2d이다. 시험 파일의 실행 전 지문은 이 실행에서 별도로 수집하지 않았다.
- 보호 null 표현 수정 검사: 정확한 scope.current의 primary/protected 대조·현재 전제 등록 뒤 같은 Ref의 보호 원상으로 제안 완전성/fingerprint를 검증한다. 공유 decoder·비교 정규화와 과거 원상 bytes는 바꾸지 않았다. 제품/source 지문 5b06b243edd16919c36a2abdff99ec02b91ba05981a00c566c5082ff11905c7a 및 지정 제품/fixture/spec의 개별 SHA-256은 실행 전후 같았다. TypeScript/선택 ESLint 종료 코드 0, 통합 12개 중 7 PASS·5 FAIL이며 root가 실제 JSON count/success를 확인했다. 보고서는 proposal-service-protected-null-integration-20261012.json이다. 남은 실패는 생성 이력 collection의 정확한 보호 개정 참조 및 후단 권한 원본 불일치 시험의 판정에 있으며 아직 제안 통합 전체 PASS가 아니다.
- U3 개정 참조 수정 검사: 구형 ref() 의미를 유지하고 실제 등록 U3 model2·전체 모델·SourceContract(지원 모델)·실제 저장 개정 필드와 닫힌 Ref를 검증하는 u3Ref를 추가했다. sourceRevision2 이력의 실제 보호 row/접수 결과 Ref2와 collection Ref를 일치시켰다. creator 필터로 오류를 숨기거나 정확한 currentness 차단을 완화하지 않았다. 미보호 다른 소유 역할을 같은 후보 안에서 직접 쓰는 시험은 CURRENT_AUTH_NOT_PROTECTED 차단으로 정확히 표기하고 전체 rollback을 검증한다. 별도의 실제 보호된 역할 비활성화→ACTION_DENIED 시험은 유지했다.
- 위 검사의 제품/source 지문은 51511f7f6ed1d0906782d6f62cd4591babccab71d26c9ad4a5f5908f84302551으로 시작/종료가 같았다. 단위 239/239·제안 통합 12/12·영향 계약 회귀 27/27 PASS, 변경 파일 ESLint 종료 코드 0이다. root가 세 JSON의 실제 count/success를 확인했다. 보고서는 proposal-service-versioned-ref-{unit,integration,agreement-regression}-20261012.json이다. TypeScript는 신규 references.spec.ts:16의 fixture 반환 타입이 historyId를 드러내지 않아 종료 코드 2이며, 실행 값/판정을 바꾸지 않는 타입 선언 수정과 재확인이 남았다. 관련 코드가 바뀌지 않은 migration/권한 21개 검사는 반복하지 않았다.
- 최종 타입 전용 수정: references.spec.ts에 import type ModelData 및 history: ModelData 선언만 추가했다. 실행 표현·데이터·검증식·제품 소스는 그대로다. TypeScript와 해당 파일 ESLint 종료 코드 0을 확인했다. 제품 지문 51511f7f6ed1d0906782d6f62cd4591babccab71d26c9ad4a5f5908f84302551 및 해당 시험 SHA-256 2a08048e84639ae9e1419b3b2a4334dc44957f24c7f925ec71c3016fb5bb83d3은 재확인 실행 전후 같았다. 직전 여섯 지정 제품/시험 파일 SHA-256도 그 검증 전후 동일하게 수집됐음을 Luna가 확인했다. 타입 선언만 바뀐 실행 시험은 불필요하게 반복하지 않았고, 앞선 PASS 및 실패 보고서를 모두 보존했다.

## 현재 변경 검증 판정

이번 제안·동의 서비스 변경은 아래 범위의 검증을 통과했다. 모든 실행은 고정 Node PATH를 사용했고 통합 시험에는 OMS_U3_DATABASE_PROFILE=verification-isolated를 지정했다. 첫 실패부터 실제 원인별 수정·재검증을 보존했으며 전체 U3 완료/전체 커버리지/병합 CI의 판정은 별도다.

| 검사 | 실제 명령 / 대상 | 결과 |
| --- | --- | --- |
| 타입 | npx --no-install tsc --noEmit | 최종 0 |
| U3 단위 | npx --no-install vitest run --config tests/u3/vitest.unit.config.ts | 239/239 PASS |
| 제안·동의 통합 | npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/commercial-proposal.spec.ts | 12/12 PASS |
| 영향 계약 회귀 | 같은 integration config의 commercial-agreement.spec.ts·commercial-owner-port.spec.ts·commercial-change-request.spec.ts | 27/27 PASS |
| 모델·권한 회귀 | 같은 integration config의 migration-compatibility.spec.ts·customer-consent-authority.spec.ts | 앞선 영향 변경 검사에서 21/21 PASS; 이후 해당 owning 코드/DDL 변경 없음 |
| 린트·변경 확인 | 변경 파일별 ESLint, 제품/시험/본 문서 git diff --check | 최종 0 |

## 남은 연결과 판정

Step 11–12는 미완료로 유지한다. 현재 주문 대상은 최초 불변 구매 스냅샷 경계이며, 첫 조건 적용 후 등록 changeApplicationRefs와 정확한 보호 OrderChangeApplication에서 후속 제안으로 이어지는 실제 생산자 연결은 Step 13의 의존 작업이다. 테스트 주문 생산자·U6 콜백·사업 근거는 로컬 합성 자료이고 실제 U6 운영 생산자 등록 또는 운영 검증을 뜻하지 않는다. U7 소유 이행 판단과 주문 적용·실제 이용기간 변경은 이 변경의 완료 증거에 포함하지 않는다.
