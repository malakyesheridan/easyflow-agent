'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { QuickActionEntityType, QuickActionDefinition, QuickActionContext } from '@/lib/quick-actions/registry';
import { getQuickActions } from '@/lib/quick-actions/registry';
import { useSession } from '@/hooks/useSession';

type ToastVariant = 'success' | 'error';
type ToastState = { message: string; variant: ToastVariant } | null;

export default function QuickActionsMenu<T>({
  entity,
  entityType,
  orgId,
  extra,
  onActionComplete,
}: {
  entity: T;
  entityType: QuickActionEntityType;
  orgId: string;
  extra?: Record<string, unknown>;
  onActionComplete?: () => void;
}) {
  const router = useRouter();
  const { session } = useSession();
  const sessionCapabilities = session?.actor?.capabilities;
  const capabilities = useMemo(() => sessionCapabilities ?? [], [sessionCapabilities]);
  const [isOpen, setIsOpen] = useState(false);
  const [isWorking, setIsWorking] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const showToast = useCallback((message: string, variant: ToastVariant = 'success') => {
    setToast({ message, variant });
    setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const prompt = useCallback((message: string, defaultValue?: string) => {
    return window.prompt(message, defaultValue);
  }, []);

  const confirm = useCallback((message: string) => {
    return window.confirm(message);
  }, []);

  const pickFile = useCallback((accept?: string) => {
    return new Promise<File | null>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      if (accept) input.accept = accept;
      input.onchange = () => {
        resolve(input.files?.[0] ?? null);
      };
      input.click();
    });
  }, []);

  const logQuickActionUsage = useCallback(async (action: QuickActionDefinition, entityId?: string | null) => {
    try {
      await fetch('/api/audit-logs/quick-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orgId,
          entityType,
          entityId: entityId ?? null,
          actionId: action.id,
          label: action.label,
        }),
      });
    } catch {
      // ignore
    }
  }, [entityType, orgId]);

  const ctx = useMemo<QuickActionContext<T>>(
    () => ({
      entityType,
      entity,
      orgId,
      capabilities,
      showToast,
      confirm,
      prompt,
      pickFile,
      navigate: (href) => router.push(href),
      refresh: () => router.refresh(),
      extra,
    }),
    [capabilities, confirm, entity, entityType, extra, orgId, pickFile, prompt, router, showToast]
  );

  const actions = useMemo(() => getQuickActions<T>(entityType, ctx), [ctx, entityType]);

  const runAction = async (action: QuickActionDefinition<T>) => {
    setIsWorking(action.id);
    try {
      if (action.requiresConfirm) {
        const message = action.confirmMessage ? action.confirmMessage(ctx) : 'Are you sure?';
        if (!confirm(message)) {
          setIsWorking(null);
          return;
        }
      }
      await action.handler(ctx);
      await logQuickActionUsage(action, (entity as any)?.id ?? null);
      onActionComplete?.();
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Action failed', 'error');
    } finally {
      setIsWorking(null);
      setIsOpen(false);
    }
  };

  if (actions.length === 0) return null;

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen((prev) => !prev);
        }}
        className="p-1 rounded-md hover:bg-bg-section text-text-secondary hover:text-text-primary transition-colors"
        aria-label="Quick actions"
      >
        <span className="text-lg">...</span>
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-1 w-56 bg-bg-card border border-border-subtle rounded-lg shadow-lift z-50">
          <div className="py-1">
            {actions.map((action) => (
              <button
                key={action.id}
                onClick={() => void runAction(action)}
                disabled={isWorking !== null}
                className="w-full text-left px-4 py-2 text-sm text-text-primary hover:bg-bg-section transition-colors disabled:opacity-60"
              >
                {action.icon ? <span className="mr-2">{action.icon}</span> : null}
                {action.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {toast && (
        <div className="absolute right-0 mt-2 w-64 text-xs rounded-md border border-border-subtle bg-bg-card px-3 py-2 shadow-lift">
          <p className={toast.variant === 'error' ? 'text-destructive' : 'text-text-primary'}>
            {toast.message}
          </p>
        </div>
      )}
    </div>
  );
}
