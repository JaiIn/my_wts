import { SessionService } from "../../application/auth/session-service";
import { getRuntimeDatabase } from "../database/runtime-database";
import { SqliteSessionPersistence } from "./sqlite-session-persistence";

let runtimeSessionService: SessionService | undefined;

export function getRuntimeSessionService(): SessionService {
  if (!runtimeSessionService) {
    runtimeSessionService = new SessionService(
      new SqliteSessionPersistence(getRuntimeDatabase()),
    );
  }

  return runtimeSessionService;
}
