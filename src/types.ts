export type ValueOf<T> = T[keyof T];

export interface AuthenticationPayload {
  id: string;
  uniqueIdentifier: string;
}

export type Context = {
  userId?: string | null;
};
