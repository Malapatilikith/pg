import { ChevronRight, Home, Users } from "lucide-react";
import type { Room } from "../types";

const RoomCard = ({ room, remainingSlots }: { room: Room; remainingSlots: number }) => {
  return (
    <article className="group flex items-center justify-between p-4 bg-white active:bg-slate-50 transition-colors cursor-pointer border-b border-black/[0.03] last:border-0">
      <div className="flex items-center gap-4">
        <div className={`grid h-12 w-12 place-items-center rounded-full shrink-0 ${room.status === "occupied" ? "bg-rose-50 text-rose-600" : "bg-emerald-50 text-emerald-600"}`}>
          <Home size={24} />
        </div>
        <div className="flex flex-col">
          <h3 className="text-[17px] font-semibold text-slate-900 leading-tight">Room {room.roomNumber}</h3>
          <div className="flex items-center gap-3 mt-1 text-[13px] text-slate-500">
             <span className="flex items-center gap-1"><Users size={12}/> {room.capacity} Sharing</span>
             <span>Floor {room.floor}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex flex-col items-end">
          <span className="text-[15px] font-bold text-slate-900">₹{Number(room.rentAmount).toFixed(0)}</span>
          <span className={`text-[10px] font-bold uppercase tracking-wider ${room.status === "available" ? "text-emerald-600" : "text-rose-600"}`}>
             {room.status === "available" ? `${remainingSlots} left` : "Full"}
          </span>
        </div>
        <ChevronRight size={20} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
      </div>
    </article>
  );
};

export default RoomCard;
