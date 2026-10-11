# U3 호스트 연결 검증

## 첫 연결 계층과 미완료 범위

기준 커밋은 434b30af72f9ac2a14652c3e55f14936b51e0006이다. apps/api/src/u3-operations.ts의 명시 서버 구성을 통해 현재 구현한 업무 23개와 별도 C01 grant 2개/C18 read·lookup·probe 3개를 연결한다. U3 활성 구성의 구형 상업 mutation은 차단하며 U3를 선택하지 않은 기존 호스트는 보존한다. 명시 업무 등록 31개 중 미구현 조회 8개는 MODULE_NOT_REGISTERED로 실패한다. 임시 빈 출력이나 운영 원본 생산자로 표시하지 않는다.

WorkInquiry는 실제 보호된 접수의 sourceContract에 맞는 현재 명시 action과 새 Receipt 계약을 사용한다. 현재 기업/권한·fence 전후 및 정확 접수 원상 대조를 유지하며 ScopeV2 참조를 닫힌 U3 응답으로 반환한다. 구형 URI를 덮어쓰지 않고 현재 C18 소비자 계약을 별도로 연결한다. 실제 역할 생성/목록·원래 접수·grant/revoke·MFA·다른 요청자·직원망·구형 상업 경로 차단 통합 4개와 소비자 계약 단위 2개를 작성했다.

미구현 보호 조회 8개, 실제 HTTP parser/라우트·세션의 확인된 사람 참조 연결, worker 소비 연결은 남아 있다. 이 첫 연결 계층으로 Step15–16 전체나 실제 운영 등록을 완료했다고 주장하지 않는다.

## 첫 연결 검사

Luna의 고정 Node 22.23.3 TypeScript와 지정 ESLint는 종료 코드 0이다. in-process-host-unit-20261012.json은 258/258 PASS, in-process-host-integration-20261012.json은 4/4 PASS다. 실패/pending/todo 0·success=true이며 미처리 오류 0을 확인했다. 검사 전후 source/runtime 지문은 6eebe859012042598d1996cdbdc6af83ec95e466fc37369a5d1420207241b971로 동일했다. HEAD는 위 기준과 같고 아래 7개 파일 SHA도 전후 동일했다.

| 파일 | SHA-256 |
| --- | --- |
| apps/api/src/u3-operations.ts | 6c90a85f304b6ac12a16cf79b0f4c87d081e1bb6b16c581e1bd8034854686b22 |
| apps/api/src/operations.ts | 6c2ab905b8748a0b84ecd66107b68578abe2977b9a3bccc5391e153720b0aa26 |
| packages/core/src/work-inquiry.ts | cebdad4e259dc662efcf0b694d3e4104cb08524a9f0ff23407798194ee00f367 |
| packages/contracts/src/u3-declarations.ts | 79ec724af0d2f90d4ba3aa942a2c93024565a744daa456c0ea5a8d05bc96977f |
| packages/contracts/schemas/u3-commercial-v2.json | a59a193ec0dc8a361c87adf621e644015adc9bd0a68f2bff5fe9ad11452c2884 |
| tests/u3/unit/host-contracts.spec.ts | 8955653208c46fb5d566d6d255e6e054a930c3d01ae717239b5336f4686286ed |
| tests/u3/integration/in-process-host.spec.ts | 3b1139bb15431f41d5b5d9d57f7ceccbbc2e629141d2476799f4a3c6549a8501 |

## 기존 호스트 영향 회귀

U1 contract-bindings/http-boundaries의 24/24와 U2 http-access의 10/10이 통과했다. 두 npm 명령은 소유된 격리 검증 DB 준비를 거쳐 종료 코드 0을 반환했다. root가 in-process-host-u1-regression-20261012.json과 in-process-host-u2-regression-20261012.json의 실제 count·success를 확인했다. 실패/pending/todo 0·success=true이며 검사 전후 source/runtime 지문·HEAD와 선택 7개 SHA는 위 첫 연결 검사와 동일했다. 대량 부하·전체 DR·실제 AWS 배포는 실행하지 않는다.
