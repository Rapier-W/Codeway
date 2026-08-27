import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { TripStatus } from '../trips/trip-status';

/**
 * 阶段 2：成团后费用分摊修订。
 *
 * 流程：发单人申请变更 → 全体成员表决 → 全员同意才应用（旧确认作废、旧 revision 标记 SUPERSEDED、新 revision 创建）。
 * 任一拒绝或 24 小时过期则申请失效，旧方案不变。
 * 不触发成团 15 秒反悔状态机。
 */

const CHANGE_REQUEST_TTL_MS = 24 * 60 * 60 * 1000;

export interface FarePlanDto {
  mode: 'EQUAL' | 'FIXED' | 'CUSTOM';
  allocations?: Record<string, number>; // CUSTOM 模式：{ userId: percentage }
  amountCents?: number; // FIXED 模式
}

@Injectable()
export class FarePlanService {
  constructor(private readonly prisma: PrismaService) {}

  /** 获取行程当前生效的费用方案。 */
  async getFarePlan(tripId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');

    const revision = await this.prisma.farePlanRevision.findFirst({
      where: { tripId, status: { in: ['PENDING_CONFIRMATION', 'CONFIRMED'] } },
      orderBy: { createdAt: 'desc' },
      include: { confirmations: true },
    });

    return {
      tripId,
      feePlan: trip.feePlan,
      currentRevision: revision ? this.toRevisionDto(revision) : null,
    };
  }

