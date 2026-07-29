import { MarketQueryProvider } from "../../../src/ui/market/market-query-provider";
import { MarketScreenBff } from "../../../src/ui/market/market-screen-bff";

export const dynamic = "force-dynamic";

export default function MarketPage() {
  return (
    <MarketQueryProvider>
      <MarketScreenBff />
    </MarketQueryProvider>
  );
}
