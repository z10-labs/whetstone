/**
 * Natural time in the capture field. "ping the reviewer in 30m", "review the
 * PR tomorrow at 2pm", "remind me to rotate keys mon 10am" — the clock phrase
 * is lifted out of the title and turned into a `dueAt`, so capture stays one
 * field and one keystroke even when it carries a time.
 *
 * Pure functions over strings and epoch millis. Deliberately small: a phrase
 * has to sit at the start or the end of the text, and a bare number is never
 * a time ("build task 33" stays exactly that). Anything the grammar doesn't
 * cover falls through to the chips and the picker.
 */

import type { BrainKind } from '@shared/brain';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** Default hour when a day is named without a time. */
const MORNING = 9;
/** What "tonight" means. */
const EVENING = 18;
/** "at 3" with no meridiem: hours below this read as afternoon. */
const AFTERNOON_BELOW = 8;

export interface ParsedWhen {
  /** The text with the clock phrase removed and tidied. */
  title: string;
  dueAt: number | null;
  /** The phrase that was lifted, for echoing back; null when nothing matched. */
  matched: string | null;
}

export interface ParsedCapture extends ParsedWhen {
  kind: BrainKind;
}

const RELATIVE = String.raw`in\s+(\d{1,3})\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days|w|wk|week|weeks)\b`;
const CLOCK = String.raw`(?:at\s+)?(\d{1,2}):(\d{2})\s*(am|pm)?|at\s+(\d{1,2})\s*(am|pm)?|(\d{1,2})\s*(am|pm)`;
const WEEKDAY = String.raw`mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?|sun(?:day)?`;
const DAYWORD = String.raw`(today|tonight|tomorrow|tmrw|(?:next\s+)?(?:${WEEKDAY}))\b`;
/** A day word, optionally followed by a clock. */
const DAY_THEN_CLOCK = String.raw`(?:on\s+)?${DAYWORD}(?:\s+(?:at\s+)?(?:${CLOCK}))?`;

const PHRASE = String.raw`(?:${RELATIVE}|${DAY_THEN_CLOCK}|${CLOCK})`;
/** Phrase at the very end, or at the very start followed by a separator. */
const AT_END = new RegExp(String.raw`(?:^|[\s,;:—–-]+)${PHRASE}\s*$`, 'i');
const AT_START = new RegExp(String.raw`^${PHRASE}(?:\s*[,;:—–-]+\s*|\s+)`, 'i');

const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

