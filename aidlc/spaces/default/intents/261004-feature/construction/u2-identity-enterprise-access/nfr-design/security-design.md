# U2 신원·기업 접근 보안 설계

**Unit:** u2-identity-enterprise-access  
**범위:** IdentityRecovery/EnterpriseAccess library를 기존 API·worker·BFF에 결합한다. 설계 연결과 실제 구현/시험·운영 달성을 구별한다. 새 독립 인증 서비스·AWS 계정·단말 관리·모바일을 요구하지 않는다.

## Design Basis and Upstream Coverage

- [security-requirements.md](../nfr-requirements/security-requirements.md)의26개와 [tech-stack-decisions.md](../nfr-requirements/tech-stack-decisions.md)의17개, 총43개 상세 NFR을 [traceability.json](traceability.json)에 연결한다.
- [functional-spec.md](../functional-design/functional-spec.md)의 WF01–WF09/CE-U2-01–07·규칙/원본을 상세 보호·목적·실패 경계로 구체화한다. [contract-summary.md](../../../inception/contract-design/contract-summary.md)의 C01/C02/C21/C20-E01, G19/G22/G23과 닫힌 원래 profile을 보존한다.
- [nfr-design-questions.md](nfr-design-questions.md)의 실제 A와 Looks correct로 확인한 인계 코드96비트/16문자, 청구5분/실패5회, 청구 후 별도5분을 적용한다. 초대7일·일반 세션/로그인 challenge·사전 코드 정기 만료 없음은 기존 결정이다.
- [components.md](../../../inception/domain-design/components.md)의 신원 원본과 기업 권한 원본을 분리한다. API와 worker가 같은 판정 규칙을 호출하며 worker에 HTTP Guard가 자동 적용됐다고 가정하지 않는다.
- U1 보호 연결의 명시적 통합 지점은 [security-design.md](../../u1-integrated-foundation/nfr-design/security-design.md) ND-SEC-01–10과 [reliability-design.md](../../u1-integrated-foundation/nfr-design/reliability-design.md) ND-REL-02–06이다. primary commit→독립 journal→연속 prefix→가시성/ACK를 그대로 적용한다. U1 큐/기한의 기존 미해결 문제를 이 문서로 해소했다고 표시하지 않는다.

## Authentication and Authorization

<a id="SD01"></a>

### SD01. 안정 계정·실제 인증과 신뢰 문맥

Account는 OMS 안정 식별자다. ProviderBinding은 issuer·provider subject·정확한 audience/pool/client·bindingGeneration·상태/개정으로 검증하며 email/group/displayName을 계정/사람/역할 병합 근거로 사용하지 않는다. 활성 binding은 한 계정/업무 audience에 하나다. 미확인 병행 binding은 업무 접근을 허용하지 않는다. JWT 검증만으로 현재 회수/실제 MFA를 대체하지 않는다.

일반 업무 문맥은 서버가 실제 password+TOTP 완료/현재 Account·binding·보안 세대·세션·복구 코드 보관 확인을 대조해 발행한다. 제공자 토큰의 일반 인증 성공을 임의로 MFA 완료로 변환하지 않는다. 각 요청/실행/commit/민감 결과 투영은 현재 권한 원본을 확인한다. 복구·등록·초대 문맥에는 일반 업무 행위 권위가 없다.

| 서버 문맥 | 만들 수 있는 근거 | 허용 동작 / 불가 동작 |
|---|---|---|
| PRE_IDENTITY | 서버 attempt/challenge·audience·origin/CSRF·요청 기한 | 로그인·허용 고객 등록·복구 접수; 계정 목록/직원 공개 등록·MFA 완료 생성 불가 |
| INITIAL_MFA | 실제 최초 인증/등록 연결·원래 등록 target/challenge·current binding/securityGeneration | 자기 첫 MFA·코드 보관 확인; 아직 없는 MFA 근거를 가짜로 요구/주입하지 않음 |
| INVITATION_ACCEPTANCE | 실제 자기 password+TOTP·검증된 지정 연락 경로·초대 target/challenge | 자기 초대 최소 조회/수락; 기존 기업 소속/업무 권한을 미리 요구/생성하지 않음 |
| RECOVERY_VERIFICATION | 원래 case/target/challenge·유효 password+사전 코드 또는 현재 직원/비상 확인 근거 | 해당 case의 다음 제한 단계; 확인자 결정과 당사자 청구를 분리 |
| MFA_REENROLMENT | 소비된 원래 허가 결과·확인된 당사자 문맥·현재 case/계정/binding/세대·등록 target/challenge | 해당 새 수단/필수 코드 확인; 다른 case/업무 접근·기한 갱신 불가 |
| BUSINESS | 현재 신원/MFA/세션과 명시 grant·대상 원본 | 요청한 현재 행위/정보 범위에 한정 |
| EMERGENCY_PRIVATE | 등록된 비공개 운영 자격·실제 본인/원래 계정 확인·원래 비상 case | 원래 지정 담당자의 제한 복구; CUSTOMER/STAFF 헤더/role 문자열로 생성 불가 |
| SYSTEM_WORK | 등록된 fact/owner 목적·원래 work/permit·현재 epoch/lease/기한 | 명시 사실 소비/작업만; 사람의 위임 실패를 SYSTEM으로 승격하지 않음 |

이 표의 상세 discriminator/target는 **새 u2-access-additions:1 profile 설계**다. 기존 common:1의 LimitedIdentityContext에 INVITATION_ACCEPTANCE 등 enum/필드를 조용히 추가하지 않는다. INITIAL_MFA/재등록의 MFA_ENROLMENT projection도 상세 서버 원본 참조 없이 common 객체만으로 승인하지 않는다. 닫힌 등록/negative fixture·producer/consumer 지원이 없는 신규 동작은 비활성이다. LC08 참조.

<a id="SD02"></a>

### SD02. 세션·CSRF·직원 접점

