# 16. my_wts 내부 BFF API 명세

상태: `FROZEN`  
Canonical machine spec: `specs/my-wts-bff-openapi.yaml`

## 1. 공통

```text
Base: http://127.0.0.1:3000/api/v1
Content-Type: application/json
Locale: ko-KR
Time: ISO 8601 offset
```

성공:

```json
{
  "data": {},
  "meta": {
    "requestId": "uuid",
    "fetchedAt": "ISO-8601",
    "stale": false,
    "nextCursor": null
  }
}
```

오류:

```json
{
  "error": {
    "requestId": "uuid",
    "code": "VALIDATION_FAILED",
    "message": "입력값을 확인해 주세요.",
    "retryable": false,
    "details": {}
  }
}
```

`/health`, `/auth/signup`, `/auth/login` 이외 endpoint는 로그인 session이 필요하다.

## 2. 로컬 인증

| Method | Path | 성공 | 설명 |
|---|---|---:|---|
| POST | `/auth/signup` | 201 | 사용자 생성 후 session 설정 |
| POST | `/auth/login` | 204 | session 설정 |
| POST | `/auth/logout` | 204 | session 폐기 |
| GET | `/auth/session` | 200 | 현재 안전한 사용자 정보 |

세부 request, cookie, scrypt, 만료 규칙은 `22_LOCAL_AUTHENTICATION_SPEC.md`를 따른다.

## 3. System

| Method | Path | 설명 |
|---|---|---|
| GET | `/health` | process/DB 상태 |
| GET | `/capabilities` | 안전한 기능 상태와 version |
| GET | `/diagnostics` | redacted local diagnostics |

`capabilities`는 아래 필드를 반환한다.

```json
{
  "data": {
    "appVersion": "1.0.0",
    "tossOpenApiVersion": "1.2.5",
    "liveReadEnabled": false,
    "authenticated": true,
    "accountSelected": false,
    "realOrderMode": "NOT_IMPLEMENTED"
  },
  "meta": { "requestId": "uuid" }
}
```

## 4. Market

| Method | Path | Query |
|---|---|---|
| GET | `/market/stocks` | `symbols` 1~200 |
| GET | `/market/stocks/{symbol}/warnings` | 없음 |
| GET | `/market/prices` | `symbols` 1~200 |
| GET | `/market/orderbook` | `symbol` |
| GET | `/market/trades` | `symbol`, `count` 1~50 |
| GET | `/market/price-limits` | `symbol` |
| GET | `/market/candles` | `symbol`, `interval`, `count`, `before`, `adjusted` |
| GET | `/market/exchange-rate` | `baseCurrency`, `quoteCurrency`, `dateTime` |
| GET | `/market/calendars/{country}` | `date` |
| GET | `/market/rankings` | 공식 ranking parameters |
| GET | `/market/indicators/prices` | `symbols` |
| GET | `/market/indicators/{symbol}/candles` | `interval`, `count`, `before` |
| GET | `/market/indicators/{symbol}/investor-trading` | `interval`, `count`, `until` |

BFF `data`는 Toss `{result}` envelope를 제거한 공식 component 값이다.

| BFF operation | `data` schema |
|---|---|
| getStocks | `StockInfo[]` |
| getStockWarnings | `StockWarning[]` |
| getPrices | `PriceResponse[]` |
| getOrderbook | `OrderbookResponse` |
| getTrades | `Trade[]` |
| getPriceLimits | `PriceLimitResponse` |
| getCandles | `CandlePageResponse` |
| getExchangeRate | `ExchangeRateResponse` |
| getMarketCalendar KR/US | 해당 공식 calendar response |
| getRankings | `RankingResponse` |
| getIndicatorPrices | `MarketIndicatorPriceResponse[]` |
| getIndicatorCandles | `MarketIndicatorCandlePageResponse` |
| getInvestorTrading | `InvestorTradingResponse` |

## 5. Toss 계좌와 session

### GET `/accounts`

```json
{
  "data": {
    "accounts": [
      {
        "accountRef": "opaque-random-id",
        "maskedAccountNo": "*******8901",
        "accountType": "BROKERAGE",
        "selected": false
      }
    ]
  },
  "meta": { "requestId": "uuid" }
}
```

accountSeq는 응답하지 않는다.

### PUT `/session/account`

```json
{ "accountRef": "opaque-random-id" }
```

성공은 204다. accountRef는 로그인 session의 server-side 필드에 저장한다.

### DELETE `/session/account`

성공은 204이며 현재 사용자의 선택 accountRef만 제거한다.

## 6. Portfolio와 order info

| Method | Path | Query |
|---|---|---|
| GET | `/portfolio/holdings` | optional `symbol` |
| GET | `/order-info/buying-power` | `currency` |
| GET | `/order-info/sellable-quantity` | `symbol` |
| GET | `/order-info/commissions` | 없음 |

선택 계좌가 없으면 `409 ACCOUNT_NOT_SELECTED`.

## 7. 주문내역 read-only

| Method | Path | 설명 |
|---|---|---|
| GET | `/orders` | OPEN/CLOSED, symbol/date/cursor/limit |
| GET | `/orders/{orderId}` | 주문·체결 상세 |
| GET | `/conditional-orders` | OPEN/CLOSED 조건주문 목록 |
| GET | `/conditional-orders/{id}` | 조건주문 상세 |

`data` schema:

