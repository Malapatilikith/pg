import { Loader2 } from "lucide-react";
import type { PaginationMeta } from "../types";

interface PaginationControlsProps {
  pagination: PaginationMeta;
  loading?: boolean;
  onPageChange: (page: number) => void;
}

const PaginationControls = ({ pagination, loading, onPageChange }: PaginationControlsProps) => {
  if (pagination.totalPages <= 1) {
    return null;
  }

  return (
    <div className="panel flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-none ring-1 ring-black/[0.03] shadow-none bg-transparent">
      <p className="text-[13px] font-medium text-slate-500 text-center sm:text-left">
        Page <span className="font-bold text-slate-900">{pagination.page}</span> of {pagination.totalPages} <span className="mx-1.5 opacity-40">•</span> {pagination.total} total items
      </p>
      <div className="flex justify-center gap-2">
        <button
          className="btn-secondary flex items-center gap-1.5 rounded-full px-5 py-2 text-xs transition-opacity disabled:opacity-50"
          type="button"
          disabled={loading || !pagination.hasPrev}
          onClick={() => onPageChange(Math.max(1, pagination.page - 1))}
        >
          {loading && <Loader2 size={12} className="animate-spin text-slate-400" />}
          Previous
        </button>
        <button
          className="btn-secondary flex items-center gap-1.5 rounded-full px-5 py-2 text-xs transition-opacity disabled:opacity-50"
          type="button"
          disabled={loading || !pagination.hasNext}
          onClick={() => onPageChange(pagination.page + 1)}
        >
          Next
          {loading && <Loader2 size={12} className="animate-spin text-slate-400" />}
        </button>
      </div>
    </div>
  );
};

export default PaginationControls;
