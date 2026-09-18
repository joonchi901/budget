import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import DataView from '../../client/DataView';
import ExcelImportView from '../../client/ExcelImportView';
import WorkbookArchiveView from '../../client/WorkbookArchiveView';
import { makeStoryBootstrap, storyUsers } from '../fixtures';
import type { RecordHistory, SourceRecord } from '../../shared/data';

const sourceRecords: SourceRecord[] = [
  {
    id: 'sb-source-1',
    sourceId: '예시 가져오기',
    sourceLocation: '6월!A5',
    kind: 'transaction',
    payload: {
      description: '주말 장보기',
      amount: 25000,
      major: '생활비',
      minor: '식비',
      payment: '예시 카드',
    },
    note: '날짜를 확인한 뒤 내역을 정리해요.',
    status: 'pending',
    version: 1,
  },
  {
    id: 'sb-source-2',
    sourceId: '예시 가져오기',
    sourceLocation: '메모!A2',
    kind: 'reference',
    payload: { memo: '가족과 함께 기록한 참고 자료' },
    note: '',
    status: 'reference',
    version: 1,
  },
];
const history: RecordHistory[] = [
  {
    id: 'sb-history-1',
    revision: 1,
    entityType: 'transaction',
    entityId: 'sb-lunch',
    actorId: 'u1',
    actorName: '구성원 A',
    createdAt: '2026-06-12T12:00:00.000Z',
    action: 'update',
    before: { description: '점심', amount: 15000 },
    after: { description: '함께 먹은 점심', amount: 18000 },
  },
];
const readRoutes = [
  { path: '/api/data/source-records', response: sourceRecords },
  { path: '/api/data/history', response: history },
];
const csvFile = () =>
  new File(
    ['id,날짜,내역,금액,유형,결제수단\nexample-1,2026-06-12,점심,15000,지출,\n'],
    '예시-거래.csv',
    { type: 'text/csv' },
  );

