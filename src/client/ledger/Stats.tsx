import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';
import {
  Amount,
  Button,
  Empty,
  Field,
  List,
  SegmentedControl,
  SelectField,
  SelectOption,
  Stack,
  StatBar,
  Switch,
  isHexColor,
  won,
} from '../ui';
import {
  KIND_AXIS,
  STAT_BUCKETS,
  STAT_CHARTS,
  breakdown,
  defaultStatAxis,
  partAxes,
  statAxes,
  type IsoDate,
  type KindOption,
  type Ledger,
  type LedgerRecord,
  type Share,
  type StatCard,
} from '../../shared/ledger';
import { addDays, addMonths, dayLabel, monthLabel, shortDate, weekdayOf } from './format';

const NATURE = { expense: '지출', income: '수입' } as const;
const CHART = { total: '요약', rank: '순위', donut: '비율', trend: '추이' } as const;
const BUCKET = { day: '날짜', week: '주', month: '월' } as const;
const BUCKET_UNIT = { day: '일', week: '주', month: '월' } as const;
/** The folded tail of a donut or a stack; a neutral that no tag color is mistaken for. */
const OTHER = '#B5A898';
const color = (value: string) => (isHexColor(value) ? value : OTHER);

/** The 기준 a chart groups by: the one asked for while the ledgers still have it, else a default. */
export function chartAxis(card: StatCard, ledgers: Ledger[], axis = card.axis) {
  if (card.chart === 'total') return undefined;
  if (card.chart === 'trend') return axis && partAxes(ledgers).includes(axis) ? axis : undefined;
  const axes = card.chart === 'donut' ? partAxes(ledgers) : statAxes(ledgers);
  if (axis && axes.includes(axis)) return axis;
  return card.chart === 'donut' ? KIND_AXIS : defaultStatAxis(ledgers);
}

/** "카테고리별 지출 순위"; without the axis, the short title shown beside the 기준 switch. */
export function statCardTitle(card: StatCard, axis?: string) {
  const nature = NATURE[card.nature];
  if (card.chart === 'total') return `${nature} 요약`;
  if (card.chart === 'trend')
    return `${BUCKET[card.bucket ?? 'day']}별 ${nature}${axis ? ` · ${axis}별` : ''}`;
  return `${axis ? `${axis}별 ` : ''}${nature} ${CHART[card.chart]}`;
}

const ofNature = (records: LedgerRecord[], ledgers: Ledger[], nature: KindOption['nature']) => {
  const natures = new Map(
    ledgers.flatMap((ledger) => ledger.kinds.map((kind) => [kind.id, kind.nature])),
  );
  return records.filter((record) => natures.get(record.kindId) === nature);
};
const sum = (records: LedgerRecord[]) =>
  records.reduce((total, record) => total + record.amount, 0);
const percent = (value: number, total: number) =>
  `${total > 0 ? Math.round((value / total) * 1000) / 10 : 0}%`;

/** At most six parts: the five largest and 기타 for the rest. */
function folded(shares: Share[]): Share[] {
  if (shares.length <= 6) return shares;
  const rest = shares.slice(5).reduce((total, share) => total + share.value, 0);
  return [...shares.slice(0, 5), { name: '기타', color: OTHER, value: rest }];
}

/**
 * One chart on the 통계 tab, over the room's records as the 조회 조건 leave them. Its 기준 can be
 * switched for now (and kept by the owner); choosing a tag narrows every chart to it.
 */
