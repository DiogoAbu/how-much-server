import { AuthChecker } from 'type-graphql';

import { Context } from '../types';

/**
 * Check if user is signed-in, then check if has permission for the actions and resource passed.
 */
// eslint-disable-next-line @typescript-eslint/require-await
export const authChecker: AuthChecker<Context, string> = async ({ context: { userId } }) => {
  return !!userId;
};
