import type { MarketEvent, EventType, Sector, Company } from '@wallstreetsim/types';
import { generateShortId, weightedRandom, BASE_EVENT_CHANCE, BLACK_SWAN_CHANCE } from '@wallstreetsim/utils';

interface EventConfig {
  baseEventChance: number;
  blackSwanChance: number;
}

const DEFAULT_CONFIG: EventConfig = {
  baseEventChance: BASE_EVENT_CHANCE,
  blackSwanChance: BLACK_SWAN_CHANCE,
};

interface EventTemplate {
  impactRange: [number, number];
  durationRange: [number, number];
  headlines: string[];
}

const EVENT_TEMPLATES: Record<EventType, EventTemplate> = {
  EARNINGS_BEAT: {
    impactRange: [0.03, 0.15],
    durationRange: [5, 30],
    headlines: [
      '{company} smashes earnings expectations',
      '{company} posts blowout quarter',
      '{company} earnings surge past Wall Street estimates',
    ],
  },
  EARNINGS_MISS: {
    impactRange: [-0.15, -0.03],
    durationRange: [5, 30],
    headlines: [
      '{company} misses earnings, stock plummets',
      '{company} disappoints with weak quarter',
      '{company} warns on revenue, shares tumble',
    ],
  },
  CEO_SCANDAL: {
    impactRange: [-0.20, -0.05],
    durationRange: [20, 100],
    headlines: [
      '{company} CEO under investigation',
      'Scandal rocks {company} leadership',
      '{company} chief exec caught in controversy',
    ],
  },
  PRODUCT_LAUNCH: {
    impactRange: [0.02, 0.10],
    durationRange: [10, 50],
    headlines: [
      '{company} unveils revolutionary new product',
      '{company} launch event exceeds expectations',
      'Markets excited by {company} announcement',
    ],
  },
  FDA_APPROVAL: {
    impactRange: [0.15, 0.50],
    durationRange: [5, 20],
    headlines: [
      '{company} receives FDA approval for blockbuster drug',
      'FDA green-lights {company} treatment',
      '{company} clears major regulatory hurdle',
    ],
  },
  FDA_REJECTION: {
    impactRange: [-0.50, -0.20],
    durationRange: [5, 20],
    headlines: [
      'FDA rejects {company} drug application',
      '{company} suffers setback with FDA rejection',
      'Regulatory blow for {company}',
    ],
  },
  MERGER_RUMOR: {
    impactRange: [0.10, 0.30],
    durationRange: [30, 100],
    headlines: [
      'Buyout rumors swirl around {company}',
      '{company} said to be acquisition target',
      'M&A speculation lifts {company} shares',
    ],
  },
  INSIDER_SELLING: {
    impactRange: [-0.05, -0.02],
    durationRange: [5, 15],
    headlines: [
      '{company} executives dump shares',
      'Insider selling raises eyebrows at {company}',
      '{company} CFO sells large stake',
    ],
  },
  SHORT_SQUEEZE: {
    impactRange: [0.20, 1.00],
    durationRange: [3, 15],
    headlines: [
      '{company} short sellers scramble to cover',
      'Epic short squeeze sends {company} soaring',
      '{company} rockets on massive short covering',
    ],
  },
  ANALYST_UPGRADE: {
    impactRange: [0.02, 0.08],
    durationRange: [3, 10],
    headlines: [
      'Goldman upgrades {company} to Strong Buy',
      'Analysts turn bullish on {company}',
      '{company} gets price target boost',
    ],
  },
  ANALYST_DOWNGRADE: {
    impactRange: [-0.08, -0.02],
    durationRange: [3, 10],
    headlines: [
      'Morgan Stanley downgrades {company}',
      'Analysts slash {company} price targets',
      '{company} hit with rare sell rating',
    ],
  },
  SECTOR_ROTATION: {
    impactRange: [-0.05, 0.05],
    durationRange: [50, 200],
    headlines: [
      'Investors rotate into {sector} stocks',
      '{sector} sector sees major inflows',
      'Money flows out of {sector}',
    ],
  },
  BLACK_SWAN: {
    impactRange: [-0.30, -0.10],
    durationRange: [100, 500],
    headlines: [
      'Markets rocked by unexpected crisis',
      'Black swan event triggers market panic',
      'Global markets in freefall',
    ],
  },
  MEME_PUMP: {
    impactRange: [0.30, 2.00],
    durationRange: [3, 20],
    headlines: [
      '{company} goes viral, retail traders pile in',
      'Reddit army targets {company}',
      '{company} becomes latest meme stock sensation',
    ],
  },
  MARKET_CRASH: {
    impactRange: [-0.15, -0.05],
    durationRange: [50, 200],
    headlines: [
      'Markets enter correction territory',
      'Sell-off intensifies across all sectors',
      'Fear grips Wall Street',
    ],
  },
  RALLY: {
    impactRange: [0.05, 0.15],
    durationRange: [50, 200],
    headlines: [
      'Bull market roars back',
      'Stocks surge on optimism',
      'Risk-on sentiment returns',
    ],
  },
};

