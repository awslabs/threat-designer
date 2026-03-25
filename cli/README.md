# Threat Designer CLI

A local CLI for running Threat Designer threat modeling without any backend deployment. All processing happens on your machine — no AWS infrastructure required beyond model access.

---

## Prerequisites

- Python 3.11+
- Node.js (for `@mermaid-js/mermaid-cli` — used by IDE integrations to generate architecture diagrams)
- **Amazon Bedrock** (default): AWS credentials configured (`~/.aws/credentials` or environment variables) with access to Claude 4.6 models
- **OpenAI** (alternative): a valid OpenAI API key

---

## Installation

The CLI is not published to PyPI — install it locally from the cloned repository:

```bash
git clone <repo-url>
cd threat-designer
pip install -e ./cli
```

> **Note:** The `-e` (editable) flag is recommended — it lets the CLI find the backend agent code in the repo. If you install without `-e`, set the `THREAT_DESIGNER_REPO` environment variable to the repo root path.

---

## Quick Start

### 1. Launch the CLI

```bash
threat-designer
```

### 2. Configure your provider

```
/configure
```

You will be prompted to select:

- **Provider** — Amazon Bedrock or OpenAI
- **Model** — Claude Sonnet 4.6 (balanced) or Claude Opus 4.6 (most capable); or GPT-5.4
- **Effort** — reasoning effort level (`off` / `low` / `medium` / `high` / `max`)
- **AWS region and profile** (Bedrock only)
- **OpenAI API key** (OpenAI only)

Configuration is saved to `~/.threat-designer/config.json`.

### 3. Run a threat model

```
/create
```

You will be prompted for:

- Threat model name
- Description (optional)
- Path to your architecture diagram (PNG, JPG, or PDF)
- Number of iterations (`Auto` lets the agent decide)
- Whether to generate attack trees immediately after modeling (optional) — select likelihood levels and a max count

Progress is displayed live. Press **Ctrl+C twice** to cancel a run in progress.

### 4. Generate attack trees

```
/attack-tree <id>
```

Or run `/attack-tree` without an ID to pick from a list. Select one or more threats via checkbox, and attack trees are generated sequentially. Trees are embedded as Mermaid diagrams in Markdown exports.

You can also generate attack trees automatically at the end of `/create` by opting in during the wizard.

### 5. List saved threat models

```
/list
```

### 6. Export a threat model

```
/export <id>
```

Choose from **Markdown**, **Word (.docx)**, **PDF**, or **JSON**. Exports are saved to your current working directory. Markdown exports include Mermaid attack tree diagrams if attack trees have been generated.

### 7. Delete a threat model

```
/delete <id>
```

Or run `/delete` without an ID to pick from a list.

---

## Headless mode

`threat-designer run` runs non-interactively — useful for scripting and CI:

```bash
threat-designer run \
  --name "My System" \
  --image path/to/arch.png \
  --app-type public \
  --description "Public-facing e-commerce API handling payments and PII, built with FastAPI on ECS" \
  --assumption "All endpoints require JWT auth validated by API Gateway" \
  --assumption "RDS database is in a private subnet with no public access" \
  --effort medium \
  --iterations 1
```

Progress streams to stderr. By default (`--output-format markdown`), stdout contains the job ID on line 1 followed by the markdown threat list. To capture just the job ID:

```bash
JOB_ID=$(threat-designer run --name "My System" --image arch.png | head -1)
cat ~/.threat-designer/models/$JOB_ID.json
```

To capture the full output (job ID + threat list) for downstream processing:

```bash
threat-designer run --name "My System" --image arch.png > output.txt
JOB_ID=$(head -1 output.txt)
```

| Flag               | Required | Default          | Description                                                             |
| ------------------ | :------: | ---------------- | ----------------------------------------------------------------------- |
| `--name`           |    ✓     | —                | Threat model name                                                       |
| `--image`          |    ✓     | —                | Path to architecture diagram                                            |
| `--description`    |          | `""`             | System description (business context, tech stack, sensitive data)       |
| `--assumption`     |          | —                | Assumption to include (repeatable)                                      |
| `--app-type`       |          | `hybrid`         | Application exposure: `public` / `internal` / `hybrid`                  |
| `--effort`         |          | configured level | Override effort: `off` / `low` / `medium` / `high` / `max`              |
| `--iterations`     |          | `0` (Auto)       | Number of iterations                                                    |
| `--min-likelihood` |          | _(all)_          | Remove threats below this likelihood: `high` / `medium` / `low`         |
| `--stride`         |          | _(all)_          | Keep only these STRIDE categories, comma-separated                      |
| `--output-format`  |          | `markdown`       | `markdown` = job ID + threat list (no mitigations); `json` = full model |

