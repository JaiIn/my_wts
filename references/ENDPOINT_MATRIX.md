# Toss OpenAPI 1.2.4 Endpoint Matrix

확인일: 2026-07-24  
Base URL: `https://openapi.tossinvest.com`

총 27 paths, 30 operations.

이 표는 토스 공식 API 전체 목록이다. `my_wts`는 GET 조회와 server-only token 발급만 사용한다. 아래 6개 mutation은 숙지용으로만 남기며 client·BFF·UI에서 구현하지 않는다.

```text
createOrder, modifyOrder, cancelOrder
createConditionalOrder, modifyConditionalOrder, cancelConditionalOrder
```

| Domain | Method | Path | operationId | 계좌 헤더 | Rate group |
|---|---|---|---|---:|---|
| Auth | POST | `/oauth2/token` | issueOAuth2Token | X | AUTH |
| Market Data | GET | `/api/v1/orderbook` | getOrderbook | X | MARKET_DATA |
| Market Data | GET | `/api/v1/prices` | getPrices | X | MARKET_DATA |
| Market Data | GET | `/api/v1/trades` | getTrades | X | MARKET_DATA |
| Market Data | GET | `/api/v1/price-limits` | getPriceLimit | X | MARKET_DATA |
| Market Data | GET | `/api/v1/candles` | getCandles | X | MARKET_DATA_CHART |
| Stock Info | GET | `/api/v1/stocks` | getStocks | X | STOCK |
| Stock Info | GET | `/api/v1/stocks/{symbol}/warnings` | getStockWarnings | X | STOCK |
| Market Info | GET | `/api/v1/exchange-rate` | getExchangeRate | X | MARKET_INFO |
| Market Info | GET | `/api/v1/market-calendar/KR` | getKrMarketCalendar | X | MARKET_INFO |
| Market Info | GET | `/api/v1/market-calendar/US` | getUsMarketCalendar | X | MARKET_INFO |
| Ranking | GET | `/api/v1/rankings` | getRankings | X | RANKING |
| Indicators | GET | `/api/v1/market-indicators/prices` | getMarketIndicatorPrices | X | MARKET_INDICATOR_PRICE |
| Indicators | GET | `/api/v1/market-indicators/{symbol}/candles` | getMarketIndicatorCandles | X | MARKET_INDICATOR_CHART |
| Indicators | GET | `/api/v1/market-indicators/{symbol}/investor-trading` | getMarketIndicatorInvestorTrading | X | MARKET_INDICATOR |
| Account | GET | `/api/v1/accounts` | getAccounts | X | ACCOUNT |
| Asset | GET | `/api/v1/holdings` | getHoldings | O | ASSET |
| Order History | GET | `/api/v1/orders` | getOrders | O | ORDER_HISTORY |
| Order | POST | `/api/v1/orders` | createOrder | O | ORDER |
| Order History | GET | `/api/v1/orders/{orderId}` | getOrder | O | ORDER_HISTORY |
| Order | POST | `/api/v1/orders/{orderId}/modify` | modifyOrder | O | ORDER |
| Order | POST | `/api/v1/orders/{orderId}/cancel` | cancelOrder | O | ORDER |
| Conditional Order | POST | `/api/v1/conditional-orders` | createConditionalOrder | O | CONDITIONAL_ORDER |
| Conditional History | GET | `/api/v1/conditional-orders` | getConditionalOrders | O | CONDITIONAL_ORDER_HISTORY |
| Conditional History | GET | `/api/v1/conditional-orders/{conditionalOrderId}` | getConditionalOrder | O | CONDITIONAL_ORDER_HISTORY |
| Conditional Order | DELETE | `/api/v1/conditional-orders/{conditionalOrderId}` | cancelConditionalOrder | O | CONDITIONAL_ORDER |
| Conditional Order | POST | `/api/v1/conditional-orders/{conditionalOrderId}/modify` | modifyConditionalOrder | O | CONDITIONAL_ORDER |
| Order Info | GET | `/api/v1/buying-power` | getBuyingPower | O | ORDER_INFO |
| Order Info | GET | `/api/v1/sellable-quantity` | getSellableQuantity | O | ORDER_INFO |
| Order Info | GET | `/api/v1/commissions` | getCommissions | O | ORDER_INFO |

`GET /api/v1/accounts`는 accountSeq를 얻기 위한 진입점이며 계좌 헤더를 요구하지 않는다.

## 핵심 파라미터 제약

| operation | 제약 |
|---|---|
| getPrices/getStocks | symbols 1~200 |
| getTrades | count 1~50 |
| getCandles | interval 1m/1d, count 1~200 |
| getRankings | count 1~100, gainers/losers realtime 미지원 |
| getOrders | status OPEN/CLOSED 필수; CLOSED만 cursor |
| createOrder | quantity 또는 orderAmount 계약, clientOrderId 권장 |
| modifyOrder | KR quantity 필수, US quantity 변경 불가 |
| getBuyingPower | currency KRW/USD |
| conditional create | expireDate/first 필수, OCO/OTO second 필수 |

정확한 request/response schema와 예시는 `source/openapi-v1.2.4.json`을 최종 기준으로 사용한다. mutation 제약은 구현 지시가 아니라 공식 명세 기록이다.
