import { useState } from 'react';
import { 
  X, 
  History, 
  Calendar, 
  Clock, 
  RotateCcw, 
  CheckCircle2, 
  Scale, 
  Building2, 
  Plus, 
  Send,
  MessageSquare,
  Phone
} from 'lucide-react';
import { schedulingService } from '../lib/schedulingService';
import type { CoordinationEvent, CoordinationLog, ContactChannel } from '../types';

interface EventHistoryModalProps {
  event: CoordinationEvent;
  isOpen: boolean;
  onClose: () => void;
  onLogAdded?: () => void;
}

export function EventHistoryModal({
  event,
  isOpen,
  onClose,
  onLogAdded,
}: EventHistoryModalProps) {
  const [newNote, setNewNote] = useState('');
  const [targetActor, setTargetActor] = useState<'carrier_rep' | 'pa' | 'insured' | 'external_actor' | 'internal'>('carrier_rep');
  const [actorName, setActorName] = useState('');
  const [channel, setChannel] = useState<ContactChannel>('call_answered');
  const [isAddingLog, setIsAddingLog] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  if (!isOpen) return null;

  const logs = [...(event.logs || [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleAddLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setIsAddingLog(true);
    try {
      await schedulingService.addCoordinationLog({
        eventId: event.id,
        contactTarget: targetActor,
        contactTargetName: actorName.trim() || undefined,
        channel: channel as any,
        notes: newNote.trim(),
      });
      setNewNote('');
      setActorName('');
      setShowAddForm(false);
      if (onLogAdded) onLogAdded();
    } catch (err: any) {
      console.error('Error adding log:', err);
      alert('Failed to add log entry: ' + (err.message || 'Unknown error'));
    } finally {
      setIsAddingLog(false);
    }
  };

  const getLogIcon = (log: CoordinationLog) => {
    const notesLower = (log.notes || '').toLowerCase();
    if (notesLower.includes('reset') || notesLower.includes('cancel')) {
      return <RotateCcw className="w-4 h-4 text-rose-600" />;
    }
    if (notesLower.includes('confirmed') || notesLower.includes('locked')) {
      return <CheckCircle2 className="w-4 h-4 text-emerald-600" />;
    }
    if (notesLower.includes('pa') || notesLower.includes('public adjuster')) {
      return <Scale className="w-4 h-4 text-tealBrand-600" />;
    }
    if (notesLower.includes('carrier') || notesLower.includes('dates')) {
      return <Building2 className="w-4 h-4 text-amber-600" />;
    }
    if (log.channel === 'call_answered' || log.channel === 'call_unanswered') {
      return <Phone className="w-4 h-4 text-sky-600" />;
    }
    return <MessageSquare className="w-4 h-4 text-slate-500" />;
  };

  const getLogBadgeStyle = (log: CoordinationLog) => {
    const notesLower = (log.notes || '').toLowerCase();
    if (notesLower.includes('reset') || notesLower.includes('cancel')) {
      return 'bg-rose-100 text-rose-900 border-rose-300';
    }
    if (notesLower.includes('confirmed') || notesLower.includes('locked')) {
      return 'bg-emerald-100 text-emerald-900 border-emerald-300';
    }
    if (notesLower.includes('pa') || notesLower.includes('public adjuster')) {
      return 'bg-tealBrand-100 text-tealBrand-900 border-tealBrand-300';
    }
    if (notesLower.includes('carrier') || notesLower.includes('dates')) {
      return 'bg-amber-100 text-amber-900 border-amber-300';
    }
    return 'bg-slate-100 text-slate-800 border-slate-300';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-950 text-white p-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center border border-white/20">
              <History className="w-5 h-5 text-tealBrand-300" />
            </div>
            <div>
              <h2 className="text-base font-bold tracking-tight flex items-center gap-2">
                <span>Event History & Audit Log</span>
                <span className="text-xs bg-white/15 px-2 py-0.5 rounded-full font-mono text-tealBrand-200">
                  {logs.length} entries
                </span>
              </h2>
              <p className="text-xs text-slate-300">
                Complete progression timeline, resets, and communications
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white/90 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Claim / Event Context Bar */}
        <div className="bg-slate-50 border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-3">
            <span className="font-mono font-bold text-maroon-800 text-sm">
              {event.claim?.claimNumber}
            </span>
            <span className="text-slate-400">•</span>
            <span className="font-semibold text-slate-800">{event.eventType}</span>
            <span className="text-slate-400">•</span>
            <span className="text-slate-600">{event.claim?.carrier}</span>
          </div>

          <button
            type="button"
            onClick={() => setShowAddForm(!showAddForm)}
            className="text-xs font-semibold px-2.5 py-1 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 transition-colors flex items-center gap-1 shadow-2xs"
          >
            <Plus className="w-3.5 h-3.5 text-slate-500" />
            <span>{showAddForm ? 'Close Entry Form' : '+ Add Note / Call Log'}</span>
          </button>
        </div>

        {/* Quick Add Log Entry Form */}
        {showAddForm && (
          <form onSubmit={handleAddLog} className="p-4 bg-tealBrand-50/40 border-b border-tealBrand-200 space-y-3 shrink-0 animate-in slide-in-from-top-2 duration-150">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-tealBrand-950 flex items-center gap-1.5">
                <MessageSquare className="w-3.5 h-3.5 text-tealBrand-700" />
                <span>Log Contact Attempt or Note</span>
              </span>
              <span className="text-[11px] text-slate-500">Recorded permanently into event history</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Target Actor</label>
                <select
                  value={targetActor}
                  onChange={(e) => setTargetActor(e.target.value as any)}
                  className="w-full text-xs p-1.5 rounded border border-slate-300 bg-white"
                >
                  <option value="carrier_rep">Carrier / Adjuster</option>
                  <option value="pa">Public Adjuster</option>
                  <option value="insured">Insured / Client</option>
                  <option value="external_actor">External Actor</option>
                  <option value="internal">Internal Note</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Contact Name (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Adjuster Pedro"
                  value={actorName}
                  onChange={(e) => setActorName(e.target.value)}
                  className="w-full text-xs p-1.5 rounded border border-slate-300 bg-white"
                >
                </input>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-700 mb-0.5">Channel</label>
                <select
                  value={channel}
                  onChange={(e) => setChannel(e.target.value as any)}
                  className="w-full text-xs p-1.5 rounded border border-slate-300 bg-white"
                >
                  <option value="call_answered">Phone (Answered)</option>
                  <option value="call_unanswered">Phone (No Answer)</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="email">Email</option>
                  <option value="other">Note / System</option>
                </select>
              </div>
            </div>

            <textarea
              rows={2}
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Write log notes (e.g. Spoke with adjuster, confirmed they will review dates by 2 PM)..."
              className="w-full p-2 text-xs rounded border border-slate-300 bg-white placeholder:text-slate-400 focus:outline-hidden focus:ring-1 focus:ring-tealBrand-600 resize-none"
              required
            />

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200/50 rounded"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isAddingLog || !newNote.trim()}
                className="px-3 py-1 text-xs font-bold bg-tealBrand-800 hover:bg-tealBrand-900 disabled:opacity-50 text-white rounded flex items-center gap-1 shadow-xs"
              >
                <Send className="w-3 h-3" />
                <span>{isAddingLog ? 'Saving...' : 'Save Log'}</span>
              </button>
            </div>
          </form>
        )}

        {/* Timeline Body */}
        <div className="p-5 flex-1 overflow-y-auto space-y-4">
          {logs.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <History className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-sm font-bold text-slate-800">No logs recorded yet</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Stage advancements, contact attempts, and cancellation resets will automatically appear in this timeline.
              </p>
              <button
                type="button"
                onClick={() => setShowAddForm(true)}
                className="inline-flex items-center gap-1.5 text-xs font-bold text-tealBrand-800 bg-tealBrand-50 border border-tealBrand-200 px-3 py-1.5 rounded-lg hover:bg-tealBrand-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add First Entry</span>
              </button>
            </div>
          ) : (
            <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {logs.map((log) => {
                const dateObj = new Date(log.createdAt);
                const formattedDate = dateObj.toLocaleDateString(undefined, {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric'
                });
                const formattedTime = dateObj.toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit'
                });

                return (
                  <div key={log.id} className="relative group">
                    {/* Bullet marker */}
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-white border-2 border-slate-300 group-hover:border-tealBrand-600 flex items-center justify-center transition-colors shadow-2xs">
                      <div className="w-1.5 h-1.5 rounded-full bg-slate-400 group-hover:bg-tealBrand-600 transition-colors" />
                    </div>

                    {/* Card */}
                    <div className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2 shadow-2xs hover:shadow-xs transition-shadow">
                      <div className="flex items-start justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-2">
                          <span className="p-1 rounded-md bg-slate-50 border border-slate-200">
                            {getLogIcon(log)}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${getLogBadgeStyle(log)}`}>
                            {log.contactTargetName || log.contactTarget || 'System Event'}
                          </span>
                          {log.channel && log.channel !== 'system_reset' && (
                            <span className="text-[10px] text-slate-500 font-medium">
                              via {log.channel.replace('_', ' ')}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-mono">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span>{formattedDate}</span>
                          <Clock className="w-3 h-3 text-slate-400 ml-1" />
                          <span>{formattedTime}</span>
                        </div>
                      </div>

                      <p className="text-xs text-slate-800 leading-relaxed whitespace-pre-wrap font-medium">
                        {log.notes}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-slate-50 border-t border-slate-200 px-5 py-3 flex items-center justify-between text-xs text-slate-500 shrink-0">
          <span>Event ID: <strong className="font-mono text-slate-700">{event.id.slice(0, 8)}...</strong></span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold rounded-lg transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
