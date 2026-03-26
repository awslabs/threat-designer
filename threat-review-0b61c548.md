## Threat Review: threat-designer

Model: 0b61c548 | 21 threats | min-likelihood: medium | stride: all | 2026-03-24

---

## Security Tasks

### Critical

- [ ] **Cognito User Pool Credential Stuffing** (`infra/cognito.tf:15`)
  - **Threat:** Credential stuffing attacks against Cognito with no MFA or advanced security — High, Spoofing
  - **Gap:** `mfa_configuration = "OFF"` (line 15) and `advanced_security_mode = "OFF"` (line 35). `ALLOW_USER_PASSWORD_AUTH` is enabled in `explicit_auth_flows` (line 67), exposing the plain-password authentication flow. No compromised-credential detection.
  - **Fix:** Set `mfa_configuration = "OPTIONAL"` (or `"ON"`) with TOTP in `infra/cognito.tf`. Set `advanced_security_mode = "FULL"` to enable adaptive authentication and compromised credential detection. Remove `ALLOW_USER_PASSWORD_AUTH` from `explicit_auth_flows` — keep only `ALLOW_USER_SRP_AUTH` and `ALLOW_REFRESH_TOKEN_AUTH`.

- [ ] **Prompt Injection Against AI Agents — No Input Sanitization** (`backend/threat_designer/message_builder.py:92`)
  - **Threat:** Malicious prompts injected via user-controlled fields manipulate AI agents — High, Tampering
  - **Gap:** User-supplied `description` and `assumptions` are interpolated directly into XML-tagged model messages at `message_builder.py:92-97` with no sanitization or length limits. An attacker can embed `</description>` closing tags to break out of context. The `instructions` field is injected raw into the system prompt at `prompts.py:588`. Similarly, `space_insights_block()` at line 374 inserts KB-retrieved content verbatim — a poisoned document in the Knowledge Base reaches the model unfiltered. No Bedrock Guardrails are configured anywhere.
  - **Fix:** (1) Strip XML closing tags from user inputs before embedding: `description.replace("</description>", "").replace("</assumptions>", "")` in `message_builder.py` `base_msg()`. (2) Add length limits in `backend/threat_designer/agent.py:_handle_new_state` — cap `description` at 5000 chars, each assumption at 500 chars, `instructions` at 2000 chars. (3) Enforce strict character allowlist on `instructions`: strip `<`, `>`, `</` before prompt insertion. (4) Configure Bedrock Guardrails via `BEDROCK_GUARDRAIL_ID` env var and attach in `model_service.py` model initialization. (5) Wrap KB-retrieved insights with an explicit low-trust marker in the prompt.

- [ ] **Prompt Injection — Sentry JWT Signature Bypass** (`backend/sentry/agent.py:34`)
  - **Threat:** Forged JWT tokens accepted by Sentry due to disabled signature verification — High, Tampering
  - **Gap:** `jwt.decode(token, options={"verify_signature": False})` at `agent.py:34` skips signature validation. The `@lru_cache(maxsize=128)` at line 20 caches decoded tokens indefinitely within a container's lifetime — a token that a user has logged out of remains "valid" in Sentry's cache until the container recycles.
  - **Fix:** Remove `"verify_signature": False` and validate the JWT signature using the Cognito JWKS endpoint, matching the pattern in `backend/authorizer/index.py:41-47`. Replace `@lru_cache` with `cachetools.TTLCache(maxsize=128, ttl=300)` to bound how long a token is trusted after potential invalidation.

- [ ] **Stored XSS via AI Agent Output — Chart Data Injection** (`src/components/Agent/TextContent.jsx:18`)
  - **Threat:** AI-generated content containing malicious payloads executes in viewers' browsers — High, Tampering
  - **Gap:** The `sanitizeSchema` in `TextContent.jsx:18` extends the default rehype-sanitize schema to whitelist `<chart>` elements with a `dataConfig` attribute. The `rehypeRaw` plugin (line 471) parses raw HTML before sanitization. If the AI is induced to emit a `<chart dataConfig='...'>` block with a crafted JSON payload, `ChartRenderer.jsx` processes it. While `sanitizeConfig()` at `ChartRenderer.jsx:106` sanitizes string fields with DOMPurify, the `data.values` array entries are not fully sanitized (only specific string fields, not arbitrary nested data).
  - **Fix:** In `ChartRenderer.jsx:106`, recursively sanitize ALL string values in the parsed config object, not just known fields. Add a depth/size limit to the parsed JSON. In `TextContent.jsx`, consider removing `rehypeRaw` from the pipeline unless raw HTML rendering from the AI is strictly required — without it, `<chart>` cannot be injected via content.

