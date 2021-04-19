import { ApolloError } from 'apollo-server';
import { SymmetricKey, V2 as Protocol } from 'paseto.js';

import User from '!/entities/User';
import { Context, TokenPayload, TokenRedisRow } from '!/types';

import { tokenRedis } from './redis';

const { TOKEN_SECRET_KEY, SHORT_LIVED_TOKEN_MINUTES } = process.env;
const TOKEN_MINUTES = parseInt(SHORT_LIVED_TOKEN_MINUTES!, 10) || 10;

/**
 * Encrypt payload returning the token.
 */
export async function payloadToToken(
  user: Partial<User>,
  deviceName: string,
  isShortLived?: boolean,
): Promise<string> {
  // Check if token should be short lived
  let expirationDate;
  if (isShortLived) {
    // Get date and add expiration days
    const date = new Date();
    date.setMinutes(date.getMinutes() + TOKEN_MINUTES);
    expirationDate = date.getTime();
  }

  // Create key
  const key = new SymmetricKey(new Protocol());

  // Create and inject secret
  await key.base64(TOKEN_SECRET_KEY!);

  // Set token payload
  const payload: TokenPayload = {
    userId: user.id!,
    deviceName,
    expirationDate,
    isShortLived: !!isShortLived,
  };

  // Prepare payload
  const message = JSON.stringify(payload, null, 0);

  // Encrypt message returning the token
  const token = await key.protocol().encrypt(message, key);

  // If token is short lived we do not store it
  if (expirationDate) {
    return token;
  }

  // Get stored tokens
  const tokens: TokenRedisRow[] = JSON.parse((await tokenRedis.get(payload.userId)) ?? '[]');

  const now = Date.now();

  let found = false;
  // Add token and update last access
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].token === token) {
      tokens[i].lastAccessAt = now;
      found = true;
      break;
    }
  }

  if (!found) {
    tokens.push({ token, deviceName, createdAt: now, lastAccessAt: now });
  }

  // Store updated tokens
  await tokenRedis.set(payload.userId, JSON.stringify(tokens));

  return token;
}

/**
 * Decrypt token returning the payload.
 */
export async function tokenToPayload(token: string): Promise<TokenPayload> {
  // Create key
  const key = new SymmetricKey(new Protocol());

  // Create and inject secret
  await key.base64(TOKEN_SECRET_KEY!);

  // Decrypt token returning message
  const message = await key.protocol().decrypt(token, key);

  // Get token data
  const payload: TokenPayload = JSON.parse(message);

  // Check if token is short lived
  if (payload.expirationDate) {
    const now = Date.now();
    // If today is greater than the expiration date
    if (now > payload.expirationDate) {
      throw new ApolloError('Token is invalid', 'UNAUTHORIZED');
    } else {
      // If token is short lived we do not check on redis
      return payload;
    }
  }

  // Get stored tokens
  const tokens: TokenRedisRow[] = JSON.parse((await tokenRedis.get(payload.userId)) ?? '[]');

  // Check if token exists
  if (tokens.find((e) => e.token === token)) {
    // Return payload
    return payload;
  }

  throw new ApolloError('Token is invalid', 'UNAUTHORIZED');
}

/**
 * Destroy token of user.
 */
export async function destroyToken(userId: string, token?: string): Promise<void> {
  if (!token) {
    // Remove all
    await tokenRedis.del(userId);
    return;
  }

  // Get stored tokens
  const tokens: TokenRedisRow[] = JSON.parse((await tokenRedis.get(userId)) ?? '[]');

  // Remove token
  const index = tokens.findIndex((e) => e.token === token);
  tokens.splice(index, 1);

  if (!tokens.length) {
    // Remove all
    await tokenRedis.del(userId);
  } else {
    // Store updated tokens
    await tokenRedis.set(userId, JSON.stringify(tokens));
  }
}

/**
 * Find token from request header Bearer, then return related User.
 */
export async function getPayloadFromHeaderToken(
  headers: Record<string, string | string[] | undefined>,
): Promise<Context> {
  // Check existence of header
  if (typeof headers?.authorization !== 'string') {
    return {};
  }

  // Check if header is correctly formed
  const parts = headers.authorization.split(' ');
  if (parts.length !== 2) {
    return {};
  }

  const [scheme, token] = parts;

  // Check scheme
  if (scheme.toLowerCase() !== 'bearer') {
    return {};
  }

  // Check token, with check for Insomnia variable
  if (!token || token === 'null') {
    return {};
  }

  try {
    // Get payload from token
    return await tokenToPayload(token);
  } catch (err) {
    if (err instanceof ApolloError) {
      throw err;
    }
    return {};
  }
}
