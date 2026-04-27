import { createHmac, timingSafeEqual } from "node:crypto";

export const sessionCookieName = "hot_now_session";

export const defaultSessionMaxAgeSeconds = 60 * 60 * 24 * 7;

export type SessionUser = {
  username: string;
  displayName: string;
  role: string;
};

type SessionPayload = SessionUser & {
  issuedAt: number;
  expiresAt: number;
};

type SessionOptions = {
  now?: () => number;
  maxAgeSeconds?: number;
};

type SessionCookieOptions = {
  secure?: boolean;
  maxAgeSeconds?: number;
  path?: string;
};

// The token is a compact payload + HMAC signature so the server can reject tampering without DB roundtrips.
export function createSessionToken(user: SessionUser, secret: string, options: SessionOptions = {}): string {
  const issuedAt = resolveNowSeconds(options.now);
  const maxAgeSeconds = options.maxAgeSeconds ?? defaultSessionMaxAgeSeconds;
  const payload: SessionPayload = {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    issuedAt,
    expiresAt: issuedAt + maxAgeSeconds
  };
  const encodedPayload = encodeBase64Url(JSON.stringify(payload));
  const signature = sign(encodedPayload, secret);
  return `${encodedPayload}.${signature}`;
}

// A token is only valid when signature and expiry checks both pass.
export function readSessionToken(
  token: string | null | undefined,
  secret: string,
  options: SessionOptions = {}
): SessionPayload | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [encodedPayload, signature] = parts;
  const expectedSignature = sign(encodedPayload, secret);

  if (!safeEquals(signature, expectedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(decodeBase64Url(encodedPayload)) as Partial<SessionPayload>;

    if (
      typeof payload.username !== "string" ||
      typeof payload.displayName !== "string" ||
      typeof payload.role !== "string" ||
      typeof payload.issuedAt !== "number" ||
      typeof payload.expiresAt !== "number"
    ) {
      return null;
    }

    const nowSeconds = resolveNowSeconds(options.now);

    if (payload.expiresAt <= nowSeconds) {
      return null;
    }

    return {
      username: payload.username,
      displayName: payload.displayName,
      role: payload.role,
      issuedAt: payload.issuedAt,
      expiresAt: payload.expiresAt
    };
  } catch {
    return null;
  }
}

// Cookie serialization is centralized so login/logout responses stay consistent.
export function serializeSessionCookie(token: string, options: SessionCookieOptions = {}): string {
  const attributes = [
    `${sessionCookieName}=${token}`,
    `Path=${options.path ?? "/"}`,
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${options.maxAgeSeconds ?? defaultSessionMaxAgeSeconds}`
  ];

  if (options.secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function serializeClearedSessionCookie(options: SessionCookieOptions = {}): string {
  const attributes = [
    `${sessionCookieName}=`,
    `Path=${options.path ?? "/"}`,
    "HttpOnly",
    "SameSite=Lax",
    "Max-Age=0"
  ];

  if (options.secure) {
    attributes.push("Secure");
  }

  return attributes.join("; ");
}

export function readSessionCookieToken(cookieHeader: string | undefined): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const cookiePart of cookieHeader.split(";")) {
    const [name, ...rawValueParts] = cookiePart.trim().split("=");

    if (name !== sessionCookieName) {
      continue;
    }

    const value = rawValueParts.join("=");
    return value.length > 0 ? value : null;
  }

  return null;
}

function sign(payload: string, secret: string): string {
  // HMAC keeps token verification stateless while still detecting payload edits.
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function safeEquals(left: string, right: string): boolean {
  // Constant-time comparison avoids leaking signature checks through timing differences.
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

function resolveNowSeconds(now?: () => number): number {
  // Tests may inject second-based clocks while runtime uses Date.now() milliseconds.
  const raw = now ? now() : Date.now();
  return raw > 10_000_000_000 ? Math.floor(raw / 1000) : Math.floor(raw);
}

function encodeBase64Url(value: string): string {
  // URL-safe base64 keeps cookie tokens compact and avoids extra escaping.
  return Buffer.from(value, "utf8").toString("base64url");
}

function decodeBase64Url(value: string): string {
  // Decoding is isolated to one helper so token parsing has one failure boundary.
  return Buffer.from(value, "base64url").toString("utf8");
}
