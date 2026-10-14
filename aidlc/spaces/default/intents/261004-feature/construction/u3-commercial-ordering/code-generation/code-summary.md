# U3 코드 생성 요약

## 현재 판정

첫 제한 파일럿의 상품·기업 계약·전체 주문·조건 변경 경로를 기존 API/worker/DB/보호 저장에 구현했다. 현재 Testing Contract의 test-after/Standard 순서와 80% 라인 커버리지 기준을 유지했다. 기능과 보호 검증을 연결한 실제 변경은 [source-manifest.json](source-manifest.json)의176개 경로에 기록한다.

기업별 공개 예외 수정과 README를 포함한4e1759e의 [실제 CI run38379574890](https://github.com/YongGyun-Kim/oh-my-oms/actions/runs/38379574890)은 U1/U2/U3와 project 모두 성공했다. 동일 PR checkout source의 합산 라인 커버리지는11955/14395=83.0497%이며 type/lint/format·보안·image/runtime 검증도 통과했다. 실제 운영 활성화는 허용하지 않으며 이 결과를 배포·운영 용량·전체 재해 복구의 증명으로 해석하지 않는다. 이전 d7d77d8의 성공과 수정 전 실패는 별도 역사로 품질 기록에 보존한다.

이전 실패·수정·재검증, 선택 진단의 부분 범위 차단, 런타임 증거 정정과 보고서 지문은 [품질 기록](quality-verification-20261012.md)에 보존한다. 최종 기본 검증은 PR/main pilot-current CI이며 대량 부하·전체DR·무중단 실증은 별도 실행이다.

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

공통 공개 기본값과 판매 상태를 분리했다. 완성·유효한 비공개 상품도 승인된 기업 조건을 합성한 뒤 최종 공개 여부를 판단한다. 고객 조회·주문 제출·직원 전체 수락은 실제 OFFERABLE 상태와 현재 권한·원본·유효 기간을 확인한다. 비공개 공통 가격/조건은 고객 응답에서 null/빈 목록으로 숨기고 해당 기업의 확정 가격만 반환한다. 직원 조회는 공통 원본과 최종 기업 조건의 의미를 구분한다. API는 실제 CommercialAgreement 소유자를 조회 서비스에 연결한다.

기존 중지 상품은 saleState를 생략한 설명 개정에서도 SUSPENDED를 유지한다. 직원은 완전·유효한 중지 상품의 현재 공통 원본을 조회하고 명시적으로 재판매할 수 있다. 미완성·미래·만료 조건은 재판매 근거로 인정하지 않는다. 기존 저장 상태를 자동 변환하지 않으며 원래 구매 가격·조건·offer bytes를 보존한다. 입력의 선택적 saleState와 nullable 공통 가격은 U3 계약에만 반영하고 common:1/common:2를 유지한다.

profile 개정2와 registry3은 별도 축이며 기존 URI/등록2를 재정의하지 않는다. U3Ref는 기존 닫힌 U2 Ref의 실제 필요한 종류를 U3 안에서만 연결한다. 새 Receipt/C18 output은 검증된 PROTECTED source descriptor로 선택하고 client marker로 선택하지 않는다. 순수 typed marker로 실제 신뢰를 대신하지 않는다.

실제 현재 동의 권한을 생산하기 위해4개 권한 지원 정의를 별도로 연결했다. 논리 업무18개는 유지하며 새로운 인프라/물리 테이블 복제가 아니다. 구형 role/scope를 동의권한으로 자동 승격하지 않고 legacy 전체조회와 신규 CONSENT_ROLES 조회의 다른 의미를 명시한다.

CommercialProposal의 원래 금액/fingerprint/proposer source와 OrderChangeApplication의 인라인 AppliedTerms는 additive nullable 저장 호환을 사용한다. 구형 누락 값은 신규 적용에 미확인으로 차단한다. 동의 후 row revision과 immutable content 개정을 구분하고 실제 protected ref·원래 접수/이력·현재권한을 대조한다. 원래 구매snapshot은 불변이며 다음 제안은 실제 application 체인을 원래 현재조건으로 사용한다.

KRW는 선언된 정수 문자열 표현과 BigInt로 계산하고 임의 MAX_SAFE_INTEGER 금액 ceiling을 추가하지 않는다. KNOWN null 행/소계는 실제 스키마가 이미 거절하므로 이를 뒤늦게 발견한 기존 결함으로 주장하지 않는다. 미확인 비용/세금포함/적용 여부는0원으로 승격하지 않고 현재 직원/근거·전체 breakdown 확인을 요구한다.

기존 shared fixture의 현재fence+1 개정 때문에 오래된 '재seed는 항상 revision1 overwrite' 시험 전제를 고쳤다. 실제 고정revision1 tx.put 거절·보호fence 전체 equality·primary개정 보존을 유지했고 제품 guard는 완화하지 않았다. worker의 역사 생산원본 개정과 현재permit을 분리하며 실제 외부 사업owner 기록을 만들지 않는다.

독립 CI의 U2 회귀 시험은 선행 U1 보고서가 없을 때 ENOENT만 null로 보존하고, 존재하는 보고서의 실제 hash/원래 archive를 그대로 대조한다. U1 성공 보고서를 만들어 채우지 않는다. U3 소유자 취소 시험은 원래25ms 예산을 유지하고 테스트의 시계/신호를 제어해 실제 callback 진입 뒤 취소와 늦은 결과 차단을 확인한다. 실제 CI가 받은 오류 코드는 미확정이며 벽시계 의존을 제거한 시험 보완으로 취급한다. 제품/DB 제한은 바꾸지 않았다.

CI 실패 요약은 종료/보고서 상태·허용 검증 코드·엄격한 수치·등록 assertion/suite 파일과 순번·허용 source 프레임만 제한적으로 담는다. 원문/message/title/env/SQL/token은 공개하지 않고 실제 실패나 suite 오류를 성공으로 바꾸지 않는다. U1 suite 원인은 새 상세 요약 확인 전까지 미확정이다.

U3 전체18파일의 기본600초 collector 종료는 완료11파일/104시험 표시시간587.215초와 남은7파일 과거63.618초로 조사했다. U3 integration 프로세스만20분, coverage만30분으로 명시하고 서비스10초·DB3초·stmt2초·lock최대500ms·개별test/hook30초·순차파일·전체분모는 유지했다. coverage30분은 아직 실제 V8 수행 여유 가정이다.

깨끗한 CI에서 필요한 증거 폴더는 각 U1/U2 시험이 소유 경로만0700으로 준비하고 실제0600 쓰기를 유지한다. U1 보고서 쓰기 오류도 전파하며 연결 정리는 finally로 보장한다. 100행 주문의 새 OrderLine은 기존 revision1/정확 버전/고유ID/INSERT/FK·commit 검증을 가진 putNewBatch로 저장한다. 판단은 같은 phase에서 currentOrderTerms가 검증한 snapshot/choice/lines를 재사용하고 독립적인 최종 assertPremises·현재 권한/보호 대조를 유지한다. 실제 CI 받은 DB 오류 코드는 미확정이며 검증된 중복 작업을 줄인 개선으로 기록한다.

## 시험 증거와 제한

기업별 공개 예외 수정 후 고정 Node22.23.3의 선택 단위12/12와 실제 primary/보호 DB·HTTP 통합5파일66/66이 통과했다. 실패/pending/todo0·success=true·두 명령 실제exit0이며 관련14파일 SHA가 실행 전후 동일하다. 새 tsc --noEmit·변경 TS lint·format도 exit0이다. 이어서 같은 제품/시험/README bytes의 전체 CI 결과를 확인했다.

최종 CI run38379574890의 실제 결과는 다음과 같다. coverage 열은 단위·통합의 같은 시험을 V8로 재실행한 수이며 새로운 고유 시험으로 합산하지 않는다.

| Unit |    단위 |    통합 | 전체 coverage 재실행 |        PC |
| ---- | ------: | ------: | -------------------: | --------: |
| U1   | 571/571 | 168/168 |              739/739 | 해당 없음 |
| U2   | 465/465 | 274/274 |              739/739 |       5/5 |
| U3   | 332/332 | 181/181 |              513/513 | 해당 없음 |

각 시험은 fail/pending/todo0·success=true이며 coverage evidence는passed=true·completeScope=true다. source HEAD는480c978dfdd1f078a2ca30991ff2c1fd29a533cb·digest5d602283f1025df7cdc694d17f8b21e68998cddfe058ae1ac46c0b4c4790274b로 세 기여와 project가 일치한다. 각 report의 실제 실행은observed=true·exitCode0·expired=false·logFailed=false이고 산출물fresh와 원문 SHA가 일치한다.628개 source의 현재 로컬 bytes도 모두 동일하다. Node22.23.3/Vitest·V85.0.3/TypeScript6.0.3 및 원래 lock을 보존한다.

project는18개 완료·실패0·Deferred4를 기록했다. 보안은 의존성·SAST·비밀·IaC 문맥·컨테이너 OS/라이브러리 검사를 완료했다. 동일 image ID sha256:0e2fc1914a13faf9e9de8b8f8d77c1f6f769e856b840f7088eb8873517e4eaa9를 release/security/runtime 보고서가 대조한다. runtime의 동일 image/TLS 검증은true·cleanupFailed=false지만 Cognito/회사망 검증은false·realActivationAllowed=false다. 개별 exit/fresh 필드가 없는 project 검사의 값을 임의로 채우지 않는다.

직원 grant별 기존 검증은 독립 권위 호출마다 최대4개씩 읽기를 겹친다. 보호 원상·개정/profile·전체 grant scan·독립 pre/post·최종 전제 대조를 유지하며 캐시·새 저장 API·시간 제한 완화는 없다. 시작한 조회를 모두 기다리고 원래 scan 순서의 첫 오류를 반환한다. 후행 변조·다음 독립 회수·상한·취소·형제 조회 종료 대기를 회귀로 검증했다. 동일 로컬 V8 선택의 보호 실행1748.6→1295.9ms 감소와 조회991회 동일성을 관측했으나 한 건의 지연을 운영 용량으로 일반화하지 않는다.

Ajv는 사용하지 않는 allErrors 목록 수집만 중단했다. closed schema 판정·공개 INVALID_INPUT·입력 보존·기간 의미 검증을 원래 검증기와 비교했다. 안전 진단은 허용 코드/수치/등록 위치만 담고 원문·SQL·민감 입력을 공개하지 않는다. 커버리지 증명과 별도 시험 관측을 구분하고 부분 범위를 성공 증거로 승격하지 않는다.

상품/계약/제안/주문/host/worker의 계층별 시험과 영향 U1/U2 회귀를 유지했다. 원래 서비스10초·DB3초·statement2초·lock최대500ms·개별시험30초·최대100행·전체80% 기준은 유지한다. U3 통합 수집20분·coverage 수집30분은 전체 순차 시험의 유한 수집 예산이다.

## 추적과 운영 경계

[traceability.json](traceability.json)은 할당42AC·29BR·33상세NFR를 모두 열거한다. OK는 실제 존재하는 구현/시험 경로 연결이지 그때의 운영목표 달성 인증이 아니다. 원래7개 AC Deferred와 NFR 설계의 후속 실증을 보존한다. 국내경로/실제보관정책 같은 원본 확인을 코드guard/문서로 달성했다고 표현하지 않는다.

현재 운영 설정은 UNREGISTERED다. 실제 사람/증빙소유자·U4/U5/U6 공급/대금/라이선스준비·U6갱신회차·U7후처리 원본 미등록/미확인은 차단/HOLD다. 포트 구현과 운영 생산자등록, 합성 callback과실원본은 다르다. 기존 U2 Major1/2는 전역해소/위험수용이 아니다. U3 전면UI·provider/회사망/국내원본/보관/알림/장기운영·대량부하/전체DR/무중단 실증은 해당후속 소유자에 남긴다.

최종 코드/명령/호환/후속 요약은 [docs/u3/README.md](../../../../../../../../docs/u3/README.md), 실제 Unit 실행은 [unit-test-instructions.md](unit-test-instructions.md)에 있다. 실제 운영 원본 등록과 배포는 별도 책임과 증거가 필요한 후속 작업이다.
