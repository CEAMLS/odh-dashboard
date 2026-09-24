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

/** The host this request came in on (the route's, not the pod's). */
export const getHost = (request: FastifyRequest): string => {
  const forwardedHost = request.headers['x-forwarded-host'];
  const host =
    (Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost) || request.hostname;
  return host.split(':')[0];
};

/**
 * The wildcard domain the cluster's routes live under ("apps.<cluster domain>"),
 * taken from the host this request came in on so that no cluster-specific
 * value has to be baked into the image.
 */
export const getAppsDomain = (request: FastifyRequest): string =>
  getHost(request).split('.').slice(1).join('.');

/** Expire this host's oauth-proxy session cookie (it chunks into _oauth_proxy_N). */
export const expireProxyCookies = (request: FastifyRequest): string[] => {
  const domain = getHost(request);
  const names = (request.headers.cookie ?? '')
    .split(';')
    .map((cookie) => cookie.split('=')[0].trim())
    .filter((name) => name.startsWith('_oauth_proxy'));
  return [...new Set(names.length ? names : ['_oauth_proxy'])].map(
    (name) =>
      `${name}=; Path=/; Domain=${domain}; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure`,
  );
};

/** Where Keycloak sends the browser once its SSO session is gone: step 2. */
export const AFTER_SSO_PATH = '/metrics-logout/oauth';

/**
 * Step 1: end the Keycloak SSO session first, then come back here.
 *
 * Keycloak goes first because it is the only hop that can hand the browser
 * onward to a page of ours: the OAuth server's logout accepts only a relative
 * or console "then", so whatever runs after it must be the last thing. The
 * return URL must be listed on the realm's `openshift` client
 * (ceamls_ai_cluster gitops/keycloak/60-realm.yaml). No id_token_hint is
 * obtainable (only the OAuth server holds Keycloak's ID token), so Keycloak
 * shows its one-click "Do you want to log out?" first — spec behaviour.
 */
export const ssoLogoutUrl = (appsDomain: string, host: string): string =>
  `https://keycloak.${appsDomain}/realms/ceamls/protocol/openid-connect/logout` +
  `?client_id=openshift&post_logout_redirect_uri=${encodeURIComponent(
    `https://${host}${AFTER_SSO_PATH}`,
  )}`;

/**
 * Step 2, after Keycloak: revoke, clear, and end the OAuth server session.
 *
 * 1. Best effort, a background POST to the OAuth server's logout — so that a
 *    console tab which notices its token is gone cannot silently sign back in
 *    through that session in the second before step 4 lands.
 * 2. /api/ceamls-logout (same origin): revoke every token the user holds —
 *    this is what signs the console out from here — and expire this app's
 *    cookie. Signed out here already, it 403s and there was nothing to revoke.
 * 3. /oauth/sign_out, oauth-proxy's own cookie clear, belt and braces.
 * 4. The real end of the OAuth server session: a top-level form POST, which
 *    unlike a background fetch carries its cookie in every browser, however
 *    the self-signed certificate was accepted. Its "then" is the console's
 *    sign-in URL, so the chain ends on a sign-in page — the proof that nothing
 *    is left signed in. (Ending on an app's own page was the first version's
 *    mistake: a signed-in-looking console after a successful logout.)
 */
export const oauthLogoutPage = (appsDomain: string): string => {
  const oauthLogout = `https://oauth-openshift.${appsDomain}/logout`;
  const signIn = `https://console-openshift-console.${appsDomain}/auth/login`;
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Signing out</title>
    <meta name="robots" content="noindex" />
  </head>
  <body style="font-family: sans-serif; text-align: center; margin-top: 4rem">
    <p>Signing you out&hellip;</p>
    <form id="oauth-logout" method="POST" action="${oauthLogout}">
      <input type="hidden" name="then" value="${signIn}" />
      <button type="submit">Finish signing out</button>
    </form>
    <script>
      (function () {
        var form = document.getElementById('oauth-logout');
        var done = false;
        var go = function () {
          if (done) return;
          done = true;
          form.submit();
        };
        var nothing = function () {};
        try {
          fetch('${oauthLogout}', {
            method: 'POST',
            mode: 'no-cors',
            credentials: 'include',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'then=%2F',
          })
            .catch(nothing)
            .then(function () {
              return fetch('/api/ceamls-logout', { credentials: 'same-origin' }).catch(nothing);
            })
            .then(function () {
              return fetch('/oauth/sign_out', { credentials: 'same-origin' }).catch(nothing);
            })
            .then(go, go);
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
