# U2 CI/CD와 공유 인프라 연결 설계

**Unit:** u2-identity-enterprise-access  
**적용:** library/embedded. 기존 API·Nest standalone worker·고객/직원 BFF와 저장·보호·queue·관측을 공유한다. 이 단계의 산출물은 이 문서와 traceability.json이다. 완성 IaC/워크플로·제품 코드는 Code Generation에서 생성한다.

## Design Basis and Upstream Coverage

[확인 질문](infrastructure-design-questions.md)의 Looks correct를 적용한다. [security-design.md](../nfr-design/security-design.md)의 SD01–12와 [logical-components.md](../nfr-design/logical-components.md)의 LC01–10, [components.md](../../../inception/domain-design/components.md), [functional-spec.md](../functional-design/functional-spec.md)의 WF01–09/CE-U2-01–07, [contract-summary.md](../../../inception/contract-design/contract-summary.md)의 C01/C02/C21/E01·공통 원본/실행 경계를 소비한다.

명시적 U1 통합 파일은 [cicd-pipeline.md](../../u1-integrated-foundation/infrastructure-design/cicd-pipeline.md) CI-01–07이다. main/staging/production 승인·rolling/호환 되돌림 방향을 상속한다. 완료된 U1 기록과 측정 원본을 다시 쓰지 않는다.

현재 저장소 .github/workflows/u1-validation.yml·package.json·infra/cdk/src/profile.ts/runtime-binding.ts/storage.ts/compute.ts와 packages/integrations/src/cognito.ts를 읽었다. 현재 CI는 contents:read·운영 자격 없는 합성 검증이며 배포 job이 아니다. CDK profile은 SYNTHETIC_SYNTH/000000000000·ap-northeast-2만 허용하고 task는 REAL_ACTIVATION_UNVERIFIED다. API에 AdminGetUser를 연결한 기존 source를 새 admin 복구 operation 지원으로 해석하지 않는다. 이 문서 작성에서 source/CI/CDK·실계정/환경을 변경하거나 실행하지 않았다.

<a id="IP01"></a>

## IP01. Source, Release Identity and Activation Boundary

기존 Node22.23.3/npm10.9.9와 lockfile/exact dependency/tool 검증을 유지한다. 확인한 snapshot은 현재 repository의 값이며 지원/취약점 검사가 실제 통과했다고 주장하지 않는다. 새 SDK/crypto/profile 지원이 필요하면 exact version과 호환·보안 근거를 Code Generation 전에 고정한다. 최신 문서 예제를 따라 플랫폼을 다시 선정하지 않는다.

release identity는 source SHA·source/model/contract manifest·lock/tool versions·제품 image digest·CDK synth/template digest·config/capability/schema registry revision·보고서 digests·fixture seed/실행 시각/범위와 관련 원래 review 조건을 묶는다. “최신 image”/새 main HEAD/예전 U1 측정을 현재 U2의 검증 대상으로 대체하지 않는다. 동일 staging 검증 산출물을 production 확인 대상으로 삼는 기존 방향을 유지한다.

현재 local/CI activation profile은 synthetic-only다. 인증 pool/account/company/확인 근거·provider/queue/통지 sink·암호 자료·사설 접점은 명시 합성 fixture로 분리한다. SDK doubles/local queue는 실제 Cognito/SQS 동작 증거가 아니다. local runner가 실제 pool/user를 호출하거나 실제 Slack/email로 보내지 않도록 target allowlist/fixture provenance를 검증한다. 실제 cloud mode는 현재 차단을 유지한다. 이 설계 승인으로 deploy/bootstrap/push/실계정 변경을 실행하지 않는다.

실제 활성화는 검증된 account/region/ingress·domestic key/data path·provider capability/실제 신원·위임/운영 권위·수신자·등록 schema/모델/검사·현재 승인 manifest가 있어야 한다. 부분 준비는 기능별 HOLD/비활성으로 표시하고 합성 성공을 실제 준비 완료로 올리지 않는다.

<a id="IP02"></a>

## IP02. Pipeline Stages and Gates

