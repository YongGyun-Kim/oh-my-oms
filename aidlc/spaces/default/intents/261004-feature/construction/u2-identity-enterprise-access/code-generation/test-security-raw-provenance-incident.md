# 보안 검사 상세 원본 보존 간극 및 Docker NoSpace 보호 기록

## 상태와 정정

- **OPEN**: 최초 SAST 실패의 상세 JSON 원본은 현재 확인한 범위에서 미복구다. 외부 백업 존재 여부는 미확인이다. 뒤의 clean 결과나 요약을 최초 상세 원본으로 대체하지 않는다.
- 앞선 “원문 보존” 안내는 당시 실제로 해시 이력에 보존된 **stage receipt·security summary·project log**에 한정해 정정한다. scanner 하위 상세 원본까지 보존됐다는 표현은 정확하지 않았다.
- 현재 Docker NoSpace 실행의 receipt·summary·로그·존재하는 scanner raw는 아래처럼 exact bytes로 보존했다. 이는 이전 SAST 상세 원본 복구, 사고 해소, 위험 수용 또는 Unit 완료를 뜻하지 않는다.
- 기존 U1 상세 보고서 미복구 사고는 [별도 기록](test-report-isolation-incident.md)의 OPEN 상태로 유지한다. 과거 U1 상태·검토·측정 및 원래 보고서를 수정하지 않았다.

## 최초 SAST 실패에서 남은 증거

sourceDigest: `482018802f351170db79655c1f45d7e9ee37713b2f417180a5665e16f66ad8e8`.
실제 명령 `npm run security:u2`는 2026-10-10T02:46:10.622Z–02:46:16.901Z에 실패했다.

- `.reports/u2/history/54c718980c9f0dcee5ee4698f32a56856e3df04cb51a79bcf3f4293248b46771-validation-source.json`: 원래 source와 실패 명령·시간·summary hash의 stage receipt.
- `.reports/u2/history/34363b9e10aa01e646028000f9a4d9a2898288bac7b169878ab7ce81332f2d2b-security.json`: 실패 summary. 상세 SAST JSON의 사본이 아니다.
- `.reports/u2/history/c6d8775e355a2ad780523d8a64613c20a63ac47127affa1b86190b0d6347df1c-project-security.log`: 원래 SAST 발견/검사 오류로 stage가 실패한 로그. 상세 결과 전체가 아니다.
- 당시 읽기 도구 출력에는 `gcm-no-tag-length` 발견 3건(`apps/api/src/u2-authentication.ts:331`, 같은 파일`:514`, `packages/core/src/enterprise-query.ts:258`)과 `PartialParsing` 2파일(`packages/core/src/enterprise-invitations.ts:315`, `scripts/u2/performance.ts:1426/1466`)의 metadata가 남아 있다. 이 대화 metadata는 원래 상세 JSON bytes/hash/전체 scanner 관측의 대체물이 아니다.

bounded 확인 범위는 현재 `.reports/u2/sast.json`, `.reports/u2/history/`의 파일명 inventory 및 해당 source의 validation receipt/security summary/project log, 후속 `.reports/u2/selected/p10-fixed-gcm-sast.json`이다. 이 범위의 history에는 최초 `sast.json` 상세 사본이 없다. 후속 selected/current clean SAST는 다른 source의 새 관측이다. 저장소 전체·외부 백업에 최초 원본이 없다고 확정하지 않는다.

원인은 `scripts/u2/ci-full-proof.ts`의 보존 호출부가 command 대표 path와 project log를 보존하지만 security runner가 덮어쓰는 하위 `sast.json` 등 raw를 명시하지 않은 것이다. 원래 receipt의 `passed=false`를 고치거나 다른 결과를 복사해 복구로 표현하지 않았다.

## 현재 NoSpace 실행

- sourceDigest: `3614aa22f17ee9b31d32aad465534155f9873cf6d2ef44c8d753da757586dc9a`.
- controller session `41947`은 exit 1로 종료했다. 현재 실행 중 명령은 없다.
- 실제 이미지: `sha256:4f7b7ded15f44168fb00b73edcdbcc6bec6ed86f329fbfca93579428d47a51e5`.
- 실제 실패 명령: `.runtime/u1/tools/trivy image --scanners vuln --format json --output .reports/u2/container-security.json sha256:4f7b7ded15f44168fb00b73edcdbcc6bec6ed86f329fbfca93579428d47a51e5`.
- Docker daemon layer export가 `no space left on device`로 실패했다. 완전한 container scan JSON은 **ABSENT**이며 취약점 0/PASS로 해석하지 않는다.
- 같은 source의 dependency audit/SAST/secret/IaC 검사까지 완료했지만 `security.json`은 `passed=false`다. runtime security·실제 50분 부하·대규모 복원은 아직 미실행이며 차단 상태다.
- 같은 source의 whole coverage `9028/11247 = 80.2702943007024%`, U1 unit568/integration168/fullcoverage736, U2 unit412/integration263/fullcoverage675, PC Chromium3, synth/image build의 통과 증거는 해당 source 관측으로만 유지한다. 앞으로 source가 바뀌면 새 코드의 증거로 사용하지 않는다.