  /**
   * 发单人发起费用方案变更。
   * 创建新 revision（PENDING_CONFIRMATION）和变更申请（PENDING，24h 过期）。
   * 已提交费用订单或有争议时禁止变更。
   */
  async createChangeRequest(tripId: string, userId: string, dto: FarePlanDto, requestKey: string) {
    this.validatePlan(dto);

    return this.prisma.$transaction(async (tx: any) => {
      const trip = await this.lockTrip(tx, tripId);
      if (trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_CHANGE_FARE_PLAN');
      if (trip.disputeLocked) throw new ConflictException('FARE_PLAN_CHANGE_NOT_ALLOWED');

      // 已提交费用订单后不允许变更方案
      const existingOrder = await tx.fareOrder.findUnique({ where: { tripId } });
      if (existingOrder) throw new ConflictException('FARE_PLAN_CHANGE_NOT_ALLOWED');

      // 同行程已有未结案的变更申请时禁止重复发起
      const pendingRequest = await tx.farePlanChangeRequest.findFirst({
        where: { tripId, status: 'PENDING' },
      });
      if (pendingRequest) throw new ConflictException('FARE_PLAN_CHANGE_ALREADY_PENDING');

      // 幂等：相同 requestKey 返回已有结果
      const existing = await tx.farePlanChangeRequest.findUnique({ where: { requestKey } });
      if (existing) {
        if (existing.tripId !== tripId || existing.requestedBy !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        return { changeRequest: existing, duplicate: true };
      }

      // 成员快照：冻结当前成员集合，后续成员变化不影响本次表决
      const members = await tx.tripMember.findMany({ where: { tripId } });
      if (members.length < 2) throw new ConflictException('TRIP_NOT_FORMED');

      const revision = await tx.farePlanRevision.create({
        data: {
          tripId,
          mode: dto.mode,
          allocations: dto.allocations ?? null,
          amountCents: dto.amountCents ?? null,
          status: 'PENDING_CONFIRMATION',
        },
      });

      const now = new Date();
      const changeRequest = await tx.farePlanChangeRequest.create({
        data: {
          tripId,
          revisionId: revision.id,
          requestedBy: userId,
          status: 'PENDING',
          expiresAt: new Date(now.getTime() + CHANGE_REQUEST_TTL_MS),
          requestKey,
        },
      });

      return { changeRequest, duplicate: false };
    });
  }

  /**
   * 成员对变更申请表决。
   * 全员同意 → 旧 revision 标记 SUPERSEDED、旧确认标记 VOID、新 revision 标记 CONFIRMED。
   * 任一拒绝 → 申请标记 REJECTED，旧方案不变。
   */
  async decideChangeRequest(changeRequestId: string, userId: string, decision: 'APPROVED' | 'REJECTED', requestKey: string) {
    return this.prisma.$transaction(async (tx: any) => {
      const req = await tx.farePlanChangeRequest.findUnique({ where: { id: changeRequestId } });
      if (!req) throw new NotFoundException('FARE_PLAN_CHANGE_REQUEST_NOT_FOUND');
      if (req.status !== 'PENDING') throw new ConflictException('FARE_PLAN_CHANGE_ALREADY_RESOLVED');

      // 过期检查
      if (new Date(req.expiresAt) <= new Date()) {
        await tx.farePlanChangeRequest.update({ where: { id: changeRequestId }, data: { status: 'EXPIRED' } });
        throw new ConflictException('FARE_PLAN_CHANGE_EXPIRED');
      }

      // 成员快照校验：只有变更发起时的成员才能表决
      const members = await tx.tripMember.findMany({ where: { tripId: req.tripId } });
      if (!members.some((m: any) => m.userId === userId)) throw new ForbiddenException('TRIP_MEMBER_REQUIRED');

      // 幂等：相同 requestKey 返回已有决策
      const existingDecision = await tx.farePlanChangeDecision.findUnique({ where: { requestKey } });
      if (existingDecision) {
        if (existingDecision.changeRequestId !== changeRequestId || existingDecision.userId !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        return { decision: existingDecision, duplicate: true };
      }

      const decisionRecord = await tx.farePlanChangeDecision.create({
        data: { changeRequestId, userId, decision, requestKey },
      });

      if (decision === 'REJECTED') {
        await tx.farePlanChangeRequest.update({ where: { id: changeRequestId }, data: { status: 'REJECTED' } });
        return { decision: decisionRecord, changeRequestStatus: 'REJECTED', duplicate: false };
      }

      // 检查是否全员同意
      const allDecisions = await tx.farePlanChangeDecision.findMany({
        where: { changeRequestId, decision: 'APPROVED' },
      });
      const allApproved = members.every((m: any) => allDecisions.some((d: any) => d.userId === m.userId));

      if (allApproved) {
        // 旧 revision 标记 SUPERSEDED
        await tx.farePlanRevision.updateMany({
          where: { tripId: req.tripId, status: 'CONFIRMED' },
          data: { status: 'SUPERSEDED' },
        });
        // 旧确认标记 VOID
        await tx.farePlanConfirmation.updateMany({
          where: { revision: { tripId: req.tripId } },
          data: { confirmedAt: null },
        });
        // 新 revision 标记 CONFIRMED
        await tx.farePlanRevision.update({
          where: { id: req.revisionId },
          data: { status: 'CONFIRMED' },
        });
        // 更新 Trip 的 feePlan
        const newRevision = await tx.farePlanRevision.findUnique({ where: { id: req.revisionId } });
        await tx.trip.update({
          where: { id: req.tripId },
          data: { feePlan: { mode: newRevision.mode, allocations: newRevision.allocations, amountCents: newRevision.amountCents } },
        });
        await tx.farePlanChangeRequest.update({ where: { id: changeRequestId }, data: { status: 'APPROVED' } });
        return { decision: decisionRecord, changeRequestStatus: 'APPROVED', duplicate: false };
      }

      return { decision: decisionRecord, changeRequestStatus: 'PENDING', duplicate: false };
    });
  }

  /** 获取变更申请状态及各成员表决情况。 */
  async getChangeRequest(tripId: string, userId: string) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');

    const member = await this.prisma.tripMember.findFirst({ where: { tripId, userId } });
    if (!member) throw new ForbiddenException('TRIP_MEMBER_REQUIRED');

    const request = await this.prisma.farePlanChangeRequest.findFirst({
      where: { tripId },
      orderBy: { createdAt: 'desc' },
      include: { decisions: true, revision: true },
    });

    if (!request) return { changeRequest: null };

    return {
      changeRequest: {
        id: request.id,
        status: request.status,
        expiresAt: request.expiresAt.toISOString(),
        requestedBy: request.requestedBy,
        revision: this.toRevisionDto(request.revision),
        decisions: request.decisions.map((d: any) => ({ userId: d.userId, decision: d.decision })),
      },
    };
  }

  private validatePlan(dto: FarePlanDto) {
    if (!['EQUAL', 'FIXED', 'CUSTOM'].includes(dto.mode)) throw new ConflictException('FARE_PLAN_MODE_INVALID');
    if (dto.mode === 'FIXED' && (!Number.isInteger(dto.amountCents) || dto.amountCents! < 0)) throw new ConflictException('FARE_AMOUNT_INVALID');
    if (dto.mode === 'CUSTOM') {
      const allocations = dto.allocations ?? {};
      const total = Object.values(allocations).reduce((sum, v) => sum + Number(v), 0);
      if (total !== 100) throw new ConflictException('FARE_PLAN_PERCENT_TOTAL_INVALID');
    }
  }

  private async lockTrip(tx: any, tripId: string) {
    if (tx.$queryRaw) await tx.$queryRaw`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`;
    const trip = await tx.trip.findUnique({ where: { id: tripId }, include: { members: true } });
    if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
    return trip;
  }

  private toRevisionDto(revision: any) {
    return {
      id: revision.id,
      mode: revision.mode,
      allocations: revision.allocations,
      amountCents: revision.amountCents,
      status: revision.status,
      confirmations: revision.confirmations?.map((c: any) => ({ userId: c.userId, confirmedAt: c.confirmedAt?.toISOString() })) ?? [],
    };
  }
}
