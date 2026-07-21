import { test as base, expect, type Page } from "@playwright/test";
import { installApiMocks, type ApiOverrides } from "./api";
import type { MockUser } from "./types";

type Fixtures = {
  mockUser: MockUser;
  apiOverrides: ApiOverrides;
  authenticatedPage: Page;
  unauthenticatedPage: Page;
};

const DEFAULT_USER: MockUser = {
  userId: "e2e-user-1",
  given_name: "Test",
  family_name: "User",
  email: "test@example.com",
};

export const test = base.extend<Fixtures>({
  // Per-test overridable — write `test.use({ mockUser: {...} })` in a suite to swap identity.
  mockUser: DEFAULT_USER,
  apiOverrides: {},

  authenticatedPage: async ({ page, mockUser, apiOverrides }, use) => {
    await page.addInitScript((user) => {
      // Seed identity BEFORE Vite loads the app so bootstrap.jsx sees a logged-in user.
      (window as unknown as { __E2E_USER__: MockUser | null }).__E2E_USER__ = user;
    }, mockUser);
    await installApiMocks(page, apiOverrides);
    await use(page);
  },

  unauthenticatedPage: async ({ page, apiOverrides }, use) => {
    await page.addInitScript(() => {
      (window as unknown as { __E2E_USER__: MockUser | null }).__E2E_USER__ = null;
    });
    await installApiMocks(page, apiOverrides);
    await use(page);
  },
});

export { expect };
