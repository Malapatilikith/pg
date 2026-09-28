import { createContext, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import type { ApiResponse, PgScope, Role, User } from "../types";
import { clearActivePg, clearAuthToken, readActivePg, readAuthToken, writeActivePg, writeAuthToken } from "../utils/authStorage";

interface AuthContextValue {
  user: User | null;
  token: string | null;
  activePg: PgScope | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  registerAdmin: (payload: { name: string; email: string; password: string; role?: Role; pgId?: string; pgName?: string }) => Promise<void>;
  refreshMe: () => Promise<void>;
  setActivePg: (pg: PgScope | null) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [activePg, setActivePgState] = useState<PgScope | null>(null);
  const [loading, setLoading] = useState(true);

  const syncActivePg = async (nextUser: User | null) => {
    if (nextUser?.pgId && nextUser?.pgName) {
      const scope = { id: nextUser.pgId, name: nextUser.pgName, logoUrl: nextUser.pgLogoUrl };
      await writeActivePg(scope);
      setActivePgState(scope);
      return;
    }

    await clearActivePg();
    setActivePgState(null);
  };

  const refreshMe = async () => {
    const activeToken = await readAuthToken();
    if (!activeToken) {
      setUser(null);
      setToken(null);
      return;
    }

    const response = await api.get<ApiResponse<User>>("/auth/me");
    setUser(response.data.data);
    await syncActivePg(response.data.data);
    setToken(await readAuthToken());
  };

  useEffect(() => {
    (async () => {
      try {
        await refreshMe();
      } catch {
        await clearAuthToken();
        await clearActivePg();
        setToken(null);
        setUser(null);
        setActivePgState(null);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await api.post<ApiResponse<{ token: string; user: User }>>("/auth/login", {
      email,
      password
    });

    const nextToken = response.data.data.token;
    await writeAuthToken(nextToken);
    setToken(nextToken);
    setUser(response.data.data.user);
    await syncActivePg(response.data.data.user);
    toast.success("Login successful");
  };

  const logout = () => {
    void clearAuthToken();
    void clearActivePg();
    setToken(null);
    setUser(null);
    setActivePgState(null);
    toast("Logged out");
  };

  const setActivePg = async (pg: PgScope | null) => {
    if (!pg) {
      await clearActivePg();
      setActivePgState(null);
      return;
    }

    await writeActivePg(pg);
    setActivePgState(pg);
  };

  const registerAdmin = async (payload: {
    name: string;
    email: string;
    password: string;
    role?: Role;
    pgId?: string;
    pgName?: string;
  }) => {
    await api.post("/auth/register", payload);
    toast.success("Admin created");
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      token,
      activePg,
      loading,
      login,
      logout,
      isAuthenticated: Boolean(token && user),
      registerAdmin,
      refreshMe,
      setActivePg
    }),
    [user, token, activePg, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
