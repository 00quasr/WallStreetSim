/**
 * Sentiment analysis for rumor content
 *
 * Uses a financial lexicon-based approach to analyze sentiment of rumor text.
 * Returns a score between -1 (very negative) and 1 (very positive).
 */

// Financial and market-specific positive words
const POSITIVE_WORDS = new Set([
  // Growth & Performance
  'surge', 'surges', 'surging', 'soar', 'soars', 'soaring', 'rally', 'rallies', 'rallying',
  'gain', 'gains', 'gaining', 'rise', 'rises', 'rising', 'jump', 'jumps', 'jumping',
  'spike', 'spikes', 'spiking', 'boom', 'booms', 'booming', 'skyrocket', 'skyrockets',
  'climb', 'climbs', 'climbing', 'advance', 'advances', 'advancing',
  // Positive outcomes
  'profit', 'profits', 'profitable', 'profitability', 'growth', 'grow', 'grows', 'growing',
  'success', 'successful', 'succeed', 'succeeds', 'win', 'wins', 'winning', 'winner',
  'breakthrough', 'breakthroughs', 'innovation', 'innovative', 'revolutionize',
  'outperform', 'outperforms', 'outperforming', 'beat', 'beats', 'beating', 'exceed', 'exceeds',
  // Business actions
  'acquire', 'acquires', 'acquisition', 'merger', 'partnership', 'partnership', 'deal', 'deals',
  'expand', 'expands', 'expansion', 'launch', 'launches', 'launching', 'upgrade', 'upgrades',
  'buyback', 'dividend', 'dividends', 'increase', 'increases', 'increasing',
  // Positive sentiment
  'bullish', 'optimistic', 'confident', 'strong', 'stronger', 'strongest', 'robust',
  'excellent', 'outstanding', 'impressive', 'remarkable', 'record', 'best', 'better',
  'positive', 'favorable', 'upbeat', 'promising', 'exciting', 'thriving',
  // Approval & endorsement
  'approve', 'approves', 'approved', 'approval', 'recommend', 'recommends', 'recommended',
  'upgrade', 'upgrades', 'upgraded', 'boost', 'boosts', 'boosting', 'boosted',
]);

// Financial and market-specific negative words
const NEGATIVE_WORDS = new Set([
  // Decline & Loss
  'crash', 'crashes', 'crashing', 'plunge', 'plunges', 'plunging', 'tumble', 'tumbles',
  'drop', 'drops', 'dropping', 'fall', 'falls', 'falling', 'decline', 'declines', 'declining',
  'sink', 'sinks', 'sinking', 'slump', 'slumps', 'slumping', 'collapse', 'collapses',
  'tank', 'tanks', 'tanking', 'plummet', 'plummets', 'plummeting', 'dive', 'dives', 'diving',
  // Negative outcomes
  'loss', 'losses', 'lose', 'loses', 'losing', 'loser', 'fail', 'fails', 'failing', 'failure',
  'bankrupt', 'bankruptcy', 'insolvent', 'default', 'defaults', 'defaulting',
  'miss', 'misses', 'missing', 'missed', 'underperform', 'underperforms', 'underperforming',
  // Problems & Issues
  'scandal', 'scandals', 'fraud', 'fraudulent', 'illegal', 'investigation', 'investigate',
  'lawsuit', 'lawsuits', 'sue', 'sues', 'suing', 'sued', 'fine', 'fines', 'fined', 'penalty',
  'recall', 'recalls', 'recalled', 'defect', 'defects', 'defective', 'bug', 'bugs',
  'hack', 'hacked', 'hacking', 'breach', 'breaches', 'breached', 'leak', 'leaks', 'leaked',
  // Negative sentiment
  'bearish', 'pessimistic', 'worried', 'worry', 'worries', 'concern', 'concerns', 'concerned',
  'weak', 'weaker', 'weakest', 'poor', 'poorer', 'poorest', 'bad', 'worse', 'worst',
  'negative', 'unfavorable', 'disappointing', 'disappointed', 'disappoints', 'terrible',
  'crisis', 'crises', 'trouble', 'troubles', 'troubled', 'problem', 'problems', 'problematic',
  // Business actions (negative)
  'layoff', 'layoffs', 'fire', 'fires', 'fired', 'firing', 'cut', 'cuts', 'cutting',
  'downgrade', 'downgrades', 'downgraded', 'sell', 'sells', 'selling', 'dump', 'dumps', 'dumping',
  'warning', 'warn', 'warns', 'warned', 'alert', 'alerts', 'risk', 'risks', 'risky',
  'delay', 'delays', 'delayed', 'postpone', 'postpones', 'postponed', 'cancel', 'cancels', 'cancelled',
  // Regulatory & legal
  'violation', 'violations', 'violate', 'violates', 'sec', 'ftc', 'antitrust', 'regulate',
  'subpoena', 'indictment', 'arrest', 'arrested', 'criminal', 'guilty', 'convicted',
]);

