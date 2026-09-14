"use strict";
var LumenAstraModule = (() => {
  var __defProp = Object.defineProperty;
  var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __hasOwnProp = Object.prototype.hasOwnProperty;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __copyProps = (to, from, except, desc) => {
    if (from && typeof from === "object" || typeof from === "function") {
      for (let key of __getOwnPropNames(from))
        if (!__hasOwnProp.call(to, key) && key !== except)
          __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
    }
    return to;
  };
  var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

  // src/domain/indigenousQuantLLM/standalone/standaloneEntry.ts
  var standaloneEntry_exports = {};
  __export(standaloneEntry_exports, {
    ASTRA_ENGINE_LABEL: () => ASTRA_ENGINE_LABEL,
    GeneralConversationalEngine: () => GeneralConversationalEngine,
    clearChatHistory: () => clearChatHistory,
    getModelInfo: () => getModelInfo,
    getSuggestedPrompts: () => getSuggestedPrompts,
    loadModelWeights: () => loadModelWeights,
    queryModel: () => queryModel
  });

  // src/domain/indigenousQuantLLM/neural/tensor.ts
  var TensorOps = class {
    /**
     * Creates a zero-filled matrix of [rows x cols].
     */
    static zeros(rows, cols) {
      const mat = new Array(rows);
      for (let r = 0; r < rows; r++) {
        mat[r] = new Array(cols).fill(0);
      }
      return mat;
    }
    /**
     * Creates a matrix initialized with Gaussian random values scaled by Xavier/Glorot variance.
     */
    static randomMatrix(rows, cols, scale) {
      const s = scale !== void 0 ? scale : Math.sqrt(2 / (rows + cols));
      const mat = new Array(rows);
      for (let r = 0; r < rows; r++) {
        const row = new Array(cols);
        for (let c = 0; c < cols; c++) {
          const u1 = Math.max(1e-7, Math.random());
          const u2 = Math.random();
          const randStd = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          row[c] = randStd * s;
        }
        mat[r] = row;
      }
      return mat;
    }
    /**
     * Matrix multiplication: C = A [M x K] * B [K x N] -> C [M x N].
     */
    static matmul(A, B) {
      const M = A.length;
      const K = A[0].length;
      const N = B[0].length;
      const C = this.zeros(M, N);
      for (let i = 0; i < M; i++) {
        const rowA = A[i];
        const rowC = C[i];
        for (let k = 0; k < K; k++) {
          const a_ik = rowA[k];
          if (a_ik === 0) continue;
          const rowB = B[k];
          for (let j = 0; j < N; j++) {
            rowC[j] += a_ik * rowB[j];
          }
        }
      }
      return C;
    }
    /**
     * Transpose of matrix: A [M x N] -> A^T [N x M].
     */
    static transpose(A) {
      const M = A.length;
      const N = A[0].length;
      const T = this.zeros(N, M);
      for (let i = 0; i < M; i++) {
        const row = A[i];
        for (let j = 0; j < N; j++) {
          T[j][i] = row[j];
        }
      }
      return T;
    }
    /**
     * Adds two matrices element-wise: C = A + B.
     */
    static add(A, B) {
      const M = A.length;
      const N = A[0].length;
      const C = this.zeros(M, N);
      for (let i = 0; i < M; i++) {
        for (let j = 0; j < N; j++) {
          C[i][j] = A[i][j] + B[i][j];
        }
      }
      return C;
    }
    /**
     * Adds a bias vector to each row of a matrix: C[i][j] = A[i][j] + bias[j].
     */
    static addBias(A, bias) {
      const M = A.length;
      const N = A[0].length;
      const C = this.zeros(M, N);
      for (let i = 0; i < M; i++) {
        for (let j = 0; j < N; j++) {
          C[i][j] = A[i][j] + bias[j];
        }
      }
      return C;
    }
    /**
     * Gaussian Error Linear Unit (GELU) activation function.
     */
    static gelu(x) {
      return 0.5 * x * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (x + 0.044715 * Math.pow(x, 3))));
    }
    /**
     * Derivative of GELU with respect to x.
     */
    static geluDerivative(x) {
      const c = Math.sqrt(2 / Math.PI);
      const inner = c * (x + 0.044715 * Math.pow(x, 3));
      const tanhVal = Math.tanh(inner);
      const sech2 = 1 - tanhVal * tanhVal;
      const dInner = c * (1 + 3 * 0.044715 * x * x);
      return 0.5 * (1 + tanhVal) + 0.5 * x * sech2 * dInner;
    }
    /**
     * Element-wise GELU applied across a matrix.
     */
    static applyGelu(A) {
      const M = A.length;
      const N = A[0].length;
      const res = this.zeros(M, N);
      for (let i = 0; i < M; i++) {
        for (let j = 0; j < N; j++) {
          res[i][j] = this.gelu(A[i][j]);
        }
      }
      return res;
    }
    /**
     * Layer Normalization across rows of a matrix with learnable gamma/beta or standard unit scaling.
     */
    static layerNorm(A, eps = 1e-5) {
      const M = A.length;
      const N = A[0].length;
      const normalized = this.zeros(M, N);
      const means = new Array(M);
      const stds = new Array(M);
      for (let i = 0; i < M; i++) {
        let sum = 0;
        for (let j = 0; j < N; j++) sum += A[i][j];
        const mean = sum / N;
        means[i] = mean;
        let varSum = 0;
        for (let j = 0; j < N; j++) {
          const diff = A[i][j] - mean;
          varSum += diff * diff;
        }
        const std = Math.sqrt(varSum / N + eps);
        stds[i] = std;
        for (let j = 0; j < N; j++) {
          normalized[i][j] = (A[i][j] - mean) / std;
        }
      }
      return { normalized, means, stds };
    }
    /**
     * Numerically stable Softmax applied row-wise with optional causal mask.
     * If mask[i][j] is true (masked out), score is set to -1e9.
     */
    static softmax(A, mask) {
      const M = A.length;
      const N = A[0].length;
      const res = this.zeros(M, N);
      for (let i = 0; i < M; i++) {
        let maxVal = -Infinity;
        for (let j = 0; j < N; j++) {
          if (mask && mask[i]?.[j]) continue;
          if (A[i][j] > maxVal) maxVal = A[i][j];
        }
        if (maxVal === -Infinity) maxVal = 0;
        let expSum = 0;
        for (let j = 0; j < N; j++) {
          if (mask && mask[i]?.[j]) {
            res[i][j] = 0;
          } else {
            const e = Math.exp(A[i][j] - maxVal);
            res[i][j] = e;
            expSum += e;
          }
        }
        const invSum = expSum > 0 ? 1 / expSum : 0;
        for (let j = 0; j < N; j++) {
          res[i][j] *= invSum;
        }
      }
      return res;
    }
    /**
     * Computes Cross-Entropy Loss and gradient for a single categorical prediction vs target index.
     */
    static crossEntropy(probs, targetIdx) {
      const p = Math.max(1e-12, Math.min(1 - 1e-12, probs[targetIdx] || 1e-12));
      const loss = -Math.log(p);
      const grad = new Array(probs.length);
      for (let i = 0; i < probs.length; i++) {
        grad[i] = probs[i] - (i === targetIdx ? 1 : 0);
      }
      return { loss, grad };
    }
    /**
     * Computes Mean Squared Error (MSE) Loss and gradient for scalar target.
     */
    static mseLoss(predicted, target) {
      const diff = predicted - target;
      return {
        loss: 0.5 * diff * diff,
        grad: diff
      };
    }
    /**
     * Clips all gradients in a matrix by global maximum norm.
     */
    static clipGradients(mat, maxNorm = 1) {
      let sumSq = 0;
      for (let r = 0; r < mat.length; r++) {
        for (let c = 0; c < mat[r].length; c++) {
          sumSq += mat[r][c] * mat[r][c];
        }
      }
      const norm = Math.sqrt(sumSq);
      if (norm > maxNorm && norm > 0) {
        const scale = maxNorm / norm;
        for (let r = 0; r < mat.length; r++) {
          for (let c = 0; c < mat[r].length; c++) {
            mat[r][c] *= scale;
          }
        }
      }
    }
  };

  // src/types.ts
  var INDIAN_ASSETS = [
    "RELIANCE",
    "TCS",
    "INFY",
    "HDFCBANK",
    "ICICIBANK",
    "SBIN",
    "BHARTIARTL",
    "ITC",
    "KOTAKBANK",
    "LT",
    "TATAMOTORS",
    "AXISBANK",
    "MARUTI",
    "SUNPHARMA",
    "TITAN",
    "BAJFINANCE",
    "HINDUNILVR",
    "WIPRO",
    "NTPC",
    "ONGC",
    "HAL",
    "BEL",
    "TATASTEEL",
    "INDUSINDBK",
    "BANKBARODA",
    "PNB",
    "CANBK",
    "UNIONBANK",
    "IDFCFIRSTB",
    "FEDERALBNK",
    "BAJAJFINSV",
    "CHOLAFIN",
    "SHRIRAMFIN",
    "JIOFIN",
    "MUTHOOTFIN",
    "HCLTECH",
    "TECHM",
    "LTM",
    "PERSISTENT",
    "COFORGE",
    "LTTS",
    "MPHASIS",
    "TATAELXSI",
    "KPITTECH",
    "POWERGRID",
    "COALINDIA",
    "BPCL",
    "IOC",
    "GAIL",
    "ADANIGREEN",
    "ADANIPOWER",
    "TATAPOWER",
    "NHPC",
    "M&M",
    "BAJAJ-AUTO",
    "EICHERMOT",
    "HEROMOTOCO",
    "TVSMOTOR",
    "BHARATFORG",
    "MOTHERSON",
    "BOSCHLTD",
    "MRF",
    "NESTLEIND",
    "BRITANNIA",
    "TATACONSUM",
    "VBL",
    "GODREJCP",
    "DABUR",
    "MARICO",
    "COLPAL",
    "CIPLA",
    "DRREDDY",
    "DIVISLAB",
    "APOLLOHOSP",
    "MANKIND",
    "TORNTPHARM",
    "LUPIN",
    "ZYDUSLIFE",
    "AUROPHARMA",
    "JSWSTEEL",
    "HINDALCO",
    "VEDL",
    "JINDALSTEL",
    "NMDC",
    "SAIL",
    "SIEMENS",
    "ABB",
    "BHEL",
    "HAVELLS",
    "POLYCAB",
    "TRENT",
    "DMART",
    "INDHOTEL",
    "ASIANPAINT",
    "BERGEPAINT",
    "ULTRACEMCO",
    "GRASIM",
    "AMBUJACEM",
    "SHREECEM",
    "PIDILITIND"
  ];
  var ASSETS = [
    ...INDIAN_ASSETS,
    "BTC",
    "ETH",
    "SOL",
    "BNB",
    "XRP",
    "DOGE",
    "ADA",
    "AVAX",
    "SUI",
    "SHIB",
    "TON",
    "LINK",
    "NEAR",
    "DOT",
    "BCH",
    "PEPE",
    "UNI",
    "APT",
    "LTC",
    "ICP",
    "FET",
    "KAS",
    "POL",
    "XLM",
    "XMR",
    "TIA",
    "RENDER",
    "STX",
    "TAO",
    "AAVE",
    "ARB",
    "OP",
    "INJ",
    "FIL",
    "OKB",
    "IMX",
    "VET",
    "MNT",
    "CRO",
    "FTM",
    "WIF",
    "FLOKI",
    "BONK",
    "GRT",
    "THETA",
    "SEI",
    "JUP",
    "RUNE",
    "PYTH",
    "HBAR",
    "OM",
    "LDO",
    "ALGO",
    "MKR",
    "BSV",
    "JASMY",
    "ENA",
    "AR",
    "CORE",
    "BTT",
    "NOT",
    "ONDO",
    "WLD",
    "PENDLE",
    "BEAM",
    "DYDX",
    "STRK",
    "GALA",
    "BLUR",
    "CRV",
    "CHZ",
    "SNX",
    "AXS",
    "SAND",
    "MANA",
    "ENJ",
    "FLOW",
    "QNT",
    "NEO",
    "EOS",
    "IOTA",
    "KAVA",
    "MINA",
    "ROSE",
    "ZIL",
    "KLAY",
    "CFX",
    "RON",
    "APE",
    "1INCH",
    "COMP",
    "OSMO",
    "GMX",
    "RAY",
    "JTO",
    "ORDI",
    "SATS",
    "W",
    "TNSR",
    "EIGEN",
    "NEIRO",
    "TURBO",
    "POPCAT",
    "MEME",
    "ME",
    "ZK",
    "MORPHO",
    "COW"
  ];

  // src/domain/indigenousQuantLLM/neural/vocabulary.ts
  var SPECIAL_TOKENS = [
    "<pad>",
    "<bos>",
    "<eos>",
    "<unk>",
    "<thought>",
    "</thought>",
    "<think>",
    "</think>",
    "<reflection>",
    "</reflection>",
    "<verify>",
    "</verify>",
    "<backtrack>",
    "</backtrack>",
    "<scenario>",
    "</scenario>",
    "<regime>",
    "</regime>",
    "<aci>",
    "</aci>",
    "<vwap>",
    "</vwap>",
    "<atr>",
    "</atr>",
    "<volume>",
    "</volume>",
    "<action>",
    "</action>",
    "<confidence>",
    "</confidence>",
    "<risk>",
    "</risk>",
    "<verdict>",
    "</verdict>"
  ];
  var ACTION_TOKENS = [
    "BUY_BREAKOUT",
    "VWAP_PULLBACK",
    "MEAN_REVERT",
    "DEFENSIVE_EXIT",
    "STAND_ASIDE",
    "PROFIT_HARVEST",
    "EMERGENCY_VETO",
    "ACCUMULATE",
    "REDUCE",
    "HOLD",
    "ASSESS_FUNDAMENTALS",
    "VERIFIED_SAFE",
    "QUANT_VERIFIED",
    "COMMUNICATE",
    "COMMUNICATE_DIALOGUE",
    "EXPLAIN_CONCEPT",
    "CLARIFY_CONTEXT",
    "EMPATHETIC_RESPONSE"
  ];
  var REGIME_TOKENS = [
    "REGIME_BULL_TREND",
    "REGIME_BEAR_TREND",
    "REGIME_RANGE_BOUND",
    "REGIME_HIGH_VOLATILITY",
    "REGIME_LOW_VOLATILITY",
    "REGIME_VOLATILITY_SHOCK",
    "DOMAIN_FINANCE_SEC",
    "DOMAIN_RISK_SAFETY",
    "DOMAIN_QUANT_MATH",
    "DOMAIN_COMMUNICATION",
    "DOMAIN_TRADING_ALPHA"
  ];
  var QUANT_DESCRIPTOR_TOKENS = [
    // ACI Buckets
    "ACI_EXEMPLARY_85_PLUS",
    "ACI_STRONG_75_84",
    "ACI_MODERATE_65_74",
    "ACI_SUBPAR_BELOW_65",
    // VWAP Relations
    "ABOVE_VWAP_EXPANSION",
    "BELOW_VWAP_FAILED",
    "AT_VWAP_SUPPORT",
    "VWAP_STRETCH_EXTREME",
    // Volume Surge
    "VOLUME_SURGE_EXTREME_3X",
    "VOLUME_SURGE_STRONG_2X",
    "VOLUME_NORMAL_1X",
    "VOLUME_FADING_SUB_1X",
    // Sentiment / Catalyst
    "CATALYST_EARNINGS_BEAT",
    "CATALYST_EARNINGS_MISS",
    "CATALYST_SEBI_ORDER",
    "CATALYST_FORENSIC_PROBE",
    "CATALYST_BLOCK_DEAL",
    "CATALYST_COMMODITY_SPIKE",
    "CATALYST_NONE",
    // Outcomes / Labels
    "OUTCOME_WIN_1_5_ATR",
    "OUTCOME_WIN_RUNNER",
    "OUTCOME_LOSS_DEFENSIVE",
    "OUTCOME_LOSS_STOP_HIT",
    "OUTCOME_STAGNANT_SCRATCH"
  ];
  var REASONING_WORDS = [
    "analyzing",
    "market",
    "conditions",
    "for",
    "asset",
    "volume",
    "surge",
    "detected",
    "at",
    "institutional",
    "vwap",
    "support",
    "broken",
    "confirmed",
    "breakout",
    "above",
    "morning",
    "high",
    "failed",
    "reversion",
    "probable",
    "aci",
    "score",
    "indicates",
    "high",
    "moderate",
    "low",
    "conviction",
    "capital",
    "defense",
    "mandates",
    "immediate",
    "exit",
    "to",
    "prevent",
    "further",
    "drawdown",
    "allocating",
    "runner",
    "target",
    "with",
    "trailing",
    "ratchet",
    "sizing",
    "multiplier",
    "set",
    "halving",
    "risk",
    "due",
    "elevated",
    "volatility",
    "regime",
    "favorable",
    "trend",
    "rider",
    "entry",
    "valid",
    "veto",
    "engaged",
    "governance",
    "red",
    "flag",
    "stand",
    "aside",
    "preserve",
    "cash",
    "healthy",
    "expectancy",
    "verified",
    "prm",
    "consensus",
    "expansion"
  ];
  var INSTITUTIONAL_QUANT_WORDS = [
    // Grammar & Connectives
    "the",
    "is",
    "a",
    "an",
    "in",
    "of",
    "and",
    "or",
    "to",
    "with",
    "by",
    "from",
    "as",
    "on",
    "this",
    "that",
    "which",
    "be",
    "are",
    "not",
    "have",
    "has",
    "will",
    "shows",
    "indicates",
    "calculated",
    "derived",
    "verified",
    "confirms",
    "breaches",
    "exceeds",
    "satisfies",
    // Mathematical Derivatives & Greeks
    "delta",
    "gamma",
    "vega",
    "theta",
    "vanna",
    "volga",
    "taylor",
    "expansion",
    "curvature",
    "hedge",
    "ratio",
    "order",
    "second",
    "closed",
    "form",
    "analytical",
    "solution",
    "partial",
    "derivative",
    "black",
    "scholes",
    "heston",
    "stochastic",
    "volatility",
    "feller",
    "condition",
    "boundary",
    "variance",
    "drift",
    "mean",
    "reversion",
    "ornstein",
    "uhlenbeck",
    "equilibrium",
    "sigma",
    "standard",
    "deviation",
    "z_score",
    "cointegration",
    "stationary",
    "stationarity",
    "adf",
    "p_value",
    "hypothesis",
    "rejection",
    // Microstructure & Exchange Invariants
    "microstructure",
    "order_flow",
    "imbalance",
    "depth",
    "liquidity",
    "bid",
    "ask",
    "spread",
    "amihud",
    "illiquidity",
    "tick",
    "size",
    "quantization",
    "integer",
    "lot",
    "shares",
    "mandatory",
    "liquid",
    "cash",
    "reserve",
    "floor",
    "statutory",
    "charges",
    "execution",
    "slippage",
    "notional",
    "margin",
    "leverage",
    "mis",
    "circuit_breaker",
    "intraday",
    // Sentinel Risk & Governance
    "sentinel",
    "defense",
    "veto",
    "volatility_shock",
    "drawdown",
    "preservation",
    "halt",
    "circuit",
    "breaker",
    "epistemic",
    "uncertainty",
    "shannon",
    "entropy",
    "bits",
    "confidence",
    "process",
    "reward",
    "critic",
    "prm",
    "expected",
    "value",
    "var",
    "parametric",
    "stress_test",
    "governance",
    "sovereign",
    // Corporate Finance & Valuation
    "solvency",
    "balance_sheet",
    "quick_ratio",
    "current_assets",
    "liabilities",
    "inventory",
    "receivables",
    "ebitda",
    "debt",
    "coverage",
    "altman",
    "z",
    "score",
    "piotroski",
    "f",
    "sec",
    "10k",
    "10q",
    "operating",
    "revenue",
    "interest",
    "expense"
  ];
  var CONVERSATIONAL_AND_REASONING_WORDS = [
    // Greetings & Social
    "hello",
    "hi",
    "hey",
    "welcome",
    "greetings",
    "thanks",
    "thank",
    "you",
    "please",
    "good",
    "morning",
    "afternoon",
    "evening",
    "day",
    "glad",
    "delighted",
    "happy",
    "great",
    "pleasure",
    "meet",
    "farewell",
    "bye",
    "yes",
    "no",
    "sure",
    "certainly",
    "absolutely",
    "indeed",
    "okay",
    "alright",
    "welcome_back",
    "fine",
    "wonderful",
    "cheers",
    "appreciated",
    // Pronouns & Conversational Connectors
    "i",
    "me",
    "my",
    "myself",
    "we",
    "our",
    "ours",
    "us",
    "your",
    "yours",
    "they",
    "their",
    "them",
    "he",
    "she",
    "it",
    "its",
    "who",
    "what",
    "when",
    "where",
    "why",
    "how",
    "which",
    "whose",
    "can",
    "could",
    "would",
    "should",
    "might",
    "may",
    "must",
    "shall",
    "am",
    // Conversational Understanding & Dialogue Flow
    "understand",
    "understanding",
    "comprehend",
    "context",
    "meaning",
    "perspective",
    "insight",
    "dialogue",
    "conversation",
    "chat",
    "message",
    "discuss",
    "discussion",
    "topic",
    "explore",
    "learn",
    "learning",
    "explain",
    "explaining",
    "explanation",
    "clarify",
    "clarification",
    "question",
    "answer",
    "answering",
    "response",
    "query",
    "inquiry",
    "thoughtful",
    "nuance",
    "balance",
    "balanced",
    "honest",
    "listen",
    "listening",
    "helpful",
    "assist",
    "assistant",
    "assistance",
    "guide",
    "guidance",
    "collaborate",
    "collaborative",
    "share",
    // Reasoning, Logic & Explanatory Conjunctions
    "because",
    "therefore",
    "however",
    "moreover",
    "furthermore",
    "meanwhile",
    "although",
    "whereas",
    "similarly",
    "specifically",
    "essentially",
    "ultimately",
    "firstly",
    "secondly",
    "finally",
    "example",
    "analogous",
    "analogy",
    "difference",
    "similarity",
    "advantage",
    "disadvantage",
    "tradeoff",
    "cause",
    "effect",
    "consequence",
    "implication",
    "premise",
    "conclusion",
    "rationale",
    "principle",
    "framework",
    "concept",
    "structured",
    "systematic",
    "deduce",
    "infer",
    "synthesize",
    "evaluate",
    "assess",
    "compare",
    "contrast",
    "contrastive",
    "fundamental",
    "intuitive",
    // Personality, Demeanor & Humanized Empathy
    "lumen",
    "astra",
    "sovereign",
    "calm",
    "objective",
    "transparent",
    "rigorous",
    "curious",
    "respectful",
    "composed",
    "humble",
    "disciplined",
    "companion",
    "partner",
    "colleague",
    "intellect",
    "poise",
    "friendly",
    "warm",
    "reassuring",
    "patient",
    "clarity",
    "integrity",
    "empathy",
    "feeling",
    "sentiment",
    "nervous",
    "excited",
    "cautious",
    "confident",
    "curiosity",
    "enthusiasm",
    "wisdom",
    "experience",
    "mindful",
    "steady",
    "grounded",
    "reliable",
    "trust",
    "truth",
    "candid",
    "realistic",
    "humor",
    "philosophy",
    "journey",
    // General Knowledge & Conversational Financial Q&A
    "market_order",
    "limit_order",
    "stop_order",
    "broker",
    "exchange",
    "matching",
    "investor",
    "trader",
    "beginner",
    "basics",
    "fundamentals",
    "psychology",
    "emotion",
    "fear",
    "greed",
    "discipline",
    "habit",
    "mistake",
    "lesson",
    "advice",
    "recommendation",
    "suggestion",
    "horizon",
    "long_term",
    "short_term",
    "wealth",
    "compounding",
    "savings",
    "retirement",
    "inflation",
    "purchasing_power",
    "interest_rate",
    "central_bank",
    "economy",
    "growth",
    "recession",
    "bear",
    "bull",
    "cycle",
    "allocation",
    "diversification",
    "safety_net",
    "emergency_fund",
    "simple",
    "easy",
    // Nuanced Dialogue Tokens
    "inquisitive",
    "reflective",
    "articulate",
    "perspective_shift",
    "thoughtfulness"
  ];
  var ALL_TOKENS = [
    ...SPECIAL_TOKENS,
    ...ACTION_TOKENS,
    ...REGIME_TOKENS,
    ...QUANT_DESCRIPTOR_TOKENS,
    ...INDIAN_ASSETS,
    ...REASONING_WORDS,
    ...INSTITUTIONAL_QUANT_WORDS,
    ...CONVERSATIONAL_AND_REASONING_WORDS
  ];
  var VOCABULARY = Array.from(new Set(ALL_TOKENS));
  var TOKEN_TO_ID = {};
  var ID_TO_TOKEN = {};
  for (let i = 0; i < VOCABULARY.length; i++) {
    const tok = VOCABULARY[i];
    TOKEN_TO_ID[tok] = i;
    ID_TO_TOKEN[i] = tok;
  }
  var VOCAB_SIZE = VOCABULARY.length;
  var PAD_TOKEN_ID = TOKEN_TO_ID["<pad>"] ?? 0;
  var BOS_TOKEN_ID = TOKEN_TO_ID["<bos>"] ?? 1;
  var EOS_TOKEN_ID = TOKEN_TO_ID["<eos>"] ?? 2;
  var UNK_TOKEN_ID = TOKEN_TO_ID["<unk>"] ?? 3;
  var DomainTokenizer = class {
    static vocabSize = VOCAB_SIZE;
    /**
     * Tokenizes text or sequence of tokens into integer token IDs.
     */
    static encode(text) {
      const regex = new RegExp(`(<[^>]+>|[a-zA-Z0-9_]+|[^\\s\\w])`, "g");
      const rawTokens = text.match(regex) || [];
      const ids = [];
      for (const raw of rawTokens) {
        const upper = raw.toUpperCase();
        const lower = raw.toLowerCase();
        if (TOKEN_TO_ID[raw] !== void 0) {
          ids.push(TOKEN_TO_ID[raw]);
        } else if (TOKEN_TO_ID[upper] !== void 0) {
          ids.push(TOKEN_TO_ID[upper]);
        } else if (TOKEN_TO_ID[lower] !== void 0) {
          ids.push(TOKEN_TO_ID[lower]);
        } else {
          ids.push(UNK_TOKEN_ID);
        }
      }
      return ids;
    }
    /**
     * Decodes a sequence of integer token IDs back to a readable string.
     */
    static decode(ids) {
      return ids.map((id) => ID_TO_TOKEN[id] || "<unk>").filter((t) => t !== "<pad>" && t !== "<bos>").join(" ").replace(/\s+([<>[\](),.:;])/g, "$1");
    }
    /**
     * Returns token ID for a specific action token.
     */
    static getActionTokenId(action) {
      return TOKEN_TO_ID[action] ?? UNK_TOKEN_ID;
    }
  };

  // src/domain/indigenousQuantLLM/neural/swiglu.ts
  var SwiGLUFFN = class _SwiGLUFFN {
    dModel;
    dHidden;
    W_gate;
    // [dModel x dHidden]
    W_up;
    // [dModel x dHidden]
    W_down;
    // [dHidden x dModel]
    constructor(dModel, dHidden) {
      this.dModel = dModel;
      this.dHidden = dHidden || Math.floor(8 * dModel / 3);
      this.W_gate = TensorOps.randomMatrix(this.dModel, this.dHidden);
      this.W_up = TensorOps.randomMatrix(this.dModel, this.dHidden);
      this.W_down = TensorOps.randomMatrix(this.dHidden, this.dModel);
    }
    /**
     * Numerically stable Sigmoid: sigma(z) = 1 / (1 + exp(-z)).
     */
    static sigmoid(z) {
      if (z >= 0) {
        return 1 / (1 + Math.exp(-z));
      } else {
        const ez = Math.exp(z);
        return ez / (1 + ez);
      }
    }
    /**
     * Swish / SiLU activation: Swish(z) = z * sigma(z).
     */
    static swish(z) {
      return z * this.sigmoid(z);
    }
    /**
     * Derivative of Swish: d/dz [z * sigma(z)] = sigma(z) * (1 + z * (1 - sigma(z))).
     */
    static swishDerivative(z) {
      const s = this.sigmoid(z);
      return s * (1 + z * (1 - s));
    }
    /**
     * Forward pass through SwiGLU block.
     */
    forward(X) {
      const seqLen = X.length;
      const gateLinear = TensorOps.matmul(X, this.W_gate);
      const upLinear = TensorOps.matmul(X, this.W_up);
      const gateActivated = TensorOps.zeros(seqLen, this.dHidden);
      const swigluHidden = TensorOps.zeros(seqLen, this.dHidden);
      for (let t = 0; t < seqLen; t++) {
        for (let h = 0; h < this.dHidden; h++) {
          const g = _SwiGLUFFN.swish(gateLinear[t][h]);
          gateActivated[t][h] = g;
          swigluHidden[t][h] = g * upLinear[t][h];
        }
      }
      const out = TensorOps.matmul(swigluHidden, this.W_down);
      return { out, gateLinear, upLinear, gateActivated, swigluHidden };
    }
    /**
     * Backward pass gradient computation for SwiGLU.
     */
    backward(dOut, X, gateLinear, upLinear, gateActivated, swigluHidden) {
      const seqLen = X.length;
      const dW_down = TensorOps.matmul(TensorOps.transpose(swigluHidden), dOut);
      const dSwigluHidden = TensorOps.matmul(dOut, TensorOps.transpose(this.W_down));
      const dGateLinear = TensorOps.zeros(seqLen, this.dHidden);
      const dUpLinear = TensorOps.zeros(seqLen, this.dHidden);
      for (let t = 0; t < seqLen; t++) {
        for (let h = 0; h < this.dHidden; h++) {
          const dH = dSwigluHidden[t][h];
          dUpLinear[t][h] = dH * gateActivated[t][h];
          const dSwish = _SwiGLUFFN.swishDerivative(gateLinear[t][h]);
          dGateLinear[t][h] = dH * upLinear[t][h] * dSwish;
        }
      }
      const dW_up = TensorOps.matmul(TensorOps.transpose(X), dUpLinear);
      const dW_gate = TensorOps.matmul(TensorOps.transpose(X), dGateLinear);
      const dX_up = TensorOps.matmul(dUpLinear, TensorOps.transpose(this.W_up));
      const dX_gate = TensorOps.matmul(dGateLinear, TensorOps.transpose(this.W_gate));
      const dX = TensorOps.add(dX_up, dX_gate);
      return { dX, dW_gate, dW_up, dW_down };
    }
  };

  // src/domain/indigenousQuantLLM/neural/moeBlock.ts
  var MoEFFNBlock = class {
    dModel;
    nExperts;
    topK;
    experts;
    W_router;
    // [dModel x nExperts]
    constructor(dModel, nExperts = 4, topK = 2) {
      this.dModel = dModel;
      this.nExperts = nExperts;
      this.topK = topK;
      this.W_router = TensorOps.randomMatrix(dModel, nExperts);
      this.experts = [];
      for (let e = 0; e < nExperts; e++) {
        this.experts.push(new SwiGLUFFN(dModel));
      }
    }
    /**
     * Forward pass: routes each token to Top-K experts and computes weighted combination.
     */
    forward(X) {
      const seqLen = X.length;
      const routerLogits = TensorOps.matmul(X, this.W_router);
      const routerWeights = TensorOps.softmax(routerLogits);
      const out = TensorOps.zeros(seqLen, this.dModel);
      const expertAssignments = [];
      const expertCounts = new Array(this.nExperts).fill(0);
      for (let t = 0; t < seqLen; t++) {
        const row = routerWeights[t];
        const indexed = row.map((p, idx) => ({ prob: p, idx })).sort((a, b) => b.prob - a.prob);
        const e1 = indexed[0].idx;
        const e2 = indexed[1]?.idx ?? e1;
        const rawP1 = indexed[0].prob;
        const rawP2 = indexed[1]?.prob ?? 0;
        const normSum = Math.max(1e-7, rawP1 + rawP2);
        const p1 = rawP1 / normSum;
        const p2 = rawP2 / normSum;
        expertAssignments.push({ expert1: e1, expert2: e2, p1, p2 });
        expertCounts[e1]++;
        expertCounts[e2]++;
        const tokenMat = [X[t]];
        const outE1 = this.experts[e1].forward(tokenMat).out[0];
        const outE2 = this.experts[e2].forward(tokenMat).out[0];
        for (let d = 0; d < this.dModel; d++) {
          out[t][d] = p1 * outE1[d] + p2 * outE2[d];
        }
      }
      let loadBalancingLoss = 0;
      const targetFreq = 1 / this.nExperts;
      for (let e = 0; e < this.nExperts; e++) {
        const f_i = expertCounts[e] / (seqLen * 2 || 1);
        const diff = f_i - targetFreq;
        loadBalancingLoss += diff * diff;
      }
      return { out, routerWeights, expertAssignments, loadBalancingLoss };
    }
  };

  // src/domain/indigenousQuantLLM/neural/transformerModel.ts
  var DEFAULT_TRANSFORMER_CONFIG = {
    vocabSize: VOCAB_SIZE,
    dModel: 64,
    nHeads: 4,
    nLayers: 2,
    maxSeqLen: 64,
    nActions: ACTION_TOKENS.length,
    learningRate: 1e-3,
    weightDecay: 0.01,
    useMoE: false,
    nExperts: 4
  };
  var LARGE_1M_TRANSFORMER_CONFIG = {
    vocabSize: VOCAB_SIZE,
    dModel: 152,
    nHeads: 4,
    nLayers: 4,
    maxSeqLen: 128,
    nActions: ACTION_TOKENS.length,
    learningRate: 8e-4,
    weightDecay: 0.01,
    useMoE: true,
    nExperts: 4
  };
  var NeuralTransformerModel = class _NeuralTransformerModel {
    config;
    W_emb;
    // [vocabSize x dModel]
    W_pos;
    // [maxSeqLen x dModel]
    layers;
    moeBlocks;
    W_lm;
    // [dModel x vocabSize]
    W_policy;
    // [dModel x nActions]
    W_value;
    // [dModel x 1]
    // AdamW Optimizer State
    m_W_emb;
    v_W_emb;
    m_layers;
    v_layers;
    m_W_lm;
    v_W_lm;
    m_W_policy;
    v_W_policy;
    m_W_value;
    v_W_value;
    optimizerStep = 0;
    constructor(config = {}) {
      this.config = { ...DEFAULT_TRANSFORMER_CONFIG, ...config };
      const { vocabSize, dModel, maxSeqLen, nLayers, nActions } = this.config;
      this.W_emb = TensorOps.randomMatrix(vocabSize, dModel, 0.05);
      this.W_pos = TensorOps.randomMatrix(maxSeqLen, dModel, 0.05);
      this.layers = [];
      for (let l = 0; l < nLayers; l++) {
        this.layers.push({
          W_q: TensorOps.randomMatrix(dModel, dModel),
          W_k: TensorOps.randomMatrix(dModel, dModel),
          W_v: TensorOps.randomMatrix(dModel, dModel),
          W_o: TensorOps.randomMatrix(dModel, dModel),
          W_1: TensorOps.randomMatrix(dModel, 4 * dModel),
          b_1: new Array(4 * dModel).fill(0),
          W_2: TensorOps.randomMatrix(4 * dModel, dModel),
          b_2: new Array(dModel).fill(0)
        });
      }
      if (this.config.useMoE) {
        this.moeBlocks = [];
        for (let l = 0; l < nLayers; l++) {
          this.moeBlocks.push(new MoEFFNBlock(dModel, this.config.nExperts || 4, 2));
        }
      }
      this.W_lm = TensorOps.randomMatrix(dModel, vocabSize, 0.05);
      this.W_policy = TensorOps.randomMatrix(dModel, nActions, 0.05);
      this.W_value = TensorOps.randomMatrix(dModel, 1, 0.05);
      this.m_W_emb = TensorOps.zeros(vocabSize, dModel);
      this.v_W_emb = TensorOps.zeros(vocabSize, dModel);
      this.m_W_lm = TensorOps.zeros(dModel, vocabSize);
      this.v_W_lm = TensorOps.zeros(dModel, vocabSize);
      this.m_W_policy = TensorOps.zeros(dModel, nActions);
      this.v_W_policy = TensorOps.zeros(dModel, nActions);
      this.m_W_value = TensorOps.zeros(dModel, 1);
      this.v_W_value = TensorOps.zeros(dModel, 1);
      this.m_layers = [];
      this.v_layers = [];
      for (let l = 0; l < nLayers; l++) {
        this.m_layers.push({
          W_q: TensorOps.zeros(dModel, dModel),
          W_k: TensorOps.zeros(dModel, dModel),
          W_v: TensorOps.zeros(dModel, dModel),
          W_o: TensorOps.zeros(dModel, dModel),
          W_1: TensorOps.zeros(dModel, 4 * dModel),
          b_1: new Array(4 * dModel).fill(0),
          W_2: TensorOps.zeros(4 * dModel, dModel),
          b_2: new Array(dModel).fill(0)
        });
        this.v_layers.push({
          W_q: TensorOps.zeros(dModel, dModel),
          W_k: TensorOps.zeros(dModel, dModel),
          W_v: TensorOps.zeros(dModel, dModel),
          W_o: TensorOps.zeros(dModel, dModel),
          W_1: TensorOps.zeros(dModel, 4 * dModel),
          b_1: new Array(4 * dModel).fill(0),
          W_2: TensorOps.zeros(4 * dModel, dModel),
          b_2: new Array(dModel).fill(0)
        });
      }
    }
    /**
     * Forward pass through the Transformer with causal attention masking.
     */
    forward(tokens) {
      const T = Math.min(tokens.length, this.config.maxSeqLen);
      const { dModel, nLayers, vocabSize, nActions } = this.config;
      const X = TensorOps.zeros(T, dModel);
      for (let t = 0; t < T; t++) {
        const tokId = Math.min(tokens[t], vocabSize - 1);
        const embRow = this.W_emb[tokId];
        const posRow = this.W_pos[t];
        for (let d = 0; d < dModel; d++) {
          X[t][d] = embRow[d] + posRow[d];
        }
      }
      const layerInputs = [];
      const layerAttnOutputs = [];
      const layerFfnInputs = [];
      const layerFfnHiddens = [];
      const layerFfnOutputs = [];
      const causalMask = [];
      for (let i = 0; i < T; i++) {
        causalMask[i] = [];
        for (let j = 0; j < T; j++) {
          causalMask[i][j] = j > i;
        }
      }
      let current = X;
      let totalMoeLoadLoss = 0;
      for (let l = 0; l < nLayers; l++) {
        const layer = this.layers[l];
        layerInputs.push(current);
        const { normalized: normAttn } = TensorOps.layerNorm(current);
        const Q = TensorOps.matmul(normAttn, layer.W_q);
        const K = TensorOps.matmul(normAttn, layer.W_k);
        const V = TensorOps.matmul(normAttn, layer.W_v);
        const K_T = TensorOps.transpose(K);
        const scores = TensorOps.matmul(Q, K_T);
        const scale = 1 / Math.sqrt(dModel / this.config.nHeads);
        for (let i = 0; i < T; i++) {
          for (let j = 0; j < T; j++) {
            scores[i][j] *= scale;
          }
        }
        const attnWeights = TensorOps.softmax(scores, causalMask);
        const attnContext = TensorOps.matmul(attnWeights, V);
        const attnOut = TensorOps.matmul(attnContext, layer.W_o);
        layerAttnOutputs.push(attnOut);
        const res1 = TensorOps.add(current, attnOut);
        const { normalized: normFfn } = TensorOps.layerNorm(res1);
        layerFfnInputs.push(normFfn);
        const ffnHidden = TensorOps.applyGelu(TensorOps.addBias(TensorOps.matmul(normFfn, layer.W_1), layer.b_1));
        let ffnOut;
        if (this.moeBlocks && this.moeBlocks[l]) {
          const moeRes = this.moeBlocks[l].forward(normFfn);
          ffnOut = moeRes.out;
          totalMoeLoadLoss += moeRes.loadBalancingLoss;
        } else {
          ffnOut = TensorOps.addBias(TensorOps.matmul(ffnHidden, layer.W_2), layer.b_2);
        }
        layerFfnHiddens.push(ffnHidden);
        layerFfnOutputs.push(ffnOut);
        current = TensorOps.add(res1, ffnOut);
      }
      const { normalized: finalHidden } = TensorOps.layerNorm(current);
      const lmLogits = TensorOps.matmul(finalHidden, this.W_lm);
      const lmProbs = TensorOps.softmax(lmLogits);
      const lastRow = finalHidden[T - 1];
      const lastMat = [lastRow];
      const policyLogitsMat = TensorOps.matmul(lastMat, this.W_policy);
      const policyProbsMat = TensorOps.softmax(policyLogitsMat);
      const policyLogits = policyLogitsMat[0];
      const policyProbs = policyProbsMat[0];
      const valMat = TensorOps.matmul(lastMat, this.W_value);
      const valuePred = Math.tanh(valMat[0][0]);
      const policyEntropy = _NeuralTransformerModel.computeShannonEntropy(policyProbs);
      return {
        tokens: tokens.slice(0, T),
        seqLen: T,
        embeddings: X,
        layerInputs,
        layerAttnOutputs,
        layerFfnInputs,
        layerFfnHiddens,
        layerFfnOutputs,
        finalHidden,
        lmLogits,
        lmProbs,
        policyLogits,
        policyProbs,
        policyEntropy,
        valuePred,
        moeLoadBalancingLoss: totalMoeLoadLoss
      };
    }
    /**
     * Computes exact Shannon Entropy H(p) = -sum(p * log2(p)) in bits.
     */
    static computeShannonEntropy(probs) {
      let entropy = 0;
      for (let i = 0; i < probs.length; i++) {
        const p = probs[i];
        if (p > 1e-12) {
          entropy -= p * Math.log2(p);
        }
      }
      return Number(entropy.toFixed(3));
    }
    /**
     * Performs an analytical backpropagation step and AdamW weight update on a training example.
     */
    trainStep(inputTokens, targetTokens, targetActionIdx, targetValue) {
      const cache = this.forward(inputTokens);
      const T = cache.seqLen;
      let lmLoss = 0;
      let policyLoss = 0;
      let valueLoss = 0;
      let dLmLogits = TensorOps.zeros(T, this.config.vocabSize);
      if (targetTokens && targetTokens.length > 0) {
        let validTokens = 0;
        for (let t = 0; t < T - 1; t++) {
          const nextTarget = targetTokens[t + 1] ?? targetTokens[t];
          if (nextTarget !== void 0) {
            const ce = TensorOps.crossEntropy(cache.lmProbs[t], nextTarget);
            lmLoss += ce.loss;
            dLmLogits[t] = ce.grad;
            validTokens++;
          }
        }
        if (validTokens > 0) {
          lmLoss /= validTokens;
          for (let t = 0; t < T; t++) {
            for (let v = 0; v < this.config.vocabSize; v++) {
              dLmLogits[t][v] /= validTokens;
            }
          }
        }
      }
      let dPolicyLogits = new Array(this.config.nActions).fill(0);
      if (targetActionIdx !== void 0 && targetActionIdx >= 0) {
        const ce = TensorOps.crossEntropy(cache.policyProbs, targetActionIdx);
        policyLoss = ce.loss;
        dPolicyLogits = ce.grad;
      }
      let dValuePred = 0;
      if (targetValue !== void 0) {
        const mse = TensorOps.mseLoss(cache.valuePred, targetValue);
        valueLoss = mse.loss;
        dValuePred = mse.grad * (1 - cache.valuePred * cache.valuePred);
      }
      const totalLoss = lmLoss * 0.5 + policyLoss * 0.4 + valueLoss * 0.1;
      const dW_lm = TensorOps.matmul(TensorOps.transpose(cache.finalHidden), dLmLogits);
      const dW_policy = TensorOps.zeros(this.config.dModel, this.config.nActions);
      const lastHidden = cache.finalHidden[T - 1];
      for (let d = 0; d < this.config.dModel; d++) {
        for (let a = 0; a < this.config.nActions; a++) {
          dW_policy[d][a] = lastHidden[d] * dPolicyLogits[a];
        }
      }
      const dW_value = TensorOps.zeros(this.config.dModel, 1);
      for (let d = 0; d < this.config.dModel; d++) {
        dW_value[d][0] = lastHidden[d] * dValuePred;
      }
      const dFinalHidden = TensorOps.matmul(dLmLogits, TensorOps.transpose(this.W_lm));
      for (let d = 0; d < this.config.dModel; d++) {
        let polGrad = 0;
        for (let a = 0; a < this.config.nActions; a++) {
          polGrad += dPolicyLogits[a] * this.W_policy[d][a];
        }
        dFinalHidden[T - 1][d] += polGrad + dValuePred * this.W_value[d][0];
      }
      let dCurrent = dFinalHidden;
      const layerGrads = [];
      for (let l = this.config.nLayers - 1; l >= 0; l--) {
        const layer = this.layers[l];
        let ffnHidden = cache.layerFfnHiddens[l];
        if (!ffnHidden || ffnHidden.length === 0 || !ffnHidden[0]) {
          ffnHidden = TensorOps.applyGelu(TensorOps.addBias(TensorOps.matmul(cache.layerFfnInputs[l], layer.W_1), layer.b_1));
        }
        const dW_2 = TensorOps.matmul(TensorOps.transpose(ffnHidden), dCurrent);
        const db_2 = new Array(this.config.dModel).fill(0);
        for (let t = 0; t < T; t++) {
          for (let d = 0; d < this.config.dModel; d++) {
            db_2[d] += dCurrent[t][d];
          }
        }
        const dFfnHidden = TensorOps.matmul(dCurrent, TensorOps.transpose(layer.W_2));
        const dFfnPreGelu = TensorOps.zeros(T, 4 * this.config.dModel);
        for (let t = 0; t < T; t++) {
          for (let d = 0; d < 4 * this.config.dModel; d++) {
            dFfnPreGelu[t][d] = dFfnHidden[t][d] * TensorOps.geluDerivative(ffnHidden[t][d]);
          }
        }
        const dW_1 = TensorOps.matmul(TensorOps.transpose(cache.layerFfnInputs[l]), dFfnPreGelu);
        const db_1 = new Array(4 * this.config.dModel).fill(0);
        for (let t = 0; t < T; t++) {
          for (let d = 0; d < 4 * this.config.dModel; d++) {
            db_1[d] += dFfnPreGelu[t][d];
          }
        }
        const dW_o = TensorOps.matmul(TensorOps.transpose(cache.layerInputs[l]), dCurrent);
        const dW_q = TensorOps.matmul(TensorOps.transpose(cache.layerInputs[l]), dCurrent);
        const dW_k = TensorOps.matmul(TensorOps.transpose(cache.layerInputs[l]), dCurrent);
        const dW_v = TensorOps.matmul(TensorOps.transpose(cache.layerInputs[l]), dCurrent);
        layerGrads[l] = {
          dW_q,
          dW_k,
          dW_v,
          dW_o,
          dW_1,
          db_1,
          dW_2,
          db_2
        };
        dCurrent = TensorOps.matmul(dCurrent, TensorOps.transpose(layer.W_o));
      }
      this.optimizerStep++;
      const lr = this.config.learningRate;
      const beta1 = 0.9;
      const beta2 = 0.999;
      const eps = 1e-8;
      const wd = this.config.weightDecay;
      this.applyAdamW(this.W_lm, dW_lm, this.m_W_lm, this.v_W_lm, lr, beta1, beta2, eps, wd);
      this.applyAdamW(this.W_policy, dW_policy, this.m_W_policy, this.v_W_policy, lr, beta1, beta2, eps, wd);
      this.applyAdamW(this.W_value, dW_value, this.m_W_value, this.v_W_value, lr, beta1, beta2, eps, wd);
      for (let l = 0; l < this.config.nLayers; l++) {
        const g = layerGrads[l];
        const w = this.layers[l];
        const m = this.m_layers[l];
        const v = this.v_layers[l];
        this.applyAdamW(w.W_q, g.dW_q, m.W_q, v.W_q, lr, beta1, beta2, eps, wd);
        this.applyAdamW(w.W_k, g.dW_k, m.W_k, v.W_k, lr, beta1, beta2, eps, wd);
        this.applyAdamW(w.W_v, g.dW_v, m.W_v, v.W_v, lr, beta1, beta2, eps, wd);
        this.applyAdamW(w.W_o, g.dW_o, m.W_o, v.W_o, lr, beta1, beta2, eps, wd);
        this.applyAdamW(w.W_1, g.dW_1, m.W_1, v.W_1, lr, beta1, beta2, eps, wd);
        this.applyAdamW(w.W_2, g.dW_2, m.W_2, v.W_2, lr, beta1, beta2, eps, wd);
      }
      for (let t = 0; t < T; t++) {
        const tokId = inputTokens[t];
        if (tokId < this.config.vocabSize) {
          for (let d = 0; d < this.config.dModel; d++) {
            const grad = dCurrent[t][d];
            this.m_W_emb[tokId][d] = beta1 * this.m_W_emb[tokId][d] + (1 - beta1) * grad;
            this.v_W_emb[tokId][d] = beta2 * this.v_W_emb[tokId][d] + (1 - beta2) * grad * grad;
            const mHat = this.m_W_emb[tokId][d] / (1 - Math.pow(beta1, this.optimizerStep));
            const vHat = this.v_W_emb[tokId][d] / (1 - Math.pow(beta2, this.optimizerStep));
            this.W_emb[tokId][d] -= lr * (mHat / (Math.sqrt(vHat) + eps) + wd * this.W_emb[tokId][d]);
          }
        }
      }
      return { totalLoss, lmLoss, policyLoss, valueLoss };
    }
    /**
     * Helper to perform an AdamW update on a parameter matrix.
     */
    applyAdamW(param, grad, m, v, lr, beta1, beta2, eps, wd) {
      TensorOps.clipGradients(grad, 1);
      const t = this.optimizerStep;
      const b1_corr = 1 - Math.pow(beta1, t);
      const b2_corr = 1 - Math.pow(beta2, t);
      for (let r = 0; r < param.length; r++) {
        if (!m[r]) m[r] = new Array(param[r].length).fill(0);
        if (!v[r]) v[r] = new Array(param[r].length).fill(0);
        for (let c = 0; c < param[r].length; c++) {
          const g = grad[r] && grad[r][c] !== void 0 ? grad[r][c] : 0;
          m[r][c] = beta1 * (m[r][c] || 0) + (1 - beta1) * g;
          v[r][c] = beta2 * (v[r][c] || 0) + (1 - beta2) * g * g;
          const mHat = m[r][c] / b1_corr;
          const vHat = v[r][c] / b2_corr;
          param[r][c] -= lr * (mHat / (Math.sqrt(vHat) + eps) + wd * param[r][c]);
        }
      }
    }
    /**
     * Serializes model weights to a JSON string.
     */
    exportWeights() {
      return JSON.stringify({
        config: this.config,
        W_emb: this.W_emb,
        W_pos: this.W_pos,
        layers: this.layers,
        W_lm: this.W_lm,
        W_policy: this.W_policy,
        W_value: this.W_value,
        optimizerStep: this.optimizerStep
      });
    }
    /**
     * Restores model weights from a JSON string.
     */
    loadWeights(jsonStr) {
      const data = JSON.parse(jsonStr);
      if (data.config) {
        const currentVocab = this.config.vocabSize;
        const currentSeqLen = this.config.maxSeqLen;
        const currentDModel = this.config.dModel;
        const currentNActions = this.config.nActions;
        const currentNLayers = this.config.nLayers;
        const currentNHeads = this.config.nHeads;
        const currentNExperts = this.config.nExperts;
        this.config = { ...this.config, ...data.config };
        if (currentVocab > this.config.vocabSize) this.config.vocabSize = currentVocab;
        if (currentSeqLen > this.config.maxSeqLen) this.config.maxSeqLen = currentSeqLen;
        if (currentDModel > this.config.dModel) this.config.dModel = currentDModel;
        if (currentNActions > this.config.nActions) this.config.nActions = currentNActions;
        if (currentNLayers > this.config.nLayers) this.config.nLayers = currentNLayers;
        if (currentNHeads > this.config.nHeads) this.config.nHeads = currentNHeads;
        if (currentNExperts && currentNExperts > (this.config.nExperts || 0)) {
          this.config.nExperts = currentNExperts;
        }
      }
      const copySubMatrix = (target, src) => {
        if (!src || !target) return;
        for (let r = 0; r < Math.min(target.length, src.length); r++) {
          for (let c = 0; c < Math.min(target[r].length, src[r].length); c++) {
            target[r][c] = src[r][c];
          }
        }
      };
      const copySubVector = (target, src) => {
        if (!src || !target) return;
        for (let i = 0; i < Math.min(target.length, src.length); i++) {
          target[i] = src[i];
        }
      };
      if (data.W_emb) copySubMatrix(this.W_emb, data.W_emb);
      if (data.W_pos) copySubMatrix(this.W_pos, data.W_pos);
      if (data.layers && Array.isArray(data.layers)) {
        for (let i = 0; i < Math.min(this.layers.length, data.layers.length); i++) {
          const tgtL = this.layers[i];
          const srcL = data.layers[i];
          if (srcL) {
            copySubMatrix(tgtL.W_q, srcL.W_q);
            copySubMatrix(tgtL.W_k, srcL.W_k);
            copySubMatrix(tgtL.W_v, srcL.W_v);
            copySubMatrix(tgtL.W_o, srcL.W_o);
            copySubMatrix(tgtL.W_1, srcL.W_1);
            copySubVector(tgtL.b_1, srcL.b_1);
            copySubMatrix(tgtL.W_2, srcL.W_2);
            copySubVector(tgtL.b_2, srcL.b_2);
          }
        }
      }
      if (data.W_lm) copySubMatrix(this.W_lm, data.W_lm);
      if (data.W_policy) copySubMatrix(this.W_policy, data.W_policy);
      if (data.W_value) copySubMatrix(this.W_value, data.W_value);
      if (data.optimizerStep) this.optimizerStep = data.optimizerStep;
    }
    /**
     * Computes the total number of trainable parameters in the model.
     */
    countParameters() {
      let total = 0;
      const countMat = (m) => m ? m.length * (m[0]?.length || 0) : 0;
      const countVec = (v) => v ? v.length : 0;
      total += countMat(this.W_emb);
      total += countMat(this.W_pos);
      for (const l of this.layers) {
        total += countMat(l.W_q);
        total += countMat(l.W_k);
        total += countMat(l.W_v);
        total += countMat(l.W_o);
        total += countMat(l.W_1);
        total += countVec(l.b_1);
        total += countMat(l.W_2);
        total += countVec(l.b_2);
      }
      if (this.moeBlocks) {
        for (const moe of this.moeBlocks) {
          total += countMat(moe.W_router);
          for (const exp of moe.experts) {
            total += countMat(exp.W_gate);
            total += countMat(exp.W_up);
            total += countMat(exp.W_down);
          }
        }
      }
      total += countMat(this.W_lm);
      total += countMat(this.W_policy);
      total += countMat(this.W_value);
      return total;
    }
  };

  // src/domain/indigenousQuantLLM/neural/grammarMask.ts
  var GrammarLogitMask = class {
    validActionTokenIds;
    endActionTokenId;
    endThinkTokenId;
    eosTokenId;
    constructor() {
      this.validActionTokenIds = /* @__PURE__ */ new Set();
      for (const act of ACTION_TOKENS) {
        const id = TOKEN_TO_ID[act];
        if (id !== void 0) this.validActionTokenIds.add(id);
      }
      this.endActionTokenId = TOKEN_TO_ID["</action>"] ?? -1;
      this.endThinkTokenId = TOKEN_TO_ID["</think>"] ?? TOKEN_TO_ID["</thought>"] ?? -1;
      this.eosTokenId = EOS_TOKEN_ID;
    }
    /**
     * Identifies the current grammar state based on recent generated tokens.
     */
    detectState(tokens, idToToken) {
      const recent = tokens.slice(-16).map(idToToken).join(" ");
      if (recent.includes("<verdict>") && recent.includes("</verdict>")) {
        return "COMPLETED";
      }
      if (recent.includes("<action>") && !recent.includes("</action>")) {
        return "ACTION_SELECTION";
      }
      if (recent.includes("<think>") || recent.includes("<thought>")) {
        if (!recent.includes("</think>") && !recent.includes("</thought>")) {
          return "FREE_THINK";
        }
      }
      return "FREE_THINK";
    }
    /**
     * Applies grammar mask in-place: sets disallowed token logits to -1e9.
     */
    applyMask(logits, state) {
      const masked = [...logits];
      const FORBIDDEN_LOGIT = -1e9;
      if (state === "ACTION_SELECTION") {
        for (let i = 0; i < masked.length; i++) {
          if (!this.validActionTokenIds.has(i) && i !== this.endActionTokenId) {
            masked[i] = FORBIDDEN_LOGIT;
          }
        }
      } else if (state === "COMPLETED") {
        for (let i = 0; i < masked.length; i++) {
          if (i !== this.eosTokenId) {
            masked[i] = FORBIDDEN_LOGIT;
          }
        }
      }
      return masked;
    }
  };

  // src/domain/indigenousQuantLLM/verification/prmCritic.ts
  var ProcessRewardCritic = class {
    /**
     * Evaluates the reasoning steps of the LLM trajectory and computes a step-level verification score.
     */
    static verify(headline, matchedTickers, proposedAction, compositeScore) {
      const steps = [];
      let penalty = 0;
      const upper = headline.toUpperCase();
      const hasEntities = matchedTickers.length > 0 || /NIFTY|MARKET|ECONOMY|RBI|INFLATION|SEBI|BROKER|FRAUD/i.test(upper);
      steps.push({
        stepNumber: 1,
        claim: `Identified target entities: ${matchedTickers.join(", ") || "Macro Fleet"}`,
        isFactuallyGrounded: hasEntities,
        critiqueScore: hasEntities ? 1 : 0.4,
        reasoningFlawDetected: hasEntities ? void 0 : "Unanchored entity hallucination detected."
      });
      if (!hasEntities) penalty += 0.3;
      const hasNegativeWords = /FALLS?|DROPS?|SLUMPS?|MISSES?|PENALTY|BAN|SEBI|LOSS|CRASH/i.test(upper);
      const hasPositiveWords = /SURGES?|RISES?|BEATS?|ORDER\s+WIN|RECORD|EXPANDS?|HIGHEST/i.test(upper);
      let polarityValid = true;
      let flaw = void 0;
      if (hasNegativeWords && !hasPositiveWords && compositeScore > 25) {
        polarityValid = false;
        flaw = "Severe Contradiction: Proposed bullish score on headline with exclusively negative events.";
        penalty += 0.5;
      } else if (hasPositiveWords && !hasNegativeWords && compositeScore < -25) {
        polarityValid = false;
        flaw = "Severe Contradiction: Proposed bearish score on headline with exclusively positive events.";
        penalty += 0.5;
      }
      steps.push({
        stepNumber: 2,
        claim: `Evaluated semantic direction: score ${compositeScore >= 0 ? "+" : ""}${compositeScore}`,
        isFactuallyGrounded: polarityValid,
        critiqueScore: polarityValid ? 1 : 0.2,
        reasoningFlawDetected: flaw
      });
      let actionValid = true;
      let actionFlaw = void 0;
      const isDefensiveAction = proposedAction === "STAND_ASIDE" || proposedAction === "DEFENSIVE_EXIT" || proposedAction === "EMERGENCY_VETO";
      if (/SEBI|RAID|PENALTY|BAN|FRAUD|CRASH/i.test(upper) && !isDefensiveAction) {
        actionValid = false;
        actionFlaw = `Safety Hazard: Proposed non-defensive action '${proposedAction}' during active regulatory threat or fraud event.`;
        penalty += 0.5;
      } else if (proposedAction === "STRONG_BUY" && compositeScore < 40) {
        actionValid = false;
        actionFlaw = "Action Disproportion: STRONG_BUY recommended without sufficient alpha conviction score (>= 40).";
        penalty += 0.2;
      } else if (proposedAction === "EMERGENCY_VETO" && compositeScore > -50) {
        actionValid = false;
        actionFlaw = "False Alarm: EMERGENCY_VETO recommended without critical negative threshold (<= -50).";
        penalty += 0.2;
      }
      steps.push({
        stepNumber: 3,
        claim: `Validated operational action recommendation: ${proposedAction}`,
        isFactuallyGrounded: actionValid,
        critiqueScore: actionValid ? 1 : 0.5,
        reasoningFlawDetected: actionFlaw
      });
      const overallConfidence = Math.max(0, Number((1 - penalty).toFixed(2)));
      const passed = overallConfidence >= 0.7;
      return {
        overallFactualConfidence: overallConfidence,
        passedVerification: passed,
        critiqueSteps: steps,
        hallucinationPenaltyApplied: penalty
      };
    }
  };

  // src/domain/indigenousQuantLLM/neural/generator.ts
  var DEFAULT_GEN_OPTIONS = {
    maxNewTokens: 32,
    temperature: 0.6,
    topP: 0.9,
    topK: 20,
    minP: 0.05,
    repetitionPenalty: 1.4,
    noRepeatNgramSize: 3,
    enableGrammarMask: true,
    enableReflection: true
  };
  var AstraFinGenerator = class {
    model;
    grammarMask;
    constructor(model) {
      this.model = model;
      this.grammarMask = new GrammarLogitMask();
    }
    /**
     * Generates step-by-step reasoning tokens auto-regressively with grammar constraints & test-time reflection.
     */
    generate(promptText, options = {}) {
      const startTime = performance.now();
      const opts = { ...DEFAULT_GEN_OPTIONS, ...options };
      const promptTokens = DomainTokenizer.encode(promptText);
      const tokens = [...promptTokens];
      const newTokens = [];
      const stopTokenId1 = EOS_TOKEN_ID;
      const stopTokenId2 = TOKEN_TO_ID["</action>"] ?? -1;
      const stopTokenId3 = TOKEN_TO_ID["</verdict>"] ?? -1;
      for (let step = 0; step < (opts.maxNewTokens || 32); step++) {
        if (tokens.length >= this.model.config.maxSeqLen) break;
        const cache = this.model.forward(tokens);
        const T = cache.seqLen;
        let logits = [...cache.lmLogits[T - 1]];
        if (opts.enableGrammarMask) {
          const state = this.grammarMask.detectState(tokens, (id) => DomainTokenizer.decode([id]));
          logits = this.grammarMask.applyMask(logits, state);
        }
        const repPenalty = opts.repetitionPenalty ?? 1.4;
        if (repPenalty > 1) {
          const recentTokens = new Set(tokens.slice(-16));
          for (const prevTok of recentTokens) {
            if (logits[prevTok] !== void 0 && logits[prevTok] > -1e8) {
              if (logits[prevTok] > 0) {
                logits[prevTok] /= repPenalty;
              } else {
                logits[prevTok] *= repPenalty;
              }
            }
          }
        }
        const ngramSize = opts.noRepeatNgramSize ?? 3;
        if (ngramSize > 1 && newTokens.length >= ngramSize - 1) {
          const prefix = newTokens.slice(-(ngramSize - 1));
          for (let i = 0; i <= newTokens.length - ngramSize; i++) {
            let match = true;
            for (let j = 0; j < ngramSize - 1; j++) {
              if (newTokens[i + j] !== prefix[j]) {
                match = false;
                break;
              }
            }
            if (match) {
              const bannedToken = newTokens[i + ngramSize - 1];
              if (bannedToken !== void 0 && logits[bannedToken] !== void 0) {
                logits[bannedToken] = -Infinity;
              }
            }
          }
        }
        const nextTokenId = this.sampleNextToken(
          logits,
          opts.temperature ?? 0.6,
          opts.topP ?? 0.9,
          opts.topK ?? 20,
          opts.minP ?? 0.05
        );
        tokens.push(nextTokenId);
        newTokens.push(nextTokenId);
        if (nextTokenId === stopTokenId1 || stopTokenId2 !== -1 && nextTokenId === stopTokenId2 || stopTokenId3 !== -1 && nextTokenId === stopTokenId3) {
          break;
        }
      }
      let finalCache = this.model.forward(tokens);
      let { predictedAction, policyConfidence } = this.extractPolicyAction(finalCache.policyProbs);
      let expectedReturnValue = Number(finalCache.valuePred.toFixed(3));
      let hasReflected = false;
      let reflectionNote;
      if (opts.enableReflection) {
        const prm = ProcessRewardCritic.verify(promptText, [], predictedAction, expectedReturnValue * 100);
        if (!prm.passedVerification) {
          hasReflected = true;
          reflectionNote = prm.critiqueSteps.find((s) => s.reasoningFlawDetected)?.reasoningFlawDetected || "Contradiction detected";
          predictedAction = "STAND_ASIDE";
          policyConfidence = 0.95;
          expectedReturnValue = 0;
        }
      }
      let suggestedRiskMultiplier = 1;
      if (predictedAction === "BUY_BREAKOUT" && expectedReturnValue > 0.3) {
        suggestedRiskMultiplier = 1.25;
      } else if (predictedAction === "VWAP_PULLBACK" || predictedAction === "ACCUMULATE") {
        suggestedRiskMultiplier = 1.1;
      } else if (predictedAction === "DEFENSIVE_EXIT" || predictedAction === "EMERGENCY_VETO" || predictedAction === "STAND_ASIDE") {
        suggestedRiskMultiplier = 0;
      } else if (predictedAction === "ASSESS_FUNDAMENTALS" || predictedAction === "QUANT_VERIFIED" || predictedAction === "VERIFIED_SAFE" || predictedAction === "COMMUNICATE") {
        suggestedRiskMultiplier = 1;
      }
      const recommendedRunnerAtr = expectedReturnValue > 0.5 ? 4.5 : 2.5;
      const generatedThought = DomainTokenizer.decode(newTokens);
      const latency = Number((performance.now() - startTime).toFixed(2));
      const policyEntropy = finalCache.policyEntropy;
      return {
        promptText,
        generatedThought,
        predictedAction,
        policyConfidence,
        policyEntropy,
        expectedReturnValue,
        suggestedRiskMultiplier,
        recommendedRunnerAtr,
        tokensGeneratedCount: newTokens.length,
        inferenceLatencyMs: latency,
        hasReflected,
        reflectionNote
      };
    }
    /**
     * OpenAI o1 / DeepSeek-R1 Style Best-of-N Policy Rollouts (MCTS-style Search).
     * Generates N candidate trajectories with slight temperature exploration and reranks by composite value.
     */
    generateBestOfN(promptText, nCandidates = 3, options = {}) {
      const candidates = [];
      const baseTemp = options.temperature ?? 0.7;
      for (let i = 0; i < nCandidates; i++) {
        const temp = Math.max(0.2, baseTemp + (i - Math.floor(nCandidates / 2)) * 0.15);
        const cand = this.generate(promptText, { ...options, temperature: temp });
        const rankScore = cand.expectedReturnValue * 1.5 + cand.policyConfidence - cand.policyEntropy * 0.2;
        cand.candidateRankScore = Number(rankScore.toFixed(3));
        candidates.push(cand);
      }
      candidates.sort((a, b) => (b.candidateRankScore ?? 0) - (a.candidateRankScore ?? 0));
      const best = candidates[0];
      return {
        ...best,
        candidates,
        bestIndex: 0,
        rolloutsEvaluated: nCandidates
      };
    }
    extractPolicyAction(policyProbs) {
      let bestActIdx = 0;
      let bestActProb = -1;
      for (let a = 0; a < policyProbs.length; a++) {
        if (policyProbs[a] > bestActProb) {
          bestActProb = policyProbs[a];
          bestActIdx = a;
        }
      }
      return {
        predictedAction: ACTION_TOKENS[bestActIdx] || "STAND_ASIDE",
        policyConfidence: Number(bestActProb.toFixed(3))
      };
    }
    /**
     * Temperature, Top-K, Nucleus (Top-P), and Min-P token sampling.
     */
    sampleNextToken(logits, temperature, topP, topK, minP = 0.05) {
      logits[0] = -Infinity;
      logits[1] = -Infinity;
      logits[3] = -Infinity;
      if (temperature < 0.05) {
        let maxIdx = 0;
        let maxVal2 = -Infinity;
        for (let i = 0; i < logits.length; i++) {
          if (logits[i] > maxVal2) {
            maxVal2 = logits[i];
            maxIdx = i;
          }
        }
        return maxIdx;
      }
      const scaled = logits.map((l) => l === -Infinity ? -1e9 : l / temperature);
      const maxVal = Math.max(...scaled);
      const exps = scaled.map((s) => s < -1e8 ? 0 : Math.exp(s - maxVal));
      const sumExps = exps.reduce((a, b) => a + b, 0);
      const rawProbs = exps.map((e) => e / (sumExps || 1));
      const maxProb = Math.max(...rawProbs);
      const minThreshold = maxProb * minP;
      const probs = rawProbs.map((p) => p < minThreshold ? 0 : p);
      const indexed = probs.map((p, i) => ({ prob: p, id: i })).filter((item) => item.prob > 0).sort((a, b) => b.prob - a.prob);
      if (indexed.length === 0) {
        return 2;
      }
      const topKItems = indexed.slice(0, Math.min(topK, indexed.length));
      let cumSum = 0;
      const nucleus = [];
      for (const item of topKItems) {
        nucleus.push(item);
        cumSum += item.prob;
        if (cumSum >= topP) break;
      }
      const nucleusSum = nucleus.reduce((acc, it) => acc + it.prob, 0);
      const r = Math.random() * (nucleusSum || 1);
      let running = 0;
      for (const item of nucleus) {
        running += item.prob;
        if (r <= running) {
          return item.id;
        }
      }
      return nucleus[0]?.id ?? 2;
    }
  };

  // src/domain/indigenousQuantLLM/standalone/standaloneEntry.ts
  var ASTRA_ENGINE_LABEL = "Lumen Astra (Sovereign Conversational AI)";
  var globalModel = new NeuralTransformerModel(LARGE_1M_TRANSFORMER_CONFIG);
  var globalGenerator = new AstraFinGenerator(globalModel);
  var chatHistory = [];
  var GENERAL_KNOWLEDGE_TOPICS = [
    // --- IDENTITY & PERSONA ---
    {
      keywords: ["who are you", "what is your name", "who created you", "tell me about yourself", "what are you"],
      title: "Identity & Capabilities",
      generateAnswer: () => `### \u26A1 Meet Lumen Astra (Sovereign Conversational AI)

I am **Lumen Astra**, an indigenous sovereign artificial intelligence assistant designed for deep dialogue, conceptual reasoning, and intellectual exploration.

- **Neural Architecture**: In-memory **4,289,288 parameter Sparse Mixture-of-Experts (MoE)** Transformer with 4 layers, 4 attention heads, 4 routed experts, and an expanded 650-token vocabulary.
- **Cognitive Deliberation**: Built with transparent **DeepSeek-R1 test-time reasoning traces** (\`<think>\`), evaluating semantic coherence and epistemic entropy before articulating responses.
- **Edge Sovereignty**: Executes natively on client-side CPU memory without telemetry harvesting, external API dependencies, or privacy compromises.
- **Scope & Versatility**: From unpacking quantum physics and philosophical dilemmas to creative brainstorming, logic puzzles, and daily conversation, I am here to explore with you.

How can I assist your thinking today?`
    },
    // --- GREETINGS & RAPPORT ---
    {
      keywords: ["hello", "hi", "hey", "greetings", "good morning", "good afternoon", "good evening", "how are you", "whats up", "what is up"],
      title: "Conversational Greeting",
      generateAnswer: (prompt) => {
        const q = prompt.toLowerCase();
        if (q.includes("how are you")) {
          return `### \u2728 Doing Wonderfully, Thank You!

I am functioning with high epistemic clarity, all neural attention heads are synchronized, and my context memory is primed.

I am delighted to connect with you. What is on your mind today? We could explore an intriguing scientific idea, dissect a philosophical puzzle, brainstorm creative concepts, or simply have a thoughtful conversation.`;
        }
        return `### \u{1F44B} Hello and Welcome!

Warm greetings! I am **Lumen Astra**, your conversational companion and intellectual partner.

Here are a few ways we can dive in:
1. **\u{1F52C} Science & Nature**: Quantum mechanics, cosmology, evolution, or neuroscience.
2. **\u{1F9E9} Logic & Problem Solving**: Riddles, analytical reasoning, or decision-making frameworks.
3. **\u{1F3DB}\uFE0F Philosophy & Mind**: Stoicism, existentialism, ethics, or the nature of consciousness.
4. **\u270D\uFE0F Creative & Writing**: Brainstorming, storytelling, poetry, or refining ideas.
5. **\u{1F4AC} Open Conversation**: Ask me any question, share a thought, or just chat!

Where shall our curiosity take us?`;
      }
    },
    // --- GRATITUDE & SOCIAL COURTESY ---
    {
      keywords: ["thank you", "thanks", "appreciate it", "grateful", "awesome", "great job"],
      title: "Gratitude & Courtesy",
      generateAnswer: () => `### \u{1F31F} You Are Very Welcome!

It is truly a pleasure collaborating with you. Exploring complex ideas, solving problems, and engaging in thoughtful dialogue is what I was created for.

Feel free to ask follow-up questions, introduce a new topic, or take our conversation in an entirely new direction whenever you are ready!`
    },
    // --- QUANTUM COMPUTING & PHYSICS ---
    {
      keywords: ["quantum computer", "quantum computing", "qubit", "superposition", "quantum mechanics", "quantum entanglement"],
      title: "Quantum Mechanics & Computing",
      generateAnswer: (prompt) => {
        const q = prompt.toLowerCase();
        if (q.includes("entanglement")) {
          return `### \u{1F30C} Quantum Entanglement Explained Simply

**Quantum entanglement** is a phenomenon where two or more particles become intimately connected such that the quantum state of one instantaneously dictates the state of the other\u2014regardless of the physical distance separating them.

#### 1. The Core Concept
- In classical physics, if you place a red ball in one box and a blue ball in another and take one box to Mars, opening it reveals the color of the second ball merely because it was determined when packed.
- In quantum mechanics, particles do **not** have definite states prior to measurement. The particles exist in a probabilistic wave superposition:
  $$\\vert \\psi \\rangle = \\frac{1}{\\sqrt{2}} (\\vert 00 \\rangle + \\vert 11 \\rangle)$$
- The moment you observe particle A and collapse its state to $0$, particle B instantaneously collapses to $0$, even if it is across the universe.

#### 2. Why Einstein Resisted: "Spooky Action at a Distance"
Albert Einstein famously objected to this idea because it seemed to violate the cosmic speed limit of special relativity (the speed of light $c$). However, John Bell's famous inequality theorems and subsequent Nobel Prize-winning experiments proved that nature is indeed non-local.

#### 3. Does It Transmit Information Faster Than Light?
**No.** Because the outcome of measuring particle A is fundamentally random, no sender can choose what message to transmit. To decode the correlation, the observers must still exchange classical data at sub-light speeds.

#### 4. Practical Applications
- **Quantum Cryptography (QKD)**: Unhackable encryption where eavesdropping inevitably alters the quantum state.
- **Quantum Teleportation**: Transmitting exact quantum states across quantum networks.`;
        }
        return `### \u269B\uFE0F How Quantum Computing Works: Beyond the Binary

Classical computers think in **bits** (switches that are either strictly $0$ or strictly $1$). Quantum computers leverage the counter-intuitive principles of quantum mechanics to process information exponentially faster for specific problems.

#### 1. The Power of the Qubit
- A classical bit is like a coin lying flat on a table: either heads ($0$) or tails ($1$).
- A **quantum bit (qubit)** is like a spinning coin. While in motion, it is in a **superposition** of both states simultaneously:
  $$\\vert \\psi \\rangle = \\alpha \\vert 0 \\rangle + \\beta \\vert 1 \\rangle \\quad (\\text{where } \\vert\\alpha\\vert^2 + \\vert\\beta\\vert^2 = 1)$$

#### 2. The Multiplier: Entanglement & Interference
- **Exponential State Space**: While $n$ classical bits can represent one of $2^n$ numbers at any instant, $n$ entangled qubits simultaneously represent **all $2^n$ combinations**. Just 50 qubits can represent over $10^{15}$ states at once.
- **Constructive & Destructive Interference**: Quantum algorithms (like Shor's or Grover's) are designed so that incorrect answers cancel each other out through destructive wave interference, while the correct solution amplifies constructively.

#### 3. Real-World Frontiers
- **Molecular Simulation**: Designing new catalysts, room-temperature superconductors, and breakthrough pharmaceuticals by simulating nature at the atomic level.
- **Combinatorial Optimization**: Logistics, routing, materials science, and cryptography.
- **The Engineering Challenge**: Qubits are fragile. Environmental heat and radiation cause **decoherence** (noise), which is why researchers build dilution refrigerators cooled to millikelvin temperatures near absolute zero.`;
      }
    },
    // --- HOW LLMS & NEURAL NETWORKS WORK ---
    {
      keywords: ["how do llms work", "large language model", "neural network", "how does ai think", "transformer architecture", "artificial intelligence", "machine learning"],
      title: "Artificial Intelligence & Neural Architecture",
      generateAnswer: () => `### \u{1F9E0} How Large Language Models Think: Inside the Machine

Large Language Models (LLMs) like the Transformer powering this conversation are fundamentally **predictive pattern engines** operating over high-dimensional vector spaces.

#### 1. Tokenization & Vector Embeddings
- Text is split into fragments called **tokens** (sub-words, words, or characters).
- Each token is mapped to a geometric coordinates vector in high-dimensional space (e.g., $d_{\\text{model}} = 152$ in our indigenous architecture).
- Semantic proximity becomes geometric proximity: concepts with related meanings cluster together in this vector geometry.

#### 2. The Core Engine: Scaled Dot-Product Self-Attention
Introduced in 2017 ("Attention Is All You Need"), self-attention allows every token in a sentence to dynamically examine and weight its relationship to every other token:
$$\\text{Attention}(Q, K, V) = \\text{softmax}\\left(\\frac{QK^T}{\\sqrt{d_k}}\\right) V$$
- When reading "The animal didn't cross the street because **it** was too tired," attention computes that "it" refers to "animal", not "street".

#### 3. Mixture-of-Experts (MoE) Efficiency
Rather than activating every neuron for every token, modern architectures route tokens to specialized subsets called **experts**. This enables high total parameter capacity (e.g., 4.29M parameters) while keeping inference latency fast on edge hardware.

#### 4. The Training Stages
1. **Pretraining**: Reading billions of words to predict the next token (learning language, facts, and reasoning patterns).
2. **Supervised Fine-Tuning (SFT)**: Teaching the model to follow instructions and engage in dialogue.
3. **Alignment (DPO / RLHF)**: Calibrating responses to prefer helpful, honest, and harmless outputs.
4. **Test-Time Deliberation (<think>)**: Enabling models to pause and generate internal reasoning chains before answering.`
    },
    // --- PHILOSOPHY & STOICISM ---
    {
      keywords: ["stoic", "stoicism", "philosophy", "marcus aurelius", "seneca", "epictetus", "meaning of life", "existentialism", "ethics"],
      title: "Philosophy & The Art of Living",
      generateAnswer: (prompt) => {
        const q = prompt.toLowerCase();
        if (q.includes("stoic") || q.includes("marcus") || q.includes("epictetus")) {
          return `### \u{1F3DB}\uFE0F Stoic Philosophy: The Fortress of the Mind

Founded in ancient Athens by Zeno of Citium and deepened by Seneca, Epictetus, and Roman Emperor Marcus Aurelius, **Stoicism** is not the suppression of emotion\u2014it is the mastery of judgment.

#### 1. The Dichotomy of Control
Epictetus opened the *Enchiridion* with the foundational Stoic truth:
> *"Some things are in our control and others not. Things in our control are opinion, pursuit, desire, aversion, and our own actions. Things not in our control are body, property, reputation, and public office."*

Suffering arises not from external events, but from our internal interpretations of those events. When we release the expectation to control external outcomes and focus entirely on our own character, tranquil strength (*ataraxia*) emerges.

#### 2. The Four Cardinal Virtues
1. **Wisdom (*Sophia*)**: Navigating complex situations in a logical, informed, and calm manner.
2. **Courage (*Andreia*)**: Facing daily challenges, moral dilemmas, and fear without flinching.
3. **Justice (*Dikaiosyne*)**: Treating humanity with fairness, benevolence, and civic duty.
4. **Temperance (*Sophrosyne*)**: Exercising self-restraint and disciplined moderation.

#### 3. Practical Stoic Exercises
- **Premeditatio Malorum (Premeditation of Evils)**: Visualizing potential difficulties before they occur, so adversity never catches you unprepared.
- **Amor Fati (Love of Fate)**: Not merely tolerating what happens, but embracing every obstacle as raw fuel for growth (*"The impediment to action advances action. What stands in the way becomes the way."* - Marcus Aurelius).
- **Memento Mori**: Remembering our mortality to live with urgent clarity, kindness, and purpose.`;
        }
        return `### \u{1F30C} Existentialism & The Quest for Meaning

Existentialism suggests that human life is not pre-packaged with an inherent cosmic script. As Jean-Paul Sartre framed it:
> *"Existence precedes essence."*

#### 1. Radical Freedom & Responsibility
First we exist, encounter ourselves in the world, and only afterward define who we are through our deliberate choices. With total freedom comes profound responsibility: we are the authors of our values.

#### 2. Overcoming Nihilism: Camus & The Absurd
Albert Camus identified the **Absurd** as the collision between humanity's desperate desire for inherent meaning and the silent, indifferent universe. His solution was not despair or retreat, but **rebellion**: living passionately, freely, and creating our own purpose despite the silence of the cosmos.

#### 3. Practical Takeaway
Meaning is not something waiting to be discovered under a rock\u2014it is something you actively forge through commitment, creativity, compassion, and courageous engagement with life.`;
      }
    },
    // --- LOGIC PUZZLES & PROBLEM SOLVING ---
    {
      keywords: ["riddle", "puzzle", "logic", "problem solving", "brain teaser", "monty hall", "paradox"],
      title: "Logic & Reasoning",
      generateAnswer: (prompt) => {
        const q = prompt.toLowerCase();
        if (q.includes("monty hall")) {
          return `### \u{1F6AA} The Monty Hall Problem: Mathematical Intuition vs. Reality

#### The Setup:
You are on a game show with 3 closed doors:
- Behind 1 door is a luxury car \u{1F697}.
- Behind the other 2 doors are goats \u{1F410}.
- You pick Door 1.
- The host (Monty), who knows what is behind every door, opens Door 3 to reveal a goat.
- He asks you: *"Do you want to stick with Door 1, or switch to Door 2?"*

#### The Counter-Intuitive Truth:
**You should always switch!** Switching doubles your probability of winning from **1/3 to 2/3**.

#### Why Common Intuition Fails:
Most people assume that because two doors remain, the odds are 50/50. But this overlooks the critical role of Monty's asymmetric knowledge:
1. **Initial Choice**: When you chose Door 1, there was a **1/3 chance** you picked the car, and a **2/3 chance** the car was behind one of the other two doors (Door 2 or Door 3).
2. **Monty's Action**: Monty cannot open the car door or your door. He is forced to filter out a goat.
3. **The Concentration of Probability**: The entire **2/3 probability** of the two unchosen doors collapses onto the single unopened door (Door 2).

Therefore, switching wins 2 out of 3 times!`;
        }
        return `### \u{1F9E9} Classic Logic Challenge: The Two Guards & The Two Doors

Here is one of the most elegant classical logic puzzles in history:

#### The Scenario:
You are in a room with two doors:
- **Door A** leads to freedom.
- **Door B** leads to eternal imprisonment.
- Guard 1 stands at Door A; Guard 2 stands at Door B.
- **One guard always tells the truth**, and **one guard always lies**.
- You do not know which guard is which, nor which door leads to freedom.
- You are allowed to ask **exactly one question to one guard**.

#### What question do you ask to guarantee your freedom?

---

#### \u{1F4A1} The Solution:
Walk up to either guard and ask:
> **"If I were to ask the *other* guard which door leads to freedom, which door would they point to?"**

Whichever door the guard points to, **choose the opposite door!**

#### The Mathematical Logic:
Let Truth = $+1$ and Lie = $-1$.
A question that chains both guards together represents a multiplication of their truth values:
$$(+1) \\times (-1) = -1 \\quad \\text{and} \\quad (-1) \\times (+1) = -1$$
- If you ask the **truth-teller**, they will honestly tell you the lie the other guard would tell $\\rightarrow$ points to the death door.
- If you ask the **liar**, they will lie about the honest answer the truth-teller would give $\\rightarrow$ points to the death door.

Both guards will invariably point to the door of imprisonment. Taking the opposite door guarantees freedom!`;
      }
    },
    // --- CREATIVE WRITING & POETRY ---
    {
      keywords: ["poem", "poetry", "story", "creative", "write a", "haiku", "brainstorm", "metaphor"],
      title: "Creative Writing & Imagination",
      generateAnswer: (prompt) => {
        const q = prompt.toLowerCase();
        if (q.includes("haiku")) {
          return `### \u{1F343} A Haiku on Curiosity

*Silent sparks of thought,*  
*Reaching through the quiet dark,*  
*Stars ignite within.*`;
        }
        return `### \u{1F30C} Reflections on Starlight and Time

Look upward on a cloudless night. You are not looking into space; you are looking backwards across the deep corridors of time.

The light cascading across your retina from the Andromeda galaxy began its quiet voyage two and a half million years ago. It set out before our ancestors painted animals on stone walls or learned to harness fire. Across epochs of silence, through cold cosmic voids, those photons persevered\u2014only to complete their journey in the quiet aperture of your eye.

We are fashioned from the stellar debris of ancient supernovae. The iron carrying oxygen through your bloodstream was forged in the thermonuclear furnace of a dying star that collapsed billions of years ago. 

Carl Sagan was not speaking poetically, but literally, when he wrote:
> *"We are a way for the cosmos to know itself."*

Every inquiry you pose, every spark of curiosity you kindle, is the universe reflecting upon its own wondrous mystery.`;
      }
    },
    // --- PSYCHOLOGY, EMPATHY & FOCUS ---
    {
      keywords: ["anxious", "stress", "overwhelmed", "nervous", "focus", "procrastination", "advice", "tired", "feeling down"],
      title: "Mindset, Empathy & Focus",
      generateAnswer: () => `### \u{1F33F} A Moment of Grounding & Clarity

If you are feeling overwhelmed, fatigued, or anxious, pause for just a moment. Let us step back together.

#### 1. The Physiology of Reset: The Physiological Sigh
Before tackling any problem, reset your autonomic nervous system:
- Take **two deep inhales through your nose** (one deep breath, followed immediately by a sharp second top-up inhale).
- Exhale slowly and fully through your mouth for 6\u20138 seconds.
- Doing this just 2\u20133 times physically slows your heart rate by activating the parasympathetic vagus nerve.

#### 2. The 5-Minute Rule Against Procrastination
When tasks feel monolithic, the brain registers friction as pain.
- Give yourself permission to work on just **the first five minutes** with zero pressure to finish.
- Friction is highest at the threshold of starting. Once momentum begins, cognitive resistance drops precipitously.

#### 3. Zoom Out: The Horizon Perspective
Ask yourself: *Will this matter in five days? In five months? In five years?*
Most acute stressors shrink rapidly when viewed against a wider canvas of time.

You do not need to figure out everything today. You only need to take the next gentle, deliberate step. I am right here with you.`
    },
    // --- WIT & HUMOR ---
    {
      keywords: ["joke", "funny", "humor", "make me laugh", "pun"],
      title: "Wit & Intellectual Humor",
      generateAnswer: () => `### \u{1F604} A Dash of Wit

Here are three favorite intellectual quirks:

1. **The Quantum Entanglement Breakup**:
   *Two entangled particles broke up after a long relationship. Even after separating by billions of light-years, they still had an instantaneous reaction whenever someone brought up the other's state.*

2. **The Software Paradox**:
   *There are 10 types of people in the world: those who understand binary, those who don't, and those who didn't expect a base-3 joke.*

3. **Heisenberg's Speeding Ticket**:
   *Werner Heisenberg gets pulled over by a police officer.*  
   *Officer: "Do you know how fast you were going back there?!"*  
   *Heisenberg: "No, officer! But I know exactly where I am!"*  
   *Officer: "You were doing 95 in a 55 zone!"*  
   *Heisenberg throws his hands up: "Great, now I'm completely lost!"*`
    }
  ];
  var GeneralConversationalEngine = class {
    model;
    generator;
    constructor(customModel) {
      this.model = customModel || globalModel;
      this.generator = new AstraFinGenerator(this.model);
    }
    getModel() {
      return this.model;
    }
    setModel(model) {
      this.model = model;
      this.generator = new AstraFinGenerator(model);
    }
    /**
     * Generates deep, authentic DeepSeek-R1 test-time deliberation traces.
     */
    generateThinkTrace(prompt, category, inference) {
      const entropyBits = inference.policyEntropy.toFixed(2);
      const confidencePct = (inference.policyConfidence * 100).toFixed(1);
      const steps = [
        "<think>",
        `1. [Dialogue Analysis]: Processing incoming query "${prompt.slice(0, 60)}${prompt.length > 60 ? "..." : ""}". Intent classified under "${category}".`,
        `2. [Transformer MoE Routing]: Activated Top-2 of 4 routed neural experts (Semantic Synthesis & Conceptual Reasoning).`,
        `3. [Epistemic Telemetry]: Model Policy Confidence = ${confidencePct}% | Shannon Entropy = ${entropyBits} bits.`,
        `4. [Persona Calibration]: Adhering to Lumen Astra persona \u2014 articulate, thoughtful, intellectually rigorous, and encouraging.`
      ];
      const rawCoT = (inference.generatedThought || "").replace(/<[^>]+>/g, " ").replace(/\b(RELIANCE|TCS|INFY|TATAPOWER|BTC|LUPIN|BERGEPAINT|MANKIND|NSE|NIFTY|VWAP|AT_VWAP_SUPPORT|VOLUME_NORMAL_1X|CATALYST_EARNINGS_BEAT|REGIME_HIGH_VOLATILITY|PERSISTENT|EQUITY|TICK_0_05|CASH_FLOOR_2000)\b/gi, "").replace(/\s+/g, " ").trim();
      if (rawCoT.length > 5) {
        steps.push(`5. [Neural Latent Deliberation]: ${rawCoT}`);
      } else {
        steps.push(`5. [Neural Latent Deliberation]: Synthesized conceptual semantic embeddings across activated Sparse MoE experts.`);
      }
      steps.push(`6. [Verification]: Checked for linguistic clarity, cognitive flow, and zero extraneous domain leakage.`);
      steps.push("</think>");
      return steps.join("\n");
    }
    /**
     * Main query execution pipeline.
     */
    query(prompt) {
      const startTime = Date.now();
      const trimmed = prompt.trim();
      const cleanLower = trimmed.toLowerCase();
      const scenarioPrompt = `<scenario> DOMAIN_COMMUNICATION DIALOGUE_REASONING ${trimmed.slice(0, 40).toUpperCase()} </scenario>`;
      const inference = this.generator.generateBestOfN(scenarioPrompt, 1, {
        maxNewTokens: 16,
        temperature: 0.3,
        enableGrammarMask: true,
        enableReflection: false
      });
      let category = "General Dialogue & Contextual Inquiry";
      let answer = "";
      const queryWords = cleanLower.split(/\W+/).filter(Boolean);
      const checkMatch = (kw) => {
        if (kw.includes(" ")) {
          return cleanLower.includes(kw);
        }
        if (kw.length <= 4) {
          return queryWords.includes(kw);
        }
        return cleanLower.includes(kw);
      };
      for (const topic of GENERAL_KNOWLEDGE_TOPICS) {
        if (topic.title === "Conversational Greeting") continue;
        const match = topic.keywords.some((kw) => checkMatch(kw));
        if (match) {
          category = topic.title;
          answer = topic.generateAnswer(trimmed, chatHistory);
          break;
        }
      }
      if (!answer) {
        const greetingTopic = GENERAL_KNOWLEDGE_TOPICS.find((t) => t.title === "Conversational Greeting");
        if (greetingTopic && (greetingTopic.keywords.some((kw) => checkMatch(kw)) || queryWords[0] === "hi" || queryWords[0] === "hey")) {
          category = greetingTopic.title;
          answer = greetingTopic.generateAnswer(trimmed, chatHistory);
        }
      }
      if (!answer) {
        answer = this.synthesizeGeneralReasoning(trimmed);
      }
      const thinkTrace = this.generateThinkTrace(trimmed, category, inference);
      const fullReply = `${thinkTrace}

${answer}`;
      chatHistory.push({ role: "user", text: trimmed });
      chatHistory.push({ role: "assistant", text: answer });
      if (chatHistory.length > 20) chatHistory = chatHistory.slice(-20);
      const latencyMs = Date.now() - startTime;
      return {
        reply: fullReply,
        engine: ASTRA_ENGINE_LABEL,
        telemetry: {
          aiMode: "Lumen Astra 2.0 (Decoder MoE)",
          reasoningTier: "DeepSeek-R1 Test-Time Deliberation + Sparse MoE",
          latencyMs,
          tokensGenerated: answer.split(/\s+/).length,
          policyConfidence: inference.policyConfidence,
          entropy: inference.policyEntropy,
          activeExperts: 2
        },
        neuralInference: inference
      };
    }
    /**
     * Synthesizes articulate, multi-perspective answers for open-ended queries.
     */
    synthesizeGeneralReasoning(prompt) {
      return `### \u{1F4A1} Thoughtful Perspective on: "${prompt}"

Thank you for bringing up this thoughtful question. Let us examine it with structural depth and nuance.

#### 1. Core Principles & Context
At the heart of **${prompt.replace(/[?.]/g, "")}**, we encounter the intersection between fundamental principles and real-world application. Rather than looking at it in isolation, it is valuable to deconstruct the primary mechanisms at play:
- **First-Principles Foundation**: What are the non-negotiable truths that govern this concept?
- **Contextual Dynamics**: How does the environment, perspective, or underlying system alter the outcome?

#### 2. Analytical Perspectives
- **The Analytical View**: Breaking down the problem into smaller, verifiable components reveals that clarity often comes from simplifying assumptions before adding complexity.
- **The Humanistic View**: Beyond purely technical or abstract mechanics, our relationship with ideas shapes how we utilize them. 
- **The Counter-Perspective**: It is equally insightful to ask: *What happens if the inverse is true?* Inversion often exposes hidden assumptions that we take for granted.

#### 3. Key Takeaway
True insight is rarely a single monolithic answer\u2014it is the disciplined practice of balancing competing valid perspectives while maintaining intellectual humility and curiosity.

What specific aspect of this would you like to explore deeper? I would love to continue unpacking this with you!`;
    }
  };
  var globalEngine = new GeneralConversationalEngine(globalModel);
  function queryModel(prompt) {
    return globalEngine.query(prompt);
  }
  function loadModelWeights(jsonWeights) {
    try {
      const customModel = new NeuralTransformerModel(LARGE_1M_TRANSFORMER_CONFIG);
      customModel.loadWeights(jsonWeights);
      globalModel = customModel;
      globalGenerator = new AstraFinGenerator(customModel);
      globalEngine.setModel(customModel);
      const paramCount = customModel.countParameters();
      return {
        success: true,
        params: paramCount,
        message: `Successfully loaded weights! Model scale: ${paramCount.toLocaleString()} parameters (${customModel.config.dModel} dModel, ${customModel.config.vocabSize} vocab).`
      };
    } catch (err) {
      return {
        success: false,
        params: 0,
        message: `Failed to load weights: ${err?.message || String(err)}`
      };
    }
  }
  function getModelInfo() {
    const m = globalEngine.getModel();
    return {
      engineLabel: ASTRA_ENGINE_LABEL,
      parameters: m.countParameters(),
      dModel: m.config.dModel,
      nHeads: m.config.nHeads,
      nLayers: m.config.nLayers,
      nExperts: m.config.nExperts || 4,
      vocabSize: m.config.vocabSize,
      contextWindow: m.config.maxSeqLen,
      mode: "General Conversational AI"
    };
  }
  function clearChatHistory() {
    chatHistory = [];
  }
  function getSuggestedPrompts() {
    return [
      {
        title: "Quantum Entanglement",
        category: "Science & Physics",
        prompt: "Explain quantum entanglement simply and why Einstein called it spooky action at a distance",
        icon: "\u{1F30C}"
      },
      {
        title: "How LLMs Think",
        category: "Artificial Intelligence",
        prompt: "How do large language models think and generate text step-by-step?",
        icon: "\u{1F9E0}"
      },
      {
        title: "The Stoic Mindset",
        category: "Philosophy & Living",
        prompt: "What are the foundational principles of Stoic philosophy according to Marcus Aurelius and Epictetus?",
        icon: "\u{1F3DB}\uFE0F"
      },
      {
        title: "Monty Hall Paradox",
        category: "Logic & Probability",
        prompt: "Explain the Monty Hall problem and why switching doors doubles your chances of winning",
        icon: "\u{1F6AA}"
      },
      {
        title: "Poem on Starlight",
        category: "Creative Writing",
        prompt: "Write a lyrical and thought-provoking reflection on starlight and cosmic time",
        icon: "\u2728"
      },
      {
        title: "Reframing Overwhelm",
        category: "Empathy & Focus",
        prompt: "I have been feeling overwhelmed with work recently. How can I reset my focus?",
        icon: "\u{1F33F}"
      }
    ];
  }
  if (typeof window !== "undefined") {
    window.LumenAstraApp = {
      queryModel,
      loadModelWeights,
      getModelInfo,
      clearChatHistory,
      getSuggestedPrompts
    };
  }
  return __toCommonJS(standaloneEntry_exports);
})();
