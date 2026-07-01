import path from "path";
import { fileURLToPath } from "url";
import type { Page, Route } from "@playwright/test";
import ownedList from "./mocks/threat-models-owned.json" with { type: "json" };
import sharedList from "./mocks/threat-models-shared.json" with { type: "json" };
import tmComplete from "./mocks/threat-model-complete.json" with { type: "json" };
import users from "./mocks/users.json" with { type: "json" };
import collaborators from "./mocks/collaborators.json" with { type: "json" };
import spaces from "./mocks/spaces.json" with { type: "json" };
import spaceDetail from "./mocks/space-detail.json" with { type: "json" };
import trail from "./mocks/trail.json" with { type: "json" };
import attackTree from "./mocks/attack-tree.json" with { type: "json" };

const API = "http://mock.local/api";
const S3 = "http://mock.local/s3";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ARCHITECTURE_PNG = path.resolve(__dirname, "files/architecture.png");

export type ApiOverrides = Partial<{
  ownedList: unknown;
  sharedList: unknown;
  threatModel: unknown;
  statusSequence: string[];
  collaborators: unknown;
  users: unknown;
  spaces: unknown;
  spaceDetail: unknown;
  attackTree: unknown;
  trail: unknown;
  onPost: (route: Route) => Promise<void> | void;
  onPut: (route: Route) => Promise<void> | void;
  onDelete: (route: Route) => Promise<void> | void;
  onShare: (route: Route) => Promise<void> | void;
}>;

