export class CreateTripDto {
  origin!: string;
  destination!: string;
  departTime!: string;
  capacity!: number;
  feePlan?: unknown;
  femaleOnly?: boolean;
}
