'use client';

import Card from '@/components/ui/Card';

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <div className="h-3 w-28 rounded bg-bg-section/80" />
      <div className="mt-3 h-8 w-32 rounded bg-bg-section/80" />
      <div className="mt-2 h-3 w-44 rounded bg-bg-section/80" />
    </Card>
  );
}

export default function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <div className="h-8 w-20 rounded-full bg-bg-section/80 animate-pulse" />
        <div className="h-8 w-20 rounded-full bg-bg-section/80 animate-pulse" />
        <div className="h-8 w-24 rounded-full bg-bg-section/80 animate-pulse" />
        <div className="h-8 w-32 rounded-full bg-bg-section/80 animate-pulse" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </div>
  );
}
