import { SymmetricKey, V2 as Protocol } from 'paseto.js';

import User from '!/entities/User';
import { AuthenticationPayload } from '!/types';

const SECRET_KEY = process.env.SECRET_KEY!;

/**
 * Encrypt payload returning the token.
 */
export async function payloadToToken(user: Partial<User>): Promise<string> {
  // Create key
  const key = new SymmetricKey(new Protocol());

  // Create and inject secret
  await key.base64(SECRET_KEY);

  // Set token payload
  const payload: AuthenticationPayload = { id: user.id! };

  // Prepare payload
  const message = JSON.stringify(payload, null, 0);

  // Encrypt message returning the token
  return await key.protocol().encrypt(message, key);
}

/**
 * Decrypt token returning the payload.
 */
export async function tokenToPayload(token: string): Promise<AuthenticationPayload> {
  // Create key
  const key = new SymmetricKey(new Protocol());

  // Create and inject secret
  await key.base64(SECRET_KEY);

  // Decrypt token returning message
  const message = await key.protocol().decrypt(token, key);

  // Get token data
  const payload: AuthenticationPayload = JSON.parse(message);

  // Return payload
  return payload;
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
  } catch {
    return null;
  }
}
