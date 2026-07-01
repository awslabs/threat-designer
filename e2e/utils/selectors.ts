import type { Page } from "@playwright/test";

/**
 * The sidebar starts collapsed (defaultOpen={false} in App.jsx), which hides
 * the label text on nav buttons and strips their accessible name. Call this
 * before interacting with nav items by text.
 */
export async function expandSidebar(page: Page): Promise<void> {
  const expand = page.getByRole("button", { name: "Expand sidebar" });
  if (await expand.isVisible().catch(() => false)) {
    await expand.click();
  }
}

/**
 * Click a primary sidebar nav item ("New" | "Threat Catalog" | "Spaces").
 * Ensures the sidebar is expanded first so the label is in the ax tree.
 */
export async function navSidebar(page: Page, name: "New" | "Threat Catalog" | "Spaces") {
  await expandSidebar(page);
  await page.getByTestId("app-sidebar").getByRole("button", { name, exact: true }).click();
}
