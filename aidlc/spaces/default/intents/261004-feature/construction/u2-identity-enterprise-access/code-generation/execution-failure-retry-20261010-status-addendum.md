# source1df E2E 실패 관측 범위 정정

원래 실패 인계 `execution-failure-retry-20261010.md`의 4114 bytes / SHA256 `6a6d4bc6596950aff6005ce5035350e119652831febfb8ea850ffd1d55323b2b`는 변경하지 않는다.

추가 읽기 전용 대조에서 `.reports/u2/project-u2-e2e.log`(7338 bytes / SHA256 `bdb19dc4b1ae97c801ff43c66fab24080554ddf65979e3bd1b2240b4b26b4545`)의 CUSTOMER factor marker 뒤 observer 기록에 `CHALLENGE_RESPONSE`, status200, phase=null이 존재함을 확인했다. 따라서 원래 인계의 “status·phase 미관측”은 **waiter 직접 기록에 대한 제한**으로 좁혀 정정한다. Observer status200은 실제 관측이며, 원래 waiter 직접 status/phase와 제품 인증·복구코드 ACK·최종 업무 성공은 이 실패에서 여전히 확인되지 않았다. Observer phase=null은 원래 body 읽기 예외를 null로 처리한 관측 공백이며 MFA 거절 phase로 해석하지 않는다.

원래 test 순서에서 invitation은 첫 test였고 이후 recovery/staff는 통과했다. 뒤 test의 navigation이 첫 실패의 원인이라는 근거는 없다. 새 계측-only source10246fc9의 선택1/1은 두 reader body/JSON 완료를 관측했으나, 원래 CDP 실패 원인 또는 제품 수정의 입증은 아니다. 원본8경로 hash guard·기존 archive exact bytes와 두 상세 원본 provenance gap OPEN을 유지한다.
