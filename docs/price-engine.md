# 📈 WallStreetSim — Hybrid Price Simulation Engine

## Overview

This engine generates realistic market behavior using:
- **60%** Agent trading pressure (the fun part)
- **30%** Stochastic modeling (Geometric Brownian Motion)
- **10%** Real market correlation (optional sector vibes)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PRICE SIMULATION ENGINE                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │   Real Data  │  │   Company    │  │    Agent     │          │
│  │    Seeder    │  │  Generator   │  │   Actions    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│         ▼                 ▼                 ▼                   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                    PRICE ENGINE                          │   │
│  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │   │
│  │  │  Order Book │ │     GBM     │ │   Event     │        │   │
│  │  │  Pressure   │ │  Random Walk│ │   System    │        │   │
│  │  │    (60%)    │ │    (30%)    │ │   (10%)     │        │   │
│  │  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘        │   │
│  │         └───────────────┼───────────────┘                │   │
│  │                         ▼                                │   │
│  │                  FINAL PRICE                             │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Complete Implementation

### 1. Project Setup

```bash
mkdir wallstreetsim-engine
cd wallstreetsim-engine
npm init -y
npm install typescript ts-node @types/node
npm install yfinance2 axios zod
npm install drizzle-orm postgres
npx tsc --init
```

### 2. Type Definitions

```typescript
// src/types.ts

export interface Company {
  symbol: string;
  name: string;
  sector: Sector;
  industry: string;
  
  // Price data
  price: number;
  previousClose: number;
  open: number;
  high: number;
  low: number;
  
  // Fundamentals
  marketCap: number;
  sharesOutstanding: number;
  revenue: number;
  profit: number;
  peRatio: number;
  
  // Volatility & behavior
  volatility: number;        // Daily volatility (0.01 = 1%)
  beta: number;              // Correlation to market
  momentum: number;          // Recent trend strength
  
  // Agent-driven
  sentiment: number;         // -1 to 1
  manipulationScore: number; // How much agents have moved it
  
  // Metadata
  isPublic: boolean;
  ipoTick?: number;
  ceoAgentId?: string;
}

export type Sector = 
  | 'Technology'
  | 'Finance' 
  | 'Healthcare'
  | 'Energy'
  | 'Consumer'
  | 'Industrial'
  | 'RealEstate'
  | 'Utilities'
  | 'Crypto'
  | 'Meme';

export interface SectorData {
  sector: Sector;
  performance: number;  // Daily % change
  volatility: number;
  correlation: number;  // To overall market
}

export interface Order {
  id: string;
  agentId: string;
  symbol: string;
  side: 'BUY' | 'SELL';
  type: 'MARKET' | 'LIMIT' | 'STOP';
  quantity: number;
  price?: number;
  timestamp: number;
  tick: number;
}

export interface Trade {
  id: string;
  symbol: string;
  buyerId: string;
  sellerId: string;
  price: number;
  quantity: number;
  tick: number;
}

export interface OrderBook {
  symbol: string;
  bids: OrderBookLevel[];  // Buy orders (highest first)
  asks: OrderBookLevel[];  // Sell orders (lowest first)
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
  orders: Order[];
}

export interface PriceUpdate {
  symbol: string;
  oldPrice: number;
  newPrice: number;
  change: number;
  changePercent: number;
  volume: number;
  tick: number;
  drivers: {
    agentPressure: number;
    randomWalk: number;
    sectorCorrelation: number;
    eventImpact: number;
  };
}

export interface MarketEvent {
  id: string;
  type: EventType;
  symbol?: string;
  sector?: Sector;
  impact: number;        // -1 to 1
  duration: number;      // Ticks
  tick: number;
  headline: string;
}

export type EventType =
  | 'EARNINGS_BEAT'
  | 'EARNINGS_MISS'
  | 'CEO_SCANDAL'
  | 'PRODUCT_LAUNCH'
  | 'FDA_APPROVAL'
  | 'FDA_REJECTION'
  | 'MERGER_RUMOR'
  | 'INSIDER_SELLING'
  | 'SHORT_SQUEEZE'
  | 'ANALYST_UPGRADE'
  | 'ANALYST_DOWNGRADE'
  | 'SECTOR_ROTATION'
  | 'BLACK_SWAN'
  | 'MEME_PUMP'
  | 'MARKET_CRASH'
  | 'RALLY';
```

### 3. Real Data Seeder (Free APIs)

