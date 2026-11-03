import {
  Button,
  Empty,
  List,
  SegmentedControl,
  SelectField,
  SelectOption,
  Stack,
  StatBar,
} from '../ui';
import {
  breakdown,
  statAxes,
  totals,
  type KindOption,
  type Ledger,
  type LedgerRecord,
} from '../../shared/ledger';

/**
 * Totals per tag for one axis (유형 or a select field) and one nature. Choosing a row asks the
 * room to show those records. Same-named options merge across ledgers.
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
  const shares = breakdown(records, ledgers, axis, nature);
  const total = totals(records, ledgers)[nature];
  const multiple = ledgers.some((ledger) =>
    ledger.fields.some((field) => field.name === axis && field.type === 'multiSelect'),
  );
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
      {multiple && (
        <p className="small muted">
          여러 명을 고른 내역은 사람마다 전체 금액으로 셉니다. 비율의 합이 100%를 넘을 수 있어요.
        </p>
      )}
      {shares.length ? (
        <List aria-label={`${axis}별 ${nature === 'expense' ? '지출' : '수입'}`}>
          {shares.map((share) => (
            <li key={share.name} className="ui-list-item">
              <Button
                variant="plain"
                className="ledger-stat-row"
                onClick={() => onSelect?.(axis, share.name)}
              >
                <StatBar
                  label={share.name}
                  value={share.value}
                  total={total}
                  max={shares[0].value}
                  color={share.color}
                />
              </Button>
            </li>
          ))}
        </List>
      ) : (
        <Empty>이 기간에는 {nature === 'expense' ? '지출' : '수입'}이 없어요.</Empty>
      )}
    </Stack>
  );
}
