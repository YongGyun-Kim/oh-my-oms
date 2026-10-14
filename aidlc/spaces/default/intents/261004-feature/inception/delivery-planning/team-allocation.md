# OMS 개발 묶음별 작업 소유

## Staffing and Responsibility

Bolt는 하나의 구현 단위를 설계·구현해 실행 결과로 확인하는 개발 묶음이다. Q5의 선택에 따라 개발자1명이 실제 기술 작업과 검토/승인을 책임지고, AI의 설계·구현·품질 역할과 이번 세션에서 전체 작업을 이어간다. 협업 역할 묶음(mob)은 같은 실행 결과를 함께 만드는 역할 조합이며 실제 여러 직원/팀의 확보를 뜻하지 않는다. Team Formation은 현재1인 프로젝트의 단계 조건에 따라 생략됐다. [S5·S9–S10]

기능 범위는 그대로 유지한다. 사람 작업/반복 운영·실패/미해결 누적을 측정해 구조를 개선하며 인원 수를 기능 제외 근거로 쓰지 않는다. 기술 작업 소유와 기업 확인·상품/계약 운영·서로 다른 계약 승인자의 업무 권한/실제 인력 확보를 구별한다.

## Bolt Allocation

| Bolt | Unit / Directory | 실제 기술 책임 | AI 구현 역할 | 설계·검증 초점 |
|---|---|---|---|---|
| B01 | U1 / u1-integrated-foundation | 개발자 | aidlc-developer-agent | 기반 연결·보존·권한/최소 UI |
| B02 | U2 / u2-identity-enterprise-access | 개발자 | aidlc-developer-agent | 신원·기업/조직·행위 권한 |
| B03 | U3 / u3-commercial-ordering | 개발자 | aidlc-developer-agent | 상품·계약·주문 수락 |
| B04 | U4 / u4-financial-settlement | 개발자 | aidlc-developer-agent | 금액·배분·환불/후불 |
| B05 | U5 / u5-hardware-fulfillment | 개발자 | aidlc-developer-agent | HW 수량·공급·완료/회수 |
| B06 | U6 / u6-software-lifecycle | 개발자 | aidlc-developer-agent | SW 수량·기간·갱신/회수 |
| B07 | U7 / u7-after-sales-inquiry-notices | 개발자 | aidlc-developer-agent | 후속 판단·조합 조회·통지 |
| B08 | U8 / u8-customer-ui | 개발자 | aidlc-developer-agent | 고객 전체 PC 화면/API |
| B09 | U9 / u9-staff-ui | 개발자 | aidlc-developer-agent | 직원 전체 PC 화면/API |
| B10 | U10 / u10-operational-assurance | 개발자 | aidlc-developer-agent | 전체 기술 운영 증거·진단 |

전 단위의 구현 역할은 aidlc-developer-agent다. 현재 이 배정은 예정된 책임이며 작업/검사 완료 기록이 아니다. 각 단계의 실제 실행·검토 방식은 해당 단계가 정한다.

## Stage Expertise and Human Decisions

| 작업 | AI 책임 역할 | 개발자의 확인/책임 |
|---|---|---|
| 기능·데이터·전이/산식 및 계약 소비 설계 | aidlc-architect-agent, 필요한 aidlc-developer-agent 관점 | 미정 정책·원본/권한·변경 경계를 확인하고 설계를 승인 |
| NFR·보안·정확성/복구·운영 부담 설계 | aidlc-architect-agent와 해당 보안/품질/운영 관점 | 정의한 목표·장애 범위와 실제 시험/측정 조건 확인 |
| AWS/CDK·망/저장·실행 환경 설계 | aidlc-aws-platform-agent와 해당 보안 관점 | 실제 계정/접근/한국 저장 근거·변경/배포 조건 확인 |
| 코드/계층별 test-after 구현 | aidlc-developer-agent | 구현 계획·검증 명령의 별도 승인, 실제 변경과 결과 검토 |
| 종합 Build and Test | aidlc-quality-agent와 해당 보안 관점 | 커버리지·AC·필수 검사 실패/누락과 남은 통합 증거 처리 |
| CI/배포 경로 | aidlc-pipeline-deploy-agent | 필수 검사 전 병합/배포 보류, staging/production 확인 |
| 관측·복구·기술 운영 검증 | aidlc-operations-agent와 해당 플랫폼/품질 관점 | 시도/실패 알림·복구·30일 관측·사람 작업과 예외 기록 |

역할은 전문성 배치이며 새로운 사람 채용/외부 발주·자동 진행 권한이 아니다. 단계가 선언한 독립 검토와 보호된 승인도 해당 실행에서 수행한다. 일반 완료 확인의 자동 진행은 첫 실제 통합 버전 승인 뒤 별도 선택한다.

## Component and Change Ownership

| 원본/코드 책임 | 확장 Unit | 공통 경계 |
|---|---|---|
| IdentityRecovery, EnterpriseAccess | U2 | U1 최소 구현 확장; 신원/역할 관리가 모든 업무 권한을 주지 않음 |
| ProductCatalog, CommercialAgreement, OrderAcceptance | U3 | 상품/계약/주문 원본·제안/동의; 다른 소유자의 원본 직접 변경 금지 |
| FinancialSettlement | U4 | 금액·배분/환불·후불, 제한된 제공 건 조회 |
| HardwareFulfillment | U5 | HW 공급/수량·예약/배송/인수·회수 원본 |
| SoftwareLifecycle | U6 | 기업 권한/수량·계약/실제 기간·갱신/회수 원본 |
| AfterSalesDecision, WorkInquiry, NotificationDelivery | U7 | 후속 판단·허용 원본 조합 조회·최소 통지; 거래 원본/중앙 실행 조정자로 확대하지 않음 |
| CustomerUi | U8 | 고객 입력/표시·허용 API 연결; 업무 원본 쓰기 권위는 해당 업무 소유자 |
| StaffUi | U9 | 직원 입력/표시·허용 API 연결; 망/행위 권한·별도 승인 강제는 서버 경계 |
| OperationalAssurance | U10 | 진단·접수/결과 대조·운영 증거 평가; 실제 관측/배포 도구와 구별 |

