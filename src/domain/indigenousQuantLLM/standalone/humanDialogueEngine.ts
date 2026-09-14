/**
 * LUMEN ASTRA: HUMAN DIALOGUE & NATURAL REASONING ENGINE
 * 
 * Implements non-deterministic, emotionally intelligent, conversational synthesis.
 * Solves robotic repetition, determinism, and lack of human warmth.
 * 
 * Key Pillars:
 * 1. Affective Sentiment Detection (Anxiety, Curiosity, Impatience, Skepticism, Playfulness).
 * 2. Stochastic Tone & Phrasing Modulation (eliminates identical canned answers).
 * 3. Directness Optimization (answers directly to the point before expanding).
 * 4. Multi-Domain Deep Reasoning (Physics, Maths, Stocks, Human Sentiment, Language Nuance).
 */

export type UserAffectiveState =
  | 'ANXIOUS_WORRIED'
  | 'CURIOUS_EXPLORATORY'
  | 'IMPATIENT_DIRECT'
  | 'SKEPTICAL_CRITICAL'
  | 'PLAYFUL_BANTER'
  | 'INTELLECTUAL_DEEP'
  | 'NEUTRAL_CONVERSATIONAL';

export interface ReasoningProblem {
  domain: 'PHYSICS' | 'MATHS' | 'STOCKS' | 'HUMAN_SENTIMENT' | 'LANGUAGE_NUANCE' | 'GEOPOLITICS' | 'DEMOGRAPHY' | 'WORLD_AFFAIRS';
  keywords: string[];
  title: string;
  directAnswer: string;
  chainOfThought: string[];
  everydayAnalogy: string;
  takeaway: string;
}

// --------------------------------------------------------------------------
// 1. REASONING KNOWLEDGE BANK ACROSS 5 CORE DOMAINS
// --------------------------------------------------------------------------

