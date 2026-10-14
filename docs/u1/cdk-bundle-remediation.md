# CDK 설치 보정과 독립 실물 검사

CDK2.272.0의 bundled brace-expansion5.0.9에는 GHSA-qhr7-859c-m2p7(high), GHSA-6j4f-fj2g-mc7p(high), GHSA-q2hr-2g5m-vwhr(moderate)가 남아 있다. 수정 패키지5.0.12를 exact dev dependency로 설치하고, 매 npm install/ci 후 기대 CDK/bundle/version·realpath·symlink를 확인한 한 디렉터리의 취약 코드를 실제 제거한다. bundled minimatch가 root의 실제5.0.12와 공식 배포 코드 SHA256을 해석하는지 검증한다. lock entry만 없애거나 version을 바꿔 경고를 숨기지 않는다.

- 공식 advisory: https://github.com/advisories/GHSA-qhr7-859c-m2p7 및 https://github.com/advisories/GHSA-q2hr-2g5m-vwhr
- 참고 구현: https://github.com/aws-samples/sample-litellm-bedrock-gateway-on-eks/blob/main/scripts/prune-bundled-cve.js
- 공식 npm5.0.12 tar integrity: sha512-YovQ3rzhaLMIrDjNDMkNS01tea93qhEhG5xy8f6+R0l+dw3Ki+5sCoIoI942iuLZTHWogWktgwVDhU09iNEimQ==
- 공식 dist/commonjs/index.js SHA256: e0ede97c712339a70bae2c96c675b1ffd30052bdf57f37f5a97b5945c40a9ae6

`npm ci --ignore-scripts`는 취약 bundled 파일을 다시 추출할 수 있다. 설치 lock이 깨끗해 보여도 `npm run verify:u1:cdk-bundle`의 실물 검사가 실패해야 한다. synth/security 검사는 이 guard를 독립 실행한다. postinstall 실패를 warning으로 넘기지 않는다. --omit=dev runtime에서 CDK가 실제 없을 때만 설치 보정을 생략하며, 이 경로는 synth/security 통과 증거가 아니다. Docker build는 ci 이전에 보정 스크립트를 COPY한다.

공식 CDK 수정 릴리스가 나오면 새 exact 지원 조합의 fresh ci·실제 loaded source·악성/정상 pattern·전체 audit·U1 synth·SBOM을 다시 검증한 뒤 보정을 제거한다. 현재 설치/호환/전체 audit·최종 보고서 결과는 각 실제 실행 보고서로 확인하며 문서 자체가 통과를 뜻하지 않는다.

npm10.9.9의 CLI `--omit=dev`는 lifecycle에 npm_config_omit를 자동 전달하지 않는 것으로 Docker에서 관측했다. runtime install은 동일 값 `npm_config_omit=dev npm ci --omit=dev`를 명시적으로 전달한다. build/security/synth는 전체 설치와 독립 실물 guard를 유지한다. .next cache와 BUILDPLATFORM node_modules를 runtime 복사 전에 제거하고 runtime에서 해당 target native dependency를 새로 설치한다.
