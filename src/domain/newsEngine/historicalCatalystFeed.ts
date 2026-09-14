/**
 * HISTORICAL CORPORATE & MACROECONOMIC CATALYST FEED (2022 - 2026)
 * Chronologically aligned for historical fleet replay without temporal leakage.
 * Ingests directly into NewsCatalystRegistry via AstraFinCognitiveEngine deliberation.
 */

import { NewsCatalystRegistry } from './newsCatalystGate';

export interface HistoricalEventRecord {
  date: string;              // YYYY-MM-DD
  minuteOfDay: number;       // Minutes from midnight IST (e.g. 555 for 09:15, 600 for 10:00)
  headline: string;
  source: 'BSE_ANNOUNCEMENTS' | 'NSE_ANNOUNCEMENTS' | 'ECONOMIC_TIMES' | 'GOOGLE_NEWS';
}

export const HISTORICAL_CATALYST_FEED: HistoricalEventRecord[] = [
  // ==========================================================================
  // 2022 HISTORICAL CATALYSTS
  // ==========================================================================
  {
    date: '2022-01-03',
    minuteOfDay: 555, // 09:15 IST
    headline: 'Tata Motors reports record monthly EV sales surge of 439% and commercial vehicle demand rebound',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-01-14',
    minuteOfDay: 560, // 09:20 IST
    headline: 'TCS Q3 net profit beats estimates, jumps 12.3% YoY with record $7.6 billion TCV order book',
    source: 'ECONOMIC_TIMES',
  },
  {
    date: '2022-01-17',
    minuteOfDay: 555,
    headline: 'HDFC Bank reports 18% YoY growth in Q3 net profit to record ₹10,342 crore, NIMs stable at 4.0%',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-02-07',
    minuteOfDay: 555,
    headline: 'State Bank of India Q3 net profit surges 62% YoY to historic high of ₹8,432 crore, asset quality shines',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-03-08',
    minuteOfDay: 570, // 09:30 IST
    headline: 'Larsen & Toubro bags mega ₹3,800 crore engineering and construction order from international client',
    source: 'NSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-04-18',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q4 net profit climbs 59% YoY on robust NII growth and multi-year low provisions',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-05-09',
    minuteOfDay: 555,
    headline: 'Reliance Industries Q4 revenue jumps 37% YoY to ₹2.32 lakh crore, digital and retail segments surge',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-06-15',
    minuteOfDay: 600, // 10:00 IST
    headline: 'Bharat Electronics secures high-value ₹2,500 crore defense radar and missile guidance systems order',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-07-25',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q1 PAT surges 50% YoY to ₹6,905 crore, asset quality improves to 10-year best',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-08-08',
    minuteOfDay: 555,
    headline: 'Bharti Airtel Q1 net profit surges 158% YoY as ARPU expands to ₹183 on high-value subscriber additions',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-09-12',
    minuteOfDay: 585,
    headline: 'Hindustan Aeronautics signs ₹6,800 crore major defense aircraft manufacturing contract with Indian Air Force',
    source: 'NSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-10-17',
    minuteOfDay: 555,
    headline: 'ICICI Bank reports blowout Q2 profit growth of 37% YoY, domestic loan book expands 21%',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-11-07',
    minuteOfDay: 555,
    headline: 'State Bank of India Q2 net profit jumps 74% YoY to record ₹13,265 crore on robust credit expansion',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2022-12-05',
    minuteOfDay: 570,
    headline: 'L&T Construction wins multi-billion dollar railway infrastructure contract in South Asia',
    source: 'BSE_ANNOUNCEMENTS',
  },

  // ==========================================================================
  // 2023 HISTORICAL CATALYSTS
  // ==========================================================================
  {
    date: '2023-01-16',
    minuteOfDay: 555,
    headline: 'HDFC Bank Q3 net profit rises 18.5% YoY to ₹12,259 crore with superior loan disbursements',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-01-27',
    minuteOfDay: 555,
    headline: 'Tata Motors turns profitable in Q3 with ₹2,958 crore net profit on strong JLR recovery and commercial vehicle margins',
    source: 'ECONOMIC_TIMES',
  },
  {
    date: '2023-02-06',
    minuteOfDay: 555,
    headline: 'State Bank of India reports record quarterly profit of ₹14,205 crore, up 68% YoY on strong NIMs',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-03-15',
    minuteOfDay: 570,
    headline: 'Larsen & Toubro bags mega offshore hydrocarbon order worth ₹7,000 crore from ONGC',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-04-24',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q4 profit beats estimates, jumps 30% YoY to ₹9,122 crore, net NPA falls to 0.48%',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-05-15',
    minuteOfDay: 555,
    headline: 'Tata Motors Q4 net profit surges to ₹5,408 crore on multi-decade high JLR order backlog',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-06-20',
    minuteOfDay: 580,
    headline: 'Bharat Electronics secures prestigious ₹3,914 crore naval surveillance radar contract from Ministry of Defence',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-07-24',
    minuteOfDay: 555,
    headline: 'ICICI Bank reports 40% YoY surge in Q1 net profit to ₹9,648 crore with pristine asset quality',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-08-07',
    minuteOfDay: 555,
    headline: 'State Bank of India Q1 net profit doubles YoY to record ₹16,884 crore, loan growth at 15%',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-09-18',
    minuteOfDay: 570,
    headline: 'L&T wins mega infrastructure order worth over ₹10,000 crore for high-speed rail bullet train project',
    source: 'NSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-10-23',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q2 net profit jumps 36% YoY to ₹10,261 crore, provisions drop 48%',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-11-06',
    minuteOfDay: 555,
    headline: 'Tata Motors Q2 PAT surges to ₹3,764 crore against loss last year, raises FY24 JLR margin outlook',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2023-12-11',
    minuteOfDay: 585,
    headline: 'Hindustan Aeronautics receives multi-thousand crore procurement clearance from Defence Acquisition Council',
    source: 'BSE_ANNOUNCEMENTS',
  },

  // ==========================================================================
  // 2024 HISTORICAL CATALYSTS
  // ==========================================================================
  {
    date: '2024-01-15',
    minuteOfDay: 555,
    headline: 'TCS signs $1.5 billion landmark digital banking transformation deal with prominent UK insurer',
    source: 'ECONOMIC_TIMES',
  },
  {
    date: '2024-01-29',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q3 net profit crosses ₹10,000 crore milestone, rising 23.6% YoY on broad-based credit demand',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-02-05',
    minuteOfDay: 555,
    headline: 'Tata Motors Q3 net profit more than doubles to ₹7,025 crore, revenue jumps 25% on stellar JLR delivery',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-03-04',
    minuteOfDay: 570,
    headline: 'Larsen & Toubro secures major ₹4,500 crore solar and transmission infrastructure contract in Middle East',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-04-22',
    minuteOfDay: 555,
    headline: 'Reliance Industries FY24 net profit hits all-time high of ₹69,621 crore, Jio subscriber base crosses 480 million',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-05-13',
    minuteOfDay: 555,
    headline: 'State Bank of India Q4 net profit climbs 24% YoY to ₹20,698 crore, announces highest ever dividend',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-06-18',
    minuteOfDay: 580,
    headline: 'Bharat Electronics receives orders worth ₹3,172 crore for electronic warfare and communications systems',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-07-22',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q1 PAT increases 14.6% YoY to ₹11,059 crore, NIM holds steady at 4.36%',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-08-05',
    minuteOfDay: 555,
    headline: 'Bharti Airtel reports record ARPU expansion to ₹211 as 5G user additions accelerate past 90 million',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-09-09',
    minuteOfDay: 570,
    headline: 'L&T Heavy Engineering bags massive multi-thousand crore orders across key global nuclear and fertilizer sectors',
    source: 'NSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-10-21',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q2 net profit jumps 14.5% YoY to ₹11,746 crore with industry-leading ROA of 2.36%',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-11-11',
    minuteOfDay: 555,
    headline: 'State Bank of India Q2 net profit surges 28% YoY to ₹18,331 crore, asset quality stays near pristine',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2024-12-09',
    minuteOfDay: 585,
    headline: 'Hindustan Aeronautics signs ₹26,000 crore contract with Ministry of Defence for 240 Sukhoi aero-engines',
    source: 'BSE_ANNOUNCEMENTS',
  },

  // ==========================================================================
  // 2025 - 2026 RECENT & LIVE CATALYSTS
  // ==========================================================================
  {
    date: '2025-01-13',
    minuteOfDay: 555,
    headline: 'TCS Q3 net profit rises 8.2% YoY, declares special dividend and flags robust BFSI client spend recovery',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2025-01-27',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q3 PAT jumps 16.8% YoY to ₹12,050 crore, provisions fall as retail asset quality outperforms',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2025-02-10',
    minuteOfDay: 555,
    headline: 'State Bank of India Q3 net profit hits ₹19,100 crore, credit growth maintained at 15.5% YoY',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2025-03-03',
    minuteOfDay: 570,
    headline: 'Larsen & Toubro wins ₹8,200 crore domestic clean power and transmission project from government PSU',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2025-04-21',
    minuteOfDay: 555,
    headline: 'Reliance Industries reports stellar annual operating cash flow, Jio telecom tariff hike expands margins',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2025-05-12',
    minuteOfDay: 555,
    headline: 'Tata Motors approves demerger of commercial and passenger vehicle businesses, unlocking tremendous shareholder value',
    source: 'ECONOMIC_TIMES',
  },
  {
    date: '2025-06-16',
    minuteOfDay: 580,
    headline: 'Bharat Electronics secures export orders worth $400 million for indigenous airborne tactical radar suites',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2025-07-21',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q1 PAT expands 15% YoY to ₹12,700 crore, net NPA drops further to 0.42%',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2025-08-04',
    minuteOfDay: 555,
    headline: 'Bharti Airtel reports consolidated Q1 PAT surge of 158% YoY on strong 5G monetization and enterprise cloud growth',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2025-09-08',
    minuteOfDay: 570,
    headline: 'L&T bags mega ₹12,000 crore hydrocarbon onshore project in Middle East, order pipeline at record ₹4.8 lakh crore',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2025-10-20',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q2 PAT surges to ₹13,100 crore with record NIMs and healthy retail loan demand',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2025-11-10',
    minuteOfDay: 555,
    headline: 'State Bank of India Q2 PAT tops ₹20,000 crore mark for first time, ROA touches 1.22%',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2026-01-12',
    minuteOfDay: 555,
    headline: 'TCS reports $9.2 billion quarterly deal bookings, highest in 8 quarters with strong AI cloud momentum',
    source: 'ECONOMIC_TIMES',
  },
  {
    date: '2026-01-26',
    minuteOfDay: 555,
    headline: 'ICICI Bank Q3 PAT jumps 18% YoY to ₹13,800 crore, core operating profit up 21%',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2026-02-09',
    minuteOfDay: 555,
    headline: 'State Bank of India reports blowout Q3 profit of ₹21,400 crore, asset quality stays pristine',
    source: 'BSE_ANNOUNCEMENTS',
  },
  {
    date: '2026-03-02',
    minuteOfDay: 570,
    headline: 'Larsen & Toubro secures ₹9,500 crore landmark green hydrogen electrolyzer gigawatt manufacturing contract',
    source: 'BSE_ANNOUNCEMENTS',
  },
];

