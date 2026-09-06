import {
  OptimizationResult,
  HRPAllocation,
  BlackLittermanInputs,
  VaRReport,
  MonteCarloSimulationResult,
} from './types';

// Standard normal quantile approximation for parametric VaR / CVaR
export function standardNormalQuantile(p: number): number {
  // Rational approximation for inverse normal CDF (Wichura / Beasley-Springer-Moro approximation)
  if (p <= 0 || p >= 1) {
    throw new Error('Quantile probability p must be between 0 and 1 strictly.');
  }
  if (p === 0.5) return 0;

  // Symmetry
  const q = p < 0.5 ? p : 1 - p;
  const t = Math.sqrt(-2 * Math.log(q));

  // Coefficients for polynomial approximation
  const c0 = 2.515517;
  const c1 = 0.802853;
  const c2 = 0.010328;
  const d1 = 1.432788;
  const d2 = 0.189269;
  const d3 = 0.001308;

  const numerator = c0 + t * (c1 + t * c2);
  const denominator = 1 + t * (d1 + t * (d2 + t * d3));
  const z = t - numerator / denominator;

  return p < 0.5 ? -z : z;
}

/**
 * Computes asset returns covariance matrix and correlation matrix from price histories.
 */
export function computeCovarianceMatrix(priceHistories: Record<string, number[]>): {
  assets: string[];
  cov: number[][];
  corr: number[][];
  volatilities: number[];
  meanReturns: number[];
} {
  const assets = Object.keys(priceHistories);
  const n = assets.length;

  // Compute log returns
  const returnSeries: Record<string, number[]> = {};
  for (const a of assets) {
    const prices = priceHistories[a];
    const rets: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const r = prices[i - 1] > 0 ? Math.log(prices[i] / prices[i - 1]) : 0;
      rets.push(r);
    }
    returnSeries[a] = rets;
  }

  const length = Math.min(...assets.map((a) => returnSeries[a].length));
  const meanReturns: number[] = [];
  for (let i = 0; i < n; i++) {
    const rets = returnSeries[assets[i]].slice(0, length);
    const mean = rets.reduce((sum, r) => sum + r, 0) / Math.max(1, length);
    meanReturns.push(mean);
  }

  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const corr: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const volatilities: number[] = [];

  for (let i = 0; i < n; i++) {
    const retsI = returnSeries[assets[i]].slice(0, length);
    const meanI = meanReturns[i];

    for (let j = i; j < n; j++) {
      const retsJ = returnSeries[assets[j]].slice(0, length);
      const meanJ = meanReturns[j];

      let sumCross = 0;
      for (let k = 0; k < length; k++) {
        sumCross += (retsI[k] - meanI) * (retsJ[k] - meanJ);
      }
      const c = sumCross / Math.max(1, length - 1);
      cov[i][j] = c;
      cov[j][i] = c;
    }
    const vol = Math.sqrt(Math.max(1e-8, cov[i][i]));
    volatilities.push(vol);
  }

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      corr[i][j] = cov[i][j] / (volatilities[i] * volatilities[j] || 1);
      corr[i][j] = Math.max(-1, Math.min(1, corr[i][j]));
    }
  }

  return { assets, cov, corr, volatilities, meanReturns };
}

/**
 * Hierarchical Risk Parity (HRP) based on Marcos López de Prado (2016).
 * Builds tree clusters using correlation distance and recursively bisects weights
 * without requiring matrix inversion (immune to ill-conditioned covariance matrices).
 */
