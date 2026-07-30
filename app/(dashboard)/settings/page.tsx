import { projectPublicServerEnvironment } from "../../../src/infrastructure/config/environment";
import { loadServerEnvironment } from "../../../src/infrastructure/config/server-environment";
import { AccountSettingsPanel } from "../../../src/ui/account/account-settings-panel";
import { MarketQueryProvider } from "../../../src/ui/market/market-query-provider";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  const { allowLiveTossApi: liveReadEnabled } = projectPublicServerEnvironment(
    loadServerEnvironment(),
  );
  return (
    <MarketQueryProvider>
      <AccountSettingsPanel liveReadEnabled={liveReadEnabled} />
    </MarketQueryProvider>
  );
}
