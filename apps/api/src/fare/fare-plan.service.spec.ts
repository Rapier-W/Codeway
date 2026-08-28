import { largestRemainder, normalizeFarePlanBody } from './fare-plan.service';

describe('fare plan helpers', () => {
  it('normalizes object key order for idempotency', () => {
    expect(normalizeFarePlanBody({ b: 2, a: 1 })).toBe(normalizeFarePlanBody({ a: 1, b: 2 }));
  });
  it('allocates cents with deterministic largest remainder', () => {
    expect(largestRemainder(100, { b: 1, a: 1, c: 1 })).toEqual({ a: 34, b: 33, c: 33 });
  });
});
