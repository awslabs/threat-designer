import { test, expect } from "../../fixtures/auth";

test("owned and shared tabs surface distinct threat models", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/threat-catalog");
  await expect(authenticatedPage.getByTestId("threat-catalog")).toBeVisible();

  await expect(authenticatedPage.getByTestId("tm-card-tm-1")).toBeVisible();
  await expect(authenticatedPage.getByTestId("tm-card-tm-2")).toBeVisible();

  await authenticatedPage.getByRole("tab", { name: /Models shared with me/i }).click();
  await expect(authenticatedPage.getByTestId("tm-card-tm-shared-1")).toBeVisible();
  await expect(authenticatedPage.getByTestId("tm-card-tm-1")).toHaveCount(0);
});
