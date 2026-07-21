import { test, expect } from "../../fixtures/auth";

test.use({
  apiOverrides: {
    ownedList: {
      catalogs: Array.from({ length: 10 }, (_, i) => ({
        job_id: `tm-page1-${i + 1}`,
        title: `Model page-1 #${i + 1}`,
        summary: "Page 1 model",
        timestamp: "2026-06-20T10:00:00Z",
        is_owner: true,
        stats: { high: 1, medium: 0, low: 0 },
      })),
      pagination: { cursor: "cursor-2", hasNextPage: true },
    },
  },
});

test("Load More fetches the next page and appends rows", async ({ authenticatedPage }) => {
  const cursors: (string | null)[] = [];
  await authenticatedPage.route(
    /\/api\/threat-designer\/owned(\?.*)?$/,
    async (route) => {
      const url = new URL(route.request().url());
      const cursor = url.searchParams.get("cursor");
      cursors.push(cursor);
      if (cursor === "cursor-2") {
        return route.fulfill({
          json: {
            catalogs: Array.from({ length: 5 }, (_, i) => ({
              job_id: `tm-page2-${i + 1}`,
              title: `Model page-2 #${i + 1}`,
              summary: "Page 2 model",
              timestamp: "2026-06-15T10:00:00Z",
              is_owner: true,
              stats: { high: 0, medium: 1, low: 0 },
            })),
            pagination: { cursor: null, hasNextPage: false },
          },
        });
      }
      return route.fallback();
    }
  );

  await authenticatedPage.goto("/threat-catalog");
  await expect(authenticatedPage.getByTestId("tm-card-tm-page1-1")).toBeVisible();
  await expect(authenticatedPage.getByTestId("tm-card-tm-page2-1")).toHaveCount(0);

  await authenticatedPage.getByRole("button", { name: "Load More" }).click();

  await expect(authenticatedPage.getByTestId("tm-card-tm-page2-1")).toBeVisible();
  await expect(authenticatedPage.getByTestId("tm-card-tm-page1-1")).toBeVisible();
  expect(cursors).toContain("cursor-2");
});
