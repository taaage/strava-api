export interface RideStream {
  activityId: number;
  date: string;
  name: string;
  watts: number[];
  heartrate: number[] | null;
  cadence: number[] | null;
}
