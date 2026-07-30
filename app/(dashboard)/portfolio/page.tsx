import { projectPublicServerEnvironment } from "../../../src/infrastructure/config/environment";
import { loadServerEnvironment } from "../../../src/infrastructure/config/server-environment";
import { MarketQueryProvider } from "../../../src/ui/market/market-query-provider";
import { PortfolioPanel } from "../../../src/ui/account/portfolio-panel";

export const dynamic = "force-dynamic";

export default function PortfolioPage() {
  const { allowLiveTossApi: liveReadEnabled } = projectPublicServerEnvironment(
    loadServerEnvironment(),
  );
  return (
    <MarketQueryProvider>
      <PortfolioPanel liveReadEnabled={liveReadEnabled} />
    </MarketQueryProvider>
  );
}
