# Collaboration System Architecture

## Overview

The Threat Designer collaboration system enables multiple users to work on threat models simultaneously while maintaining data integrity through role-based access control, edit locking, and conflict resolution mechanisms.

## System Components

```mermaid
graph TB
    subgraph "Frontend"
        UI[React UI]
        SHARE[Sharing Modal]
        CONFLICT[Conflict Resolution]
        LOCK[Lock Manager]
    end
    
    subgraph "Backend Services"
        COLLAB[CollaborationService]
        LOCKS[LockService]
        AUTHZ[AuthorizationService]
    end
    
    subgraph "Data Layer"
        DDB_COLLAB[DynamoDB<br/>Collaborators]
        DDB_LOCKS[DynamoDB<br/>Locks]
        DDB_STATE[DynamoDB<br/>Agent State]
        COGNITO[Cognito<br/>Users]
    end
    
    UI --> SHARE
    UI --> CONFLICT
    UI --> LOCK
    
    SHARE --> COLLAB
    CONFLICT --> COLLAB
    LOCK --> LOCKS
    
    COLLAB --> AUTHZ
    LOCKS --> AUTHZ
    
    COLLAB --> DDB_COLLAB
    COLLAB --> COGNITO
    LOCKS --> DDB_LOCKS
    AUTHZ --> DDB_STATE
```

## Access Control Model

### Three-Tier Access Levels

```mermaid
graph LR
    OWNER[OWNER<br/>Creator] -->|Can delegate| EDIT[EDIT<br/>Collaborator]
    EDIT -->|Can view| READ[READ_ONLY<br/>Viewer]
    
    OWNER -.->|Full control| OPS1[All operations]
    EDIT -.->|Limited control| OPS2[Read + Write]
    READ -.->|View only| OPS3[Read only]
```

### Permission Matrix

| Feature | OWNER | EDIT | READ_ONLY |
|---------|-------|------|-----------|
| **Viewing** |
| View threat model | ✅ | ✅ | ✅ |
| View collaborators | ✅ | ✅ | ✅ |
| View lock status | ✅ | ✅ | ✅ |
| Download exports | ✅ | ✅ | ✅ |
| **Editing** |
| Acquire edit lock | ✅ | ✅ | ❌ |
| Modify threats | ✅ | ✅ | ❌ |
| Modify assets/flows | ✅ | ✅ | ❌ |
| Save changes | ✅ | ✅ | ❌ |
| Replay analysis | ✅ | ✅ | ❌ |
| **Management** |
| Share with others | ✅ | ❌ | ❌ |
| Add collaborators | ✅ | ❌ | ❌ |
| Remove collaborators | ✅ | ❌ | ❌ |
| Change access levels | ✅ | ❌ | ❌ |
| Force release locks | ✅ | ❌ | ❌ |
| Delete threat model | ✅ | ❌ | ❌ |

## Sharing Workflow

### Share Threat Model Flow

```mermaid
sequenceDiagram
    participant Owner
    participant UI as Sharing Modal
    participant API
    participant Cognito
    participant DDB as Collaborators Table

    Owner->>UI: Click "Share"
    UI->>API: GET /threat-designer/users
    API->>Cognito: List users
    Cognito-->>API: User list
    API-->>UI: Available users
    
    Owner->>UI: Select user + access level
    Owner->>UI: Click "Add"
    
    UI->>API: POST /threat-designer/{id}/share<br/>{user_id, access_level}
    API->>API: Verify owner permissions
    API->>DDB: Put collaborator record
    DDB-->>API: Success
    API-->>UI: Collaborator added
    
    UI->>UI: Refresh collaborator list
    UI-->>Owner: Show updated list
```

### Collaborator Data Model

```python
{
    "threat_model_id": "uuid-v4",  # Partition key
    "user_id": "user-sub-uuid",    # Sort key
    "access_level": "EDIT",         # OWNER | EDIT | READ_ONLY
    "added_at": "2025-01-01T00:00:00Z",
    "added_by": "owner-user-sub",
    "email": "user@example.com",
    "username": "user"
}
```

### Access Level Changes

