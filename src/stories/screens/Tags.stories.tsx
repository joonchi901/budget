import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, fn, userEvent, within } from 'storybook/test';
import TagManager from '../../client/TagManager';
import { makeStoryBootstrap } from '../fixtures';

const meta = {
  title: '06 Screens/Tags',
  tags: ['tags-screen'],
  component: TagManager,
  args: { data: makeStoryBootstrap(), onChanged: fn(async () => {}) },
  parameters: {
    docs: {
      story: { inline: false },
      description: {
        component:
          '유형·옵션·범위·색상·순서·보관을 관리하는 실제 태그 설정 화면입니다. 공통 입력·체크박스·버튼·폼을 사용합니다. 고정된 가상 응답으로 성공·검증 오류·동시 수정 충돌을 재현하며, 실제 서버에는 요청하지 않습니다.',
      },
    },
  },
} satisfies Meta<typeof TagManager>;
export default meta;
type Story = StoryObj<typeof meta>;
export const Configured: Story = { name: '유형과 옵션 설정' };
export const Empty: Story = {
  name: '태그 없는 상태',
  args: { data: makeStoryBootstrap({ tagGroups: [], tags: [] }) },
};
export const BrowseAndArchived: Story = {
  name: '유형 선택과 보관 항목 조회',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: /^내역 가계부/ }));
    await expect(canvas.getByRole('heading', { name: '내역' })).toBeVisible();
    await expect(canvas.queryByText('지난 행사')).toBeNull();
    await userEvent.click(canvas.getByRole('checkbox', { name: '보관된 항목 보기' }));
    await expect(canvas.getByText('지난 행사')).toBeVisible();
    await expect(canvas.getByRole('button', { name: /^이전 분류/ })).toBeVisible();
  },
};
export const GroupRequiredAndCancel: Story = {
  name: '유형 필수값과 취소 확인',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '유형 만들기' }));
    const dialog = within(canvas.getByRole('dialog', { name: '태그 유형 만들기' }));
    await userEvent.click(dialog.getByRole('button', { name: '저장' }));
    await expect(dialog.getByRole('textbox', { name: '유형 이름' })).toHaveFocus();
    await expect(dialog.getByRole('alert')).toBeVisible();
    await userEvent.type(dialog.getByRole('textbox', { name: '유형 이름' }), '사용 목적');
    await userEvent.click(dialog.getAllByRole('button', { name: '닫기' })[0]);
    await userEvent.click(
      within(canvasElement.ownerDocument.body).getByRole('button', {
        name: '변경 내용 버리기',
      }),
    );
    await expect(canvas.queryByRole('dialog')).toBeNull();
  },
};
export const OptionEditor: Story = {
  name: '옵션 이름과 색상 편집',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '옵션 추가' }));
    const dialog = within(canvas.getByRole('dialog', { name: '옵션 추가' }));
    await userEvent.type(dialog.getByRole('textbox', { name: '옵션 이름' }), '문화생활');
    await userEvent.click(dialog.getByRole('button', { name: '#5475ae 색상' }));
    await expect(dialog.getByRole('button', { name: '#5475ae 색상' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(dialog.getByText('문화생활', { selector: '.tag-badge-name' })).toBeVisible();
  },
};
export const SaveSuccess: Story = {
  name: '유형 저장 후 목록 복귀',
  parameters: {
    apiRoutes: [
      {
        path: '/api/tag-groups',
        method: 'POST',
        response: {
          revision: 2,
          tagGroup: {
            id: 'sb-new-group',
            name: '사용 목적',
            selectionMode: 'multiple',
            appliesTo: 'transaction',
            role: 'regular',
            ledgerIds: null,
            archived: false,
            sortOrder: 5,
            version: 1,
          },
        },
      },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '유형 만들기' }));
    const dialog = within(canvas.getByRole('dialog', { name: '태그 유형 만들기' }));
    await userEvent.type(dialog.getByRole('textbox', { name: '유형 이름' }), '사용 목적');
    await userEvent.click(dialog.getByRole('button', { name: '저장' }));
    await expect(args.onChanged).toHaveBeenCalled();
    await expect(canvas.getByRole('status')).toHaveTextContent('태그 설정을 저장했어요.');
    await expect(canvas.queryByRole('dialog')).toBeNull();
  },
};
export const ValidationError: Story = {
  name: '저장 오류와 작성 내용 보존',
  parameters: {
    apiRoutes: [
      {
        path: '/api/tag-groups',
        method: 'POST',
        status: 400,
        response: { error: '같은 이름의 유형이 있어요.', code: 'VALIDATION' },
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '유형 만들기' }));
    const dialog = within(canvas.getByRole('dialog', { name: '태그 유형 만들기' }));
    await userEvent.type(dialog.getByRole('textbox', { name: '유형 이름' }), '사용 목적');
    await userEvent.click(dialog.getByRole('button', { name: '저장' }));
    await expect(dialog.getByRole('alert')).toHaveTextContent('같은 이름의 유형이 있어요.');
    await expect(dialog.getByRole('textbox', { name: '유형 이름' })).toHaveValue('사용 목적');
    await expect(dialog.getByRole('button', { name: '저장' })).toBeEnabled();
  },
};
export const ConflictReload: Story = {
  name: '충돌 후 최신 옵션과 상위 관계 복원',
  parameters: {
    apiRoutes: [
      {
        path: '/api/tags/sb-food',
        method: 'PATCH',
        status: 409,
        response: { error: '다른 곳에서 먼저 수정했어요.', code: 'VERSION_CONFLICT' },
      },
      {
        path: '/api/bootstrap',
        response: makeStoryBootstrap({
          tags: makeStoryBootstrap().tags.map((tag) =>
            tag.id === 'sb-food'
              ? { ...tag, name: '최신 식비', parentId: 'sb-family', version: 2 }
              : tag,
          ),
        }),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '식비 옵션 수정' }));
    const dialog = within(canvas.getByRole('dialog', { name: '옵션 수정' }));
    await userEvent.click(dialog.getByRole('button', { name: '저장' }));
    await expect(dialog.getByRole('button', { name: '저장' })).toBeDisabled();
    await userEvent.click(dialog.getByRole('button', { name: '최신 내용 불러오기' }));
    await expect(dialog.getByRole('textbox', { name: '옵션 이름' })).toHaveValue('최신 식비');
    await expect(dialog.getByRole('combobox', { name: '상위 옵션 (선택)' })).toHaveTextContent(
      '가족',
    );
    await userEvent.click(dialog.getAllByRole('button', { name: '닫기' })[0]);
    await expect(canvas.queryByRole('dialog')).toBeNull();
  },
};

