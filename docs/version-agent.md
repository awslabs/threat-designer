# Version Agent — Technical Design

## Overview

The version agent allows users to evolve an existing threat model when the system architecture changes. Instead of starting from scratch, it takes the parent threat model's assets, data flows, trust boundaries, and threats, compares the old and new architecture diagrams, and incrementally updates each section to reflect the changes.

The workflow runs as a LangGraph subgraph on Bedrock AgentCore Runtime. It uses a ReAct (Reason + Act) loop with tool-gated state transitions, dynamic Pydantic models for schema enforcement, and structured diff analysis to decide whether to proceed or abort.

## End-to-End Flow

```
User clicks "Create new version"
        |
        v
Frontend: VersionModal collects new diagram + optional edits to title/description/assumptions
        |
        v
Frontend: uploads diagram to S3 via presigned URL, calls POST /threat-designer with version=true
        |
        v
Backend Lambda: creates new DDB record with parent_id, optionally copies sharing records,
                invokes AgentCore with version=true + previous_job_id
        |
        v
Agent (agent.py): _handle_version_state loads parent's full state from DDB,
                  fetches both images from S3, initializes version_tasks
        |
        v
Main workflow routes to version_subgraph (instead of normal asset->flows->threats pipeline)
        |
        v
Version subgraph runs: diff_node -> agent_init -> ReAct loop -> validate -> finalize
        |
        v
Frontend navigates to new threat model ID, polls for status, shows version-specific stepper
```

## Subgraph Architecture

```
                    +------------+
                    | diff_node  |  Compare old vs new diagrams (structured output)
                    +-----+------+
                          |
                    proceed? ----no----> abort (FAILED + message)
                          |
                         yes
                          |
                    +-----v------+
                    | agent_init |  Build system prompt + human message with full context
                    +-----+------+
                          |
                    +-----v------+
               +--->|   agent    |  ReAct node: invoke model with tools
               |    +-----+------+
               |          |
               |    has tool calls? ---no---> validate
               |          |
               |         yes
               |          |
               |    +-----v------+
               +----+   tools    |  Dynamic ToolNode executes tool calls
                    +------------+

                    +------------+
                    |  validate  |  All 4 tasks COMPLETE?
                    +-----+------+
                          |
                    yes --+--> Command(goto="finalize", graph=PARENT)
                          |
                         no ---> send feedback message, goto agent
```

## Key Components

### 1. Diff Node (`diff_node`)

The entry point. Sends both architecture diagrams (old and new, as base64 images) to a dedicated model (`model_version_diff`) with a system prompt asking it to describe all changes.

The model returns a `VersionDiffResult` (structured output):

```python
class VersionDiffResult(BaseModel):
    diff: str       # Detailed description of architecture changes
    proceed: bool   # False only when architectures are fundamentally different systems
```

If `proceed=False`, the workflow routes to `abort_node` which sets the job to FAILED with the message _"Architecture changes are too extensive for an incremental update."_ The diff text is stored in the trail for auditability.

The diff model uses no reasoning/thinking — it's a standard model invocation (`version_diff_config` is built via `_build_standard_model_config`), while the main version agent uses the reasoning-boosted config.

### 2. Agent Init (`version_agent_init`)

Builds the full context message for the ReAct agent:

- **System prompt** — Role definition, task sequence, execution rules, tool gating, quality standards for each section (assets, flows, boundaries, threats)
- **Human message** — Contains:
  - Previous architecture diagram (image)
  - New architecture diagram (image)
  - The diff output from `diff_node`
  - Application type context
  - Description and assumptions
  - Space knowledge insights (if the threat model belongs to a Space)
  - Current threat model state (formatted text dump of all sections)
  - Instruction to start with `update_task_status("assets", "in_progress")`

After building the message, `agent_init` clears `previous_image_data` and `image_data` from state. This is important — the images are already embedded in the `HumanMessage` content, so clearing them prevents redundant base64 payloads in every DynamoDB checkpoint during the ReAct loop.

### 3. Task-Gating State Machine

The core orchestration mechanism. Four sections must be completed in strict order:

```
assets -> data_flows -> trust_boundaries -> threats
```

Each section has a `TaskStatus`:

```python
class TaskStatus(str, Enum):
    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETE = "complete"
```

State transitions are enforced by the `update_task_status` tool:

- Only valid transitions: `PENDING -> IN_PROGRESS -> COMPLETE`
- Ordering enforced: can't start `data_flows` until `assets` is `COMPLETE`
- `update_task_status` must be called **alone** (never in parallel with other tools) because status transitions gate which tools are available

The task status is tracked in `version_tasks` on `VersionState`:

```python
class VersionState(MessagesState):
    version_tasks: Optional[VersionTasks]  # {assets: TaskStatus, data_flows: TaskStatus, ...}
    threat_list: Annotated[ThreatsList, operator.add]  # additive reducer for threats
    # ... other fields
```

### 4. Tool Set

The agent has access to these tools:

