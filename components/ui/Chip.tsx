import { cn } from '@/lib/utils';

interface ChipProps {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}

export default function Chip({ children, active = false, onClick, className }: ChipProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-full px-3 py-1 text-sm font-medium transition-all',
        active
          ? 'bg-accent-gold text-[hsl(var(--primary-foreground))]'
          : 'bg-bg-section text-text-secondary hover:text-text-primary',
        onClick && 'cursor-pointer',
        className
      )}
    >
      {children}
    </button>
  );
}

