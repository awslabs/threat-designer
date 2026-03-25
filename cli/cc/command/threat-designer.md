Perform a threat-model-driven security review of the current repository.

## Step 0 — Parse arguments and route

The user invoked this command with: $ARGUMENTS

Parse the following flags from $ARGUMENTS. **If a flag is absent, use the default listed below exactly — do not invent or substitute any other value.**

| Flag                                     | Default                      | Description                                                                                                  |
| ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--model <id>`                           | _(not set)_                  | Use an existing threat model — skip Section A entirely                                                       |
| `--min-likelihood <high\|medium\|low>`   | `medium`                     | Remove threats below this likelihood from the model                                                          |
| `--stride <categories>`                  | _(not set — all categories)_ | Comma-separated STRIDE filter (e.g. `Spoofing,Tampering`)                                                    |
| `--effort <off\|low\|medium\|high\|max>` | `medium`                     | Effort level for `threat-designer run`                                                                       |
| `--iterations <n>`                       | `0` (Auto)                   | Iterations for `threat-designer run`; `0` = agent decides                                                    |
| `--scope <full\|diff>`                   | `full`                       | `full` = entire codebase; `diff` = only components touched in the current git diff                           |
| `--instruction <text>`                   | _(not set)_                  | Free-text instruction applied during review (e.g. _"focus only on the auth service"_, _"ignore test files"_) |

**If `--instruction` is set:** apply it as additional context throughout B2 — pass it to every subagent alongside the threat batch. It should influence which code is examined and how findings are assessed, but it does not change threat modeling in Section A.

**Routing — decide before taking any action:**

- `--model <id>` present → skip Section A, go straight to **[Section B]** with that id
- `--model` absent → follow **[Section A]**, then continue to **[Section B]**

---

## Section A — Generate threat model from codebase

### A1 — Check dependencies

**Do not run `threat-designer` without a subcommand** — it launches an interactive REPL that will hang.

```bash
threat-designer --version || { echo "ERROR: threat-designer is not installed. Install it with: pip install <path-to-cli>"; exit 1; }
mmdc --version 2>/dev/null && echo "ok" || npm install -g @mermaid-js/mermaid-cli
```

**Create a unique run directory** to avoid overwriting previous runs. First list existing runs, then create a new one:

```bash
ls .claude/threat-designer/ 2>/dev/null || echo "(no previous runs)"
RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c 4 /dev/urandom | xxd -p)
mkdir -p .claude/threat-designer/$RUN_ID
```

All artifacts for this run go under `.claude/threat-designer/$RUN_ID/`. Use `$RUN_ID` in all paths below.

If `threat-designer` is not installed, **stop here** — tell the user to install it first and do not proceed.

### A2 — Analyze the codebase

**If `--scope diff`:** first run:

```bash
git diff --name-only HEAD
```

Identify which architectural components (services, layers, modules) the changed files belong to. Only analyze those components and their direct dependencies — ignore unrelated parts of the codebase.

**If `--scope full`:** read the following to understand the full system architecture:

- Service entrypoints, route definitions, API handlers
- Infrastructure-as-code (Terraform, CDK, CloudFormation, docker-compose, k8s manifests)
- Authentication and authorization middleware
- Database schemas, ORM models, migration files
- External API clients and integrations
- Network and security configuration (VPCs, security groups, IAM policies)
- Environment variable definitions (`.env.example`, config files)

Summarize what you find: services, responsibilities, communication patterns, data handled, and trust boundaries.

**In both scopes**, also determine — these are critical for threat model quality and cannot be inferred from the architecture diagram alone:

- **Exposure model**: is the application public-facing, internal-only, or hybrid?
- **Business context**: what does the application do, who are its users, what data is sensitive?
- **Tech stack**: languages, frameworks, runtime environment (serverless, containers, VMs)
- **Key assumptions**: authentication mechanism (SSO, API keys, JWT), network boundaries, trust relationships with third parties

### A3 — Generate architecture diagram

Write a Mermaid `flowchart TD` diagram to `.claude/threat-designer/$RUN_ID/arch.mmd`.

**If `--scope diff`:** include only the components identified in A2 (changed components + their direct dependencies). Label each changed component with `*` (e.g., `AuthService*`).

**If `--scope full`:** include all components.

Both scopes must include:

- Directed data flow arrows labeled with protocol/data type (e.g. `-->|HTTPS/JWT|`)
- Trust boundaries as named subgraphs (e.g. `subgraph Internet`, `subgraph VPC`, `subgraph DataLayer`)
- External actors: end users, third-party APIs, external systems
- Authentication checkpoints

Completeness matters more than aesthetics.

```bash
mmdc -i .claude/threat-designer/$RUN_ID/arch.mmd -o .claude/threat-designer/$RUN_ID/arch.png -w 2400 -b white
```

### A4 — Run threat modeling

Build the command using the values from Step 0. Always include `--min-likelihood`. Only include `--stride` if it was explicitly provided.

**Before running the command:** call `ToolSearch` with query `"select:TaskOutput"` to ensure the TaskOutput tool is loaded. Then run this command **in the background** (set `run_in_background=true` on the Bash tool call) so it is not subject to the 10-minute Bash tool timeout.

**Important:** redirect only stdout to the temp file. Do **not** add `2>&1` — stderr carries the progress output and must stay separate. The default `--output-format markdown` writes the job ID on line 1, then the full markdown threat list — everything needed for Section B.

**`--app-type` sets the application exposure model** — this directly influences how the agent calibrates threat likelihood. Choose one based on A2 findings:

- `public` — internet-facing, accessible by anonymous users
- `internal` — private network only, controlled access
- `hybrid` — mix of public and internal components (default)

**`--description` is critical for threat model quality.** The architecture diagram shows structure but not context. Write a rich description (2–4 sentences) that covers:

- What the application does and who its users are
- Tech stack and runtime environment
- Key security properties (e.g. "handles PII", "processes payments", "stores credentials")

**`--assumption` flags are equally important.** Assumptions define **acceptable risks** and **security controls already in place** — they tell the agent what is already mitigated so it can focus on real gaps. Add one `--assumption` per security-relevant fact discovered in A2. Be specific and concrete — for example:

- `--assumption "JWT tokens are validated by a custom Lambda authorizer before reaching the application layer"`
- `--assumption "DynamoDB tables use KMS CMK encryption at rest with point-in-time recovery enabled"`
- `--assumption "S3 buckets block all public access and use server-side encryption"`
- `--assumption "CORS is configured with allow_origins=* on both services"`
- `--assumption "Cognito is configured with admin-only user creation (no self-service sign-up)"`
- `--assumption "File uploads use presigned S3 PUT URLs with content-type validation and 1GB size limit"`

```bash
threat-designer run \
  --name "Threat Review — $(basename $(pwd))" \
  --image .claude/threat-designer/$RUN_ID/arch.png \
  --app-type <public|internal|hybrid> \
  --description "<rich description from A2 — business context, tech stack, sensitive data>" \
  --assumption "<assumption 1>" \
  --assumption "<assumption 2>" \
  [--assumption ...] \
  --effort <effort> \
  --iterations <iterations> \
  --min-likelihood <min-likelihood> \
  [--stride <stride if provided>] > .claude/threat-designer/$RUN_ID/output.md