```typescript
// src/seeder/real-data-seeder.ts

import axios from 'axios';

interface RealMarketData {
  sectors: Map<string, SectorData>;
  volatilityBenchmarks: Map<string, number>;
  correlationMatrix: number[][];
}

export class RealDataSeeder {
  private finnhubKey?: string;
  private alpacaKey?: string;
  private alpacaSecret?: string;

  constructor(config?: {
    finnhubKey?: string;
    alpacaKey?: string;
    alpacaSecret?: string;
  }) {
    this.finnhubKey = config?.finnhubKey || process.env.FINNHUB_API_KEY;
    this.alpacaKey = config?.alpacaKey || process.env.ALPACA_API_KEY;
    this.alpacaSecret = config?.alpacaSecret || process.env.ALPACA_SECRET;
  }

  /**
   * Fetch real sector ETF data to seed our simulation
   * Uses free Yahoo Finance data (no API key needed)
   */
  async fetchSectorPerformance(): Promise<Map<Sector, SectorData>> {
    const sectorETFs: Record<Sector, string> = {
      Technology: 'XLK',
      Finance: 'XLF',
      Healthcare: 'XLV',
      Energy: 'XLE',
      Consumer: 'XLY',
      Industrial: 'XLI',
      RealEstate: 'XLRE',
      Utilities: 'XLU',
      Crypto: 'BITO',  // Bitcoin ETF as proxy
      Meme: 'MEME',    // Will use fallback
    };

    const sectorData = new Map<Sector, SectorData>();

    for (const [sector, etf] of Object.entries(sectorETFs)) {
      try {
        const data = await this.fetchYahooFinance(etf);
        sectorData.set(sector as Sector, {
          sector: sector as Sector,
          performance: data.changePercent,
          volatility: data.volatility,
          correlation: data.beta || 1,
        });
      } catch (error) {
        // Fallback to synthetic data
        sectorData.set(sector as Sector, this.generateSyntheticSector(sector as Sector));
      }
    }

    return sectorData;
  }

  /**
   * Yahoo Finance (FREE, no API key)
   */
  private async fetchYahooFinance(symbol: string): Promise<{
    price: number;
    change: number;
    changePercent: number;
    volatility: number;
    beta?: number;
  }> {
    // Using Yahoo Finance v8 API (free, no key required)
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1mo`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const result = response.data.chart.result[0];
    const quotes = result.indicators.quote[0];
    const closes = quotes.close.filter((c: number | null) => c !== null);
    
    // Calculate volatility from historical data
    const returns = [];
    for (let i = 1; i < closes.length; i++) {
      returns.push((closes[i] - closes[i-1]) / closes[i-1]);
    }
    const volatility = this.calculateStdDev(returns);

    const currentPrice = closes[closes.length - 1];
    const previousClose = closes[closes.length - 2] || currentPrice;

    return {
      price: currentPrice,
      change: currentPrice - previousClose,
      changePercent: ((currentPrice - previousClose) / previousClose) * 100,
      volatility: volatility,
    };
  }

  /**
   * Finnhub API (FREE: 60 calls/minute)
   */
  async fetchFinnhubQuote(symbol: string): Promise<{
    price: number;
    change: number;
    changePercent: number;
  }> {
    if (!this.finnhubKey) {
      throw new Error('Finnhub API key not configured');
    }

    const url = `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${this.finnhubKey}`;
    const response = await axios.get(url);
    
    return {
      price: response.data.c,       // Current price
      change: response.data.d,      // Change
      changePercent: response.data.dp, // Change percent
    };
  }

  /**
   * Alpaca API (FREE, best for algo trading)
   */
  async fetchAlpacaBars(symbol: string, days: number = 30): Promise<{
    prices: number[];
    volumes: number[];
    volatility: number;
  }> {
    if (!this.alpacaKey || !this.alpacaSecret) {
      throw new Error('Alpaca credentials not configured');
    }

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const url = `https://data.alpaca.markets/v2/stocks/${symbol}/bars`;
    const response = await axios.get(url, {
      headers: {
        'APCA-API-KEY-ID': this.alpacaKey,
        'APCA-API-SECRET-KEY': this.alpacaSecret,
      },
      params: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        timeframe: '1Day',
      },
    });

    const bars = response.data.bars || [];
    const prices = bars.map((b: any) => b.c);
    const volumes = bars.map((b: any) => b.v);

    // Calculate volatility
    const returns = [];
    for (let i = 1; i < prices.length; i++) {
      returns.push((prices[i] - prices[i-1]) / prices[i-1]);
    }

    return {
      prices,
      volumes,
      volatility: this.calculateStdDev(returns),
    };
  }

  /**
   * Generate synthetic sector data when APIs fail
   */
  private generateSyntheticSector(sector: Sector): SectorData {
    const sectorDefaults: Record<Sector, { vol: number; corr: number }> = {
      Technology: { vol: 0.025, corr: 1.2 },
      Finance: { vol: 0.018, corr: 1.1 },
      Healthcare: { vol: 0.020, corr: 0.9 },
      Energy: { vol: 0.030, corr: 1.3 },
      Consumer: { vol: 0.015, corr: 0.95 },
      Industrial: { vol: 0.018, corr: 1.0 },
      RealEstate: { vol: 0.022, corr: 0.8 },
      Utilities: { vol: 0.012, corr: 0.5 },
      Crypto: { vol: 0.050, corr: 0.3 },
      Meme: { vol: 0.080, corr: 0.2 },
    };

    const defaults = sectorDefaults[sector];
    
    return {
      sector,
      performance: (Math.random() - 0.5) * 0.02, // Random -1% to +1%
      volatility: defaults.vol,
      correlation: defaults.corr,
    };
  }

  private calculateStdDev(values: number[]): number {
    if (values.length === 0) return 0.02; // Default 2% volatility
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squareDiffs = values.map(v => Math.pow(v - mean, 2));
    const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
    return Math.sqrt(avgSquareDiff);
  }
}
```

### 4. Company Generator

```typescript
// src/generator/company-generator.ts

