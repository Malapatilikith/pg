import { useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";
import { TableSkeleton, ToolbarSkeleton } from "../components/LoadingLayout";
import PaginationControls from "../components/PaginationControls";
import MobileFilePicker from "../components/MobileFilePicker";
import StickyToolbar from "../components/StickyToolbar";
import UploadModal from "../components/UploadModal";
import { useAuth } from "../hooks/useAuth";
import { X, Loader2, User, Phone, Calendar, ShieldCheck, ShieldAlert, ChevronDown } from "lucide-react";
import api from "../utils/api";
import { useDebounce } from "../hooks/useDebounce";
import { formatDateDMY } from "../utils/date";
import type { ApiResponse, PaginatedData, PaginationMeta, Payment, Person, Room } from "../types";

const paymentDayFromDate = (_dateValue: string) => 1;
const PHONE_DIGITS_LENGTH = 10;

const toPhoneDigits = (value: string) => value.replace(/\D/g, "").slice(0, PHONE_DIGITS_LENGTH);
const toApiPhone = (digits: string) => `+91${digits}`;
const fromApiPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length <= PHONE_DIGITS_LENGTH) {
    return digits;
  }
  return digits.slice(digits.length - PHONE_DIGITS_LENGTH);
};

const initialForm = {
  name: "",
  phone: "",
  email: "",
  roomId: "",
  joinDate: new Date().toISOString().slice(0, 10),
  paymentDay: paymentDayFromDate(new Date().toISOString().slice(0, 10)),
  status: "active" as "active" | "inactive"
};

