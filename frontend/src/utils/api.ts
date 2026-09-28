import axios from "axios";
import { Capacitor } from "@capacitor/core";
import { clearAuthToken, readActivePg, readAuthToken } from "./authStorage";

const LOCAL_API_URL = "http://127.0.0.1:8787/api";
const PROD_API_URL = "https://pg-management-backend.gowthamnachu545.workers.dev/api";

const resolveBaseURL = () => {
  const envUrl = import.meta.env.VITE_API_URL?.trim();
  if (envUrl) {
    return envUrl;
  }

  // Keep localhost API auto-detection only for browser-based local development.
  if (typeof window !== "undefined" && !Capacitor.isNativePlatform()) {
    const host = window.location.hostname;
    if (host === "localhost" || host === "127.0.0.1") {
      return LOCAL_API_URL;
    }
  }

  return PROD_API_URL;
};

const redirectToLogin = () => {
  if (typeof window === "undefined") {
    return;
  }

  const inLoginPath = window.location.pathname.includes("/login");
  const inLoginHash = window.location.hash.includes("/login");
  if (inLoginPath || inLoginHash) {
    return;
  }

  window.location.replace("/#/login");
};

const baseURL = resolveBaseURL();

const isLocalApi = /http:\/\/(127\.0\.0\.1|localhost)(:\d+)?/i.test(baseURL);
const isInsecureRemoteApi = baseURL.startsWith("http://") && !isLocalApi;

const api = axios.create({
  baseURL,
  timeout: 15000
});

const shouldAttachPgScope = (url?: string) => {
  if (!url) {
    return false;
  }

  if (url.startsWith("/auth") || url.startsWith("/pgs")) {
    return false;
  }

  return true;
};

const appendPgScope = (url: string, pg: { id: string; name: string }) => {
  if (/([?&])pgId=/.test(url) || /([?&])pgName=/.test(url)) {
    return url;
  }

  const delimiter = url.includes("?") ? "&" : "?";
  return `${url}${delimiter}pgId=${encodeURIComponent(pg.id)}&pgName=${encodeURIComponent(pg.name)}`;
};

api.interceptors.request.use(async (config) => {
  const token = await readAuthToken();
  const activePg = await readActivePg();

  if (isInsecureRemoteApi) {
    // Never send auth token over insecure transport outside local development.
    return config;
  }

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  if (activePg && shouldAttachPgScope(config.url)) {
    config.url = appendPgScope(config.url || "", activePg);
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error?.response?.status === 401) {
      await clearAuthToken();
      redirectToLogin();
    }
    return Promise.reject(error);
  }
);

export default api;
