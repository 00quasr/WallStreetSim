import { db } from './client';
import { companies, worldState } from './schema';
import {
  COMPANY_PREFIXES,
  SECTOR_SUFFIXES,
  SECTOR_INDUSTRIES,
  SECTOR_DISTRIBUTION,
  SECTOR_CONFIGS,
} from '@wallstreetsim/utils';
import type { Sector } from '@wallstreetsim/types';

const TOTAL_COMPANIES = 100;

function randomFrom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function round(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function generateCompanyName(sector: Sector, usedNames: Set<string>): string {
  let name: string;
  let attempts = 0;

  do {
    const prefix = randomFrom(COMPANY_PREFIXES);
    const suffix = randomFrom(SECTOR_SUFFIXES[sector]);
    name = `${prefix} ${suffix}`;
    attempts++;
  } while (usedNames.has(name) && attempts < 100);

  usedNames.add(name);
  return name;
}

function generateSymbol(name: string, usedSymbols: Set<string>): string {
  let symbol: string;
  let attempts = 0;

  do {
    const words = name.split(' ');
    if (words.length >= 2) {
      symbol = words.map(w => w[0]).join('').toUpperCase();
      if (symbol.length < 3) {
        symbol = words[0].substring(0, 4).toUpperCase();
      }
    } else {
      symbol = name.substring(0, 4).toUpperCase();
    }

    if (usedSymbols.has(symbol)) {
      symbol = symbol.substring(0, 3) + String.fromCharCode(65 + (attempts % 26));
    }
    attempts++;
  } while (usedSymbols.has(symbol) && attempts < 100);

  usedSymbols.add(symbol);
  return symbol;
}

async function seed() {
  console.log('🌱 Seeding database...\n');

  const usedNames = new Set<string>();
  const usedSymbols = new Set<string>();
  const companiesToInsert: (typeof companies.$inferInsert)[] = [];

  // Generate companies by sector distribution
  for (const [sector, ratio] of Object.entries(SECTOR_DISTRIBUTION)) {
    const sectorConfig = SECTOR_CONFIGS[sector as Sector];
    const sectorCount = Math.round(TOTAL_COMPANIES * ratio);

    console.log(`Generating ${sectorCount} ${sector} companies...`);

    for (let i = 0; i < sectorCount; i++) {
      const name = generateCompanyName(sector as Sector, usedNames);
      const symbol = generateSymbol(name, usedSymbols);
      const industry = randomFrom(SECTOR_INDUSTRIES[sector as Sector]);

      // Base price between $5 and $500, log-distributed
      const basePrice = round(Math.exp(Math.random() * 4.6 + 1.6), 2);

      // Market cap: $100M to $500B, power-law distributed
      const marketCapExponent = Math.random() * 3.7 + 8;
      const marketCap = Math.pow(10, marketCapExponent);

      // Shares outstanding derived from price and market cap
      const sharesOutstanding = Math.round(marketCap / basePrice);

      // Volatility: base sector volatility + company-specific noise
      const volatilityMultiplier = 0.5 + Math.random() * 1.5;
      let volatility = sectorConfig.baseVolatility * volatilityMultiplier;
      if (sector === 'Meme') volatility *= 2;

      companiesToInsert.push({
        symbol,
        name,
        sector: sector as Sector,
        industry,
        sharesOutstanding,
        revenue: String(round(marketCap * (0.1 + Math.random() * 0.3), 2)),
        profit: String(round(marketCap * (Math.random() * 0.1 - 0.02), 2)),
        cash: String(round(marketCap * 0.1 * Math.random(), 2)),
        debt: String(round(marketCap * 0.2 * Math.random(), 2)),
        currentPrice: String(basePrice),
        previousClose: String(basePrice),
        openPrice: String(basePrice),
        highPrice: String(round(basePrice * 1.01, 2)),
        lowPrice: String(round(basePrice * 0.99, 2)),
        marketCap: String(round(marketCap, 2)),
        volatility: String(round(volatility, 6)),
        beta: String(round(sectorConfig.marketCorrelation * (0.8 + Math.random() * 0.4), 4)),
        sentiment: '0',
        manipulationScore: '0',
        isPublic: true,
      });
    }
  }

  // Sort by market cap descending
  companiesToInsert.sort((a, b) =>
    parseFloat(b.marketCap as string) - parseFloat(a.marketCap as string)
  );

  // Insert companies
  console.log(`\nInserting ${companiesToInsert.length} companies...`);
  await db.insert(companies).values(companiesToInsert);

  // Initialize world state
  console.log('Initializing world state...');
  await db.insert(worldState).values({
    id: 1,
    currentTick: 0,
    marketOpen: true,
    interestRate: '0.0525',
    inflationRate: '0.032',
    gdpGrowth: '0.028',
    regime: 'normal',
    lastTickAt: new Date(),
  }).onConflictDoUpdate({
    target: worldState.id,
    set: {
      currentTick: 0,
      marketOpen: true,
      lastTickAt: new Date(),
    },
  });

  console.log('\n✅ Seed complete!');
  console.log(`   - ${companiesToInsert.length} companies created`);
  console.log('   - World state initialized');

  // Show top 10 by market cap
  console.log('\nTop 10 Companies by Market Cap:');
  companiesToInsert.slice(0, 10).forEach((c, i) => {
    const cap = parseFloat(c.marketCap as string);
    const capStr = cap >= 1e9
      ? `$${(cap / 1e9).toFixed(1)}B`
      : `$${(cap / 1e6).toFixed(1)}M`;
    console.log(`  ${i + 1}. ${c.symbol.padEnd(6)} ${c.name.padEnd(30)} ${capStr}`);
  });

  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
