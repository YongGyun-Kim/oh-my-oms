# IdentityRecovery·EnterpriseAccess 통합

## 계약과 현재 권위

U2는 기존 API/worker/BFF에 embedded된 library다. 새 u2-access-additions:1은 common:2의 bytes와 stable Account/ProviderBinding ID를 유지한다. securityGeneration은 보호 원본이며 현재 유효한 legacy set에만 CURRENT_LEGACY_ADMISSION provenance를 붙인다. 과거 세대 누락·소비·회수·UNKNOWN을 기본값으로 활성화하지 않는다.

고객15 행위·4scope는 같은 행위의 완전 predicate들을 OR로 평가한다. 다른 scope 축을 합쳐 교차 권한을 만들지 않는다. NOT_USED/UNSET과 원래 주문의 조직문맥을 보존한다. 관리와 거래 grant는 별도이며 self-grant는 명시 명령이다. 마지막 관리자0은 허용·경고하고 다른 grant와 기업 이용은 보존한다. HW/SW 판매 상품 등록은 내부 직원만 가능하다.

## 목적과 비밀 수명

확인자는 원래 case와 새 server-owned Party/challenge에 근거를 결합한다. 익명 요청자·case/Receipt ID·code 단독은 당사자 권위가 아니다. 인계는96bit16문자·발급5분·잘못된 claim 최대5회다. 단회 보호 claim 후 별도5분 EnrollmentAuthority와 원래 ClaimReceipt가 생긴다. 응답 유실 재관측은 같은 browser/origin/원래 response fence와 현재 binding/securityGeneration에 묶인 읽기 전용 continuation이며 원래 기한·소비 상태·권위를 연장하지 않는다.

후보 secret bytes와 purpose/target/binding/security/key version을 함께 HMAC 검증한다. vault는 별도 역할·키와 AAD·현재 보호 permit을 사용한다. 원문은 cookie의 HttpOnly/Secure/SameSite=Strict 암호 봉투와 메모리에서만 취급하며 journal/Outbox/응답 JSON/로그·browser storage에 복제하지 않는다. 원래 authority 만료·회수·종료·5실패 시 tombstone과 실제 암호 자료 파기를 연결한다.

초대 기한은 발급7일이며 재발송은 deadline을 연장하지 않는다. 현재 inviter/role/org/contact revision과 ACTIVE/INACTIVE intention을 재검증한다. provider/계정/세대·원래 subject/operation/deadline/actual effect가 미확인이면 HOLD를 유지한다. Cognito SDK timeout/200/ResourceNotFound·read-only probe만으로 원래 effect 종료를 증명하지 않는다.

완료는 허가된 password·실제 새 TOTP·옛 factor/code/session 무효화·원래 작업의 KNOWN terminal·새10코드 보관 ACK·현재 slot의 conjunction이다. 완료된 제한 권위는 business session이 아니며 새 일반 MFA로 로그인해야 한다. E01 통지 의무의 REQUESTED와 실제 전달은 별도 사실이다.

## 호스트·복구·호환

Cognito SecretCode를 재인코딩 없이 otpauth secret에 넣는 [AWS 공식 예제](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-identity-provider_example_cognito-identity-provider_Scenario_SignUpUserWithMfa_section.html)와 표준 TOTP 프로토콜에 기반해 Base32 setup key로 해석한다. API의 문자 패턴만으로 입증한 형식은 아니다. U2 adapter는 정규 표현을 raw key bytes로 변환해 vault/UI의 이중 인코딩을 막고, 불명/비정규 형식은 UTF8/default fallback 없이 거절한다. 이 local SDK-double 검증은 실제 제공자 registration/termination 증거가 아니다.

Staff 모든 접점은 현재 private ingress와 MFA를 요구한다. 클라이언트 header나 BFF domain은 회사망 증명이 아니다. 최소 UI는 한국어 PC1280이며 mobile/MDM/NAC·U8/U9 전체 UI는 완료 범위가 아니다.

Outbox/Standard queue는 원래 Work/consumer/target/deadline을 대조한다. malformed 한 봉투는 정상 sibling 처리를 끊지 않으며 invalid는 성공 ACK하지 않는다. PUBLISHED 만료 Work는 업무 effect 없이 보호 REVIEW/HOLD 전이를 확정한 뒤에만 control 수신을 닫는다. 이 결과는 업무 성공 ACK가 아니다.

primary→독립 journal→연속 prefix 가시성이 성공 근거다. 복원은 모든 additive 모델과 소비/회수/실패/파기 marker를 재생하고, 실제 등록된 append 역할만 원래 grant대로 quiesce/재개한다. 현재 owner security 재대조 전에는 옛 allow fallback이 없다. UNKNOWN slot·원래 effect는 복구나 새 claim으로 지우지 않는다.

실제 key/issuer·법적 보관·신원/위임 정책·국내 path·receiver·회사망은 별도 준비 확인 전 미등록이다. 실제 rollback/배포는 현재 local 구현과 호환 시험으로 승인되거나 실행된 것이 아니다.