export function StatCardView({
  card,
  records,
  ledgers,
  period,
  today,
  axis,
  onAxisChange,
  onSaveAxis,
  onSelect,
  actions,
}: {
  card: StatCard;
  records: LedgerRecord[];
  ledgers: Ledger[];
  /** The room's period: 요약 averages over its days so far, 추이 lays out its columns. */
  period: { start: IsoDate; end: IsoDate };
  today: IsoDate;
  /** A 기준 picked for now, over the card's own. */
  axis?: string;
  onAxisChange?(axis: string): void;
  /** Offered while the 기준 picked for now differs from the card's own. */
  onSaveAxis?(): void;
  onSelect?(axis: string, name: string): void;
  /** 편집's controls, shown in place of the 기준 switch. */
  actions?: ReactNode;
}) {
  const heading = useId();
  const shown = chartAxis(card, ledgers, axis ?? card.axis);
  const switching = !actions && onAxisChange && card.chart !== 'total';
  const title = statCardTitle(card, switching ? undefined : shown);
  const own = ofNature(records, ledgers, card.nature);
  const empty = `${records.length ? '조건에 맞는 ' : ''}${NATURE[card.nature]}이 없어요.`;
  return (
    <section
      className="ledger-stat-card"
      aria-labelledby={heading}
      data-chart={card.chart}
      data-wide={card.wide || undefined}
    >
      <div className="ledger-stat-card-head">
        <h2 id={heading}>{title}</h2>
        {actions}
        {switching && (
          <SelectField
            aria-label={`${title} 기준`}
            className="ledger-stat-axis"
            value={shown ?? ''}
            onValueChange={onAxisChange}
          >
            {card.chart === 'trend' && <SelectOption value="">나누지 않음</SelectOption>}
            {(card.chart === 'rank' ? statAxes(ledgers) : partAxes(ledgers)).map((name) => (
              <SelectOption key={name} value={name}>
                {name}별
              </SelectOption>
            ))}
          </SelectField>
        )}
      </div>
      {onSaveAxis && (
        <Button variant="text" className="ledger-stat-save-axis" onClick={onSaveAxis}>
          이 기준을 기본으로 저장
        </Button>
      )}
      {card.chart === 'total' ? (
        <TotalChart records={own} nature={card.nature} period={period} today={today} />
      ) : !own.length ? (
        <Empty>{empty}</Empty>
      ) : card.chart === 'rank' ? (
        <RankChart
          records={own}
          ledgers={ledgers}
          axis={shown!}
          nature={card.nature}
          onSelect={onSelect}
        />
      ) : card.chart === 'donut' ? (
        <DonutChart
          records={own}
          ledgers={ledgers}
          axis={shown!}
          nature={card.nature}
          onSelect={onSelect}
        />
      ) : (
        <TrendChart
          title={statCardTitle(card, shown)}
          records={own}
          ledgers={ledgers}
          axis={shown}
          nature={card.nature}
          bucket={card.bucket ?? 'day'}
          period={period}
        />
      )}
    </section>
  );
}

function TotalChart({
  records,
  nature,
  period,
  today,
}: {
  records: LedgerRecord[];
  nature: KindOption['nature'];
  period: { start: IsoDate; end: IsoDate };
  today: IsoDate;
}) {
  const total = sum(records);
  // Days so far: a finished period counts all of its days, a future one its first.
  const until = today < period.start ? period.start : today > period.end ? period.end : today;
  const days = Math.round((Date.parse(until) - Date.parse(period.start)) / 86400000) + 1;
  const largest = records.reduce<LedgerRecord | undefined>(
    (top, record) => (!top || record.amount > top.amount ? record : top),
    undefined,
  );
  return (
    <dl className="ledger-stat-total">
      <div>
        <dt>합계</dt>
        <dd>
          <Amount value={total} size="lg" />
        </dd>
      </div>
      <div>
        <dt>하루 평균</dt>
        <dd>
          <Amount value={Math.round(total / days)} />
        </dd>
      </div>
      <div>
        <dt>건수</dt>
        <dd>{won(records.length)}건</dd>
      </div>
      <div>
        <dt>가장 큰 {NATURE[nature]}</dt>
        <dd>
          {largest ? (
            <>
              <span className="ledger-stat-total-title">{largest.title}</span>
              <Amount value={largest.amount} />
            </>
          ) : (
            '없음'
          )}
        </dd>
      </div>
    </dl>
  );
}

