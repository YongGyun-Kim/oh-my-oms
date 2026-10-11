# U3 적용 조건 모델·호환 검증

## 구현 경계

기준 커밋은 15a6274f9fef175b43a0168944250473658a49ac이다. 기존 OrderChangeApplication에 optional nullable appliedTerms JSONB 필드 하나를 추가한다. 18개 업무 모델과 기존 common:1/common:2, U3 profile2/registry3는 유지한다. 값은 기존 ProposalTerms·CapturedLines·OrderPriceBreakdown·TargetScope에 제안 내용 개정과 지문을 결합한 폐쇄 인라인이다.

일반 역사 decoder는 과거 missing/null 기록을 보존한다. 현재 적용 조건을 해석하는 decodeAppliedTerms는 완전한 APPLIED 기록만 반환하며 원본 조건 참조와 행/수량/금액/기간/단일 지급 매핑을 확인한다. 형식 검증은 실제 고객 동의·현재 원본 신뢰의 증명이 아니다. 실제 apply 서비스와 체인 resolver·host는 아직 작성하지 않았다.

모델 시험의 applicationGraph는 기존 실제 주문 제출·제안 생성/조회·동의 서비스를 재사용한다. application 자체는 명시 합성 모델 fixture로 기록하며 실제 주문 변경 성공이라고 주장하지 않는다. 로컬 owner 재연은 모델/보호 원상 호환 검증이며 전체 DR 실증이 아니다.

## 최초 검사

Luna가 고정 Node 22.23.3과 기존 verification-isolated U3 DB에서 실행했다. 제품/source 지문 a6c63e3f9eef49ea93a7920680e570440e10aaa095df9f7f8fa6fd76789cd115와 변경 8개 파일 SHA-256은 검사 전후 동일했다. root가 아래 JSON의 실제 count/success를 확인했다.

| 검사 | 실제 결과 |
| --- | --- |
| TypeScript | 종료 코드 0 |
| U3 단위 | 249/249 PASS, 실패/pending/todo 0; applied-terms-model-unit-20261012.json |
| 모델·migration 통합 | 14개 중 11 PASS·3 FAIL, pending/todo 0; applied-terms-model-migration-integration-20261012.json |
| 기존 migration 호환 | 위 통합 중 11/11 PASS |
| 새 적용 모델 통합 | 위 통합 중 0/3 PASS; applicationGraph의 실제 recordConsent 준비에서 현재 action 권한 부재 |
| 선택 ESLint | 실패 후 중단하여 미실행 |

새 fixture는 동의 역할을 정의했으나 실제 grant 생산자를 호출하지 않았다. 기존 제안 통합 시험도 이 상태의 ACTION_DENIED를 먼저 검증하고 f.grant() 이후 동의를 실행한다. 새 fixture에 실제 권한 부여 절차를 연결하는 최소 수정으로 재검증하며 제품 권한 검증·모델 조건을 완화하지 않는다. 최초 실패 보고서는 보존한다.

## 권한 부여 연결 후 검사

applicationGraph에 실제 await f.grant()를 동의 기록 전에 연결했다. 제품 지문 a6c63e3f9eef49ea93a7920680e570440e10aaa095df9f7f8fa6fd76789cd115와 변경 8개 파일 지문은 전후 동일하며 fixture SHA-256은 3bc2f2d2ab32806518ed8aa8f35bee60a72e21bb8cc86552ad136ce345dbcdb9이다. TypeScript 종료 코드 0, 새 통합 3개 중 2 PASS·1 FAIL이며 pending 0이다. root가 applied-terms-model-grant-fixed-integration-20261012.json의 실제 count/success를 확인했다. 이전 unit249/migration11 결과는 다시 실행하거나 현재 새 실행으로 재명명하지 않았다. ESLint는 실패 후 중단해 미실행이다.

남은 실패는 재연 전제에 있다. 시험은 해당 application 행/버전만 삭제해 현재 후보의 RequestKey가 남았고, 정상 복구 replayRows는 RequestKey를 빈 복구 대상에 INSERT하므로 u1_request_key_pkey 중복이 발생했다. 같은 후보의 요청 식별 행을 기존 격리 owner transaction에서 정확히 제거한 뒤 전체 폐쇄 payload를 재연해야 한다. 다른 요청/원본을 삭제하거나 payload 행을 건너뛰거나 제품 복구 로직을 upsert로 바꾸지 않는다. 실패 원문은 보존한다.

## 재연 전제 수정 후 발견한 DB 검증 공백

