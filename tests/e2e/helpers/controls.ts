import { expect, type Locator } from '@playwright/test';

function fieldTrigger(locator: Locator) {
  return locator.and(locator.page().locator('button[aria-controls]'));
}

/** Resolve the popup attached to the visible control, including inside a modal dialog. */
export async function controlPopup(trigger: Locator) {
  const id = await fieldTrigger(trigger).getAttribute('aria-controls');
  expect(id, 'The control must identify its popup for assistive technology').toBeTruthy();
  return trigger.page().locator(`[id=${JSON.stringify(id)}]`);
}

/** Exercise the same custom menu that a person uses, without manipulating React state. */
export async function selectChoice(trigger: Locator, value: string | { label: string }) {
  trigger = fieldTrigger(trigger);
  await trigger.click();
  const popup = await controlPopup(trigger);
  await expect(popup).toBeVisible();
  const option =
    typeof value === 'string'
      ? popup.locator(`[role="option"][data-value=${JSON.stringify(value)}]`)
      : popup.getByRole('option', { name: value.label, exact: true });
  await option.click();
  await expect(popup).not.toBeVisible();
  if (typeof value === 'string') await expect(trigger).toHaveAttribute('data-value', value);
}

async function chooseCalendarMonth(popup: Locator, value: string) {
  const targetYear = Number(value.slice(0, 4));
  const heading = await popup.getByRole('grid').getAttribute('aria-label');
  const currentYear = Number(heading?.match(/^(\d+)년/)?.[1]);
  expect(Number.isFinite(currentYear), 'Calendar grid must identify the displayed year').toBe(true);
  const direction = targetYear < currentYear ? '이전 연도' : '다음 연도';
  for (let step = 0; step < Math.abs(targetYear - currentYear); step++)
    await popup.getByRole('button', { name: direction, exact: true }).click();
  await popup.getByRole('gridcell', { name: value, exact: true }).click();
}

export async function chooseMonth(trigger: Locator, value: string) {
  trigger = fieldTrigger(trigger);
  await trigger.click();
  const popup = await controlPopup(trigger);
  await expect(popup).toBeVisible();
  if (value) await chooseCalendarMonth(popup, value);
  else await popup.getByRole('button', { name: '지우기', exact: true }).click();
  await expect(popup).not.toBeVisible();
  await expect(trigger).toHaveAttribute('data-value', value);
}

export async function chooseDate(trigger: Locator, value: string) {
  trigger = fieldTrigger(trigger);
  await trigger.click();
  const popup = await controlPopup(trigger);
  await expect(popup).toBeVisible();
  if (value) {
    await popup.getByRole('button', { name: /, 월 선택$/ }).click();
    await chooseCalendarMonth(popup, value.slice(0, 7));
    await popup.getByRole('gridcell', { name: value, exact: true }).click();
  } else await popup.getByRole('button', { name: '지우기', exact: true }).click();
  await expect(popup).not.toBeVisible();
  await expect(trigger).toHaveAttribute('data-value', value);
}
