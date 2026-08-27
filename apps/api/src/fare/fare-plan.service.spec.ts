import { FarePlanService } from './fare-plan.service';

describe('FarePlanService', () => {
  const tx: any = {
    trip: { findUnique: jest.fn(), update: jest.fn() },
    tripMember: { findMany: jest.fn(), findFirst: jest.fn() },
    fareOrder: { findUnique: jest.fn() },
    farePlanRevision: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findUnique: jest.fn() },
    farePlanConfirmation: { updateMany: jest.fn() },
    farePlanChangeRequest: { findUnique: jest.fn(), findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    farePlanChangeDecision: { findUnique: jest.fn(), create: jest.fn(), findMany: jest.fn() },
    $queryRaw: jest.fn(),
  };
  const prisma: any = {
    $transaction: jest.fn((fn: any) => fn(tx)),
    trip: { findUnique: jest.fn() },
    tripMember: { findFirst: jest.fn() },
    farePlanRevision: { findFirst: jest.fn() },
    farePlanChangeRequest: { findFirst: jest.fn() },
  };
  let service: FarePlanService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FarePlanService(prisma);
    tx.trip.findUnique.mockResolvedValue({ id: 't1', creatorId: 'u1', disputeLocked: false, feePlan: null, members: [{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }] });
    tx.tripMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }, { userId: 'u3' }]);
    tx.fareOrder.findUnique.mockResolvedValue(null);
    tx.farePlanChangeRequest.findFirst.mockResolvedValue(null);
    tx.farePlanChangeRequest.findUnique.mockResolvedValue(null);
    tx.farePlanRevision.create.mockImplementation(async ({ data }: any) => ({ id: 'rev-1', ...data }));
    tx.farePlanChangeRequest.create.mockImplementation(async ({ data }: any) => ({ id: 'cr-1', ...data }));
  });

  describe('createChangeRequest', () => {
    it('rejects CUSTOM allocations whose total is not 100', async () => {
      await expect(
        service.createChangeRequest('t1', 'u1', { mode: 'CUSTOM', allocations: { a: 50, b: 49 } }, 'key-1')
      ).rejects.toThrow('FARE_PLAN_PERCENT_TOTAL_INVALID');
    });

    it('rejects non-creator', async () => {
      await expect(
        service.createChangeRequest('t1', 'u2', { mode: 'EQUAL' }, 'key-2')
      ).rejects.toThrow('ONLY_CREATOR_CAN_CHANGE_FARE_PLAN');
    });

    it('rejects when dispute is locked', async () => {
      tx.trip.findUnique.mockResolvedValue({ id: 't1', creatorId: 'u1', disputeLocked: true, members: [] });
      await expect(
        service.createChangeRequest('t1', 'u1', { mode: 'EQUAL' }, 'key-3')
      ).rejects.toThrow('FARE_PLAN_CHANGE_NOT_ALLOWED');
    });

    it('rejects when fare order already submitted', async () => {
      tx.fareOrder.findUnique.mockResolvedValue({ id: 'fo-1', tripId: 't1' });
      await expect(
        service.createChangeRequest('t1', 'u1', { mode: 'EQUAL' }, 'key-4')
      ).rejects.toThrow('FARE_PLAN_CHANGE_NOT_ALLOWED');
    });

    it('creates change request successfully', async () => {
      const result = await service.createChangeRequest('t1', 'u1', { mode: 'EQUAL' }, 'key-5');
      expect(result.duplicate).toBe(false);
      expect(result.changeRequest.status).toBe('PENDING');
      expect(tx.farePlanRevision.create).toHaveBeenCalled();
      expect(tx.farePlanChangeRequest.create).toHaveBeenCalled();
    });

    it('returns duplicate for same request key', async () => {
      tx.farePlanChangeRequest.findUnique.mockResolvedValue({ id: 'cr-1', tripId: 't1', requestedBy: 'u1', status: 'PENDING' });
      const result = await service.createChangeRequest('t1', 'u1', { mode: 'EQUAL' }, 'key-5');
      expect(result.duplicate).toBe(true);
      expect(tx.farePlanChangeRequest.create).not.toHaveBeenCalled();
    });
  });

  describe('decideChangeRequest', () => {
    beforeEach(() => {
      tx.farePlanChangeRequest.findUnique.mockResolvedValue({
        id: 'cr-1', tripId: 't1', revisionId: 'rev-1', requestedBy: 'u1', status: 'PENDING',
        expiresAt: new Date(Date.now() + 60_000),
      });
      tx.farePlanChangeDecision.findUnique.mockResolvedValue(null);
      tx.farePlanChangeDecision.create.mockImplementation(async ({ data }: any) => ({ id: 'dec-1', ...data }));
      tx.farePlanChangeDecision.findMany.mockResolvedValue([]);
    });

    it('rejects non-member decision', async () => {
      tx.tripMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
      await expect(
        service.decideChangeRequest('cr-1', 'u9', 'APPROVED', 'd-key-1')
      ).rejects.toThrow('TRIP_MEMBER_REQUIRED');
    });

    it('rejects already resolved request', async () => {
      tx.farePlanChangeRequest.findUnique.mockResolvedValue({ id: 'cr-1', status: 'APPROVED', tripId: 't1', revisionId: 'rev-1', expiresAt: new Date(Date.now() + 60_000) });
      await expect(
        service.decideChangeRequest('cr-1', 'u2', 'APPROVED', 'd-key-2')
      ).rejects.toThrow('FARE_PLAN_CHANGE_ALREADY_RESOLVED');
    });

    it('marks request as REJECTED when any member rejects', async () => {
      tx.tripMember.findMany.mockResolvedValue([{ userId: 'u1' }, { userId: 'u2' }]);
      const result = await service.decideChangeRequest('cr-1', 'u2', 'REJECTED', 'd-key-3');
      expect(result.changeRequestStatus).toBe('REJECTED');
      expect(tx.farePlanChangeRequest.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'cr-1' }, data: { status: 'REJECTED' }
      }));
    });

    it('supersedes old revision only after every member approves', async () => {
      // 3 members: u1(creator, 不参与表决), u2, u3
      // u2 approves first → still PENDING (only 1 of 2 non-creator members... wait, all members including creator)
      // service checks: all members must approve. u1 hasn't decided yet → PENDING
      tx.farePlanChangeDecision.findMany.mockResolvedValueOnce([{ userId: 'u2', decision: 'APPROVED' }]);
      let result = await service.decideChangeRequest('cr-1', 'u2', 'APPROVED', 'd-u2');
      expect(result.changeRequestStatus).toBe('PENDING');

      // Now u1 and u3 also approve. After u3's decision, all 3 members have approved → APPROVED
      tx.farePlanChangeDecision.findMany.mockResolvedValueOnce([
        { userId: 'u1', decision: 'APPROVED' },
        { userId: 'u2', decision: 'APPROVED' },
        { userId: 'u3', decision: 'APPROVED' },
      ]);
      tx.farePlanRevision.findUnique.mockResolvedValueOnce({ id: 'rev-1', mode: 'EQUAL', allocations: null, amountCents: null });
      result = await service.decideChangeRequest('cr-1', 'u3', 'APPROVED', 'd-u3');
      expect(result.changeRequestStatus).toBe('APPROVED');
      expect(tx.farePlanRevision.update).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: 'rev-1' }, data: { status: 'CONFIRMED' }
      }));
      expect(tx.farePlanRevision.updateMany).toHaveBeenCalledWith(expect.objectContaining({
        where: { tripId: 't1', status: 'CONFIRMED' }, data: { status: 'SUPERSEDED' }
      }));
    });
  });
});