| Operation | 공식 schema |
|---|---|
| getOrders | `PaginatedOrderResponse` |
| getOrder | `Order` |
| getConditionalOrders | `PaginatedConditionalOrderResponse` |
| getConditionalOrder | `ConditionalOrderDetailResponse` |

unknown enum은 원문을 보존한다. 정정·취소 action은 제공하지 않는다.

## 8. 일반 주문 시뮬레이터

### POST `/simulations/orders`

```json
{
  "symbol": "005930",
  "side": "BUY",
  "orderType": "LIMIT",
  "timeInForce": "DAY",
  "quantity": "10",
  "price": "70000"
}
```

응답:

```json
{
  "data": {
    "kind": "SIMULATION_ONLY",
    "symbol": "005930",
    "side": "BUY",
    "currency": "KRW",
    "sizingMode": "QUANTITY",
    "estimatedOrderAmount": "700000",
    "estimatedCommission": "105",
    "estimatedCashAmount": "700105",
    "cashDirection": "OUTFLOW",
    "taxIncluded": false,
    "fxApplied": false,
    "calculationPrice": "70000",
    "referencePriceAsOf": null,
    "warnings": [],
    "submitted": false,
    "persisted": false
  },
  "meta": { "requestId": "uuid" }
}
```

이 endpoint는 현재가·경고·장 정보·주문정보를 GET으로 조회할 수 있지만 Toss mutation을 호출하지 않는다. simulation ID, 만료, 확인문구, submit endpoint는 없다.

요청은 수량 기반과 금액 기반을 `oneOf`로 구분한다.

- 수량 기반: `quantity` 필수, `orderAmount` 금지, `timeInForce` 선택(기본 `DAY`)
- `CLS`: 미국 LIMIT 수량 주문에만 허용
- LIMIT: `price` 필수, MARKET: `price` 금지
- 금액 기반: 미국 MARKET 전용이며 `BUY`, `SELL` 모두 허용
- 금액 기반: `orderAmount` 필수, `quantity`·`price`·`timeInForce` 금지
- 미국 소수 수량과 금액 주문의 정규장 여부는 request body가 아닌 trusted server-side context로 검증
- 국내 지정가는 KRX 구간별 호가 단위를 적용하며 자동 반올림·절삭·보정하지 않음

request body는 reference price, reference price timestamp/currency, calculation date, commission rule 또는 환율을 받지 않는다. 수량 MARKET의 기준 가격은 같은 operation에서 server-side로 조회한 `PriceResponse.lastPrice`이고, 금액 MARKET은 `orderAmount`를 gross로 사용한다.

계산 통화는 `KRW` 또는 `USD` native currency다. 환율과 세금을 적용하지 않아 `fxApplied=false`, `taxIncluded=false`이다. 수수료율은 퍼센트 단위이며 trusted KST 기준일에 시장·inclusive 적용 기간이 일치하는 정확히 한 rule로 계산한다. BUY의 cash amount는 gross+commission, SELL은 세금 차감 전 gross-commission이다.

Decimal 중간값과 최종값은 반올림·절삭하지 않는다. 출력은 최대 30자의 canonical plain decimal이고 초과값은 오류다. 응답은 항상 `SIMULATION_ONLY`, `submitted=false`, `persisted=false`이고 실제 주문 제출이나 저장을 수행하지 않는다.

## 9. 조건주문 시뮬레이터

### POST `/simulations/conditional-orders`

SINGLE/OCO/OTO의 `symbol`, `quantity`, `orderType`, `expireDate`, `first`, `second`를 검증하고 `SIMULATION_ONLY` 결과를 반환한다.

- 저장하지 않음
- 가격을 감시하지 않음
- background job 없음
- Toss 조건주문 mutation 호출 없음

## 10. Watchlist

| Method | Path | 설명 |
|---|---|---|
| GET | `/watchlists` | 현재 사용자 목록/항목 |
| POST | `/watchlists` | 목록 생성 |
| PATCH | `/watchlists/{id}` | 이름·순서 변경 |
| DELETE | `/watchlists/{id}` | 목록 삭제 |
| POST | `/watchlists/{id}/items` | symbol 추가 |
| DELETE | `/watchlists/{id}/items/{country}/{symbol}` | 삭제 |

모든 query에 인증된 `user_id` 범위를 강제한다. 기본 watchlist는 삭제할 수 없다.

## 11. 영구 금지 route

다음 route는 BFF에 존재하지 않아야 하며 요청 시 일반 404를 반환한다.

```text
POST   /orders
POST   /orders/{orderId}/modify
POST   /orders/{orderId}/cancel
POST   /conditional-orders
POST   /conditional-orders/{id}/modify
DELETE /conditional-orders/{id}
```

## 12. HTTP 정책

| 상황 | Status |
|---|---:|
| GET success | 200 |
| signup/local resource create | 201 |
| login/logout/session update | 204 |
| unauthenticated | 401 |
| validation | 400 |
| origin/forbidden | 403 |
| not found | 404 |
| account/state conflict | 409 |
| login rate limit/upstream rate | 429 |
| unavailable | 502/503/504 |

## 13. Retry와 security

- browser는 GET 429/503/504만 최대 2회 backoff
- BFF는 Toss safe GET만 token refresh 후 최대 1회 재시도
- auth와 local write는 자동 retry 금지
- simulation은 사용자가 다시 계산
- same-origin, Host/Origin 검사
- JSON body 64KB
- session cookie와 account context는 server-only
- secret/token/accountSeq/password 응답 금지
- generic proxy 금지

