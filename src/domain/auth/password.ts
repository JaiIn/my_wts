import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./auth-constants";

const SCRYPT_N = 32_768;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const SCRYPT_SALT_BYTES = 16;
const SCRYPT_DERIVED_KEY_BYTES = 64;
const SCRYPT_MAX_MEMORY_BYTES = 64 * 1024 * 1024;
const SCRYPT_PREFIX = "scrypt$v1$N=32768,r=8,p=1";

export { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH };

type ParsedPasswordHash = {
  salt: Buffer;
  derivedKey: Buffer;
};

function hasValidPasswordLength(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH
  );
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      SCRYPT_DERIVED_KEY_BYTES,
      {
        N: SCRYPT_N,
        r: SCRYPT_R,
        p: SCRYPT_P,
        maxmem: SCRYPT_MAX_MEMORY_BYTES,
      },
      (error, derivedKey) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(derivedKey);
      },
    );
  });
}

function decodeBase64Url(value: string, expectedBytes: number): Buffer | null {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    return null;
  }

  const decoded = Buffer.from(value, "base64url");
  if (
    decoded.length !== expectedBytes ||
    decoded.toString("base64url") !== value
  ) {
    return null;
  }

  return decoded;
}

function parsePasswordHash(encodedHash: string): ParsedPasswordHash | null {
  const segments = encodedHash.split("$");
  if (
    segments.length !== 5 ||
    segments.slice(0, 3).join("$") !== SCRYPT_PREFIX
  ) {
    return null;
  }

  const salt = decodeBase64Url(segments[3], SCRYPT_SALT_BYTES);
  const derivedKey = decodeBase64Url(segments[4], SCRYPT_DERIVED_KEY_BYTES);

  if (!salt || !derivedKey) {
    return null;
  }

  return { salt, derivedKey };
}

export async function hashPassword(password: string): Promise<string> {
  if (!hasValidPasswordLength(password)) {
    throw new RangeError(
      `Password length must be between ${PASSWORD_MIN_LENGTH} and ${PASSWORD_MAX_LENGTH}.`,
    );
  }

  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const derivedKey = await deriveKey(password, salt);

  return `${SCRYPT_PREFIX}$${salt.toString("base64url")}$${derivedKey.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  if (!hasValidPasswordLength(password)) {
    return false;
  }

  const parsedHash = parsePasswordHash(encodedHash);
  if (!parsedHash) {
    return false;
  }

  try {
    const candidateKey = await deriveKey(password, parsedHash.salt);
    return timingSafeEqual(candidateKey, parsedHash.derivedKey);
  } catch {
    return false;
  }
}