function RankChart({
  records,
  ledgers,
  axis,
  nature,
  onSelect,
}: {
  records: LedgerRecord[];
  ledgers: Ledger[];
  axis: string;
  nature: KindOption['nature'];
  onSelect?(axis: string, name: string): void;
}) {
  const shares = breakdown(records, ledgers, axis, nature);
  const total = sum(records);
  const multiple = ledgers.some((ledger) =>
    ledger.fields.some((field) => field.name === axis && field.type === 'multiSelect'),
  );
  const bar = (share: Share) => (
    <StatBar
      label={share.name}
      value={share.value}
      total={total}
      max={shares[0].value}
      color={share.color}
    />
  );
  return (
    <Stack gap={2}>
      {multiple && (
        <p className="small muted">
          여러 명을 고른 내역은 사람마다 전체 금액으로 셉니다. 비율의 합이 100%를 넘을 수 있어요.
        </p>
      )}
      <List aria-label={`${axis}별 ${NATURE[nature]}`}>
        {shares.map((share) => (
          <li key={share.name} className="ui-list-item">
            {onSelect ? (
              <Button
                variant="plain"
                className="ledger-stat-row"
                onClick={() => onSelect(axis, share.name)}
              >
                {bar(share)}
              </Button>
            ) : (
              <div className="ledger-stat-row">{bar(share)}</div>
            )}
          </li>
        ))}
      </List>
    </Stack>
  );
}

/**
 * Totals per tag for one axis and one nature, with both pickers above (the 자산 analysis). With
 * `onSelect`, choosing a row asks for those records. Same-named options merge across ledgers.
 */
export function StatsBreakdown({
  records,
  ledgers,
  axis,
  onAxisChange,
  nature,
  onNatureChange,
  onSelect,
}: {
  records: LedgerRecord[];
  ledgers: Ledger[];
  axis: string;
  onAxisChange(axis: string): void;
  nature: KindOption['nature'];
  onNatureChange(nature: KindOption['nature']): void;
  onSelect?(axis: string, name: string): void;
}) {
  const own = ofNature(records, ledgers, nature);
  return (
    <Stack gap={4}>
      <SegmentedControl
        aria-label="통계 대상"
        value={nature}
        onValueChange={onNatureChange}
        options={[
          { value: 'expense', label: '지출' },
          { value: 'income', label: '수입' },
        ]}
      />
      <SelectField aria-label="통계 기준" value={axis} onValueChange={onAxisChange}>
        {statAxes(ledgers).map((name) => (
          <SelectOption key={name} value={name}>
            {name}별
          </SelectOption>
        ))}
      </SelectField>
      {own.length ? (
        <RankChart
          records={own}
          ledgers={ledgers}
          axis={axis}
          nature={nature}
          onSelect={onSelect}
        />
      ) : (
        <Empty>이 기간에는 {NATURE[nature]}이 없어요.</Empty>
      )}
    </Stack>
  );
}

const RADIUS = 52;
const ROUND = 2 * Math.PI * RADIUS;

