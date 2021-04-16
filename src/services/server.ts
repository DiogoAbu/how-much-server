import { ApolloServer } from 'apollo-server';
import { buildSchema } from 'type-graphql';

import resolvers from '!/resolvers';
import { getUserFromHeader } from '!/services/authentication';
import { authChecker } from '!/services/authorization';
import { Context } from '!/types';

import debug from './debug';
import sigkill from './sigkill';

const log = debug.extend('server');

export default async (): Promise<{ server: ApolloServer; url: string }> => {
  const schema = await buildSchema({
    resolvers: resolvers as never,
    authChecker,
    dateScalarMode: 'timestamp',
    nullableByDefault: true,
    validate: true,
  });

  // Create GraphQL server
  const server = new ApolloServer({
    schema,
    cors: true,
    debug: process.env.NODE_ENV !== 'production',
    context: async ({ req, connection }) => {
      let context: Context = {};
      // If using web socket
      if (connection) {
        context = connection.context;
      } else {
        const userId = await getUserFromHeader(req.headers);
        context = { userId };
      }
      return context;
    },
    subscriptions: {
      onConnect: async (connectionParams) => {
        let context: Context = {};
        if (connectionParams) {
          const userId = await getUserFromHeader(connectionParams as never);
          context = { userId };
        }
        return context;
      },
    },
  });

  // Shutdown gracefully
  sigkill(async () => await server.stop());

  // Start the server
  const { url, subscriptionsPath, subscriptionsUrl } = await server.listen(process.env.PORT);

  log('live on %s and %s', url.slice(0, url.length - 1) + subscriptionsPath, subscriptionsUrl);

  return { server, url };
};
