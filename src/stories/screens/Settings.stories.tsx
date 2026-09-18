import { useEffect, useRef, useState, type ComponentProps } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, waitFor, within } from 'storybook/test';
import LedgerForm from '../../client/LedgerForm';
import HierarchyDialog from '../../client/HierarchyDialog';
import MemberRoles from '../../client/MemberRoles';
import { Button } from '../../client/ui';
import { makeStoryBootstrap, storyUsers } from '../fixtures';

function LedgerSettings(args: ComponentProps<typeof LedgerForm>) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>
        가계부 설정 열기
      </Button>
      {open && (
        <LedgerForm
          {...args}
          onClose={() => {
            args.onClose();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
const meta = {
  title: '06 Screens/Settings',
  tags: ['settings-screen'],
  component: LedgerForm,
  args: { data: makeStoryBootstrap(), onChanged: fn(async () => {}), onSaved: fn(), onClose: fn() },
  render: (args) => <LedgerSettings {...args} />,
  parameters: {
    docs: {
      story: { inline: false },
      description: {
        component:
          '실제 가계부 설정·구조 이동·구성원 권한 화면을 조립한 명세입니다. 관리자 권한, 마지막 관리자 유지, 입력 검증, 변경 취소, 동시 수정 충돌을 확인합니다. 저장 응답은 가상 시나리오만 사용합니다.',
      },
    },
  },
} satisfies Meta<typeof LedgerForm>;
export default meta;
type Story = StoryObj<typeof meta>;
export const CreateLedger: Story = {};
export const ExistingLedger: Story = { args: { original: makeStoryBootstrap().ledgers[2] } };
export const MemberLedgerSettings: Story = {
  args: {
    data: makeStoryBootstrap({ user: storyUsers[1] }),
    original: makeStoryBootstrap().ledgers[2],
  },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).queryByRole('combobox', { name: '상위 가계부' }),
    ).not.toBeInTheDocument();
  },
};
export const CreatePermissionLost: Story = {
  args: { data: makeStoryBootstrap({ user: storyUsers[1] }) },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole('button', { name: '가계부 만들기' }),
    ).toBeDisabled();
  },
};
export const BlankNameValidation: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: '가계부 이름' }), '   ');
    await userEvent.click(canvas.getByRole('button', { name: '가계부 만들기' }));
    await expect(canvas.getByRole('alert')).toHaveTextContent('가계부 이름을 입력');
    await expect(args.onSaved).not.toHaveBeenCalled();
  },
};
export const DirtyCancelKeepsInput: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: '가계부 이름' }), '작성 중인 가계부');
    await userEvent.click(canvas.getByRole('button', { name: '닫기' }));
    await userEvent.click(canvas.getByRole('button', { name: '계속 작성' }));
    await expect(canvas.getByRole('textbox', { name: '가계부 이름' })).toHaveValue(
      '작성 중인 가계부',
    );
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};
export const DiscardDraft: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: '가계부 이름' }), '취소할 가계부');
    await userEvent.click(canvas.getByRole('button', { name: '닫기' }));
    await userEvent.click(canvas.getByRole('button', { name: '변경 내용 버리기' }));
    await expect(canvas.queryByRole('dialog')).not.toBeInTheDocument();
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
export const SaveErrorKeepsDraft: Story = {
  parameters: {
    apiRoutes: [
      {
        path: '/api/ledgers',
        method: 'POST',
        status: 400,
        response: { error: '가계부 이름을 확인해 주세요.', code: 'VALIDATION' },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.type(canvas.getByRole('textbox', { name: '가계부 이름' }), '저장할 가계부');
    await userEvent.click(canvas.getByRole('button', { name: '가계부 만들기' }));
    await expect(await canvas.findByRole('alert')).toHaveTextContent('이름을 확인');
    await expect(canvas.getByRole('textbox', { name: '가계부 이름' })).toHaveValue('저장할 가계부');
  },
};
export const HierarchyMove: Story = {
  render: (args) => (
    <HierarchyDialog
      data={args.data}
      intent={{
        ledger: args.data.ledgers[2],
        hierarchyVersion: 1,
        parentId: 'sb-year',
        beforeId: null,
      }}
      onChanged={args.onChanged}
      onClose={args.onClose}
      onSaved={fn()}
    />
  ),
};
export const HierarchyConflict: Story = {
  ...HierarchyMove,
  parameters: {
    apiRoutes: [
      {
        path: '/api/ledgers/sb-june',
        method: 'PATCH',
        status: 409,
        response: { error: '다른 관리자가 구조를 변경했어요.', code: 'CONFLICT' },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '이 위치로 이동' }));
    await expect(await canvas.findByText('다른 관리자가 구조를 먼저 변경했어요.')).toBeVisible();
    await expect(canvas.getByRole('button', { name: '이 위치로 이동' })).toBeDisabled();
    await userEvent.click(canvas.getByRole('button', { name: '최신 구조를 확인했어요' }));
    await expect(canvas.getByRole('button', { name: '이 위치로 이동' })).toBeEnabled();
  },
};
export const MemberRolesAdmin: Story = {
  render: (args) => (
    <MemberRoles data={args.data} onChanged={args.onChanged} onClose={args.onClose} />
  ),
};
export const MemberRolesReadOnly: Story = {
  ...MemberRolesAdmin,
  args: { data: makeStoryBootstrap({ user: storyUsers[1] }) },
  play: async ({ canvasElement }) => {
    for (const combo of within(canvasElement).getAllByRole('combobox'))
      await expect(combo).toBeDisabled();
  },
};

function MultipleRoleDrafts(args: ComponentProps<typeof LedgerForm>) {
  const [data, setData] = useState(() =>
    makeStoryBootstrap({
      users: storyUsers.map((user) => ({ ...user, role: 'admin' })),
    }),
  );
  return (
    <MemberRoles
      data={data}
      onClose={args.onClose}
      onChanged={async () => {
        await args.onChanged();
        setData((previous) => ({
          ...previous,
          revision: 2,
          hierarchyVersion: 2,
          users: previous.users.map((user) =>
            user.id === 'u2' ? { ...user, role: 'user' } : user,
          ),
        }));
      }}
    />
  );
}

export const SavingOneRolePreservesOtherDraft: Story = {
  render: (args) => <MultipleRoleDrafts {...args} />,
  parameters: {
    apiRoutes: [
      {
        path: '/api/users/u2/role',
        method: 'PATCH',
        response: { revision: 2, hierarchyVersion: 2 },
      },
    ],
    docs: {
      description: {
        story:
          '두 명 모두 관리자인 합성 상태에서 한 명의 변경을 저장합니다. 최신 데이터가 도착해도 다른 구성원의 작성 중인 선택을 유지하면서, 마지막 관리자까지 일반 사용자로 바꾸는 저장은 차단하는지 확인합니다. 실제 DB를 변경하지 않습니다.',
      },
    },
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('combobox', { name: '구성원 A 권한' }));
    await userEvent.click(canvas.getByRole('option', { name: '일반 사용자' }));
    await userEvent.click(canvas.getByRole('combobox', { name: '구성원 B 권한' }));
    await userEvent.click(canvas.getByRole('option', { name: '일반 사용자' }));
    await userEvent.click(canvas.getByRole('button', { name: '구성원 B 권한 저장' }));
    await expect(await canvas.findByRole('status')).toHaveTextContent(
      '다른 구성원의 작성 중인 변경도 이어서 저장',
    );
    await expect(canvas.getByRole('combobox', { name: '구성원 A 권한' })).toHaveAttribute(
      'data-value',
      'user',
    );
    await expect(canvas.getByRole('button', { name: '구성원 A 권한 저장' })).toBeDisabled();
    await expect(canvas.getByRole('button', { name: '구성원 B 권한 저장' })).toBeDisabled();
    await expect(args.onChanged).toHaveBeenCalledOnce();
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

function LiveRoleUpdates({
  otherWasAdmin = false,
  ...args
}: ComponentProps<typeof LedgerForm> & { otherWasAdmin?: boolean }) {
  const [open, setOpen] = useState(true);
  const [data, setData] = useState(() =>
    makeStoryBootstrap({
      users: storyUsers.map((user) =>
        user.id === 'u2' ? { ...user, role: otherWasAdmin ? 'admin' : 'user' } : user,
      ),
    }),
  );
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current!;
    // Deterministically model a fresh Bootstrap arriving through live synchronization.
    const applyRemote = () =>
      setData((previous) => ({
        ...previous,
        revision: 2,
        hierarchyVersion: 2,
        users: previous.users.map((user) =>
          user.id === 'u2' ? { ...user, role: otherWasAdmin ? 'user' : 'admin' } : user,
        ),
      }));
    element.addEventListener('storybook:remote-roles', applyRemote);
    return () => element.removeEventListener('storybook:remote-roles', applyRemote);
  }, [otherWasAdmin]);
  return (
    <div ref={ref} data-testid="role-sync-harness">
      <Button onClick={() => setOpen(true)}>구성원 권한 열기</Button>
      {open && (
        <MemberRoles
          data={data}
          onChanged={args.onChanged}
          onClose={() => {
            args.onClose();
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

export const RemoteRoleUpdateKeepsUntouchedFormClean: Story = {
  name: '실시간 권한 변경 · 미편집 상태 유지',
  render: (args) => <LiveRoleUpdates {...args} />,
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await expect(c.getByRole('combobox', { name: '구성원 B 권한' })).toHaveAttribute(
      'data-value',
      'user',
    );
    c.getByTestId('role-sync-harness').dispatchEvent(new Event('storybook:remote-roles'));
    await waitFor(() =>
      expect(c.getByRole('combobox', { name: '구성원 B 권한' })).toHaveAttribute(
        'data-value',
        'admin',
      ),
    );
    await expect(c.getByRole('button', { name: '구성원 B 권한 저장' })).toBeDisabled();
    await userEvent.click(c.getAllByRole('button', { name: '닫기' }).at(-1)!);
    await waitFor(() => expect(c.queryByRole('dialog')).toBeNull());
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
export const RemoteRoleUpdatePreservesEditedDraft: Story = {
  name: '실시간 권한 변경 · 실제 초안 보존',
  render: (args) => <LiveRoleUpdates {...args} otherWasAdmin />,
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('combobox', { name: '구성원 A 권한' }));
    await userEvent.click(c.getByRole('option', { name: '일반 사용자' }));
    c.getByTestId('role-sync-harness').dispatchEvent(new Event('storybook:remote-roles'));
    await waitFor(() =>
      expect(c.getByRole('combobox', { name: '구성원 B 권한' })).toHaveAttribute(
        'data-value',
        'user',
      ),
    );
    await expect(c.getByRole('combobox', { name: '구성원 A 권한' })).toHaveAttribute(
      'data-value',
      'user',
    );
    await expect(c.getByRole('button', { name: '구성원 B 권한 저장' })).toBeDisabled();
    await expect(c.getByRole('button', { name: '구성원 A 권한 저장' })).toBeDisabled();
    await userEvent.click(c.getAllByRole('button', { name: '닫기' }).at(-1)!);
    await expect(c.getByRole('dialog', { name: '입력 내용을 버릴까요?' })).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '계속 작성' }));
    await expect(c.getByRole('combobox', { name: '구성원 A 권한' })).toHaveAttribute(
      'data-value',
      'user',
    );
    await expect(args.onClose).not.toHaveBeenCalled();
  },
};

function ExternallyMovedLedger(args: ComponentProps<typeof LedgerForm>) {
  const [data, setData] = useState(() => makeStoryBootstrap());
  const original = useRef(data.ledgers[2]);
  const [open, setOpen] = useState(true);
  return (
    <>
      <Button onClick={() => setOpen(true)}>이동된 가계부 설정 열기</Button>
      {open && (
        <LedgerForm
          {...args}
          data={data}
          original={original.current}
          onChanged={async () => {
            await args.onChanged();
            setData((previous) => ({
              ...previous,
              revision: 2,
              hierarchyVersion: 2,
              ledgers: previous.ledgers.map((ledger) =>
                ledger.id === original.current.id
                  ? { ...ledger, parentId: 'sb-home', archived: true, version: 2 }
                  : ledger,
              ),
            }));
          }}
          onClose={() => {
            args.onClose();
            setOpen(false);
          }}
        />
      )}
    </>
  );
}
export const ReloadedHierarchyFieldsStayClean: Story = {
  name: '외부 위치·보관 변경 수용 후 바로 닫기',
  render: (args) => <ExternallyMovedLedger {...args} />,
  parameters: {
    apiRoutes: [
      {
        path: '/api/ledgers/sb-june',
        method: 'PATCH',
        status: 409,
        response: { error: '가계부 위치가 변경되었어요.', code: 'CONFLICT' },
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const c = within(canvasElement);
    await userEvent.click(c.getByRole('button', { name: '설정 저장' }));
    await expect(await c.findByText('가계부 설정 또는 구조가 변경되었어요.')).toBeVisible();
    await userEvent.click(c.getByRole('button', { name: '최신 설정을 확인했어요' }));
    await expect(c.getByRole('combobox', { name: '상위 가계부' })).toHaveAttribute(
      'data-value',
      'sb-home',
    );
    await expect(
      c.getByRole('checkbox', { name: '가계부 보관 (과거 기록과 하위 구조 유지)' }),
    ).toBeChecked();
    await userEvent.click(c.getByRole('button', { name: '닫기' }));
    await waitFor(() => expect(c.queryByRole('dialog')).toBeNull());
    await expect(args.onClose).toHaveBeenCalledOnce();
  },
};
