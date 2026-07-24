# 18. 오류·로깅·상태 카탈로그

상태: `FROZEN`

## 1. BFF 성공 envelope

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid",
    "fetchedAt": "2026-07-24T12:00:00+09:00",
    "stale": false,
    "nextCursor": null
  }
}
```

`fetchedAt`, `stale`, `nextCursor`, `upstreamRequestId`는 해당 endpoint에서 의미가 있을 때만 포함한다.

## 2. BFF 오류 envelope

```json
{
  "error": {
    "requestId": "uuid",
    "code": "VALIDATION_FAILED",
    "message": "입력값을 확인해 주세요.",
    "retryable": false,
    "details": {
      "field": "symbols"
    }
  }
}
```

## 3. 내부 오류 코드

### Configuration

| Code | HTTP | Retry |
|---|---:|---:|
| CONFIG_MISSING | 503 | X |
| LIVE_API_DISABLED | 503 | X |

### Validation

| Code | HTTP | Retry |
|---|---:|---:|
| VALIDATION_FAILED | 400 | X |
| UNSUPPORTED_SYMBOL | 400 | X |
| UNSUPPORTED_COMBINATION | 400 | X |
| INVALID_CURSOR | 400 | X |

### Auth/account

| Code | HTTP | Retry |
|---|---:|---:|
| AUTH_REQUIRED | 401 | X |
| INVALID_CREDENTIALS | 401 | X |
| USERNAME_ALREADY_EXISTS | 409 | X |
| AUTH_RATE_LIMITED | 429 | 시간 후 O |
| SESSION_EXPIRED | 401 | X |
| TOSS_AUTH_FAILED | 502 | X |
| TOSS_TOKEN_EXPIRED | 502 | O |
| ACCOUNT_NOT_SELECTED | 409 | X |
| ACCOUNT_REF_INVALID | 409 | X |
| ACCOUNT_NOT_FOUND | 404 | X |

### Upstream

| Code | HTTP | Retry |
|---|---:|---:|
| UPSTREAM_BAD_REQUEST | 400 | X |
| UPSTREAM_FORBIDDEN | 403 | X |
| UPSTREAM_NOT_FOUND | 404 | X |
| UPSTREAM_CONFLICT | 409 | X |
| UPSTREAM_RULE_VIOLATION | 422 | X |
| UPSTREAM_RATE_LIMITED | 429 | O |
| UPSTREAM_TIMEOUT | 504 | 조회만 O |
| UPSTREAM_UNAVAILABLE | 503 | 조회만 O |
| UPSTREAM_UNKNOWN_ERROR | 502 | X |

### Simulation

| Code | HTTP | Retry |
|---|---:|---:|
| SIMULATION_INPUT_INVALID | 400 | X |
| SIMULATION_DATA_UNAVAILABLE | 503 | O |

### Local

| Code | HTTP | Retry |
|---|---:|---:|
| DATABASE_ERROR | 500 | X |
| INTERNAL_ERROR | 500 | X |

## 4. Toss 오류 매핑

| Toss code/status | BFF code |
|---|---|
| invalid-request | VALIDATION_FAILED 또는 UPSTREAM_BAD_REQUEST |
| invalid-token/expired-token | TOSS_TOKEN_EXPIRED |
| forbidden/access_denied | UPSTREAM_FORBIDDEN |
| account-not-found | ACCOUNT_NOT_FOUND |
| stock/order not found | UPSTREAM_NOT_FOUND |
| request-in-progress/already-* | UPSTREAM_CONFLICT |
| 422 domain errors | UPSTREAM_RULE_VIOLATION |
| 429 | UPSTREAM_RATE_LIMITED |
| 5xx/maintenance | UPSTREAM_UNAVAILABLE |
| unknown | UPSTREAM_UNKNOWN_ERROR |

원본 Toss code는 `details.upstreamCode`에 보존하되 UI 분기는 BFF code 기준으로 한다.

## 5. 주문 상태

Toss의 모든 상태를 그대로 보존한다.

```text
PENDING
PENDING_CANCEL
PENDING_REPLACE
PARTIAL_FILLED
FILLED
CANCELED
REJECTED
CANCEL_REJECTED
REPLACE_REJECTED
REPLACED
UNKNOWN
```

이 상태들은 토스에서 이미 생성된 주문을 조회할 때만 표시한다. 앱이 새 주문 상태를 만들지 않는다.

## 6. 조건주문 상태

```text
WATCHING
PAUSED
ORDERING
ORDERED
COMPLETED
EXPIRED
UNKNOWN
```

## 7. 로깅

Pino JSON log fields:

```text
timestamp
level
requestId
operation
routeTemplate
method
status
durationMs
upstreamRequestId
errorCode
rateLimitGroup
```

금지:

```text
authorization
access_token
client_secret
password
passwordHash
sessionToken
accountNo
accountSeq
cookie
raw request body
raw response body
```

## 8. Log destination

- console: 개발 중 INFO 이상
- file: `./logs/my_wts.log`, 10MB × 5개 rotation
- `logs/`는 Git 제외
- diagnostics 화면은 audit_events만 읽고 raw file log를 표시하지 않음

## 9. UI 오류 정책

| 종류 | UI |
|---|---|
| widget read failure | inline retry |
| local auth required/expired | login redirect |
| invalid credentials | generic form error |
| auth rate limit | 남은 시간 안내 |
| global Toss config | blocking banner + settings link |
| account selection | account dialog |
| validation | field error |
| simulation rule violation | simulator 입력 유지 |
| 429 | countdown 후 조회 재시도 |
