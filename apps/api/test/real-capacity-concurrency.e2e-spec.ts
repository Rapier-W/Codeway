import { PrismaClient } from '@prisma/client';
import { TripsService } from '../src/trips/trips.service';

// Use an explicit opt-in variable so placeholder/test DATABASE_URL values do not
// accidentally turn the real PostgreSQL suite into a failing integration run.
const databaseUrl = process.env.REAL_DATABASE_URL;
const describeReal = databaseUrl ? describe : describe.skip;

describeReal('real PostgreSQL capacity concurrency (e2e)', () => {
  let prisma: PrismaClient;
  let creatorId: string;
  let tripId: string;
  let pendingIds: string[];
  let userIds: string[] = [];
  let service: TripsService;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await prisma.$connect();
    service = new TripsService(prisma as any);
    const creator = await prisma.user.create({ data: { phone: `139${Date.now()}`, phoneVerified: true } });
    creatorId = creator.id;
    const trip = await prisma.trip.create({
      data: {
        creatorId,
        origin: 'A',
        destination: 'B',
        departTime: new Date(Date.now() + 3600000),
        capacity: 3,
        status: 'RECRUITING',
        members: { create: { userId: creatorId, role: 'CREATOR', memberCount: 1, status: 'ACTIVE' } },
      },
    });
    tripId = trip.id;
    const users = await Promise.all([
      prisma.user.create({ data: { phone: `138${Date.now()}1`, phoneVerified: true } }),
      prisma.user.create({ data: { phone: `138${Date.now()}2`, phoneVerified: true } }),
    ]);
    userIds = users.map(user => user.id);
    const requests = await Promise.all(users.map((user, index) => prisma.tripMember.create({
      data: { tripId, userId: user.id, role: 'MEMBER', memberCount: 1, status: 'PENDING', joinRequestKey: `real-request-${Date.now()}-${index}` },
    })));
    pendingIds = requests.map(request => request.id);
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.tripMember.deleteMany({ where: { tripId } });
    await prisma.trip.delete({ where: { id: tripId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: creatorId } });
    await prisma.$disconnect();
  });

  it('serializes concurrent acceptance and never creates an over-capacity active set', async () => {
    const outcomes = await Promise.allSettled(pendingIds.map(memberId => service.acceptJoin(creatorId, tripId, memberId, `real-accept-${memberId}`)));
    const active = await prisma.tripMember.count({ where: { tripId, status: 'ACTIVE' } });
    expect(active).toBeLessThanOrEqual(3);
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled').length).toBe(2);
    const trip = await prisma.trip.findUnique({ where: { id: tripId } });
    expect(trip?.status).toBe('CONFIRMING');
  });
});
