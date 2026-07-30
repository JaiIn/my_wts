import { MarketQueryProvider } from "../../../src/ui/market/market-query-provider";
import { PortfolioPanel } from "../../../src/ui/account/portfolio-panel";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  return (
    <MarketQueryProvider>
      <PortfolioPanel />
    </MarketQueryProvider>
  );
}