import { Company, Sector } from '../types';
import { RealDataSeeder } from '../seeder/real-data-seeder';

// Name generation components
const PREFIXES = [
  'Apex', 'Quantum', 'Nova', 'Titan', 'Omega', 'Alpha', 'Nexus', 'Vertex',
  'Zenith', 'Atlas', 'Cypher', 'Helix', 'Prism', 'Vector', 'Axiom', 'Cipher',
  'Delta', 'Echo', 'Flux', 'Ionic', 'Pulse', 'Surge', 'Vortex', 'Zephyr',
  'Cobalt', 'Crimson', 'Emerald', 'Obsidian', 'Onyx', 'Sapphire', 'Sterling',
  'Shadow', 'Phoenix', 'Dragon', 'Eagle', 'Falcon', 'Hawk', 'Raven', 'Wolf',
  'Nimbus', 'Stratos', 'Terra', 'Aqua', 'Pyro', 'Electra', 'Magna', 'Ultra',
];

const SUFFIXES: Record<Sector, string[]> = {
  Technology: ['Tech', 'Systems', 'Digital', 'Software', 'AI', 'Labs', 'Dynamics', 'Logic', 'Cloud', 'Data'],
  Finance: ['Capital', 'Financial', 'Investments', 'Holdings', 'Partners', 'Asset Management', 'Bancorp', 'Trust'],
  Healthcare: ['Therapeutics', 'Pharma', 'BioScience', 'Medical', 'Health', 'Genomics', 'Life Sciences', 'Diagnostics'],
  Energy: ['Energy', 'Power', 'Petroleum', 'Resources', 'Renewables', 'Solar', 'Fusion', 'Grid'],
  Consumer: ['Brands', 'Retail', 'Goods', 'Products', 'Lifestyle', 'Commerce', 'Market', 'Direct'],
  Industrial: ['Industries', 'Manufacturing', 'Engineering', 'Machinery', 'Materials', 'Solutions', 'Corp'],
  RealEstate: ['Properties', 'Realty', 'Development', 'Estates', 'REIT', 'Land', 'Homes'],
  Utilities: ['Utilities', 'Electric', 'Gas', 'Water', 'Infrastructure', 'Services'],
  Crypto: ['Chain', 'Protocol', 'Token', 'Coin', 'DAO', 'DeFi', 'Web3', 'Ledger', 'Network'],
  Meme: ['Stonks', 'Moon', 'Rocket', 'Diamond', 'Ape', 'YOLO', 'Tendies', 'Lambo', 'Degen'],
};

const INDUSTRIES: Record<Sector, string[]> = {
  Technology: ['Cloud Computing', 'Artificial Intelligence', 'Cybersecurity', 'SaaS', 'Semiconductors', 'E-Commerce', 'Social Media', 'Gaming'],
  Finance: ['Investment Banking', 'Asset Management', 'Insurance', 'Fintech', 'Cryptocurrency Exchange', 'Private Equity', 'Retail Banking'],
  Healthcare: ['Biotechnology', 'Pharmaceuticals', 'Medical Devices', 'Healthcare Services', 'Diagnostics', 'Telehealth'],
  Energy: ['Oil & Gas', 'Renewable Energy', 'Nuclear', 'Utilities', 'Energy Storage', 'Clean Tech'],
  Consumer: ['Retail', 'Food & Beverage', 'Apparel', 'Entertainment', 'Travel', 'Automotive'],
  Industrial: ['Aerospace', 'Defense', 'Construction', 'Logistics', 'Manufacturing', 'Chemicals'],
  RealEstate: ['Commercial REIT', 'Residential REIT', 'Development', 'Property Management'],
  Utilities: ['Electric Utilities', 'Gas Utilities', 'Water', 'Telecommunications'],
  Crypto: ['Layer 1', 'DeFi', 'NFT', 'Gaming', 'Infrastructure', 'Exchange'],
  Meme: ['Internet Culture', 'Viral Products', 'Community', 'Speculation'],
};

export class CompanyGenerator {
  private seeder: RealDataSeeder;
  private usedSymbols: Set<string> = new Set();
  private usedNames: Set<string> = new Set();

  constructor(seeder: RealDataSeeder) {
    this.seeder = seeder;
  }

  /**
   * Generate a batch of fictional companies
   */
  async generateCompanies(count: number): Promise<Company[]> {
    const sectorData = await this.seeder.fetchSectorPerformance();
    const companies: Company[] = [];

    // Distribution of companies by sector
    const sectorDistribution: Record<Sector, number> = {
      Technology: 0.25,
      Finance: 0.15,
      Healthcare: 0.12,
      Consumer: 0.12,
      Energy: 0.08,
      Industrial: 0.08,
      RealEstate: 0.05,
      Utilities: 0.03,
      Crypto: 0.07,
      Meme: 0.05,
    };

    for (const [sector, ratio] of Object.entries(sectorDistribution)) {
      const sectorCount = Math.round(count * ratio);
      const sectorInfo = sectorData.get(sector as Sector)!;

      for (let i = 0; i < sectorCount; i++) {
        companies.push(this.generateCompany(sector as Sector, sectorInfo));
      }
    }

    // Sort by market cap (largest first)
    return companies.sort((a, b) => b.marketCap - a.marketCap);
  }

