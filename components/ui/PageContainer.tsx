import { cn } from '@/lib/utils';

interface PageContainerProps {
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}

export default function PageContainer({ children, className, innerClassName }: PageContainerProps) {
  return (
    <div className={cn('min-h-screen bg-bg-base', className)}>
      <div
        className={cn(
          'mx-auto max-w-7xl px-6 pt-6 pb-24 md:py-8',
          innerClassName,
          className?.includes('!px-') ? '' : ''
        )}
      >
        {children}
      </div>
    </div>
  );
}