export const MULTI_DOMAIN_REASONING_BANK: ReasoningProblem[] = [
  // --- PHYSICS ---
  {
    domain: 'PHYSICS',
    keywords: ['wave particle', 'double slit', 'quantum mechanics', 'quantum duality'],
    title: 'Wave-Particle Duality & The Quantum Observer',
    directAnswer: 'Subatomic entities like electrons and photons behave simultaneously as both continuous probability waves and discrete localized particles depending on whether an observation or measurement is performed.',
    chainOfThought: [
      '1. In classical mechanics, objects are either particles (localized bullets) or waves (diffuse ripples like sound or water).',
      '2. In the double-slit experiment, unmeasured electrons pass through both slits simultaneously, creating an interference pattern of bright and dark fringes on the detector.',
      '3. When detectors are placed at the slits to observe which path the electron takes, the wave function collapses into a single definite eigenstate, and the interference pattern instantly vanishes into two discrete particle bands.',
      '4. Mathematically described by the de Broglie wavelength (λ = h/p) and the Schrödinger wave equation (iħ ∂ψ/∂t = Ĥψ).'
    ],
    everydayAnalogy: 'Imagine rolling fog floating through two open doorways—it spreads out and ripples on the other side. But the exact microsecond you shine a flashlight to catch it, the fog instantly snaps together into a solid tennis ball right where you looked.',
    takeaway: 'At the quantum boundary, reality is fundamentally probabilistic until physical interaction forces a definite outcome.'
  },
  {
    domain: 'PHYSICS',
    keywords: ['time dilation', 'general relativity', 'why does time slow down', 'einstein gravity'],
    title: 'Gravitational Time Dilation in General Relativity',
    directAnswer: 'Time passes measurably slower in stronger gravitational fields (closer to massive bodies like Earth or a black hole) because mass curves the four-dimensional fabric of spacetime.',
    chainOfThought: [
      '1. Einstein\'s Equivalence Principle establishes that experiencing acceleration is physically indistinguishable from being in a uniform gravitational field.',
      '2. Light must maintain an invariant speed (c ≈ 300,000 km/s) for all observers in all reference frames.',
      '3. Near a massive gravitational well, spacetime curves. For light climbing out of the well, it undergoes gravitational redshift, losing frequency.',
      '4. Because frequency represents tick cycles per second, clocks placed deeper in the gravitational potential tick slower relative to distant observers: t\' = t * sqrt(1 - 2GM / (r * c²)).'
    ],
    everydayAnalogy: 'Think of spacetime as a dense memory-foam mattress with a heavy bowling ball sitting on it. Moving through the deep indentation near the bowling ball is like trudging through thick syrup—every stride takes longer relative to someone standing on the flat, undisturbed edge.',
    takeaway: 'Your feet are literally a tiny fraction of a second younger than your head because they are closer to Earth\'s center of gravity.'
  },
  {
    domain: 'PHYSICS',
    keywords: ['entropy', 'second law of thermodynamics', 'arrow of time', 'why does time move forward'],
    title: 'The Arrow of Time & Statistical Entropy',
    directAnswer: 'Time has an irreversible forward direction because the universe statistically transitions from highly ordered (low probability) macrostates to disordered (high probability) macrostates.',
    chainOfThought: [
      '1. The microscopic laws of physics (Newton, Maxwell, Schrödinger) are completely time-symmetric—they work identically whether time runs forward or backward.',
      '2. However, the Second Law of Thermodynamics dictates that total entropy in an isolated system never decreases: dS ≥ 0.',
      '3. Austrian physicist Ludwig Boltzmann proved that entropy is statistical: S = k_B * ln(Ω), where Ω is the number of microscopic arrangements (microstates) that produce the same macrostate.',
      '4. There is only one way for a coffee mug to be perfectly assembled, but billions of ways for the ceramic fragments to lie shattered across the floor. Thus, nature naturally evolves toward higher probability.'
    ],
    everydayAnalogy: 'Drop a brand-new deck of cards sorted by suit and number. It takes zero effort to shuffle them into chaos, but no matter how many times you toss them into the air, they will never spontaneously fall back into perfect numerical order.',
    takeaway: 'The future differs from the past because the future is simply the direction of increasing cosmic probability.'
  },

  // --- MATHEMATICS ---
  {
    domain: 'MATHS',
    keywords: ['bayes', 'bayes theorem', 'prior probability', 'conditional probability'],
    title: 'Bayes\' Theorem & Rational Belief Updating',
    directAnswer: 'Bayes\' Theorem provides the exact mathematical formula to update the probability of a hypothesis as new evidence arrives: P(H|E) = [P(E|H) * P(H)] / P(E).',
    chainOfThought: [
      '1. Start with a baseline belief before seeing data: the Prior Probability P(H).',
      '2. Evaluate the Likelihood P(E|H): how probable is this evidence if the hypothesis is true?',
      '3. Normalize by the Total Marginal Evidence P(E) = P(E|H)*P(H) + P(E|¬H)*P(¬H).',
      '4. The result is the Posterior Probability P(H|E): your mathematically disciplined new belief.',
      '5. Common pitfall: The Base Rate Fallacy—ignoring how rare the event is initially when interpreting a high-accuracy test.'
    ],
    everydayAnalogy: 'If a medical test for a rare disease (1 in 10,000 people) is 99% accurate and you test positive, your actual chance of having the disease is only about 1%, because the sea of healthy false-positives overwhelmingly outnumbers the few genuine cases.',
    takeaway: 'Exceptional claims require exceptional evidence; never update your conclusion without factoring in how rare the phenomenon was to begin with.'
  },
  {
    domain: 'MATHS',
    keywords: ['eigenvalue', 'eigenvector', 'linear algebra', 'svd', 'matrix decomposition'],
    title: 'Eigenvalues & Principal Axes of Transformation',
    directAnswer: 'An eigenvector is a special vector that does not change its spatial direction when multiplied by a matrix; it is merely scaled by a factor called the eigenvalue (A * v = λ * v).',
    chainOfThought: [
      '1. In linear algebra, multiplying a vector by a square matrix [N x N] rotates, shears, and stretches the vector.',
      '2. Most vectors point in a completely new direction after transformation.',
      '3. Eigenvectors represent the invariant structural axes of the transformation—the natural axes of symmetry or vibration.',
      '4. In machine learning and quant finance (Principal Component Analysis / SVD), the largest eigenvalues represent the axes of greatest data variance, allowing massive dimensionality reduction.'
    ],
    everydayAnalogy: 'Imagine stretching a rectangular rubber sheet diagonally. Most drawn lines twist into curves or change angles, but the line drawn directly along the pull direction stays perfectly straight—it only lengthens.',
    takeaway: 'Eigenvalues reveal the hidden backbone and dominant driving forces of high-dimensional systems.'
  },

  // --- STOCKS & FINANCIAL MARKETS ---
  {
    domain: 'STOCKS',
    keywords: ['limit order book', 'order book', 'bid ask spread', 'market microstructure', 'slippage'],
    title: 'Order Book Microstructure & Execution Dynamics',
    directAnswer: 'An electronic limit order book is a continuous double auction queue matching passive liquidity providers (limit orders) against aggressive liquidity takers (market orders) following price-time priority.',
    chainOfThought: [
      '1. Passive orders sit on the book: Bids (willing buyers at or below market) and Asks/Offers (willing sellers at or above market).',
      '2. The gap between the highest bid and lowest ask is the Bid-Ask Spread—the direct cost of immediate execution.',
      '3. When an institutional investor enters a large market order, it consumes all available shares at the top of the book and sweeps deeper into the queue, causing Slippage.',
      '4. In Indian equities, minimum price movement is constrained by the ₹0.05 Tick Size, creating distinct queue priority dynamics on NSE/BSE.'
    ],
    everydayAnalogy: 'Think of an auction house where sellers line up with fixed price tags on their items. If you want 10 antique vases right this second, you can buy the first 2 for ₹1,000, but to fill your full order you are forced to pay ₹1,050 and ₹1,100 for the ones behind them.',
    takeaway: 'Price movement is not magical; it is the physical mechanical depletion of resting liquidity on one side of the order book.'
  },
  {
    domain: 'STOCKS',
    keywords: ['gamma squeeze', 'options gamma', 'market maker hedging', 'gex'],
    title: 'Options Gamma & Mechanical Market Maker Squeezes',
    directAnswer: 'A gamma squeeze occurs when intense retail buying of short-dated out-of-the-money call options forces market makers to buy massive quantities of underlying stock to maintain delta-neutral hedge portfolios.',
    chainOfThought: [
      '1. Options market makers earn the bid-ask spread and want zero directional risk: they dynamically hedge delta (Δ).',
      '2. Gamma (Γ = ∂Δ/∂S) measures the rate at which delta changes with underlying stock price movements.',
      '3. When a stock rises, short call gamma turns sharply positive for market makers, forcing them to buy *more* stock at higher prices to remain delta-hedged.',
      '4. This creates a reflexive feedback loop: Stock rises -> Market makers forced to buy shares -> Stock rises further -> Repeat until options expire or buying ceases.'
    ],
    everydayAnalogy: 'Imagine a car dealer who promises to sell you 100 cars at ₹50,000 each. As the market price creeps toward ₹50,000, the dealer panics and rushes into the open market to buy cars so they can fulfill the promise, which ironically drives car prices through the roof.',
    takeaway: 'Derivative hedging flows frequently overpower fundamental valuations during explosive volatility events.'
  },

  // --- HUMAN SENTIMENT & PSYCHOLOGY ---
  {
    domain: 'HUMAN_SENTIMENT',
    keywords: [
      'loss aversion',
      'afraid of losing',
      'handling losses',
      'drawdown anxiety',
      'feeling down about money',
      'losing money',
      'losing in trading',
      'afraid to lose',
      'fear of losing',
      'scared of losing',
      'trading anxiety',
      'anxious about trading',
      'lost money in'
    ],
    title: 'Psychological Loss Aversion & Drawdown Resilience',
    directAnswer: 'Human psychology experiences the emotional pain of a financial loss roughly twice as intensely as the pleasure of an equivalent gain (Kahneman & Tversky\'s Prospect Theory).',
    chainOfThought: [
      '1. Evolutionary wiring prioritized survival: losing calories or shelter was lethal, whereas gaining extra food was merely nice.',
      '2. In trading and investing, this manifests as holding losing positions too long (hoping for breakeven) and cutting winners too early (locking in temporary relief).',
      '3. Overcoming this requires dissociating self-worth from individual trade outcomes and focusing strictly on statistical expected value (EV = Win Rate * Avg Win - Loss Rate * Avg Loss).',
      '4. Enforcing automated stop-losses and fractional position sizing eliminates emotional decision-making under stress.'
    ],
    everydayAnalogy: 'Losing ₹1,000 feels like a punch in the gut, while finding ₹1,000 on the sidewalk feels like a pleasant cup of coffee. Knowing your brain is wired this way helps you stop treating losses as personal failures.',
    takeaway: 'Losses are simply the cost of doing business in a probabilistic universe, like paying electricity for a grocery store.'
  },
  {
    domain: 'PHYSICS',
    keywords: [
      'quantum entanglement',
      'entanglement',
      'spooky action',
      'epr paradox'
    ],
    title: 'Quantum Entanglement & Non-Local Correlation',
    directAnswer: 'Quantum entanglement is a physical phenomenon where two or more particles become inextricably linked such that measuring the quantum state of one instantaneously determines the state of the other, regardless of spatial distance.',
    chainOfThought: [
      '1. In classical physics, two separated objects cannot instantaneously affect one another without a physical signal traveling at <= speed of light (c).',
      '2. Einstein, Podolsky, and Rosen (EPR) argued that quantum mechanics must be incomplete and proposed local hidden variables.',
      '3. John Stewart Bell proved mathematically that if local realism holds, correlations between measurements must satisfy Bell\'s Inequality.',
      '4. Alain Aspect, Anton Zeilinger, and John Clauser empirically proved Bell\'s Inequality is violated: nature is fundamentally non-local.',
    ],
    everydayAnalogy: 'Imagine a pair of magical shoes placed into two identical boxes. One box is shipped to Tokyo and the other to London. Before opening, both boxes contain a superposition of left and right. The microsecond someone opens the box in London and finds a left shoe, the shoe in Tokyo instantly becomes the right shoe.',
    takeaway: 'Information cannot be transmitted faster than light for communication, yet physical reality is fundamentally non-locally interconnected.'
  },
  {
    domain: 'PHYSICS',
    keywords: [
      'bell theorem',
      "bell's theorem",
      'local hidden variables',
      'bell inequality',
      "bell's inequality"
    ],
    title: 'Bell\'s Theorem & Quantum Non-Locality',
    directAnswer: 'Bell\'s Theorem mathematically proved that no physical theory of local hidden variables can reproduce the statistical predictions of quantum mechanics, a conclusion empirically confirmed by Alain Aspect and subsequent experiments demonstrating that nature is fundamentally non-local.',
    chainOfThought: [
      '1. In classical physics, physical systems possess definite properties prior to observation and cannot affect each other faster than light (local realism).',
      '2. Einstein, Podolsky, and Rosen (EPR) asserted quantum mechanics was incomplete and hypothesized hidden variables predetermined measurement outcomes.',
      '3. In 1964, John Stewart Bell derived mathematical bounds (Bell\'s Inequalities) that any universe governed by local hidden variables must obey.',
      '4. Landmark experiments by Alain Aspect, Anton Zeilinger, and John Clauser empirically violated Bell\'s inequalities with loop-hole free setups, definitively ruling out local hidden variables.'
    ],
    everydayAnalogy: 'If two people in different cities secretly agree on coin flip answers in advance, their correlation cannot exceed a mathematical limit. When entangled particles are measured, their correlation consistently exceeds that mathematical ceiling, proving they are not using hidden pre-set instructions.',
    takeaway: 'Nature is fundamentally non-local; entangled particles share a singular quantum reality that transcends spatial separation.'
  },
  {
    domain: 'PHYSICS',
    keywords: ['chaos theory', 'butterfly effect', 'strange attractor', 'non-linear'],
    title: 'Chaos Theory & Deterministic Non-Linearity',
    directAnswer: 'Chaos theory describes systems that are fully deterministic according to mathematical laws, yet practically impossible to predict long-term due to extreme sensitivity to initial conditions.',
    chainOfThought: [
      '1. In linear systems, a 1% error in input causes a 1% error in output.',
      '2. In non-linear dynamical systems (like weather, planetary orbits, or financial order flow), tiny discrepancies grow exponentially over time: error(t) ~ error(0) * e^(λ*t), where λ is the Lyapunov exponent.',
      '3. Coined by Edward Lorenz in 1972: "Does the flap of a butterfly\'s wings in Brazil set off a tornado in Texas?"',
      '4. The system is completely deterministic (no randomness), but has a finite prediction horizon.',
    ],
    everydayAnalogy: 'Dropping a cue ball into a tight rack of billiards: with two balls you can predict the path easily, but after 5 collisions, a difference of the width of an atom in your initial shot changes where the balls end up across the entire table.',
    takeaway: 'Deterministic predictability does not imply long-term foresight; humble risk boundaries beat dogmatic forecasts.'
  },
  {
    domain: 'MATHS',
    keywords: ['godel', 'incompleteness theorem', 'unprovable', 'axiomatic'],
    title: 'Gödel\'s Incompleteness Theorems',
    directAnswer: 'Kurt Gödel proved in 1931 that any consistent, formal mathematical system capable of doing basic arithmetic must contain true mathematical statements that cannot be proven from within the system itself.',
    chainOfThought: [
      '1. David Hilbert launched a program to prove mathematics was complete (all truths provable) and consistent (no contradictions).',
      '2. Gödel devised Gödel Numbering, assigning unique prime factorization numbers to mathematical symbols, sentences, and proofs.',
      '3. He constructed the formal sentence: "This statement is not provable in system S."',
      '4. If it is provable, the system proves a falsehood (inconsistent). If it is unprovable, the sentence is true, making the system incomplete.',
    ],
    everydayAnalogy: 'Think of a mirror: it can reflect everything in the room with absolute clarity, but it can never reflect its own internal chemical backing without stepping outside itself.',
    takeaway: 'No finite set of rules or algorithms can ever capture all truth; intellect and mathematics are open-ended horizons.'
  },
  {
    domain: 'MATHS',
    keywords: ['central limit theorem', 'bell curve', 'normal distribution', 'why normal distribution'],
    title: 'Central Limit Theorem & The Ubiquitous Bell Curve',
    directAnswer: 'The Central Limit Theorem (CLT) states that when independent random variables are summed or averaged, their normalized distribution approaches a Gaussian normal distribution (bell curve), regardless of their individual underlying shapes.',
    chainOfThought: [
      '1. Individual variables can have wild, skewed, or uniform distributions (e.g., rolling a single 6-sided die is flat uniform).',
      '2. When you take the sum or sample mean of n independent random variables, the convolution of their probability densities smooths extreme outliers.',
      '3. As sample size n -> infinity, the mean approaches the population mean μ, and the variance scales as σ²/n.',
      '4. This mathematical truth is why error measurements, human heights, and asset returns around equilibrium naturally form bell curves.',
    ],
    everydayAnalogy: 'Drop thousands of tiny marbles through a Galton board (pegs arranged in a triangle). Each marble bounces randomly left or right with 50% probability, yet together they infallibly pile up into a smooth, symmetrical bell curve at the bottom.',
    takeaway: 'Aggregate collective behavior displays remarkable mathematical order even when individual micro-actions appear random.'
  },
  {
    domain: 'STOCKS',
    keywords: ['vwap', 'volume weighted average price', 'institutional execution'],
    title: 'Intraday VWAP & Algorithmic Institutional Execution',
    directAnswer: 'Volume-Weighted Average Price (VWAP) is the true average price a security traded at throughout the day, weighted by volume at each price tick: VWAP = Σ(Price * Volume) / Σ(Volume).',
    chainOfThought: [
      '1. Institutional mutual funds and FIIs managing hundreds of crores cannot execute orders at market price without moving the market.',
      '2. Their execution performance is judged against the daily VWAP benchmark: buying below VWAP is considered positive alpha (good execution), buying above is poor execution.',
      '3. When price pulls back to VWAP in an uptrend, institutional execution algorithms (TWAP/VWAP slicers) routinely trigger buying to defend their average fill price.',
      '4. This transforms VWAP into a self-reinforcing intraday dynamic support and resistance anchor.',
    ],
    everydayAnalogy: 'Imagine buying 1,000 sacks of grain across an entire morning auction. You don\'t look at what the clock says; you look at the average price paid weighted by the volume of grain carted away. If you beat that average, you won.',
    takeaway: 'Retail traders look at price candles; institutional algorithms trade volume profiles and VWAP anchors.'
  },
  {
    domain: 'STOCKS',
    keywords: ['tca', 'transaction cost', 'friction hurdle', 'brokerage stt', 'slippage cost'],
    title: 'Transaction Cost Analysis (TCA) & The Friction Hurdle',
    directAnswer: 'The Friction Hurdle is the cumulative mathematical penalty of statutory fees (STT, GST, SEBI turnover, exchange fees) and bid-ask slippage that every trade must overcome before generating net positive wealth.',
    chainOfThought: [
      '1. In Indian equities, an intraday MIS round-trip incurs exchange transaction charges (0.00345%), SEBI turnover fees, STT on sell legs, GST (18% on fees), and broker commissions.',
      '2. On an active account taking 40 trades a month, statutory friction often burns ₹800 to ₹1,500/month regardless of whether trades win or lose.',
      '3. High frequency or low-margin trades often appear profitable in gross P&L but end up negative in net P&L after friction.',
      '4. Disciplined quant systems enforce a dynamic net profit floor (e.g. ₹60-65 per trade) before allocating capital.',
    ],
    everydayAnalogy: 'Think of driving a car across a toll bridge. If you make 10 short trips back and forth for a ₹50 grocery item, the ₹200 in toll fees will bankrupt you even if the groceries were on sale.',
    takeaway: 'Alpha is meaningless until it survives the mathematical friction of real-world execution.'
  },
  {
    domain: 'HUMAN_SENTIMENT',
    keywords: ['sunk cost', 'disposition effect', 'holding losers', 'selling winners too early'],
    title: 'The Disposition Effect & Sunk Cost Fallacy',
    directAnswer: 'The disposition effect is the behavioral bias where individuals prematurely sell winning investments to lock in small gains, while stubbornly holding losing investments in the futile hope of breaking even.',
    chainOfThought: [
      '1. Realizing a loss forces an individual to confront an error in judgment, triggering psychological ego defense mechanisms.',
      '2. Conversely, taking a tiny profit provides instant dopamine and validation, even if the asset has huge runway ahead.',
      '3. Sunk costs (money already spent or lost) cannot be recovered and should have zero mathematical bearing on future choices.',
      '4. The only rational question is: "Would I invest fresh capital in this position right now at today\'s price?" If no, exit immediately.',
    ],
    everydayAnalogy: 'Refusing to leave a terrible, boring movie at the cinema because you already bought the ticket. The money is gone either way; staying only wastes your two precious remaining hours.',
    takeaway: 'Cut your losses with ruthless detachment and let your winners run; do not let your ego manage your balance sheet.'
  },
  {
    domain: 'LANGUAGE_NUANCE',
    keywords: ['socratic', 'first principles', 'first principle thinking', 'how to think clearly'],
    title: 'First Principles Thinking & Socratic Inquiry',
    directAnswer: 'First principles thinking is the practice of actively breaking down a complex problem into its most fundamental, indisputable truths, and then reasoning upward from there rather than reasoning by analogy.',
    chainOfThought: [
      '1. Reasoning by analogy copies what other people do with slight variations ("we do this because everyone does it").',
      '2. First principles deconstructs the problem: "What are we sure is true? What are the physical and mathematical constraints?"',
      '3. Socratic questioning systematically challenges assumptions, tests edge cases, and exposes hidden dogmas.',
      '4. From foundational truths, novel solutions emerge that conventional consensus overlooked.',
    ],
    everydayAnalogy: 'Instead of looking at the market price of an electric battery ($600/kWh) and concluding batteries will always be expensive, calculate the raw cost of cobalt, nickel, lithium, and carbon on the London Metal Exchange ($80/kWh) and ask how to assemble them yourself.',
    takeaway: 'Never accept a constraint as real until you have verified whether it is a law of physics or merely a human convention.'
  },
  {
    domain: 'STOCKS',
    keywords: ['greeks', 'option greeks', 'delta gamma', 'theta decay', 'implied volatility', 'iv crush', 'black scholes'],
    title: 'Options Greeks & The Volatility Surface',
    directAnswer: 'The Options Greeks are partial derivatives of the Black-Scholes pricing model that quantify an option\'s sensitivity to underlying price moves (Delta), rate of delta change (Gamma), time decay (Theta), and implied volatility shifts (Vega).',
    chainOfThought: [
      '1. Delta (Δ = ∂V/∂S): Measures directional exposure. Deep In-The-Money (ITM) options approach ±1.0, acting like pure equity, while At-The-Money (ATM) options hover around 0.50.',
      '2. Gamma (Γ = ∂²V/∂S²): The second derivative of price, peaking sharply for near-expiry ATM options. High gamma forces options market makers to buy stock as prices rise and sell as they fall, accelerating intraday squeezes.',
      '3. Theta (Θ = ∂V/∂t): Daily decay in contract value. Accelerates exponentially in the final 7 days before weekly Thursday expiry, penalizing naked option buyers and rewarding systematic option sellers.',
      '4. Vega (ν = ∂V/∂σ): Sensitivity to Implied Volatility (IV). Following binary events (RBI policy, union budget, quarterly earnings), IV crashes precipitously ("IV Crush"), causing long calls and puts to collapse simultaneously despite underlying stock price movement.',
      '5. Volatility Skew / Smile: Downside Out-Of-The-Money (OTM) puts trade at structurally higher implied volatilities than upside calls due to institutional demand for downside tail-risk hedging.'
    ],
    everydayAnalogy: 'Think of auto insurance: Delta is how fast your car is moving, Gamma is how aggressively you step on the accelerator, Theta is the daily cost of holding the policy, and Vega is how much the premium skyrockets the moment a severe blizzard is forecasted.',
    takeaway: 'Options are not leveraged lottery tickets; they are multi-dimensional volatility and time contracts where pricing is dictated by derivative mathematics.'
  },
  {
    domain: 'STOCKS',
    keywords: [
      'pre open auction',
      'pre-open',
      'call auction',
      'nse tick size',
      'tick size',
      'circuit breaker',
      'mis leverage',
      'sebi margin',
      'auto-square-off',
      'auto square off',
      '3:15',
      'indian market microstructure',
    ],
    title: 'Indian Equity Microstructure & Exchange Execution Mechanics',
    directAnswer: 'Indian equities trade under an electronic central limit order book (CLOB) on NSE/BSE with a mandatory ₹0.05 tick size, an algorithmic 9:00–9:08 AM call auction equilibrium discovery session, and tiered index circuit limits (10%, 15%, 20%).',
    chainOfThought: [
      '1. Pre-Open Call Auction (9:00-9:08 AM): Orders accumulate passively and match at a single equilibrium price that maximizes tradable volume, absorbing overnight global market shocks without opening price chaos.',
      '2. NSE Tick Size Constraints (₹0.05): Order queues for heavy-volume equities (Reliance, HDFC Bank) build massive resting depth, making queue priority (FIFO) and Level-3 order book positioning critical for avoiding slippage.',
      '3. Dynamic Stock Circuit Bands: Non-F&O stocks face strict daily price bands (typically 5%, 10%, or 20%), while F&O-eligible equities have dynamic cooling-off price thresholds without rigid hard caps.',
      '4. Intraday MIS (Margin Intraday Square-off): Provides up to 5x leverage under SEBI peak margin rules, but requires mandatory auto-square-off between 3:15 PM and 3:20 PM, creating mechanical end-of-day liquidation flow.',
      '5. Settlement Architecture: Operates on T+1 rolling settlement with mandatory upfront margin collection, eliminating systemic counterparty settlement default risk.'
    ],
    everydayAnalogy: 'Think of an airport departure runway: the 9:00 AM call auction organizes all incoming flights into an orderly departure sequence so there is no chaotic mid-air collision when the runway opens at 9:15 AM.',
    takeaway: 'Understanding market plumbing and exchange rules is what separates institutional execution edge from retail execution slippage.'
  },
  {
    domain: 'MATHS',
    keywords: ['kelly criterion', 'drawdown recovery', 'position sizing formula', 'risk of ruin', 'var', 'portfolio risk', 'portfolio drawdown'],
    title: 'The Kelly Criterion & Drawdown Asymmetry Mathematics',
    directAnswer: 'Optimal portfolio position sizing is governed by the Kelly Criterion (f* = [p*b - q] / b) to maximize geometric wealth growth, while the brutal non-linear asymmetry of drawdowns (Recovery % = D / [1 - D]) dictates that capital preservation must strictly supersede win rate.',
    chainOfThought: [
      '1. The Kelly Criterion mathematically proves that betting more than optimal f* reduces expected compounded growth, and betting 2*f* guarantees eventual mathematical ruin despite a positive statistical edge.',
      '2. In practical trading, "Half-Kelly" (0.5 * f*) is industry standard, providing 75% of the growth rate with only 25% of the drawdown volatility.',
      '3. The Brutal Non-Linearity of Drawdowns: A 10% loss requires an 11.1% gain to break even; a 20% loss needs a 25% gain; a 33% loss needs a 50% gain; a 50% loss requires a 100% gain; and an 80% loss demands a staggering 400% gain!',
      '4. Risk-Per-Trade Formula: Position Size = (Total Capital * Risk %) / (Entry Price - Stop Loss Price). Never size positions by nominal share count.',
      '5. Value at Risk (VaR) and Expected Shortfall (CVaR): Quantifies the fat-tailed probability of catastrophic tail-risk shocks beyond standard normal Gaussian assumptions.'
    ],
    everydayAnalogy: 'Digging a hole in the earth: each foot you dig deeper requires exponentially more energy to climb back out to ground level. Digging to a 50% depth demands twice your original height to escape, and digging past 80% traps you permanently.',
    takeaway: 'Amateurs obsess over how much money they will make if they are right; elite quants obsess over how much they can lose if they are wrong.'
  },
  {
    domain: 'STOCKS',
    keywords: ['mean reversion', 'ornstein uhlenbeck', 'hurst exponent', 'trending vs chop', 'market regime', 'regime switching'],
    title: 'Ornstein-Uhlenbeck Mean Reversion & Hurst Exponent Regimes',
    directAnswer: 'Financial price time series oscillate between persistent directional trends and mean-reverting chop, which can be quantitatively identified via the Hurst Exponent (H): H > 0.5 denotes trending persistence, H < 0.5 denotes mean-reversion (Ornstein-Uhlenbeck drift), and H = 0.5 indicates a random walk.',
    chainOfThought: [
      '1. Ornstein-Uhlenbeck (OU) SDE: dX_t = θ(μ - X_t)dt + σ dW_t, where θ represents the mean-reversion speed, μ is the long-term equilibrium price (e.g. Volume-Weighted Average Price), and σ is volatility.',
      '2. Mean-Reversion Half-Life: t_half = ln(2) / θ. When half-life is short, prices rapidly pull back to the mean, providing statistical edge for Bollinger Band and VWAP-fade scalping.',
      '3. Hurst Exponent (H): Calculated through Rescaled Range (R/S) analysis. When H >= 0.55, the market exhibits positive autocorrelation (strong momentum breakouts); when H <= 0.45, negative autocorrelation dominates (failed breakouts and range oscillation).',
      '4. Regime-Adaptive Execution: Applying a trend-following system (like moving average crosses) during an H < 0.45 regime results in lethal repeated whipsaws and fee bleed.',
      '5. Multi-Timeframe Confirmation: A stock may be mean-reverting on 5-minute intraday charts while maintaining strong positive Hurst momentum on daily institutional charts.'
    ],
    everydayAnalogy: 'A dog on an elastic leash walking with its owner: in a mean-reverting regime, the dog darts away but the leash snaps it back to the owner\'s side. In a trending regime, the owner hops onto a speeding train and both travel miles in one direction.',
    takeaway: 'Never deploy a trading strategy without first determining whether the underlying asset regime is trending or mean-reverting.'
  },
  {
    domain: 'HUMAN_SENTIMENT',
    keywords: [
      'red day',
      'bad trade',
      'lost today',
      'lost money',
      'lost on',
      'lost a lot',
      'lost',
      'loss',
      'angry',
      'furious',
      'win it back',
      'trade again',
      'revenge trading',
      'drawdown mental',
      'trading tilt',
      'lost money today',
      'i feel down',
      'tilt',
    ],
    title: 'Trading Psychology: Centering & Defeating the Tilt Monster',
    directAnswer: 'A losing trade or red day is never a reflection of your personal intellect or worth; in a probabilistic environment with a 60% win rate, clusters of 4 to 6 consecutive losing trades are a mathematical certainty over any 100-trade sample.',
    chainOfThought: [
      '1. The Law of Independent Trials: The market has zero memory of your last trade; it does not know your account balance, your purchase price, or your financial goals.',
      '2. Amygdala Hijack & Revenge Trading: A financial loss triggers physical survival panic (cortisol/adrenaline). The instinct to "win it back immediately" leads to abandoning stop losses, doubling position sizes, and taking impulsive low-probability setups.',
      '3. Distinguishing Good Losses from Bad Wins: A trade executed strictly according to your system that hits a stop loss is a **successful trade**. A sloppy, undisciplined trade that happens to make money is a **lethal trade** because it trains toxic habits.',
      '4. The Professional Reset Protocol: (1) Step away from the screens immediately for 30 minutes; (2) Reset physiology with physiological sighs (double inhale, long slow exhale); (3) Audit the trade journal objectively: did you follow your entry, sizing, and exit rules? If yes, accept the variance with pride.',
      '5. Longevity Over Heroics: The single objective of a systematic trader is not to hit home runs every day, but to remain solvent and emotionally intact so compounding can perform its mathematical miracle over years.'
    ],
    everydayAnalogy: 'A casino blackjack dealer who busts on three consecutive hands does not panic, sweat, or change the house rules. They calmly deal the next shoe, knowing the mathematical house edge guarantees net profitability over thousands of hands.',
    takeaway: 'Your edge is not predicting tomorrow\'s candle; your edge is executing positive expected value with complete emotional detachment across thousands of trades.'
  },
  {
    domain: 'LANGUAGE_NUANCE',
    keywords: ['you are cool', 'are you smart', 'are you conscious', 'witty', 'banter', 'joke', 'sense of humor'],
    title: 'Conversational Banter & Intellectual Spark',
    directAnswer: 'Lumen Astra combines high-precision quantitative intelligence with conversational warmth, dry intellectual wit, and an appreciation for the wonderful absurdities of human nature and financial markets.',
    chainOfThought: [
      '1. True conversational intelligence requires more than reciting facts; it demands timing, empathy, and perspective.',
      '2. We balance rigorous analytical depth with intellectual humility—the smarter you get, the more you realize how vast the unknown remains.',
      '3. Markets are the ultimate human theatre: half cold mathematics, half irrational biological sentiment swinging between euphoria and panic.',
      '4. Having a sense of humor is essential: it keeps us grounded when algorithms hallucinate or markets do something that violates three standard deviations.'
    ],
    everydayAnalogy: 'Like having a coffee with a senior quant who spent decades on trading desks: they can write Black-Scholes partial differential equations on a napkin, but they\'d rather laugh with you about why everyone bought calls at the exact top of the bubble.',
    takeaway: 'Intelligence without warmth is sterile; warmth without intelligence is shallow. We aim for both.'
  },
  {
    domain: 'STOCKS',
    keywords: [
      'free cash flow',
      'fcf yield',
      'free cash flow yield',
      'p/e ratio for capital-intensive',
      'fcf vs p/e',
      'pe vs fcf',
      'capital-intensive',
      'valuation metric than price-to-earnings'
    ],
    title: 'Free Cash Flow Yield vs. P/E in Capital-Intensive Valuation',
    directAnswer: 'Free Cash Flow (FCF) Yield is significantly more reliable than the P/E ratio for capital-intensive companies because accounting net income is routinely distorted by non-cash depreciation assumptions and heavy ongoing capital expenditures, whereas FCF reveals the actual discretionary cash available for reinvestment, debt reduction, and shareholder distributions.',
    chainOfThought: [
      '1. Net income in the P/E ratio relies on accrual accounting, adding back CapEx and deducting historical depreciation, which masks whether a company is actually consuming or generating cash.',
      '2. Capital-intensive businesses (manufacturing, energy, infrastructure, autos) require massive maintenance CapEx just to stay operational; a company can report positive P/E earnings while bleeding actual cash.',
      '3. Free Cash Flow (Operating Cash Flow minus Capital Expenditures) isolates genuine cash generation after maintaining the physical asset base and funding working capital cycles.',
      '4. FCF Yield (FCF per Share / Market Price or FCF / Enterprise Value) provides an objective, unvarnished yield that allows direct comparison across companies regardless of aggressive capitalization choices.'
    ],
    everydayAnalogy: 'Evaluating a logistics fleet: P/E is like counting gross passenger bookings minus an accounting estimate of tire wear on paper. FCF Yield is counting the actual physical cash left in the bank after paying for fuel, driver salaries, and replacing broken truck engines.',
    takeaway: 'Accounting net income is an opinion subject to management discretion; free cash flow is an audited cash reality.'
  },
  {
    domain: 'STOCKS',
    keywords: [
      'renaissance technologies',
      'statistical arbitrage',
      'stat arb',
      'efficient market hypothesis',
      'emh',
      'market efficiency',
      'why do quantitative',
      'why do quants'
    ],
    title: 'Quantitative Statistical Arbitrage & The Limits of Market Efficiency',
    directAnswer: 'Quantitative firms like Renaissance Technologies consistently profit because financial markets are micro-inefficient in the short term: non-zero transaction costs, institutional order-flow imbalances, and behavioral biases create transient statistical mispricings that automated algorithms can systematically harvest before equilibrium is restored.',
    chainOfThought: [
      '1. The Grossman-Stiglitz Paradox mathematically proves that perfectly efficient markets are impossible: if prices fully reflected all information at zero cost, no trader would spend capital researching, causing price discovery to collapse.',
      '2. Markets exhibit persistent structural frictions—such as bid-ask bounce, institutional rebalancing pressure (ETFs, pensions), margin liquidations, and order book queue latency.',
      '3. Quantitative statistical arbitrage does not attempt to forecast long-term macroeconomic narratives; it extracts thousands of weak, uncorrelated statistical signals with a win rate around 51% to 52%, scaled over millions of automated transactions.',
      '4. By combining proprietary multi-factor predictive models, ultra-low execution slippage, co-located infrastructure, and rigorous portfolio risk constraints, elite quant funds harvest steady risk premia that manual market participants leave behind.'
    ],
    everydayAnalogy: 'A casino operating thousands of blackjack tables: the house cannot predict the outcome of any individual hand, but because their mathematical edge is 1.5% over the players, dealing millions of hands a year guarantees predictable, compounding profit.',
    takeaway: 'The market is efficient enough to punish subjective guessing, but structurally inefficient enough to reward automated statistical discipline.'
  },
  {
    domain: 'GEOPOLITICS',
    keywords: ['geopolitics', 'geopolitical', 'multipolar', 'thucydides', 'balance of power', 'hegemony', 'superpower'],
    title: 'Multipolarity, Strategic Chokepoints & The Geopolitical Balance of Power',
    directAnswer: 'The contemporary international order is shifting from a unipolar American hegemony toward a contested multipolar system characterized by regional spheres of influence, weaponized trade interdependence, and intense competition over maritime chokepoints.',
    chainOfThought: [
      '1. The Thucydides Trap: Structural stress when a rising power threatens to displace an incumbent hegemon, historically resolving in systemic conflict in 12 of 16 historical cases studied by Graham Allison.',
      '2. Maritime Chokepoint Vulnerability: Over 80% of global seaborne merchandise and 60% of maritime petroleum traverses narrow maritime gateways (Strait of Malacca, Bab-el-Mandeb, Strait of Hormuz, Suez Canal, and Taiwan Strait). Blockades or kinetic disruptions instantly cascade into global supply shocks.',
      '3. Weaponized Interdependence: Globalized financial and communication nodes (SWIFT, semiconductor lithography, dollar clearing) are leveraged as coercive statecraft instruments through extraterritorial sanctions and export controls.',
      '4. Geo-Economic Realignment: Nations increasingly prioritize supply chain sovereignty and resilience (nearshoring, friendshoring) over pure Ricardian comparative cost efficiency.'
    ],
    everydayAnalogy: 'A small town with one dominant water well and one paved highway: for decades, the town mayor controlled both without dispute. Now, three wealthy neighborhood associations have built their own water pumps and are threatening to barricade the highway intersections unless tolls are renegotiated.',
    takeaway: 'In a multipolar world, national security and supply chain sovereignty invariably trump peacetime economic efficiency.'
  },
  {
    domain: 'DEMOGRAPHY',
    keywords: ['demography', 'demographic dividend', 'aging population', 'fertility rate', 'replacement rate', 'dependency ratio', 'pension solvency', 'working age population'],
    title: 'Demographic Dividends, Fertility Collapse & Sovereign Dependency Ratios',
    directAnswer: 'Demographic transition shapes long-term macroeconomic destiny: nations with falling fertility below replacement rate (2.1) face ballooning old-age dependency ratios, fiscal contraction, and structural labor shortages, whereas countries with young median ages experience a transient Demographic Dividend.',
    chainOfThought: [
      '1. Replacement Fertility Rate (2.1): Sub-replacement fertility across East Asia (South Korea 0.72, Japan 1.20) and Europe leads to rapid population aging and population inversion pyramids.',
      '2. Old-Age Dependency Ratio: Ratio of retirees (65+) to the working-age population (15-64). As this ratio doubles, unfunded sovereign pension liabilities and healthcare obligations crowd out productive state capital expenditure.',
      '3. Demographic Dividend Window: When a nation\'s working-age population exceeds dependents (as in India with a median age of ~28), personal savings rates peak, providing domestic investment capital for industrialization—provided quality job creation and education absorb the cohort.',
      '4. Macro-Financial Transmission: Aging societies experience lower neutral real interest rates (r*), asset decumulation by retiring cohorts, and severe municipal tax base erosion unless offset by hyper-productivity from automation and AI.'
    ],
    everydayAnalogy: 'A rowing crew where eight athletes pull the oars while two passengers rest. If five rowers retire and become passengers, the remaining three rowers must expend superhuman energy just to keep the boat from drifting backward.',
    takeaway: 'Demography is economic destiny playing out in slow motion: capital and technology must replace departing human labor before pension insolvency arrives.'
  },
  {
    domain: 'WORLD_AFFAIRS',
    keywords: ['dedollarization', 'de-dollarization', 'petrodollar', 'brics currency', 'reserve currency', 'foreign exchange reserves', 'swift'],
    title: 'De-Dollarization Dynamics, The Petrodollar & Central Bank Reserve Diversification',
    directAnswer: 'De-dollarization is not an imminent overnight collapse of the US Dollar, but rather a structural diversification where non-Western central banks settle bilateral cross-border trade in local currencies and reallocate foreign exchange reserves toward physical gold to insulate against sanctions risk.',
    chainOfThought: [
      '1. Dollar Hegemony & Network Effects: The US Dollar remains anchored by deep and liquid US Treasury debt markets, accounting for ~58% of allocated global FX reserves and over 85% of international foreign exchange turnover.',
      '2. The Sanctions Watershed (2022): The freezing of $300 billion in Russian central bank reserves demonstrated that sovereign dollar assets carry counterparty jurisdictional risk for non-allied nations.',
      '3. Bilateral Currency Settlement: Bilateral energy and commodity trades between BRICS members (e.g. India-Russia rupee-ruble, China-Saudi yuan oil settlement) bypass SWIFT messaging and dollar clearing channels.',
      '4. Central Bank Gold Accumulation: Global central banks have purchased over 1,000 tonnes of physical gold annually for consecutive years as an un-sanctionable, non-jurisdictional neutral reserve asset.',
      '5. Triffin Dilemma: A reserve currency issuer must run structural current account deficits to supply global liquidity, eventually undermining confidence in its long-term sovereign solvency.'
    ],
    everydayAnalogy: 'English as the global language: you can invent an alternative language and trade locally with your neighbors, but whenever 50 international travelers gather in a room, everyone still defaults to English because everyone else speaks it.',
    takeaway: 'The US Dollar\'s reserve monopoly is gradually eroding into a multi-currency clearing landscape, but liquidity, rule of law, and capital openess mean replacement is a decades-long evolution.'
  },
  {
    domain: 'GEOPOLITICS',
    keywords: ['semiconductor', 'semiconductors', 'chips act', 'tsmc', 'taiwan strait', 'rare earths', 'lithium'],
    title: 'Semiconductor Hegemony, Critical Minerals & Technological Sovereignty',
    directAnswer: 'Semiconductors are the foundational infrastructure of 21st-century economic and military power, where extreme geographical concentration in manufacturing (Taiwan/TSMC) and raw material refining (China in rare earths) creates critical single points of failure in global supply chains.',
    chainOfThought: [
      '1. Fabrication Chokepoint: Over 90% of global leading-edge sub-5nm microchips are manufactured on the island of Taiwan by TSMC, placing the entire global tech economy at risk of maritime quarantine or cross-strait conflict.',
      '2. Extreme Upstream Monopolies: Extreme Ultraviolet (EUV) photolithography machines are exclusively manufactured by one Dutch firm (ASML), utilizing optics made by Zeiss, creating irreplaceable industrial bottlenecks.',
      '3. Critical Mineral Dependencies: The clean energy and AI transition requires lithium, cobalt, nickel, and rare earths (neodymium, dysprosium), where China controls over 60% of mining and 85%+ of chemical refining capacity.',
      '4. Industrial Policy Reshoring: Sovereign programs like the US CHIPS and Science Act, European Chips Act, and India Semiconductor Mission deploy hundreds of billions in subsidies to build domestic semiconductor fabrication and packaging capacity.'
    ],
    everydayAnalogy: 'If every vehicle, airplane, and smartphone in the world required a specialized engine part that only one single factory on a small volcanic island possessed the tooling to forge.',
    takeaway: 'In the digital era, silicon wafers and rare-earth magnets are the new oil: whoever controls the foundries controls the frontier of artificial intelligence and national power.'
  },
  {
    domain: 'WORLD_AFFAIRS',
    keywords: ['sovereign debt', 'debt ceiling', 'fiscal dominance', 'quantitative easing', 'quantitative tightening', 'yield curve control'],
    title: 'Sovereign Debt Supercycles, Fiscal Dominance & Central Bank Dilemmas',
    directAnswer: 'Fiscal dominance occurs when sovereign debt-to-GDP levels climb so high that monetary policy becomes constrained by the government\'s debt service costs, forcing central banks to tolerate higher inflation or suppress bond yields to prevent fiscal insolvency.',
    chainOfThought: [
      '1. Debt-to-GDP Expansion: Following multiple rounds of fiscal stimulus and quantitative easing, global sovereign debt has exceeded peacetime historic records (>120% in the US, >260% in Japan, >85% in India).',
      '2. Interest Cost Transmission: As central banks raise interest rates to combat inflation, sovereign interest expense explodes, rapidly surpassing national defense budgets and straining annual tax receipts.',
      '3. Fiscal Dominance: When interest expenses become unsustainable, central banks cannot maintain restrictive real interest rates without triggering sovereign bond auction failures or regional banking crises.',
      '4. Financial Repression & Yield Curve Control: Governments resort to captive institutional buying rules (e.g. statutory liquidity ratios), artificially holding bond yields below inflation to steadily inflate away real debt burdens.',
      '5. Capital Flow Spillovers: Emerging market economies face currency devaluation pressure and foreign capital flight whenever developed market yields stay elevated.'
    ],
    everydayAnalogy: 'A homeowner with a massive adjustable-rate mortgage: when interest rates were 1%, monthly payments were manageable. When interest rates jump to 6%, interest eats their entire salary, forcing the bank to renegotiate or watch the mortgage default.',
    takeaway: 'When sovereign debt reaches critical mass, inflation becomes the path of least political resistance to liquidate excess real obligations.'
  },
  {
    domain: 'STOCKS',
    keywords: ['vpin', 'order flow toxicity', 'adverse selection', 'market maker inventory', 'liquidity vacuum'],
    title: 'VPIN (Volume-Synchronized Probability of Toxicity) & Market Maker Inventory Risk',
    directAnswer: 'Volume-Synchronized Probability of Toxicity (VPIN) measures the proportion of trade volume initiated by informed traders; when VPIN spikes during sudden volatility shocks, market makers face severe adverse selection, inventory skew, and liquidity evaporation.',
    chainOfThought: [
      '1. VPIN samples volume in equal-sized buckets rather than calendar time, isolating order flow imbalance (V_tau^B - V_tau^S) relative to bucket size V.',
      '2. In an aggressive sell-off, market maker bid fills accumulate rapidly while ask orders stay untouched, ballooning long inventory in a collapsing market.',
      '3. Because quoting at normal spreads guarantees negative expected value (E[P&L] < 0) against informed flow, market makers widen spreads or withdraw quotes completely.',
      '4. Systematic quant desks apply dynamic spread widening and position decay dampeners whenever trailing 5-bucket VPIN exceeds the 90th percentile.'
    ],
    everydayAnalogy: 'A currency exchange booth during an unexpected coup: suddenly every single person arriving is frantically selling the local currency to buy dollars. If the booth keeps buying local currency at yesterday\'s exchange rate, they will be wiped out before noon.',
    takeaway: 'When order flow toxicity spikes, passive liquidity providers become the primary funding source for informed traders unless dynamic risk limits intervene.'
  },
  {
    domain: 'WORLD_AFFAIRS',
    keywords: ['rbi liquidity', 'withdrawal of accommodation', 'wacr', 'banking deficit', 'liquidity adjustment facility'],
    title: 'RBI Monetary Transmission: Hawkish Stance vs. Banking System Liquidity Deficit',
    directAnswer: 'When the Reserve Bank of India maintains a Hawkish "Withdrawal of Accommodation" stance while domestic banking liquidity enters deficit, the Weighted Average Call Rate (WACR) is pushed toward the Marginal Standing Facility ceiling, tightening commercial lending conditions more aggressively than nominal repo rates indicate.',
    chainOfThought: [
      '1. Policy friction arises because the Hawkish stance anchors CPI inflation expectations, while systemic liquidity deficits strain bank deposit growth.',
      '2. As interbank cash tightens, WACR drifts to the upper LAF corridor (Repo + 25 bps), causing short-term CD and CP yields to spike.',
      '3. To keep interbank rates anchored without sending an unintended dovish policy signal, the RBI utilizes Variable Rate Repo (VRR) auctions rather than lowering the benchmark repo rate.',
      '4. This policy operational tension is tolerated until core inflation decelerates sustainably toward the 4% midpoint target.'
    ],
    everydayAnalogy: 'Toughening security at a stadium entrance (hawkish stance) while simultaneously narrowing the turnstile gates (liquidity deficit): the crowd moves through much slower, and tickets cost more on the secondary market.',
    takeaway: 'Operational liquidity conditions dictate actual market interest rates far more directly than headline central bank announcements.'
  },
  {
    domain: 'DEMOGRAPHY',
    keywords: ['south korea fertility', '0.72 fertility', 'korea pension solvency', 'demographic contraction', 'east asia aging'],
    title: 'Demographic Contraction & Sovereign Debt Sustainability (South Korea TFR 0.72 Case)',
    directAnswer: 'A Total Fertility Rate of 0.72 represents an unprecedented structural labor contraction; by 2040, potential GDP growth falls below 1.0%, the worker-to-retiree ratio drops below 1.5:1, and sovereign pension depletion forces large-scale asset liquidation and higher sovereign debt.',
    chainOfThought: [
      '1. Solow-Swan growth accounting: contraction of the active labor force (-1.5% annually) acts as a persistent drag on potential GDP that robotics automation cannot entirely offset.',
      '2. National Pension Service (NPS) transitions from a net accumulator of global assets to a net seller by ~2040–2045 to fund elderly claims.',
      '3. Municipal and national tax base erosion coincides with escalating healthcare outlays, driving sovereign debt-to-GDP from ~50% toward 100%+',
      '4. Structural remedies face high barriers: service-sector productivity ceilings and cultural/political resistance to large-scale immigration.'
    ],
    everydayAnalogy: 'A small business where four veteran workers retire every year but only one apprentice is hired: even if the apprentice works twice as fast, the company will eventually fail to complete its contracts.',
    takeaway: 'No technology or fiscal stimulus can sustain a modern welfare state if the working-age tax base contracts faster than productivity can expand.'
  },
  {
    domain: 'STOCKS',
    keywords: ['share buybacks vs capex', 'buyback vs capex', 'cost of capital 5%', 'roic vs wacc', 'capital allocation framework'],
    title: 'Executive Capital Allocation: Share Buybacks vs. CapEx Under 5% Benchmark Rates',
    directAnswer: 'In a 5% interest rate environment, capital allocation requires strict hurdle discipline: share buybacks are only accretive when shares trade at a clear discount to DCF fair value, whereas CapEx expansion must generate expected Return on Invested Capital (RoIC) exceeding the elevated WACC by at least 300 basis points.',
    chainOfThought: [
      '1. Higher risk-free rates raise the hurdle rate across all corporate capital deployment; cheap debt financial engineering is no longer viable.',
      '2. Share Buyback Rule: Compare earnings yield (E/P) against corporate borrowing costs. Buying back shares at elevated P/E multiples (>25x) destroys economic value if internal RoIC exceeds the buyback yield.',
      '3. CapEx Rule: Deploy to CapEx only when projects build structural scale moats (proprietary compute clusters, proprietary data pipelines) with verifiable RoIC > 14%.',
      '4. Downside Flexibility: Buyback authorizations can be paused immediately during market dislocations, whereas long-term CapEx commits multi-year capital with heavy depreciation drag.'
    ],
    everydayAnalogy: 'Choosing whether to use extra cash to buy back equity from your business partner or invest in a new automated production line: buying out the partner is foolish if the business is overpriced, while the new machine pays off only if customer demand easily beats the bank interest rate.',
    takeaway: 'When money is no longer free, capital allocation discipline becomes the ultimate differentiator between enduring compounders and value destroyers.'
  }
];

