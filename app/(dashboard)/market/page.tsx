import {
  failedMarketScreen,
  loadMarketScreen,
} from "../../../src/application/market/market-screen";
import { createMockMarketService } from "../../../src/infrastructure/market/mock-market-service";
import { MarketScreen } from "../../../src/ui/market/market-screen";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  let screenData;
  try {
    screenData = await loadMarketScreen(createMockMarketService());
  } catch (error) {
    screenData = failedMarketScreen(error);
  }

  return <MarketScreen {...screenData} />;
}
