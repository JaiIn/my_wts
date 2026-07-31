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

`quantity`와 `orderAmount`를 동시에 보내지 않는다. 수량 주문의 `timeInForce`는 선택이며 생략 시 `DAY`, `CLS`는 미국 LIMIT에서만 허용한다. LIMIT에는 price가 필요하고 MARKET에는 price를 보내지 않는다.

금액 주문은 미국 MARKET `BUY`/`SELL`을 허용한다. `timeInForce`, `price`, `quantity`를 보내지 않으며 정규장 여부는 사용자 입력이 아닌 trusted server-side context로 검증한다.

국내 주식 지정가의 KRX 호가 단위는 다음과 같다.

| 가격 구간 | 호가 단위 |
|---|---:|
| 2,000원 미만 | 1원 |
| 2,000원 이상 5,000원 미만 | 5원 |
| 5,000원 이상 20,000원 미만 | 10원 |
| 20,000원 이상 50,000원 미만 | 50원 |
| 50,000원 이상 200,000원 미만 | 100원 |
| 200,000원 이상 500,000원 미만 | 500원 |
| 500,000원 이상 | 1,000원 |

경계는 상위 구간을 사용한다. [KRX 주식 매매제도](https://global.krx.co.kr/contents/GLB/06/0602/0602010201/GLB0602010201T3.jsp)를 기준으로 Decimal 배수를 검증하며 자동 반올림·절삭·보정하지 않는다.

시뮬레이션 결과는 `SIMULATION_ONLY`, `submitted=false`, `persisted=false`이고 실제 주문을 제출하거나 저장하지 않는다.

일반 주문 시뮬레이션은 시장 native currency(`KRW`/`USD`)만 사용하며 FX와 세금을 적용하지 않는다. 수량 LIMIT의 gross는 `price × quantity`, 수량 MARKET은 같은 server operation에서 조회한 trusted `PriceResponse.lastPrice × quantity`, 금액 MARKET은 `orderAmount`다. MARKET reference price와 그 timestamp, KST 계산 기준일, commission rule은 Browser payload가 아닌 trusted server-side context다.

`commissionRate`는 퍼센트 단위다. 수수료는 `gross × commissionRate ÷ 100`이고, trusted KST 기준일에 시장과 inclusive 적용 기간이 일치하는 정확히 한 rule만 사용한다. BUY cash amount는 gross+commission, SELL은 세금 차감 전 gross-commission이다. `taxIncluded=false`, `fxApplied=false`이며 tax·FX 값을 추정하지 않는다.

계산은 충분한 precision의 Decimal exact arithmetic으로 수행하며 중간값과 최종값을 반올림·절삭하지 않는다. canonical plain decimal 출력이 30자를 넘으면 값을 보정하지 않고 실패한다.

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