export const ConflictClearedParent: Story = {
  name: '최신 옵션에서 상위 관계가 해제된 경우',
  args: {
    data: makeStoryBootstrap({
      tags: makeStoryBootstrap().tags.map((tag) =>
        tag.id === 'sb-food' ? { ...tag, parentId: 'sb-family' } : tag,
      ),
    }),
  },
  parameters: {
    apiRoutes: [
      {
        path: '/api/tags/sb-food',
        method: 'PATCH',
        status: 409,
        response: { error: '다른 곳에서 먼저 수정했어요.', code: 'VERSION_CONFLICT' },
      },
      {
        path: '/api/bootstrap',
        response: makeStoryBootstrap({
          tags: makeStoryBootstrap().tags.map((tag) =>
            tag.id === 'sb-food' ? { ...tag, parentId: undefined, version: 2 } : tag,
          ),
        }),
      },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: '식비 옵션 수정' }));
    const dialog = within(canvas.getByRole('dialog', { name: '옵션 수정' }));
    await expect(dialog.getByRole('combobox', { name: '상위 옵션 (선택)' })).toHaveTextContent(
      '가족',
    );
    await userEvent.click(dialog.getByRole('button', { name: '저장' }));
    await userEvent.click(await dialog.findByRole('button', { name: '최신 내용 불러오기' }));
    await expect(dialog.getByRole('combobox', { name: '상위 옵션 (선택)' })).toHaveTextContent(
      '독립 옵션',
    );
    await userEvent.click(dialog.getAllByRole('button', { name: '닫기' })[0]);
    await expect(canvas.queryByRole('dialog')).toBeNull();
  },
};