| 순서·단계 | 구체 연결 / gate | 산출 증거·실패 처리 |
|---|---|---|
| 1 source/fixture admission | 같은 SHA/lock·synthetic-only·local target/비밀 비포함·현재 schema/model input | admission/프로필 보고서; 실제 credential/target 발견 시 실행 전 차단 |
| 2 install/build/check | 기존 npm ci/도구 bootstrap·format/lint/type·계약2020-12/닫힌 producer/consumer·U2 모델/handler 등록 | 실제 command·tool version/report digest; 누락/미실행 실패 |
| 3 unit/integration | U2 신원/권한·인계/초대·HOLD/원본·두 PG/보호·동시/재시작·기한/queue·관련 U1 회귀 | SV01–08/주 책임26AC·상세43NFR의 현재 결과·fixture/source binding |
| 4 PC/security/coverage | 변경 접점 PC1280·origin/CSRF/private route·cache/비밀·현재 권한·필수 secret/SAST/dependency/IaC/runtime·전체 제품 라인≥80% | 최소 보고서·실행/제외/분모; 모바일 제외로 접근성/확대 검증 면제 불가 |
| 5 image/synth/capacity/restore | 같은 image/platform·합성 CDK·전체 pool/권한/key/queue footprint·현재 U2 normal/peak/recovery·ACK/current-security 대조 | 배포 없는 template/image·성능/복원 증거, 달성 실패/미확인은 성공으로 종결하지 않음 |
| 6 immutable validation manifest | 위 결과/부하 profile·coverage denominator·현재 source/다이제스트·미해결 조건을 묶고 누락 검사 | .reports/u2/release-validation.json(예정); 이전 report/다른 SHA 재사용 금지 |
| 7 local integration readiness | 새 profile/모델/보호 payload·old/new·HMAC 입력·기반 경계 회귀 통과한 local feature만 활성 | 실제 등록/검증된 부분과 실환경 미확인 조건 분리 |
| 8 future staging/production | 기존 main→staging 자동/production 사람 확인 방향; 실제 지원/권한/국내 경로/manifest·호환 조건 필요 | 현재 job으로 실행하지 않음. 별도 actual readiness·deployment 권한 확인 없으면 차단 |

필수 검사/보고서 실패·미실행·누락 시 관련 merge/release를 보류한다. 불안정 시험 반복으로 우연히 통과한 결과/하한 완화는 불가다. 로컬과 CI는 같은 명령/lock/분모·profile을 사용하고 OS/provider 차이는 실제 근거로 명시한다. 위 새 U2 command/report 경로는 구현할 설계이며 현재 package scripts에 등록됐다고 주장하지 않는다.

기존 U1 validation job을 유지하고 U2 validation job·두 결과를 확인하는 필수 결과 집계를 추가하는 방향이다. 각 job은 별도 합성 DB/profile/report namespace, timeout180분·동일 ref의 cancel-in-progress:false를 기준으로 종료/보고서 누락까지 확인한다. 집계는 어느 job의 실패/취소/skip·missing report 또는 SHA 불일치에도 성공하지 않는다. U2 전체 제품 coverage에는 관련 기존 파일과 새 파일을 모두 포함하고 U1 job의 개별 coverage를 새 전체 분모로 대체하지 않는다. CI 실행 시간/분 비용은 실제 측정 후 평가하며 이 단계에서 job을 실행하지 않는다.

<a id="IP03"></a>

## IP03. Required Checks, Test Evidence and Open Preconditions

| 검사·검증 | 명시 대상 / 실행 형태 | 통과·차단 / 협력 경계 |
|---|---|---|
| U2 check/contract/model | 새 명령 check:u2(예정), CE-U2·ND 추가 closed context/target/nullable/enum·registry·실제 TypeORM 모델/변경 payload·migration | actual registration/negative fixtures·구/신 지원 version 일치; TypeScript/DTO만으로 runtime 검사 대체 금지 |
| unit/integration·current authority | test:u2:unit/integration(예정), current Account/binding/security/enterprise/membership/role·15행위/4scope·관리 self-grant·동일인/직원 private ingress | 허용/거절·다른기업/행위·원래/retired 조직·회수/commit 경합·최소 결과, SV01/02/06/08 |
| invitation/claim/MFA | exact7일·현재 inviter/role/org/본인·원자 accept/revoke·96bit/5분/5회/청구후별도5분·당사자context·원래target/세대·직접backup/password | 원래 익명 요청자/code만/다른cookie/다른case·기한경계·중복/재발급/파기·TTL retry 거절; 실제복구완료 vs통지의무/전달, SV03–05 |
| HMAC verifier 입력 | 목적별 domain/version·target/account/세대의 length-bounded canonical bytes **및 후보 비밀의 정확한 bytes**를 하나의 메시지로 검증 | 같은 metadata의 비밀1byte변경·다른목적/세대/대상은 실패. 인계16문자 base64url의 canonical decoding/길이·재encoding을 검증; 자유 trim/대소문자 변환으로 다른 비밀을 합치지 않음 |
| bounded/unknown/worker | 원래permit/work/consumer/epoch/lease/deadline·30초/누적1+3/5분·provider unknown/late effect·per-envelope queue parse | expired PUBLISHED를 보호 HOLD/REVIEW_REQUIRED로 보존·혼합 malformed 메시지와 정상 sibling 독립 처리/no false ACK, SV05/07 |
| protected recovery·migration | 각 primary/journal/prefix/ACK/claim 경계 crash·snapshot뒤 최신 소비/회수/5실패/파기·originalUNKNOWN·scope/version차분 | ACK 누락/중복0·권한/code/grant/session 부활0·old/new 허용집합 동일. provider 호출을 payload replay로 재실행 금지 |
| PC/current UI | U2 변경 인증/초대/인계·권한/보류 상태를 기존 고객/직원 BFF와 연결해 PC1280·keyboard/focus/label·기한/재인증·no-store/CSRF·private proxy 검증 | 전체 U8/U9 UI·출시 고객4종/직원2종 최신/직전 stable·WCAG2.2AA 실증은 해당 통합 단계. 기존 Chromium4시험을 전체 browser/화면 통과로 부르지 않음 |
| coverage·security | 기존 test-after/Standard, 미실행 포함 직접 작성한 모든 테스트 가능 제품 파일·U1+U2/호스트 변경 전체 분모·secret/SAST/dependency/CDKtemplate/image/격리 runtime | coverage≥80%; 제외 사유/보고서/각 관련 source digest 필요. scan 미지원/skip를 PASS로 표기하지 않음 |
| performance/restoration/ops | IP06/07의 고정 current U2 profile·실제 resource/latency·독립 ACK 목록/현재 state·손작업/총경과 | 합성 정상/집중/회복과 local fault 검증. 실제 AWS/단일AZ/30일/운영 사람 준비는 별도 |