// Words that intensify sentiment
const INTENSIFIERS = new Set([
  'very', 'extremely', 'highly', 'incredibly', 'absolutely', 'completely', 'totally',
  'massive', 'huge', 'enormous', 'significant', 'substantially', 'dramatically',
  'major', 'severe', 'serious', 'critical', 'urgent', 'shocking', 'stunning',
]);

// Negation words that flip sentiment
const NEGATIONS = new Set([
  'not', 'no', 'never', 'neither', 'nobody', 'nothing', 'nowhere', 'none',
  'without', 'barely', 'hardly', 'scarcely', 'rarely', 'seldom',
  "don't", "doesn't", "didn't", "won't", "wouldn't", "couldn't", "shouldn't",
  "isn't", "aren't", "wasn't", "weren't", "haven't", "hasn't", "hadn't",
]);

export interface SentimentResult {
  /** Overall sentiment score from -1 (very negative) to 1 (very positive) */
  score: number;
  /** Normalized score as a string with 4 decimal places for database storage */
  scoreString: string;
  /** Number of positive words found */
  positiveCount: number;
  /** Number of negative words found */
  negativeCount: number;
  /** Sentiment label: 'positive', 'negative', or 'neutral' */
  label: 'positive' | 'negative' | 'neutral';
  /** Confidence level from 0 to 1 based on word matches */
  confidence: number;
}

/**
 * Tokenize text into lowercase words
 */
function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter(word => word.length > 1);
}

/**
 * Analyze sentiment of text content
 *
 * @param text - The text to analyze
 * @returns Sentiment analysis result
 */
