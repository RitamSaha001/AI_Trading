import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');

const FORBIDDEN_PATTERNS = [
  { pattern: /simulatedOtp/g, description: 'Simulated OTP in live code', allowedPaths: ['.test.', '/tests/', 'paymentGateway.ts'] },
  { pattern: /data:\s*['"]0x['"]\s*,/g, description: 'Placeholder DEX calldata', allowedPaths: ['.test.', '/tests/'] },
  { pattern: /trader\.ritam@gmail\.com/g, description: 'Hardcoded demo identity', allowedPaths: ['.test.', '/tests/'] },
  { pattern: /ritam\.saha@icloud\.com/g, description: 'Hardcoded demo identity', allowedPaths: ['.test.', '/tests/'] },
  { pattern: /verified:\s*true/g, description: 'Client-side forced verification', allowedPaths: ['.test.', '/tests/', 'authService.ts', 'paymentGateway.ts'] },
];

const SCAN_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx'];

function scanDirectory(dir: string): { file: string; line: number; content: string; description: string }[] {
  const violations: { file: string; line: number; content: string; description: string }[] = [];

  function walk(currentDir: string) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules', '.git', 'dist', '.next', 'scripts'].includes(entry.name)) continue;
        walk(fullPath);
      } else if (SCAN_EXTENSIONS.some(ext => entry.name.endsWith(ext))) {
        const content = fs.readFileSync(fullPath, 'utf8');
        const lines = content.split('\n');
        const relativePath = path.relative(ROOT, fullPath);

        for (const { pattern, description, allowedPaths } of FORBIDDEN_PATTERNS) {
          pattern.lastIndex = 0;
          for (let i = 0; i < lines.length; i++) {
            if (pattern.test(lines[i])) {
              const isAllowed = allowedPaths.some(p => relativePath.includes(p));
              if (!isAllowed) {
                violations.push({
                  file: relativePath,
                  line: i + 1,
                  content: lines[i].trim().slice(0, 120),
                  description,
                });
              }
            }
            pattern.lastIndex = 0;
          }
        }
      }
    }
  }

  walk(dir);
  return violations;
}

console.log('\n🔍 AI Trading Codebase Audit — Scanning for forbidden fake-money patterns...\n');
const violations = scanDirectory(ROOT);

if (violations.length > 0) {
  console.log(`❌ Found ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.log(`  ${v.file}:${v.line} — ${v.description}`);
    console.log(`    ${v.content}\n`);
  }
  process.exit(1);
} else {
  console.log('✅ No forbidden fake-money patterns found in production code.\n');
  process.exit(0);
}