```mermaid
stateDiagram-v2
    [*] --> READ_ONLY: Owner adds collaborator
    READ_ONLY --> EDIT: Owner upgrades access
    EDIT --> READ_ONLY: Owner downgrades access
    READ_ONLY --> [*]: Owner removes collaborator
    EDIT --> [*]: Owner removes collaborator
    
    note right of READ_ONLY
        View only
        No modifications
    end note
    
    note right of EDIT
        Can acquire lock
        Can modify content
    end note
```

## Concurrent Access Management

### Edit Lock Integration

The collaboration system integrates with the lock mechanism to prevent conflicts:

```mermaid
flowchart TD
    UserA[User A<br/>EDIT access] --> TryLock[Try acquire lock]
    UserB[User B<br/>EDIT access] --> TryLock
    
    TryLock --> CheckLock{Lock available?}
    
    CheckLock -->|Yes| AcquireLock[Acquire lock]
    CheckLock -->|No| CheckHolder{Who holds lock?}
    
    CheckHolder -->|User A| WaitA[User B waits<br/>Read-only mode]
    CheckHolder -->|User B| WaitB[User A waits<br/>Read-only mode]
    
    AcquireLock --> Edit[Edit mode enabled]
    Edit --> Heartbeat[Send heartbeat<br/>every 30s]
    
    WaitA --> Poll[Poll every 30s]
    WaitB --> Poll
    Poll --> CheckLock
    
    Edit --> Release[Release lock]
    Release --> CheckLock
```

### Lock Behavior by Access Level

| Access Level | Can Acquire Lock | Lock Behavior |
|--------------|------------------|---------------|
| OWNER | ✅ Always | Can force-release any lock |
| EDIT | ✅ If available | Must wait if locked |
| READ_ONLY | ❌ Never | Always read-only mode |

## Conflict Resolution

### Conflict Detection

```mermaid
sequenceDiagram
    participant UserA
    participant UserB
    participant API
    participant DDB

    UserA->>API: GET /threat-designer/{id}
    API->>DDB: Fetch (last_modified: T1)
    DDB-->>API: Threat model
    API-->>UserA: Data (last_modified: T1)
    
    UserB->>API: GET /threat-designer/{id}
    API->>DDB: Fetch (last_modified: T1)
    DDB-->>API: Threat model
    API-->>UserB: Data (last_modified: T1)
    
    UserA->>UserA: Make changes locally
    UserA->>API: PUT /threat-designer/{id}<br/>last_modified: T1
    API->>DDB: Update (set last_modified: T2)
    DDB-->>API: Success
    API-->>UserA: 200 OK
    
    UserB->>UserB: Make changes locally
    UserB->>API: PUT /threat-designer/{id}<br/>last_modified: T1
    API->>DDB: Conditional update<br/>if last_modified == T1
    DDB-->>API: ConditionalCheckFailed
    
    API->>DDB: Get current version (T2)
    API->>API: Calculate diff
    API-->>UserB: 409 Conflict<br/>{server_version, client_version, diff}
```

### Conflict Resolution Modal

```mermaid
flowchart TD
    Conflict[409 Conflict Detected] --> Modal[Show Conflict Modal]
    
    Modal --> Overview[Overview Tab]
    Modal --> Diff[Differences Tab]
    
    Overview --> ShowInfo[Display:<br/>- Server timestamp<br/>- Client timestamp<br/>- Last modifier<br/>- Change count]
    
    Diff --> ShowDiff[Display:<br/>- Added items green<br/>- Modified items blue<br/>- Deleted items red]
    
    ShowInfo --> Choice{User Decision}
    ShowDiff --> Choice
    
    Choice -->|Use Server| LoadServer[Discard local changes<br/>Load server version]
    Choice -->|Use Mine| SaveMine[Overwrite server<br/>Save local changes]
    Choice -->|Cancel| ManualMerge[Manual merge<br/>User resolves manually]
    
    LoadServer --> Done[Conflict Resolved]
    SaveMine --> Done
    ManualMerge --> Done
```

### Collaboration Limits

- Lock timeout: 3 minutes
- Heartbeat interval: 30 seconds