SessionBinding은 sessionRef·purpose·account/audience·binding/securityGeneration·recoveryEpoch·source target/challenge·verificationBasis/revision·issuedAt/expiresAt·lastQualifiedActivityAt를 서버 원본에 갖는다. 일반 업무 절대8시간, 고객 유휴30분/직원15분, 일반 로그인/MFA challenge5분이다. 경계 now>=expiresAt는 만료다. 자동 polling/상태 조회/실패 요청으로 유휴 시간을 늘리지 않는다. 복구 후 업무 세션은 재인증을 거쳐 새로 발급한다.

브라우저에는 고엔트로피 opaque handle의 Secure/HttpOnly/동일 site 목적 쿠키를 두며 provider token·수단 비밀을 localStorage/URL로 보내지 않는다. 고객/직원·업무/제한 쿠키 이름과 path/host를 분리한다. 상세 TTL은 서버 원본으로 결정한다. 제한 문맥의 Cookie만 다른 브라우저에 복사한 것으로 인계 확인을 완료하지 않는다.

모든 변경·로그인·복구·claim POST는 서버에 고정된 정확한 origin과 해당 pre-auth/session에 결합된 CSRF challenge를 검사한다. null/missing Origin/Referer는 등록된 검증 정책 없이는 거절한다. CORS/SameSite는 보완이다. 안전 GET은 변경/claim/코드 소비를 하지 않는다. 인증·초대·역할·민감 응답은 Cache-Control no-store, Referrer-Policy no-referrer, MIME/프레이밍 보호·실제 asset/CSP allowlist를 BFF 경계에 적용한다. 렌더링 값은 텍스트로 escape하며 링크/redirect는 등록된 자체 목적지만 허용한다.

직원 login/최초 MFA/복구/claim/조회/role 관리와 비공개 직원 안내까지 사설 승인 ingress를 거친다. API 직접 접속·공개 고객 경유·위조 forwarded header는 거절한다. 서버는 ingress가 덮어쓴 인증된 경로 근거를 현재 요청에 결합하고 exact audience를 검증한다. 회사 IT의 NAC/MDM/기기 인증서는 OMS 밖이다. PC1280 화면 폭·IP 문자열·사내망 단독은 신원/MFA/행위 권한의 대체가 아니다. 실제 ingress/회사 경로가 없으면 직원 실접점을 활성화하지 않는다.

<a id="SD03"></a>

### SD03. 현재 행위·완성된 scope와 관리 위임

EnterpriseAccess는 현재 Account/auth/security 개정과 Enterprise 이용/조직 정책 개정·membership 상태/개정·현재 grant/role 개정을 원본에서 평가한다. 요청의 company/department/site 주장 대신 **업무 소유자 target의 원래 기업·조직/미사용 상태·정책/개정**을 사용한다. 동일 행위의 각 완성된 술어만 OR한다. 관리/조회/제출·다른 기업/행위/별도 행의 축을 조합하지 않는다. 15고객 행위·등록된 직원 목록·4scope는 WF04/05 그대로다.

ScopeV2는 한 predicate에 enterpriseRef, action, kind, departmentSelector, siteSelector, sourcePolicyRevision을 가진다. EXACT은 같은 기업 한 조직 Ref, NOT_USED는 실제 명시 미사용, ALL은 kind가 허용하는 명시 전체다. DEPARTMENT_SITE는 두 축 EXACT/NOT_USED만; SITE_ALL_DEPARTMENTS는 department ALL/site EXACT; DEPARTMENT_ALL_SITES는 department EXACT/site ALL; ENTERPRISE_ALL은 둘 다 ALL이다. UNSET·빈 배열·다른 기업 Ref·미등록 action/kind는 거절한다. 과거 비활성 조직 EXACT은 명시 현재 grant로 옛 주문을 조회할 수 있으나 새 주문에는 활성 조직만 허용한다.

관리 위임은 직접 거래 권한과 다르다. 자기 기업 현재 organisation.manage/user.manage/role.manage의 범위와 서버 허용 action catalog 안에서만 역할 내용/대상 기존 및 변경 후 소속을 검증한다. 거래 권한이 없는 관리자의 타인/자기 **명시적** grant는 가능하다. role.manage만으로 다른 관리 범위 밖/타 기업·직원/SYSTEM 권위를 만들지 못한다. 자기 부여도 before/after·사유/근거·현재 관리 개정·actor의 이력을 남긴다.

개정/회수는 예상 개정과 enterprise access fence를 같은 짧은 transaction에서 확인한다. 같은 기업 권한 변경은 해당 기업 권위 fence를 증가시켜 모든 유효 grant가 읽는 현재 role revision과 접근 판정을 일치시킨다. 각 membership에 무제한 fan-out update를 하지 않고 effectiveAuthorizationRevision=(enterpriseAccessRevision,membershipRevision,roleRevisions,accountSecurityRevision)으로 정의한다. 영향 목록/옛 결정은 별도 보존한다. 직원은 staffAuthorityRevision을 별도로 사용한다. 동시 업무 commit은 같은 현재 fence 검증·잠금 순서를 사용하거나 owner transaction에서 CAS 실패 시 전체 거절한다. 오래된 allow 결과를 그대로 commit하지 않는다.

<a id="SD04"></a>

### SD04. 초대7일·단회 수락

MembershipInvitation은 enterpriseRef·예정 연락 경로/verified-contact version·조직 사용 정책/개정·각 예정 roleRef/revision·inviter/membership 및 관리 근거·예상 대상 membershipRevision 또는 create intent·issuedAt/expiresAt/tokenGeneration·상태/개정·원래 Receipt/notification obligation을 고정한다. expiresAt=issuedAt+7×24시간, now>=expiresAt면 수락 불가. 같은 초대 재발송은 deadline을 연장하지 않는다.

초대 token은 별도256비트 난수, 목적/초대/세대에 묶인 보호 verifier로 검증한다. 일반 DB/Outbox/history/telemetry에 token 원문을 복제하지 않는다. 전달이 필요한 원문은 SD11의 짧은 목적 암호 보관/등록 수신자 경로만 사용한다. query token을 업무 URL/로그에 유지하지 않으며 처음 수신은 최소 landing→서버 제한 문맥 교환→자체 깨끗한 URL로 전환한다. GET 교환은 소비가 아니며 실제 수락은 CSRF 보호 POST다. referrer/analytics/session replay 수집은 끈다. 실제 연락 수신과 자체 본인 password+MFA가 모두 필요하다.