재연 owner transaction에서 DELETE FROM u1_request_key WHERE request_id=$1로 해당 후보 키만 제거했다. 제품 지문 a6c63e3f9eef49ea93a7920680e570440e10aaa095df9f7f8fa6fd76789cd115와 변경 8개 파일 SHA-256은 전후 동일하며 통합 시험 지문은 893ae772fa8baea7719b5c83b6ab1150fc896e46cc24b87f94297a70505e6519이다. TypeScript 종료 코드 0, 새 통합은 2/3 PASS·1 FAIL·pending 0이다. root가 applied-terms-model-replay-key-fixed-integration-20261012.json의 실제 count/success를 확인했다. ESLint는 실패 후 중단했다.

이제 전체 payload의 정상 재연은 수행됐으나 음성 DB append 검증에서 거절을 기대한 변조가 받아들여졌다. 현재 recovery-migration의 SQL 검증은 row schemaVersion2의 data.modelVersion2를 요구하는 방향만 검사한다. 복수 row2 payload에서 한 행의 메타데이터만 row1로 낮추고 실제 데이터는 modelVersion2로 두면 나머지 row2가 남아 wrapper 검사를 통과할 수 있다. decodePayload는 이 불일치를 거절하지만 SQL admission의 반대 방향 검사에 공백이 있다. 기존 migration 시험은 row2의 data를 modelVersion1로 낮추는 반대 사례를 검사해 이 경우를 발견하지 못했다. 새 음성 시험을 보존하고 legacy row1/RequestKey의 호환성을 유지하는 양방향 검증을 확인·수정해야 한다.

## 최종 검사

recovery-migration.ts의 기존 version IF에 row.schemaVersion1 AND data.modelVersion2를 거절하는 OR EXISTS 한 줄만 추가했다. wrapper1/2 모두에서 버전2 원상을 row1로 표시하는 우회를 차단한다. 구형 marker 부재·RequestKey1·정상 혼합/새 source/wrapper 규칙은 유지하며 새 음성 DB assert도 보존한다. SQL 파일 SHA-256은 ec5bbc2107f404bd445c5591b9a5b60bb7c0e6221bb1997652624078727b8604이다.

최종 제품/source 지문 64de403c6e1da04093c386a44db963cadc2500ed50f32868783c57486420e834와 변경 9개 파일 SHA-256은 검사 전후 동일했다. root가 아래 두 JSON의 실제 count/success를 확인했다.

| 최종 검사 | 실제 결과 |
| --- | --- |
| TypeScript | 종료 코드 0 |
| 적용 모델·migration | 14/14 PASS; applied-terms-model-bidirectional-version-fixed-integration-20261012.json |
| 영향받은 U1 구형 접수 경계 | 선택 3/3 PASS, 나머지 13개는 의도적 미실행; applied-terms-version-legacy-regression-20261012.json |
| 변경 JS/TS 파일 ESLint | 종료 코드 0 |

U1 선택 대상은 recovery.spec.ts의 정상 원자 접수·트랜잭션 실패의 부분 저장 없음·일반 app의 보호 DB 권한 경계다. -t 필터의 13 skipped를 성공 사례로 계산하거나 U1 전체 회귀로 표시하지 않는다. 전체 DR·장시간 부하를 호출하지 않았다. 앞선 단위249 PASS 이후 값/모델/decoder owning 소스·시험은 그대로이며 SQL admission 변경은 실제 DB의 14+3 통합으로 확인했다. 서로 다른 제품 지문의 보고서를 현재 전체 coverage/80%·CI 증거로 합치지 않는다.

실제 명령은 고정 Node PATH의 npx --no-install tsc --noEmit, Vitest tests/u3/vitest.integration.config.ts의 applied-terms-model.spec.ts/migration-compatibility.spec.ts(verification-isolated), tests/u1/vitest.integration.config.ts의 recovery.spec.ts(OMS_U1_DATABASE_PROFILE=verification-isolated, -t '동일 transaction 원본/키|업무 transaction 실패|정상 app은'), 변경 JS/TS별 ESLint다. 모든 실패·최종 보고서를 보존한다. 이 모델/호환 계층의 검증을 통과했으며 후속 실제 적용 서비스로 진행한다.

## 남은 검증

실제 두 변경 유형 적용·고객 동의/현재 권위/보호 접수의 대조·적용 조건 체인·다음 제안 연결과 전체 U3/coverage/CI·별도 검토는 미완료다. Step 11–14는 미완료로 유지한다. 대량 부하·전체 DR·AWS 배포는 수행하지 않는다.
