export const TripStatus = {
  RECRUITING: 'RECRUITING',
  CONFIRMING: 'CONFIRMING',
  FORMED: 'FORMED',
  WAITING_RIDE: 'WAITING_RIDE',
  RIDE_BOOKED: 'RIDE_BOOKED',
  PENDING_SETTLEMENT: 'PENDING_SETTLEMENT',
  SETTLED: 'SETTLED',
  PENDING_REVIEW: 'PENDING_REVIEW',
  ARCHIVED: 'ARCHIVED',
} as const;
export type TripStatusValue = typeof TripStatus[keyof typeof TripStatus];

export const ConfirmationStatus = {
  CONFIRMED: 'CONFIRMED',
  VOID: 'VOID',
} as const;

const transitions: Record<string, readonly string[]> = {
  [TripStatus.RECRUITING]: [TripStatus.CONFIRMING],
  [TripStatus.CONFIRMING]: [TripStatus.RECRUITING, TripStatus.FORMED],
  [TripStatus.FORMED]: [TripStatus.RECRUITING, TripStatus.WAITING_RIDE],
  [TripStatus.WAITING_RIDE]: [TripStatus.RIDE_BOOKED],
  [TripStatus.RIDE_BOOKED]: [TripStatus.PENDING_SETTLEMENT],
  [TripStatus.PENDING_SETTLEMENT]: [TripStatus.SETTLED],
  [TripStatus.SETTLED]: [TripStatus.PENDING_REVIEW],
  [TripStatus.PENDING_REVIEW]: [TripStatus.ARCHIVED],
};

export function canTransition(from: string, to: string) {
  return from === to || transitions[from]?.includes(to) === true;
}