export function calculateHRP(priceHistories: Record<string, number[]>): HRPAllocation {
  const { assets, cov, corr, volatilities } = computeCovarianceMatrix(priceHistories);
  const n = assets.length;

  if (n === 0) {
    return { weights: {}, clusterOrder: [], diversificationRatio: 1 };
  }
  if (n === 1) {
    return { weights: { [assets[0]]: 1.0 }, clusterOrder: [assets[0]], diversificationRatio: 1 };
  }

  // 1. Correlation distance matrix D_ij = sqrt(0.5 * (1 - rho_ij))
  const dist: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      dist[i][j] = Math.sqrt(Math.max(0, 0.5 * (1 - corr[i][j])));
    }
  }

  // 2. Hierarchical clustering (single linkage agglomerative)
  interface ClusterNode {
    id: number;
    items: number[];
    left?: ClusterNode;
    right?: ClusterNode;
    dist: number;
  }

  let clusters: ClusterNode[] = assets.map((_, i) => ({ id: i, items: [i], dist: 0 }));
  let nextId = n;

  while (clusters.length > 1) {
    let minD = Infinity;
    let bestI = 0;
    let bestJ = 1;

    for (let i = 0; i < clusters.length; i++) {
      for (let j = i + 1; j < clusters.length; j++) {
        // Distance between clusters (single linkage)
        let dMin = Infinity;
        for (const u of clusters[i].items) {
          for (const v of clusters[j].items) {
            if (dist[u][v] < dMin) dMin = dist[u][v];
          }
        }
        if (dMin < minD) {
          minD = dMin;
          bestI = i;
          bestJ = j;
        }
      }
    }

    const c1 = clusters[bestI];
    const c2 = clusters[bestJ];
    const merged: ClusterNode = {
      id: nextId++,
      items: [...c1.items, ...c2.items],
      left: c1,
      right: c2,
      dist: minD,
    };

    clusters = clusters.filter((_, idx) => idx !== bestI && idx !== bestJ);
    clusters.push(merged);
  }

  const root = clusters[0];

  // 3. Quasi-Diagonalization (Seriation from dendrogram traversal)
  const clusterOrderIdx: number[] = [];
  function traverse(node?: ClusterNode) {
    if (!node) return;
    if (!node.left && !node.right) {
      clusterOrderIdx.push(node.id);
      return;
    }
    traverse(node.left);
    traverse(node.right);
  }
  traverse(root);

  const clusterOrder = clusterOrderIdx.map((i) => assets[i]);

  // 4. Recursive Bisection
  const rawWeights: Record<number, number> = {};
  for (const idx of clusterOrderIdx) rawWeights[idx] = 1.0;

  function bisect(items: number[]) {
    if (items.length <= 1) return;

    const mid = Math.floor(items.length / 2);
    const leftItems = items.slice(0, mid);
    const rightItems = items.slice(mid);

    // Compute cluster variance for left and right clusters using inverse-variance intra-weights
    const computeClusterVar = (cluster: number[]) => {
      let invSum = 0;
      for (const idx of cluster) {
        invSum += 1 / Math.max(1e-8, cov[idx][idx]);
      }
      const intraW: number[] = cluster.map((idx) => (1 / Math.max(1e-8, cov[idx][idx])) / invSum);

      let v = 0;
      for (let i = 0; i < cluster.length; i++) {
        for (let j = 0; j < cluster.length; j++) {
          v += intraW[i] * intraW[j] * cov[cluster[i]][cluster[j]];
        }
      }
      return Math.max(1e-8, v);
    };

    const varLeft = computeClusterVar(leftItems);
    const varRight = computeClusterVar(rightItems);

    const alpha = 1 - varLeft / (varLeft + varRight);

    for (const idx of leftItems) {
      rawWeights[idx] *= alpha;
    }
    for (const idx of rightItems) {
      rawWeights[idx] *= 1 - alpha;
    }

    bisect(leftItems);
    bisect(rightItems);
  }

  bisect(clusterOrderIdx);

  // Normalize final weights
  const totalWeight = Object.values(rawWeights).reduce((sum, w) => sum + w, 0);
  const weights: Record<string, number> = {};
  let weightedVolSum = 0;
  for (let i = 0; i < n; i++) {
    const w = (rawWeights[i] || 0) / (totalWeight || 1);
    weights[assets[i]] = +w.toFixed(4);
    weightedVolSum += w * (volatilities[i] || 0.02);
  }

  // Portfolio total variance
  let portVar = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      portVar += weights[assets[i]] * weights[assets[j]] * cov[i][j];
    }
  }
  const portVol = Math.sqrt(Math.max(1e-8, portVar));
  const diversificationRatio = weightedVolSum / (portVol || 1);

  return {
    weights,
    clusterOrder,
    diversificationRatio: +diversificationRatio.toFixed(3),
  };
}

/**
 * Computes parametric and empirical historical Value at Risk (VaR) and Expected Shortfall (CVaR).
 */
