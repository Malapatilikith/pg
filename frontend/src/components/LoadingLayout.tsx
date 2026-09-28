import type { ReactNode } from "react";

const join = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" ");

export const Skeleton = ({ className }: { className?: string }) => {
  return <div className={join("skeleton-base rounded-2xl", className)} />;
};

export const ToolbarSkeleton = ({ withButton = true }: { withButton?: boolean }) => {
  return (
    <div className="flex flex-col gap-3 pb-2 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
        <Skeleton className="h-12 w-full sm:w-64" />
        <Skeleton className="h-12 w-full sm:w-36" />
      </div>
      {withButton && <Skeleton className="h-12 w-full sm:w-36" />}
    </div>
  );
};

export const StatsGridSkeleton = ({ items = 6 }: { items?: number }) => {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: items }).map((_, index) => (
        <div key={index} className="panel space-y-4 p-5 sm:p-6">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-10 w-24" />
        </div>
      ))}
    </section>
  );
};

export const CardGridSkeleton = ({ cards = 6 }: { cards?: number }) => {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: cards }).map((_, index) => (
        <div key={index} className="panel space-y-4 p-5">
          <div className="flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-6 w-20" />
          </div>
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-4 flex gap-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        </div>
      ))}
    </div>
  );
};

export const TableSkeleton = ({ columns = 6, rows = 6 }: { columns?: number; rows?: number }) => {
  return (
    <>
      <div className="grid gap-3 md:hidden">
        {Array.from({ length: Math.min(rows, 5) }).map((_, index) => (
          <div key={index} className="panel space-y-4 p-5">
            <div className="flex items-center justify-between gap-3">
              <Skeleton className="h-5 w-32" />
              <Skeleton className="h-5 w-16" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-10/12" />
            </div>
            <div className="flex gap-2 pt-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="panel hidden overflow-x-auto md:block">
        <table className="min-w-full text-left">
          <thead className="border-b border-black/[0.05] bg-slate-50/50">
            <tr>
              {Array.from({ length: columns }).map((_, index) => (
                <th key={index} className="px-5 py-4">
                  <Skeleton className="h-4 w-20" />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: rows }).map((_, rowIndex) => (
              <tr key={rowIndex} className="border-b border-black/[0.03]">
                {Array.from({ length: columns }).map((__, colIndex) => (
                  <td key={colIndex} className="px-5 py-4">
                    <Skeleton className="h-4 w-full max-w-[120px]" />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

export const PanelListSkeleton = ({
  title,
  items = 5,
  footer
}: {
  title?: ReactNode;
  items?: number;
  footer?: ReactNode;
}) => {
  return (
    <div className="panel p-5">
      {title ?? <Skeleton className="h-6 w-40" />}
      <div className="mt-4 space-y-3">
        {Array.from({ length: items }).map((_, index) => (
          <div key={index} className="rounded-2xl border border-black/[0.05] p-4">
            <Skeleton className="h-4 w-44" />
            <Skeleton className="mt-2 h-4 w-72" />
          </div>
        ))}
      </div>
      {footer}
    </div>
  );
};
