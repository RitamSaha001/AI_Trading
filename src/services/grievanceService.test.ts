import { describe, it, expect } from 'vitest';
import {
  createGrievanceTicket,
  escalateTicket,
  generateDisputeDossier,
  executeEmergencyFreeze,
  computeDossierHash,
} from './grievanceService';
import { AppState, Order, StrategyConfig } from '../types';

describe('Grievance Redressal & Financial Safety Service', () => {
  it('creates an official grievance ticket with valid SLA and tamper-evident SHA-256 hash', async () => {
    const ticket = await createGrievanceTicket({
      userUid: 'usr_goog_12345678',
      category: 'upi_deposit_pending',
      title: 'UPI ₹10,000 debited from PhonePe but wallet pending',
      description: 'Transaction debited from HDFC Bank via UPI Ref 423589123456.',
      relatedUtr: '423589123456',
      amountUSD: 114.28,
      amountINR: 10000,
      priority: 'high',
    });

    expect(ticket.ticketId.startsWith('GRV-')).toBe(true);
    expect(ticket.status).toBe('submitted');
    expect(ticket.priority).toBe('high');
    expect(ticket.relatedUtr).toBe('423589123456');
    expect(ticket.cryptographicDossierHash.startsWith('0x')).toBe(true);
    expect(ticket.slaDeadline).toBeGreaterThan(Date.now() + 47 * 3600 * 1000);
    expect(ticket.messages.length).toBe(1);
  });

  it('escalates ticket tiers and attaches formal escalation notes', async () => {
    const ticket = await createGrievanceTicket({
      userUid: 'usr_appl_87654321',
      category: 'dex_swap_revert',
      title: 'DEX Swap reverted on Polygon with gas fee consumed',
      description: 'Swap tx failed due to high volatility.',
    });

    expect(ticket.escalationLevel).toBe(1);

    const escalated = escalateTicket(ticket, 'Bank reconciliation pending beyond 4 hours');
    expect(escalated.escalationLevel).toBe(2);
    expect(escalated.officerAssigned).toContain('Principal Nodal Grievance Officer');
    expect(escalated.messages.length).toBe(2);

    const ombudsmanLevel = escalateTicket(escalated, 'No resolution within SLA');
    expect(ombudsmanLevel.escalationLevel).toBe(3);
    expect(ombudsmanLevel.officerAssigned).toContain('Banking Ombudsman');
  });

  it('generates a dispute dossier containing official regulatory escalation links', async () => {
    const ticket = await createGrievanceTicket({
      userUid: 'usr_goog_99999999',
      category: 'card_double_charge',
      title: 'Visa card charged twice for deposit',
      description: 'Card ending in 4242 charged two identical $500 amounts.',
      amountUSD: 500,
      amountINR: 43750,
    });

    const dossier = generateDisputeDossier(ticket);
    expect(dossier.filename).toContain(ticket.ticketId);
    expect(dossier.printableSummary).toContain(ticket.ticketId);
    expect(dossier.printableSummary).toContain('cms.rbi.org.in');
    expect(dossier.printableSummary).toContain('npci.org.in');
    expect(dossier.jsonContent).toContain(ticket.cryptographicDossierHash);
  });

  it('executes emergency freeze by canceling all pending orders and disabling active strategies', () => {
    const mockState: AppState = {
      schemaVersion: 7,
      accountMode: 'paper',
      cash: 50000,
      initialCash: 50000,
      startingEquity: 50000,
      realizedPnl: 0,
      totalFees: 0,
      positions: { BTC: 0 } as any,
      avgBuyPrice: {} as any,
      watchlist: ['BTC'],
      orders: [
        { id: 'ord_1', status: 'pending', asset: 'BTC', amount: 1, price: 60000, side: 'buy', type: 'limit' } as Order,
        { id: 'ord_2', status: 'filled', asset: 'ETH', amount: 2, price: 3000, side: 'buy', type: 'market' } as Order,
      ],
      alerts: [],
      strategies: [
        { id: 'strat_1', name: 'Apex Sentinel', enabled: true } as StrategyConfig,
      ],
      settings: {} as any,
      notifications: [],
      timeframe: '1D',
      selectedAsset: 'BTC',
    };

    const { updatedState, cancelledOrdersCount } = executeEmergencyFreeze(mockState);
    expect(cancelledOrdersCount).toBe(1);
    expect(updatedState.orders.find((o) => o.id === 'ord_1')?.status).toBe('cancelled');
    expect(updatedState.orders.find((o) => o.id === 'ord_2')?.status).toBe('filled'); // already filled unchanged
    expect(updatedState.strategies[0].enabled).toBe(false);
    expect(updatedState.notifications[0].title).toBe('EMERGENCY CAPITAL FREEZE ACTIVE');
  });
});
