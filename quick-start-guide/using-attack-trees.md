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

**Root Goal Node** (Red border)  
The top-level attack objective. This represents what the attacker is trying to achieve with this specific threat.

**Logic Gate Nodes** (Blue/Pink icons)

- **AND Gates** (Blue ∧ icon): All child conditions must be satisfied
- **OR Gates** (Pink ∨ icon): Any one child condition is sufficient

**Leaf Attack Nodes** (Gray border)  
Individual attack techniques or steps classified using MITRE ATT&CK tactics. Click on any leaf node to open a detailed modal showing:

- Full description
- Severity level (High, Medium, Low)
- Prerequisites
- Likelihood
- Skill level required
- Resources needed
- MITRE ATT&CK technique mapping

### Visual Elements

**Connection Lines**  
Dashed lines show the relationships between nodes, flowing from the root goal down through gates to leaf attacks.

**Node Badges**  
Small labels on nodes indicate their type (Logic Gate, Attack Step, etc.) for quick identification.

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

## Managing Attack Trees

### Deleting Attack Trees

If you want to regenerate an attack tree with updated information:

1. Open the attack tree in the side drawer
2. Click the **"Delete Attack Tree"** button in the top-right corner
3. Confirm the deletion
4. Click **"Create Attack Tree"** again to generate a fresh analysis

**Use case**: Delete and regenerate when you've significantly modified the threat description or want the AI to reconsider the attack paths.

## Best Practices

**Start with high-priority threats**: Generate attack trees for your most critical or high-likelihood threats first to understand the most important attack vectors.

**Use focus mode for complex trees**: If an attack tree has many branches, use focus mode to analyze each major path individually rather than trying to understand everything at once.

**Review leaf attacks carefully**: The leaf nodes contain the actual attack techniques mapped to MITRE ATT&CK. Click on them to see full details. These are where you should focus your defensive efforts.

**Look for AND gates**: AND gates represent points where multiple conditions must be met. These are often good places to implement defenses, as blocking any one condition prevents the entire attack path.

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
