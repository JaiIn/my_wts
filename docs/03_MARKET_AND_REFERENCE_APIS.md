# 03. 시세·종목·시장 정보 API

모든 endpoint는 Bearer token이 필요하지만 계좌 헤더는 필요하지 않다.

## 1. Market Data

### 호가

```http
GET /api/v1/orderbook?symbol={symbol}
```

매수/매도 가격과 잔량을 반환한다. 응답의 timestamp와 currency를 화면에 함께 표시한다.

### 현재가

```http
GET /api/v1/prices?symbols=005930,AAPL
```

- 1~200개 심볼
- 영문자, 숫자, `.`, `-`, `,` 허용
- 현재가 poll은 batch하고 동일 요청을 dedupe한다.

### 최근 체결

```http
GET /api/v1/trades?symbol=005930&count=50
```

- `count`: 기본 50, 범위 1~50
- 당일 최근 체결

### 상·하한가

```http
GET /api/v1/price-limits?symbol=005930
```

미국 종목처럼 가격 제한이 없으면 upper/lower가 null일 수 있다. UI에서 null을 0으로 바꾸지 않는다.

### 캔들

```http
GET /api/v1/candles
```

| 파라미터 | 필수 | 제약 |
|---|---:|---|
| `symbol` | O | 종목 심볼 |
| `interval` | O | `1m`, `1d` |
| `count` | X | 기본 100, 1~200 |
| `before` | X | ISO 8601 inclusive |
| `adjusted` | X | 기본 true |

다음 페이지는 응답 `nextBefore`를 그대로 전달한다. `nextBefore=null`이면 마지막이다.

## 2. Stock Info

### 종목 기본 정보

```http
GET /api/v1/stocks?symbols=005930,AAPL
```

- 최대 200개
- symbol, name, englishName, ISIN, market, securityType
- 보통주 여부, 상태, 통화, 상장/상폐일, 발행주식수, leverageFactor
- 국내 종목은 정리매매, NXT 지원, KRX/NXT 거래정지 세부정보

종목정보는 영업일 단위 이상으로 갱신되므로 짧게 poll하지 않고 화면/세션 진입 시 캐시한다.

### 매수 유의사항

```http
GET /api/v1/stocks/{symbol}/warnings
```

유형:

- `LIQUIDATION_TRADING`
- `OVERHEATED`
- `INVESTMENT_WARNING`
- `INVESTMENT_RISK`
- `VI_STATIC`
- `VI_DYNAMIC`
- `VI_STATIC_AND_DYNAMIC`
- `STOCK_WARRANTS`

주문 preview에 경고를 결합한다. 경고가 없다는 것과 조회가 실패한 것을 구분한다.

## 3. Market Info

### 환율

```http
GET /api/v1/exchange-rate
```

| 파라미터 | 필수 | 설명 |
|---|---:|---|
| `dateTime` | X | 특정 시점 |
| `baseCurrency` | O | `KRW` 또는 `USD` |
| `quoteCurrency` | O | `KRW` 또는 `USD` |

1분 주기로 갱신되는 참고용 표시 환율이다. 실제 주문 비용/정산액과 동일하다고 가정하지 않는다.

### 국내 장 캘린더

```http
GET /api/v1/market-calendar/KR?date=YYYY-MM-DD
```

KRX/NXT 운영 정보와 세션 시간을 사용한다. 로컬 PC 시계만으로 주문 가능 여부를 판단하지 않는다.

### 미국 장 캘린더

```http
GET /api/v1/market-calendar/US?date=YYYY-MM-DD
```

미국 현지 날짜가 기준이며 day market, pre-market, regular market, after-market이 각각 null일 수 있다.

## 4. Ranking

```http
GET /api/v1/rankings
```

필수:

- `type`: 시장/토스증권 거래대금·거래량, 상승, 하락
- `marketCountry`: `KR`, `US`
- `duration`: `realtime`, `1d`, `1w`, `1mo`, `3mo`, `6mo`, `1y`

선택:

- `excludeInvestmentCaution` 기본 false
- `count` 기본 100, 최대 100

`TOP_GAINERS`, `TOP_LOSERS`는 `duration=realtime`을 지원하지 않는다.

## 5. Market Indicators

지원 심볼:

- `KOSPI`, `KOSDAQ`
- `KR_BOND_2Y`, `KR_BOND_3Y`, `KR_BOND_5Y`
- `KR_BOND_10Y`, `KR_BOND_20Y`, `KR_BOND_30Y`

### 지표 현재가

```http
GET /api/v1/market-indicators/prices?symbols=KOSPI,KOSDAQ
```

### 지표 캔들

```http
GET /api/v1/market-indicators/{symbol}/candles
```

- 지수: `1m`, `1d`
- 국채: `1d`만 지원
- 최대 200개, `nextBefore` pagination

### 투자자별 매매대금

```http
GET /api/v1/market-indicators/{symbol}/investor-trading
```

- symbol: `KOSPI`, `KOSDAQ`만
- interval: `1d`, `1w`, `1mo`, `1y`
- count: 기본 10, 최대 100
- 다음 페이지: `nextUntil`
- 당일 값은 잠정치이며 `updatedAt` 확인

## 6. UI 조합

종목 상세 화면의 권장 조회 순서:

1. 종목 기본정보
2. 종목 경고
3. 현재가 batch
4. 호가/체결
5. 캔들
6. 장 운영 상태
7. 필요 시 환율

각 widget은 부분 실패를 독립적으로 표시한다. 캔들 실패가 전체 종목 화면을 막지 않도록 한다.

