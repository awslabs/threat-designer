# Quick Start Guide: Using Attack Trees

This guide explains how to visualize and analyze attack paths using Threat Designer's Attack Tree feature.

## What are Attack Trees?

Attack Trees provide a visual, hierarchical representation of how a specific threat could be executed against your system. They break down complex attacks into logical steps, showing:

- **Attack Goals**: The ultimate objective an attacker wants to achieve
- **Attack Paths**: Different ways to accomplish the goal
- **Logic Gates**: How multiple conditions combine (AND/OR logic)
- **Leaf Attacks**: Individual attack steps or techniques, classified using the **MITRE ATT&CK** framework

Attack trees help you understand the sequence of actions an attacker would need to take, making it easier to identify where to implement defenses.

## Accessing Attack Trees

### From the Threat Catalog

1. Navigate to your completed threat model
2. Scroll to the **Threat Catalog** section
3. Find the threat you want to analyze
4. Click the **tree/network icon button** (looks like connected nodes) on the threat card

The attack tree opens in a side drawer, displaying the full attack path visualization.

## Understanding the Attack Tree Visualization

### Node Types

**Root Goal Node**
The top-level attack objective. This represents what the attacker is trying to achieve with this specific threat.

**Logic Gate Nodes**

- **AND Gates** (Blue ∧ icon): All child conditions must be satisfied
- **OR Gates** (Pink ∨ icon): Any one child condition is sufficient

**Leaf Attack Nodes**
Individual attack techniques or steps classified using MITRE ATT&CK tactics. Click on any leaf node to open a detailed modal showing:

- Full description
- Severity level (High, Medium, Low)
- Prerequisites
- Likelihood
- Skill level required
- Resources needed
- MITRE ATT&CK technique mapping

## Navigating the Attack Tree

### Pan and Zoom

- **Pan**: Click and drag anywhere on the canvas to move around
- **Zoom**: Use the zoom controls in the bottom-left corner or your mouse wheel
- **Fit View**: Click the "fit view" button to see the entire tree

### Focus Mode

For complex attack trees with many branches, you can focus on specific subtrees:

1. **Click on any AND or OR gate node** to focus on it
2. The view filters to show only that node and its **downstream** attack paths
3. **Click the same node again** to return to the full tree view

**Tip**: Focus mode is useful for analyzing specific attack branches in detail without the distraction of the full tree.

## Creating Attack Trees

Attack trees are created **on-demand** for each threat. They are not automatically generated when you submit or replay a threat model.

### Generation Process

1. Click the **tree/network icon button** on any threat card
2. If no tree exists yet, you'll see a **"Create Attack Tree"** button in the drawer
3. Click the button to start generation
4. A loading animation appears while the AI analyzes the threat

**Generation Time**: Attack tree generation typically takes **1-3 minutes** depending on threat complexity.

**You don't need to wait**: You can close the drawer and navigate away while the tree is being generated. When you return and click the tree icon again, the completed tree will be displayed if generation has finished, or you'll see the loading state if it's still in progress.

## Editing Attack Trees

Attack trees can be manually edited to refine the AI-generated analysis or add custom attack paths specific to your system.

### Adding Nodes

1. Click the **"+ Add Node"** button in the editor controls (top-left)
2. Select the node type from the dropdown:
   - **Goal Node**: Root objective (typically only one per tree)
   - **AND Gate**: All children must succeed
   - **OR Gate**: Any child can succeed
   - **Leaf Attack**: Individual attack technique
3. Click on the canvas where you want to place the new node
4. The node appears and can be connected to the tree

### Connecting Nodes

1. **Hover near a source handle** (right side of nodes) - it will scale up and turn blue
2. **Click and drag** from the source handle to a target handle (left side of another node)
3. The connection is created

**Connection Rules**:

- Target nodes can only have **one incoming connection**
- Goal nodes cannot connect directly to leaf attacks (use a gate node)
- Leaf nodes can only receive connections, not create them
- When in focus mode, you cannot connect to the focused node's target handle

### Editing Nodes

1. **Hover over any node** to reveal the action buttons
2. Click the **edit icon** (pencil)
3. Update the node details in the modal:
   - **Goal nodes**: Edit the goal description
   - **Gate nodes**: Change between AND/OR, edit label
   - **Leaf attacks**: Edit all attack details (description, severity, likelihood, MITRE mapping, etc.)
4. Click **"Save"** to apply changes

### Deleting Nodes

1. **Hover over the node** you want to delete
2. Click the **delete icon** (trash can)
3. Confirm the deletion in the modal
4. The node and all its connections are removed

**Note**: Deleting a node does not delete its children - they remain in the tree as unconnected nodes.

### Deleting Connections

1. **Hover near a connected target handle** (left side of nodes) - it will scale up and turn purple
2. **Click the purple handle** to delete the incoming connection
3. The connection is removed, leaving the target node unconnected

### Saving Changes

- Click the **"Save"** button in the editor controls to persist your changes
- The save button shows a green checkmark when changes are successfully saved

### Undo/Redo

- Use the **undo** and **redo** buttons in the editor controls
- These track all node additions, edits, deletions, and connection changes
- Useful for experimenting with different tree structures

## Managing Attack Trees

### Deleting Attack Trees

If you want to regenerate an attack tree with updated information:

1. Open the attack tree in the side drawer
2. Click the **"Trash bin"** icon button in the top-left corner
3. Confirm the deletion
4. Click **"Create Attack Tree"** again to generate a fresh analysis

## Best Practices

**Start with high-priority threats**: Generate attack trees for your most critical or high-likelihood threats first to understand the most important attack vectors.

**Use focus mode for complex trees**: If an attack tree has many branches, use focus mode to analyze each major path individually rather than trying to understand everything at once.

**Review leaf attacks carefully**: The leaf nodes contain the actual attack techniques mapped to MITRE ATT&CK. Click on them to see full details. These are where you should focus your defensive efforts.

**Look for AND gates**: AND gates represent points where multiple conditions must be met. These are often good places to implement defenses, as blocking any one condition prevents the entire attack path.

**Customize AI-generated trees**: The AI provides a solid starting point, but you can refine the tree by adding system-specific attack paths, adjusting gate logic, or adding custom leaf attacks relevant to your environment.

**Build incrementally in focus mode**: When adding complex branches, use focus mode on the parent gate to work on that subtree without visual clutter from the rest of the tree.

**Save frequently**: Use the save button regularly when making manual edits to avoid losing your customizations.

**Regenerate after major changes**: If you significantly update a threat's description, target assets, or mitigations, delete and regenerate the attack tree to get updated analysis.

## Understanding Attack Logic

### AND Gates (All conditions required)

When you see an AND gate, the attacker must successfully complete **all** child branches to proceed. This means:

- Defending against **any one** child branch blocks the entire path
- These are high-value defensive points
- Focus mitigation efforts here for maximum impact

**Example**: "Gain access to database" AND "Extract sensitive data" AND "Exfiltrate without detection"

### OR Gates (Any condition sufficient)

When you see an OR gate, the attacker can succeed by completing **any one** child branch. This means:

- You must defend against **all** child branches to fully prevent the attack
- These represent multiple attack vectors
- Prioritize based on likelihood and ease of exploitation

**Example**: "Exploit SQL injection" OR "Steal credentials" OR "Exploit API vulnerability"
