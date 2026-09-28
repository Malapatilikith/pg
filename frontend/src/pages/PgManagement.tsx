import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { Link } from "react-router-dom";
import api from "../utils/api";
import type { ApiResponse, PgSummary } from "../types";
import { DoorOpen, Users, Plus, ChevronRight, MessageSquare, Building2 } from "lucide-react";

const defaultWhatsappForm = {
  enabled: false,
  apiKey: "",
  phoneNumberId: "",
  templateReminder: "",
  templateConfirmation: "",
  languageCode: "en"
};

const PgManagement = () => {
  const [pgs, setPgs] = useState<PgSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createWhatsapp, setCreateWhatsapp] = useState(defaultWhatsappForm);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setPortalTarget(document.getElementById("navbar-portal-target"));
  }, []);

  const loadPgs = async () => {
    setLoading(true);
    try {
      const response = await api.get<ApiResponse<PgSummary[]>>("/pgs");
      setPgs(response.data.data);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to load PGs");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadPgs();
  }, []);

  const handleCreate = async (event: React.FormEvent) => {
    event.preventDefault();

    const name = createName.trim();
    if (name.length < 2) {
      toast.error("PG name must be at least 2 characters");
      return;
    }

    if (createWhatsapp.enabled) {
      if (
        !createWhatsapp.apiKey.trim()
        || !createWhatsapp.phoneNumberId.trim()
        || !createWhatsapp.templateReminder.trim()
        || !createWhatsapp.templateConfirmation.trim()
      ) {
        toast.error("Complete all WhatsApp fields when enabled");
        return;
      }
    }

    setCreating(true);
    try {
      await api.post("/pgs", {
        name,
        whatsapp: createWhatsapp.enabled
          ? {
              enabled: true,
              apiKey: createWhatsapp.apiKey.trim(),
              phoneNumberId: createWhatsapp.phoneNumberId.trim(),
              templateReminder: createWhatsapp.templateReminder.trim(),
              templateConfirmation: createWhatsapp.templateConfirmation.trim(),
              languageCode: createWhatsapp.languageCode.trim() || "en"
            }
          : { enabled: false }
      });
      toast.success("PG created successfully");
      setCreateName("");
      setCreateWhatsapp(defaultWhatsappForm);
      setIsCreateModalOpen(false);
      await loadPgs();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to create PG");
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4 pb-24 sm:pb-4">
      {portalTarget &&
        createPortal(
          <button
            className="flex items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-bold text-white shadow-sm ring-1 ring-inset ring-primary/20 transition-all hover:bg-primary/90 active:scale-95 sm:px-4 sm:py-2"
            onClick={() => setIsCreateModalOpen(true)}
          >
            <Plus size={16} strokeWidth={3} />
            <span className="hidden sm:inline">Add Workspace</span>
            <span className="sm:hidden">Add</span>
          </button>,
          portalTarget
        )}

      {loading ? (
        <div className="flex justify-center py-20">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-100 border-t-primary" />
        </div>
      ) : (
        <>
          <div className="panel overflow-hidden stagger-fade">
            {pgs.map((pg) => (
              <Link
                key={pg.id}
                to={`/pgs/${pg.id}`}
                className="group flex items-center justify-between border-b border-black/[0.03] bg-white p-4 last:border-0 hover:bg-slate-50 transition-colors"
              >
                <div className="flex items-center gap-4 min-w-0 pr-4">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-indigo-50 text-indigo-600">
                    <Building2 size={24} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-[17px] font-semibold text-slate-900 leading-tight truncate">{pg.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      {pg.whatsappEnabled && (
                        <span className="flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-emerald-600">
                          <MessageSquare size={10} className="fill-emerald-500/20" /> WhatsApp
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col items-end">
                    <span className="text-[15px] font-bold text-slate-900">{pg.roomsCount ?? 0} Rooms</span>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-blue-600">{pg.tenantsCount ?? 0} Tenants</span>
                  </div>
                  <ChevronRight size={18} className="text-slate-400 group-hover:text-primary transition-colors" />
                </div>
              </Link>
            ))}
          </div>
          {pgs.length === 0 && (
            <div className="panel rounded-3xl p-10 flex flex-col items-center justify-center text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-100 text-slate-400 mb-4">
                <Building2 size={32} />
              </div>
              <h3 className="text-lg font-bold text-slate-900">No Workspaces Found</h3>
              <p className="text-sm text-slate-500 mt-1 mb-4">You haven't created any PGs yet.</p>
              <button className="btn-primary px-6" onClick={() => setIsCreateModalOpen(true)}>
                Create First Workspace
              </button>
            </div>
          )}
        </>
      )}

      {isCreateModalOpen && (
        <div className="mobile-sheet">
          <form className="mobile-sheet-card w-full max-w-xl space-y-4" onSubmit={handleCreate}>
            <div>
              <h3 className="text-xl font-bold text-slate-900">New Workspace</h3>
              <p className="mt-1 text-sm text-slate-600">
                Set up a new property. You can configure WhatsApp notifications later.
              </p>
            </div>

            <div className="space-y-4 mt-2">
              <label className="space-y-1.5 block">
                <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Property Name</span>
                <input
                  className="input w-full text-base"
                  placeholder="e.g. Sai Sanvi PG"
                  value={createName}
                  onChange={(event) => setCreateName(event.target.value)}
                  required
                  autoFocus
                />
              </label>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/50 p-4 transition-all">
                <label className="flex items-start gap-3 cursor-pointer">
                  <div className="flex h-6 items-center">
                    <input
                      type="checkbox"
                      className="h-5 w-5 rounded border-slate-300 text-primary focus:ring-primary transition-all"
                      checked={createWhatsapp.enabled}
                      onChange={(event) => setCreateWhatsapp((prev) => ({ ...prev, enabled: event.target.checked }))}
                    />
                  </div>
                  <div className="pt-0.5">
                    <p className="text-sm font-bold text-slate-900">Enable WhatsApp API</p>
                    <p className="text-[13px] font-medium text-slate-500 mt-0.5 leading-snug">Configure messaging templates and Fast2SMS credentials now.</p>
                  </div>
                </label>

                {createWhatsapp.enabled && (
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 animate-in fade-in slide-in-from-top-2 duration-300">
                    <label className="space-y-1.5 col-span-2 sm:col-span-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">API Key</span>
                      <input className="input w-full bg-white" placeholder="Fast2SMS API key" value={createWhatsapp.apiKey} onChange={e => setCreateWhatsapp(p => ({...p, apiKey: e.target.value}))} />
                    </label>
                    <label className="space-y-1.5 col-span-2 sm:col-span-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Phone ID</span>
                      <input className="input w-full bg-white" placeholder="Phone number ID" value={createWhatsapp.phoneNumberId} onChange={e => setCreateWhatsapp(p => ({...p, phoneNumberId: e.target.value}))} />
                    </label>
                    <label className="space-y-1.5 col-span-2 sm:col-span-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Reminder Template</span>
                      <input className="input w-full bg-white" placeholder="Template Name" value={createWhatsapp.templateReminder} onChange={e => setCreateWhatsapp(p => ({...p, templateReminder: e.target.value}))} />
                    </label>
                    <label className="space-y-1.5 col-span-2 sm:col-span-1">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Receipt Template</span>
                      <input className="input w-full bg-white" placeholder="Template Name" value={createWhatsapp.templateConfirmation} onChange={e => setCreateWhatsapp(p => ({...p, templateConfirmation: e.target.value}))} />
                    </label>
                    <label className="space-y-1.5 col-span-2">
                      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">Language Code</span>
                      <input className="input w-full bg-white" placeholder="e.g. en" value={createWhatsapp.languageCode} onChange={e => setCreateWhatsapp(p => ({...p, languageCode: e.target.value}))} />
                    </label>
                  </div>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end mt-6 pt-2">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsCreateModalOpen(false)}
              >
                Cancel
              </button>
              <button className="btn-primary" type="submit" disabled={creating}>
                {creating ? "Creating..." : "Create Workspace"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default PgManagement;
