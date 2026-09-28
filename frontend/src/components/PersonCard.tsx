import { ChevronRight, User, Home, Calendar } from "lucide-react";
import type { Person } from "../types";

const PersonCard = ({ person }: { person: Person }) => {
  return (
    <article className="group flex items-center justify-between p-4 bg-white active:bg-slate-50 transition-colors cursor-pointer border-b border-black/[0.03] last:border-0">
      <div className="flex items-center gap-4">
        <div className={`grid h-12 w-12 place-items-center rounded-full shrink-0 ${person.status === "active" ? "bg-primary/10 text-primary" : "bg-slate-100 text-slate-500"}`}>
          <User size={24} />
        </div>
        <div className="flex flex-col">
          <h3 className="text-[17px] font-semibold text-slate-900 leading-tight">{person.name}</h3>
          <div className="flex items-center gap-3 mt-1 text-[13px] text-slate-500">
             <span className="flex items-center gap-1"><Home size={12}/> Room {person.roomNumber || "N/A"}</span>
             <span className="flex items-center gap-1"><Calendar size={12}/> Day {person.paymentDay}</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${person.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}`}>
          {person.status}
        </span>
        <ChevronRight size={20} className="text-slate-300 group-hover:text-slate-400 transition-colors" />
      </div>
    </article>
  );
};

export default PersonCard;
