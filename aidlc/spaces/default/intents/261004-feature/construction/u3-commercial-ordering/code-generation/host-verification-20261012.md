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

## 보호 조회 8개 연결

첫 호스트 계층은 4f1d0ed로 커밋하고 origin/feat/u1-integrated-foundation에 push했다. 후속 계층에서 실제 계약 readAgreement/effectiveAgreement와 세 업무 소유자의 history/diagnostic 6개를 연결했다. U3OwnerQuery는 보호된 현재 참조·기업/조직/현재 권한 전후·현재 승인과 유효 구간/근거·이력 개정을 확인한다. 미래 또는 승인 미확인 효력은 UNKNOWN으로 표시한다. 제안·동의 참조는 보호된 자료와 현재 읽기 범위 안에서만 반환한다.

고정 TargetScope가 없던 기존 조회 입력을 U3 전용 닫힌 OwnerRecordQuery(targetRef,targetScope)로 보완했다. 실제 U3 참조를 반환하도록 조회 응답 alias도 정합화했다. 이는 현재 구현 과정의 계약 보완이며 이전 승인 wire에 이미 같은 필드가 있었다고 주장하지 않는다. 이전 공통 계약 1/2는 보존하며 현재 대상 범위를 기업 전체로 추정하지 않는다.

진단은 기존 OwnerDiagnostics와 별도 읽기 전용 DB 역할을 재사용하고 일반 writer 연결·미등록·다른 owner/request를 거절한다. 로컬 fixture는 기존 진단 login을 비노출로 사용하고 소유된 U3 격리 DB의 metadata view만 읽도록 준비한다. 새로운 운영 역할·비밀 파일·서비스를 만들지 않으며 이를 실제 운영 진단 구성으로 표시하지 않는다. 제품·계약·fixture·시험 8개 파일을 고정해 단위 2개와 통합 4개를 추가했다. HTTP/parser·worker와 Step15–16 전체는 미완료다.

TypeScript·지정 ESLint는 종료 코드 0이다. owner-query-unit-20261012.json은 260/260 PASS, owner-query-integration-20261012.json은 새 조회 4개와 이전 in-process-host 4개, 총 8/8 PASS다. root가 실제 JSON count를 확인했으며 실패/pending/todo 0·success=true, Luna가 미처리 오류 0을 확인했다. 검사 전후 HEAD는 4f1d0ed782676f4ddb2559783f74023635ce7035, source/runtime 지문은 368d33688b05e7554e168952a3b217ad0abf8cd3a82f2eef72bfe42e5b361e6c로 동일했고 선택 8개 파일 SHA도 동일했다.
