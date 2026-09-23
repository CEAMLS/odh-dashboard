import { FastifyReply, FastifyRequest } from 'fastify';
import {
  expireProxyCookies,
  getAppsDomain,
  revokeUserTokens,
  signOutPage,
} from './ceamlsLogoutUtils';
import { KubeFastifyInstance } from '../../../types';
import { getUserInfo } from '../../../utils/userUtils';
import { errorHandler } from '../../../utils';

/**
 * CEAMLS single logout, the part that needs the user's identity:
 *
 *   1. revoke every OpenShift token the user holds (this app's AND the
 *      console's — that is the only way to sign the console out from here),
 *   2. expire this app's oauth-proxy cookie.
 *
 * It runs FIRST in the chain, while every session is still alive, because
 * each later step needs the one before it to get in. The browser does not
 * come here directly any more: /metrics-logout is the entry point and calls
 * this with fetch, so that a console user with no session here is never shown
 * a login page mid-logout. Opened directly it still works on its own.
 *
 * Every step is best effort: a logout must never dead-end on an error page.
 * It answers to GET because a redirect chain cannot POST, which means another
 * site could trigger a logout — that costs a session, never grants one.
 */
export default async (fastify: KubeFastifyInstance): Promise<void> => {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userName } = await getUserInfo(fastify, request);
      const { revoked, failed } = await revokeUserTokens(fastify, userName);
      fastify.log.info(`CEAMLS logout: revoked ${revoked} token(s) (${failed} failed)`);
    } catch (e) {
      // No token header, an expired session, missing RBAC: sign out anyway.
      fastify.log.error(`CEAMLS logout: could not revoke tokens, ${errorHandler(e)}`);
    }

    expireProxyCookies(request).forEach((cookie) => reply.header('set-cookie', cookie));
    return reply
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(signOutPage(getAppsDomain(request)));
  });
};
