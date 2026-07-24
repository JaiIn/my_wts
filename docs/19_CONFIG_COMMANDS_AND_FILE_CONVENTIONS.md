# 19. 설정·명령·파일 규칙

상태: `FROZEN`

## 1. 환경변수 전체 목록

| 변수 | 기본값 | 공개 | 설명 |
|---|---|---:|---|
| TOSS_API_BASE_URL | 공식 URL | X | allowlist 고정 |
| TOSS_CLIENT_ID | blank | X | MS-04.01 입력 |
| TOSS_CLIENT_SECRET | blank | X | MS-04.01 입력 |
| ALLOW_LIVE_TOSS_API | false | X | 실제 조회 허용 |
| LOCAL_BIND_HOST | 127.0.0.1 | X | 고정 |
| LOCAL_PORT | 3000 | X | 앱 port |
| DATABASE_PATH | ./data/my_wts.sqlite3 | X | SQLite |
| LOG_LEVEL | info | X | trace/debug/info/warn/error |
| LOG_PATH | ./logs/my_wts.log | X | server log |
| REQUEST_TIMEOUT_GET_MS | 8000 | X | Toss GET |

`NEXT_PUBLIC_*` 환경변수는 사용하지 않는다. UI가 알아야 하는 안전한 capability는 `/api/v1/capabilities`로 받는다.

계좌 번호를 환경변수에 고정하지 않는다. 계좌 목록에서 매 실행 session마다 선택한다.

## 2. package.json scripts

| Script | 명령 의미 |
|---|---|
| `dev` | 127.0.0.1 local dev server |
| `build` | production-mode local build 검증 |
| `start` | build 결과 local 실행 |
| `lint` | ESLint |
| `format` | Prettier write |
| `format:check` | Prettier check |
| `typecheck` | `tsc --noEmit` |
| `test` | Vitest unit |
| `test:contract` | Toss/BFF contract |
| `test:component` | RTL |
| `test:e2e` | Playwright mock E2E |
| `test:safety` | auth/session/secret/no-order boundary |
| `check:stage` | affected lint/type/test |
| `check:milestone` | lint+format+type+unit+contract+selected E2E |
| `check:final` | all tests+build+audit |
| `db:generate` | Drizzle migration generation |
| `db:migrate` | local migration |
| `db:studio` | local DB inspection |
| `spec:check` | BFF OpenAPI parse/lint |
| `spec:types` | frozen spec에서 type 생성 |
| `smoke:live:read` | 승인된 read-only smoke |

실제 주문 script와 Toss 주문 mutation client는 만들지 않는다. 주문 화면은 로컬 시뮬레이션만 수행한다.

정확한 script body:

```json
{
  "dev": "next dev --hostname 127.0.0.1 --port 3000",
  "build": "next build",
  "start": "next start --hostname 127.0.0.1 --port 3000",
  "lint": "eslint .",
  "format": "prettier --write .",
  "format:check": "prettier --check .",
  "typecheck": "tsc --noEmit",
  "test": "vitest run tests/unit",
  "test:contract": "vitest run tests/contract",
  "test:component": "vitest run tests/component",
  "test:integration": "vitest run tests/integration",
  "test:safety": "vitest run tests/safety",
  "test:e2e": "playwright test",
  "check:stage": "node scripts/check-stage.mjs",
  "check:milestone": "pnpm lint && pnpm format:check && pnpm typecheck && pnpm test && pnpm test:contract && pnpm test:component && pnpm test:integration && pnpm test:safety",
  "check:final": "pnpm check:milestone && pnpm spec:check && pnpm test:e2e && pnpm build && node scripts/secret-scan.mjs",
  "db:generate": "drizzle-kit generate",
  "db:migrate": "drizzle-kit migrate",
  "db:studio": "drizzle-kit studio",
  "spec:check": "redocly lint specs/my-wts-bff-openapi.yaml",
  "spec:types": "openapi-typescript specs/my-wts-bff-openapi.yaml -o src/generated/bff-api.ts",
  "smoke:live:read": "node scripts/live-read-smoke.mjs"
}
```

`check-stage.mjs` 고정 동작:

1. `git status --porcelain`로 변경·신규 파일 수집
2. frozen path 변경 시 즉시 실패
3. 변경된 TS/TSX/JS 파일에 ESLint
4. 전체 `tsc --noEmit`
5. 변경 source와 관련된 `vitest related --run`
6. `git diff --check`
7. 변경 파일의 secret pattern scan

`secret-scan.mjs`는 tracked 파일에서 다음 pattern을 차단한다.

```text
TOSS_CLIENT_SECRET=<non-empty>
Authorization: Bearer <non-placeholder>
access_token=<non-placeholder>
client_secret=<non-placeholder>
password=<non-placeholder>
my_wts_session=<non-placeholder>
```

## 3. 정확한 project tree

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
├── docs/
├── references/
├── specs/
├── templates/
├── CODEX.md
├── README.md
├── .env.example
├── .env.local
├── drizzle.config.ts
├── vitest.config.ts
├── playwright.config.ts
├── next.config.ts
├── tsconfig.json
├── package.json
└── pnpm-lock.yaml
```

## 4. Naming

| 대상 | 규칙 | 예 |
|---|---|---|
| files | kebab-case | `order-preview-service.ts` |
| React component | PascalCase | `OrderPreviewDialog` |
| function/variable | camelCase | `simulateOrder` |
| type/schema | PascalCase | `OrderPreviewSchema` |
| constant | UPPER_SNAKE | `SESSION_IDLE_HOURS` |
| DB table/column | snake_case | `username_normalized` |
| API JSON | camelCase | `requestId` |
| route segment | kebab-case | `/conditional-orders` |
| test | source name + `.test.ts` | `money.test.ts` |

## 5. Import boundaries

```text
ui → application contracts
route → application
application → domain + integration ports
integration → domain contracts
infrastructure → ports
domain → no framework imports
```

금지:

- domain에서 Next/React/DB import
- client component에서 integrations/infrastructure import
- UI에서 generated Toss DTO 직접 사용
- route handler에서 DB/Toss 세부 로직 직접 구현

## 6. Git ignore

```gitignore
.env
.env.local
.env.*.local
!.env.example
.next/
node_modules/
data/
logs/
playwright-report/
test-results/
coverage/
```

## 7. 포트와 cookie

- host: 127.0.0.1
- port: 3000
- login cookie: `my_wts_session`
- HttpOnly: true
- SameSite: Strict
- Secure: false(local HTTP)
- Path: `/`
- idle expiry: 12시간
- absolute expiry: 7일

## 8. Header

Browser → BFF:

```text
Accept: application/json
Content-Type: application/json (body가 있을 때)
X-MyWts-Request-Id: optional UUID
Origin: http://127.0.0.1:3000
```

BFF response:

```text
X-Request-Id
Cache-Control: no-store (auth/account/order history)
```

market GET은 browser cache 대신 TanStack Query와 server memory cache를 사용한다.
