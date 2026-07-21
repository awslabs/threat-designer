import { test, expect } from "../../fixtures/auth";

test("card view is default and toggles to table view", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/threat-catalog");
  await expect(authenticatedPage.getByTestId("tm-card-tm-1")).toBeVisible();

  await authenticatedPage.getByRole("button", { name: /Table view/i }).click();

  await expect(authenticatedPage.getByTestId("tm-row-tm-1")).toBeVisible();
  await expect(authenticatedPage.getByTestId("tm-row-tm-2")).toBeVisible();
  await expect(authenticatedPage.getByTestId("tm-card-tm-1")).toHaveCount(0);
});
