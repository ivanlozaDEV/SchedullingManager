import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

export interface ToastItem {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  showToast: (toast: Omit<ToastItem, 'id'>) => void;
  success: (title: string, message?: string, duration?: number) => void;
  error: (title: string, message?: string, duration?: number) => void;
  warning: (title: string, message?: string, duration?: number) => void;
  info: (title: string, message?: string, duration?: number) => void;
  removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    ({ type, title, message, duration = 4500 }: Omit<ToastItem, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9);
      const newToast: ToastItem = { id, type, title, message, duration };

      setToasts((prev) => [newToast, ...prev].slice(0, 5)); // Max 5 visible toasts

      if (duration > 0) {
        setTimeout(() => {
          removeToast(id);
        }, duration);
      }
    },
    [removeToast]
  );

  const success = useCallback(
    (title: string, message?: string, duration?: number) => {
      showToast({ type: 'success', title, message, duration });
    },
    [showToast]
  );

  const error = useCallback(
    (title: string, message?: string, duration?: number) => {
      showToast({ type: 'error', title, message, duration: duration || 6000 });
    },
    [showToast]
  );

  const warning = useCallback(
    (title: string, message?: string, duration?: number) => {
      showToast({ type: 'warning', title, message, duration: duration || 5000 });
    },
    [showToast]
  );

  const info = useCallback(
    (title: string, message?: string, duration?: number) => {
      showToast({ type: 'info', title, message, duration });
    },
    [showToast]
  );

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info, removeToast }}>
      {children}
      {/* Toast Floating Container */}
      <div
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-2.5 max-w-sm sm:max-w-md w-full pointer-events-none p-2 sm:p-0"
        aria-live="polite"
      >
        {toasts.map((t) => {
          const config = {
            success: {
              bg: 'bg-white',
              border: 'border-emerald-300',
              accent: 'border-l-4 border-l-emerald-600',
              icon: <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />,
              titleColor: 'text-emerald-950',
              textColor: 'text-slate-600',
            },
            error: {
              bg: 'bg-white',
              border: 'border-rose-300',
              accent: 'border-l-4 border-l-rose-600',
              icon: <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />,
              titleColor: 'text-rose-950',
              textColor: 'text-slate-600',
            },
            warning: {
              bg: 'bg-white',
              border: 'border-amber-300',
              accent: 'border-l-4 border-l-amber-500',
              icon: <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />,
              titleColor: 'text-amber-950',
              textColor: 'text-slate-600',
            },
            info: {
              bg: 'bg-white',
              border: 'border-tealBrand-300',
              accent: 'border-l-4 border-l-tealBrand-600',
              icon: <Info className="w-5 h-5 text-tealBrand-600 shrink-0 mt-0.5" />,
              titleColor: 'text-tealBrand-950',
              textColor: 'text-slate-600',
            },
          }[t.type];

          return (
            <div
              key={t.id}
              role="status"
              className={`pointer-events-auto shadow-xl rounded-xl p-3.5 border ${config.border} ${config.accent} ${config.bg} flex items-start justify-between gap-3 transition-all transform hover:scale-[1.01] animate-in slide-in-from-top-3 fade-in duration-200`}
            >
              <div className="flex items-start gap-2.5">
                {config.icon}
                <div className="space-y-0.5">
                  <h4 className={`text-xs font-bold ${config.titleColor} leading-tight`}>{t.title}</h4>
                  {t.message && (
                    <p className={`text-[11px] ${config.textColor} leading-relaxed whitespace-pre-line`}>
                      {t.message}
                    </p>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="text-slate-400 hover:text-slate-700 p-1 rounded-lg hover:bg-slate-100 transition-colors shrink-0 cursor-pointer"
                aria-label="Cerrar notificación"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}
