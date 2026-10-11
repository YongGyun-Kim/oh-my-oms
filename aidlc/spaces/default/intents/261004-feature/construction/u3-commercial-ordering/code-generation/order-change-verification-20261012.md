# U3 조건 적용·현재 조건 연결 검증

## 구현 경계

기준 커밋은 ddd018b106e905f3062149f33a49b7178684529c이다. 실제 보호 제안·고객 동의·업무 접수/이력을 대조하는 경로와 OrderChangeApplication 체인 resolver를 연결한다. REVIEW_PRICE_CHANGE는 검토 중 주문의 정확한 동의/조건을 한 번 적용한다. ACCEPTED_AFTERSALES_CHANGE는 정확히 등록된 U7 판단 원본이 필요하며 기본 미등록은 차단한다. 현재 적용 조건과 최초 구매 Snapshot/OrderLine을 구분하고 원래 원본을 직접 갱신하지 않는다.

제안의 APPLIED 표시도 실제 보호 application을 역참조한다. OrderAcceptance가 CommercialProposal.result나 다른 소유자의 원본을 직접 변경하지 않는다. 후속 제안은 현재 적용 조건을 원래 조건으로 표시하며 첫 구매 조건은 별도 보존한다. 새 배포/DDL을 추가하지 않고 기존 U3 모델·원본/보호 저장을 사용한다.

적용 직원은 실제 현재 MFA/context·내부망·행위 권한을 검증한다. 고객 동의는 실제 recordConsent 보호 접수와 당시 생산자 검증에 결합하고 현재 계정/기업/조직/역할·grant/scope·사업 근거를 전후 재검증한다. 저장된 고객 fence에는 Session/MFA 참조가 없으므로 이를 새 로그인·현재 고객 인증의 증명이라고 주장하지 않는다. 고객 ServiceContext/MFA를 만들어내거나 승인에 없는 새 고객 로그인 정책을 추가하지 않는다. 이 구분은 BR4.6 및 security-design의 변경 전/commit 전 현재 권위·정확 동의 대조를 적용한 해석이다.

시험은 실제 1,000→900 승인 가격·제안·고객 동의·적용·다음 제안 연결, 최초 UNKNOWN 합계 보존, 중복/원래 결과, 오래된 개정·외부 기업/망·권한 회수·제안 변경·보호 실패와 U7 조회 경계를 작성했다. U7 합성/mocked callback은 운영 생산자나 실제 후속 이행 증명이 아니다. 아래 실행 결과는 이 로컬 구현 경계의 검증이다.

## 최초 검사

Luna의 고정 소스 제품 지문은 8e17ebcef428ce42897de1a2cb5faeb6fb08ead4218a6a6cd6db4bcf5e0c56a9이며 변경 15개 파일 SHA-256과 함께 검사 전후 동일했다. 고정 Node 22.23.3의 TypeScript가 종료 코드 2로 중단됐다. commercial-proposal.ts:567에서 ProposalContent에 TargetData가 요구하는 originalTermsRef가 없어 TS2345가 발생했다. 이후 단위/통합/영향 회귀/ESLint는 실행하지 않았고 JSON 보고서도 생성되지 않았다.

저장한 originalTerms.termsRecordRef를 정확한 원래 조건 참조로 전달해야 한다. 필수 TargetData를 optional로 바꾸거나 원본/범위 검증을 제거하지 않는다. 수정·고정 후 재검증한다.

## 타입 수정 후 최초 단위 검사

currentTerms에 저장된 originalTerms.termsRecordRef를 명시 originalTermsRef로 전달했다. commercial-proposal.ts SHA-256은 d2693370f12215b71e2f65466305d2ea5bd7a0cd19cc20f1e9da6758eaa1ad7c이다. 수정 후 제품 지문 a67c0da4f41e4f720de626b9a72a993ba6477f64cc331fe6d5ef50c1290f9d46와 변경 15개 파일 지문은 전후 동일했다. Luna의 중간 지문 설명에 수정 전 8e17 값이 섞였으나 실제 전후 기록을 확인해 이 수정 후 지문으로 정정했다.

TypeScript는 종료 코드 0이다. U3 단위는 254개 중 253 PASS·1 FAIL, pending/skip/todo 0, 미처리 오류 없이 단일 assertion 실패다. root가 order-change-service-unit-20261012.json의 실제 count/success를 확인했다. proposal-terms.spec.ts:159의 기존 음성 사례는 적용 참조 없는 state:APPLIED를 거절할 것을 요구한다. 새 상태를 허용한 출력이 이 지원 원상 없이 통과하므로 정확한 OrderChangeApplication 참조를 결합하는 출력 정합성 검증이 필요하다. 음성 사례를 제거하거나 근거 없는 APPLIED를 허용하지 않는다. 통합·영향 회귀·ESLint는 실패 후 중단해 미실행이다.

## 출력 정합성 보완 후 검사

