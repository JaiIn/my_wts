# 14. 확정 기술 스택 — ADR-001

상태: `ACCEPTED`  
확정일: 2026-07-24  
프로젝트: `my_wts`

## 1. 최종 결정

`my_wts`는 **Next.js App Router 기반 로컬 풀스택 모놀리스**로 개발한다.

```text
React UI
  → Local SQLite Auth Session
    → Next.js Route Handlers (local BFF)
    → Application/Domain Services
      → Toss Open API
    → SQLite
```

별도 Express/NestJS 백엔드와 별도 Vite React 앱을 만들지 않는다.

## 2. Runtime과 패키지 관리

| 항목 | 확정 |
|---|---|
| OS | Windows 11 |
| Shell | PowerShell 7.x |
| Node.js | `24.x LTS` |
| Package manager | `pnpm 11.x` |
| Version pinning | `packageManager` + `pnpm-lock.yaml` |

Node 26은 2026-07-24 현재 Current이므로 사용하지 않고 Node 24 LTS를 선택한다.

## 3. Frontend

| 영역 | 확정 기술 | 기준 버전 |
|---|---|---:|
| Framework | Next.js App Router | 16.2.x |
| View | React | 19.2.x |
| Language | TypeScript strict | 5.9.x |
| Styling | Tailwind CSS | 4.3.x |
| UI components | shadcn/ui 고정 component set | CLI 4.14.x |
| Accessible primitives | shadcn이 생성하는 Radix 계열 | lockfile 고정 |
| Icons | Lucide React | 1.26.x |
| Server state | TanStack Query | 5.101.x |
| Forms | React Hook Form | 7.82.x |
| Runtime validation | Zod | 4.4.x |
| Form integration | `@hookform/resolvers` | 5.4.x |
| Financial chart | Lightweight Charts | 5.2.x |
| Date formatting | date-fns + Intl | 4.4.x |

### 상태관리 결정

- API/server state: TanStack Query
- page/component state: React `useState`/`useReducer`
- 선택 계좌 같은 작은 전역 상태: React Context
- Redux, Zustand, MobX: 사용하지 않음

실제 복잡성이 증명되기 전 전역 상태 라이브러리를 추가하지 않는다.

### shadcn component set

아래 component만 생성한다.

```text
alert
badge
button
card
checkbox
dialog
dropdown-menu
input
label
scroll-area
select
separator
sheet
skeleton
switch
table
tabs
tooltip
```

Toast는 shadcn의 `sonner` integration과 `sonner 2.0.x`를 사용한다.

## 4. Backend

| 영역 | 확정 기술 |
|---|---|
| BFF | Next.js Route Handlers |
| Runtime | Node.js runtime |
| HTTP | 표준 `fetch` + 프로젝트 전용 typed wrapper |
| API type generation | openapi-typescript 7.13.x |
| Runtime response validation | Zod |
| Decimal calculation | decimal.js 10.6.x |
| Logging | Pino 10.3.x, server-only redaction |
| Token storage | server process memory |
| Rate limiting/cache | 작은 프로젝트 전용 in-memory 구현 |
| Local password | Node.js `crypto.scrypt` |
| Login session | opaque cookie + SQLite hashed token |

### 명시적으로 사용하지 않는 것

- Next.js Edge Runtime
- Axios
- GraphQL
- tRPC
- NestJS
- Express
- 별도 Python/FastAPI backend
- Redis

토스 API와 SQLite native driver가 Node runtime에 적합하고, 로컬 프로젝트에 별도 backend process를 추가할 이유가 없기 때문이다.

## 5. Database

| 항목 | 확정 |
|---|---|
| DB | SQLite local file |
| ORM/query builder | Drizzle ORM 0.45.x |
| SQLite driver | better-sqlite3 13.x |
| Migration | drizzle-kit 0.31.x |

저장 대상:

- watchlist
- UI preference
- local users
- login sessions
- 민감정보가 제거된 audit metadata

저장 금지:

- client secret
- access token
- Authorization header
- 전체 계좌번호
- raw Toss API response
- 평문 비밀번호
- login session token 원문

DB는 M01 로컬 인증에서 도입한다.

## 6. Testing과 품질