수락 전 기존 membership이 없어도 INVITATION_ACCEPTANCE를 발행할 수 있다. 지정된 검증 연락 경로·자기 account·purpose·초대/challenge·현재 binding/securityGeneration을 대조한다. 서버가 확인한 case 연결 없는 이메일 문자열/토큰 단독으로 업무 session을 만들지 않는다.

수락 transaction의 순서는 Account/binding/security fence→Enterprise 조직/접근 fence→Invitation revision→Membership/Role/Grant 참조 정렬이다. PENDING·기한·tokenGeneration·연락처·기업 승인/현재 조직/예정 역할 revision·초대자의 **현재** user.manage 및 필요한 role.manage·소속 create/reactivate intent를 재확인한다. 소속 활성화·명시 grant·ACCEPTED·소비·history·통지 의무·Receipt/복구 후보를 같은 논리 변경으로 보호한다. 기존 ACTIVE 소속을 덮어쓰지 않는다. INACTIVE는 해당 예상 개정의 명시 재활성화 의도만 허용한다.

동시 accept/revoke는 한 원본 revision의 한 결과만 확정한다. 정확한 같은 요청 key+내용은 원래 보호 결과를 현재 허용 범위로 재대조한다. 다른 내용·이미 ACCEPTED/REVOKED/EXPIRED는 새 효과를 만들지 않는다. 조직/role/inviter 변경은 RECONFIRMATION_REQUIRED, 타인/타 초대·연락 미검증은 거절이다. 재확인은 old invitation을 임의 갱신하지 않고 현재 관리자가 원래 초대를 회수·링크된 새 초대를 발급한다.

<a id="SD05"></a>

### SD05. 담당자 결정과 확인 당사자 인계의 분리

RecoveryVerification은 실제 인정 정책/개정·필수 근거/출처·대상 계정/원래 binding·확인자 현재 권위·당사자 진행 문맥·검증 시각/유효성·decisionRevision을 가진다. Ref가 존재하는 것만으로 CONFIRMED가 아니다. 직원은 현재 identity.recovery.verify+MFA+사설 ingress를, 비상 확인자는 별도 실제 운영 자격을 충족한다. 익명 RecoveryCase 생성자는 계정 상태/확인 결과·허가를 받지 않는다. 미검증 접수만으로 account securityGeneration 증가/업무 잠금을 하지 않는다.

**PartyClaimContext**는 당사자 확인 과정에서 만든 새 진행 challenge와256비트 browser secret의 서버 verifier/등록 전달 경로·account/case/audience·party verification decision을 결합한다. 담당자는 확인된 당사자가 제시한 진행 challenge를 정책에 따라 실제 확인하고 그 contextRef를 결정에 고정한다. 기존 익명 접수자의 cookie/challenge를 자동 승격하지 않는다. 코드는 그 확인된 context의 당사자에게만 전달한다. 브라우저를 바꾸면 새 실제 확인 결정/context가 필요하며 email/receipt/case ID만으로 재연결하지 않는다. 전화/수신 경로 사용은 인정된 확인 정책의 실제 근거가 있어야 한다. 이는 새 SMS/email 로그인 MFA가 아니다.

**RecoveryHandoffGrant**의 필수 원본:
grantRef/revision·caseRef/revision·accountRef·audience·bindingRef/generation·securityGeneration·purpose=MFA_REENROLMENT·enrollmentTarget/challengeId·verificationRef/revision/policyRevision·verifiedPartyContextRef/revision·deliveryRouteRef/version·issuerAuthorityRevision·issuedAt/expiresAt·attemptCount/maxAttempts·verifier/keyVersion·state·claimReceiptRef·replacesGrantRef(해당 시).
원래 case/근거/대상·현재 세대/권위가 달라지면 재사용하지 않는다. 같은 case의 활성 grant는 하나; 새 발급은 기존 grant 폐기와 원래 대체 관계를 원자 기록한다. 교체만으로 옛 외부 실행 작업을 종료하지 않는다.

발급 코드=암호 난수12바이트→정확16문자 base64url/96비트. 원문은 목적 제한 전달에만 사용한다. verifier는 SD11 keyed 검증값이고 raw code를 비교 로그로 남기지 않는다. claim 가능5분, 잘못된 유효 형식 claim 최대5회. 오입력1회도 같은 grant 원본의 원자 보호 변경으로 누적하며 5번째 실패로 EXHAUSTED, 만료/회수/원본 변경으로 사용 불가다. account 전체를 실패 때문에 잠그지 않는다. unknown grant/잘못된 형식은 경로 rate limit에 집계하되 타인의 grant 상태를 무권위 요청으로 임의 변경하지 않는다.

Claim은 code **및** 검증된 PartyClaimContext secret·exact target/challenge·CSRF/origin을 검증한다. 현재 case/근거/정책·issuer 권위·account/binding/security generation·grant 기한/상태를 commit 직전 재확인한다. ISSUED→CLAIMED의 단회 소비, ClaimReceipt·이전 보안 세대에서 해당 복구 전용 새 세대로의 fence 전환·post-fence EnrollmentAuthority·history/복구 후보를 하나의 보호 논리 변경으로 확정한 뒤에만 재등록 handle을 반환한다. 담당자 BUSINESS session·확인 완료 boolean은 당사자 claim 권위가 아니다. 코드만 탈취한 다른 cookie/case·초기 익명 요청자·확인 후 issuer권한 회수·5분경계·중복 동시 claim은 거절한다.

EnrollmentAuthority의 별도5분은 유효 claim의 서버 consumedAt부터 시작하며 account/binding/security·원래 case·새 enrollment target/challenge·verification/party/ClaimReceipt 원본을 고정한다. 클라이언트 retry 시간으로 다시 시작하지 않는다. provider session/challenge/허가 기한이 더 짧으면 그 기한을 따른다. 이전 HTTP/worker/provider 실행의 deadline을 연장하지 않는 새 제한 단계다. 원래 claim 결과 재조회는 같은 party context만 허용하고 새 handle을 발급해 TTL을 갱신하지 않는다.

