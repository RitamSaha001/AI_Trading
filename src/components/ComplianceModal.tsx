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
                <h3 className="text-base font-bold text-zinc-900 mb-2">About Lumen Quantitative Intelligence</h3>
                <p className="text-zinc-600 leading-relaxed text-sm">
                  Lumen is a cloud-based quantitative financial intelligence and strategy execution software platform. Developed as an advanced analytics cockpit for digital asset traders, Lumen provides algorithmic signal processing, backtesting engines, quantitative risk indicators, and automated order routing tools.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
                    1
                  </div>
                  <h4 className="font-semibold text-zinc-900 text-sm">Quantitative Risk Analytics</h4>
                  <p className="text-xs text-zinc-500">
                    Real-time market volatility sensors, automated circuit breakers, and Kelly-criterion position sizing models designed for data-driven risk management.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
                    2
                  </div>
                  <h4 className="font-semibold text-zinc-900 text-sm">Authoritative Double-Entry Ledger</h4>
                  <p className="text-xs text-zinc-500">
                    Cryptographic ledger accounting where software subscription fees, platform usage credits, and settlements are immutable, auditable, and balanced.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center font-bold">
                    3
                  </div>
                  <h4 className="font-semibold text-zinc-900 text-sm">Secured PhonePe Checkout</h4>
                  <p className="text-xs text-zinc-500">
                    Seamless INR on-ramp powered by PhonePe Standard Checkout v2, supporting UPI, RuPay, Visa, Mastercard, and NetBanking with PCI-DSS Level 1 compliance.
                  </p>
                </div>
                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs space-y-1.5">
                  <div className="w-8 h-8 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center font-bold">
                    4
                  </div>
                  <h4 className="font-semibold text-zinc-900 text-sm">Algorithmic Execution Tools</h4>
                  <p className="text-xs text-zinc-500">
                    Connect private exchange API credentials (such as Binance) with client-side encrypted tokens for high-speed algorithmic execution and order management.
                  </p>
                </div>
              </div>

              <div className="text-xs text-zinc-500 border-t border-zinc-100 pt-4 space-y-1">
                <p>
                  <strong>Proprietor &amp; Operator:</strong> Ritam Saha (Individual / Sole Proprietorship) &bull; Operating as Lumen AI Trading Technologies.
                </p>
                <p>
                  <strong>Operational Base:</strong> Sector V, Salt Lake City, Kolkata, West Bengal 700091, India.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'contact' && (
            <div className="space-y-6">
              <div className="p-5 rounded-2xl bg-zinc-50 border border-zinc-200/80">
                <h3 className="text-base font-bold text-zinc-900 mb-1">Customer Support &amp; Contact Desk</h3>
                <p className="text-zinc-600 text-sm">
                  We are committed to prompt assistance, operational transparency, and swift dispute resolution. Reach out through our official direct channels below.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-blue-50 text-blue-600 shrink-0">
                    <Mail className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Official Email Inquiries</h4>
                    <p className="font-medium text-zinc-900 mt-1 text-sm">saharitam171@gmail.com</p>
                    <span className="text-[10px] text-emerald-600 font-medium mt-1 block">Dedicated support &bull; Response within 24 hours</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-emerald-50 text-emerald-600 shrink-0">
                    <Phone className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Customer Support Phone</h4>
                    <p className="font-medium text-zinc-900 mt-1 text-sm">+91 74393 12052</p>
                    <p className="text-xs text-zinc-500 mt-0.5">Voice &amp; WhatsApp Support Desk</p>
                    <span className="text-[10px] text-zinc-500 mt-1 block">Mon – Fri: 9:30 AM – 6:30 PM IST</span>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-zinc-100 bg-white shadow-xs flex items-start gap-3 sm:col-span-2">
                  <div className="p-2 rounded-lg bg-purple-50 text-purple-600 shrink-0">
                    <MapPin className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">Operational &amp; Registered Office</h4>
                    <p className="font-medium text-zinc-900 mt-1 text-sm">
                      Ritam Saha &bull; Lumen AI Trading
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
                  <h5 className="font-bold">Statutory Grievance Redressal Officer</h5>
                  <p className="mt-0.5">
                    In compliance with the Information Technology Act, 2000 and Digital Payment Guidelines, consumers may escalate unresolved payment or account grievances directly to our Grievance Officer:
                  </p>
                  <div className="mt-2 font-mono text-[11px] bg-white/70 p-2.5 rounded-lg border border-amber-200/60 space-y-0.5">
                    <p><strong>Officer:</strong> Ritam Saha (Proprietor &amp; Compliance Officer)</p>
                    <p><strong>Email:</strong> saharitam171@gmail.com</p>
                    <p><strong>Phone:</strong> +91 74393 12052</p>
                    <p><strong>Turnaround SLA:</strong> Acknowledgment within 24 hours; formal resolution within 48 to 72 business hours.</p>
                  </div>
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
                  Transparent, automated, and strictly compliant with RBI guidelines and PhonePe merchant underwriting standards.
                </p>
              </div>

              <div className="space-y-4 text-sm text-zinc-700">
                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-1">1. Deposit &amp; Platform Credit Cancellation (7-Day Window)</h4>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    Users may request a full cancellation and refund of any unutilized software credits or unallocated wallet balances deposited via PhonePe within <strong>7 calendar days</strong> of the transaction date. If you have not utilized the platform credits for active algorithmic model subscriptions or strategy runs, your capital is 100% refundable upon request.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-1">2. Refund Processing Time (5–7 Business Days)</h4>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    Once a refund request is submitted through your Dashboard or emailed to <code>saharitam171@gmail.com</code>, it is reviewed and approved within 24 business hours. The funds are remitted directly to the <strong>original source of payment</strong> (the original UPI ID, debit/credit card, or netbanking bank account used) within <strong>5 to 7 business days</strong>, subject to clearing bank processing schedules.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-1">3. Automated Reversal for Ambiguous or Timed-Out Payments</h4>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    If an amount is debited from your bank account via PhonePe / UPI but does not immediately reflect in your Lumen platform balance due to an intermittent network timeout, our automated background reconciliation engine polls the payment gateway every 5 minutes. If final successful settlement cannot be confirmed within 24 hours, an automated refund reversal is triggered back to your bank account within 3 to 5 business days.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-1">4. Exclusions &amp; Market Dynamics</h4>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    Lumen provides software analytics and automated order routing tools. Actual market trading gains or losses incurred on external exchanges (such as Binance) resulting from user-authorized strategy executions are determined entirely by independent market price movements. Realized trading losses on external exchanges are non-refundable, as Lumen does not hold custody of exchange capital or guarantee investment returns.
                  </p>
                </div>

                <div>
                  <h4 className="font-bold text-zinc-900 text-sm mb-1">5. How to Initiate a Refund or Cancellation</h4>
                  <p className="text-xs leading-relaxed text-zinc-600">
                    To request a refund or cancel a platform tier, navigate to <strong>Wallet &rarr; Recent Transactions</strong> and select <strong>Request Refund</strong>, or email us at <code>saharitam171@gmail.com</code> with your Order ID, Transaction Reference, or PhonePe UTR.
                  </p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'terms' && (
            <div className="space-y-4 text-sm text-zinc-700">
              <h3 className="text-base font-bold text-zinc-900">Terms and Conditions of Use</h3>
              <p className="text-xs text-zinc-500">Effective Date: September 2026 &bull; Governed under the Laws of India</p>

              <div className="space-y-3 text-xs leading-relaxed text-zinc-600">
                <p>
                  <strong>1. Acceptance of Terms:</strong> By registering, browsing, or utilizing the Lumen platform (&quot;Lumen&quot;, &quot;we&quot;, &quot;our&quot;), operated by Ritam Saha (Sole Proprietor), you enter into a legally binding agreement with us under these Terms of Service. If you disagree with any portion of these terms, you must immediately terminate platform access.
                </p>
                <p>
                  <strong>2. Software &amp; Analytics Service Scope:</strong> Lumen is a specialized provider of financial analytics, quantitative signal models, strategy backtesting software, and algorithmic execution tools. Lumen is <strong>NOT</strong> a registered Investment Advisor (RIA), Research Analyst (RA), or Portfolio Management Service (PMS) under the Securities and Exchange Board of India (SEBI). Nothing on this platform constitutes individualized financial, legal, or investment advice.
                </p>
                <p>
                  <strong>3. User Eligibility:</strong> You represent and warrant that you are at least 18 years of age, legally competent to enter into binding contracts, and comply with all applicable local financial, tax, and foreign exchange laws.
                </p>
                <p>
                  <strong>4. API Key Stewardship:</strong> When you connect third-party broker or exchange API credentials (e.g. Binance), you retain full authority and ownership of those accounts. Lumen encrypts all stored API secrets using AES-256-GCM. You are solely responsible for setting appropriate IP whitelisting, permission bounds (such as disabling withdrawal permissions on third-party keys), and monitoring trade executions.
                </p>
                <p>
                  <strong>5. Payments, Subscriptions &amp; Credits:</strong> All fees for software licenses, platform access tiers, and computational credits are billed in Indian Rupees (INR) or USD equivalent. All payment transactions are securely cleared via PhonePe Payment Gateway adhering to PCI-DSS Level 1 specifications.
                </p>
                <p>
                  <strong>6. Market Volatility &amp; Assumption of Risk:</strong> Trading in financial and digital assets carries inherent financial risk, including potential total loss of capital. Algorithmic and mathematical indicators may not predict future market outcomes. You assume total responsibility for all executions conducted through your accounts.
                </p>
                <p>
                  <strong>7. Governing Law &amp; Jurisdiction:</strong> These Terms shall be governed by, construed, and enforced in accordance with the laws of the Republic of India. Any legal action, suit, or proceeding arising under or related to these Terms shall be subject to the exclusive jurisdiction of the competent courts located in Kolkata, West Bengal, India.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'privacy' && (
            <div className="space-y-4 text-sm text-zinc-700">
              <h3 className="text-base font-bold text-zinc-900">Privacy &amp; Data Protection Policy</h3>
              <p className="text-xs text-zinc-500">
                In compliance with India&apos;s Digital Personal Data Protection Act, 2023 (DPDP Act 2023) and Information Technology Act, 2000 (SPDI Rules)
              </p>

              <div className="space-y-3 text-xs leading-relaxed text-zinc-600">
                <p>
                  <strong>1. Data Controller / Data Fiduciary:</strong> Ritam Saha, operating Lumen AI Trading Technologies with operational base at Infinity Benchmark Tower, Sector V, Salt Lake City, Kolkata, West Bengal 700091, acts as the Data Fiduciary responsible for personal data processed on this platform.
                </p>
                <p>
                  <strong>2. Zero Cardholder Data Retention:</strong> Lumen never stores, captures, logs, or transmits raw credit card numbers, debit card numbers (PAN), CVV security codes, card expiration dates, or bank netbanking passwords. All payment transactions are executed via encrypted redirects or iframe components managed directly by PhonePe Private Limited, a PCI-DSS Level 1 certified payment aggregator authorized by the Reserve Bank of India (RBI).
                </p>
                <p>
                  <strong>3. Personal Data Collected &amp; Purpose:</strong>
                  <br />
                  &bull; <em>Identity &amp; Authentication:</em> Your email address and authenticated profile name collected via Google OAuth 2.0 or transactional passwordless verification via Resend Technologies.
                  <br />
                  &bull; <em>Financial Ledger &amp; Billing Records:</em> Platform credit balances, transaction reference numbers, PhonePe order IDs, and payment timestamps required for double-entry ledger balancing and tax compliance.
                  <br />
                  &bull; <em>Encrypted API Credentials:</em> Exchange API keys provided by you for automated order execution, which are encrypted at rest using AES-256-GCM.
                </p>
                <p>
                  <strong>4. Authorized Third-Party Service Processors:</strong> We partner solely with trusted infrastructure providers essential for operating the platform:
                  <br />
                  &bull; <strong>PhonePe Private Limited:</strong> Payment gateway aggregation and statutory settlement.
                  <br />
                  &bull; <strong>Google LLC:</strong> Identity authentication via Google Sign-In.
                  <br />
                  &bull; <strong>Resend Inc.:</strong> Transactional email delivery for one-time verification challenges.
                  <br />
                  &bull; <strong>Binance Holdings Ltd. (or chosen exchange):</strong> Execution endpoints for user-authorized trading orders.
                  <br />
                  We never sell, rent, monetize, or disclose your personal information to third-party marketing firms or data brokers.
                </p>
                <p>
                  <strong>5. Data Principal Rights (DPDP Act 2023):</strong> Under Indian data protection law, you possess the right to:
                  <br />
                  &bull; Access a summary of personal data processed by us.
                  <br />
                  &bull; Request correction, completion, or updating of inaccurate data.
                  <br />
                  &bull; Request permanent erasure and account deletion upon settlement of outstanding obligations.
                  <br />
                  &bull; Seek grievance redressal regarding data handling practices.
                  <br />
                  To exercise any of these rights, email our Data Protection Desk at <code>saharitam171@gmail.com</code>.
                </p>
                <p>
                  <strong>6. Data Retention &amp; Security Measures:</strong> All client-server communications use Transport Layer Security (TLS 1.3). Personal data is retained only for the duration of an active user account or as mandated by Indian statutory accounting laws (up to 7 years for financial billing transactions).
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
