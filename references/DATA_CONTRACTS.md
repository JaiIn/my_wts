# 핵심 데이터 계약

> 토스 공식 OpenAPI 전체 schema 참고 자료다. 주문 mutation request의 `clientOrderId` 등은 숙지용으로만 남기며 `my_wts` client/type/BFF에는 생성하지 않는다. 제품은 GET 응답과 로컬 simulation contract만 사용한다.

## 1. 공통 원칙

- API의 금액·가격·수량·비율은 대부분 decimal string이다.
- JavaScript `number`에 바로 넣어 계산하지 않는다.
- nullable과 optional을 구분한다.
- enum decoder는 unknown 값을 허용한다.
- 시간은 ISO 8601 offset을 보존한다.

## 2. OAuth

```ts
type OAuthTokenResponse = {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
};
```

OAuth 성공 응답은 `{ result }` envelope가 아니다.

## 3. 공통 응답

```ts
type ApiSuccess<T> = { result: T };

type ApiError = {
  error: {
    requestId: string;
    code: string;
    message: string;
    data?: Record<string, unknown> | null;
  };
};
```

## 4. 기본 enum

```ts
type Currency = "KRW" | "USD" | UnknownString;
type MarketCountry = "KR" | "US" | UnknownString;
type Side = "BUY" | "SELL";
type OrderType = "LIMIT" | "MARKET";
type TimeInForce = "DAY" | "CLS" | "OPG" | UnknownString;
```

`UnknownString`은 런타임에서 새 값이 와도 전체 화면이 깨지지 않게 하는 개념적 타입이다.

## 5. Account

```ts
type Account = {
  accountNo: string;
  accountSeq: number;
  accountType:
    | "BROKERAGE"
    | "OVERSEAS_DERIVATIVES"
    | "PENSION_SAVINGS"
    | "RESHORING_INVESTMENT"
    | UnknownString;
};
```

UI에는 `accountNo`를 마스킹한다. `accountSeq`는 계좌 API header에 사용한다.

## 6. Order create

```ts
type QuantityOrder = {
  clientOrderId?: string;
  symbol: string;
  side: Side;
  orderType: OrderType;
  timeInForce?: "DAY" | "CLS";
  quantity: DecimalString;
  price?: DecimalString;
  confirmHighValueOrder?: boolean;
};

type AmountOrder = {
  clientOrderId?: string;
  symbol: string;
  side: Side;
  orderType: "MARKET";
  orderAmount: DecimalString;
  confirmHighValueOrder?: boolean;
};
```

`quantity`와 `orderAmount`를 동시에 보내지 않는다. LIMIT에는 price가 필요하고 MARKET에는 price를 보내지 않는다.

## 7. Order status

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
```

`OPEN`/`CLOSED`는 목록 조회 필터 그룹이며 개별 order status와 다른 값 체계다.

## 8. Holdings

항목별:

- symbol/name/marketCountry/currency
- quantity/lastPrice/averagePurchasePrice
- marketValue/profitLoss/dailyProfitLoss/cost

profit rate가 `0.1077`이면 10.77%다. commissionRate의 단위는 별도 문서 정의를 따른다.

## 9. Pagination

| API | 방식 | 종료 |
|---|---|---|
| candles | `nextBefore` → `before` | null |
| investor trading | `nextUntil` → `until` | null/hasNext 의미 |
| CLOSED orders | `nextCursor` → `cursor` | hasNext false/null |
| conditional orders | `nextCursor` → `cursor` | hasNext false/null |

server가 돌려준 cursor를 파싱·변형하지 않고 그대로 전달한다.

## 10. Schema 목록

OpenAPI `1.2.5`에는 72개 component schema가 있다. 전체 schema, required, enum, examples는 `source/openapi-v1.2.5.json`에 보존되어 있으며 code generation과 contract test의 source of truth이다. 이전 `1.2.4` snapshot은 역사 기록으로 유지한다.

`1.2.5`의 `PaginatedOrderResponse`는 `CLOSED` 주문이 `limit` 단위 cursor pagination을 사용한다고 설명하며, 기존 내부 `OPEN`/`CLOSED` 결정과 일치한다. `from`/`to`의 KST inclusive filter와 `OPEN` 비페이지네이션 계약은 변경하지 않는다.
