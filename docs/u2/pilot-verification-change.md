# 첫 버전 파일럿 검증 기준 변경

2026-10-10 사람의 명시적 목표는 고객사10곳·일주문1000이다. 이는 실제 고객·수요 관측이 아니다. 사람은 `파일럿 기준 변경 진행`을 선택하여 아래 합성 검증 가정과 기존 확장 시험의 연기를 지시했다. 이 기록은 기존59항목의 protected Plan Approval이 변경 내용을 승인했다는 뜻이 아니다. 현재 계획/지침은 native effective-fence 검증으로 실행 허용을 확인하고 tool-produced brief로 전달한다.

현재 실행 정의의 단일 원본은 [runtime-profile.json](runtime-profile.json)의 `measurementProfile`이며 식별자는 `u2-pilot-v1`이다. 누적주문10000은 목표10일분, 상품1000·고객계정100·내부계정10·활동세션20은 검증 가정이다. 정상5req/s5분→집중20req/s1분→정상5req/s회복2분/유지2분으로 총10분을 검증한다. 요청률은 일주문량과 같지 않으며 사업·서비스 상한이 아니다.

읽기80/변경20, 평균5/최대50품목, 읽기p95≤1초·변경p95≤2초·정상 기술 오류율≤0.1%, 처리 정확성 위반0·성공접수 유실/중복0·권위 부활0·등록 fault 복구 RTO30분/RPO0, 전체 직접 testable 제품 source80%(미실행 파일 포함), 보안 필수검사·pool32+32·기존 기한/시도 상한은 유지한다. 현재 source의 실제 HTTP/보호 receipt/Work/독립 ACK 및 같은 이미지 근거가 필요하다. 작은 선택 검사로 전체 증명을 대신하지 않는다.

## 상위 원문과 적용 경계

다음 frozen 원문은 수정하지 않는다. 기존 규모는 `deferredExpansionProfile`로 보존하며 이 변경은 U2 첫 버전 완료 gate의 검증 profile만 구분한다.

| 원문                                                                          | 기존 기준/현재 연결                                                                       |
| ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| inception/requirements-analysis/requirements.md NFR7·합성 시험표207,220–223행 | 기존 합성100기업/1000고객/10000상품/100000주문·100활동세션·50분을 후속 확장 검증으로 보존 |
| U2 nfr-requirements/security-requirements.md NFR7.1                           | 합성 규모/경로의 현재 적용 기준을 이 파일과 P10에 연결                                    |
| U2 nfr-design/logical-components.md LC04 95–97행·NFR7.1                       | pilot와 확장을 구분하고 실제 owner/HTTP/현재 권위 혼합 경로를 유지                        |
| U2 infrastructure-design/cicd-pipeline.md IP06 111행·NFR7.1                   | 같은 pilot의 자원·시간·현재 source/image 측정 및 CI/release 판정 연결                     |
| U2 code-generation/code-generation-plan.md P10 / unit-test-instructions.md    | 준비→수집→복구→release 모두 같은 정의/식별자를 소비하며 다른 규모의 자료를 합치지 않음    |

## 후속 확장 검증과 열린 증거

기존100000주문·50분은 첫 버전 완료 gate의 필수조건에서 연기한다. owner는 개발자·품질/인프라 검증이며, 확장 출시 또는 실제 수요/연결/데이터가 pilot 가정을 넘어설 때 다음 실행 전에 profile·환경·실행 조건을 검토하고 사람의 실행 범위 결정을 받는다. 연기는 확장 성능 충족, 사업 규모 제한 또는 위험 수용이 아니다.

source792의50분 FAIL, a90의 prepare 실패, source2da56c5e의 사용자 검토 interruption(exit143), incomplete coverage, 미실행 부하/복원은 원래 source와 exact bytes/hash를 유지한다. 원래 U1 상세563건과 첫 SAST 상세JSON의 provenance gap 두 건 및 U1 R01/R02는 OPEN이다. 실제 AWS/Cognito/사내망/국내 경로/수신자·법적 근거는 미검증이며 real activation HOLD를 유지한다.
