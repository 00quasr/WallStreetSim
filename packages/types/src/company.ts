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

export interface Company {
  id: string;
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
  sharesOutstanding: number;
  marketCap: number;
  revenue: number;
  profit: number;
  cash: number;
  debt: number;
  peRatio: number;

  // Volatility & behavior
  volatility: number;
  beta: number;
  momentum: number;

  // Agent-driven metrics
  sentiment: number;
  manipulationScore: number;

  // Ownership
  ceoAgentId?: string;
  isPublic: boolean;
  ipoTick?: number;

  // Timestamps
  createdAt: Date;
}

export interface CompanyState {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  volume: number;
  high: number;
  low: number;
  marketCap: number;
}

export interface SectorData {
  sector: Sector;
  performance: number;
  volatility: number;
  correlation: number;
}

export interface SectorConfig {
  sector: Sector;
  displayName: string;
  baseVolatility: number;
  marketCorrelation: number;
  description: string;
}
