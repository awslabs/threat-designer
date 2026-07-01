import { test, expect } from "../../fixtures/auth";

test("mocked sign-in transitions from login page to authenticated shell", async ({
  unauthenticatedPage,
}) => {
  await unauthenticatedPage.goto("/");
  await expect(unauthenticatedPage.getByTestId("login-page")).toBeVisible();

  // Login form's <label>s aren't associated to <input>s via `for`, so target
  // the fields by type + order inside the form.
  await unauthenticatedPage.locator('input[type="text"]').first().fill("test-user");
  await unauthenticatedPage.locator('input[type="password"]').first().fill("Passw0rd!");
  await unauthenticatedPage.getByRole("button", { name: "Sign In" }).click();

  await expect(unauthenticatedPage.getByTestId("app-sidebar")).toBeVisible();
});
