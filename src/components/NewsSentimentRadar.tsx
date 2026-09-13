import React, { useState, useEffect } from "react";
import { Newspaper, ShieldAlert, Sparkles, Zap, Search, RefreshCw, CheckCircle, AlertTriangle, ArrowUpRight, TrendingUp } from "lucide-react";
import { LocalFinBERTEngine, NewsCatalystRegistry, NewsSentimentAnalysis, NewsArticle } from "../domain/newsEngine";

export const NewsSentimentRadar: React.FC = () => {
  const [feed, setFeed] = useState<NewsSentimentAnalysis[]>([]);
  const [inputHeadline, setInputHeadline] = useState("");
  const [simResult, setSimResult] = useState<NewsSentimentAnalysis | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [activeTab, setActiveTab] = useState<"feed" | "simulator">("feed");

  // Load initial feed and subscribe
  const refreshFeed = () => {
    setFeed(NewsCatalystRegistry.getRecentFeed(20));
  };

  useEffect(() => {
    // If registry is empty, populate a realistic initial set of market news
    if (NewsCatalystRegistry.getRecentFeed().length === 0) {
      const sampleArticles: NewsArticle[] = [
        {
          id: "seed_1",
          headline: "BHEL secures mega thermal power project contract worth Rs 4,500 crore from NTPC",
          source: "BSE_ANNOUNCEMENTS",
          publishedAt: Date.now() - 14 * 60 * 1000,
        },
        {
          id: "seed_2",
          headline: "L&T Construction awarded mega domestic order valued between Rs 10,000 to 15,000 crore",
          source: "BSE_ANNOUNCEMENTS",
          publishedAt: Date.now() - 32 * 60 * 1000,
        },
        {
          id: "seed_3",
          headline: "Zydus Lifesciences receives USFDA approval for generic Oncology formulation",
          source: "GOOGLE_NEWS",
          publishedAt: Date.now() - 55 * 60 * 1000,
        },
        {
          id: "seed_4",
          headline: "State Bank of India reports net profit surge of 23% YoY with improved asset quality",
          source: "ECONOMIC_TIMES",
          publishedAt: Date.now() - 78 * 60 * 1000,
        },
        {
          id: "seed_5",
          headline: "Reliance Retail expands regional supply chain logistics with new distribution centers",
          source: "GOOGLE_NEWS",
          publishedAt: Date.now() - 110 * 60 * 1000,
        },
      ];

      sampleArticles.forEach((art) => {
        const analysis = LocalFinBERTEngine.analyze(art);
        NewsCatalystRegistry.ingest(analysis);
      });
    }

    refreshFeed();
    const timer = setInterval(refreshFeed, 5000);
    return () => clearInterval(timer);
  }, []);

  // Quick preset test headlines
  const testPresets = [
    {
      label: "SEBI Forensic Audit",
      headline: "SEBI orders forensic audit and search on promoters of Zydus Lifesciences over governance concerns",
    },
    {
      label: "USFDA Warning Letter",
      headline: "USFDA issues Warning Letter with 6 data integrity observations for Sun Pharma Halol manufacturing facility",
    },
    {
      label: "₹5,000 Cr Order Win",
      headline: "BHEL bags mega commercial order worth Rs 5,000 cr from power utility for transmission equipment",
    },
    {
      label: "QoQ Profit Surge 35%",
      headline: "Infosys records net profit surge of 35% QoQ, beats analyst estimates on strong deal bookings",
    },
    {
      label: "Auditor Resignation",
      headline: "Statutory auditor of company resigns immediately citing refusal of management to share transaction ledgers",
    },
  ];

  const handleSimulate = (headlineToRun?: string) => {
    const text = (headlineToRun || inputHeadline).trim();
    if (!text) return;

    setIsSimulating(true);
    setTimeout(() => {
      const result = LocalFinBERTEngine.evaluateHeadline(text);
      setSimResult(result);
      setIsSimulating(false);
    }, 150);
  };

  const handleIngestIntoLive = () => {
    if (!simResult) return;
    NewsCatalystRegistry.ingest(simResult);
    refreshFeed();
  };

  const activeVetoesCount = feed.filter((f) => f.isEmergencyVeto && Date.now() - f.publishedAt < 3600000).length;
  const activeCatalystsCount = feed.filter((f) => f.isAlphaCatalyst && Date.now() - f.publishedAt < 5400000).length;

  return (
    <div className="w-full liquid-glass-card rounded-[28px] p-6 space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-black/5 pb-4">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-600 shadow-sm">
            <Newspaper className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-base font-semibold text-slate-900 tracking-tight">
                Real-Time FinBERT News & Sentiment Radar
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wider uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                100% Free Local AI
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Sub-millisecond NLP sentiment classifier & asymmetric risk veto shield for Indian equities
            </p>
          </div>
        </div>

        {/* Telemetry Badges */}
        <div className="flex items-center space-x-2">
          <div className={`px-3 py-1.5 rounded-xl border text-xs font-semibold flex items-center space-x-1.5 ${
            activeVetoesCount > 0
              ? "bg-rose-50 text-rose-700 border-rose-200 animate-pulse"
              : "bg-emerald-50 text-emerald-700 border-emerald-200"
          }`}>
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>{activeVetoesCount > 0 ? `${activeVetoesCount} Emergency Veto Active` : "0 Adverse Vetoes"}</span>
          </div>

          <div className="px-3 py-1.5 rounded-xl border border-sky-200 bg-sky-50 text-sky-700 text-xs font-semibold flex items-center space-x-1.5">
            <TrendingUp className="w-3.5 h-3.5" />
            <span>{activeCatalystsCount} Alpha Catalysts</span>
          </div>

          {/* Tab Switcher */}
          <div className="flex items-center p-0.5 rounded-xl bg-slate-100 border border-black/5 text-xs font-medium">
            <button
              onClick={() => setActiveTab("feed")}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === "feed"
                  ? "bg-white text-slate-900 font-semibold shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Live Feed
            </button>
            <button
              onClick={() => setActiveTab("simulator")}
              className={`px-3 py-1 rounded-lg transition-all ${
                activeTab === "simulator"
                  ? "bg-white text-slate-900 font-semibold shadow-sm"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              Test Simulator
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
      {activeTab === "feed" ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-slate-500 px-1">
            <span>Streaming Corporate Disclosures & Classified Signals ({feed.length})</span>
            <button
              onClick={refreshFeed}
              className="flex items-center space-x-1 hover:text-indigo-600 transition-colors"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Refresh</span>
            </button>
          </div>

          <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
            {feed.map((item) => {
              const isBullish = item.sentiment === "POSITIVE";
              const isBearish = item.sentiment === "NEGATIVE";
              const minutesAgo = Math.max(1, Math.floor((Date.now() - item.publishedAt) / 60000));

              return (
                <div
                  key={item.articleId}
                  className={`p-3.5 rounded-2xl border transition-all hover:translate-y-[-1px] ${
                    item.isEmergencyVeto
                      ? "bg-rose-50/70 border-rose-200/80 shadow-sm"
                      : item.isAlphaCatalyst
                      ? "bg-emerald-50/70 border-emerald-200/80 shadow-sm"
                      : "bg-white/80 border-black/5 hover:border-black/10"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1.5 flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {item.matchedTickers.map((t) => (
                          <span
                            key={t}
                            className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-slate-900 text-white shadow-sm"
                          >
                            {t}
                          </span>
                        ))}

                        <span className="px-2 py-0.5 rounded-lg text-[10px] font-semibold uppercase bg-slate-100 text-slate-600 border border-slate-200">
                          {item.category.replace(/_/g, " ")}
                        </span>

                        {item.isEmergencyVeto && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-rose-600 text-white flex items-center space-x-1 animate-pulse">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Emergency Veto</span>
                          </span>
                        )}

                        {item.isAlphaCatalyst && (
                          <span className="px-2 py-0.5 rounded-lg text-[10px] font-bold uppercase bg-emerald-600 text-white flex items-center space-x-1">
                            <Zap className="w-3 h-3" />
                            <span>Alpha Catalyst (+11 ACI)</span>
                          </span>
                        )}

                        <span className="text-[11px] text-slate-400 ml-auto">{minutesAgo}m ago</span>
                      </div>

                      <p className="text-xs font-medium text-slate-800 leading-snug line-clamp-2">
                        {item.headline}
                      </p>

                      <div className="flex items-center space-x-3 text-[11px] text-slate-500 pt-0.5">
                        <span className="flex items-center space-x-1">
                          <span>Verdict:</span>
                          <strong className={isBullish ? "text-emerald-700" : isBearish ? "text-rose-700" : "text-slate-600"}>
                            {item.sentiment} ({item.score > 0 ? `+${item.score}` : item.score})
                          </strong>
                        </span>
                        <span>•</span>
                        <span>Urgency: <strong>{item.urgency}/100</strong></span>
                        <span>•</span>
                        <span className="text-slate-400 truncate">{item.salienceReasoning}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Test Simulator Panel */
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-700">
              Test Any Headline with Local FinBERT Engine (Instant In-Memory Classification)
            </label>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                value={inputHeadline}
                onChange={(e) => setInputHeadline(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSimulate()}
                placeholder="Type or paste any breaking Indian stock headline..."
                className="flex-1 px-4 py-2.5 rounded-xl border border-black/10 bg-white/90 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
              />
              <button
                onClick={() => handleSimulate()}
                disabled={isSimulating || !inputHeadline.trim()}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-[0.98] text-white text-xs font-semibold transition-all shadow-sm flex items-center space-x-1.5 disabled:opacity-50"
              >
                <Search className="w-3.5 h-3.5" />
                <span>{isSimulating ? "Analyzing..." : "Analyze"}</span>
              </button>
            </div>

            {/* Presets */}
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              <span className="text-[11px] text-slate-400 font-medium">Quick Presets:</span>
              {testPresets.map((p) => (
                <button
                  key={p.label}
                  onClick={() => {
                    setInputHeadline(p.headline);
                    handleSimulate(p.headline);
                  }}
                  className="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-slate-100 hover:bg-slate-200 active:scale-95 text-slate-700 border border-slate-200/80 transition-all"
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {/* Simulation Output Card */}
          {simResult && (
            <div className="p-4 rounded-2xl border border-indigo-100 bg-indigo-50/40 space-y-3 animate-fadeIn">
              <div className="flex items-center justify-between border-b border-indigo-100/80 pb-2">
                <span className="text-xs font-bold text-slate-900 flex items-center space-x-1.5">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>FinBERT Output ({simResult.processingLatencyMs}ms)</span>
                </span>
                <button
                  onClick={handleIngestIntoLive}
                  className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-black text-white text-[11px] font-semibold flex items-center space-x-1 transition-all"
                >
                  <span>Inject into Live Registry</span>
                  <ArrowUpRight className="w-3 h-3" />
                </button>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                <div className="p-2.5 rounded-xl bg-white border border-black/5">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Matched Ticker</span>
                  <strong className="text-slate-900 text-sm">
                    {simResult.matchedTickers.join(", ") || "None (General)"}
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-black/5">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Sentiment & Score</span>
                  <strong className={simResult.score > 0 ? "text-emerald-600 text-sm" : simResult.score < 0 ? "text-rose-600 text-sm" : "text-slate-600 text-sm"}>
                    {simResult.sentiment} ({simResult.score > 0 ? `+${simResult.score}` : simResult.score})
                  </strong>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-black/5">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Urgency Level</span>
                  <strong className="text-slate-900 text-sm">{simResult.urgency} / 100</strong>
                </div>

                <div className="p-2.5 rounded-xl bg-white border border-black/5">
                  <span className="text-slate-400 block text-[10px] uppercase font-semibold">Event Taxonomy</span>
                  <strong className="text-slate-900 text-xs truncate block">{simResult.category}</strong>
                </div>
              </div>

              {/* Automated Action Decision */}
              <div className={`p-3 rounded-xl border flex items-center space-x-2.5 text-xs font-medium ${
                simResult.isEmergencyVeto
                  ? "bg-rose-100/90 text-rose-800 border-rose-300"
                  : simResult.isAlphaCatalyst
                  ? "bg-emerald-100/90 text-emerald-800 border-emerald-300"
                  : "bg-slate-100 text-slate-700 border-slate-200"
              }`}>
                {simResult.isEmergencyVeto ? (
                  <>
                    <ShieldAlert className="w-4 h-4 text-rose-600 flex-shrink-0" />
                    <span>
                      <strong>🛡️ VETO TRIGGERED:</strong> The engine will initiate an immediate emergency market liquidation scratch on any open position in {simResult.matchedTickers.join(", ") || "this asset"} to protect capital before circuit limits.
                    </span>
                  </>
                ) : simResult.isAlphaCatalyst ? (
                  <>
                    <Zap className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                    <span>
                      <strong>🚀 ALPHA CATALYST CONFIRMED:</strong> Injects +11 ACI points into breakout gating for {simResult.matchedTickers.join(", ")}, authorizing maximum capital sizing (₹380) on technical confirmation.
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 text-slate-500 flex-shrink-0" />
                    <span>
                      <strong>NEUTRAL/PASS-THROUGH:</strong> Standard quantitative trend & VWAP gating remains in full control.
                    </span>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
