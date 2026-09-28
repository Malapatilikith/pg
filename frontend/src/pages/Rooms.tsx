import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import toast from "react-hot-toast";
import { CardGridSkeleton, ToolbarSkeleton } from "../components/LoadingLayout";
import PaginationControls from "../components/PaginationControls";
import RoomCard from "../components/RoomCard";
import StickyToolbar from "../components/StickyToolbar";
import { useAuth } from "../hooks/useAuth";
import { X, Loader2, Trash2, DoorOpen, Home } from "lucide-react";
import { formatDateDMY } from "../utils/date";
import api from "../utils/api";
import { useDebounce } from "../hooks/useDebounce";
import type { ApiResponse, PaginatedData, PaginationMeta, Person, Room } from "../types";

const emptyForm = {
  roomNumber: "",
  floor: "",
  capacity: 1,
  rentAmount: 0,
  status: "available" as "available" | "occupied"
};

const Rooms = () => {
  const { user } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedRoomTenants, setSelectedRoomTenants] = useState<Person[]>([]);
  const [tenantsLoading, setTenantsLoading] = useState(false);
  const [pagination, setPagination] = useState<PaginationMeta>({
    page: 1,
    pageSize: 12,
    total: 0,
    totalPages: 1,
    hasNext: false,
    hasPrev: false
  });
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 500);
  const [statusFilter, setStatusFilter] = useState("all");
  const [open, setOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [loadingRoomId, setLoadingRoomId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [initialFetch, setInitialFetch] = useState(true);
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const isInitialLoading = loading && initialFetch;

  useEffect(() => {
    setPortalTarget(document.getElementById("navbar-portal-target"));
  }, []);

  const [stats, setStats] = useState({ available: 0, occupied: 0 });

  const loadRooms = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        pageSize: "12"
      });
      if (debouncedSearch.trim()) {
        params.set("search", debouncedSearch.trim());
      }
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }

      const roomsRes = await api.get<ApiResponse<PaginatedData<Room> & { stats: { available: number; occupied: number } }>>(`/rooms?${params.toString()}`);
      setRooms(roomsRes.data.data.items);
      setPagination(roomsRes.data.data.pagination);
      if (roomsRes.data.data.stats) {
        setStats(roomsRes.data.data.stats);
      }
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to load rooms");
    } finally {
      setLoading(false);
      setInitialFetch(false);
    }
  };

  const loadRoomTenants = async (room: Room) => {
    setTenantsLoading(true);
    try {
      const params = new URLSearchParams({
        page: "1",
        pageSize: "100",
        roomId: room.id
      });
      const response = await api.get<ApiResponse<PaginatedData<Person>>>(`/persons?${params.toString()}`);
      setSelectedRoomTenants(response.data.data.items);
    } catch (error: any) {
      setSelectedRoomTenants([]);
      toast.error(error?.response?.data?.message || "Failed to load room tenants");
    } finally {
      setTenantsLoading(false);
    }
  };

  const handleRoomClick = async (room: Room) => {
    setLoadingRoomId(room.id);
    await loadRoomTenants(room);
    setLoadingRoomId(null);
    setSelectedRoom(room);
  };

  useEffect(() => {
    void loadRooms();
  }, [page, debouncedSearch, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter]);

  const selectedRoomActiveCount = useMemo(
    () => selectedRoomTenants.filter((tenant) => tenant.status === "active").length,
    [selectedRoomTenants]
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const normalizedRoomNumber = form.roomNumber.trim();
    const normalizedFloor = form.floor.trim();
    const normalizedRentAmount = Number(form.rentAmount);

    if (!normalizedRoomNumber) {
      toast.error("Room number is required");
      return;
    }

    if (!normalizedFloor) {
      toast.error("Floor is required");
      return;
    }

    if (!Number.isFinite(normalizedRentAmount) || normalizedRentAmount <= 0) {
      toast.error("Rent amount must be greater than 0");
      return;
    }

    try {
      await api.post("/rooms", {
        ...form,
        roomNumber: normalizedRoomNumber,
        floor: normalizedFloor,
        rentAmount: normalizedRentAmount
      });
      toast.success("Room created");
      setOpen(false);
      setForm(emptyForm);
      await loadRooms();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to save room");
    }
  };

  const deleteRoom = async (roomId: string) => {
    if (!window.confirm("Delete this room?")) {
      return;
    }

    try {
      await api.delete(`/rooms/${roomId}`);
      toast.success("Room deleted");
      await loadRooms();
    } catch (error: any) {
      toast.error(error?.response?.data?.message || "Failed to delete room");
    }
  };

  return (
    <div className="space-y-4">
      {portalTarget &&
        createPortal(
          <div className="flex items-center gap-2 sm:gap-3 ml-1 sm:ml-2 animate-in fade-in slide-in-from-left-4 duration-500">
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-600 ring-1 ring-inset ring-emerald-500/20 backdrop-blur-sm transition-all hover:bg-emerald-500/20 shadow-sm sm:px-3 sm:py-1.5">
              <DoorOpen size={16} className="stroke-[2.5]" />
              <span className="text-sm font-black text-emerald-700">{stats.available}</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full bg-rose-500/10 px-2.5 py-1 text-rose-600 ring-1 ring-inset ring-rose-500/20 backdrop-blur-sm transition-all hover:bg-rose-500/20 shadow-sm sm:px-3 sm:py-1.5">
              <Home size={16} className="stroke-[2.5]" />
              <span className="text-sm font-black text-rose-700">{stats.occupied}</span>
            </div>
          </div>,
          portalTarget
        )}

      {isInitialLoading ? (
        <>
          <ToolbarSkeleton withButton={user?.role === "superadmin"} />
          <CardGridSkeleton cards={6} />
        </>
      ) : (
        <>
          <StickyToolbar>
            <div className="panel toolbar-surface grid gap-2 p-3 sm:flex sm:flex-wrap sm:items-center sm:justify-between sm:gap-3 sm:p-4">
              <div className="relative w-full sm:w-56">
                <input
                  className="input w-full pr-8"
                  placeholder="Search room number"
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

              <div
                className={[
                  "grid w-full gap-2",
                  user?.role === "superadmin" ? "grid-cols-[1fr_auto]" : "grid-cols-1",
                  "sm:w-auto sm:grid-cols-1"
                ].join(" ")}
              >
                <select
                  className="input w-full sm:w-44"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="all">All Status</option>
                  <option value="available">Available</option>
                  <option value="occupied">Occupied</option>
                </select>

                {user?.role === "superadmin" && (
                  <button
                    className="btn-primary px-4 sm:w-full"
                    onClick={() => {
                      setForm(emptyForm);
                      setOpen(true);
                    }}
                  >
                    Add
                  </button>
                )}
              </div>
            </div>
          </StickyToolbar>

          <div className="relative">
            <div className="panel overflow-hidden stagger-fade">
              {rooms.map((room) => (
                <div key={room.id} className="flex bg-white">
                  <button
                    type="button"
                    className="flex-1 text-left outline-none relative"
                    onClick={() => handleRoomClick(room)}
                    disabled={loadingRoomId !== null}
                  >
                    <RoomCard
                      room={room}
                      remainingSlots={Math.max(0, room.capacity - (room.activeTenants || 0))}
                    />
                    {loadingRoomId === room.id && (
                      <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-sm rounded-[1.5rem]">
                        <Loader2 className="animate-spin text-indigo-500" size={24} />
                      </div>
                    )}
                  </button>
                </div>
              ))}
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

          {!rooms.length && (
            <div className="panel rounded-3xl p-6 text-center text-sm text-slate-500">No rooms matched this filter.</div>
          )}

          <PaginationControls pagination={pagination} loading={loading} onPageChange={setPage} />
        </>
      )}

      {open && (
        <div className="mobile-sheet">
          <form className="mobile-sheet-card w-full max-w-xl space-y-4" onSubmit={onSubmit}>
            <div>
              <h3 className="text-xl font-bold text-slate-900">Add Room</h3>
              <p className="mt-1 text-sm text-slate-600">
                Enter complete room details so tenant assignment and rent tracking stay accurate.
              </p>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Room Number</span>
                <input
                  className="input"
                  placeholder="Example: A-101"
                  value={form.roomNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, roomNumber: e.target.value }))}
                  required
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Floor</span>
                <input
                  className="input"
                  placeholder="Example: Ground / 1 / 2"
                  value={form.floor}
                  onChange={(e) => setForm((prev) => ({ ...prev, floor: e.target.value }))}
                  required
                />
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sharing Type</span>
                <select
                  className="input"
                  value={form.capacity}
                  onChange={(e) => setForm((prev) => ({ ...prev, capacity: Number(e.target.value) }))}
                >
                  {Array.from({ length: 8 }, (_, index) => index + 1).map((sharing) => (
                    <option key={sharing} value={sharing}>
                      {sharing} Sharing
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-1">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Monthly Rent (Rs)</span>
                <input
                  className="input"
                  placeholder="Example: 6500"
                  type="number"
                  min={1}
                  step="0.01"
                  value={form.rentAmount}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      rentAmount: e.target.value === "" ? 0 : Number(e.target.value)
                    }))
                  }
                  required
                />
              </label>

              <label className="space-y-1 md:col-span-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Initial Status</span>
                <select
                  className="input"
                  value={form.status}
                  onChange={(e) => setForm((prev) => ({ ...prev, status: e.target.value as "available" | "occupied" }))}
                >
                  <option value="available">Available</option>
                  <option value="occupied">Occupied</option>
                </select>
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
              <p>Summary</p>
              <p className="mt-1 text-slate-600">
                Room {form.roomNumber || "-"} | Floor {form.floor || "-"} | {form.capacity} Sharing | Rs {Number(form.rentAmount || 0).toFixed(2)}
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => {
                  setOpen(false);
                  setForm(emptyForm);
                }}
              >
                Cancel
              </button>
              <button className="btn-primary" type="submit">
                Create
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedRoom && (
        <div className="mobile-sheet">
          <div className="mobile-sheet-card w-full max-w-3xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-bold text-slate-900 truncate">Room {selectedRoom.roomNumber} - Tenant List</h3>
              <div className="flex items-center gap-2 shrink-0">
                {user?.role === "superadmin" && (
                  <button
                    className="grid h-10 w-10 place-items-center rounded-full bg-rose-50 text-rose-600 transition-all hover:bg-rose-100 active:scale-95"
                    title="Delete Room"
                    onClick={() => {
                      deleteRoom(selectedRoom.id);
                      setSelectedRoom(null);
                    }}
                  >
                    <Trash2 size={18} />
                  </button>
                )}
                <button
                  className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600 transition-all hover:bg-slate-200 active:scale-95"
                  title="Close"
                  onClick={() => {
                    setSelectedRoom(null);
                    setSelectedRoomTenants([]);
                  }}
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <p className="mt-2 text-sm text-slate-600">
              Active: {selectedRoomActiveCount} | Inactive: {selectedRoomTenants.length - selectedRoomActiveCount}
            </p>

            {selectedRoomTenants.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm text-slate-500">
                {tenantsLoading ? "Loading room tenants..." : "No tenants are assigned to this room."}
              </p>
            ) : (
              <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-4 py-3">Name</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Phone</th>
                      <th className="px-4 py-3">Join Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedRoomTenants.map((tenant) => (
                      <tr key={tenant.id} className="border-t border-slate-100">
                        <td className="px-4 py-3 font-semibold text-slate-900">{tenant.name}</td>
                        <td className="px-4 py-3">
                          <span
                            className={[
                              "rounded-full px-2.5 py-1 text-xs font-semibold",
                              tenant.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-200 text-slate-700"
                            ].join(" ")}
                          >
                            {tenant.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-700">{tenant.phone}</td>
                        <td className="px-4 py-3 text-slate-700">{formatDateDMY(tenant.joinDate)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default Rooms;