const Persons = () => {
  const { user } = useAuth();
  const [persons, setPersons] = useState<Person[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 20,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const debouncedSearch = useDebounce(search, 500);
  const [loading, setLoading] = useState(false);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [details, setDetails] = useState<Person | null>(null);
  const [detailPayments, setDetailPayments] = useState<Payment[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [editing, setEditing] = useState<Person | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(initialForm);
  const [aadhaarFile, setAadhaarFile] = useState<File | null>(null);
  const [aadhaarTarget, setAadhaarTarget] = useState<Person | null>(null);
  const [uploading, setUploading] = useState(false);
  const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
  const [initialFetch, setInitialFetch] = useState(true);
  const isInitialLoading = loading && initialFetch;
  const isPhoneValid = toPhoneDigits(form.phone).length === PHONE_DIGITS_LENGTH;

  const loadPersons = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "20"
      });
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }

      const personRes = await api.get<ApiResponse<PaginatedData<Person>>>(`/persons?${params.toString()}`);
      setPersons(personRes.data.data.items);
      setPagination(personRes.data.data.pagination);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to load tenant data");
    } finally {
      setLoading(false);
      setInitialFetch(false);
    }
  };

  const loadRoomsForForm = async () => {
    setRoomsLoading(true);
    try {
      const response = await api.get<ApiResponse<PaginatedData<Room>>>("/rooms?page=1&pageSize=200");
      setRooms(response.data.data.items);
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to load rooms");
    } finally {
      setRoomsLoading(false);
    }
  };

  useEffect(() => {
    void loadPersons();
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const tenantRows = useMemo(() => persons, [persons]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedName = form.name.trim().replace(/\s+/g, " ");
    const normalizedEmail = form.email.trim();
    const phoneDigits = toPhoneDigits(form.phone);
    const normalizedPhone = toApiPhone(phoneDigits);

    if (normalizedName.length < 2) {
      toast.error("Name must be at least 2 characters");
      return;
    }

    if (phoneDigits.length !== PHONE_DIGITS_LENGTH) {
      toast.error("Phone number must contain exactly 10 digits");
      return;
    }

    if (form.status === "active" && !form.roomId) {
      toast.error("Active tenant must be assigned to a room");
      return;
    }

    setSaving(true);
    try {
      if (editing) {
        const payload: Record<string, unknown> = {};
        const currentEmail = editing.email || "";
        const currentRoomId = editing.roomId || "";
        const currentPaymentDay = editing.paymentDay || 1;

        if (normalizedName !== editing.name) {
          payload.name = normalizedName;
        }
        if (normalizedPhone !== editing.phone) {
          payload.phone = normalizedPhone;
        }
        if (normalizedEmail !== currentEmail) {
          payload.email = normalizedEmail;
        }
        if (form.roomId !== currentRoomId) {
          payload.roomId = form.roomId || null;
        }
        if (form.joinDate !== editing.joinDate) {
          payload.joinDate = form.joinDate;
        }
        if (form.paymentDay !== currentPaymentDay) {
          payload.paymentDay = form.paymentDay;
        }
        if (form.status !== editing.status) {
          payload.status = form.status;
        }

        if (!Object.keys(payload).length) {
          toast("No changes to update");
          return;
        }

        await api.put(`/persons/${editing.id}`, payload);
        toast.success("Tenant updated");
      } else {
        const createPayload = {
          ...form,
          name: normalizedName,
          phone: normalizedPhone,
          email: normalizedEmail
        };

        const response = await api.post<ApiResponse<Person>>("/persons", createPayload);
        const created = response.data.data;
        if (aadhaarFile) {
          const fd = new FormData();
          fd.append("file", aadhaarFile);
          await api.post(`/persons/${created.id}/aadhaar`, fd);
        }
        toast.success("Tenant created");
      }
      setOpen(false);
      setEditing(null);
      setAadhaarFile(null);
      setForm(initialForm);
      await loadPersons();
    } catch (error: any) {
      const fieldErrors = error?.response?.data?.data?.fieldErrors as
        | Record<string, string[] | undefined>
        | undefined;
      const validationMessage = fieldErrors
        ? Object.values(fieldErrors).flat().find(Boolean)
        : undefined;

      toast.error(validationMessage || error?.response?.data?.message || "Failed to save tenant");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm("Delete this tenant?")) {
      return;
    }

    try {
      await api.delete(`/persons/${id}`);
      toast.success("Tenant deleted");
      await loadPersons();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete tenant");
    }
  };

  const uploadAadhaar = async (file: File) => {
    if (!aadhaarTarget) {
      return;
    }

    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await api.post(`/persons/${aadhaarTarget.id}/aadhaar`, fd);
      toast.success("Aadhaar uploaded");
      setAadhaarTarget(null);
      await loadPersons();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to upload Aadhaar");
    } finally {
      setUploading(false);
    }
  };

  const openDetails = async (personId: string) => {
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

  return (
    <div className="space-y-4">
      {isInitialLoading ? (
        <>
          <ToolbarSkeleton withButton />
          <TableSkeleton columns={7} rows={7} />
        </>
      ) : (
        <>
          <StickyToolbar>
            <div className="panel toolbar-surface flex flex-wrap items-center gap-2 p-3 sm:gap-3 sm:p-4">
              <div className="relative min-w-0 flex-1 sm:w-72 sm:flex-none">
                <input
                  className="input w-full pr-8"
                  placeholder="Search by name or phone"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
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
              <div className="w-36 sm:w-40">
                <select
                  className="input w-full"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                  aria-label="Tenant status filter"
                >
                  <option value="all">All tenants</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <button
                className="btn-primary shrink-0 px-4 sm:px-5"
                onClick={() => {
                  setEditing(null);
                  setForm(initialForm);
                  void loadRoomsForForm();
                  setOpen(true);
                }}
              >
                Add
              </button>
            </div>
          </StickyToolbar>

          <div className="relative">
            <div className="panel overflow-hidden md:hidden stagger-fade">
              {tenantRows.map((person) => {
                const isExpanded = expandedPersonId === person.id;
                return (
                  <article key={person.id} className="border-b border-black/[0.03] bg-white last:border-0">
                    <button
                      type="button"
                      className="flex w-full items-center justify-between p-4 text-left transition-colors active:bg-slate-50"
                      onClick={() => setExpandedPersonId(isExpanded ? null : person.id)}
                    >
                      <div className="flex items-center gap-4 min-w-0 pr-4">
                        <div className={`grid h-12 w-12 place-items-center rounded-full shrink-0 ${person.status === "active" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                          <User size={24} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <h3 className="text-[17px] font-semibold text-slate-900 leading-tight truncate">{person.name}</h3>
                          <div className="flex items-center gap-3 mt-1 text-[13px] text-slate-500">
                            <span className="flex items-center gap-1.5 truncate"><Phone size={12} className="shrink-0" /> {person.phone}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="flex flex-col items-end">
                          <span className="text-[15px] font-bold text-slate-900">{person.roomNumber ? `Room ${person.roomNumber}` : "No Room"}</span>
                          <span className={`text-[10px] font-bold uppercase tracking-wider ${person.status === "active" ? "text-emerald-600" : "text-slate-500"}`}>
                            {person.status}
                          </span>
                        </div>
                        <ChevronDown size={18} className={`text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                      </div>
                    </button>

                    <div
                      className={[
                        "overflow-hidden transition-all duration-200",
                        isExpanded ? "max-h-80 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                      ].join(" ")}
                    >
                      <div className="px-4 pb-4">
                        <div className="rounded-2xl border border-black/[0.05] bg-slate-50 p-4">
                          <div className="grid grid-cols-2 gap-y-2 text-[13px]">
                            <p className="font-medium text-slate-500">Join Date</p>
                            <p className="text-right font-semibold text-slate-700">{formatDateDMY(person.joinDate)}</p>
                            <p className="font-medium text-slate-500">Aadhaar</p>
                            <p className={`text-right font-semibold ${person.aadhaarUrl ? "text-emerald-600" : "text-rose-500"}`}>
                              {person.aadhaarUrl ? "Uploaded ✓" : "Missing"}
                            </p>
                            <p className="font-medium text-slate-500">Email</p>
                            <p className="text-right font-semibold text-slate-700 truncate">{person.email || "-"}</p>
                          </div>
                        </div>

                        <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                          <button className="btn-secondary flex-1 px-3 py-2 text-xs" onClick={() => void openDetails(person.id)}>
                            View
                          </button>
                          <button
                            className="btn-secondary flex-1 px-3 py-2 text-xs"
                            onClick={() => {
                              setEditing(person);
                              setForm({
                                name: person.name,
                                phone: fromApiPhone(person.phone),
                                email: person.email || "",
                                roomId: person.roomId || "",
                                joinDate: person.joinDate,
                                paymentDay: person.paymentDay || 1,
                                status: person.status
                              });
                              void loadRoomsForForm();
                              setOpen(true);
                            }}
                          >
                            Edit
                          </button>
                          {!person.aadhaarUrl && (
                            <button className="btn-secondary col-span-2 px-3 py-2 text-xs !text-indigo-600 !ring-indigo-200 bg-indigo-50" onClick={() => setAadhaarTarget(person)}>
                              Upload Adhar
                            </button>
                          )}
                          {user?.role === "superadmin" && (
                            <button className="col-span-2 rounded-full bg-rose-50 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-100 ring-1 ring-inset ring-rose-500/20" onClick={() => remove(person.id)}>
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}

              {!tenantRows.length && <div className="p-6 text-center text-sm font-medium text-slate-500">No tenants matched your search.</div>}
            </div>

            <div className="panel hidden overflow-hidden rounded-[2rem] md:block">
              <div className="overflow-x-auto">
                <table className="min-w-full text-left whitespace-nowrap">
                  <thead className="bg-slate-50/80 backdrop-blur-md border-b border-black/[0.03] text-xs uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-6 py-4 font-bold">Name</th>
                      <th className="px-6 py-4 font-bold">Phone</th>
                      <th className="px-6 py-4 font-bold">Room</th>
                      <th className="px-6 py-4 font-bold">Join Date</th>
                      <th className="px-6 py-4 font-bold">Status</th>
                      <th className="px-6 py-4 font-bold">Aadhaar</th>
                      <th className="px-6 py-4 font-bold">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-black/[0.03]">
                    {tenantRows.map((person) => (
                      <tr key={person.id} className="transition-colors hover:bg-slate-50/50">
                        <td className="px-6 py-4 font-bold text-slate-900">{person.name}</td>
                        <td className="px-6 py-4 font-medium text-slate-600">{person.phone}</td>
                        <td className="px-6 py-4 font-medium text-slate-600">{person.roomNumber || "-"}</td>
                        <td className="px-6 py-4 font-medium text-slate-600">{formatDateDMY(person.joinDate)}</td>
                        <td className="px-6 py-4">
                          <span
                            className={[
                              "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
                              person.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"
                            ].join(" ")}
                          >
                            {person.status}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {person.aadhaarUrl ? (
                            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
                              Uploaded
                            </span>
                          ) : (
                            <span className="text-sm font-medium text-slate-400">Not uploaded</span>
                          )}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-2">
                            <button className="btn-secondary rounded-full px-4 py-1.5 text-xs" onClick={() => void openDetails(person.id)}>
                              View
                            </button>
                            <button
                              className="btn-secondary rounded-full px-4 py-1.5 text-xs"
                              onClick={() => {
                                setEditing(person);
                                setForm({
                                  name: person.name,
                                  phone: fromApiPhone(person.phone),
                                  email: person.email || "",
                                  roomId: person.roomId || "",
                                  joinDate: person.joinDate,
                                  paymentDay: person.paymentDay || 1,
                                  status: person.status
                                });
                                void loadRoomsForForm();
                                setOpen(true);
                              }}
                            >
                              Edit
                            </button>
                            {!person.aadhaarUrl && (
                              <button className="btn-secondary rounded-full px-4 py-1.5 text-xs" onClick={() => setAadhaarTarget(person)}>
                                Upload
                              </button>
                            )}
                            {user?.role === "superadmin" && (
                              <button className="rounded-full bg-rose-50 px-4 py-1.5 text-xs font-bold text-rose-600 ring-1 ring-inset ring-rose-500/20 transition-all hover:bg-rose-100" onClick={() => remove(person.id)}>
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

      {open && (
        <div className="mobile-sheet">
          <form className="mobile-sheet-card w-full max-w-2xl space-y-3" onSubmit={submit}>
            <h3 className="text-xl font-bold">{editing ? "Edit Tenant" : "Add Tenant"}</h3>
            <div className="grid gap-3 md:grid-cols-2">
              <input className="input" placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone Number</span>
                <div className="flex overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:ring-2 focus-within:ring-primary/30">
                  <span className="flex items-center border-r border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-700">+91</span>
                  <input
                    className="w-full bg-transparent px-3 py-2.5 text-sm text-slate-900 outline-none"
                    placeholder="10-digit mobile number"
                    inputMode="numeric"
                    pattern="[0-9]{10}"
                    maxLength={PHONE_DIGITS_LENGTH}
                    minLength={PHONE_DIGITS_LENGTH}
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: toPhoneDigits(e.target.value) })}
                    required
                  />
                </div>
                <p className="text-xs text-slate-500">Enter only 10 digits.</p>
              </label>

              <input className="input" placeholder="Email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              <select
                className="input"
                value={form.roomId}
                disabled={roomsLoading}
                onChange={(e) => setForm({ ...form, roomId: e.target.value })}
                required={!editing || form.status === "active"}
              >
                <option value="">{roomsLoading ? "Loading rooms..." : "Select Room"}</option>
                {rooms.map((room) => {
                  const isCurrentRoomInEdit = editing?.roomId === room.id;
                  const isOccupiedForSelection = room.status === "occupied" && !isCurrentRoomInEdit;

                  return (
                    <option key={room.id} value={room.id} disabled={isOccupiedForSelection}>
                      Room {room.roomNumber} | {room.floor} | Rs {Number(room.rentAmount).toFixed(2)} | {isOccupiedForSelection ? "OCCUPIED" : "AVAILABLE"}
                    </option>
                  );
                })}
              </select>
              <input
                className="input"
                type="date"
                value={form.joinDate}
                onChange={(e) =>
                  setForm({
                    ...form,
                    joinDate: e.target.value,
                    paymentDay: paymentDayFromDate(e.target.value)
                  })
                }
                required
              />
              <input
                className="input"
                type="number"
                min={1}
                max={28}
                value={form.paymentDay}
                readOnly
                title="Payment day is fixed on 1st for all tenants"
              />
              <select className="input md:col-span-2" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as "active" | "inactive" })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
              {!editing && (
                <div className="md:col-span-2">
                  <MobileFilePicker file={aadhaarFile} onFileSelect={setAadhaarFile} accept="image/*,application/pdf" fileLabel="Upload Adhar" />
                </div>
              )}
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button type="button" className="btn-secondary" onClick={() => setOpen(false)} disabled={saving}>
                Cancel
              </button>
              <button type="submit" className="btn-primary" disabled={saving || !isPhoneValid}>
                {saving ? (editing ? "Updating..." : "Creating...") : editing ? "Update" : "Create"}
              </button>
            </div>
          </form>
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
                  Aadhaar: <a className="text-primary underline" href={details.aadhaarUrl} target="_blank" rel="noreferrer">View File</a>
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

      <UploadModal
        title="Upload Adhar"
        open={Boolean(aadhaarTarget)}
        loading={uploading}
        onClose={() => setAadhaarTarget(null)}
        onSubmit={uploadAadhaar}
      />
    </div>
  );
};

export default Persons;