## 승인된 보호 작업의 exact-byte ledger

부모가 보호 작업만 재개하도록 승인한 뒤, 기존 owning `preserveOutput()`을 호출했다. 아래 17개 파일의 archive와 원래 path를 Buffer byte equality 및 SHA256으로 재대조했다. 각 archive path는 `.reports/u2/history/<sha256>-<원래 basename>`이며 현재 sourceDigest는 호출 전후 동일했다. 원래 receipt·보고서 bytes는 변경하지 않았다. 존재하지 않는 container JSON은 만들지 않았다.

| 원래 path | SHA256 | bytes |
|---|---|---:|
| `.reports/u2/validation-source.json` | `664480e3a52c9f5f538732a474720f08bdeaedce8b2c455e4b2cf654f75c8f8a` | 61809 |
| `.reports/u2/security.json` | `06a82f7a4400d1bca335a23efa4c73c1486b1b5659ba296ab1ddee7cb0c42ae2` | 666 |
| `.reports/u2/project-security.log` | `026e070021b0f211774604a6312c389e40119dd149eae5933a110892d4dbda71` | 716 |
| `.reports/u2/container-security.log` | `7e343cc8d4495d7216981f9da694d91036ae4260f6778e05d89f0ead1dba00dd` | 4215 |
| `.reports/u2/dependency-audit.json` | `dd812dc1ef3df4d9424a569456950c1f5d6bdba12cfeb270d7d467d9cdab617f` | 365 |
| `.reports/u2/sast.json` | `61aa625d073edb73dc05dc93e3706c5e541ff000393589a5f75d89fa38f5a7c2` | 10256 |
| `.reports/u2/sast.log` | `145e789380ace74c3196e61d55b2b7638a2bb968a6925dbc6dacaab0811da65e` | 1478 |
| `.reports/u2/secrets.json` | `3e64b0494f3d77d07362072ad8b02bb5a47f646c5621f861e79b6231f9e0a083` | 213116 |
| `.reports/u2/secrets.log` | `b455bb0e28be54f38cebfdf26698ebc2a0bcfd6206c533770a378f50bba13c18` | 540 |
| `.reports/u2/iac-security.json` | `af5800b5bb4c95da925781b4aa3c9aa6bb5a95d0a966c13680bce2027c1f71ff` | 152185 |
| `.reports/u2/iac-security.log` | `019b263b286d37fa22ded8901eb9ebaf415e317fc6e5fdf9e9d1e3d88568e4f9` | 274 |
| `.reports/u2/iac-adjudication.json` | `0e8cf56f830a25e0a871189c376e88759ce60e18651b3f9b451451bbc1173159` | 150524 |
| `.reports/u2/security-policy.json` | `5e1c5953b5490cfc116fce36958b3ca0d85de024ceca990b50b760e4fafacbe6` | 197 |
| `.reports/u2/scanned-image-id.txt` | `61274966322f1b790cd916fe7e723dfb36559afad0ad068707c74ac16098e2e1` | 72 |
| `.reports/u2/project-image-build.log` | `53b39593592a1a07266b2d2f5109f5f494877559a589e1884d72b2f78d81e73b` | 6425 |
| `.reports/u2/synth.json` | `80027c3873dd1930b7586a94f856e4a3e860ffe704fce1cda5bbd48722e08104` | 276 |
| `.reports/project/coverage-aggregate.json` | `3c030460c02e9b7e7c97452f89d0ee8992cf41775bf702da4d1c125ca548304a` | 372240 |

## 후속 제안 — 아직 구현·승인·실행하지 않음

`scripts/u2/ci-full-proof.ts`의 security stage 보존 목록에 위 scanner 하위 raw/log/policy/adjudication/image-id를 명시하고 실제 실행 전·결과 후 기존 hash-history 방식으로 보존하는 호출부를 연결한다. source/lock/같은 image·원래 mandatory 검사 및 실패/누락 차단은 유지한다. same-source 환경 실패를 재검증할 별도 native/owning 경로는 부모가 판단하며 기존 failed receipt를 수정하거나 성공 결과로 대체하지 않는다.

영향 시험 제안 path는 `tests/u2/unit/ci-report-gates.spec.ts`다. 격리 virtual I/O에서 원래 raw bytes의 hash-named 보존, 실패 뒤 남은 partial raw/log 보존, 누락 raw의 미생성/PASS 금지, 기존 archive 충돌/불일치 및 원래 source/receipt/U1 hash 불변을 검증한다. 실제 보호 보고서를 변조하는 시험은 하지 않는다. 하위 원본 보존이 stage 성공 또는 전체 scanner 실행 증거로 승격되지 않음을 확인한다.

이 기록 작성 뒤 source·DB·실제 검사·삭제·Docker/VM 설정 변경은 다시 정지했다. Docker 공간 확보·재실행 처리 및 source 보완 승인/라우팅은 부모 conductor 책임이며, actual cloud/provider·신원·정책·회사망·수신 증거의 HOLD는 유지한다.
