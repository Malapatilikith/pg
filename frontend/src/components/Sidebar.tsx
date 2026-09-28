import { Building2, ChevronRight, CreditCard, LayoutDashboard, ShieldCheck, Sparkles, Users2, X } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const Sidebar = ({ open, onClose }: { open: boolean; onClose: () => void }) => {
  const { user, activePg } = useAuth();
  const activePgName = user?.pgName || activePg?.name || null;

  const menu = [
    { to: "/", label: "Dashboard", icon: LayoutDashboard },
    { to: "/rooms", label: "Rooms", icon: Building2 },
    { to: "/persons", label: "Tenants", icon: Users2 },
    { to: "/payments", label: "Payments", icon: CreditCard }
  ];

  if (user?.role === "superadmin") {
    menu.push({ to: "/admins", label: "Admins", icon: ShieldCheck });
  }

  return (
    <>
      <div
        className={[
          "fixed inset-0 z-40 bg-slate-900/45 transition lg:hidden",
          open ? "opacity-100" : "pointer-events-none opacity-0"
        ].join(" ")}
        onClick={onClose}
      />

      <aside
        className={[
          "fixed left-0 top-0 z-50 h-full w-72 border-r border-slate-200/70 bg-white/95 p-4 shadow-xl backdrop-blur transition-transform duration-300 lg:static lg:z-auto lg:h-auto lg:w-[270px] lg:translate-x-0 lg:border-r lg:border-slate-200/80 lg:bg-white/35 lg:shadow-none",
          open ? "translate-x-0" : "-translate-x-full"
        ].join(" ")}
      >
        <div className="mb-4 flex items-center justify-between lg:hidden">
          <p className="text-sm font-bold uppercase tracking-[0.22em] text-blue-700">Menu</p>
          <button className="btn-secondary p-2" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-gradient-to-br from-slate-900 via-blue-900 to-cyan-700 p-4 text-white shadow-lg">
          <div className="absolute -right-8 -top-8 h-20 w-20 rounded-full bg-white/10" />
          <div className="absolute -bottom-8 -left-8 h-24 w-24 rounded-full bg-cyan-300/20" />

          <div className="relative flex items-start justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-blue-100">Workspace</p>
              <h1 className="mt-1 font-display text-3xl leading-none">{activePgName || "PG Management"}</h1>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-white/20 bg-white/10 px-2 py-1 text-xs font-semibold text-blue-100">
              <Sparkles size={12} />
              Live
            </span>
          </div>

          <div className="relative mt-4 rounded-xl border border-white/15 bg-white/10 p-3">
            <p className="text-[11px] uppercase tracking-[0.2em] text-blue-100">Signed In Role</p>
            <p className="mt-1 text-sm font-semibold capitalize text-white">{user?.role ?? "-"}</p>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between px-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-500">Operations</p>
          <p className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">{menu.length}</p>
        </div>

        <nav className="mt-3 flex flex-col gap-1">
          {menu.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                [
                  "group flex items-center justify-between rounded-2xl px-3 py-2.5 text-sm font-semibold transition",
                  isActive
                    ? "bg-gradient-to-r from-blue-50 to-cyan-50 text-blue-700 shadow-sm"
                    : "text-slate-600 hover:bg-slate-100"
                ].join(" ")
              }
            >
              <span className="flex items-center gap-3">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-slate-100 text-slate-600 transition group-hover:bg-white group-hover:text-blue-700">
                  <item.icon size={16} className="transition group-hover:scale-105" />
                </span>
                <span>{item.label}</span>
              </span>
              <ChevronRight size={16} className="text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-600" />
            </NavLink>
          ))}
        </nav>

        <div className="mt-6 rounded-3xl border border-slate-200 bg-slate-50/80 p-3">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Workspace</p>
          <p className="mt-1 text-sm font-semibold text-slate-700">{activePgName || "PG Workspace"}</p>
          <p className="mt-1 text-xs text-slate-500">Manage rooms, tenants, payments, and reminders from one place.</p>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