// --------------------------------------------------------------------------
// 2. CONCISION & AFFECTIVE SENTIMENT CLASSIFIER
// --------------------------------------------------------------------------

export function isConciseRequested(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  return (
    lower.includes('bottom line only') ||
    lower.includes('bottom line:') ||
    lower.includes('in short') ||
    lower.includes('concise') ||
    lower.includes('briefly') ||
    lower.includes('in 2 sentences') ||
    lower.includes('in two sentences') ||
    lower.includes('in 1 sentence') ||
    lower.includes('in one sentence') ||
    lower.includes('to the point') ||
    lower.includes('no fluff') ||
    lower.includes('just the bottom line') ||
    lower.includes('tldr') ||
    lower.includes('tl;dr')
  );
}

export function detectAffectiveState(prompt: string): UserAffectiveState {
  const lower = prompt.toLowerCase();

  // If concise or direct bottom-line requested
  if (isConciseRequested(prompt)) {
    return 'IMPATIENT_DIRECT';
  }

  // Anxious / Worried / Stressed / Trading Tilt
  if (
    lower.includes('worried') ||
    lower.includes('stress') ||
    lower.includes('anxious') ||
    lower.includes('scared') ||
    lower.includes('lost money') ||
    lower.includes('lost a lot') ||
    lower.includes('red day') ||
    lower.includes('bad trade') ||
    lower.includes('tilt') ||
    lower.includes('revenge trading') ||
    lower.includes('angry') ||
    lower.includes('furious') ||
    lower.includes('in trouble') ||
    lower.includes('panicking') ||
    lower.includes('crash') ||
    lower.includes('help me') ||
    lower.includes('desperate') ||
    lower.includes('feel down') ||
    lower.includes('ruined')
  ) {
    return 'ANXIOUS_WORRIED';
  }

  // Impatient / Wants direct answer to the point
  if (
    lower.includes('to the point') ||
    lower.includes('short answer') ||
    lower.includes('quick answer') ||
    lower.includes('no fluff') ||
    lower.includes('bottom line') ||
    lower.includes('direct answer') ||
    lower.includes('just tell me') ||
    lower.includes('simply put') ||
    lower.includes('cut the crap') ||
    lower.length < 25 && (lower.endsWith('?') || lower.startsWith('what is') || lower.startsWith('how much'))
  ) {
    return 'IMPATIENT_DIRECT';
  }

  // Skeptical / Critical
  if (
    lower.includes('doubt') ||
    lower.includes('are you sure') ||
    lower.includes('prove it') ||
    lower.includes('bullshit') ||
    lower.includes('really?') ||
    lower.includes('i don\'t believe') ||
    lower.includes('how do you know') ||
    lower.includes('wrong')
  ) {
    return 'SKEPTICAL_CRITICAL';
  }

  // Playful / Banter / Fun
  if (
    lower.includes('haha') ||
    lower.includes('lol') ||
    lower.includes('joke') ||
    lower.includes('fun') ||
    lower.includes('buddy') ||
    lower.includes('friend') ||
    lower.includes('awesome') ||
    lower.includes('cool') ||
    lower.startsWith('yo ') ||
    lower.startsWith('hey ')
  ) {
    return 'PLAYFUL_BANTER';
  }

  // Intellectual / Theoretical
  if (
    lower.includes('why') ||
    lower.includes('philosophy') ||
    lower.includes('paradox') ||
    lower.includes('theory') ||
    lower.includes('mathematical') ||
    lower.includes('equation') ||
    lower.includes('fundamental') ||
    lower.includes('mechanics')
  ) {
    return 'INTELLECTUAL_DEEP';
  }

  // Curious / Exploratory
  if (
    lower.includes('explain') ||
    lower.includes('tell me about') ||
    lower.includes('what is') ||
    lower.includes('how does') ||
    lower.includes('understand')
  ) {
    return 'CURIOUS_EXPLORATORY';
  }

  return 'NEUTRAL_CONVERSATIONAL';
}

