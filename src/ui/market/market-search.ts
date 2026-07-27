import type { MarketStockView } from "../../application/market/market-screen";

function normalizeSearchText(value: string): string {
  return value.trim().toUpperCase();
}

export function searchMarketStocks(
  stocks: readonly MarketStockView[],
  rawQuery: string,
): MarketStockView[] {
  const query = normalizeSearchText(rawQuery);
  if (query.length < 2) {
    return [];
  }

  const seen = new Set<string>();
  return stocks
    .map((stock, index) => ({
      stock,
      index,
      exactSymbol: stock.symbol.toUpperCase() === query,
    }))
    .filter(({ stock }) => {
      const searchable = [
        stock.symbol,
        stock.displayName,
        stock.englishName,
        stock.market,
      ];
      return searchable.some((value) =>
        normalizeSearchText(value).includes(query),
      );
    })
    .sort((left, right) => {
      if (left.exactSymbol !== right.exactSymbol) {
        return left.exactSymbol ? -1 : 1;
      }
      return left.index - right.index;
    })
    .flatMap(({ stock }) => {
      if (seen.has(stock.symbol)) {
        return [];
      }
      seen.add(stock.symbol);
      return [{ ...stock }];
    });
}
