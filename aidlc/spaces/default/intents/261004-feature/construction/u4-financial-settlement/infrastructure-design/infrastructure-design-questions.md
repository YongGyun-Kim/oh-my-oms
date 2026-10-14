# U4 검사·배포 전달 설계 확인

## 적용 범위와 기존 결정

U4는 기존 실행 기반 안의 FinancialSettlement library다. 별도 금융 서비스·AWS 계정·DB/큐·파일 보관 서비스를 새로 선정하지 않는다. 이번 필수 산출물은 cicd-pipeline.md와 traceability.json이며, 별도의 서비스 인프라/모니터링 문서나 실제 IaC 구현을 생성하는 단계가 아니다.

[상세 설계](../nfr-design/security-design.md)의 SD01–SD11과 [논리 구성](../nfr-design/logical-components.md)의 LC01–LC10을 기존 공통 자원/검사에 연결한다. 실제 금융 source profile·원본/보관·회사망/국내 경로·기본 백업/알림 수신/운영 증거와 R-03·기존 U2/U3 위험은 유지한다. 이번 확인은 실제 AWS 배포·검사 실행·위험 해소의 승인이 아니다.

## 현재 구현에서 확인한 근거

- [.github/workflows/u1-validation.yml](../../../../../../../../.github/workflows/u1-validation.yml)은 현재 PR/main push/manual의 pilot-current 검증이다. 유닛 matrix는u1/u2/u3이며 project는 세 기여의 실제 성공·같은 source/전체 제품 분모·필수 보안/동일 image의 격리 실행을 집계한다. U4 job/명령은 아직 없다.
- [.github/workflows/oms-full-proof.yml](../../../../../../../../.github/workflows/oms-full-proof.yml)은 명시적 workflow_dispatch의 기존 U1/U2 전체 후속 검증이다. 대량/50분·전체 복원은 여기에 남아 있다. U4 파일럿 검증 근거로 사용하거나 기본 파일럿에 다시 넣지 않는다.
- [pilot-commands.ts](../../../../../../../../scripts/u3/pilot-commands.ts)와 [ci-pilot-proof.ts](../../../../../../../../scripts/u3/ci-pilot-proof.ts)는u1/u2/u3 scope와 project를 명시하고 source/lock·실행/보고서·전체 커버리지·비민감 결과를 검증한다. 현재 고정 scope/inventory/집계에 U4를 추가하려면 실제 코드/시험 변경이 필요하며 이번 문서는 이를 구현한 결과가 아니다.
- [package.json](../../../../../../../../package.json)은 U1/U2/U3 단위/통합·커버리지와 기존 검사 명령을 제공한다. 존재하지 않는 U4 명령이나 성공 결과를 만들어 기록하지 않는다. 정확한 U4 명령·영향 파일/분모·필수 결과는 Code Generation 계획에서 확정한다.
- [infra/cdk/src/profile.ts](../../../../../../../../infra/cdk/src/profile.ts)는 SYNTHETIC_SYNTH·합성 계정·ap-northeast-2·합성 이미지/망·유한 저장/로그 값을 검증한다. 실제 배포/계정·CIDR·운영 수명이나 용량/비용을 확인한 사실이 아니며 합성 profile을 실제 고객 데이터 경로로 바꾸지 않는다.

## 모호성 분석과 검증 경계

기술·입력·업무 정책은 앞 단계 답변을 재사용하므로 신규 제품 선택 질문은 없다. 아래는 기존 파일럿 검사에 U4 기여와 공유 영향 회귀를 연결할 구체 제안이다. 전체 제품80% 분모·필수 검사/실패 차단·기존 후속 증거의 의미를 유지한다.

R-03은 부분 실패 재시도의 상태 모순이다. NFR 진행을 선택했다는 이유로 해당 시험을 삭제/skip한 뒤 전체 통과라고 표시하지 않는다. 실제 해소/별도 적법한 처리 근거가 없는 미해결·실패·미검증은 결과에 남기며 배포 준비 승인으로 승격하지 않는다. 새로운 U4 경로가 기존 U1/U2/U3 보호/계약을 바꾸면 그 영향 회귀를 함께 검증한다.

