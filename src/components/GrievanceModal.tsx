import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Send,
  HelpCircle,
  ExternalLink,
  ChevronRight,
  RefreshCw,
  AlertOctagon,
  Phone,
  Mail,
  Building,
} from 'lucide-react';
import { useLumen } from '../store';
import {
  GrievanceCategory,
  GrievancePriority,
  GrievanceTicket,
} from '../types';
import {
  NODAL_OFFICER_INFO,
  generateDisputeDossier,
  CreateGrievanceRequest,
} from '../services/grievanceService';

export function GrievanceModal() {
  const {
    grievanceModalOpen,
    closeGrievanceModal,
    prefilledGrievance,
    state,
    submitGrievance,
    escalateGrievanceTicketAction,
    triggerEmergencyFreezeAction,
    triggerToast,
  } = useLumen();

  const [tab, setTab] = useState<'create' | 'tickets' | 'escalation' | 'freeze'>('create');
  const [category, setCategory] = useState<GrievanceCategory>('upi_deposit_pending');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [relatedUtr, setRelatedUtr] = useState('');
  const [relatedTxHash, setRelatedTxHash] = useState('');
  const [relatedTxId, setRelatedTxId] = useState('');
  const [amountUSD, setAmountUSD] = useState('');
  const [amountINR, setAmountINR] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [escalateReason, setEscalateReason] = useState('');
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  const tickets = state.grievanceTickets || [];

  useEffect(() => {
    if (prefilledGrievance) {
      if (prefilledGrievance.category) setCategory(prefilledGrievance.category);
      if (prefilledGrievance.title) setTitle(prefilledGrievance.title);
      if (prefilledGrievance.relatedUtr) setRelatedUtr(prefilledGrievance.relatedUtr);
      if (prefilledGrievance.relatedTxHash) setRelatedTxHash(prefilledGrievance.relatedTxHash);
      if (prefilledGrievance.relatedTxId) setRelatedTxId(prefilledGrievance.relatedTxId);
      if (prefilledGrievance.amountUSD) setAmountUSD(String(prefilledGrievance.amountUSD));
      if (prefilledGrievance.amountINR) setAmountINR(String(prefilledGrievance.amountINR));
      setTab('create');
    }
  }, [prefilledGrievance]);

  if (!grievanceModalOpen) return null;

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) return;

    setIsSubmitting(true);
    try {
      const ticket = await submitGrievance({
        userUid: state.authSession?.user?.uid || 'guest_user',
        category,
        title: title.trim(),
        description: description.trim(),
        relatedUtr: relatedUtr.trim() || undefined,
        relatedTxHash: relatedTxHash.trim() || undefined,
        relatedTxId: relatedTxId.trim() || undefined,
        amountUSD: amountUSD ? parseFloat(amountUSD) : undefined,
        amountINR: amountINR ? parseFloat(amountINR) : undefined,
      });

      // Clear fields
      setTitle('');
      setDescription('');
      setRelatedUtr('');
      setRelatedTxHash('');
      setRelatedTxId('');
      setAmountUSD('');
      setAmountINR('');
      setSelectedTicketId(ticket.ticketId);
      setTab('tickets');
    } catch (e: any) {
      triggerToast('Submission Error', e?.message || 'Failed to submit grievance', 'warn');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDownloadDossier = (ticket: GrievanceTicket) => {
    const { filename, jsonContent, printableSummary } = generateDisputeDossier(ticket);
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast('Dossier Exported', `Official Dispute Dossier ${filename} downloaded.`, 'success');
  };

  const handleEscalate = (ticketId: string) => {
    const reason = escalateReason.trim() || 'No resolution received within initial acknowledgment SLA.';
    escalateGrievanceTicketAction(ticketId, reason);
    setEscalateReason('');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-zinc-100 overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-zinc-100 bg-zinc-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <HelpCircle className="w-5 h-5 text-indigo-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-extrabold text-white">Financial Grievance & Dispute Desk</h2>
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-bold border border-emerald-500/30 uppercase">
                  RBI / NPCI Redressal
                </span>
              </div>
              <p className="text-xs text-zinc-400">
                Official dispute investigation & bank reconciliation mechanism
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={closeGrievanceModal}
            className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-zinc-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center border-b border-zinc-100 bg-zinc-50 px-5 text-xs font-bold text-zinc-600 gap-2">
          <button
            type="button"
            onClick={() => setTab('create')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              tab === 'create'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent hover:text-zinc-900'
            }`}
          >
            <span>Raise New Dispute</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('tickets')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              tab === 'tickets'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent hover:text-zinc-900'
            }`}
          >
            <span>My Tickets</span>
            {tickets.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px]">
                {tickets.length}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setTab('escalation')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 ${
              tab === 'escalation'
                ? 'border-indigo-600 text-indigo-600 bg-white'
                : 'border-transparent hover:text-zinc-900'
            }`}
          >
            <span>Nodal Officer & Matrix</span>
          </button>

          <button
            type="button"
            onClick={() => setTab('freeze')}
            className={`py-3 px-3 border-b-2 transition-all flex items-center gap-1.5 text-rose-600 ${
              tab === 'freeze'
                ? 'border-rose-600 text-rose-600 bg-white'
                : 'border-transparent hover:text-rose-700'
            }`}
          >
            <AlertOctagon className="w-3.5 h-3.5" />
            <span>Emergency Freeze</span>
          </button>
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {tab === 'create' && (
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">Dispute Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as GrievanceCategory)}
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-semibold outline-none focus:border-indigo-500 bg-white"
                  >
                    <option value="upi_deposit_pending">UPI Deposit Deducted but Not Credited</option>
                    <option value="dex_swap_revert">DEX Swap Reverted / Slippage Loss</option>
                    <option value="binance_execution_error">Binance Exchange Order / Margin Error</option>
                    <option value="card_double_charge">Card Payment / Gateway Double Charge</option>
                    <option value="unauthorized_activity">Unauthorized Account / API Activity</option>
                    <option value="general_inquiry">General Financial / Regulatory Inquiry</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">Bank Reference / 12-Digit UTR</label>
                  <input
                    type="text"
                    value={relatedUtr}
                    onChange={(e) => setRelatedUtr(e.target.value)}
                    placeholder="e.g. 423589123456"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-mono font-semibold outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Subject / Incident Summary</label>
                <input
                  type="text"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. ₹10,000 debited from GPay via HDFC Bank, wallet not credited"
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-semibold outline-none focus:border-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">Disputed Amount in USD ($)</label>
                  <input
                    type="number"
                    step="any"
                    value={amountUSD}
                    onChange={(e) => setAmountUSD(e.target.value)}
                    placeholder="100.00"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-zinc-700">Disputed Amount in INR (₹)</label>
                  <input
                    type="number"
                    step="any"
                    value={amountINR}
                    onChange={(e) => setAmountINR(e.target.value)}
                    placeholder="8750.00"
                    className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-semibold outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-zinc-700">Detailed Statement of Events</label>
                <textarea
                  required
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Please state what time the transaction occurred, which bank/app was used, and the exact error code shown..."
                  className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-xs font-semibold outline-none focus:border-indigo-500 resize-none"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-50 border border-zinc-200 text-[11px] text-zinc-500 space-y-1">
                <div className="font-bold text-zinc-700 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Guaranteed SLA Resolution Protocol</span>
                </div>
                <p>
                  Upon submission, an official immutable reference code (`GRV-2026-XXXXX`) will be issued with a cryptographic SHA-256 evidence dossier checksum for bank submission.
                </p>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                <span>Register Formal Grievance</span>
              </button>
            </form>
          )}

          {tab === 'tickets' && (
            <div className="space-y-4">
              {tickets.length === 0 ? (
                <div className="p-8 text-center space-y-2 text-zinc-400">
                  <FileText className="w-10 h-10 mx-auto text-zinc-300" />
                  <p className="text-xs font-semibold text-zinc-500">No active grievance tickets</p>
                  <p className="text-[11px]">All your deposits and transactions are currently in good standing.</p>
                </div>
              ) : (
                tickets.map((t) => (
                  <div
                    key={t.ticketId}
                    className="p-4 rounded-2xl border border-zinc-200 bg-zinc-50/50 space-y-3 shadow-2xs"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono font-extrabold text-xs text-zinc-900">{t.ticketId}</span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                              t.status === 'resolved' || t.status === 'refund_credited'
                                ? 'bg-emerald-100 text-emerald-800'
                                : t.status === 'under_investigation'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {t.status.replace(/_/g, ' ')}
                          </span>
                          <span className="px-1.5 py-0.5 rounded-md bg-zinc-200 text-zinc-700 text-[10px] font-bold">
                            Level {t.escalationLevel}
                          </span>
                        </div>
                        <h4 className="text-xs font-bold text-zinc-800 mt-1">{t.title}</h4>
                      </div>

                      <div className="text-right">
                        <div className="text-[10px] text-zinc-400">Filed on</div>
                        <div className="text-xs font-mono font-bold text-zinc-700">
                          {new Date(t.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-zinc-100 text-xs space-y-1.5">
                      <div className="text-[11px] text-zinc-600">{t.description}</div>
                      {t.relatedUtr && (
                        <div className="text-[11px] text-zinc-500 font-mono">
                          Bank UTR: <strong>{t.relatedUtr}</strong>
                        </div>
                      )}
                      <div className="text-[10px] text-zinc-400 font-mono truncate">
                        Dossier Hash: {t.cryptographicDossierHash}
                      </div>
                    </div>

                    {/* Messages */}
                    {t.messages && t.messages.length > 0 && (
                      <div className="space-y-1.5 border-t border-zinc-100 pt-2">
                        <div className="text-[10px] font-bold text-zinc-400 uppercase">Audit Trail & Communications</div>
                        {t.messages.map((m) => (
                          <div key={m.id} className="p-2.5 rounded-lg bg-zinc-100 text-[11px] space-y-0.5">
                            <div className="flex items-center justify-between text-[10px] font-bold text-zinc-600">
                              <span>{m.senderName}</span>
                              <span className="font-normal font-mono text-zinc-400">
                                {new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                            <p className="text-zinc-700">{m.text}</p>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs">
                      <button
                        type="button"
                        onClick={() => handleDownloadDossier(t)}
                        className="px-3 py-1.5 rounded-xl border border-zinc-200 hover:bg-white text-zinc-700 font-bold flex items-center gap-1.5 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5 text-zinc-500" />
                        <span>Download Dossier</span>
                      </button>

                      {t.escalationLevel < 3 && t.status !== 'resolved' && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            placeholder="Escalation reason..."
                            value={selectedTicketId === t.ticketId ? escalateReason : ''}
                            onChange={(e) => {
                              setSelectedTicketId(t.ticketId);
                              setEscalateReason(e.target.value);
                            }}
                            className="px-2.5 py-1 rounded-lg border border-zinc-200 text-xs outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleEscalate(t.ticketId)}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold transition-colors shadow-2xs"
                          >
                            Escalate Tier
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {tab === 'escalation' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200 space-y-3">
                <h3 className="text-xs font-bold text-zinc-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Building className="w-4 h-4 text-indigo-600" />
                  <span>Principal Nodal Grievance Redressal Officer</span>
                </h3>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase font-semibold">Officer Name</div>
                    <div className="font-bold text-zinc-800">{NODAL_OFFICER_INFO.name}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase font-semibold">Designation</div>
                    <div className="font-bold text-zinc-800">{NODAL_OFFICER_INFO.designation}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase font-semibold">Direct Email</div>
                    <div className="font-mono font-bold text-indigo-600">{NODAL_OFFICER_INFO.email}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-zinc-400 uppercase font-semibold">Working Hours</div>
                    <div className="font-bold text-zinc-800">{NODAL_OFFICER_INFO.workingHours}</div>
                  </div>
                </div>

                <div className="pt-2 border-t border-zinc-200/60 text-[11px] text-zinc-500">
                  <strong>Registered Office:</strong> {NODAL_OFFICER_INFO.address}
                </div>
              </div>

              {/* Regulatory Escalation Portals */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-zinc-700">Official Regulatory Escalation Avenues</h4>
                <div className="grid grid-cols-2 gap-3">
                  <a
                    href={NODAL_OFFICER_INFO.npcPortal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-2xl border border-zinc-200 hover:border-indigo-300 bg-white hover:bg-indigo-50/30 transition-all flex items-center justify-between group"
                  >
                    <div>
                      <div className="font-bold text-xs text-zinc-900">NPCI Dispute Mechanism</div>
                      <div className="text-[10px] text-zinc-500">National Payments Corp of India</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-400 group-hover:text-indigo-600" />
                  </a>

                  <a
                    href={NODAL_OFFICER_INFO.rbiOmbudsmanPortal}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-3.5 rounded-2xl border border-zinc-200 hover:border-indigo-300 bg-white hover:bg-indigo-50/30 transition-all flex items-center justify-between group"
                  >
                    <div>
                      <div className="font-bold text-xs text-zinc-900">RBI Digital Ombudsman</div>
                      <div className="text-[10px] text-zinc-500">Reserve Bank of India CMS</div>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-400 group-hover:text-indigo-600" />
                  </a>
                </div>
              </div>
            </div>
          )}

          {tab === 'freeze' && (
            <div className="p-6 rounded-2xl bg-rose-50 border border-rose-200 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-rose-100 border border-rose-300 flex items-center justify-center text-rose-600 mx-auto">
                <AlertOctagon className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-base font-extrabold text-rose-950">Emergency Capital Freeze Protocol</h3>
                <p className="text-xs text-rose-800 mt-1 max-w-md mx-auto leading-relaxed">
                  If you suspect unauthorized account access, API compromise, or abnormal market anomalies, activating Emergency Freeze immediately cancels all pending orders and stops all automated trading bots.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  triggerEmergencyFreezeAction();
                  closeGrievanceModal();
                }}
                className="py-3 px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors shadow-lg"
              >
                Engage Emergency Account Freeze
              </button>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
