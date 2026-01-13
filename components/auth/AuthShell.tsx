import Card from '@/components/ui/Card';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="min-h-screen bg-bg-base flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-text-tertiary">Operations</p>
          <h1 className="mt-2 text-2xl font-bold text-text-primary">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
        </div>
        <Card className="space-y-4">{children}</Card>
        {footer && <div className="mt-4 text-center text-sm text-text-secondary">{footer}</div>}
      </div>
    </div>
  );
}
