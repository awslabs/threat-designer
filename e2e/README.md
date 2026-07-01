# E2E Playwright tests

Full end-to-end suite for the threat-designer frontend. All AWS/Cognito/Bedrock
calls are mocked — tests run against a plain Vite dev server that has been
started with `VITE_E2E_MOCK=true`.

## Run

```bash
bun install
bunx playwright install chromium

bun run test:e2e                        # all suites, fully parallel, headless
bun run test:e2e:headed                 # see the browser
bun run test:e2e:ui                     # Playwright's interactive runner
bun run test:e2e -- e2e/smoke.spec.ts   # single file
bun run test:e2e -- --debug e2e/tests/wizard/create.spec.ts   # step-through
```

## How the mocking works

- `vite.config.js` maps `aws-amplify/auth` (and friends) to
  `src/e2e/amplifyAuthMock.js` whenever `VITE_E2E_MOCK=true`. That means
  Amplify is never actually loaded — session tokens are synthesized from
  `window.__E2E_USER__`, which Playwright seeds via `addInitScript`.
- `e2e/fixtures/api.ts` calls `page.route()` for every backend endpoint the
  frontend touches (`/threat-designer/*`, `/attack-tree/*`, `/spaces/*`, and
  the mock `http://mock.local/s3/**` host that presigned URLs point at).
- Unmocked API calls return `404 { error: "unmocked", url, method }`, so
  missing routes fail loudly instead of silently.

## Ownership boundary

Each test suite owns a subdirectory under `e2e/tests/<suite>/` and, if it
needs bespoke mock payloads, a subdirectory under `e2e/fixtures/mocks/<suite>/`.
It never edits the shared fixtures. Overrides flow through
`installApiMocks(page, overrides)`.