function tidy(text: string): string {
  return text
    .replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function relativeMs(n: number, unit: string): number {
  if (unit.startsWith('m')) return n * MINUTE;
  if (unit.startsWith('h')) return n * HOUR;
  if (unit.startsWith('d')) return n * DAY;
  return n * 7 * DAY;
}

/** Local midnight of the day `now` falls in, shifted by `days`. */
function dayStart(now: number, days: number): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

/** 0-6 days ahead to the next named weekday, strictly after today. */
function daysUntil(now: number, weekday: string): number {
  const want = WEEKDAYS.indexOf(weekday.slice(0, 3));
  const today = new Date(now).getDay();
  const ahead = (want - today + 7) % 7;
  return ahead === 0 ? 7 : ahead;
}

/** Resolve an hour/minute/meridiem trio into a 24h hour and minutes. */
function resolveClock(hourText: string, minuteText: string | undefined, meridiem: string | undefined) {
  let hour = Number(hourText);
  const minute = minuteText ? Number(minuteText) : 0;
  if (hour > 23 || minute > 59) return null;
  if (meridiem) {
    if (hour > 12 || hour === 0) return null;
    if (meridiem.toLowerCase() === 'pm' && hour < 12) hour += 12;
    if (meridiem.toLowerCase() === 'am' && hour === 12) hour = 0;
  } else if (!minuteText && hour < AFTERNOON_BELOW) {
    hour += 12;
  }
  return { hour, minute };
}

interface Pieces {
  relN?: string;
  relUnit?: string;
  dayWord?: string;
  clockHour?: string;
  clockMinute?: string;
  meridiem?: string;
}

/** Pull the meaningful captures out of a PHRASE match, whichever branch fired. */
function pieces(m: RegExpMatchArray): Pieces {
  // Group layout follows PHRASE: RELATIVE(2) · DAYWORD(1) · CLOCK(7) · CLOCK(7).
  const [, relN, relUnit, dayWord, ...rest] = m;
  const clockA = rest.slice(0, 7);
  const clockB = rest.slice(7, 14);
  const clock = clockA.some(Boolean) ? clockA : clockB;
  const [h1, m1, mer1, h2, mer2, h3, mer3] = clock;
  return {
    relN,
    relUnit,
    dayWord,
    clockHour: h1 ?? h2 ?? h3,
    clockMinute: m1,
    meridiem: mer1 ?? mer2 ?? mer3,
  };
}

function resolve(p: Pieces, now: number): number | null {
  if (p.relN && p.relUnit) return now + relativeMs(Number(p.relN), p.relUnit);

  const clock = p.clockHour ? resolveClock(p.clockHour, p.clockMinute, p.meridiem) : null;
  if (p.clockHour && !clock) return null;

  if (p.dayWord) {
    const word = p.dayWord.toLowerCase().replace(/^next\s+/, '');
    let base: Date;
    let hour = MORNING;
    if (word === 'today') {
      if (!clock) return null;
      base = dayStart(now, 0);
    } else if (word === 'tonight') {
      base = dayStart(now, 0);
      hour = EVENING;
    } else if (word === 'tomorrow' || word === 'tmrw') {
      base = dayStart(now, 1);
    } else {
      base = dayStart(now, daysUntil(now, word));
    }
    // "tonight at 8" is 20:00 whatever the bare-hour rule says elsewhere.
    const clockHour =
      clock && word === 'tonight' && !p.meridiem && clock.hour < 12 ? clock.hour + 12 : clock?.hour;
    base.setHours(clockHour ?? hour, clock?.minute ?? 0, 0, 0);
    const at = base.getTime();
    // "tonight" after 18:00 has already gone; roll it to tomorrow evening.
    return at <= now && word === 'tonight' ? at + DAY : at;
  }

  if (clock) {
    const base = dayStart(now, 0);
    base.setHours(clock.hour, clock.minute, 0, 0);
    const at = base.getTime();
    return at <= now ? at + DAY : at;
  }

  return null;
}

/** Lift a clock phrase out of `text`. Never throws; unmatched text is returned as-is. */
export function parseWhen(text: string, now: number = Date.now()): ParsedWhen {
  const untouched = { title: tidy(text), dueAt: null, matched: null };
  for (const re of [AT_END, AT_START]) {
    const m = text.match(re);
    if (!m) continue;
    const dueAt = resolve(pieces(m), now);
    if (dueAt === null) continue;
    const matched = tidy(m[0]);
    const title = tidy(text.slice(0, m.index) + ' ' + text.slice((m.index ?? 0) + m[0].length));
    // The whole line was the time ("in 30m"): there are no other words to be
    // the title, so the phrase stays as the title and still sets the clock.
    return { title: title || matched, dueAt, matched };
  }
  return untouched;
}

const REMIND_PREFIX = /^\s*(?:remind(?:er)?(?:\s+me)?(?:\s+to)?|reminder)\s*[:,-]?\s+/i;

/**
 * Read a capture line the way a person wrote it. "remind me to …" makes it a
 * reminder whatever mode is selected; a jot that names a time is a reminder
 * too, since a jot by definition has no clock. Tasks keep their kind and
 * carry the time as a due date.
 */
export function parseCapture(text: string, kind: BrainKind, now: number = Date.now()): ParsedCapture {
  const prefixed = REMIND_PREFIX.test(text);
  const when = parseWhen(text.replace(REMIND_PREFIX, ''), now);
  const promoted = prefixed || (kind === 'jot' && when.dueAt !== null);
  return { ...when, kind: promoted ? 'reminder' : kind };
}
