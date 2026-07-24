# Internal BFF → Toss OpenAPI Mapping

상태: `FROZEN`

| Internal BFF | Toss operationId | Toss endpoint |
|---|---|---|
| `TokenManager.issueToken()` server-only | issueOAuth2Token | POST `/oauth2/token` |
| GET `/api/v1/market/orderbook` | getOrderbook | GET `/api/v1/orderbook` |
| GET `/api/v1/market/prices` | getPrices | GET `/api/v1/prices` |
| GET `/api/v1/market/trades` | getTrades | GET `/api/v1/trades` |
| GET `/api/v1/market/price-limits` | getPriceLimit | GET `/api/v1/price-limits` |
| GET `/api/v1/market/candles` | getCandles | GET `/api/v1/candles` |
| GET `/api/v1/market/stocks` | getStocks | GET `/api/v1/stocks` |
| GET `/api/v1/market/stocks/{symbol}/warnings` | getStockWarnings | GET `/api/v1/stocks/{symbol}/warnings` |
| GET `/api/v1/market/exchange-rate` | getExchangeRate | GET `/api/v1/exchange-rate` |
| GET `/api/v1/market/calendars/KR` | getKrMarketCalendar | GET `/api/v1/market-calendar/KR` |
| GET `/api/v1/market/calendars/US` | getUsMarketCalendar | GET `/api/v1/market-calendar/US` |
| GET `/api/v1/market/rankings` | getRankings | GET `/api/v1/rankings` |
| GET `/api/v1/market/indicators/prices` | getMarketIndicatorPrices | GET `/api/v1/market-indicators/prices` |
| GET `/api/v1/market/indicators/{symbol}/candles` | getMarketIndicatorCandles | GET `/api/v1/market-indicators/{symbol}/candles` |
| GET `/api/v1/market/indicators/{symbol}/investor-trading` | getMarketIndicatorInvestorTrading | GET `/api/v1/market-indicators/{symbol}/investor-trading` |
| GET `/api/v1/accounts` | getAccounts | GET `/api/v1/accounts` |
| GET `/api/v1/portfolio/holdings` | getHoldings | GET `/api/v1/holdings` |
| GET `/api/v1/orders` | getOrders | GET `/api/v1/orders` |
| **미구현·금지** | createOrder | POST `/api/v1/orders` |
| GET `/api/v1/orders/{orderId}` | getOrder | GET `/api/v1/orders/{orderId}` |
| **미구현·금지** | modifyOrder | POST `/api/v1/orders/{orderId}/modify` |
| **미구현·금지** | cancelOrder | POST `/api/v1/orders/{orderId}/cancel` |
| **미구현·금지** | createConditionalOrder | POST `/api/v1/conditional-orders` |
| GET `/api/v1/conditional-orders` | getConditionalOrders | GET `/api/v1/conditional-orders` |
| GET `/api/v1/conditional-orders/{id}` | getConditionalOrder | GET `/api/v1/conditional-orders/{conditionalOrderId}` |
| **미구현·금지** | cancelConditionalOrder | DELETE `/api/v1/conditional-orders/{conditionalOrderId}` |
| **미구현·금지** | modifyConditionalOrder | POST `/api/v1/conditional-orders/{conditionalOrderId}/modify` |
| GET `/api/v1/order-info/buying-power` | getBuyingPower | GET `/api/v1/buying-power` |
| GET `/api/v1/order-info/sellable-quantity` | getSellableQuantity | GET `/api/v1/sellable-quantity` |
| GET `/api/v1/order-info/commissions` | getCommissions | GET `/api/v1/commissions` |

Token 발급은 public BFF route가 아니다.

추가 internal-only endpoints:

| BFF | 목적 |
|---|---|
| GET `/api/v1/health` | process health |
| POST `/api/v1/auth/signup` | local 회원가입 |
| POST `/api/v1/auth/login` | local 로그인 |
| POST `/api/v1/auth/logout` | local 로그아웃 |
| GET `/api/v1/auth/session` | 현재 사용자 |
| GET `/api/v1/capabilities` | safe flags/version |
| PUT `/api/v1/session/account` | opaque account 선택 |
| DELETE `/api/v1/session/account` | account session 제거 |
| POST `/api/v1/simulations/orders` | 비실주문 계산 |
| POST `/api/v1/simulations/conditional-orders` | 비실주문 조건 검증 |
| GET/POST/DELETE `/api/v1/watchlists` | local watchlist |
| GET `/api/v1/diagnostics` | redacted diagnostics |

`미구현·금지` 6개 operation은 Toss 공식 명세의 전체 범위를 숙지하기 위해 표에 남긴다. 내부 route/client/generated mutation binding은 만들지 않는다.
