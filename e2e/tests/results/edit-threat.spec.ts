import { test, expect } from "../../fixtures/auth";

test("editing a threat updates the row inline", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/tm-1");
  await expect(
    authenticatedPage.getByText("Card details exfiltration", { exact: false }).first()
  ).toBeVisible();

  await authenticatedPage
    .getByRole("button", { name: /Edit Card details exfiltration Threat/i })
    .click();
  await authenticatedPage.getByRole("menuitem", { name: "Edit" }).click();

  const modal = authenticatedPage.getByRole("dialog");
  await expect(modal).toBeVisible();

  await modal.getByLabel("Name").fill("Card details exfiltration — updated");

  await modal.getByRole("button", { name: "Save" }).click();
  await expect(modal).toBeHidden();

  await expect(
    authenticatedPage.getByText("Card details exfiltration — updated", { exact: false }).first()
  ).toBeVisible();
});
