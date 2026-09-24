import { FastifyReply, FastifyRequest } from 'fastify';
import { expireProxyCookies, revokeUserTokens } from './ceamlsLogoutUtils';
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
 * Called with fetch from /metrics-logout/oauth (the public chain page), never
 * navigated to, so it answers 204. It runs after Keycloak's SSO session has
 * ended, which does not stop it: this app's cookie carries its own token and
 * never asks Keycloak again, so a signed-in user still gets through the proxy.
 *
 * Every step is best effort: a logout must never dead-end on an error. It
 * answers to GET, which means another site could trigger a logout — that
 * costs a session, never grants one.
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
    return reply.header('Cache-Control', 'no-store').code(204).send();
  });
};