U1은 여러 논리 소유자의 최소 업무 구현과 UI/API/worker·계약/등록·지속 처리 기반을 연결한다. U1을 모든 원본의 새 소유자로 만들지 않는다. U2–U10은 같은 책임의 규칙/등록·스키마·화면을 확장한다. 실제 언어/파일 배치 뒤 각 Unit의 변경 파일·공통 접점·시험을 해당 구현 계획/변경 소유 기록에 명시하고 직렬 작업 중 기존 변경을 보존한다. 라이브러리6개가 각각 네트워크 서비스로 배포되는 것은 아니다. [S4–S8]

## Handoffs and Checkpoints

- 한 단위의 해당 설계·코드/실행 검증을 마치고 다음 단위로 진행한다. 의존 준비가 없으면 그 경로의 진행을 보류하며 범위 밖 다른 업무를 일괄 정지하지 않는다.
- 첫 실제 통합 버전(walking skeleton)은 B01의 신원/MFA·기업/상품·접수/지속 기록·재조회와 최소 실행 연결이다. 검증 명령은 아직 없으며 실제 명령이 준비된 뒤 최초 검증 전에 전체 내용을 별도 승인받는다. 실제 통합 결과와 사용자 승인 전에는 다음 단위를 시작하지 않는다.
- 신원/계약/기간/금액/수량의 OQ와 실제 제공자 조건은 해당 설계·코드/구현 약속·실거래 전에 확인한다. 후속 공급자가 없어 합성 계약으로 검증한 경계는 B04–B09의 실제 등록/결과 왕복에서 다시 확인한다.
- 제품 코드/CI·보안/배포 검토와 예외 처리 책임은 개발자다. main 기준의 짧은 브랜치·squash, 필수 검사·staging 자동 배포·production 별도 승인을 유지한다. 실제 제공자/인력 준비는 [외부 의존성](external-dependency-map.md)을 확인한다.

## Business Approval and Readiness

기업/첫 관리자 확인, 계약 조건 등록/승인, 실제 이행/지급 근거, 지원 연락의 실제 담당자는 아직 확보 사실이 없다. 사용자·개발자의 조정 책임과 외부 업무 주체의 미확인 상태를 분리한다. 계약 조건의 등록자와 승인자는 다른 사람이어야 하며 같은 사람의 다른 계정도 금지한다. 승인자 부재 시 미승인 상태를 유지한다. SW 기간 조정은 두 권한을 가진 같은 사람의 별도 승인 허용을 유지한다. [S1·S4·S8; ED03·ED18]

합성 테스트 계정으로 승인/거절 규칙을 시험하는 것과 실제 사업 담당자를 확보하는 것은 별도 증거다. 실제 고객/거래·운영 지원을 포함한 상용 준비는 사용자와 해당 확인자가 근거로 판단한다.

## Assumptions & Open Questions

- [assumption] 개발자와 AI의 역할 조합으로 전체 기능·필수 검증·반복 기술 운영을 수행할 수 있다. 실제 재작업/사람 작업·실패/지원 빈도와 누적으로 검증한다.
- 추가 팀/외부 사람·투입 가능 시간·대체 운영 담당자·사업 승인자/지원 시간은 미확인이다. 여러 팀 독립 소유나 팀별 확인 주기로 바꾸는 선택은 받지 않았다.
- 실제 코드 파일 소유·CI/검사 도구·명령·제공자·운영 경로는 해당 후속 설계/구현 전에 구체화한다. 현재 source-manifest나 런타임 배치를 만든 상태가 아니다.

## Sources

- S1: [requirements](../requirements-analysis/requirements.md) — 16개 기능 영역·58개 세부 기능·14개 NFR, 제외 범위와 OQ1–OQ10.
- S2: [stories](../user-stories/stories.md) — 69개 사용자 스토리·227개 수락 기준, 모두 첫 제품 포함.
- S3: [mockups](../refined-mockups/mockups.md) — 고객/직원 PC·화면·상태·권한·접근성 경계.
- S4: [components](../domain-design/components.md) — 14개 논리 책임·원본 소유와 외부 의존.
- S5: [unit-of-work](../units-generation/unit-of-work.md) — 10개 구현 단위·종류·첫 통합 실행 범위·구현 전 확인.
- S6: [unit-of-work-dependency](../units-generation/unit-of-work-dependency.md) — 43개 개발 선행 관계와 독립 집합.
- S7: [unit-of-work-story-map](../units-generation/unit-of-work-story-map.md) — 스토리별 주 책임과 협력·전체 통합 완료 조건.
- S8: [contract-summary](../contract-design/contract-summary.md) — 44개 재사용 계약, 81개 상위 관계와 추가 대조 읽기 2개, 대상 전달·원자 기록·제공/정정/호환 경계.
- S9: [team-practices](../practices-discovery/team-practices.md) — 1인 개발/기술 운영 목표·최소 통합 동작·test-after/Standard/80%·필수 검사와 배포 관행.
- S10: [확인된 답변](delivery-planning-questions.md) — Q1–Q5 모두 A, 별도 Looks correct. 이 문서는 계획이며 구현/운영 달성의 증거가 아니다.

