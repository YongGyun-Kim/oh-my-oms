# 관행 결정의 근거와 검토 의견 처리

> Step 5 최종 통합본. Q1–Q8과 별도 `Looks correct` 요약 확인을 반영했다. 이번 관행 승인·메모리 승격·단계 완료 및 실제 검사·배포 실행은 별도다.

## Sources

| ID | 자료 | 근거와 한계 |
|---|---|---|
| E1 | `aidlc/spaces/default/memory/org.md` — 전달된 전체 규칙 | 최초 다섯 영역 기본 제안. 기존 팀의 실행 실적이 아님 |
| E2 | `aidlc/spaces/default/memory/team.md` | 최초 확인 당시 다섯 영역은 주석 템플릿 |
| E3 | `../../aidlc-state.md`, `.codex/scopes/aidlc-feature.md` | Greenfield·feature·Standard, skeleton on 기본값 |
| E4 | `aidlc/spaces/default/memory/project.md` — 전달된 전체 규칙 | 1인 인력에 따른 기능 자동 축소 금지·1인 수행 목표의 기존 원칙 |
| E5 | [승인 인계 결정](../../ideation/approval-handoff/decision-log.md), [이니셔티브 요약](../../ideation/approval-handoff/initiative-brief.md) | 인력·AWS/CDK·제품 경계와 열린 HB 조건. 담당 역할 제안은 인력 확보 증거가 아님 |
| E6 | `.codex/aidlc-common/stages/inception/practices-discovery.md`, `.codex/aidlc-common/protocols/stage-protocol-ensemble.md` | 리드 초안·지원 검토·인터뷰·최종 통합 책임과 산출물 형식 |
| E7 | [인터뷰](practices-discovery-questions.md) | Q1–Q8 모두 A 선택, 별도 요약 확인 `Looks correct` |
| E8 | [품질 검토](contributions/aidlc-quality-agent.md) | 단위·통합 최소 범위, 실패 차단, 커버리지 범위 보완 |
| E9 | [개발 검토](contributions/aidlc-developer-agent.md) | 기존 오류 처리·파일·의존 경계 표준의 유무 확인 |
| E10 | [보안 검토](contributions/aidlc-devsecops-agent.md) | 보안 검사·예외·공급망·비밀 대응의 책임과 후속 세부화 |

`.codex/`와 `aidlc/`로 시작하는 경로는 저장소 루트 기준이다. 전체 `../../.aidlc-engine/practices-brief.md`를 최초 작성과 통합 시 읽었다. 리드의 공통 지식 Markdown 9개와 배포 지식 3개를 읽었으며 공간별 해당 두 지식 디렉터리에는 Markdown이 없었다. 지식의 예시 제품·수치를 팀 결정으로 채택하지 않았다.

요약 확인 권한은 부모 실행자가 성공 기록한 `SUMMARY_CONFIRMATION_RECORDED` 식별자 `8f845472438b6a566ee27132565762b612abbd797993606003f3dca68394034a`로 전달받았고, 질문 파일의 `Looks correct`와 함께 통합 근거로 사용했다. 이는 최종 관행 승인·승격 영수증이 아니다.

## 인터뷰 결정과 반영

| 답변 | 결정 | 반영 |
|---|---|---|
| Q1 | 짧은 브랜치·main squash 병합, 개발자 본인 검토 | Way of Working |
| Q2 | 최소 전체 동작 버전을 먼저 검증, 전체 기능 범위 유지 | Walking Skeleton |
| Q3 | 계층별 구현 후 테스트, Standard 단위·통합 유지 | Testing Posture의 Methodology·Ordering |
| Q4 | 제품 전체 80%, 미실행 파일 포함·제외 근거·수락 기준 추적 | Testing Posture 및 강제 조건 |
| Q5 | 병합 후 staging, 본인 승인 후 production, 긴급 수정·복구 이력 | Deployment |
| Q6 | 기존 표준 없음, 언어 관례·동일한 로컬/CI 설정 | Code Style |
| Q7 | 비밀·SAST·의존성·CDK/생성 인프라·격리 서비스 보안 검사 필수 계획 | Testing Posture 및 강제 조건 |
| Q8 | 본인 책임, 실패·누락 차단, 보안 예외 기록·비밀 대응 | Way of Working·Deployment 및 강제 조건 |

## 지원 검토의 OBJECT 처리

아래는 리드의 통합 판단이다. 지원 담당자의 재검토·승인을 새로 받았다고 주장하지 않으며 원래 기여 파일을 보존한다.