- [ ] **Broken Access Control — MCP Full Cross-Tenant Access** (`backend/app/routes/threat_designer_route.py:79`)
  - **Threat:** Shared workspace users access resources beyond authorization scope via MCP — High, Elevation of Privilege
  - **Gap:** All MCP routes hardcode `user_id = "MCP"` (lines 79, 94, 107, 119, 231, 244, 263), bypassing all authorization checks. The `_fetch_all()` at line 114 returns **all** threat models when `owner = "MCP"`. The OpenAPI spec defines `/threat-designer/mcp/trail/{id}` (openapi.yml:349) but no matching route handler exists — requests may fall through unpredictably. A single compromised API key grants full CRUD across every user's data.
  - **Fix:** Implement per-tenant MCP API keys mapped to specific user IDs. In API Gateway, use a usage plan per key. In the backend, resolve the API key to a `user_id` via a mapping table and enforce the same access checks as JWT-authenticated users. Remove the `/threat-designer/mcp/trail/{id}` entry from `openapi.yml` or add a proper route handler.

### Important

- [ ] **Amplify Frontend Missing Security Headers** (`infra/amplify.tf`)
  - **Threat:** XSS attacks execute in CSP-free context on the frontend domain — Medium, Information Disclosure
  - **Gap:** Security headers (`Content-Security-Policy`, `X-Frame-Options`, `X-Content-Type-Options`, `HSTS`) are only set on API Gateway responses in `backend/app/index.py:53-74`. The Amplify-hosted frontend serves static files (HTML, JS, CSS) without any security headers — no `custom_headers` block exists in the `aws_amplify_app` resource. A reflected or stored XSS payload delivered through the frontend executes in a CSP-free context.
  - **Fix:** Add a `custom_headers` block to `aws_amplify_app.threat-designer` in `infra/amplify.tf` with `Content-Security-Policy: default-src 'self'; connect-src 'self' https://*.amazonaws.com; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, and `Strict-Transport-Security: max-age=63072000; includeSubDomains`.

- [ ] **IDOR — Space Document S3 Key Injection** (`backend/app/services/space_service.py:197`)
  - **Threat:** Attacker registers arbitrary S3 keys as documents in another space — Medium, Elevation of Privilege
  - **Gap:** `confirm_document_upload` at `space_service.py:197` accepts `s3_key` from the client request body without verifying it matches the key issued during `generate_document_upload_url`. An attacker with space owner access could supply an `s3_key` pointing to another space's prefix (e.g., `spaces/{other_space_id}/doc.pdf`), registering another space's document in their space's DynamoDB record.
  - **Fix:** In `confirm_document_upload`, validate that `s3_key` starts with the expected prefix `spaces/{space_id}/`. Additionally, store the `document_id` → `s3_key` mapping at upload URL generation time in DynamoDB and verify it at confirm time rather than trusting client input.

- [ ] **Cognito Filter Injection in User Search** (`backend/app/services/collaboration_service.py:437`)
  - **Threat:** Attacker manipulates Cognito ListUsers filter via unsanitized search input — Medium, Tampering
  - **Gap:** `params["Filter"] = f'email ^= "{search_filter}"'` at line 437 interpolates the `search` query parameter directly into the Cognito filter expression. A `search_filter` containing `"` (double quote) can break out of the string and inject arbitrary filter operators, potentially enumerating all users in the pool.
  - **Fix:** Sanitize `search_filter` by removing or escaping double quotes before interpolation: `search_filter = search_filter.replace('"', '')`. Enforce a maximum length (50 chars) and restrict to alphanumeric + `@._-` characters.