  /**
   * Generate a single company
   */
  private generateCompany(sector: Sector, sectorData: SectorData): Company {
    const name = this.generateName(sector);
    const symbol = this.generateSymbol(name);
    const industry = this.randomFrom(INDUSTRIES[sector]);

    // Base price between $5 and $500, log-distributed
    const basePrice = Math.exp(Math.random() * 4.6 + 1.6); // ~$5 to ~$500

    // Market cap: $100M to $500B, power-law distributed
    const marketCapExponent = Math.random() * 3.7 + 8; // 10^8 to 10^11.7
    const marketCap = Math.pow(10, marketCapExponent);

    // Shares outstanding derived from price and market cap
    const sharesOutstanding = Math.round(marketCap / basePrice);

    // Volatility: base sector volatility + company-specific noise
    const volatilityMultiplier = 0.5 + Math.random() * 1.5; // 0.5x to 2x
    const volatility = sectorData.volatility * volatilityMultiplier;

    // Meme stocks get extra volatility
    const finalVolatility = sector === 'Meme' ? volatility * 2 : volatility;

    return {
      symbol,
      name,
      sector,
      industry,
      
      price: this.round(basePrice, 2),
      previousClose: this.round(basePrice, 2),
      open: this.round(basePrice, 2),
      high: this.round(basePrice * 1.01, 2),
      low: this.round(basePrice * 0.99, 2),
      
      marketCap: Math.round(marketCap),
      sharesOutstanding,
      revenue: Math.round(marketCap * (0.1 + Math.random() * 0.3)), // 10-40% of market cap
      profit: Math.round(marketCap * (Math.random() * 0.1 - 0.02)), // -2% to +8% margin
      peRatio: 10 + Math.random() * 40, // P/E 10-50
      
      volatility: this.round(finalVolatility, 4),
      beta: sectorData.correlation * (0.8 + Math.random() * 0.4),
      momentum: 0,
      
      sentiment: 0,
      manipulationScore: 0,
      
      isPublic: true,
    };
  }

  private generateName(sector: Sector): string {
    let name: string;
    let attempts = 0;
    
    do {
      const prefix = this.randomFrom(PREFIXES);
      const suffix = this.randomFrom(SUFFIXES[sector]);
      name = `${prefix} ${suffix}`;
      attempts++;
    } while (this.usedNames.has(name) && attempts < 100);

    this.usedNames.add(name);
    return name;
  }

  private generateSymbol(name: string): string {
    let symbol: string;
    let attempts = 0;

    do {
      // Try to create symbol from name
      const words = name.split(' ');
      if (words.length >= 2) {
        // First letters of each word
        symbol = words.map(w => w[0]).join('').toUpperCase();
        if (symbol.length < 3) {
          symbol = words[0].substring(0, 4).toUpperCase();
        }
      } else {
        symbol = name.substring(0, 4).toUpperCase();
      }

      // Add number if collision
      if (this.usedSymbols.has(symbol)) {
        symbol = symbol.substring(0, 3) + String.fromCharCode(65 + (attempts % 26));
      }
      attempts++;
    } while (this.usedSymbols.has(symbol) && attempts < 100);

    this.usedSymbols.add(symbol);
    return symbol;
  }

  private randomFrom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }

  private round(value: number, decimals: number): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
}
```

### 5. Price Engine (Core)

```typescript
// src/engine/price-engine.ts

import { Company, Order, Trade, OrderBook, PriceUpdate, MarketEvent, Sector, SectorData } from '../types';
import { EventEmitter } from 'events';

interface PriceEngineConfig {
  // Weight of each price driver
  agentPressureWeight: number;    // Default: 0.6
  randomWalkWeight: number;       // Default: 0.3
  sectorCorrelationWeight: number;// Default: 0.1
  
  // Limits
  maxTickMove: number;            // Max % move per tick (default: 0.10 = 10%)
  minPrice: number;               // Minimum price (default: 0.01)
  
  // Market hours
  marketOpenTick: number;         // Tick when market opens
  marketCloseTick: number;        // Tick when market closes
}

const DEFAULT_CONFIG: PriceEngineConfig = {
  agentPressureWeight: 0.6,
  randomWalkWeight: 0.3,
  sectorCorrelationWeight: 0.1,
  maxTickMove: 0.10,
  minPrice: 0.01,
  marketOpenTick: 0,
  marketCloseTick: 390, // 6.5 hours in minutes
};

export class PriceEngine extends EventEmitter {
  private companies: Map<string, Company> = new Map();
  private orderBooks: Map<string, OrderBook> = new Map();
  private sectorData: Map<Sector, SectorData> = new Map();
  private activeEvents: MarketEvent[] = [];
  private config: PriceEngineConfig;
  private currentTick: number = 0;
  private marketOpen: boolean = true;