| Grant / 제한 상태 전이 | 현재 원본 조건 |
|---|---|
| VERIFIED 결정→ISSUED | 현재 실제 확인/issuer·verified party context·전달 준비; 원래 불명 효과가 있으면 청구는 가능해도 외부 실행은 HOLD |
| ISSUED→CLAIMED | code+party context·현재 case/세대/근거·미소비·기한·attempt<5, 단회 보호 변경 |
| ISSUED→EXPIRED/EXHAUSTED/REVOKED | 기한·5실패·현재 권한/원본 변경/명시 회수; 이유/원래 근거 보호 |
| CLAIMED→새 EnrollmentAuthority ACTIVE | 같은 ClaimReceipt의 유일 결과, 별도5분/원래 target |
| EnrollmentAuthority ACTIVE→COMPLETED | SD06 실제 새 MFA/옛 무효화·필수 code 확인·보호 완료 |
| ACTIVE→EXPIRED/REVOKED/HOLD | 기한/근거·세대 상실/옛 외부 불명; 업무 접근 없음 |
| EXPIRED/EXHAUSTED/REVOKED/HOLD→재준비 | 상태 자체를 ISSUED/ACTIVE로 되돌리지 않음; SD07의 현재 재검증 후 링크된 별도 허가/단계 |

청구 보호 중 primary 변경 후 journal 불명은 소비 성공 handle/ACK를 반환하지 않는다. 해당 case/허가 판정은 차단한다. 같은 원본 결과 대조로 복구하며 옛 ISSUED snapshot을 다시 노출하지 않는다. 재발급/복원/rollback도 단회 소비·실패 횟수·회수 marker를 되살리지 않는다. 기능 설계 R-01의 후속 원본/경계이며 실제 해결은 구현·negative/동시/복구 검증 이후에만 판정한다.

<a id="SD06"></a>

### SD06. 사전 코드·새 MFA·원래 제공자 효과

사전 복구는 기존 password+현재 집합의 미사용 코드다. BackupCodeSet/Code의 account/bindingGeneration/securityGeneration·발급 세대·verifier/used/revoked·보관 확인을 원자 검증한다. 정기 만료는 추가하지 않는다. 코드 한 개는 하나의 원래 case/ClaimReceipt에 단회 소비되고 재발급은 이전 집합 전체를 회수한다. 단회 결과에 결합한 EnrollmentAuthority는 SD05와 같은 대상/세대·별도5분 제한을 사용한다. 직접 복구는 실제 password+code 근거로 PartyClaimContext를 만들며 별도 직원 인계 코드를 요구하지 않는다.

유효한 당사자 claim 또는 직접 password+code 소비와 같은 보호 논리 변경에서 account security generation을 증가시키고 기존 업무 세션을 회수한다. 인계 grant 발급/담당자 확인 결정만으로 세대를 증가시키지 않는다. 익명 접수·증거 검토 시작 단계에서는 증가시키지 않는다. 그 복구 case는 허가된 전후 세대 연결을 보호 기록하며 새 제한 authority는 post-fence generation으로 발행한다. stale verifier/세대는 일반 token보다 먼저 거절한다. 같은 계정의 수단 변경은 하나의 recovery execution slot으로 직렬화한다. 미해결 옛 외부 operation이 있으면 새 수단 완료를 보류한다.

C21 호출은 보호된 ExecutionPermit와 원래 approvedOperationId/workId/target/provider binding·개정·inputDigest·누적 attempt·deadline에 결합한다. raw password/TOTP·provider session은 목적 암호 자료로만 전달하고 큐에는 Ref를 둔다. SDK 자동 재시도가 원본 시도 한도를 우회하지 않게 한다. 응답 수락/HTTP200와 실제 새 MFA/옛 무효화·완료를 구별한다.

**Cognito 공식 API 확인(2026-10-09):** AdminDeleteSoftwareToken은 기존 TOTP 등록을 제거하며 필수 MFA+다른 factor 없음의 다음 로그인은 MFA_SETUP으로 이어진다. AssociateSoftwareToken/VerifySoftwareToken은 실제 사용자 access token 또는 해당 challenge session으로 등록한다. AdminUserGlobalSignOut은 제공자 token을 회수하지만 모든 외부 JWT 사용처의 즉시 거절을 보장하지 않으므로 OMS 현재 세대/세션 fence가 필요하다. 실제 IAM/pool/SDK 지원은 별도다. [AdminDeleteSoftwareToken](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminDeleteSoftwareToken.html), [AssociateSoftwareToken](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AssociateSoftwareToken.html), [AdminUserGlobalSignOut](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminUserGlobalSignOut.html).

이 API에 token별 조건부 제거/OMS idempotency key·원래 실행 종료 조회가 문서화됐다고 주장하지 않는다. timeout/연결 종료/ResourceNotFound/현재 factor 없음·단순 성공 probe만으로 이미 보낸 제거 요청의 종료를 입증하지 못한다. UNKNOWN 원래 effect는 same-subject 새 factor 등록/완료 전에 **실제 종료 또는 늦은 호출이 새 binding에 닿지 않는 격리 근거**가 필요하다. 그런 기능/증거가 없는 실제 adapter는 HOLD다. 독립 subject 격리는 실제 동일인/binding 전환·alias/username/pool·old credential/token 차단·늦은 제거 격리·권한 보존의 검증을 통과한 별도 capability에 한정하며 자동 계정 재생성을 기본 우회로 삼지 않는다.

담당자 확인 복구에서 password도 사용할 수 없으면 같은 실제 확인 case·당사자 claim에 결합된 **첫 인증 수단 교체 한 단계**가 필요하다. Cognito AdminSetUserPassword는 사용자 지정 password 설정을 지원하지만 실제 자격/보안·원래 효과/지원 profile은 구현 전 검증한다. 새로운 password는 확인 당사자가 제한 화면에서 입력하고 암호 자료/작업에만 전달한다. 직원/개발자가 상시 공유 password를 보관/발송하지 않는다. 해당 단계만 등록된 추가 profile operation으로 허용하고 password 변경 성공을 업무 인증/MFA 완료로 표시하지 않는다. MFA 필수 pool·새 TOTP 확인·새 코드 보관 확인 후 새 일반 로그인만 허용한다. 지원/원래 작업 대조가 없으면 HOLD다. [AdminSetUserPassword](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminSetUserPassword.html).

