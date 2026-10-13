# U3 코드 생성 요약

## 현재 판정

승인된 test-after/Standard 순서로 계획1–18의 구현·계층별 시험을 수행했다. Step19 최종 동일 source 품질/보안/3기여80%·실제 CI와 Step20 별도 리뷰/공식 완료는 아직 미완료다. 이 문서는 리뷰 준비 산출물이며 체크박스19/20 또는 native 단계 상태를 변경하지 않는다. 제품 문서 추가/예산 수정으로 이전 HEAD의 성공을 최종 source 증거로 재사용하지 않는다.

최종 기본 경로는 PR/main pilot-current CI의 독립 U1/U2/U3 matrix와 project gate다. 실제 결과는 root 소유 [품질 기록](quality-verification-20261012.md)에 source/HEAD·보고서 지문·종료 metadata와 함께 기록한다. main 머지/AWS 배포/실거래는 이 문서 생성으로 수행되지 않는다.

스트림 복구 시 마지막 수정의 소스 지문과 저장된 결과를 대조했다. U3 전체 단위303개·관련 통합65개(7파일), U1 영향 단위8개, U2 영향 단위18개·권한 경쟁 통합17개가 성공으로 기록되어 있다. U1 직원 흐름은 선택3개 성공·나머지50개 미실행이다. 복구된 통합 JSON은 success=true지만 이전 프로세스의 최종 종료 코드는 다시 관측하지 못했다. 새 같은 소스의 실제 CI·전체80%·품질/보안·별도 리뷰는 아직 필요하다.

마지막 ef17200 CI는 U1/U2 성공·U3 통합8건 실패였다. 안전한 received 정보에서 두 구간의25P04(transaction_timeout)와 다른 구간의 약3초 QUERY_RUNNER_RELEASED를 확인했으며 모든 사례가 같은 DB 코드를 받았다고 확대하지 않는다. 이후 조회의 같은 구간 snapshot/choice/lines, 적용의 검증된 Product, 직원 권위 검사의 검증된 StaffRole 연속 재조회를 줄였다. 최종 원상/권한·applicationSource 전후·grant 전체 순회와 공개 currentRoleState의3인수 독립 조회를 보존한다. 서비스10초·DB3초·statement2초·lock500ms·100행·80%는 유지했다.

## 파일과 구현

[source-manifest.json](source-manifest.json)은 승인 기준 a2d694f 이후 실제 제품/시험/설정 변경 전체를 path-only version1로 주장한다. 신규 U3 파일뿐 아니라 shared core/persistence·U1/U2 fixture/회귀·보안/CI helper·package.json·tsconfig.json·.gitignore를 포함한다. package-lock/infra 자원 변경을 임의 주장하지 않고 실제 경로 목록에 따른다. 원래 사용자 aidlc_change.sh·tests/u1/.reports와 private runtime/report/credential은 manifest/커밋 대상이 아니다.

| 계층      | 실제 구현/시험 연결                                                                                                             | 결과 의미                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 계약/값   | packages/contracts의 u3-commercial-v2.json·u3-operations-v2.json·u3-types/u3-validation/u3-declarations                         | closed profile2·registry3·정수KRW/TargetScope/100행·producer 검증, common1/2 보존                       |
| 모델/저장 | packages/persistence의 u3-v1.json·u3-model-catalog/decoder/migration/repository/recovery-payload·shared protected/recovery 수정 | 업무18+지원4·동명 중복 없는 current·비파괴 DDL·mixed payload/legacy bytes·primary와 별도 보호ACK        |
| 상품      | catalog.ts·catalog-query.ts·catalog-conditions.ts                                                                               | 직원/내부망·draft와판매조건·기업허용·원래offer/구매조건 보존                                            |
| 계약/제안 | commercial-agreement/proposal/terms·proposal-terms·u3-current-basis·u3-renewal-source                                           | 다른사람 승인·충돌차단/기업우선·변경요청/예외·정확현재 제안/동의·수동갱신 readonly 경계                 |
| 동의 권한 | u3-customer-access/staff-access/consent-scope·shared authorization/current-role                                                 | 실제 C01 등록·grant/revoke·contract.consent·sameprofile/current 전후 대조. CONSENT_ROLES 전용 목록      |
| 주문/적용 | order-acceptance/order-price/order-terms·u3-order-readiness/after-sales-source                                                  | 전체REVIEW/ACCEPT/REJECT/HOLD·확인금액·불변snapshot·두changeKind·실제application→다음제안               |
| host/조회 | apps/api/u3-operations/routes/person-context/runtime·shared application/operations/main·u3-owner-query/work-inquiry             | 등록31+grant2/C18조회3·실제권한/CSRF·한parser1MiB/64KiB·readonly진단·legacymutation우회차단             |
| 전달      | u3-notice-source·worker-authority/traversal                                                                                     | 보호된 원래 생산사실과 현재permit 구분·기존consumer2 유지·중복/역순/source오염차단                      |
| CI        | scripts/u3의 `pilot-*`·`coverage-*`·runtime-source와 shared u2 helper, 두workflow                                               | default pilot-current/explicit full-proof·같은 전체분모/3기여80%·child/source/lock/image/필수보고서차단 |

