import { test, expect } from "../../fixtures/auth";

test("navigating to a threat model URL renders results shell + header", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/tm-1");

  await expect(authenticatedPage.getByTestId("threat-model-header")).toBeVisible();
});

test("threat list renders threats from the mocked model", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/tm-1");

  await expect(
    authenticatedPage.getByText("Card details exfiltration", { exact: false }).first()
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    authenticatedPage.getByText("Replay attack", { exact: false }).first()
  ).toBeVisible();
});