NFR Design의 Minor R-01은 verifier 입력 명료화의 provenance다. 이 표는 코드 생성 선행 정의/negative fixture를 구체화하며 이전 nfr-design 산출물/리뷰 상태를 고치거나 구현 해소를 선언하지 않는다. SV04/SV08의 잘못된 코드 거절과 현재 source crypto 검증에 연결한다.

기능 설계 R-01–R-03의 인계/닫힌 HOLD 전이/legacy multiID scope, U1 Code Generation의 만료 작업과 mixed queue parse 미해결2건은 관련 actual implementation/regression 조건으로 유지한다. 이전 finding을 문서만으로 Resolved/Accepted risk로 바꾸지 않는다. 공유 소스 수정이 필요하면 U2 구현 계획의 정확한 파일/영향·source manifest·회귀 결과를 명시하고 완료된 기록을 보존한다.

<a id="IP04"></a>

## IP04. Shared Resource and Runtime Binding Mapping

| 공유 resource / 현재 확인한 source | U2 적용 설계 / 경계 | actual 적용 전 검증 |
|---|---|---|
| 기존 API/worker/customer-web/staff-web Fargate/task·BFF | 새 service 추가 없이 owner/module/handler·UI purpose 연결. 직원 ingress는 기존 private boundary, 정상 customer로 staff 복구 우회 금지 | source/이미지 4역할·실제 module injection·direct API/forwarded header·currentpurpose·실제 회사망 readiness |
| primary PG17/TypeORM | 신원·권한/초대·grant/claim/MFA/case/역할 모델·access/security fence·짧은 예상개정 transaction/unique effect·복구 후보 | 새 migration/target/decoder·같은 EntityManager·pool/lock/stmt cap·현재grant/result 투영 |
| 별도 ProtectedJournal PG/보호 key | SD09 primary→journal→연속prefix→가시성/ACK; U2 payload/소비·실패5/회수/파기/현재 세대 완전 재구성 | append/read/restore/관리 권위 구별; 미보호회수/소비에 old allow fallback 금지·복원ACK/currentstate 대조 |
| PurposeSecretVault(논리) / 같은 보호 저장 경계 | SD11 목적 암호 envelope·별도DB권한/secret key·general journal/Outbox는Ref, raw input/token/QR/password는한시 | 실제 table/DBrole/secretARN·keyversion/AAD/nonce·decrypt 권한/expiry/파기 suppression·backup 재노출 검증 |
| Cognito 고객/직원 pool/client·현재 API AdminGetUser binding | first provider 유지, user challenge 흐름과 admin 승인operation 분리. 신규 IAM admin지원은 아직 코드/실자격으로 확보 안됨 | exact pool/issuer/client/audience·SDK/API·국내endpoint·현재 binding/policy; 원래effect 종료/격리 없으면HOLD |
| Outbox/SQS/consumer/DLQ | 보호 원본만 relay·현재registered identity operation/notice consumer mapping, per-message bounds | 현재 code의notice queue를모든 recovery operation queue로가정하지않음. 필요한consumer queue/permission·handler/schema 등록/합성SDK/실SQS 경계 |
| CloudWatch/OTel/Slack+email·E01/U7 | IP07 최소metadata/trace·자동시도처음부터 독립운영알림과 당사자실전달을구별 | 실제 receiver/endpoint/국내경로·발송request/actualsend/readACK/실제 복구 분리, local sink only |
| 기존 GitHub workflow/도구/report | existingrequiredU1검증+U2job/명령·전체coverage/필수security·동일 release/source·최소결과 수명 | source-specificproof·소스/secret/rawevidence artifact반출 0·job권한·timeout/잔여resource·검사누락 차단 |