// Playwright evaluates the LATEST-registered route first. We register from
// least-specific to most-specific so specific handlers override generic ones.
export async function installApiMocks(page: Page, overrides: ApiOverrides = {}) {
  const state = {
    statusIdx: 0,
    statusSequence: overrides.statusSequence ?? ["COMPLETE"],
  };

  // 1) Loud 404 catch-all — every unmocked API path.
  await page.route(new RegExp(`^${API}/.*`), (route) =>
    route.fulfill({
      status: 404,
      json: { error: "unmocked", url: route.request().url(), method: route.request().method() },
    })
  );

  // 2) Presigned S3 — return a real PNG for GETs (download flow needs a
  //    valid blob for FileReader), empty 200 for PUT uploads.
  await page.route(new RegExp(`^${S3}(/.*)?$`), (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({
        status: 200,
        contentType: "image/png",
        path: ARCHITECTURE_PNG,
      });
    }
    return route.fulfill({ status: 200, contentType: "text/plain", body: "" });
  });

  // 3) Attack tree.
  await page.route(new RegExp(`^${API}/attack-tree/.*`), (route) =>
    route.fulfill({ json: overrides.attackTree ?? attackTree })
  );

  // 4) Spaces — collection then item then documents (order matters, most-specific last).
  await page.route(new RegExp(`^${API}/spaces/?(\\?.*)?$`), (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: { space_id: "space-new-1", ok: true } });
    }
    return route.fulfill({ json: overrides.spaces ?? spaces });
  });
  await page.route(new RegExp(`^${API}/spaces/[^/]+(\\?.*)?$`), (route) => {
    const method = route.request().method();
    if (method === "DELETE") return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: overrides.spaceDetail ?? spaceDetail });
  });
  await page.route(
    new RegExp(`^${API}/spaces/[^/]+/documents(/[^/]+)?(\\?.*)?$`),
    (route) => {
      const method = route.request().method();
      if (method === "POST") {
        return route.fulfill({
          json: {
            document_id: "doc-new-1",
            presigned_url: `${S3}/space-upload`,
            s3_key: "space/new-key",
          },
        });
      }
      if (method === "DELETE") return route.fulfill({ json: { ok: true } });
      return route.fulfill({ json: { documents: [] } });
    }
  );

  // 5) Generic /threat-designer/:id (GET / PUT / DELETE). Specific paths below override this.
  await page.route(new RegExp(`^${API}/threat-designer/[^/?]+(\\?.*)?$`), async (route) => {
    const method = route.request().method();
    if (method === "GET") return route.fulfill({ json: overrides.threatModel ?? tmComplete });
    if (method === "PUT") {
      if (overrides.onPut) {
        await overrides.onPut(route);
        return;
      }
      return route.fulfill({ json: { ok: true } });
    }
    if (method === "DELETE") {
      if (overrides.onDelete) {
        await overrides.onDelete(route);
        return;
      }
      return route.fulfill({ json: { ok: true } });
    }
    return route.continue();
  });

  // 6) POST /threat-designer -> new tm / new version
  await page.route(new RegExp(`^${API}/threat-designer/?(\\?.*)?$`), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (overrides.onPost) {
      await overrides.onPost(route);
      return;
    }
    return route.fulfill({ json: { id: "tm-new-1", job_id: "tm-new-1" } });
  });

  // 7) Specific /threat-designer subpaths.
  await page.route(new RegExp(`^${API}/threat-designer/upload(\\?.*)?$`), (route) =>
    route.fulfill({ json: { presigned: `${S3}/upload-target`, name: "s3://mock/key.png" } })
  );
  await page.route(new RegExp(`^${API}/threat-designer/download(\\?.*)?$`), (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(`${S3}/download-target`) })
  );
  await page.route(new RegExp(`^${API}/threat-designer/download/batch(\\?.*)?$`), (route) =>
    route.fulfill({ json: { results: [] } })
  );
  await page.route(new RegExp(`^${API}/threat-designer/owned(\\?.*)?$`), (route) =>
    route.fulfill({ json: overrides.ownedList ?? ownedList })
  );
  await page.route(new RegExp(`^${API}/threat-designer/shared(\\?.*)?$`), (route) =>
    route.fulfill({ json: overrides.sharedList ?? sharedList })
  );
  await page.route(new RegExp(`^${API}/threat-designer/users(\\?.*)?$`), (route) =>
    route.fulfill({ json: overrides.users ?? users })
  );
  await page.route(new RegExp(`^${API}/threat-designer/status/[^/?]+(\\?.*)?$`), (route) => {
    const idx = Math.min(state.statusIdx, state.statusSequence.length - 1);
    const currentState = state.statusSequence[idx];
    state.statusIdx += 1;
    return route.fulfill({
      json: { state: currentState, retry: 0, detail: null, session_id: "session-1" },
    });
  });
  await page.route(new RegExp(`^${API}/threat-designer/trail/[^/?]+(\\?.*)?$`), (route) =>
    route.fulfill({ json: overrides.trail ?? trail })
  );
  await page.route(new RegExp(`^${API}/threat-designer/[^/]+/collaborators(\\?.*)?$`), (route) =>
    route.fulfill({ json: overrides.collaborators ?? collaborators })
  );

  // Lock service — grant the lock unconditionally so tests can edit.
  await page.route(new RegExp(`^${API}/threat-designer/[^/]+/lock(\\?.*)?$`), (route) => {
    const method = route.request().method();
    if (method === "POST") {
      return route.fulfill({
        json: { success: true, lock_token: "e2e-mock-lock-token", held_by: "e2e-user-1" },
      });
    }
    if (method === "DELETE") return route.fulfill({ json: { success: true } });
    return route.fulfill({ json: { success: true } });
  });
  await page.route(
    new RegExp(`^${API}/threat-designer/[^/]+/lock/(status|heartbeat)(\\?.*)?$`),
    (route) => route.fulfill({ json: { success: true, is_locked: true, held_by: "e2e-user-1" } })
  );

  await page.route(new RegExp(`^${API}/threat-designer/[^/]+/share(\\?.*)?$`), async (route) => {
    if (overrides.onShare) {
      await overrides.onShare(route);
      return;
    }
    return route.fulfill({ json: { ok: true } });
  });
}
