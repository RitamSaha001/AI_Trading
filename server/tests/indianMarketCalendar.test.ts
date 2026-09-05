import { describe, it, expect } from 'vitest';
import { IndianMarketCalendar } from '../services/brokers/upstox/indianMarketCalendar';

describe('Indian Market Calendar & Session Engine', () => {
  it('converts UTC timestamps to Indian Standard Time (UTC+5:30)', () => {
    // 2026-03-02 03:45:00 UTC = 2026-03-02 09:15:00 IST
    const date = new Date(Date.UTC(2026, 2, 2, 3, 45, 0));
    const ist = IndianMarketCalendar.toIST(date);

    expect(ist.year).toBe(2026);
    expect(ist.month).toBe(3);
    expect(ist.day).toBe(2);
    expect(ist.hours).toBe(9);
    expect(ist.minutes).toBe(15);
    expect(ist.seconds).toBe(0);
    expect(ist.dateStr).toBe('2026-03-02');
  });

  it('detects Saturday and Sunday as weekends', () => {
    // 2026-03-07 is Saturday, 2026-03-08 is Sunday, 2026-03-09 is Monday
    const sat = new Date(Date.UTC(2026, 2, 7, 5, 0, 0));
    const sun = new Date(Date.UTC(2026, 2, 8, 5, 0, 0));
    const mon = new Date(Date.UTC(2026, 2, 9, 5, 0, 0));

    expect(IndianMarketCalendar.isWeekend(sat)).toBe(true);
    expect(IndianMarketCalendar.isWeekend(sun)).toBe(true);
    expect(IndianMarketCalendar.isWeekend(mon)).toBe(false);
  });

  it('identifies official 2026 NSE/BSE holidays', () => {
    // Republic Day: 2026-01-26
    const repDay = new Date(Date.UTC(2026, 0, 26, 5, 0, 0));
    const hol1 = IndianMarketCalendar.isHoliday(repDay);
    expect(hol1.isHoliday).toBe(true);
    expect(hol1.reason).toContain('Republic Day');

    // Independence Day: 2026-08-15
    const indDay = new Date(Date.UTC(2026, 7, 15, 5, 0, 0));
    const hol2 = IndianMarketCalendar.isHoliday(indDay);
    expect(hol2.isHoliday).toBe(true);
    expect(hol2.reason).toContain('Independence Day');

    // Christmas: 2026-12-25
    const xmas = new Date(Date.UTC(2026, 11, 25, 5, 0, 0));
    const hol3 = IndianMarketCalendar.isHoliday(xmas);
    expect(hol3.isHoliday).toBe(true);
    expect(hol3.reason).toContain('Christmas');

    // Ordinary trading day: 2026-03-02
    const normalDay = new Date(Date.UTC(2026, 2, 2, 5, 0, 0));
    const hol4 = IndianMarketCalendar.isHoliday(normalDay);
    expect(hol4.isHoliday).toBe(false);
  });

  it('identifies session types across trading hours on a regular weekday', () => {
    // 2026-03-02 is Monday (ordinary trading day)
    // 09:05 IST (03:35 UTC) -> PRE_OPEN
    const preOpen = new Date(Date.UTC(2026, 2, 2, 3, 35, 0));
    expect(IndianMarketCalendar.getSession(preOpen)).toBe('PRE_OPEN');
    expect(IndianMarketCalendar.isMarketOpen(preOpen)).toBe(false);

    // 09:12 IST (03:42 UTC) -> CLOSED (pre-open matching window)
    const matching = new Date(Date.UTC(2026, 2, 2, 3, 42, 0));
    expect(IndianMarketCalendar.getSession(matching)).toBe('CLOSED');
    expect(IndianMarketCalendar.isMarketOpen(matching)).toBe(false);

    // 09:30 IST (04:00 UTC) -> NORMAL
    const morning = new Date(Date.UTC(2026, 2, 2, 4, 0, 0));
    expect(IndianMarketCalendar.getSession(morning)).toBe('NORMAL');
    expect(IndianMarketCalendar.isMarketOpen(morning)).toBe(true);

    // 15:25 IST (09:55 UTC) -> NORMAL
    const afternoon = new Date(Date.UTC(2026, 2, 2, 9, 55, 0));
    expect(IndianMarketCalendar.getSession(afternoon)).toBe('NORMAL');
    expect(IndianMarketCalendar.isMarketOpen(afternoon)).toBe(true);

    // 15:35 IST (10:05 UTC) -> CLOSED
    const postNormal = new Date(Date.UTC(2026, 2, 2, 10, 5, 0));
    expect(IndianMarketCalendar.getSession(postNormal)).toBe('CLOSED');
    expect(IndianMarketCalendar.isMarketOpen(postNormal)).toBe(false);

    // 15:50 IST (10:20 UTC) -> POST_CLOSE
    const postClose = new Date(Date.UTC(2026, 2, 2, 10, 20, 0));
    expect(IndianMarketCalendar.getSession(postClose)).toBe('POST_CLOSE');
    expect(IndianMarketCalendar.isMarketOpen(postClose)).toBe(false);

    // 20:00 IST (14:30 UTC) -> CLOSED
    const night = new Date(Date.UTC(2026, 2, 2, 14, 30, 0));
    expect(IndianMarketCalendar.getSession(night)).toBe('CLOSED');
    expect(IndianMarketCalendar.isMarketOpen(night)).toBe(false);
  });

  it('handles Diwali Muhurat special trading session', () => {
    // 2026-11-08 is Diwali Laxmi Pujan (Sunday)
    // 18:30 IST (13:00 UTC) -> NORMAL (within 18:15 - 19:15 Muhurat window)
    const muhurat = new Date(Date.UTC(2026, 10, 8, 13, 0, 0));
    expect(IndianMarketCalendar.getSession(muhurat)).toBe('NORMAL');
    expect(IndianMarketCalendar.isMarketOpen(muhurat)).toBe(true);

    // 12:00 IST (06:30 UTC) -> CLOSED on Diwali before Muhurat
    const daytime = new Date(Date.UTC(2026, 10, 8, 6, 30, 0));
    expect(IndianMarketCalendar.getSession(daytime)).toBe('CLOSED');
    expect(IndianMarketCalendar.isMarketOpen(daytime)).toBe(false);
  });

  it('computes next regular market open timestamp', () => {
    // From Friday evening 2026-03-06 18:00 IST (12:30 UTC),
    // next open should be Monday 2026-03-09 at 09:15 IST (03:45 UTC)
    const friNight = new Date(Date.UTC(2026, 2, 6, 12, 30, 0));
    const nextOpen = IndianMarketCalendar.getNextMarketOpen(friNight);
    const ist = IndianMarketCalendar.toIST(nextOpen);

    expect(ist.dateStr).toBe('2026-03-09');
    expect(ist.hours).toBe(9);
    expect(ist.minutes).toBe(15);
  });
});
