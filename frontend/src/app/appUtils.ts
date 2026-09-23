import { SSO_LOGOUT_URL } from '#~/utilities/const';

export const logout = (): Promise<unknown> =>
  /* eslint-disable-next-line no-console */
  fetch('/oauth/sign_out').catch((err) => console.error('Error logging out', err));

/**
 * CEAMLS: what the user-initiated "Log out" controls call.
 *
 * `logout()` only clears this app's oauth-proxy cookie. The Keycloak SSO
 * session it was issued from lives on (idle 10h), so reloading would sign the
 * same person straight back in with no password — on a shared workstation,
 * as them. When ODH_SSO_LOGOUT_URL is set, hand the browser to Keycloak's
 * RP-initiated logout endpoint instead of reloading; Keycloak ends the SSO
 * session and returns here, at which point logging in needs the password.
 *
 * Session-expiry paths deliberately keep the plain `logout()` + reload: there
 * the point is to pick up a fresh token, not to sign the person out.
 */
export const logoutAndEndSsoSession = (): Promise<unknown> =>
  logout().then(() => {
    if (SSO_LOGOUT_URL) {
      window.location.assign(SSO_LOGOUT_URL);
    } else {
      window.location.reload();
    }
  });
