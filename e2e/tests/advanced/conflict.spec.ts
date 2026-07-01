import { test, expect } from "../../fixtures/auth";

test("a 409 PUT is detected by the client (conflict path exercised)", async ({
  authenticatedPage,
}) => {
  let putCount = 0;
  await authenticatedPage.route(
    /^http:\/\/mock\.local\/api\/threat-designer\/tm-1(\?.*)?$/,
    async (route) => {
      if (route.request().method() === "PUT") {
        putCount += 1;
        return route.fulfill({
          status: 409,
          json: {
            error: "conflict",
            server_state: {
              job_id: "tm-1",
              last_modified_at: "2026-07-01T00:00:00Z",
              last_modified_by: "someone-else",
            },
            server_timestamp: "2026-07-01T00:00:00Z",
            client_timestamp: "2026-06-20T10:00:00Z",
            username: "someone-else",
          },
        });
      }
      return route.fallback();
    }
  );

  const conflictLogged = new Promise<boolean>((resolve) => {
    authenticatedPage.on("console", (msg) => {
      if (msg.text().includes("Version conflict detected")) resolve(true);
    });
  });

  await authenticatedPage.goto("/tm-1");
  await expect(
    authenticatedPage.getByText("Card details exfiltration", { exact: false }).first()
  ).toBeVisible();

  // Make a change so the outer Save actually fires a PUT.
  await authenticatedPage
    .getByRole("button", { name: /Edit Card details exfiltration Threat/i })
    .click();
  await authenticatedPage.getByRole("menuitem", { name: "Edit" }).click();
  const editModal = authenticatedPage.getByRole("dialog", { name: "Edit item" });
  await editModal.locator("input").first().fill("Card details exfiltration — conflicted");
  await editModal.getByRole("button", { name: "Save" }).click();
  await expect(editModal).toBeHidden();

  await authenticatedPage.getByRole("button", { name: "Actions" }).click();
  await authenticatedPage.getByRole("menuitem", { name: "Save" }).click();

  await expect.poll(() => putCount, { timeout: 5000 }).toBeGreaterThan(0);
  expect(await Promise.race([conflictLogged, new Promise<boolean>((r) => setTimeout(() => r(false), 5000))])).toBe(true);
});
