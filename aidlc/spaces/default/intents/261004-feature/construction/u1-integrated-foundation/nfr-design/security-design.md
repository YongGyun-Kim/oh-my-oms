# U1 Security Design

**Unit:** u1-integrated-foundation  
**입력:** 확인된 [질문/요약](nfr-design-questions.md), 고정된 Functional Design/NFR/계약.  
**판정:** 보안 패턴/추적의 정의다. 실제 계정·망·서비스·법 적용/암호화/검사·접근성/상용 적합성은 검증 전이다.

## Authentication and Authorization

ND-SEC-01. 고객 Cognito 공용pool1·직원 전용pool1의 OMS 화면/서버 인증 API를 첫 제공자로 사용한다. password+TOTP와 최초 필수 사전 복구 코드·보관 확인을 적용한다. raw password/TOTP/복구 코드·provider token은 DB 업무 원본/Outbox/원장·로그/trace·브라우저 영속 저장소에 복제하지 않는다. 코드 verifier는 보호된 비가역 검증 자료/사용 상태와 발급 세대로 분리한다. entropy/수량·검증 알고리즘/키·수명·시도/잠금 한도는 ND-RG01에서 실제 보안 근거/지원/공격 시험으로 고정한다. 값 없는 인증/복구 handler는 공개하지 않는다.

| 단계 | 권위/조건 | 허용 범위 |
|---|---|---|
| 등록/최초 password 변경 | C01/C21·서버 연결된 challenge | 등록 목적만; signup token/CONFIRMED만으로 업무 세션 불가 |
| TOTP 등록·보관 확인 | 검증된 provider factor + OMS 복구 코드 세대/확인 | 실제 검증/필수 단계 완료 뒤 로그인/업무 세션 |
| 일반 로그인 | password+실제 MFA challenge·활성 OMS binding/계정 | audience/현재 행위/기업 scope·직원 접점 별도 검증 |
| 분실 복구 | password+미사용 코드 또는 권한 있는 담당자의 확인된 신원 근거 | 재등록 목적 제한 세션; 업무 권한 자동 상승 없음 |
| 재등록 완료 | 새 수단 검증·기존 수단/코드/세션 무효화·이력/통지 | 완료 조건/원본 보호 후 새로운 업무 세션 |

이메일 일치·코드 없는 password·직원망 위치만으로 MFA를 해제하지 않는다. code의 원자 한 번 사용·재발급 전체 무효화와 실패/시도 상태는 동일 persistence/복구 보호 경계를 따른다. 사용자/네트워크/전역 한도를 함께 적용해 요청 분산으로 잠금을 우회하거나 공격자가 전체 계정을 임의 잠그는 문제를 시험한다. 실제 provider/코드 정책의 미확인은 합성 fixture와 구별한다.

ND-SEC-02. 안정 Account.accountId와 provider issuer/subject·audience·bindingGeneration/상태·검증 근거를 분리하는 persistence 확장을 코드 전 등록한다. Session은 Account/bindingGeneration·MFA 근거·audience/목적·현재 auth 개정과 연결한다. Cognito→출시 후 Keycloak 전환은 계획이며 날짜/자격증명 직접 이전 가능성은 미확정이다. mapping/evidence·실제 로그인/MFA 재준비·dual binding 금지/허용 전환 조건·회수/되돌림을 검증하며 email/group로 동일인/권한을 자동 합치지 않는다.

