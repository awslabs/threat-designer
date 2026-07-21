import { test, expect } from "../../fixtures/auth";
import { expandSidebar } from "../../utils/selectors";

test("sign out from user dropdown returns to login page", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/");
  await expect(authenticatedPage.getByTestId("app-sidebar")).toBeVisible();
  await expandSidebar(authenticatedPage);

  // The user menu trigger's accessible name is the initials ("TU" for Test User).
  await authenticatedPage.getByRole("button", { name: "TU" }).click();
  await authenticatedPage.getByRole("menuitem", { name: /Sign out/i }).click();

  await expect(authenticatedPage.getByTestId("login-page")).toBeVisible();
});
