import type { IsoDate } from '../../shared/ledger';
import { won } from '../ui';

const weekday = ['일', '월', '화', '수', '목', '금', '토'];
const parts = (date: IsoDate) => date.split('-').map(Number) as [number, number, number];

/** Day of week from the calendar date alone, independent of the browser time zone. */
export const weekdayOf = (date: IsoDate) => {
  const [year, month, day] = parts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
};
export const addDays = (date: IsoDate, days: number) => {
  const [year, month, day] = parts(date);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
};
/** "10/29" */
export const shortDate = (date: IsoDate) => {
  const [, month, day] = parts(date);
  return `${month}/${day}`;
};
/** "10월 29일 (목)" */
export const dayLabel = (date: IsoDate) => {
  const [, month, day] = parts(date);
  return `${month}월 ${day}일 (${weekday[weekdayOf(date)]})`;
};
/** "10/23 – 11/22" */
export const periodLabel = (period: { start: IsoDate; end: IsoDate }) =>
  `${shortDate(period.start)} – ${shortDate(period.end)}`;
/** "오후 8:12" for today, otherwise "10월 29일". Reads the recorded local time as written. */
export const whenLabel = (timestamp: string, today: IsoDate) => {
  const date = timestamp.slice(0, 10);
  if (date !== today) {
    const [, month, day] = parts(date);
    return `${month}월 ${day}일`;
  }
  const [hour, minute] = timestamp.slice(11, 16).split(':').map(Number);
  return `${hour < 12 ? '오전' : '오후'} ${hour % 12 || 12}:${String(minute).padStart(2, '0')}`;
};
/** Calendar cells: "9,550", "6.4만", "274만". */
export const compactWon = (value: number) => {
  if (value < 10000) return won(value);
  const man = value / 10000;
  return `${man >= 10 ? Math.round(man) : Math.round(man * 10) / 10}만`;
};
/** Same day n months later, clamped to the month's last day (1/31 → 2/28). */
export const addMonths = (date: IsoDate, months: number) => {
  const [year, month, day] = parts(date);
  const last = new Date(Date.UTC(year, month - 1 + months + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1 + months, Math.min(day, last)))
    .toISOString()
    .slice(0, 10);
};
/** "2026년 11월" from "2026-11". */
export const monthLabel = (month: string) => {
  const [year, value] = month.split('-').map(Number);
  return `${year}년 ${value}월`;
};
