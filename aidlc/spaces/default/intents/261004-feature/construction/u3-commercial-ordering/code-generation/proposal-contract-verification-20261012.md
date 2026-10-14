# U3 제안 입력·조건 계산 부분 검증

## 범위

Step 11–12의 작은 계약/계산 계층이다. U3 전용 ProposalInput·ConsentInput·ProposalQuery·ProposalView에 고정 TargetScope·정확 원본 참조·인라인 새 조건·명시 supersedesRef·화면 조건 fingerprint를 연결한다. 원래 구매 스냅샷과 제안 비용을 분리하고 내용 proposalRevision과 상태 row revision을 구분한다. 새 조건 서비스/가짜 Ref 엔티티를 추가하지 않는다.

원 단위 단가×수량·소계·확인된 비용/할인 및 포함 위치를 검증한다. UNKNOWN/null과 확인한 0원은 다르며, 포함된 비용을 중복 가산하지 않는다. 이것은 입력의 형식·산술 검사이고 현재 원본·직원 확인·근거의 실제 신뢰 검증을 대신하지 않는다. 실제 제안 저장·동의 기록·U6 수동 갱신 포트는 아직 구현하지 않았으며 두 단계는 미완료다.

## 최초 검사와 보완

HEAD `a7eda64a268570e8ae53f90f40e0d7440f4ab615`, digest `66f41b4a1b24ed3ba1759c34da240338ee488081839761652e72a5ea3765d8c6`에서 소스를 고정하고 Luna가 실행했다. 시작/종료 identity는 일치했다. U3 단위 229개 및 구형 U1 계약 15개는 통과했고 lint는 종료 코드 0이었다. TypeScript는 proposal-terms.spec.ts:233의 fixture currency가 string으로 추론되어 KRW literal과 맞지 않는 오류로 종료 코드 2였다. 보고서는 `.reports/u3/proposal-contract-unit-20261012.json`, `proposal-contract-legacy-unit-20261012.json`에 보존한다.

fixture를 명시 타입으로 정합화했다. 기존 SchemaValidator의 OrderPriceBreakdown KNOWN 의미 검사도 이미 null 행/소계를 거절하고 있었으므로 기존 버그였다고 주장하지 않는다. helper의 명시 조건과 실제 등록 스키마의 KNOWN/UNKNOWN/0원 경계 회귀를 보완했다.

계산 helper의 Number.MAX_SAFE_INTEGER 금액 상한에는 확인된 근거가 없었다. 실제 Money는 KRW 비음수 정수 문자열과 maxLength 4096이며 Number 수량/개정의 표현 한도와 구분된다. BigInt 결과를 기존 Money 표현 및 비음수 조건으로 검증하도록 정합화하고, 2^53 초과 금액·허용 수량의 정확 계산·4096자리 정상/4097자리 결과 거절 시험을 작성했다. 기존 선언된 형식/범위/예산을 완화한 것이 아니다. 수정 후 결과는 별도로 기록한다.

## 수정 후 통과

Luna 시작/종료 source identity는 HEAD `a7eda64a268570e8ae53f90f40e0d7440f4ab615`, digest `5a7b3195428b64f6ec6402ec1bc83b5782e2a67399e057f862414bb979618d40`로 일치했다. TypeScript 및 변경 helper/시험 lint는 종료 코드 0이고 U3 단위 232개는 모두 통과했다. 원본 `.reports/u3/proposal-contract-money-fixed-unit-20261012.json`의 success:true, 실패·pending 0을 root가 확인했다. 앞서 구형 계약 15개도 success:true였고 이후 변경은 새 helper/시험만이므로 구형·통합 검사를 이유 없이 반복하지 않았다. DB/runtime 변경이나 실제 원본 확인을 수행한 결과가 아니다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts --outputFile=.reports/u3/proposal-contract-money-fixed-unit-20261012.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/core/src/proposal-terms.ts tests/u3/unit/proposal-terms.spec.ts
```

제안 계약·계산 구간은 통과했다. 실제 제안 저장·현재 원본 검증·고객 동의·수동 갱신 서비스는 여전히 남아 있으므로 Step 11–12를 완료로 표시하지 않는다. 전체 제품 coverage·실제 운영 준비·전체 U3 완료를 주장하지 않는다.
