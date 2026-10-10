# U1 CI와 실제 배포의 준비 경계

`u1-validation.yml`은 PR, main push, 명시 수동 검증에서 같은 lock/Node22.23.3과 실제 설치 보정·합성 PostgreSQL/브라우저/보안/전체 coverage·제품 이미지·전체 규모50분/ACK/복구 보고서를 검사한다. 실패·누락·미실행 보고서는 성공으로 처리하지 않는다. 저장소 읽기만 부여하고 checkout credential을 남기지 않으며 자동 package cache를 끈다. 실제 AWS/DB/Slack/operator secret과 OIDC 배포 권한은 이 검증 job에 없다.

공식 release tag를 GitHub API로 실제 commit에 대조해 checkout6.1.0 `d23441a48e516b6c34aea4fa41551a30e30af803`, setup-node6.5.0 `249970729cb0ef3589644e2896645e5dc5ba9c38`, upload-artifact7.0.0 `bbbca2ddaa5d8feaa63e36b76fdaad77386f024f`를 고정했다. action의 자체 Node24 runtime과 제품 Node22.23.3은 다른 대상이다. 지원 근거는 [checkout release](https://github.com/actions/checkout/releases/tag/v6.1.0), [setup-node release](https://github.com/actions/setup-node/releases/tag/v6.5.0), [upload-artifact release](https://github.com/actions/upload-artifact/releases/tag/v7.0.0)다. 실제 GitHub runner/plan/quota와 workflow 실행 결과는 로컬 소스 시험으로 대체하지 않는다.

도구 bootstrap은 프로젝트 `.runtime`에만 설치한다. Trivy0.75.0의 OS/architecture별 공식 release checksum을 고정해 실제 archive를 검사하고 Semgrep1.180.0을 별도 venv에 설치·버전/전이 Python 목록을 보고한다. 공식 원문은 [Trivy0.75.0](https://github.com/aquasecurity/trivy/releases/tag/v0.75.0), [Semgrep1.180.0](https://pypi.org/project/semgrep/1.180.0/)다. 검사 규칙 원문은 별도 고정 hash로 대조한다. 기존 보안 하한을 완화하지 않는다.

fresh CI는 두 빈 성능 DB를 준비하며 기존 원본/ACK가 있으면 초기화하지 않는다. 작은 검증/E2E는 같은 두 인스턴스 안의 별도 DB에서 실행한다. 전체 profile 시작 후 측정 source/config를 변경하지 않고 종료·독립 ACK/대규모 복구·현재 보안 재대조/실제 허용 업무 재개를 먼저 확인한다. raw credentials/MFA/browser trace/ACK ID/oracle snapshot/비밀 발견 원문은 GitHub artifact에 올리지 않는다.

실제 main→staging 자동 적용/같은 manifest의 production 수동 적용은 CI-03의 실제 OIDC immutable subject/role·GitHub plan/권한·검증 manifest·회사 사설 검사 경로의 등록이 선행되어야 한다. 현재 profile은 합성 synth만 허용하고 API/운영/배포 source는 미등록 상태에서 거절한다. 검증 workflow 실행이나 ECS task 적용 수락은 실제 배포·복구 성공을 뜻하지 않는다. 실제 자원 생성/배포는 사용자 승인과 해당 정확한 manifest가 필요하며 이 작업에서 수행하지 않는다.