---

## Storage

Threat models are saved locally to `~/.threat-designer/models/<id>.json`.

---

## CLI vs Full Stack App

| Feature                                      | CLI | Web App |
| -------------------------------------------- | :-: | :-----: |
| Threat model generation                      |  ✓  |    ✓    |
| Persist threat models                        |  ✓  |    ✓    |
| Export (Markdown, Word, PDF, JSON)           |  ✓  |    ✓    |
| Edit threat models                           |  —  |    ✓    |
| Replay / re-run with edits                   |  —  |    ✓    |
| Attack tree generation (Mermaid in Markdown) |  ✓  |    ✓    |
| Sentry AI assistant                          |  —  |    ✓    |
| Spaces (knowledge base)                      |  —  |    ✓    |
| Collaboration & sharing                      |  —  |    ✓    |

---

## Commands Reference

| Command             | Description                                       |
| ------------------- | ------------------------------------------------- |
| `/configure`        | Set model provider, credentials, and effort level |
| `/create`           | Start a new threat modeling run                   |
| `/list`             | Show all saved threat models                      |
| `/export <id>`      | Export a threat model (Markdown, Word, PDF, JSON) |
| `/delete <id>`      | Delete a saved threat model                       |
| `/attack-tree <id>` | Generate attack trees for threats in a model      |
| `/help`             | Show available commands                           |
| `/quit`             | Quit                                              |

---

## IDE Integrations

Threat Designer integrates with AI-powered IDEs to run threat-model-driven security reviews directly from your editor. The CLI handles threat modeling; the IDE integration handles codebase analysis, architecture diagram generation, and code review against the threat model.

### How it works

Both integrations follow the same workflow:

1. **Analyzes the codebase** — reads service entrypoints, IaC, auth middleware, DB schemas, external integrations, and environment config. Determines business context, exposure model, tech stack, and security assumptions.
2. **Generates an architecture diagram** — writes a Mermaid `flowchart TD` diagram with trust boundaries, data flows, and auth checkpoints, then converts it to PNG via `mmdc`.
3. **Runs threat modeling** — calls `threat-designer run` with a rich `--description`, `--app-type`, and multiple `--assumption` flags derived from the analysis. Applies likelihood and STRIDE filters.
4. **Reviews code in parallel** — splits the threat list into batches of ≤ 10 and launches parallel sub-agents, each reviewing the relevant code against its batch of threats.
5. **Produces an actionable report** — a task file with sequential IDs (`TR-001`, `TR-002`, …), file paths, gap descriptions, and concrete fixes for every unmitigated finding.

### Prerequisites (integrations)

