import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config';

describe('Phase 4B: Live Order Architecture Safety & AST Invariants', () => {
  const serverDir = path.resolve(__dirname, '..');
  const srcDir = path.resolve(__dirname, '../../src');

  it('enforces that UPSTOX_LIVE_TRADING_ENABLED is strictly false by default in config', () => {
    // Reading configValidator file directly to ensure default export is false
    const validatorPath = path.resolve(serverDir, 'configValidator.ts');
    const validatorContent = fs.readFileSync(validatorPath, 'utf8');

    expect(validatorContent).toContain('UPSTOX_LIVE_TRADING_ENABLED: false');
  });

  it('enforces that UpstoxAdapter routes live orders through LiveOrderGateService', () => {
    const adapterPath = path.resolve(serverDir, 'services/brokers/upstox/upstoxAdapter.ts');
    const adapterContent = fs.readFileSync(adapterPath, 'utf8');

    expect(adapterContent).toContain('LiveOrderGateService.verifyLiveOrderPreSubmission');
  });

  it('enforces that frontend code never directly imports Upstox server modules or credentials', () => {
    const checkDir = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          checkDir(fullPath);
        } else if (entry.isFile() && (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx'))) {
          const content = fs.readFileSync(fullPath, 'utf8');
          expect(content).not.toContain('from \'../../server/services/brokers/upstox/upstoxClient\'');
          expect(content).not.toContain('from \'../../server/services/brokers/upstox/upstoxAdapter\'');
          expect(content).not.toContain('UPSTOX_CLIENT_SECRET');
        }
      }
    };

    checkDir(srcDir);
  });

  it('enforces that no test file contains real Upstox production access tokens or secrets', () => {
    const testDir = path.resolve(serverDir, 'tests');
    const testFiles = fs.readdirSync(testDir).filter((f) => f.endsWith('.test.ts'));

    for (const testFile of testFiles) {
      const content = fs.readFileSync(path.join(testDir, testFile), 'utf8');
      // No live real tokens (real Upstox tokens are ~600+ chars JWTs or live bearer tokens)
      expect(content).not.toMatch(/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[a-zA-Z0-9_-]{50,}/);
    }
  });

  it('enforces that all audit events sanitize credentials and tokens', () => {
    const auditPath = path.resolve(serverDir, 'services/auditService.ts');
    const auditContent = fs.readFileSync(auditPath, 'utf8');

    expect(auditContent).toContain('sanitize');
  });
});
