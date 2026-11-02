import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';
import { RecordForm, type RecordDraft } from '../../client/ledger';
import type { FieldDef, Ledger } from '../../shared/ledger';
import { FIXTURE_TODAY, japanTrip, november, records } from '../fixtures';

const emptyDraft = (ledger: Ledger): RecordDraft => ({
  date: FIXTURE_TODAY,
  kindId: ledger.kinds.at(-1)!.id,
  title: '',
  amount: null,
  values: {},
});

const meta = {
  title: '04 Organisms · 유기체/RecordForm',
  component: RecordForm,
  tags: ['autodocs'],
  parameters: {
    docs: {
      description: {
        component:
          '내역 입력 폼. 구분 → 금액 → 내용 → 날짜 → 가계부별 필드 순서입니다. 필드는 DynamicField가 형태에 맞게(텍스트 → 입력, 선택 → 칩) 그리고, 선택 필드에는 그 자리에서 옵션을 추가할 수 있습니다. 내용을 입력하면 이전에 쓴 내용을 제안합니다.',
      },
    },
  },
  args: {
    ledger: november,
    draft: emptyDraft(november),
    onChange: () => {},
    suggestions: records.map((record) => record.title),
  },
  render: function Controlled(args) {
    const [ledger, setLedger] = useState(args.ledger);
    const [draft, setDraft] = useState(args.draft);
    return (
      <div style={{ maxWidth: 390 }}>
        <RecordForm
          {...args}
          ledger={ledger}
          draft={draft}
          onChange={setDraft}
          onCreateOption={(fieldId, name) => {
            const id = `${fieldId}-new-${name}`;
            setLedger({
              ...ledger,
              fields: ledger.fields.map((field): FieldDef =>
                field.id === fieldId && field.type !== 'text'
                  ? { ...field, options: [...field.options, { id, name, color: '#B9A27A' }] }
                  : field,
              ),
            });
            return id;
          }}
        />
        <output aria-label="입력 값">{JSON.stringify({ ...draft, values: draft.values })}</output>
      </div>
    );
  },
} satisfies Meta<typeof RecordForm>;
export default meta;
type Story = StoryObj<typeof meta>;

export const NewRecord: Story = {
  play: async ({ canvasElement }) => {
    const c = within(canvasElement);
    await userEvent.type(c.getByRole('textbox', { name: '금액' }), '9550');
    await userEvent.type(c.getByRole('textbox', { name: /내용/ }), '장보기');
    await userEvent.click(c.getByRole('button', { name: '장보기_쿠팡' }));
    await userEvent.click(c.getByRole('button', { name: 'KT카드' }));
    await userEvent.click(c.getByRole('button', { name: '카테고리 옵션 추가' }));
    await userEvent.type(
      c.getByRole('textbox', { name: '카테고리 새 옵션 이름' }),
      '생활용품{Enter}',
    );
    const value = c.getByRole('status', { name: '입력 값' });
    await expect(value).toHaveTextContent('"amount":9550');
    await expect(value).toHaveTextContent('"title":"장보기_쿠팡"');
    await expect(value).toHaveTextContent('"nov-f-pay":["nov-pay-kt"]');
    await expect(value).toHaveTextContent('"nov-f-cat":["nov-f-cat-new-생활용품"]');
  },
};
export const Trip: Story = { args: { ledger: japanTrip, draft: emptyDraft(japanTrip) } };
