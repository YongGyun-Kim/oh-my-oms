# U2 PC 체크포인트 검증 실패와 인계

## 현재 결과

2026-10-11 승인된 첫 배포 범위를 U2 문서에 연결하고 독립 검토를 기록했다. Code Generation의 산출물 작성·검토 완료 기록과 Unit 체크포인트 검증·승인은 구별한다. **현재 U2 체크포인트는 `verified=false`, `approved=false`다. U3는 시작하지 않았다.**

독립 검토는 READY/Critical0/Major2다. 두 새 보완 사항은 해결·위험 수용으로 바꾸지 않았다: 동일인 판정의 대상·목적·개정 결합(R-01), 초대 연락 확인의 필수 출처 전체 충족(R-02). [검토 원문](../construction/u2-identity-enterprise-access/code-generation/reviews/review-01.md)을 따른다. 실제 활성화 HOLD, 기존 부하 시간 FAIL·DR 미실행과 이전 OPEN도 유지한다.

## 실행과 관측

이전 사용자 승인 명령:

```sh
PATH=/tmp/oms-u1-runtime/node-v22.23.3-darwin-arm64/bin:$PATH PLAYWRIGHT_BROWSERS_PATH=.runtime/u1/playwright npm run test:u1:e2e
```

공식 실행은 PATH의 원래 `aidlc engine bolt checkpoint --action verify --unit u2-identity-enterprise-access --kind unit`이다. 위임된 Luna의 실행은 메인 세션만 상태를 변경할 수 있다는 검사에 막혀 시작하지 않았다. Luna가 실행 전 보고서를 보존한 후 메인 세션에서 한 번 실행했고, Luna가 결과를 읽기 전용으로 확인했다.

- verification ID: `feb495bd-461e-4c97-ab4c-2a17d338179e`.
- UTC 실행: `2026-10-10T18:09:04.171Z` ~ `2026-10-10T18:09:38.483Z`.
- exit1, signal/error null, `evidence_unchanged=true`, `verified=false`, `approved=false`.
- Playwright expected0 / unexpected4 / skipped0 / flaky0. 재시도하지 않았다.
- 네 프로필 모두 `tests/u1/e2e/foundation-flow.spec.ts:119`에서 새 직원 역할의 선택 항목을 기다리다 실패했다. 원하는 역할 option1개를 기대했지만0개였다는 관측이며 원인은 아직 미확정이다.
- 프로필: 기본, 신청자와 다른 관리자/일반 구매자, role.manage 단독, user.manage 단독.
- 기존 proof의 제품 파일503개와 실제 파일 해시는 모두 동일하다. 이번 검증 실패를 코드 변경 또는 기존 source 검증의 성공/실패 재판정으로 단정하지 않는다.

## 원문 보존

공식 proof는 `<record>/.aidlc-construction-checkpoints/u2-identity-enterprise-access/unit.json`에 저장됐다. 이 파일은 수정하지 않는다.

| 원문 | bytes | SHA256 |
|---|---:|---|
| 이번 stdout | 9312 | `e420e1aad88f3e116d1e3d8c3ee6cb7cd596e5838fc9da4f4b6764cf6c0584c0` |
| 이번 stderr | 5732 | `f61bf36fdb6619307480b41b995077bdd286f85487000ee0ca9f7d7b3cd2be0e` |
| 실행 전 U1 E2E report | 7332 | `2256c4393775b6bb507c58fd303560d5a2d2bbe9fd333547bfd1d6356f219453` |
| 이번 U1 E2E report | 30616 | `5779fc1b59cc21a691f37ae7fcb540f081732811dd8190fd09b2109a8f904212` |

실행 전·후 보고서2045개는 기계 전용 보존 경로 `/var/folders/p7/nswgd_5919z69r72m_ykpvdc0000gn/T/oms-u2-checkpoint-preservation-qbvmd1iw/`에 각각 보존했다. 디렉터리0700/파일0600이다. `preservation-manifest.json`, `after-run/after-run-manifest.json`, `failure-summary.json`을 통해 사본을 확인한다. 이는 로컬 임시 경로이며 원격 Git에 사본이 있다고 주장하지 않는다. 원래 자료의 정확 bytes를 보존했으며 새 결과를 이전 report로 복원해 위장하지 않았다.

대조한 보고서 중 `.reports/u1/e2e.json`만 이번 결과로 바뀌었다. 기존 U2 검증 receipt·E2E·통합·부하, 전체 coverage와 U1 단위/통합 보고서는 그대로다. 업무 데이터·실제 AWS 배포·부하/DR 검증은 이번 작업으로 실행하지 않았다. 승인된 E2E의 격리된 합성 DB 준비와 PC 실행은 위 명령의 범위다.

## 다음 처리

검증 실패에 따라 작업을 멈추고 사용자 처리 선택을 기다린다. 원인 진단과 필요한 PC 회귀만 재개하거나 현재 미검증 상태로 중단할 수 있다. 보류한 대량 부하·재해 실증을 자동 재개하지 않으며, 이번 실패를 통과로 표시하거나 U2 체크포인트를 승인하지 않는다.

## Sources

- 공식 checkpoint 실행 결과 및 proof(verification ID 위와 동일).
- Luna의 실행 전/후 원문 보존 목록과 `failure-summary.json`.
- [확정한 첫 배포 범위](../release-planning/first-release-scope-proposal.md), [U2 독립 검토](../construction/u2-identity-enterprise-access/code-generation/reviews/review-01.md).
