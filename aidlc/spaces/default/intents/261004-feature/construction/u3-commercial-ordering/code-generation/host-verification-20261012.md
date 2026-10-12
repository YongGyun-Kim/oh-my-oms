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

## HTTP 연결과 최초 타입 검사

보호 조회 계층은 3cecf81로 커밋하고 같은 원격 브랜치에 push했다. HTTP 계층에서는 고정 U3 경로·서버의 registry3 선택·경로별 단일 parser·현재 보호된 사람 연결의 문맥 결합을 작성했다. 주문 제출/조건 적용만 1,048,576바이트이고 나머지 요청은 65,536바이트다. 요청의 버전/권한 주장을 서버 경로 선택자로 사용하지 않으며 압축·무효 JSON은 업무 호출 전에 거절한다. 기존 U1/U2 경로를 보존하고 현재 운영 U3 runtime은 명시 UNREGISTERED로 차단한다. 실제 운영 사람 원본 생산자나 연동 준비 완료를 주장하지 않는다.

9개 제품/시험 파일을 고정하고 실제 password/MFA 로그인·주문/조건 적용·동일 key 원래 결과·제안/동의 사람 연결·역할/ScopeV2/C18·byte 경계·CSRF/내부망/기업/버전/보호 변조 시험을 작성했다. 최초 TypeScript는 종료 코드 2로 실패했다. http-contracts.spec.ts의 부분 Request 직접 cast에서 TS2352, NODE_ENV가 없는 ProcessEnv fixture에서 TS2345가 발생했다. 이후 단위/HTTP 통합/ESLint는 중단했고 JSON 보고서는 생성되지 않았다. 검사 전후 HEAD는 3cecf81fc9842b7a973c02c786cea2fa9d17465b, source/runtime 지문은 05bbc6104880cd98c6337be8c58e3399b226bc97c09a128600a92d86ac864996으로 동일하며 선택 9개 SHA도 동일했다. 제품 계약/검증을 약화하지 않고 시험 타입 fixture를 보완한 뒤 재검증한다. worker·CI·Step15–16 전체는 아직 미완료다.

## HTTP 타입 보완 후 통합 검사

http-contracts.spec.ts의 Partial<Request> 대역 helper와 NODE_ENV:test 환경 대역만 수정했다. 새 시험 SHA-256은 5630e2476a83536edfdce8ab496c5788edecac27a44325b6ca1b8c93b5da26ee이며 다른 8개 SHA는 그대로다. TypeScript는 종료 코드 0, http-host-typed-fixture-unit-20261012.json은 264/264 PASS다. http-host-typed-fixture-integration-20261012.json은 6개 중 3 PASS·3 FAIL·pending/todo 0·success=false다. root가 실제 count와 실패 메시지 첫 안전 프레임을 확인했다. 이후 ESLint는 중단했다.

조건 적용(:196)과 제안 생성(:235)은 예상202/실제503이며 응답 오류 코드는 아직 확인하지 못했다. 사람 연결 직접 시험(:422)은 u3-person-context.ts:37에서 연결 하나를 요구하는 거절로 실패했고 미처리 시험 예외 1건이 보고됐다. Luna의 중간 보고에 없는 코드 CURRENT_PERSON_LINK_NOT_UNIQUE가 사용됐으나 실제 source 조건의 코드는 U3_PERSON_LINK_AMBIGUOUS다. 이 직접 실패와 앞선 두503의 원인이 같은지는 응답 코드를 대조하기 전에는 확정하지 않는다. 현재 보호 연결·primary 대조·정확 계정 개정·목적·유일성 검증은 유지하고 실제 selector/fixture 원인을 조사한다. 검사 전후 source/runtime 지문·HEAD는 위 최초 타입 검사와 같고 선택9개 SHA는 이번 고정값으로 동일했다.

## 실제 사람 연결 건수와 시험 그래프 원인

개발자가 소유된 U3 격리 DB에 connection initialize와 SELECT만 수행했다. migration/reset/원본 변경은 없고 출력은 익명 건수로 제한했다. 집계는 계정4, primary 연결 건수 분포 {1:2,2:2}, 보호 연결 분포 {1:2,2:2}, primary/보호 불일치0, 중복 연결 계정 각각2다. 처음 tsx --eval은 CJS의 top-level-await 로드 오류로 DB 연결 전에 실패했고, 고정 Node22의 node --import tsx --input-type=module --eval로 읽기에 성공했다. 계정/연결 식별자·자격·근거 내용을 출력하지 않았다.