| Tool                      | Availability                 | Purpose                                                                 |
| ------------------------- | ---------------------------- | ----------------------------------------------------------------------- |
| `update_task_status`      | Always                       | Transition task status (must be called alone)                           |
| `read_current_state`      | Always                       | Read any section: assets, data_flows, trust_boundaries, threats, or all |
| `create_assets`           | assets IN_PROGRESS           | Add assets (deduplicates by name)                                       |
| `delete_assets`           | assets IN_PROGRESS           | Remove assets by name                                                   |
| `create_data_flows`       | data_flows IN_PROGRESS       | Add data flows (validates entity references)                            |
| `delete_data_flows`       | data_flows IN_PROGRESS       | Remove data flows by flow_description                                   |
| `create_trust_boundaries` | trust_boundaries IN_PROGRESS | Add trust boundaries (validates entity references)                      |
| `delete_trust_boundaries` | trust_boundaries IN_PROGRESS | Remove trust boundaries by purpose                                      |
| `create_threats`          | threats IN_PROGRESS          | Add threats (validates target/source references)                        |
| `delete_threats`          | threats IN_PROGRESS          | Remove threats by name                                                  |

To **modify** an existing item, the agent must delete it first, then create the updated version. There is no "update" tool — this is intentional to keep the tool surface simple and the state transitions predictable.

Every create tool validates entity references before accepting items. For example, `create_data_flows` checks that `source_entity` and `target_entity` match existing asset names. Invalid items are rejected with a message listing the valid names.

**Tool gating is enforced at two levels:**

1. **`_build_version_tools(state)`** — Only includes tools for the currently IN_PROGRESS task. The agent literally cannot see tools for other sections. This is rebuilt on every agent step.
2. **`_check_task_gate(state, task_name)`** — Runtime check inside each tool. If the task isn't IN_PROGRESS, returns an error message instead of executing.

### 5. Dynamic Tool Loading (Literal-Constrained Schemas)

This is the most interesting part of the design. When a task becomes IN_PROGRESS, the tools for that task are built with **dynamic Pydantic models** that constrain entity/reference fields to `Literal` types.

#### Why?

When the agent creates data flows, it must reference valid asset names in `source_entity` and `target_entity`. With a plain `str` field, the model might hallucinate a name. By constraining the field to a `Literal` of actual asset names, the model's tool-use schema tells it exactly which values are valid — enforcing correctness at the schema level, not just via post-hoc validation.

#### How it works

When `data_flows` becomes IN_PROGRESS, `assets` is already COMPLETE, so the asset names are stable. The tool builder:

1. Reads the current asset names from state: `frozenset(a.name for a in assets.assets)`
2. Calls `create_constrained_flow_models(asset_names)` which uses `pydantic.create_model()`:

```python
# Simplified — see state.py for full implementation
entity_literal = Literal[tuple(sorted(asset_names))]
# e.g., Literal["API Gateway", "Auth Service", "Database", "User"]

DynDataFlow = create_model(
    "DataFlow",
    __base__=DataFlow,                        # inherits all other fields
    source_entity=(entity_literal, ...),      # override with Literal constraint
    target_entity=(entity_literal, ...),      # override with Literal constraint
)
```

3. Wraps this model in a dynamic tool factory:

```python
def _create_dynamic_create_data_flows_tool(data_flows_list_model):
    @tool(name_or_callable="create_data_flows", ...)
    def dynamic_create_data_flows(data_flows: data_flows_list_model, runtime):
        return _handle_create_data_flows(data_flows, runtime)  # same handler
    return dynamic_create_data_flows
```

4. The generated tool schema sent to the LLM includes the enum constraint, so the model sees exactly which values are allowed.

The same pattern applies to:

- **Trust boundaries** — `source_entity` / `target_entity` constrained to asset names
- **Threats** — `target` constrained to asset names, `source` constrained to threat source categories

Results are **LRU-cached** (`@functools.lru_cache(maxsize=16)`) keyed on the frozen set, so repeated calls with the same asset set don't regenerate models.

If dynamic model creation fails for any reason, the tool builder falls back to the static (unconstrained `str`) version of the tool — the validation layer inside the handler still catches invalid references.

#### Tool set progression example

```
Step 1: Agent starts
  Tools: [update_task_status, read_current_state]

Step 2: Agent calls update_task_status("assets", "in_progress")
  Tools: [update_task_status, read_current_state, create_assets, delete_assets]

Step 3: Agent completes assets, calls update_task_status("data_flows", "in_progress")
  Tools: [update_task_status, read_current_state,
          create_data_flows(Literal-constrained), delete_data_flows]
          ^-- source_entity/target_entity are now Literal["Asset A", "Asset B", ...]

Step 4: Agent completes data_flows + trust_boundaries, starts threats
  Tools: [update_task_status, read_current_state,
          create_threats(Literal-constrained), delete_threats]
          ^-- target is Literal[asset names], source is Literal[threat source categories]
```

### 6. Validate Node

After the agent stops making tool calls (no more `tool_calls` on the response), the router sends it to `validate`. This checks whether all four tasks are `COMPLETE`.

