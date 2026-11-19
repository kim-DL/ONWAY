import { expect, type Page } from "@playwright/test";

export async function openDeliveryPhotoTool(page: Page, tool: string) {
  await page.getByRole("button", { name: "납품처 관리", exact: true }).click();
  const management = page.getByRole("dialog", { name: "납품처 관리", exact: true });
  await management.getByRole("button", { name: tool, exact: true }).click();
  await expect(management).toBeHidden();
}