ProtectedStore.list의 equals는 실제 JSONB containment로 동작하고 raw 조회와 같은 조건이었다. tests/u1/fixtures/identity.ts의 계정별 보호 bootstrap VerifiedPersonLink와 tests/u3/fixtures/agreement.ts의 새 PersonVerification/IdentityHistory 연결이 같은 직원 계정에 함께 존재했다. 기존 VerifiedPerson.confirmedLink도 복수 연결은 확인하지 않으므로 제품 selector/유일성 완화 사유가 아니다. HTTP 전용 합성 fixture에서 정확한 PersonVerification가 있는 U3 링크를 보존하고 해당 계정의 확인 없는 bootstrap 링크만 명시 보호 삭제해 유효 시험 전제를 준비한다. 과거 보호 journal은 유지하며 서비스가 임의 첫 연결을 선택하지 않는다. 중복 현재 연결의 명시 거절 사례도 추가한다. 앞선 두503은 안전한 응답 코드 확인 후 별도 원인 여부를 구분한다. 운영 사람 원본 생산자/U2 미해결 사항의 수정으로 표시하지 않는다.

수정은 HTTP 통합 시험 파일 하나에 한정했다. 정확 bootstrap 계정 참조/보호·primary의 확인 없음과 보존할 U3 확인 링크를 검증한 뒤 tx.remove로 삭제하며, 과거 보호 개정 조회를 단언한다. 새 중복 링크를 보호 저장하면 U3_PERSON_LINK_AMBIGUOUS로 거절하는 음성 사례를 추가하고 그 정확 중복만 정리한다. 앞선202 기대에는 status/problem 코드만 안전한 단언 메시지로 추가했다. 첫 수정본 SHA는 32de6b50ffda82b77f250ae7c8f933aae96413da8abecf67aa266970b12fd556이고 제품 person-context SHA는 변하지 않았다. 재검증 TypeScript는 http-host.spec.ts:554의 duplicate 객체 revision 추론 누락 TS2339로 종료 코드2다. 이후 통합/ESLint는 중단했고 새 JSON은 생성되지 않았다. 지문/HEAD와9SHA는 전후 동일했다. 시험 객체의 실제 모델 타입을 정합화한 뒤 다시 검증한다.

duplicate에 실제 ModelData와 personLinkId 타입만 명시했다. 제품·실행 값·단언은 유지했고 최종 HTTP 통합 파일 SHA는 03904b59f90c9272b70d479e5e79f576982c8668b16142c4fcf0e907f36e87fc다. TypeScript·지정 ESLint 종료 코드0, http-host-person-graph-typed-integration-20261012.json은 6/6 PASS·실패/pending/todo0·success=true이며 미처리 오류0이다. root가 실제 count를 확인했다. 기존 unit264 PASS 보고서는 같은 제품/단위 시험 지문의 결과로 보존하고 반복하지 않았다. 검사 전후 HEAD는 3cecf81fc9842b7a973c02c786cea2fa9d17465b, source/runtime 지문은 05bbc6104880cd98c6337be8c58e3399b226bc97c09a128600a92d86ac864996이며 선택9개 SHA도 동일했다. 첫 두503 기대도 시험 그래프 정합화 후 정상202로 통과했다. 좁은 U1/U2 HTTP 영향 회귀는 이어서 실행 중이다.

HTTP 영향 회귀도 통과했다. npm의 소유된 격리 검증 DB 준비를 거친 U1 http-boundaries/http-auth-intents는 25/25 PASS, U2 http-access/http-identity는 22/22 PASS이며 두 명령 종료 코드0이다. root가 http-host-u1-regression-20261012.json과 http-host-u2-regression-20261012.json의 실제 count를 확인했다. 실패/pending/todo0·success=true, 검사 전후 위 HEAD/source 지문과 선택9개 SHA는 동일했다. worker 소비 연결·파일럿 CI·공통 품질·최종 문서와 별도 리뷰는 계속 미완료다.
