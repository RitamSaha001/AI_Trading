/**
 * Indian Market Calendar & Session Engine (NSE / BSE)
 * 
 * Provides authoritative market hours, session detection, weekend closures,
 * and official exchange holiday schedules for Indian equities.
 * 
 * Indian Standard Time (IST) is UTC+05:30.
 * Standard Equity Market Hours:
 * - Pre-Open Session: 09:00:00 to 09:08:00 IST
 * - Regular Continuous Trading: 09:15:00 to 15:30:00 IST
 * - Post-Closing Session: 15:40:00 to 16:00:00 IST
 */

export interface MarketHoliday {
  date: string; // YYYY-MM-DD
  description: string;
  isMuhurat?: boolean;
  muhuratStart?: string; // HH:mm IST
  muhuratEnd?: string;   // HH:mm IST
}

export type MarketSessionType = 'PRE_OPEN' | 'NORMAL' | 'POST_CLOSE' | 'CLOSED';

export class IndianMarketCalendar {
  // Official NSE/BSE Trading Holidays for 2026
  public static readonly HOLIDAYS_2026: Record<string, MarketHoliday> = {
    '2026-01-26': { date: '2026-01-26', description: 'Republic Day' },
    '2026-02-16': { date: '2026-02-16', description: 'Mahashivratri' },
    '2026-03-04': { date: '2026-03-04', description: 'Holi' },
    '2026-03-21': { date: '2026-03-21', description: 'Id-Ul-Fitr (Ramzan Id)' },
    '2026-03-28': { date: '2026-03-28', description: 'Ram Navami' },
    '2026-03-31': { date: '2026-03-31', description: 'Mahavir Jayanti' },
    '2026-04-03': { date: '2026-04-03', description: 'Good Friday' },
    '2026-04-14': { date: '2026-04-14', description: 'Dr. Baba Saheb Ambedkar Jayanti' },
    '2026-05-01': { date: '2026-05-01', description: 'Maharashtra Day' },
    '2026-05-28': { date: '2026-05-28', description: 'Bakri Id (Eid ul-Adha)' },
    '2026-06-26': { date: '2026-06-26', description: 'Muharram' },
    '2026-08-15': { date: '2026-08-15', description: 'Independence Day' },
    '2026-08-26': { date: '2026-08-26', description: 'Milad-un-Nabi (Id-e-Milad)' },
    '2026-10-02': { date: '2026-10-02', description: 'Mahatma Gandhi Jayanti' },
    '2026-10-20': { date: '2026-10-20', description: 'Dussehra' },
    '2026-11-08': {
      date: '2026-11-08',
      description: 'Diwali Laxmi Pujan (Muhurat Trading)',
      isMuhurat: true,
      muhuratStart: '18:15',
      muhuratEnd: '19:15',
    },
    '2026-11-10': { date: '2026-11-10', description: 'Diwali Balipratipada' },
    '2026-11-24': { date: '2026-11-24', description: 'Guru Nanak Jayanti' },
    '2026-12-25': { date: '2026-12-25', description: 'Christmas' },
  };

  /**
   * Converts a given Date to Indian Standard Time components (UTC + 5:30).
   */
  public static toIST(date: Date = new Date()): {
    year: number;
    month: number;
    day: number;
    hours: number;
    minutes: number;
    seconds: number;
    dayOfWeek: number; // 0=Sun, 6=Sat
    dateStr: string;   // YYYY-MM-DD
    timeStr: string;   // HH:mm:ss
    timeMinutes: number; // minutes since midnight IST
  } {
    // Offset in milliseconds: +5.5 hours = +19,800,000 ms
    const istTime = new Date(date.getTime() + 19800000);
    const year = istTime.getUTCFullYear();
    const month = istTime.getUTCMonth() + 1;
    const day = istTime.getUTCDate();
    const hours = istTime.getUTCHours();
    const minutes = istTime.getUTCMinutes();
    const seconds = istTime.getUTCSeconds();
    const dayOfWeek = istTime.getUTCDay();

    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const dateStr = `${year}-${pad(month)}-${pad(day)}`;
    const timeStr = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
    const timeMinutes = hours * 60 + minutes;

    return {
      year,
      month,
      day,
      hours,
      minutes,
      seconds,
      dayOfWeek,
      dateStr,
      timeStr,
      timeMinutes,
    };
  }

