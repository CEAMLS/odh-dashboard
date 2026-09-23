import { FastifyRequest } from 'fastify';
import { KubeFastifyInstance } from '../../../types';
import { errorHandler } from '../../../utils';

type OAuthAccessToken = {
  metadata: { name: string };
  userName: string;
};

/**
 * Every app the user signed into holds its own OpenShift OAuth access token
 * (this dashboard's oauth-proxy cookie, the console's session cookie, ...).
 * Ending the Keycloak SSO session does not touch them, so a single logout has
 * to delete them: an OAuthAccessToken is an API object, and deleting it kills
 * that app's session. Needs list/delete on oauthaccesstokens, which the
 * dashboard's service account gets from the CEAMLS cluster repo
 * (gitops/mlplatform/35-dashboard-sso-logout-rbac.yaml).
 *
 * Best effort by design: a failure here must not break the logout chain, so
 * the caller logs the count and carries on.
 */
export const revokeUserTokens = async (
  fastify: KubeFastifyInstance,
  userName: string,
): Promise<{ revoked: number; failed: number }> => {
  const response = await fastify.kube.customObjectsApi.listClusterCustomObject(
    'oauth.openshift.io',
    'v1',
    'oauthaccesstokens',
  );
  const tokens = (response.body as { items: OAuthAccessToken[] }).items.filter(
    (token) => token.userName === userName,
  );
  const results = await Promise.allSettled(
    tokens.map((token) =>
      fastify.kube.customObjectsApi.deleteClusterCustomObject(
        'oauth.openshift.io',
        'v1',
        'oauthaccesstokens',
        token.metadata.name,
      ),
    ),
  );
  results.forEach((result) => {
    if (result.status === 'rejected') {
      fastify.log.error(`CEAMLS logout: failed to revoke a token, ${errorHandler(result.reason)}`);
    }
  });
  return {
    revoked: results.filter((result) => result.status === 'fulfilled').length,
    failed: results.filter((result) => result.status === 'rejected').length,
  };
};

/**
 * The wildcard domain the cluster's routes live under ("apps.<cluster domain>"),
 * taken from the host this request came in on so that no cluster-specific
 * value has to be baked into the image.
 */
export const getAppsDomain = (request: FastifyRequest): string => {
  const forwardedHost = request.headers['x-forwarded-host'];
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || request.hostname;
  return host.split(':')[0].split('.').slice(1).join('.');
};

/** Expire this host's oauth-proxy session cookie (it chunks into _oauth_proxy_N). */
export const expireProxyCookies = (request: FastifyRequest): string[] => {
  const host = (request.headers['x-forwarded-host'] as string) || request.hostname;
  const domain = host.split(':')[0];
  const names = (request.headers.cookie ?? '')
    .split(';')
    .map((cookie) => cookie.split('=')[0].trim())
    .filter((name) => name.startsWith('_oauth_proxy'));
  return [...new Set(names.length ? names : ['_oauth_proxy'])].map(
    (name) =>
      `${name}=; Path=/; Domain=${domain}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure`,
  );
};

/**
 * The hops only the browser can make, because only the browser holds the
 * cookies they end.
 *
 * 1. (`revokeFirst`, the public page only) call this app's authenticated
 *    /api/ceamls-logout from here rather than sending the browser there, so
 *    that a user who never opened the dashboard — and therefore has no
 *    oauth-proxy cookie — is not shown a login page in the middle of logging
 *    out. Signed in, it revokes every token and expires the cookie; signed
 *    out, it 403s and there was nothing to revoke either way.
 * 2. The OpenShift OAuth server keeps its own short-lived session cookie, and
 *    while it lives it hands out fresh tokens with no password. Its logout
 *    endpoint only accepts a relative "then", so it cannot redirect onward to
 *    Keycloak — the POST goes out as a background fetch instead and we keep
 *    control of where the browser goes next.
 * 3. Keycloak ends the SSO session, and it goes LAST: everything before it
 *    needs a live session to reach, and nothing after it can silently sign
 *    the user back in.
 *
 * We deliberately do NOT redirect to an app at the end. Landing on the console
 * makes it start a fresh login, so a logout that worked looks like one that
 * failed. Keycloak's own "You are logged out" page is the end of the road.
 */
export const signOutPage = (appsDomain: string, { revokeFirst = false } = {}): string => {
  const oauthLogout = `https://oauth-openshift.${appsDomain}/logout`;
  const ssoLogout =
    `https://keycloak.${appsDomain}/realms/ceamls/protocol/openid-connect/logout` +
    '?client_id=openshift';
  // Same origin, so these two are plain relative fetches. /oauth/sign_out is
  // oauth-proxy's own and clears the cookie whether or not one was sent.
  const revokeStep = revokeFirst
    ? `fetch('/api/ceamls-logout', { credentials: 'same-origin' })
            .catch(nothing)
            .then(function () {
              return fetch('/oauth/sign_out', { credentials: 'same-origin' }).catch(nothing);
            })
            .then(post, post)`
    : 'post()';
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Signing out</title>
    <meta name="robots" content="noindex" />
  </head>
  <body style="font-family: sans-serif; text-align: center; margin-top: 4rem">
    <p>Signing you out&hellip;</p>
    <p><a id="sso-logout" href="${ssoLogout}">Finish signing out</a></p>
    <noscript>
      <form method="POST" action="${oauthLogout}">
        <input type="hidden" name="then" value="/" />
        <button type="submit">End the OpenShift session</button>
      </form>
      <p>Then use the link above to end the single sign-on session.</p>
    </noscript>
    <script>
      (function () {
        var next = document.getElementById('sso-logout').href;
        var done = false;
        var go = function () {
          if (done) return;
          done = true;
          window.location.replace(next);
        };
        var nothing = function () {};
        var post = function () {
          return fetch('${oauthLogout}', {
            method: 'POST',
            mode: 'no-cors',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'then=%2F',
          });
        };
        try {
          ${revokeStep}.then(go, go);
          window.setTimeout(go, 6000);
        } catch (e) {
          go();
        }
      })();
    </script>
  </body>
</html>
`;
};
