import { describe, expect, it } from 'vitest';
import { signAutonomousExecution, verifyAutonomousExecution } from '../services/autonomousExecutionAuth';

describe('Autonomous execution authorization', () => {
  const secret = '0123456789abcdef0123456789abcdef0123456789abcdef';
  const intent = {
    userId: 'user_1',
    symbol: 'RELIANCE',
    side: 'BUY',
    type: 'LIMIT',
    quantity: 4,
    price: 2500,
    product: 'MIS',
    orderRole: 'AUTONOMOUS_ENTRY',
    protectiveStopPrice: 2470,
    clientOrderId: 'lm_pilot_1',
  };

  it('accepts a signature generated for the exact internal order intent', () => {
    const signature = signAutonomousExecution(intent, secret);
    expect(verifyAutonomousExecution(intent, signature, secret)).toBe(true);
  });

  it('rejects any change to protected order details', () => {
    const signature = signAutonomousExecution(intent, secret);
    expect(verifyAutonomousExecution({ ...intent, quantity: 5 }, signature, secret)).toBe(false);
    expect(verifyAutonomousExecution({ ...intent, protectiveStopPrice: 2465 }, signature, secret)).toBe(false);
  });

  it('fails closed for absent signatures or insufficient secrets', () => {
    expect(verifyAutonomousExecution(intent, undefined, secret)).toBe(false);
    expect(() => signAutonomousExecution(intent, 'too-short')).toThrow('at least 32 characters');
  });
});
