import { describe, it, expect } from 'vitest';
import {
  analyzeSentiment,
  getSentimentScore,
  getSentimentScoreString,
  calculateRumorImpact,
} from './sentiment';

describe('Sentiment Analysis', () => {
  describe('analyzeSentiment', () => {
    it('should return neutral sentiment for empty text', () => {
      const result = analyzeSentiment('');
      expect(result.score).toBe(0);
      expect(result.label).toBe('neutral');
      expect(result.confidence).toBe(0);
    });

    it('should detect positive sentiment in bullish rumor', () => {
      const result = analyzeSentiment('Company is about to announce massive profits and growth');
      expect(result.score).toBeGreaterThan(0);
      expect(result.label).toBe('positive');
      expect(result.positiveCount).toBeGreaterThan(0);
    });

    it('should detect negative sentiment in bearish rumor', () => {
      const result = analyzeSentiment('Stock is crashing due to massive fraud scandal');
      expect(result.score).toBeLessThan(0);
      expect(result.label).toBe('negative');
      expect(result.negativeCount).toBeGreaterThan(0);
    });

    it('should handle mixed sentiment', () => {
      const result = analyzeSentiment('Company profits are growing but facing lawsuit');
      expect(result.positiveCount).toBeGreaterThan(0);
      expect(result.negativeCount).toBeGreaterThan(0);
    });

    it('should handle negation correctly', () => {
      // "not failing" should be weakly positive
      const negativeNegated = analyzeSentiment('Company is not failing');
      expect(negativeNegated.score).toBeGreaterThan(0);

      // "not profitable" should be weakly negative
      const positiveNegated = analyzeSentiment('Company is not profitable');
      expect(positiveNegated.score).toBeLessThan(0);
    });

    it('should handle intensifiers correctly', () => {
      const normal = analyzeSentiment('Stock is surging');
      const intensified = analyzeSentiment('Stock is extremely surging');
      expect(intensified.score).toBeGreaterThan(normal.score);
    });

    it('should return score in valid range [-1, 1]', () => {
      // Very positive text
      const positive = analyzeSentiment('Massive surge rally boom skyrocket profits growth winning');
      expect(positive.score).toBeGreaterThanOrEqual(-1);
      expect(positive.score).toBeLessThanOrEqual(1);

      // Very negative text
      const negative = analyzeSentiment('Crash plunge scandal fraud bankruptcy loss failure collapse');
      expect(negative.score).toBeGreaterThanOrEqual(-1);
      expect(negative.score).toBeLessThanOrEqual(1);
    });

    it('should return scoreString with 4 decimal places', () => {
      const result = analyzeSentiment('Stock is surging with profits');
      expect(result.scoreString).toMatch(/^-?\d+\.\d{4}$/);
    });

    it('should detect financial-specific terms', () => {
      // Bullish/Bearish
      expect(analyzeSentiment('Analysts are bullish').label).toBe('positive');
      expect(analyzeSentiment('Analysts are bearish').label).toBe('negative');

      // Upgrade/Downgrade
      expect(analyzeSentiment('Rating upgraded').label).toBe('positive');
      expect(analyzeSentiment('Rating downgraded').label).toBe('negative');

      // SEC related
      expect(analyzeSentiment('SEC investigation').score).toBeLessThan(0);
    });

    it('should handle realistic rumor examples', () => {
      // Positive rumors
      const acquisition = analyzeSentiment('BREAKING: Apple secretly acquiring Tesla in massive deal');
      expect(acquisition.score).toBeGreaterThan(0);

      const earnings = analyzeSentiment('Insider says company will beat earnings estimates significantly');
      expect(earnings.score).toBeGreaterThan(0);

      // Negative rumors
      const scandal = analyzeSentiment('CEO caught in fraud scandal, SEC investigation imminent');
      expect(scandal.score).toBeLessThan(0);

      const recall = analyzeSentiment('Massive product recall expected due to safety defects');
      expect(recall.score).toBeLessThan(0);
    });

    it('should calculate confidence based on sentiment word density', () => {
      // High confidence - many sentiment words
      const highConfidence = analyzeSentiment('surge rally growth profits winning success boom');
      expect(highConfidence.confidence).toBeGreaterThan(0.5);

      // Lower confidence - fewer sentiment words
      const lowConfidence = analyzeSentiment('the company reported results today');
      expect(lowConfidence.confidence).toBeLessThan(0.5);
    });
  });

  describe('getSentimentScore', () => {
    it('should return numeric score', () => {
      const score = getSentimentScore('Stock is surging');
      expect(typeof score).toBe('number');
      expect(score).toBeGreaterThan(0);
    });

    it('should return 0 for neutral text', () => {
      const score = getSentimentScore('the meeting is scheduled');
      expect(score).toBe(0);
    });
  });

  describe('getSentimentScoreString', () => {
    it('should return string with 4 decimal places', () => {
      const scoreString = getSentimentScoreString('Stock is crashing badly');
      expect(typeof scoreString).toBe('string');
      expect(scoreString).toMatch(/^-?\d+\.\d{4}$/);
    });

    it('should return "0.0000" for empty text', () => {
      const scoreString = getSentimentScoreString('');
      expect(scoreString).toBe('0.0000');
    });

    it('should be suitable for database storage', () => {
      // Test that values can be converted back to numbers
      const scoreString = getSentimentScoreString('Major breakthrough announcement');
      const numericValue = parseFloat(scoreString);
      expect(Number.isFinite(numericValue)).toBe(true);
      expect(numericValue).toBeGreaterThanOrEqual(-1);
      expect(numericValue).toBeLessThanOrEqual(1);
    });
  });

  describe('edge cases', () => {
    it('should handle text with only punctuation', () => {
      const result = analyzeSentiment('!!! ??? ...');
      expect(result.score).toBe(0);
      expect(result.label).toBe('neutral');
    });

    it('should handle text with numbers', () => {
      const result = analyzeSentiment('Stock up 500% massive gains');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should handle contractions in negations', () => {
      const result = analyzeSentiment("Company isn't failing");
      expect(result.score).toBeGreaterThan(0);
    });

    it('should handle uppercase text', () => {
      const result = analyzeSentiment('STOCK IS CRASHING HARD');
      expect(result.score).toBeLessThan(0);
    });

    it('should handle multiple negations', () => {
      // Double negation - "not never" scenarios are complex
      // Our simple approach handles single negation affecting next word
      const result = analyzeSentiment('The stock is not bad');
      expect(result.score).toBeGreaterThan(0);
    });

    it('should handle very long text', () => {
      const longText = 'Company profits '.repeat(100) + 'crash scandal fraud';
      const result = analyzeSentiment(longText);
      expect(result.score).toBeGreaterThanOrEqual(-1);
      expect(result.score).toBeLessThanOrEqual(1);
    });
  });

  describe('calculateRumorImpact', () => {
    it('should return positive impact for positive rumors', () => {
      const result = calculateRumorImpact('Company is about to announce massive profits and growth');
      expect(result.impact).toBeGreaterThan(0);
      expect(result.sentiment.label).toBe('positive');
    });

    it('should return negative impact for negative rumors', () => {
      const result = calculateRumorImpact('Stock is crashing due to massive fraud scandal');
      expect(result.impact).toBeLessThan(0);
      expect(result.sentiment.label).toBe('negative');
    });

    it('should return zero impact for neutral text', () => {
      const result = calculateRumorImpact('the meeting is scheduled for tomorrow');
      expect(result.impact).toBe(0);
      expect(result.sentiment.label).toBe('neutral');
    });

    it('should clamp impact to ±5%', () => {
      // Very positive text
      const positive = calculateRumorImpact('Massive surge rally boom skyrocket profits growth winning success excellent');
      expect(positive.impact).toBeLessThanOrEqual(0.05);
      expect(positive.impact).toBeGreaterThanOrEqual(-0.05);

      // Very negative text
      const negative = calculateRumorImpact('Crash plunge scandal fraud bankruptcy loss failure collapse terrible');
      expect(negative.impact).toBeLessThanOrEqual(0.05);
      expect(negative.impact).toBeGreaterThanOrEqual(-0.05);
    });

    it('should use default duration of 10 ticks', () => {
      const result = calculateRumorImpact('Stock is surging');
      expect(result.duration).toBe(10);
    });

    it('should allow custom duration', () => {
      const result = calculateRumorImpact('Stock is surging', { duration: 20 });
      expect(result.duration).toBe(20);
    });

    it('should reduce impact for low confidence text', () => {
      // Text with fewer sentiment words has lower confidence
      const lowConfidence = calculateRumorImpact('something about profits maybe');
      const highConfidence = calculateRumorImpact('massive surge in profits growth rally winning');

      // High confidence rumor should have more impact
      expect(Math.abs(highConfidence.impact)).toBeGreaterThan(Math.abs(lowConfidence.impact));
    });

    it('should return sentiment result in the output', () => {
      const result = calculateRumorImpact('Company profits are growing');
      expect(result.sentiment).toBeDefined();
      expect(result.sentiment.score).toBeGreaterThan(0);
      expect(result.sentiment.scoreString).toMatch(/^-?\d+\.\d{4}$/);
    });

    it('should handle realistic rumor scenarios', () => {
      // Acquisition rumor - positive
      const acquisition = calculateRumorImpact('BREAKING: Apple secretly acquiring Tesla in massive deal');
      expect(acquisition.impact).toBeGreaterThan(0);

      // Fraud scandal - negative
      const scandal = calculateRumorImpact('CEO caught in massive fraud scandal, SEC investigation imminent');
      expect(scandal.impact).toBeLessThan(0);

      // Product recall - negative
      const recall = calculateRumorImpact('Massive product recall expected due to critical safety defects');
      expect(recall.impact).toBeLessThan(0);

      // Earnings beat - positive
      const earnings = calculateRumorImpact('Insider says company will significantly beat earnings estimates');
      expect(earnings.impact).toBeGreaterThan(0);
    });

    it('should allow custom baseMultiplier', () => {
      const defaultResult = calculateRumorImpact('Stock is surging massively');
      const customResult = calculateRumorImpact('Stock is surging massively', { baseMultiplier: 0.06 });

      // With higher baseMultiplier, impact should be larger
      expect(Math.abs(customResult.impact)).toBeGreaterThan(Math.abs(defaultResult.impact));
    });

    it('should handle empty text', () => {
      const result = calculateRumorImpact('');
      expect(result.impact).toBe(0);
      expect(result.sentiment.score).toBe(0);
    });
  });
});
