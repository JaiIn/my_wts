# my_wts Development Guide

작성일: 2026-07-24  
공식 OpenAPI 기준 버전: `1.2.5`
대상: Codex, AI coding agent, 초급 개발자  
목표: 토스증권 Open API와 Next.js/React를 이용해 **로컬에서만 실행하는 WTS형 웹 애플리케이션**을 안전하게 개발한다.

```text
Project: my_wts
Repository: https://github.com/JaiIn/my_wts
Local path: C:\Users\admin\Desktop\my_wts
Repository state on 2026-07-24: empty, no first commit
```

## 0. 결론

확정 기술 스택은 **Next.js 16 App Router + React 19 + TypeScript 5.9 + Node.js 24 LTS**이다. 자세한 결정은 [docs/14_TECH_STACK_DECISION.md](docs/14_TECH_STACK_DECISION.md)를 따른다.

- 브라우저는 토스증권 API를 직접 호출하지 않는다.
- `client_secret`, access token, `accountSeq`는 Next.js 서버 런타임에만 둔다.
- UI → 로컬 BFF(Route Handler/Server Service) → Toss Open API 순서로 호출한다.
- 로컬 회원가입·로그인·로그아웃과 사용자별 세션을 제공한다.
- 토스 계좌·자산·주문내역은 조회만 한다.
- 실제 매수·매도·정정·취소 API는 구현하거나 호출하지 않는다.
- 주문 입력 화면은 실제 전송 없는 시뮬레이터로만 제공한다.
- 배포, 외부 공개, 클라우드, 모바일 앱은 범위에서 제외한다.
- 각 Micro Stage를 마치면 테스트·체크리스트·변경 요약을 제시하고 **반드시 사용자 명령을 기다린다**.

별도 React/Vite SPA와 Express/NestJS backend는 사용하지 않는다. 브라우저 번들 또는 `NEXT_PUBLIC_*` 환경변수에 비밀정보를 넣어서는 안 된다.

## 1. 먼저 읽는 순서

1. [CODEX.md](CODEX.md) — AI coding agent의 최우선 실행 규칙
2. [docs/00_ENV_FIRST_SETUP.md](docs/00_ENV_FIRST_SETUP.md) — 최초 skeleton 직후 환경파일 설정
3. [docs/01_SOURCE_SCOPE_AND_DECISIONS.md](docs/01_SOURCE_SCOPE_AND_DECISIONS.md)
4. [docs/02_AUTH_ERRORS_AND_RATE_LIMITS.md](docs/02_AUTH_ERRORS_AND_RATE_LIMITS.md)
5. [docs/03_MARKET_AND_REFERENCE_APIS.md](docs/03_MARKET_AND_REFERENCE_APIS.md)
6. [docs/04_ACCOUNT_ASSET_AND_ORDER_APIS.md](docs/04_ACCOUNT_ASSET_AND_ORDER_APIS.md)
7. [docs/05_ARCHITECTURE_AND_PROJECT_STRUCTURE.md](docs/05_ARCHITECTURE_AND_PROJECT_STRUCTURE.md)
8. [docs/06_SECURITY_AND_ORDER_SAFETY.md](docs/06_SECURITY_AND_ORDER_SAFETY.md)
9. [docs/07_DETAILED_MICRO_WBS.md](docs/07_DETAILED_MICRO_WBS.md)
10. [docs/08_STAGE_GATE_AND_CHECKLISTS.md](docs/08_STAGE_GATE_AND_CHECKLISTS.md)
11. [docs/09_TEST_STRATEGY.md](docs/09_TEST_STRATEGY.md)
12. [docs/10_LOCAL_RUNBOOK.md](docs/10_LOCAL_RUNBOOK.md)
13. [docs/11_GIT_GITHUB_WORKFLOW.md](docs/11_GIT_GITHUB_WORKFLOW.md)
14. [docs/12_PRAGMATIC_DEVELOPMENT_POLICY.md](docs/12_PRAGMATIC_DEVELOPMENT_POLICY.md)
15. [docs/13_ROLE_BASED_DEVELOPMENT_GUIDES.md](docs/13_ROLE_BASED_DEVELOPMENT_GUIDES.md)
16. [docs/14_TECH_STACK_DECISION.md](docs/14_TECH_STACK_DECISION.md)
17. [docs/15_PRODUCT_REQUIREMENTS_AND_SCREENS.md](docs/15_PRODUCT_REQUIREMENTS_AND_SCREENS.md)
18. [docs/16_INTERNAL_BFF_API_SPEC.md](docs/16_INTERNAL_BFF_API_SPEC.md)
19. [docs/17_DATABASE_AND_STATE_MODEL.md](docs/17_DATABASE_AND_STATE_MODEL.md)
20. [docs/18_ERROR_LOGGING_AND_STATE_CATALOG.md](docs/18_ERROR_LOGGING_AND_STATE_CATALOG.md)
21. [docs/19_CONFIG_COMMANDS_AND_FILE_CONVENTIONS.md](docs/19_CONFIG_COMMANDS_AND_FILE_CONVENTIONS.md)
22. [docs/20_REQUIREMENTS_TRACEABILITY_AND_ACCEPTANCE.md](docs/20_REQUIREMENTS_TRACEABILITY_AND_ACCEPTANCE.md)
23. [docs/21_DOCUMENTATION_FREEZE_POLICY.md](docs/21_DOCUMENTATION_FREEZE_POLICY.md)
24. [docs/22_LOCAL_AUTHENTICATION_SPEC.md](docs/22_LOCAL_AUTHENTICATION_SPEC.md)
25. [references/ENDPOINT_MATRIX.md](references/ENDPOINT_MATRIX.md)
26. [references/DATA_CONTRACTS.md](references/DATA_CONTRACTS.md)
27. [references/BFF_TO_TOSS_MAPPING.md](references/BFF_TO_TOSS_MAPPING.md)
28. [specs/my-wts-bff-openapi.yaml](specs/my-wts-bff-openapi.yaml)
29. [specs/sqlite-schema-v1.sql](specs/sqlite-schema-v1.sql)

