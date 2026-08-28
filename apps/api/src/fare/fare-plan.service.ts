import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma.service';
import { TripStatus } from '../trips/trip-status';
import { CreateFarePlanChangeRequestDto, FarePlanDecisionDto } from './dto/fare-plan.dto';

function stable(value: any): any {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.keys(value).sort().reduce((o, k) => { o[k] = stable(value[k]); return o; }, {} as any);
  return value;
}
export function normalizeFarePlanBody(value: any) { return JSON.stringify(stable(value)); }

/** Deterministic largest-remainder allocation in cents. */
export function largestRemainder(totalCents: number, weights: Record<string, number>) {
  const entries = Object.entries(weights).sort(([a], [b]) => a.localeCompare(b));
  if (!Number.isInteger(totalCents) || totalCents < 0 || entries.length === 0) throw new BadRequestException('FARE_PLAN_INVALID');
  if (entries.some(([, value]) => !Number.isInteger(value) || value < 0)) throw new BadRequestException('FARE_PLAN_INVALID');
  const sum = entries.reduce((n, [, v]) => n + Number(v), 0);
  if (!(sum > 0)) throw new BadRequestException('FARE_PLAN_INVALID');
  const raw = entries.map(([id, w]) => ({ id, floor: Math.floor(totalCents * Number(w) / sum), remainder: (totalCents * Number(w) / sum) % 1 }));
  let left = totalCents - raw.reduce((n, x) => n + x.floor, 0);
  raw.sort((a, b) => b.remainder - a.remainder || a.id.localeCompare(b.id));
  for (let i = 0; i < raw.length && left > 0; i++, left--) raw[i].floor++;
  return Object.fromEntries(raw.map(x => [x.id, x.floor]));
}

@Injectable()
export class FarePlanService {
  constructor(private readonly prisma: PrismaService) {}
  private tx<T>(fn: (c: any) => Promise<T>) { return this.prisma.$transaction(fn); }
  private async lockTrip(c: any, tripId: string) {
    if (c.$queryRaw) await c.$queryRaw`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`;
    const trip = await c.trip.findUnique({ where: { id: tripId }, include: { members: true } });
    if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
    return trip;
  }
  private validatePlan(plan: any, memberIds: string[]) {
    const mode = plan?.mode;
    if (!['EQUAL', 'FIXED', 'CUSTOM'].includes(mode)) throw new BadRequestException('FARE_PLAN_MODE_INVALID');
    const allocations = plan?.allocations ?? {};
    if (mode === 'EQUAL') {
      if (Object.keys(allocations).length > 0) throw new BadRequestException('FARE_PLAN_MEMBERS_INVALID');
      return { mode };
    }
    const keys = Object.keys(allocations).sort(), expected = [...memberIds].sort();
    if (keys.length !== expected.length || keys.some((x, i) => x !== expected[i])) throw new BadRequestException('FARE_PLAN_MEMBERS_INVALID');
    const vals = keys.map(k => Number(allocations[k]));
    if (vals.some(v => !Number.isInteger(v) || v < 0)) throw new BadRequestException(mode === 'CUSTOM' ? 'FARE_PLAN_PERCENT_INVALID' : 'FARE_PLAN_AMOUNT_INVALID');
    if (mode === 'FIXED' && vals.some(v => v <= 0)) throw new BadRequestException('FARE_PLAN_AMOUNT_INVALID');
    if (mode === 'CUSTOM' && vals.reduce((a, b) => a + b, 0) !== 100) throw new BadRequestException('FARE_PLAN_PERCENT_TOTAL_INVALID');
    return { mode, allocations: Object.fromEntries(keys.map(k => [k, Number(allocations[k])])) };
  }
  private async currentRevision(c: any, tripId: string) {
    return c.farePlanRevision.findFirst({ where: { tripId, status: 'LOCKED' }, orderBy: { sequence: 'desc' }, include: { confirmations: true } });
  }

