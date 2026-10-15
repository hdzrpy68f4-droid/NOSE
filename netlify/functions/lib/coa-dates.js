'use strict';
/* NOSE - a date printed on a lab report, as an ISO day, or null.
 *
 *   isoDate('07/14/2025')              '2025-07-14'
 *   isoDate('7/4/2025')                '2025-07-04'
 *   isoDate('07/14/25')                '2025-07-14'
 *   isoDate('2025-07-14')              '2025-07-14'
 *   isoDate('Jul 14, 2025')            '2025-07-14'
 *   isoDate('8/27/2026, 4:00:00 AM')   '2026-08-27'
 *   isoDate('11/08/24 11:59')          '2024-11-08'
 *   anything else                      null
 *
 * Why this exists: the parser keeps harvestDate and reportDate as the lab
 * printed them, and printed dates do not sort as text - "11/17/2025" sorts
 * after "07/07/2026". An ISO day sorts correctly. The parser emits the ISO
 * form as harvestOn and reportOn (additive, PARSER-HANDOFF s7), which the
 * archive's harvest_on and report_on columns read (s13), and as testedOn -
 * the day the lab finished - which tested_on reads.
 *
 * Only forms a US lab cannot mean two ways are read, and only when they are
 * the WHOLE value:
 *
 *   M/D/YYYY       month, then day, one or two digits each, four-digit year:
 *                  "07/14/2025", and Method's "8/27/2026" (since 2026-10-14)
 *   M/D/YY         the same with a two-digit year, read as 20YY - how Kaycha
 *                  prints its dates ("07/07/25"). With the floor and the today
 *                  rule below, only years from 14 to the current one can
 *                  read; a 19YY date would fall under the floor anyway
 *   YYYY-MM-DD     two digits each for month and day, as ISO writes them
 *   Mon D, YYYY    a three-letter English month (any case), a one- or
 *                  two-digit day, a comma, a four-digit year
 *
 * Any of the four may be followed by a time of day, after a space or a comma
 * (since 2026-10-14): H:MM or H:MM:SS, then AM, PM or nothing - Method's
 * "8/27/2026, 4:00:00 AM", Modern Canna's "11/08/24 11:59", ACT's
 * "07/29/2025 18:04". The time is checked - an hour of 0-23, or 1-12 before
 * AM or PM, minutes and seconds 00-59 - and dropped: the field is a day, and
 * the day is the one printed, never moved by the time beside it. A time with
 * a zone, a "T", a fraction of a second or anything after it is not one of
 * these, and the whole value reads null.
 *
 * Everything else is null, including forms that look close: a one- or
 * three-digit year, a full month name, a dotted or day-first date, a
 * one-digit month or day in an ISO day ("2025-7-14"). Each would be one more
 * line here; the reason to add one is a prompt asking for it, not a guess at
 * what labs print. (MM/DD/YY was added that way on 2026-09-23; the one-digit
 * month or day and the time of day on 2026-10-14, Prompt 7.)
 *
 * Null as well, whatever the form:
 *   - a day the calendar does not have ("02/30/2025") - which is also why a
 *     day-first date whose day is over 12 ("14/07/2025") reads null
 *   - a day after today, UTC - a report cannot be dated after it was fetched
 *   - a day before 2014-01-01, the floor set for this field
 *
 * Right or null, never a guess: a null date is listed as undated by the
 * analysis scripts, never placed.
 *
 * Nothing here reads or changes how the parser reads a report.
 */

const EARLIEST = '2014-01-01';

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

const US_SLASHED = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;           // M/D/YYYY
const US_SHORT_YEAR = /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/;        // M/D/YY, read as 20YY
const ISO_DAY = /^(\d{4})-(\d{2})-(\d{2})$/;                     // YYYY-MM-DD
const MONTH_NAMED = /^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/;    // Mon D, YYYY

/* A date, then a time of day: ", 4:00:00 AM", " 11:59", " 18:04". */
const WITH_TIME = /^(.+?)(?:,\s*|\s+)(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([AaPp][Mm]))?$/;

const pad = n => String(n).padStart(2, '0');

/* Today as the archive counts days: UTC. */
const todayUtc = (now = new Date()) => now.toISOString().slice(0, 10);

/* 'YYYY-MM-DD' when year, month and day name a real day, else null. */
function calendarDay(year, month, day) {
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

/* The date part of a value that ends in a time of day, or the value itself
   when it ends in none. Null when it ends in something shaped like a time
   that is not one: "25:00", "10:60", "0:30 AM". */
function withoutTime(value) {
  const m = WITH_TIME.exec(value);
  if (!m) return value;
  const [, date, h, min, sec, half] = m;
  const hour = Number(h);
  const hourOk = half ? hour >= 1 && hour <= 12 : hour <= 23;
  if (!hourOk || Number(min) > 59 || (sec !== undefined && Number(sec) > 59)) return null;
  return date;
}

function parts(value) {
  let m = US_SLASHED.exec(value);
  if (m) return [Number(m[3]), Number(m[1]), Number(m[2])];
  m = US_SHORT_YEAR.exec(value);
  if (m) return [2000 + Number(m[3]), Number(m[1]), Number(m[2])];
  m = ISO_DAY.exec(value);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  m = MONTH_NAMED.exec(value);
  if (m) {
    const month = MONTHS.indexOf(m[1].toLowerCase()) + 1;
    return month ? [Number(m[3]), month, Number(m[2])] : null;
  }
  return null;
}

/**
 * @param {unknown} raw   the lab's printed date, e.g. the parser's harvestDate
 * @param {{today?: string}} [opts]  'YYYY-MM-DD'; defaults to today, UTC
 * @returns {string|null} 'YYYY-MM-DD', or null
 */
function isoDate(raw, { today = todayUtc() } = {}) {
  if (typeof raw !== 'string') return null;
  const date = withoutTime(raw.trim());
  if (date === null) return null;
  const p = parts(date);
  if (!p) return null;
  const day = calendarDay(p[0], p[1], p[2]);
  if (!day || day < EARLIEST || day > today) return null;
  return day;
}

module.exports = { isoDate, todayUtc, EARLIEST };