복구 완료의 conjunctive 조건은 새 factor 실제 검증/현재 binding에 결합, 모든 옛 factor/code/session 무효화와 불명 작업 종료/격리, 새 필수 BackupCodeSet/보관 확인, COMPLETED·전후 세대/효과 근거·보호 이력, E01 당사자 통지 의무의 보호 확정이다. 통지 발송/실전달은 U7 결과로 별도 표시하며 발송 미확인은 남은 조치다. 통지 의무 없이 완료하지 않고 전달 요청만으로 전달 완료를 만들지 않는다. 새 업무 세션/각 기업 권한은 별도 현재 재평가다. 출시 후 Keycloak은 같은 stable Account·capability port·세대/회수/격리 의미를 유지하되 credential 직접 이동/일정은 미확인이다.

<a id="SD07"></a>

### SD07. HOLD 재개·종료와 비상·관리자 재지정

HOLD는 단순 실패 flag가 아니다. sourceCase/target·원래 operation/result/Receipt·holdReason·missingEvidenceRefs·heldAt/sourceRevision·currentAuthorityRequirements·resumeHistory·supersedes/closeRelation을 기록한다. 기한이 없는 사람 검토 자체와 기한이 있는 실행 permit/claim/enrolment를 구별한다. HOLD를 무한 자동 retry 대상으로 하지 않는다.

| 원본 전이 | 현재 검증 / 효과 |
|---|---|
| RecoveryCase VERIFYING→HOLD/REJECTED | 부족/충돌·실제 정책/권위/지원 없음; 익명 요청자에게 세부 신원/근거 비노출 |
| RecoveryCase HOLD→VERIFYING | 현재 권한 있는 확인자·sourceRevision·현재 정책/근거·원래 계정/binding·원래 불명 효과 대조; 새 verification decision으로만 재검토 |
| RecoveryCase HOLD→ENROLMENT_ONLY | 현재 실제 확인·당사자 claim 또는 직접 code 소비의 새 유효 authority, 옛 effect 안전; 만료 authority 재사용 금지 |
| RecoveryCase HOLD→CLOSED | 현재 권한 주체/현재 대상·정당한 종료 사유·원래 불명 effect/남은 안전 조치 보존; external effect가 없었다고 꾸미지 않음 |
| EmergencyRecoveryCase OPEN/VERIFYING→HOLD | 보호 비공개 운영 자격/대상 동일인·정책·실제 capability 부족/불명 |
| EmergencyRecoveryCase HOLD→VERIFYING | 기존 case 예상 개정, 새 현재 운영 권위/근거·신뢰 접근·원래 effect/기한 대조; 일반 STAFF로 승격 불가 |
| EmergencyRecoveryCase VERIFYING→ENROLMENT_ONLY→COMPLETED | 실제 현재 비상 확인→당사자 claim→SD06 전체 완료; 원래 담당자 정당한 현재 grant만 회복 |
| EmergencyRecoveryCase OPEN/VERIFYING/HOLD→CLOSED | 현재 보호 운영 권위·사유/근거·불명 operation/result 링크 보존; 상시 bypass 생성 금지 |
| AdministratorRestoration REQUESTED→HOLD | 실제 기업 위임/지정 대상 신원·현재 enterprise/조직/소속·직원 restore 권위/근거 부족 |
| AdministratorRestoration HOLD→VERIFIED | 현재 enterprise.administrator.restore+MFA/사설 ingress·원래 enterprise/target/revision·인정 위임 정책/근거·지정 대상의 현재 신원/소속 확인 |
| AdministratorRestoration VERIFIED→APPLIED | commit 직전 위 조건과 예상 개정 재검증; 명시 관리 grant/관리자 표지·접근 fence/이력·Receipt/보호를 한 변경으로 확정 |
| AdministratorRestoration REQUESTED/HOLD/VERIFIED→CLOSED | 현재 직원 restore 권위·원래 target/revision·정당 종료 사유·남은 불명 변경 링크 보존 |
| 모든 종료/완료 원본→새 준비 | 종료 상태를 되돌리지 않음; 현재 근거로 별도 원본, supersedes/parentRef와 옛 미해결 조치 연결 |

단순 새 요청으로 old HOLD를 잊지 않는다. old 미해결 external operation이 실제 종료/격리되기 전에는 새 case도 같은 실행 slot에서 HOLD이고 old source에 연결된다. expired work에 새 deadline을 덮지 않는다. 재검토/새 실행 구간은 현재 승인된 별도 permit과 원래 이력을 연결한다. 종료가 consumer ACK/실제 effect 부재를 뜻하지 않는다.

정상 담당자 모두 불가할 때 보호 비공개 운영 경로는 기존 최초 직원 console/최소 OMS grant 절차와 구분된 actual operator 자격으로 **원래 지정된 계정**을 복구한다. 일반 UI role/공개 header가 만드는 비상 계정·상시 공용 admin·영구 MFA 예외는 없다. actual authority/capability 부재는 문서/합성 fixture로 채우지 않는다.

관리자 표지와 실제 관리 grant는 별도다. 마지막/동시 마지막 관리자를 회수해0이 되어도 허용·보호 경고/이력이며 Enterprise 승인·다른 유효 거래 grant를 자동 회수하지 않는다. 재지정은 명시 organisation.manage/user.manage/role.manage와 현재 기업 위임 범위만 부여한다. 계약/상품/대금 권한을 자동 추가하지 않는다. 실제 동일인 링크는 인정 정책·현재 근거가 확인된 원본만 제공하고 계약 등록자/승인자의 서로 다른 account라도 같은 실제 사람이면 거절한다. 미확인도 승인으로 바꾸지 않으며 SW 기간의 같은 사람 두 권한·별도 승인 규칙은 SW owner가 판정한다. 기능 설계 R-02의 닫힌 전이 보완이다.

