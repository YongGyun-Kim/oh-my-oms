# 현재 고객 기업 문맥과 관리 행위의 최소 투영

기존 자기 신청 목록은 신청자 계정만 반환한다. 기업 이용 승인은 별도 확인된 다른 계정을 최초 관리자로 지정할 수 있으므로 신청 목록을 기업 선택의 유일한 경로로 사용하지 않는다. CE01 v2 `EnterpriseAccess.readCustomerContexts`를 `operations-v2.json`에 명시 등록하고 `/customer-enterprise-contexts`를 고객 전용 HTTP/BFF 접점으로 연결했다. closed `CustomerContextFilter`와 `CustomerContextPage`는 U1 작성 `foundation-v1.json`에 등록했다. 기존 C00/C01 등의 v1 snapshot은 수정하지 않았다.

조회는 본인 활성 소속을 SQL에서 먼저 한정하고 현재 계정·binding·보호된 grant·역할·기업·조직을 대조한다. 기업명, 명시적인 주문 조직 사용 정책, 각 행위의 원래 범위와 허용 조직 이름만 제공한다. 신청자 연락처·확인 근거·담당자 directory·역할 directory는 거래 전용 사용자에게 제공하지 않는다. 기업·조직 선택은 권한을 만들지 않으며 실제 조회/변경 시 서버가 현재 target을 다시 검증한다. 서로 다른 행위/부서/사업장 범위의 Cartesian product를 만들지 않는다.

관리 투영은 `organisation.manage`, `role.manage`, `user.manage`를 각각 대조한다. 추가 organisation 권한을 강요하지 않고 역할 목록은 role 관리에, 담당자 목록은 user 관리에만 제공한다. 자기 관리 행위의 원래 ENTERPRISE_ALL 범위는 중복을 제거한 최대 세 항목으로 반환한다. U1 작성 C00 v2 `EnterpriseView.scopeProjectionKnowledge`에는 실제 현재 범위가 확인된 `KNOWN`을 명시 등록했고 미구현/직원 투영의 `UNAVAILABLE`도 유지한다. 전체 거래 범위는 별도 현재 문맥의 유한 scope 페이지로 제공한다.

부서/사업장·scope 페이지는 25 기본/100 최대의 기술 한도와 원래 cursor를 사용한다. 제한된 허용 조직의 ID 후보는 최대 100개씩 SQL에 전달한다. 이는 사업의 최대 조직 수나 주문의 최대 항목 정책이 아니다. 주문 Q1의 100개 항목/101개 전체 거절은 별도 canonical OrderInput·HTTP·UI 검증과 시험으로 유지한다.

명시 확인된 관리자 후보의 Account 원본 번호·개정을 사용하며 신청 담당자를 자동 지정하지 않는다. 소속 부여는 기업 관계/동일인/필요 위임의 owner 확인과 이력을 요구한다. 소속 또는 관리자 지정만으로 거래 역할을 부여하지 않는다. 합성 fixture의 확인 자료는 실제 사람·기업·위임 증거가 아니며 실제 확인 profile 미등록 상태는 실제 활성화 전에 차단한다.

실제 PostgreSQL 회귀는 `business-flow.spec.ts`, PC 경로는 `foundation-flow.spec.ts`, 화면 세대/선택/페이지 회귀는 `context-picker.spec.tsx`다. 서로 다른 최초 관리자, 거래 전용 일반 구매자, role/user 관리 단독, 타기업/존재 없음 비노출, 미보호 회수, 늦은 취소 결과를 검사한다. 테스트 결과는 최종 전체 실행 보고서로 확인하며 이 문서를 실행 성공 근거로 사용하지 않는다.
