# U3 보안·품질 상세 설계 질문

## 확정한 기준과 재사용 방향

U3의 보안·품질 요구사항과 첫 배포 범위를 유지한다. 필요한 질문은 한 번에 묶고 숫자·줄바꿈·추천안·추천 이유로 제시한다. 기존 기술·MFA/현재 권한·다른 사람 승인·100입력행·원 단위 금액·최초 조건·모든 적용 계약 개정·고객 동의 기준은 다시 선정하지 않는다.

상세 설계는 기존 보호 쓰기/같은 트랜잭션의 현재 근거 재검증·원본 개정 충돌·Outbox/별도 큐·제한된 입력/시간·최소 정보 기록을 U3 소유자에 연결한다. 새로운 AWS 계정/도메인별 서비스·분산 잠금·인증 제공자·자동 확정·대량 부하/재해 실증을 추가하지 않는다. 전역 직렬화의 실제 처리 성능과 실제 외부 신뢰/저장/복구 성과를 확인한 사실로 가정하지 않는다.

## 조사한 현재 코드와 가정

- 현재 API의 JSON 입력 한도는64kb이며 [application.ts](../../../../../../../../apps/api/src/application.ts)의 express.json 설정에서 확인했다.
- [protected-write.ts](../../../../../../../../packages/persistence/src/protected-write.ts)는 같은 primary 트랜잭션에서 commit counter를 잠그고 원본/요청/후보/개정을 보존한 다음 보호 저장/현재 세대를 확인한다. 이를 재사용할 방향이며 U3 코드/100행 경로가 이미 구현된 것은 아니다.
- [u2-repository.ts](../../../../../../../../packages/persistence/src/u2-repository.ts)의 현재 원본/보호 원본 대조·변경 전후 재검증을 참조한다. 기존 U2 검증 미해결을 해결했다고 선언하지 않는다.
- Luna가 문서의 v2 구조를 사용해 합성 JSON UTF-8 크기만 계산했다. 저장소 수정·API/앱 호출·부하 시험은 하지 않았다. 실제 v2 스키마는 아직 구현되지 않았으며 조건 매핑의 하위 필드명은 계산 가정이다.

| 가정한 입력 | UTF-8 바이트 |64KiB 이하 |1MiB 이하 |
| --- | --- | --- | --- |
|1행·가격/지급2조건 |2140 |예 |예 |
|100행·가격/지급2조건 |139948 |아니오 |예 |
|100행·4조건 |228748 |아니오 |예 |

합성 입력은 C00의 CommandMeta·TargetScope·HARDWARE/FULL·partialConsentRef=null, 각 행의 UUID36자 product/commonOffer/AgreementRevision 참조·수량1·PREPAY와 conditionKey/sourceRef/value/effectiveWindow/evidenceRef를 가정했다. 고정 가격은 KRW1000, 유효 구간은 ISO 시점과 포함 여부, 조건당 근거 참조1개다.4조건에는 FULL/DELIVERY를 추가했다. 이는 합성 표현 크기이며 정식 스키마 적합성·고객 실제 주문 크기·처리 용량 증거가 아니다.

## Q1 — U3 주문 입력의 요청 본문 한도

100입력행과 조건별 계약 참조를 담는 주문 JSON의 최대 크기를 어떻게 둘 것인가?

**추천안:** U3의 주문 제출·주문 조건 변경 요청만 최대1MiB로 둔다. 다른 접점의 기존64KiB는 유지한다.1MiB는1048576바이트이며 파일 첨부 한도가 아닌 JSON 요청 본문 상한이다.

**추천 이유:** 위 합성100행 표현은 약140–229KB로 현재64KiB를 초과한다.1MiB는 해당 표현에 여유를 주면서 요청 크기를 유한하게 제한하는 첫 배포 제안이다. 최종 v2 스키마의 실제 표현/처리/메모리 적합성은 구현에서 검증한다. 숫자를 실측 처리 용량이나 외부 지침의 의무값으로 제시하지 않는다.

**공통 보호:**100행·타입/필드/조건/원본 검증은 그대로 적용한다. 한도 초과는 요청을 접수하지 않고413으로 안내하며 자동 분할/절삭·파일 업로드로 전환하지 않는다. 클라이언트의 Content-Length 주장만 믿지 않고 실제 parser 한도와 압축 해제 후 크기를 검증한다. U3 전용 parser와 기존 parser를 중복 적용하지 않는다.

- A. U3 주문 입력만1MiB로 한다. 나머지 접점은64KiB 유지. 최종 v2 입력의 크기/경계 검증을 구현에 포함한다. (추천)
- B. 모든 접점의64KiB를 유지한다.100행도 크기 한도 안의 표현만 접수하며 초과는413 안내한다. 정식 v2 표현이100행을 충분히 담는지 구현 전 대조하고 부족하면 입력 표현 또는 한도를 다시 검토한다.
- X. Other (please specify)

[Answer]:

## Sources

- [U3 보안 요구](../nfr-requirements/security-requirements.md), [기술 적용](../nfr-requirements/tech-stack-decisions.md): 보호/정확성/제한된 입력·현재 기준.
- [U3 기능 명세](../functional-design/functional-spec.md), [엔티티](../functional-design/entities.md):100입력행·C00/C05 v2의 조건 매핑.
- [첫 배포 실행 계획](../../../release-planning/first-release-delivery-plan.md): 제한 파일럿·긴 검증 후속.
- [Express JSON parser](https://expressjs.com/en/5x/api/): parser API의 한도 설정은 실제 선택 버전과 검증해야 한다.1MiB는 제품 제안이며 Express 기본값/의무값을 주장하지 않는다.
- [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html#input-validation): 입력 크기 제한과 한도 초과 요청 처리의 참고 근거.
