declare var google: any;

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

    const clientId = (import.meta as any).env.VITE_GOOGLE_CLIENT_ID;
    if (!clientId || clientId === 'your_google_client_id_here') return null;

    return new Promise((resolve) => {
        try {
            const client = google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/drive.file',
                prompt: '', // Silent background request
                callback: (response: any) => {
                    if (response.error || !response.access_token) {
                        resolve(null);
                    } else {
                        // Save the new token with the safety-buffered expiration
                        saveOAuthTokens(response.access_token, response.expires_in || 3600);
                        resolve(response.access_token);
                    }
                },
            });
            client.requestAccessToken();
        } catch (e) {
            resolve(null);
        }
    });
};
