'use client';

import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import OperationsIntelligenceView from '@/components/operations/OperationsIntelligenceView';
import OperationsMapView from '@/components/operations/OperationsMapView';
import type { OperationsMapPayload } from '@/lib/types/operations_map';
import { cn } from '@/lib/utils';
import type { Surface } from '@/lib/surface';

type OperationsHubProps = {
  mapPayload: OperationsMapPayload | null;
  mapError?: string | null;
  orgId?: string;
  surface?: Surface;
};

export default function OperationsHub({ mapPayload, mapError, orgId, surface }: OperationsHubProps) {
  const isCrewSurface = surface === 'crew';
  const [view, setView] = useState<'map' | 'intelligence'>('map');

  useEffect(() => {
    if (isCrewSurface && view !== 'map') {
      setView('map');
    }
  }, [isCrewSurface, view]);

  const header = (
    <div className="mb-4 md:mb-8">
      <div className="md:hidden sticky top-0 z-30 bg-bg-base/95 backdrop-blur border-b border-border-subtle py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-lg font-semibold text-text-primary truncate">Operations</h1>
            <p className="text-xs text-text-secondary truncate">Live map visibility and intelligence signals.</p>
          </div>
        </div>
      </div>

      <div className="hidden md:flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-text-primary mb-2">Operations</h1>
          <p className="text-sm text-text-secondary">Live map visibility and intelligence signals.</p>
        </div>
      </div>
    </div>
  );

  const toggle = isCrewSurface ? null : (
    <div className="flex justify-center">
      <div className="inline-flex items-center gap-2 rounded-full border border-border-subtle bg-bg-section/40 p-1">
        <Button
          type="button"
          className="rounded-full px-5"
          variant={view === 'map' ? 'primary' : 'secondary'}
          aria-pressed={view === 'map'}
          onClick={() => setView('map')}
        >
          Map
        </Button>
        <Button
          type="button"
          className={cn(
            'rounded-full px-5',
            view === 'intelligence' ? '' : 'border-accent-gold/40 text-accent-gold hover:border-accent-gold'
          )}
          variant={view === 'intelligence' ? 'primary' : 'secondary'}
          aria-pressed={view === 'intelligence'}
          onClick={() => setView('intelligence')}
        >
          Intelligence
        </Button>
      </div>
    </div>
  );

  if (view === 'map') {
    return (
      <div className="min-h-screen bg-bg-base">
        <div className="w-full px-4 pt-6 pb-24 md:px-6 md:py-8 lg:px-4">
          {header}
          {toggle}
          <div className="mt-6">
            {mapPayload ? (
              <OperationsMapView payload={mapPayload} surface={surface} />
            ) : (
              <Card>
                <p className="text-destructive font-medium">Error loading operations map</p>
                <p className="text-sm text-text-secondary mt-1">{mapError || 'Map data is unavailable.'}</p>
                <Button className="mt-4" onClick={() => window.location.reload()}>
                  Retry
                </Button>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg-base">
      <div className="mx-auto max-w-7xl px-6 pt-6 pb-24 md:py-8">
        {header}
        {toggle}
        <div className="mt-6">
          <OperationsIntelligenceView orgId={orgId} />
        </div>
      </div>
    </div>
  );
}