MFA 수단 제거는 외부 결과 불명/늦은 완료를 가질 수 있다. factor 상태 Boolean만으로 옛 제거 요청의 실행 종료를 증명하지 않는다. 옛 subject의 미해결 제거가 새 factor를 손상할 수 있으면 같은 subject에 새 factor 완료를 허용하지 않는다. 검증된 종료/격리 근거가 없으면 목적 제한 복구를 보류한다. 제공자가 지원하면 확인된 동일인 근거로 새 독립 subject를 준비하고 새 factor/코드 확인 뒤 같은 Account의 active binding을 원자·보호 전환하는 격리 경로를 검증한다. 옛 issuer/subject/generation의 session/token/코드는 OMS에서 거절하며 늦은 제거는 새 subject에 닿지 않아야 한다. actual pool alias/로그인 식별자·새 subject 생성/disable/호환·기존 제공자 호출 불명/회수와 binding 전환은 ND-RG01의 코드 선행 시험이다. 지원/증거가 없으면 자동 rebind/복구 완료를 구현한 것으로 표시하지 않는다. [Cognito 제거 API](https://docs.aws.amazon.com/cognito-user-identity-pools/latest/APIReference/API_AdminDeleteSoftwareToken.html)

ND-SEC-03. Nest의 IdentityRecovery/EnterpriseAccess가 신뢰된 문맥을 생성하고 각 owner가 실행/commit/결과 투영에서 현재 권한을 재검증한다. body/header의 account/role/MFA·공유 BFF credential 주장을 권한으로 받아들이지 않는다. CUSTOMER/STAFF/public/등록·복구 목적 제한과 SYSTEM 실행 허가를 분리한다. 기업 승인·최초 관리자 지정·상품 등록·계약/거래 행위는 각각 grant가 필요하다. 초기 직원 신원은 Cognito 콘솔로 만들고 안정 Account 연결/최초 최소 staff.role.manage는 비공개 bootstrap 근거·실행자·대상/개정·이력·독립 복구 보호와 별도로 준비한다. pool group/CONFIRMED를 모든 grant로 승격하지 않는다.

계약 등록/승인은 확인된 서로 다른 사람이어야 하며 다른 계정의 자기 승인을 VerifiedPersonLink 근거로 거절한다. SW 실제 기간 조정은 등록/승인 권한을 분리하지만 동일 사람의 두 권한을 허용하는 기존 규칙을 유지한다. 고객 첫 관리자는 organisation/user/role 관리 범위만 명시적으로 부여하고 주문/지급/SW 행위를 자동 부여하지 않는다. 실제 사람/기업·소속/위임과 evidence 정책·승인자는 ND-RG01/09에 남아 있으며 fixture를 실제 확인 근거로 쓰지 않는다.

ND-SEC-04. 신규 주문의 USED는 같은 기업의 활성 조직/현재 orderingContextPolicy·행위 scope와 대조하고 NOT_USED는 명시 NULL, UNSET/누락은 거절한다. 기존 주문은 원래 정책/NULL·폐지 조직ID/개정을 보존하며 현재 해당 행위 scope로 접근한다. 조직 비활성만으로 기존 접근을 일괄 거절하지 않는다. 동일 행위의 완성된 scope만 합집합하며 다른 행위/target/record 사이 Cartesian 조합·빈 배열 wildcard를 금지한다.

organisationRevision은 EnterpriseAccess.Enterprise.revision에 대응한다. 부서/사업장 생성·활성/계층·정책 변경마다 enterprise revision과 이력을 같은 논리 커밋으로 증가시켜 신규 평가와 commit을 대조한다. 과거 주문의 snapshot 개정은 갱신하지 않는다. membership/grant의 현재 개정은 별도로 검증한다. FD R-01/NFR 검토의 후속 매핑이며 과거 문서/판정을 수정하지 않는다. [functional-spec.md](../functional-design/functional-spec.md)

## Session, CSRF and Security Headers

ND-SEC-05. 고객/직원 각각 별도 host-bound opaque cookie를 사용한다. Secure/HttpOnly·Path=/·Domain 미설정의 __Host- 이름과 명시 SameSite=Lax를 설계 기준으로 두고 actual host/별도 목적 cookie·TTL/회전/CSRF binding은 ND-RG02에서 고정한다. 신원 확인/재인증·복구 전후 session ID를 교체하고 raw provider token을 browser 업무 credential로 노출하지 않는다. 서비스 credential은 BFF 신원/허용 audience/operation만 증명하며 원래 사용자의 권위를 대신하지 않는다.

서버가 직원 유휴15분/고객30분·로그인 후 최대8시간과 logout·계정 전환·권한 회수/비활성·MFA/binding 변경을 확인한다. background polling/heartbeat가 유휴를 연장하지 않는다. 신뢰할 수 있는 사용자 조작 요청과 서버 활동 갱신을 구분하고 임의 client activity flag/clock을 믿지 않는다. 현재 세션/grant 판정 불가 시 보호 조회/변경을 거절한다. 미보호 회수/무효화도 옛 권한 허용으로 재사용하지 않는다. 이미 본 자료를 원격 삭제했다고 주장하지 않으며 새 투영/늦은 결과를 잠그고 현재 권한으로 재조회한다.

변경/인증/복구 POST는 서버 session 또는 pre-auth challenge에 결합된 CSRF token과 서버에 고정된 정확한 origin을 검증한다. public 인증 POST도 예외가 아니다. Origin/Referer의 trusted 설정·실제 missing/null 처리와 proxy 경계를 등록하며 둘 다 미확인인 경우 안전한 token/등록 정책의 증거 없이 허용하지 않는다. 안전 메서드 GET으로 업무 변경을 하지 않는다. SameSite/CORS만으로 CSRF를 증명하지 않는다. forwarded host/origin/직원 경로 근거는 승인 ingress에서 덮어쓴 검증된 값만 전달하고 direct API 우회를 시험한다. [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)

응답은 context-appropriate escaping/최소 DTO·등록 redirect로 XSS/유출을 제한한다. CSP의 script nonce/허용 source·frame-ancestors, HSTS 적용 범위, nosniff·referrer 제한·CORS 정확 origin을 실제 Next/HTTP/인증·첨부 경로에 설정/시험한다. 고객 입력을 raw HTML/임의 URL proxy/SQL 식별자로 실행하지 않는다. 실제 header/byte/첨부 검사 값은 ND-RG02/04에서 등록한다.

## Staff Network and Worker Trust Boundaries

ND-SEC-06. 직원 UI/인증·복구/갱신/API·RSC/첨부/진행 조회의 ingress는 승인 사무실망/회사 승인 원격 PC의 사설 연결이어야 한다. 공개 고객 ingress/BFF/토큰으로 직원 endpoint에 접근하지 못한다. trusted 원래 ingress/peer/전달 경로 증거와 현재 계정/MFA/grant를 함께 확인한다. BFF 서버 IP·User-Agent·화면1280·URL 접두어는 PC/직원망 증거가 아니다.

회사 IT/보안은 단말 등록/인증서·MDM/NAC/VPN 입장·회수를 소유한다. OMS/Infra는 승인 ingress·서비스 자격/경로·직원 접점 정책과 앱 신원/현재 권한을 소유한다. 실제 제품/담당자/회수/접속 중 변경·운영 증거는 ND-EB01–06/ND-RG08의 출시 선행조건이다. OMS에 DeviceEnrollment/기기CA/MDM 기능을 추가하지 않는다. 고객 PC 최소 폭은 UX 범위이며 보안 통제/회사 단말 승인과 구분한다.

ND-SEC-07. worker는 HTTP Guard/Pipe가 자동 적용됐다고 가정하지 않는다. registry의 owner/operation/schema/version·신뢰된 Work/Fact/원본 target·실행 permit/기한/epoch·consumer/lease를 명시 검증한다. 사용자 위임은 원래 principal/audience/action과 현재 grant를 확인하며 SYSTEM은 등록된 사실 소비/명시 목적/원본 권위만 사용한다. 위임 실패를 SYSTEM으로 바꾸거나 사용자 세션 없는 합법적인 SYSTEM 소비에 사람 MFA를 강요하지 않는다. 거절 뒤 접수/작업을 삭제하지 않는다. 외부 source/target/observedAt·원본/효과/중복을 확인하지 못하면 UNCONFIRMED/UNKNOWN을 유지한다. C19 진단은 읽기 증거이며 운영 ACK/재처리 자격은 업무 수정/승인 grant가 아니다.

## Encryption, Secrets and Compliance Controls

ND-SEC-08. browser/BFF/Nest·DB/원장·queue/provider·관측의 인증된 암호 전송과 저장/복제/backup 암호화를 요구한다. TLS1.3를 기본 방향으로 하고 검증된 호환 때문에 필요한 TLS1.2만 허용하며 구형 TLS/SSL·인증서/hostname 검증 생략은 허용하지 않는다. 실제 endpoint·cipher/인증서/키·종료 지점과 managed storage encryption·국내 key/backup 경로는 Infra에서 확인한다. [OWASP TLS](https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html)

앱/원장 append·대조/복구·관리/수명·배포/DDL·관측/통지 credential을 분리한다. 정상 앱에 원장 기존 row UPDATE/DELETE/TRUNCATE·owner/superuser/role 승격을 주지 않는다. 실제 membership/DDL·관리 우회/backup 삭제와 key 회수/복구 권위를 시험한다. secret은 runtime의 승인된 서비스 신원으로 필요한 목적만 조회하며 source/build/CDK output/번들·일반로그에 노출하지 않는다. 자체 암호 프로토콜을 만들거나 같은 앱 credential/backup을 독립 보호라고 부르지 않는다. 실제 service/key 제품·회전/보존은 ND-RG03/05/07/08에서 고정한다.

ND-SEC-09. 국내 저장은 업무 원본/원장/복제·backup·Next cache·관측·통지/외부 제공자에 들어가는 고객/주문/계약/식별자료까지 경로별 증거로 확인한다. 한국 region 이름만으로 외부 처리/저장/복제까지 충족했다고 표시하지 않는다. 충돌 경로는 실데이터 적용 전에 해소한다. 영어(미국) UI 계획은 USD/미국 출시/해외 저장 허가가 아니다.

| 자료 | 수명/파기 설계 | 확인 책임 |
|---|---|---|
| 업무/계약·이력/접수·근거 | 실제 조건/의무·정정/참조·미해결/보존 필요 분류 | 업무/자료 확인자·각 owner |
| idempotency·consumer/effect marker | 원래 업무/외부 재전송·복구 수명과 정렬 | U1/owner·Infra |
| 신원/복구 verifier/세션 | 목적/발급 세대·회수/만료·접근·provider binding | U1/U2·보안 |
| 원장/backup·복구 자료 | 독립 보호/접근과 합법 파기·복구 후 marker 대조 | U1/Infra/U10 |
| logs/trace/통지 | 최소 metadata·기간/국내 경로·loss/비용/접근 | U10/Infra |

Q22의 기존 정책/고객 조건 없음은 무기한 실자료 보관/자동 파기·법정 연수/준수 인증의 근거가 아니다. 실제 기간/시작점/예외/삭제 marker·key/backup 처리와 restore-not-resurrect를 ND-RG05에서 실데이터 전 확정한다. 원장 전체 payload 보호가 민감자료 영구 보관을 정당화하지 않는다. 업무 이력은 원본에 행위자/시각/사유·전후/근거/정정 관계로 보존하고 operational telemetry는 필요한 ID/결과·시간만 허용한다. password/code/token/cookie·라이선스 키/계약 상세·민감 SQL parameter는 내보내지 않는다.

## Input Validation, Security Pipeline and Exceptions

ND-SEC-10. canonical JSON Schema2020-12를 registry의 실제 operation/target/path/version·입력/출력에 연결한다. producer와 입력은 등록된 closed 정책으로 검증하고 consumer의 허용된 unknown response field 무시와 구별한다. TypeScript/DTO/Pipe/TypeORM 타입만으로 runtime 적용을 주장하지 않는다. Ajv2020 지원 class를 검증 후보로 두되 actual supported version/format/custom keyword·strict 설정/lock·컴파일/호환 시험은 ND-RG07에서 고정한다. draft-07 default instance와 혼용하지 않는다. [Ajv JSON Schema](https://ajv.js.org/json-schema.html)

CE01–04와 RequestReceipt/Work correlation/binding 확장의 실제 필드·required/null/unknown·operation binding과 공급자/소비자 계약을 코드 전 등록한다.0/음수/잘못된Money·조직 UNSET/누락·지원하지 않는 타입/다른 키내용·오래된 revision은 등록된 실제400/409/RFC9457 의미를 따른다. 오류/목록/trace/첨부로 타기업 존재·계약 상세를 노출하지 않고 내부 예외·stack·secret은 일반 응답에 넣지 않는다. 오류도 실제 HTTP status로 측정한다.

ND-SEC-11. 비밀/SAST/의존성·CDK/생성infra·격리 합성환경 runtime 검사는 필수다. 각 도구/대상·로컬/CI 명령·주기·차단선·보고서/예외를 ND-RG07에서 적용 전 고정한다. 실패/미실행/보고서 누락은 병합/해당 배포를 막고 flaky 반복 성공·하한 완화로 대체하지 않는다. 보안 예외는 담당/사유/만료/재검토·잔여위험을 기록하고 검사 통과와 구별한다. 노출 secret은 폐기/교체·실제 사용/영향/로그/backup 범위를 대조한다. 실제 고객/외부 무자격 대상에 검사를 실행하지 않는다.

## Threat Verification and NFR Mapping

| NFR | 설계 | 필수 공격/경계 시험 |
|---|---|---|
| NFR1.1 | ND-SEC-01/02 | 미완료 MFA·코드중복/재발급·옛 factor 늦은 제거/복구 불명 |
| NFR1.2 | ND-SEC-03/05 | 위조 principal/role/MFA·audience·직접/BFF 경로 |
| NFR1.3 | ND-SEC-04 | USED/NULL/UNSET·폐지 조직 기존조회·scope Cartesian/epoch 경합 |
| NFR1.4 | ND-SEC-06 | 공개/직접/RSC/첨부/인증·회수/망 근거 위조 |
| NFR1.5 | ND-SEC-05 | idle/8h·poll 미연장·logout/회수·미보호 무효화 |
| NFR1.6 | ND-SEC-05 | CSRF/public POST·origin/null·proxy/host·cookie fixation |
| NFR1.7 | ND-SEC-03 | 동일 사람 다른계정 계약자기승인·SW 별도 규칙·첫admin 최소범위 |
| NFR1.8 | ND-SEC-05/10 | SSR/RSC/cache/error/목록·계정 전환/회수 후 누출0 |
| NFR1.9 | ND-SEC-07 | 미등록 worker·위임→SYSTEM 우회·늦은 실행허가 |
| NFR1.10 | ND-SEC-07/09 | C19읽기/외부결과 신뢰·license/contract 비노출 |
| NFR1.11 | ND-SEC-08 | TLS/secret/권한·DDL/owner 우회·표식 반출 |
| NFR11.1 | ND-SEC-09 | provider/원장/backup/log/통지 국내 경로 증거 |
| NFR11.2 | ND-SEC-09 | 기간/파기·키/참조·restore 후 재실행/부활 방지 |
| NFR11.3 | ND-SEC-09 | 업무이력/관측 분리·redaction/권한·canary |
| NFR14.1 | ND-SEC-11 | 필수 검사 대상/보고서 누락·실패 차단 |
| NFR14.2 | ND-SEC-11 | 예외 만료/재검토·실제 secret 교체/영향 |
| NFR14.3 | ND-SEC-10/11 | exact versions/지원/advisory/validator·관련 코드 전 고정 |
| NFR13.1 | ND-SEC-10 | canonical2020-12·unknown/required/null·CE01–04 등록/compat |

검증 주체는 합성 허용/거절 계정·기업/조직/actor 쌍과 민감 표식을 사용한다. U1 최소 흐름과 U2/각 업무·U8/U9 전체 화면 및 U10/Infra 실제 접근/운영을 구분한다. 상위62개 연결은 [traceability.json](traceability.json)에 있으며 문서 검사를 제품 보안 통과로 표시하지 않는다.

## Assumptions & Open Questions

실제 identity/provider·factor 종료/복구 지원·동일인/기업/직원 접속·처리 지역·암호/key·period·지원 버전·검사 도구/실제 수신자는 미확인이다. [logical-components.md](logical-components.md)의 ND-RG01–10과 Q&A ND-OQ01–07의 관련 코드/실데이터/운영 선행조건을 유지한다. 키클락 전환은 계획이며 무중단 자격증명 이전/모든 provider 호환의 증거가 아니다.

## Upstream Coverage

다음8개입력의 정의를 실제 설계/추적과 연결했다. 필드/원본과 미확인 선행조건은 위 구현 gate에 유지하며 기존 정의/판정을 소급 변경하지 않는다.

| 입력 원본 | 연결 설계/의미 |
|---|---|
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-requirements/performance-requirements.md | [performance-design.md](performance-design.md) — ND-PERF-01–05; latency/HTTP/UI/worker·error 분모 |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-requirements/security-requirements.md | [security-design.md](security-design.md) — ND-SEC-01–11; MFA/현재권한/망·신원/자료/검사 |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-requirements/scalability-requirements.md | [scalability-design.md](scalability-design.md) — ND-SCALE-01–05; 합성 부하/scale·global cap/backpressure |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-requirements/reliability-requirements.md | [reliability-design.md](reliability-design.md) — ND-REL-01–08; 내구접수/원장/복구·효과/배포 |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-requirements/observability-requirements.md | [observability-design.md](observability-design.md) — ND-OBS-01–08; SLI/trace·독립알림/ACK·C19 |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/nfr-requirements/tech-stack-decisions.md | [logical-components.md](logical-components.md) — ND-LOG-01–07/RG01–10;4역할/실제version·운영/UI/검증 |
| aidlc/spaces/default/intents/261004-feature/construction/u1-integrated-foundation/functional-design/functional-spec.md | [logical-components.md](logical-components.md) — CE01–04/원래조직/Work correlationId·typed 원본/owner |
| aidlc/spaces/default/intents/261004-feature/inception/contract-design/contract-summary.md | [security-design.md](security-design.md) — C00–C26/G01–G23·canonical/실패/시간·current scope/permit |

## Sources

- [security-requirements.md](../nfr-requirements/security-requirements.md), [tech-stack-decisions.md](../nfr-requirements/tech-stack-decisions.md)
- [질문과 확인](nfr-design-questions.md): Q4–7/12/13철회/15/20/22–25/28/32·구체화/요약 확인.
- [functional-spec.md](../functional-design/functional-spec.md), [entities.md](../functional-design/entities.md), [contract-summary.md](../../../inception/contract-design/contract-summary.md)
- [Cognito MFA](https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html), [Cognito admin creation](https://docs.aws.amazon.com/cognito/latest/developerguide/how-to-create-user-accounts.html), [Keycloak administration](https://www.keycloak.org/docs/latest/server_admin/index.html): 실제 지원/자격·MFA/OMS 권한·전환 시험을 별도 수행한다.
- [PostgreSQL privileges](https://www.postgresql.org/docs/current/ddl-priv.html): 정상 role/owner/superuser 구별이며 독립 보호/복구 완료 증거가 아니다.
