import { Navigate, useLocation } from "react-router-dom";
import type { ReactElement } from "react";
import { useAuth } from "../hooks/useAuth";
import type { Role } from "../types";

const ProtectedRoute = ({
  children,
  allowedRoles
}: {
  children: ReactElement;
  allowedRoles?: Role[];
}) => {
  const { user, loading, isAuthenticated, activePg } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center px-4">
        <div className="panel flex items-center gap-3 px-5 py-4">
          <div className="h-9 w-9 animate-spin rounded-full border-4 border-blue-200 border-t-primary" />
          <p className="text-sm font-semibold text-slate-700">Loading workspace...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    return <Navigate to="/" replace />;
  }

  if (user.role === "founder" && !location.pathname.startsWith("/pgs")) {
    return <Navigate to="/pgs" replace />;
  }



  return children;
};

export default ProtectedRoute;
