# 02. 인증, 공통 응답, 오류, Rate Limit

## 1. 서버와 인증

```text
Base URL: https://openapi.tossinvest.com
Grant: OAuth 2.0 Client Credentials
Token endpoint: POST /oauth2/token
```

토큰 endpoint만 Authorization 헤더 없이 호출한다.

### 토큰 요청

Content-Type은 `application/x-www-form-urlencoded`이다.

| 필드 | 필수 | 값 |
|---|---:|---|
| `grant_type` | O | `client_credentials` |
| `client_id` | O | WTS에서 발급 |
| `client_secret` | O | WTS에서 발급, 서버 전용 |

### 토큰 응답

| 필드 | 설명 |
|---|---|
| `access_token` | JWT 형식 Bearer token |
| `token_type` | 항상 `Bearer` |
| `expires_in` | 만료까지 남은 초 |

주의:

- refresh token은 제공되지 않는다.
- 만료 시 같은 endpoint에서 새로 발급한다.
- client당 유효 access token은 1개다.
- 재발급 시 이전 token은 즉시 무효화된다.
- token issuance endpoint 응답은 공통 `{result}` envelope가 아니다.

## 2. 호출 준비

1. 토스증권 WTS 로그인
2. 설정 → Open API에서 `client_id`, `client_secret` 발급
3. 허용 IP 관리에서 호출 PC의 공인 IP 등록
4. 로컬 서버의 `.env.local`에 사용자가 직접 입력
5. 서버에서 token 발급

허용 IP가 아니면 토큰 발급이 `403 access_denied`로 차단된다.

## 3. 헤더

### 시장 공통 API

```http
Authorization: Bearer {access_token}
```

### 계좌·자산·주문·조건주문 API

```http
Authorization: Bearer {access_token}
X-Tossinvest-Account: {accountSeq}
```

`accountSeq`는 `GET /api/v1/accounts`의 결과에서 사용자가 선택한다. 계좌번호를 헤더에 넣는 것이 아니다.

## 4. 서버 전용 TokenManager

확정 책임:

- 환경변수 존재 여부 검증
- 동시 발급 single-flight
- 만료 전 안전 여유를 둔 메모리 캐시
- 401 expired-token 시 1회만 재발급 후 재시도
- 발급 실패의 typed error 변환
- secret/token 완전 redaction

금지:

- 요청마다 token 재발급
- token을 localStorage/sessionStorage/cookie로 브라우저에 전달
- 로그에 token prefix를 출력
- 여러 dev process가 반복 재발급하도록 방치

## 5. 성공과 오류 envelope

대부분의 성공 응답:

```json
{
  "result": {}
}
```

오류 응답:

```json
{
  "error": {
    "requestId": "request identifier",
    "code": "invalid-request",
    "message": "사용자에게 표시 가능한 메시지",
    "data": {}
  }
}
```

`message`가 빈 문자열일 수 있다. UI는 `code` 기반 기본 메시지를 가지며 unknown code를 허용해야 한다. `requestId`는 `X-Request-Id`와 동일하며 문의/진단에 사용하되 token 등과 함께 기록하지 않는다.

## 6. 주요 HTTP 처리 정책

| 상태 | 예 | 클라이언트 정책 |
|---:|---|---|
| 400 | invalid-request, account-header-required | 재시도 금지, 입력/계약 수정 |
| 401 | invalid-token, expired-token | token 갱신 후 안전한 조회만 1회 재시도 |
| 403 | access_denied, forbidden | IP/권한 확인, 자동 재시도 금지 |
| 404 | stock/order/account not found | 사용자에게 대상 재확인 |
| 409 | request-in-progress, already-filled | 내역의 현재 상태 재조회 |
| 415 | unsupported-content-type | Content-Type 수정 |
| 422 | 공식 주문 규칙 위반 | 제품에서는 mutation 미사용 |
| 429 | rate-limit-exceeded | Retry-After + 지수 백오프 + jitter |
| 500 | internal-error, maintenance | 안전한 GET만 제한적 재시도 |

`my_wts`는 Toss 주문 mutation을 전송하지 않는다. 주문 관련 오류 코드는 다른 채널에서 생성된 주문내역 GET 응답을 해석할 때만 참고한다.

## 7. Rate Limit 그룹

문서상 기본 한도이며 운영 상황에 따라 변경될 수 있다.

| 그룹 | 기본 TPS | 피크 제한 |
|---|---:|---|
| AUTH | 5 | 없음 |
| ACCOUNT | 1 | 없음 |
| ASSET | 5 | 없음 |
| STOCK | 5 | 없음 |
| MARKET_INFO | 3 | 없음 |
| MARKET_DATA | 10 | 없음 |
| MARKET_DATA_CHART | 5 | 없음 |
| RANKING | 5 | 없음 |
| MARKET_INDICATOR_PRICE | 10 | 없음 |
| MARKET_INDICATOR | 10 | 없음 |
| MARKET_INDICATOR_CHART | 5 | 없음 |
| ORDER | 6 | 09:00~09:10 KST: 3 |
| ORDER_HISTORY | 5 | 없음 |
| ORDER_INFO | 6 | 09:00~09:10 KST: 3 |
| CONDITIONAL_ORDER | 5 | 없음 |
| CONDITIONAL_ORDER_HISTORY | 10 | 없음 |

응답 헤더를 실제 기준으로 사용한다.

| 헤더 | 의미 |
|---|---|
| `X-RateLimit-Limit` | 현재 허용 TPS/burst |
| `X-RateLimit-Remaining` | 남은 token |
| `X-RateLimit-Reset` | 1 token 재충전 예상 초 |
| `Retry-After` | 429 후 권장 대기 초 |

## 8. 로컬 RateLimiter 설계

- API 그룹별 독립 bucket
- 요청 deduplication
- 종목 정보는 세션 진입 시 캐시
- 가격 다건 조회는 최대 200 symbol로 batch
- 캔들 poll과 현재가 poll 분리
- 브라우저 탭 focus/visibility에 따라 poll 중지
- 429 시 `Retry-After` 우선, 지수 백오프와 jitter
- Toss mutation rate group에는 요청하지 않음

## 9. 시간·숫자 계약

- ISO 8601 offset을 보존한다.
- KST와 미국 현지 날짜 의미를 구분한다.
- query의 `+`는 `%2B`로 인코딩한다.
- decimal string을 binary floating-point로 변환해 주문 계산하지 않는다.
- enum은 unknown 값을 받을 수 있게 decoder를 설계한다.