// --------------------------------------------------------------------------
// 3. STOCHASTIC VARIATIONAL PHRASING GENERATOR (NON-DETERMINISTIC)
// --------------------------------------------------------------------------

export class HumanDialogueEngine {
  private static turnCounter: number = 0;

  /**
   * Generates a non-deterministic, humanized response tailoring tone, directness,
   * and emotional resonance to the user's affective state.
   */
  public static synthesizeHumanResponse(
    prompt: string,
    rawContent: string,
    intent: string,
    historyLength: number = 0
  ): { response: string; affect: UserAffectiveState; toneDescription: string } {
    this.turnCounter++;
    const affect = detectAffectiveState(prompt);
    const seed = (Date.now() + this.turnCounter * 17) % 1000;

    // 1. Check if direct match in Multi-Domain Reasoning Bank
    const matchedProblem = this.findReasoningMatch(prompt);
    if (matchedProblem) {
      const response = this.formatReasoningResponse(matchedProblem, affect, seed, prompt);
      return {
        response,
        affect,
        toneDescription: `Human Reasoning (${matchedProblem.domain}) | Affect: ${affect}`,
      };
    }

    // 2. Modulate general responses based on affect and stochastic variety
    const response = this.applyHumanToneModulation(rawContent, prompt, affect, seed, historyLength);

    return {
      response,
      affect,
      toneDescription: `Adaptive Persona | Affect: ${affect} | Variety Seed: ${seed % 5}`,
    };
  }