APPLIED 출력은 주문 대상과 비어 있지 않은 정확한 OrderChangeApplication 참조를 요구하도록 보완했다. KNOWN 바깥 ProposalViewResult도 같은 의미 검사와 정확한 sourceRefs 포함을 확인하며 실제 read 생산자는 보호 체인의 적용 참조를 출처에 포함한다. 기존 음성 사례와 구버전은 유지했고 정상·빈 목록·잘못된 owner/entity·갱신 대상·출처 누락/개정 불일치 사례를 추가했다. 이 형식 검증은 운영 원본 신뢰를 대신하지 않는다.

보완 제품 지문 2a96289295feda933d0d1b6682cf20b76b42342ea94ac0d1c9584f9b656ff57c와 변경 16개 파일 SHA-256은 검사 전후 동일했다. TypeScript 종료 코드 0, 단위254/254 PASS·실패/pending/todo 0이다. root가 order-change-output-aligned-unit-20261012.json의 실제 count/success를 확인했다.

새 가격 변경 통합은 9개 모두 FAIL·pending/todo 0이며 미처리 오류 9건이 보고됐다. root가 order-change-output-aligned-integration-20261012.json을 확인했다. 약92.8초의 전체 실행에서 각 사례가 요청 기한 만료로 실패했고, 첫 실패는 apply 이전 seedOrderChange의 실제 recordConsent/proposalEvidence·현재 직원 근거 대조에서 발생했다. 반복 원본 조회·잠금/연결 대기·fixture 기한·기한 만료 후 비동기 정리를 실제 근거로 조사한다. 요청10초/statement2초/lock500ms 제한을 늘리거나 현재 원본 검증을 제거하지 않는다. 영향 회귀·ESLint는 실패 후 중단해 미실행이며 원문 실패 보고서는 보존한다.

## 요청 기한의 원인 구분

identity-session.ts는 authenticate 시점에 해당 요청의 deadlineAt=현재+10초를 발급한다. 기존 seedU2Enterprise는 고객/직원을 한 번 인증한 문맥을 반환하며, 이어지는 U3 합의·상품·주문·제안·동의 fixture가 이를 여러 별도 요청에 재사용했다. 이번 실제 생산자 연결이 길어지면서 최초 인증 약10초 뒤 실제 recordConsent 또는 setup의 마지막 전제 검사가 원래 문맥의 기한 만료로 실패했다. 안전 프레임과 9개 사례의 전체 약10.198–10.247초를 대조했으며 첫 실패는 apply 호출 전이었다. 이는 각 새 요청의 실제 실행 시간이10초를 초과했다는 증거와 구분한다.

최소 수정은 시험의 실제 기존 MFA 세션 토큰을 비노출 closure에 보관하고 각 별도 요청 전에 identity.authenticate로 실제 새 요청 문맥을 받는 것이다. 토큰 반환/로그/파일 저장·임의 deadlineAt 연장·가짜 Session/MFA를 금지하며 현재 보호 링크에 맞는 verifiedPersonRef만 연결한다. 명시 음성/변조 문맥을 service proxy로 정상화하지 않는다. 제품 identity/요청·SQL·잠금 기한/권한 검증은 변경하지 않는다. 기존 미처리 오류9건의 취소 정리 원인은 아직 확정하지 않았으며 정상 재검증과 안전한 실패 근거에서 별도로 확인한다.

## 새 요청 문맥 연결 후 통합 검사

시험 전용 authenticateRequest closure와 U3 요청 factory를 연결했다. 실제 기존 MFA 세션으로 요청마다 새 문맥을 받으며 현재 보호 사람 링크·개정·계정 소속을 대조한다. 제품의 시간 제한/권한/잠금 코드는 변경하지 않았다. 수정 source/runtime 지문은 dda0e659fcbb6844e38b791f1d95ebb20c5b4e96f63ff4957612446b61842bfb이며 변경 20개 파일 SHA-256과 함께 검사 전후 동일했다. 공유 runtime fixture도 이 지문의 영향에 포함되므로 이전 2a962 값과 같다고 추정하지 않는다.

TypeScript 종료 코드 0, 새 통합9개 중5 PASS·4 FAIL·pending/todo0이다. root가 order-change-fresh-context-integration-20261012.json과 비민감 사례명/상태/시간을 확인했다. 최초 UNKNOWN의 새900원 적용/조회, 범위/권한 거절, 실제 열린 제안 대체, 엄격한 U7 근거 경계는 통과했다. 첫 전체 가격 변경/후속 제안 흐름과 응답 유실, 변조 원본/별도 보호 실패의 기대값은 아직 실패다. 후속 U3/U2 회귀·ESLint는 중단했으며 단위254를 반복하지 않았다.

