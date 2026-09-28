import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { X, Loader2, ArrowLeft, DoorOpen, Users, Settings, UserPlus, MessageCircle, ChevronDown, Image, Upload } from "lucide-react";
import api from "../utils/api";
import { formatDateDMY } from "../utils/date";
import { useDebounce } from "../hooks/useDebounce";
import { useAuth } from "../hooks/useAuth";
import { TableSkeleton } from "../components/LoadingLayout";
import PaginationControls from "../components/PaginationControls";
import StickyToolbar from "../components/StickyToolbar";
import type { ApiResponse, PaginatedData, PaginationMeta, PgSummary, PgWhatsappSettings, User } from "../types";

const defaultWhatsappForm = {
  enabled: false,
  apiKey: "",
  phoneNumberId: "",
  templateReminder: "",
  templateConfirmation: "",
  languageCode: "en"
};

const FounderPgDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, registerAdmin, refreshMe } = useAuth();
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const [leftPortalTarget, setLeftPortalTarget] = useState<HTMLElement | null>(null);
  const [titlePortalTarget, setTitlePortalTarget] = useState<HTMLElement | null>(null);
  
  const [pg, setPg] = useState<PgSummary | null>(null);
  const [pgLoading, setPgLoading] = useState(true);

  // Modals
  const [isWhatsappModalOpen, setIsWhatsappModalOpen] = useState(false);
  const [isAddAdminModalOpen, setIsAddAdminModalOpen] = useState(false);
  const [isLogoModalOpen, setIsLogoModalOpen] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [pgName, setPgName] = useState("");
  const [logoUploading, setLogoUploading] = useState(false);

  // WhatsApp
  const [whatsappForm, setWhatsappForm] = useState(defaultWhatsappForm);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappSaving, setWhatsappSaving] = useState(false);

  // Admins
  const [admins, setAdmins] = useState<User[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [roleFilter, setRoleFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1, pageSize: 10, total: 0, totalPages: 1, hasNext: false, hasPrev: false
  });
  const [adminsLoading, setAdminsLoading] = useState(false);
  const [initialAdminsFetch, setInitialAdminsFetch] = useState(true);
  const [expandedAdminId, setExpandedAdminId] = useState<string | null>(null);

  // ... (keep load function logic intact, we just need to replace the rendering block)
  // To be safe, I'll replace from the `return` statement.
  
  // Admin Create/Reset
  const [adminForm, setAdminForm] = useState({ name: "", email: "", password: "", role: "admin" as "admin" | "superadmin" });
  const [creatingAdmin, setCreatingAdmin] = useState(false);
  const [resetModalAdmin, setResetModalAdmin] = useState<User | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resettingAdminId, setResettingAdminId] = useState<string | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById("navbar-portal-target"));
    setLeftPortalTarget(document.getElementById("navbar-left-portal-target"));
    setTitlePortalTarget(document.getElementById("navbar-title-target"));
  }, []);

  useEffect(() => {
    if (!id) return;
    loadPgSummary();
  }, [id]);

  useEffect(() => {
    if (!id) return;
    void loadAdmins();
  }, [id, page, debouncedSearch, roleFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, roleFilter]);

  const loadPgSummary = async () => {
    setPgLoading(true);
    try {
      const res = await api.get<ApiResponse<PgSummary>>(`/pgs/${id}/summary`);
      setPg(res.data.data);
    } catch (err: any) {
      toast.error("Failed to load PG summary");
      navigate("/pgs");
    } finally {
      setPgLoading(false);
    }
  };

  const loadWhatsappSettings = async () => {
    setWhatsappLoading(true);
    try {
      const res = await api.get<ApiResponse<PgWhatsappSettings>>(`/pgs/${id}/whatsapp`);
      const data = res.data.data;
      setWhatsappForm({
        enabled: data.whatsappEnabled,
        apiKey: data.whatsappApiKey ?? "",
        phoneNumberId: data.whatsappPhoneNumberId ?? "",
        templateReminder: data.whatsappTemplateReminder ?? "",
        templateConfirmation: data.whatsappTemplateConfirmation ?? "",
        languageCode: data.whatsappTemplateLanguageCode ?? "en"
      });
    } catch (err: any) {
      if (err?.response?.status !== 404) {
        toast.error("Failed to load WhatsApp settings");
      }
    } finally {
      setWhatsappLoading(false);
    }
  };

  const openWhatsappModal = () => {
    setIsWhatsappModalOpen(true);
    loadWhatsappSettings();
  };

  const saveWhatsappSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (whatsappForm.enabled) {
      if (!whatsappForm.apiKey.trim() || !whatsappForm.phoneNumberId.trim() || !whatsappForm.templateReminder.trim() || !whatsappForm.templateConfirmation.trim()) {
        toast.error("Complete all WhatsApp fields when enabled");
        return;
      }
    }

    setWhatsappSaving(true);
    try {
      await api.put(`/pgs/${id}/whatsapp`, {
        ...whatsappForm,
        apiKey: whatsappForm.apiKey.trim() || undefined,
        phoneNumberId: whatsappForm.phoneNumberId.trim() || undefined,
        templateReminder: whatsappForm.templateReminder.trim() || undefined,
        templateConfirmation: whatsappForm.templateConfirmation.trim() || undefined,
      });
      toast.success("WhatsApp settings updated");
      setIsWhatsappModalOpen(false);
      loadPgSummary();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update WhatsApp settings");
    } finally {
      setWhatsappSaving(false);
    }
  };

  const handleSaveBrandSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setLogoUploading(true);
    let successCount = 0;

    try {
      // 1. Update PG Name if changed
      if (pgName.trim() && pgName.trim() !== pg?.name) {
        await api.put(`/pgs/${id}`, { name: pgName.trim() });
        successCount++;
      }

      // 2. Upload Logo if provided
      if (logoFile) {
        const formData = new FormData();
        formData.append("file", logoFile);
        await api.post(`/pgs/${id}/logo`, formData, {
          headers: { "Content-Type": "multipart/form-data" }
        });
        successCount++;
      }

      if (successCount > 0) {
        toast.success("Brand settings updated successfully");
        void refreshMe();
      }
      setIsLogoModalOpen(false);
      setLogoFile(null);
      loadPgSummary();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to update brand settings");
    } finally {
      setLogoUploading(false);
    }
  };

  const loadAdmins = async () => {
    setAdminsLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: "10", pgId: id! });
      if (debouncedSearch.trim()) params.set("search", debouncedSearch.trim());
      if (roleFilter !== "all") params.set("role", roleFilter);

      const res = await api.get<ApiResponse<PaginatedData<User>>>(`/auth/admins?${params.toString()}`);
      setAdmins(res.data.data.items);
      setPagination(res.data.data.pagination);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to load admins");
    } finally {
      setAdminsLoading(false);
      setInitialAdminsFetch(false);
    }
  };

  const handleCreateAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingAdmin(true);
    try {
      await registerAdmin({
        name: adminForm.name.trim(),
        email: adminForm.email.trim(),
        password: adminForm.password.trim(),
        role: adminForm.role,
        pgId: id
      });
      setAdminForm({ name: "", email: "", password: "", role: "admin" });
      toast.success("Admin created successfully");
      setIsAddAdminModalOpen(false);
      loadAdmins();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to create admin");
    } finally {
      setCreatingAdmin(false);
    }
  };

  const handleDeleteAdmin = async (adminId: string) => {
    if (!window.confirm("Delete this admin account?")) return;
    try {
      await api.delete(`/auth/admins/${adminId}`);
      toast.success("Admin deleted");
      loadAdmins();
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to delete admin");
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetModalAdmin) return;
    const trimmed = resetPassword.trim();
    if (trimmed.length < 6) return toast.error("Password must be at least 6 characters");

    setResettingAdminId(resetModalAdmin.id);
    try {
      await api.put(`/auth/admins/${resetModalAdmin.id}/reset-password`, { password: trimmed });
      toast.success(`Password reset for ${resetModalAdmin.name}`);
      setResetModalAdmin(null);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || "Failed to reset password");
    } finally {
      setResettingAdminId(null);
    }
  };

  if (pgLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {titlePortalTarget && pg?.name &&
        createPortal(
          <div className="flex items-center gap-2 animate-in fade-in duration-300">
            <span>{pg.name}</span>
          </div>,
          titlePortalTarget
        )}
        
      {leftPortalTarget &&
        createPortal(
          <Link to="/pgs" className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600 transition-all hover:bg-slate-200 active:scale-95">
            <ArrowLeft size={18} strokeWidth={2.5} />
          </Link>,
          leftPortalTarget
        )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="panel rounded-3xl p-5 flex flex-col items-center justify-center text-center">
          <DoorOpen size={24} className="text-emerald-500 mb-2 stroke-[2.5]" />
          <span className="text-3xl font-black text-slate-900">{pg?.roomsCount ?? 0}</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">Rooms</span>
        </div>
        <div className="panel rounded-3xl p-5 flex flex-col items-center justify-center text-center">
          <Users size={24} className="text-blue-500 mb-2 stroke-[2.5]" />
          <span className="text-3xl font-black text-slate-900">{pg?.tenantsCount ?? 0}</span>
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">Tenants</span>
        </div>
        <button 
          onClick={openWhatsappModal}
          className="panel rounded-3xl p-5 flex flex-col items-center justify-center text-center transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95 group border-2 border-transparent hover:border-slate-100"
        >
          <MessageCircle size={24} className={`${pg?.whatsappEnabled ? "text-green-500" : "text-slate-400"} mb-2 stroke-[2.5] transition-colors group-hover:scale-110`} />
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">WhatsApp API</span>
          <span className={`mt-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full transition-colors ${pg?.whatsappEnabled ? 'bg-green-100 text-green-700 group-hover:bg-green-200' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
            {pg?.whatsappEnabled ? "Active" : "Configure"}
          </span>
        </button>
        <button 
          onClick={() => {
            setPgName(pg?.name || "");
            setIsLogoModalOpen(true);
          }}
          className="panel rounded-3xl p-5 flex flex-col items-center justify-center text-center transition-all hover:shadow-md hover:-translate-y-0.5 active:scale-95 group border-2 border-transparent hover:border-slate-100"
        >
          {pg?.logoUrl ? (
            <img src={pg.logoUrl} alt="Logo" className="h-8 object-contain mb-2 transition-transform group-hover:scale-110" />
          ) : (
            <Image size={24} className="text-indigo-500 mb-2 stroke-[2.5] transition-transform group-hover:scale-110" />
          )}
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mt-0.5">Brand Settings</span>
          <span className={`mt-1.5 text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full transition-colors ${pg?.logoUrl ? 'bg-indigo-100 text-indigo-700 group-hover:bg-indigo-200' : 'bg-slate-100 text-slate-500 group-hover:bg-slate-200'}`}>
            {pg?.logoUrl ? "Edit" : "Configure"}
          </span>
        </button>
      </div>

      <StickyToolbar>
        <div className="panel toolbar-surface grid gap-3 p-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:p-4">
          <div className="relative w-full sm:w-64">
            <input
              className="input w-full pr-8"
              placeholder="Search staff by name/email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <div className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400">
                {adminsLoading || search !== debouncedSearch ? (
                  <Loader2 size={16} className="animate-spin text-primary" />
                ) : (
                  <button type="button" onClick={() => setSearch("")}><X size={16} /></button>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 w-full sm:flex sm:w-auto sm:gap-3">
            <select className="input col-span-1 w-full sm:w-40" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
              <option value="all">All Roles</option>
              <option value="superadmin">Superadmin</option>
              <option value="admin">Admin</option>
            </select>
            <button className="btn-primary col-span-1 w-full sm:w-auto px-4" onClick={() => setIsAddAdminModalOpen(true)}>
              <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                <UserPlus size={16} strokeWidth={2.5} />
                <span className="truncate">Add Staff</span>
              </div>
            </button>
          </div>
        </div>
      </StickyToolbar>

      <div className="relative">
        <div className="panel overflow-hidden stagger-fade">
          {initialAdminsFetch ? (
            <TableSkeleton columns={4} rows={5} />
          ) : admins.length === 0 ? (
            <div className="p-10 text-center flex flex-col items-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-50 text-slate-400 mb-4">
                <Users size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No Staff Members</h3>
              <p className="text-sm text-slate-500 mt-1">There are no admins or superadmins assigned to this workspace.</p>
            </div>
          ) : (
            admins.map((admin) => {
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
                          <p className="font-medium text-slate-500">Date Added</p>
                          <p className="text-right font-semibold text-slate-700">{formatDateDMY(admin.createdAt)}</p>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                        {admin.id !== user?.id && admin.role === "admin" && (
                          <button type="button" className="btn-secondary flex-1 px-3 py-2 text-xs" onClick={() => { setResetModalAdmin(admin); setResetPassword(""); }}>
                            Reset Password
                          </button>
                        )}
                        {admin.id !== user?.id && (
                          <button type="button" className="btn-secondary flex-1 px-3 py-2 text-xs !text-rose-600 !ring-rose-200 bg-rose-50" onClick={() => handleDeleteAdmin(admin.id)}>
                            Remove Access
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })
          )}
        </div>
        {adminsLoading && !initialAdminsFetch && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-[2px] rounded-[2rem]">
            <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm ring-1 ring-black/[0.05]">
              <Loader2 className="animate-spin text-primary" size={16} />
              Loading...
            </div>
          </div>
        )}
      </div>
      
      {!initialAdminsFetch && admins.length > 0 && (
        <PaginationControls pagination={pagination} loading={adminsLoading} onPageChange={setPage} />
      )}

      {/* Add Admin Modal */}
      {isAddAdminModalOpen && (
        <div className="mobile-sheet">
          <form className="mobile-sheet-card w-full space-y-4" onSubmit={handleCreateAdmin}>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Add Staff Member</h3>
              <p className="mt-1 text-sm text-slate-600">They will only have access to this workspace.</p>
            </div>
            
            <div className="space-y-4 mt-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Full Name</span>
                <input className="input w-full" placeholder="e.g. John Doe" value={adminForm.name} onChange={e => setAdminForm({...adminForm, name: e.target.value})} required />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Email Address</span>
                <input className="input w-full" type="email" placeholder="john@example.com" value={adminForm.email} onChange={e => setAdminForm({...adminForm, email: e.target.value})} required />
              </label>
              <div className="grid grid-cols-2 gap-4">
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Role</span>
                  <select className="input w-full" value={adminForm.role} onChange={e => setAdminForm({...adminForm, role: e.target.value as "admin" | "superadmin"})}>
                    <option value="admin">Admin</option>
                    <option value="superadmin">Superadmin</option>
                  </select>
                </label>
                <label className="space-y-1.5">
                  <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Password</span>
                  <input className="input w-full" type="password" placeholder="Min 6 chars" value={adminForm.password} onChange={e => setAdminForm({...adminForm, password: e.target.value})} minLength={6} required />
                </label>
              </div>
            </div>
            
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-8">
              <button type="button" className="btn-secondary" onClick={() => setIsAddAdminModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={creatingAdmin}>
                {creatingAdmin ? "Adding..." : "Add Staff"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* WhatsApp Modal */}
      {isWhatsappModalOpen && (
        <div className="mobile-sheet">
          <form className="mobile-sheet-card w-full space-y-4" onSubmit={saveWhatsappSettings}>
            <div>
              <h3 className="text-xl font-bold text-slate-900">WhatsApp API</h3>
              <p className="mt-1 text-sm text-slate-600">Configure automated messaging for rent reminders and receipts.</p>
            </div>
            
            {whatsappLoading ? (
              <div className="flex justify-center py-10"><Loader2 className="animate-spin text-primary" size={24} /></div>
            ) : (
              <div className="space-y-4 mt-4">
                <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 cursor-pointer transition-all hover:bg-slate-100">
                  <input
                    type="checkbox"
                    className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary"
                    checked={whatsappForm.enabled}
                    onChange={(event) => setWhatsappForm((prev) => ({ ...prev, enabled: event.target.checked }))}
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-900">Enable Integration</span>
                    <p className="text-[12px] font-medium text-slate-500 mt-0.5">Sends automatic alerts using Fast2SMS.</p>
                  </div>
                </label>

                {whatsappForm.enabled && (
                  <div className="grid gap-4 sm:grid-cols-2 mt-4 animate-in fade-in slide-in-from-top-2">
                    <label className="space-y-1.5 col-span-2 sm:col-span-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">API Key</span>
                      <input className="input w-full" placeholder="Fast2SMS API key" value={whatsappForm.apiKey} onChange={e => setWhatsappForm({...whatsappForm, apiKey: e.target.value})} required={whatsappForm.enabled} />
                    </label>
                    <label className="space-y-1.5 col-span-2 sm:col-span-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Phone ID</span>
                      <input className="input w-full" placeholder="Phone number ID" value={whatsappForm.phoneNumberId} onChange={e => setWhatsappForm({...whatsappForm, phoneNumberId: e.target.value})} required={whatsappForm.enabled} />
                    </label>
                    <label className="space-y-1.5 col-span-2 sm:col-span-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Reminder Template</span>
                      <input className="input w-full" placeholder="Template Name" value={whatsappForm.templateReminder} onChange={e => setWhatsappForm({...whatsappForm, templateReminder: e.target.value})} required={whatsappForm.enabled} />
                    </label>
                    <label className="space-y-1.5 col-span-2 sm:col-span-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Receipt Template</span>
                      <input className="input w-full" placeholder="Template Name" value={whatsappForm.templateConfirmation} onChange={e => setWhatsappForm({...whatsappForm, templateConfirmation: e.target.value})} required={whatsappForm.enabled} />
                    </label>
                    <label className="space-y-1.5 col-span-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Language Code</span>
                      <input className="input w-full" placeholder="e.g. en" value={whatsappForm.languageCode} onChange={e => setWhatsappForm({...whatsappForm, languageCode: e.target.value})} required={whatsappForm.enabled} />
                    </label>
                  </div>
                )}
              </div>
            )}
            
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-8">
              <button type="button" className="btn-secondary" onClick={() => setIsWhatsappModalOpen(false)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={whatsappSaving}>
                {whatsappSaving ? "Saving..." : "Save Configuration"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Logo & Brand Modal */}
      {isLogoModalOpen && (
        <div className="mobile-sheet">
          <form className="mobile-sheet-card w-full space-y-4" onSubmit={handleSaveBrandSettings}>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Brand Settings</h3>
              <p className="mt-1 text-sm text-slate-600">Update the workspace name and app icon logo.</p>
            </div>
            
            <label className="block space-y-1.5 mt-4">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Workspace Name</span>
              <input 
                className="input w-full font-semibold" 
                value={pgName} 
                onChange={(e) => setPgName(e.target.value)} 
                required 
                placeholder="e.g. My Awesome PG"
              />
            </label>
            
            <div className="mt-4 flex flex-col items-center justify-center p-6 border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50 transition-colors hover:border-indigo-300 hover:bg-indigo-50">
              {pg?.logoUrl && !logoFile ? (
                <div className="relative group">
                  <img src={pg.logoUrl} alt="Current Logo" className="h-24 w-24 object-contain rounded-xl bg-white shadow-sm ring-1 ring-slate-200" />
                  <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <Image size={24} className="text-white" />
                  </div>
                </div>
              ) : logoFile ? (
                <div className="flex flex-col items-center text-center">
                  <div className="h-16 w-16 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-3">
                    <Upload size={28} />
                  </div>
                  <p className="text-sm font-semibold text-slate-900 truncate max-w-[200px]">{logoFile.name}</p>
                  <p className="text-xs text-slate-500 mt-1">{(logoFile.size / 1024).toFixed(1)} KB</p>
                </div>
              ) : (
                <div className="flex flex-col items-center text-center">
                  <div className="h-16 w-16 bg-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-3">
                    <Image size={28} />
                  </div>
                  <p className="text-sm font-semibold text-slate-700">Select new logo (optional)</p>
                  <p className="text-xs text-slate-500 mt-1">PNG, JPG or WEBP up to 5MB</p>
                </div>
              )}
              
              <label className="mt-4 btn-secondary cursor-pointer relative overflow-hidden text-xs py-2 px-4">
                <span>Browse Files</span>
                <input
                  type="file"
                  className="absolute inset-0 opacity-0 cursor-pointer"
                  accept="image/png, image/jpeg, image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) setLogoFile(file);
                  }}
                />
              </label>
            </div>
            
            <div className="mt-8 grid grid-cols-2 gap-3 sm:flex sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => { setIsLogoModalOpen(false); setLogoFile(null); }}>Cancel</button>
              <button type="submit" className="btn-primary bg-indigo-600 hover:bg-indigo-700 text-white" disabled={logoUploading}>
                {logoUploading ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModalAdmin && (
        <div className="mobile-sheet">
          <form className="mobile-sheet-card w-full space-y-4" onSubmit={handleResetPassword}>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Reset Password</h3>
              <p className="mt-1 text-sm text-slate-600">For <span className="font-semibold text-slate-900">{resetModalAdmin.name}</span></p>
            </div>
            
            <label className="block space-y-1.5 mt-4">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-500">New Password</span>
              <input
                className="input w-full"
                type="password"
                placeholder="Minimum 6 characters"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                required autoFocus minLength={6}
              />
            </label>
            
            <div className="mt-8 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setResetModalAdmin(null)}>Cancel</button>
              <button type="submit" className="btn-primary" disabled={Boolean(resettingAdminId)}>
                {resettingAdminId ? "Resetting..." : "Confirm"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default FounderPgDetail;
