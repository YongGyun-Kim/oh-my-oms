# U2 PC 체크포인트 Retry 원인 확정

## 실제 경계 관측

공식 U1 PC4건은 foundation-flow.spec.ts119의 새 역할 option 기대1/관측0으로 실패했다. root/Luna의 고유 -2 선택 계측은 기존 APPLICANT1case를 실제 API→BFF→브라우저로 실행했고 다음을 관측했다.

| 경계 | 실제 결과 |
|---|---|
| POST /api/staff-roles | 202·RESULT_RECORDED·StaffRole Ref 존재 true·WorkRef false |
| GET /api/staff-role-directory | 3회503·SECURITY_BACKFILL_REQUIRED·bodyRead OK |
| 역할 목록/active | 응답이 거절되어 itemCount null. active 값은 미관측 |
| 선택 결과 | 1case FAIL/skip0/flaky0. 공식 checkpoint PASS가 아님 |

같은 격리 U1 E2E DB의 허용된 READ ONLY 조회에서 PC 역할4개/defineStaffRole RESULT_RECORDED receipt4개, 합성 staff AccountSecurityState0개/StaffAuthorityFence0개를 확인했다. 생성은 완료됐고 디렉터리의 필수 보호 원본 준비가 빠졌다.

현재 UI의 staff-role-panel.ts는 새 U2 staff-role-directory를 reload한다. application.ts56→u2-operations.ts50–54→enterprise-query.ts295–297은 AuthorizationFence.capture(u2:1)로 연결되며 authorization-fence.ts33–42는 AccountSecurityState 정확1개가 없으면 SECURITY_BACKFILL_REQUIRED로 거절한다. 페이지 reload는 이 오류에서 page=null을 기록하므로 새 역할 option이 나타나지 않는다. 생성 자체의 실패·inactive 역할·worker 지연으로 재분류하지 않는다. defineStaffRole은 동기 보호 결과이며 Work 발행 코드도 없다.

## 원래 fixture의 부족과 성공 경로 비교

U1 local-service.ts의 initializeDatabases→seedSyntheticAccount→seedMinimumStaffManager는 기존 StaffRole/Grant/Receipt/History를 준비하지만 위 U2 보안 원본/fence를 준비하지 않는다. 원래 U1 명령의 reset이 ALL_MODELS를 지우므로 그 전에 별도로 준비한 U2 원본도 유지되지 않는다. ENV flag 하나 추가나 timeout/selector 완화는 이 준비 누락을 해결하지 않는다.

기존 U2 fixture는 initialize/reset 이후 seedVerifiedRecoveryParty→seedU2Enterprise의 보호 StaffAuthorityFence 생성과 등록된 backfillU2SecurityState, 추가 계정 backfill을 거쳐 API/BFF를 연다. 이 backfill은 보호된 현재 legacy Account/코드 집합을 검증하는 기존 경로이며 과거 누락 세대/회수/소비를 유효 원본으로 승격하지 않는다.

기존 npm test:u2:e2e는 이 준비 경로와 U2 PC5개를 이미 소비한다. U1 호스트/보호 저장소에 embedded된 U2의 초대·복구·직원 MFA/경계·cookie 흐름을 검증하지만 원래 U1 foundation의 기업 승인→직원 역할 생성/부여→상품/주문 전체대기4개 전체 시나리오를 포함하지 않는다. 그 전체 U1 시나리오를 source 변경 없이 같은 조건으로 검증할 기존 npm 명령은 확인되지 않았다. 필요하면 root가 frozen READY 이후의 정식 fixture repair 경로와 보호된 검증 명령 승인을 결정한다.

## 증거와 보존

