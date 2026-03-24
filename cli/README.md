# Threat Designer CLI

A local CLI for running Threat Designer threat modeling without any backend deployment. All processing happens on your machine — no AWS infrastructure required beyond model access.

---

## Prerequisites

- Python 3.11+
- **Amazon Bedrock** (default): AWS credentials configured (`~/.aws/credentials` or environment variables) with access to Claude 4.6 models
- **OpenAI** (alternative): a valid OpenAI API key

---

## Installation

```bash
pip install ./cli
```

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

Progress is displayed live. Press **Ctrl+C twice** to cancel a run in progress.

### 4. List saved threat models

```
/list
```

### 5. Export a threat model

```
/export <id>
```

Choose from **Markdown**, **Word (.docx)**, **PDF**, or **JSON**. Exports are saved to your current working directory.

### 6. Delete a threat model

```
/delete <id>
```

Or run `/delete` without an ID to pick from a list.

---

## Storage

Threat models are saved locally to `~/.threat-designer/models/<id>.json`.

---

## CLI vs Full Stack App

| Feature | CLI | Web App |
|---|:---:|:---:|
| Threat model generation | ✓ | ✓ |
| Persist threat models  | ✓ | ✓ |
| Export (Markdown, Word, PDF, JSON) | ✓ | ✓ |
| Edit threat models | — | ✓ |
| Replay / re-run with edits | — | ✓ |
| Attack tree generation | — | ✓ |
| Sentry AI assistant | — | ✓ |
| Spaces (knowledge base) | — | ✓ |
| Collaboration & sharing | — | ✓ |

---

## Commands Reference

| Command | Description |
|---|---|
| `/configure` | Set model provider, credentials, and effort level |
| `/create` | Start a new threat modeling run |
| `/list` | Show all saved threat models |
| `/export <id>` | Export a threat model (Markdown, Word, PDF, JSON) |
| `/delete <id>` | Delete a saved threat model |
| `/help` | Show available commands |
| `/quit` | Quit |
