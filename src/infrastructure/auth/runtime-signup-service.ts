import { SignupService } from "../../application/auth/signup-service";
import { getRuntimeDatabase } from "../database/runtime-database";
import { SqliteSignupPersistence } from "./sqlite-signup-persistence";

let runtimeSignupService: SignupService | undefined;

export function getRuntimeSignupService(): SignupService {
  if (!runtimeSignupService) {
    runtimeSignupService = new SignupService(
      new SqliteSignupPersistence(getRuntimeDatabase()),
    );
  }

  return runtimeSignupService;
}
