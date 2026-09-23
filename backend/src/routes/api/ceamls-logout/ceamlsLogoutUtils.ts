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
 * Last hop of the chain. The OpenShift OAuth server keeps its own short-lived
 * session, and while it lives it hands out fresh tokens with no password — so
 * the browser has to POST to its logout endpoint too. That endpoint only
 * accepts a "then" on the console's host, which is where we land: with the
 * Keycloak session, every token and this session gone, the console can only
 * send the user to the Keycloak login page.
 */
export const oauthLogoutPage = (appsDomain: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Signing out</title>
    <meta name="robots" content="noindex" />
  </head>
  <body style="font-family: sans-serif; text-align: center; margin-top: 4rem">
    <p>Signing you out&hellip;</p>
    <form id="openshift-logout" method="POST" action="https://oauth-openshift.${appsDomain}/logout">
      <input type="hidden" name="then" value="https://console-openshift-console.${appsDomain}/" />
      <noscript><button type="submit">Finish signing out</button></noscript>
    </form>
    <script>
      document.getElementById('openshift-logout').submit();
    </script>
  </body>
</html>
`;