- 안전 관측: `.reports/u2/selected/u2-pc-role-boundary-20261011-2.json` ·871bytes·SHA256 `e0562040a6f6e6634c96f39b4a9f6261b829022c8c7962265b8783846a517015`.
- 선택 reporter: `.reports/u2/selected/u2-pc-role-probe-20261011-2.json` ·10442bytes·SHA256 `93b2f1c150d0b7f30b81cb389da05ea548700cea25fd835531380ef21820c550`.
- root private `role-diagnosis/retry-result-summary-2.json`에 실제 API event·source503 hash 불변·pre/post 보존이 있다. trace ZIP은 없고 원래 error-context는 Test source만 포함한다.
- -1의 No tests found는 진단 선택명령의 잘못된 시작 anchor였다. pinned Playwright는 .cjs를 지원하며 project/file/suite를 포함한 전체 title에 grep을 적용한다. 이를 제품 실패로 세지 않았다.
- 원래 U1 E2E7332bytes 상세 원문과 공식 실패30616bytes 원문, U2 기존 proof는 보존했다. 기존 context-http-diagnostics.json의 선택 실행 변화도 root가 private pre/post 사본으로 보존했다.
- 제품/시험 source503파일과 frozen 산출물·state/audit/guard 수정은0이다. 나는 읽기 전용 조회와 이 진단.md 작성만 수행했고 새 시험은 root/Luna가 한 번의 유효 선택 계측으로 실행했다.

독립 review Major R-01/R-02와 이전 provenance gap2개·부하 시간 FAIL·DR 미실행·realactivation HOLD는 별개다. 이번 조사로 해결·위험 수용·Unit checkpoint 검증/승인을 기록하지 않는다. 추가 제품 수정·검증 명령 변경·시험은 root의 정식 경로를 기다린다.

## 최소 보완 제안 — 문서 내 diff만, source 미적용

수정 대상은 **기존 U1 fixture2파일**이다. U2 PC5로 교체해 U1 핵심4PC를 빼는 방법은 추천하지 않는다. 원래 U1 checkpoint의 reset→seed 순서 안에서 정당한 준비를 연결하고, 원래4PC와 기존 U2PC5를 모두 확인하는 repair가 필요하다.

### 1. tests/u1/fixtures/local-service.ts

원래4개 합성 계정의 보호 생성 뒤, 최초 최소 staff manager 준비 전에 기존 backfill을 호출한다. e2e-isolated에서만 적용하며 기존 profile/credentials/허용 행위·일반 fixture 동작은 유지한다.

```diff
-import { ProtectedStore } from '@oms/persistence';
+import { ProtectedStore, backfillU2SecurityState, U2_STAFF_FENCE_ID } from '@oms/persistence';
@@
   if (!(await store.read('Account', id))) await seedSyntheticAccount(store, id, audience);
+const u2E2e = process.env.OMS_U1_DATABASE_PROFILE === 'e2e-isolated';
+if (u2E2e) {
+  for (const [source, database, port, user] of [
+    [sources.primaryApp, 'oms_u1_e2e', '15432', 'u1_verify_app'],
+    [sources.journalAppend, 'oms_u1_journal_e2e', '25432', 'u1_verify_journal_append'],
+  ] as const) {
+    const options = source.options as { type?: string; url?: string };
+    if (options.type !== 'postgres' || typeof options.url !== 'string')
+      throw new Error('명시 PostgreSQL fixture 설정이 필요합니다.');
+    const url = new URL(options.url);
+    if (url.hostname !== '127.0.0.1' || url.port !== port ||
+        url.pathname !== '/' + database || url.username !== user)
+      throw new Error('등록된 합성 E2E primary/journal 대상만 준비합니다.');
+  }
+  await backfillU2SecurityState(store);
+}
@@
   await seedMinimumStaffManager(store, 'staff', now());
+if (u2E2e && !(await store.currentProtected('StaffAuthorityFence', U2_STAFF_FENCE_ID)))
+  throw new Error('보호된 최초 staff fence 준비가 필요합니다. 기존 격리 reset/seed 경로를 확인하세요.');
```