```

**Threat modeling can take up to 20 minutes.** Use the `TaskOutput` tool to follow the background task's output and wait for it to complete — do not proceed until the task finishes. Once complete, read the job ID:

```bash
JOB_ID=$(head -1 .claude/threat-designer/$RUN_ID/output.md)
echo "Threat model: $JOB_ID"
```

The CLI will generate the full model, apply filters, and write the threat list to the output file. Once the job ID is confirmed, continue to Section B.

---

## Section B — Review code against threat model

### B1 — Load the threat model

**If Section A was run:** the threat list is already in `.claude/threat-designer/$RUN_ID/output.md`. Read it directly — no additional command needed.

**If `--model <id>` was passed** (Section A skipped), generate the formatted list — pass the same filters so the output matches what was requested:

```bash
threat-designer threats <id> --min-likelihood <min-likelihood> [--stride <stride if provided>]
```

Each threat has: `name`, `description`, `likelihood` (High/Medium/Low), `stride_category`, `target`. Mitigations are excluded.

**If `--scope diff` and `--model` was passed** (Section A was skipped, so git diff was never run): run it now before filtering threats:

```bash
git diff --name-only HEAD
```

Identify which architectural components the changed files belong to. Then discard threats whose `target` does not match any of those components.

**If `--scope diff` and Section A was run:** the component list is already known from A2 — discard threats whose `target` does not match.

Print a one-line summary before starting:

> Reviewing <N> threats (model: <id>)

### B2 — Parallel security review

Split the threats into batches of at most 10. Use the **Agent tool** to launch one subagent per batch simultaneously — do not wait for one batch to finish before starting the next.

Each subagent receives its batch of threat entries, the scope (`full` or `diff`), the `--instruction` (if provided), and these instructions:

> For each threat in this batch, ordered High → Medium → Low:
>
> 1. Find the relevant code — files and functions that implement or relate to the `target` component
>    - If scope is `diff`: focus on the changed files; only look beyond them if the threat directly implicates a dependency
> 2. Assess mitigation state: **Mitigated** / **Partially mitigated** / **Unmitigated**
> 3. Return findings as structured markdown — one entry per threat with: file path + line number, gap description, concrete fix
>
> **Additional instruction from the user (if provided):** <instruction>

Wait for all subagents to complete, then aggregate their findings into B3.

### B3 — Output

Write the review to `.claude/threat-designer/$RUN_ID/threat-designer-<id>.md`, then print the path to the user.

Structure the file as an **actionable task list** so Claude Code can be pointed at it to fix each issue. Every unmitigated or partially mitigated finding must be a checkbox task with enough context to act on it without re-reading the threat model.

```markdown
## Threat Review: <repo name>

