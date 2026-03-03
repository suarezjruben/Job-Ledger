const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

export interface CalendarCell {
  isoDate: string;
  dayNumber: number;
  inMonth: boolean;
  isToday: boolean;
}

export function todayIsoDate(): string {
  return dateToIso(new Date());
}

export function parseIsoDate(value: string): Date {
  const match = DATE_PATTERN.exec(value);

  if (!match) {
    throw new Error(`Invalid date string: ${value}`);
  }

  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day), 12, 0, 0, 0);
}

export function dateToIso(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

export function startOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), 1, 12, 0, 0, 0);
}

export function endOfMonth(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth() + 1, 0, 12, 0, 0, 0);
}

export function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(value: Date, months: number): Date {
  return new Date(value.getFullYear(), value.getMonth() + months, 1, 12, 0, 0, 0);
}

export function buildMonthGrid(referenceMonth: Date): CalendarCell[] {
  const monthStart = startOfMonth(referenceMonth);
  const firstWeekday = monthStart.getDay();
  const gridStart = addDays(monthStart, -firstWeekday);
  const today = todayIsoDate();

  return Array.from({ length: 42 }, (_, index) => {
    const current = addDays(gridStart, index);
    const isoDate = dateToIso(current);

    return {
      isoDate,
      dayNumber: current.getDate(),
      inMonth: current.getMonth() === referenceMonth.getMonth(),
      isToday: isoDate === today
    };
  });
}

export function isDateWithinRange(date: string, startDate: string, endDate: string): boolean {
  return startDate <= date && date <= endDate;
}

export function rangeOverlaps(
  rangeStart: string,
  rangeEnd: string,
  targetStart: string,
  targetEnd: string
): boolean {
  return rangeStart <= targetEnd && targetStart <= rangeEnd;
}

export function formatDateRange(startDate: string, endDate: string): string {
  if (startDate === endDate) {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    }).format(parseIsoDate(startDate));
  }

  const formatter = new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric'
  });

  return `${formatter.format(parseIsoDate(startDate))} - ${formatter.format(parseIsoDate(endDate))}`;
}

export function monthLabel(referenceMonth: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'long',
    year: 'numeric'
  }).format(referenceMonth);
}
