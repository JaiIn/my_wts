import { LogoutService } from "../../application/auth/logout-service";
import { getRuntimeDatabase } from "../database/runtime-database";
import { SqliteLogoutPersistence } from "./sqlite-logout-persistence";

let runtimeLogoutService: LogoutService | undefined;

export function getRuntimeLogoutService(): LogoutService {
  if (!runtimeLogoutService) {
    runtimeLogoutService = new LogoutService(
      new SqliteLogoutPersistence(getRuntimeDatabase()),
    );
  }

  return runtimeLogoutService;
}
