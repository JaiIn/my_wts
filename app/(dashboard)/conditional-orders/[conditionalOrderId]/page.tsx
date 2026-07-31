import { ConditionalOrderDetailScreen } from "../../../../src/ui/orders/conditional-order-detail-screen";
import { MarketQueryProvider } from "../../../../src/ui/market/market-query-provider";
import { projectPublicServerEnvironment } from "../../../../src/infrastructure/config/environment";
import { loadServerEnvironment } from "../../../../src/infrastructure/config/server-environment";

export const dynamic = "force-dynamic";

export default async function ConditionalOrderDetailPage({
  params,
}: Readonly<{
  params: Promise<Readonly<{ conditionalOrderId: string }>>;
}>) {
  const { conditionalOrderId } = await params;
  const { allowLiveTossApi: liveReadEnabled } = projectPublicServerEnvironment(
    loadServerEnvironment(),
  );
  return (
    <MarketQueryProvider>
      <ConditionalOrderDetailScreen
        conditionalOrderId={conditionalOrderId}
        liveReadEnabled={liveReadEnabled}
      />
    </MarketQueryProvider>
  );
}
