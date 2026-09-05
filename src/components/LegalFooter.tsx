import React, { useState } from 'react';
import {
  ShieldCheck,
  FileText,
  Phone,
  Mail,
  MapPin,
  RefreshCw,
  Scale,
  Lock,
  Info,
  LifeBuoy,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { ComplianceModal, ComplianceTab } from './ComplianceModal';
import { useLumen } from '../store';

export function LegalFooter() {
  const { openGrievanceModal } = useLumen();
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ComplianceTab>('about');

  const handleOpenTab = (tab: ComplianceTab) => {
    setActiveTab(tab);
    setComplianceOpen(true);
  };

  return (
    <>
      <footer className="w-full mt-12 border-t border-black/[0.06] bg-gradient-to-b from-transparent to-zinc-50/80 pt-10 pb-16 lg:pb-12 text-zinc-600 transition-colors">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-8">
          {/* Main Footer Row */}
          <div className="flex flex-col md:flex-row md:items-start justify-between gap-8">
            {/* Brand Information */}
            <div className="space-y-3 max-w-sm">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-xl bg-zinc-950 flex items-center justify-center text-white font-bold text-sm shadow-xs">
                  L
                </div>
                <span className="font-bold text-zinc-900 tracking-tight text-base">
                  Lumen AI Trading
                </span>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-zinc-100 text-zinc-600 border border-zinc-200">
                  Institutional Quant
                </span>
              </div>
              <p className="text-xs text-zinc-500 leading-relaxed">
                Autonomous algorithmic trading cockpit with double-entry sovereign ledger accounting, deep volatility sensors, and PhonePe-secured payment on-ramps.
              </p>
              <div className="flex items-center gap-2 pt-1 text-[11px] text-zinc-500 font-mono">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>PCI-DSS Level 1 &bull; 100% Non-Custodial &bull; RBI Adherent</span>
              </div>
            </div>

            {/* Compliance & Policy Links */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-6 sm:gap-8 text-xs">
              <div className="space-y-2.5">
                <h4 className="font-semibold text-zinc-900 tracking-tight uppercase text-[11px] text-zinc-400">
                  Platform
                </h4>
                <ul className="space-y-2">
                  <li>
                    <button
                      type="button"
                      onClick={() => handleOpenTab('about')}
                      className="hover:text-zinc-950 transition-colors text-left flex items-center gap-1.5"
                    >
                      <Info className="w-3.5 h-3.5 text-zinc-400" />
                      About Lumen
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => handleOpenTab('contact')}
                      className="hover:text-zinc-950 transition-colors text-left flex items-center gap-1.5"
                    >
                      <Phone className="w-3.5 h-3.5 text-zinc-400" />
                      Contact &amp; Support
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => openGrievanceModal()}
                      className="hover:text-zinc-950 transition-colors text-left flex items-center gap-1.5 text-indigo-600 font-medium"
                    >
                      <LifeBuoy className="w-3.5 h-3.5" />
                      Grievance Desk
                    </button>
                  </li>
                </ul>
              </div>

              <div className="space-y-2.5">
                <h4 className="font-semibold text-zinc-900 tracking-tight uppercase text-[11px] text-zinc-400">
                  Legal &amp; Trust
                </h4>
                <ul className="space-y-2">
                  <li>
                    <button
                      type="button"
                      onClick={() => handleOpenTab('terms')}
                      className="hover:text-zinc-950 transition-colors text-left flex items-center gap-1.5"
                    >
                      <Scale className="w-3.5 h-3.5 text-zinc-400" />
                      Terms &amp; Conditions
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => handleOpenTab('privacy')}
                      className="hover:text-zinc-950 transition-colors text-left flex items-center gap-1.5"
                    >
                      <Lock className="w-3.5 h-3.5 text-zinc-400" />
                      Privacy Policy
                    </button>
                  </li>
                  <li>
                    <button
                      type="button"
                      onClick={() => handleOpenTab('refund')}
                      className="hover:text-emerald-700 text-emerald-600 font-medium transition-colors text-left flex items-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Refund &amp; Cancellation
                    </button>
                  </li>
                </ul>
              </div>

              <div className="space-y-2.5 col-span-2 sm:col-span-1">
                <h4 className="font-semibold text-zinc-900 tracking-tight uppercase text-[11px] text-zinc-400">
                  Operations &amp; Security
                </h4>
                <div className="text-[11px] text-zinc-500 space-y-1">
                  <p className="font-medium text-zinc-800">Ritam Saha (Sole Proprietor)</p>
                  <p>Lumen AI Trading Technologies</p>
                  <p className="text-zinc-400">Sector V, Salt Lake, Kolkata 700091</p>
                  <p className="text-zinc-600 font-mono">+91 74393 12052</p>
                  <p className="text-indigo-600 font-mono">saharitam171@gmail.com</p>
                </div>
              </div>
            </div>
          </div>

          {/* Regulatory Risk Disclaimer Banner */}
          <div className="p-4 rounded-2xl bg-white border border-black/[0.06] shadow-xs text-[11px] leading-relaxed text-zinc-500 space-y-1.5">
            <p className="font-semibold text-zinc-700 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Statutory Risk Disclosure &amp; Compliance Statement:
            </p>
            <p>
              Lumen provides automated algorithmic execution software, quantitative risk indicators, and platform subscription services. Lumen is a technology provider and does not provide personalized investment, tax, or legal advisory services. Payments, platform access fees, and software subscriptions are processed securely via PhonePe Payment Gateway adhering to RBI and PCI-DSS Level 1 security standards. Unused platform credits are refundable on request within 7 days (5–7 business days settlement turnaround to original source).
            </p>
          </div>

          {/* Copyright Row */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-zinc-400 border-t border-black/[0.04] pt-6">
            <p>&copy; {new Date().getFullYear()} Lumen AI Trading. All rights reserved.</p>
            <div className="flex items-center gap-4 text-[11px]">
              <button
                type="button"
                onClick={() => handleOpenTab('privacy')}
                className="hover:text-zinc-700 transition-colors"
              >
                Privacy
              </button>
              <span>&bull;</span>
              <button
                type="button"
                onClick={() => handleOpenTab('terms')}
                className="hover:text-zinc-700 transition-colors"
              >
                Terms
              </button>
              <span>&bull;</span>
              <button
                type="button"
                onClick={() => handleOpenTab('refund')}
                className="hover:text-zinc-700 transition-colors"
              >
                Refunds
              </button>
              <span>&bull;</span>
              <button
                type="button"
                onClick={() => handleOpenTab('contact')}
                className="hover:text-zinc-700 transition-colors"
              >
                Support
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Compliance & Policy Modal */}
      <ComplianceModal
        isOpen={complianceOpen}
        onClose={() => setComplianceOpen(false)}
        initialTab={activeTab}
      />
    </>
  );
}