  /**
   * Returns true if the day is a Saturday (6) or Sunday (0).
   */
  public static isWeekend(date: Date = new Date()): boolean {
    const ist = this.toIST(date);
    return ist.dayOfWeek === 0 || ist.dayOfWeek === 6;
  }

  /**
   * Returns holiday information if the date is a declared exchange holiday.
   */
  public static isHoliday(date: Date = new Date()): {
    isHoliday: boolean;
    holiday?: MarketHoliday;
    reason?: string;
  } {
    const ist = this.toIST(date);
    const holiday = this.HOLIDAYS_2026[ist.dateStr];
    if (holiday) {
      return {
        isHoliday: true,
        holiday,
        reason: holiday.description,
      };
    }
    return { isHoliday: false };
  }

  /**
   * Returns current market session.
   */
  public static getSession(date: Date = new Date()): MarketSessionType {
    const ist = this.toIST(date);

    // Check weekend
    if (this.isWeekend(date)) {
      // Check for Muhurat Trading on weekend Diwali
      const hol = this.isHoliday(date);
      if (hol.holiday?.isMuhurat) {
        return this.checkMuhuratSession(ist, hol.holiday);
      }
      return 'CLOSED';
    }

    // Check holiday
    const hol = this.isHoliday(date);
    if (hol.isHoliday) {
      if (hol.holiday?.isMuhurat) {
        return this.checkMuhuratSession(ist, hol.holiday);
      }
      return 'CLOSED';
    }

    // Regular trading day:
    // Pre-open: 09:00 (540m) to 09:08 (548m)
    // Regular: 09:15 (555m) to 15:30 (930m)
    // Post-close: 15:40 (940m) to 16:00 (960m)
    const m = ist.timeMinutes;
    if (m >= 540 && m < 548) {
      return 'PRE_OPEN';
    }
    if (m >= 555 && m < 930) {
      return 'NORMAL';
    }
    if (m >= 940 && m < 960) {
      return 'POST_CLOSE';
    }

    return 'CLOSED';
  }

  private static mockMarketOpen: boolean | null = null;

  /**
   * For testing purposes only: allows mocking whether the market is open.
   */
  public static setMockMarketOpen(open: boolean | null): void {
    this.mockMarketOpen = open;
  }

  /**
   * Checks whether the regular continuous trading session (or Muhurat session) is currently open.
   */
  public static isMarketOpen(date?: Date): boolean {
    if (!date && this.mockMarketOpen !== null) {
      return this.mockMarketOpen;
    }
    return this.getSession(date || new Date()) === 'NORMAL';
  }

  /**
   * Calculates the exact Date when the Indian equity market will next open for regular trading (09:15 IST).
   */
  public static getNextMarketOpen(from: Date = new Date()): Date {
    let current = new Date(from.getTime());
    
    // Check up to 14 days ahead
    for (let dayOffset = 0; dayOffset < 14; dayOffset++) {
      const checkDate = new Date(current.getTime() + dayOffset * 86400000);
      const ist = this.toIST(checkDate);

      // Skip weekends and non-muhurat holidays
      if (ist.dayOfWeek === 0 || ist.dayOfWeek === 6) continue;
      const hol = this.isHoliday(checkDate);
      if (hol.isHoliday && !hol.holiday?.isMuhurat) continue;

      // Target 09:15:00 IST on this date
      // IST is UTC+5.5, so 09:15 IST is 03:45 UTC
      const openUtcMs = Date.UTC(ist.year, ist.month - 1, ist.day, 3, 45, 0, 0);
      const openDate = new Date(openUtcMs);

      // If this opening time is in the future relative to `from`, return it
      if (openDate.getTime() > from.getTime()) {
        return openDate;
      }
    }

    // Fallback: 24 hours from now at 03:45 UTC
    return new Date(from.getTime() + 86400000);
  }

  private static checkMuhuratSession(
    ist: { timeMinutes: number },
    holiday: MarketHoliday
  ): MarketSessionType {
    if (!holiday.muhuratStart || !holiday.muhuratEnd) return 'CLOSED';
    const [startH, startM] = holiday.muhuratStart.split(':').map(Number);
    const [endH, endM] = holiday.muhuratEnd.split(':').map(Number);
    const startMin = startH * 60 + startM;
    const endMin = endH * 60 + endM;

    if (ist.timeMinutes >= startMin && ist.timeMinutes < endMin) {
      return 'NORMAL';
    }
    return 'CLOSED';
  }
}
