import { useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import { useAuth } from "../hooks/useAuth";

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await login(email.trim(), password);
      navigate("/");
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        (error?.code === "ECONNABORTED"
          ? "Server timeout. Check internet and try again."
          : error?.message === "Network Error"
            ? "Cannot reach server. Check internet or API URL."
            : "Login failed");
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center p-3 sm:p-5">
      <div className="panel grid w-full max-w-5xl overflow-hidden rounded-[2rem] p-2 lg:grid-cols-2 lg:p-3">
        <div className="relative overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-blue-800 via-blue-700 to-cyan-600 p-6 text-white sm:p-8 lg:p-10">
          <div className="absolute -right-8 -top-8 h-24 w-24 rounded-full bg-white/15" />
          <div className="absolute -bottom-10 -left-10 h-28 w-28 rounded-full bg-cyan-200/20" />
          <p className="relative text-xs uppercase tracking-[0.24em] text-blue-100">PG Management</p>
          <h1 className="relative mt-3 font-display text-3xl leading-tight sm:text-4xl lg:text-5xl">Run Daily Operations In Your Pocket</h1>
          <p className="relative mt-4 max-w-sm text-sm text-blue-100 sm:text-base">
            Tenant onboarding, room allocation, reminders, and receipt tracking in one clean workflow.
          </p>
          <div className="relative mt-6 rounded-2xl bg-white/10 p-4 backdrop-blur sm:mt-8">
            <p className="text-sm text-blue-100">Realtime Snapshot</p>
            <p className="mt-1 text-xl font-bold sm:text-2xl">Rooms + Tenants + Payments</p>
          </div>
        </div>

        <div className="p-5 sm:p-8 md:p-10">
          <p className="text-xs uppercase tracking-[0.22em] text-primary">PG Management</p>
          <h2 className="mt-2 font-display text-3xl text-ink sm:text-4xl">Welcome Back</h2>
          <p className="mt-2 text-sm text-slate-500">Sign in to manage rooms, tenants, and payments.</p>

          <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Email</label>
              <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>

            <div>
              <label className="mb-1 block text-sm font-semibold text-slate-700">Password</label>
              <input
                className="input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button className="btn-primary w-full py-3" disabled={loading}>
              {loading ? "Signing in..." : "Login"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default Login;
