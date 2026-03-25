---
name: "Threat Designer"
description: "Run a threat-model-driven security review of the current repository using the threat-designer CLI. Analyzes the codebase, generates an architecture diagram, runs STRIDE-based threat modeling, and produces an actionable tasks.md with security findings."
---

# Threat Designer — Security Review

Perform a threat-model-driven security review of the current repository.

## Step 0 — Gather configuration from the user

**You cannot receive arguments via this skill invocation.** Before doing any work, ask the user to provide the following options. Present this table and ask them to specify any overrides — anything not specified uses the default.

| Option             | Default     | Description                                                                                               |
| ------------------ | ----------- | --------------------------------------------------------------------------------------------------------- |
| **model**          | _(not set)_ | Use an existing threat model ID — skip generating a new one                                               |
| **min-likelihood** | `medium`    | Remove threats below this likelihood: `high` / `medium` / `low`                                           |
| **stride**         | _(all)_     | Comma-separated STRIDE filter (e.g. `Spoofing,Tampering`)                                                 |
| **effort**         | `medium`    | Reasoning effort for threat modeling: `off` / `low` / `medium` / `high` / `max`                           |
| **iterations**     | `0` (Auto)  | Number of modeling iterations; `0` = agent decides                                                        |
| **app-type**       | `hybrid`    | Application exposure: `public` / `internal` / `hybrid`                                                    |
| **scope**          | `full`      | `full` = entire codebase; `diff` = only changed components; `spec` = components in the active spec folder |
| **spec-folder**    | _(not set)_ | Path to the spec folder (required when scope is `spec`)                                                   |
| **instruction**    | _(not set)_ | Additional instruction for the review (e.g. _"focus only on the auth service"_)                           |

**Wait for the user to respond before proceeding.** Once you have their choices, determine routing:

- **model** is set → skip Section A, go straight to **Section B** with that model ID
- **model** is not set → follow **Section A**, then continue to **Section B**

---

## Section A — Generate threat model from codebase

### A1 — Check dependencies

**Do not run `threat-designer` without a subcommand** — it launches an interactive REPL that will hang.

```bash
threat-designer --version || { echo "ERROR: threat-designer is not installed. Install it with: pip install <path-to-cli>"; exit 1; }
mmdc --version 2>/dev/null && echo "ok" || npm install -g @mermaid-js/mermaid-cli
```

If `threat-designer` is not installed, **stop here** — tell the user to install it first and do not proceed.

**Determine the spec folder** — all artifacts (diagram, output, task file) live together under one `.kiro/specs/` folder:

- **If scope is `spec`:** use the user-provided spec folder directly: `SPEC_DIR=.kiro/specs/<spec-folder>`
- **If scope is `full` or `diff`:** list existing spec folders and check if one matches the components under review. If a match is found, use it. Otherwise, create a new one:
  ```bash
  ls .kiro/specs/ 2>/dev/null || echo "(no existing specs)"
  RUN_ID=$(date +%Y%m%d-%H%M%S)-$(head -c 4 /dev/urandom | xxd -p)
  SPEC_DIR=.kiro/specs/threat-model-$RUN_ID
  ```

```bash
mkdir -p $SPEC_DIR
```

All artifacts for this run go under `$SPEC_DIR/`. Use `$SPEC_DIR` in all paths below.

### A2 — Analyze the codebase

**If scope is `diff`:** run:

```bash
git diff --name-only HEAD
```

Identify which architectural components (services, layers, modules) the changed files belong to. Only analyze those components and their direct dependencies.

**If scope is `spec`:** read the files in the spec folder provided by the user. Identify which architectural components the spec touches based on the requirements and design documents. Only analyze those components and their direct dependencies.

**If scope is `full`:** read the following to understand the full system architecture:

- Service entrypoints, route definitions, API handlers
- Infrastructure-as-code (Terraform, CDK, CloudFormation, docker-compose, k8s manifests)
- Authentication and authorization middleware
- Database schemas, ORM models, migration files
- External API clients and integrations
- Network and security configuration (VPCs, security groups, IAM policies)
- Environment variable definitions (`.env.example`, config files)

Summarize what you find: services, responsibilities, communication patterns, data handled, and trust boundaries.

**In all scopes**, also determine — these are critical for threat model quality and cannot be inferred from the architecture diagram alone:

- **Exposure model**: is the application public-facing, internal-only, or hybrid?
- **Business context**: what does the application do, who are its users, what data is sensitive?
- **Tech stack**: languages, frameworks, runtime environment (serverless, containers, VMs)
- **Key assumptions**: authentication mechanism (SSO, API keys, JWT), network boundaries, trust relationships with third parties

### A3 — Generate architecture diagram

Write a Mermaid `flowchart TD` diagram to `$SPEC_DIR/arch.mmd`.

**If scope is `diff`:** include only the components identified in A2 (changed components + their direct dependencies). Label each changed component with `*` (e.g., `AuthService*`).

**If scope is `spec`:** include only the components the spec touches and their direct dependencies. Label each spec-relevant component with `*`.

**If scope is `full`:** include all components.

All scopes must include:

- Directed data flow arrows labeled with protocol/data type (e.g. `-->|HTTPS/JWT|`)
- Trust boundaries as named subgraphs (e.g. `subgraph Internet`, `subgraph VPC`, `subgraph DataLayer`)
- External actors: end users, third-party APIs, external systems
- Authentication checkpoints

