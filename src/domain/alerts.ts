import { AlertRule, Asset, Market } from '../types';
import { money } from './portfolio';

export interface AlertTriggerResult {
  triggered: boolean;
  alert: AlertRule;
  message: string;
}

/**
 * Evaluates an alert rule against the current market quote.
 */
export function evaluateAlert(
  rule: AlertRule,
  market: Market | undefined
): AlertTriggerResult | null {
  if (!rule.enabled || !market || market.price <= 0) return null;

  const now = Date.now();
  // If one-shot and already triggered, skip
  if (!rule.isRecurring && rule.triggered) return null;

  // If recurring, check cooldown
  if (rule.isRecurring && rule.lastTriggeredAt) {
    const cooldownMs = (rule.cooldownSec || 300) * 1000;
    if (now - rule.lastTriggeredAt < cooldownMs) return null;
  }

  let pass = false;
  let targetDesc = '';

  if (rule.type === 'above') {
    pass = market.price >= rule.value;
    targetDesc = `rose above ${money(rule.value)}`;
  } else if (rule.type === 'below') {
    pass = market.price <= rule.value;
    targetDesc = `dropped below ${money(rule.value)}`;
  } else if (rule.type === 'changeUp') {
    pass = market.change24h >= rule.value;
    targetDesc = `gained +${rule.value}% 24h`;
  } else if (rule.type === 'changeDown') {
    pass = market.change24h <= -Math.abs(rule.value);
    targetDesc = `lost -${Math.abs(rule.value)}% 24h`;
  }

  if (pass) {
    const msg = `${rule.asset} ${targetDesc} (Current: ${money(market.price)})`;
    rule.lastTriggeredAt = now;
    if (!rule.isRecurring) {
      rule.triggered = true;
    }
    if (!rule.triggerHistory) rule.triggerHistory = [];
    rule.triggerHistory.unshift({
      ts: now,
      price: market.price,
      message: msg,
    });
    rule.triggerHistory = rule.triggerHistory.slice(0, 50);

    return {
      triggered: true,
      alert: rule,
      message: msg,
    };
  }

  return null;
}
