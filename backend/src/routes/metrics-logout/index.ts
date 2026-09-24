import { FastifyReply, FastifyRequest } from 'fastify';
import {
  getAppsDomain,
  getHost,
  oauthLogoutPage,
  ssoLogoutUrl,
} from '../api/ceamls-logout/ceamlsLogoutUtils';
import { KubeFastifyInstance } from '../../types';

/**
 * CEAMLS single logout, public entry point: the URL both apps send the browser
 * to (this dashboard's "Log out" and the console's logoutRedirect alike).
 *
 *   /metrics-logout        → Keycloak logout (SSO session ends), which returns to
 *   /metrics-logout/oauth  → revoke every token, clear this app's cookie, then a
 *                            form POST ends the OAuth server session and lands
 *                            on the console's sign-in page.
 *
 * Every hop that touches another host's cookies is a top-level navigation —
 * never a background request — so that it behaves the same in every browser
 * and with the cluster's self-signed certificates. See the util for the order.
 *
 * Why the odd path: oauth-proxy guards every path on this host except the one
 * it is told to skip, and that skip is `^/metrics` (set in the ODH operator's
 * manifests, not ours). These pages must be reachable by someone who is NOT
 * signed in here — a console user who never opened the dashboard has no
 * oauth-proxy cookie, and showing them a login page in the middle of logging
 * out is exactly the confusion this chain exists to remove.
 *
 * If a future ODH release narrows the skip to `^/metrics$` these start
 * returning oauth-proxy's login page; the check is one anonymous curl of
 * either path (guide 2.4).
 */
export default async (fastify: KubeFastifyInstance): Promise<void> => {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) =>
    reply
      .header('Cache-Control', 'no-store')
      .redirect(ssoLogoutUrl(getAppsDomain(request), getHost(request))),
  );

  fastify.get('/oauth', async (request: FastifyRequest, reply: FastifyReply) =>
    reply
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(oauthLogoutPage(getAppsDomain(request))),
  );
};
