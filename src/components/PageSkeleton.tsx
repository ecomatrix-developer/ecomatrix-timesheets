import Skeleton from "./Skeleton";

/**
 * Generic route-level loading placeholder, composed from the existing
 * shimmering `Skeleton` primitive. Used by each force-dynamic page's
 * `loading.tsx` so a filter/pagination click (which re-runs the whole
 * server component via router.refresh) shows an immediate response
 * instead of a frozen page while the data queries run.
 */
export default function PageSkeleton({
  statCards = 0,
  showFilterBar = true,
  tableRows = 6,
}: {
  statCards?: number;
  showFilterBar?: boolean;
  tableRows?: number;
}) {
  return (
    <div className="w-full animate-pulse">
      <div className="mb-6 flex flex-col gap-4 border-b border-gray-200 pb-4 sm:flex-row sm:items-center sm:justify-between">
        <Skeleton className="h-7 w-48" />
        {showFilterBar && <Skeleton className="h-9 w-64" />}
      </div>

      {statCards > 0 && (
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 ${
            statCards >= 4 ? "lg:grid-cols-4" : statCards === 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"
          }`}
        >

          {Array.from({ length: statCards }).map((_, i) => (
            <div key={i} className="glass p-5">
              <Skeleton className="h-4 w-20 mb-3" />
              <Skeleton className="h-8 w-16" />
            </div>
          ))}
        </div>
      )}

      <div className="glass p-5">
        <div className="space-y-3">
          {Array.from({ length: tableRows }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </div>
    </div>
  );
}
