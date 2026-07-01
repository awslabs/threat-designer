import { test, expect } from "../../fixtures/auth";

test.use({
  apiOverrides: {
    onDelete: async (route) => {
      await route.fulfill({ json: { ok: true } });
    },
  },
});

test("delete removes a card from the owned tab", async ({ authenticatedPage }) => {
  const deleteCalls: string[] = [];
  await authenticatedPage.route(/\/threat-designer\/tm-1(\?.*)?$/, async (route) => {
    if (route.request().method() === "DELETE") {
      deleteCalls.push(route.request().url());
      return route.fulfill({ json: { ok: true } });
    }
    return route.fallback();
  });

  await authenticatedPage.goto("/threat-catalog");
  const card = authenticatedPage.getByTestId("tm-card-tm-1");
  await expect(card).toBeVisible();

  await card.getByRole("button").last().click();
  await authenticatedPage.getByRole("menuitem", { name: "Delete" }).click();

  await expect(authenticatedPage.getByTestId("tm-card-tm-1")).toHaveCount(0);
  expect(deleteCalls.length).toBeGreaterThan(0);
});
