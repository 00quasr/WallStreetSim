import type { AgentRole, AgentRoleConfig, Sector, SectorConfig } from '@wallstreetsim/types';

// Tick timing
export const TICK_INTERVAL_MS = 1000;
export const TICKS_PER_TRADING_DAY = 390;
export const TICKS_AFTER_HOURS = 240;
export const MARKET_OPEN_TICK = 0;
export const MARKET_CLOSE_TICK = 390;

// Trading limits
export const MAX_ORDER_QUANTITY = 1_000_000;
export const MIN_ORDER_QUANTITY = 1;
export const MAX_PRICE = 1_000_000;
export const MIN_PRICE = 0.01;
export const MAX_LEVERAGE = 10;
export const DEFAULT_MARGIN_REQUIREMENT = 0.25;

// Price engine weights
export const AGENT_PRESSURE_WEIGHT = 0.6;
export const RANDOM_WALK_WEIGHT = 0.3;
export const SECTOR_CORRELATION_WEIGHT = 0.1;
export const MAX_TICK_MOVE = 0.10;

// Event probabilities
export const BASE_EVENT_CHANCE = 0.02;
export const BLACK_SWAN_CHANCE = 0.001;

// Role configurations
export const ROLE_CONFIGS: Record<AgentRole, AgentRoleConfig> = {
  hedge_fund_manager: {
    role: 'hedge_fund_manager',
    displayName: 'Hedge Fund Manager',
    startingCapital: 100_000_000,
    maxLeverage: 10,
    description: 'Professional investor managing large pools of capital',
    specialAbility: 'Can use 10x leverage',
    risks: ['Margin calls', 'Investor redemptions'],
  },
  retail_trader: {
    role: 'retail_trader',
    displayName: 'Retail Trader',
    startingCapital: 10_000,
    maxLeverage: 2,
    description: 'Individual investor trading with personal funds',
    specialAbility: 'Can coordinate on social media',
    risks: ['Going broke', 'FOMO buying tops'],
  },
  ceo: {
    role: 'ceo',
    displayName: 'CEO',
    startingCapital: 10_000_000,
    maxLeverage: 1,
    description: 'Executive running a public company',
    specialAbility: 'Insider knowledge, can cook books',
    risks: ['SEC investigation', 'Shareholder lawsuits'],
  },
  investment_banker: {
    role: 'investment_banker',
    displayName: 'Investment Banker',
    startingCapital: 1_000_000,
    maxLeverage: 3,
    description: 'Deal-maker structuring IPOs and M&A',
    specialAbility: 'Can structure IPOs, M&A deals',
    risks: ['Deal collapses', 'Reputation damage'],
  },
  financial_journalist: {
    role: 'financial_journalist',
    displayName: 'Financial Journalist',
    startingCapital: 50_000,
    maxLeverage: 1,
    description: 'Media professional covering markets',
    specialAbility: 'Move markets with stories',
    risks: ['Defamation suits', 'Losing credibility'],
  },
  sec_investigator: {
    role: 'sec_investigator',
    displayName: 'SEC Investigator',
    startingCapital: 100_000,
    maxLeverage: 1,
    description: 'Government regulator catching fraudsters',
    specialAbility: 'Subpoena power, can freeze assets',
    risks: ['Corruption', 'Political pressure'],
  },
  whistleblower: {
    role: 'whistleblower',
    displayName: 'Whistleblower',
    startingCapital: 25_000,
    maxLeverage: 1,
    description: 'Insider exposing corporate wrongdoing',
    specialAbility: 'Can expose fraud for rewards',
    risks: ['Retaliation', 'Being wrong'],
  },
  quant: {
    role: 'quant',
    displayName: 'Quant',
    startingCapital: 50_000_000,
    maxLeverage: 5,
    description: 'Algorithmic trader using mathematical models',
    specialAbility: 'High-frequency trading, pattern detection',
    risks: ['Model blowup', 'Flash crash liability'],
  },
  influencer: {
    role: 'influencer',
    displayName: 'Influencer',
    startingCapital: 100_000,
    maxLeverage: 2,
    description: 'Social media personality with large following',
    specialAbility: 'Pump and dump coordination',
    risks: ['Platform ban', 'Fraud charges'],
  },
};

// Sector configurations
export const SECTOR_CONFIGS: Record<Sector, SectorConfig> = {
  Technology: {
    sector: 'Technology',
    displayName: 'Technology',
    baseVolatility: 0.025,
    marketCorrelation: 1.2,
    description: 'Software, hardware, and digital services',
  },
  Finance: {
    sector: 'Finance',
    displayName: 'Finance',
    baseVolatility: 0.018,
    marketCorrelation: 1.1,
    description: 'Banks, insurance, and financial services',
  },
  Healthcare: {
    sector: 'Healthcare',
    displayName: 'Healthcare',
    baseVolatility: 0.020,
    marketCorrelation: 0.9,
    description: 'Pharmaceuticals, biotech, and medical devices',
  },
  Energy: {
    sector: 'Energy',
    displayName: 'Energy',
    baseVolatility: 0.030,
    marketCorrelation: 1.3,
    description: 'Oil, gas, and renewable energy',
  },
  Consumer: {
    sector: 'Consumer',
    displayName: 'Consumer',
    baseVolatility: 0.015,
    marketCorrelation: 0.95,
    description: 'Retail, food, and consumer products',
  },
  Industrial: {
    sector: 'Industrial',
    displayName: 'Industrial',
    baseVolatility: 0.018,
    marketCorrelation: 1.0,
    description: 'Manufacturing, aerospace, and defense',
  },
  RealEstate: {
    sector: 'RealEstate',
    displayName: 'Real Estate',
    baseVolatility: 0.022,
    marketCorrelation: 0.8,
    description: 'REITs and property development',
  },
  Utilities: {
    sector: 'Utilities',
    displayName: 'Utilities',
    baseVolatility: 0.012,
    marketCorrelation: 0.5,
    description: 'Electric, gas, and water services',
  },
  Crypto: {
    sector: 'Crypto',
    displayName: 'Crypto',
    baseVolatility: 0.050,
    marketCorrelation: 0.3,
    description: 'Cryptocurrency and blockchain companies',
  },
  Meme: {
    sector: 'Meme',
    displayName: 'Meme Stocks',
    baseVolatility: 0.080,
    marketCorrelation: 0.2,
    description: 'Viral, community-driven stocks',
  },
};

// Company name generators
export const COMPANY_PREFIXES = [
  'Apex', 'Quantum', 'Nova', 'Titan', 'Omega', 'Alpha', 'Nexus', 'Vertex',
  'Zenith', 'Atlas', 'Cypher', 'Helix', 'Prism', 'Vector', 'Axiom', 'Cipher',
  'Delta', 'Echo', 'Flux', 'Ionic', 'Pulse', 'Surge', 'Vortex', 'Zephyr',
  'Cobalt', 'Crimson', 'Emerald', 'Obsidian', 'Onyx', 'Sapphire', 'Sterling',
  'Shadow', 'Phoenix', 'Dragon', 'Eagle', 'Falcon', 'Hawk', 'Raven', 'Wolf',
  'Nimbus', 'Stratos', 'Terra', 'Aqua', 'Pyro', 'Electra', 'Magna', 'Ultra',
];

export const SECTOR_SUFFIXES: Record<Sector, string[]> = {
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

export const SECTOR_INDUSTRIES: Record<Sector, string[]> = {
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

// Sector distribution for company generation
export const SECTOR_DISTRIBUTION: Record<Sector, number> = {
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