export function calculateVaRAndCVaR(
  portfolioEquity: number,
  historicalReturns: number[],
  dailyVolatility: number = 0.02,
  dailyDrift: number = 0.0005
): VaRReport {
  // Parametric Gaussian VaR
  // VaR_alpha = -(mu - z_alpha * sigma) * Equity
  const z95 = 1.644853;
  const z99 = 2.326348;

  const pVaR95 = Math.max(0, -(dailyDrift - z95 * dailyVolatility) * portfolioEquity);
  const pVaR99 = Math.max(0, -(dailyDrift - z99 * dailyVolatility) * portfolioEquity);

  // Parametric Gaussian CVaR (Expected Shortfall)
  // CVaR_alpha = -(mu - (pdf(z_alpha) / (1 - alpha)) * sigma) * Equity
  const pdf95 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z95 * z95);
  const pdf99 = (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z99 * z99);

  const cVar95 = Math.max(pVaR95, -(dailyDrift - (pdf95 / 0.05) * dailyVolatility) * portfolioEquity);
  const cVar99 = Math.max(pVaR99, -(dailyDrift - (pdf99 / 0.01) * dailyVolatility) * portfolioEquity);

  // Historical VaR & CVaR
  let hVaR95 = pVaR95;
  let hVaR99 = pVaR99;

  if (historicalReturns.length >= 20) {
    const sorted = [...historicalReturns].sort((a, b) => a - b);
    const idx95 = Math.floor(sorted.length * 0.05);
    const idx99 = Math.floor(sorted.length * 0.01);

    const ret95 = sorted[idx95];
    const ret99 = sorted[idx99];

    hVaR95 = Math.max(0, -ret95 * portfolioEquity);
    hVaR99 = Math.max(0, -ret99 * portfolioEquity);
  }

  return {
    parametricVaR95: +pVaR95.toFixed(2),
    parametricVaR99: +pVaR99.toFixed(2),
    historicalVaR95: +hVaR95.toFixed(2),
    historicalVaR99: +hVaR99.toFixed(2),
    cVar95: +cVar95.toFixed(2),
    cVar99: +cVar99.toFixed(2),
    portfolioEquity: +portfolioEquity.toFixed(2),
  };
}

/**
 * Simulates 1,000 Monte Carlo Geometric Brownian Motion (GBM) trajectories
 * S_{t+dt} = S_t * exp((mu - 0.5 * sigma^2) * dt + sigma * sqrt(dt) * Z)
 */
export function runMonteCarloSimulation(
  initialPrice: number,
  annualDrift: number = 0.08,
  annualVol: number = 0.25,
  daysToSimulate: number = 30,
  numPaths: number = 1000
): MonteCarloSimulationResult {
  const dt = 1 / 365;
  const sqrtDt = Math.sqrt(dt);
  const driftTerm = (annualDrift - 0.5 * annualVol * annualVol) * dt;
  const volTerm = annualVol * sqrtDt;

  const terminalPrices: number[] = [];
  const paths: number[][] = [];
  let maxObservedDrawdownPct = 0;

  // Box-Muller transform for standard normal random variables
  function sampleStandardNormal(): number {
    let u1 = Math.random();
    let u2 = Math.random();
    while (u1 <= 1e-15) u1 = Math.random();
    return Math.sqrt(-2.0 * Math.log(u1)) * Math.cos(2.0 * Math.PI * u2);
  }

  for (let p = 0; p < numPaths; p++) {
    const currentPath: number[] = [initialPrice];
    let price = initialPrice;
    let peak = initialPrice;
    let maxPathDrawdown = 0;

    for (let t = 0; t < daysToSimulate; t++) {
      const z = sampleStandardNormal();
      price = price * Math.exp(driftTerm + volTerm * z);
      currentPath.push(price);

      if (price > peak) peak = price;
      const dd = (peak - price) / peak;
      if (dd > maxPathDrawdown) maxPathDrawdown = dd;
    }

    terminalPrices.push(price);
    if (p < 10) paths.push(currentPath); // retain top 10 representative paths for rendering
    if (maxPathDrawdown > maxObservedDrawdownPct) maxObservedDrawdownPct = maxPathDrawdown;
  }

  terminalPrices.sort((a, b) => a - b);
  const p5 = terminalPrices[Math.floor(numPaths * 0.05)];
  const p25 = terminalPrices[Math.floor(numPaths * 0.25)];
  const p50 = terminalPrices[Math.floor(numPaths * 0.50)];
  const p75 = terminalPrices[Math.floor(numPaths * 0.75)];
  const p95 = terminalPrices[Math.floor(numPaths * 0.95)];

  const losingPaths = terminalPrices.filter((p) => p < initialPrice).length;
  const probabilityOfLoss = losingPaths / numPaths;
  const simulatedVaR95Pct = Math.max(0, (initialPrice - p5) / initialPrice);

  return {
    paths,
    terminalPrices,
    medianTerminalPrice: +p50.toFixed(2),
    percentile5: +p5.toFixed(2),
    percentile25: +p25.toFixed(2),
    percentile75: +p75.toFixed(2),
    percentile95: +p95.toFixed(2),
    probabilityOfLoss: +probabilityOfLoss.toFixed(3),
    maxSimulatedDrawdownPct: +(maxObservedDrawdownPct * 100).toFixed(2),
    simulatedVaR95Pct: +(simulatedVaR95Pct * 100).toFixed(2),
  };
}
