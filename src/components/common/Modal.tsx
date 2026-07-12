import { ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Modal({ isOpen, onClose, title, children, className }: ModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 背景遮罩 */}
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* 模态框内容 */}
      <div
        className={cn(
          'relative bg-[#FAF8F5] rounded-2xl shadow-2xl max-w-lg w-full mx-4',
          'animate-in fade-in-0 zoom-in-95 duration-200',
          className
        )}
      >
        {/* 头部 */}
        {title && (
          <div className="flex items-center justify-between px-6 py-4 border-b border-[#E8E4DE]">
            <h3 className="text-lg font-semibold text-[#4A3F35]">{title}</h3>
            <button
              onClick={onClose}
              className="p-2 rounded-full hover:bg-[#E8E4DE] transition-colors"
            >
              <X className="w-5 h-5 text-[#6B5E54]" />
            </button>
          </div>
        )}
        
        {/* 内容 */}
        <div className="px-6 py-4">{children}</div>
      </div>
    </div>
  );
}