  async getFarePlan(tripId: string, userId: string) {
    return this.tx(async c => {
      const trip = await this.lockTrip(c, tripId);
      if (!trip.members.some((m: any) => m.userId === userId)) throw new ForbiddenException('TRIP_MEMBER_REQUIRED');
      let request = await c.farePlanChangeRequest.findFirst({ where: { tripId, status: 'PENDING' }, include: { decisions: true } });
      if (request && request.expiresAt <= new Date()) {
        await c.farePlanChangeRequest.update({ where: { id: request.id }, data: { status: 'EXPIRED' } });
        request = { ...request, status: 'EXPIRED' };
      }
      const revision = await c.farePlanRevision.findFirst({ where: { tripId, status: { not: 'SUPERSEDED' } }, orderBy: { sequence: 'desc' }, include: { confirmations: true } });
      return { tripId, revision, request, memberCount: trip.members.length };
    });
  }

  async createChangeRequest(tripId: string, userId: string, dto: CreateFarePlanChangeRequestDto, requestKey: string) {
    if (!requestKey) throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    return this.tx(async c => {
      const trip = await this.lockTrip(c, tripId);
      const existing = await c.farePlanChangeRequest.findUnique({ where: { requestKey }, include: { decisions: true } });
      if (existing) {
        if (existing.tripId !== tripId || existing.requestedBy !== userId || normalizeFarePlanBody({ proposedPlan: existing.proposedPlan, reason: existing.reason }) !== normalizeFarePlanBody({ proposedPlan: dto.proposedPlan, reason: dto.reason ?? null })) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        return existing;
      }
      if (trip.creatorId !== userId) throw new ForbiddenException('ONLY_CREATOR_CAN_CHANGE_FARE_PLAN');
      if (trip.disputeLocked || ![TripStatus.FORMED, TripStatus.WAITING_RIDE, TripStatus.RIDE_BOOKED].includes(trip.status) || (await c.fareOrder.findUnique({ where: { tripId } }))) throw new ConflictException('FARE_PLAN_CHANGE_NOT_ALLOWED');
      const base = await this.currentRevision(c, tripId);
      if (!base) throw new ConflictException('FARE_PLAN_CHANGE_NOT_ALLOWED');
      const normalized = this.validatePlan(dto.proposedPlan, trip.members.map((m: any) => m.userId));
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const created = await c.farePlanChangeRequest.create({ data: { id: randomUUID(), tripId, baseRevisionId: base.id, proposedPlan: normalized, reason: dto.reason ?? null, requestedBy: userId, requestKey, expiresAt, decisions: { create: trip.members.map((m: any) => ({ userId: m.userId, decision: m.userId === userId ? 'APPROVED' : 'PENDING', decidedAt: m.userId === userId ? new Date() : null })) } }, include: { decisions: true } });
      if (c.auditLog?.create) await c.auditLog.create({ data: { tripId, actorId: userId, action: 'fare-plan-change-requested', payload: { requestId: created.id, baseRevisionId: base.id } } });
      return created;
    });
  }