const meta = {
  title: '06 Screens/Data',
  tags: ['data-screen'],
  component: DataView,
  args: { data: makeStoryBootstrap(), onChanged: fn(async () => {}), onNotice: fn() },
  parameters: {
    apiRoutes: readRoutes,
    docs: {
      story: { inline: false },
      description: {
        component:
          '실제 데이터 관리 화면입니다. 서버 응답은 이 명세 안의 가상 자료로만 제공하며, 파일 검사는 메모리에서 실행합니다. 탭 전환 시 작성 내용 유지, 오류 회복, 권한별 작업 제한을 함께 검증합니다.',
      },
    },
  },
} satisfies Meta<typeof DataView>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Backup: Story = {};
export const MemberAccess: Story = {
  args: { data: makeStoryBootstrap({ user: storyUsers[1] }) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByLabelText('복원할 JSON 파일')).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '전체 JSON 백업' })).toBeEnabled();
  },
};
export const Empty: Story = {
  parameters: {
    apiRoutes: [
      { path: '/api/data/source-records', response: [] },
      { path: '/api/data/history', response: [] },
    ],
  },
};
export const Loading: Story = {
  parameters: { apiRoutes: readRoutes.map((route) => ({ ...route, delayMs: 1500 })) },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole('tab', { name: '변경 이력' }));
  },
};
export const FailedLoading: Story = {
  parameters: {
    apiRoutes: readRoutes.map((route) => ({
      ...route,
      status: 503,
      response: { error: '자료를 불러오지 못했어요. 다시 시도해 주세요.', code: 'UNAVAILABLE' },
    })),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: '원본 검토함' }));
    await expect(await canvas.findByRole('button', { name: '자료 다시 불러오기' })).toBeEnabled();
    await expect(canvas.getByRole('alert')).toHaveTextContent('다시 시도');
  },
};
export const CsvDraftSurvivesTabs: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'CSV 가져오기' }));
    await userEvent.upload(canvas.getByLabelText('CSV 파일'), csvFile());
    const sourceId = await canvas.findByLabelText(/원본 자료 ID/);
    await userEvent.clear(sourceId);
    await userEvent.type(sourceId, '기록한 원본 ID');
    await userEvent.click(canvas.getByRole('tab', { name: '백업·복원' }));
    await userEvent.click(canvas.getByRole('tab', { name: 'CSV 가져오기' }));
    await expect(canvas.getByLabelText(/원본 자료 ID/)).toHaveValue('기록한 원본 ID');
  },
};
export const InvalidCsvClearsPrevious: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'CSV 가져오기' }));
    await userEvent.upload(canvas.getByLabelText('CSV 파일'), csvFile());
    await expect(await canvas.findByRole('button', { name: '가져올 내역 검사' })).toBeEnabled();
    await userEvent.upload(
      canvas.getByLabelText('CSV 파일'),
      new File(['"닫히지 않은 CSV'], '잘못된-예시.csv', { type: 'text/csv' }),
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent('닫히지 않은');
    await expect(
      canvas.queryByRole('button', { name: '가져올 내역 검사' }),
    ).not.toBeInTheDocument();
  },
};
export const ReviewDraftCancel: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: '원본 검토함' }));
    await userEvent.click(await canvas.findByRole('button', { name: '검토 메모·상태' }));
    const dialog = within(canvas.getByRole('dialog', { name: '원본 자료 검토' }));
    await userEvent.type(dialog.getByRole('textbox', { name: '검토 메모' }), ' 작성 중인 검토');
    await userEvent.click(dialog.getAllByRole('button', { name: '닫기' })[0]);
    await userEvent.click(canvas.getByRole('button', { name: '계속 작성' }));
    await expect(dialog.getByRole('textbox', { name: '검토 메모' })).toHaveValue(
      '날짜를 확인한 뒤 내역을 정리해요. 작성 중인 검토',
    );
  },
};
export const HistoryComparison: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: '변경 이력' }));
    await userEvent.click(await canvas.findByText('거래 · 수정'));
    await expect(canvas.getByRole('columnheader', { name: '변경 전' })).toBeVisible();
  },
};
export const ExcelUpload: Story = { render: (args) => <ExcelImportView {...args} /> };
export const ExcelMemberAccess: Story = {
  args: { data: makeStoryBootstrap({ user: storyUsers[1] }) },
  render: (args) => <ExcelImportView {...args} />,
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByLabelText('원본 가계부 XLSX')).toBeDisabled();
  },
};
export const ArchiveEmpty: Story = {
  render: () => <WorkbookArchiveView records={[]} loading={false} loadError="" />,
};
export const ArchiveLoading: Story = {
  render: () => <WorkbookArchiveView records={[]} loading loadError="" />,
};
export const ArchiveError: Story = {
  render: () => (
    <WorkbookArchiveView
      records={[]}
      loading={false}
      loadError="원본 목록을 불러오지 못했어요. 다시 시도해 주세요."
    />
  ),
};

