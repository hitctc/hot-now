import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const encryptionVersion = "v1";
const derivedKeyLength = 32;
const saltByteLength = 16;
const ivByteLength = 12;

export function encryptProviderSecret(secret: string, masterKey: string): string {
  // The encrypted payload is self-contained so SQLite only stores opaque text while runtime can
  // still re-derive the right key from the current master key on demand.
  const salt = randomBytes(saltByteLength);
  const iv = randomBytes(ivByteLength);
  const key = scryptSync(masterKey, salt, derivedKeyLength);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [encryptionVersion, salt.toString("hex"), iv.toString("hex"), authTag.toString("hex"), ciphertext.toString("hex")].join(
    "$"
  );
}

export function decryptProviderSecret(payload: string, masterKey: string): string {
  const [version, saltHex, ivHex, authTagHex, ciphertextHex, ...rest] = payload.split("$");

  if (
    version !== encryptionVersion ||
    !saltHex ||
    !ivHex ||
    !authTagHex ||
    !ciphertextHex ||
    rest.length > 0 ||
    !isEvenHex(saltHex) ||
    !isEvenHex(ivHex) ||
    !isEvenHex(authTagHex) ||
    !isEvenHex(ciphertextHex)
  ) {
    throw new Error("invalid encrypted provider secret");
  }

  try {
    const key = scryptSync(masterKey, Buffer.from(saltHex, "hex"), derivedKeyLength);
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivHex, "hex"));

    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));

    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, "hex")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new Error("failed to decrypt provider secret");
  }
}

function isEvenHex(value: string): boolean {
  return value.length % 2 === 0 && /^[0-9a-fA-F]+$/.test(value);
}
