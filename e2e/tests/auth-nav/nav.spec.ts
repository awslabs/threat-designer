import { test, expect } from "../../fixtures/auth";
import { navSidebar } from "../../utils/selectors";

test("sidebar navigates across primary routes", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/");
  await expect(authenticatedPage).toHaveURL(/\/$/);

  await navSidebar(authenticatedPage, "Threat Catalog");
  await expect(authenticatedPage).toHaveURL(/\/threat-catalog$/);
  await expect(authenticatedPage.getByTestId("threat-catalog")).toBeVisible();

  await navSidebar(authenticatedPage, "Spaces");
  await expect(authenticatedPage).toHaveURL(/\/spaces$/);

  await navSidebar(authenticatedPage, "New");
  await expect(authenticatedPage).toHaveURL(/\/$/);
});