| 영역 | 확정 기술 | 기준 버전 |
|---|---|---:|
| Unit/contract | Vitest | 4.1.x |
| Component | React Testing Library | 16.3.x |
| API mock | MSW | 2.15.x |
| Browser E2E | Playwright | 1.61.x |
| Lint | ESLint | 9.39.x |
| Format | Prettier | 3.9.x |

Jest, Cypress, Storybook은 사용하지 않는다. 필요성이 확인되면 별도 ADR로만 추가한다.

## 7. Architecture 규칙

### Server Components

- 초기 page shell과 server-only read에 사용
- client bundle을 줄일 수 있는 정적/서버 렌더링 영역에 사용

### Client Components

- 차트
- polling
- form
- interactive table
- TanStack Query hooks

필요한 component에만 `'use client'`를 지정한다.

### Route Handlers

- 브라우저가 호출하는 유일한 Toss 연동 경계
- request validation
- 계좌 context
- rate limit/cache
- response ViewModel 변환
- local auth guard와 Toss mutation 부재 guard

## 8. 버전 정책

2026-07-24 확인 기준 최신 패치:

```text
next 16.2.11
react 19.2.8
typescript 5.9.3
pnpm 11.17.0
```

프로젝트 생성 시 실제 설치된 exact version을 `package.json`과 `pnpm-lock.yaml`로 고정한다.

- 자동 major upgrade 금지
- dependency 범위를 `latest`로 방치하지 않음
- patch/minor update도 별도 dependency update commit
- 기능 stage 중 무관한 dependency upgrade 금지
- OpenAPI snapshot version과 package lock을 함께 기록

## 9. 선택 근거

### Next.js 단일 프로젝트

- Toss secret을 server-only에 유지
- 별도 backend process·CORS·계약 중복 제거
- UI와 BFF type 공유
- Windows local 실행이 단순

### TanStack Query

- polling/cache/deduplication/error state를 직접 재구현하지 않음
- market widget별 부분 실패 처리에 적합

### Zod + openapi-typescript

- compile-time type과 runtime 외부 API 검증을 모두 확보
- API 문서가 바뀌어도 unknown value를 안전하게 처리

### SQLite + Drizzle

- local-only 요구에 맞음
- 별도 DB server 없음
- Prisma보다 가벼운 migration/query layer

### Vitest + MSW + Playwright

- unit/contract/mock/E2E를 분리
- live API 없이 빠른 stage test 가능

## 10. 변경 절차

이 ADR 이후 위 기술은 “후보”가 아니라 프로젝트 기준이다. 변경하려면 다음이 필요하다.

1. 현재 기술로 해결할 수 없는 구체적 문제
2. 대체안의 이점과 migration 비용
3. 테스트 시간 영향
4. 사용자 승인
5. 영향받는 기존 baseline 문서의 승인된 최소 수정

단순 선호나 새 라이브러리 유행만으로 변경하지 않는다.

## 10.1 Exact dependency baseline

M00에서 아래 version을 설치하고 `pnpm-lock.yaml`로 고정한다.

### dependencies

```text
next 16.2.11
react 19.2.8
react-dom 19.2.8
@tanstack/react-query 5.101.4
zod 4.4.3
react-hook-form 7.82.0
@hookform/resolvers 5.4.0
decimal.js 10.6.0
drizzle-orm 0.45.2
better-sqlite3 13.0.1
tailwindcss 4.3.3
lightweight-charts 5.2.0
lucide-react 1.26.0
date-fns 4.4.0
pino 10.3.1
pino-roll 4.0.0
sonner 2.0.7
```

### devDependencies

```text
typescript 5.9.3
@types/node 24.13.3
@types/react 19.2.17
@types/react-dom 19.2.3
eslint 9.39.5
eslint-config-next 16.2.11
prettier 3.9.6
openapi-typescript 7.13.0
drizzle-kit 0.31.10
vitest 4.1.10
@vitest/coverage-v8 4.1.10
@testing-library/react 16.3.2
msw 2.15.0
@playwright/test 1.61.1
jsdom 29.1.1
shadcn 4.14.1
pino-pretty 13.1.3
@redocly/cli 2.40.0
```

## 11. 공식 확인 출처

- https://nextjs.org/docs/app/getting-started/installation
- https://nextjs.org/docs/app
- https://nextjs.org/docs/app/guides/upgrading/version-16
- https://nodejs.org/en/about/previous-releases
- https://www.npmjs.com/
