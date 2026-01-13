'use client';

import Card from '@/components/ui/Card';

function SkeletonCard() {
  return (
    <Card className="animate-pulse">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-bg-section/80" />
          <div>
            <div className="h-3 w-32 rounded bg-bg-section/80" />
            <div className="mt-2 h-3 w-24 rounded bg-bg-section/80" />
          </div>
        </div>
        <div className="h-5 w-20 rounded bg-bg-section/80" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="h-10 rounded bg-bg-section/80" />
        <div className="h-10 rounded bg-bg-section/80" />
        <div className="h-10 rounded bg-bg-section/80" />
      </div>
      <div className="mt-4 h-2 w-full rounded bg-bg-section/80" />
    </Card>
  );
}

export default function CrewsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

