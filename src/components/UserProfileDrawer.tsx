import React, { useState } from 'react';
import {
  X,
  User,
  ShieldCheck,
  ShieldAlert,
  Lock,
  LogOut,
  AlertOctagon,
  Download,
  ExternalLink,
  CheckCircle2,
  FileText,
  CreditCard,
  Building,
  HelpCircle,
} from 'lucide-react';
import { useLumen } from '../store';
import { exportStateJson } from '../storage';

export function UserProfileDrawer() {
  const {
    userProfileDrawerOpen,
    closeUserProfileDrawer,
    authSession,
    logout,
    updateProfile,
    openGrievanceModal,
    triggerEmergencyFreezeAction,
    state,
    triggerToast,
  } = useLumen();

  const [confirmFreeze, setConfirmFreeze] = useState(false);
  const user = authSession?.user;

  if (!userProfileDrawerOpen || !user) return null;

  const handleToggleCurrency = () => {
    const nextCurr = user.currencyPreference === 'USD' ? 'INR' : 'USD';
    updateProfile({ currencyPreference: nextCurr });
  };

  const handleDownloadBackup = () => {
    const jsonStr = exportStateJson(state);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Lumen-Backup-${user.uid}-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    triggerToast('Backup Downloaded', 'Your complete ledger and portfolio snapshot has been saved.', 'success');
  };

  const handleTriggerFreeze = () => {
    const { cancelledCount } = triggerEmergencyFreezeAction();
    setConfirmFreeze(false);
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
        onClick={closeUserProfileDrawer}
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-white shadow-2xl border-l border-zinc-200 flex flex-col justify-between overflow-y-auto animate-in slide-in-from-right duration-300">
          
          {/* Header */}
          <div>
            <div className="p-6 border-b border-zinc-100 bg-zinc-50/50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    className="w-12 h-12 rounded-2xl object-cover border-2 border-indigo-500 shadow-sm"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-2xl bg-zinc-900 text-white flex items-center justify-center font-bold text-lg shadow-sm">
                    {user.displayName.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-1.5">
                    <h2 className="text-base font-extrabold text-zinc-900">{user.displayName}</h2>
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                  </div>
                  <p className="text-xs text-zinc-500 font-mono">{user.email}</p>
                </div>
              </div>

              <button
                type="button"
                onClick={closeUserProfileDrawer}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Profile Particulars */}
            <div className="p-6 space-y-5">
              {/* Emergency Status Banner */}
              {user.isEmergencyLocked && (
                <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 space-y-1">
                  <div className="flex items-center gap-2 font-bold text-xs">
                    <ShieldAlert className="w-4 h-4 text-rose-600" />
                    <span>EMERGENCY CAPITAL FREEZE ACTIVE</span>
                  </div>
                  <p className="text-[11px] text-rose-700 leading-relaxed">
                    All automated strategies are halted and pending orders are cancelled to protect your balance.
                  </p>
                </div>
              )}

              {/* KYC & Identity Tier */}
              <div className="p-4 rounded-2xl bg-zinc-50 border border-zinc-200/80 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                    Investor Verification
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 text-[10px] font-extrabold uppercase">
                    {user.kycTier === 'tier2_verified' ? 'Tier 2 Verified' : 'Tier 1 Basic'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="p-2.5 rounded-xl bg-white border border-zinc-100">
                    <div className="text-[10px] text-zinc-400 font-semibold uppercase">Provider</div>
                    <div className="font-bold text-zinc-800 capitalize flex items-center gap-1 mt-0.5">
                      <span>{user.provider}</span>
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-zinc-100">
                    <div className="text-[10px] text-zinc-400 font-semibold uppercase">Jurisdiction</div>
                    <div className="font-bold text-zinc-800 mt-0.5">India (IN) 🇮🇳</div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-zinc-100">
                    <div className="text-[10px] text-zinc-400 font-semibold uppercase">PAN / Tax ID</div>
                    <div className="font-mono font-bold text-zinc-800 mt-0.5">
                      {user.panNumberMasked || 'ABCDE****F'}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-white border border-zinc-100">
                    <div className="text-[10px] text-zinc-400 font-semibold uppercase">Registered Phone</div>
                    <div className="font-mono font-bold text-zinc-800 mt-0.5">
                      {user.phoneMasked || '+91 98765*****'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Preferences */}
              <div className="space-y-2">
                <h3 className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Account Preferences
                </h3>
                <div className="flex items-center justify-between p-3.5 rounded-2xl border border-zinc-200 bg-white">
                  <div>
                    <div className="text-xs font-bold text-zinc-900">Currency Display</div>
                    <div className="text-[11px] text-zinc-500">Dual pricing in USD ($) and Indian Rupee (₹)</div>
                  </div>
                  <button
                    type="button"
                    onClick={handleToggleCurrency}
                    className="px-3 py-1.5 rounded-xl bg-zinc-100 hover:bg-zinc-200 text-xs font-bold text-zinc-800 transition-colors"
                  >
                    {user.currencyPreference}
                  </button>
                </div>
              </div>

              {/* Grievance Desk Link */}
              <div className="p-4 rounded-2xl bg-indigo-50/70 border border-indigo-100 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                    <HelpCircle className="w-4 h-4 text-indigo-600" />
                    <span>Grievance Redressal & Support Desk</span>
                  </span>
                  <span className="text-[10px] text-indigo-600 font-bold uppercase">24x7 SLA</span>
                </div>
                <p className="text-[11px] text-indigo-800 leading-relaxed">
                  Have an issue with a UPI deposit, failed DEX swap, or exchange order? File an official dispute ticket.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    closeUserProfileDrawer();
                    openGrievanceModal();
                  }}
                  className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-colors shadow-xs"
                >
                  Open Grievance Desk
                </button>
              </div>

              {/* Emergency Account Freeze */}
              <div className="p-4 rounded-2xl bg-rose-50/70 border border-rose-200/80 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-rose-950">
                  <AlertOctagon className="w-4 h-4 text-rose-600" />
                  <span>Emergency Capital & Trading Freeze</span>
                </div>
                <p className="text-[11px] text-rose-800 leading-relaxed">
                  Instantly cancel all open orders across all desks and pause all automated trading bots.
                </p>
                {!confirmFreeze ? (
                  <button
                    type="button"
                    onClick={() => setConfirmFreeze(true)}
                    className="w-full py-2 px-3 rounded-xl bg-white border border-rose-300 text-rose-700 hover:bg-rose-100 text-xs font-bold transition-colors"
                  >
                    Trigger Emergency Freeze
                  </button>
                ) : (
                  <div className="flex items-center gap-2 pt-1">
                    <button
                      type="button"
                      onClick={handleTriggerFreeze}
                      className="flex-1 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs"
                    >
                      Confirm Freeze
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmFreeze(false)}
                      className="px-3 py-2 rounded-xl border border-zinc-200 text-xs font-semibold text-zinc-600"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Footer Actions */}
          <div className="p-6 border-t border-zinc-100 space-y-2 bg-zinc-50/50">
            <button
              type="button"
              onClick={handleDownloadBackup}
              className="w-full py-2.5 px-4 rounded-xl border border-zinc-200 hover:bg-white text-zinc-700 text-xs font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-zinc-500" />
              <span>Download State & Ledger Backup</span>
            </button>

            <button
              type="button"
              onClick={logout}
              className="w-full py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-black text-white text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-xs"
            >
              <LogOut className="w-3.5 h-3.5 text-zinc-400" />
              <span>Secure Sign Out</span>
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
