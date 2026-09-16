import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { FocusEventHandler, KeyboardEvent } from 'react';
import { CalendarDays, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { Popover, useControlLabel } from './Popover';

export interface DateFieldProps {
  value: string;
  onValueChange: (value: string) => void;
  id?: string;
  'aria-label'?: string;
  disabled?: boolean;
  required?: boolean;
  min?: string;
  max?: string;
  onFocus?: FocusEventHandler<HTMLElement>;
  onBlur?: FocusEventHandler<HTMLElement>;
  className?: string;
  name?: string;
}

type CalendarDate = { year: number; month: number; day: number };
const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
const pad = (value: number) => String(value).padStart(2, '0');
const yearText = (year: number) => String(year).padStart(4, '0');
const monthValue = (date: CalendarDate) => `${yearText(date.year)}-${pad(date.month)}`;
const dateValue = (date: CalendarDate) => `${monthValue(date)}-${pad(date.day)}`;

function localDate(date: CalendarDate) {
  const result = new Date(0);
  result.setFullYear(date.year, date.month - 1, date.day);
  result.setHours(12, 0, 0, 0);
  return result;
}

function fromLocalDate(date: Date): CalendarDate {
  return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
}

function today() {
  return fromLocalDate(new Date());
}

function parseDate(value?: string): CalendarDate | null {
  if (!value || !/^\d{4}-\d{2}(?:-\d{2})?$/.test(value)) return null;
  const [year, month, day = 1] = value.split('-').map(Number);
  if (year < 1 || year > 9999 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  const candidate = { year, month, day };
  return dateValue(fromLocalDate(localDate(candidate))) === dateValue(candidate) ? candidate : null;
}

function addDays(date: CalendarDate, delta: number) {
  const result = localDate(date);
  result.setDate(result.getDate() + delta);
  return fromLocalDate(result);
}

function daysInMonth(year: number, month: number) {
  return fromLocalDate(localDate({ year, month: month + 1, day: 0 })).day;
}

function addMonths(date: CalendarDate, delta: number): CalendarDate {
  const result = localDate({ ...date, day: 1 });
  result.setMonth(result.getMonth() + delta);
  const first = fromLocalDate(result);
  return { ...first, day: Math.min(date.day, daysInMonth(first.year, first.month)) };
}

function boundedDate(date: CalendarDate, min?: string, max?: string) {
  const floor = parseDate(min) ?? { year: 1, month: 1, day: 1 };
  const ceiling = parseDate(max) ?? { year: 9999, month: 12, day: 31 };
  if (dateValue(date) < dateValue(floor)) return floor;
  if (dateValue(date) > dateValue(ceiling)) return ceiling;
  return date;
}

function dateAllowed(date: CalendarDate, min?: string, max?: string) {
  return (
    date.year >= 1 &&
    date.year <= 9999 &&
    dateValue(boundedDate(date, min, max)) === dateValue(date)
  );
}

function monthAllowed(year: number, month: number, min?: string, max?: string) {
  const canonical = monthValue({ year, month, day: 1 });
  return (
    year >= 1 &&
    year <= 9999 &&
    (!min || canonical >= min.slice(0, 7)) &&
    (!max || canonical <= max.slice(0, 7))
  );
}

function monthLabel(date: CalendarDate) {
  return `${date.year}년 ${date.month}월`;
}

function fullDateLabel(date: CalendarDate) {
  return `${monthLabel(date)} ${date.day}일`;
}

function useFieldFocus(props: DateFieldProps) {
  const { ref, label } = useControlLabel(props['aria-label']);
  const onFocus: FocusEventHandler<HTMLElement> = (event) => {
    if (!ref.current?.contains(event.relatedTarget as Node | null)) props.onFocus?.(event);
  };
  const onBlur: FocusEventHandler<HTMLElement> = (event) => {
    if (!ref.current?.contains(event.relatedTarget as Node | null)) props.onBlur?.(event);
  };
  return { ref, label, onFocus, onBlur };
}

function useDateValidation(props: DateFieldProps, monthOnly = false) {
  const input = useRef<HTMLInputElement>(null);
  const [invalid, setInvalid] = useState(false);
  const kind = monthOnly ? '월을' : '날짜를';
  const selected = parseDate(props.value);
  let message = '';
  if (!props.value && props.required) message = `${kind} 선택해 주세요.`;
  else if (props.value) {
    const canonical = selected && (monthOnly ? monthValue(selected) : dateValue(selected));
    if (canonical !== props.value) message = `올바른 ${kind} 선택해 주세요.`;
    else if (
      selected &&
      !(monthOnly
        ? monthAllowed(selected.year, selected.month, props.min, props.max)
        : dateAllowed(selected, props.min, props.max))
    ) {
      message =
        props.min && props.max
          ? `${props.min}부터 ${props.max} 사이에서 선택해 주세요.`
          : props.min
            ? `${props.min} 이후로 선택해 주세요.`
            : `${props.max} 이전으로 선택해 주세요.`;
    }
  }
  useLayoutEffect(() => {
    input.current?.setCustomValidity(message);
    if (!message) setInvalid(false);
  }, [message]);
  return { input, invalid, setInvalid, message };
}

interface MonthGridProps {
  year: number;
  value: string;
  focusMonth: number;
  min?: string;
  max?: string;
  todayMonth: string;
  onSelect: (value: string) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, month: number) => void;
}

function MonthGrid({
  year,
  value,
  focusMonth,
  min,
  max,
  todayMonth,
  onSelect,
  onKeyDown,
}: MonthGridProps) {
  return (
    <div className="date-month-grid" role="grid" aria-label={`${year}년 월 선택`}>
      {Array.from({ length: 4 }, (_, row) => (
        <div className="date-month-row" role="row" key={row}>
          {Array.from({ length: 3 }, (_, column) => {
            const month = row * 3 + column + 1;
            const canonical = monthValue({ year, month, day: 1 });
            const selected = value.slice(0, 7) === canonical;
            return (
              <button
                type="button"
                role="gridcell"
                className={`date-month-option${selected ? ' is-selected' : ''}${canonical === todayMonth ? ' is-today' : ''}`}
                key={month}
                data-month={canonical}
                data-autofocus={month === focusMonth ? 'true' : undefined}
                aria-label={canonical}
                aria-selected={selected}
                aria-current={canonical === todayMonth ? 'date' : undefined}
                disabled={!monthAllowed(year, month, min, max)}
                tabIndex={month === focusMonth ? 0 : -1}
                onClick={() => onSelect(canonical)}
                onKeyDown={(event) => onKeyDown(event, month)}
              >
                {month}월
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export function DateField(props: DateFieldProps) {
  const { value, onValueChange, disabled, required, min, max, className, name } = props;
  const generatedId = useId();
  const id = props.id ?? `date-field-${generatedId}`;
  const field = useFieldFocus(props);
  const validation = useDateValidation(props);
  const [open, setOpen] = useState(false);
  const initial = boundedDate(parseDate(value) ?? today(), min, max);
  const [view, setView] = useState(initial);
  const [focused, setFocused] = useState(dateValue(initial));
  const [mode, setMode] = useState<'days' | 'months'>('days');
  const calendarRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const currentDay = today();
  const selected = parseDate(value);

  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    calendarRef.current?.querySelector<HTMLButtonElement>(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  }, [focused, view, mode]);

  const focusDay = (candidate: CalendarDate) => {
    const next = boundedDate(candidate, min, max);
    pendingFocus.current = `[data-date="${dateValue(next)}"]`;
    setView(next);
    setFocused(dateValue(next));
  };

  const dayKeyDown = (event: KeyboardEvent<HTMLButtonElement>, day: CalendarDate) => {
    let next: CalendarDate;
    switch (event.key) {
      case 'ArrowLeft':
        next = addDays(day, -1);
        break;
      case 'ArrowRight':
        next = addDays(day, 1);
        break;
      case 'ArrowUp':
        next = addDays(day, -7);
        break;
      case 'ArrowDown':
        next = addDays(day, 7);
        break;
      case 'Home':
        next = addDays(day, -localDate(day).getDay());
        break;
      case 'End':
        next = addDays(day, 6 - localDate(day).getDay());
        break;
      case 'PageUp':
        next = addMonths(day, event.shiftKey ? -12 : -1);
        break;
      case 'PageDown':
        next = addMonths(day, event.shiftKey ? 12 : 1);
        break;
      default:
        return;
    }
    event.preventDefault();
    focusDay(next);
  };

  const monthKeyDown = (event: KeyboardEvent<HTMLButtonElement>, month: number) => {
    let offset: number;
    switch (event.key) {
      case 'ArrowLeft':
        offset = -1;
        break;
      case 'ArrowRight':
        offset = 1;
        break;
      case 'ArrowUp':
        offset = -3;
        break;
      case 'ArrowDown':
        offset = 3;
        break;
      case 'Home':
        offset = 1 - month;
        break;
      case 'End':
        offset = 12 - month;
        break;
      case 'PageUp':
        offset = -12;
        break;
      case 'PageDown':
        offset = 12;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = boundedDate(addMonths({ year: view.year, month, day: 1 }, offset), min, max);
    pendingFocus.current = `[data-month="${monthValue(next)}"]`;
    setView(next);
  };

  const firstDay = { year: view.year, month: view.month, day: 1 };
  const gridStart = addDays(firstDay, -localDate(firstDay).getDay());
  const moveView = (offset: number) => {
    const next = boundedDate(addMonths(view, offset), min, max);
    setView(next);
    setFocused(dateValue(next));
  };

  return (
    <span
      ref={field.ref}
      className={`ui-field date-field ${className ?? ''}`}
      data-control-name={name}
      onFocus={field.onFocus}
      onBlur={field.onBlur}
    >
      <Popover
        label={`${field.label || '날짜'} 선택`}
        className="date-popover"
        matchTriggerWidth={false}
        preferredWidth={320}
        open={open}
        onOpenChange={(open) => {
          setOpen(open);
          if (!open) return;
          const next = boundedDate(parseDate(value) ?? today(), min, max);
          setView(next);
          setFocused(dateValue(next));
          setMode('days');
        }}
        trigger={(triggerProps) => (
          <button
            {...triggerProps}
            type="button"
            className="ui-control-trigger date-field-trigger"
            id={id}
            name={name}
            disabled={disabled}
            aria-label={field.label || '날짜'}
            aria-required={required || undefined}
            aria-invalid={validation.invalid || undefined}
            aria-describedby={validation.invalid ? `${id}-error` : undefined}
            data-value={value}
          >
            <span className={selected ? undefined : 'date-field-placeholder'}>
              {selected ? fullDateLabel(selected) : '날짜 선택'}
            </span>
            <CalendarDays size={18} aria-hidden="true" />
          </button>
        )}
      >
        {({ close }) => {
          const choose = (next: string) => {
            validation.setInvalid(false);
            onValueChange(next);
            close();
          };
          return (
            <div className="date-calendar" ref={calendarRef}>
              <div className="date-calendar-header">
                <button
                  type="button"
                  className="date-nav-button"
                  aria-label={mode === 'days' ? '이전 달' : '이전 연도'}
                  disabled={
                    mode === 'days'
                      ? !monthAllowed(addMonths(view, -1).year, addMonths(view, -1).month, min, max)
                      : view.year <= 1 || (!!min && view.year <= Number(min.slice(0, 4)))
                  }
                  onClick={() => moveView(mode === 'days' ? -1 : -12)}
                >
                  <ChevronLeft size={19} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="date-calendar-heading"
                  aria-label={
                    mode === 'days'
                      ? `${monthLabel(view)}, 월 선택`
                      : `${view.year}년, 날짜 선택으로 돌아가기`
                  }
                  onClick={() => {
                    pendingFocus.current =
                      mode === 'days'
                        ? `[data-month="${monthValue(view)}"]`
                        : `[data-date="${focused}"]`;
                    setMode(mode === 'days' ? 'months' : 'days');
                  }}
                >
                  <span aria-live="polite">
                    {mode === 'days' ? monthLabel(view) : `${view.year}년`}
                  </span>
                  <ChevronDown size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="date-nav-button"
                  aria-label={mode === 'days' ? '다음 달' : '다음 연도'}
                  disabled={
                    mode === 'days'
                      ? !monthAllowed(addMonths(view, 1).year, addMonths(view, 1).month, min, max)
                      : view.year >= 9999 || (!!max && view.year >= Number(max.slice(0, 4)))
                  }
                  onClick={() => moveView(mode === 'days' ? 1 : 12)}
                >
                  <ChevronRight size={19} aria-hidden="true" />
                </button>
              </div>
              {mode === 'months' ? (
                <MonthGrid
                  year={view.year}
                  value={value}
                  focusMonth={view.month}
                  min={min}
                  max={max}
                  todayMonth={monthValue(currentDay)}
                  onKeyDown={monthKeyDown}
                  onSelect={(next) => {
                    const target = boundedDate(parseDate(next)!, min, max);
                    setView(target);
                    setFocused(dateValue(target));
                    pendingFocus.current = `[data-date="${dateValue(target)}"]`;
                    setMode('days');
                  }}
                />
              ) : (
                <div className="date-day-grid" role="grid" aria-label={monthLabel(view)}>
                  <div className="date-week-row date-weekdays" role="row">
                    {weekdays.map((day) => (
                      <span key={day} role="columnheader" aria-label={`${day}요일`}>
                        {day}
                      </span>
                    ))}
                  </div>
                  {Array.from({ length: 6 }, (_, week) => (
                    <div className="date-week-row" role="row" key={week}>
                      {Array.from({ length: 7 }, (_, dayIndex) => {
                        const day = addDays(gridStart, week * 7 + dayIndex);
                        const canonical = dateValue(day);
                        const isSelected = canonical === value;
                        return (
                          <button
                            key={canonical}
                            type="button"
                            role="gridcell"
                            aria-label={canonical}
                            className={`date-day-option${day.month !== view.month ? ' is-outside' : ''}${isSelected ? ' is-selected' : ''}${canonical === dateValue(currentDay) ? ' is-today' : ''}`}
                            aria-selected={isSelected}
                            aria-current={canonical === dateValue(currentDay) ? 'date' : undefined}
                            data-date={canonical}
                            data-autofocus={canonical === focused ? 'true' : undefined}
                            tabIndex={canonical === focused ? 0 : -1}
                            disabled={!dateAllowed(day, min, max)}
                            onClick={() => choose(canonical)}
                            onKeyDown={(event) => dayKeyDown(event, day)}
                          >
                            {day.day}
                          </button>
                        );
                      })}
                    </div>
                  ))}
                </div>
              )}
              <div className="date-calendar-footer">
                {!required ? (
                  <button
                    type="button"
                    className="date-clear-button"
                    disabled={!value}
                    onClick={() => choose('')}
                  >
                    지우기
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="date-today-button"
                  disabled={!dateAllowed(currentDay, min, max)}
                  onClick={() => choose(dateValue(currentDay))}
                >
                  오늘
                </button>
              </div>
            </div>
          );
        }}
      </Popover>
      <input
        ref={validation.input}
        className="control-validation"
        type="text"
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onInvalid={(event) => {
          event.preventDefault();
          validation.setInvalid(true);
          const next = boundedDate(parseDate(value) ?? today(), min, max);
          setView(next);
          setFocused(dateValue(next));
          setMode('days');
          setOpen(true);
        }}
      />
      {validation.invalid && (
        <span className="control-error" id={`${id}-error`} role="alert">
          {validation.message}
        </span>
      )}
    </span>
  );
}

export function MonthField(props: DateFieldProps) {
  const { value, onValueChange, disabled, required, min, max, className, name } = props;
  const generatedId = useId();
  const id = props.id ?? `month-field-${generatedId}`;
  const field = useFieldFocus(props);
  const validation = useDateValidation(props, true);
  const [open, setOpen] = useState(false);
  const initial = boundedDate(parseDate(value) ?? today(), min, max);
  const [view, setView] = useState(initial);
  const calendarRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<string | null>(null);
  const currentMonth = monthValue(today());
  const selected = parseDate(value);

  useLayoutEffect(() => {
    if (!pendingFocus.current) return;
    calendarRef.current?.querySelector<HTMLButtonElement>(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  }, [view]);

  const monthKeyDown = (event: KeyboardEvent<HTMLButtonElement>, month: number) => {
    let offset: number;
    switch (event.key) {
      case 'ArrowLeft':
        offset = -1;
        break;
      case 'ArrowRight':
        offset = 1;
        break;
      case 'ArrowUp':
        offset = -3;
        break;
      case 'ArrowDown':
        offset = 3;
        break;
      case 'Home':
        offset = 1 - month;
        break;
      case 'End':
        offset = 12 - month;
        break;
      case 'PageUp':
        offset = -12;
        break;
      case 'PageDown':
        offset = 12;
        break;
      default:
        return;
    }
    event.preventDefault();
    const next = boundedDate(addMonths({ year: view.year, month, day: 1 }, offset), min, max);
    pendingFocus.current = `[data-month="${monthValue(next)}"]`;
    setView(next);
  };

  return (
    <span
      ref={field.ref}
      className={`ui-field date-field month-field ${className ?? ''}`}
      data-control-name={name}
      onFocus={field.onFocus}
      onBlur={field.onBlur}
    >
      <Popover
        label={`${field.label || '월'} 선택`}
        className="date-popover"
        matchTriggerWidth={false}
        preferredWidth={320}
        open={open}
        onOpenChange={(open) => {
          setOpen(open);
          if (open) setView(boundedDate(parseDate(value) ?? today(), min, max));
        }}
        trigger={(triggerProps) => (
          <button
            {...triggerProps}
            type="button"
            className="ui-control-trigger date-field-trigger"
            id={id}
            name={name}
            disabled={disabled}
            aria-label={field.label || '월'}
            aria-required={required || undefined}
            aria-invalid={validation.invalid || undefined}
            aria-describedby={validation.invalid ? `${id}-error` : undefined}
            data-value={value}
          >
            <span className={selected ? undefined : 'date-field-placeholder'}>
              {selected ? monthLabel(selected) : '월 선택'}
            </span>
            <CalendarDays size={18} aria-hidden="true" />
          </button>
        )}
      >
        {({ close }) => {
          const choose = (next: string) => {
            validation.setInvalid(false);
            onValueChange(next);
            close();
          };
          return (
            <div className="date-calendar date-month-calendar" ref={calendarRef}>
              <div className="date-calendar-header">
                <button
                  type="button"
                  className="date-nav-button"
                  aria-label="이전 연도"
                  disabled={view.year <= 1 || (!!min && view.year <= Number(min.slice(0, 4)))}
                  onClick={() => setView(boundedDate(addMonths(view, -12), min, max))}
                >
                  <ChevronLeft size={19} aria-hidden="true" />
                </button>
                <span className="date-calendar-heading" aria-live="polite">
                  {view.year}년
                </span>
                <button
                  type="button"
                  className="date-nav-button"
                  aria-label="다음 연도"
                  disabled={view.year >= 9999 || (!!max && view.year >= Number(max.slice(0, 4)))}
                  onClick={() => setView(boundedDate(addMonths(view, 12), min, max))}
                >
                  <ChevronRight size={19} aria-hidden="true" />
                </button>
              </div>
              <MonthGrid
                year={view.year}
                value={value}
                focusMonth={view.month}
                min={min}
                max={max}
                todayMonth={currentMonth}
                onSelect={choose}
                onKeyDown={monthKeyDown}
              />
              <div className="date-calendar-footer">
                {!required ? (
                  <button
                    type="button"
                    className="date-clear-button"
                    disabled={!value}
                    onClick={() => choose('')}
                  >
                    지우기
                  </button>
                ) : (
                  <span />
                )}
                <button
                  type="button"
                  className="date-today-button"
                  disabled={!monthAllowed(today().year, today().month, min, max)}
                  onClick={() => choose(currentMonth)}
                >
                  이번 달
                </button>
              </div>
            </div>
          );
        }}
      </Popover>
      <input
        ref={validation.input}
        className="control-validation"
        type="text"
        aria-hidden="true"
        tabIndex={-1}
        name={name}
        value={value}
        required={required}
        disabled={disabled}
        onChange={() => {}}
        onInvalid={(event) => {
          event.preventDefault();
          validation.setInvalid(true);
          setView(boundedDate(parseDate(value) ?? today(), min, max));
          setOpen(true);
        }}
      />
      {validation.invalid && (
        <span className="control-error" id={`${id}-error`} role="alert">
          {validation.message}
        </span>
      )}
    </span>
  );
}