## 핵심 결정과 구현 정합화

profile 개정2와 registry3은 별도 축이며 기존 URI/등록2를 재정의하지 않는다. U3Ref는 기존 닫힌 U2 Ref의 실제 필요한 종류를 U3 안에서만 연결한다. 새 Receipt/C18 output은 검증된 PROTECTED source descriptor로 선택하고 client marker로 선택하지 않는다. 순수 typed marker로 실제 신뢰를 대신하지 않는다.

실제 현재 동의 권한을 생산하기 위해4개 권한 지원 정의를 별도로 연결했다. 논리 업무18개는 유지하며 새로운 인프라/물리 테이블 복제가 아니다. 구형 role/scope를 동의권한으로 자동 승격하지 않고 legacy 전체조회와 신규 CONSENT_ROLES 조회의 다른 의미를 명시한다.

CommercialProposal의 원래 금액/fingerprint/proposer source와 OrderChangeApplication의 인라인 AppliedTerms는 additive nullable 저장 호환을 사용한다. 구형 누락 값은 신규 적용에 미확인으로 차단한다. 동의 후 row revision과 immutable content 개정을 구분하고 실제 protected ref·원래 접수/이력·현재권한을 대조한다. 원래 구매snapshot은 불변이며 다음 제안은 실제 application 체인을 원래 현재조건으로 사용한다.

KRW는 선언된 정수 문자열 표현과 BigInt로 계산하고 임의 MAX_SAFE_INTEGER 금액 ceiling을 추가하지 않는다. KNOWN null 행/소계는 실제 스키마가 이미 거절하므로 이를 뒤늦게 발견한 기존 결함으로 주장하지 않는다. 미확인 비용/세금포함/적용 여부는0원으로 승격하지 않고 현재 직원/근거·전체 breakdown 확인을 요구한다.

기존 shared fixture의 현재fence+1 개정 때문에 오래된 '재seed는 항상 revision1 overwrite' 시험 전제를 고쳤다. 실제 고정revision1 tx.put 거절·보호fence 전체 equality·primary개정 보존을 유지했고 제품 guard는 완화하지 않았다. worker의 역사 생산원본 개정과 현재permit을 분리하며 실제 외부 사업owner 기록을 만들지 않는다.

독립 CI의 U2 회귀 시험은 선행 U1 보고서가 없을 때 ENOENT만 null로 보존하고, 존재하는 보고서의 실제 hash/원래 archive를 그대로 대조한다. U1 성공 보고서를 만들어 채우지 않는다. U3 소유자 취소 시험은 원래25ms 예산을 유지하고 테스트의 시계/신호를 제어해 실제 callback 진입 뒤 취소와 늦은 결과 차단을 확인한다. 실제 CI가 받은 오류 코드는 미확정이며 벽시계 의존을 제거한 시험 보완으로 취급한다. 제품/DB 제한은 바꾸지 않았다.

CI 실패 요약은 종료/보고서 상태·허용 검증 코드·엄격한 수치·등록 assertion/suite 파일과 순번·허용 source 프레임만 제한적으로 담는다. 원문/message/title/env/SQL/token은 공개하지 않고 실제 실패나 suite 오류를 성공으로 바꾸지 않는다. U1 suite 원인은 새 상세 요약 확인 전까지 미확정이다.

U3 전체18파일의 기본600초 collector 종료는 완료11파일/104시험 표시시간587.215초와 남은7파일 과거63.618초로 조사했다. U3 integration 프로세스만20분, coverage만30분으로 명시하고 서비스10초·DB3초·stmt2초·lock최대500ms·개별test/hook30초·순차파일·전체분모는 유지했다. coverage30분은 아직 실제 V8 수행 여유 가정이다.