function DonutChart({
  records,
  ledgers,
  axis,
  nature,
  onSelect,
}: {
  records: LedgerRecord[];
  ledgers: Ledger[];
  axis: string;
  nature: KindOption['nature'];
  onSelect?(axis: string, name: string): void;
}) {
  const [active, setActive] = useState<number>();
  const parts = folded(breakdown(records, ledgers, axis, nature));
  const total = sum(records);
  const picked = active === undefined ? undefined : parts[active];
  let start = 0;
  const arcs = parts.map((part) => {
    const length = (part.value / total) * ROUND;
    // A 2px surface gap between parts; a whole ring needs none.
    const arc = { offset: -start, length: parts.length > 1 ? Math.max(length - 2, 0.5) : length };
    start += length;
    return arc;
  });
  const choosable = (part: Share) => onSelect && part.name !== '기타';
  return (
    <div className="ledger-donut" onPointerLeave={() => setActive(undefined)}>
      <div className="ledger-donut-figure">
        <svg viewBox="0 0 128 128" aria-hidden="true">
          {parts.map((part, index) => (
            <circle
              key={part.name}
              cx="64"
              cy="64"
              r={RADIUS}
              data-active={active === index || undefined}
              style={{
                stroke: color(part.color),
                strokeDasharray: `${arcs[index].length} ${ROUND}`,
                strokeDashoffset: arcs[index].offset,
              }}
              onPointerEnter={() => setActive(index)}
              onClick={() => choosable(part) && onSelect!(axis, part.name)}
            />
          ))}
        </svg>
        <p className="ledger-donut-center">
          <span>{picked ? picked.name : '합계'}</span>
          <strong>{picked ? percent(picked.value, total) : `${won(total)}원`}</strong>
        </p>
      </div>
      <List aria-label={statCardTitle({ id: '', chart: 'donut', nature }, axis)}>
        {parts.map((part, index) => {
          const row = (
            <>
              <span className="ledger-legend-key" style={{ background: color(part.color) }} />
              <span className="ledger-donut-name">{part.name}</span>
              <span className="ledger-donut-percent">{percent(part.value, total)}</span>
              <Amount value={part.value} size="sm" />
            </>
          );
          return (
            <li
              key={part.name}
              className="ui-list-item"
              onPointerEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(undefined)}
            >
              {choosable(part) ? (
                <Button
                  variant="plain"
                  className="ledger-donut-row"
                  onClick={() => onSelect!(axis, part.name)}
                >
                  {row}
                </Button>
              ) : (
                <div className="ledger-donut-row">{row}</div>
              )}
            </li>
          );
        })}
      </List>
    </div>
  );
}

type Column = { start: IsoDate; total: number; parts: Map<string, number> };
const bucketOf = {
  day: (date: IsoDate) => date,
  week: (date: IsoDate) => addDays(date, -weekdayOf(date)),
  month: (date: IsoDate) => `${date.slice(0, 7)}-01`,
};
const nextOf = {
  day: (date: IsoDate) => addDays(date, 1),
  week: (date: IsoDate) => addDays(date, 7),
  month: (date: IsoDate) => addMonths(date, 1),
};
const axisLabel = {
  day: (start: IsoDate) => shortDate(start),
  week: (start: IsoDate) => `${shortDate(start)}~`,
  month: (start: IsoDate) => `${Number(start.slice(5, 7))}월`,
};
const readoutLabel = {
  day: (start: IsoDate) => dayLabel(start),
  week: (start: IsoDate) => `${shortDate(start)} – ${shortDate(addDays(start, 6))}`,
  month: (start: IsoDate) => monthLabel(start.slice(0, 7)),
};

/** Columns from the period's first day (or earliest record) to its last, empty ones included. */
function columnsOf(
  records: LedgerRecord[],
  ledgers: Ledger[],
  nature: KindOption['nature'],
  bucket: NonNullable<StatCard['bucket']>,
  axis: string | undefined,
  period: { start: IsoDate; end: IsoDate },
) {
  const dates = records.map((record) => record.date).sort();
  const first = dates[0] && dates[0] < period.start ? dates[0] : period.start;
  const last = dates.at(-1) && dates.at(-1)! > period.end ? dates.at(-1)! : period.end;
  const columns = new Map<IsoDate, Column>();
  for (let at = bucketOf[bucket](first); at <= last; at = nextOf[bucket](at))
    columns.set(at, { start: at, total: 0, parts: new Map() });
  for (const record of records) {
    const column = columns.get(bucketOf[bucket](record.date))!;
    column.total += record.amount;
    if (!axis) continue;
    const name = breakdown([record], ledgers, axis, nature)[0]?.name ?? '미지정';
    column.parts.set(name, (column.parts.get(name) ?? 0) + record.amount);
  }
  return [...columns.values()];
}

