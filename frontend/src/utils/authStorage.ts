import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";

const TOKEN_KEY = "pg_token";
const ACTIVE_PG_KEY = "pg_active_scope";

const readWebToken = () => {
  const sessionToken = window.sessionStorage.getItem(TOKEN_KEY);
  if (sessionToken) {
    return sessionToken;
  }

  const legacyToken = window.localStorage.getItem(TOKEN_KEY);
  if (!legacyToken) {
    return null;
  }

  window.sessionStorage.setItem(TOKEN_KEY, legacyToken);
  window.localStorage.removeItem(TOKEN_KEY);
  return legacyToken;
};

const writeWebToken = (token: string) => {
  window.sessionStorage.setItem(TOKEN_KEY, token);
  window.localStorage.removeItem(TOKEN_KEY);
};

const clearWebToken = () => {
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
};

const readWebActivePg = () => {
  const raw = window.sessionStorage.getItem(ACTIVE_PG_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as { id: string; name: string };
    if (!parsed?.id || !parsed?.name) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const writeWebActivePg = (value: { id: string; name: string }) => {
  window.sessionStorage.setItem(ACTIVE_PG_KEY, JSON.stringify(value));
};

const clearWebActivePg = () => {
  window.sessionStorage.removeItem(ACTIVE_PG_KEY);
};

export const readAuthToken = async () => {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: TOKEN_KEY });
    return value;
  }

  return readWebToken();
};

export const writeAuthToken = async (token: string) => {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: TOKEN_KEY, value: token });
    return;
  }

  writeWebToken(token);
};

export const clearAuthToken = async () => {
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key: TOKEN_KEY });
    return;
  }

  clearWebToken();
};

export const readActivePg = async () => {
  if (Capacitor.isNativePlatform()) {
    const { value } = await Preferences.get({ key: ACTIVE_PG_KEY });
    if (!value) {
      return null;
    }
    try {
      const parsed = JSON.parse(value) as { id: string; name: string };
      if (!parsed?.id || !parsed?.name) {
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
  }

  return readWebActivePg();
};

export const writeActivePg = async (value: { id: string; name: string }) => {
  if (Capacitor.isNativePlatform()) {
    await Preferences.set({ key: ACTIVE_PG_KEY, value: JSON.stringify(value) });
    return;
  }

  writeWebActivePg(value);
};

export const clearActivePg = async () => {
  if (Capacitor.isNativePlatform()) {
    await Preferences.remove({ key: ACTIVE_PG_KEY });
    return;
  }

  clearWebActivePg();
};