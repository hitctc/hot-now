import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const scryptPrefix = "scrypt";
const defaultDerivedKeyLength = 64;

// This keeps password storage aligned with the existing seed format: scrypt$<salt>$<hex>.
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, defaultDerivedKeyLength).toString("hex");
  return `${scryptPrefix}$${salt}$${derivedKey}`;
}

// Login validation accepts the same seed format and safely rejects malformed or tampered hashes.
export function verifyPassword(password: string, storedHash: string): boolean {
  const [algorithm, salt, expectedHashHex, ...rest] = storedHash.split("$");

  if (algorithm !== scryptPrefix || !salt || !expectedHashHex || rest.length > 0 || !isEvenHex(expectedHashHex)) {
    return false;
  }

  const expectedHash = Buffer.from(expectedHashHex, "hex");

  if (expectedHash.length === 0) {
    return false;
  }

  try {
    const actualHash = scryptSync(password, salt, expectedHash.length);
    return timingSafeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

function isEvenHex(value: string): boolean {
  // A strict hex check avoids accidental partial decode from malformed hash payloads.
  return value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);
}
