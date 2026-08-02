export function SkeletonCard() {
  return (
    <div className="bg-ktip-cream rounded-surface shadow-card border border-ktip-sand-100 p-card-pad animate-pulse-soft">
      {/* Image placeholder */}
      <div className="h-40 bg-ktip-sand-100 rounded-control mb-4" />
      {/* Badge placeholder */}
      <div className="h-5 w-20 bg-ktip-sand-100 rounded-full mb-3" />
      {/* Title placeholder */}
      <div className="h-6 bg-ktip-sand-100 rounded-control mb-2 w-3/4" />
      {/* Description lines */}
      <div className="space-y-2 mb-4">
        <div className="h-4 bg-ktip-sand-100 rounded w-full" />
        <div className="h-4 bg-ktip-sand-100 rounded w-5/6" />
      </div>
      {/* Footer placeholder */}
      <div className="flex items-center justify-between pt-4 border-t border-ktip-sand-100">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 bg-ktip-sand-100 rounded-full" />
          <div className="h-4 w-24 bg-ktip-sand-100 rounded" />
        </div>
        <div className="h-4 w-16 bg-ktip-sand-100 rounded" />
      </div>
    </div>
  )
}

export function SkeletonGrid({ count, className }: { count?: number; className?: string }) {
  return (
    <div className={className ?? 'grid md:grid-cols-2 lg:grid-cols-3 gap-6'}>
      {Array.from({ length: count ?? 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  )
}
