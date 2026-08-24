import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
import { canTransition, ConfirmationStatus, TripStatus } from './trip-status';

const WINDOW_MS = 15_000;

@Injectable()
export class ConfirmationService {
  constructor(private readonly prisma: PrismaService) {}

  private async inTransaction<T>(fn: (tx: any) => Promise<T>) { return this.prisma.$transaction(fn); }

  async confirm(tripId: string, userId: string, idempotencyKey?: string) {
    return this.inTransaction(async tx => {
      if (tx.$queryRaw) await tx.$queryRaw`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`;
      const trip = await tx.trip.findUnique({ where: { id: tripId }, include: { members: true } });
      if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
      if (idempotencyKey) {
        const duplicate = await tx.tripConfirmation.findUnique({ where: { idempotencyKey } });
        if (duplicate) {
          if (duplicate.tripId !== tripId || duplicate.userId !== userId) throw new ConflictException('IDEMPOTENCY_KEY_REUSED');
          return { confirmation: duplicate, tripStatus: trip.status, duplicate: true, retractUntil: duplicate.retractUntil };
        }
      }
      if (trip.status !== TripStatus.CONFIRMING) throw new ConflictException('TRIP_NOT_CONFIRMING');
      const member = tx.tripMember.findUnique
        ? await tx.tripMember.findUnique({ where: { tripId_userId: { tripId, userId } } })
        : await tx.tripMember.findFirst({ where: { tripId, userId } });
      if (!member) throw new NotFoundException('TRIP_MEMBER_NOT_FOUND');
      if ((member.status ?? 'ACTIVE') !== 'ACTIVE') throw new ConflictException('TRIP_MEMBER_NOT_ACTIVE');
      const existing = await tx.tripConfirmation.findFirst?.({ where: { tripId, userId, status: ConfirmationStatus.CONFIRMED } });
      if (existing) return { confirmation: existing, tripStatus: trip.status, duplicate: true, retractUntil: existing.retractUntil };
      const activeMembers = (trip.members ?? []).filter((item: any) => (item.status ?? 'ACTIVE') === 'ACTIVE');
      const occupied = activeMembers.reduce((total: number, item: any) => total + item.memberCount, 0);
      if (occupied !== trip.capacity) throw new ConflictException('TRIP_CAPACITY_NOT_FULL');
      const confirmation = await tx.tripConfirmation.create({ data: { tripId, memberId: member.id, userId, status: ConfirmationStatus.CONFIRMED, idempotencyKey } });
      const prior = await tx.tripConfirmation.findMany({ where: { tripId, status: ConfirmationStatus.CONFIRMED } });
      const priorIncludesNew = prior.some((item: any) => item.id === confirmation.id);
      const allConfirmed = (prior.length + (priorIncludesNew ? 0 : 1)) >= activeMembers.length;
      if (!allConfirmed) {
        if (!canTransition(trip.status, TripStatus.CONFIRMING)) throw new ConflictException('INVALID_TRIP_TRANSITION');
        const updated = await tx.trip.update({ where: { id: tripId }, data: { status: TripStatus.CONFIRMING, version: { increment: 1 } } });
        await this.audit(tx, tripId, userId, 'confirm', { confirmationId: confirmation.id });
        return { confirmation, tripStatus: updated.status, duplicate: false, retractUntil: null };
      }
      const retractUntil = new Date(Date.now() + WINDOW_MS);
      await tx.tripConfirmation.updateMany({ where: { tripId, status: ConfirmationStatus.CONFIRMED }, data: { status: ConfirmationStatus.CONFIRMED, retractUntil } });
      if (!canTransition(trip.status, TripStatus.FORMED)) throw new ConflictException('INVALID_TRIP_TRANSITION');
      const updated = await tx.trip.update({ where: { id: tripId }, data: { status: TripStatus.FORMED, version: { increment: 1 } } });
      await this.audit(tx, tripId, userId, 'confirm', { confirmationId: confirmation.id, retractUntil });
      await this.audit(tx, tripId, userId, 'form-group', { retractUntil });
      return { confirmation: { ...confirmation, retractUntil }, tripStatus: updated.status, duplicate: false, retractUntil };
    });
  }

  async withdraw(tripId: string, confirmationId: string, userId: string) {
    return this.inTransaction(async tx => {
      if (tx.$queryRaw) await tx.$queryRaw`SELECT id FROM trips WHERE id = ${tripId} FOR UPDATE`;
      const trip = await tx.trip.findUnique({ where: { id: tripId }, include: { members: true } });
      if (!trip) throw new NotFoundException('TRIP_NOT_FOUND');
      const confirmation = await tx.tripConfirmation.findUnique({ where: { id: confirmationId } });
      if (!confirmation || confirmation.tripId !== tripId) throw new NotFoundException('CONFIRMATION_NOT_FOUND');
      if (confirmation.userId !== userId) throw new ForbiddenException('CONFIRMATION_FORBIDDEN');
      if (confirmation.status === ConfirmationStatus.VOID) return { confirmation, tripStatus: trip.status, duplicate: true };
      if (trip.status !== TripStatus.FORMED || !confirmation.retractUntil || new Date() >= confirmation.retractUntil) throw new ConflictException('WITHDRAW_WINDOW_EXPIRED');
      if (!canTransition(trip.status, TripStatus.RECRUITING)) throw new ConflictException('INVALID_TRIP_TRANSITION');
      await tx.tripConfirmation.updateMany({ where: { tripId, status: ConfirmationStatus.CONFIRMED }, data: { status: ConfirmationStatus.VOID } });
      await tx.tripMember.updateMany({ where: { tripId, role: 'MEMBER', status: 'ACTIVE' }, data: { status: 'RELEASED' } });
      const updated = await tx.trip.update({ where: { id: tripId }, data: { status: TripStatus.RECRUITING, version: { increment: 1 } } });
      await this.audit(tx, tripId, userId, 'withdraw', { confirmationId });
      await this.audit(tx, tripId, userId, 'rollback', { reason: 'WITHDRAWAL_WINDOW' });
      await this.audit(tx, tripId, userId, 'notify-members', { memberIds: (trip.members ?? []).map((member: any) => member.userId), type: 'CONFIRMATION_ROLLBACK' });
      if (tx.notificationEvent?.createMany) {
        await tx.notificationEvent.createMany({ data: (trip.members ?? []).map((member: any) => ({
          type: 'CONFIRMATION_ROLLBACK', tripId, userId: member.userId,
          payload: { confirmationId, status: TripStatus.RECRUITING }, status: 'PENDING',
        })) });
      }
      return { confirmation: { ...confirmation, status: ConfirmationStatus.VOID }, tripStatus: updated.status, duplicate: false };
    });
  }

  private async audit(tx: any, tripId: string, actorId: string, action: string, payload: any) {
    if (tx.auditLog?.create) await tx.auditLog.create({ data: { tripId, actorId, action, payload } });
  }
}
