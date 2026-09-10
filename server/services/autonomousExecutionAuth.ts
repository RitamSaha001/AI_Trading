import crypto from 'node:crypto';

export interface AutonomousExecutionIntent {
  userId: string;
  symbol: string;
  side: string;
  type: string;
  quantity: number | string;
  price?: number | string;
  triggerPrice?: number | string;
  product?: string;
  orderRole?: string;
  parentClientOrderId?: string;
  protectiveStopPrice?: number | string;
  clientOrderId: string;
}

function canonicalize(intent: AutonomousExecutionIntent): string {
  return [
    intent.userId,
    intent.symbol.toUpperCase(),
    intent.side.toUpperCase(),
    intent.type.toUpperCase(),
    String(intent.quantity),
    intent.price === undefined ? '' : String(intent.price),
    intent.triggerPrice === undefined ? '' : String(intent.triggerPrice),
    (intent.product || '').toUpperCase(),
    intent.orderRole || '',
    intent.parentClientOrderId || '',
    intent.protectiveStopPrice === undefined ? '' : String(intent.protectiveStopPrice),
    intent.clientOrderId,
  ].join('|');
}

export function signAutonomousExecution(intent: AutonomousExecutionIntent, secret: string): string {
  if (!secret || secret.length < 32) {
    throw new Error('AUTONOMOUS_EXECUTION_SECRET must be at least 32 characters long.');
  }
  return crypto.createHmac('sha256', secret).update(canonicalize(intent)).digest('hex');
}

export function verifyAutonomousExecution(
  intent: AutonomousExecutionIntent,
  signature: string | undefined,
  secret: string
): boolean {
  if (!signature || !/^[a-f0-9]{64}$/i.test(signature) || !secret || secret.length < 32) return false;
  const expected = signAutonomousExecution(intent, secret);
  return crypto.timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(signature, 'hex'));
}
