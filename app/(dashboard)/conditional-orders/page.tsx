import { ConditionalOrderHistoryScreen } from "../../../src/ui/orders/conditional-order-history-screen";
import { MarketQueryProvider } from "../../../src/ui/market/market-query-provider";
import { projectPublicServerEnvironment } from "../../../src/infrastructure/config/environment";
import { loadServerEnvironment } from "../../../src/infrastructure/config/server-environment";

export const dynamic = "force-dynamic";

export default function ConditionalOrdersPage() {
  const { allowLiveTossApi: liveReadEnabled } = projectPublicServerEnvironment(
    loadServerEnvironment(),
  );
  return (
    <MarketQueryProvider>
      <ConditionalOrderHistoryScreen liveReadEnabled={liveReadEnabled} />
    </MarketQueryProvider>
  );
}
