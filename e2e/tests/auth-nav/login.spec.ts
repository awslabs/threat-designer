import { test, expect } from "../../fixtures/auth";

test("mocked sign-in transitions from login page to authenticated shell", async ({
  unauthenticatedPage,
}) => {
  await unauthenticatedPage.goto("/");
  await expect(unauthenticatedPage.getByTestId("login-page")).toBeVisible();

  await unauthenticatedPage.getByLabel("Username").fill("test-user");
  await unauthenticatedPage.getByLabel("Password").fill("Passw0rd!");
  await unauthenticatedPage.getByRole("button", { name: "Sign In" }).click();

  await expect(unauthenticatedPage.getByTestId("app-sidebar")).toBeVisible();
});
