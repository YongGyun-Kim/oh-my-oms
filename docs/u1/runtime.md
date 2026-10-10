# U1 실행과 실제 활성화 경계

프로젝트 전용 검증 runtime은 Node22.23.3/npm10.9.9다. 이 장비의 실제 경로는 `/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin`이다. 예: `PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH npm run test:u1:integration` . 전역 Node를 변경하지 않는다. Fargate target은 linux/amd64다.

Docker builder와 target dependency 설치 단계는 공식 Node22.23.3-bookworm-slim manifest `sha256:c3de60bf2f9dd0ac6370e6117950ff62d6e339527e7472301c9c78a017978392`를 사용한다. 최종 실행 이미지는 `gcr.io/distroless/cc-debian13:nonroot@sha256:e792ab3d241a468a4fd7519ddbbebe66b49b5f365771716ea688ad40b6c6f1c2`이며 앞 단계의 공식 Node22.23.3 binary와 target-platform dependency만 복사한다. 최종 이미지에 npm·개발 도구·shell을 복제하지 않는다. Google의 keyless 서명은 issuer `https://accounts.google.com`, identity `keyless@distroless.iam.gserviceaccount.com`으로 확인한 `.reports/u1/distroless-signature.json`에 보존했다. 관련 공식 자료는 [distroless](https://github.com/GoogleContainerTools/distroless)다.

초기 bookworm 실행 이미지의 Trivy 결과 high63/critical4는 실패 원문으로 보존한다. distroless 실행 이미지의 실제 전체 OS/라이브러리 재검사는 high0/critical0, medium23/low8이며 lower finding도 `.reports/u1/container-security.json`에 그대로 남긴다. source/image 변경 뒤 마지막 전체 검사를 다시 확인해야 하므로 중간 이미지 검사를 최종 body 전체 통과로 전용하지 않는다.

- 로컬 DB: `node --import tsx scripts/u1/local-databases.ts` . 두17.11 DB·별도 실제 볼륨/port·durability를 준비하고 비밀은 git 제외600파일에 생성한다.
- 합성 시연: `OMS_U1_SYNTHETIC_PROFILE=approved-local-only NODE_ENV=test node --import tsx tests/u1/fixtures/local-service.ts --reset-synthetic` . 합성 DB만 초기화하며 실제 기업/사람/provider/회사망 성공을 뜻하지 않는다.
- UI 개발: `npm run dev:u1:customer`/`dev:u1:staff`와 명시적인 로컬 BFF origin/API 설정. 테스트 browser는 `PLAYWRIGHT_BROWSERS_PATH=.runtime/u1/playwright` .
- 운영 API: `npm run start:u1:api` . NODE_ENV=production, 실제 별도 pool/client·TLS identity·CA·제한 DB URL·서버 key/origin가 없으면 시작하지 않는다. 자동 migration/seed/grant는 없다. 현재 회사 ingress 및 기업 확인 profile 미등록은 실패/미확인으로 유지한다.
- 운영 worker: `npm run start:u1:worker` . Nest standalone·제한 업무/append DB URL·CA와 등록 Standard consumer queue를 요구한다. HTTP guard를 상속한다고 가정하지 않는다. 원래 Work/현재 permit·누적 예산·보호 ACK/효과를 사용하며 실패는 대조 이벤트로 기록한다.
- 운영 UI: 각 `apps/{customer-web,staff-web}/server.ts` . task-local 실제 TLS 종료·host 확인과 Next 공식 custom-server API를 사용하며 standalone tracing과 결합하지 않는다. HTML/RSC는 nonce CSP/동적/no-store다. certificate/key는 별도 목적 Secret/엄격 파일권한에서 받는다.

`OMS_TLS_KEY_PEM`/`OMS_TLS_CERT_PEM` 또는600키파일/인증서파일을 사용한다. 이름·유효기간·키일치·RSA2048+/P256/P384·TLS1.2/1.3를 확인한다. TLS 검증은 해제하지 않는다. 공용 RDS 서울 CA bundle SHA256은913fb5b814f17af79d4c1622584a8d0ceddf5b0d76fe353d0c7d1186cdd6b229이며 출처는 https://truststore.pki.rds.amazonaws.com/ap-northeast-2/ap-northeast-2-bundle.pem 이다. 실제 도메인/chain/회전 및 SDK/BFF host 검증은 실제 환경 전에 별도 검증한다.

DB app/append 계정은 admin secret과 다르다. explicit DDL/owner 실행 후 최소 SQL role을 준비해야 하며 실제 secret의 URL·RDS CA·secret version·certificate는 console/승인된 운영 절차로 등록한다. synthetic CDK Secret·placeholder digest는 준비 완료가 아니다. 기존 Receipt/history/Work/Fact/after-image와 epoch/prefix를 유지하고 rollback/복구로 옛 grant·파기 자료·외부효과를 부활시키지 않는다.

현재 실제 계정/AZ·회사 연결/입장회수·Cognito 최초/제거 관측·기업/위임 수용 기준·자료 보관/파기/국내 경로·Slack/email 실수신/ACK·비용/1인 운영·부하/30분복구 근거는 미확인이다. 관련 실연동·실계정·실거래·직원 출시 전에 차단한다. 로컬 성공이나 synth를 실제 배포/가용성/운영 증거로 쓰지 않는다.

Apple ARM 위에서 QEMU amd64 Next build는 빌드 결과 표시 후 종료139를 재현했다(Turbopack/webpack 모두). Docker build 단계는 BUILDPLATFORM의 공식 같은 Node patch에서 JS 산출물을 만들고, runtime 단계는 linux/amd64에서 `npm ci --omit=dev`로 해당 native dependency를 별도 설치한다. Next config는 production에서 compiler를 다운로드/설치하지 않는 정적 .mjs다. 실제 x86 실행/배포 증거와 Apple QEMU 한계는 분리하며 종료 실패를 성공으로 무시하지 않는다.

실제 local container에서 Node22.23.3/linux-x64·x64 native SWC/esbuild·두 Next native 산출물의 ELF machine62를 확인했다. task listener8443과 browser publicOrigin443은 별도 값이다. HTTPS server가 고정된 public Host를 대조한 뒤 Next의 advertised scheme/host/port를 구성하며 임의 client forwarded 값으로 실제 직원망/인증을 만들지 않는다. CA/hostname 검증·HTML200·nonce CSP/no-store·미등록 backend503 음성 사례는 `container-web.json`에 있다. 등록된 합성 API/worker와 연결한 양성 container 전체 업무 경로는 별도 증거가 필요하다.
