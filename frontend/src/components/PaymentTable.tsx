import { useState } from "react";
import { Banknote, ChevronDown } from "lucide-react";
import type { Payment } from "../types";
import { formatDateDMY } from "../utils/date";

const formatCurrency = (amount: number | string) => {
  const value = Number(amount);
  if (!Number.isFinite(value)) {
    return "Rs 0.00";
  }

  return `Rs ${value.toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
};

const PaymentTable = ({
  payments,
  onMarkPaid,
  onUploadReceipt,
  onTenantClick,
  loading,
  markingPaidId
}: {
  payments: Payment[];
  onMarkPaid: (payment: Payment) => void;
  onUploadReceipt: (payment: Payment) => void;
  onTenantClick?: (personId: string) => void;
  loading?: boolean;
  markingPaidId?: string | null;
}) => {
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);

  return (
    <>
      <div className="panel overflow-hidden md:hidden stagger-fade">
        {payments.map((payment) => {
          const isExpanded = expandedPaymentId === payment.id;
          const personName = payment.personName || "-";

          return (
            <article
              key={payment.id}
              className="mb-3 overflow-hidden rounded-2xl border border-slate-200/60 bg-white shadow-sm ring-1 ring-black/[0.02] last:mb-0"
            >
              <button
                type="button"
                className="group flex w-full items-center justify-between p-4 text-left transition-colors active:bg-slate-50"
                onClick={() => setExpandedPaymentId(isExpanded ? null : payment.id)}
                aria-expanded={isExpanded}
                aria-controls={`payment-details-${payment.id}`}
              >
                <div className="flex items-center gap-4 min-w-0 pr-4">
                  <div className={`grid h-12 w-12 place-items-center rounded-full shrink-0 ${payment.isPaid ? "bg-emerald-50 text-emerald-600" : "bg-rose-50 text-rose-600"}`}>
                    <Banknote size={24} />
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-[17px] font-semibold text-slate-900 leading-tight truncate">{personName}</h3>
                    <div className="flex items-center gap-3 mt-1 text-[13px] text-slate-500">
                      <span className="truncate">Room {payment.roomNumber || "-"}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="flex flex-col items-end">
                    <span className="text-[16px] font-black text-slate-900 tabular-nums tracking-tight">{formatCurrency(payment.amount)}</span>
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${payment.isPaid ? "text-emerald-500" : "text-rose-500"}`}>
                      {payment.isPaid ? "Paid" : "Unpaid"}
                    </span>
                  </div>
                  <ChevronDown size={18} className={`text-slate-400 transition-transform duration-200 ${isExpanded ? "rotate-180" : ""}`} />
                </div>
              </button>

              <div
                id={`payment-details-${payment.id}`}
                className={[
                  "overflow-hidden transition-all duration-200",
                  isExpanded ? "max-h-80 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                ].join(" ")}
              >
                <div className="px-4 pb-4 pt-2 space-y-4">
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 p-4 shadow-inner">
                    <div className="grid grid-cols-2 gap-y-2 text-[13px]">
                      <p className="font-medium text-slate-500">Last Paid</p>
                      <p className="text-right font-semibold text-slate-700">{formatDateDMY(payment.lastPaidOn)}</p>
                      <p className="font-medium text-slate-500">Paid Till</p>
                      <p className="text-right font-semibold text-slate-700">{formatDateDMY(payment.paidTill)}</p>
                      <p className="font-medium text-slate-500">Current Cycle</p>
                      <p className="text-right font-semibold text-slate-700">{formatDateDMY(payment.paidOn)}</p>
                    </div>

                    {payment.personId && payment.personName && (
                      <button
                        type="button"
                        className="mt-4 w-full rounded-xl bg-white shadow-sm ring-1 ring-black/[0.05] px-3 py-2 text-xs font-bold text-slate-700 transition hover:bg-slate-50"
                        onClick={() => onTenantClick?.(payment.personId)}
                      >
                        View Tenant Profile
                      </button>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {!payment.isPaid && (
                      <button
                        className="btn-primary flex-1 px-3 py-2 text-xs"
                        disabled={loading || markingPaidId === payment.id}
                        onClick={() => onMarkPaid(payment)}
                      >
                        {markingPaidId === payment.id ? "Marking..." : "Mark Paid"}
                      </button>
                    )}
                    <button
                      className={[
                        "flex-1 px-3 py-2 text-xs",
                        payment.receiptUrl ? "btn-secondary !text-emerald-700 !ring-emerald-200" : "btn-secondary"
                      ].join(" ")}
                      disabled={loading}
                      onClick={() => onUploadReceipt(payment)}
                    >
                      {payment.receiptUrl ? "Receipt Uploaded" : "Upload Receipt"}
                    </button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </div>

      <div className="panel hidden overflow-hidden rounded-[2rem] md:block">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left whitespace-nowrap">
            <thead className="bg-slate-50/80 backdrop-blur-md border-b border-black/[0.03] text-xs uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-6 py-4 font-bold">Tenant</th>
                <th className="px-6 py-4 font-bold">Room</th>
                <th className="px-6 py-4 font-bold">Amount</th>
                <th className="px-6 py-4 font-bold">Last Paid On</th>
                <th className="px-6 py-4 font-bold">Paid Till</th>
                <th className="px-6 py-4 font-bold">Status</th>
                <th className="px-6 py-4 font-bold">Current Cycle Paid On</th>
                <th className="px-6 py-4 font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/[0.03]">
              {payments.map((payment) => (
                <tr key={payment.id} className="transition-colors hover:bg-slate-50/50">
                  <td className="px-6 py-4 font-bold text-slate-900">
                    {payment.personId && payment.personName ? (
                      <button
                        type="button"
                        className="text-left text-slate-900 underline-offset-2 hover:underline"
                        onClick={() => onTenantClick?.(payment.personId)}
                      >
                        {payment.personName}
                      </button>
                    ) : (
                      payment.personName || "-"
                    )}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-600">{payment.roomNumber || "-"}</td>
                  <td className="px-6 py-4 font-black tracking-tight text-slate-900 tabular-nums">{formatCurrency(payment.amount)}</td>
                  <td className="px-6 py-4 font-medium text-slate-600">{formatDateDMY(payment.lastPaidOn)}</td>
                  <td className="px-6 py-4 font-medium text-slate-600">{formatDateDMY(payment.paidTill)}</td>
                  <td className="px-6 py-4">
                    <span
                      className={[
                        "rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-wider",
                        payment.isPaid ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"
                      ].join(" ")}
                    >
                      {payment.isPaid ? "Paid" : "Unpaid"}
                    </span>
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-600">{formatDateDMY(payment.paidOn)}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-2">
                      {!payment.isPaid && (
                        <button
                          className="btn-primary rounded-full px-4 py-1.5 text-xs"
                          disabled={loading || markingPaidId === payment.id}
                          onClick={() => onMarkPaid(payment)}
                        >
                          {markingPaidId === payment.id ? "Marking..." : "Mark Paid"}
                        </button>
                      )}
                      <button
                        className={[
                          "px-4 py-1.5 text-xs font-bold rounded-full transition-all",
                          payment.receiptUrl ? "bg-emerald-50 text-emerald-600 ring-1 ring-inset ring-emerald-500/20" : "btn-secondary"
                        ].join(" ")}
                        disabled={loading}
                        onClick={() => onUploadReceipt(payment)}
                      >
                        {payment.receiptUrl ? "Receipt Uploaded" : "Receipt"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
};

export default PaymentTable;