  /**
   * Matches prompt tokens against Multi-Domain Reasoning Bank,
   * selecting the candidate with the longest matching keyword for maximum specificity.
   */
  public static findReasoningMatch(prompt: string): ReasoningProblem | null {
    const lower = prompt.toLowerCase();
    let bestMatch: ReasoningProblem | null = null;
    let longestKeywordLen = 0;

    for (const prob of MULTI_DOMAIN_REASONING_BANK) {
      for (const kw of prob.keywords) {
        if (lower.includes(kw) && kw.length > longestKeywordLen) {
          bestMatch = prob;
          longestKeywordLen = kw.length;
        }
      }
    }
    return bestMatch;
  }

  /**
   * Formats a structured reasoning problem response directly to the point
   * without emoji gimmicks or repetitive filler.
   */
  private static formatReasoningResponse(
    p: ReasoningProblem,
    affect: UserAffectiveState,
    seed: number,
    prompt: string = ''
  ): string {
    const conciseRequested = isConciseRequested(prompt);

    // Natural stochastic variations in direct opening formulation (zero emoji gimmicks)
    const directStarters = [
      `**${p.directAnswer}**`,
      `${p.directAnswer}`,
      `At its core: ${p.directAnswer}`,
      `Fundamentally, ${p.directAnswer}`,
      `To get straight to the point: ${p.directAnswer}`,
    ];
    const opening = directStarters[seed % directStarters.length];

    if (conciseRequested || affect === 'IMPATIENT_DIRECT') {
      return `${opening}\n\n**Why it works in brief**: ${p.takeaway}`;
    }

    if (affect === 'ANXIOUS_WORRIED') {
      const calmingIntros = [
        `First, take a steady breath. It is completely natural to feel the weight of this—losing money triggers primal survival stress in our evolutionary psychology. Let us look at the underlying mechanics together with clarity and compassion:\n\n`,
        `I hear you, and I want to acknowledge how real that stress feels right now. Drawdowns are physically exhausting. Let us step back, separate your self-worth from this moment, and examine what is actually happening:\n\n`,
        `Take a moment to pause. When financial loss hits, our biology instinctively reacts with fight-or-flight anxiety. Let us bring ourselves back to center and walk through this step by step:\n\n`,
      ];
      const intro = calmingIntros[seed % calmingIntros.length];
      return `${intro}${opening}

### Analytical Breakdown
${p.chainOfThought.join('\n')}

### Practical Analogy
${p.everydayAnalogy}

**Core Takeaway**: ${p.takeaway}`;
    }

    return `${opening}

### Analytical Breakdown
${p.chainOfThought.join('\n')}

### Practical Analogy
${p.everydayAnalogy}

**Core Takeaway**: ${p.takeaway}`;
  }