## Encryption, Secrets and Compliance Controls

<a id="SD08"></a>

### SD08. 손실 없는 scope 호환·권한 회수

Legacy common:1/원래 U1 profile은 그대로 해석한다. old policyRevision/USED·NOT_USED/UNSET·정확한 기업/조직 Ref를 보존하고 canonical V2 predicate 리스트로 변환한다. 원래 의미를 모르는 값은 reject/보류하며 추정으로 빈 배열을 ALL로 바꾸지 않는다.

| 기존 유효 표현 | V2 변환 |
|---|---|
| SITE_ALL_DEPARTMENTS siteRefs=[서울,부산] | 같은 행위 (department ALL,site EXACT서울) OR (department ALL,site EXACT부산) |
| DEPARTMENT_ALL_SITES departmentRefs=[IT,총무] | 같은 행위 (department EXACT IT,site ALL) OR (department EXACT총무,site ALL) |
| DEPARTMENT_SITE의 원래 명시 쌍 [서울IT,부산총무] | 원래 두 완성된 EXACT 쌍만 OR; 서울총무/부산IT를 만들지 않음 |
| ENTERPRISE_ALL | 같은 기업 두 축 ALL 한 predicate |
| USED/NOT_USED가 확인된 미사용 문맥 | 원래 정책/개정에 맞는 NOT_USED; UNSET 누락을 미사용으로 바꾸지 않음 |
| 쌍/곱집합 의미 미확인·다른 기업·개정 누락 | 자동 분해 금지; 보류/현재 명시 관리 정정 |

형식의 다중 ID 자체가 거절 사유는 아니다. legacy decoder가 원래 허용한 DEPARTMENT_SITE의 명시 곱집합이 **기존 계약/실제 policy로 확인**되면 그 원래 유한 집합의 각 완성된 쌍으로 손실 없이 분해한다. 그 의미가 확인되지 않으면 두 배열로 임의 곱집합을 추론하지 않는다. retired 조직/원래 주문 문맥은 그대로 남긴다.

마이그레이션은 old+new 해석 병행→등록 schema/data 새 필드 backfill→전체 허용 집합/부정 fixture 차분→새 write 활성화 순이다. 기업/행위/과거 문맥/NOT_USED·multiID/role revision·회수에 대해 전후 허용 집합과 deny 이유를 비교한다. rollback은 코드 decoder/feature routing만 되돌리고 새 grant·회수·소비의 보호 원본을 과거 snapshot으로 덮지 않는다. new-only grant를 old 표현으로 의미 보존할 수 없으면 그 write를 old handler로 보내지 않고 지원되는 버전 유지 또는 안전 거절한다. 기능 설계 R-03의 호환 경계다.

<a id="SD09"></a>

### SD09. 보호 논리 변경·성공 접수·복구

모든 초대/소속/grant/역할 개정·회수·code 실패/소비·Grant/ClaimReceipt/EnrollmentAuthority·확인/보류/종료·관리자 재지정·session/binding/security 변경에 같은 primary transaction/복구 후보를 적용한다. Idempotency key+operation/target+canonical inputDigest가 같은 원래 결과만 대조한다. raw secret을 digest로도 관측에 노출하지 않는다.

U1 ND-REL-03의 primary commit→완전 payload를 독립 보호 DB append/durable 확인→끊기지 않는 prefix→protected visibility/Receipt/필요 Outbox→success ACK 순서다. 두 DB를 원자 transaction이라고 부르지 않는다. raw password/TOTP/code/token은 payload에서 제외하되 verifier/사용/회수/세대·target/claim/효과/이력·권위 개정·파기 marker는 완전 재구성된다. 외부 효과는 보호된 원래 permit 가시성 뒤에만 실행한다.

journal 불명·prefix gap/충돌은 success ACK/handle·민감 투영·외부 실행을 금지한다. 미보호 회수/소비/계정 변경을 옛 allow/ISSUED/current cache로 fallback하지 않는다. 대상 보안 fence 판정이 확정될 때까지 안전 거절/HOLD, 원래 candidate/결과는 보존한다. timeout/응답 유실은 같은 원래 ID/내용으로 대조하고 새 grant/새 소비로 retry하지 않는다.

복구는 쓰기/claim·영향 effect fence→새 recovery epoch→검증 snapshot+journal prefix/참조·ACK manifest 재구성→tombstone/회수/소비·현재 binding/effect 검증→새 한 writer epoch·핵심 업무 재인증 순이다. old session은 epoch 때문에 거절한다. 성공 ACK 유실0·중복0, consumed code/grant·5실패/회수·expired/session 부활0을 비교한다. unknown effect는 그대로 보존해 재송신하지 않는다. 센터 소실급 제외를 일반 저장/논리 손상/일시 AZ 장애로 확대하지 않는다.

<a id="SD10"></a>

### SD10. worker·외부 결과·운영 통지

worker는 message마다 envelope와 등록 owner/operation/schema/version·consumer·sourceFact/target·원래 work/permit/current permission/epoch/lease/기한·누적 attempt를 검사한다. 한 malformed sibling이 정상 메시지 전체 판정을 중단하게 하지 않으며 해당 메시지는 bounded quarantine/no success ACK로 보존한다. U1의 실제 broker/만료 work 문제는 별도 구현 회귀 선행조건으로 남기고 여기서는 패턴을 정의한다.

위임 작업은 원래 사용자 현재 authority를 재확인한다. 합법 SYSTEM fact 소비는 registered purpose만 적용하며 사람의 로그인 session을 요구하지 않는다. 실제 실행/효과는 내부 owner transaction 또는 C21 original result와 보호 consumer effect record로 대조한다. stale/expired 작업도 상태/원본 보존과 REVIEW_REQUIRED/HOLD로 닫고 deadline 검사 예외 때문에 영구 PENDING에 남지 않게 한다.

외부 기술 retry는 최초+추가3회/첫 시도부터5분/개별30초/원래 더 짧은 기한·현재 허가 내 안전 transient만이다. delay와 circuit breaker는 기존 U1의 full jitter0–5/0–20/0–80초, 접점30초 연속5기술실패→30초제한, 전체 replica 부작용 없는 HALF_OPEN probe1개를 유지한다. UNCONFIRMED/UNKNOWN·auth/input/permanent config·현재 허가 상실은 자동 resend 대상이 아니다. 구체 실행 자원은 LC03.

