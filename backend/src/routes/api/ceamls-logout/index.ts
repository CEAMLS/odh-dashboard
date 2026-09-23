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
 * CEAMLS single logout: the one entry point both apps send the user to, from
 * this dashboard's "Log out" and from the console's logoutRedirect alike.
 *
 * It runs FIRST, while every session is still alive, because each step needs
 * the one before it to get in — a user who never opened the dashboard is
 * signed in here silently by the SSO session that is about to die:
 *
 *   1. revoke every OpenShift token the user holds (this app's AND the
 *      console's — that is the only way to sign the console out from here),
 *   2. expire this app's oauth-proxy cookie,
 *   3. hand the browser a page that ends the OAuth server's session and then
 *      the Keycloak SSO session, and stops there (see the util).
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