위는 library가 소비하는 구성의 매핑이며 실제 자원을 provision한 결과가 아니다. CDK의 DB multiAz:false/서로 다른 합성AZ·public-task/private-ingress·현재기본sizing을 운영99.9%/RTO30분 증명으로 해석하지 않는다. U2는 topology를 임의 변경하지 않는다. 실제 topology/회복/국내경로·총resource budget이 준비되지 않으면 realactivation은 계속 차단한다.

<a id="IP05"></a>

## IP05. Identity, Secrets and CI Privileges

현재 CI contents:read를 유지하고 build/test에는 production OIDC·AWS credential·real provider clientsecret/DBkey·비공개 운영/복구 권위를 부여하지 않는다. synthetic hash/envelope key·source-specific fixture만 사용한다. PR/fork/로그/artifact를 통해 실수로 realtarget을 선택하지 않게 admission/runtime allowlist를 검증한다. credentials 없는 workflow라고 사용자용 Cognito public API를 실제 호출해도 안전하다고 가정하지 않는다.

| 실행 경계 | 필요한 권위 / explicit deny |
|---|---|
| customer/staff BFF | 목적별 gateway/현재origin·CSRF·session handle; DB/원장·provider admin/비상 권위 직접 접근 없음 |
| API identity handler | 기존 audience/client·user auth/MFA challenge·현재등록연락/currentbinding 조회·명시한 최소 verifier/vault용권위; operation별 exactsource/purpose 검사 |
| worker admin identity operation | 보호된원래permit/currentcase/당사자claim·epoch/lease/기한에 한정한 수단 제거·global signout·해당 당사자 firstfactor 교체 capability. AdminDeleteSoftwareToken/AdminUserGlobalSignOut/AdminSetUserPassword는 exact pool ARN/자격·등록operation으로만 계획 |
| secret/envelope read/write | 정확 purpose/target/expiry·현재 permit·별도 key/DBrole. generaljournalappend/관측read/CI가 raw secret decrypt 권위 아님 |
| 일반 app/CI deploy | DDL/owner/superuser·ProtectedJournal UPDATE/DELETE/TRUNCATE·backup/key파기·관리자승격 권한 없음 |
| migration/restore/비상 | 등록된비공개현재자격·exacttarget/원본개정/근거·다이제스트/이력; 일반CUSTOMER/STAFFrole/header에서선택불가 |

worker의 새 pool/client/config·secret 목적 경로·IAM binding은 Code Generation에서 실제 필요한 operation에만 추가하고 template/assertion/negativeIAMfixture로 대조한다. API에도 같은 admin action을 자동 grant하지 않는다. 현재 inline source의 pool AdminGetUser만으로 신규 worker admin 기능 준비를 주장하지 않는다. 해당 SDK 명령·pool권위·현재원래effect 안전이 없으면 관련 actual recovery는HOLD다. 기존 C21에서 원래 효과가 불명인 경우 무조건 재송신할 수 있다고 표시하지 않는다.

verifier 메시지는 IP03 후보 비밀 bytes를 포함한 domain/version·정확target/generation의정규화자료다. crypto/HMAC/envelope keyVersion은실제국내secret/key권위에결합한다. rawinvitation/인계/partycontext/provider session/password의수명·회수/폐기와별도비밀없는consumed marker/receipt는SD11을따른다. 암호값은일반templated output/로그/이력/Outbox/복구payload/metric label에복제하지않는다.

실제신원/위임증거·법적보관policy/국내처리·슬랙메일경로 미확인은실자료수집/실발송 활성화차단이다. syntheticminimalCIreport7일의기존수명을실사업/법정보관년수로전용하지않는다. 보고서는 operation/result/숫자/도구/소스digest·검사누락 정도만 보존하며 rawinput/ACK IDs/browsertrace/source secretfindings/근거상세는 업로드하지 않는다. evidence detailed조회는 해당owner 현재권한을검증한다.

<a id="IP06"></a>

## IP06. Capacity, Connection and Time Budget Verification

LC02의유한payload/배열/page25max100/query·admission/crypto/provider/worker·pool/lock/statement/transaction cap을 config manifest와같이등록한다. U2는기존hostpool을공유하며별도 pool을더하지않는다. replica×pool/rolling최대tasks·관련 legacy host연결을합해현재 CDK max_connections와여유예산을검증한다. 특정replica의상한을전체replica상한으로주장하지않는다. 초과면실검증근거로정렬/설정개정하고보호·권한을끄지않는다.

정상readp95≤1초/write≤2초/유효기술error≤0.1%, 전체HTTPread5초/write10초·정상실행가능work첫시작p95≤10초, actualattempt30초·first+3/first부터5분·원래더짧은기한을유지한다. BFF/API/provider/원본/primary/journal/prefix를포함한다. 긴수단변경은원래protected접수와actualresult를구별하고timeout/답변유실은같은ID/내용을재대조한다. 새grant/배포/큐message로deadline·시도·인계5분을초기화하지않는다.

