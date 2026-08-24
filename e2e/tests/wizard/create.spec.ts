import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "../../fixtures/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIAGRAM = path.resolve(__dirname, "../../fixtures/files/architecture.png");

test("submits a threat model through the 5-step wizard", async ({ authenticatedPage }) => {
  let postBody: unknown = null;
  await authenticatedPage.route(
    /http:\/\/mock\.local\/api\/threat-designer\/?(\?.*)?$/,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      postBody = route.request().postDataJSON();
      return route.fulfill({ json: { id: "tm-new-1", job_id: "tm-new-1" } });
    }
  );

  await authenticatedPage.goto("/");
  await authenticatedPage.getByRole("button", { name: "Submit Threat Model" }).click();
  const wizard = authenticatedPage.getByTestId("submission-wizard");
  await expect(wizard).toBeVisible();

  // Step 1 — Title
  await wizard.getByLabel("Threat model title").fill("My E2E Threat Model");
  await authenticatedPage.getByRole("button", { name: "Next" }).click();

  // Step 2 — Primary diagram upload
  await wizard.locator('input[type="file"]').first().setInputFiles(DIAGRAM);
  await authenticatedPage.getByRole("button", { name: "Next" }).click();

  // Step 3 — Details (defaults are fine: application type = Hybrid, no space)
  await authenticatedPage.getByRole("button", { name: "Next" }).click();

  // Step 4 — Agent config (defaults: iteration Auto, reasoning 0)
  await authenticatedPage.getByRole("button", { name: "Next" }).click();

  // Step 5 — Provide assumptions (optional; skip)
  await authenticatedPage.getByRole("button", { name: "Next" }).click();

  // Step 6 — Review + Submit
  await authenticatedPage.getByRole("button", { name: /Start threat modeling/i }).click();

  await expect(authenticatedPage).toHaveURL(/\/tm-new-1$/);
  expect(postBody).toMatchObject({
    title: "My E2E Threat Model",
    application_type: "hybrid",
    methodology: "stride",
  });
});

test("submits a MAESTRO threat model via the methodology selector", async ({
  authenticatedPage,
}) => {
  let postBody: unknown = null;
  await authenticatedPage.route(
    /http:\/\/mock\.local\/api\/threat-designer\/?(\?.*)?$/,
    async (route) => {
      if (route.request().method() !== "POST") return route.fallback();
      postBody = route.request().postDataJSON();
      return route.fulfill({ json: { id: "tm-new-2", job_id: "tm-new-2" } });
    }
  );

  await authenticatedPage.goto("/");
  await authenticatedPage.getByRole("button", { name: "Submit Threat Model" }).click();
  const wizard = authenticatedPage.getByTestId("submission-wizard");
  await expect(wizard).toBeVisible();

  // Step 1 — Title
  await wizard.getByLabel("Threat model title").fill("My MAESTRO Threat Model");
  await authenticatedPage.getByRole("button", { name: "Next" }).click();

  // Step 2 — Primary diagram upload
  await wizard.locator('input[type="file"]').first().setInputFiles(DIAGRAM);
  await authenticatedPage.getByRole("button", { name: "Next" }).click();

  // Step 3 — Details: switch methodology from the STRIDE default to MAESTRO
  await wizard.getByRole("button", { name: "Methodology STRIDE" }).click();
  await authenticatedPage.getByRole("option", { name: /MAESTRO/ }).click();
  await authenticatedPage.getByRole("button", { name: "Next" }).click();

  // Steps 4 + 5 — Agent config and assumptions (defaults)
  await authenticatedPage.getByRole("button", { name: "Next" }).click();
  await authenticatedPage.getByRole("button", { name: "Next" }).click();

  // Step 6 — Review shows the chosen methodology, then submit
  await expect(wizard.getByLabel("Methodology")).toHaveValue("MAESTRO (agentic AI)");
  await authenticatedPage.getByRole("button", { name: /Start threat modeling/i }).click();

  await expect(authenticatedPage).toHaveURL(/\/tm-new-2$/);
  expect(postBody).toMatchObject({
    title: "My MAESTRO Threat Model",
    methodology: "maestro",
  });
});