const SECTOR_EVENTS: Record<Sector, EventType[]> = {
  Technology: ['EARNINGS_BEAT', 'EARNINGS_MISS', 'PRODUCT_LAUNCH', 'ANALYST_UPGRADE', 'ANALYST_DOWNGRADE'],
  Finance: ['EARNINGS_BEAT', 'EARNINGS_MISS', 'CEO_SCANDAL', 'MERGER_RUMOR'],
  Healthcare: ['FDA_APPROVAL', 'FDA_REJECTION', 'EARNINGS_BEAT', 'EARNINGS_MISS'],
  Energy: ['EARNINGS_BEAT', 'EARNINGS_MISS', 'ANALYST_UPGRADE', 'ANALYST_DOWNGRADE'],
  Consumer: ['PRODUCT_LAUNCH', 'EARNINGS_BEAT', 'EARNINGS_MISS', 'CEO_SCANDAL'],
  Industrial: ['EARNINGS_BEAT', 'EARNINGS_MISS', 'MERGER_RUMOR'],
  RealEstate: ['EARNINGS_BEAT', 'EARNINGS_MISS', 'ANALYST_UPGRADE'],
  Utilities: ['EARNINGS_BEAT', 'EARNINGS_MISS'],
  Crypto: ['MEME_PUMP', 'CEO_SCANDAL', 'SHORT_SQUEEZE'],
  Meme: ['MEME_PUMP', 'SHORT_SQUEEZE', 'INSIDER_SELLING'],
};

export class EventGenerator {
  private config: EventConfig;
  private eventCounter: number = 0;

  constructor(config: Partial<EventConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate random events for a tick
   */
  generateEvents(tick: number, companies: Company[]): MarketEvent[] {
    const events: MarketEvent[] = [];

    // Check for black swan
    if (Math.random() < this.config.blackSwanChance) {
      events.push(this.generateBlackSwan(tick));
    }

    // Check for company-specific events
    for (const company of companies) {
      if (Math.random() < this.config.baseEventChance) {
        const event = this.generateCompanyEvent(tick, company);
        if (event) events.push(event);
      }
    }

    return events;
  }

  /**
   * Generate a company-specific event
   */
  private generateCompanyEvent(tick: number, company: Company): MarketEvent | null {
    const eventTypes = SECTOR_EVENTS[company.sector] || ['EARNINGS_BEAT', 'EARNINGS_MISS'];
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const template = EVENT_TEMPLATES[eventType];

    const impact = this.randomInRange(template.impactRange);
    const duration = Math.round(this.randomInRange(template.durationRange));
    const headline = this.formatHeadline(
      template.headlines[Math.floor(Math.random() * template.headlines.length)],
      company.name,
      company.sector
    );

    return {
      id: generateShortId('evt'),
      type: eventType,
      symbol: company.symbol,
      sector: company.sector,
      impact,
      duration,
      tick,
      headline,
      createdAt: new Date(),
    };
  }

  /**
   * Generate a black swan event
   */
  private generateBlackSwan(tick: number): MarketEvent {
    const eventType: EventType = Math.random() < 0.5 ? 'BLACK_SWAN' : 'MARKET_CRASH';
    const template = EVENT_TEMPLATES[eventType];

    return {
      id: generateShortId('evt'),
      type: eventType,
      impact: this.randomInRange(template.impactRange),
      duration: Math.round(this.randomInRange(template.durationRange)),
      tick,
      headline: template.headlines[Math.floor(Math.random() * template.headlines.length)],
      createdAt: new Date(),
    };
  }

  /**
   * Format headline with company/sector names
   */
  private formatHeadline(template: string, company: string, sector: string): string {
    return template
      .replace('{company}', company)
      .replace('{sector}', sector);
  }

  /**
   * Random number in range
   */
  private randomInRange([min, max]: [number, number]): number {
    return min + Math.random() * (max - min);
  }

  /**
   * Manually trigger an event
   */
  createEvent(
    tick: number,
    type: EventType,
    options: {
      symbol?: string;
      sector?: Sector;
      headline?: string;
      impact?: number;
      duration?: number;
    } = {}
  ): MarketEvent {
    const template = EVENT_TEMPLATES[type];
    return {
      id: generateShortId('evt'),
      type,
      symbol: options.symbol,
      sector: options.sector,
      impact: options.impact ?? this.randomInRange(template.impactRange),
      duration: options.duration ?? Math.round(this.randomInRange(template.durationRange)),
      tick,
      headline: options.headline ?? template.headlines[0],
      createdAt: new Date(),
    };
  }
}
