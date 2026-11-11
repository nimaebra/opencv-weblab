import type { Page } from '@playwright/test';
import { lessons } from '../../packages/pipeline/src/lessons';

export async function chooseOption(page: Page, name: string, option: string) {
  await page.getByRole('combobox', { name, exact: true }).click();
  await page.getByRole('listbox').getByRole('option', { name: option, exact: true }).click();
}

export async function chooseExample(page: Page, id: string) {
  const lesson = lessons.find((lesson) => lesson.id === id);
  if (!lesson) throw new Error(`Unknown example pipeline: ${id}`);
  await chooseOption(page, 'Example pipeline', lesson.title);
}
