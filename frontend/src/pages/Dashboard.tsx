import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { StatsGridSkeleton } from "../components/LoadingLayout";
import api from "../utils/api";
import type { ApiResponse, PaginatedData, Payment, Person, Room } from "../types";
import { Building2, CreditCard, Users, BedDouble, CheckCircle2, AlertCircle, ArrowRight } from "lucide-react";

type MonthlyPaymentsSummary = PaginatedData<Payment> & {
  totalAmount: string;
};

const formatCurrency = (value: number) => {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(value);
};

const Dashboard = () => {
  const [stats, setStats] = useState({
    totalRooms: 0,
    occupiedRooms: 0,
    availableRooms: 0,
    activeTenants: 0,
    monthlyRevenue: 0,
    paymentsPending: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const now = new Date();
        const month = now.getMonth() + 1;
        const year = now.getFullYear();

        const [
          roomsTotalRes,
          occupiedRoomsRes,
          availableRoomsRes,
          activeTenantsRes,
          paidPaymentsRes,
          unpaidPaymentsRes
        ] = await Promise.all([
          api.get<ApiResponse<PaginatedData<Room>>>("/rooms?page=1&pageSize=1"),
          api.get<ApiResponse<PaginatedData<Room>>>("/rooms?page=1&pageSize=1&status=occupied"),
          api.get<ApiResponse<PaginatedData<Room>>>("/rooms?page=1&pageSize=1&status=available"),
          api.get<ApiResponse<PaginatedData<Person>>>("/persons?page=1&pageSize=1&status=active"),
          api.get<ApiResponse<MonthlyPaymentsSummary>>(`/payments/month/${month}/${year}?page=1&pageSize=1&status=paid`),
          api.get<ApiResponse<PaginatedData<Payment>>>(
            `/payments/month/${month}/${year}?page=1&pageSize=1&status=unpaid&personStatus=active`
          )
        ]);

        setStats({
          totalRooms: roomsTotalRes.data.data.pagination.total,
          occupiedRooms: occupiedRoomsRes.data.data.pagination.total,
          availableRooms: availableRoomsRes.data.data.pagination.total,
          activeTenants: activeTenantsRes.data.data.pagination.total,
          monthlyRevenue: Number(paidPaymentsRes.data.data.totalAmount || 0),
          paymentsPending: unpaidPaymentsRes.data.data.pagination.total
        });
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const statCards = [
    { label: "Available Rooms", value: stats.availableRooms, icon: BedDouble, color: "text-emerald-500", bg: "bg-emerald-50", to: "/rooms?status=available" },
    { label: "Active Tenants", value: stats.activeTenants, icon: Users, color: "text-blue-500", bg: "bg-blue-50", to: "/persons?status=active" },
    { label: "Payments Pending", value: stats.paymentsPending, icon: AlertCircle, color: "text-rose-500", bg: "bg-rose-50", to: "/payments?status=unpaid" },
    { label: "Total Rooms", value: stats.totalRooms, icon: Building2, color: "text-slate-500", bg: "bg-slate-50", to: "/rooms" },
  ];

  if (loading) {
    return (
      <div className="space-y-4">
        <StatsGridSkeleton items={4} />
      </div>
    );
  }

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Quick Stats Grid */}
      <section className="grid grid-cols-2 gap-3 sm:gap-4">
        {statCards.map((item) => (
          <Link
            key={item.label}
            to={item.to}
            className="group relative overflow-hidden rounded-[2rem] bg-white p-5 shadow-panel ring-1 ring-black/[0.03] transition-all active:scale-95"
          >
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-full ${item.bg} ${item.color}`}>
              <item.icon size={20} strokeWidth={2.5} />
            </div>
            <p className="text-3xl font-black tracking-tight text-slate-900">{item.value}</p>
            <p className="mt-1 text-[13px] font-semibold text-slate-500 leading-tight pr-4">{item.label}</p>
          </Link>
        ))}
      </section>

      {/* Financial Overview Card */}
      <section>
        <div className="panel overflow-hidden p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-bold uppercase tracking-widest text-slate-400 mb-1">Monthly Revenue</h3>
              <p className="text-4xl font-black text-slate-900">{formatCurrency(stats.monthlyRevenue)}</p>
            </div>

            <div className="shrink-0 flex flex-col items-center gap-2 rounded-2xl bg-slate-50 px-4 py-3 text-slate-300 min-w-[6.5rem]">
              <p className="flex items-center justify-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-500 text-center leading-none">
                <CheckCircle2 size={12} className="shrink-0" />
                <span>Collected</span>
              </p>
              <CreditCard size={38} className="block" />
            </div>
          </div>

          <Link to="/payments" className="btn-primary mt-4 flex w-full items-center justify-center gap-2">
            Manage Payments <ArrowRight size={18} />
          </Link>
        </div>
      </section>
      
      {/* Quick Actions List */}
      <section>
         <h3 className="text-[13px] font-bold uppercase tracking-widest text-slate-500 mb-3 px-2">Quick Access</h3>
         <div className="panel overflow-hidden">
            <Link to="/rooms" className="group flex items-center justify-between p-4 bg-white active:bg-slate-50 transition-colors cursor-pointer border-b border-black/[0.03]">
               <div className="flex items-center gap-4">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600">
                     <Building2 size={20} />
                  </div>
                  <span className="font-semibold text-slate-900">Rooms & Allocation</span>
               </div>
               <ChevronRightIcon />
            </Link>
            <Link to="/persons" className="group flex items-center justify-between p-4 bg-white active:bg-slate-50 transition-colors cursor-pointer border-b border-black/[0.03]">
               <div className="flex items-center gap-4">
                  <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600">
                     <Users size={20} />
                  </div>
                  <span className="font-semibold text-slate-900">Tenant Records</span>
               </div>
               <ChevronRightIcon />
            </Link>
         </div>
      </section>
    </div>
  );
};

const ChevronRightIcon = () => <ArrowRight size={20} className="text-slate-300 transition-colors" />;

export default Dashboard;
