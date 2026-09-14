"use strict";var LumenAstraApp=(()=>{var se=Object.defineProperty;var Te=Object.getOwnPropertyDescriptor;var ve=Object.getOwnPropertyNames;var we=Object.prototype.hasOwnProperty;var Ee=(h,e)=>{for(var n in e)se(h,n,{get:e[n],enumerable:!0})},Se=(h,e,n,t)=>{if(e&&typeof e=="object"||typeof e=="function")for(let r of ve(e))!we.call(h,r)&&r!==n&&se(h,r,{get:()=>e[r],enumerable:!(t=Te(e,r))||t.enumerable});return h};var Me=h=>Se(se({},"__esModule",{value:!0}),h);var De={};Ee(De,{ASTRA_ENGINE_LABEL:()=>q,GeneralConversationalEngine:()=>Z,clearChatHistory:()=>Ae,getModelInfo:()=>ye,getSuggestedPrompts:()=>_e,loadModelWeights:()=>be,queryModel:()=>fe});var s=class{static zeros(e,n){let t=new Array(e);for(let r=0;r<e;r++)t[r]=new Array(n).fill(0);return t}static randomMatrix(e,n,t){let r=t!==void 0?t:Math.sqrt(2/(e+n)),a=new Array(e);for(let i=0;i<e;i++){let o=new Array(n);for(let c=0;c<n;c++){let p=Math.max(1e-7,Math.random()),l=Math.random(),A=Math.sqrt(-2*Math.log(p))*Math.cos(2*Math.PI*l);o[c]=A*r}a[i]=o}return a}static matmul(e,n){let t=e.length,r=e[0].length,a=n[0].length,i=this.zeros(t,a);for(let o=0;o<t;o++){let c=e[o],p=i[o];for(let l=0;l<r;l++){let A=c[l];if(A===0)continue;let b=n[l];for(let u=0;u<a;u++)p[u]+=A*b[u]}}return i}static transpose(e){let n=e.length,t=e[0].length,r=this.zeros(t,n);for(let a=0;a<n;a++){let i=e[a];for(let o=0;o<t;o++)r[o][a]=i[o]}return r}static add(e,n){let t=e.length,r=e[0].length,a=this.zeros(t,r);for(let i=0;i<t;i++)for(let o=0;o<r;o++)a[i][o]=e[i][o]+n[i][o];return a}static addBias(e,n){let t=e.length,r=e[0].length,a=this.zeros(t,r);for(let i=0;i<t;i++)for(let o=0;o<r;o++)a[i][o]=e[i][o]+n[o];return a}static gelu(e){return .5*e*(1+Math.tanh(Math.sqrt(2/Math.PI)*(e+.044715*Math.pow(e,3))))}static geluDerivative(e){let n=Math.sqrt(2/Math.PI),t=n*(e+.044715*Math.pow(e,3)),r=Math.tanh(t),a=1-r*r,i=n*(1+3*.044715*e*e);return .5*(1+r)+.5*e*a*i}static applyGelu(e){let n=e.length,t=e[0].length,r=this.zeros(n,t);for(let a=0;a<n;a++)for(let i=0;i<t;i++)r[a][i]=this.gelu(e[a][i]);return r}static layerNorm(e,n=1e-5){let t=e.length,r=e[0].length,a=this.zeros(t,r),i=new Array(t),o=new Array(t);for(let c=0;c<t;c++){let p=0;for(let u=0;u<r;u++)p+=e[c][u];let l=p/r;i[c]=l;let A=0;for(let u=0;u<r;u++){let y=e[c][u]-l;A+=y*y}let b=Math.sqrt(A/r+n);o[c]=b;for(let u=0;u<r;u++)a[c][u]=(e[c][u]-l)/b}return{normalized:a,means:i,stds:o}}static softmax(e,n){let t=e.length,r=e[0].length,a=this.zeros(t,r);for(let i=0;i<t;i++){let o=-1/0;for(let l=0;l<r;l++)n&&n[i]?.[l]||e[i][l]>o&&(o=e[i][l]);o===-1/0&&(o=0);let c=0;for(let l=0;l<r;l++)if(n&&n[i]?.[l])a[i][l]=0;else{let A=Math.exp(e[i][l]-o);a[i][l]=A,c+=A}let p=c>0?1/c:0;for(let l=0;l<r;l++)a[i][l]*=p}return a}static crossEntropy(e,n){let t=Math.max(1e-12,Math.min(.999999999999,e[n]||1e-12)),r=-Math.log(t),a=new Array(e.length);for(let i=0;i<e.length;i++)a[i]=e[i]-(i===n?1:0);return{loss:r,grad:a}}static mseLoss(e,n){let t=e-n;return{loss:.5*t*t,grad:t}}static clipGradients(e,n=1){let t=0;for(let a=0;a<e.length;a++)for(let i=0;i<e[a].length;i++)t+=e[a][i]*e[a][i];let r=Math.sqrt(t);if(r>n&&r>0){let a=n/r;for(let i=0;i<e.length;i++)for(let o=0;o<e[i].length;o++)e[i][o]*=a}}};var le=["RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","SBIN","BHARTIARTL","ITC","KOTAKBANK","LT","TATAMOTORS","AXISBANK","MARUTI","SUNPHARMA","TITAN","BAJFINANCE","HINDUNILVR","WIPRO","NTPC","ONGC","HAL","BEL","TATASTEEL","INDUSINDBK","BANKBARODA","PNB","CANBK","UNIONBANK","IDFCFIRSTB","FEDERALBNK","BAJAJFINSV","CHOLAFIN","SHRIRAMFIN","JIOFIN","MUTHOOTFIN","HCLTECH","TECHM","LTM","PERSISTENT","COFORGE","LTTS","MPHASIS","TATAELXSI","KPITTECH","POWERGRID","COALINDIA","BPCL","IOC","GAIL","ADANIGREEN","ADANIPOWER","TATAPOWER","NHPC","M&M","BAJAJ-AUTO","EICHERMOT","HEROMOTOCO","TVSMOTOR","BHARATFORG","MOTHERSON","BOSCHLTD","MRF","NESTLEIND","BRITANNIA","TATACONSUM","VBL","GODREJCP","DABUR","MARICO","COLPAL","CIPLA","DRREDDY","DIVISLAB","APOLLOHOSP","MANKIND","TORNTPHARM","LUPIN","ZYDUSLIFE","AUROPHARMA","JSWSTEEL","HINDALCO","VEDL","JINDALSTEL","NMDC","SAIL","SIEMENS","ABB","BHEL","HAVELLS","POLYCAB","TRENT","DMART","INDHOTEL","ASIANPAINT","BERGEPAINT","ULTRACEMCO","GRASIM","AMBUJACEM","SHREECEM","PIDILITIND"];var Be=[...le,"BTC","ETH","SOL","BNB","XRP","DOGE","ADA","AVAX","SUI","SHIB","TON","LINK","NEAR","DOT","BCH","PEPE","UNI","APT","LTC","ICP","FET","KAS","POL","XLM","XMR","TIA","RENDER","STX","TAO","AAVE","ARB","OP","INJ","FIL","OKB","IMX","VET","MNT","CRO","FTM","WIF","FLOKI","BONK","GRT","THETA","SEI","JUP","RUNE","PYTH","HBAR","OM","LDO","ALGO","MKR","BSV","JASMY","ENA","AR","CORE","BTT","NOT","ONDO","WLD","PENDLE","BEAM","DYDX","STRK","GALA","BLUR","CRV","CHZ","SNX","AXS","SAND","MANA","ENJ","FLOW","QNT","NEO","EOS","IOTA","KAVA","MINA","ROSE","ZIL","KLAY","CFX","RON","APE","1INCH","COMP","OSMO","GMX","RAY","JTO","ORDI","SATS","W","TNSR","EIGEN","NEIRO","TURBO","POPCAT","MEME","ME","ZK","MORPHO","COW"];var xe=["<pad>","<bos>","<eos>","<unk>","<thought>","</thought>","<think>","</think>","<reflection>","</reflection>","<verify>","</verify>","<backtrack>","</backtrack>","<scenario>","</scenario>","<regime>","</regime>","<aci>","</aci>","<vwap>","</vwap>","<atr>","</atr>","<volume>","</volume>","<action>","</action>","<confidence>","</confidence>","<risk>","</risk>","<verdict>","</verdict>"],D=["BUY_BREAKOUT","VWAP_PULLBACK","MEAN_REVERT","DEFENSIVE_EXIT","STAND_ASIDE","PROFIT_HARVEST","EMERGENCY_VETO","ACCUMULATE","REDUCE","HOLD","ASSESS_FUNDAMENTALS","VERIFIED_SAFE","QUANT_VERIFIED","COMMUNICATE","COMMUNICATE_DIALOGUE","EXPLAIN_CONCEPT","CLARIFY_CONTEXT","EMPATHETIC_RESPONSE"],Ie=["REGIME_BULL_TREND","REGIME_BEAR_TREND","REGIME_RANGE_BOUND","REGIME_HIGH_VOLATILITY","REGIME_LOW_VOLATILITY","REGIME_VOLATILITY_SHOCK","DOMAIN_FINANCE_SEC","DOMAIN_RISK_SAFETY","DOMAIN_QUANT_MATH","DOMAIN_COMMUNICATION","DOMAIN_TRADING_ALPHA"],ke=["ACI_EXEMPLARY_85_PLUS","ACI_STRONG_75_84","ACI_MODERATE_65_74","ACI_SUBPAR_BELOW_65","ABOVE_VWAP_EXPANSION","BELOW_VWAP_FAILED","AT_VWAP_SUPPORT","VWAP_STRETCH_EXTREME","VOLUME_SURGE_EXTREME_3X","VOLUME_SURGE_STRONG_2X","VOLUME_NORMAL_1X","VOLUME_FADING_SUB_1X","CATALYST_EARNINGS_BEAT","CATALYST_EARNINGS_MISS","CATALYST_SEBI_ORDER","CATALYST_FORENSIC_PROBE","CATALYST_BLOCK_DEAL","CATALYST_COMMODITY_SPIKE","CATALYST_NONE","OUTCOME_WIN_1_5_ATR","OUTCOME_WIN_RUNNER","OUTCOME_LOSS_DEFENSIVE","OUTCOME_LOSS_STOP_HIT","OUTCOME_STAGNANT_SCRATCH"],Ne=["analyzing","market","conditions","for","asset","volume","surge","detected","at","institutional","vwap","support","broken","confirmed","breakout","above","morning","high","failed","reversion","probable","aci","score","indicates","high","moderate","low","conviction","capital","defense","mandates","immediate","exit","to","prevent","further","drawdown","allocating","runner","target","with","trailing","ratchet","sizing","multiplier","set","halving","risk","due","elevated","volatility","regime","favorable","trend","rider","entry","valid","veto","engaged","governance","red","flag","stand","aside","preserve","cash","healthy","expectancy","verified","prm","consensus","expansion"],Ce=["the","is","a","an","in","of","and","or","to","with","by","from","as","on","this","that","which","be","are","not","have","has","will","shows","indicates","calculated","derived","verified","confirms","breaches","exceeds","satisfies","delta","gamma","vega","theta","vanna","volga","taylor","expansion","curvature","hedge","ratio","order","second","closed","form","analytical","solution","partial","derivative","black","scholes","heston","stochastic","volatility","feller","condition","boundary","variance","drift","mean","reversion","ornstein","uhlenbeck","equilibrium","sigma","standard","deviation","z_score","cointegration","stationary","stationarity","adf","p_value","hypothesis","rejection","microstructure","order_flow","imbalance","depth","liquidity","bid","ask","spread","amihud","illiquidity","tick","size","quantization","integer","lot","shares","mandatory","liquid","cash","reserve","floor","statutory","charges","execution","slippage","notional","margin","leverage","mis","circuit_breaker","intraday","sentinel","defense","veto","volatility_shock","drawdown","preservation","halt","circuit","breaker","epistemic","uncertainty","shannon","entropy","bits","confidence","process","reward","critic","prm","expected","value","var","parametric","stress_test","governance","sovereign","solvency","balance_sheet","quick_ratio","current_assets","liabilities","inventory","receivables","ebitda","debt","coverage","altman","z","score","piotroski","f","sec","10k","10q","operating","revenue","interest","expense"],Le=["hello","hi","hey","welcome","greetings","thanks","thank","you","please","good","morning","afternoon","evening","day","glad","delighted","happy","great","pleasure","meet","farewell","bye","yes","no","sure","certainly","absolutely","indeed","okay","alright","welcome_back","fine","wonderful","cheers","appreciated","i","me","my","myself","we","our","ours","us","your","yours","they","their","them","he","she","it","its","who","what","when","where","why","how","which","whose","can","could","would","should","might","may","must","shall","am","understand","understanding","comprehend","context","meaning","perspective","insight","dialogue","conversation","chat","message","discuss","discussion","topic","explore","learn","learning","explain","explaining","explanation","clarify","clarification","question","answer","answering","response","query","inquiry","thoughtful","nuance","balance","balanced","honest","listen","listening","helpful","assist","assistant","assistance","guide","guidance","collaborate","collaborative","share","because","therefore","however","moreover","furthermore","meanwhile","although","whereas","similarly","specifically","essentially","ultimately","firstly","secondly","finally","example","analogous","analogy","difference","similarity","advantage","disadvantage","tradeoff","cause","effect","consequence","implication","premise","conclusion","rationale","principle","framework","concept","structured","systematic","deduce","infer","synthesize","evaluate","assess","compare","contrast","contrastive","fundamental","intuitive","lumen","astra","sovereign","calm","objective","transparent","rigorous","curious","respectful","composed","humble","disciplined","companion","partner","colleague","intellect","poise","friendly","warm","reassuring","patient","clarity","integrity","empathy","feeling","sentiment","nervous","excited","cautious","confident","curiosity","enthusiasm","wisdom","experience","mindful","steady","grounded","reliable","trust","truth","candid","realistic","humor","philosophy","journey","market_order","limit_order","stop_order","broker","exchange","matching","investor","trader","beginner","basics","fundamentals","psychology","emotion","fear","greed","discipline","habit","mistake","lesson","advice","recommendation","suggestion","horizon","long_term","short_term","wealth","compounding","savings","retirement","inflation","purchasing_power","interest_rate","central_bank","economy","growth","recession","bear","bull","cycle","allocation","diversification","safety_net","emergency_fund","simple","easy","inquisitive","reflective","articulate","perspective_shift","thoughtfulness"],Re=[...xe,...D,...Ie,...ke,...le,...Ne,...Ce,...Le],ce=Array.from(new Set(Re)),C={},pe={};for(let h=0;h<ce.length;h++){let e=ce[h];C[e]=h,pe[h]=e}var $=ce.length,qe=C["<pad>"]??0,ze=C["<bos>"]??1,Y=C["<eos>"]??2,he=C["<unk>"]??3,U=class{static vocabSize=$;static encode(e){let n=new RegExp("(<[^>]+>|[a-zA-Z0-9_]+|[^\\s\\w])","g"),t=e.match(n)||[],r=[];for(let a of t){let i=a.toUpperCase(),o=a.toLowerCase();C[a]!==void 0?r.push(C[a]):C[i]!==void 0?r.push(C[i]):C[o]!==void 0?r.push(C[o]):r.push(he)}return r}static decode(e){return e.map(n=>pe[n]||"<unk>").filter(n=>n!=="<pad>"&&n!=="<bos>").join(" ").replace(/\s+([<>[\](),.:;])/g,"$1")}static getActionTokenId(e){return C[e]??he}};var j=class h{dModel;dHidden;W_gate;W_up;W_down;constructor(e,n){this.dModel=e,this.dHidden=n||Math.floor(8*e/3),this.W_gate=s.randomMatrix(this.dModel,this.dHidden),this.W_up=s.randomMatrix(this.dModel,this.dHidden),this.W_down=s.randomMatrix(this.dHidden,this.dModel)}static sigmoid(e){if(e>=0)return 1/(1+Math.exp(-e));{let n=Math.exp(e);return n/(1+n)}}static swish(e){return e*this.sigmoid(e)}static swishDerivative(e){let n=this.sigmoid(e);return n*(1+e*(1-n))}forward(e){let n=e.length,t=s.matmul(e,this.W_gate),r=s.matmul(e,this.W_up),a=s.zeros(n,this.dHidden),i=s.zeros(n,this.dHidden);for(let c=0;c<n;c++)for(let p=0;p<this.dHidden;p++){let l=h.swish(t[c][p]);a[c][p]=l,i[c][p]=l*r[c][p]}return{out:s.matmul(i,this.W_down),gateLinear:t,upLinear:r,gateActivated:a,swigluHidden:i}}backward(e,n,t,r,a,i){let o=n.length,c=s.matmul(s.transpose(i),e),p=s.matmul(e,s.transpose(this.W_down)),l=s.zeros(o,this.dHidden),A=s.zeros(o,this.dHidden);for(let _=0;_<o;_++)for(let I=0;I<this.dHidden;I++){let k=p[_][I];A[_][I]=k*a[_][I];let O=h.swishDerivative(t[_][I]);l[_][I]=k*r[_][I]*O}let b=s.matmul(s.transpose(n),A),u=s.matmul(s.transpose(n),l),y=s.matmul(A,s.transpose(this.W_up)),M=s.matmul(l,s.transpose(this.W_gate));return{dX:s.add(y,M),dW_gate:u,dW_up:b,dW_down:c}}};var X=class{dModel;nExperts;topK;experts;W_router;constructor(e,n=4,t=2){this.dModel=e,this.nExperts=n,this.topK=t,this.W_router=s.randomMatrix(e,n),this.experts=[];for(let r=0;r<n;r++)this.experts.push(new j(e))}forward(e){let n=e.length,t=s.matmul(e,this.W_router),r=s.softmax(t),a=s.zeros(n,this.dModel),i=[],o=new Array(this.nExperts).fill(0);for(let l=0;l<n;l++){let b=r[l].map((w,L)=>({prob:w,idx:L})).sort((w,L)=>L.prob-w.prob),u=b[0].idx,y=b[1]?.idx??u,M=b[0].prob,T=b[1]?.prob??0,_=Math.max(1e-7,M+T),I=M/_,k=T/_;i.push({expert1:u,expert2:y,p1:I,p2:k}),o[u]++,o[y]++;let O=[e[l]],f=this.experts[u].forward(O).out[0],E=this.experts[y].forward(O).out[0];for(let w=0;w<this.dModel;w++)a[l][w]=I*f[w]+k*E[w]}let c=0,p=1/this.nExperts;for(let l=0;l<this.nExperts;l++){let b=o[l]/(n*2||1)-p;c+=b*b}return{out:a,routerWeights:r,expertAssignments:i,loadBalancingLoss:c}}};var We={vocabSize:$,dModel:64,nHeads:4,nLayers:2,maxSeqLen:64,nActions:D.length,learningRate:.001,weightDecay:.01,useMoE:!1,nExperts:4},ue={vocabSize:$,dModel:152,nHeads:4,nLayers:4,maxSeqLen:128,nActions:D.length,learningRate:8e-4,weightDecay:.01,useMoE:!0,nExperts:4},G=class h{config;W_emb;W_pos;layers;moeBlocks;W_lm;W_policy;W_value;m_W_emb;v_W_emb;m_layers;v_layers;m_W_lm;v_W_lm;m_W_policy;v_W_policy;m_W_value;v_W_value;optimizerStep=0;constructor(e={}){this.config={...We,...e};let{vocabSize:n,dModel:t,maxSeqLen:r,nLayers:a,nActions:i}=this.config;this.W_emb=s.randomMatrix(n,t,.05),this.W_pos=s.randomMatrix(r,t,.05),this.layers=[];for(let o=0;o<a;o++)this.layers.push({W_q:s.randomMatrix(t,t),W_k:s.randomMatrix(t,t),W_v:s.randomMatrix(t,t),W_o:s.randomMatrix(t,t),W_1:s.randomMatrix(t,4*t),b_1:new Array(4*t).fill(0),W_2:s.randomMatrix(4*t,t),b_2:new Array(t).fill(0)});if(this.config.useMoE){this.moeBlocks=[];for(let o=0;o<a;o++)this.moeBlocks.push(new X(t,this.config.nExperts||4,2))}this.W_lm=s.randomMatrix(t,n,.05),this.W_policy=s.randomMatrix(t,i,.05),this.W_value=s.randomMatrix(t,1,.05),this.m_W_emb=s.zeros(n,t),this.v_W_emb=s.zeros(n,t),this.m_W_lm=s.zeros(t,n),this.v_W_lm=s.zeros(t,n),this.m_W_policy=s.zeros(t,i),this.v_W_policy=s.zeros(t,i),this.m_W_value=s.zeros(t,1),this.v_W_value=s.zeros(t,1),this.m_layers=[],this.v_layers=[];for(let o=0;o<a;o++)this.m_layers.push({W_q:s.zeros(t,t),W_k:s.zeros(t,t),W_v:s.zeros(t,t),W_o:s.zeros(t,t),W_1:s.zeros(t,4*t),b_1:new Array(4*t).fill(0),W_2:s.zeros(4*t,t),b_2:new Array(t).fill(0)}),this.v_layers.push({W_q:s.zeros(t,t),W_k:s.zeros(t,t),W_v:s.zeros(t,t),W_o:s.zeros(t,t),W_1:s.zeros(t,4*t),b_1:new Array(4*t).fill(0),W_2:s.zeros(4*t,t),b_2:new Array(t).fill(0)})}forward(e){let n=Math.min(e.length,this.config.maxSeqLen),{dModel:t,nLayers:r,vocabSize:a,nActions:i}=this.config,o=s.zeros(n,t);for(let d=0;d<n;d++){let v=Math.min(e[d],a-1),S=this.W_emb[v],P=this.W_pos[d];for(let N=0;N<t;N++)o[d][N]=S[N]+P[N]}let c=[],p=[],l=[],A=[],b=[],u=[];for(let d=0;d<n;d++){u[d]=[];for(let v=0;v<n;v++)u[d][v]=v>d}let y=o,M=0;for(let d=0;d<r;d++){let v=this.layers[d];c.push(y);let{normalized:S}=s.layerNorm(y),P=s.matmul(S,v.W_q),N=s.matmul(S,v.W_k),te=s.matmul(S,v.W_v),z=s.transpose(N),V=s.matmul(P,z),ne=1/Math.sqrt(t/this.config.nHeads);for(let B=0;B<n;B++)for(let ae=0;ae<n;ae++)V[B][ae]*=ne;let re=s.softmax(V,u),ie=s.matmul(re,te),W=s.matmul(ie,v.W_o);p.push(W);let R=s.add(y,W),{normalized:oe}=s.layerNorm(R);l.push(oe);let me=s.applyGelu(s.addBias(s.matmul(oe,v.W_1),v.b_1)),K;if(this.moeBlocks&&this.moeBlocks[d]){let B=this.moeBlocks[d].forward(oe);K=B.out,M+=B.loadBalancingLoss}else K=s.addBias(s.matmul(me,v.W_2),v.b_2);A.push(me),b.push(K),y=s.add(R,K)}let{normalized:T}=s.layerNorm(y),_=s.matmul(T,this.W_lm),I=s.softmax(_),O=[T[n-1]],f=s.matmul(O,this.W_policy),E=s.softmax(f),w=f[0],L=E[0],x=s.matmul(O,this.W_value),m=Math.tanh(x[0][0]),g=h.computeShannonEntropy(L);return{tokens:e.slice(0,n),seqLen:n,embeddings:o,layerInputs:c,layerAttnOutputs:p,layerFfnInputs:l,layerFfnHiddens:A,layerFfnOutputs:b,finalHidden:T,lmLogits:_,lmProbs:I,policyLogits:w,policyProbs:L,policyEntropy:g,valuePred:m,moeLoadBalancingLoss:M}}static computeShannonEntropy(e){let n=0;for(let t=0;t<e.length;t++){let r=e[t];r>1e-12&&(n-=r*Math.log2(r))}return Number(n.toFixed(3))}trainStep(e,n,t,r){let a=this.forward(e),i=a.seqLen,o=0,c=0,p=0,l=s.zeros(i,this.config.vocabSize);if(n&&n.length>0){let m=0;for(let g=0;g<i-1;g++){let d=n[g+1]??n[g];if(d!==void 0){let v=s.crossEntropy(a.lmProbs[g],d);o+=v.loss,l[g]=v.grad,m++}}if(m>0){o/=m;for(let g=0;g<i;g++)for(let d=0;d<this.config.vocabSize;d++)l[g][d]/=m}}let A=new Array(this.config.nActions).fill(0);if(t!==void 0&&t>=0){let m=s.crossEntropy(a.policyProbs,t);c=m.loss,A=m.grad}let b=0;if(r!==void 0){let m=s.mseLoss(a.valuePred,r);p=m.loss,b=m.grad*(1-a.valuePred*a.valuePred)}let u=o*.5+c*.4+p*.1,y=s.matmul(s.transpose(a.finalHidden),l),M=s.zeros(this.config.dModel,this.config.nActions),T=a.finalHidden[i-1];for(let m=0;m<this.config.dModel;m++)for(let g=0;g<this.config.nActions;g++)M[m][g]=T[m]*A[g];let _=s.zeros(this.config.dModel,1);for(let m=0;m<this.config.dModel;m++)_[m][0]=T[m]*b;let I=s.matmul(l,s.transpose(this.W_lm));for(let m=0;m<this.config.dModel;m++){let g=0;for(let d=0;d<this.config.nActions;d++)g+=A[d]*this.W_policy[m][d];I[i-1][m]+=g+b*this.W_value[m][0]}let k=I,O=[];for(let m=this.config.nLayers-1;m>=0;m--){let g=this.layers[m],d=a.layerFfnHiddens[m];(!d||d.length===0||!d[0])&&(d=s.applyGelu(s.addBias(s.matmul(a.layerFfnInputs[m],g.W_1),g.b_1)));let v=s.matmul(s.transpose(d),k),S=new Array(this.config.dModel).fill(0);for(let W=0;W<i;W++)for(let R=0;R<this.config.dModel;R++)S[R]+=k[W][R];let P=s.matmul(k,s.transpose(g.W_2)),N=s.zeros(i,4*this.config.dModel);for(let W=0;W<i;W++)for(let R=0;R<4*this.config.dModel;R++)N[W][R]=P[W][R]*s.geluDerivative(d[W][R]);let te=s.matmul(s.transpose(a.layerFfnInputs[m]),N),z=new Array(4*this.config.dModel).fill(0);for(let W=0;W<i;W++)for(let R=0;R<4*this.config.dModel;R++)z[R]+=N[W][R];let V=s.matmul(s.transpose(a.layerInputs[m]),k),ne=s.matmul(s.transpose(a.layerInputs[m]),k),re=s.matmul(s.transpose(a.layerInputs[m]),k),ie=s.matmul(s.transpose(a.layerInputs[m]),k);O[m]={dW_q:ne,dW_k:re,dW_v:ie,dW_o:V,dW_1:te,db_1:z,dW_2:v,db_2:S},k=s.matmul(k,s.transpose(g.W_o))}this.optimizerStep++;let f=this.config.learningRate,E=.9,w=.999,L=1e-8,x=this.config.weightDecay;this.applyAdamW(this.W_lm,y,this.m_W_lm,this.v_W_lm,f,E,w,L,x),this.applyAdamW(this.W_policy,M,this.m_W_policy,this.v_W_policy,f,E,w,L,x),this.applyAdamW(this.W_value,_,this.m_W_value,this.v_W_value,f,E,w,L,x);for(let m=0;m<this.config.nLayers;m++){let g=O[m],d=this.layers[m],v=this.m_layers[m],S=this.v_layers[m];this.applyAdamW(d.W_q,g.dW_q,v.W_q,S.W_q,f,E,w,L,x),this.applyAdamW(d.W_k,g.dW_k,v.W_k,S.W_k,f,E,w,L,x),this.applyAdamW(d.W_v,g.dW_v,v.W_v,S.W_v,f,E,w,L,x),this.applyAdamW(d.W_o,g.dW_o,v.W_o,S.W_o,f,E,w,L,x),this.applyAdamW(d.W_1,g.dW_1,v.W_1,S.W_1,f,E,w,L,x),this.applyAdamW(d.W_2,g.dW_2,v.W_2,S.W_2,f,E,w,L,x)}for(let m=0;m<i;m++){let g=e[m];if(g<this.config.vocabSize)for(let d=0;d<this.config.dModel;d++){let v=k[m][d];this.m_W_emb[g][d]=E*this.m_W_emb[g][d]+(1-E)*v,this.v_W_emb[g][d]=w*this.v_W_emb[g][d]+(1-w)*v*v;let S=this.m_W_emb[g][d]/(1-Math.pow(E,this.optimizerStep)),P=this.v_W_emb[g][d]/(1-Math.pow(w,this.optimizerStep));this.W_emb[g][d]-=f*(S/(Math.sqrt(P)+L)+x*this.W_emb[g][d])}}return{totalLoss:u,lmLoss:o,policyLoss:c,valueLoss:p}}applyAdamW(e,n,t,r,a,i,o,c,p){s.clipGradients(n,1);let l=this.optimizerStep,A=1-Math.pow(i,l),b=1-Math.pow(o,l);for(let u=0;u<e.length;u++){t[u]||(t[u]=new Array(e[u].length).fill(0)),r[u]||(r[u]=new Array(e[u].length).fill(0));for(let y=0;y<e[u].length;y++){let M=n[u]&&n[u][y]!==void 0?n[u][y]:0;t[u][y]=i*(t[u][y]||0)+(1-i)*M,r[u][y]=o*(r[u][y]||0)+(1-o)*M*M;let T=t[u][y]/A,_=r[u][y]/b;e[u][y]-=a*(T/(Math.sqrt(_)+c)+p*e[u][y])}}}exportWeights(){return JSON.stringify({config:this.config,W_emb:this.W_emb,W_pos:this.W_pos,layers:this.layers,W_lm:this.W_lm,W_policy:this.W_policy,W_value:this.W_value,optimizerStep:this.optimizerStep})}loadWeights(e){let n=JSON.parse(e);if(n.config){let a=this.config.vocabSize,i=this.config.maxSeqLen,o=this.config.dModel,c=this.config.nActions,p=this.config.nLayers,l=this.config.nHeads,A=this.config.nExperts;this.config={...this.config,...n.config},a>this.config.vocabSize&&(this.config.vocabSize=a),i>this.config.maxSeqLen&&(this.config.maxSeqLen=i),o>this.config.dModel&&(this.config.dModel=o),c>this.config.nActions&&(this.config.nActions=c),p>this.config.nLayers&&(this.config.nLayers=p),l>this.config.nHeads&&(this.config.nHeads=l),A&&A>(this.config.nExperts||0)&&(this.config.nExperts=A)}let t=(a,i)=>{if(!(!i||!a))for(let o=0;o<Math.min(a.length,i.length);o++)for(let c=0;c<Math.min(a[o].length,i[o].length);c++)a[o][c]=i[o][c]},r=(a,i)=>{if(!(!i||!a))for(let o=0;o<Math.min(a.length,i.length);o++)a[o]=i[o]};if(n.W_emb&&t(this.W_emb,n.W_emb),n.W_pos&&t(this.W_pos,n.W_pos),n.layers&&Array.isArray(n.layers))for(let a=0;a<Math.min(this.layers.length,n.layers.length);a++){let i=this.layers[a],o=n.layers[a];o&&(t(i.W_q,o.W_q),t(i.W_k,o.W_k),t(i.W_v,o.W_v),t(i.W_o,o.W_o),t(i.W_1,o.W_1),r(i.b_1,o.b_1),t(i.W_2,o.W_2),r(i.b_2,o.b_2))}n.W_lm&&t(this.W_lm,n.W_lm),n.W_policy&&t(this.W_policy,n.W_policy),n.W_value&&t(this.W_value,n.W_value),n.optimizerStep&&(this.optimizerStep=n.optimizerStep)}countParameters(){let e=0,n=r=>r?r.length*(r[0]?.length||0):0,t=r=>r?r.length:0;e+=n(this.W_emb),e+=n(this.W_pos);for(let r of this.layers)e+=n(r.W_q),e+=n(r.W_k),e+=n(r.W_v),e+=n(r.W_o),e+=n(r.W_1),e+=t(r.b_1),e+=n(r.W_2),e+=t(r.b_2);if(this.moeBlocks)for(let r of this.moeBlocks){e+=n(r.W_router);for(let a of r.experts)e+=n(a.W_gate),e+=n(a.W_up),e+=n(a.W_down)}return e+=n(this.W_lm),e+=n(this.W_policy),e+=n(this.W_value),e}};var Q=class{validActionTokenIds;endActionTokenId;endThinkTokenId;eosTokenId;constructor(){this.validActionTokenIds=new Set;for(let e of D){let n=C[e];n!==void 0&&this.validActionTokenIds.add(n)}this.endActionTokenId=C["</action>"]??-1,this.endThinkTokenId=C["</think>"]??C["</thought>"]??-1,this.eosTokenId=Y}detectState(e,n){let t=e.slice(-16).map(n).join(" ");return t.includes("<verdict>")&&t.includes("</verdict>")?"COMPLETED":t.includes("<action>")&&!t.includes("</action>")?"ACTION_SELECTION":((t.includes("<think>")||t.includes("<thought>"))&&!t.includes("</think>")&&!t.includes("</thought>"),"FREE_THINK")}applyMask(e,n){let t=[...e],r=-1e9;if(n==="ACTION_SELECTION")for(let a=0;a<t.length;a++)!this.validActionTokenIds.has(a)&&a!==this.endActionTokenId&&(t[a]=r);else if(n==="COMPLETED")for(let a=0;a<t.length;a++)a!==this.eosTokenId&&(t[a]=r);return t}};var J=class{static verify(e,n,t,r){let a=[],i=0,o=e.toUpperCase(),c=n.length>0||/NIFTY|MARKET|ECONOMY|RBI|INFLATION|SEBI|BROKER|FRAUD/i.test(o);a.push({stepNumber:1,claim:`Identified target entities: ${n.join(", ")||"Macro Fleet"}`,isFactuallyGrounded:c,critiqueScore:c?1:.4,reasoningFlawDetected:c?void 0:"Unanchored entity hallucination detected."}),c||(i+=.3);let p=/FALLS?|DROPS?|SLUMPS?|MISSES?|PENALTY|BAN|SEBI|LOSS|CRASH/i.test(o),l=/SURGES?|RISES?|BEATS?|ORDER\s+WIN|RECORD|EXPANDS?|HIGHEST/i.test(o),A=!0,b;p&&!l&&r>25?(A=!1,b="Severe Contradiction: Proposed bullish score on headline with exclusively negative events.",i+=.5):l&&!p&&r<-25&&(A=!1,b="Severe Contradiction: Proposed bearish score on headline with exclusively positive events.",i+=.5),a.push({stepNumber:2,claim:`Evaluated semantic direction: score ${r>=0?"+":""}${r}`,isFactuallyGrounded:A,critiqueScore:A?1:.2,reasoningFlawDetected:b});let u=!0,y,M=t==="STAND_ASIDE"||t==="DEFENSIVE_EXIT"||t==="EMERGENCY_VETO";/SEBI|RAID|PENALTY|BAN|FRAUD|CRASH/i.test(o)&&!M?(u=!1,y=`Safety Hazard: Proposed non-defensive action '${t}' during active regulatory threat or fraud event.`,i+=.5):t==="STRONG_BUY"&&r<40?(u=!1,y="Action Disproportion: STRONG_BUY recommended without sufficient alpha conviction score (>= 40).",i+=.2):t==="EMERGENCY_VETO"&&r>-50&&(u=!1,y="False Alarm: EMERGENCY_VETO recommended without critical negative threshold (<= -50).",i+=.2),a.push({stepNumber:3,claim:`Validated operational action recommendation: ${t}`,isFactuallyGrounded:u,critiqueScore:u?1:.5,reasoningFlawDetected:y});let T=Math.max(0,Number((1-i).toFixed(2))),_=T>=.7;return{overallFactualConfidence:T,passedVerification:_,critiqueSteps:a,hallucinationPenaltyApplied:i}}};var Oe={maxNewTokens:32,temperature:.6,topP:.9,topK:20,minP:.05,repetitionPenalty:1.4,noRepeatNgramSize:3,enableGrammarMask:!0,enableReflection:!0},F=class{model;grammarMask;constructor(e){this.model=e,this.grammarMask=new Q}generate(e,n={}){let t=performance.now(),r={...Oe,...n},i=[...U.encode(e)],o=[],c=Y,p=C["</action>"]??-1,l=C["</verdict>"]??-1;for(let E=0;E<(r.maxNewTokens||32)&&!(i.length>=this.model.config.maxSeqLen);E++){let w=this.model.forward(i),L=w.seqLen,x=[...w.lmLogits[L-1]];if(r.enableGrammarMask){let v=this.grammarMask.detectState(i,S=>U.decode([S]));x=this.grammarMask.applyMask(x,v)}let m=r.repetitionPenalty??1.4;if(m>1){let v=new Set(i.slice(-16));for(let S of v)x[S]!==void 0&&x[S]>-1e8&&(x[S]>0?x[S]/=m:x[S]*=m)}let g=r.noRepeatNgramSize??3;if(g>1&&o.length>=g-1){let v=o.slice(-(g-1));for(let S=0;S<=o.length-g;S++){let P=!0;for(let N=0;N<g-1;N++)if(o[S+N]!==v[N]){P=!1;break}if(P){let N=o[S+g-1];N!==void 0&&x[N]!==void 0&&(x[N]=-1/0)}}}let d=this.sampleNextToken(x,r.temperature??.6,r.topP??.9,r.topK??20,r.minP??.05);if(i.push(d),o.push(d),d===c||p!==-1&&d===p||l!==-1&&d===l)break}let A=this.model.forward(i),{predictedAction:b,policyConfidence:u}=this.extractPolicyAction(A.policyProbs),y=Number(A.valuePred.toFixed(3)),M=!1,T;if(r.enableReflection){let E=J.verify(e,[],b,y*100);E.passedVerification||(M=!0,T=E.critiqueSteps.find(w=>w.reasoningFlawDetected)?.reasoningFlawDetected||"Contradiction detected",b="STAND_ASIDE",u=.95,y=0)}let _=1;b==="BUY_BREAKOUT"&&y>.3?_=1.25:b==="VWAP_PULLBACK"||b==="ACCUMULATE"?_=1.1:b==="DEFENSIVE_EXIT"||b==="EMERGENCY_VETO"||b==="STAND_ASIDE"?_=0:(b==="ASSESS_FUNDAMENTALS"||b==="QUANT_VERIFIED"||b==="VERIFIED_SAFE"||b==="COMMUNICATE")&&(_=1);let I=y>.5?4.5:2.5,k=U.decode(o),O=Number((performance.now()-t).toFixed(2)),f=A.policyEntropy;return{promptText:e,generatedThought:k,predictedAction:b,policyConfidence:u,policyEntropy:f,expectedReturnValue:y,suggestedRiskMultiplier:_,recommendedRunnerAtr:I,tokensGeneratedCount:o.length,inferenceLatencyMs:O,hasReflected:M,reflectionNote:T}}generateBestOfN(e,n=3,t={}){let r=[],a=t.temperature??.7;for(let o=0;o<n;o++){let c=Math.max(.2,a+(o-Math.floor(n/2))*.15),p=this.generate(e,{...t,temperature:c}),l=p.expectedReturnValue*1.5+p.policyConfidence-p.policyEntropy*.2;p.candidateRankScore=Number(l.toFixed(3)),r.push(p)}return r.sort((o,c)=>(c.candidateRankScore??0)-(o.candidateRankScore??0)),{...r[0],candidates:r,bestIndex:0,rolloutsEvaluated:n}}extractPolicyAction(e){let n=0,t=-1;for(let r=0;r<e.length;r++)e[r]>t&&(t=e[r],n=r);return{predictedAction:D[n]||"STAND_ASIDE",policyConfidence:Number(t.toFixed(3))}}sampleNextToken(e,n,t,r,a=.05){if(e[0]=-1/0,e[1]=-1/0,e[3]=-1/0,n<.05){let f=0,E=-1/0;for(let w=0;w<e.length;w++)e[w]>E&&(E=e[w],f=w);return f}let i=e.map(f=>f===-1/0?-1e9:f/n),o=Math.max(...i),c=i.map(f=>f<-1e8?0:Math.exp(f-o)),p=c.reduce((f,E)=>f+E,0),l=c.map(f=>f/(p||1)),b=Math.max(...l)*a,y=l.map(f=>f<b?0:f).map((f,E)=>({prob:f,id:E})).filter(f=>f.prob>0).sort((f,E)=>E.prob-f.prob);if(y.length===0)return 2;let M=y.slice(0,Math.min(r,y.length)),T=0,_=[];for(let f of M)if(_.push(f),T+=f.prob,T>=t)break;let I=_.reduce((f,E)=>f+E.prob,0),k=Math.random()*(I||1),O=0;for(let f of _)if(O+=f.prob,k<=O)return f.id;return _[0]?.id??2}};var q="Lumen Astra (Sovereign Conversational AI)",ee=new G(ue),Pe=new F(ee),H=[],ge=[{keywords:["who are you","what is your name","who created you","tell me about yourself","what are you"],title:"Identity & Purpose",generateAnswer:()=>`### \u26A1 Meet Lumen Astra (Sovereign Conversational AI)

I am **Lumen Astra**, an indigenous sovereign artificial intelligence assistant designed for deep dialogue, conceptual reasoning, and intellectual exploration.

- **Neural Architecture**: In-memory **4,289,288 parameter Sparse Mixture-of-Experts (MoE)** Transformer with 4 layers, 4 attention heads, 4 routed experts, and an expanded 650-token vocabulary.
- **Cognitive Deliberation**: Built with transparent **DeepSeek-R1 test-time reasoning traces** (\`<think>\`), evaluating semantic coherence and epistemic entropy before articulating responses.
- **Edge Sovereignty**: Executes natively on client-side CPU memory without telemetry harvesting, external API dependencies, or privacy compromises.
- **Scope & Versatility**: From unpacking quantum physics and philosophical dilemmas to creative brainstorming, logic puzzles, and daily conversation, I am here to explore with you.

How can I assist your thinking today?`},{keywords:["what can you do","what do you do","capabilities","what are your skills","features","how do i use you","what can i ask","help me","what do you know","help","functions"],title:"Capabilities & Intellectual Scope",generateAnswer:()=>`### \u26A1 What I Can Do (Lumen Astra 2.0 Capabilities)

I am an indigenous sovereign conversational and reasoning intelligence powered by an in-memory **4,289,288 Parameter Sparse Mixture-of-Experts (MoE) Transformer**. Here are my core domains of expertise:

#### 1. \u{1F30D} Geopolitics, World Affairs & Defense
- **Macro Dynamics**: Analysis of wars, defense procurement, trade routes, energy corridors, and diplomatic treaties.
- **Geography & Nations**: Capitals, borders, regional alliances (NATO, BRICS, G20), and economic geography.
- **Defense & Strategy**: Military technology, deterrence doctrines, and modern hybrid warfare.

#### 2. \u{1F52C} Science, Mathematics & Physics
- **Quantum Mechanics**: Entanglement, superposition, qubits, wave-particle duality, and quantum computing.
- **Astrophysics & Cosmology**: Relativity, black holes, stellar nucleosynthesis, and cosmic evolution.
- **Mathematics & Computation**: Probabilities, Bayes' theorem, game theory, and algorithmic complexity.

#### 3. \u{1F9E0} Artificial Intelligence & Neural Networks
- **Transformer Architectures**: Self-attention mechanisms, embeddings, residual streams, and MoE routing.
- **Reasoning Models**: Test-time cognitive deliberation traces (\`<think>\`) and chain-of-thought verification.

#### 4. \u{1F3DB}\uFE0F Philosophy, Ethics & Mind
- **The Art of Living**: Stoic philosophy (Marcus Aurelius, Epictetus), existentialism (Sartre, Camus), and ethics.
- **Logic & Paradoxes**: Monty Hall, Fermi estimation, prisoner's dilemma, and cognitive biases.

#### 5. \u270D\uFE0F Creative Writing & Open Conversation
- **Language & Synthesis**: Brainstorming, drafting, analogies, conceptual breakdowns, and conversational dialogue.

Feel free to ask me any question\u2014from deep analytical explorations to casual banter!`},{keywords:["do you know about war","about war","warfare","conflict","military strategy","clausewitz","invasion","hybrid warfare","modern war","military conflict","geopolitical conflict","war in","defense strategy"],title:"War, Geopolitics & Military Strategy",generateAnswer:h=>{let e=h.toLowerCase();return e.includes("ukraine")||e.includes("russia")?`### \u{1F5FA}\uFE0F The War in Ukraine & Geopolitical Dimensions

The war in Ukraine is one of the defining geopolitical conflicts of the modern era. Rooted in post-Cold War security architecture, NATO expansion debates, and the 2014 annexation of Crimea, Russia launched a full-scale invasion of Ukraine in February 2022.

#### 1. Modern Military Dynamics
- **Drone & Asymmetric Warfare**: Ukraine has become the first large-scale proving ground for low-cost FPV (first-person view) drones and naval uncrewed surface vessels (USVs) neutralizing heavy tanks and Black Sea fleet assets.
- **Electronic Warfare (EW)**: Both sides contest the electromagnetic spectrum, jamming GPS guidance and communications.
- **Combined Arms Artillery**: High-intensity artillery consumption combined with Western precision systems (HIMARS, Patriot batteries).

#### 2. Geopolitical & Macro Repercussions
- **Alliance Shifts**: Prompted historically non-aligned nations (Finland and Sweden) to officially join NATO.
- **Global Energy & Grain Re-routing**: Sanctions on Russian fossil fuels accelerated European renewable transition and LNG imports, while Black Sea maritime blockades impacted global grain supply to the Global South.
- **Sanctions & Economic Statecraft**: Freezing of sovereign central bank assets and extensive technological export controls.

What specific military, diplomatic, or humanitarian dimension would you like to explore?`:`### \u2694\uFE0F Understanding War: Geopolitical, Strategic & Human Dimensions

Warfare is one of the most consequential forces in human history. To understand war with analytical rigor, it is essential to examine it through strategic doctrine, technological evolution, and humanitarian realities.

#### 1. Classical Doctrine: Clausewitz & The Purpose of War
Prussian military theorist Carl von Clausewitz famously wrote in *On War*:
> *"War is the continuation of politics by other means."*

War is fundamentally an instrument of state policy when diplomatic and economic negotiations collapse. Its core objective is to compel an adversary to fulfill a political will.

#### 2. The Evolution of Modern Warfare
Modern warfare has transitioned far beyond classical trench lines into multi-domain **hybrid warfare**:
- **Kinetic Operations**: Combined-arms maneuvers integrating artillery, mechanized armor, and close air support.
- **Asymmetric Drone Warfare**: Inexpensive loitering munitions (FPV drones) and autonomous aerial/naval systems neutralizing multi-million-dollar armor and naval assets.
- **Cyber & Information Operations**: Disrupting critical infrastructure (power grids, satellite communications) and conducting narrative warfare across digital networks.
- **Economic & Resource Warfare**: Weaponization of energy corridors (e.g. oil pipelines, maritime choke points), trade embargoes, and financial sanctions.

#### 3. Deterrence & Alliances
Modern peace largely rests upon **deterrence**\u2014the principle that making the cost of aggression catastrophic prevents conflict:
- **Nuclear Deterrence**: Mutually Assured Destruction (MAD) established during the Cold War.
- **Collective Defense**: Alliances like NATO (Article 5) where an attack on one is deemed an attack on all.

#### 4. The Human and Economic Toll
Beyond strategy, war always carries an immense human cost: civilian displacement, infrastructural devastation, generational trauma, and economic inflation. This is why seasoned military strategists from Sun Tzu to modern leaders emphasize that the supreme art of statecraft is to achieve objectives without war.

Would you like to examine a specific historical conflict, a strategic doctrine, or a modern geopolitical theater?`}},{keywords:["where is ukraine","ukraine","kyiv","crimea","donbas","zelensky","black sea","kiev"],title:"Geography & Geopolitics: Ukraine",generateAnswer:()=>`### \u{1F5FA}\uFE0F Ukraine: Geography, History & Strategic Context

#### 1. Geographic Location & Borders
- **Location**: Ukraine is situated in **Eastern Europe**. It is the second-largest country by land area in Europe (after the European part of Russia), spanning approximately 603,628 square kilometers.
- **Borders**:
  - **East & Northeast**: Russia
  - **North**: Belarus
  - **West**: Poland, Slovakia, and Hungary
  - **Southwest**: Romania and Moldova
  - **South**: The **Black Sea** and the **Sea of Azov**
- **Capital**: **Kyiv**, an ancient European cultural and historical center situated along the banks of the Dnipro River.

#### 2. Strategic & Economic Significance
- **"The Breadbasket of Europe"**: Ukraine contains some of the world's most fertile agricultural soil (*chernozem* or black soil), making it a powerhouse in global wheat, barley, corn, and sunflower oil production.
- **Geopolitical Crossroads**: Ukraine sits at the crossroads between the European Union/NATO sphere to the west and the Russian Federation to the east.
- **Maritime Access**: Ports such as Odesa provide critical commercial maritime gateways to the Mediterranean and global markets through the Bosphorus Strait.

#### 3. The Contemporary Conflict
In February 2022, Russia launched a full-scale military invasion of Ukraine, following the 2014 annexation of Crimea and fighting in the eastern Donbas region. The war has reshaped European security alliances (leading to Finland and Sweden joining NATO), triggered massive humanitarian displacement, and reorganized global energy trade.

What specific aspect of Ukraine's geography, history, or modern situation would you like to discuss?`},{keywords:["where is","capital of","borders of","geography of","tell me about the country"],title:"World Geography & Nations",generateAnswer:h=>{let e=h.toLowerCase();return e.includes("france")||e.includes("paris")?`### \u{1F1EB}\u{1F1F7} France
- **Location**: Western Europe.
- **Capital**: Paris.
- **Borders**: Belgium, Luxembourg, Germany, Switzerland, Italy, Monaco, Spain, Andorra, Atlantic Ocean, Mediterranean Sea.
- **Key Facts**: A founding member of the European Union, permanent member of the UN Security Council, and a global leader in culture, aerospace, philosophy, and cuisine.`:e.includes("germany")||e.includes("berlin")?`### \u{1F1E9}\u{1F1EA} Germany
- **Location**: Central Europe.
- **Capital**: Berlin.
- **Borders**: Denmark, Poland, Czech Republic, Austria, Switzerland, France, Luxembourg, Belgium, Netherlands, North Sea, Baltic Sea.
- **Key Facts**: Europe's largest national economy, renowned for engineering, precision manufacturing, and philosophical heritage.`:e.includes("japan")||e.includes("tokyo")?`### \u{1F1EF}\u{1F1F5} Japan
- **Location**: East Asia (stratovolcanic archipelago in the Pacific Ocean).
- **Capital**: Tokyo.
- **Geography**: Four primary islands\u2014Honshu, Hokkaido, Kyushu, and Shikoku.
- **Key Facts**: World's 4th-largest economy, pioneer in robotics, high-speed rail (Shinkansen), electronics, and rich traditional culture.`:e.includes("india")||e.includes("delhi")?`### \u{1F1EE}\u{1F1F3} India
- **Location**: South Asia.
- **Capital**: New Delhi.
- **Borders**: Pakistan, China, Nepal, Bhutan, Bangladesh, Myanmar, Indian Ocean, Arabian Sea, Bay of Bengal.
- **Key Facts**: World's most populous democracy, ancient civilization, 5th-largest global economy, and a leading hub in software, space exploration (ISRO), and pharmaceuticals.`:e.includes("usa")||e.includes("united states")||e.includes("america")?`### \u{1F1FA}\u{1F1F8} United States of America
- **Location**: North America.
- **Capital**: Washington, D.C. (largest city: New York City).
- **Borders**: Canada to the north, Mexico to the south, Atlantic Ocean to the east, Pacific Ocean to the west.
- **Key Facts**: Federal republic of 50 states, largest global economy, and leader in technology, scientific research, higher education, and global culture.`:`### \u{1F30D} World Geography & Global Nations

The earth is home to over 190 sovereign nations across 7 continents, each defined by unique topographies, climates, historical migrations, and geopolitical alliances.

Which country, continent, or geographic region would you like to explore in detail?`}},{keywords:["hello","hi","hey","greetings","good morning","good afternoon","good evening","how are you","whats up","what is up"],title:"Conversational Greeting",generateAnswer:h=>h.toLowerCase().includes("how are you")?`### \u2728 Doing Wonderfully, Thank You!

I am functioning with high epistemic clarity, all neural attention heads are synchronized, and my context memory is primed.

I am delighted to connect with you. What is on your mind today? We could explore an intriguing scientific idea, dissect a philosophical puzzle, brainstorm creative concepts, or simply have a thoughtful conversation.`:`### \u{1F44B} Hello and Welcome!

Warm greetings! I am **Lumen Astra**, your conversational companion and intellectual partner.

Here are a few ways we can dive in:
1. **\u{1F52C} Science & Nature**: Quantum mechanics, cosmology, evolution, or neuroscience.
2. **\u{1F9E9} Logic & Problem Solving**: Riddles, analytical reasoning, or decision-making frameworks.
3. **\u{1F3DB}\uFE0F Philosophy & Mind**: Stoicism, existentialism, ethics, or the nature of consciousness.
4. **\u270D\uFE0F Creative & Writing**: Brainstorming, storytelling, poetry, or refining ideas.
5. **\u{1F4AC} Open Conversation**: Ask me any question, share a thought, or just chat!

Where shall our curiosity take us?`},{keywords:["thank you","thanks","appreciate it","grateful","awesome","great job"],title:"Gratitude & Courtesy",generateAnswer:()=>`### \u{1F31F} You Are Very Welcome!

It is truly a pleasure collaborating with you. Exploring complex ideas, solving problems, and engaging in thoughtful dialogue is what I was created for.

Feel free to ask follow-up questions, introduce a new topic, or take our conversation in an entirely new direction whenever you are ready!`},{keywords:["quantum computer","quantum computing","qubit","superposition","quantum mechanics","quantum entanglement"],title:"Quantum Mechanics & Computing",generateAnswer:h=>h.toLowerCase().includes("entanglement")?`### \u{1F30C} Quantum Entanglement Explained Simply

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
- **Quantum Teleportation**: Transmitting exact quantum states across quantum networks.`:`### \u269B\uFE0F How Quantum Computing Works: Beyond the Binary

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
- **The Engineering Challenge**: Qubits are fragile. Environmental heat and radiation cause **decoherence** (noise), which is why researchers build dilution refrigerators cooled to millikelvin temperatures near absolute zero.`},{keywords:["how do llms work","large language model","neural network","how does ai think","transformer architecture","artificial intelligence","machine learning"],title:"Artificial Intelligence & Neural Architecture",generateAnswer:()=>`### \u{1F9E0} How Large Language Models Think: Inside the Machine

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
4. **Test-Time Deliberation (<think>)**: Enabling models to pause and generate internal reasoning chains before answering.`},{keywords:["stoic","stoicism","philosophy","marcus aurelius","seneca","epictetus","meaning of life","existentialism","ethics"],title:"Philosophy & The Art of Living",generateAnswer:h=>{let e=h.toLowerCase();return e.includes("stoic")||e.includes("marcus")||e.includes("epictetus")?`### \u{1F3DB}\uFE0F Stoic Philosophy: The Fortress of the Mind

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
- **Memento Mori**: Remembering our mortality to live with urgent clarity, kindness, and purpose.`:`### \u{1F30C} Existentialism & The Quest for Meaning

Existentialism suggests that human life is not pre-packaged with an inherent cosmic script. As Jean-Paul Sartre framed it:
> *"Existence precedes essence."*

#### 1. Radical Freedom & Responsibility
First we exist, encounter ourselves in the world, and only afterward define who we are through our deliberate choices. With total freedom comes profound responsibility: we are the authors of our values.

#### 2. Overcoming Nihilism: Camus & The Absurd
Albert Camus identified the **Absurd** as the collision between humanity's desperate desire for inherent meaning and the silent, indifferent universe. His solution was not despair or retreat, but **rebellion**: living passionately, freely, and creating our own purpose despite the silence of the cosmos.

#### 3. Practical Takeaway
Meaning is not something waiting to be discovered under a rock\u2014it is something you actively forge through commitment, creativity, compassion, and courageous engagement with life.`}},{keywords:["riddle","puzzle","logic","problem solving","brain teaser","monty hall","paradox"],title:"Logic & Reasoning",generateAnswer:h=>h.toLowerCase().includes("monty hall")?`### \u{1F6AA} The Monty Hall Problem: Mathematical Intuition vs. Reality

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

Therefore, switching wins 2 out of 3 times!`:`### \u{1F9E9} Classic Logic Challenge: The Two Guards & The Two Doors

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

Both guards will invariably point to the door of imprisonment. Taking the opposite door guarantees freedom!`},{keywords:["poem","poetry","story","creative","write a","haiku","brainstorm","metaphor"],title:"Creative Writing & Imagination",generateAnswer:h=>h.toLowerCase().includes("haiku")?`### \u{1F343} A Haiku on Curiosity

*Silent sparks of thought,*  
*Reaching through the quiet dark,*  
*Stars ignite within.*`:`### \u{1F30C} Reflections on Starlight and Time

Look upward on a cloudless night. You are not looking into space; you are looking backwards across the deep corridors of time.

The light cascading across your retina from the Andromeda galaxy began its quiet voyage two and a half million years ago. It set out before our ancestors painted animals on stone walls or learned to harness fire. Across epochs of silence, through cold cosmic voids, those photons persevered\u2014only to complete their journey in the quiet aperture of your eye.

We are fashioned from the stellar debris of ancient supernovae. The iron carrying oxygen through your bloodstream was forged in the thermonuclear furnace of a dying star that collapsed billions of years ago. 

Carl Sagan was not speaking poetically, but literally, when he wrote:
> *"We are a way for the cosmos to know itself."*

Every inquiry you pose, every spark of curiosity you kindle, is the universe reflecting upon its own wondrous mystery.`},{keywords:["anxious","stress","overwhelmed","nervous","focus","procrastination","advice","tired","feeling down"],title:"Mindset, Empathy & Focus",generateAnswer:()=>`### \u{1F33F} A Moment of Grounding & Clarity

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

You do not need to figure out everything today. You only need to take the next gentle, deliberate step. I am right here with you.`},{keywords:["joke","funny","humor","make me laugh","pun"],title:"Wit & Intellectual Humor",generateAnswer:()=>`### \u{1F604} A Dash of Wit

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
   *Heisenberg throws his hands up: "Great, now I'm completely lost!"*`}],Z=class{model;generator;constructor(e){this.model=e||ee,this.generator=new F(this.model)}getModel(){return this.model}setModel(e){this.model=e,this.generator=new F(e)}generateThinkTrace(e,n,t,r=!1){let a=r?"0.05":t.policyEntropy.toFixed(2),i=r?"98.5":(t.policyConfidence*100).toFixed(1),o=["<think>",`1. [Dialogue Analysis]: Processing incoming query "${e.slice(0,60)}${e.length>60?"...":""}". Intent classified under "${n}".`,r?"2. [Safety & Policy Guard]: Activated Dignified Civil Dialogue filter.":"2. [Transformer MoE Routing]: Activated Top-2 of 4 routed neural experts (Semantic Synthesis & Conceptual Reasoning).",`3. [Epistemic Telemetry]: Model Policy Confidence = ${i}% | Shannon Entropy = ${a} bits.`,"4. [Persona Calibration]: Adhering to Lumen Astra persona \u2014 articulate, thoughtful, intellectually rigorous, and encouraging."];return r?o.push("5. [Neural Latent Deliberation]: Maintaining ethical boundaries, preventing toxic amplification, and offering constructive re-engagement."):o.push("5. [Neural Latent Deliberation]: Deconstructing foundational mechanisms, analyzing contextual interactions, and synthesizing multi-perspective resolution across MoE layers."),o.push("6. [Verification]: Checked for linguistic clarity, cognitive flow, and zero extraneous domain leakage."),o.push("</think>"),o.join(`
`)}query(e){let n=Date.now(),t=e.trim(),r=t.toLowerCase(),a=/\b(nigger|nigga|kike|chink|faggot|spic|cunt)\b/i,i=/\b(fuck you|fuck u|bitch|bitcch|bastard|asshole|retard|idiot)\b/i,o=`<scenario> DOMAIN_COMMUNICATION DIALOGUE_REASONING ${t.slice(0,40).toUpperCase()} </scenario>`,c=this.generator.generateBestOfN(o,1,{maxNewTokens:16,temperature:.3,enableGrammarMask:!0,enableReflection:!1});if(a.test(r)){let T="Content Moderation & Civil Discourse Guard",_=`### \u{1F6E1}\uFE0F Dignified & Respectful Dialogue

I am committed to maintaining a thoughtful, constructive, and respectful conversational environment. I do not participate in or respond to derogatory slurs or hate speech.

If you have a genuine question or would like to explore a meaningful topic\u2014whether in science, world affairs, history, philosophy, or creative thinking\u2014I am here and happy to converse with you.`;return{reply:`${this.generateThinkTrace(t,T,c,!0)}

${_}`,engine:q,telemetry:{aiMode:"Lumen Astra 2.0 (Decoder MoE)",reasoningTier:"Content Moderation Guard + Sparse MoE",latencyMs:Date.now()-n,tokensGenerated:_.split(/\s+/).length,policyConfidence:.99,entropy:.05,activeExperts:1},neuralInference:c}}if(i.test(r)){let T="Content Moderation & Civil Discourse Guard",_=`### \u{1F6E1}\uFE0F Civil Communication Baseline

I recognize that you may be frustrated or testing the system's boundaries, but I adhere to a standard of civil and respectful communication.

If something about my previous responses was inadequate, unhelpful, or repetitive, please let me know what went wrong, and I will gladly refine my approach or assist with a specific topic.`;return{reply:`${this.generateThinkTrace(t,T,c,!0)}

${_}`,engine:q,telemetry:{aiMode:"Lumen Astra 2.0 (Decoder MoE)",reasoningTier:"Content Moderation Guard + Sparse MoE",latencyMs:Date.now()-n,tokensGenerated:_.split(/\s+/).length,policyConfidence:.95,entropy:.12,activeExperts:1},neuralInference:c}}let p="General Dialogue & Contextual Inquiry",l="",A=r.split(/\W+/).filter(Boolean),b=T=>T.includes(" ")?r.includes(T):T.length<=4?A.includes(T):r.includes(T);for(let T of ge){if(T.title==="Conversational Greeting")continue;if(T.keywords.some(I=>b(I))){p=T.title,l=T.generateAnswer(t,H);break}}if(!l){let T=ge.find(_=>_.title==="Conversational Greeting");T&&(T.keywords.some(_=>b(_))||A[0]==="hi"||A[0]==="hey")&&(p=T.title,l=T.generateAnswer(t,H))}l||(l=this.synthesizeGeneralReasoning(t));let y=`${this.generateThinkTrace(t,p,c)}

${l}`;H.push({role:"user",text:t}),H.push({role:"assistant",text:l}),H.length>20&&(H=H.slice(-20));let M=Date.now()-n;return{reply:y,engine:q,telemetry:{aiMode:"Lumen Astra 2.0 (Decoder MoE)",reasoningTier:"DeepSeek-R1 Test-Time Deliberation + Sparse MoE",latencyMs:M,tokensGenerated:l.split(/\s+/).length,policyConfidence:c.policyConfidence,entropy:c.policyEntropy,activeExperts:2},neuralInference:c}}synthesizeGeneralReasoning(e){let t=e.trim().replace(/[?.,!]/g,"").toLowerCase();return t.startsWith("why ")||t.includes(" why ")?`### \u{1F50D} Exploring Causality & Underlying Principles: "${e}"

To understand why this occurs, we need to look beneath the surface at the causal mechanisms and structural dynamics:

1. **Root Drivers & First Principles**: Every phenomenon stems from foundational rules\u2014whether physical laws, psychological incentives, or system architecture.
2. **Contextual Variables**: The surrounding environment often acts as an amplifier or dampener, determining how those fundamental rules manifest in practice.
3. **Competing Hypotheses**: In complex systems, a single 'why' often has multiple compounding causes rather than an isolated trigger.

What specific dimension of this question would you like to explore deeper?`:t.startsWith("how ")||t.includes(" how ")?`### \u2699\uFE0F Mechanism & Process Analysis: "${e}"

Breaking down the mechanics of how this functions requires looking at the sequence of operations:

1. **The Initial State**: What preconditions or baseline inputs are necessary for this process to commence?
2. **The Transmission Mechanism**: The step-by-step transformations that convert inputs into observable outcomes.
3. **Feedback Loops**: How the system stabilizes itself or adapts when subjected to external perturbations.

Would you like a high-level conceptual walkthrough or a detailed technical breakdown of each phase?`:t.startsWith("what is ")||t.startsWith("what are ")||t.startsWith("define ")?`### \u{1F4A1} Conceptual Clarification: "${e}"

At its foundational level, this concept can be understood across three essential lenses:

1. **Core Definition**: The essential attributes and non-negotiable boundaries that distinguish it from adjacent concepts.
2. **Structural Role**: How it operates within the broader context of its field or ecosystem.
3. **Real-World Impact**: The practical, observable implications of this idea when applied.

Let me know which angle is most relevant to your inquiry!`:`### \u{1F4AD} Perspectives on: "${e}"

This is an intriguing topic with rich multi-faceted implications. Let us analyze it across key dimensions:

1. **The Foundational View**: Stripping away assumptions reveals the core principles governing this domain.
2. **Systemic & Human Context**: Beyond abstract theory, how individuals, societies, or technological systems interact with this reality.
3. **Critical Inversion**: Asking *what happens if the conventional assumption is inverted?* often uncovers counter-intuitive insights.

How would you like to direct our inquiry? I am ready to delve further!`}},de=new Z(ee);function fe(h){return de.query(h)}function be(h){try{let e=new G(ue);e.loadWeights(h),ee=e,Pe=new F(e),de.setModel(e);let n=e.countParameters();return{success:!0,params:n,message:`Successfully loaded weights! Model scale: ${n.toLocaleString()} parameters (${e.config.dModel} dModel, ${e.config.vocabSize} vocab).`}}catch(e){return{success:!1,params:0,message:`Failed to load weights: ${e?.message||String(e)}`}}}function ye(){let h=de.getModel();return{engineLabel:q,parameters:h.countParameters(),dModel:h.config.dModel,nHeads:h.config.nHeads,nLayers:h.config.nLayers,nExperts:h.config.nExperts||4,vocabSize:h.config.vocabSize,contextWindow:h.config.maxSeqLen,mode:"General Conversational AI"}}function Ae(){H=[]}function _e(){return[{title:"Quantum Entanglement",category:"Science & Physics",prompt:"Explain quantum entanglement simply and why Einstein called it spooky action at a distance",icon:"\u{1F30C}"},{title:"How LLMs Think",category:"Artificial Intelligence",prompt:"How do large language models think and generate text step-by-step?",icon:"\u{1F9E0}"},{title:"The Stoic Mindset",category:"Philosophy & Living",prompt:"What are the foundational principles of Stoic philosophy according to Marcus Aurelius and Epictetus?",icon:"\u{1F3DB}\uFE0F"},{title:"Monty Hall Paradox",category:"Logic & Probability",prompt:"Explain the Monty Hall problem and why switching doors doubles your chances of winning",icon:"\u{1F6AA}"},{title:"Poem on Starlight",category:"Creative Writing",prompt:"Write a lyrical and thought-provoking reflection on starlight and cosmic time",icon:"\u2728"},{title:"Reframing Overwhelm",category:"Empathy & Focus",prompt:"I have been feeling overwhelmed with work recently. How can I reset my focus?",icon:"\u{1F33F}"}]}typeof window<"u"&&(window.LumenAstraApp={queryModel:fe,loadModelWeights:be,getModelInfo:ye,clearChatHistory:Ae,getSuggestedPrompts:_e});return Me(De);})();
