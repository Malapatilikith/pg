import { LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const titleMap: Record<string, string> = {
  "/rooms": "Rooms",
  "/persons": "Tenants",
  "/payments": "Payments",
  "/pgs": "Workspaces",
  "/admins": "Admin Management"
};

const Navbar = () => {
  const location = useLocation();
  const { logout, user, activePg } = useAuth();
  const headerRef = useRef<HTMLElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const activePgName = user?.pgName || activePg?.name || null;
  
  const pageTitle =
    location.pathname === "/"
      ? activePgName || "Dashboard"
      : titleMap[location.pathname] ?? "Overview";

  useEffect(() => {
    const appScrollContainer = document.getElementById("app-scroll-container");
    if (appScrollContainer) {
      const syncHeaderVisibility = () => {
        setIsScrolled(appScrollContainer.scrollTop > 10);
      };

      syncHeaderVisibility();
      appScrollContainer.addEventListener("scroll", syncHeaderVisibility, { passive: true });

      return () => {
        appScrollContainer.removeEventListener("scroll", syncHeaderVisibility);
      };
    }

    const syncWindowVisibility = () => {
      setIsScrolled(window.scrollY > 10);
    };

    syncWindowVisibility();
    window.addEventListener("scroll", syncWindowVisibility, { passive: true });

    return () => {
      window.removeEventListener("scroll", syncWindowVisibility);
    };
  }, [location.pathname]);

  return (
    <header
      ref={headerRef}
      className={`sticky top-0 z-30 w-full transition-all duration-300 ${
        isScrolled 
          ? "bg-white/85 backdrop-blur-xl border-b border-black/5 pb-3 pt-3" 
          : "bg-[#F9FAFB] pb-4 pt-6"
      }`}
    >
      <div className="flex items-end justify-between px-4 sm:px-6">
        <div className="flex flex-col justify-end min-h-[2.5rem]">
          <div className={`flex items-center gap-3 transition-all duration-300 origin-left ${
            isScrolled ? "scale-90 sm:scale-100" : "scale-100"
          }`}>
            <div id="navbar-left-portal-target" className="flex items-center empty:hidden" />
            <h2 className={`flex items-center gap-2 font-bold tracking-tight text-slate-900 transition-all duration-300 ${
              isScrolled ? "text-xl md:text-2xl" : "text-[2rem] leading-none md:text-[2.5rem]"
            }`}>
              {location.pathname.startsWith("/pgs/") ? <span id="navbar-title-target" /> : pageTitle}
            </h2>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div id="navbar-portal-target" className="flex items-center" />
          
          <div className="hidden sm:flex flex-col items-end">
            <span className="text-sm font-semibold text-slate-900 leading-tight">{user?.name || "User"}</span>
            <span className="text-[11px] uppercase font-bold tracking-wider text-slate-400">{user?.role || "Role"}</span>
          </div>
          
          <button onClick={logout} className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-panel ring-1 ring-black/[0.03] text-slate-600 transition-all duration-200 hover:bg-slate-50 active:scale-95" title="Logout">
             <LogOut size={18} />
          </button>
        </div>
      </div>
    </header>
  );
};

export default Navbar;
