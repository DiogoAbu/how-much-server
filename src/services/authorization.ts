import { ApolloError } from 'apollo-server';
import { AuthChecker } from 'type-graphql';

import { ALLOW_SHORT_LIVED_TOKEN } from '!/constants';

import { Context } from '../types';

/**
 * Check if user is signed-in, then check if has permission for the actions and resource passed.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export const authChecker: AuthChecker<Context, string> = async ({ context }, roles) => {
  const { userId, isShortLived } = context;

  if (!userId) {
    throw new ApolloError('User is invalid', 'UNAUTHORIZED');
  }

  if (isShortLived && !roles.includes(ALLOW_SHORT_LIVED_TOKEN)) {
    throw new ApolloError('Token is invalid', 'UNAUTHORIZED');
  }

  return true;
};
