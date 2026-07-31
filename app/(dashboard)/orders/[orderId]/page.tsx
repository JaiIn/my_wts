import { projectPublicServerEnvironment } from "../../../../src/infrastructure/config/environment";
import { loadServerEnvironment } from "../../../../src/infrastructure/config/server-environment";
import { MarketQueryProvider } from "../../../../src/ui/market/market-query-provider";
import { OrderDetailScreen } from "../../../../src/ui/orders/order-detail-screen";

export const dynamic = "force-dynamic";

export default async function OrderDetailPage({
  params,
}: Readonly<{ params: Promise<{ orderId: string }> }>) {
  const { orderId } = await params;
  const { allowLiveTossApi: liveReadEnabled } = projectPublicServerEnvironment(
    loadServerEnvironment(),
  );
  return (
    <MarketQueryProvider>
      <OrderDetailScreen orderId={orderId} liveReadEnabled={liveReadEnabled} />
    </MarketQueryProvider>
  );
}
