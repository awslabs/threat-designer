import { test, expect } from "../../fixtures/auth";

test("opens the attack tree drawer for a threat", async ({ authenticatedPage }) => {
  await authenticatedPage.goto("/tm-1");
  await expect(
    authenticatedPage.getByText("Card details exfiltration", { exact: false }).first()
  ).toBeVisible();

  await authenticatedPage
    .getByRole("button", { name: "View attack tree for Card details exfiltration" })
    .click();

  await expect(
    authenticatedPage.getByText(/Attack tree.*Card details exfiltration/i, { exact: false }).first()
  ).toBeVisible();
});

test("renders the ReactFlow canvas with mocked nodes and edges", async ({
  authenticatedPage,
}) => {
  await authenticatedPage.goto("/tm-1");
  await expect(
    authenticatedPage.getByText("Card details exfiltration", { exact: false }).first()
  ).toBeVisible();

  await authenticatedPage
    .getByRole("button", { name: "View attack tree for Card details exfiltration" })
    .click();

  // ReactFlow's stable class names mark the viewport and edges.
  await expect(authenticatedPage.locator(".react-flow__viewport")).toBeVisible();

  // The mocked tree has one root goal + one leaf; each renders with
  // data-testid="node-<id>" (propagated in commit 1).
  await expect(authenticatedPage.getByTestId("node-goal-1")).toBeVisible();
  await expect(authenticatedPage.getByTestId("node-leaf-1")).toBeVisible();

  // Node text content is projected through Cloudscape components.
  await expect(
    authenticatedPage.getByText("Exfiltrate card details").first()
  ).toBeVisible();
  await expect(authenticatedPage.getByText("SQL injection on API").first()).toBeVisible();

  // One edge is drawn.
  await expect(authenticatedPage.locator(".react-flow__edge-path").first()).toBeVisible();
});
