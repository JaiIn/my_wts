import "server-only";

import { parseServerEnvironment, type ServerEnvironment } from "./environment";

let cachedEnvironment: ServerEnvironment | undefined;

export function loadServerEnvironment(
  source?: Readonly<Record<string, string | undefined>>,
): ServerEnvironment {
  if (source) return parseServerEnvironment(source);
  cachedEnvironment ??= parseServerEnvironment(process.env);
  return cachedEnvironment;
}
