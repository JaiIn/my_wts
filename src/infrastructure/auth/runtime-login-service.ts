import { LoginService } from "../../application/auth/login-service";
import { getRuntimeDatabase } from "../database/runtime-database";
import { SqliteLoginPersistence } from "./sqlite-login-persistence";

let runtimeLoginService: LoginService | undefined;

export function getRuntimeLoginService(): LoginService {
  if (!runtimeLoginService) {
    runtimeLoginService = new LoginService(
      new SqliteLoginPersistence(getRuntimeDatabase()),
    );
  }

  return runtimeLoginService;
}
