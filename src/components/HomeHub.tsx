import { Calendar, DollarSign, ArrowRight, ExternalLink, LogOut, CheckCircle2, Clock } from 'lucide-react';

interface HomeHubProps {
  onOpenScheduling: () => void;
  onLogout: () => void;
  authRole: 'admin' | 'viewer' | null;
}

export function HomeHub({ onOpenScheduling, onLogout, authRole }: HomeHubProps) {
  return (
    <div className="min-h-screen bg-[#F5F9FA] text-[#383F41] flex flex-col font-sans relative">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          
          {/* Official Brand Logo */}
          <div className="flex items-center space-x-4">
            <img 
              src="/ip-adjusting-logo.svg" 
              alt="IP Adjusting Group Logo" 
              className="h-10 w-auto object-contain"
            />
            <div className="hidden sm:block border-l border-slate-200 pl-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e7f3f7] text-[#1187aa] border border-[#419fbb]/30 uppercase tracking-wider font-['Montserrat',sans-serif]">
                Operations Hub
              </span>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">Unified Operations & Management Suite</p>
            </div>
          </div>

          {/* User Controls */}
          {authRole ? (
            <div className="flex items-center space-x-3">
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-md bg-slate-100 text-[#383F41] border border-slate-200 uppercase tracking-wider font-['Montserrat',sans-serif]">
                Role: {authRole}
              </span>
              <button
                onClick={onLogout}
                title="Lock session"
                className="p-2 rounded-lg bg-slate-100 hover:bg-sky-50 border border-slate-300 hover:border-sky-300 text-slate-600 hover:text-[#1187aa] transition-colors cursor-pointer flex items-center gap-1.5 text-xs font-semibold"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Lock</span>
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-[#e7f3f7] text-[#1187aa] border border-[#419fbb]/30 font-['Montserrat',sans-serif]">
                🔒 Enterprise Gateway
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Hub Content */}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 flex-1 w-full flex flex-col justify-center">
        
        {/* Welcome Section */}
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#e7f3f7] text-[#1187aa] text-xs font-bold uppercase tracking-wider mb-3 border border-[#419fbb]/30">
            <span className="w-1.5 h-1.5 rounded-full bg-[#1187aa]" />
            IP Adjusting Group LLC • Portal
          </div>
          <h1 className="text-3xl sm:text-4xl font-black text-[#171717] font-['Montserrat',sans-serif] tracking-tight">
            Select Your Workspace
          </h1>
          <p className="text-sm sm:text-base text-slate-600 mt-2.5 leading-relaxed font-sans">
            Choose the operational workspace you need to access below:
          </p>
        </div>

        {/* 2 Main Application Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          
          {/* Card 1: IP Scheduling Manager */}
          <div 
            onClick={onOpenScheduling}
            className="group relative bg-white hover:bg-[#fafcfe] border border-slate-200 hover:border-[#1187aa] rounded-2xl p-7 transition-all duration-200 shadow-sm hover:shadow-xl cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-14 h-14 rounded-2xl bg-[#e7f3f7] border border-[#419fbb]/30 flex items-center justify-center text-[#1187aa] group-hover:scale-105 transition-transform duration-200">
                  <Calendar className="w-7 h-7 text-[#1187aa]" />
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#e7f3f7] text-[#1187aa] border border-[#419fbb]/30 uppercase font-['Montserrat',sans-serif]">
                  Active System
                </span>
              </div>

              <h2 className="text-xl font-extrabold text-[#171717] group-hover:text-[#1187aa] transition-colors font-['Montserrat',sans-serif]">
                IP Scheduling Manager
              </h2>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Inspection scheduling coordination, carrier date offering, public adjuster & client 1-click approvals, and calendar synchronization.
              </p>

              <div className="space-y-2.5 mt-6 pt-5 border-t border-slate-100 text-xs text-[#383F41]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#1187aa] shrink-0" />
                  <span>4-Stage Coordination Funnel & Kanban</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#1187aa] shrink-0" />
                  <span>Automated 1-Click Client & PA Email Selection</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#1187aa] shrink-0" />
                  <span>Google Calendar Invites & Nextiva Quick Dial</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4">
              <button
                type="button"
                className="w-full py-3 px-4 bg-[#1187aa] hover:bg-[#0e7492] active:bg-[#0a566c] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all duration-150 cursor-pointer font-['Montserrat',sans-serif]"
              >
                <span>Open Scheduling Manager</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>

          {/* Card 2: IP / JD Tracker */}
          <div 
            onClick={() => window.open('https://ipjdmanager.onrender.com/', '_blank', 'noopener,noreferrer')}
            className="group relative bg-white hover:bg-[#fafcfe] border border-slate-200 hover:border-[#0c6079] rounded-2xl p-7 transition-all duration-200 shadow-sm hover:shadow-xl cursor-pointer flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between mb-5">
                <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-300 flex items-center justify-center text-[#0c6079] group-hover:scale-105 transition-transform duration-200">
                  <DollarSign className="w-7 h-7 text-[#0c6079]" />
                </div>
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 uppercase flex items-center gap-1.5 font-['Montserrat',sans-serif]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Live on Render
                </span>
              </div>

              <h2 className="text-xl font-extrabold text-[#171717] group-hover:text-[#0c6079] transition-colors font-['Montserrat',sans-serif]">
                IP:JD Claims & Invoices Tracker
              </h2>
              <p className="text-xs text-slate-600 mt-2 leading-relaxed">
                Financial tracking, claims and invoices reconciliation, fee audit, payments management, and Excel reporting for JD claims.
              </p>

              <div className="space-y-2.5 mt-6 pt-5 border-t border-slate-100 text-xs text-[#383F41]">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0c6079] shrink-0" />
                  <span>Claims & Invoices Fee Reconciliation</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0c6079] shrink-0" />
                  <span>JD Payment Reports & Excel Data Sync</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[#0c6079] shrink-0" />
                  <span>Multi-Level Role Access & Financial Audit</span>
                </div>
              </div>
            </div>

            <div className="mt-8 pt-4">
              <a
                href="https://ipjdmanager.onrender.com/"
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="w-full py-3 px-4 bg-[#0c6079] hover:bg-[#094a5e] active:bg-[#063442] text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 shadow-xs transition-all duration-150 cursor-pointer font-['Montserrat',sans-serif]"
              >
                <span>Launch JD Tracker (Render)</span>
                <ExternalLink className="w-4 h-4 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
              </a>
            </div>
          </div>

        </div>

        {/* Footer info */}
        <div className="mt-14 pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#1187aa]" />
            <span>IP Adjusting Group LLC • Operations Platform</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1 text-slate-500 font-medium">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              Support: admin@ipadjustinggroup.com
            </span>
          </div>
        </div>

      </main>
    </div>
  );
}
