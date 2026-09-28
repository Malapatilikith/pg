import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import { Skeleton, TableSkeleton } from "../components/LoadingLayout";
import PaginationControls from "../components/PaginationControls";
import { X, Loader2, Users, ChevronDown } from "lucide-react";
import { useAuth } from "../hooks/useAuth";
import api from "../utils/api";
import { formatDateDMY } from "../utils/date";
import { useDebounce } from "../hooks/useDebounce";
import type { ApiResponse, PaginatedData, PaginationMeta, PgSummary, User } from "../types";

const AdminManagement = () => {
  const { user, registerAdmin } = useAuth();
  const [admins, setAdmins] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });
  const [loading, setLoading] = useState(false);
  const [resettingAdminId, setResettingAdminId] = useState<string | null>(null);
  const [resetModalAdmin, setResetModalAdmin] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [initialFetch, setInitialFetch] = useState(true);
  const [expandedAdminId, setExpandedAdminId] = useState<string | null>(null);
  const isInitialLoading = loading && initialFetch;

  const loadAdmins = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "10"
      });
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      if (roleFilter !== "all") {
        params.set("role", roleFilter);
      }

      const response = await api.get<ApiResponse<PaginatedData<User>>>(`/auth/admins?${params.toString()}`);
      setAdmins(response.data.data.items);
      setPagination(response.data.data.pagination);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to load admins");
    } finally {
      setLoading(false);
      setInitialFetch(false);
    }
  };

  useEffect(() => {
    void loadAdmins();
  }, [page, debouncedSearch, roleFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter]);

  const createAdmin = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedName = form.name.trim().replace(/\s+/g, " ");
    const normalizedEmail = form.email.trim().toLowerCase();
    const normalizedPassword = form.password.trim();

    if (normalizedName.length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }

    if (!normalizedEmail) {
      toast.error("Email is required");
      return;
    }

    if (normalizedPassword.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    try {
      await registerAdmin({
        name: normalizedName,
        email: normalizedEmail,
        password: normalizedPassword,
        role: "admin",
        pgId: user?.pgId || ""
      });
      toast.success("Admin account created successfully");
      setForm({ name: "", email: "", password: "" });
      setPage(1);
      await loadAdmins();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to create admin");
    }
  };

  const deleteAdmin = async (id: string) => {
    if (!window.confirm("Delete this admin account?")) {
      return;
    }

    try {
      await api.delete(`/auth/admins/${id}`);
      toast.success("Admin deleted");
      setPage(1);
      await loadAdmins();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete admin");
    }
  };

  const openResetModal = (admin: User) => {
    setResetModalAdmin(admin);
    setResetPassword("");
  };

  const closeResetModal = () => {
    if (resettingAdminId) {
      return;
    }

    setResetModalAdmin(null);
    setResetPassword("");
  };

  const resetAdminPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalAdmin) {
      return;
    }

    const trimmed = resetPassword.trim();
    if (trimmed.length < 6) {
      toast.error("Password must be at least 6 characters");
      return;
    }

    setResettingAdminId(resetModalAdmin.id);
    try {
      await api.put(`/auth/admins/${resetModalAdmin.id}/reset-password`, { password: trimmed });
      toast.success(`Password reset for ${resetModalAdmin.name}`);
      setResetModalAdmin(null);
      setResetPassword("");
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to reset admin password");
    } finally {
      setResettingAdminId(null);
    }
  };

  return (
    <div className="grid gap-4 xl:grid-cols-3">
      <form className="panel rounded-3xl space-y-3 p-5 xl:col-span-1" onSubmit={createAdmin}>
        <h3 className="text-lg font-bold">Create Admin</h3>
        {isInitialLoading ? (
          <>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </>
        ) : (
          <>
            <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            <input className="input" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
            <input
              className="input"
              placeholder="Password"
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              required
            />
            <button className="btn-primary w-full" type="submit">
              Create Admin
            </button>
          </>
        )}
      </form>

      <div className="panel rounded-3xl p-4 sm:p-5 xl:col-span-2">
        <h3 className="text-lg font-bold">Admin Accounts</h3>
        <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
          <div className="relative">
            <input
              className="input w-full pr-8"
              placeholder="Search by name or email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                {loading || search !== debouncedSearch ? (
                  <Loader2 size={16} className="animate-spin text-indigo-500" />
                ) : (
                  <button
                    type="button"
                    className="transition-colors hover:text-slate-600"
                    onClick={() => setSearch("")}
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            )}
          </div>
          <select className="input" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
            <option value="all">All Roles</option>
            <option value="superadmin">Superadmin</option>
            <option value="admin">Admin</option>
          </select>
        </div>
        {isInitialLoading ? (
          <div className="mt-3">
            <TableSkeleton columns={5} rows={6} />
          </div>
        ) : (
          <>
          <div className="relative">
            <div className="mt-4 panel overflow-hidden md:hidden stagger-fade">
              {admins.map((admin) => {
                const isExpanded = expandedAdminId === admin.id;
                return (
                  <article key={admin.id} className="border-b border-black/[0.03] bg-white last:border-0">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-4 text-left transition-colors active:bg-slate-50"
                      onClick={() => setExpandedAdminId(isExpanded ? null : admin.id)}
                    >
                      <div className="flex items-center gap-4 min-w-0 pr-4">
                        <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-full ${admin.role === 'superadmin' ? 'bg-amber-50 text-amber-600' : 'bg-blue-50 text-blue-600'}`}>
                          <Users size={24} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <h3 className="text-[17px] font-semibold text-slate-900 leading-tight truncate">{admin.name}</h3>
                          <div className="flex items-center gap-3 mt-1 text-[13px] text-slate-500">
                            <span className="truncate">{admin.email}</span>
                          </div>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex flex-col items-end">
                          <span className={`text-[12px] font-bold uppercase tracking-wider ${admin.role === 'superadmin' ? 'text-amber-600' : 'text-blue-600'}`}>
                            {admin.role}
                          </span>
                        </div>
                        <ChevronDown size={18} className={`text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    <div
                      className={[
                        "overflow-hidden transition-all duration-200",
                        isExpanded ? "max-h-40 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                      ].join(" ")}
                    >
                      <div className="px-4 pb-4">
                        <div className="rounded-2xl border border-black/[0.05] bg-slate-50 p-4 mb-3">
                          <div className="grid grid-cols-2 gap-y-2 text-[13px]">
                            <p className="font-medium text-slate-500">Created On</p>
                            <p className="text-right font-semibold text-slate-700">{formatDateDMY(admin.createdAt)}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                          {admin.id !== user?.id && admin.role === "admin" && (
                            <button
                              type="button"
                              className="btn-secondary flex-1 px-3 py-2 text-xs"
                              onClick={() => openResetModal(admin)}
                              disabled={resettingAdminId === admin.id}
                            >
                              {resettingAdminId === admin.id ? "Resetting..." : "Reset Password"}
                            </button>
                          )}
                          {admin.id !== user?.id && (
                            <button
                              type="button"
                              className={[
                                "btn-secondary bg-rose-50 px-3 py-2 text-xs !text-rose-600 !ring-rose-200 hover:bg-rose-100",
                                admin.role === "admin" ? "flex-1" : "col-span-2"
                              ].join(" ")}
                              onClick={() => deleteAdmin(admin.id)}
                            >
                              Remove Access
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            <div className="panel hidden overflow-hidden rounded-[2rem] md:block mt-4">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50/80 backdrop-blur-md border-b border-black/[0.03] text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-bold">Name</th>
                      <th className="px-6 py-4 font-bold">Email</th>
                      <th className="px-6 py-4 font-bold">Role</th>
                      <th className="px-6 py-4 font-bold">Created</th>
                      <th className="px-6 py-4 font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]">
                    {admins.map((admin) => (
                      <tr key={admin.id} className="transition-colors hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-bold text-slate-900">{admin.name}</td>
                        <td className="px-6 py-4 font-medium text-slate-600">{admin.email}</td>
                        <td className="px-6 py-4">
                          <span
                            className={[
                              "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
                              admin.role === "superadmin" ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-blue-700"
                            ].join(" ")}
                          >
                            {admin.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-medium text-slate-600">{formatDateDMY(admin.createdAt)}</td>
                        <td className="px-6 py-4">
                          <div className="flex gap-2">
                            {admin.id !== user?.id && admin.role === "admin" && (
                              <button
                                type="button"
                                className="btn-secondary rounded-full px-4 py-1.5 text-xs"
                                onClick={() => openResetModal(admin)}
                                disabled={resettingAdminId === admin.id}
                              >
                                {resettingAdminId === admin.id ? "Resetting..." : "Reset Pwd"}
                              </button>
                            )}
                            {admin.id !== user?.id && (
                              <button
                                type="button"
                                className="rounded-full bg-rose-50 px-4 py-1.5 text-xs font-bold text-rose-600 ring-1 ring-inset ring-rose-500/20 transition-all hover:bg-rose-100"
                                onClick={() => deleteAdmin(admin.id)}
                              >
                                Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            {loading && !isInitialLoading && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-[2px] rounded-[2rem]">
                <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-black/[0.05]">
                  <Loader2 className="animate-spin text-indigo-500" size={16} />
                  Loading...
                </div>
              </div>
            )}
          </div>

            <PaginationControls pagination={pagination} loading={loading} onPageChange={setPage} />
          </>
        )}
      </div>

      {resetModalAdmin && (
        <div className="mobile-sheet">
          <form className="mobile-sheet-card w-full max-w-md space-y-4" onSubmit={resetAdminPassword}>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Reset Admin Password</h3>
              <p className="mt-1 text-sm text-slate-600">
                Set a new password for <span className="font-semibold">{resetModalAdmin.name}</span>.
              </p>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">New Password</label>
              <input
                className="input"
                type="password"
                placeholder="Enter new password"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                minLength={6}
                required
                autoFocus
              />
              <p className="text-xs text-slate-500">Minimum 6 characters.</p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={closeResetModal} disabled={Boolean(resettingAdminId)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={Boolean(resettingAdminId)}>
                {resettingAdminId === resetModalAdmin.id ? "Resetting..." : "Reset Password"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default AdminManagement;