이 순서는 U1 reset 후 생성한 보호 Account를 기존 backfill이 재검증한 뒤 API/로그인 이전에 보안 세대 원본을 만든다. 기존 grant가 남아 seed가 생략되는 no-reset namespace에 fake fence를 자동 생성하지 않고 준비 불충족으로 닫는다.

### 2. tests/u1/fixtures/staff-bootstrap.ts

현재 private 합성 `initial-minimum-staff-role`의 **같은 보호 transaction**에 최초 staff fence를 넣는다. staff.role.manage 외 grant/가입 계정/권한을 추가하지 않는다. 존재하는 fence는 현재 보호 원본과 대조해 보존하며 revision을1로 되돌리지 않는다. 원래 common Receipt resultRefs는 StaffRole/Grant 그대로 둔다.

```diff
+import { requireCondition } from '@oms/contracts';
+import { currentSecurityMatches, U2_STAFF_FENCE_ID } from '@oms/persistence';
@@
   if (!account) throw new Error('합성 직원 계정 준비가 필요합니다.');
+const u2E2e = process.env.OMS_U1_DATABASE_PROFILE === 'e2e-isolated';
+const protectedAccount = u2E2e ? await store.currentProtected('Account', accountId) : null;
+if (u2E2e)
+  requireCondition(
+    protectedAccount?.audience === 'STAFF' &&
+      currentSecurityMatches('Account', protectedAccount, account),
+    503, 'FIXTURE_STAFF_SOURCE', '현재 보호된 합성 직원 원본이 필요합니다.',
+  );
@@
       await transaction.put('StaffRoleGrant', grant);
+if (u2E2e) {
+  requireCondition(
+    currentSecurityMatches('Account', protectedAccount,
+      await transaction.get('Account', accountId)),
+    409, 'FIXTURE_STAFF_SOURCE_CHANGED', '합성 직원 원본이 변경됐습니다.',
+  );
+  const existing = await transaction.get('StaffAuthorityFence', U2_STAFF_FENCE_ID);
+  if (existing)
+    requireCondition(
+      currentSecurityMatches('StaffAuthorityFence',
+        await store.currentProtected('StaffAuthorityFence', U2_STAFF_FENCE_ID), existing),
+      503, 'FIXTURE_STAFF_FENCE_UNCONFIRMED', '기존 staff fence 보호를 확인하세요.',
+    );
+  else
+    await transaction.put('StaffAuthorityFence', {
+      fenceId: U2_STAFF_FENCE_ID, authorityRevision: 1, revision: 1,
+    });
+}
```

1은 이 새 합성 E2E 권위 경계의 최초 개정이며 과거 미확인 세대를 복원한 값이 아니다. AccountSecurityState와 유효 legacy 코드 admission은 기존 등록 backfill의 현재 원본/개정/연결/소비 검증에 맡긴다. 가입 계정은 원래 customer/other/unrelated/staff4개만 유지한다. 추가 계정이나 더 넓은 manager 권한·vault/decrypt 권한·U2 DB 공유를 만들지 않는다.

기존 U1 E2E initializer의 ALL_MODELS 물리 등록/권한을 사용하며 새 DB/계정/클라우드 서비스는 없다. primary `oms_u1_e2e`와 journal `oms_u1_journal_e2e`를 사용하고 U1 verification/대량 자료·U2 e2e namespace는 건드리지 않는다. 원래 보호 primary→journal→prefix 가시성을 통과한 뒤에만 API/UI를 연다.

### repair 이후 검증 후보

정식 repair 재개/승인 뒤 원래 U1PC4를 그대로 실행하고 U2PC5도 별도 고유 reporter 경로로 확인한다. missing/raw-only/현재 원본 불일치와 중복 fence 준비는 계속 거절해야 한다. 새 code-generation frozen 산출물/manifest·source identity의 수정은 root가 허용한 native 경로만 따른다. 시간 하한/selector·MFA/권한/보안/80% 조건은 바꾸지 않는다. 대량 부하·DR·전체 collector는 이 repair 검증 범위가 아니다.
