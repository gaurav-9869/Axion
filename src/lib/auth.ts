declare var google: any;

/**
 * Canonical Google OAuth Client ID for Axion
 */
export const GOOGLE_CLIENT_ID = '183072882456-66r0omapo2603he1jgulpcvvvfue099h.apps.googleusercontent.com';

/**
 * Returns the sanitized Google OAuth Client ID, ensuring no invalid_client errors
 * from missing, quoted, or outdated environment variables.
 */
export const getGoogleClientId = (): string => {
    const rawEnvId = (import.meta as any).env?.VITE_GOOGLE_CLIENT_ID;
    if (typeof rawEnvId === 'string') {
        const cleaned = rawEnvId.replace(/^["']|["']$/g, '').trim();
        if (cleaned === GOOGLE_CLIENT_ID) {
            return cleaned;
        }
    }
    return GOOGLE_CLIENT_ID;
};

/**
 * Canonical Google OAuth scopes required by Axion:
 * - Google Calendar Events: for syncing study, practice, and spaced repetition blocks
 * - User Profile & Email: for user identity and Firebase authentication handshake
 */
export const GOOGLE_OAUTH_SCOPES = [
    'https://www.googleapis.com/auth/calendar.events',
    'https://www.googleapis.com/auth/userinfo.profile',
    'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

/**
 * Saves Google OAuth access tokens to localStorage with calculated expiration.
 * Subtracts a 5-minute safety buffer (300,000 ms) from expiresAt to ensure
 * tokens are always refreshed BEFORE they expire.
 */
export const saveOAuthTokens = (accessToken: string, expiresInSeconds: number): void => {
    const expiresAt = Date.now() + (expiresInSeconds * 1000) - 300000;
    localStorage.setItem('gcal_token', accessToken);
    localStorage.setItem('gcal_token_expires', String(expiresAt));
};

/**
 * Ensures a valid Google OAuth access token is available.
 * Returns the stored token immediately if it is still valid.
 * Otherwise, triggers silent re-authentication via Google Identity Services
 * to refresh the token in the background and update localStorage.
 */
export const ensureValidToken = async (): Promise<string | null> => {
    const token = localStorage.getItem('gcal_token');
    const expiresAt = Number(localStorage.getItem('gcal_token_expires') || 0);

    // If token exists and is still valid (within the safety-buffered expiresAt), return immediately
    if (token && Date.now() <= expiresAt) {
        return token;
    }

    const clientId = getGoogleClientId();
    if (!clientId) {
        console.warn("[Google OAuth] Client ID is missing or not configured.");
        return null;
    }

    if (typeof google === 'undefined' || !google.accounts?.oauth2) {
        console.error("[Google OAuth] Google Identity Services library (google.accounts.oauth2) is not loaded.");
        return null;
    }

    return new Promise((resolve) => {
        try {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: GOOGLE_OAUTH_SCOPES,
                prompt: '', // Silent background request
                callback: (response: any) => {
                    if (response.error || !response.access_token) {
                        console.error("[Google OAuth] Silent token request failed:", response);
                        resolve(null);
                    } else {
                        // Save the new token with the safety-buffered expiration
                        saveOAuthTokens(response.access_token, response.expires_in || 3600);
                        resolve(response.access_token);
                    }
                },
                error_callback: (error: any) => {
                    console.error("[Google OAuth] Silent token request error:", error);
                    resolve(null);
                },
            });
            client.requestAccessToken();
        } catch (e) {
            console.error("[Google OAuth] Unexpected exception during silent token renewal:", e);
            resolve(null);
        }
    });
};
