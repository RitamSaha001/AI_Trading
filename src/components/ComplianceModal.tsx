import React, { useState, useEffect } from 'react';
import {
  X,
  ShieldCheck,
  FileText,
  Phone,
  Mail,
  MapPin,
  RefreshCw,
  Scale,
  Lock,
  Info,
  ExternalLink,
  CheckCircle2,
  Clock,
  Building,
  ShieldAlert,
} from 'lucide-react';

export type ComplianceTab = 'about' | 'contact' | 'terms' | 'refund' | 'privacy';

interface ComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: ComplianceTab;
}

export function ComplianceModal({ isOpen, onClose, initialTab = 'about' }: ComplianceModalProps) {
  const [activeTab, setActiveTab] = useState<ComplianceTab>(initialTab);

  useEffect(() => {
    if (initialTab) {
      setActiveTab(initialTab);
    }
  }, [initialTab, isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 md:p-6 animate-in fade-in duration-200">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white rounded-3xl shadow-2xl border border-zinc-200/80 flex flex-col overflow-hidden z-10">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-100 bg-zinc-50/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-zinc-900 flex items-center justify-center text-white font-bold text-lg shadow-sm">
              L
            </div>
            <div>
              <h2 className="text-base font-bold text-zinc-900 tracking-tight flex items-center gap-2">
                Lumen Compliance &amp; Legal Center
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded-full border border-emerald-200">
                  Verified
                </span>
              </h2>
              <p className="text-xs text-zinc-500">
                Official institutional terms, customer protections, and regulatory disclosures
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-zinc-400 hover:text-zinc-700 hover:bg-zinc-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1 px-6 py-2.5 bg-zinc-50/80 border-b border-zinc-100 overflow-x-auto text-xs font-medium scrollbar-none">
          <button
            type="button"
            onClick={() => setActiveTab('about')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
              activeTab === 'about'
                ? 'bg-zinc-900 text-white font-semibold shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            <Info className="w-3.5 h-3.5" />
            About Lumen
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('contact')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
              activeTab === 'contact'
                ? 'bg-zinc-900 text-white font-semibold shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            <Phone className="w-3.5 h-3.5" />
            Contact Us
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('refund')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
              activeTab === 'refund'
                ? 'bg-zinc-900 text-white font-semibold shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refund &amp; Cancellation Policy
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
              activeTab === 'terms'
                ? 'bg-zinc-900 text-white font-semibold shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            Terms &amp; Conditions
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('privacy')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl transition-all shrink-0 ${
              activeTab === 'privacy'
                ? 'bg-zinc-900 text-white font-semibold shadow-sm'
                : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
            Privacy Policy
          </button>
        </div>

        {/* Tab Content Body */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 space-y-6 text-zinc-700 text-sm leading-relaxed">
          {activeTab === 'about' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200/80">
                <h3 className="text-base font-bold text-zinc-900 mb-2">About Lumen AI Trading Platform</h3>
                <p className="text-zinc-600 leading-relaxed text-sm">
                  Lumen is an advanced quantitative intelligence cockpit and execution infrastructure designed for active cryptocurrency and digital asset traders. Engineered with high-frequency algorithmic models, machine learning risk engines, and double-entry sovereign ledger accounting, Lumen empowers investors with institutional-grade trading tools.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    1
                  </div>
                  <h4 className="font-semibold text-zinc-900 text-sm">Algorithmic Risk Management</h4>
                  <p className="text-xs text-zinc-500">
                    Real-time market volatility sensors, automated circuit breakers, and Kelly-criterion position sizing to prevent catastrophic drawdowns.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    2
                  </div>
                  <h4 className="font-semibold text-zinc-900 text-sm">Authoritative Double-Entry Ledger</h4>
                  <p className="text-xs text-zinc-500">
                    Cryptographic ledger accounting where every penny deposited, transferred, or settled is immutable, auditable, and mathematically balanced.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                    3
                  </div>
                  <h4 className="font-semibold text-zinc-900 text-sm">Secure Payment Gateway On-Ramp</h4>
                  <p className="text-xs text-zinc-500">
                    Integrated with PhonePe for certified PCI-DSS Level 1 payments across UPI, RuPay, Visa, Mastercard, and Indian NetBanking.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                    4
                  </div>
                  <h4 className="font-semibold text-zinc-900 text-sm">Autonomous Quant Intelligence</h4>
                  <p className="text-xs text-zinc-500">
                    Deep multi-factor momentum indicators, real-time depth order book analytics, and intelligent trade execution assistants.
                  </p>
                </div>
              </div>

              <div className="text-xs text-zinc-500 border-t border-zinc-100 pt-4">
                <strong>Platform Operator:</strong> Ritam Saha (Founder &amp; Lead Architect) • Operating as Lumen Technologies • Salt Lake Sector V, Kolkata, West Bengal, India.
              </div>
            </div>
          )}

          {activeTab === 'contact' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200/80">
                <h3 className="text-base font-bold text-zinc-900 mb-1">Customer Support &amp; Official Contact</h3>
                <p className="text-zinc-600 text-sm">
                  We are committed to prompt, transparent communication. Reach out to our dedicated support team or compliance desk using any of the channels below.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Email Inquiries</h4>
                    <p className="font-medium text-zinc-900 mt-1 text-sm">support@lumen.io</p>
                    <p className="text-xs text-zinc-500 mt-0.5">ritamsaha001@gmail.com</p>
                    <span className="text-[10px] text-emerald-600 font-medium mt-1 block">Response within 24 hours</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Customer Support Phone</h4>
                    <p className="font-medium text-zinc-900 mt-1 text-sm">+91 80 4567 8900</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Direct Desk: +91 98300 12345</p>
                    <span className="text-[10px] text-zinc-500 mt-1 block">Mon – Fri: 9:30 AM – 6:30 PM IST</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs flex items-start gap-3 sm:col-span-2">
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600 shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Registered Operational Office</h4>
                    <p className="font-medium text-zinc-900 mt-1 text-sm">
                      Lumen Technologies / Ritam Saha
                    </p>
                    <p className="text-xs text-zinc-600 mt-0.5">
                      Infinity Benchmark Tower, Plot G-1, Block EP &amp; GP, Sector V, Salt Lake City, Kolkata, West Bengal 700091, India
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200/80 flex items-start gap-3">
                <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="text-xs text-amber-900">
                  <h5 className="font-bold">Grievance Officer Escalation</h5>
                  <p className="mt-0.5">
                    For unresolved payment issues or formal statutory escalations under RBI digital payment guidelines, you can also access our built-in <strong>Grievance Desk</strong> or email our Principal Nodal Officer at <code>grievance.nodal@lumentrading.in</code> (Turnaround time: 48 business hours).
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'refund' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200/80">
                <div className="flex items-center gap-2 text-emerald-900 font-bold text-base mb-1">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Refund &amp; Cancellation Policy
                </div>
                <p className="text-emerald-800 text-xs">
                  Transparent, automated, and fully compliant with RBI and PhonePe merchant underwriting standards.
                </p>
              </div>

              <div className="space-y-4 text-sm text-zinc-700">
                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-1">1. Deposit Cancellation &amp; Refund Window</h4>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    Users may request a full refund of unallocated fiat currency deposits (INR or USD) credited to their Sovereign Wallet within <strong>7 days</strong> of the transaction date. Funds that have not been deployed to live exchange orders or active market positions remain 100% refundable on demand.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-1">2. Refund Processing Time (5–7 Business Days)</h4>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    Once a refund request is initiated from your Wallet Dashboard or submitted via our Support Desk, it is verified and authorized within 24 hours. The funds will be credited directly back to the <strong>original source of payment</strong> (UPI VPA, original bank account, or debit/credit card) within <strong>5 to 7 business days</strong>, subject to your issuing bank's clearing timelines.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-1">3. Non-Refundable Items &amp; Trading Risk</h4>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    Capital that has been actively deployed, matched, or filled on an external exchange (such as Binance) incurs actual market gains or losses and is subject to exchange trading dynamics. Realized trading losses resulting from market price fluctuations or user-authorized algorithmic strategy executions are strictly non-refundable.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-1">4. Failed or Ambiguous Transactions (Auto-Reversal)</h4>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    In the event that an amount is debited from your bank account via PhonePe / UPI but does not immediately reflect on your Lumen platform wallet due to an intermittent network timeout, our automated background reconciler polls the payment gateway every 5 minutes. If settlement cannot be authoritatively confirmed within 24 hours, an automated refund reversal is triggered back to your bank account within 3 to 5 business days.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-1">5. How to Initiate a Refund</h4>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    Navigate to your <strong>Wallet Dashboard → Recent Orders</strong>, locate the transaction, and click <strong>Request Refund</strong>, or contact us at <code>support@lumen.io</code> with your Transaction ID or UTR number.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-4 text-sm text-zinc-700">
              <h3 className="text-base font-bold text-zinc-900">Terms and Conditions of Use</h3>
              <p className="text-xs text-zinc-500">Last updated: September 2026</p>

              <div className="space-y-3 text-xs leading-relaxed text-zinc-600">
                <p>
                  <strong>1. Acceptance of Terms:</strong> By creating an account, accessing, or utilizing the Lumen AI Trading platform (&quot;Lumen&quot;, &quot;we&quot;, &quot;our&quot;), you agree to be bound by these Terms of Service. If you do not agree, you must immediately discontinue use of the platform.
                </p>
                <p>
                  <strong>2. Eligibility &amp; Compliance:</strong> You must be at least 18 years of age and legally capable of entering into binding contracts under applicable Indian law. You agree to comply with all local, national, and international tax and financial regulations.
                </p>
                <p>
                  <strong>3. Educational &amp; Tool Nature:</strong> Lumen provides automated trading infrastructure, market analytics, and strategy execution software. Lumen does not operate as a registered investment advisor, portfolio manager, or broker-dealer. Any quantitative model outputs, sentiment scores, or simulated strategies are algorithmic indicators and should not be construed as individualized financial advice.
                </p>
                <p>
                  <strong>4. Capital Risk Acknowledgement:</strong> Trading cryptocurrencies and digital assets carries substantial risk of capital loss. Market prices can fluctuate wildly. You retain 100% responsibility for your trading decisions and API key authorizations.
                </p>
                <p>
                  <strong>5. Prohibited Conduct:</strong> Users shall not engage in wash trading, market manipulation, unauthorized reverse-engineering of trading algorithms, or fraudulent payment chargebacks.
                </p>
                <p>
                  <strong>6. Governing Law &amp; Jurisdiction:</strong> These terms shall be governed by and construed in accordance with the laws of India. Any disputes arising hereunder shall be subject to the exclusive jurisdiction of the competent courts in Kolkata, West Bengal, India.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-4 text-sm text-zinc-700">
              <h3 className="text-base font-bold text-zinc-900">Privacy &amp; Data Protection Policy</h3>
              <p className="text-xs text-zinc-500">Compliant with the Information Technology Act, 2000 and SPDI Rules</p>

              <div className="space-y-3 text-xs leading-relaxed text-zinc-600">
                <p>
                  <strong>1. Zero Cardholder Data Retention:</strong> Lumen never stores, processes, or transmits raw credit/debit card numbers (PAN), CVVs, or card PINs on our servers. All card payment interactions are tokenized and processed through PhonePe&apos;s Level 1 PCI-DSS compliant infrastructure.
                </p>
                <p>
                  <strong>2. Information We Collect:</strong> We collect only necessary account data including your authenticated email, basic profile information, and ledger transaction history. When Tier 2 KYC verification is performed, government-issued IDs are encrypted at rest using AES-256-GCM.
                </p>
                <p>
                  <strong>3. Cryptographic Security Standards:</strong> All communications between your browser, our API servers, and external payment rails are encrypted using TLS 1.3. User authentication sessions utilize cryptographic SHA-256 hashing at rest.
                </p>
                <p>
                  <strong>4. Third-Party Sharing:</strong> We do not sell, rent, or monetize your personal or trading data to advertisers or third-party marketing firms. Data is only exchanged with verified financial partners (PhonePe for payment settlement, Binance for authorized user order routing).
                </p>
                <p>
                  <strong>5. User Data Rights:</strong> You have the right to inspect, correct, or request the deletion of your account records by contacting our Privacy Desk at <code>support@lumen.io</code>.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-zinc-50/80 border-t border-zinc-100">
          <div className="flex items-center gap-2 text-[11px] text-zinc-500">
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Secured with PhonePe Standard Checkout v2 &bull; PCI-DSS Level 1</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-medium text-xs transition-colors shadow-xs"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
