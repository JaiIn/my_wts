import { projectPublicServerEnvironment } from "../../../src/infrastructure/config/environment";
import { loadServerEnvironment } from "../../../src/infrastructure/config/server-environment";
import { MarketQueryProvider } from "../../../src/ui/market/market-query-provider";
import { OrderHistoryScreen } from "../../../src/ui/orders/order-history-screen";

export const dynamic = "force-dynamic";

export default function OrdersPage() {
  const { allowLiveTossApi: liveReadEnabled } = projectPublicServerEnvironment(
    loadServerEnvironment(),
  );
  return (
    <MarketQueryProvider>
      <OrderHistoryScreen liveReadEnabled={liveReadEnabled} />
    </MarketQueryProvider>
  );
}
