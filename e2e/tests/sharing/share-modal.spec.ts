import { test, expect } from "../../fixtures/auth";

test("opens the sharing modal and lists existing collaborators", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/tm-1");
  await expect(authenticatedPage.getByTestId("threat-model-header")).toBeVisible();

  await authenticatedPage.getByRole("button", { name: "Actions" }).click();
  await authenticatedPage.getByRole("menuitem", { name: "Share" }).click();

  const modal = authenticatedPage.getByRole("dialog");
  await expect(modal).toBeVisible();

  // Existing collaborator from collaborators.json.
  await expect(modal.getByText("alice@example.com")).toBeVisible();
});

test("adds a new collaborator and fires a POST /share", async ({ authenticatedPage }) => {
  let sharePost: Record<string, unknown> | null = null;
  await authenticatedPage.route(
    /\/threat-designer\/tm-1\/share(\?.*)?$/,
    async (route) => {
      if (route.request().method() === "POST") {
        sharePost = route.request().postDataJSON();
        return route.fulfill({ json: { ok: true } });
      }
      return route.fallback();
    }
  );

  await authenticatedPage.goto("/tm-1");
  await authenticatedPage.getByRole("button", { name: "Actions" }).click();
  await authenticatedPage.getByRole("menuitem", { name: "Share" }).click();

  const modal = authenticatedPage.getByRole("dialog");
  await expect(modal).toBeVisible();

  // Cloudscape Select — the FormField "Add collaborator" wraps a select
  // trigger button; click to open, then pick a not-yet-collaborator user.
  // collab-1 (Alice) is already a collaborator, so the dropdown only offers Bob.
  await modal.getByRole("button", { name: /Add collaborator Search for a user/ }).click();
  await authenticatedPage.getByRole("option", { name: /bob@example\.com/ }).click();

  await modal.getByRole("button", { name: /Add selected user as collaborator/ }).click();

  await expect
    .poll(() => sharePost, { timeout: 5000 })
    .toMatchObject({
      collaborators: [{ user_id: "collab-2", access_level: "READ_ONLY" }],
    });
});
