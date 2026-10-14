# U3 계약 계층 검증

승인 계획 Step 2–4 구현 후 Luna가 검사했다. Source를 검사 중 변경하지 않았다. 검사 대상은 전용 runner/합성 fixture와 U3 profile revision 2 / registry version 3, 닫힌 입력·응답 및 의미 검증이다. 저장·보호 접수·현재 권한·실제 HTTP/worker binding은 후속 구현 대상이다.

## 소스와 환경

- 검사 시 HEAD: `e41b400bf4239d0da413e4f98a245ced416fcaf2`
- 변경 중인 제품 소스를 포함한 runtimeSourceIdentity digest: `a839fc87db536cc15623d1368bbd78fe56612d7fd2fa0a3f1869074ccf04dcec`
- 기존 Node `v22.23.3`, npm `10.9.9`; 의존성 설치·업그레이드 없음.
- 신규/수정한 22개 제품·시험·설정 파일에 대한 개발자의 Prettier 포맷 종료 코드 0. 타입·lint·시험 실행은 아래 실제 Luna 결과로 구분한다.

## 결과

| 검사 | 종료 코드 | 결과 | 로컬 보고서 |
| --- | --- | --- | --- |
| 현재 U3 단위 전체 | 0 | 2개 파일 / 52개 통과 / skip 0 | `.reports/u3/unit.json` |
| TypeScript noEmit | 0 | 진단 없음 | 콘솔 종료 결과 |
| 지정 ESLint | 0 | 진단 없음 | 콘솔 종료 결과 |
| 로컬 U3 DB 준비 | 0 | 전용 합성 DB/역할 생성; 다른 DB 초기화 없음 | 콘솔 종료 결과 |
| U1 계약 영향 단위 | 0 | 3개 파일 / 31개 통과 / skip 0 | `.reports/u3/contracts-u1-regression.json` |
| U2 계약 영향 단위 | 0 | 2개 파일 / 20개 통과 / skip 0 | `.reports/u3/contracts-u2-regression.json` |

시험 합계 103개 통과. 기존 common:1/:2 의미 보존과 신규 profile 등록, 잘못된 입력·응답 거절을 검증했다. 합성 DB 준비는 DDL migration/grant, 실제 업무 저장 또는 운영 DB 검증이 아니다.

## 실행 명령

아래 여섯 명령을 순차 실행했다. 실패 반복, 도구 설치, 실제 AWS 호출, 런타임 정리 또는 source 수정은 하지 않았다.

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install vitest run --config tests/u3/vitest.unit.config.ts
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install tsc --noEmit
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npx --no-install eslint packages/contracts/src/u3-declarations.ts packages/contracts/src/u3-types.ts packages/contracts/src/u3-validation.ts packages/contracts/src/schema.ts packages/contracts/src/registry.ts packages/contracts/src/index.ts tests/u3 scripts/u3
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH node --import tsx scripts/u3/prepare-test-databases.ts
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npm run test:u1:unit -- tests/u1/unit/contracts.spec.ts tests/u1/unit/inline-schema.spec.ts tests/u1/unit/http.spec.ts --outputFile .reports/u3/contracts-u1-regression.json
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npm run test:u2:unit -- tests/u2/unit/contracts.spec.ts tests/u2/unit/http-contracts.spec.ts --outputFile .reports/u3/contracts-u2-regression.json
```

## 증거 범위와 남은 의무

- 0/1/100/101행, 원 단위 금액/수량/기간/대상, 조건과 계약 개정 합집합, 명시 null과 U7 참조의 변경 분기 및 producer 오류를 계약 계층에서 검사했다.
- schema 통과는 실제 근거의 신뢰·현재성·다른 사람 승인 또는 계약 적용 성공을 뜻하지 않는다. 미확인 선행 사실은 후속 업무 계층에서 적용 차단/HOLD로 유지한다.
- HTTP의 서버 측 version 3 선택과 구형 mutation 우회 차단, 저장/복구 호환, primary 원자 기록·별도 보호 ACK 및 작업 전달은 아직 검증하지 않았다.
- 전체 제품 커버리지 80%, 공식 Construction 체크포인트, U3 전체 완료 또는 기존 U2 Major 해결로 사용하지 않는다. 장시간 부하·재해 복구·실제 배포도 실행하지 않았다.