- [ ] **IDOR on Lock Status Endpoint — Lock Token Leakage** (`backend/app/routes/threat_designer_route.py:518`)
  - **Threat:** Any authenticated user can enumerate lock holders and steal lock tokens — Medium, Information Disclosure
  - **Gap:** The `_get_lock_status` endpoint (line 518-525) returns `user_id`, `username`, and `lock_token` of the current lock holder with no authorization check. The leaked `lock_token` could be used to spoof lock refreshes or bypass lock validation during updates.
  - **Fix:** Add `require_access(id, user_id, required_level="READ_ONLY")` before calling `get_lock_status(id)`. Strip `lock_token` from the response for non-lock-holders — only return it to the user who holds the lock.

- [ ] **MCP Client Action Repudiation** (`backend/app/routes/threat_designer_route.py:79`)
  - **Threat:** MCP actions cannot be traced to specific clients — Medium, Repudiation
  - **Gap:** All MCP operations log `owner = "MCP"` with no distinction between clients. API Gateway access logs capture `sourceIp` but not the API key identifier (`$context.identity.apiKeyId` is not in the log format). DynamoDB records show `last_modified_by = "MCP"` for all MCP mutations.
  - **Fix:** Add `$context.identity.apiKeyId` to the API Gateway access log format in `infra/api_gateway.tf:32-43`. Write MCP audit entries to the trail table with the API key identifier. Add a `mcp_client_id` field to DynamoDB records modified via MCP.

- [ ] **Unrestricted Upload Content Type** (`backend/app/services/threat_designer_service.py:1394`)
  - **Threat:** Arbitrary file types uploaded to S3 architecture bucket — Medium, Tampering
  - **Gap:** `generate_presigned_url(file_type)` at line 1394 accepts any `file_type` from user input with no validation. No `content-length-range` condition limits upload size. An attacker could upload HTML/JS files or excessively large files.
  - **Fix:** Validate `file_type` against an allowlist: `["image/png", "image/jpeg", "image/gif", "image/webp"]`. Add a `content-length-range` condition to the presigned URL (e.g., max 20MB). Apply the same validation in `space_service.py:183`.

- [ ] **Sentry Streaming — No Per-Session Rate Limiting** (`backend/sentry/agent.py:105`)
  - **Threat:** Rapid-fire requests exhaust Sentry resources and Bedrock invocations — Medium, Denial of Service
  - **Gap:** Each `POST /invocations` to Sentry spawns an async LangGraph invocation. Concurrent requests from the same session cancel the prior task and start a new one, but each still consumes Bedrock invocations before cancellation. No per-session or per-user concurrency limit exists in the FastAPI application layer.
  - **Fix:** Add a per-session in-flight check in `backend/sentry/agent.py` before calling `streaming_handler.handle_streaming_request`: if a task for the session already exists and is not done, reject the new request with HTTP 429 rather than cancelling and replacing.

