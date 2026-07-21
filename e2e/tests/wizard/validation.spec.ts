import { test, expect } from "../../fixtures/auth";

test("wizard blocks step 1 -> step 2 when title is empty", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/");
  await authenticatedPage.getByRole("button", { name: "Submit Threat Model" }).click();
  await expect(authenticatedPage.getByTestId("submission-wizard")).toBeVisible();

  await authenticatedPage.getByRole("button", { name: "Next" }).click();
  await expect(authenticatedPage.getByText("Title is required.")).toBeVisible();
});
