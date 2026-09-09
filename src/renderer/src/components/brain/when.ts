/**
 * Clock helpers for the Brain. Pure functions over epoch millis — the only
 * place the app turns a timestamp into words, so "in 25m" reads the same
 * wherever it appears.
 */

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** One-tap reminder times. Enough to catch a thought without opening a picker. */
export interface QuickWhen {
  label: string;
  at: (now: number) => number;
}

/** Today at `hour`:00 if that is still ahead, otherwise tomorrow. */
function nextAtHour(now: number, hour: number): number {
  const target = new Date(now);
  target.setHours(hour, 0, 0, 0);
  if (target.getTime() <= now) target.setDate(target.getDate() + 1);
  return target.getTime();
}

export const QUICK_WHENS: QuickWhen[] = [
  { label: '30m', at: (now) => now + 30 * MINUTE },
  { label: '2h', at: (now) => now + 2 * HOUR },
  { label: 'Tonight', at: (now) => nextAtHour(now, 18) },
  { label: 'Tomorrow', at: (now) => nextAtHour(now, 9) },
];

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** `14:30` */
export function clockLabel(ms: number): string {
  const d = new Date(ms);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * How a due time reads on a card: overdue in plain minutes ("14m late"),
 * imminent as a countdown, and further out anchored to a day.
 */
export function formatDue(dueAt: number, now: number = Date.now()): string {
  const delta = dueAt - now;
  // Inside a minute either way reads as "now" — rounding up to "1m late" the
  // instant a reminder fires is just noise.
  if (Math.abs(delta) < MINUTE) return 'now';
  const mins = Math.round(Math.abs(delta) / MINUTE);

  if (delta < 0) {
    if (mins < 60) return `${mins}m late`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h late`;
    return `${Math.round(hours / 24)}d late`;
  }

  if (mins < 60) return `in ${mins}m`;

  const due = new Date(dueAt);
  const today = new Date(now);
  if (isSameDay(due, today)) return `${clockLabel(dueAt)} today`;

  const tomorrow = new Date(now + DAY);
  if (isSameDay(due, tomorrow)) return `${clockLabel(dueAt)} tomorrow`;

  const weekday = due.toLocaleDateString(undefined, { weekday: 'short' });
  if (delta < 6 * DAY) return `${weekday} ${clockLabel(dueAt)}`;
  return `${due.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${clockLabel(dueAt)}`;
}

/** Epoch millis → the `YYYY-MM-DDTHH:mm` a `datetime-local` input wants. */
export function toLocalInputValue(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** `datetime-local` value → epoch millis, or null if it is empty or invalid. */
export function fromLocalInputValue(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isNaN(ms) ? null : ms;
}