- If any task is incomplete, it sends a `HumanMessage` back to the agent listing what's missing, and the loop continues.
- If all four are complete, it issues a `Command(goto="finalize", update={...}, graph=Command.PARENT)` — breaking out of the subgraph and returning to the parent workflow's `finalize` node with the updated threat model state.

### 7. Finalize

The parent workflow's `finalize_workflow` persists the final state to DynamoDB. During finalize, if `mirror_attack_trees=True` and `parent_id` is set, it calls `copy_matching_attack_trees()`:

- Queries the parent's attack trees from the attack tree DDB table (via GSI on `threat_model_id`)
- For each parent attack tree where the `threat_name` matches a threat in the new version, deep-copies the tree item with a new `attack_tree_id` and `threat_model_id`
- Threats that were removed or renamed don't get their attack trees copied

## State Flow (What Goes In / Comes Out)

### Input (from `_handle_version_state` in agent.py)

The version state is bootstrapped by loading the parent threat model:

| Field                 | Source                                                                                |
| --------------------- | ------------------------------------------------------------------------------------- |
| `assets`              | Parent's assets (parsed from DDB)                                                     |
| `system_architecture` | Parent's flows + boundaries + threat sources                                          |
| `threat_list`         | Parent's threats                                                                      |
| `image_data`          | New architecture diagram (from S3 upload)                                             |
| `previous_image_data` | Parent's architecture diagram (from S3)                                               |
| `description`         | From version modal (or parent's if unchanged)                                         |
| `assumptions`         | From version modal (or parent's if unchanged)                                         |
| `version_tasks`       | `{assets: PENDING, data_flows: PENDING, trust_boundaries: PENDING, threats: PENDING}` |
| `parent_id`           | The parent threat model's job_id                                                      |
| `mirror_attack_trees` | From version modal checkbox                                                           |

### Output (to parent finalize via `Command`)

| Field                 | Description                                                |
| --------------------- | ---------------------------------------------------------- |
| `threat_list`         | Updated threats (uses `Overwrite()` to replace, not merge) |
| `assets`              | Updated assets                                             |
| `system_architecture` | Updated flows + boundaries (threat sources unchanged)      |

## Processing Status & Frontend Stepper

The backend reports version-specific `JobState` values as the agent progresses:

```
VERSION_DIFF -> VERSION_ASSETS -> VERSION_FLOWS -> VERSION_BOUNDARIES -> VERSION_THREATS -> FINALIZE -> COMPLETE
```

The frontend `ProcessingComponent` maps these to a 5-step version stepper:

```
Processing -> Assets -> Data flows -> Threats -> Completing
```

Each step shows real-time `detail` text from the backend (e.g., "Adding 3 assets", "Removing 2 data flows"), which is updated on every tool call via `state_service.update_job_state()`.

## Models

Two dedicated models are used:

- **`model_version_diff`** — Used only in `diff_node`. Standard (non-reasoning) model for structured output. Compares images and produces `VersionDiffResult`.
- **`model_version`** — Used in the ReAct agent loop. Supports reasoning boost (configured via the slider in the version modal). This is the model that does the actual analysis and tool calling.

Both use the same underlying model ID (from `version` in `MAIN_MODEL` config), but `model_version` gets reasoning/thinking configuration applied while `model_version_diff` is always standard.

## Reasoning Trail Capture

As the agent completes each task section, the `update_task_status` tool captures reasoning trails from the message history:

- On `assets` completion: reasoning saved to trail's `assets` field
- On `trust_boundaries` completion: reasoning saved to trail's `flows` field (covers both data_flows and trust_boundaries)
- On `threats` completion: reasoning saved to trail's `threats` field

A `trail_msg_idx` pointer tracks where in the message history the last capture ended, so each segment only captures new reasoning since the previous task completed.

## Stop / Abort Behavior

- **Stop during processing**: The backend deletes the new (incomplete) threat model and returns `{state: "Deleted", parent_id: "..."}`. The frontend navigates back to the parent model.
- **Diff abort**: If `diff_node` determines architectures are fundamentally different, the job is set to FAILED with a descriptive message. No partial state is persisted.

## Key Design Decisions

1. **Subgraph isolation** — The version workflow runs as a LangGraph subgraph with its own `VersionState(MessagesState)`. Message history stays local to the subgraph; only the final updated state crosses back to the parent via `Command(graph=Command.PARENT)`.

2. **Task ordering, not parallelism** — Sections are updated sequentially (assets first, threats last) because later sections depend on earlier ones (threats reference assets, flows reference asset names).

3. **Delete-then-create for updates** — No update tool exists. This keeps the tool surface minimal and avoids partial-update edge cases. The agent deletes an item by its identifier, then creates the new version.

4. **Schema-level enforcement** — Dynamic Literal constraints mean the model physically cannot generate an invalid entity reference in its tool call. This is more reliable than prompt-only instructions and catches errors before they enter state.

5. **Diff-first gating** — Running the diff before committing to the full agent loop allows early abort for incompatible architectures, saving compute cost and giving the user a clear error message instead of garbage output.