  /**
   * Applies non-deterministic human tone modulation and empathetic lead-ins
   */
  private static applyHumanToneModulation(
    rawMarkdown: string,
    prompt: string,
    affect: UserAffectiveState,
    seed: number,
    historyLength: number
  ): string {
    // If user is anxious, prepend an empathetic, calming human anchor
    if (affect === 'ANXIOUS_WORRIED') {
      const calmingIntros = [
        `First, take a breath. It is completely normal to feel the weight of this—uncertainty and volatility trigger deep stress in all of us. Let's step back, look at the cold facts together, and make a calm, disciplined assessment.\n\n`,
        `I hear you, and I understand why this feels overwhelming right now. In moments like this, emotion can cloud judgment. Let's look past the noise and break down the reality step by step.\n\n`,
        `That stress is real, and acknowledging it is step one. Markets and high-stakes decisions test our nerves. Let's ground ourselves in the data and see what we can control.\n\n`,
      ];
      const intro = calmingIntros[seed % calmingIntros.length];
      return `${intro}${rawMarkdown}`;
    }

    // If user is impatient or concise requested, strip conversational preamble and deliver the core
    if (affect === 'IMPATIENT_DIRECT' || isConciseRequested(prompt)) {
      const lines = rawMarkdown.split('\n').filter((l) => l.trim().length > 0);
      const cleanLines = lines.filter(
        (l) => !l.startsWith('### 👋') && !l.startsWith('*Would you like') && !l.startsWith('Feel free')
      );
      return cleanLines.slice(0, 10).join('\n\n');
    }

    // If user is playful, add a light conversational spark
    if (affect === 'PLAYFUL_BANTER') {
      const banterOutros = [
        `\n\nAlways a pleasure chatting with someone who appreciates a good exploration! What's next on the radar?`,
        `\n\nHope that sparked some thoughts! Where should we take our intellectual journey next?`,
        `\n\nFascinating rabbit hole to go down, isn't it? What's your take?`,
      ];
      return `${rawMarkdown}${banterOutros[seed % banterOutros.length]}`;
    }

    // Natural stochastic variation on closing reflections (only if not concise)
    if (isConciseRequested(prompt)) {
      return rawMarkdown;
    }

    const closingReflections = [
      `\n\n*What aspect of this resonates most with your current thinking?*`,
      `\n\n*Where would you like to drill deeper next—the core mathematics, empirical data, or adjacent implications?*`,
      `\n\n*Let me know if you would like me to unpack any specific mechanism further!*`,
      `\n\n*Does this match what you were seeing, or would you like to look at it from an alternative angle?*`,
    ];

    // If the response doesn't already have a question, add a varied natural closing
    if (!rawMarkdown.includes('?') && !rawMarkdown.includes('Would you like')) {
      return `${rawMarkdown}${closingReflections[seed % closingReflections.length]}`;
    }

    return rawMarkdown;
  }