## 2. 문서 범위

공식 OpenAPI `1.2.5`의 전체 범위를 확인했다.

- 27개 path
- 30개 operation
- 72개 component schema
- Auth, Market Data, Stock Info, Market Info, Ranking, Market Indicators
- Account, Asset
- Order, Order History, Order Info
- Conditional Order, Conditional Order History

사용자가 지정한 인증·시세·종목·환율·계좌·보유자산·주문·주문내역·매수가능금액은 상세 문서화했다. 루트 문서에 포함된 추가 API도 endpoint matrix와 각 도메인 문서에 포함했다.

공식 주문 mutation 6개도 숙지용 명세에는 포함하지만 제품 구현에서는 명시적으로 제외한다. 구현 대상은 token 발급, GET 조회, 로컬 인증, 로컬 데이터, 실제 전송 없는 시뮬레이션이다.

## 3. 원본 스냅샷

`references/source/`에는 조사 시점의 공식 원본을 보관한다.

- `official-overview-v1.2.4.md`
- `official-api-reference-v1.2.4.md`
- `openapi-v1.2.4.json`

구현 직전에는 공식 원본의 현재 버전과 이 스냅샷을 다시 비교해야 한다. API 문서는 변경될 수 있으며, 구체적인 rate limit은 응답 헤더를 최종 기준으로 삼는다.

## 4. 절대 원칙

```text
Execution: local only
Deployment: none
Browser secrets: forbidden
Local authentication: signup/login/logout
Real order: prohibited and not implemented
Credential request: only at the live integration gate
Progression: one Micro Stage at a time
After every stage: report, checklist, stop, wait for user
Git: one functional stage = one commit; commit+push use one approval
Merge: milestone boundary only, not every stage
Tests: affected fast tests per stage; full suite per milestone
Environment: create .env.example and ignored .env.local immediately after skeleton
Stack: Next.js 16 / React 19 / TypeScript 5.9 / Node 24 LTS / pnpm 11
Documentation: frozen during implementation; completion reports are chat-only
```

## 4.1 문서 동결

이 package는 `my_wts Documentation Baseline v1.2`이다. 개발 시작 후 README, CODEX, docs, references, specs, templates는 수정하거나 추가하지 않는다. 예측 불가능한 공식 API 변경·보안 취약점·내부 모순이 발견되면 구현을 중단하고 사용자의 `문서 변경 승인`을 요청한다.

## 5. 공식 출처

- https://developers.tossinvest.com/docs
- https://developers.tossinvest.com/llms.txt
- https://openapi.tossinvest.com/openapi-docs/overview.md
- https://openapi.tossinvest.com/openapi-docs/latest/api-reference/README.md
- https://openapi.tossinvest.com/openapi-docs/latest/openapi.json
