import { MarketQueryProvider } from "../../../src/ui/market/market-query-provider";
import { MarketScreenBff } from "../../../src/ui/market/market-screen-bff";
import { projectPublicServerEnvironment } from "../../../src/infrastructure/config/environment";
import { loadServerEnvironment } from "../../../src/infrastructure/config/server-environment";

export const dynamic = "force-dynamic";

export default function MarketPage() {
  const { allowLiveTossApi: liveReadEnabled } = projectPublicServerEnvironment(
    loadServerEnvironment(),
  );

  return (
    <MarketQueryProvider>
      <MarketScreenBff liveReadEnabled={liveReadEnabled} />
    </MarketQueryProvider>
  );
}
