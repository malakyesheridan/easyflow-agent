import { cn } from '@/lib/utils';

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'gold' | 'muted';
  className?: string;
}

export default function Badge({ children, variant = 'default', className }: BadgeProps) {
  const variantClasses = {
    default: 'bg-bg-section text-text-secondary',
    gold: 'bg-accent-gold text-[hsl(var(--primary-foreground))]',
    muted: 'bg-bg-section/50 text-text-tertiary',
  };

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
}

