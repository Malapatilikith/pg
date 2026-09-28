import { ReactNode } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import MobileTabBar from "./components/MobileTabBar";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Dashboard from "./pages/Dashboard";
import Login from "./pages/Login";
import Rooms from "./pages/Rooms";
import Persons from "./pages/Persons";
import Payments from "./pages/Payments";
import AdminManagement from "./pages/AdminManagement";
import PgManagement from "./pages/PgManagement";
import FounderPgDetail from "./pages/FounderPgDetail";
import { useDynamicFavicon } from "./hooks/useDynamicFavicon";

const AppShell = ({ children }: { children: ReactNode }) => {
  useDynamicFavicon();

  return (
    <div className="min-h-screen bg-[#F9FAFB] sm:py-4">
      <div className="app-shell app-fade-in">
        <section className="app-main">
          <Navbar />
          <main id="app-scroll-container" className="hide-scrollbar mobile-safe-bottom w-full flex-1 overflow-y-auto px-4 pb-4">
            <div className="page-appear">{children}</div>
          </main>
        </section>
      </div>
      <MobileTabBar />
    </div>
  );
};

const App = () => {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/"
        element={
          <ProtectedRoute>
            <AppShell>
              <Dashboard />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/rooms"
        element={
          <ProtectedRoute>
            <AppShell>
              <Rooms />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/persons"
        element={
          <ProtectedRoute>
            <AppShell>
              <Persons />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/payments"
        element={
          <ProtectedRoute>
            <AppShell>
              <Payments />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/admins"
        element={
          <ProtectedRoute allowedRoles={["superadmin"]}>
            <AppShell>
              <AdminManagement />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/pgs"
        element={
          <ProtectedRoute allowedRoles={["founder"]}>
            <AppShell>
              <PgManagement />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route
        path="/pgs/:id"
        element={
          <ProtectedRoute allowedRoles={["founder"]}>
            <AppShell>
              <FounderPgDetail />
            </AppShell>
          </ProtectedRoute>
        }
      />

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

export default App;