export const InvalidBackupMembers: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(
      canvas.getByLabelText('복원할 JSON 파일'),
      new File([JSON.stringify({ format: 'our-budget', members: [null] })], '잘못된-백업.json', {
        type: 'application/json',
      }),
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent('가계부 JSON 백업 파일');
    await expect(canvas.queryByRole('button', { name: '복원 내용 검사' })).not.toBeInTheDocument();
  },
};
export const InvalidExcel: Story = {
  render: (args) => <ExcelImportView {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(
      canvas.getByLabelText('원본 가계부 XLSX'),
      new File(['깨진 예시 파일'], '잘못된-예시.xlsx', {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    );
    await expect(await canvas.findByRole('alert')).toHaveTextContent('엑셀 파일을 읽지 못했어요');
    await expect(
      canvas.queryByRole('button', { name: '엑셀 반영 미리보기' }),
    ).not.toBeInTheDocument();
  },
};
export const SourcePagination: Story = {
  parameters: {
    apiRoutes: [
      { path: '/api/data/history', response: [] },
      {
        path: '/api/data/source-records',
        response: Array.from({ length: 52 }, (_, index) => ({
          ...sourceRecords[0],
          id: `sb-paged-${index}`,
          sourceLocation: `6월!A${index + 1}`,
          payload: { description: `예시 거래 ${index + 1}`, amount: 1000 },
        })),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: '원본 검토함' }));
    const pagination = within(
      await canvas.findByRole('navigation', { name: '원본 검토 자료 페이지' }),
    );
    await expect(pagination.getByRole('button', { name: '이전' })).toBeDisabled();
    await userEvent.click(pagination.getByRole('button', { name: '다음' }));
    await expect(pagination.getByRole('button', { name: '다음' })).toBeDisabled();
    await userEvent.type(
      canvas.getByRole('searchbox', { name: '원본 내역·출처·메모 검색' }),
      '예시 거래 1',
    );
    await expect(
      canvas.queryByRole('navigation', { name: '원본 검토 자료 페이지' }),
    ).not.toBeInTheDocument();
    await expect(canvas.getByRole('heading', { name: '예시 거래 1', level: 3 })).toBeVisible();
  },
};

async function archiveFixture(): Promise<SourceRecord[]> {
  const { strToU8, zipSync } = await import('fflate');
  const rows = Array.from(
    { length: 130 },
    (_, index) =>
      `<row r="${index + 1}"><c r="A${index + 1}" t="inlineStr"><is><t>예시 기록 ${index + 1}</t></is></c>${index === 0 ? '<c r="B1"><f>SUM(100,200)</f><v>300</v></c>' : ''}</row>`,
  ).join('');
  const bytes = zipSync({
    'xl/workbook.xml': strToU8(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="예시 기록" sheetId="1" r:id="rId1"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet1.xml': strToU8(`<worksheet><sheetData>${rows}</sheetData></worksheet>`),
  });
  const digest = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', new Uint8Array(bytes))),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  const base = {
    sourceId: '명세 가상 자료',
    sourceLocation: '원본 XLSX 파일',
    kind: 'reference' as const,
    note: 'Storybook에서만 생성한 가상 통합문서예요.',
    status: 'reference' as const,
    version: 1,
  };
  return [
    {
      ...base,
      id: 'sb-archive',
      payload: {
        format: 'uga-workbook-manifest-v1',
        archiveId: 'sb-archive',
        fileName: '예시-원본.xlsx',
        byteLength: bytes.length,
        sha256: digest,
        chunkCount: 1,
      },
    },
    {
      ...base,
      id: 'sb-archive:0',
      payload: {
        format: 'uga-workbook-chunk-v1',
        archiveId: 'sb-archive',
        index: 0,
        data: btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')),
      },
    },
  ];
}
export const ArchiveBrowseAndFilter: Story = {
  loaders: [async () => ({ archiveRecords: await archiveFixture() })],
  render: (_, { loaded }) => (
    <WorkbookArchiveView records={loaded.archiveRecords} loading={false} loadError="" />
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '예시-원본.xlsx 원본 열기' }));
    const pagination = within(await canvas.findByRole('navigation', { name: '원본 셀 페이지' }));
    await userEvent.click(pagination.getByRole('button', { name: '다음' }));
    await expect(pagination.getByRole('button', { name: '다음' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('checkbox', { name: '수식이 있는 셀만' }));
    await expect(canvas.getByRole('cell', { name: '=SUM(100,200)' })).toBeVisible();
    await expect(
      canvas.queryByRole('navigation', { name: '원본 셀 페이지' }),
    ).not.toBeInTheDocument();
  },
};

