/**
 * LUMEN-ASTRA-FIN 1.0: CAUSAL FINANCIAL GRAPH & CONTAGION MATRIX
 * Defines directional shock propagation and sector elasticity betas across the Indian market.
 */

import { CausalEdge } from '../types';

export const CAUSAL_EDGES: CausalEdge[] = [
  // 1. Crude Oil (Brent) Price Shock Propagation
  { source: 'BRENT_CRUDE_SURGE', target: 'ONGC', elasticityBeta: 0.75, lagMinutes: 5, mechanism: 'Upstream exploration revenue realization surge' },
  { source: 'BRENT_CRUDE_SURGE', target: 'BPCL', elasticityBeta: -0.45, lagMinutes: 10, mechanism: 'Refining and marketing gross margin squeeze' },
  { source: 'BRENT_CRUDE_SURGE', target: 'IOC', elasticityBeta: -0.45, lagMinutes: 10, mechanism: 'Fuel marketing margin compression' },
  { source: 'BRENT_CRUDE_SURGE', target: 'ASIANPAINT', elasticityBeta: -0.68, lagMinutes: 15, mechanism: 'Titanium dioxide and crude derivative raw material cost explosion' },
  { source: 'BRENT_CRUDE_SURGE', target: 'BERGEPAINT', elasticityBeta: -0.68, lagMinutes: 15, mechanism: 'Petrochemical input cost inflation' },
  { source: 'BRENT_CRUDE_SURGE', target: 'PIDILITIND', elasticityBeta: -0.40, lagMinutes: 15, mechanism: 'Vinyl Acetate Monomer (VAM) feedstock price inflation' },

  // 2. Global Tech Spending & US Enterprise Demand
  { source: 'US_TECH_SPEND_EXPANSION', target: 'TCS', elasticityBeta: 0.70, lagMinutes: 10, mechanism: 'BFSI enterprise digital cloud migration acceleration' },
  { source: 'US_TECH_SPEND_EXPANSION', target: 'INFY', elasticityBeta: 0.75, lagMinutes: 10, mechanism: 'Large deal TCV pipeline execution' },
  { source: 'US_TECH_SPEND_EXPANSION', target: 'HCLTECH', elasticityBeta: 0.65, lagMinutes: 10, mechanism: 'Infrastructure services and ER&D growth' },
  { source: 'US_TECH_SPEND_EXPANSION', target: 'LTTS', elasticityBeta: 0.80, lagMinutes: 10, mechanism: 'High-beta industrial ER&D engineering contracts' },
  { source: 'US_TECH_SPEND_EXPANSION', target: 'KPITTECH', elasticityBeta: 0.85, lagMinutes: 10, mechanism: 'Automotive embedded SDV software architecture acceleration' },

  // 3. Indian Defense Indigenization & MoD Procurement Capital Outlay
  { source: 'DEFENSE_PROCUREMENT_EXPANSION', target: 'HAL', elasticityBeta: 0.85, lagMinutes: 5, mechanism: 'Fighter jet, helicopter and aircraft engine multi-year order backlog' },
  { source: 'DEFENSE_PROCUREMENT_EXPANSION', target: 'BEL', elasticityBeta: 0.80, lagMinutes: 5, mechanism: 'Naval radar, electronic warfare and avionics platform indigenization' },
  { source: 'DEFENSE_PROCUREMENT_EXPANSION', target: 'BHEL', elasticityBeta: 0.65, lagMinutes: 10, mechanism: 'Defense naval propulsion and power equipment orders' },

  // 4. RBI Interest Rate Trajectory & Liquidity
  { source: 'RBI_RATE_HIKE', target: 'HDFCBANK', elasticityBeta: 0.35, lagMinutes: 15, mechanism: 'Floating EBLR loan yield repricing faster than retail deposits' },
  { source: 'RBI_RATE_HIKE', target: 'ICICIBANK', elasticityBeta: 0.35, lagMinutes: 15, mechanism: 'Net Interest Margin (NIM) expansion' },
  { source: 'RBI_RATE_HIKE', target: 'BAJFINANCE', elasticityBeta: -0.45, lagMinutes: 15, mechanism: 'Short-term commercial paper borrowing cost increase vs fixed EMI loans' },
  { source: 'RBI_RATE_HIKE', target: 'SHRIRAMFIN', elasticityBeta: -0.40, lagMinutes: 15, mechanism: 'Cost of funds inflation in commercial vehicle financing' },

  // 5. Global Steel & Industrial Metal Demand (China Stimulus)
  { source: 'METAL_DEMAND_EXPANSION', target: 'TATASTEEL', elasticityBeta: 0.78, lagMinutes: 5, mechanism: 'Hot rolled coil (HRC) spot price realization improvement' },
  { source: 'METAL_DEMAND_EXPANSION', target: 'JSWSTEEL', elasticityBeta: 0.75, lagMinutes: 5, mechanism: 'Capacity utilization and domestic infrastructure consumption' },
  { source: 'METAL_DEMAND_EXPANSION', target: 'HINDALCO', elasticityBeta: 0.72, lagMinutes: 5, mechanism: 'Novelis aluminum can recycling spread and domestic copper demand' },
  { source: 'METAL_DEMAND_EXPANSION', target: 'JINDALSTEL', elasticityBeta: 0.75, lagMinutes: 5, mechanism: 'Long steel rail and structural steel demand expansion' },
];