In addition to the [CLI prerequisites](#prerequisites):

- The CLI must be installed and configured (`threat-designer --version` and `/configure`)
- Node.js — `@mermaid-js/mermaid-cli` (`mmdc`) is auto-installed on first run if missing

---

### Claude Code

**Source:** `cc/command/threat-designer.md`

#### Install

```bash
cd cli

# Global — available in all Claude Code sessions
cp cc/command/threat-designer.md ~/.claude/commands/threat-designer.md

# Per-project — commit to the repo so the team gets it automatically
mkdir -p .claude/commands
cp cc/command/threat-designer.md .claude/commands/threat-designer.md
```

#### Usage

Open Claude Code in any repo and run:

```
/threat-designer
```

Arguments are passed inline after the command name.

#### Options

| Flag                                     | Default     | Description                                                                     |
| ---------------------------------------- | ----------- | ------------------------------------------------------------------------------- |
| `--model <id>`                           | _(not set)_ | Skip modeling — review against an existing threat model                         |
| `--scope <full\|diff>`                   | `full`      | `diff` limits analysis to components touched in the current git diff            |
| `--effort <off\|low\|medium\|high\|max>` | `medium`    | Reasoning effort for threat modeling                                            |
| `--min-likelihood <high\|medium\|low>`   | `medium`    | Filter out threats below this likelihood                                        |
| `--stride <categories>`                  | _(all)_     | Comma-separated STRIDE filter, e.g. `Spoofing,Tampering`                        |
| `--iterations <n>`                       | `0` (Auto)  | Number of modeling iterations                                                   |
| `--instruction <text>`                   | _(not set)_ | Additional instruction for the review (e.g. _"focus only on the auth service"_) |

#### Examples

```bash
# Full review with default settings
/threat-designer

# Focus the review on a specific area
/threat-designer --instruction "focus only on the API authentication and authorization layer"

# Quick review of only what changed in this branch
/threat-designer --scope diff

# Deep review — high effort, only high-likelihood threats
/threat-designer --effort high --min-likelihood high

# Re-run the code review against an existing threat model (skip re-modeling)
/threat-designer --model abc123ef

# Focus on injection and tampering threats only
/threat-designer --stride Tampering,Elevation\ of\ Privilege
```

#### Output

Each run creates a unique directory under `.threat-designer/<run-id>/` containing all artifacts (diagram, threat list, report). Previous runs are never overwritten.

The report (`threat-designer-<id>.md`) is structured as an actionable task list:

```markdown
## Security Tasks

### Critical

- [ ] **`TR-001`** — **JWT signature not verified** (`src/auth/middleware.py:42`)
  - **Threat:** Token Forgery — High, Spoofing
  - **Gap:** jwt.decode() called with verify=False
  - **Fix:** Set verify=True and pass algorithms=["HS256"] and the secret key

### Informational

- [x] **SQL injection via search** — mitigated in `src/db/queries.py:18` (parameterized queries)
```

Each finding has an ID (`TR-001`, `TR-002`, …) for easy reference: _"Fix TR-001 and TR-003"_, _"Explain TR-005"_, or _"Fix all tasks in the latest threat-designer report"_.

---

### Kiro (AWS)

**Source:** `kiro/skill/SKILL.md`

#### Install

Copy the skill file into your Kiro skills directory (refer to Kiro documentation for the exact path).

#### Usage

Invoke the **Threat Designer** skill from Kiro. Since Kiro skills don't accept inline arguments, the skill will prompt you to select options interactively before starting.

#### Options

| Option             | Default     | Description                                                                                 |
| ------------------ | ----------- | ------------------------------------------------------------------------------------------- |
| **model**          | _(not set)_ | Use an existing threat model ID — skip generating a new one                                 |
| **scope**          | `full`      | `full` = entire codebase; `diff` = changed components; `spec` = components in a spec folder |
| **spec-folder**    | _(not set)_ | Path to the spec folder (required when scope is `spec`)                                     |
| **app-type**       | `hybrid`    | Application exposure: `public` / `internal` / `hybrid`                                      |
| **effort**         | `medium`    | Reasoning effort: `off` / `low` / `medium` / `high` / `max`                                 |
| **min-likelihood** | `medium`    | Filter out threats below this likelihood                                                    |
| **stride**         | _(all)_     | Comma-separated STRIDE filter                                                               |
| **iterations**     | `0` (Auto)  | Number of modeling iterations                                                               |
| **instruction**    | _(not set)_ | Additional instruction for the review                                                       |

#### Key differences from Claude Code

| Aspect     | Claude Code                               | Kiro                                         |
| ---------- | ----------------------------------------- | -------------------------------------------- |
| Arguments  | Inline flags after `/threat-designer`     | Interactive prompt before starting           |
| Scope      | `full` / `diff`                           | `full` / `diff` / `spec` (spec-folder-aware) |
| Sub-agents | Claude Code Agent tool                    | Kiro `general-task-execution` agent          |
| Artifacts  | `.threat-designer/<run-id>/`       | `.kiro/specs/<spec-folder>/`                 |
| Task file  | `threat-designer-<id>.md` (checkbox list) | `security_fix_tasks.md` (Kiro tasks format)  |

#### Output

All artifacts (diagram, threat list, progress log, task file) are stored under a `.kiro/specs/` folder:

- **Scope `spec`** — same spec folder the user provided
- **Scope `full`/`diff`** — matches an existing spec folder if possible, otherwise creates `.kiro/specs/threat-model-<id>/`

The task file (`security_fix_tasks.md`) is written in Kiro tasks format so it can be executed as a normal Kiro task file.

---

### CLI commands used by integrations

| Command                        | Description                                                   |
| ------------------------------ | ------------------------------------------------------------- |
| `threat-designer run`          | Generate a threat model headlessly and output the threat list |
| `threat-designer threats <id>` | Print the threat list for a saved model in markdown or JSON   |
