import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CheckCircle2, XCircle, X, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import { TableSkeleton, ToolbarSkeleton } from "../components/LoadingLayout";
import PaginationControls from "../components/PaginationControls";
import PaymentTable from "../components/PaymentTable";
import UploadModal from "../components/UploadModal";
import { useAuth } from "../hooks/useAuth";
import api from "../utils/api";
import { useDebounce } from "../hooks/useDebounce";
import { formatDateDMY } from "../utils/date";
import type { ApiResponse, PaginatedData, PaginationMeta, Payment, Person } from "../types";

const clampInteger = (value: string, min: number, max: number, fallback: number) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.trunc(parsed)));
};

const sanitizeAmountInput = (value: string) => {
  const cleaned = value.replace(/[^\d.]/g, "");
  const [intPart = "", decimalPart = ""] = cleaned.split(".");
  const normalizedInt = intPart.replace(/^0+(?=\d)/, "");

  if (cleaned.includes(".")) {
    return `${normalizedInt || "0"}.${decimalPart.slice(0, 2)}`;
  }

  return normalizedInt;
};

const createManualForm = (month: number, year: number) => ({
  roomId: "",
  personId: "",
  month: String(month),
  year: String(year),
  amount: "",
  isPaid: false,
  paidOn: new Date().toISOString().slice(0, 10)
});

type ReminderType = "reminder_1" | "reminder_2" | "reminder_3";

type ReminderRunState = {
  month: number;
  year: number;
  startedAt: string;
  reminderType: ReminderType;
  totalTargets: number;
  attempted: number;
  sent: number;
  failed: number;
  remaining: number;
  completed: boolean;
};

const REMINDER_RUN_STORAGE_KEY = "payments-reminder-run-state";

const formatReminderTypeLabel = (reminderType: ReminderType | null | undefined) => {
  if (reminderType === "reminder_1") {
    return "Reminder 1";
  }
  if (reminderType === "reminder_2") {
    return "Reminder 2";
  }
  if (reminderType === "reminder_3") {
    return "Reminder 3";
  }
  return "Reminder";
};

const readStoredReminderRun = (): ReminderRunState | null => {
  if (typeof window === "undefined") {
    return null;
  }

  const raw = window.localStorage.getItem(REMINDER_RUN_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as ReminderRunState;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
};

const persistReminderRun = (value: ReminderRunState) => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.setItem(REMINDER_RUN_STORAGE_KEY, JSON.stringify(value));
};

const clearStoredReminderRun = () => {
  if (typeof window === "undefined") {
    return;
  }
  window.localStorage.removeItem(REMINDER_RUN_STORAGE_KEY);
};

