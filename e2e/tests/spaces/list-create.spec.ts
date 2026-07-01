import { test, expect } from "../../fixtures/auth";
import { navSidebar } from "../../utils/selectors";

test("spaces panel shows existing spaces and creates a new one", async ({ authenticatedPage }) => {
  let createBody: Record<string, unknown> | null = null;
  await authenticatedPage.route(/\/api\/spaces\/?(\?.*)?$/, async (route) => {
    if (route.request().method() === "POST") {
      createBody = route.request().postDataJSON();
      return route.fulfill({
        json: {
          space_id: "space-new-1",
          name: (createBody as { name: string }).name,
          description: (createBody as { description: string }).description,
        },
      });
    }
    return route.fallback();
  });

  await authenticatedPage.goto("/spaces");
  await expect(authenticatedPage.getByText("General knowledge base")).toBeVisible();

  await authenticatedPage.getByRole("button", { name: "New space" }).click();

  const modal = authenticatedPage.getByRole("dialog", { name: "Create space" });
  await expect(modal).toBeVisible();

  await modal.getByPlaceholder("My project space").fill("New Space From Test");
  await modal.getByPlaceholder("Describe this space...").fill("Populated in e2e");

  await modal.getByRole("button", { name: "Create" }).click();

  await expect(authenticatedPage).toHaveURL(/\/spaces\/space-new-1$/);
  expect(createBody).toEqual({
    name: "New Space From Test",
    description: "Populated in e2e",
  });
});
