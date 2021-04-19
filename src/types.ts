export type ValueOf<T> = T[keyof T];

export interface TokenPayload {
  userId: string;
  deviceName: string;
  isShortLived: boolean;
  expirationDate?: number;
}

export interface TokenRedisRow {
  token: string;
  deviceName: string;
  lastAccessAt: number;
  createdAt: number;
}

export type Context = Partial<TokenPayload>;
