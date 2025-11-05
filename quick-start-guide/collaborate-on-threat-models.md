# Quick Start Guide: Collaborating on Threat Models

This guide explains how to share threat models with team members, manage access permissions, and work collaboratively while avoiding conflicts.

## Overview

Threat Designer supports real-time collaboration, allowing multiple team members to work on the same threat model. The collaboration system includes:

- **Role-based access control** (Owner, Edit, Read-Only)
- **Edit locking** to prevent simultaneous modifications
- **Conflict detection** when changes overlap
- **Real-time lock status** visibility

## Sharing a Threat Model

### Prerequisites

- You must be the **owner** of the threat model to share it
- Collaborators must have user accounts in the same Threat Designer instance

**Adding Users to Your Threat Designer Instance**  
Before you can share threat models, users must have accounts in your Cognito User Pool. To add new users:

1. Navigate to the [AWS Cognito Console](https://console.aws.amazon.com/cognito/)
2. Select your Threat Designer User Pool
3. Go to **Users** → **Create user**
4. Follow the [AWS Cognito documentation for creating users](https://docs.aws.amazon.com/cognito/latest/developerguide/how-to-create-user-accounts.html)

Once users are added to the User Pool, they'll appear in the sharing search and can be granted access to threat models.

### Steps to Share

1. Open the threat model you want to share
2. Click the **Actions** dropdown in the top-right corner
3. Select **Share**
4. In the sharing modal:
   - Search for users by email or name
   - Select a user from the dropdown
   - Click **Add** to grant them access
5. The user is added with **Read-Only** access by default

### Managing Collaborator Access

**View Current Collaborators**  
The sharing modal displays all users who have access to the threat model, showing their access level and when they were added.

**Change Access Levels**

1. Click the **pencil icon** next to a collaborator's access level
2. Select the new access level:
   - **Read-Only**: View the threat model but cannot make changes
   - **Edit**: View and modify the threat model
3. The change takes effect immediately

**Remove Collaborators**

1. Click the **Remove** button next to a collaborator
2. The user immediately loses access to the threat model
3. If they had an active edit lock, it is automatically released

## Understanding Access Levels

### Owner

- Full control over the threat model
- Can share with others and manage collaborators
- Can delete the threat model
- Can force-release locks held by others
- Can edit at any time (bypasses lock requirements)

### Edit Access

- Can view and modify all threat model content
- Must acquire an edit lock before making changes
- Can replay the threat model with new parameters
- Cannot share with others or delete the threat model
- Cannot remove other collaborators

### Read-Only Access

- Can view all threat model content
- Can make inline modification but can't persist them
- Cannot acquire edit locks
- Cannot replay or delete the threat model
- Useful for stakeholders who need visibility without editing rights

## Working with Edit Locks

### What are Edit Locks?

Edit locks prevent multiple users from editing the same threat model simultaneously, which could cause conflicts and data loss. When you open a threat model:

- The system automatically attempts to acquire an edit lock
- If successful, you can make changes
- If another user holds the lock, you enter read-only mode

### Lock Status Indicators

**When You Have the Lock**

- No special indicator appears
- You can freely edit all sections
- The lock automatically refreshes every 30 seconds while you're active

**When Another User Has the Lock**

- A yellow banner appears at the top: "This threat model is currently locked by [username]"
- All edit buttons are disabled
- You can still view all content
- The system polls every 30 seconds to check if the lock becomes available

**When the Lock Becomes Available**

- The system automatically acquires the lock for you
- The banner disappears
- Edit functionality is restored

### Lock Behavior

**Automatic Acquisition**  
When you open a threat model, the system tries to acquire a lock immediately. If successful, you can start editing right away.

**Automatic Refresh**  
While you have the lock, it refreshes every 30 seconds to show you're still active. No action required on your part.

**Automatic Release**  
Locks are automatically released when you:

- Navigate away from the threat model
- Close the browser tab
- Are inactive for 3 minutes (lock expires)
- Delete the threat model

## Handling Conflicts

### What Causes Conflicts?

Conflicts occur when:

- You make changes to your local copy
- Another user saves changes to the server
- You try to save your changes afterward

The system detects this by comparing timestamps and prevents accidental overwrites.

### Conflict Resolution Modal

When a conflict is detected, a modal appears showing:

**Overview Tab**

- Server timestamp vs. your timestamp
- Who made the last server change
- Total number of differences

**Differences Tab**

- Side-by-side comparison of changes
- Color-coded additions (green), modifications (blue), and deletions (red)
- Detailed diffs for threats, assets, flows, boundaries, and sources

### Resolution Options

**Use Server Version**

- Discards your local changes
- Loads the latest version from the server
- Choose this if the other user's changes are more important

**Use My Version**

- Saves your local changes to the server
- Overwrites the other user's changes
- Choose this if your changes are more important
- **Note**: This automatically saves to the server

**Cancel**

- Closes the modal without making changes
- Your local changes remain unsaved
- You can manually merge changes if needed

## Next Steps

**Enhance your threat model**: Use [Sentry](./using-sentry.md) to explore gaps and improve your analysis collaboratively.

**Refine with replay**: Learn how to [replay threat models](./replay-threat-model.md) to incorporate team feedback and generate updated analysis.

**Export and share**: Download your collaborative threat model in multiple formats for broader distribution beyond the platform.