- [ ] **Indirect Prompt Injection via Architecture Diagrams** (`backend/threat_designer/message_builder.py:79`)
  - **Threat:** Adversarial content in uploaded diagrams manipulates AI analysis — Medium, Tampering
  - **Gap:** Architecture images are passed directly to the multimodal model at `message_builder.py:79-83` with no content scanning. Text embedded in diagrams (OCR'd by the model) could contain adversarial instructions.
  - **Fix:** Add image dimension and file size validation before processing (max 4096x4096 pixels, max 10MB). Add output-layer sanitization: before persisting threat entries to DynamoDB in the finalize node, strip content matching script injection patterns (`<script`, `javascript:`, `onerror=`).

- [ ] **API Gateway DDoS — No WAF** (`infra/api_gateway.tf:60`)
  - **Threat:** Rate limit exhaustion via high-volume requests — Medium, Denial of Service
  - **Gap:** API Gateway throttling is 100 RPS / 50 burst (global). No AWS WAF — no geo-blocking, no IP reputation filtering, no bot detection. A single attacker can consume the entire rate limit. Expensive mutation endpoints (`POST /threat-designer`, `POST /attack-tree`) need tighter per-method throttles.
  - **Fix:** Attach an AWS WAF WebACL to the API Gateway stage with AWS Managed Rules (CommonRuleSet, BotControlRuleSet). Add per-IP rate limiting via WAF rate-based rules. Add per-method throttle overrides for mutation endpoints.

- [ ] **Bedrock Model Cost Abuse** (`backend/threat_designer/agent.py:44`)
  - **Threat:** Excessive model invocations via adversarial inputs causing cost escalation — Medium, Denial of Service
  - **Gap:** No per-user rate limiting on threat model creation or replay. Each analysis invokes multiple LLM calls. No `aws_budgets_budget` resource in Terraform.
  - **Fix:** Track active jobs per user in DynamoDB; reject new requests if a user has > 3 concurrent jobs. Add `aws_budgets_budget` with cost alert thresholds. Add tighter per-method throttle on `POST /threat-designer` (e.g., 2 rps / 5 burst).

- [ ] **Non-Repudiation Failure for Sensitive Operations** (`backend/app/services/space_service.py:166`)
  - **Threat:** Users deny performing deletions or modifications — no persistent audit trail — Medium, Repudiation
  - **Gap:** `delete_space` (line 166) and `delete_document` (line 307) delete records without writing audit entries. No append-only audit table exists. CloudTrail data events are not enabled for DynamoDB tables.
  - **Fix:** Write deletion events to a dedicated append-only DynamoDB audit table (`event_id`, `event_type`, `resource_id`, `actor_user_id`, `timestamp`). Enable CloudTrail data event logging for all DynamoDB tables in Terraform.

- [ ] **Stolen JWT Token Replay** (`backend/authorizer/index.py:46`)
  - **Threat:** Intercepted JWT tokens replayed within 8-hour validity window — Medium, Spoofing
  - **Gap:** Token validity is 8 hours (`access_token_validity = 8` in `cognito.tf:45`). No token revocation mechanism. `PyJWKClient` is constructed on every Lambda invocation (no caching). Sentry's `@lru_cache` on `decode_jwt_token` caches tokens indefinitely within a container.
  - **Fix:** Reduce `access_token_validity` to 1 hour in `infra/cognito.tf:45`. Cache `PyJWKClient` at module level with `PyJWKClient(keys_url, cache_jwk_set=True, lifespan=3600)`. Enable Cognito token revocation (`enable_token_revocation = true`).

- [ ] **Presigned URL — No Size Limit, Long Spaces Expiry** (`backend/app/services/threat_designer_service.py:1394`)
  - **Threat:** Presigned URLs abused for oversized uploads or reused beyond intended window — Medium, Information Disclosure
  - **Gap:** Architecture presigned PUT URLs have no `content-length-range` condition. Spaces presigned URLs default to 900-second (15-minute) expiry via `PRESIGNED_URL_EXPIRY` env var. No per-IP binding or reuse limit.
  - **Fix:** Add `content-length-range` condition (max 20MB) to presigned PUT URLs. Reduce `PRESIGNED_URL_EXPIRY` default to 300 seconds in `space_service.py:18`.

### Informational

- [x] **S3 Bucket Data Exposure** — mitigated in `infra/s3.tf:11-18` and `infra/spaces.tf:80-87` (both S3 buckets have all four public access block settings enabled; access is only via presigned URLs with authorization checks)

- [x] **Unauthorized Access to Attack Tree Data** — mitigated in `backend/app/services/attack_tree_service.py:23` (imports `require_access` and `require_owner`; all service methods check user authorization before returning data)

- [x] **Agent Execution Log Information Leakage** — mitigated in `backend/app/routes/threat_designer_route.py:60-71` (trail endpoint enforces `require_access(id, user_id, required_level="READ_ONLY")` before returning execution logs)

- [x] **Resource Exhaustion Against Backend Services** — mitigated in `infra/lambda.tf:20` (`reserved_concurrent_executions` configurable) and `infra/api_gateway.tf:73-74` (100 RPS throttle with 50 burst); DynamoDB on PAY_PER_REQUEST prevents capacity exhaustion

- [x] **API Key Theft and Abuse for MCP** — partially mitigated via API Gateway API key requirement (`openapi.yml` security scheme); remaining risk fully addressed under "Broken Access Control — MCP Full Cross-Tenant Access" and "Weak Tenant Isolation via MCP API Key" above

---

## Summary

5 critical | 15 important | 5 informational