Model: <id> | <N> threats | min-likelihood: <value> | stride: <value or "all"> | <date>

---

## Security Tasks

### Critical

<!-- Unmitigated High-likelihood threats -->

- [ ] **`TR-001`** — **<Threat name>** (`<file>:<line>`)
  - **Threat:** <one-line description> — High, <STRIDE category>
  - **Gap:** <what is missing or broken in the current code>
  - **Fix:** <concrete, specific change to make — function name, parameter, pattern>

### Important

<!-- Unmitigated or partially mitigated Medium-likelihood threats -->

- [ ] **`TR-002`** — **<Threat name>** (`<file>:<line>`)
  - **Threat:** <one-line description> — Medium, <STRIDE category>
  - **Gap:** <what is missing or broken>
  - **Fix:** <concrete, specific change>

### Informational

<!-- Low-likelihood or already mitigated — no action required -->

- [x] **`TR-003`** — **<Threat name>** — mitigated in `<file>:<line>` (<brief note>)

---

## Summary

<N> critical | <N> important | <N> informational
```

Rules:

- Each item gets a sequential ID: `TR-001`, `TR-002`, … — numbered across all sections so the user can reference them (e.g. _"fix TR-003 and TR-007"_)
- Each unchecked task must be self-contained: file path, line number, what is wrong, what to do
- "Fix" must be a concrete instruction, not a vague suggestion ("add rate limiting to `/api/login` in `routes/auth.py:34`", not "consider rate limiting")
- Already-mitigated threats go under Informational as pre-checked `[x]` items
- After writing the file, tell the user: _"Run `/fix-tasks threat-designer-<id>.md` or ask me to work through the tasks."_