현재 U2 source로 합성 기업100/고객1000/직원10/상품10000/주문100000·평균5/시험최대50품목, 활동 session100·20req/s30분80/20·100req/s5분→20req/s5분 내 회복/10분 유지를 검증한다. U2profile의role/현재scope·retiredorg·초대/인계·복구·거절/불명분포·seed/경로비율을manifest에기록한다. capacity상한으로reject된peak는최초실패그대로기록하며우회/재시도로숨기지않는다. 합성개수를사업한도로전용하지않는다.

실제 추가비용은현재선택/모듈로추론해달러값을발명하지않는다. 이단계는cloud생성/실행을하지않았고추가리소스과금을발생시킨사실이없다. future sharedhost/pool/storage·한시vault/키/비밀/API/queue/log/CI실행시간의증분은 실제측정사용량·region/계정/가격/수명·기존reservedresource를대조해추후평가한다.1인 정상 기술 반복 작업≤30분/일·배포 사람 작업≤15분/회·대표1인 복구≤30분은 IP07/08 실증 조건이며 현재 달성값이 아니다.

<a id="IP07"></a>

## IP07. Monitoring, Recovery and Accuracy Gates

| 영역 | 설정/측정·실패 경계 |
|---|---|
| SLI/SLO | 업무별rolling30일/계획점검포함99.9%; provider로그인불가도actualdowntime. synthetic health200/재시작/단계다른성공으로상쇄금지 |
| 복구/RPO | 앱/worker·저장전환/배포·논리손상/오삭제·단일AZ일시fault t0→감지/시도알림/fence/restore/current보안/ACK·핵심업무≤30분, 성공접수유실0; 센터물리소실제외·리전/필수외부장기중단재개미검증범위유지 |
| 보호 정확성 | U2계정/binding/sessionfence·code/grant/claim/attempt·role/membership/invite·HOLD/원래operation/effect·history/receipt/tombstone까지재구성; 회수/소비/만료부활0·ACK중복/누락0 |
| 외부결과 | UNKNOWN/UNCONFIRMED와원래operation/기한을보존, actual종료/격리전같은subject새factorHOLD. probe/factor없음/ResourceNotFound만으로종료증명금지 |
| telemetry | CloudWatch/OTel 등록요청/worker trace100%대상·drop/실누락/clock·최소boundedlabel; 업무이력과분리. secret/evidence/account/email metriclabel제외 |
| 운영알림 | 자동복구첫시도부터기존독립Slack+email개발자통지·실패/수동필요긴급알림; 동일incident/누적기한·actualsend/전달/명시ACK/복구완료분리. 현재시험local sink만 |
| 현재임계 | LC06 prefixgap/권한위반/ACK불일치·secret누출즉시긴급,5분기술실패>1%/p95초과연속2창경고·10분지속/전체막힘긴급. 저트래픽0건을100%성공으로만들지않음 |
| 협력정확성 | 유실/중복·금액·수량·상태/동시·SW권한/기간·승인/접근·외부결과·추적/정정8영역은owner불변조건/SV·후속통합으로연결, U2단독시험이거래owner전체완료증거아님 |

실제AWS복원/물리배치·국내저장/알림·회사망/법적신원·30일/운영사람실증은별도activation조건이다. 로컬currentACK/복원/관측검증은각자료/source·fault·독립관측manifest와함께기록한다. 이전U1source와시간·커버리지를새U2실적으로인용하지않는다.

<a id="IP08"></a>

## IP08. Deployment, Compatibility and Rollback

구체적순서는새model/schema/purpose/registry/보호payloaddecoder/secret참조형식의expand→old/newproducer/consumer/readvalidator병행→legacycurrent/retiredscope허용집합차분·참조/backfill→actualhost/local통합·검사→같은source/image/config/profile의관련feature활성화다. 등록되지않은CE-U2/ND추가operation·unknownphase/target을기존common:1에밀어넣지않는다. exactsupportedversion이없으면기능비활성/원래pendingwork보존이다.

role/소속/조직마이그레이션은SITE_ALL_DEPARTMENTS복수site·DEPARTMENT_ALL_SITES복수dept의동일행위완성술어OR을보존한다. 원래쌍/곱집합의실제의미·policyrevision이없으면자동확대를하지않는다.새 policy/grant/fence·oldorder원래조직·현재회수·security/claim/code세대를현재protected원본으로판정한다.

worker교체는새claim중단→현재permit/lease/외부불명/attempt/기한보존→oldwriterfence→새동일원본재대조다. 늦은결과는원래operation개정에결합해새factor/grant/복구상태를덮지못한다. queue전체batchabort/expiredwork무한PENDING회귀는IP03통과전관련경로완료로표시하지않는다.

