/**
 * LUMEN ASTRA: GLOBAL MACRO, GEOPOLITICAL & DEFENSE CAUSAL TAXONOMY
 * 
 * Formalizes causal transmission mechanics across:
 * 1. Stocks & Equity Markets
 * 2. Commerce & Global Trade
 * 3. Governments & Central Banks (Monetary / Fiscal Policies)
 * 4. Wars, Geopolitics & Military Defense
 * 5. Commodities & Energy (Crude Oil, Gas, Strategic Reserves)
 */

export type MacroDomain =
  | 'STOCKS_AND_EQUITIES'
  | 'COMMERCE_AND_GLOBAL_TRADE'
  | 'GOVERNMENTS_AND_CENTRAL_BANKS'
  | 'WARS_GEOPOLITICS_AND_DEFENSE'
  | 'COMMODITIES_AND_OIL';

export interface CausalTransmissionPath {
  impulse: string;
  channel: string;
  intermediateEffects: string[];
  finalMarketImpact: string;
  recommendedAction: string;
  confidenceScore: number;
}

export interface MacroEventScenario {
  domain: MacroDomain;
  headline: string;
  entities: string[];
  transmission: CausalTransmissionPath;
  urgency: number; // 0-100
  marketRegime: string;
  thoughtTrace: string;
  action: string;
  verdictText: string;
}

// ----------------------------------------------------------------------------
// 1. DOMAIN SPECIFIC ENTITY & TRANSMISSION REGISTRIES
// ----------------------------------------------------------------------------

export const DEFENSE_ENTITIES = [
  'Hindustan Aeronautics (HAL)',
  'Bharat Electronics (BEL)',
  'Bharat Dynamics (BDL)',
  'Mazagon Dock Shipbuilders',
  'Cochin Shipyard',
  'DRDO',
  'Ministry of Defence (MoD)',
  'Indian Air Force (IAF)',
  'Indian Navy',
  'Lockheed Martin',
  'Raytheon (RTX)',
  'Northrop Grumman',
  'BAE Systems',
  'NATO Alliance',
];

export const COMMODITY_ENTITIES = [
  'Brent Crude Oil',
  'WTI Light Sweet Crude',
  'OPEC+ Ministerial Committee',
  'Saudi Aramco',
  'Natural Gas (Henry Hub)',
  'Strategic Petroleum Reserve (SPR)',
  'Gold Bullion (XAU/USD)',
  'LME Copper',
  'Strait of Hormuz Tanker Traffic',
  'Red Sea Bab el-Mandeb Route',
];

export const CENTRAL_BANK_ENTITIES = [
  'Reserve Bank of India (RBI)',
  'Monetary Policy Committee (MPC)',
  'US Federal Reserve (FOMC)',
  'European Central Bank (ECB)',
  'Bank of Japan (BOJ)',
  'US 10-Year Treasury Yield',
  'India 10-Year Benchmark G-Sec',
  'Securities and Exchange Board of India (SEBI)',
  'US Securities and Exchange Commission (SEC)',
  'International Monetary Fund (IMF)',
];

export const COMMERCE_ENTITIES = [
  'Global Supply Chain Alliance',
  'Baltic Dry Index (Freight)',
  'Semiconductor Manufacturing Foundries',
  'World Trade Organization (WTO)',
  'US-China Trade Representative',
  'Ministry of Commerce & Industry (India)',
  'Container Shipping Convoys',
  'Export-Import Bank of India',
  'Port of Rotterdam / Singapore Hubs',
];

export const EQUITY_ENTITIES = [
  'Nifty 50 Index',
  'Nifty IT Index',
  'Nifty Bank Index',
  'Reliance Industries (RELIANCE)',
  'Tata Consultancy Services (TCS)',
  'Infosys Limited (INFY)',
  'Tata Power (TATAPOWER)',
  'State Bank of India (SBIN)',
  'HDFC Bank (HDFCBANK)',
  'Larsen & Toubro (LT)',
  'Foreign Institutional Investors (FII)',
  'Domestic Institutional Investors (DII)',
];

// ----------------------------------------------------------------------------
// 2. CAUSAL PATTERNS & TRANSMISSION TEMPLATES
// ----------------------------------------------------------------------------

