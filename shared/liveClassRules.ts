export const LIVE_CLASS_DURATION_MINUTES = 40;
export const LIVE_CLASS_DURATION_MS = LIVE_CLASS_DURATION_MINUTES * 60 * 1000;

export function hasValidLiveClassDuration(start: string | Date, end: string | Date) {
  const startTime = new Date(start).getTime();
  const endTime = new Date(end).getTime();
  return Number.isFinite(startTime) &&
    Number.isFinite(endTime) &&
    endTime > startTime &&
    endTime - startTime === LIVE_CLASS_DURATION_MS;
}
