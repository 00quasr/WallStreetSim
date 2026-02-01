import { createHash, createHmac, randomBytes } from 'crypto';

/**
 * Generate a random API key
 */
export function generateApiKey(): string {
  const prefix = 'wss';
  const key = randomBytes(24).toString('base64url');
  return `${prefix}_${key}`;
}

/**
 * Generate a signed API key with HMAC signature
 */
export function generateSignedApiKey(agentId: string, secret: string): string {
  const prefix = 'wss';
  const key = randomBytes(16).toString('base64url');
  const signature = createHmac('sha256', secret)
    .update(`${agentId}:${key}`)
    .digest('hex')
    .substring(0, 16);
  return `${prefix}_${key}.${signature}`;
}

/**
 * Verify a signed API key
 */
export function verifyApiKey(apiKey: string, agentId: string, secret: string): boolean {
  const parts = apiKey.split('.');
  if (parts.length !== 2) return false;

  const [keyPart, signature] = parts;
  const key = keyPart.replace('wss_', '');

  const expectedSignature = createHmac('sha256', secret)
    .update(`${agentId}:${key}`)
    .digest('hex')
    .substring(0, 16);

  return signature === expectedSignature;
}

/**
 * Hash an API key for storage (one-way)
 */
export function hashApiKey(apiKey: string): string {
  return createHash('sha256').update(apiKey).digest('hex');
}

/**
 * Generate a random UUID v4
 */
export function generateUUID(): string {
  const bytes = randomBytes(16);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = bytes.toString('hex');
  return [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32),
  ].join('-');
}

/**
 * Generate a short ID for events, trades, etc.
 */
export function generateShortId(prefix: string = ''): string {
  const id = randomBytes(8).toString('base64url');
  return prefix ? `${prefix}_${id}` : id;
}

/**
 * Generate a deterministic hash for caching
 */
export function generateHash(...values: (string | number)[]): string {
  return createHash('md5')
    .update(values.join(':'))
    .digest('hex')
    .substring(0, 12);
}

/**
 * Session token payload structure
 */
export interface SessionTokenPayload {
  sub: string; // agentId
  name: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Create a session token (JWT-like structure using HMAC)
 */
export function createSessionToken(
  agentId: string,
  name: string,
  role: string,
  secret: string,
  expiresInSeconds: number = 86400 // 24 hours default
): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionTokenPayload = {
    sub: agentId,
    name,
    role,
    iat: now,
    exp: now + expiresInSeconds,
  };

  const header = { alg: 'HS256', typ: 'JWT' };
  const headerB64 = Buffer.from(JSON.stringify(header)).toString('base64url');
  const payloadB64 = Buffer.from(JSON.stringify(payload)).toString('base64url');

  const signature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify and decode a session token
 * Returns null if invalid or expired
 */
export function verifySessionToken(
  token: string,
  secret: string
): SessionTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [headerB64, payloadB64, signature] = parts;

  // Verify signature
  const expectedSignature = createHmac('sha256', secret)
    .update(`${headerB64}.${payloadB64}`)
    .digest('base64url');

  if (signature !== expectedSignature) return null;

  // Decode and parse payload
  try {
    const payload = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf-8')
    ) as SessionTokenPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) return null;

    return payload;
  } catch {
    return null;
  }
}
