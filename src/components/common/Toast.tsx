import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface ToastProps {
  message: string;
  type?: 'success' | 'error' | 'info';
  isVisible: boolean;
}

export function Toast({ message, type = 'info', isVisible }: ToastProps) {
  if (!isVisible) return null;

  const types = {
    success: 'bg-[#C8E6C9] text-[#2E7D32]',
    error: 'bg-[#FFCDD2] text-[#C62828]',
    info: 'bg-[#D4A574] text-white',
  };

  return (
    <div
      className={cn(
        'fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-xl shadow-lg',
        'animate-in fade-in-0 slide-in-from-bottom-4 duration-300',
        types[type]
      )}
    >
      {message}
    </div>
  );
}