export const TRANSMISSION_TEMPLATES: Record<MacroDomain, Array<{
  patternName: string;
  generateScenario: (seed: number) => MacroEventScenario;
}>> = {
  WARS_GEOPOLITICS_AND_DEFENSE: [
    {
      patternName: 'Strait_Chokepoint_Escalation',
      generateScenario: (seed: number) => {
        const tankerLocations = ['Strait of Hormuz', 'Red Sea Bab el-Mandeb', 'Gulf of Oman', 'Malacca Strait'];
        const location = tankerLocations[seed % tankerLocations.length];
        const crudeSpike = 4.5 + (seed % 6) * 0.8;
        const brentPrice = Math.round(78 + (seed % 15));

        return {
          domain: 'WARS_GEOPOLITICS_AND_DEFENSE',
          headline: `Naval drone interception in ${location} sparks maritime freight rerouting and ${crudeSpike.toFixed(1)}% crude surge`,
          entities: [location, 'Brent Crude Oil', 'Indian Navy', 'Global Shipping Convoys'],
          transmission: {
            impulse: `Naval skirmish in ${location}`,
            channel: 'Maritime risk premium -> Shipping insurance rates 3x -> Bunker fuel surcharges',
            intermediateEffects: [
              `Brent crude spikes past $${brentPrice}/bbl`,
              'War-risk insurance premiums jump 280 bps',
              'Container traffic diverted around Cape of Good Hope (+14 days transit)',
            ],
            finalMarketImpact: 'Aviation & paint manufacturers face severe input margin compression; defense contractors see heightened procurement orders.',
            recommendedAction: 'DEFENSIVE_EXIT',
            confidenceScore: 0.92,
          },
          urgency: 88,
          marketRegime: 'REGIME_VOLATILITY_SHOCK',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: Military confrontation in ${location} directly threatens critical tanker trade corridors.
2. Transmission: Crude supply risk drives Brent higher by ${crudeSpike.toFixed(1)}%. Upstream energy producers benefit, while downstream Indian oil-marketing companies and airline carriers face acute margin compression.
3. Scenario Tournament:
   - Scenario A (De-escalation): 25% probability
   - Scenario B (Prolonged naval corridor rerouting): 60% probability (Dominant)
   - Scenario C (Broad regional escalation): 15% probability
4. Risk Bounds: Enforce strict defense posture. Liquidate overleveraged cyclical holdings, respect ₹2,000 cash floor, and align defensive orders to ₹0.05 tick increment.`,
          action: 'DEFENSIVE_EXIT',
          verdictText: `Emergency geopolitical defense activated. Trimmed high-beta cyclical exposures by 50% due to ${crudeSpike.toFixed(1)}% energy price shock and elevated war risk premiums.`,
        };
      },
    },
    {
      patternName: 'Indigenous_Defense_Procurement',
      generateScenario: (seed: number) => {
        const contracts = [
          { company: 'Hindustan Aeronautics (HAL)', contractVal: '₹45,000 Crore', item: 'Tejas Mk1A Fighter Jets & GE F404 Engines' },
          { company: 'Bharat Electronics (BEL)', contractVal: '₹14,800 Crore', item: 'Next-Gen Radar Surveillance & EW Systems' },
          { company: 'Mazagon Dock Shipbuilders', contractVal: '₹22,000 Crore', item: 'Stealth Guided Missile Frigates' },
          { company: 'Bharat Dynamics (BDL)', contractVal: '₹8,500 Crore', item: 'Astra Beyond-Visual-Range Air-to-Air Missiles' },
        ];
        const c = contracts[seed % contracts.length];

        return {
          domain: 'WARS_GEOPOLITICS_AND_DEFENSE',
          headline: `Defence Acquisition Council grants Acceptance of Necessity (AoN) for ${c.contractVal} to ${c.company} for ${c.item}`,
          entities: [c.company, 'Ministry of Defence (MoD)', 'Defence Acquisition Council', 'Indian Air Force (IAF)'],
          transmission: {
            impulse: `Sovereign defense procurement sanction of ${c.contractVal}`,
            channel: 'Order backlog surge -> 5-year revenue visibility expansion -> ROE expansion',
            intermediateEffects: [
              `Contract value represents ${3.2 + (seed % 3)}x annual revenue backlog`,
              'Operating leverage kicks in with 85% indigenous sourcing',
              'Institutional FII/DII accumulation triggered on institutional block window',
            ],
            finalMarketImpact: `Multi-year structural re-rating for ${c.company}; persistent multi-month institutional inflows.`,
            recommendedAction: 'BUY_BREAKOUT',
            confidenceScore: 0.95,
          },
          urgency: 75,
          marketRegime: 'REGIME_BULL_TREND',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: DAC approves ${c.contractVal} defense contract for ${c.company}.
2. Transmission: 100% sovereign cash-flow certainty backed by Union Budget capital outlay. Zero customer counterparty risk.
3. Scenario Tournament:
   - Scenario A (Sustained multi-quarter breakout): 70% probability (Dominant)
   - Scenario B (Short-term gap-and-fade): 20% probability
   - Scenario C (Execution delay): 10% probability
4. Invariant Verification: Position sizing capped to 1.5% NAV, entry quantized to exact ₹0.05 tick size.`,
          action: 'BUY_BREAKOUT',
          verdictText: `High-conviction accumulation proposal for ${c.company}. Backlog expansion guarantees revenue visibility through 2029 with zero sovereign default risk.`,
        };
      },
    },
    {
      patternName: 'Sanctions_and_Asset_Freeze',
      generateScenario: (seed: number) => {
        const nations = ['Eastern European Energy Transit', 'Central Asian Minerals Corridor', 'Baltic Port Logistics'];
        const nat = nations[seed % nations.length];

        return {
          domain: 'WARS_GEOPOLITICS_AND_DEFENSE',
          headline: `Comprehensive multilateral secondary sanctions imposed on ${nat}, restricting dual-use tech and foreign exchange clearing`,
          entities: [nat, 'Ministry of External Affairs', 'UN Security Council', 'RBI Foreign Exchange Desk'],
          transmission: {
            impulse: 'Secondary sanctions and trade settlement restrictions',
            channel: 'Cross-border clearing friction -> Rupee-Dirham / Rupee-Ruble settlement realignment -> Trade payment lead time extension',
            intermediateEffects: [
              'Exporters establish alternative non-dollar clearing mechanisms',
              'Commodity clearing discounts widen 8-12%',
              'Sovereign forex reserves adjusted to increase gold allocation',
            ],
            finalMarketImpact: 'Selective friction for cross-border engineering exporters; increased currency hedge demand among large conglomerates.',
            recommendedAction: 'HOLD',
            confidenceScore: 0.86,
          },
          urgency: 70,
          marketRegime: 'REGIME_RANGE_BOUND',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: Sanctions and payment restriction across ${nat}.
2. Transmission: Indian corporate treasuries hedge currency exposures. Short-term export receivables experience transit friction.
3. Decision: Maintain disciplined position sizing, monitor rupee exchange volatility, and hold core allocations.`,
          action: 'HOLD',
          verdictText: `Geopolitical sanctions monitored. Currency hedging directives recommended for international trade exposures.`,
        };
      },
    },
  ],

  COMMODITIES_AND_OIL: [
    {
      patternName: 'OPEC_Production_Cut',
      generateScenario: (seed: number) => {
        const cutMbd = 1.0 + (seed % 5) * 0.5;
        const brentTarget = 82 + (seed % 14);

        return {
          domain: 'COMMODITIES_AND_OIL',
          headline: `OPEC+ extends voluntary crude production cuts of ${cutMbd.toFixed(1)} million barrels/day through year-end`,
          entities: ['OPEC+ Ministerial Committee', 'Saudi Aramco', 'Brent Crude Oil', 'Reliance Industries (RELIANCE)'],
          transmission: {
            impulse: `Deficit balance shock of ${cutMbd.toFixed(1)}M bpd`,
            channel: 'Global crude supply tightening -> OECD inventory drawdowns -> Backwardation curve steepening',
            intermediateEffects: [
              `Brent crude forward curve steepens into steep backwardation at $${brentTarget}/bbl`,
              'Refining crack spreads expand to $14.50/bbl',
              'Indian current account deficit (CAD) sensitivity rises $2.1B per $10 crude rally',
            ],
            finalMarketImpact: 'Upstream oil explorers and refiners (Reliance, ONGC) see EBITDA upgrades; automotive and chemical sectors derate.',
            recommendedAction: 'ACCUMULATE',
            confidenceScore: 0.89,
          },
          urgency: 80,
          marketRegime: 'REGIME_HIGH_VOLATILITY',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: Cartel supply reduction of ${cutMbd.toFixed(1)}M bpd reinforces price floor above $${brentTarget}.
2. Transmission: Singapore Gross Refining Margins (GRM) widen. Integrated refiners with complex refining setups (e.g. RELIANCE Jamnagar) extract premium diesel spreads.
3. Strategic Sizing: Allocate accumulation tranches near VWAP support; hedge broader index exposure against imported inflation.`,
          action: 'ACCUMULATE',
          verdictText: `Strategic accumulation ticket formatted for energy refiners benefiting from expanded refining crack spreads.`,
        };
      },
    },
    {
      patternName: 'Strategic_Petroleum_Reserve_Drawdown',
      generateScenario: (seed: number) => {
        const sprMb = 20 + (seed % 30);
        return {
          domain: 'COMMODITIES_AND_OIL',
          headline: `Emergency release of ${sprMb} million barrels from Strategic Petroleum Reserves authorized to calm global fuel inflation`,
          entities: ['Strategic Petroleum Reserve (SPR)', 'Brent Crude Oil', 'WTI Light Sweet Crude', 'Indian Strategic Petroleum Reserves (ISPRL)'],
          transmission: {
            impulse: `Immediate physical crude injection of ${sprMb}M barrels`,
            channel: 'Near-term prompt month prompt supply relief -> Backwardation flattening -> Retail pump price stabilization',
            intermediateEffects: [
              'Brent crude eases 3.2% to test 50-day moving average support',
              'Indian oil marketing companies (OMCs) recover marketing margins',
              'Refining utilization rates pushed to maximum throughput',
            ],
            finalMarketImpact: 'EBITDA relief for downstream fuel distributors; dampens short-term inflation expectations.',
            recommendedAction: 'PROFIT_HARVEST',
            confidenceScore: 0.91,
          },
          urgency: 65,
          marketRegime: 'REGIME_RANGE_BOUND',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: Strategic reserve injection provides temporary supply buffer.
2. Transmission: Spot energy prices cool down, providing margin relief to transportation and downstream logistics.
3. Decision: Harvest profits on upstream energy longs near upper Bollinger band; rotate into high-conviction manufacturing leaders.`,
          action: 'PROFIT_HARVEST',
          verdictText: `Profit harvest executed on energy positions following strategic reserve injection and momentum cooling.`,
        };
      },
    },
  ],

  GOVERNMENTS_AND_CENTRAL_BANKS: [
    {
      patternName: 'Central_Bank_Rate_Decision',
      generateScenario: (seed: number) => {
        const isHike = seed % 2 === 0;
        const bps = 25;
        const actionWord = isHike ? 'hikes benchmark repo rate' : 'cuts benchmark repo rate';
        const rate = isHike ? '6.75%' : '6.25%';

        return {
          domain: 'GOVERNMENTS_AND_CENTRAL_BANKS',
          headline: `Monetary Policy Committee unanimously ${actionWord} by ${bps} bps to ${rate}, citing ${isHike ? 'food inflation resilience' : 'growth impulse revival'}`,
          entities: ['Reserve Bank of India (RBI)', 'Monetary Policy Committee (MPC)', 'India 10-Year Benchmark G-Sec', 'Nifty Bank Index'],
          transmission: {
            impulse: `${bps} bps policy rate shift by RBI MPC`,
            channel: 'Interbank liquidity adjustment -> Overnight call money rate -> Bank Net Interest Margins (NIM)',
            intermediateEffects: [
              `10-Year G-Sec yield shifts ${isHike ? '+12 bps to 7.18%' : '-15 bps to 6.88%'}`,
              `${isHike ? 'Mortgage and auto loan borrowing costs rise' : 'Credit demand accelerates across SME and retail sectors'}`,
              'Banking sector liquidity conditions normalize across systemic balances',
            ],
            finalMarketImpact: isHike
              ? 'Rate-sensitive sectors (Real Estate, Auto) encounter multiple contraction; large private banks maintain margin defense.'
              : 'Broad equity multiple expansion; high-beta and mid-cap rally initiated.',
            recommendedAction: isHike ? 'DEFENSIVE_EXIT' : 'BUY_BREAKOUT',
            confidenceScore: 0.94,
          },
          urgency: 90,
          marketRegime: isHike ? 'REGIME_HIGH_VOLATILITY' : 'REGIME_BULL_TREND',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: RBI MPC shifts repo rate by ${bps} bps to ${rate}.
2. Transmission: Terminal discount rates in DCF valuation models shift. In a ${isHike ? 'tightening' : 'loosening'} regime, cost of capital dictates sector leadership.
3. Decision: ${isHike ? 'Trim interest-rate sensitive cyclical holdings, preserve liquid cash' : 'Deploy capital into high-quality private banks and capital goods leaders'}.`,
          action: isHike ? 'DEFENSIVE_EXIT' : 'BUY_BREAKOUT',
          verdictText: `Macro interest rate regime repositioning. Realigned portfolio beta to match central bank monetary stance.`,
        };
      },
    },
    {
      patternName: 'SEBI_Regulatory_Intervention',
      generateScenario: (seed: number) => {
        const rules = [
          'Upstream client collateral verification & intraday peak margin enforcement',
          'Tighter index derivatives contract lot size standardization',
          'Enhanced algorithmic trading disclosures and co-location latency audits',
        ];
        const r = rules[seed % rules.length];

        return {
          domain: 'GOVERNMENTS_AND_CENTRAL_BANKS',
          headline: `SEBI notifies comprehensive circular mandating ${r} to enhance retail market stability`,
          entities: ['Securities and Exchange Board of India (SEBI)', 'Nifty 50 Index', 'Exchange Clearing Corporations'],
          transmission: {
            impulse: `SEBI regulatory circular on ${r}`,
            channel: 'Exchange margin compliance -> Retail option turnover rationalization -> Volatility compression',
            intermediateEffects: [
              'Speculative option contract trading volume declines 22%',
              'Cash market liquidity and delivery volumes maintain healthy depth',
              'Institutional algorithmic order routing experiences zero disruption',
            ],
            finalMarketImpact: 'Dampens speculative retail gamma squeezes; structural positive for long-term quantitative institutional strategies.',
            recommendedAction: 'QUANT_VERIFIED',
            confidenceScore: 0.93,
          },
          urgency: 80,
          marketRegime: 'REGIME_LOW_VOLATILITY',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: SEBI circular enforces market microstructure discipline.
2. Transmission: Eliminates excessive retail speculative froth. Our quantitative pilot already adheres to strict ₹0.05 tick size and integer lot compliance.
3. Decision: Maintain standard algorithmic operations with zero systemic compliance friction.`,
          action: 'QUANT_VERIFIED',
          verdictText: `SEBI regulatory compliance confirmed. Systematic algorithms fully conform to updated market microstructure boundaries.`,
        };
      },
    },
  ],

  COMMERCE_AND_GLOBAL_TRADE: [
    {
      patternName: 'Semiconductor_Tariff_Friction',
      generateScenario: (seed: number) => {
        const tariffPct = 15 + (seed % 15);
        const sector = 'High-Performance Advanced Silicon & AI Accelerators';

        return {
          domain: 'COMMERCE_AND_GLOBAL_TRADE',
          headline: `New multilateral trade restrictions impose ${tariffPct}% tariff surcharge on ${sector} transit`,
          entities: ['World Trade Organization (WTO)', 'Ministry of Commerce & Industry (India)', 'Semiconductor Manufacturing Foundries', 'Nifty IT Index'],
          transmission: {
            impulse: `${tariffPct}% tariff imposition on technology hardware`,
            channel: 'Hardware CAPEX inflation -> Delivery lead time expansion (+8 weeks) -> Enterprise tech renewal delays',
            intermediateEffects: [
              'Data center infrastructure procurement costs jump 18%',
              'Tech service providers accelerate domestic Indian hardware testing',
              'IT services margin expectations adjusted for hardware pass-through costs',
            ],
            finalMarketImpact: 'Selective outperformance for localized electronics manufacturers; mild near-term margin headwind for large IT exporters.',
            recommendedAction: 'STAND_ASIDE',
            confidenceScore: 0.88,
          },
          urgency: 65,
          marketRegime: 'REGIME_RANGE_BOUND',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: ${tariffPct}% trade tariff on technology transit creates supply friction.
2. Transmission: While direct software exports are exempt from physical goods tariffs, enterprise enterprise clients temporarily pause discretionary IT spending pending regulatory clarity.
3. Decision: Stand aside on fresh directional IT bets; monitor volume absorption at key VWAP bands.`,
          action: 'STAND_ASIDE',
          verdictText: `Regulatory trade friction observed. Standing aside on fresh long exposures until tariff pass-through terms stabilize.`,
        };
      },
    },
    {
      patternName: 'Supply_Chain_PLI_Manufacturing',
      generateScenario: (seed: number) => {
        const sector = ['Electronics Hardware & Mobiles', 'Renewable Energy Solar Cells', 'Advanced Chemistry Cell Batteries'][seed % 3];
        const outlay = ['₹18,000 Crore', '₹19,500 Crore', '₹24,000 Crore'][seed % 3];

        return {
          domain: 'COMMERCE_AND_GLOBAL_TRADE',
          headline: `Union Cabinet approves ${outlay} Production-Linked Incentive (PLI 2.0) expansion for ${sector}`,
          entities: ['Ministry of Commerce & Industry (India)', 'Nifty 50 Index', 'Tata Power (TATAPOWER)', 'Larsen & Toubro (LT)'],
          transmission: {
            impulse: `${outlay} sovereign capital incentive disbursement`,
            channel: 'Domestic manufacturing CAPEX acceleration -> Import substitution -> Corporate operating margin expansion',
            intermediateEffects: [
              'Commercial bank capital goods credit disbursements surge 14.5%',
              'Import dependence for critical components drops 30% over 24 months',
              'Infrastructure EPC conglomerates secure mega-foundry construction orders',
            ],
            finalMarketImpact: 'High-conviction structural momentum across capital goods, industrial machinery, and clean energy developers.',
            recommendedAction: 'BUY_BREAKOUT',
            confidenceScore: 0.94,
          },
          urgency: 78,
          marketRegime: 'REGIME_BULL_TREND',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: Sovereign ${outlay} PLI scheme directly lowers unit manufacturing cost.
2. Transmission: Domestic conglomerates gain significant cost advantage over imported alternatives. Operating leverage fuels sustained multi-year earnings upgrades.
3. Decision: Formulate buy breakout order for capital goods and utility leaders at VWAP expansion confirmation.`,
          action: 'BUY_BREAKOUT',
          verdictText: `Structural capital goods accumulation initiated. PLI manufacturing incentives unlock multi-year revenue compounding.`,
        };
      },
    },
  ],

  STOCKS_AND_EQUITIES: [
    {
      patternName: 'Bluechip_Earnings_Breakout',
      generateScenario: (seed: number) => {
        const stocks = [
          { symbol: 'RELIANCE', name: 'Reliance Industries', revenueBeat: '+14.2%', ebitdaMargin: '21.8%', catalyst: 'Jio 5G ARPU expansion and retail footfall surge' },
          { symbol: 'TCS', name: 'Tata Consultancy Services', revenueBeat: '+9.8%', ebitdaMargin: '26.4%', catalyst: '$10.2B total contract value (TCV) deal booking record' },
          { symbol: 'TATAPOWER', name: 'Tata Power', revenueBeat: '+18.5%', ebitdaMargin: '19.2%', catalyst: 'Renewable utility capacity commissioning ahead of schedule' },
          { symbol: 'INFY', name: 'Infosys Limited', revenueBeat: '+8.4%', ebitdaMargin: '22.1%', catalyst: 'Operating margin guidance raised 50 bps on generative AI enterprise contracts' },
          { symbol: 'SBIN', name: 'State Bank of India', revenueBeat: '+16.1%', ebitdaMargin: '32.5%', catalyst: 'Gross NPA ratio declines to 12-year low of 2.1% with robust credit growth' },
          { symbol: 'LT', name: 'Larsen & Toubro', revenueBeat: '+15.4%', ebitdaMargin: '11.8%', catalyst: 'International hydrocarbon and infrastructure order inflow crosses ₹80,000 Crore' },
        ];
        const s = stocks[seed % stocks.length];

        return {
          domain: 'STOCKS_AND_EQUITIES',
          headline: `${s.name} (${s.symbol}) reports Q3 earnings beat: Revenue up ${s.revenueBeat}, EBITDA margin at ${s.ebitdaMargin} on ${s.catalyst}`,
          entities: [s.symbol, s.name, 'Nifty 50 Index', 'Foreign Institutional Investors (FII)'],
          transmission: {
            impulse: `Exceptional Q3 financial results from ${s.symbol}`,
            channel: 'Consensus earnings upgrades -> Institutional forward P/E compression -> Quantitative short-squeeze',
            intermediateEffects: [
              `Operating margins beat analyst consensus estimates by ${120 + (seed % 80)} bps`,
              'Institutional FII buying volume 2.8x 30-day moving average',
              `Stock opens +${(2.2 + (seed % 3) * 0.5).toFixed(1)}% above previous day high with strong order book bid depth`,
            ],
            finalMarketImpact: `Strong directional continuation trade on ${s.symbol}; momentum spillover to broader sector basket.`,
            recommendedAction: 'BUY_BREAKOUT',
            confidenceScore: 0.96,
          },
          urgency: 85,
          marketRegime: 'REGIME_BULL_TREND',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: High-conviction earnings beat on ${s.symbol} with ${s.catalyst}.
2. Transmission: Institutional consensus upgrades will force systematic momentum funds to acquire shares on opening auction.
3. Quantitative Sizing: Half-Kelly position sizing with ₹2,000 cash reserve floor. Order price quantized strictly to ₹0.05 tick size.`,
          action: 'BUY_BREAKOUT',
          verdictText: `Institutional breakout order formulated for ${s.symbol}. Strong fundamental earnings beat confirmed by 2.8x institutional volume surge.`,
        };
      },
    },
    {
      patternName: 'Forensic_Accounting_Veto',
      generateScenario: (seed: number) => {
        const warnings = [
          'Auditor resignation over related-party transaction non-disclosure',
          'SEBI initiates forensic inquiry into revenue recognition practices',
          'Whistleblower complaint alleges off-balance-sheet debt concealment',
        ];
        const w = warnings[seed % warnings.length];
        const mockSymbol = ['MIDCAP_XYZ', 'SMALLCAP_SPEC', 'CORP_HOLDINGS'][seed % 3];

        return {
          domain: 'STOCKS_AND_EQUITIES',
          headline: `Regulatory Alert: ${w} on ${mockSymbol}; trading halted on circuit limit`,
          entities: [mockSymbol, 'Securities and Exchange Board of India (SEBI)', 'Statutory Auditor Board'],
          transmission: {
            impulse: `Forensic governance red flag: ${w}`,
            channel: 'Trust collapse -> Liquidity evaporation -> Lower circuit lock',
            intermediateEffects: [
              'Institutional custodians freeze stock lending and pledge facilities',
              'Sell orders overwhelm bid depth by 50:1 ratio',
              'Credit rating agencies downgrade debt instruments to default watch',
            ],
            finalMarketImpact: `Immediate catastrophic capital destruction on ${mockSymbol}.`,
            recommendedAction: 'EMERGENCY_VETO',
            confidenceScore: 0.99,
          },
          urgency: 100,
          marketRegime: 'REGIME_VOLATILITY_SHOCK',
          thoughtTrace: `[Macro Deliberation]
1. Impulse: Catastrophic governance failure detected on ${mockSymbol}.
2. Transmission: When corporate books cannot be verified, fundamental valuations collapse to zero.
3. Decision: Immediate emergency veto. Liquidate all existing positions, cancel pending bids, and blacklist ticker from trading universe.`,
          action: 'EMERGENCY_VETO',
          verdictText: `Emergency veto executed. Blacklisted ${mockSymbol} from algorithmic universe due to forensic audit failure.`,
        };
      },
    },
  ],
};

/**
 * Generates a deterministically rich, diverse scenario for any domain.
 */
export function generateSyntheticMacroScenario(domain: MacroDomain, seed: number): MacroEventScenario {
  const templates = TRANSMISSION_TEMPLATES[domain];
  const t = templates[seed % templates.length];
  return t.generateScenario(seed);
}
