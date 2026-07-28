// Ürün ızgarası ilk yüklenirken gösterilen iskelet kartlar.
export default function ProductGridSkeleton({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-hairline bg-panel p-3 animate-pulse"
        >
          <div className="w-full aspect-square rounded-md bg-hairline/50 mb-3" />
          <div className="h-3 w-3/4 rounded-full bg-hairline/50 mb-2" />
          <div className="h-2.5 w-1/2 rounded-full bg-hairline/40 mb-3" />
          <div className="h-3 w-1/3 rounded-full bg-hairline/50" />
        </div>
      ))}
    </div>
  );
}
