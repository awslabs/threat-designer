import path from "path";
import { fileURLToPath } from "url";
import { test, expect } from "../../fixtures/auth";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DOC = path.resolve(__dirname, "../../fixtures/files/space-doc.pdf");

test("uploads a document to a space via presigned-URL 3-step flow", async ({
  authenticatedPage,
}) => {
  const calls: string[] = [];
  await authenticatedPage.route(/\/api\/spaces\/space-1\/documents\/upload/, async (route) => {
    calls.push("upload");
    return route.fulfill({
      json: {
        document_id: "doc-new-1",
        presigned_url: "http://mock.local/s3/space-upload",
        s3_key: "space-1/new-key",
      },
    });
  });
  await authenticatedPage.route(/http:\/\/mock\.local\/s3\/space-upload/, async (route) => {
    if (route.request().method() === "PUT") calls.push("s3-put");
    return route.fulfill({ status: 200, body: "" });
  });
  await authenticatedPage.route(/\/api\/spaces\/space-1\/documents\/confirm/, async (route) => {
    calls.push("confirm");
    return route.fulfill({
      json: { document_id: "doc-new-1", filename: "space-doc.pdf", status: "INGESTING" },
    });
  });

  await authenticatedPage.goto("/spaces/space-1");
  // Wait for the space detail to render.
  await expect(authenticatedPage.getByText(/General knowledge base/i).first()).toBeVisible();

  await authenticatedPage.locator('input[type="file"]').first().setInputFiles(DOC);

  await expect.poll(() => calls, { timeout: 5000 }).toEqual(["upload", "s3-put", "confirm"]);
});
