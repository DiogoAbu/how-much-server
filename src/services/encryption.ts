import * as bcrypt from 'bcrypt';

import clamp from '!/utils/clamp';

// Available encryptors
export enum Encryptors {
  'bcrypt' = 'bcrypt',
}

// Set encryptor
export const CURRENT_ENCRYPTOR = Encryptors.bcrypt;
// Set salt rounds
export const CURRENT_ROUNDS = 12;

// Length to store and retrieve from password string
const encryptorLength = 4;
const roundsLength = 2;

export type HashPassArgs = {
  encryptor?: Encryptors;
  rounds?: number;
  plain: string;
};

/**
 * Encrypt plain password using chosen encryption, stores encryption identifier
 * alongside the password.
 */
export async function hashPass({ encryptor, rounds, plain }: HashPassArgs): Promise<string> {
  // Decide between chosen encrytor or default one
  const finalEncryptor = encryptor || CURRENT_ENCRYPTOR;

  // Se max and min for rouds
  const finalRounds = clamp(rounds || CURRENT_ROUNDS, 10, 99);

  let hashed = '';
  switch (finalEncryptor) {
    default:
      hashed = await bcrypt.hash(plain, finalRounds);
      break;
  }

  // encryptor+rounds+pass => bcry10hashedpassword
  return `${finalEncryptor.slice(0, encryptorLength)}${CURRENT_ROUNDS.toString()}${hashed}`;
}

export type ComparePassArgs = {
  plain: string;
  hashed: string;
};

/**
 * Compare plain password with hashed one, using encryption stored in the latter.
 */
export async function comparePass({ plain, hashed }: ComparePassArgs): Promise<boolean> {
  // Get first part
  const encryptor = hashed.slice(0, encryptorLength);

  // Get from encryptor length until the end
  const hash = hashed.slice(encryptorLength + roundsLength);

  switch (encryptor) {
    default:
      return await bcrypt.compare(plain, hash);
  }
}
