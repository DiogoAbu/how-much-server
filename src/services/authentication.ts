import { ApolloError } from 'apollo-server';
import Redis from 'ioredis';
import { SymmetricKey, V2 as Protocol } from 'paseto.js';

import User from '!/entities/User';
import { AuthenticationPayload } from '!/types';

const { SECRET_KEY, REDIS_URL } = process.env;

const redis = new Redis(`${REDIS_URL!}/0`, { lazyConnect: true });

/**
 * Encrypt payload returning the token.
 */
export async function payloadToToken(user: Partial<User>, uniqueIdentifier: string): Promise<string> {
  try {
    await redis.connect();

    // Create key
    const key = new SymmetricKey(new Protocol());

    // Create and inject secret
    await key.base64(SECRET_KEY!);

    // Set token payload
    const payload: AuthenticationPayload = { id: user.id!, uniqueIdentifier };

    // Prepare payload
    const message = JSON.stringify(payload, null, 0);

    // Encrypt message returning the token
    const token = await key.protocol().encrypt(message, key);

    // Get stored tokens
    const tokens: string[] = JSON.parse((await redis.get(payload.id)) ?? '[]');

    // Add new token
    tokens.push(token);

    // Store updated tokens
    await redis.set(payload.id, JSON.stringify(tokens));

    return token;
  } finally {
    await redis.quit();
  }
}

/**
 * Decrypt token returning the payload.
 */
export async function tokenToPayload(token: string): Promise<AuthenticationPayload> {
  try {
    await redis.connect();

    // Create key
    const key = new SymmetricKey(new Protocol());

    // Create and inject secret
    await key.base64(SECRET_KEY!);

    // Decrypt token returning message
    const message = await key.protocol().decrypt(token, key);

    // Get token data
    const payload: AuthenticationPayload = JSON.parse(message);

    // Get stored tokens
    const tokens: string[] = JSON.parse((await redis.get(payload.id)) ?? '[]');

    // Check if token exists
    if (!tokens.includes(token)) {
      throw new ApolloError('Token is not valid', 'UNAUTHORIZED');
    }

    // Return payload
    return payload;
  } finally {
    await redis.quit();
  }
}

export async function destroyToken(userId: string, token?: string): Promise<void> {
  try {
    await redis.connect();

    if (!token) {
      // Remove all
      await redis.del(userId);
      return;
    }

    // Get stored tokens
    const tokens: string[] = JSON.parse((await redis.get(userId)) ?? '[]');

    // Remove token
    const index = tokens.findIndex((e) => e === token);
    tokens.splice(index, 1);

    if (!tokens.length) {
      // Remove all
      await redis.del(userId);
    } else {
      // Store updated tokens
      await redis.set(userId, JSON.stringify(tokens));
    }
  } finally {
    await redis.quit();
  }
}

/**
 * Find token from request header Bearer, then return related User.
 */
export async function getUserFromHeader(
  headers: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  // Check existence of header
  if (typeof headers?.authorization !== 'string') {
    return null;
  }

  // Check if header is correctly formed
  const parts = headers.authorization.split(' ');
  if (parts.length !== 2) {
    return null;
  }

  const [scheme, token] = parts;

  // Check scheme
  if (scheme.toLowerCase() !== 'bearer') {
    return null;
  }

  // Check token, with check for Insomnia variable
  if (!token || token === 'null') {
    return null;
  }

  try {
    // Get ID from token
    const { id: userId } = await tokenToPayload(token);

    return userId;
  } catch (err) {
    if (err instanceof ApolloError) {
      throw err;
    }
    return null;
  }
}