## Sources

- [U4 NFR 설계](../nfr-design/security-design.md), [논리 구성](../nfr-design/logical-components.md), [추적표](../nfr-design/traceability.json): SD01–SD11·LC01–LC10·36개 상세 NFR.
- [기능 명세](../functional-design/functional-spec.md), [규칙](../functional-design/rules.md), [기능 검토](../functional-design/reviews/review-02.md): 변경 계약·금액/상태·R-03.
- [공통 계약](../../../inception/contract-design/contract-summary.md), [컴포넌트](../../../inception/domain-design/components.md), [첫 배포 실행 계획](../../../release-planning/first-release-delivery-plan.md): 자원/원본 소유·파일럿/후속 실증.
- 현재 workflow/검사 코드/package/profile의 근거는 위 경로이며, 과거 U3 인프라 문서의 당시 구현 전 설명을 현재 코드 상태로 복사하지 않는다.

## Consolidated Summary Confirmation

- **기존 자원 재사용:** 단일 AWS 계정/CDK·API/worker·primary/보호 DB·Outbox/큐·관측에 U4를 연결한다. 새 금융 서비스/DB/파일 보관·실제 자원 증설/배포를 추가하지 않는다. 이유: U4 library의 의미/정확성을 확장하면서1인 기술 운영 구조를 유지하기 위해서다. 실제 부하·추가 저장/비용 영향은 미확인이며0원이라고 단정하지 않는다.
- **파일럿 CI 확장:** 기존 U1/U2/U3 기여와 영향 회귀를 보존하고 U4 단위/통합·실제 DB의 중복/동시 배분·공통 환불 한도·입력/권한·변경 계약·보호 payload/decoder/replay 호환 검증을 같은 source의 필수 집계에 추가한다. 이유: 신규 금융 코드만 검사하고 공통 계약/보호 경로의 회귀를 놓치지 않기 위해서다. 실제 U4 명령/검사는 아직 구현되지 않았다.
- **집계·보고서 보호:** 전체 작성 제품 코드80% 분모, source/SHA·lock·image·실행/보고서의 연결과 실패/취소/skip/누락 차단을 유지한다. CI artifact에는 허용된 비민감 결과만 올린다. 이유: 오래된 결과/부분 성공·원시 금융 자료를 전체 성공 증거나 공개 진단으로 사용하지 않기 위해서다.
- **호환 전환·되돌림:** U4 신규 계약·호스트/소비자·업무/보조 예약 모델·보호 decoder/replay·DB 유일 제약을 함께 검증한다. 새 접수/식별/예약을 지우는 DB snapshot rollback이나 새 자료를 읽지 못하는 구형 image로의 무조건 되돌림은 금지한다. 이유: 코드 image만 되돌려도 현금/예약·중복 보호가 안전하게 복구되는 것은 아니기 때문이다.
- **후속 실증·미해결 유지:** 대량100k/50분·전체 재해·무중단·장기 실증은 기존 별도 명시 경로/백로그에 남긴다. R-03과 기존 위험·실제 금융 원본/보관·국내 저장/접근/알림 준비는 확인 전 완료로 표시하지 않는다. 이유: 파일럿 범위를 지키면서 필수 안전 의무와 원래 실패/미실증 증거를 보존하기 위해서다.
- **실제 배포 분리:** 지금은 설계·로컬 합성/CI 준비만 다루며 AWS 자원 생성/배포 명령을 실행하지 않는다. 후속 실제 staging/production 준비는 기존 정책과 별도 승인·실제 선행조건 확인을 따른다. 이유: 현재 검증 workflow의 성공을 실제 고객/환경 활성화 승인으로 혼동하지 않기 위해서다.

Does this all look correct before I generate the artifact?

- Looks correct
- Request changes

[Answer]: Looks correct
