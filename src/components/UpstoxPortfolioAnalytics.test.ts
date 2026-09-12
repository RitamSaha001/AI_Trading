import { describe, it, expect } from 'vitest';
import { INDIAN_ASSETS } from '../types';
import { ASSET_SECTOR_MAP, NSE_SECTORS } from './UpstoxPortfolioAnalytics';

describe('UpstoxPortfolioAnalytics Sector & Mathematical Logic', () => {
  it('maps all 100 Indian Assets to valid NSE Sectors with designated color schemes', () => {
    expect(INDIAN_ASSETS.length).toBe(100);

    for (const asset of INDIAN_ASSETS) {
      const sector = ASSET_SECTOR_MAP[asset];
      expect(sector, `Asset ${asset} must have a mapped sector`).toBeDefined();
      expect(NSE_SECTORS[sector], `Sector "${sector}" must exist in NSE_SECTORS`).toBeDefined();
      expect(NSE_SECTORS[sector].color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('correctly associates landmark Indian stocks with their proper industry sectors', () => {
    expect(ASSET_SECTOR_MAP['RELIANCE']).toBe('Energy & Petrochemicals');
    expect(ASSET_SECTOR_MAP['TCS']).toBe('Information Technology');
    expect(ASSET_SECTOR_MAP['INFY']).toBe('Information Technology');
    expect(ASSET_SECTOR_MAP['HDFCBANK']).toBe('Banking & Financials');
    expect(ASSET_SECTOR_MAP['ICICIBANK']).toBe('Banking & Financials');
    expect(ASSET_SECTOR_MAP['TATAMOTORS']).toBe('Automobiles');
    expect(ASSET_SECTOR_MAP['BHARTIARTL']).toBe('Telecommunications');
    expect(ASSET_SECTOR_MAP['ITC']).toBe('FMCG & Consumer Goods');
    expect(ASSET_SECTOR_MAP['LT']).toBe('Infrastructure & Engineering');
    expect(ASSET_SECTOR_MAP['SUNPHARMA']).toBe('Pharmaceuticals & Healthcare');
  });

  it('defines valid Liquid Cash Reserve sector entry for allocation calculations', () => {
    const cashSector = NSE_SECTORS['Liquid Cash Reserve'];
    expect(cashSector).toBeDefined();
    expect(cashSector.name).toBe('Liquid Cash Reserve');
    expect(cashSector.color).toBe('#71717a');
  });
});
