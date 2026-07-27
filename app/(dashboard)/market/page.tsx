import { loadMarketScreen } from "../../../src/application/market/market-screen";
import { createMockMarketService } from "../../../src/infrastructure/market/mock-market-service";
import { MarketScreen } from "../../../src/ui/market/market-screen";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const screenData = await loadMarketScreen(createMockMarketService());

  return <MarketScreen {...screenData} />;
}