자동 복구 시도 시작부터 기존 독립 Slack/이메일 developer 알림 의무, 실패/수동 필요 긴급 통지, 명시 수신/확인과 실제 복구 완료 구별을 유지한다. 고객 당사자 복구 결과는 E01/U7, 운영 incident 알림은 기존 운영 경로다. 알림에는 원래 correlation/source 상태와 필요한 최소정보만 넣고 코드/근거 상세/전체 고객 identity를 포함하지 않는다. 실제 receiver/channel/국내 경로 검증이 없으면 synthetic result만 기록한다. 실제 Slack/email 발송은 이 설계 단계에서 하지 않는다.

<a id="SD11"></a>

### SD11. 비밀 수명·암호화·보관/파기

TLS1.3 기본/검증된 호환 TLS1.2만, hostname/certificate 검증·저장/backup 암호화·단일 AWS 계정 내 IAM/secret/DB 경계를 U1과 같이 적용한다. 실제 cipher/key·국내 provider/storage/backup·로그/전달 경로를 Infra에서 확인한다. 개발 secret/synthetic fixture와 실secret은 분리한다.

purpose verifier는 서버 비밀 키와 grant/case/account/세대/목적의 정규화 메시지에 대한 HMAC-SHA-256 설계다. 비교는 일정 시간 검증, keyVersion은 별도 secret store의 국내 key와 연결한다. raw secret과 keyed verifier를 같은 평문 general DB에 두지 않는다. BackupCode/Invitation/PartyContext/Grant의 purpose domain을 구별해 교차 검증을 금지한다. crypto 실제 구현/entropy/키 접근·회전·오입력·timing은 코드/보안 시험 대상이다.

전달/진행에 불가피한 raw invitation·provider session/TOTP QR secret·한시 password 등은 **목적별 암호 envelope store**에 둔다. 일반 primary/Outbox/journal/trace는 Ref·digest/상태/expiry만 참조한다. 암호 store는 독립 보호 DB의 제한 접근 namespace/역할과 별도 key 권위로 운용하되 복구 원장 append 권한이 암호 원문 read 권한을 뜻하지 않는다. AES-256-GCM envelope/AAD=(purpose,target,account,audience,bindingGeneration,sourceRevision,expiry), unique nonce·keyVersion·무결성/접근 로그를 요구한다. API/worker의 exact operation permit만 읽고 owner/운영 기본 조회는 읽지 못한다. 별도 AWS 계정을 추가하지 않는다.

- 인계 raw code는 발급/당사자 전달 동안만 유지, claim/expiry/revoke 때 파기; 불명 전달이면 현재 기한 내 동일 원문 목적 전달만 허용하고 임의 TTL 연장/새 code 생성 금지.
- invitation raw 전달 자료는 발급 후 최대24시간의 첫 전달/안전 retry 구간만 유지하고 전달 확인/회수 시 먼저 파기한다. 이후 아직7일 PENDING의 재발송은 현재 관리자가 같은 deadline 내 tokenGeneration을 회수·교체하는 보호 변경을 거친다. 이전 링크 거절, invitation 수명은 그대로다.
- provider challenge session/QR secret은 실제 더 짧은 provider expiry 또는5분, password/TOTP 입력은 현재 실행 동안만(최대 작업30초/그보다 짧은 deadline) 유지하고 결과/expiry 시 파기한다. unknown effect의 operation/evidence 상태는 secret 파기와 별도로 보존한다.
- 단회 소비/회수·5실패·case/claim/권한·Receipt/보호 tombstone은 비밀 파기와 함께 삭제하지 않는다. expired verifier는 terminal 상태 보호 후 검증 불가로 바꾸며 참조/중복 판정용 비밀 없는 marker를 유지한다.
- 실제 본인/위임 증거·business/security history의 **법적 보관 기간·출처 인정 정책은 미확인**이다. 종류/목적·policy version·expiry/hold·정정/파기 권위와 대상 참조를 등록하기 전 실증거 수집/운영을 활성화하지 않는다. 임의 법정년수/새 compliance 기능을 만들지 않는다. 합성 자료는 시험 종료/정해진 fixture 수명으로 처리한다.

파기는 primary+protected reconstruction payload/암호 store+backup/복원 시 suppression marker를 함께 다룬다. 필수 이력/재구성 참조를 남기면서 raw 증거/secret의 재노출을 막는다. 암호 key 파기는 실제 관련 객체 분리/backup 접근·shared key 영향 검증 후 실행하며 key 삭제가 모든 lawful history 삭제를 의미하지 않는다. 정정은 원래 before/after·reason/evidence·correctionOf 관계를 추가하고 과거 근거를 몰래 덮지 않는다. 국내 저장 요구는 포함된 logs/backup·한시 전달 자료에도 적용하고 해외 경로 불명은 실자료 비활성이다.

## Input Validation and Security Pipeline

<a id="SD12"></a>

### SD12. 닫힌 입력·검사·활성화 조건

LC08의 versioned profile과 common:1 원본을 각 producer/consumer의 exact operation/target/context·입출력에 canonical runtime schema로 검사한다. DTO/TypeScript/TypeORM 타입 검증만으로 끝내지 않는다. 추가 속성·wrong enum/type/owner/nullable/purpose/target·다른 account/audience/case challenge·예상 개정 누락·stale policy·불가능 TTL는 거절한다. 서버 실행 문맥과 공용 입력은 별개이며 body/header의 issuer/verified/role/systemMode를 trusted context로 읽지 않는다. SQL 정렬/filter는 등록 allowlist와 매개변수 방식이고 원문 SQL/다른 schema 조회를 입력으로 받지 않는다.

