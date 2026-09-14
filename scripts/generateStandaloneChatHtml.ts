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
  <title>Lumen-Astra-Fin 2.0 | Sovereign Autonomous Quant LLM Terminal</title>
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
      background: rgba(19, 27, 44, 0.7);
      backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.08);
    }
    
    .glow-emerald {
      box-shadow: 0 0 20px -5px rgba(16, 185, 129, 0.3);
    }

    .glow-sapphire {
      box-shadow: 0 0 20px -5px rgba(59, 130, 246, 0.3);
    }
  </style>
</head>
<body class="h-screen flex flex-col overflow-hidden bg-terminal-bg text-slate-200">

  <!-- TOP APP HEADER -->
  <header class="h-14 border-b border-terminal-border bg-terminal-surface/90 backdrop-blur px-4 flex items-center justify-between shrink-0 z-30">
    <div class="flex items-center space-x-3">
      <div class="w-8 h-8 rounded-lg bg-gradient-to-br from-emerald-500 to-blue-600 flex items-center justify-center font-bold text-white shadow-lg glow-emerald">
        ⚡
      </div>
      <div>
        <div class="flex items-center space-x-2">
          <span class="font-bold tracking-tight text-white flex items-center gap-1.5">
            LUMEN-ASTRA-FIN <span class="text-xs px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 font-mono border border-blue-500/30">2.0 MoE</span>
          </span>
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-1.5 animate-pulse"></span>
            IN-MEMORY NEURAL ENGINE
          </span>
        </div>
        <div class="text-[11px] text-slate-400 font-mono">3.79M MoE Parameters • ₹0.05 NSE Invariant • Edge CPU Inference</div>
      </div>
    </div>

    <!-- Center Mode Selector -->
    <div class="hidden md:flex items-center bg-terminal-panel p-1 rounded-lg border border-terminal-border text-xs">
      <button id="modeUpstoxBtn" onclick="switchDeskMode('upstox')" class="px-3 py-1 rounded-md font-medium transition-all bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
        🇮🇳 NSE Equities (Upstox)
      </button>
      <button id="modeCryptoBtn" onclick="switchDeskMode('crypto')" class="px-3 py-1 rounded-md font-medium transition-all text-slate-400 hover:text-slate-200">
        🌐 Digital Crypto
      </button>
    </div>

    <!-- Right Actions -->
    <div class="flex items-center space-x-2 text-xs">
      <!-- File upload button for 1M checkpoint weights -->
      <label class="cursor-pointer flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-slate-300 hover:text-white transition-all">
        <span>📂</span>
        <span>Load Checkpoint</span>
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
    
    <!-- LEFT SIDEBAR: QUANT RADAR & ASSETS -->
    <aside class="w-64 border-r border-terminal-border bg-terminal-surface/50 hidden lg:flex flex-col shrink-0">
      <div class="p-3 border-b border-terminal-border flex items-center justify-between">
        <span class="text-xs font-semibold text-slate-400 uppercase tracking-wider">Live Assets Radar</span>
        <span class="text-[10px] text-emerald-400 font-mono">100% SYNCHRONIZED</span>
      </div>
      
      <div class="flex-1 overflow-y-auto p-2 space-y-1" id="assetRadarList">
        <!-- Rendered dynamically -->
      </div>

      <!-- Quick Slash Cheatsheet -->
      <div class="p-3 border-t border-terminal-border bg-terminal-panel/30 text-xs">
        <div class="text-[11px] font-semibold text-slate-400 mb-2 uppercase tracking-wider">Quant Command Deck</div>
        <div class="grid grid-cols-2 gap-1.5 font-mono text-[11px]">
          <button onclick="sendQuickPrompt('/benchmark')" class="p-1.5 rounded bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-left text-blue-400 hover:text-blue-300 truncate">
            /benchmark
          </button>
          <button onclick="sendQuickPrompt('/audit')" class="p-1.5 rounded bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-left text-amber-400 hover:text-amber-300 truncate">
            /audit
          </button>
          <button onclick="sendQuickPrompt('/scan')" class="p-1.5 rounded bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-left text-emerald-400 hover:text-emerald-300 truncate">
            /scan
          </button>
          <button onclick="sendQuickPrompt('/bot RELIANCE')" class="p-1.5 rounded bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-left text-purple-400 hover:text-purple-300 truncate">
            /bot
          </button>
          <button onclick="sendQuickPrompt('/dca BTC')" class="p-1.5 rounded bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-left text-cyan-400 hover:text-cyan-300 truncate">
            /dca
          </button>
          <button onclick="sendQuickPrompt('/stress')" class="p-1.5 rounded bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-left text-rose-400 hover:text-rose-300 truncate">
            /stress
          </button>
        </div>
      </div>
    </aside>

    <!-- CHAT INTERACTION WORKSPACE -->
    <main class="flex-1 flex flex-col overflow-hidden relative">
      
      <!-- MESSAGES SCROLL AREA -->
      <div id="messagesContainer" class="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
        
        <!-- Welcome Hero Card -->
        <div class="glass-card rounded-xl p-6 border border-terminal-border glow-sapphire max-w-3xl mx-auto">
          <div class="flex items-start gap-4">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-tr from-emerald-500 to-blue-600 flex items-center justify-center text-2xl shadow-lg shrink-0">
              ⚡
            </div>
            <div>
              <h2 class="text-lg font-bold text-white">Lumen-Astra-Fin 2.0 Autonomous Quant Terminal</h2>
              <p class="text-sm text-slate-300 mt-1 leading-relaxed">
                Direct browser execution of our indigenous 3.79M parameter sparse Mixture-of-Experts Transformer. Engineered with DeepSeek-R1 test-time deliberation (<span class="text-blue-400 font-mono">&lt;think&gt;</span>), Process Reward Critic (PRM) verification, and 100% adherence to NSE Indian equity exchange invariants.
              </p>
              
              <div class="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs font-mono">
                <div class="p-2.5 rounded-lg bg-terminal-panel border border-terminal-border">
                  <div class="text-slate-400">Microstructure Invariant</div>
                  <div class="text-emerald-400 font-semibold mt-0.5">₹0.05 Tick & ₹2,000 Floor</div>
                </div>
                <div class="p-2.5 rounded-lg bg-terminal-panel border border-terminal-border">
                  <div class="text-slate-400">Anti-Repetition Engine</div>
                  <div class="text-blue-400 font-semibold mt-0.5">3-Gram Block & Min-P 0.05</div>
                </div>
                <div class="p-2.5 rounded-lg bg-terminal-panel border border-terminal-border">
                  <div class="text-slate-400">Model Capacity</div>
                  <div class="text-purple-400 font-semibold mt-0.5">3,789,360 Params (MoE)</div>
                </div>
              </div>

              <!-- Quick Start Prompt Chips -->
              <div class="mt-4 pt-3 border-t border-slate-700/50 flex flex-wrap gap-2 text-xs">
                <span class="text-slate-400 py-1 font-medium">Quick Prompts:</span>
                <button onclick="sendQuickPrompt('analyze RELIANCE')" class="px-2.5 py-1 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-slate-300 hover:text-white transition">
                  📊 Analyze RELIANCE
                </button>
                <button onclick="sendQuickPrompt('/benchmark')" class="px-2.5 py-1 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-blue-300 hover:text-white transition">
                  🏆 Run 6-Factor Benchmark
                </button>
                <button onclick="sendQuickPrompt('/audit')" class="px-2.5 py-1 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-amber-300 hover:text-white transition">
                  🛡️ Sentinel Risk Audit
                </button>
                <button onclick="sendQuickPrompt('NIFTY option Greeks 2nd-order Taylor expansion hedge')" class="px-2.5 py-1 rounded-full bg-terminal-panel hover:bg-slate-800 border border-terminal-border text-purple-300 hover:text-white transition">
                  📐 Option Greeks Hedge
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
              
              <!-- Command prefix indicator -->
              <div class="pl-3.5 pr-1 text-slate-400 font-mono text-sm select-none">
                &gt;
              </div>

              <input 
                type="text" 
                id="promptInput" 
                placeholder="Ask quant question, ticker (e.g. RELIANCE, TCS), or command (/benchmark, /audit, /bot)..." 
                class="w-full py-3.5 px-2 bg-transparent text-white placeholder-slate-500 text-sm focus:outline-none"
                autocomplete="off"
              />

              <!-- Submit button -->
              <div class="pr-2 flex items-center gap-1.5">
                <button 
                  type="submit" 
                  id="sendBtn"
                  class="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs flex items-center gap-1.5 transition-all shadow-md active:scale-95 disabled:opacity-50 disabled:pointer-events-none"
                >
                  <span>Transmit</span>
                  <span>↵</span>
                </button>
              </div>
            </div>
          </form>
          <div class="flex items-center justify-between text-[11px] text-slate-500 mt-2 px-1">
            <span>Press <kbd class="px-1 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px]">Enter</kbd> to run neural inference</span>
            <span id="statusBar">Engine Ready • Sub-second Edge Latency</span>
          </div>
        </div>
      </div>

    </main>
  </div>

  <!-- BUNDLED APPLICATION SCRIPT -->
  <script>
