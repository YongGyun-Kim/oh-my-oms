# Project-Level Rules

> Project-specific specialisation and corrections. Loaded after `org.md` and
> `team.md` as strict-additive guidance; contradictions with broader policy
> are rejected. Populated by practices-discovery and the self-learning loop.
>
> Use sparingly: most teams don't need a project layer. Reach for it
> only when this specific project needs stable, durable guidance beyond the
> team practice (for example, package-specific release checks or an additional
> regression suite for a legacy component).

## Way of Working

<!-- Project-specific specialisation. Example: -->
<!-- This monorepo requires package-scoped branch names and a package owner -->
<!-- review in addition to the team's normal merge policy. -->

## Walking Skeleton

<!-- Project-specific specialisation. Example: -->
<!-- The walking skeleton must exercise the legacy service adapter as well -->
<!-- as the new service boundary. -->

## Testing Posture

<!-- Project-specific specialisation. -->

## Guard Policy

<!-- Project-specific. Mode: strict, relaxed, or off. Strict here holds for every intent and cannot be changed from chat. A section under the retired Change Control heading, written by an earlier release, is still read. -->

## Deployment

<!-- Project-specific specialisation. -->

## Code Style

<!-- Project-specific specialisation. -->

## Tech Stack

<!-- Technology choices locked for this project. -->

## Decided

<!-- Decisions made in earlier stages that should not be re-asked. -->
<!-- Format: DECIDED: [decision] (Stage [slug], [date]) -->

## Scope Overrides

<!-- Custom scope rules for this project. -->

## Forbidden

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: NEVER [behavior] (affirmed [date]) -->
<!-- Example: NEVER throw exceptions across service layer boundaries (affirmed 2026-05-17) -->

- NEVER 불안정 테스트를 반복 실행해 우연히 통과한 결과로 필수 검증을 대체하거나 테스트 하한을 낮춰 통과시킨다. (Q8) (affirmed 2026-10-05)

## Mandated

<!-- Populated by practices-discovery affirmation gate. -->
<!-- Format: ALWAYS [behavior] (affirmed [date]) -->
<!-- Example: ALWAYS use Result<T,E> for fallible operations in service layer (affirmed 2026-05-17) -->

- ALWAYS AWS·CDK를 사용한다. 언어·DB·AWS 서비스 구성은 이 결정만으로 확정하지 않는다. (승인 인계 D-07) (affirmed 2026-10-05)

- ALWAYS 직접 작성한 테스트 가능한 제품 코드 전체에 라인 커버리지 80% 하한을 적용하고 미실행 제품 파일도 분모에 포함하며 생성물·외부 코드 등의 제외 사유를 기록한다. (Q4) (affirmed 2026-10-05)

- ALWAYS 비밀 유입·코드 취약 패턴·의존성 취약점·CDK 및 생성 인프라 보안 설정·격리된 검증 환경의 실행 중 서비스 보안 검사를 필수 계획에 포함하고, 대상·도구·실행 시점·차단 기준은 후속 설계에서 정해 실제 적용 전에 확인한다. (Q7) (affirmed 2026-10-05)

- ALWAYS 필수 검사 실패·미실행·보고서 누락 시 병합 또는 해당 배포를 보류하고 개발자 본인이 처리·검토 책임을 맡는다. (Q8) (affirmed 2026-10-05)

- ALWAYS 보안 오탐·예외의 사유·담당·만료·재검토를 기록하고 실제 비밀 노출은 폐기·교체와 영향 확인으로 대응한다. (Q8) (affirmed 2026-10-05)

## Corrections

<!-- Project-specific corrections from human feedback. -->
<!-- Format: NEVER/ALWAYS [behavior] (learned [date]) -->
- 개발자 1명은 현재 인력 현황이며 기능 범위를 제한하는 제약으로 사용하지 않는다. 필요한 기능 개발과 운영을 1명이 충분히 수행할 수 있는 구조를 설계 목표로 삼는다. 인원 수를 이유로 필요한 기능을 자동 축소하지 않으며, 후속 설계·구현에서 개발·운영 부담과 목표 달성 여부를 검증한다. (learned 2026-10-04) <!-- cid:261004-feature:feasibility:c4c36ca8f93ed7cb84f9ce41501469f7d39feb7888c10a92c922a78587507597 -->
