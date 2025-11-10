# Lock Mechanism

## Overview

The edit lock mechanism prevents concurrent modifications to threat models by ensuring only one user can edit at a time. Locks are managed through DynamoDB with automatic expiration and heartbeat-based refresh.

## Lock Data Model

```mermaid
erDiagram
    LOCKS_TABLE {
        string threat_model_id PK
        string user_id
        string lock_token
        number lock_timestamp
        string acquired_at
        number ttl
    }

    LOCKS_TABLE ||--|| THREAT_MODEL : "locks"
    LOCKS_TABLE ||--|| USER : "held_by"
```

**Key Fields:**

- `threat_model_id`: Primary key, identifies which threat model is locked
- `user_id`: UUID of the user holding the lock
- `lock_token`: UUID for validating lock ownership during operations
- `lock_timestamp`: Unix timestamp of last heartbeat (used for staleness check)
- `acquired_at`: ISO timestamp when lock was first acquired
- `ttl`: DynamoDB TTL field (lock_timestamp + 180 seconds)

## Lock Acquisition Flow

```mermaid
sequenceDiagram
    participant UI as Browser UI
    participant LM as LockManager
    participant API as Backend API
    participant DB as DynamoDB (Locks Table)
    participant Auth as Authorization Service

    UI->>LM: Open Threat Model
    LM->>API: POST /threat-designer/{id}/lock
    API->>Auth: Check user has EDIT access

    alt User has EDIT access
        Auth-->>API: Access granted
        API->>DB: Check existing lock

        alt No lock exists
            DB-->>API: No lock found
            API->>DB: Create lock (user_id, lock_token, timestamp, TTL)
            DB-->>API: Lock created
            API-->>LM: {success: true, lock_token: "..."}
            LM->>LM: Start heartbeat (30s interval)
            LM-->>UI: Edit mode enabled
        else Lock exists and is stale (>3 min)
            DB-->>API: Stale lock found
            API->>DB: Delete stale lock
            API->>DB: Create new lock
            DB-->>API: Lock created
            API-->>LM: {success: true, lock_token: "..."}
            LM->>LM: Start heartbeat
            LM-->>UI: Edit mode enabled
        else Lock exists and is fresh
            DB-->>API: Lock held by user_id
            API-->>LM: {success: false, held_by: "user_id", username: "..."}
            LM->>LM: Start polling (30s interval)
            LM-->>UI: Read-only mode (show banner)
        end
    else User lacks EDIT access
        Auth-->>API: Access denied
        API-->>LM: 403 Unauthorized
        LM-->>UI: Read-only mode
    end
```

## Lock Heartbeat and Expiration

```mermaid
sequenceDiagram
    participant LM as LockManager
    participant API as Backend API
    participant DB as DynamoDB

    Note over LM: User has active lock

    loop Every 30 seconds
        LM->>API: PUT /threat-designer/{id}/lock/heartbeat
        Note right of LM: Includes lock_token
        API->>DB: Get current lock

        alt Lock valid and token matches
            DB-->>API: Lock found
            API->>DB: Update lock_timestamp and TTL
            DB-->>API: Updated
            API-->>LM: {success: true}
        else Lock lost or token invalid
            DB-->>API: Lock mismatch
            API-->>LM: {success: false, status_code: 410}
            LM->>LM: Stop heartbeat
            LM->>LM: Trigger onLockLost callback
            Note over LM: UI shows "Lock Lost" alert
        end
    end

    Note over DB: If no heartbeat for 3 minutes
    DB->>DB: TTL expires, lock auto-deleted
```

## Lock Release Flow

```mermaid
sequenceDiagram
    participant UI as Browser UI
    participant LM as LockManager
    participant API as Backend API
    participant DB as DynamoDB

    alt User navigates away
        UI->>LM: Component unmount
        LM->>LM: Stop heartbeat
        LM->>API: DELETE /threat-designer/{id}/lock
        Note right of LM: Includes lock_token
        API->>DB: Verify user_id and lock_token
        DB-->>API: Verified
        API->>DB: Delete lock
        DB-->>API: Deleted
        API-->>LM: {success: true}
    else User closes browser
        UI->>LM: beforeunload event
        LM->>LM: Stop heartbeat
        Note over LM: Lock expires via TTL (3 min)
    else Lock expires naturally
        Note over DB: No heartbeat for 3 minutes
        DB->>DB: TTL expires
        DB->>DB: Auto-delete lock
    end
```

## Lock Conflict Resolution

```mermaid
flowchart TD
    A[User B opens threat model] --> B{Lock exists?}
    B -->|No| C[Acquire lock immediately]
    B -->|Yes| D{Lock is stale?}
    D -->|Yes >3 min| E[Delete stale lock]
    E --> C
    D -->|No, fresh| F{Held by User B?}
    F -->|Yes| G[Refresh lock with new token]
    F -->|No, User A| H[Enter read-only mode]
    H --> I[Show banner: Locked by User A]
    I --> J[Start polling every 30s]
    J --> K{Lock available?}
    K -->|No| J
    K -->|Yes| C
    C --> L[Enable edit mode]
    L --> M[Start heartbeat every 30s]
```
