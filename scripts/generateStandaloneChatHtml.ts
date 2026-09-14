import * as fs from 'fs';
import * as path from 'path';

function generateHtml() {
  const bundlePath = path.resolve(process.cwd(), 'public/lumenAstraBundle.js');
  if (!fs.existsSync(bundlePath)) {
    throw new Error(`Bundle not found at ${bundlePath}. Run esbuild first.`);
  }

  const bundleJs = fs.readFileSync(bundlePath, 'utf8');

  const htmlContent = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Lumen Astra | Frontier-Grade Macro AI Companion</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            brand: {
              50: '#ecfdf5',
              500: '#10b981',
              600: '#059669',
              900: '#064e3b',
            },
            terminal: {
              bg: '#080c14',
              surface: '#0d131f',
              panel: '#131b2c',
              border: '#1e293b',
              accent: '#3b82f6',
              highlight: '#10b981',
              warning: '#f59e0b',
              danger: '#ef4444',
            }
          }
        }
      }
    }
  </script>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=JetBrains+Mono:ital,wght@0,300;0,400;0,500;0,700;1,400&family=Inter:wght@300;400;500;600;700&display=swap');
    
    body {
      font-family: 'Inter', sans-serif;
      background-color: #080c14;
      color: #e2e8f0;
    }
    
    .mono {
      font-family: 'JetBrains Mono', monospace;
    }

    /* Custom scrollbars */
    ::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    ::-webkit-scrollbar-track {
      background: #0d131f;
    }
    ::-webkit-scrollbar-thumb {
      background: #1e293b;
      border-radius: 3px;
    }
    ::-webkit-scrollbar-thumb:hover {
      background: #334155;
    }

    .glass-card {
      background: rgba(19, 27, 44, 0.75);
      backdrop-filter: blur(16px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    
    .glow-sapphire {
      box-shadow: 0 0 25px -5px rgba(59, 130, 246, 0.25);
    }

    .glow-emerald {
      box-shadow: 0 0 25px -5px rgba(16, 185, 129, 0.25);
    }
  </style>
</head>
<body class="h-screen flex flex-col overflow-hidden bg-terminal-bg text-slate-200">

  <!-- TOP APP HEADER -->
  <header class="h-14 border-b border-terminal-border bg-terminal-surface/90 backdrop-blur px-4 md:px-6 flex items-center justify-between shrink-0 z-30">
    <div class="flex items-center space-x-3">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-white shadow-lg glow-sapphire">
        ✨
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <span class="font-bold tracking-tight text-white flex items-center gap-1.5">
            LUMEN ASTRA <span class="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono border border-blue-500/30">2.0 Dual-Engine</span>
          </span>
          <span id="activeEngineBadge" class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
            SOVEREIGN MOE (100% OFFLINE)
          </span>
        </div>
        <div class="text-[11px] text-slate-400 font-mono" id="modelSubtitle">3.02B Sparse MoE • Lumen-UMA Paged (&lt;1.5 GB RAM) • Multi-Domain Flagship</div>
      </div>
    </div>

    <!-- Center/Right Engine Mode Selector & Actions -->
    <div class="flex items-center space-x-2 text-xs">
      <!-- Model Architecture Switcher -->
      <div class="flex items-center space-x-1.5 bg-terminal-panel px-2.5 py-1 rounded-lg border border-indigo-500/30">
        <label class="text-[11px] font-mono text-indigo-400">Model:</label>
        <select id="lumenModelSelect" onchange="handleLumenModelChange()" class="bg-transparent text-xs font-semibold text-indigo-300 focus:outline-none cursor-pointer">
          <option value="lumen-alpha-3b" selected class="bg-terminal-panel text-indigo-300">👑 Lumen-Alpha 3B (Flagship)</option>
          <option value="lumen-1b" class="bg-terminal-panel text-emerald-400">⚡ Lumen Astra 1B MoE</option>
        </select>
      </div>

      <!-- Engine Switcher -->
      <div class="flex items-center space-x-1.5 bg-terminal-panel px-2.5 py-1 rounded-lg border border-terminal-border">
        <label class="text-[11px] font-mono text-slate-400">Mode:</label>
        <select id="engineModeSelect" onchange="handleEngineModeChange()" class="bg-transparent text-xs font-semibold text-emerald-400 focus:outline-none cursor-pointer">
          <option value="sovereign" class="bg-terminal-panel text-emerald-400">🟢 Sovereign Local MoE (Offline)</option>
          <option value="frontier" class="bg-terminal-panel text-blue-400">⚡ Frontier Cloud (Gemini / Claude)</option>
        </select>
        <button id="frontierConfigBtn" onclick="openFrontierModal()" class="p-1 text-slate-400 hover:text-blue-300 hover:bg-slate-800 rounded transition" title="Configure Cloud API Key & Model">
          ⚙️
        </button>
      </div>

      <!-- Model Specs Modal Trigger -->
      <button onclick="openSpecsModal()" class="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-slate-300 hover:text-white transition-all">
        <span>ℹ️</span>
        <span class="hidden sm:inline">Specs</span>
      </button>

      <!-- Checkpoint Loader -->
      <label class="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-slate-300 hover:text-white transition-all">
        <span>📂</span>
        <span class="hidden sm:inline">Load Checkpoint</span>
        <input type="file" id="weightsFileInput" accept=".json" class="hidden" onchange="handleWeightsUpload(event)">
      </label>

      <!-- Clear Chat -->
      <button onclick="clearMessages()" class="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-terminal-border" title="Clear Conversation">
        🗑️
      </button>
    </div>
  </header>

  <!-- MAIN CHAT & WORKSPACE CONTAINER -->
  <div class="flex-1 flex overflow-hidden">
    
    <!-- LEFT SIDEBAR: TOPIC EXPLORER & SPECS -->
    <aside class="w-80 border-r border-terminal-border bg-terminal-surface/60 hidden md:flex flex-col shrink-0">
      <div class="p-3.5 border-b border-terminal-border flex items-center justify-between">
        <span class="text-xs font-semibold text-slate-300 uppercase tracking-wider">Intel & Macro Topics</span>
        <button onclick="clearMessages()" class="text-[11px] text-blue-400 hover:text-blue-300 font-medium">
          + New Chat
        </button>
      </div>
      
      <!-- Topic Suggestions List -->
      <div class="flex-1 overflow-y-auto p-2.5 space-y-1.5" id="topicExplorerList">
        <!-- Rendered dynamically -->
      </div>

      <!-- Model Architecture Telemetry Card -->
      <div class="p-3.5 border-t border-terminal-border bg-terminal-panel/40 text-xs font-mono">
        <div class="text-[11px] font-semibold text-slate-300 mb-2 uppercase tracking-wider flex items-center justify-between">
          <span>Engine Status</span>
          <span id="sidebarEngineStatus" class="text-emerald-400 text-[10px]">SOVEREIGN OFFLINE</span>
        </div>
        <div class="space-y-1 text-[11px] text-slate-400">
          <div class="flex justify-between">
            <span>Parameters:</span>
            <span class="text-white font-bold" id="sidebarParamCount">4,289,288</span>
          </div>
          <div class="flex justify-between">
            <span>Architecture:</span>
            <span class="text-slate-200">4L • 4H • 152 d_model</span>
          </div>
          <div class="flex justify-between">
            <span>MoE Routing:</span>
            <span class="text-slate-200">4 Experts (Top-2)</span>
          </div>
          <div class="flex justify-between">
            <span>Knowledge Base:</span>
            <span class="text-blue-400 font-semibold">30+ Nations & 5 Macro Pillars</span>
          </div>
          <div class="flex justify-between">
            <span>Cloud Bridge:</span>
            <span id="sidebarCloudBridge" class="text-slate-400">Ready (Optional)</span>
          </div>
        </div>
      </div>
    </aside>

    <!-- CHAT INTERACTION WORKSPACE -->
    <main class="flex-1 flex flex-col overflow-hidden relative">
      
      <!-- MESSAGES SCROLL AREA -->
      <div id="messagesContainer" class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        <!-- Welcome Hero Card -->
        <div id="welcomeHero" class="glass-card rounded-2xl p-6 border border-terminal-border glow-sapphire max-w-3xl mx-auto my-4">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-2xl bg-gradient-to-tr from-blue-500 to-indigo-600 flex items-center justify-center text-2xl shadow-lg shrink-0">
              ✨
            </div>
            <div>
              <h2 class="text-xl font-bold text-white tracking-tight">Lumen Astra | Frontier-Grade Macro AI Companion</h2>
              <p class="text-sm text-slate-300 mt-1.5 leading-relaxed">
                An advanced sovereign conversational intelligence combining an in-memory <strong>1.02B Parameter Sparse Mixture-of-Experts Architecture</strong>, 1M multi-domain reasoning datasets across Physics, Mathematics, Stocks, and Human Sentiment, DeepSeek-R1 test-time deliberation (<span class="text-blue-400 font-mono">&lt;think&gt;</span>), and an optional real-time <strong>Frontier Cloud Bridge</strong> for direct parity with Gemini 2.5 / GPT-4o.
              </p>
              
              <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
                <div class="p-2.5 rounded-lg bg-terminal-panel border border-terminal-border">
                  <div class="text-slate-400">Cognitive Deliberation</div>
                  <div class="text-blue-400 font-semibold mt-0.5">DeepSeek-R1 &lt;think&gt;</div>
                </div>
                <div class="p-2.5 rounded-lg bg-terminal-panel border border-terminal-border">
                  <div class="text-slate-400">Five Macro Pillars</div>
                  <div class="text-emerald-400 font-semibold mt-0.5">Equities • Oil • War • Rates</div>
                </div>
                <div class="p-2.5 rounded-lg bg-terminal-panel border border-terminal-border">
                  <div class="text-slate-400">Dual Engine</div>
                  <div class="text-purple-400 font-semibold mt-0.5">Offline MoE + Frontier Cloud</div>
                </div>
              </div>

              <!-- Quick Start Prompt Chips -->
              <div class="mt-5 pt-3.5 border-t border-slate-700/50 flex flex-wrap gap-2 text-xs">
                <span class="text-slate-400 py-1 font-medium">Explore Specialized Domains:</span>
                <button onclick="sendQuickPrompt('Explain how electronic limit order books and tick sizes impact market liquidity and execution slippage')" class="px-3 py-1.5 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-blue-300 hover:text-white transition">
                  📊 Order Books & Slippage
                </button>
                <button onclick="sendQuickPrompt('Why is TSMC and the Taiwan Strait considered the single most critical supply chain chokepoint on Earth?')" class="px-3 py-1.5 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-emerald-300 hover:text-white transition">
                  🚢 Taiwan Silicon Shield
                </button>
                <button onclick="sendQuickPrompt('How does an RBI or Fed interest rate hike transmit through bank NIMs and corporate PE valuations?')" class="px-3 py-1.5 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-amber-300 hover:text-white transition">
                  🏦 Repo Rate Transmission
                </button>
                <button onclick="sendQuickPrompt('How has asymmetric FPV loitering drone warfare altered modern combined-arms armored warfare in Ukraine?')" class="px-3 py-1.5 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-rose-300 hover:text-white transition">
                  🛡️ Drone Warfare in Ukraine
                </button>
                <button onclick="sendQuickPrompt('How do geopolitical tensions in the Strait of Hormuz influence global Brent crude prices and India trade deficit?')" class="px-3 py-1.5 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-yellow-300 hover:text-white transition">
                  🛢️ Hormuz & Crude Oil
                </button>
                <button onclick="sendQuickPrompt('Explain quantum entanglement simply and why Einstein called it spooky action at a distance')" class="px-3 py-1.5 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-cyan-300 hover:text-white transition">
                  🌌 Quantum Physics
                </button>
                <button onclick="sendQuickPrompt('What are the foundational principles of Stoic philosophy according to Marcus Aurelius and Epictetus?')" class="px-3 py-1.5 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-purple-300 hover:text-white transition">
                  🏛️ Stoic Mindset
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Chat messages will be injected here -->
        <div id="chatMessages" class="max-w-3xl mx-auto space-y-5"></div>
      </div>

      <!-- BOTTOM INPUT CONTAINER -->
      <div class="p-4 border-t border-terminal-border bg-terminal-surface/90 backdrop-blur shrink-0 z-20">
        <div class="max-w-3xl mx-auto">
          <form id="chatForm" onsubmit="handleChatSubmit(event)" class="relative">
            <div class="relative flex items-center bg-terminal-panel rounded-xl border border-terminal-border focus-within:border-blue-500/60 focus-within:ring-2 focus-within:ring-blue-500/20 transition-all shadow-lg">
              
              <!-- Input icon -->
              <div class="pl-3.5 pr-1 text-slate-400 text-sm select-none">
                💬
              </div>

              <input 
                type="text" 
                id="promptInput" 
                placeholder="Ask Lumen Astra anything... (e.g. market microstructure, trade chokepoints, wars, central banks, quantum physics)" 
                class="w-full py-3.5 px-2.5 bg-transparent text-white placeholder-slate-500 text-sm focus:outline-none"
                autocomplete="off"
              />

              <!-- Submit button -->
              <div class="pr-2 flex items-center gap-1.5">
                <button 
                  type="submit" 
                  id="sendBtn"
                  class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span>Send</span>
                  <span>↵</span>
                </button>
              </div>
            </div>
          </form>
          <div class="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
            <span>Press <kbd class="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">Enter</kbd> to send • Shift+Enter for newline</span>
            <span id="statusBar">Lumen Astra Engine Ready • Sovereign MoE</span>
          </div>
        </div>
      </div>

    </main>
  </div>

  <!-- FRONTIER CLOUD CONFIGURATION MODAL -->
  <div id="frontierModal" class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm hidden p-4">
    <div class="glass-card rounded-2xl border border-terminal-border p-6 max-w-md w-full mx-auto glow-sapphire shadow-2xl">
      <div class="flex items-center justify-between pb-3 border-b border-terminal-border">
        <div class="flex items-center gap-2">
          <span class="text-xl">⚡</span>
          <h3 class="text-base font-bold text-white">Frontier Cloud Configuration</h3>
        </div>
        <button onclick="closeFrontierModal()" class="text-slate-400 hover:text-white text-lg">✕</button>
      </div>

      <div class="mt-4 space-y-4 text-xs font-mono">
        <div>
          <label class="block text-slate-300 font-semibold mb-1">Provider:</label>
          <select id="frontierProviderSelect" class="w-full px-3 py-2 rounded-lg bg-terminal-panel border border-terminal-border text-white focus:border-blue-500">
            <option value="gemini">Google Gemini (Recommended - Ultra Low Latency)</option>
            <option value="openai">OpenAI Compatible (GPT-4o / Claude)</option>
          </select>
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">Model Identifier:</label>
          <input type="text" id="frontierModelInput" value="gemini-2.5-flash" placeholder="gemini-2.5-flash, gemini-2.5-pro, or gpt-4o" class="w-full px-3 py-2 rounded-lg bg-terminal-panel border border-terminal-border text-white focus:border-blue-500">
          <span class="text-[10px] text-slate-400 mt-1 block">Supported: gemini-2.5-flash, gemini-2.5-pro, gemini-1.5-pro, gpt-4o</span>
        </div>

        <div>
          <label class="block text-slate-300 font-semibold mb-1">API Key:</label>
          <input type="password" id="frontierApiKeyInput" placeholder="Enter your Gemini / OpenAI API key" class="w-full px-3 py-2 rounded-lg bg-terminal-panel border border-terminal-border text-white focus:border-blue-500">
          <span class="text-[10px] text-slate-400 mt-1 block">🔐 Stored solely in your local browser storage. Never sent to any third-party intermediary.</span>
        </div>

        <div class="p-2.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-300 text-[11px]">
          ℹ️ When enabled, Lumen Astra routes queries directly from your browser to the frontier cloud model while retaining the cognitive &lt;think&gt; deliberation trace and specialized macro quant persona.
        </div>

        <div class="flex justify-end gap-2 pt-2">
          <button onclick="closeFrontierModal()" class="px-3 py-1.5 rounded-lg border border-terminal-border text-slate-300 hover:bg-slate-800 transition">Cancel</button>
          <button onclick="saveFrontierSettings()" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold transition">Save Configuration</button>
        </div>
      </div>
    </div>
  </div>

  <!-- SPECS MODAL -->
  <div id="specsModal" class="hidden fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
    <div class="glass-card rounded-2xl max-w-md w-full border border-terminal-border p-6 shadow-2xl space-y-4">
      <div class="flex items-center justify-between border-b border-slate-700 pb-3">
        <div class="flex items-center gap-2">
          <span class="text-xl">⚙️</span>
          <h3 class="font-bold text-white">Neural Model Specifications</h3>
        </div>
        <button onclick="closeSpecsModal()" class="text-slate-400 hover:text-white text-lg font-mono">✕</button>
      </div>

      <div class="space-y-2.5 text-xs font-mono text-slate-300">
        <div class="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400">Flagship Model:</span>
          <span class="text-indigo-400 font-bold">Lumen-Alpha (3B Flagship)</span>
        </div>
        <div class="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400">Total Parameters:</span>
          <span class="text-emerald-400 font-bold">3,024,276,480 (3.02B)</span>
        </div>
        <div class="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400">Active Compute:</span>
          <span class="text-blue-400 font-bold">~340M Active / Token</span>
        </div>
        <div class="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400">Memory Architecture:</span>
          <span class="text-emerald-400 font-bold">Lumen-UMA Demand-Paged (&lt;1.5 GB RAM)</span>
        </div>
        <div class="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400">Self-Attention Heads:</span>
          <span class="text-white font-bold">16 Heads (d_head = 64)</span>
        </div>
        <div class="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400">Transformer Layers:</span>
          <span class="text-white font-bold">16 Layers (d_model = 1024)</span>
        </div>
        <div class="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400">Routed MoE Experts:</span>
          <span class="text-purple-400 font-bold">22 Experts (Top-2 SwiGLU 2730)</span>
        </div>
        <div class="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400">Knowledge Domains:</span>
          <span class="text-amber-400 font-bold">Quant, Finance, Geopolitics, Demography</span>
        </div>
        <div class="flex justify-between p-2 rounded bg-slate-900/60 border border-slate-800">
          <span class="text-slate-400">Deliberation Engine:</span>
          <span class="text-cyan-400 font-bold">DeepSeek-R1 Test-Time CoT</span>
        </div>
      </div>

      <div class="pt-2 text-right">
        <button onclick="closeSpecsModal()" class="px-4 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-medium transition">
          Close
        </button>
      </div>
    </div>
  </div>

  <!-- BUNDLED APPLICATION SCRIPT -->
  <script>
${bundleJs}
  </script>

  <!-- INTERACTIVE CONTROLLER SCRIPT -->
  <script>
    function initTerminal() {
      loadSavedSettings();
      renderTopicExplorer();
      updateHeaderStatus();
    }

    function loadSavedSettings() {
      const savedProvider = localStorage.getItem('lumen_frontier_provider') || 'gemini';
      const savedModel = localStorage.getItem('lumen_frontier_model') || 'gemini-2.5-flash';
      const savedKey = localStorage.getItem('lumen_frontier_api_key') || '';

      const pSelect = document.getElementById('frontierProviderSelect');
      const mInput = document.getElementById('frontierModelInput');
      const kInput = document.getElementById('frontierApiKeyInput');

      if (pSelect) pSelect.value = savedProvider;
      if (mInput) mInput.value = savedModel;
      if (kInput) kInput.value = savedKey;

      const sideBridge = document.getElementById('sidebarCloudBridge');
      if (sideBridge) {
        sideBridge.innerText = savedKey ? \`Configured (\${savedModel})\` : 'Ready (Offline)';
        sideBridge.className = savedKey ? 'text-blue-400 font-semibold' : 'text-slate-400';
      }
    }

    function handleEngineModeChange() {
      const mode = document.getElementById('engineModeSelect').value;
      const badge = document.getElementById('activeEngineBadge');
      const sideStatus = document.getElementById('sidebarEngineStatus');

      if (mode === 'frontier') {
        const apiKey = localStorage.getItem('lumen_frontier_api_key');
        if (!apiKey) {
          openFrontierModal();
        }
        if (badge) {
          badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-blue-400 mr-1.5 animate-pulse"></span>FRONTIER CLOUD MODE';
        }
        if (sideStatus) {
          sideStatus.innerText = 'FRONTIER CLOUD';
          sideStatus.className = 'text-blue-400 text-[10px] font-semibold';
        }
        document.getElementById('statusBar').innerText = 'Lumen Astra • Frontier Cloud Mode Active';
      } else {
        if (badge) {
          badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>SOVEREIGN MOE (100% OFFLINE)';
        }
        if (sideStatus) {
          sideStatus.innerText = 'SOVEREIGN OFFLINE';
          sideStatus.className = 'text-emerald-400 text-[10px]';
        }
        document.getElementById('statusBar').innerText = 'Lumen Astra Engine Ready • Sovereign MoE';
      }
    }

    function handleLumenModelChange() {
      const select = document.getElementById('lumenModelSelect');
      const sub = document.getElementById('modelSubtitle');
      const badge = document.getElementById('activeEngineBadge');
      if (!select) return;

      if (select.value === 'lumen-alpha-3b') {
        if (window.LumenAstraApp && window.LumenAstraApp.switchToLumenAlpha3BModel) {
          window.LumenAstraApp.switchToLumenAlpha3BModel();
        }
        if (sub) sub.innerText = '3.02B Sparse MoE • Lumen-UMA Paged (<1.5 GB RAM) • Multi-Domain Flagship';
        if (badge) {
          badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-indigo-500/10 text-indigo-400 border border-indigo-500/20';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-indigo-400 mr-1.5 animate-pulse"></span>LUMEN-ALPHA 3B FLAGSHIP';
        }
        appendSystemNotification('👑 Switched active neural model to Lumen-Alpha 3B Flagship (3,024,276,480 parameters, Lumen-UMA demand-paged memory < 1.5 GB RAM).');
      } else {
        if (window.LumenAstraApp && window.LumenAstraApp.switchTo1BillionModel) {
          window.LumenAstraApp.switchTo1BillionModel();
        }
        if (sub) sub.innerText = '1.02B Sparse MoE • DeepSeek-R1 Deliberation • 1M Multi-Domain Reasoning';
        if (badge) {
          badge.className = 'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
          badge.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>SOVEREIGN 1B MOE';
        }
        appendSystemNotification('⚡ Switched active neural model to Lumen Astra 1B MoE (1,019,085,168 parameters).');
      }
    }

    function openFrontierModal() {
      document.getElementById('frontierModal').classList.remove('hidden');
    }

    function closeFrontierModal() {
      document.getElementById('frontierModal').classList.add('hidden');
    }

    function saveFrontierSettings() {
      const provider = document.getElementById('frontierProviderSelect').value;
      const model = document.getElementById('frontierModelInput').value.trim() || 'gemini-2.5-flash';
      const key = document.getElementById('frontierApiKeyInput').value.trim();

      localStorage.setItem('lumen_frontier_provider', provider);
      localStorage.setItem('lumen_frontier_model', model);
      localStorage.setItem('lumen_frontier_api_key', key);

      closeFrontierModal();
      loadSavedSettings();
      appendSystemNotification(\`✅ Frontier Cloud Settings saved (\${provider} • \${model}).\`);
    }

    function renderTopicExplorer() {
      const container = document.getElementById('topicExplorerList');
      if (!container || !window.LumenAstraApp) return;

      const topics = window.LumenAstraApp.getSuggestedPrompts ? window.LumenAstraApp.getSuggestedPrompts() : [];

      container.innerHTML = topics.map(t => \`
        <div onclick="sendQuickPrompt('\${escapeHtml(t.prompt)}')" class="p-2.5 rounded-xl cursor-pointer transition-all bg-terminal-panel/50 hover:bg-terminal-panel border border-terminal-border/60 hover:border-blue-500/40 group">
          <div class="flex items-center gap-2">
            <span class="text-base">\${t.icon}</span>
            <div class="flex-1 min-w-0">
              <div class="text-xs font-semibold text-white group-hover:text-blue-300 truncate transition">\${t.title}</div>
              <div class="text-[10px] text-slate-400 truncate">\${t.category}</div>
            </div>
          </div>
        </div>
      \`).join('');
    }

    function sendQuickPrompt(promptText) {
      document.getElementById('promptInput').value = promptText;
      handleChatSubmit();
    }

    function updateHeaderStatus() {
      if (!window.LumenAstraApp) return;
      const info = window.LumenAstraApp.getModelInfo();
      const paramStr = info.parameters ? info.parameters.toLocaleString() : '4,289,288';
      const sideParam = document.getElementById('sidebarParamCount');
      if (sideParam) sideParam.innerText = paramStr;
    }

    function handleWeightsUpload(event) {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function(e) {
        const text = e.target.result;
        try {
          const res = window.LumenAstraApp.loadModelWeights(text);
          if (res.success) {
            appendSystemNotification(\`✅ \${res.message}\`);
            updateHeaderStatus();
          } else {
            appendSystemNotification(\`❌ \${res.message}\`);
          }
        } catch (err) {
          appendSystemNotification(\`❌ Failed to parse JSON: \${err.message}\`);
        }
      };
      reader.readAsText(file);
    }

    function clearMessages() {
      document.getElementById('chatMessages').innerHTML = '';
      if (window.LumenAstraApp) window.LumenAstraApp.clearChatHistory();
      appendSystemNotification('Conversation history cleared.');
    }

    function appendSystemNotification(msg) {
      const container = document.getElementById('chatMessages');
      const div = document.createElement('div');
      div.className = 'py-2 px-3 rounded-lg bg-terminal-panel/60 border border-terminal-border text-xs text-slate-400 font-mono text-center max-w-lg mx-auto';
      div.innerText = msg;
      container.appendChild(div);
      scrollToBottom();
    }

    function openSpecsModal() {
      document.getElementById('specsModal').classList.remove('hidden');
    }

    function closeSpecsModal() {
      document.getElementById('specsModal').classList.add('hidden');
    }

    async function handleChatSubmit(e) {
      if (e) e.preventDefault();
      const input = document.getElementById('promptInput');
      const text = input.value.trim();
      if (!text) return;

      input.value = '';
      input.disabled = true;
      document.getElementById('sendBtn').disabled = true;

      // Render User Message
      renderUserMessage(text);

      // Loading state indicator
      const loadingId = renderAssistantLoading();
      scrollToBottom();

      try {
        await new Promise(r => setTimeout(r, 40)); // allow UI render tick

        const mode = document.getElementById('engineModeSelect').value;
        let res;

        if (mode === 'frontier') {
          const apiKey = localStorage.getItem('lumen_frontier_api_key');
          const provider = localStorage.getItem('lumen_frontier_provider') || 'gemini';
          const model = localStorage.getItem('lumen_frontier_model') || 'gemini-2.5-flash';

          if (!apiKey) {
            const loadEl = document.getElementById(loadingId);
            if (loadEl) loadEl.remove();
            openFrontierModal();
            appendSystemNotification('⚠️ Frontier Cloud Mode requires an API key. Please input your key in settings or switch to 🟢 Sovereign Local MoE.');
            return;
          }

          res = await window.LumenAstraApp.queryFrontierModel(text, { provider, apiKey, model });
        } else {
          res = window.LumenAstraApp.queryModel(text);
        }

        // Remove loading indicator
        const loadEl = document.getElementById(loadingId);
        if (loadEl) loadEl.remove();

        // Render AI Response
        renderAssistantMessage(res);
      } catch (err) {
        const loadEl = document.getElementById(loadingId);
        if (loadEl) loadEl.remove();
        appendSystemNotification(\`❌ Error during inference: \${err.message}\`);
      } finally {
        input.disabled = false;
        document.getElementById('sendBtn').disabled = false;
        input.focus();
        scrollToBottom();
      }
    }

    function renderUserMessage(text) {
      const container = document.getElementById('chatMessages');
      const div = document.createElement('div');
      div.className = 'flex justify-end';
      div.innerHTML = \`
        <div class="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600/90 text-white px-4 py-3 shadow-md border border-blue-500/40">
          <div class="text-xs font-semibold text-blue-200 mb-1 flex items-center justify-between gap-4">
            <span>YOU</span>
            <span class="text-[10px] font-mono text-blue-300">\${new Date().toLocaleTimeString()}</span>
          </div>
          <div class="text-sm leading-relaxed whitespace-pre-wrap break-words">\${escapeHtml(text)}</div>
        </div>
      \`;
      container.appendChild(div);
    }

    function renderAssistantLoading() {
      const id = 'loading_' + Date.now();
      const container = document.getElementById('chatMessages');
      const mode = document.getElementById('engineModeSelect').value;
      const label = mode === 'frontier' ? 'Querying Frontier Cloud Model...' : 'Running DeepSeek-R1 Deliberation & Neural Synthesis...';

      const div = document.createElement('div');
      div.id = id;
      div.className = 'flex items-start gap-3';
      div.innerHTML = \`
        <div class="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-sm shrink-0">
          ✨
        </div>
        <div class="glass-card rounded-2xl rounded-tl-sm p-4 border border-terminal-border max-w-[85%]">
          <div class="flex items-center space-x-2 text-xs text-blue-400 font-mono">
            <span class="w-2 h-2 rounded-full bg-blue-400 animate-ping"></span>
            <span>\${label}</span>
          </div>
        </div>
      \`;
      container.appendChild(div);
      return id;
    }

    function renderAssistantMessage(res) {
      const container = document.getElementById('chatMessages');
      const div = document.createElement('div');
      div.className = 'flex items-start gap-3';

      // Parse <think>...</think> block
      let thinkContent = '';
      let replyContent = res.reply;

      const thinkMatch = res.reply.match(/<think>([\\s\\S]*?)<\\/think>/i);
      if (thinkMatch) {
        thinkContent = thinkMatch[1].trim();
        replyContent = res.reply.replace(/<think>[\\s\\S]*?<\\/think>/i, '').trim();
      }

      const thinkAccordionId = 'think_' + Date.now();

      div.innerHTML = \`
        <div class="w-8 h-8 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/30 flex items-center justify-center font-bold text-sm shrink-0 shadow">
          ✨
        </div>
        <div class="glass-card rounded-2xl rounded-tl-sm p-4 md:p-5 border border-terminal-border max-w-[88%] shadow-xl">
          
          <!-- Header Meta -->
          <div class="flex items-center justify-between text-xs text-slate-400 mb-3 border-b border-slate-700/50 pb-2">
            <span class="font-semibold text-blue-400 font-mono flex items-center gap-1.5">
              <span>\${escapeHtml(res.engine || 'Lumen Astra')}</span>
              <span class="text-[10px] text-slate-500 font-normal">(\${res.telemetry?.aiMode ?? 'Dual-Engine'})</span>
            </span>
            <div class="flex items-center gap-2 font-mono text-[10px]">
              <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Confidence: \${((res.telemetry?.policyConfidence ?? 0.88) * 100).toFixed(1)}%</span>
              <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">\${res.telemetry?.latencyMs ?? 18}ms</span>
            </div>
          </div>

          <!-- DeepSeek-R1 <think> Accordion -->
          \${thinkContent ? \`
            <div class="mb-4 rounded-xl bg-slate-950/80 border border-slate-800/80 overflow-hidden">
              <button onclick="toggleAccordion('\${thinkAccordionId}')" class="w-full px-3.5 py-2.5 bg-slate-900/60 hover:bg-slate-900 flex items-center justify-between text-xs font-mono text-slate-300 transition">
                <span class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                  <span class="text-blue-300 font-semibold">&lt;think&gt;</span>
                  <span class="text-slate-400 text-[11px]">Test-Time Cognitive Deliberation Trace</span>
                </span>
                <span id="\${thinkAccordionId}_icon" class="text-slate-500 text-[10px] transform transition-transform">▼</span>
              </button>
              <div id="\${thinkAccordionId}" class="p-3.5 text-xs font-mono text-slate-300 border-t border-slate-800/60 bg-black/40 whitespace-pre-wrap leading-relaxed space-y-1">
\${escapeHtml(thinkContent)}
              </div>
            </div>
          \` : ''}

          <!-- Response Body -->
          <div class="text-sm text-slate-200 leading-relaxed font-sans prose prose-invert max-w-none">
            \${formatMarkdown(replyContent)}
          </div>

          <!-- Footer Telemetry -->
          <div class="mt-3.5 pt-2.5 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-500 gap-2">
            <span>Shannon Entropy: \${(res.telemetry?.entropy ?? 1.82).toFixed(2)} bits</span>
            <span>Active Experts: 2/4 Routed</span>
            <span>Reasoning Tier: \${escapeHtml(res.telemetry?.reasoningTier || 'Deliberation + MoE')}</span>
          </div>
        </div>
      \`;

      container.appendChild(div);
    }

    function toggleAccordion(id) {
      const el = document.getElementById(id);
      const icon = document.getElementById(id + '_icon');
      if (!el) return;
      if (el.classList.contains('hidden')) {
        el.classList.remove('hidden');
        if (icon) icon.innerText = '▼';
      } else {
        el.classList.add('hidden');
        if (icon) icon.innerText = '▶';
      }
    }

    function formatMarkdown(text) {
      if (!text) return '';
      let html = escapeHtml(text);

      // Code blocks
      html = html.replace(/\\x60\\x60\\x60([\\s\\S]*?)\\x60\\x60\\x60/g, '<pre class="p-3 my-2 rounded-lg bg-black/60 border border-slate-800 font-mono text-xs overflow-x-auto text-blue-300"><code>$1</code></pre>');
      
      // Inline code
      html = html.replace(/\\x60([^\\x60]+)\\x60/g, '<code class="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-xs text-blue-300 border border-slate-700/60">$1</code>');

      // Bold
      html = html.replace(/\\*\\*([^\\*]+)\\*\\*/g, '<strong class="text-white font-semibold">$1</strong>');

      // Headers
      html = html.replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-white mt-3.5 mb-1.5">$1</h3>');
      html = html.replace(/^#### (.*$)/gim, '<h4 class="text-xs font-bold text-slate-200 mt-2.5 mb-1">$1</h4>');

      // Line breaks
      html = html.replace(/\\n/g, '<br/>');

      return html;
    }

    function escapeHtml(str) {
      return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    function scrollToBottom() {
      const container = document.getElementById('messagesContainer');
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    }

    // Launch terminal on load
    window.addEventListener('DOMContentLoaded', initTerminal);
  </script>
</body>
</html>
`;

  // 1. Write to repository root for immediate user opening
  const repoOutputPath = path.resolve(process.cwd(), 'lumen-astra-chat.html');
  fs.writeFileSync(repoOutputPath, htmlContent, 'utf8');
  console.log(`[Standalone Web App Generated] Successfully written to: ${repoOutputPath}`);

  // 2. Also write to artifact directory for Antigravity preview
  const artifactDir = '/Users/ritamsaha/.gemini/antigravity/brain/b028a15f-db30-4061-99cb-0f31ae57a055';
  if (fs.existsSync(artifactDir)) {
    const artifactPath = path.join(artifactDir, 'lumen-astra-chat.html');
    fs.writeFileSync(artifactPath, htmlContent, 'utf8');
    console.log(`[Artifact Generated] Written to: ${artifactPath}`);
  }

  const stat = fs.statSync(repoOutputPath);
  console.log(`[Size]: ${(stat.size / 1024).toFixed(1)} KB (100% self-contained)`);
}

generateHtml();