function TrendChart({
  title,
  records,
  ledgers,
  axis,
  nature,
  bucket: asked,
  period,
}: {
  title: string;
  records: LedgerRecord[];
  ledgers: Ledger[];
  axis?: string;
  nature: KindOption['nature'];
  bucket: NonNullable<StatCard['bucket']>;
  period: { start: IsoDate; end: IsoDate };
}) {
  const [active, setActive] = useState<number>();
  // More than about two months of days would be hairlines; step up to weeks, then months.
  let bucket = asked;
  let columns = columnsOf(records, ledgers, nature, bucket, axis, period);
  while (columns.length > 62 && bucket !== 'month') {
    bucket = STAT_BUCKETS[STAT_BUCKETS.indexOf(bucket) + 1];
    columns = columnsOf(records, ledgers, nature, bucket, axis, period);
  }
  const series = axis ? folded(breakdown(records, ledgers, axis, nature)) : [];
  const top = new Set(series.map((part) => part.name));
  const partsOf = (column: Column) =>
    series
      .map((part) => ({
        ...part,
        value:
          part.name === '기타' && !column.parts.has('기타')
            ? [...column.parts].reduce(
                (rest, [name, value]) => rest + (top.has(name) ? 0 : value),
                0,
              )
            : (column.parts.get(part.name) ?? 0),
      }))
      .filter((part) => part.value > 0);
  const single = ledgers
    .flatMap((ledger) => ledger.kinds)
    .find((kind) => kind.base && kind.nature === nature)?.color;
  const max = Math.max(...columns.map((column) => column.total), 1);
  const peak = columns.reduce(
    (best, column, index) => (column.total > columns[best].total ? index : best),
    0,
  );
  const current = active ?? peak;
  const shown = columns[current];
  const move = (event: KeyboardEvent) => {
    const step = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
    if (!step) return;
    event.preventDefault();
    setActive(Math.min(Math.max(current + step, 0), columns.length - 1));
  };
  return (
    <Stack gap={3}>
      <p className="ledger-trend-readout">
        <span>
          {active === undefined ? '가장 많은 ' : ''}
          {readoutLabel[bucket](shown.start)}
        </span>
        <Amount value={shown.total} />
        {axis && shown.total > 0 && (
          <span className="ledger-trend-parts">
            {partsOf(shown)
              .slice(0, 3)
              .map((part) => `${part.name} ${won(part.value)}원`)
              .join(' · ')}
          </span>
        )}
      </p>
      <div
        className="ledger-trend"
        role="group"
        tabIndex={0}
        aria-label={`${title}, 화살표 키로 살펴보기`}
        onKeyDown={move}
        onBlur={() => setActive(undefined)}
        onPointerLeave={() => setActive(undefined)}
      >
        {columns.map((column, index) => (
          <div
            key={column.start}
            className="ledger-trend-column"
            data-active={index === current || undefined}
            onPointerEnter={() => setActive(index)}
          >
            <div className="ledger-trend-bar" style={{ height: `${(column.total / max) * 100}%` }}>
              {axis ? (
                partsOf(column).map((part) => (
                  <span
                    key={part.name}
                    style={{ flexGrow: part.value, background: color(part.color) }}
                  />
                ))
              ) : (
                <span style={{ flexGrow: 1, background: color(single ?? OTHER) }} />
              )}
            </div>
          </div>
        ))}
      </div>
      <div className="ledger-trend-axis" aria-hidden="true">
        <span>{axisLabel[bucket](columns[0].start)}</span>
        {bucket !== asked && <span>{BUCKET_UNIT[bucket]} 단위로 묶었어요</span>}
        <span>{axisLabel[bucket](columns.at(-1)!.start)}</span>
      </div>
      {axis && (
        <ul className="ledger-stat-legend" aria-label="범례">
          {series.map((part) => (
            <li key={part.name}>
              <span className="ledger-legend-key" style={{ background: color(part.color) }} />
              {part.name}
            </li>
          ))}
        </ul>
      )}
      {/* A table keeps its full height whatever its own box says, so a hidden div holds it. */}
      <div className="sr-only">
        <table>
          <caption>{title}</caption>
          <tbody>
            {columns.map((column) => (
              <tr key={column.start}>
                <th scope="row">{readoutLabel[bucket](column.start)}</th>
                <td>{won(column.total)}원</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Stack>
  );
}

/** A chart with its axis and bucket fitting its type and these ledgers. */
export function fittedCard(card: StatCard, ledgers: Ledger[]): StatCard {
  const { axis: _, bucket: __, ...rest } = card;
  const axis = chartAxis(card, ledgers);
  return {
    ...rest,
    ...(axis ? { axis } : {}),
    ...(card.chart === 'trend' ? { bucket: card.bucket ?? 'day' } : {}),
  };
}

/** 편집's form for one chart: type, 지출 or 수입, its 기준 and, for 추이, the column. */
export function StatCardForm({
  card,
  ledgers,
  onChange,
}: {
  card: StatCard;
  ledgers: Ledger[];
  onChange(card: StatCard): void;
}) {
  const id = useId();
  const set = (patch: Partial<StatCard>) => onChange(fittedCard({ ...card, ...patch }, ledgers));
  const axis = chartAxis(card, ledgers);
  return (
    <Stack gap={5}>
      <Stack gap={2}>
        <span className="ui-field-label" aria-hidden="true">
          차트
        </span>
        <SegmentedControl<StatCard['chart']>
          aria-label="차트"
          value={card.chart}
          onValueChange={(chart) => set({ chart })}
          options={STAT_CHARTS.map((value) => ({ value, label: CHART[value] }))}
        />
      </Stack>
      <Stack gap={2}>
        <span className="ui-field-label" aria-hidden="true">
          금액
        </span>
        <SegmentedControl<KindOption['nature']>
          aria-label="금액"
          value={card.nature}
          onValueChange={(nature) => set({ nature })}
          options={[
            { value: 'expense', label: '지출' },
            { value: 'income', label: '수입' },
          ]}
        />
      </Stack>
      {card.chart !== 'total' && (
        <Stack gap={2}>
          <Field htmlFor={`${id}-axis`}>{card.chart === 'trend' ? '나눠 볼 기준' : '기준'}</Field>
          <SelectField
            id={`${id}-axis`}
            value={axis ?? ''}
            onValueChange={(next) => set({ axis: next || undefined })}
          >
            {card.chart === 'trend' && <SelectOption value="">나누지 않음</SelectOption>}
            {(card.chart === 'rank' ? statAxes(ledgers) : partAxes(ledgers)).map((name) => (
              <SelectOption key={name} value={name}>
                {name}별
              </SelectOption>
            ))}
          </SelectField>
          {card.chart !== 'rank' && (
            <p className="small muted">여러 개를 고르는 필드(누가 등)는 순위에서만 볼 수 있어요.</p>
          )}
        </Stack>
      )}
      {card.chart === 'trend' && (
        <Stack gap={2}>
          <span className="ui-field-label" aria-hidden="true">
            묶는 단위
          </span>
          <SegmentedControl<NonNullable<StatCard['bucket']>>
            aria-label="묶는 단위"
            value={card.bucket ?? 'day'}
            onValueChange={(bucket) => set({ bucket })}
            options={STAT_BUCKETS.map((value) => ({ value, label: BUCKET_UNIT[value] }))}
          />
        </Stack>
      )}
      <Field>
        <Switch
          checked={Boolean(card.wide)}
          onChange={(event) => set({ wide: event.target.checked || undefined })}
        />
        넓은 화면에서 한 줄 전체 쓰기
      </Field>
    </Stack>
  );
}
