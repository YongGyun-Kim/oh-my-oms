# U3 고객 계약 변경 요청·승인 예외 부분 검증

## 구현 범위

승인 계획 Step 11–12의 다음 부분이다. 고객의 현재 계약·기업·고정 조직 문맥·행위 권한을 확인하고 ContractChangeRequest를 RECEIVED로 접수한다. 직원이 만든 새 계약 개정 및 다른 사람의 승인 결과를 요청의 UNDER_REVIEW/RESULT_RECORDED와 같은 보호 원자 기록에 연결한다. 요청 접수만으로 유효 조건을 바꾸지 않는다.

가격·공개 예외는 명시 APPROVED 개정의 정확한 내용·출처·유효 구간과 일치할 때만 기록한다. 현재 승인자 권한·다른 사람·근거를 다시 확인하며 입력만으로 승인을 만들지 않는다. 미래 승인과 현재 적용 가능한 조건을 구분한다. 새로운 인프라·구형 계약 변경·U2 전역 신뢰 문제의 해결은 포함하지 않는다.

U3 profile 내부의 폐쇄 고객 요청 입력에 contractRef·TargetScope를 연결하고 새 계약 등록의 선택적 changeRequestRef를 추가했다. 실제 registry3 DTO 정상 입력과 미등록 필드/owner/entity·소수 금액·잘못된 승인 종류의 거절을 시험한다.

## 검사 상태

HEAD `b77f12c`에서 제품·시험 7개 경로의 쓰기를 중지하고 Luna에 타입·전체 U3 단위·변경 요청/기존 계약/owner 포트 통합·지정 lint 검사를 맡겼다. 격리 U3 DB를 사용하며 실제 AWS 작업·전체 부하·재해 복구 검증은 수행하지 않는다. 실제 source digest와 결과는 검사 후 기록한다. 실패·미실행을 성공으로 표시하지 않는다.

제안·정확 고객 동의·수동 갱신 및 이후 단계가 남아 있으므로 Step 11–12는 미완료다. 이 기록은 부분 구현의 검사 기록이며 전체 U3 완료 또는 출시 준비 완료를 뜻하지 않는다.

## 최초 검사 결과

시작/종료 source identity는 HEAD `b77f12cf8ce5eb3b1bef73a8747bb63f0dcad87c`, digest `a83806cd3aa4a38fb44630dd8589e9b90fa6a4e9d2617a6cfb6ba8d7ba070be9`로 일치했다. 원본 JSON의 실제 집계도 root가 확인했다.

| 검사 | 종료 코드 | 실제 결과 |
| --- | --- | --- |
| TypeScript noEmit | 2 | commercial-change-input.spec.ts:130에서 string을 null로 추론된 fixture 필드에 할당한 TS2322 |
| 전체 U3 단위 | 0 | 14개 파일 / 191개 통과 / skip 0; `.reports/u3/agreement-change-exception-unit.json` |
| 변경 요청·계약·owner 포트 통합 | 1 | 3개 파일 / 21개 통과 / 2개 실패 / skip 0; `.reports/u3/agreement-change-exception-integration.json` |
| 지정 ESLint | 1 | commercial-terms.ts:99의 window에 prefer-const |

통합 실패 두 건은 승인된 예외의 현재 보호 원본 대조에서 발생했다. 승인으로 EnterpriseContract가 정상적으로 개정되었는데 AgreementRevision에 보존된 원래 contractRef를 현재 개정으로 읽으려 한 것이다. 정확한 과거 부모 참조와 현재 부모의 보호 전제를 구분해 검증하는 최소 수정을 진행한다. 저장된 원래 참조·보호 bytes를 덮어쓰거나 오래된 원본 거절을 완화하지 않는다. 제품 경계 회귀와 fixture 타입·lint를 보완한 뒤 새 보고서로 검사한다.

## 수정 후 통과 결과

Luna의 시작/종료 source identity는 HEAD `b77f12cf8ce5eb3b1bef73a8747bb63f0dcad87c`, digest `aab4bd7255e8a5a3705b9ded3245481978bbb1f415f06af4711fbcb50d7c83f8`로 일치했다. root가 두 JSON 보고서의 실제 집계를 확인했다.

| 검사 | 종료 코드 | 실제 결과 |
| --- | --- | --- |
| TypeScript noEmit | 0 | 진단 없음 |
| 전체 U3 단위 | 0 | 14개 파일 / 191개 통과 / skip 0; `.reports/u3/agreement-change-exception-parent-fixed-unit.json` |
| 변경 요청·계약·owner 포트 통합 | 0 | 3개 파일 / 27개 통과 / skip 0; `.reports/u3/agreement-change-exception-parent-fixed-integration.json` |
| 지정 ESLint | 0 | 진단 없음 |

통합은 변경 요청/예외 12개, 기존 계약 10개, owner 포트 5개다. 두 JSON 모두 success:true, 실패·pending 0이다. 과거 부모는 보호 개정으로 정확한 owner/id/revision/modelVersion을 확인하고, 현재 부모는 별도의 currentProtected와 current 대조로 고정한다. 원래 contractRef·보호 bytes를 수정하지 않는다. 정상 부모 1→2 전진을 허용하고 보호된 다른 기업 소속·위조 과거 개정·오래된 승인 개정·primary-only 현재 부모 변경을 거절하는 회귀가 통과했다. 이전 실패 보고서는 유지한다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/agreement-change-exception-parent-fixed-unit.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH OMS_U3_DATABASE_PROFILE=verification-isolated npx --no-install vitest run --config tests/u3/vitest.integration.config.ts tests/u3/integration/commercial-change-request.spec.ts tests/u3/integration/commercial-agreement.spec.ts tests/u3/integration/commercial-owner-port.spec.ts --outputFile=.reports/u3/agreement-change-exception-parent-fixed-integration.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/contracts/src/u3-types.ts packages/core/src/commercial-agreement.ts packages/core/src/commercial-terms.ts tests/u3/fixtures/agreement-input.ts tests/u3/unit/commercial-change-input.spec.ts tests/u3/integration/commercial-change-request.spec.ts
```

고객 요청·승인 예외 부분은 통과했다. 제안·동의·수동 갱신이 남아 있으므로 승인 계획 Step 11–12는 여전히 미완료이며 전체 제품 coverage·실제 운영 원본·U3 최종 완료를 주장하지 않는다.