| 담당·의견 | 답변 또는 후속 처리 | 현재 상태 |
|---|---|---|
| 품질: Standard 단위·통합 범위 누락 가능 | Q3와 요약 확인을 근거로 두 종류를 명시 | 문서 보완 완료 |
| 품질: CI 실행만으로 실패·미실행 차단이 불명확 | Q8의 실패·미실행·보고서 누락 차단, 불안정 테스트 및 하한 완화 금지 반영 | 관행 결정 반영; 실행 설정은 품질·배포 역할의 Build and Test·CI Pipeline에서 검증 |
| 품질: 80% 산정 범위·제외 근거 부재 | Q4의 제품 전체·미실행 분모·제외 사유 반영 | 범위 원칙 결정; 개발·품질 역할이 Code Generation·Build and Test에서 측정 설정·보고 재현성 확인 |
| 개발: 오류 처리·파일·의존 경계 질문이 포괄적 | Q6에서 기존 표준 없음과 후속 설계 선택 확인 | 질문 해소; 아키텍처·개발 역할이 Contract Design·Functional Design에서 오류·경계·배치 결정 |
| 보안: 차단선·미실행·예외 책임 미정 | Q7–Q8로 필수 계획·차단·본인 책임·예외 기록 반영 | 원칙 결정; 보안·품질·배포 역할이 NFR Requirements·NFR Design·CI Pipeline·Deployment Pipeline에서 대상·시점·차단선 확정 |
| 보안: 공급망·비밀 책임·주기 누락 | Q8로 본인 책임과 비밀 폐기·교체·영향 확인 반영, 정기 주기는 후속 결정으로 명시 | 책임 결정; 운영·보안 역할이 Incident Response·Feedback and Optimization에서 변경 검토·재검사·예외 재검토 주기와 대응 절차 확정 |

## 후속 결정과 검증 책임

담당은 개발자 1명이 수행하거나 검토할 역할을 뜻하며 별도 인력 배정을 의미하지 않는다.

| 미정 사항 | 담당 역할·단계 | 결정·검증 시점 |
|---|---|---|
| 첫 최소 업무 흐름·실제 검증 명령 | 제품·아키텍처·품질 / Requirements Analysis·Units Generation·Delivery Planning 및 Construction 검증 | 첫 구현·검증 계획 전에 흐름을 정하고 사용자 승인 명령으로 동작 확인 |
| 수락 기준·실패·중복·시간 경계·기업/직원 접근 검증 | 제품·보안·품질 / Requirements Analysis·Contract Design·Build and Test | 업무 기대 결과를 정한 뒤 검사 설계; HB-02·HB-05·HB-06 연결 |
| 테스트 도구·산정 설정·재현 가능한 데이터·불안정 검사 수정 기한 | 개발·품질 / Code Generation·Build and Test·CI Pipeline | 필수 검사 적용 전에 명령·설정·담당·기한 구체화 |
| 보안 도구·대상·차단선·필수 실행 시점·예외 검토 절차 | 보안·품질·배포 / NFR Requirements·NFR Design·CI Pipeline·Deployment Pipeline | 해당 병합·배포 검사 적용 전 확정; 미정 기준을 통과 처리하지 않음 |
| 환경·핵심 동작 확인 시점·복구 방법·배포 권한·비밀 접근 | 플랫폼·배포·보안 / Infrastructure Design·Deployment Pipeline·Environment Provisioning | 실제 환경 적용·운영 배포 전에 설정과 검증 근거 확보 |
| 외부 도구/의존성 변경 검토·정기 검사·예외 재검토 주기, 공급망 증거 수준 | 운영·보안·배포 / Deployment Pipeline·Incident Response·Feedback and Optimization | 운영 적용 전에 절차 확정; 출처·버전·산출물 연결·SBOM 필요 수준은 검토 후보이며 현재 확정 의무 아님 |

## Assumptions & Open Questions

- HB-01–HB-08은 열린 상태다. 합성 테스트·모사 응답·커버리지·문서 승인으로 실제 고객·연동·접근권·계약·실데이터·운영 검증을 대체하지 않는다.
- 보안·검사 운영의 원칙과 책임은 선택됐으나 도구·수치·주기·구현 결과는 아직 없다. 실제 개발·운영 부담은 HB-08로 검증한다.
- 기존 프로젝트 Corrections의 1인 수행 원칙은 유지하며 승격 대상 강제 규칙에 중복 추가하지 않았다. AWS·CDK 외 기술·아키텍처를 선택하지 않았다.
- 현재 통합본의 관행 승인·메모리 승격·단계 완료는 부모 실행자의 후속 절차다.