rollback은호환code/image/config/decoder/route의전환이며db/rawsnapshot/원래protectedACK/회수/단회소비·attemptcount를과거로덮는downgrade가아니다. 신profile권위를구consumer로손실없이표현못하면supporteddecoder를유지하거나safeHOLD, oldhandler로강제변환금지다. 별도논리손상restore는새epoch/snapshot+journalprefix/tombstone·현재grant/비밀파기/외부 UNKNOWN을대조한다.

향후 production은검증manifest의사람수동승인·실제GitHub지원/OIDC/role/국내처리/사설migration자격·native배포감시/안전rollback조건을기존CI-03–05에서상속한다. 현재AWS자격/production작업을새로확보/실행하지않는다. 계획점검은한국평일20–22시·회당중단≤10분/30일누적≤20분·최소24시간전고객화면/기업지정메일안내다. 예상초과/실패는중단/안전되돌림·지연안내와복구로연결하고30분RTO로점검상한을늘리지않는다. 첫버전실제로무중단배포/10분복구를달성했다고표시하지않는다.

<a id="IP09"></a>

## IP09. Detailed NFR Traceability

| NFR | 연결할 구성·검증 | 실제 설계 위치 |
|---|---|---|
| NFR1.1 | 고객/직원 모두 실제 password+TOTP MFA와 필수 사전 복구 코드·보관 확인을 업무 접근 전에 충족한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP05](cicd-pipeline.md#IP05) |
| NFR1.2 | 현재 안정 계정/외부 연결·audience·목적·행위/범위는 서버 원본으로 구성한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP05](cicd-pipeline.md#IP05) |
| NFR1.3 | 같은 행위의 완성된 네 범위만 합집합하고 원래 조직 문맥을 보존한다. | [IP03](cicd-pipeline.md#IP03) / [IP08](cicd-pipeline.md#IP08) |
| NFR1.4 | 직원은 모든 인증/등록/복구/조회/실행 경로에서 사설 승인 접점과 현재 MFA/직원 행위 권한을 함께 충족한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP05](cicd-pipeline.md#IP05) |
| NFR1.5 | 고객 유휴30분·직원 유휴15분, 로그인 후 절대8시간과 기존 로그인/MFA challenge5분을 유지한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP06](cicd-pipeline.md#IP06) |
| NFR1.6 | 공개 및 제한 인증 POST에도 origin/CSRF·subject/challenge/state·현재 목적을 검증한다. | [IP03](cicd-pipeline.md#IP03) / [IP05](cicd-pipeline.md#IP05) |
| NFR1.7 | 계약 자기 승인 금지는 실제 확인된 동일인 원본으로 판정한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) |
| NFR1.8 | 읽기·목록/건수·오류·이력·통지는 현재 정보 권한으로 최소 투영한다. | [IP03](cicd-pipeline.md#IP03) / [IP05](cicd-pipeline.md#IP05) / [IP07](cicd-pipeline.md#IP07) |
| NFR1.9 | worker/외부 관측은 등록된 목적·원래 작업/대상·버전·현재 허가를 명시 검증한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP05](cicd-pipeline.md#IP05) / [IP08](cicd-pipeline.md#IP08) |
| NFR1.10 | 비밀 입력과 제한 전달 자료는 일반 업무/이력/telemetry에 원문을 복제하지 않는다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP05](cicd-pipeline.md#IP05) |
| NFR1.11 | 승인된 직접/수동/비상 복구는 권한 상승 없이 새 MFA·옛 무효화·보호 이력·당사자 통지로 닫는다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP07](cicd-pipeline.md#IP07) |
| NFR1.12 | 확인 담당자의 결정과 확인 당사자의 제한 재등록 허가를 분리하고 원래 목적 대상에 결합한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP05](cicd-pipeline.md#IP05) |
| NFR1.13 | 고객 초대 수락 유효기간은 발급시각부터7일이며 현재 본인/MFA·기업/조직/역할/초대자 관리 권한을 다시 확인한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) |
| NFR1.14 | 관리자는 현재 관리 범위 안의 허용 역할을 타인/자신에게 명시적으로 부여하되 해당 업무 권한과 구별한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP08](cicd-pipeline.md#IP08) |
| NFR1.15 | 회수/역할 개정·관리자0·관리자 재지정은 현재 원본과 보호된 변경으로 판정한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP07](cicd-pipeline.md#IP07) / [IP08](cicd-pipeline.md#IP08) |
| NFR1.16 | 지원/권위·확인 정책/필수 설정이 없으면 실제 인증·복구/지정 적용을 실행하지 않는다. | [IP01](cicd-pipeline.md#IP01) / [IP03](cicd-pipeline.md#IP03) / [IP05](cicd-pipeline.md#IP05) / [IP10](cicd-pipeline.md#IP10) |
| NFR2.1 | 계획 중단 포함 연속30일 가용성99.9%와 핵심 업무별 측정을 유지한다. | [IP07](cicd-pipeline.md#IP07) / [IP08](cicd-pipeline.md#IP08) |
| NFR3.1 | 기본 앱/worker·저장/전환·배포 실패·논리 손상/오삭제와 단일 AZ 일시 장애의 핵심 업무30분 복구 목표를 유지한다. | [IP03](cicd-pipeline.md#IP03) / [IP07](cicd-pipeline.md#IP07) / [IP08](cicd-pipeline.md#IP08) |
| NFR3.2 | 인증 제공자 장애/불명·제한 허가 회수/새 연결 전환은 안전한 보류와 현재 원본 재검증으로 복구한다. | [IP03](cicd-pipeline.md#IP03) / [IP05](cicd-pipeline.md#IP05) / [IP07](cicd-pipeline.md#IP07) / [IP08](cicd-pipeline.md#IP08) |
| NFR4.1 | U2의 성공 접수/보안 변경은 정의한 장애 범위에서 유실0으로 대조한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP07](cicd-pipeline.md#IP07) |
| NFR4.2 | 응답/외부 결과 불명은 원래 ID/입력·기한/효과 근거로 대조한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP07](cicd-pipeline.md#IP07) / [IP08](cicd-pipeline.md#IP08) |
| NFR5.1 | 8개 정확성 영역 중 U2가 소유하는 승인/접근·상태/동시·유실/중복·외부 사실·추적 불변조건 위반은 정의한 시험에서0건이어야 한다. | [IP03](cicd-pipeline.md#IP03) / [IP07](cicd-pipeline.md#IP07) |
| NFR5.2 | 복구/재지정 보류 원본의 재개·종료는 닫힌 전이와 현재 근거로 검증한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP08](cicd-pipeline.md#IP08) |
| NFR5.3 | 기술 재시도와 새로운 업무 허가는 구별하며 원래 접수·결과/이력을 지우지 않는다. | [IP03](cicd-pipeline.md#IP03) / [IP06](cicd-pipeline.md#IP06) / [IP08](cicd-pipeline.md#IP08) |
| NFR6.1 | 정상 승인 부하에서 조회p95≤1초·변경p95≤2초·유효 요청 기술 오류율≤0.1%를 유지한다. | [IP06](cicd-pipeline.md#IP06) / [IP07](cicd-pipeline.md#IP07) |
| NFR6.2 | 조회5초·변경10초의 HTTP 전체 대기 예산 및 정상 내부 실행 가능 작업 첫 시작p95≤10초를 유지한다. | [IP03](cicd-pipeline.md#IP03) / [IP06](cicd-pipeline.md#IP06) |
| NFR7.1 | 기존 합성 규모·정상/집중/회복 시험 조건을 유지하며 U2 경로 구성을 명시한다. | [IP06](cicd-pipeline.md#IP06) |
| NFR7.2 | 대량 역할/소속/초대·공개 인증·제한 인계의 자원 사용은 유한 설정/대기·현재 권한으로 제한한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) / [IP06](cicd-pipeline.md#IP06) |
| NFR8.1 | 기존 계획 점검 시간/중단·안내와 전체 가용성 집계를 유지한다. | [IP08](cicd-pipeline.md#IP08) |
| NFR9.1 | 1인 정상 기술 운영 반복 작업≤30분/일·일반 배포 사람 작업≤15분/회와 대표 한 사람 복구≤30분을 유지한다. | [IP02](cicd-pipeline.md#IP02) / [IP06](cicd-pipeline.md#IP06) / [IP07](cicd-pipeline.md#IP07) / [IP08](cicd-pipeline.md#IP08) |
| NFR9.2 | U2는 기존 API/별도 worker에서 공유하는 TypeScript 업무 모듈이며 기존 기술을 유지한다. | [IP02](cicd-pipeline.md#IP02) / [IP04](cicd-pipeline.md#IP04) |
| NFR9.3 | 비공개 초기/비상 준비와 실제 업무 권한/승인자의 책임은 분리한다. | [IP03](cicd-pipeline.md#IP03) / [IP05](cicd-pipeline.md#IP05) / [IP10](cicd-pipeline.md#IP10) |
| NFR10.1 | 자동 복구 시도 시작부터 기존 Slack/이메일의 개발자 통지와 실패/수동 필요 긴급 통지를 유지한다. | [IP04](cicd-pipeline.md#IP04) / [IP07](cicd-pipeline.md#IP07) |
| NFR11.1 | 고객/기업·권한/신원·관련 근거와 포함 로그/백업·제한 전달 자료는 한국 내 저장 요구를 준수한다. | [IP01](cicd-pipeline.md#IP01) / [IP05](cicd-pipeline.md#IP05) / [IP10](cicd-pipeline.md#IP10) |
| NFR11.2 | 신원 확인 근거·권한/복구 이력·코드/허가 검증 자료의 보관/정정/파기는 종류·원본/참조·복구 보호와 함께 정한다. | [IP04](cicd-pipeline.md#IP04) / [IP05](cicd-pipeline.md#IP05) / [IP07](cicd-pipeline.md#IP07) / [IP08](cicd-pipeline.md#IP08) |
| NFR11.3 | 업무 이력과 관측 자료를 분리해 최소화한다. | [IP05](cicd-pipeline.md#IP05) / [IP07](cicd-pipeline.md#IP07) |
| NFR12.1 | 한국어/KRW/한국 시각과 고객/직원 PC1280+·고객 모바일 추후/직원 모바일 제외를 유지한다. | [IP03](cicd-pipeline.md#IP03) / [IP04](cicd-pipeline.md#IP04) |
| NFR12.2 | 기존 WCAG2.2 AA 목표와 고객 Chrome/Edge/Safari/Firefox·직원 Chrome/Edge의 출시 최신/직전 안정 버전 검증을 유지한다. | [IP03](cicd-pipeline.md#IP03) |
| NFR13.1 | 닫힌 C01/C02/C21/E01과 CE-U2-01–07의 profile/목적·target·입출력/오류·version을 실행 중 검증한다. | [IP01](cicd-pipeline.md#IP01) / [IP03](cicd-pipeline.md#IP03) / [IP08](cicd-pipeline.md#IP08) |
| NFR13.2 | 기존 유효 scope/소속·계정/원래 문맥·대기 자료와 새 표현의 호환을 손실 없이 검증한다. | [IP03](cicd-pipeline.md#IP03) / [IP08](cicd-pipeline.md#IP08) |
| NFR13.3 | test-after·Standard 단위/통합과 제품 코드 라인 커버리지≥80%·로컬/CI 같은 필수 검사를 유지한다. | [IP02](cicd-pipeline.md#IP02) / [IP03](cicd-pipeline.md#IP03) |
| NFR14.1 | 기존 비밀·SAST·의존성·CDK/생성 인프라·격리 실행 보안 검사와 보고서 차단을 U2 변경에도 적용한다. | [IP02](cicd-pipeline.md#IP02) / [IP03](cicd-pipeline.md#IP03) / [IP05](cicd-pipeline.md#IP05) |
| NFR14.2 | 지원/취약점·예외/비밀 노출 처리는 기존 책임/만료·재검토와 영향 근거를 유지한다. | [IP01](cicd-pipeline.md#IP01) / [IP03](cicd-pipeline.md#IP03) / [IP05](cicd-pipeline.md#IP05) |

전부43개를연결한 [traceability.json](traceability.json)의OK는현재상세요구/설계의CI·호스트/권한/검증매핑이다. 제품/실운영/실제SQS·Cognito·전체PCUI시험통과나실자격확보판정이아니다. 협력업무owner·U7/U8/U9/U10의actual결과는각인계/통합증거가필요하다.

<a id="IP10"></a>

## IP10. Assumptions & Open Questions

| 항목 | 선행조건/책임 / 미확인일 때 |
|---|---|
| actual provider/회사사설접점·현실본인/위임·비상운영권위 | U2/Infra/실업무정책. relevantoperationHOLD·actualfeature비활성, syntheticproof승격금지 |
| 실제 vault/key/secretARN/DBrole/backup·국내경로/법적retention | U2/Infra/운영. SD11/IP05mapping·파기/restore검증전실자료/실전달비활성 |
| 현재 sourceSDK/registry/models/원래기한·queue경계 | U2CodeGeneration/기반owner. 명시파일/검사/보고서구현·현재회귀전완료불가 |
| actual CDK운영topology·GitHubplan/OIDC/승인·배포·가격 | future환경/배포owner. 현재합성synth/readiness차단유지·운영값/추가비용발명금지 |
| 전체business/PC/실제 전달/30일·AZ/1인운영 | U3–U10/품질/Infra. 각실증조건·현재 source/fault/사람작업시간필요 |

## Sources

- [infrastructure-design-questions.md](infrastructure-design-questions.md) — 실제 통합 확인·현재 로컬/합성 작업 경계.
- [security-design.md](../nfr-design/security-design.md), [logical-components.md](../nfr-design/logical-components.md), [NFR Design 검토](../nfr-design/reviews/review-01.md) — SD/LC43개 매핑·수명/현재권위/보호·HMAC 선행 명료화.
- [functional-spec.md](../functional-design/functional-spec.md), [components.md](../../../inception/domain-design/components.md), [contract-summary.md](../../../inception/contract-design/contract-summary.md) — 원본·등록 profile/owner/실제 효과 경계.
- [U1 cicd-pipeline.md](../../u1-integrated-foundation/infrastructure-design/cicd-pipeline.md) — 이미 선택한 delivery/검사/계정/실자격·동일release/rollback 방향.
- 위 Design Basis의 정확한 repository source 파일들 — 현재 synthetic CI/CDK/profile·role binding·코드 snapshot만의 근거. 실제 cloud/보안·SDK·검사/운영 달성으로 해석하지 않는다.

