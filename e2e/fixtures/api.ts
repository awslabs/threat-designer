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
  onPost: (route: Route) => Promise<void> | void;
  onPut: (route: Route) => Promise<void> | void;
  onDelete: (route: Route) => Promise<void> | void;
  onShare: (route: Route) => Promise<void> | void;
}>;

export async function installApiMocks(page: Page, overrides: ApiOverrides = {}) {
  const state = {
    statusIdx: 0,
    statusSequence: overrides.statusSequence ?? ["COMPLETE"],
  };

  // Presigned S3 host — used for both uploads (PUT) and downloads (GET)
  await page.route(new RegExp(`^${S3}(/.*)?$`), (route) =>
    route.fulfill({ status: 200, contentType: "text/plain", body: "" })
  );

  // POST /threat-designer/upload -> return presigned URL + S3 key name
  await page.route(new RegExp(`^${API}/threat-designer/upload(\\?.*)?$`), (route) =>
    route.fulfill({ json: { presigned: `${S3}/upload-target`, name: "s3://mock/key.png" } })
  );

  // POST /threat-designer/download -> plain-text presigned URL (per stats.jsx: response.data is the URL)
  await page.route(new RegExp(`^${API}/threat-designer/download(\\?.*)?$`), (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(`${S3}/download-target`) })
  );

  // GET /threat-designer/owned
  await page.route(new RegExp(`^${API}/threat-designer/owned(\\?.*)?$`), (route) =>
    route.fulfill({ json: overrides.ownedList ?? ownedList })
  );

  // GET /threat-designer/shared
  await page.route(new RegExp(`^${API}/threat-designer/shared(\\?.*)?$`), (route) =>
    route.fulfill({ json: overrides.sharedList ?? sharedList })
  );

  // GET /threat-designer/status/:id — advances a sequence per call
  await page.route(new RegExp(`^${API}/threat-designer/status/[^/?]+(\\?.*)?$`), (route) => {
    const idx = Math.min(state.statusIdx, state.statusSequence.length - 1);
    const currentState = state.statusSequence[idx];
    state.statusIdx += 1;
    return route.fulfill({
      json: { state: currentState, retry: 0, detail: null, session_id: "session-1" },
    });
  });

  // GET /threat-designer/trail/:id
  await page.route(new RegExp(`^${API}/threat-designer/trail/[^/?]+(\\?.*)?$`), (route) =>
    route.fulfill({ json: overrides.trail ?? trail })
  );

  // Collaborators + users + share (must precede the generic /:id catch-all)
  await page.route(new RegExp(`^${API}/threat-designer/[^/]+/collaborators(\\?.*)?$`), (route) =>
    route.fulfill({ json: overrides.collaborators ?? collaborators })
  );
  await page.route(new RegExp(`^${API}/threat-designer/users(\\?.*)?$`), (route) =>
    route.fulfill({ json: overrides.users ?? users })
  );
  await page.route(new RegExp(`^${API}/threat-designer/[^/]+/share(\\?.*)?$`), async (route) => {
    if (overrides.onShare) {
      await overrides.onShare(route);
      return;
    }
    return route.fulfill({ json: { ok: true } });
  });

  // Attack tree
  await page.route(new RegExp(`^${API}/attack-tree/.*`), (route) =>
    route.fulfill({ json: overrides.attackTree ?? attackTree })
  );

  // Spaces
  await page.route(new RegExp(`^${API}/spaces/?(\\?.*)?$`), (route) => {
    if (route.request().method() === "POST") {
      return route.fulfill({ json: { space_id: "space-new-1", ok: true } });
    }
    return route.fulfill({ json: overrides.spaces ?? spaces });
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
  await page.route(new RegExp(`^${API}/spaces/[^/]+(\\?.*)?$`), (route) => {
    const method = route.request().method();
    if (method === "DELETE") return route.fulfill({ json: { ok: true } });
    return route.fulfill({ json: overrides.spaceDetail ?? spaceDetail });
  });

  // POST /threat-designer  -> starts new tm (or version) -> return { id }
  // Must match BEFORE the generic /:id handler below.
  await page.route(new RegExp(`^${API}/threat-designer/?(\\?.*)?$`), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    if (overrides.onPost) {
      await overrides.onPost(route);
      return;
    }
    return route.fulfill({ json: { id: "tm-new-1", job_id: "tm-new-1" } });
  });

  // Generic /threat-designer/:id (GET/PUT/DELETE)
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

  // Fallback: any other API path -> 404 loud
  await page.route(new RegExp(`^${API}/.*`), (route) =>
    route.fulfill({
      status: 404,
      json: { error: "unmocked", url: route.request().url(), method: route.request().method() },
    })
  );
}
