import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");

export interface PrecisionViolation {
  file: string;
  line: number;
  content: string;
  description: string;
}

export const PRECISION_FORBIDDEN_RULES: {
  pattern: RegExp;
  description: string;
  targetFiles: string[];
}[] = [
  {
    pattern: /input\.price\s*\|\|\s*50000/g,
    description: "Fabricated 50000.00 price fallback",
    targetFiles: ["server/services/binanceGateway.ts", "server/services/symbolRules.ts"],
  },
  {
    pattern: /ExactDecimal\.from\s*\(\s*['"]50000\.00['"]\s*\)/g,
    description: "Hardcoded 50000.00 fallback in symbol rules",
    targetFiles: ["server/services/symbolRules.ts"],
  },
  {
    pattern: /\bExactDecimal\.from\s*\(\s*['"]0\.00075['"]\s*\)/g,
    description: "Fallback 0.00075 fee multiplier in settlement/recovery path",
    targetFiles: ["server/services/orderRecoveryService.ts", "server/services/ledgerService.ts"],
  },
  {
    pattern: /\bparseFloat\s*\(/g,
    description: "parseFloat call in financial execution boundary",
    targetFiles: [
      "server/services/binanceGateway.ts",
      "server/services/ledgerService.ts",
      "server/services/orderRecoveryService.ts",
      "server/services/reconciliationWorker.ts",
    ],
  },
  {
    pattern: /\bparseInt\s*\(/g,
    description: "parseInt call in financial execution boundary",
    targetFiles: [
      "server/services/binanceGateway.ts",
      "server/services/ledgerService.ts",
      "server/services/orderRecoveryService.ts",
      "server/services/reconciliationWorker.ts",
    ],
  },
  {
    pattern: /\.\s*toNumber\s*\(/g,
    description: "Deprecated .toNumber() call on financial decimal",
    targetFiles: [
      "server/services/binanceGateway.ts",
      "server/services/ledgerService.ts",
      "server/services/orderRecoveryService.ts",
      "server/services/reconciliationWorker.ts",
    ],
  },
  {
    pattern: /\.\s*toDisplayNumber\s*\(/g,
    description: "Lossy .toDisplayNumber() on authoritative execution/settlement path",
    targetFiles: [
      "server/services/binanceGateway.ts",
      "server/services/ledgerService.ts",
      "server/services/orderRecoveryService.ts",
    ],
  },
  {
    pattern: /\.\s*toFixed\s*\(/g,
    description: "Float .toFixed() stringification in financial services",
    targetFiles: [
      "server/services/binanceGateway.ts",
      "server/services/ledgerService.ts",
      "server/services/orderRecoveryService.ts",
      "server/services/reconciliationWorker.ts",
    ],
  },
  {
    pattern: /\bMath\.(floor|round|ceil|abs|max|min)\s*\(/g,
    description: "Math floating-point function call in financial logic",
    targetFiles: [
      "server/services/binanceGateway.ts",
      "server/services/ledgerService.ts",
      "server/services/orderRecoveryService.ts",
      "server/services/reconciliationWorker.ts",
    ],
  },
  {
    pattern: /Number\s*\(\s*normalized\.(priceStr|notionalStr|quantityStr)\s*\)\s*[*+-]/g,
    description: "Direct float arithmetic on normalized price/notional/quantity string",
    targetFiles: ["server/services/binanceGateway.ts"],
  },
  {
    pattern: /\bNumber\s*\(\s*(amountMinor|reservedCashMinor|reservedQtyMinor|balanceMinor|curBal|currentBal|newBal|feeMinor|costBasisMinor|realizedPnlMinor|totalQtyMinor|qtyAssetMinor|notionalCashMinor|absAmount|adjustment|adjustmentMinor|newBalanceMinor)\s*\)/g,
    description: "Dangerous conversion of BIGINT minor unit to JavaScript Number",
    targetFiles: [
      "server/services/ledgerService.ts",
      "server/services/binanceGateway.ts",
      "server/services/orderRecoveryService.ts",
      "server/services/reconciliationWorker.ts",
    ],
  },
  {
    pattern: /(totalExecutedQtyDec|avgPriceDec|totalExecutedNotionalDec|totalCommissionDec|fillPriceDec|fillQtyDec|fillCommissionDec|fillNotionalDec)\.toDisplayNumber\s*\(\s*\)/g,
    description: "Legacy REAL write in order settlement or fill insertion",
    targetFiles: ["server/services/binanceGateway.ts", "server/services/orderRecoveryService.ts"],
  },
  {
    pattern: /Promise<.*executedQty:\s*number/g,
    description: "dispatchToExchange return type leaking executedQty as number",
    targetFiles: ["server/services/binanceGateway.ts"],
  },
];

export function scanPrecisionBoundary(rootDir: string = ROOT): PrecisionViolation[] {
  const violations: PrecisionViolation[] = [];

  for (const rule of PRECISION_FORBIDDEN_RULES) {
    for (const relFile of rule.targetFiles) {
      const fullPath = path.join(rootDir, relFile);
      if (!fs.existsSync(fullPath)) continue;

      const content = fs.readFileSync(fullPath, "utf8");
      const lines = content.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.includes('// PRECISION_BOUNDARY')) continue;
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(line)) {
          violations.push({
            file: relFile,
            line: i + 1,
            content: line.trim(),
            description: rule.description,
          });
        }
      }
    }
  }

  return violations;
}

if (process.argv[1] && process.argv[1].endsWith("verifyPrecisionBoundary.ts")) {
  console.log('\n🔍 Scanning financial execution boundary for precision leakage and fabricated prices...\n');
  const violations = scanPrecisionBoundary(ROOT);

  if (violations.length > 0) {
    console.error(`❌ Found ${violations.length} precision boundary violation(s):\n`);
    for (const v of violations) {
      console.error(`  ${v.file}:${v.line} — ${v.description}`);
      console.error(`    ${v.content}\n`);
    }
    process.exit(1);
  } else {
    console.log('✅ Financial precision boundary clean. No float leakage or fabricated prices detected.\n');
    process.exit(0);
  }
}