Completeness matters more than aesthetics.

```bash
mmdc -i $SPEC_DIR/arch.mmd -o $SPEC_DIR/arch.png -w 2400 -b white
```

### A4 — Run threat modeling

Build the command using the values from Step 0. Always include `--min-likelihood`. Only include `--stride` if the user specified it.

**`--app-type` sets the application exposure model** — this directly influences how the agent calibrates threat likelihood. Choose one based on A2 findings or the user's selection:

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

**Threat modeling can take up to 20 minutes.** Run the command with a **20-minute timeout** (`timeout: 1200000`). The tool returns as soon as the command exits — the timeout is just the upper bound.

```bash
threat-designer run \
  --name "Threat Review — $(basename $(pwd))" \
  --image $SPEC_DIR/arch.png \
  --app-type <public|internal|hybrid> \
  --description "<rich description from A2 — business context, tech stack, sensitive data>" \
  --assumption "<assumption 1>" \
  --assumption "<assumption 2>" \
  [--assumption ...] \
  --effort <effort> \
  --iterations <iterations> \
  --min-likelihood <min-likelihood> \
  [--stride <stride if provided>] > $SPEC_DIR/output.md
```

Once complete, read the job ID:

```bash
JOB_ID=$(head -1 $SPEC_DIR/output.md)
echo "Threat model: $JOB_ID"
```

If the output file is empty or the process exited with a non-zero code, **stop and report the error**.

---

## Section B — Review code against threat model

### B1 — Load the threat model

**If Section A was run:** the threat list is already in `$SPEC_DIR/output.md`. Read it directly.

**If model ID was provided** (Section A skipped), generate the formatted list — pass the same filters:

```bash
threat-designer threats <id> --min-likelihood <min-likelihood> [--stride <stride if provided>]
```

Each threat has: `name`, `description`, `likelihood` (High/Medium/Low), `stride_category`, `target`. Mitigations are excluded.

**If scope is `diff` and model ID was provided** (Section A was skipped, so git diff was never run): run it now:

```bash
git diff --name-only HEAD
```

Identify which architectural components the changed files belong to. Discard threats whose `target` does not match.

**If scope is `spec` and model ID was provided**: read the spec folder to identify relevant components. Discard threats whose `target` does not match.

**If scope is `diff` or `spec` and Section A was run:** the component list is already known from A2 — discard threats whose `target` does not match.

Print a one-line summary before starting:

> Reviewing <N> threats (model: <id>)

### B2 — Parallel security review

Split the threats into batches of at most 10. Use the **general-task-execution** agent to launch one sub-agent per batch. Each sub-agent can run independently.

Each sub-agent receives its batch of threat entries, the scope, the instruction (if provided), and these instructions:

> For each threat in this batch, ordered High → Medium → Low:
>
> 1. Find the relevant code — files and functions that implement or relate to the `target` component
>    - If scope is `diff`: focus on the changed files; only look beyond them if the threat directly implicates a dependency
>    - If scope is `spec`: focus on files related to the spec's components; only look beyond them if the threat directly implicates a dependency
> 2. Assess mitigation state: **Mitigated** / **Partially mitigated** / **Unmitigated**
> 3. Return findings as structured markdown — one entry per threat with: file path + line number, gap description, concrete fix
>
> **Additional instruction from the user (if provided):** <instruction>

Wait for all sub-agents to complete, then aggregate their findings into B3.

### B3 — Output

Write the task file to `$SPEC_DIR/security_fix_tasks.md` — since all artifacts already live under the spec folder, Kiro picks it up as a native task file.

Write in **Kiro tasks format**:

```markdown
# Security Review Tasks

Threat model: <id> | <N> threats | min-likelihood: <value> | stride: <value or "all"> | <date>

## Critical

<!-- Unmitigated High-likelihood threats — address immediately -->

- [ ] **TR-001: <Threat name>**
      File: `<file>:<line>`
      Threat: <one-line description> — High, <STRIDE category>
      Gap: <what is missing or broken in the current code>
      Fix: <concrete, specific change to make — function name, parameter, pattern>

## Important

<!-- Unmitigated or partially mitigated Medium-likelihood threats -->

- [ ] **TR-002: <Threat name>**
      File: `<file>:<line>`
      Threat: <one-line description> — Medium, <STRIDE category>
      Gap: <what is missing or broken>
      Fix: <concrete, specific change>

## Informational

<!-- Low-likelihood or already mitigated — no action required -->

- [x] **TR-003: <Threat name>** — mitigated in `<file>:<line>` (<brief note>)

---

Summary: <N> critical | <N> important | <N> informational
```

Rules:

- Each item gets a sequential ID: `TR-001`, `TR-002`, … — numbered across all sections
- Each unchecked task must be self-contained: file path, line number, what is wrong, what to do
- "Fix" must be a concrete instruction, not a vague suggestion ("add rate limiting to `/api/login` in `routes/auth.py:34`", not "consider rate limiting")
- Already-mitigated threats go under Informational as pre-checked `[x]` items
- The file must be valid Kiro task format so tasks can be executed individually or as a batch

After writing the file, tell the user:

> Security review complete. Tasks and artifacts written to `$SPEC_DIR/` — Kiro will pick up `security_fix_tasks.md` as a task file.
