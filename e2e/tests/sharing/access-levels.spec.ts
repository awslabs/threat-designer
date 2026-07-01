import { test, expect } from "../../fixtures/auth";
import readOnlyModel from "../../fixtures/mocks/threat-model-shared-readonly.json" with { type: "json" };

test.use({
  apiOverrides: {
    threatModel: readOnlyModel,
  },
});

test("non-owner sees no Share/Delete/Create-new-version actions", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/tm-1");
  await expect(authenticatedPage.getByTestId("threat-model-header")).toBeVisible();

  await authenticatedPage.getByRole("button", { name: "Actions" }).click();

  // Owner-only actions must NOT be present in the menu.
  await expect(authenticatedPage.getByRole("menuitem", { name: "Share" })).toHaveCount(0);
  await expect(authenticatedPage.getByRole("menuitem", { name: "Delete" })).toHaveCount(0);
  await expect(
    authenticatedPage.getByRole("menuitem", { name: "Create new version" })
  ).toHaveCount(0);

  // Non-mutating actions are still available.
  await expect(authenticatedPage.getByRole("menuitem", { name: "Trail" })).toBeVisible();
  await expect(authenticatedPage.getByRole("menuitem", { name: /^Download$/ })).toBeVisible();
});
