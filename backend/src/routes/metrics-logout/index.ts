import { FastifyReply, FastifyRequest } from 'fastify';
import { getAppsDomain, signOutPage } from '../api/ceamls-logout/ceamlsLogoutUtils';
import { KubeFastifyInstance } from '../../types';

/**
 * CEAMLS single logout, public entry point: the URL both apps send the browser
 * to (this dashboard's "Log out" and the console's logoutRedirect alike).
 *
 * Why the odd path: oauth-proxy guards every path on this host except the one
 * it is told to skip, and that skip is `^/metrics` (set in the ODH operator's
 * manifests, not ours). A logout page has to be reachable by someone who is
 * NOT signed in here — a console user who never opened the dashboard has no
 * oauth-proxy cookie, and showing them a login page in the middle of logging
 * out is exactly the confusion this chain exists to remove. `/metrics-logout`
 * matches that prefix, so it is served without auth.
 *
 * The page then calls the authenticated /api/ceamls-logout from the browser,
 * where the cookie (if any) still applies. See `signOutPage` for the chain.
 *
 * If a future ODH release narrows the skip to `^/metrics$` this starts
 * returning oauth-proxy's login page; the check is one anonymous curl of this
 * path (guide 2.4).
 */
export default async (fastify: KubeFastifyInstance): Promise<void> => {
  fastify.get('/', async (request: FastifyRequest, reply: FastifyReply) =>
    reply
      .header('Cache-Control', 'no-store')
      .type('text/html; charset=utf-8')
      .send(signOutPage(getAppsDomain(request), { revokeFirst: true })),
  );
};