const syntheticBackup = {
  format: 'our-budget',
  schemaVersion: 2,
  exportedAt: '2026-06-30T12:00:00Z',
  sourceHouseholdId: 'storybook-synthetic-household',
  sourceRevision: 1,
  members: storyUsers.map(({ id, name, color }) => ({ id, name, color })),
  tables: {
    ledgers: [],
    tag_groups: [],
    tags: [],
    assets: [],
    payment_methods: [],
    rules: [],
    transactions: [],
    asset_operations: [],
    asset_movements: [],
    asset_effects: [],
    planning_records: [],
    import_records: [],
    source_records: [],
    record_history: [],
  },
};
const restorePreview = {
  digest: 'storybook-preview',
  revision: 1,
  counts: Object.fromEntries(Object.keys(syntheticBackup.tables).map((key) => [key, 0])),
  currentCounts: Object.fromEntries(Object.keys(syntheticBackup.tables).map((key) => [key, 0])),
  issues: [],
  members: syntheticBackup.members,
  mode: 'replace',
};
const backupFile = () =>
  new File([JSON.stringify(syntheticBackup)], '예시-백업.json', { type: 'application/json' });
export const RestoreRequiresConfirmation: Story = {
  parameters: {
    apiRoutes: [
      ...readRoutes,
      { path: '/api/data/restore/preview', method: 'POST', response: restorePreview },
      { path: '/api/data/restore', method: 'POST', response: { revision: 2 } },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(canvas.getByLabelText('복원할 JSON 파일'), backupFile());
    await userEvent.click(await canvas.findByRole('button', { name: '복원 내용 검사' }));
    const apply = await canvas.findByRole('button', { name: '확인한 백업으로 전체 복원' });
    await expect(apply).toBeDisabled();
    await userEvent.click(
      canvas.getByRole('checkbox', { name: /현재 가구의 자료 전체를 교체합니다/ }),
    );
    await expect(apply).toBeEnabled();
    await userEvent.click(apply);
    await expect(args.onNotice).toHaveBeenCalledWith('백업을 복원했어요.');
  },
};
export const StaleRestoreMustRecheck: Story = {
  args: { data: makeStoryBootstrap({ revision: 2 }) },
  parameters: {
    apiRoutes: [
      ...readRoutes,
      { path: '/api/data/restore/preview', method: 'POST', response: restorePreview },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.upload(canvas.getByLabelText('복원할 JSON 파일'), backupFile());
    await userEvent.click(await canvas.findByRole('button', { name: '복원 내용 검사' }));
    await userEvent.click(
      await canvas.findByRole('checkbox', { name: /현재 가구의 자료 전체를 교체합니다/ }),
    );
    await expect(canvas.getByRole('button', { name: '확인한 백업으로 전체 복원' })).toBeDisabled();
    await expect(
      canvas.getByText('다른 변경이 반영되었어요. 복원 내용을 다시 검사해 주세요.'),
    ).toBeVisible();
  },
};
export const CsvPreviewConfirmation: Story = {
  parameters: {
    apiRoutes: [
      ...readRoutes,
      {
        path: '/api/data/import/preview',
        method: 'POST',
        response: {
          sourceId: '예시-거래.csv',
          digest: 'storybook-csv',
          revision: 1,
          rows: [
            {
              rowId: 'example-1',
              transaction: { date: '2026-06-12', description: '점심', amount: 15000 },
              errors: [],
              status: 'ready',
            },
          ],
          ready: 1,
          duplicate: 0,
          errors: 0,
          income: 0,
          expense: 15000,
        },
      },
      {
        path: '/api/data/import',
        method: 'POST',
        response: { imported: 1, duplicates: 0, revision: 2 },
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('tab', { name: 'CSV 가져오기' }));
    await userEvent.upload(canvas.getByLabelText('CSV 파일'), csvFile());
    await userEvent.click(await canvas.findByRole('button', { name: '가져올 내역 검사' }));
    const apply = await canvas.findByRole('button', { name: '확인한 거래 가져오기' });
    await expect(apply).toBeDisabled();
    await userEvent.click(
      canvas.getByRole('checkbox', { name: /원본 행, 거래 내용과 합계를 확인했습니다/ }),
    );
    await userEvent.click(apply);
    await expect(args.onNotice).toHaveBeenCalledWith('1건을 가져왔어요. 중복 0건은 유지했어요.');
  },
};

async function settingsOnlyWorkbook(): Promise<File> {
  const { strToU8, zipSync } = await import('fflate');
  const bytes = zipSync({
    'xl/workbook.xml': strToU8(
      '<workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="설정" sheetId="1" r:id="rId1"/><sheet name="1" sheetId="2" r:id="rId2"/></sheets></workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>',
    ),
    'xl/worksheets/sheet2.xml': strToU8('<worksheet><sheetData/></worksheet>'),
    'xl/worksheets/sheet1.xml': strToU8(
      '<worksheet><sheetData><row><c r="C3"><v>2026</v></c><c r="E3"><v>1</v></c><c r="G3"><v>1</v></c></row></sheetData></worksheet>',
    ),
  });
  return new File([new Uint8Array(bytes)], '명세-빈-가계부.xlsx', {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
}

export const ExcelPendingLocksWorkspace: Story = {
  tags: ['excel-workspace-lock'],
  render: (args) => (
    <DataView
      {...args}
      excelImport={({ onPendingChange }) => (
        <ExcelImportView {...args} onPendingChange={onPendingChange} />
      )}
    />
  ),
  parameters: {
    apiRoutes: [
      ...readRoutes,
      { path: '/api/data/backup', response: syntheticBackup, delayMs: 500 },
      { path: '/api/data/restore/preview', method: 'POST', response: restorePreview },
      {
        path: '/api/data/restore',
        method: 'POST',
        status: 503,
        response: { error: '반영 결과를 확인하지 못했어요.', code: 'UNAVAILABLE' },
      },
    ],
    docs: {
      description: {
        story:
          '엑셀 화면을 데이터 관리 탭에 실제로 연결합니다. 처리 중과 응답 불명 상태에는 모든 작업 탭·검토함 바로가기를 잠그고, 미리보기 처리가 끝나면 잠금을 해제합니다. 모든 파일과 API 응답은 합성 자료입니다.',
      },
    },
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const shortcut = canvas.getByRole('button', { name: /가져온 원본 검토하기/ });
    await userEvent.upload(canvas.getByLabelText('원본 가계부 XLSX'), await settingsOnlyWorkbook());
    await userEvent.click(await canvas.findByRole('combobox', { name: '가져올 가계부' }));
    await userEvent.click(canvas.getByRole('option', { name: '새 독립 가계부' }));
    await userEvent.click(canvas.getByRole('button', { name: '엑셀 반영 미리보기' }));
    for (const tab of canvas.getAllByRole('tab')) await expect(tab).toBeDisabled();
    await expect(shortcut).toBeDisabled();
    await expect(await canvas.findByRole('heading', { name: '반영할 내용' })).toBeVisible();
    for (const tab of canvas.getAllByRole('tab')) await expect(tab).toBeEnabled();
    await expect(shortcut).toBeEnabled();
    await userEvent.click(
      canvas.getByRole('checkbox', { name: '금액·연결과 미확정 자료의 검토함 보존을 확인했어요.' }),
    );
    await userEvent.click(canvas.getByRole('button', { name: '엑셀 자료 반영' }));
    await expect(
      await canvas.findByRole('button', { name: '같은 요청으로 결과 확인' }),
    ).toBeEnabled();
    for (const tab of canvas.getAllByRole('tab')) await expect(tab).toBeDisabled();
    await expect(shortcut).toBeDisabled();
    await expect(canvas.getByRole('tab', { name: '엑셀 가져오기' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  },
};
