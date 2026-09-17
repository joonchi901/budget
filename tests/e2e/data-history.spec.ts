import { openGlobalView, openRoom } from './helpers/navigation';
import { expect, test } from '@playwright/test';
import type { Transaction, TransactionInput } from '../../src/shared/types';

test('saved transaction history exposes before and after values including deleted records', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: '나로 시작하기' }).click();
  await openRoom(page);
  await expect(page.getByRole('heading', { name: '우리의 일상' })).toBeVisible();
  const input: TransactionInput = {
    ledgerId: 'main',
    date: '2026-09-16',
    description: '이력 화면 검증 원래 내용',
    amount: 12000,
    type: 'expense',
    ownerId: 'shared',
    paymentMethodId: 'cash',
    tagIds: [],
    allocations: [],
  };
  const create = await page.request.post('/api/transactions', {
    data: { mutationId: crypto.randomUUID(), transaction: input },
  });
  expect(create.status()).toBe(200);
  const first = (await create.json()).transaction as Transaction;
  expect(first.createdBy).toBe('u1');
  const update = await page.request.post('/api/transactions', {
    data: {
      mutationId: crypto.randomUUID(),
      expectedVersion: first.version,
      transaction: {
        ...input,
        id: first.id,
        description: '이력 화면 검증 수정 내용',
        amount: 14000,
      },
    },
  });
  expect(update.status()).toBe(200);
  const edited = (await update.json()).transaction as Transaction;
  const remove = await page.request.delete(`/api/transactions/${first.id}`, {
    data: { mutationId: crypto.randomUUID(), expectedVersion: edited.version },
  });
  expect(remove.status()).toBe(200);
  await openGlobalView(page, '데이터 관리');
  await page.getByRole('tab', { name: '변경 이력', exact: true }).click();
  await expect(page.getByRole('heading', { name: '최근 변경 이력', exact: true })).toBeVisible();
  const updateHistory = page
    .locator('.history-entry')
    .filter({ hasText: first.id })
    .filter({ hasText: '거래 · 수정' });
  await updateHistory.locator('summary').click();
  await expect(
    updateHistory.getByRole('cell', { name: '이력 화면 검증 원래 내용', exact: true }),
  ).toBeVisible();
  await expect(
    updateHistory.getByRole('cell', { name: '이력 화면 검증 수정 내용', exact: true }),
  ).toBeVisible();
  await expect(updateHistory.getByRole('cell', { name: '12,000', exact: true })).toBeVisible();
  await expect(updateHistory.getByRole('cell', { name: '14,000', exact: true })).toBeVisible();
  const deletion = page
    .locator('.history-entry')
    .filter({ hasText: first.id })
    .filter({ hasText: '거래 · 삭제' });
  await deletion.locator('summary').click();
  await expect(deletion.getByRole('rowheader', { name: '삭제 시각', exact: true })).toBeVisible();
  const creation = page
    .locator('.history-entry')
    .filter({ hasText: first.id })
    .filter({ hasText: '거래 · 생성' });
  await creation.locator('summary').click();
  await expect(creation.getByRole('rowheader', { name: '최초 작성자', exact: true })).toBeVisible();
  await expect(creation.getByRole('row', { name: /최초 작성자/ })).toContainText('나');
  await page.setViewportSize({ width: 320, height: 900 });
  const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
  expect(fits).toBe(true);
});
