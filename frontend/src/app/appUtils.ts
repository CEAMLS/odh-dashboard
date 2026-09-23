import { SSO_LOGOUT_URL } from '#~/utilities/const';

export const logout = (): Promise<unknown> =>
  /* eslint-disable-next-line no-console */
  fetch('/oauth/sign_out').catch((err) => console.error('Error logging out', err));

/**
 * CEAMLS: what the user-initiated "Log out" controls call.
 *
 * `logout()` only clears this app's oauth-proxy cookie, and every other app
 * the user opened still holds its own OpenShift token — the Keycloak SSO
 * session (idle 10h) and the console session outlive it, so "logging out"
 * signs nobody out. ODH_SSO_LOGOUT_URL points at /api/ceamls-logout instead,
 * the single-logout chain both this app and the console start: it revokes the
 * user's tokens, expires this app's cookie, ends the OAuth server's session
 * and only then ends the SSO session. That endpoint is behind the same
 * oauth-proxy, so do NOT sign out of it first — the chain needs this session
 * to get in.
 *
 * Session-expiry paths deliberately keep the plain `logout()` + reload: there
 * the point is to pick up a fresh token, not to sign the person out.
 */
export const logoutAndEndSsoSession = (): Promise<unknown> => {
  if (!SSO_LOGOUT_URL) {
    return logout().then(() => window.location.reload());
  }
  window.location.assign(SSO_LOGOUT_URL);
  return Promise.resolve();
};
