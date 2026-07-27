import { SessionService } from "../../application/auth/session-service";
import { getRuntimeDatabase } from "../database/runtime-database";
import { SessionMaintenance } from "./session-maintenance";
import { SqliteSessionPersistence } from "./sqlite-session-persistence";

let runtimeSessionService: SessionService | undefined;
let sessionMaintenance: SessionMaintenance | undefined;

export function getRuntimeSessionService(): SessionService {
  if (!runtimeSessionService) {
    const database = getRuntimeDatabase();
    runtimeSessionService = new SessionService(
      new SqliteSessionPersistence(database),
    );
    sessionMaintenance = new SessionMaintenance(database);
    sessionMaintenance.run(new Date());
  }

  return runtimeSessionService;
}

export function authenticateRuntimeSession(token: unknown) {
  const service = getRuntimeSessionService();
  sessionMaintenance?.run(new Date());
  return service.authenticate(token);
}
