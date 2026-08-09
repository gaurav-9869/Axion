// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { saveOAuthTokens } from './auth';

describe('saveOAuthTokens', () => {
    beforeEach(() => {
        localStorage.clear();
        vi.useFakeTimers();
        vi.setSystemTime(new Date(1672531200000));
    });

    afterEach(() => {
        vi.useRealTimers();
        localStorage.clear();
    });

    it('should save the access token to localStorage', () => {
        saveOAuthTokens('test_token', 3600);
        expect(localStorage.getItem('gcal_token')).toBe('test_token');
    });

    it('should calculate the correct expiration time (now + expires_in - 5 minutes)', () => {
        saveOAuthTokens('test_token', 3600);
        const expiresAt = localStorage.getItem('gcal_token_expires');
        expect(expiresAt).toBe(String(1672534500000));
    });

    it('should handle zero expiration times correctly', () => {
        saveOAuthTokens('test_token', 0);
        expect(localStorage.getItem('gcal_token_expires')).toBe(String(1672530900000));
    });
});
