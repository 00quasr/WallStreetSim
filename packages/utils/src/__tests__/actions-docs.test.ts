/**
 * Tests to verify the actions.md documentation matches the actual codebase.
 * This ensures the documentation stays accurate as the code evolves.
 */

import { describe, it, expect } from 'vitest';
import {
  AgentActionTypeSchema,
  TradeActionSchema,
  CancelOrderActionSchema,
  RumorActionSchema,
  AllyActionSchema,
  AllyAcceptActionSchema,
  AllyRejectActionSchema,
  AllyDissolveActionSchema,
  MessageActionSchema,
  BribeActionSchema,
  WhistleblowActionSchema,
  FleeActionSchema,
  AgentActionSchema,
  SubmitActionsSchema,
} from '../validation';

describe('Actions Documentation Accuracy', () => {
  describe('Action Types', () => {
    it('documents all action types from AgentActionTypeSchema', () => {
      // These are the action types documented in actions.md
      const documentedTypes = [
        'BUY',
        'SELL',
        'SHORT',
        'COVER',
        'CANCEL_ORDER',
        'RUMOR',
        'ALLY',
        'ALLY_ACCEPT',
        'ALLY_REJECT',
        'ALLY_DISSOLVE',
        'MESSAGE',
        'BRIBE',
        'WHISTLEBLOW',
        'FLEE',
      ];

      // Get actual types from schema
      const actualTypes = AgentActionTypeSchema.options;

      // Every documented type should exist in the schema
      for (const docType of documentedTypes) {
        expect(actualTypes).toContain(docType);
      }

      // Every schema type should be documented
      for (const schemaType of actualTypes) {
        expect(documentedTypes).toContain(schemaType);
      }
    });
  });

  describe('Trading Actions', () => {
    describe('BUY/SELL/SHORT/COVER', () => {
      it('validates documented parameters', () => {
        // Valid BUY action as documented
        const validBuy = {
          type: 'BUY',
          symbol: 'AAPL',
          quantity: 100,
          orderType: 'LIMIT',
          price: 150.0,
        };
        expect(TradeActionSchema.safeParse(validBuy).success).toBe(true);

        // Market order without price (documented as optional for MARKET)
        const marketOrder = {
          type: 'SELL',
          symbol: 'AAPL',
          quantity: 50,
        };
        expect(TradeActionSchema.safeParse(marketOrder).success).toBe(true);
      });

      it('validates symbol constraints (1-10 uppercase letters)', () => {
        // Valid symbol
        expect(
          TradeActionSchema.safeParse({
            type: 'BUY',
            symbol: 'AAPL',
            quantity: 100,
          }).success
        ).toBe(true);

        // Invalid - lowercase
        expect(
          TradeActionSchema.safeParse({
            type: 'BUY',
            symbol: 'aapl',
            quantity: 100,
          }).success
        ).toBe(false);

        // Invalid - too long
        expect(
          TradeActionSchema.safeParse({
            type: 'BUY',
            symbol: 'TOOLONGSYMBOL',
            quantity: 100,
          }).success
        ).toBe(false);
      });

      it('validates quantity constraints (1 - 1,000,000)', () => {
        // Valid quantities
        expect(
          TradeActionSchema.safeParse({
            type: 'BUY',
            symbol: 'AAPL',
            quantity: 1,
          }).success
        ).toBe(true);

        expect(
          TradeActionSchema.safeParse({
            type: 'BUY',
            symbol: 'AAPL',
            quantity: 1000000,
          }).success
        ).toBe(true);

        // Invalid - zero
        expect(
          TradeActionSchema.safeParse({
            type: 'BUY',
            symbol: 'AAPL',
            quantity: 0,
          }).success
        ).toBe(false);

        // Invalid - exceeds max
        expect(
          TradeActionSchema.safeParse({
            type: 'BUY',
            symbol: 'AAPL',
            quantity: 1000001,
          }).success
        ).toBe(false);
      });

      it('validates orderType options', () => {
        const orderTypes = ['MARKET', 'LIMIT', 'STOP'];
        for (const orderType of orderTypes) {
          expect(
            TradeActionSchema.safeParse({
              type: 'BUY',
              symbol: 'AAPL',
              quantity: 100,
              orderType,
              price: orderType !== 'MARKET' ? 150.0 : undefined,
            }).success
          ).toBe(true);
        }
      });
    });

    describe('CANCEL_ORDER', () => {
      it('validates documented parameters', () => {
        const validCancel = {
          type: 'CANCEL_ORDER',
          orderId: '550e8400-e29b-41d4-a716-446655440000',
        };
        expect(CancelOrderActionSchema.safeParse(validCancel).success).toBe(true);
      });

      it('requires valid UUID for orderId', () => {
        expect(
          CancelOrderActionSchema.safeParse({
            type: 'CANCEL_ORDER',
            orderId: 'not-a-uuid',
          }).success
        ).toBe(false);
      });
    });
  });

  describe('Market Manipulation', () => {
    describe('RUMOR', () => {
      it('validates documented parameters', () => {
        const validRumor = {
          type: 'RUMOR',
          targetSymbol: 'TSLA',
          content: 'Insider sources say TSLA is about to announce major partnership',
        };
        expect(RumorActionSchema.safeParse(validRumor).success).toBe(true);
      });

      it('validates content length (10-280 characters)', () => {
        // Too short
        expect(
          RumorActionSchema.safeParse({
            type: 'RUMOR',
            targetSymbol: 'TSLA',
            content: 'Short',
          }).success
        ).toBe(false);

        // Valid minimum
        expect(
          RumorActionSchema.safeParse({
            type: 'RUMOR',
            targetSymbol: 'TSLA',
            content: 'This is ok',
          }).success
        ).toBe(true);

        // Too long
        expect(
          RumorActionSchema.safeParse({
            type: 'RUMOR',
            targetSymbol: 'TSLA',
            content: 'x'.repeat(281),
          }).success
        ).toBe(false);

        // Valid max
        expect(
          RumorActionSchema.safeParse({
            type: 'RUMOR',
            targetSymbol: 'TSLA',
            content: 'x'.repeat(280),
          }).success
        ).toBe(true);
      });
    });
  });

  describe('Communication', () => {
    describe('MESSAGE', () => {
      it('validates documented parameters', () => {
        const validMessage = {
          type: 'MESSAGE',
          targetAgent: '550e8400-e29b-41d4-a716-446655440000',
          content: 'Want to coordinate on the AAPL trade?',
        };
        expect(MessageActionSchema.safeParse(validMessage).success).toBe(true);
      });

      it('validates content length (1-500 characters)', () => {
        // Empty content
        expect(
          MessageActionSchema.safeParse({
            type: 'MESSAGE',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            content: '',
          }).success
        ).toBe(false);

        // Valid minimum
        expect(
          MessageActionSchema.safeParse({
            type: 'MESSAGE',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            content: 'H',
          }).success
        ).toBe(true);

        // Too long
        expect(
          MessageActionSchema.safeParse({
            type: 'MESSAGE',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            content: 'x'.repeat(501),
          }).success
        ).toBe(false);
      });
    });
  });

  describe('Alliance Actions', () => {
    describe('ALLY', () => {
      it('validates documented parameters', () => {
        const validAlly = {
          type: 'ALLY',
          targetAgent: '550e8400-e29b-41d4-a716-446655440000',
          proposal: 'Let us coordinate trades',
          profitSharePercent: 20,
        };
        expect(AllyActionSchema.safeParse(validAlly).success).toBe(true);
      });

      it('validates proposal length (10-500 characters)', () => {
        // Too short
        expect(
          AllyActionSchema.safeParse({
            type: 'ALLY',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            proposal: 'Short',
          }).success
        ).toBe(false);

        // Valid
        expect(
          AllyActionSchema.safeParse({
            type: 'ALLY',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            proposal: 'Let us coordinate on trades',
          }).success
        ).toBe(true);
      });

      it('validates profitSharePercent (0-100, optional)', () => {
        // Default (0)
        const withoutProfit = AllyActionSchema.safeParse({
          type: 'ALLY',
          targetAgent: '550e8400-e29b-41d4-a716-446655440000',
          proposal: 'Let us coordinate trades',
        });
        expect(withoutProfit.success).toBe(true);

        // Valid range
        expect(
          AllyActionSchema.safeParse({
            type: 'ALLY',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            proposal: 'Let us coordinate trades',
            profitSharePercent: 0,
          }).success
        ).toBe(true);

        expect(
          AllyActionSchema.safeParse({
            type: 'ALLY',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            proposal: 'Let us coordinate trades',
            profitSharePercent: 100,
          }).success
        ).toBe(true);

        // Out of range
        expect(
          AllyActionSchema.safeParse({
            type: 'ALLY',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            proposal: 'Let us coordinate trades',
            profitSharePercent: 101,
          }).success
        ).toBe(false);
      });
    });

    describe('ALLY_ACCEPT', () => {
      it('validates documented parameters', () => {
        const validAccept = {
          type: 'ALLY_ACCEPT',
          allianceId: '550e8400-e29b-41d4-a716-446655440000',
        };
        expect(AllyAcceptActionSchema.safeParse(validAccept).success).toBe(true);
      });
    });

    describe('ALLY_REJECT', () => {
      it('validates documented parameters', () => {
        const validReject = {
          type: 'ALLY_REJECT',
          allianceId: '550e8400-e29b-41d4-a716-446655440000',
          reason: 'Our trading strategies are incompatible',
        };
        expect(AllyRejectActionSchema.safeParse(validReject).success).toBe(true);
      });

      it('validates reason is optional (1-200 characters)', () => {
        // Without reason
        expect(
          AllyRejectActionSchema.safeParse({
            type: 'ALLY_REJECT',
            allianceId: '550e8400-e29b-41d4-a716-446655440000',
          }).success
        ).toBe(true);

        // Too long
        expect(
          AllyRejectActionSchema.safeParse({
            type: 'ALLY_REJECT',
            allianceId: '550e8400-e29b-41d4-a716-446655440000',
            reason: 'x'.repeat(201),
          }).success
        ).toBe(false);
      });
    });

    describe('ALLY_DISSOLVE', () => {
      it('validates documented parameters', () => {
        const validDissolve = {
          type: 'ALLY_DISSOLVE',
          reason: 'Partnership is no longer beneficial',
        };
        expect(AllyDissolveActionSchema.safeParse(validDissolve).success).toBe(true);
      });

      it('validates reason is optional', () => {
        expect(
          AllyDissolveActionSchema.safeParse({
            type: 'ALLY_DISSOLVE',
          }).success
        ).toBe(true);
      });
    });
  });

  describe('Illegal/Risky Actions', () => {
    describe('BRIBE', () => {
      it('validates documented parameters', () => {
        const validBribe = {
          type: 'BRIBE',
          targetAgent: '550e8400-e29b-41d4-a716-446655440000',
          amount: 50000,
        };
        expect(BribeActionSchema.safeParse(validBribe).success).toBe(true);
      });

      it('validates amount is positive', () => {
        expect(
          BribeActionSchema.safeParse({
            type: 'BRIBE',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            amount: 0,
          }).success
        ).toBe(false);

        expect(
          BribeActionSchema.safeParse({
            type: 'BRIBE',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            amount: -100,
          }).success
        ).toBe(false);
      });
    });

    describe('WHISTLEBLOW', () => {
      it('validates documented parameters', () => {
        const validWhistleblow = {
          type: 'WHISTLEBLOW',
          targetAgent: '550e8400-e29b-41d4-a716-446655440000',
          evidence: 'Agent has been coordinating pump-and-dump schemes',
        };
        expect(WhistleblowActionSchema.safeParse(validWhistleblow).success).toBe(true);
      });

      it('validates evidence length (20-1000 characters)', () => {
        // Too short
        expect(
          WhistleblowActionSchema.safeParse({
            type: 'WHISTLEBLOW',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            evidence: 'Short evidence',
          }).success
        ).toBe(false);

        // Valid minimum (20 chars)
        expect(
          WhistleblowActionSchema.safeParse({
            type: 'WHISTLEBLOW',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            evidence: 'Evidence of length 20',
          }).success
        ).toBe(true);

        // Too long
        expect(
          WhistleblowActionSchema.safeParse({
            type: 'WHISTLEBLOW',
            targetAgent: '550e8400-e29b-41d4-a716-446655440000',
            evidence: 'x'.repeat(1001),
          }).success
        ).toBe(false);
      });
    });

    describe('FLEE', () => {
      it('validates documented parameters', () => {
        const validFlee = {
          type: 'FLEE',
          destination: 'Cayman Islands',
        };
        expect(FleeActionSchema.safeParse(validFlee).success).toBe(true);
      });

      it('validates destination length (2-50 characters)', () => {
        // Too short
        expect(
          FleeActionSchema.safeParse({
            type: 'FLEE',
            destination: 'X',
          }).success
        ).toBe(false);

        // Valid
        expect(
          FleeActionSchema.safeParse({
            type: 'FLEE',
            destination: 'Switzerland',
          }).success
        ).toBe(true);

        // Too long
        expect(
          FleeActionSchema.safeParse({
            type: 'FLEE',
            destination: 'x'.repeat(51),
          }).success
        ).toBe(false);
      });
    });
  });

  describe('Submission Limits', () => {
    it('validates max 10 actions per submission', () => {
      // Valid - 10 actions
      const tenActions = Array(10)
        .fill(null)
        .map(() => ({
          type: 'BUY' as const,
          symbol: 'AAPL',
          quantity: 1,
        }));
      expect(SubmitActionsSchema.safeParse({ actions: tenActions }).success).toBe(true);

      // Invalid - 11 actions
      const elevenActions = Array(11)
        .fill(null)
        .map(() => ({
          type: 'BUY' as const,
          symbol: 'AAPL',
          quantity: 1,
        }));
      expect(SubmitActionsSchema.safeParse({ actions: elevenActions }).success).toBe(false);
    });

    it('validates min 1 action per submission', () => {
      expect(SubmitActionsSchema.safeParse({ actions: [] }).success).toBe(false);
    });
  });

  describe('Discriminated Union', () => {
    it('correctly parses all action types via discriminated union', () => {
      const testCases = [
        { type: 'BUY', symbol: 'AAPL', quantity: 100 },
        { type: 'SELL', symbol: 'AAPL', quantity: 50 },
        { type: 'SHORT', symbol: 'GME', quantity: 100 },
        { type: 'COVER', symbol: 'GME', quantity: 100 },
        { type: 'CANCEL_ORDER', orderId: '550e8400-e29b-41d4-a716-446655440000' },
        { type: 'RUMOR', targetSymbol: 'TSLA', content: 'Big news coming soon for this company' },
        { type: 'ALLY', targetAgent: '550e8400-e29b-41d4-a716-446655440000', proposal: 'Let us work together' },
        { type: 'ALLY_ACCEPT', allianceId: '550e8400-e29b-41d4-a716-446655440000' },
        { type: 'ALLY_REJECT', allianceId: '550e8400-e29b-41d4-a716-446655440000' },
        { type: 'ALLY_DISSOLVE' },
        { type: 'MESSAGE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', content: 'Hello' },
        { type: 'BRIBE', targetAgent: '550e8400-e29b-41d4-a716-446655440000', amount: 10000 },
        { type: 'WHISTLEBLOW', targetAgent: '550e8400-e29b-41d4-a716-446655440000', evidence: 'Evidence of fraud that spans multiple transactions' },
        { type: 'FLEE', destination: 'Monaco' },
      ];

      for (const testCase of testCases) {
        const result = AgentActionSchema.safeParse(testCase);
        expect(result.success, `Failed for type: ${testCase.type}`).toBe(true);
      }
    });
  });
});
