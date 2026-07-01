import { test, expect } from "../../fixtures/auth";

test("a 409 PUT opens the ConflictResolutionModal with server timestamp info", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.route(
    /^http:\/\/mock\.local\/api\/threat-designer\/tm-1(\?.*)?$/,
    async (route) => {
      if (route.request().method() === "PUT") {
        return route.fulfill({
          status: 409,
          json: {
            error: "conflict",
            server_state: {
              job_id: "tm-1",
              last_modified_at: "2026-07-01T00:00:00Z",
              last_modified_by: "someone-else",
              title: "Payments API threat model",
              description: "Handles card payments — server-side changes.",
              assumptions: ["Server has an added assumption."],
              assets: { assets: [] },
              system_architecture: {
                trust_boundaries: [],
                data_flows: [],
                threat_sources: [],
              },
              threat_list: { threats: [] },
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

  await authenticatedPage.goto("/tm-1");
  await expect(
    authenticatedPage.getByText("Card details exfiltration", { exact: false }).first()
  ).toBeVisible();

  // Make a change so the outer Save fires a PUT.
  await authenticatedPage
    .getByRole("button", { name: /Edit Card details exfiltration Threat/i })
    .click();
  await authenticatedPage.getByRole("menuitem", { name: "Edit" }).click();
  const editModal = authenticatedPage.getByRole("dialog", { name: "Edit item" });
  await editModal.getByLabel("Name").fill("Card details exfiltration — conflicted");
  await editModal.getByRole("button", { name: "Save" }).click();
  await expect(editModal).toBeHidden();

  await authenticatedPage.getByRole("button", { name: "Actions" }).click();
  await authenticatedPage.getByRole("menuitem", { name: "Save" }).click();

  // The visible ConflictResolutionModal opens with the diff summary.
  const conflictModal = authenticatedPage.getByTestId("conflict-modal");
  await expect(conflictModal).toBeVisible({ timeout: 10_000 });
  await expect(
    conflictModal.getByText(/The threat model has been modified/i)
  ).toBeVisible();
  await expect(conflictModal.getByText("someone-else")).toBeVisible();

  // The two resolution actions are exposed.
  await expect(
    authenticatedPage.getByRole("button", { name: /Use server version and discard/i })
  ).toBeVisible();
  await expect(
    authenticatedPage.getByRole("button", { name: /Use my version and overwrite/i })
  ).toBeVisible();
});