  async decideChangeRequest(requestId: string, userId: string, dto: FarePlanDecisionDto, idempotencyKey: string) {
    if (!idempotencyKey) throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    return this.tx(async c => {
      const idem = await c.farePlanChangeDecision.findUnique({ where: { idempotencyKey } });
      if (idem) {
        if (idem.requestId !== requestId || idem.userId !== userId || idem.decision !== dto.decision) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
        return idem;
      }
      const initial = await c.farePlanChangeRequest.findUnique({ where: { id: requestId } });
      if (!initial) throw new NotFoundException('FARE_PLAN_CHANGE_NOT_FOUND');
      const trip = await this.lockTrip(c, initial.tripId);
      if (c.$queryRaw) await c.$queryRaw`SELECT id FROM fare_plan_change_requests WHERE id = ${requestId} FOR UPDATE`;
      const req = await c.farePlanChangeRequest.findUnique({ where: { id: requestId }, include: { decisions: true } });
      if (!req) throw new NotFoundException('FARE_PLAN_CHANGE_NOT_FOUND');
      const decision = req.decisions.find((item: any) => item.userId === userId);
      if (!decision) throw new ForbiddenException('FARE_PLAN_DECISION_MEMBER_REQUIRED');
      const now = new Date();
      if (req.status === 'PENDING' && req.expiresAt <= now) { await c.farePlanChangeRequest.update({ where: { id: requestId }, data: { status: 'EXPIRED' } }); req.status = 'EXPIRED'; }
      if (req.status !== 'PENDING') {
        if (decision.decision === dto.decision) return decision;
        throw new ConflictException('FARE_PLAN_CHANGE_NOT_PENDING');
      }
      if (decision.decision !== 'PENDING') {
        if (decision.decision === dto.decision) return decision;
        throw new ConflictException('FARE_PLAN_DECISION_ALREADY_RECORDED');
      }
      const saved = await c.farePlanChangeDecision.update({ where: { id: decision.id }, data: { decision: dto.decision, decidedAt: now, idempotencyKey } });
      if (dto.decision === 'REJECTED') { await c.farePlanChangeRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } }); return saved; }
      const all = req.decisions.map((d: any) => d.id === decision.id ? dto.decision : d.decision).every((d: string) => d === 'APPROVED');
      if (!all) return saved;
      const ids = trip.members.map((m: any) => m.userId).sort();
      const snap = req.decisions.map((d: any) => d.userId).sort();
      if (ids.join(',') !== snap.join(',')) throw new ConflictException('FARE_PLAN_MEMBERS_CHANGED');
      const base = await c.farePlanRevision.findUnique({ where: { id: req.baseRevisionId }, include: { confirmations: true } });
      if (!base || base.status !== 'LOCKED') throw new ConflictException('FARE_PLAN_CHANGE_NOT_ALLOWED');
      await c.farePlanConfirmation.updateMany({ where: { revisionId: base.id, status: 'CONFIRMED' }, data: { status: 'VOID', voidedAt: now } });
      await c.farePlanRevision.update({ where: { id: base.id }, data: { status: 'SUPERSEDED', supersededAt: now } });
      const next = await c.farePlanRevision.create({ data: { tripId: req.tripId, sequence: base.sequence + 1, plan: req.proposedPlan, status: 'PENDING_CONFIRMATION' } });
      await c.farePlanConfirmation.createMany({ data: req.decisions.map((item: any) => ({ revisionId: next.id, userId: item.userId, status: 'PENDING' })) });
      await c.farePlanChangeRequest.update({ where: { id: requestId }, data: { status: 'APPLIED', appliedAt: now } });
      await c.trip.update({ where: { id: req.tripId }, data: { feePlan: null } });
      if (c.auditLog?.create) await c.auditLog.create({ data: { tripId: req.tripId, actorId: userId, action: 'fare-plan-change-applied', payload: { requestId, baseRevisionId: base.id } } });
      return saved;
    });
  }

  async confirmRevision(tripId: string, revisionId: string, userId: string, idempotencyKey: string) {
    if (!idempotencyKey) throw new BadRequestException('IDEMPOTENCY_KEY_REQUIRED');
    return this.tx(async c => {
      const trip = await this.lockTrip(c, tripId);
      const revision = await c.farePlanRevision.findUnique({ where: { id: revisionId }, include: { confirmations: true } });
      if (!revision || revision.tripId !== tripId) throw new NotFoundException('FARE_PLAN_REVISION_NOT_FOUND');
      const idem = await c.farePlanConfirmation.findUnique({ where: { idempotencyKey } });
      if (idem) { if (idem.revisionId !== revisionId || idem.userId !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED'); return idem; }
      if (revision.status !== 'PENDING_CONFIRMATION') throw new ConflictException('FARE_PLAN_REVISION_NOT_PENDING');
      const snapshot = revision.confirmations.find((item: any) => item.userId === userId);
      if (!snapshot) throw new ForbiddenException('FARE_PLAN_DECISION_MEMBER_REQUIRED');
      if (snapshot.status === 'CONFIRMED') return snapshot;
      if (snapshot.status !== 'PENDING') throw new ConflictException('FARE_PLAN_REVISION_NOT_PENDING');
      const confirmation = await c.farePlanConfirmation.update({ where: { id: snapshot.id }, data: { status: 'CONFIRMED', confirmedAt: new Date(), idempotencyKey } });
      const confirmed = revision.confirmations.map((item: any) => item.id === snapshot.id ? 'CONFIRMED' : item.status);
      if (confirmed.every((status: string) => status === 'CONFIRMED')) {
        const now = new Date();
        await c.farePlanRevision.update({ where: { id: revisionId }, data: { status: 'LOCKED', lockedAt: now } });
        await c.trip.update({ where: { id: tripId }, data: { feePlan: revision.plan } });
      }
      return confirmation;
    });
  }
}
