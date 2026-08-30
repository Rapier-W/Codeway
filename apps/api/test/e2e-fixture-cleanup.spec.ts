import { cleanupTripFixtures } from './e2e-fixture-cleanup';

it('cleans each trip fixture inside one transaction', async () => {
  const calls: string[] = [];
  const names = ['fareOrder', 'farePlanRevision', 'review', 'paymentMark', 'fareOrderConfirmation', 'fareDispute', 'farePlanChangeDecision', 'farePlanChangeRequest', 'farePlanConfirmation', 'objectUpload', 'rideRecord', 'vehicleUpdate', 'chatMessage', 'sosEvent', 'recommendationDecision', 'report', 'notificationEvent', 'auditLog', 'analyticsEvent', 'tripConfirmation', 'tripMember', 'trip'];
  const tx: any = {};
  for (const name of names) {
    tx[name] = {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => { calls.push(`${name}.deleteMany`); }),
      delete: jest.fn(async () => { calls.push(`${name}.delete`); }),
    };
  }
  const transaction = jest.fn(async (fn: (client: any) => Promise<void>) => fn(tx));
  await cleanupTripFixtures({ $transaction: transaction }, ['trip-1']);
  expect(transaction).toHaveBeenCalledTimes(1);
  expect(calls.at(-1)).toBe('trip.delete');
});
