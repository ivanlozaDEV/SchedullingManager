import { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, AlertCircle, ArrowLeft } from 'lucide-react';

interface LoginGateProps {
  onLogin: (role: 'admin' | 'viewer') => void;
  onBack?: () => void;
}

export function LoginGate({ onLogin, onBack }: LoginGateProps) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const adminPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'IPStorms2022';
  const viewerPassword = import.meta.env.VITE_VIEWER_PASSWORD || 'IPViewer2022';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = password.trim();

    if (!trimmed) {
      setError('Please enter your access key.');
      return;
    }

    setIsSubmitting(true);

    setTimeout(() => {
      if (trimmed === adminPassword) {
        if (rememberMe) {
          localStorage.setItem('ip_scheduling_auth_role', 'admin');
        } else {
          sessionStorage.setItem('ip_scheduling_auth_role', 'admin');
        }
        onLogin('admin');
      } else if (trimmed === viewerPassword) {
        if (rememberMe) {
          localStorage.setItem('ip_scheduling_auth_role', 'viewer');
        } else {
          sessionStorage.setItem('ip_scheduling_auth_role', 'viewer');
        }
        onLogin('viewer');
      } else {
        setError('Incorrect access key. Please verify and try again.');
        setIsSubmitting(false);
      }
    }, 200);
  };

  return (
    <div className="min-h-screen bg-[#F5F9FA] flex items-center justify-center p-4 sm:p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header Branding in Celeste / Ocean Blue */}
        <div className="bg-gradient-to-r from-[#1187aa] to-[#0c6079] p-6 text-center text-white relative">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="absolute left-4 top-4 text-xs font-semibold text-cyan-100 hover:text-white flex items-center gap-1 transition-colors px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 cursor-pointer font-['Montserrat',sans-serif]"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Hub</span>
            </button>
          )}

          <div className="mx-auto bg-white p-3 rounded-2xl flex items-center justify-center mb-3 shadow-sm max-w-[210px]">
            <img 
              src="/ip-adjusting-logo.svg" 
              alt="IP Adjusting Group Logo" 
              className="h-9 w-auto object-contain"
            />
          </div>
          
          <h1 className="text-lg font-bold font-['Montserrat',sans-serif] tracking-tight">
            IP Scheduling Manager
          </h1>
          <p className="text-xs text-cyan-100/90 mt-0.5 font-medium">
            Inspection Scheduling & Coordination
          </p>
        </div>

        {/* Form Body */}
        <div className="p-6 sm:p-8">
          <div className="text-center mb-6">
            <h2 className="text-base font-bold text-[#171717] font-['Montserrat',sans-serif]">Protected Workspace</h2>
            <p className="text-xs text-slate-500 mt-1">
              Enter your assigned access key to unlock the scheduling system.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Error Message */}
            {error && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 flex items-center gap-2.5 text-xs text-rose-700 font-medium animate-in fade-in">
                <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Password input */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5 font-['Montserrat',sans-serif]">
                Password / Access Key
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  autoFocus
                  required
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm font-medium text-slate-900 placeholder-slate-400 focus:outline-hidden focus:ring-2 focus:ring-[#1187aa] focus:border-[#1187aa] focus:bg-white transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me */}
            <div className="flex items-center justify-between text-xs text-slate-600">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="w-4 h-4 text-[#1187aa] rounded border-slate-300 focus:ring-[#1187aa] cursor-pointer"
                />
                <span>Remember me on this browser</span>
              </label>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 bg-[#1187aa] hover:bg-[#0e7492] active:bg-[#0a566c] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all duration-150 disabled:opacity-60 cursor-pointer font-['Montserrat',sans-serif]"
            >
              <span>{isSubmitting ? 'Verifying...' : 'Unlock Scheduling Manager'}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* Footer note */}
          <div className="mt-6 pt-5 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-400 font-medium">
            <span>IP Adjusting Group LLC</span>
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                className="text-[#1187aa] hover:text-[#0c6079] hover:underline font-semibold cursor-pointer"
              >
                Return to Hub
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