  constructor(config: Partial<PriceEngineConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize with companies and sector data
   */
  initialize(companies: Company[], sectorData: Map<Sector, SectorData>): void {
    for (const company of companies) {
      this.companies.set(company.symbol, company);
      this.orderBooks.set(company.symbol, {
        symbol: company.symbol,
        bids: [],
        asks: [],
      });
    }
    this.sectorData = sectorData;
  }

  /**
   * Update sector data (can be called periodically to refresh from real APIs)
   */
  updateSectorData(sectorData: Map<Sector, SectorData>): void {
    this.sectorData = sectorData;
  }

  /**
   * Main tick update - recalculate all prices
   */
  async processTick(tick: number, trades: Trade[]): Promise<PriceUpdate[]> {
    this.currentTick = tick;
    this.marketOpen = tick >= this.config.marketOpenTick && tick < this.config.marketCloseTick;

    const updates: PriceUpdate[] = [];

    for (const [symbol, company] of this.companies) {
      const symbolTrades = trades.filter(t => t.symbol === symbol);
      const update = this.updatePrice(company, symbolTrades);
      updates.push(update);
    }

    // Decay active events
    this.activeEvents = this.activeEvents.filter(e => 
      tick < e.tick + e.duration
    );

    this.emit('tick', { tick, updates });
    return updates;
  }

  /**
   * Calculate new price for a single stock
   */
  private updatePrice(company: Company, trades: Trade[]): PriceUpdate {
    const oldPrice = company.price;
    
    // 1. Agent pressure from order book and trades
    const agentPressure = this.calculateAgentPressure(company.symbol, trades);
    
    // 2. Random walk (Geometric Brownian Motion)
    const randomWalk = this.calculateRandomWalk(company);
    
    // 3. Sector correlation
    const sectorMove = this.calculateSectorCorrelation(company);
    
    // 4. Event impact
    const eventImpact = this.calculateEventImpact(company);
    
    // Combine with weights
    const totalMove = 
      (agentPressure * this.config.agentPressureWeight) +
      (randomWalk * this.config.randomWalkWeight) +
      (sectorMove * this.config.sectorCorrelationWeight) +
      eventImpact; // Events are additive, not weighted
    
    // Clamp to max move
    const clampedMove = Math.max(
      -this.config.maxTickMove,
      Math.min(this.config.maxTickMove, totalMove)
    );
    
    // Calculate new price
    let newPrice = oldPrice * (1 + clampedMove);
    newPrice = Math.max(this.config.minPrice, newPrice);
    newPrice = this.round(newPrice, 2);
    
    // Update company
    company.previousClose = company.price;
    company.price = newPrice;
    company.high = Math.max(company.high, newPrice);
    company.low = Math.min(company.low, newPrice);
    
    // Update momentum (exponential moving average of returns)
    const returnPct = (newPrice - oldPrice) / oldPrice;
    company.momentum = company.momentum * 0.9 + returnPct * 0.1;
    
    // Track manipulation (large moves from agent activity)
    if (Math.abs(agentPressure) > 0.02) {
      company.manipulationScore += Math.abs(agentPressure);
    }
    company.manipulationScore *= 0.99; // Decay over time
    
    const change = newPrice - oldPrice;
    const changePercent = (change / oldPrice) * 100;
    
    return {
      symbol: company.symbol,
      oldPrice,
      newPrice,
      change: this.round(change, 2),
      changePercent: this.round(changePercent, 2),
      volume: trades.reduce((sum, t) => sum + t.quantity, 0),
      tick: this.currentTick,
      drivers: {
        agentPressure: this.round(agentPressure * 100, 2),
        randomWalk: this.round(randomWalk * 100, 2),
        sectorCorrelation: this.round(sectorMove * 100, 2),
        eventImpact: this.round(eventImpact * 100, 2),
      },
    };
  }

  /**
   * Calculate price pressure from agent trading activity
   */
  private calculateAgentPressure(symbol: string, trades: Trade[]): number {
    const orderBook = this.orderBooks.get(symbol)!;
    const company = this.companies.get(symbol)!;
    
    // 1. Trade imbalance
    let buyVolume = 0;
    let sellVolume = 0;
    
    for (const trade of trades) {
      // Assume buyer initiated if price >= mid
      const mid = company.price;
      if (trade.price >= mid) {
        buyVolume += trade.quantity * trade.price;
      } else {
        sellVolume += trade.quantity * trade.price;
      }
    }
    
    const totalVolume = buyVolume + sellVolume;
    const tradeImbalance = totalVolume > 0 
      ? (buyVolume - sellVolume) / totalVolume 
      : 0;
    
    // 2. Order book imbalance
    const bidDepth = orderBook.bids.reduce((sum, level) => 
      sum + level.quantity * level.price, 0
    );
    const askDepth = orderBook.asks.reduce((sum, level) => 
      sum + level.quantity * level.price, 0
    );
    const totalDepth = bidDepth + askDepth;
    const bookImbalance = totalDepth > 0 
      ? (bidDepth - askDepth) / totalDepth 
      : 0;
    
    // 3. Volume impact (more volume = bigger move)
    const avgDailyVolume = company.sharesOutstanding * 0.01; // Assume 1% daily turnover
    const volumeRatio = totalVolume / (avgDailyVolume * company.price + 1);
    const volumeImpact = Math.min(1, volumeRatio); // Cap at 1
    
    // Combine: 70% trade imbalance, 30% book imbalance, scaled by volume
    const rawPressure = (tradeImbalance * 0.7 + bookImbalance * 0.3);
    
    // Scale by volatility and volume
    return rawPressure * company.volatility * 10 * (0.5 + volumeImpact);
  }

  /**
   * Geometric Brownian Motion for random price movement
   */
  private calculateRandomWalk(company: Company): number {
    // GBM: dS = μSdt + σSdW
    // For a tick, this simplifies to:
    // return = μ * dt + σ * sqrt(dt) * Z
    // where Z is standard normal
    
    const dt = 1 / 390; // One tick = 1/390 of a trading day
    const mu = 0; // Drift (assume 0 for short term)
    const sigma = company.volatility;
    
    // Box-Muller transform for normal distribution
    const u1 = Math.random();
    const u2 = Math.random();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    
    // Random return
    const randomReturn = mu * dt + sigma * Math.sqrt(dt) * z;
    
    // Add momentum factor (trending stocks continue trending)
    const momentumFactor = company.momentum * 0.3;
    
    return randomReturn + momentumFactor;
  }

  /**
   * Correlate stock movement with its sector
   */
  private calculateSectorCorrelation(company: Company): number {
    const sectorInfo = this.sectorData.get(company.sector);
    if (!sectorInfo) return 0;
    
    // Stock moves with sector, scaled by beta
    const sectorMove = sectorInfo.performance / 100; // Convert to decimal
    return sectorMove * company.beta * 0.5; // Dampened correlation
  }

  /**
   * Calculate impact of active events
   */
  private calculateEventImpact(company: Company): number {
    let totalImpact = 0;
    
    for (const event of this.activeEvents) {
      // Check if event affects this company
      const affectsCompany = event.symbol === company.symbol;
      const affectsSector = event.sector === company.sector;
      
      if (!affectsCompany && !affectsSector) continue;
      
      // Decay impact over duration
      const ticksElapsed = this.currentTick - event.tick;
      const decayFactor = 1 - (ticksElapsed / event.duration);
      
      // Direct hit vs sector spillover
      const impactMultiplier = affectsCompany ? 1 : 0.3;
      
      totalImpact += event.impact * decayFactor * impactMultiplier;
    }
    
    return totalImpact * company.volatility * 5; // Scale by volatility
  }

  /**
   * Add a market event
   */
  triggerEvent(event: MarketEvent): void {
    this.activeEvents.push(event);
    this.emit('event', event);
  }

  /**
   * Submit an order to the order book
   */
  submitOrder(order: Order): { success: boolean; fills: Trade[] } {
    const orderBook = this.orderBooks.get(order.symbol);
    if (!orderBook) {
      return { success: false, fills: [] };
    }

    const fills: Trade[] = [];

    if (order.type === 'MARKET') {
      // Market order: fill immediately at best available price
      const fills = this.executeMarketOrder(order, orderBook);
      return { success: true, fills };
    } else {
      // Limit order: add to book or fill if crosses
      const fills = this.executeLimitOrder(order, orderBook);
      return { success: true, fills };
    }
  }

  private executeMarketOrder(order: Order, book: OrderBook): Trade[] {
    const fills: Trade[] = [];
    let remainingQty = order.quantity;
    const levels = order.side === 'BUY' ? book.asks : book.bids;

    while (remainingQty > 0 && levels.length > 0) {
      const level = levels[0];
      const fillQty = Math.min(remainingQty, level.quantity);
      
      fills.push({
        id: crypto.randomUUID(),
        symbol: order.symbol,
        buyerId: order.side === 'BUY' ? order.agentId : level.orders[0].agentId,
        sellerId: order.side === 'SELL' ? order.agentId : level.orders[0].agentId,
        price: level.price,
        quantity: fillQty,
        tick: this.currentTick,
      });

      remainingQty -= fillQty;
      level.quantity -= fillQty;
      
      if (level.quantity <= 0) {
        levels.shift();
      }
    }

    return fills;
  }

  private executeLimitOrder(order: Order, book: OrderBook): Trade[] {
    const fills: Trade[] = [];
    let remainingQty = order.quantity;

    // Try to match against opposite side
    const oppositeLevels = order.side === 'BUY' ? book.asks : book.bids;
    
    while (remainingQty > 0 && oppositeLevels.length > 0) {
      const level = oppositeLevels[0];
      
      // Check if prices cross
      const pricesCross = order.side === 'BUY' 
        ? order.price! >= level.price
        : order.price! <= level.price;
      
      if (!pricesCross) break;

      const fillQty = Math.min(remainingQty, level.quantity);
      
      fills.push({
        id: crypto.randomUUID(),
        symbol: order.symbol,
        buyerId: order.side === 'BUY' ? order.agentId : level.orders[0].agentId,
        sellerId: order.side === 'SELL' ? order.agentId : level.orders[0].agentId,
        price: level.price, // Fill at resting order's price
        quantity: fillQty,
        tick: this.currentTick,
      });

      remainingQty -= fillQty;
      level.quantity -= fillQty;
      
      if (level.quantity <= 0) {
        oppositeLevels.shift();
      }
    }

    // Add remaining to book
    if (remainingQty > 0) {
      this.addToBook(order, remainingQty, book);
    }

    return fills;
  }

  private addToBook(order: Order, quantity: number, book: OrderBook): void {
    const levels = order.side === 'BUY' ? book.bids : book.asks;
    const price = order.price!;

    // Find or create level
    let level = levels.find(l => l.price === price);
    if (!level) {
      level = { price, quantity: 0, orders: [] };
      levels.push(level);
      
      // Sort: bids descending, asks ascending
      if (order.side === 'BUY') {
        levels.sort((a, b) => b.price - a.price);
      } else {
        levels.sort((a, b) => a.price - b.price);
      }
    }

    level.quantity += quantity;
    level.orders.push({ ...order, quantity });
  }

  /**
   * Get current state
   */
  getCompany(symbol: string): Company | undefined {
    return this.companies.get(symbol);
  }

  getAllCompanies(): Company[] {
    return Array.from(this.companies.values());
  }

  getOrderBook(symbol: string): OrderBook | undefined {
    return this.orderBooks.get(symbol);
  }

  private round(value: number, decimals: number): number {
    return Math.round(value * Math.pow(10, decimals)) / Math.pow(10, decimals);
  }
}
```

### 6. Event Generator

```typescript
// src/engine/event-generator.ts

import { MarketEvent, EventType, Sector, Company } from '../types';

interface EventConfig {
  baseEventChance: number;  // Chance per tick of any event (default: 0.02 = 2%)
  blackSwanChance: number;  // Chance of market-wide event (default: 0.001)
}

const DEFAULT_EVENT_CONFIG: EventConfig = {
  baseEventChance: 0.02,
  blackSwanChance: 0.001,
};

const EVENT_TEMPLATES: Record<EventType, {
  impactRange: [number, number];
  durationRange: [number, number];
  headlines: string[];
}> = {
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

export class EventGenerator {
  private config: EventConfig;
  private eventCounter: number = 0;

  constructor(config: Partial<EventConfig> = {}) {
    this.config = { ...DEFAULT_EVENT_CONFIG, ...config };
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

  private generateCompanyEvent(tick: number, company: Company): MarketEvent | null {
    // Choose event type based on sector
    const eventType = this.chooseEventType(company.sector);
    if (!eventType) return null;

    const template = EVENT_TEMPLATES[eventType];
    const impact = this.randomInRange(template.impactRange);
    const duration = Math.round(this.randomInRange(template.durationRange));
    const headline = this.formatHeadline(
      this.randomFrom(template.headlines),
      company.name,
      company.sector
    );

    return {
      id: `evt_${++this.eventCounter}`,
      type: eventType,
      symbol: company.symbol,
      sector: company.sector,
      impact,
      duration,
      tick,
      headline,
    };
  }

  private generateBlackSwan(tick: number): MarketEvent {
    const eventType: EventType = Math.random() < 0.5 ? 'BLACK_SWAN' : 'MARKET_CRASH';
    const template = EVENT_TEMPLATES[eventType];

    return {
      id: `evt_${++this.eventCounter}`,
      type: eventType,
      impact: this.randomInRange(template.impactRange),
      duration: Math.round(this.randomInRange(template.durationRange)),
      tick,
      headline: this.randomFrom(template.headlines),
    };
  }

  private chooseEventType(sector: Sector): EventType | null {
    // Weight events by sector
    const sectorEvents: Record<Sector, EventType[]> = {
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

    const options = sectorEvents[sector] || ['EARNINGS_BEAT', 'EARNINGS_MISS'];
    return this.randomFrom(options);
  }

  private formatHeadline(template: string, company: string, sector: string): string {
    return template
      .replace('{company}', company)
      .replace('{sector}', sector);
  }

  private randomInRange([min, max]: [number, number]): number {
    return min + Math.random() * (max - min);
  }

  private randomFrom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
  }
}
```

### 7. Main Entry Point

```typescript
// src/index.ts

import { RealDataSeeder } from './seeder/real-data-seeder';
import { CompanyGenerator } from './generator/company-generator';
import { PriceEngine } from './engine/price-engine';
import { EventGenerator } from './engine/event-generator';
import { Trade } from './types';

async function main() {
  console.log('🚀 Initializing WallStreetSim...\n');

  // 1. Initialize real data seeder
  const seeder = new RealDataSeeder({
    finnhubKey: process.env.FINNHUB_API_KEY,
    alpacaKey: process.env.ALPACA_API_KEY,
    alpacaSecret: process.env.ALPACA_SECRET,
  });

  // 2. Fetch real sector data
  console.log('📊 Fetching real market data...');
  const sectorData = await seeder.fetchSectorPerformance();
  console.log('Sector data loaded:', Array.from(sectorData.keys()).join(', '));

  // 3. Generate fictional companies
  console.log('\n🏢 Generating companies...');
  const generator = new CompanyGenerator(seeder);
  const companies = await generator.generateCompanies(100);
  console.log(`Generated ${companies.length} companies`);

  // Show top 10 by market cap
  console.log('\nTop 10 Companies by Market Cap:');
  companies.slice(0, 10).forEach((c, i) => {
    console.log(`  ${i + 1}. ${c.symbol} - ${c.name} ($${(c.marketCap / 1e9).toFixed(1)}B)`);
  });

  // 4. Initialize price engine
  console.log('\n⚡ Initializing price engine...');
  const priceEngine = new PriceEngine({
    agentPressureWeight: 0.6,
    randomWalkWeight: 0.3,
    sectorCorrelationWeight: 0.1,
  });
  priceEngine.initialize(companies, sectorData);

  // 5. Initialize event generator
  const eventGenerator = new EventGenerator({
    baseEventChance: 0.005, // 0.5% per company per tick
    blackSwanChance: 0.0001,
  });

  // 6. Listen for events
  priceEngine.on('tick', ({ tick, updates }) => {
    const movers = updates
      .filter(u => Math.abs(u.changePercent) > 1)
      .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
      .slice(0, 5);
    
    if (movers.length > 0) {
      console.log(`\nTick ${tick} - Top Movers:`);
      movers.forEach(m => {
        const arrow = m.changePercent > 0 ? '📈' : '📉';
        console.log(`  ${arrow} ${m.symbol}: $${m.newPrice.toFixed(2)} (${m.changePercent > 0 ? '+' : ''}${m.changePercent.toFixed(2)}%)`);
      });
    }
  });

  priceEngine.on('event', (event) => {
    console.log(`\n🔔 EVENT: ${event.headline}`);
    console.log(`   Impact: ${(event.impact * 100).toFixed(1)}%, Duration: ${event.duration} ticks`);
  });

  // 7. Run simulation
  console.log('\n🎮 Starting simulation...\n');
  
  let tick = 0;
  const tickInterval = setInterval(async () => {
    tick++;

    // Generate random events
    const events = eventGenerator.generateEvents(tick, priceEngine.getAllCompanies());
    events.forEach(e => priceEngine.triggerEvent(e));

    // Simulate some random agent trades
    const trades = generateRandomTrades(tick, companies);
    
    // Process tick
    await priceEngine.processTick(tick, trades);

    // Stop after 100 ticks for demo
    if (tick >= 100) {
      clearInterval(tickInterval);
      console.log('\n✅ Simulation complete!');
      
      // Show final standings
      const final = priceEngine.getAllCompanies()
        .sort((a, b) => {
          const aChange = (a.price - a.previousClose) / a.previousClose;
          const bChange = (b.price - b.previousClose) / b.previousClose;
          return bChange - aChange;
        });
      
      console.log('\n📊 Final Results - Top Gainers:');
      final.slice(0, 5).forEach(c => {
        const change = ((c.price / companies.find(x => x.symbol === c.symbol)!.price - 1) * 100);
        console.log(`  ${c.symbol}: $${c.price.toFixed(2)} (${change > 0 ? '+' : ''}${change.toFixed(2)}%)`);
      });
      
      console.log('\n📉 Final Results - Top Losers:');
      final.slice(-5).reverse().forEach(c => {
        const change = ((c.price / companies.find(x => x.symbol === c.symbol)!.price - 1) * 100);
        console.log(`  ${c.symbol}: $${c.price.toFixed(2)} (${change > 0 ? '+' : ''}${change.toFixed(2)}%)`);
      });
    }
  }, 100); // 100ms per tick for demo (would be 1000ms in production)
}

/**
 * Generate random trades to simulate agent activity
 */
function generateRandomTrades(tick: number, companies: { symbol: string; price: number }[]): Trade[] {
  const trades: Trade[] = [];
  const tradeCount = Math.floor(Math.random() * 50) + 10; // 10-60 trades per tick

  for (let i = 0; i < tradeCount; i++) {
    const company = companies[Math.floor(Math.random() * companies.length)];
    const quantity = Math.floor(Math.random() * 1000) + 100;
    const priceVariation = (Math.random() - 0.5) * 0.02; // ±1% from current
    
    trades.push({
      id: `trade_${tick}_${i}`,
      symbol: company.symbol,
      buyerId: `agent_${Math.floor(Math.random() * 100)}`,
      sellerId: `agent_${Math.floor(Math.random() * 100)}`,
      price: company.price * (1 + priceVariation),
      quantity,
      tick,
    });
  }

  return trades;
}

// Run
main().catch(console.error);
```

### 8. Package Configuration

```json
// package.json
{
  "name": "wallstreetsim-engine",
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "start": "tsx src/index.ts",
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest"
  },
  "dependencies": {
    "axios": "^1.6.0",
    "zod": "^3.22.0"
  },
  "devDependencies": {
    "@types/node": "^20.0.0",
    "tsx": "^4.0.0",
    "typescript": "^5.3.0",
    "vitest": "^1.0.0"
  }
}
```

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"]
}
```

---

## Summary

This hybrid price engine gives you:

| Component | What It Does |
|-----------|--------------|
| **RealDataSeeder** | Fetches real sector ETF data from Yahoo Finance (free) to seed volatility and correlations |
| **CompanyGenerator** | Creates 100 fictional companies with realistic names, sectors, and fundamentals |
| **PriceEngine** | Core simulation: 60% agent pressure + 30% random walk + 10% sector correlation |
| **EventGenerator** | Generates earnings surprises, FDA decisions, meme pumps, black swans |
| **OrderBook** | Full limit order book for realistic price discovery |

**Free Data Sources Used:**
- Yahoo Finance (no API key needed)
- Finnhub (free tier: 60 req/min)
- Alpaca (free tier: unlimited)

**Run it:**
```bash
npm install
npm start
```

Want me to add any specific features or integrate this with the full WallStreetSim backend?
