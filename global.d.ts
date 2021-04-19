import { ApolloServer } from 'apollo-server';
import { Connection } from 'typeorm';

declare global {
  namespace NodeJS {
    interface Global {
      startDb: () => Promise<void>;
      startServer: () => Promise<void>;
      stopRedis: () => Promise<void>;
      db: Connection;
      server: ApolloServer;
      serverUrl: string;
    }
  }
}
