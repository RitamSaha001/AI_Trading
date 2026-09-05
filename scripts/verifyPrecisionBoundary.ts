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
    pattern: /parseFloat\s*\(\s*b\.free/g,
    description: "parseFloat on balance in reconciliation worker",
    targetFiles: ["server/services/reconciliationWorker.ts"],
  },
  {
    pattern: /Number\s*\(\s*normalized\.(priceStr|notionalStr)\s*\)\s*[*+-]/g,
    description: "Direct float arithmetic on normalized price/notional string",
    targetFiles: ["server/services/binanceGateway.ts"],
  },
  {
    pattern: /ExactDecimal\.from\s*\(\s*['"]50000\.00['"]\s*\)/g,
    description: "Hardcoded 50000.00 fallback in symbol rules",
    targetFiles: ["server/services/symbolRules.ts"],
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
        rule.pattern.lastIndex = 0;
        if (rule.pattern.test(lines[i])) {
          violations.push({
            file: relFile,
            line: i + 1,
            content: lines[i].trim(),
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
