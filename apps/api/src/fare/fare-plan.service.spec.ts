import { FarePlanService, largestRemainder, normalizeFarePlanBody } from './fare-plan.service';

describe('fare plan helpers', () => {
  it('normalizes object key order for idempotency', () => {
    expect(normalizeFarePlanBody({ b: 2, a: 1 })).toBe(normalizeFarePlanBody({ a: 1, b: 2 }));
  });
  it('allocates cents with deterministic largest remainder', () => {
    expect(largestRemainder(100, { b: 1, a: 1, c: 1 })).toEqual({ a: 34, b: 33, c: 33 });
  });

  it('records a retry key even when a member repeats an already accepted decision with a new key', async () => {
    const decision = { id: 'decision-1', requestId: 'request-1', userId: 'user-1', decision: 'APPROVED' };
    const tx: any = {
      $queryRaw: jest.fn(),
      trip: { findUnique: jest.fn().mockResolvedValue({ id: 'trip-1', members: [{ userId: 'user-1' }] }) },
      farePlanChangeRequest: {
        findUnique: jest.fn()
          .mockResolvedValueOnce({ id: 'request-1', tripId: 'trip-1' })
          .mockResolvedValueOnce({ id: 'request-1', tripId: 'trip-1', status: 'PENDING', expiresAt: new Date(Date.now() + 60_000), decisions: [decision] }),
      },
      farePlanChangeDecision: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn() },
      farePlanIdempotencyKey: { findUnique: jest.fn() },
    };
    tx.$queryRaw.mockResolvedValueOnce(undefined).mockResolvedValueOnce(undefined).mockResolvedValueOnce([{ key: 'second-key' }]);
    const service = new FarePlanService({ $transaction: jest.fn((fn: any) => fn(tx)) } as any);

    await expect(service.decideChangeRequest('request-1', 'user-1', { decision: 'APPROVED' } as any, 'second-key'))
      .resolves.toEqual(decision);

    expect(tx.$queryRaw).toHaveBeenCalledTimes(3);
    expect(tx.farePlanIdempotencyKey.findUnique).not.toHaveBeenCalled();
  });
});
