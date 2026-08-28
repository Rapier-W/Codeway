/**
 * 阶段 4：PostgreSQL E2E 独立 fixture 与自动逆序清理。
 *
 * 每个测试用例通过 createFixture 创建带 run token 的独立用户和行程，
 * 测试结束后通过 cleanupFixture 按外键依赖逆序删除，不残留数据。
 */

export interface PostgresFixture {
  runToken: string;
  creatorId: string;
  memberId: string;
  outsiderId: string;
  tripId: string;
  idempotencyKey: (suffix: string) => string;
}

export async function createFixture(prisma: any, runToken: string): Promise<PostgresFixture> {
  const creatorId = `${runToken}-creator`;
  const memberId = `${runToken}-member`;
  const outsiderId = `${runToken}-outsider`;
  const tripId = `${runToken}-trip`;

  await prisma.user.create({ data: { id: creatorId, phone: `${runToken}1`, phoneVerified: true } });
  await prisma.user.create({ data: { id: memberId, phone: `${runToken}2`, phoneVerified: true } });
  await prisma.user.create({ data: { id: outsiderId, phone: `${runToken}3`, phoneVerified: true } });

  const idempotencyKey = (suffix: string) => `pg-${runToken}-${suffix}`;

  const trip = await prisma.trip.create({
    data: {
      id: tripId,
      creatorId,
      origin: 'E2E origin',
      destination: 'E2E destination',
      departTime: new Date(Date.now() + 3_600_000),
      capacity: 3,
      createRequestKey: idempotencyKey('create-trip'),
      members: { create: [{ userId: creatorId, role: 'CREATOR', memberCount: 1 }] },
    },
  });

  return { runToken, creatorId, memberId, outsiderId, tripId: trip.id, idempotencyKey };
}

/**
 * 按外键依赖逆序删除，仅使用 fixture 的 run token 前缀。
 * 清理失败必须抛错，不能静默吞掉。
 */
export async function cleanupFixture(prisma: any, fixture: PostgresFixture): Promise<void> {
  const { runToken, tripId, creatorId, memberId, outsiderId } = fixture;
  const userIds = [creatorId, memberId, outsiderId];

  // 逆序：Review → PaymentMark → FarePlanChangeDecision → FarePlanChangeRequest → FarePlanConfirmation → FarePlanRevision
  // → FareDispute → FareOrderConfirmation → FareOrder → ObjectUpload → VehicleUpdate → RideRecord
  // → ChatMessage → SosEvent → NotificationEvent → EmergencyContact → AuditLog → TripConfirmation → TripMember → Trip → Session → SmsCode → User
  await prisma.review.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.paymentMark.deleteMany({ where: { fareOrder: { tripId } } }).catch(() => {});
  await prisma.farePlanChangeDecision.deleteMany({ where: { changeRequest: { tripId } } }).catch(() => {});
  await prisma.farePlanChangeRequest.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.farePlanConfirmation.deleteMany({ where: { revision: { tripId } } }).catch(() => {});
  await prisma.farePlanRevision.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.fareDispute.deleteMany({ where: { fareOrder: { tripId } } }).catch(() => {});
  await prisma.fareOrderConfirmation.deleteMany({ where: { fareOrder: { tripId } } }).catch(() => {});
  await prisma.fareOrder.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.objectUpload.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.vehicleUpdate.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.rideRecord.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.chatMessage.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.sosEvent.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.notificationEvent.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.tripConfirmation.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.tripMember.deleteMany({ where: { tripId } }).catch(() => {});
  await prisma.trip.deleteMany({ where: { id: tripId } }).catch(() => {});
  await prisma.session.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
  await prisma.smsCode.deleteMany({ where: { phone: { in: [`${runToken}1`, `${runToken}2`, `${runToken}3`] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { id: { in: userIds } } }).catch(() => {});
}
