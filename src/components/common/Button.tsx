import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ButtonProps {
  children: ReactNode;
  onClick?: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  disabled?: boolean;
}

export function Button({
  children,
  onClick,
  variant = 'primary',
  size = 'md',
  className,
  disabled,
}: ButtonProps) {
  const baseStyles = 'inline-flex items-center justify-center rounded-xl font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed';
  
  const variants = {
    primary: 'bg-[#D4A574] text-white hover:bg-[#C49564] shadow-md hover:shadow-lg active:scale-[0.98]',
    secondary: 'bg-[#E8E4DE] text-[#4A3F35] hover:bg-[#D8D4CE] shadow-sm',
    ghost: 'bg-transparent text-[#6B5E54] hover:bg-[#E8E4DE]',
  };
  
  const sizes = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
    >
      {children}
    </button>
  );
}