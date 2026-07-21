import { test, expect } from "./fixtures/auth";

test("boots into authenticated shell", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/");
  await expect(authenticatedPage.getByTestId("app-sidebar")).toBeVisible();
});

test("shows login page when unauthenticated", async ({ unauthenticatedPage }) => {
  await unauthenticatedPage.goto("/");
  await expect(unauthenticatedPage.getByTestId("login-page")).toBeVisible();
});
