import { test, expect } from "../../fixtures/auth";

test("threat catalog exposes property filter with all mocked threats", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/tm-1");

  const results = authenticatedPage.getByTestId("results-root");
  await expect(results).toBeVisible();

  // Header counter reflects the two mocked threats.
  await expect(results.getByText(/^Threat Catalog$/)).toBeVisible();
  await expect(results.getByText(/\(2\)/)).toBeVisible();

  // PropertyFilter is present.
  await expect(authenticatedPage.getByLabel("Filter threats")).toBeVisible();

  // Both threats are visible before filtering.
  await expect(results.getByText("Card details exfiltration")).toBeVisible();
  await expect(results.getByText("Replay attack")).toBeVisible();
});