const Payments = () => {
  const { user } = useAuth();
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [monthInput, setMonthInput] = useState(String(now.getMonth() + 1));
  const [yearInput, setYearInput] = useState(String(now.getFullYear()));
  const [statusFilter, setStatusFilter] = useState("all");
  const personStatusFilter = "active";
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [page, setPage] = useState(1);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });
  const [persons, setPersons] = useState<Person[]>([]);
  const [loading, setLoading] = useState(false);
  const [personsLoading, setPersonsLoading] = useState(false);
  const [details, setDetails] = useState<Person | null>(null);
  const [detailPayments, setDetailPayments] = useState<Payment[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [previewPayment, setPreviewPayment] = useState<Payment | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [manualSaving, setManualSaving] = useState(false);
  const [manualForm, setManualForm] = useState(() => createManualForm(now.getMonth() + 1, now.getFullYear()));
  const [uploading, setUploading] = useState(false);
  const [sendingReminders, setSendingReminders] = useState(false);
  const [reminderRun, setReminderRun] = useState<ReminderRunState | null>(null);
  const [reminderPollingError, setReminderPollingError] = useState(false);
  const [markingPaidId, setMarkingPaidId] = useState<string | null>(null);
  const [stats, setStats] = useState({ paid: 0, unpaid: 0 });
  const [statsLoading, setStatsLoading] = useState(false);
  const [initialFetch, setInitialFetch] = useState(true);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const isInitialLoading = loading && initialFetch;

  useEffect(() => {
    setPortalTarget(document.getElementById("navbar-portal-target"));
    return () => {
      // Cleanup on unmount, but the portal will unmount naturally
    };
  }, []);

  useEffect(() => {
    const stored = readStoredReminderRun();
    if (stored && !stored.completed) {
      setReminderRun(stored);
    } else if (stored?.completed) {
      clearStoredReminderRun();
    }
  }, []);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      const personStatusQuery = `&personStatus=${personStatusFilter}`;
      const [paidRes, unpaidRes] = await Promise.all([
        api.get<ApiResponse<PaginatedData<Payment>>>(
          `/payments/month/${month}/${year}?page=1&pageSize=1&status=paid${personStatusQuery}`
        ),
        api.get<ApiResponse<PaginatedData<Payment>>>(
          `/payments/month/${month}/${year}?page=1&pageSize=1&status=unpaid${personStatusQuery}`
        )
      ]);
      setStats({
        paid: paidRes.data.data.pagination.total,
        unpaid: unpaidRes.data.data.pagination.total
      });
    } catch (error) {
      // ignore
    } finally {
      setStatsLoading(false);
    }
  };

  const loadPayments = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20",
        status: statusFilter
      });
      params.set("personStatus", personStatusFilter);
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }

      const response = await api.get<ApiResponse<PaginatedData<Payment>>>(`/payments/month/${month}/${year}?${params.toString()}`);
      setPayments(response.data.data.items);
      setPagination(response.data.data.pagination);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to load payments");
    } finally {
      setLoading(false);
      setInitialFetch(false);
    }
  };

  useEffect(() => {
    void loadPayments();
  }, [month, year, statusFilter, debouncedSearch, page]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  useEffect(() => {
    void loadStats();
  }, [month, year]);

  useEffect(() => {
    setMonthInput(String(month));
  }, [month]);

  useEffect(() => {
    setYearInput(String(year));
  }, [year]);

  useEffect(() => {
    if (!reminderRun || reminderRun.completed || reminderRun.totalTargets <= 0) {
      return;
    }

    let active = true;
    const pollStatus = async () => {
      try {
        const params = new URLSearchParams({
          month: String(reminderRun.month),
          year: String(reminderRun.year),
          startedAt: reminderRun.startedAt,
          reminderType: reminderRun.reminderType,
          totalTargets: String(reminderRun.totalTargets)
        });

        const response = await api.get<ApiResponse<ReminderRunState>>(`/notifications/trigger-auto/status?${params.toString()}`);
        if (!active) {
          return;
        }
        setReminderPollingError(false);

        setReminderRun((current) => {
          if (!current) {
            return current;
          }

          const next = {
            ...current,
            ...response.data.data
          };

          if (next.completed && !current.completed) {
            clearStoredReminderRun();
            toast.success(
              `${formatReminderTypeLabel(next.reminderType)} run complete. Sent: ${next.sent}, Failed: ${next.failed}`
            );
            void loadPayments();
            void loadStats();
            window.setTimeout(() => {
              setReminderRun(null);
            }, 2500);
          } else if (!next.completed) {
            persistReminderRun(next);
          }

          return next;
        });
      } catch {
        if (active) {
          setReminderPollingError(true);
        }
      }
    };

    void pollStatus();
    const intervalId = window.setInterval(() => {
      void pollStatus();
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(intervalId);
    };
  }, [
    reminderRun?.month,
    reminderRun?.year,
    reminderRun?.startedAt,
    reminderRun?.reminderType,
    reminderRun?.totalTargets,
    reminderRun?.completed
  ]);

  const commitMonthInput = () => {
    const nextMonth = clampInteger(monthInput, 1, 12, month);
    setMonth(nextMonth);
    setMonthInput(String(nextMonth));
    setPage(1);
  };

  const commitYearInput = () => {
    const nextYear = clampInteger(yearInput, 2000, 3000, year);
    setYear(nextYear);
    setYearInput(String(nextYear));
    setPage(1);
  };

  const loadPersons = async () => {
    setPersonsLoading(true);
    try {
      const response = await api.get<ApiResponse<PaginatedData<Person>>>(
        "/persons?page=1&pageSize=200&status=active"
      );
      setPersons(response.data.data.items);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to load tenants for manual payment");
    } finally {
      setPersonsLoading(false);
    }
  };

  const roomOptions = useMemo(() => {
    const roomMap = new Map<string, string>();
    for (const person of persons) {
      if (!person.roomId || !person.roomNumber) {
        continue;
      }
      if (!roomMap.has(person.roomId)) {
        roomMap.set(person.roomId, person.roomNumber);
      }
    }

    return Array.from(roomMap.entries())
      .map(([id, roomNumber]) => ({ id, roomNumber }))
      .sort((a, b) => a.roomNumber.localeCompare(b.roomNumber, undefined, { numeric: true, sensitivity: "base" }));
  }, [persons]);

  const tenantOptions = useMemo(() => {
    if (!manualForm.roomId) {
      return [];
    }

    return persons.filter((person) => person.roomId === manualForm.roomId);
  }, [persons, manualForm.roomId]);

  const markPaid = async (payment: Payment) => {
    setMarkingPaidId(payment.id);
    try {
      await api.put(`/payments/${payment.id}/mark-paid`);
      toast.success("Payment marked as paid");
      setSelectedPayment(payment);
      await loadPayments();
      await loadStats();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to mark paid");
    } finally {
      setMarkingPaidId(null);
    }
  };

  const uploadReceipt = async (file: File) => {
    if (!selectedPayment) {
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/payments/${selectedPayment.id}/receipt`, fd);
      toast.success("Receipt uploaded");
      setSelectedPayment(null);
      await loadPayments();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to upload receipt");
    } finally {
      setUploading(false);
    }
  };

  const handleReceiptAction = (payment: Payment) => {
    if (payment.receiptUrl) {
      setPreviewPayment(payment);
      return;
    }

    setSelectedPayment(payment);
  };

  const isPdfReceipt = (url: string) => /\.pdf($|\?)/i.test(url);

  const openTenantDetails = async (personId: string) => {
    setDetailsLoading(true);
    try {
      const [personRes, paymentsRes] = await Promise.all([
        api.get<ApiResponse<Person>>(`/persons/${personId}`),
        api.get<ApiResponse<Payment[]>>(`/payments/${personId}`)
      ]);

      const sortedPayments = [...paymentsRes.data.data].sort((a, b) => {
        const ay = a.year ?? 0;
        const by = b.year ?? 0;
        if (ay !== by) {
          return by - ay;
        }
        const am = a.month ?? 0;
        const bm = b.month ?? 0;
        return bm - am;
      });

      setDetails(personRes.data.data);
      setDetailPayments(sortedPayments);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to load tenant details");
    } finally {
      setDetailsLoading(false);
    }
  };

  const sendRelevantReminders = async () => {
    setSendingReminders(true);
    try {
      const response = await api.post<
        ApiResponse<
          | {
            started: true;
            month: number;
            year: number;
            mode: "all_unpaid";
            startedAt: string;
            reminderType: ReminderType;
            totalUnpaid: number;
            totalTargets: number;
            alreadySent: number;
          }
          | {
            started: false;
            month: number;
            year: number;
            mode: "all_unpaid";
            startedAt: string;
            reminderType: ReminderType | null;
            totalUnpaid: number;
            totalTargets: number;
            alreadySent: number;
          }
        >
      >("/notifications/trigger-auto", { month, year, mode: "all_unpaid" });

      const payload = response.data.data;
      if ("started" in payload && payload.started) {
        const nextRun: ReminderRunState = {
          month: payload.month,
          year: payload.year,
          startedAt: payload.startedAt,
          reminderType: payload.reminderType,
          totalTargets: payload.totalTargets,
          attempted: 0,
          sent: 0,
          failed: 0,
          remaining: payload.totalTargets,
          completed: false
        };
        setReminderRun(nextRun);
        persistReminderRun(nextRun);
        toast.success(
          `${formatReminderTypeLabel(payload.reminderType)} run started in background for ${payload.totalTargets} unpaid tenants.`
        );
      } else {
        setReminderRun(null);
        clearStoredReminderRun();
        if (!payload.reminderType) {
          toast.success("No reminder rule is applicable for today.");
        } else {
          toast.success(`No unpaid tenants pending for ${formatReminderTypeLabel(payload.reminderType)}.`);
        }
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to send reminders");
    } finally {
      setSendingReminders(false);
    }
  };

  const reminderRunProgress = reminderRun
    ? Math.min(100, Math.round((reminderRun.attempted / Math.max(reminderRun.totalTargets, 1)) * 100))
    : 0;

  const isReminderRunActive = Boolean(reminderRun && !reminderRun.completed);

  const createManualPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.roomId) {
      toast.error("Please select a room number");
      return;
    }

    if (!manualForm.personId) {
      toast.error("Please select a tenant");
      return;
    }

    const targetMonth = clampInteger(manualForm.month, 1, 12, month);
    const targetYear = clampInteger(manualForm.year, 2000, 3000, year);
    const parsedAmount = Number(manualForm.amount);

    if (!manualForm.amount || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    setManualSaving(true);
    try {
      const normalizedAmount = Number(parsedAmount.toFixed(2));

      const saveResponse = await api.post<ApiResponse<Payment>>("/payments/manual", {
        personId: manualForm.personId,
        month: targetMonth,
        year: targetYear,
        amount: normalizedAmount,
        isPaid: manualForm.isPaid,
        paidOn: manualForm.isPaid ? manualForm.paidOn : ""
      });

      toast.success(saveResponse.data.message || "Payment saved");
      setManualOpen(false);
      setManualForm(createManualForm(month, year));

      if (month !== targetMonth) {
        setMonth(targetMonth);
      }
      if (year !== targetYear) {
        setYear(targetYear);
      }

      setPage(1);

      const refreshed = await api.get<ApiResponse<PaginatedData<Payment>>>(
        `/payments/month/${targetMonth}/${targetYear}?page=1&pageSize=20&status=${statusFilter}`
          + `&personStatus=${personStatusFilter}`
      );
      setPayments(refreshed.data.data.items);
      setPagination(refreshed.data.data.pagination);
      await loadStats();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to add manual payment");
    } finally {
      setManualSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {portalTarget && createPortal(
        <div className="flex items-center gap-2 sm:gap-3 ml-1 sm:ml-2 animate-in fade-in slide-in-from-left-4 duration-500">
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-600 ring-1 ring-inset ring-emerald-500/20 backdrop-blur-sm transition-all hover:bg-emerald-500/20 shadow-sm sm:px-3 sm:py-1.5">
            <CheckCircle2 size={16} className="stroke-[2.5]" />
            <span className="text-sm font-black text-emerald-700">{statsLoading ? "-" : stats.paid}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-rose-600 ring-1 ring-inset ring-rose-500/20 backdrop-blur-sm transition-all hover:bg-rose-500/20 shadow-sm sm:px-3 sm:py-1.5">
            <XCircle size={16} className="stroke-[2.5]" />
            <span className="text-sm font-black text-rose-700">{statsLoading ? "-" : stats.unpaid}</span>
          </div>
        </div>,
        portalTarget
      )}

      {isInitialLoading ? (
        <>
          <ToolbarSkeleton withButton={user?.role === "superadmin" || user?.role === "admin"} />
          <TableSkeleton columns={8} rows={7} />
        </>
      ) : (
        <>
          <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div className="grid w-full grid-cols-2 gap-3 sm:flex sm:w-auto sm:flex-wrap">
              <div className="col-span-1">
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Month</label>
                <input
                  className="input w-full sm:w-24"
                  type="number"
                  min={1}
                  max={12}
                  value={monthInput}
                  onChange={(e) => {
                    setMonthInput(e.target.value);
                  }}
                  onBlur={commitMonthInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitMonthInput();
                    }
                  }}
                />
              </div>
              <div className="col-span-1">
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Year</label>
                <input
                  className="input w-full sm:w-28"
                  type="number"
                  min={2000}
                  max={3000}
                  value={yearInput}
                  onChange={(e) => {
                    setYearInput(e.target.value);
                  }}
                  onBlur={commitYearInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      commitYearInput();
                    }
                  }}
                />
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Status</label>
                <select
                  className="input w-full sm:w-36"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                </select>
              </div>
              <div className="col-span-2 sm:col-span-1">
                <label className="mb-1 block text-xs uppercase tracking-wide text-slate-500">Search</label>
                <div className="relative">
                  <input
                    className="input w-full pr-8 sm:w-56"
                    placeholder="Tenant, phone, room"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                    }}
                  />
                  {search && (
                    <div className="absolute right-2.5 top-[50%] -translate-y-1/2 text-slate-400">
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
              </div>
            </div>

            {(user?.role === "superadmin" || user?.role === "admin") && (
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:flex-wrap">
                <button
                  className="btn-primary w-full sm:w-auto"
                  onClick={() => {
                    setManualForm(createManualForm(month, year));
                    void loadPersons();
                    setManualOpen(true);
                  }}
                >
                  Add Payment
                </button>
                <button
                  className={`relative overflow-hidden w-full sm:w-auto transition-all duration-300 ${
                    sendingReminders || isReminderRunActive
                      ? "bg-indigo-50 text-indigo-700 border border-indigo-200 pointer-events-none px-4 py-2.5 rounded-xl text-sm font-semibold shadow-sm"
                      : "btn-secondary"
                  }`}
                  onClick={sendRelevantReminders}
                  disabled={sendingReminders || isReminderRunActive}
                >
                  {isReminderRunActive && (
                    <div
                      className="absolute left-0 top-0 bottom-0 bg-indigo-100 transition-all duration-300"
                      style={{ width: `${reminderRunProgress}%` }}
                    />
                  )}
                  <span className="relative flex items-center justify-center gap-2">
                    {(sendingReminders || isReminderRunActive) && <Loader2 size={16} className={`animate-spin ${reminderPollingError ? "text-amber-500" : "text-indigo-500"}`} />}
                    {sendingReminders && !isReminderRunActive
                      ? "Preparing messages..."
                      : isReminderRunActive
                        ? reminderPollingError
                          ? "Reconnecting to live progress..."
                          : `Sending Messages: ${reminderRunProgress}% (${reminderRun?.attempted}/${reminderRun?.totalTargets})`
                        : "Send Relevant Messages"}
                  </span>
                </button>
              </div>
            )}


          </div>

          <div className="relative">
            <PaymentTable
              payments={payments}
              loading={loading}
              markingPaidId={markingPaidId}
              onMarkPaid={markPaid}
              onUploadReceipt={handleReceiptAction}
              onTenantClick={(personId) => void openTenantDetails(personId)}
            />
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

      <UploadModal
        title={selectedPayment?.isPaid ? "Upload Payment Receipt" : "Mark Paid: Upload Receipt"}
        open={Boolean(selectedPayment)}
        onClose={() => setSelectedPayment(null)}
        onSubmit={uploadReceipt}
        loading={uploading}
      />

      {manualOpen && (
        <div className="mobile-sheet">
          <form className="mobile-sheet-card w-full max-w-2xl space-y-4" onSubmit={createManualPayment}>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Add Payment Details</h3>
              <p className="mt-1 text-sm text-slate-600">Manually select all payment details for a tenant and save.</p>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Room Number</span>
                <select
                  className="input"
                  value={manualForm.roomId}
                  disabled={personsLoading}
                  onChange={(e) => {
                    const roomId = e.target.value;
                    setManualForm((prev) => ({
                      ...prev,
                      roomId,
                      personId: "",
                      amount: ""
                    }));
                  }}
                  required
                >
                  <option value="">{personsLoading ? "Loading rooms..." : "Select Room"}</option>
                  {roomOptions.map((room) => (
                    <option key={room.id} value={room.id}>
                      Room {room.roomNumber}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tenant</span>
                <select
                  className="input"
                  value={manualForm.personId}
                  disabled={!manualForm.roomId || personsLoading}
                  onChange={(e) => {
                    const personId = e.target.value;
                    const selectedPerson = tenantOptions.find((person) => person.id === personId);
                    const autoAmount = selectedPerson?.rentAmount ? Number(selectedPerson.rentAmount).toFixed(2) : "";

                    setManualForm((prev) => ({
                      ...prev,
                      personId,
                      amount: autoAmount
                    }));
                  }}
                  required
                >
                  <option value="">
                    {personsLoading
                      ? "Loading tenants..."
                      : manualForm.roomId
                        ? "Select Tenant"
                        : "Select Room First"}
                  </option>
                  {tenantOptions.map((person) => (
                    <option key={person.id} value={person.id}>
                      {person.name} | {person.phone}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Month</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={12}
                  value={manualForm.month}
                  onChange={(e) =>
                    setManualForm((prev) => ({
                      ...prev,
                      month: e.target.value
                    }))
                  }
                  required
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Year</span>
                <input
                  className="input"
                  type="number"
                  min={2000}
                  max={3000}
                  value={manualForm.year}
                  onChange={(e) =>
                    setManualForm((prev) => ({
                      ...prev,
                      year: e.target.value
                    }))
                  }
                  required
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Amount (Rs)</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  step="0.01"
                  value={manualForm.amount}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, amount: sanitizeAmountInput(e.target.value) }))}
                  required
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Payment Status</span>
                <select
                  className="input"
                  value={manualForm.isPaid ? "paid" : "unpaid"}
                  onChange={(e) => setManualForm((prev) => ({ ...prev, isPaid: e.target.value === "paid" }))}
                >
                  <option value="unpaid">Unpaid</option>
                  <option value="paid">Paid</option>
                </select>
              </label>

              {manualForm.isPaid && (
                <label className="space-y-1 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Paid On</span>
                  <input
                    className="input"
                    type="date"
                    value={manualForm.paidOn}
                    onChange={(e) => setManualForm((prev) => ({ ...prev, paidOn: e.target.value }))}
                    required
                  />
                </label>
              )}
            </div>

            <p className="text-xs text-slate-500">If payment is already marked as paid, you can upload receipt from the payment table after saving.</p>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setManualOpen(false)}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={manualSaving}>
                {manualSaving ? "Saving..." : "Save Payment"}
              </button>
            </div>
          </form>
        </div>
      )}

      {previewPayment?.receiptUrl && (
        <div className="mobile-sheet bg-slate-900/55 p-3 sm:p-4">
          <div className="panel w-full max-w-5xl rounded-3xl p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">Receipt Preview</h3>
              <button className="btn-secondary" onClick={() => setPreviewPayment(null)}>
                Close
              </button>
            </div>

            {isPdfReceipt(previewPayment.receiptUrl) ? (
              <div className="h-[72vh] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                <iframe
                  title="Receipt Preview"
                  src={previewPayment.receiptUrl}
                  className="h-full w-full"
                />
              </div>
            ) : (
              <div className="h-[72vh] overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-2">
                <img
                  src={previewPayment.receiptUrl}
                  alt="Payment Receipt"
                  className="h-full w-full rounded-lg object-contain"
                />
              </div>
            )}
          </div>
        </div>
      )}

      {details && (
        <div className="mobile-sheet">
          <div className="mobile-sheet-card w-full max-w-3xl">
            <h3 className="text-xl font-bold">Tenant Details</h3>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
              <p>Name: {details.name}</p>
              <p>Phone: {details.phone}</p>
              <p>Email: {details.email || "-"}</p>
              <p>Room: {details.roomNumber || "-"}</p>
              <p>Join Date: {formatDateDMY(details.joinDate)}</p>
              <p>Status: {details.status}</p>
              <p>Payment Day: {details.paymentDay}</p>
              {details.aadhaarUrl && (
                <p>
                  Aadhaar:{" "}
                  <a className="text-primary underline" href={details.aadhaarUrl} target="_blank" rel="noreferrer">
                    View File
                  </a>
                </p>
              )}
            </div>

            <div className="mt-5">
              <h4 className="text-base font-bold text-slate-900">Monthly Payment Receipts</h4>
              {detailsLoading ? (
                <div className="mt-3">
                  <TableSkeleton columns={5} rows={3} />
                </div>
              ) : detailPayments.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">No monthly payments found yet.</p>
              ) : (
                <div className="mt-3 max-h-72 overflow-auto rounded-2xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Month</th>
                        <th className="px-3 py-2">Amount</th>
                        <th className="px-3 py-2">Status</th>
                        <th className="px-3 py-2">Paid On</th>
                        <th className="px-3 py-2">Receipt</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailPayments.map((payment) => (
                        <tr key={payment.id} className="border-t border-slate-100">
                          <td className="px-3 py-2">{payment.month}/{payment.year}</td>
                          <td className="px-3 py-2">Rs {Number(payment.amount).toFixed(2)}</td>
                          <td className="px-3 py-2">
                            <span
                              className={[
                                "rounded-full px-2 py-1 text-xs font-semibold",
                                payment.isPaid ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                              ].join(" ")}
                            >
                              {payment.isPaid ? "Paid" : "Unpaid"}
                            </span>
                          </td>
                          <td className="px-3 py-2">{formatDateDMY(payment.paidOn)}</td>
                          <td className="px-3 py-2">
                            {payment.receiptUrl ? (
                              <a className="text-primary underline" href={payment.receiptUrl} target="_blank" rel="noreferrer">
                                View Screenshot
                              </a>
                            ) : (
                              <span className="text-slate-400">No file</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="mt-4 text-right">
              <button
                className="btn-secondary"
                onClick={() => {
                  setDetails(null);
                  setDetailPayments([]);
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Payments;
