type CleanupClient = {
  fareOrder: any; farePlanRevision: any; review: any; paymentMark: any;
  fareOrderConfirmation: any; fareDispute: any; farePlanChangeDecision: any;
  farePlanChangeRequest: any; farePlanConfirmation: any; objectUpload: any;
  rideRecord: any; vehicleUpdate: any; chatMessage: any; sosEvent: any;
  recommendationDecision: any; report: any; notificationEvent: any;
  auditLog: any; analyticsEvent: any; tripConfirmation: any; tripMember: any;
  trip: any;
};

export async function cleanupTripFixtures(prisma: { $transaction: (fn: (tx: CleanupClient) => Promise<void>) => Promise<void>; }, ids: string[]) {
  for (const id of ids) {
    await prisma.$transaction(async (tx) => {
      const orders = await tx.fareOrder.findMany({ where: { tripId: id }, select: { id: true } });
      const revisions = await tx.farePlanRevision.findMany({ where: { tripId: id }, select: { id: true } });
      const orderIds = orders.map((item: { id: string }) => item.id);
      const revisionIds = revisions.map((item: { id: string }) => item.id);
      if (orderIds.length) {
        await tx.review.deleteMany({ where: { tripId: id } });
        await tx.paymentMark.deleteMany({ where: { fareOrderId: { in: orderIds } } });
        await tx.fareOrderConfirmation.deleteMany({ where: { fareOrderId: { in: orderIds } } });
        await tx.fareDispute.deleteMany({ where: { fareOrderId: { in: orderIds } } });
      }
      if (revisionIds.length) {
        await tx.farePlanChangeDecision.deleteMany({ where: { request: { tripId: id } } });
        await tx.farePlanChangeRequest.deleteMany({ where: { tripId: id } });
        await tx.farePlanConfirmation.deleteMany({ where: { revisionId: { in: revisionIds } } });
        await tx.farePlanRevision.deleteMany({ where: { id: { in: revisionIds } } });
      }
      await tx.fareOrder.deleteMany({ where: { tripId: id } });
      await tx.objectUpload.deleteMany({ where: { tripId: id } });
      await tx.rideRecord.deleteMany({ where: { tripId: id } });
      await tx.vehicleUpdate.deleteMany({ where: { tripId: id } });
      await tx.chatMessage.deleteMany({ where: { tripId: id } });
      await tx.sosEvent.deleteMany({ where: { tripId: id } });
      await tx.recommendationDecision.deleteMany({ where: { tripId: id } });
      await tx.report.deleteMany({ where: { tripId: id } });
      await tx.notificationEvent.deleteMany({ where: { tripId: id } });
      await tx.auditLog.deleteMany({ where: { tripId: id } });
      await tx.analyticsEvent.deleteMany({ where: { tripId: id } });
      await tx.tripConfirmation.deleteMany({ where: { tripId: id } });
      await tx.tripMember.deleteMany({ where: { tripId: id } });
      await tx.trip.delete({ where: { id } });
    });
  }
}
