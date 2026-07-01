import { test, expect } from "../../fixtures/auth";

test("opens the attack tree drawer for a threat", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/tm-1");
  await expect(
    authenticatedPage.getByText("Card details exfiltration", { exact: false }).first()
  ).toBeVisible();

  // Each threat row has an AttackTreeButton with ariaLabel "View attack tree for <name>"
  await authenticatedPage
    .getByRole("button", { name: "View attack tree for Card details exfiltration" })
    .click();

  // The AttackTreeViewer opens in the split panel — assert the panel header
  // includes the threat name.
  await expect(
    authenticatedPage.getByText(/Attack tree.*Card details exfiltration/i, { exact: false }).first()
  ).toBeVisible();
});
