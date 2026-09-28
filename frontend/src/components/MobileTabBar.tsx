import { Building2, CreditCard, LayoutDashboard, ShieldCheck, Sparkles, Users2, User } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { useAuth } from "../hooks/useAuth";

const MobileTabBar = () => {
  const { user } = useAuth();
  const location = useLocation();

  const menu = [
    { to: "/", label: "Home", icon: LayoutDashboard },
    { to: "/rooms", label: "Rooms", icon: Building2 },
    { to: "/persons", label: "Tenants", icon: Users2 },
    { to: "/payments", label: "Payments", icon: CreditCard }
  ];

  if (user?.role === "founder") {
    const isPgsRoute = location.pathname.startsWith("/pgs");
    
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 sm:hidden border-t border-black/5 bg-white/85 backdrop-blur-2xl pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 px-2">
        <nav className="mx-auto flex max-w-md items-center justify-around">
          <NavLink
            to="/pgs"
            className={[
              "flex flex-col items-center gap-1 min-w-[4rem] px-1 py-1 transition-colors duration-200",
              isPgsRoute ? "text-primary" : "text-slate-400 hover:text-slate-600"
            ].join(" ")}
          >
            <div className={`transition-transform duration-200 ${isPgsRoute ? 'scale-110' : 'scale-100'}`}>
              <Sparkles size={22} strokeWidth={isPgsRoute ? 2.5 : 2} />
            </div>
            <span className={`text-[10px] font-medium ${isPgsRoute ? 'font-semibold' : ''}`}>Workspaces</span>
          </NavLink>
        </nav>
      </div>
    );
  }

  if (user?.role === "superadmin") {
    menu.push({ to: "/admins", label: "Admins", icon: ShieldCheck });
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 sm:hidden border-t border-black/5 bg-white/85 backdrop-blur-2xl pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 px-2">
      <nav className="mx-auto flex max-w-md items-center justify-around">
        {menu.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              [
                "flex flex-col items-center gap-1 min-w-[4rem] px-1 py-1 transition-colors duration-200",
                isActive ? "text-primary" : "text-slate-400 hover:text-slate-600"
              ].join(" ")
            }
          >
            {({ isActive }) => (
              <>
                <div className={`transition-transform duration-200 ${isActive ? 'scale-110' : 'scale-100'}`}>
                  <item.icon size={22} strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] font-medium ${isActive ? 'font-semibold' : ''}`}>{item.label}</span>
              </>
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  );
};

export default MobileTabBar;