깨끗한 CI에서 필요한 증거 폴더는 각 U1/U2 시험이 소유 경로만0700으로 준비하고 실제0600 쓰기를 유지한다. U1 보고서 쓰기 오류도 전파하며 연결 정리는 finally로 보장한다. 100행 주문의 새 OrderLine은 기존 revision1/정확 버전/고유ID/INSERT/FK·commit 검증을 가진 putNewBatch로 저장한다. 판단은 같은 phase에서 currentOrderTerms가 검증한 snapshot/choice/lines를 재사용하고 독립적인 최종 assertPremises·현재 권한/보호 대조를 유지한다. 실제 CI 받은 DB 오류 코드는 미확정이며 검증된 중복 작업을 줄인 개선으로 기록한다.

## 시험 증거와 미완료

계층별 원문과 실패/수정/재검증은 이 디렉터리의 contracts/models/repository/catalog/agreement/proposal/order/host/pilot-ci 검증 기록에 보존된다. 최근 별도 검증에서 주문 적용11개(기존9+경쟁2), HTTP6개 및 기존U1HTTP25/U2HTTP22, worker6개 및 영향U1/U2 회귀가 통과했다. 각각 당시 source의 경계 증거이며 최종 전체 CI 성공으로 확대하지 않는다.

HEAD25d8583의 로컬 실제 U1기여는 unit571·integration168·동일739개 coverage 재실행, U2기여는 unit465·integration274·동일739개 coverage 재실행 및 PC5개가 통과했다. coverage 재실행을 새로운 고유시험 수에 더하지 않는다. U3unit280은 통과했지만 통합 child600초 기한 초과(exit143/expired=true)로 새 완료보고서가 없어 U3전체/coverage/project/80%·보안은 판정되지 않았다. 이전 e850ebc U2 실패와 진단/최소수정 결과도 삭제하지 않는다.

새 예산 선택의 대상시험 pilot-ci10/10·TypeScript/지정ESLint는 통과했으며3개TS 파일 지문이 전후 같았다. 새 전체unit281개나 새로운 CI/coverage 성공은 아직 주장하지 않는다. docs/최종 source 고정 후 실제 CI가 같은 최종HEAD/source/lock/image의 전체 기여·품질/보안을 확인해야 한다. Luna의8파일 format/JSON/manifest/traceability 검사도 통과했고 전후 파일 지문이 같았다. root가 전체 Git 변경166경로와 신규 README를 manifest167경로에 대조해 누락/불필요 주장이 없는 것을 확인했다.

이후 안전 진단 선택14개, U2 보고서 보존 선택9개, U3 취소/진단 선택19개도 각각 당시 source에서 통과했다. 타입/린트/선택 포맷과168경로 manifest·104ID·AC Deferred7의 strict 검사를 확인했다. 06a5b35의 실제 CI에서는 U2 unit464/465·U3 unit284/285와 U1 integration assertion168/168이었지만 U1 failedSuite1로 전체 세 작업이 실패했고 project는 차단됐다. 이 실패는 품질 기록에 보존하고 다음 source의 CI를 별도로 확인한다.

759e578에서는 세 Unit의 단위가 통과했고 U1의 실제 보고서 쓰기 suite 오류와 U2의 보고서 파일 쓰기2건, U3의100행 통합2건으로 전체 CI는 실패했다. 이후 보고서 폴더 수정의 U1 선택8개·U2 선택7개, 주문 접수/판단·일괄 저장 duplicate/FK rollback·후단 마지막 행 변조 거절20개, 주문 변경 회귀11개가 로컬에서 각각 통과했다. 해당 타입·린트·포맷과 당시170경로 manifest 대조도 통과했지만 전체 CI·coverage80%·보안 성공으로 확대하지 않는다.

9ca3cfc의 실제 CI run38202950687에서 U1·U2 작업은 통과했다. 같은 checkout/source의 U1 단위571·통합168, U2 단위465·통합274·PC5개 및 각 기여의 동일739개 coverage 재실행을 확인했다. U3 통합은159개 중155 PASS/4 FAIL로 전체 CI와 project 품질 검증은 차단됐으며 이 실패도 보존한다.