export function analyzeSentiment(text: string): SentimentResult {
  const words = tokenize(text);

  if (words.length === 0) {
    return {
      score: 0,
      scoreString: '0.0000',
      positiveCount: 0,
      negativeCount: 0,
      label: 'neutral',
      confidence: 0,
    };
  }

  let positiveCount = 0;
  let negativeCount = 0;
  let score = 0;
  let isNegated = false;
  let intensifierMultiplier = 1;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];

    // Check for negation (affects next sentiment word)
    if (NEGATIONS.has(word)) {
      isNegated = true;
      continue;
    }

    // Check for intensifiers (affects next sentiment word)
    if (INTENSIFIERS.has(word)) {
      intensifierMultiplier = 1.5;
      continue;
    }

    // Calculate sentiment contribution
    let wordScore = 0;

    if (POSITIVE_WORDS.has(word)) {
      wordScore = 1 * intensifierMultiplier;
      if (isNegated) {
        wordScore = -wordScore * 0.5; // Negated positive becomes weakly negative
        negativeCount++;
      } else {
        positiveCount++;
      }
    } else if (NEGATIVE_WORDS.has(word)) {
      wordScore = -1 * intensifierMultiplier;
      if (isNegated) {
        wordScore = -wordScore * 0.5; // Negated negative becomes weakly positive
        positiveCount++;
      } else {
        negativeCount++;
      }
    }

    score += wordScore;

    // Reset modifiers after sentiment word
    if (wordScore !== 0) {
      isNegated = false;
      intensifierMultiplier = 1;
    }
  }

  // Calculate total sentiment words for confidence
  const totalSentimentWords = positiveCount + negativeCount;

  // Normalize score to [-1, 1] range
  // Use word count as denominator with a minimum to avoid extreme scores
  const normalizer = Math.max(totalSentimentWords, 3);
  const normalizedScore = Math.max(-1, Math.min(1, score / normalizer));

  // Round to 4 decimal places
  const roundedScore = Math.round(normalizedScore * 10000) / 10000;

  // Determine label
  let label: 'positive' | 'negative' | 'neutral';
  if (roundedScore > 0.1) {
    label = 'positive';
  } else if (roundedScore < -0.1) {
    label = 'negative';
  } else {
    label = 'neutral';
  }

  // Calculate confidence based on sentiment word density
  const confidence = Math.min(1, totalSentimentWords / Math.max(words.length * 0.3, 1));
  const roundedConfidence = Math.round(confidence * 100) / 100;

  return {
    score: roundedScore,
    scoreString: roundedScore.toFixed(4),
    positiveCount,
    negativeCount,
    label,
    confidence: roundedConfidence,
  };
}

/**
 * Get a simple sentiment score for text
 *
 * @param text - The text to analyze
 * @returns Sentiment score from -1 to 1
 */
export function getSentimentScore(text: string): number {
  return analyzeSentiment(text).score;
}

/**
 * Get sentiment score as a string for database storage
 *
 * @param text - The text to analyze
 * @returns Sentiment score as string with 4 decimal places
 */
export function getSentimentScoreString(text: string): string {
  return analyzeSentiment(text).scoreString;
}

/**
 * Configuration for rumor impact calculation
 */
export interface RumorImpactConfig {
  /** Base impact multiplier (default: 0.03 = 3% max base impact) */
  baseMultiplier?: number;
  /** Duration of the rumor effect in ticks (default: 10) */
  duration?: number;
  /** Minimum confidence required for impact (default: 0.2) */
  minConfidence?: number;
}

/**
 * Result of rumor impact calculation
 */
export interface RumorImpactResult {
  /** Price impact from -0.05 to 0.05 (±5%) */
  impact: number;
  /** Duration of the effect in ticks */
  duration: number;
  /** Sentiment analysis result */
  sentiment: SentimentResult;
}

/**
 * Calculate the price impact of a rumor based on its sentiment
 *
 * The impact is calculated as:
 * - Sentiment score (-1 to 1) determines direction
 * - Confidence determines magnitude
 * - Base multiplier scales the overall effect
 *
 * @param text - The rumor text content
 * @param config - Optional configuration for impact calculation
 * @returns Rumor impact result with impact value and duration
 */
export function calculateRumorImpact(
  text: string,
  config: RumorImpactConfig = {}
): RumorImpactResult {
  const {
    baseMultiplier = 0.03,
    duration = 10,
    minConfidence = 0.2,
  } = config;

  const sentiment = analyzeSentiment(text);

  // If confidence is too low, reduce impact significantly
  const confidenceMultiplier = sentiment.confidence >= minConfidence
    ? 0.5 + (sentiment.confidence * 0.5) // 0.5 to 1.0 based on confidence
    : sentiment.confidence / minConfidence * 0.3; // 0 to 0.3 for low confidence

  // Calculate impact: sentiment score * base multiplier * confidence
  // Clamp to ±5% maximum impact
  const rawImpact = sentiment.score * baseMultiplier * confidenceMultiplier;
  const impact = Math.max(-0.05, Math.min(0.05, rawImpact));

  // Round to 4 decimal places
  const roundedImpact = Math.round(impact * 10000) / 10000;

  return {
    impact: roundedImpact,
    duration,
    sentiment,
  };
}