exact deps/lockfile·formatter/linter/type/schema·비밀·SAST/의존성·CDK/생성 인프라·이미지/실행 보안 검사와 test-after Standard/직접 테스트 가능한 제품 코드 라인≥80%를 유지한다. 보고서 누락/미실행·false positive 근거 없는 면제는 통과가 아니다. 지원/취약점 예외는 실제 책임·사유/보완·기한/재검토를 기록한다. 노출 secret은 폐기/회전·관련 세대/허가·영향 확인으로 연결한다. 실제 새 SDK 지원이나 legal/authority/ingress 미확인을 합성 proof로 충족했다고 주장하지 않는다.

## Threat Verification

| 시험 묶음 | 필수 검증·현재 소스 증거 |
|---|---|
| SV01 현재 신원/접점 | 첫 MFA/초대 전용 미가입 context, password-only·wrong issuer/audience/binding·회수/epoch·직원 public/direct API/위조 ingress 거절; missing CSRF/origin·GET 변경 금지 |
| SV02 행위/정보·동일인 | 15행위 독립 OR·NOT_USED/UNSET·타 기업·과거/새 조직·동일인 다계정 계약 거절, SW 별도 규칙; 목록/건수/history/error/통지 누출0 |
| SV03 초대 | 정확7일경계·expired/resend token rotate/deadline 불변·현재 inviter/role/org 변경·동시 accept/revoke·ACTIVE 덮어쓰기/INACTIVE intent·유일 grant/보호 ACK |
| SV04 인계·등록 | 익명 원래 요청자·code만/다른party cookie/다른case/challenge·issuer회수·16문자/96bit·5분/5실패·동시 claim·claim 후5분·TTL retry 불변·한시 비밀 비노출 |
| SV05 복구/제공자 | password+unused code 단회·재발급/정기만료 없음·새 MFA/옛 무효화·새code보관·통지 의무/실전달 구별; timeout/late delete/ResourceNotFound/unsupported→HOLD, old/new subject격리·password 교체 제한 |
| SV06 HOLD/관리자 | 수동/비상/재지정 각 재개/종료 현재권위·근거/개정·원래 효과/기한; linked new source·관리자0/동시0·다른grant 보존·실제 권위 없는 합성 bypass 금지 |
| SV07 보호·동시·재기동 | primary/journal/prefix/ACK 경계 강제중단·rollback/restore 후 소비/회수/5실패 부활0·ACK 누락/중복0·현재 epoch/권한·외부 UNKNOWN 보존; expired work/혼합 malformed queue 회귀 |
| SV08 호환·자원·자료/검사 | legacy multiID 정확 OR·모호Cartesian/oldorder차분·version/rollback·bounded resource·secret/no-cache/국내·정정/파기 marker·필수 검사의 실제 보고서/80% |

U2 주 책임26AC와43NFR, 협력 조건/각 owner·U8/U9/U7/U10 통합을 분리한다. 설계의 SV 목록/trace OK는 실제 실행 통과가 아니다. 현재 단위/통합·PC1280·성능/복구/보안·범위 차분 결과는 코드 이후 새 source fingerprint로 기록하며 U1 예전 수치를 새 실적으로 재사용하지 않는다.

## Assumptions & Open Questions

- AD01 실제 확인/위임/비상 운영 정책·주체 자격/증거 출처·보관 기간은 아직 확보됐다고 가정하지 않는다. 미확인=HOLD/실활성 불가, 합성 fixture는 local profile에서만.
- AD02 실제 Cognito pool/client/국내 endpoint·IAM/새 API를 지원하는 exact SDK·timeout 효과 종료/격리·회사 사설 ingress·key/store/통지 receiver/실전달은 별도 확인 대상이다. 문서상 API의 존재는 실제 tenant capability 증거가 아니다.
- AD03 99.9%/30분/정확성·암호/보안·1인 운영은 목표/검증 조건이다. 현재는 설계이며 AWS 배포/실계정 변경·실 Slack/메일 전송을 수행하지 않았다.
- AD04 인계 상세 원본, HOLD 전이, scope 매핑은 이전 기능 설계 R-01–R-03의 후속 설계다. 과거 리뷰/완료 산출물을 수정하지 않으며 구현/검증이 끝나기 전 해소·위험 수용으로 표시하지 않는다.
- AD05 U1 Code Generation의 만료 작업/혼합 메시지 미해결2건은 SD10/SV07의 통합 선행조건이다. U2 문서 또는 단독 경계 시험으로 기반 구현 결함이 고쳐졌다고 가정하지 않는다.

## Sources

- S1 [security-requirements.md](../nfr-requirements/security-requirements.md), [tech-stack-decisions.md](../nfr-requirements/tech-stack-decisions.md), [nfr-design-questions.md](nfr-design-questions.md) —43개 요구·실제 확인·인계값/기존 수명·실제 증거 한계.
- S2 [functional-spec.md](../functional-design/functional-spec.md), [entities.md](../functional-design/entities.md), [rules.md](../functional-design/rules.md), [이전 기능 검토](../functional-design/reviews/review-01.md) —원본/워크플로·보완 provenance.
- S3 [contract-summary.md](../../../inception/contract-design/contract-summary.md), [components.md](../../../inception/domain-design/components.md) —닫힌 C01/C02/C21/E01·목적/target·owner.
- S4 위 명시적 U1 보안/신뢰성 통합 파일 —기존 protected prefix·세션/권한·원래 작업/실제 효과. U1 완료 기록 보존.
- W1 [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html), [Forgot Password](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html), 확인2026-10-09 —단회/기한/시도·안전 저장/본인 확인·미검증 요청 account lock 금지의 참고. OMS96bit/5분/5회는 표준 강제 숫자가 아닌 확인된 설계값이다.
- W2 SD06에 직접 링크한 AWS4개 공식 API, 확인2026-10-09 —API 문서상 factor/password/token 동작만 뒷받침한다. IAM/pool/SDK·원래 operation 종료/actual 국내 경로·모든 사용처 즉시 회수는 별도 증거다.

- W3 [Node.js22 crypto](https://nodejs.org/docs/latest-v22.x/api/crypto.html), 확인2026-10-09 — 난수/HMAC·암호 primitive 지원의 공식 참고. 실제 키/nonce/수명·안전 결합/성능은 SD11/SV08 구현 검증 대상이다.