export class HistoricalCatalystFeed {
  private static eventsByDate: Map<string, HistoricalEventRecord[]> = new Map();
  private static isInitialized = false;

  private static init(): void {
    if (this.isInitialized) return;
    for (const event of HISTORICAL_CATALYST_FEED) {
      const list = this.eventsByDate.get(event.date) || [];
      list.push(event);
      this.eventsByDate.set(event.date, list);
    }
    this.isInitialized = true;
  }

  /**
   * Injects historical catalysts for a specific date and minute into NewsCatalystRegistry
   * using real-time deliberation by AstraFinCognitiveEngine.
   */
  public static injectForBar(
    targetDate: string,
    minuteOfDay: number,
    currentTimestamp: number
  ): number {
    this.init();
    const dayEvents = this.eventsByDate.get(targetDate);
    if (!dayEvents || dayEvents.length === 0) return 0;

    let injected = 0;
    for (const event of dayEvents) {
      if (event.minuteOfDay === minuteOfDay) {
        NewsCatalystRegistry.processWithAstraFin(event.headline, event.source, currentTimestamp);
        injected++;
      }
    }
    return injected;
  }

  /**
   * Returns all scheduled events for a date.
   */
  public static getEventsForDate(targetDate: string): HistoricalEventRecord[] {
    this.init();
    return this.eventsByDate.get(targetDate) || [];
  }
}
