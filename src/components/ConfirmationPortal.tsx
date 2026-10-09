import { CheckCircle2, AlertCircle, Calendar, MapPin, User, FileText, ArrowRight, ShieldCheck } from 'lucide-react';

interface ConfirmationPortalProps {
  role: string | null;
  status: string | null;
  claim: string | null;
  insured: string | null;
  carrier: string | null;
  address: string | null;
  date: string | null;
  time: string | null;
  title: string | null;
  message: string | null;
}

export function ConfirmationPortal({
  role,
  status,
  claim,
  insured,
  carrier,
  address,
  date,
  time,
  title,
  message,
}: ConfirmationPortalProps) {
  const isSuccess = status !== 'error';
  const isInsured = role === 'insured';
  const isPA = role === 'pa';

  return (
    <div className="min-h-screen bg-[#F5F9FA] flex flex-col font-sans">
      {/* Top Navbar */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-30 shadow-xs">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <img 
              src="/ip-adjusting-logo.svg" 
              alt="IP Adjusting Group Logo" 
              className="h-10 w-auto object-contain"
            />
            <div className="hidden sm:block border-l border-slate-200 pl-3">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#e7f3f7] text-[#1187aa] border border-[#419fbb]/30 uppercase tracking-wider font-['Montserrat',sans-serif]">
                Inspection Coordination
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
            <ShieldCheck className="w-4 h-4 text-[#1187aa]" />
            <span className="hidden sm:inline">Verified Secure Response</span>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-xl mx-auto px-4 py-10 w-full flex flex-col justify-center">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
          
          {/* Status Header Banner */}
          <div className={`p-8 text-center text-white ${
            isSuccess 
              ? 'bg-gradient-to-r from-[#1187aa] to-[#0c6079]' 
              : 'bg-gradient-to-r from-rose-700 to-rose-900'
          }`}>
            <div className="mx-auto w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mb-4 border border-white/20 shadow-inner">
              {isSuccess ? (
                <CheckCircle2 className="w-10 h-10 text-cyan-200" />
              ) : (
                <AlertCircle className="w-10 h-10 text-rose-200" />
              )}
            </div>

            <h1 className="text-2xl font-black font-['Montserrat',sans-serif] tracking-tight">
              {title || (isSuccess 
                ? (isInsured ? 'Inspection Confirmed!' : 'Inspection Dates Selected!') 
                : 'Notice Regarding Your Selection')}
            </h1>

            <p className="text-xs sm:text-sm text-cyan-100/90 mt-2 font-medium max-w-md mx-auto leading-relaxed">
              {message || (isSuccess
                ? (isInsured 
                    ? 'Thank you! Your inspection appointment has been successfully locked in our system.' 
                    : 'Thank you! Your date selections have been recorded and presented to the client.')
                : 'Please contact your coordinator if you need further assistance.')}
            </p>
          </div>

          {/* Details Body */}
          <div className="p-6 sm:p-8 space-y-6">
            
            {/* Scheduled Date Highlight Box */}
            {isSuccess && date && (
              <div className="bg-[#e7f3f7]/60 border border-[#419fbb]/30 rounded-2xl p-5 text-center">
                <span className="text-[11px] font-bold uppercase tracking-wider text-[#0c6079] font-['Montserrat',sans-serif]">
                  {isInsured ? 'Confirmed Inspection Date & Time' : 'Approved Date Options'}
                </span>
                <div className="text-xl sm:text-2xl font-extrabold text-[#1187aa] mt-1 font-['Montserrat',sans-serif]">
                  📅 {date}
                </div>
                {time && (
                  <div className="text-sm font-semibold text-slate-700 mt-1 font-mono">
                    ⏰ {time}
                  </div>
                )}
              </div>
            )}

            {/* Claim Summary Card */}
            {(claim || insured || carrier || address) && (
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3 text-xs sm:text-sm">
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500 font-['Montserrat',sans-serif] border-b border-slate-200 pb-2">
                  Claim Summary
                </div>

                {claim && (
                  <div className="flex items-start gap-2.5">
                    <FileText className="w-4 h-4 text-[#1187aa] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-500">Claim Number:</span>{' '}
                      <strong className="text-slate-900 font-bold">{claim}</strong>
                    </div>
                  </div>
                )}

                {insured && (
                  <div className="flex items-start gap-2.5">
                    <User className="w-4 h-4 text-[#1187aa] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-500">Insured:</span>{' '}
                      <strong className="text-slate-900 font-bold">{insured}</strong>
                    </div>
                  </div>
                )}

                {carrier && (
                  <div className="flex items-start gap-2.5">
                    <Calendar className="w-4 h-4 text-[#1187aa] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-500">Insurance Carrier:</span>{' '}
                      <strong className="text-slate-900 font-bold">{carrier}</strong>
                    </div>
                  </div>
                )}

                {address && (
                  <div className="flex items-start gap-2.5">
                    <MapPin className="w-4 h-4 text-[#1187aa] shrink-0 mt-0.5" />
                    <div>
                      <span className="text-slate-500">Property Location:</span>{' '}
                      <strong className="text-slate-900 font-semibold">{address}</strong>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Next Steps Information */}
            <div className="text-xs text-slate-500 leading-relaxed border-t border-slate-100 pt-5 space-y-2">
              <p className="font-semibold text-slate-700">What happens next?</p>
              {isInsured ? (
                <ul className="list-disc pl-5 space-y-1">
                  <li>Our coordination desk is synchronizing the calendar invitations with the adjuster and insurance company.</li>
                  <li>You will receive an automated calendar invite and reminder prior to the inspection.</li>
                </ul>
              ) : isPA ? (
                <ul className="list-disc pl-5 space-y-1">
                  <li>The client has been notified via email with the 2 pre-approved date options.</li>
                  <li>As soon as the client picks their final date, calendar invites will be sent to all parties automatically.</li>
                </ul>
              ) : (
                <p>The IP Adjusting Group scheduling desk has logged this response.</p>
              )}
            </div>

            {/* Action Link */}
            <div className="pt-2">
              <a
                href="https://ipadjustinggroup.com"
                target="_blank"
                rel="noreferrer"
                className="w-full py-3 px-4 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
              >
                <span>Visit IP Adjusting Group Official Website</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>

          </div>

          {/* Footer note */}
          <div className="bg-slate-50 px-6 py-4 border-t border-slate-100 text-center text-[11px] text-slate-400">
            IP Adjusting Group LLC • Public Insurance Adjusters • Florida
          </div>

        </div>
      </main>
    </div>
  );
}