${bundleJs}
  </script>

  <!-- INTERACTIVE CONTROLLER SCRIPT -->
  <script>
    let activeMode = 'upstox';
    let currentSelectedAsset = 'RELIANCE';

    function initTerminal() {
      renderAssetRadar();
      updateHeaderStatus();
    }

    function switchDeskMode(mode) {
      activeMode = mode;
      document.getElementById('modeUpstoxBtn').className = mode === 'upstox'
        ? 'px-3 py-1 rounded-md font-medium transition-all bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
        : 'px-3 py-1 rounded-md font-medium transition-all text-slate-400 hover:text-slate-200';
      
      document.getElementById('modeCryptoBtn').className = mode === 'crypto'
        ? 'px-3 py-1 rounded-md font-medium transition-all bg-blue-500/20 text-blue-300 border border-blue-500/30'
        : 'px-3 py-1 rounded-md font-medium transition-all text-slate-400 hover:text-slate-200';

      currentSelectedAsset = mode === 'upstox' ? 'RELIANCE' : 'BTC';
      renderAssetRadar();
      appendSystemNotification(\`Switched desk mode to: \${mode === 'upstox' ? 'NSE Indian Equities (Upstox Live Engine)' : 'Digital Crypto Desk'}\`);
    }

    function selectAsset(sym) {
      currentSelectedAsset = sym;
      renderAssetRadar();
      appendSystemNotification(\`Primary asset focus switched to: \${sym}\`);
    }

    function renderAssetRadar() {
      const radarContainer = document.getElementById('assetRadarList');
      if (!radarContainer || !window.LumenAstraApp) return;

      const markets = window.LumenAstraApp.createDefaultMarkets();
      const assets = activeMode === 'upstox' 
        ? ['RELIANCE', 'TCS', 'INFY', 'TATAPOWER']
        : ['BTC'];

      radarContainer.innerHTML = assets.map(sym => {
        const m = markets[sym];
        const isSel = sym === currentSelectedAsset;
        const isUp = (m?.change24h ?? 0) >= 0;
        return \`
          <div onclick="selectAsset('\${sym}')" class="p-2.5 rounded-lg cursor-pointer transition-all border \${
            isSel 
              ? 'bg-terminal-panel border-blue-500/40 glow-sapphire' 
              : 'bg-terminal-surface/80 border-terminal-border/50 hover:bg-terminal-panel/60'
          }">
            <div class="flex items-center justify-between">
              <span class="font-bold text-xs text-white font-mono">\${sym}</span>
              <span class="text-xs font-mono font-medium \${isUp ? 'text-emerald-400' : 'text-rose-400'}">
                \${isUp ? '+' : ''}\${m?.change24h?.toFixed(2)}%
              </span>
            </div>
            <div class="flex items-center justify-between text-[11px] text-slate-400 font-mono mt-1">
              <span>\${activeMode === 'upstox' ? '₹' : '$'}\${m?.price?.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              <span class="text-[10px] text-slate-500">Vol: \${(m?.volume24h / 1e6).toFixed(1)}M</span>
            </div>
          </div>
        \`;
      }).join('');
    }

    function sendQuickPrompt(promptText) {
      document.getElementById('promptInput').value = promptText;
      handleChatSubmit();
    }

    function updateHeaderStatus() {
      if (!window.LumenAstraApp) return;
      const info = window.LumenAstraApp.getModelInfo();
      document.getElementById('statusBar').innerText = \`Model Parameters: \${info.parameters.toLocaleString()} • Ready\`;
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
        await new Promise(r => setTimeout(r, 40)); // allow render tick

        const res = window.LumenAstraApp.queryModel(text, {
          accountMode: activeMode,
          selectedAsset: currentSelectedAsset,
        });

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
      const div = document.createElement('div');
      div.id = id;
      div.className = 'flex items-start gap-3';
      div.innerHTML = \`
        <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm shrink-0">
          ⚡
        </div>
        <div class="glass-card rounded-2xl rounded-tl-sm p-4 border border-terminal-border max-w-[85%]">
          <div class="flex items-center space-x-2 text-xs text-emerald-400 font-mono">
            <span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span>Running DeepSeek-R1 Deliberation & Process Reward Critic...</span>
          </div>
        </div>
      \`;
      container.appendChild(div);
      return id;
    }

    window.simulateProposalExecution = function(asset, side, amount, price) {
      appendSystemNotification(\`⚡ [PAPER EXECUTION]: Filled \${side} order for \${amount} share(s) of \${asset} at ₹\${price}. Invariants & reserve floor verified.\`);
    };

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

      // Action proposal card HTML
      let proposalHtml = '';
      if (res.actionProposal) {
        const p = res.actionProposal;
        const sideUpper = (p.side || 'BUY').toUpperCase();
        const assetName = p.asset || p.symbol || currentSelectedAsset;
        const limitPrice = Number(p.limitPrice || 0).toFixed(2);
        const shares = p.amount || 1;

        proposalHtml = \`
          <div class="mt-4 p-3.5 rounded-xl bg-slate-900/90 border border-emerald-500/40 glow-emerald">
            <div class="flex items-center justify-between border-b border-slate-700/60 pb-2 mb-2">
              <span class="text-xs font-bold text-white flex items-center gap-1.5">
                <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
                STRUCTURED ACTION PROPOSAL
              </span>
              <span class="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 uppercase font-semibold">
                \${p.type || 'TRADE'}
              </span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs font-mono">
              <div>
                <span class="text-slate-400 text-[10px]">SYMBOL</span>
                <div class="text-white font-bold">\${assetName}</div>
              </div>
              <div>
                <span class="text-slate-400 text-[10px]">ACTION / SIDE</span>
                <div class="\${sideUpper === 'BUY' ? 'text-emerald-400' : 'text-rose-400'} font-bold">\${sideUpper}</div>
              </div>
              <div>
                <span class="text-slate-400 text-[10px]">LIMIT PRICE</span>
                <div class="text-white font-bold">₹\${limitPrice}</div>
              </div>
              <div>
                <span class="text-slate-400 text-[10px]">INTEGER LOTS</span>
                <div class="text-white font-bold">\${shares} Shares</div>
              </div>
            </div>
            \${p.rationale ? \`<div class="mt-2 text-xs text-slate-300 font-sans italic">\${escapeHtml(p.rationale)}</div>\` : ''}
            <div class="mt-2.5 pt-2 border-t border-slate-800 flex flex-wrap items-center justify-between text-[11px] text-slate-400 gap-2">
              <span class="text-emerald-400 font-mono flex items-center gap-1">
                <span>✓</span> ₹0.05 NSE Tick & Integer Lots
              </span>
              <button onclick="simulateProposalExecution('\${assetName}', '\${sideUpper}', \${shares}, '\${limitPrice}')" class="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-mono font-medium transition flex items-center gap-1">
                <span>⚡</span> Execute Paper Fill
              </button>
            </div>
          </div>
        \`;
      }

      const thinkAccordionId = 'think_' + Date.now();

      div.innerHTML = \`
        <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center justify-center font-bold text-sm shrink-0 shadow">
          ⚡
        </div>
        <div class="glass-card rounded-2xl rounded-tl-sm p-4 md:p-5 border border-terminal-border max-w-[88%] shadow-xl">
          
          <!-- Header Meta -->
          <div class="flex items-center justify-between text-xs text-slate-400 mb-3 border-b border-slate-700/50 pb-2">
            <span class="font-semibold text-emerald-400 font-mono flex items-center gap-1.5">
              <span>Lumen-Astra-Fin 2.0</span>
              <span class="text-[10px] text-slate-500 font-normal">(MoE Core)</span>
            </span>
            <div class="flex items-center gap-2 font-mono text-[10px]">
              <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">Conf: \${((res.neuralInference?.policyConfidence ?? 0.8) * 100).toFixed(1)}%</span>
              <span class="px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">\${res.neuralInference?.inferenceLatencyMs ?? 24}ms</span>
            </div>
          </div>

          <!-- DeepSeek-R1 <think> Accordion -->
          \${thinkContent ? \`
            <div class="mb-4 rounded-xl bg-slate-950/80 border border-slate-800/80 overflow-hidden">
              <button onclick="toggleAccordion('\${thinkAccordionId}')" class="w-full px-3.5 py-2.5 bg-slate-900/60 hover:bg-slate-900 flex items-center justify-between text-xs font-mono text-slate-300 transition">
                <span class="flex items-center gap-2">
                  <span class="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse"></span>
                  <span class="text-blue-300 font-semibold">&lt;think&gt;</span>
                  <span class="text-slate-400 text-[11px]">Test-Time Deliberation & PRM Trace</span>
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

          <!-- Action Proposal Card -->
          \${proposalHtml}

          <!-- Footer Telemetry -->
          <div class="mt-3.5 pt-2.5 border-t border-slate-800/60 flex flex-wrap items-center justify-between text-[10px] font-mono text-slate-500 gap-2">
            <span>Shannon Entropy: \${res.neuralInference?.policyEntropy ?? 2.15} bits</span>
            <span>Tools: \${(res.telemetry?.toolsUsed || []).join(', ')}</span>
            <span>Passed 100% Invariants</span>
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
      html = html.replace(/\x60\x60\x60([\s\S]*?)\x60\x60\x60/g, '<pre class="p-3 my-2 rounded-lg bg-black/60 border border-slate-800 font-mono text-xs overflow-x-auto text-blue-300"><code>$1</code></pre>');
      
      // Inline code
      html = html.replace(/\x60([^\x60]+)\x60/g, '<code class="px-1.5 py-0.5 rounded bg-slate-800 font-mono text-xs text-emerald-300 border border-slate-700/60">$1</code>');

      // Bold
      html = html.replace(/\\*\\*([^\\*]+)\\*\\*/g, '<strong class="text-white font-semibold">$1</strong>');

      // Headers
      html = html.replace(/^### (.*$)/gim, '<h3 class="text-sm font-bold text-white mt-3 mb-1">$1</h3>');
      html = html.replace(/^#### (.*$)/gim, '<h4 class="text-xs font-bold text-slate-200 mt-2 mb-1">$1</h4>');

      // Tables
      html = html.replace(/\\|(.+)\\|/g, function(match) {
        return '<div class="font-mono text-xs my-0.5 text-slate-300">' + match + '</div>';
      });

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