소유 Docker project oms-u1의 primary 로그에서 SQL/인자 없이 FATAL 시간과 메시지만 추출했다. 실행 창2026-10-11T23:12:00.313Z–23:14:11.562Z 안의23:12:15.511Z 및23:12:43.392Z에 terminating connection due to transaction timeout을 확인했다. API primary의 기존 transaction_timeout3000/idle 제한3000과 TypeORM의 client error 시 runner release가 두 released-runner 실패와 연결된다. 요청10초/DB3초를 늘리거나 오류를 다른 성공 상태로 변환하지 않는다. 동일 phase에서 확인한 조건을 captured 생성에 재사용하고 exact authorityRef별 중복만 줄이는 최소 개선을 적용하되 적용 전/후의 별도 새 조회·현재 권위·owner proof·assertPremises를 유지한다.

두 음성 기대도 실제 보호 경계에 맞춰야 한다. 변조 제안은 U3 repository 비교 전에 공통 currentProtected에서 CURRENT_AUTH_NOT_PROTECTED로 거절된다. 보호 실패 후 primary Order2는 이미 commit됐고 보호 prefix는 Order1이므로 currentProtected의 불일치 거절이 정상이다. 보호 read의Order1·primary Order2·currentProtected 거절·정확한 실제 요청의PROTECTION_UNCONFIRMED를 각각 확인한 뒤 같은 key 재보호로Order2와 application 한 건을 대조한다. 실제 apply 선언/생산자의 targetKind는 NONE이므로 원래 요청 조회도 NONE을 유지하며 임의 RECORD 대상으로 바꾸지 않는다.

## 동일 단계 중복 조회 개선과 취소 시험 정합성

currentTerms가 같은 단계에서 확인한 offer/conditions를 반환하고 applicationSource가 이 값을 captured 생성에 사용하도록 개선했다. 적용 전과 적용 후의 applicationSource는 각각 새로 검증한다. U3CurrentBasis.evidence는 각 proof의 종류·정책·출처를 개별 검증하며 정확한 전체 authorityRef로만 중복을 합친다. owner proof 호출 전과 후의 현재 원본 대조는 별도로 유지한다. 서로 다른 확인자·다음 검증 단계·권한 회수는 재사용하지 않는다. 요청 10초·statement 2초·lock 500ms·primary transaction 3초 제한은 그대로다.

이 변경 후 TypeScript는 통과했으며 단위 256개 중 255 PASS·1 FAIL이었다. order-change-phase-reuse-unit-20261012.json을 보존한다. 실패는 current-commercial-basis.spec.ts의 취소 시험이 제거된 동일 단계 중복 조회 횟수 2회를 계속 기대한 두 assertion이다. 기대 횟수만 1회로 정정했으며 취소 거절·owner 한 번 호출·늦은 응답의 효과 차단 주장은 유지했다. 정정 파일 SHA-256은 fb0407eb6ceefc1d6af2e2de1e1ed10887f5f43933ace4ae74f9cceb81252ced이다.

## 횟수 정정 후 실제 검증

order-change-phase-count-aligned-*20261012.json 보고서를 root가 직접 확인했다. TypeScript 종료 코드 0, U3 단위 256/256 PASS, 주문 변경 통합 9/9 PASS, 지정 U3 6개 파일 회귀 57/57 PASS, 공유 fixture 영향 U2 membership-role-race 10/10 PASS이다. 각 JSON의 실패·pending·todo는 0이고 success=true이며 Luna가 미처리 오류 0을 확인했다. 검사 전후 HEAD는 ddd018b106e905f3062149f33a49b7178684529c, source/runtime 지문은 f756bcc069641ff3b8adb56c2f171fad66f23a6c7edb8c6735b29483402be7d3으로 동일하고 선택 22개 파일 SHA도 동일했다.

ESLint만 종료 코드 1로 실패했다. commercial-proposal.ts:10의 미사용 ConditionBinding, order-change.ts:4의 미사용 Ref 두 import를 제거한 뒤 타입/린트를 다시 검사한다. 이 단계에서 기능 시험의 통과를 전체 U3 완료나 전체 제품 coverage 달성으로 치환하지 않는다.

두 미사용 type import 삭제 후 지정 TypeScript·ESLint는 모두 종료 코드 0이다. 재검사 전후 HEAD는 위와 같고 새 source/runtime 지문 b68c8f06c69ca35785911ddec6e50584f0bf262211bc4a7f382c88246eb73c09 및 선택 22개 SHA가 동일했다. commercial-proposal.ts의 새 SHA는 b88a5ab38e39e734b29f3c4c21c474d31f0579235deabec50d7e86f37f5e828b, order-change fixture는 cc8330d1ec3f146a331f61a1a5130d55cb2d4d06183f5ca25e5eee79fe9f9f72이다. 행동 변화가 없는 두 type import 삭제에 대해 기능 시험을 반복하지 않았으며 기존 256·9·57·10 통과 보고서는 이전 f756 지문의 검증 근거로 보존한다.

## 남은 작업

Step 11–14의 완료 여부는 구현 담당자가 승인 계획 전체와 대조한다. HTTP/worker·파일럿 CI·전체 coverage·공통 품질/별도 리뷰는 이후 작업이다. 대량 부하·전체 DR·AWS 배포는 수행하지 않는다.
