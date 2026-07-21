import { test, expect } from "../../fixtures/auth";

test("Actions → Download → JSON produces a downloadable file", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/tm-1");
  await expect(authenticatedPage.getByTestId("threat-model-header")).toBeVisible();

  await expect(
    authenticatedPage.getByText("Card details exfiltration", { exact: false }).first()
  ).toBeVisible();

  await authenticatedPage.getByRole("button", { name: "Actions" }).click();
  await authenticatedPage.getByRole("menuitem", { name: /^Download$/ }).click();

  const [download] = await Promise.all([
    authenticatedPage.waitForEvent("download"),
    authenticatedPage.getByRole("menuitem", { name: "JSON" }).click(),
  ]);

  expect(download.suggestedFilename()).toMatch(/\.json$/);
});
