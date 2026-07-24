# 05. 아키텍처와 프로젝트 구조

## 1. 확정 아키텍처

```text
Browser (React UI)
  → Local Auth Session Guard
    → Next.js Route Handler / Server Action boundary
    → Application Service
      → Domain Policy / Validator
        → Toss HTTP Client
          → https://openapi.tossinvest.com
```

브라우저가 접근하는 API는 토스 endpoint의 단순 proxy가 아니다. 필요한 기능만 명시적으로 허용하는 BFF이다.

## 2. 레이어 책임

| 레이어 | 책임 | 금지 |
|---|---|---|
| UI | 입력, 표시, 접근성, 확인 UX | secret, Toss 직접호출 |
| BFF route | 인증된 로컬 요청, validation, response mapping | 임의 URL proxy |
| Application service | use case orchestration, cache, retry 결정 | React dependency |
| Domain | 돈·수량·주문 정책, preview | HTTP/Next.js dependency |
| Toss client | endpoint 계약, headers, timeout, decoding | UI 메시지 결정 |
| Infra | config, logging, token/rate limiter, persistence | 도메인 규칙 |

## 3. 확정 기술

- Next.js 16 App Router
- React 19 + TypeScript 7 strict
- Node.js 24 LTS + pnpm 11
- runtime validation: Zod
- decimal arithmetic: decimal.js
- unit test: Vitest
- component test: Testing Library
- E2E: Playwright
- API mocking: MSW
- lint/format/typecheck

정확한 라이브러리와 버전은 `14_TECH_STACK_DECISION.md`, 전체 파일 트리는 `19_CONFIG_COMMANDS_AND_FILE_CONVENTIONS.md`를 따른다. 기능 stage마다 기술 선택을 다시 묻지 않으며, 실제 사용하는 milestone에서만 설치한다.

## 4. 확정 디렉토리 개요

```text
my_wts/
├── app/
│   ├── (dashboard)/
│   │   ├── market/
│   │   ├── rankings/
│   │   ├── indicators/
│   │   ├── portfolio/
│   │   ├── orders/
│   │   ├── trade/
│   │   ├── conditional-orders/
│   │   ├── conditional-simulator/
│   │   ├── settings/
│   │   └── diagnostics/
│   ├── login/
│   ├── signup/
│   └── api/v1/
├── src/
│   ├── application/
│   ├── domain/
│   ├── integrations/toss/
│   ├── infrastructure/
│   ├── ui/
│   └── generated/
├── drizzle/
├── data/
├── logs/
├── tests/
│   ├── unit/
│   ├── contract/
│   ├── component/
│   ├── integration/
│   ├── e2e/
│   ├── safety/
│   └── fixtures/
├── scripts/
├── docs/
├── references/
├── specs/
├── templates/
├── .env.example
├── .env.local
├── CODEX.md
├── README.md
└── package.json
```

세부 설정 파일을 포함한 유일한 기준 트리는 `19_CONFIG_COMMANDS_AND_FILE_CONVENTIONS.md`다.

## 5. server-only 경계

다음 모듈은 server-only로 강제한다.

- env loader
- TokenManager
- password/session service
- account context
- Toss HTTP client
- local audit writer

client component가 이 모듈을 import하면 build/test가 실패하도록 boundary test를 둔다.

## 6. 환경변수

Next.js skeleton 생성 직후 `.env.example`을 `.env.local`로 복사한다. 실제 secret은 MS-04.01까지 비워둔다.

`.env.example`:

```dotenv
TOSS_API_BASE_URL=https://openapi.tossinvest.com
TOSS_CLIENT_ID=
TOSS_CLIENT_SECRET=
ALLOW_LIVE_TOSS_API=false
LOCAL_BIND_HOST=127.0.0.1
LOCAL_PORT=3000
DATABASE_PATH=./data/my_wts.sqlite3
LOG_LEVEL=info
LOG_PATH=./logs/my_wts.log
REQUEST_TIMEOUT_GET_MS=8000
```

accountSeq 환경변수는 사용하지 않는다. 계좌 목록을 조회한 뒤 opaque accountRef를 로그인 session의 server-side 상태로 선택한다.

## 7. Type/Schema 흐름

```text
OpenAPI schema
  → generated/raw DTO
    → runtime validation
      → domain model
        → view model
```

- generated DTO를 화면에 직접 사용하지 않는다.
- 응답의 unknown enum을 보존한다.
- nullable과 optional을 구분한다.
- decimal string을 유지한다.
- OpenAPI code generation 결과는 공식 버전과 checksum을 기록한다.

## 8. 데이터 fetching

확정:

- 서버 BFF endpoint에는 TanStack Query를 사용한다.
- 종목 master, 시세, 계좌 데이터의 cache TTL은 `17_DATABASE_AND_STATE_MODEL.md`의 고정값을 사용한다.
- 현재가/호가/체결 polling은 해당 화면이 visible일 때만 수행한다.
- 캔들은 사용자 refresh와 query invalidation으로 갱신한다.
- account/holdings는 수동 refresh와 선택 계좌 변경 후 invalidate한다.
- 주문·조건주문 내역은 사용자 refresh와 제한적인 조회 polling만 사용한다.

웹소켓은 공식 문서상 아직 제공되지 않으므로 존재한다고 가정하지 않는다.

## 9. 로컬 persistence

확정 persistence:

- UI 설정
- watchlist
- local users와 hashed password
- hashed login sessions
- redacted audit

SQLite는 repository layer 뒤에 둔다. access token, client secret, 전체 계좌번호, Authorization header, 원본 개인정보 응답은 저장하지 않는다.

## 10. 별도 SPA/backend 미사용

React/Vite와 Express/NestJS를 별도 process로 분리하지 않는다. UI와 BFF를 Next.js 한 프로젝트에 둔다.