추가 조사에서 정상 proposal·주문 입력 준비/접수/조회·seed 후 판단이 최초 요청의 시간 예산을 여러 요청에 재사용한 시험 전제를 확인했다. 각 요청은 기존 실제 재인증 closure로 새 context를 사용하며 부정 actor·기업·외부망·권한회수·변조 입력·경쟁 단언을 유지한다. 제품 변경은 한 assertPremises 호출에서 write Map을 한 번 만드는 것으로 제한했고 독립 최종 현재성/보호 대조를 유지했다. 서비스10초·DB3초·statement2초·lock500ms·100행·80% 기준은 바꾸지 않았다.

Luna의 해당 타입/린트/포맷·선택 단위22개·관련 통합3파일32개는 통과했다. opt-in 테스트 helper는 고정 phase/메서드의 숫자 집계만 제공하며 계측 overhead를 포함하고 중첩 누적 시간을 합산하지 않는다. 당시 manifest는 이 테스트 helper를 포함한 실제171개 경로였고 root의 전체 Git 대조에 누락/추가가 없었다. 새 소스의 전체 CI·coverage80%·보안·별도 리뷰·공식 완료는 아직 미완료다.

## 추적과 운영 경계

7d4df314의 실제 CI run38206085977에서 U3 제안 시험은 통과했지만 통합159개 중152 PASS/7 FAIL로 현재 전체 검증은 계속 차단됐다. 이전 로컬32개와 제출/판단의 숫자 집계 성공을 CI 성공으로 확대하지 않는다. 실제 최종 오류 코드는 기존 문자열 JSON 요약에서 확인할 수 없으므로 제품·DB 예산/현재성 검사를 추측으로 변경하지 않았다.

시험 전용 JsonReporter subclass는 부모의 JSON counts/output을 유지하며 최종 failed 사례에서만 실제 오류의 허용 code/SQLSTATE와 닫힌 phase 숫자를 meta로 기록한다. 메서드의 관측 rejection과 최종 시험 오류는 구분하며 passed 예상 rejection은 실패 집계에서 제외한다. HTTP는 실제 받은 status/problem type의 정확 enum만 사용한다. 미확인 값은 UNKNOWN이고 message/title/actual/expected/SQL/token을 추측·공개하지 않는다. 계측 overhead를 포함하고 중첩 시간을 합산하지 않는다. 기본 include 밖의 DB 없는3 FAIL/1 PASS reporter probe는 exit1이 의도된 진단 연결 검사다. 실제 BASELINE/SAFE의 counts/status 보존·받은 오류/SQLSTATE·matcher UNKNOWN·정상 예상 rejection 제외·민감 sentinel 제외를 확인했다. 제어된3 FAIL은 실제 업무 회귀 판정에 합산하지 않는다.

타입 metadata 오류를 수정한 뒤 Luna의 TypeScript·지정 ESLint·Prettier·진단 단위21개·관련 통합4파일37개는 모두 통과했다. root가 실제 report count/bool과 probe를 대조했고 source176경로의 실제 전체 Git 대조에 누락/추가가 없다. 같은19경로 SHA는 검사 전후 동일했다. 로컬 HTTP_APPLY의 보호 실행2630.977ms와 READ_100 전체1920.292ms는 계측 overhead를 포함한 관측이며 CI 실패 원인/운영 용량의 확정 증거가 아니다. 새 관측 source의 전체 CI·전체80%·보안·별도 리뷰·main 머지는 미완료다.

[traceability.json](traceability.json)은 할당42AC·29BR·33상세NFR를 모두 열거한다. OK는 실제 존재하는 구현/시험 경로 연결이지 그때의 운영목표 달성 인증이 아니다. 원래7개 AC Deferred와 NFR 설계의 후속 실증을 보존한다. 국내경로/실제보관정책 같은 원본 확인을 코드guard/문서로 달성했다고 표현하지 않는다.

현재 운영 설정은 UNREGISTERED다. 실제 사람/증빙소유자·U4/U5/U6 공급/대금/라이선스준비·U6갱신회차·U7후처리 원본 미등록/미확인은 차단/HOLD다. 포트 구현과 운영 생산자등록, 합성 callback과실원본은 다르다. 기존 U2 Major1/2는 전역해소/위험수용이 아니다. U3 전면UI·provider/회사망/국내원본/보관/알림/장기운영·대량부하/전체DR/무중단 실증은 해당후속 소유자에 남긴다.

최종 코드/명령/호환/후속 요약은 [docs/u3/README.md](../../../../../../../../docs/u3/README.md), 실제 Unit 실행은 [unit-test-instructions.md](unit-test-instructions.md)에 있다. 별도 리뷰·공식완료·실제CI·병합은 주 실행자가 실제 증거로 판정한다.