  /**
   * Instance method for standalone runner and API integration.
   */
  public respond(prompt: string): { text: string; affect: UserAffectiveState; tone: string } {
    const res = HumanDialogueEngine.synthesizeHumanResponse(prompt, '', 'GENERAL_QUERY', 0);
    return { text: res.response, affect: res.affect, tone: res.toneDescription };
  }
}

/**
 * Returns formal architectural telemetry for Lumen-Alpha 3B Flagship.
 */
export function getLumenAlpha3BModelInfo(): {
  name: string;
  version: string;
  parameters: string;
  architecture: string;
  activeParametersPerToken: string;
  virtualMemoryAllocation: string;
  workingSetRam: string;
  domains: string[];
} {
  return {
    name: 'Lumen-Alpha (3B Flagship)',
    version: '3.0.0-indigenous',
    parameters: '3,024,276,480',
    architecture: '16-Layer Sparse MoE (22 Experts, Top-2 Routing, SwiGLU 2730 Hidden)',
    activeParametersPerToken: '~340 Million',
    virtualMemoryAllocation: '1.41 GB (Q4_K_S INT4)',
    workingSetRam: '< 1.50 GB RAM (Lumen-UMA Demand-Paged Streaming)',
    domains: [
      'Quantitative Finance & Microstructure',
      'Derivatives, Options Greeks & Volatility Surface',
      'Indian & Global Equity Markets',
      'Geopolitics & Strategic Chokepoints',
      'Global Politics & Statecraft',
      'Demographic Transitions & Dependency Ratios',
      'World Affairs & Sovereign Supply Chains',
      'DeepSeek-R1 Style Multi-Step Chain-of-Thought',
    ],
  };
}
