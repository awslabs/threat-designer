"""Deterministic asset partitioner for parallel threat analysis.

Uses flow-graph connectivity for initial grouping and trust boundary
edges as preferred cut lines when splitting. Produces balanced,
connectivity-aware partitions without any LLM calls.
"""

import math
from collections import defaultdict, deque
from typing import Dict, List, Optional, Set, Tuple


# ---------------------------------------------------------------------------
# Graph construction
# ---------------------------------------------------------------------------


def _build_flow_graph(
    asset_set: Set[str], data_flows: list
) -> Dict[str, Dict[str, int]]:
    """Build undirected weighted adjacency list from data flows.

    Only edges between known assets are included. Weight = number of
    flows between the pair.
    """
    graph: Dict[str, Dict[str, int]] = defaultdict(lambda: defaultdict(int))

    for flow in data_flows:
        src = flow.source_entity
        tgt = flow.target_entity
        if src in asset_set and tgt in asset_set and src != tgt:
            graph[src][tgt] += 1
            graph[tgt][src] += 1

    return graph


def _build_boundary_edges(
    asset_set: Set[str], trust_boundaries: list
) -> Set[frozenset]:
    """Extract trust boundary edges as a set of frozensets for O(1) lookup."""
    edges: Set[frozenset] = set()

    for tb in trust_boundaries:
        src = tb.source_entity
        tgt = tb.target_entity
        if src in asset_set and tgt in asset_set and src != tgt:
            edges.add(frozenset((src, tgt)))

    return edges


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _node_degree(node: str, graph: Dict[str, Dict[str, int]], scope: Set[str]) -> int:
    """Sum of edge weights for *node* within *scope*."""
    return sum(w for n, w in graph.get(node, {}).items() if n in scope)


def _inter_group_weight(
    group_a: Set[str],
    group_b: Set[str],
    graph: Dict[str, Dict[str, int]],
) -> int:
    """Total flow weight between two groups."""
    total = 0
    for node in group_a:
        for neighbor, weight in graph.get(node, {}).items():
            if neighbor in group_b:
                total += weight
    return total


def _group_sort_key(group: Set[str]) -> str:
    """Deterministic sort key for a group: its lexicographically first member."""
    return min(group)


# ---------------------------------------------------------------------------
# Connected components
# ---------------------------------------------------------------------------


def _connected_components(
    nodes: Set[str], graph: Dict[str, Dict[str, int]]
) -> List[Set[str]]:
    """BFS-based connected components restricted to *nodes*."""
    visited: Set[str] = set()
    components: List[Set[str]] = []

    for node in sorted(nodes):
        if node in visited:
            continue
        component: Set[str] = set()
        queue = deque([node])
        while queue:
            current = queue.popleft()
            if current in visited:
                continue
            visited.add(current)
            component.add(current)
            for neighbor in sorted(graph.get(current, {})):
                if neighbor in nodes and neighbor not in visited:
                    queue.append(neighbor)
        components.append(component)

    return components


# ---------------------------------------------------------------------------
# Orphan assignment
# ---------------------------------------------------------------------------


def _assign_orphans(
    groups: List[Set[str]],
    orphans: Set[str],
    graph: Dict[str, Dict[str, int]],
) -> List[Set[str]]:
    """Assign orphan assets (no flow edges) to existing groups.

    Each orphan goes to the group it shares the most flows with.
    Ties: smallest group, then lexicographic.
    If no groups exist yet, orphans form a single new group.
    """
    if not orphans:
        return groups

    if not groups:
        return [orphans]

    for orphan in sorted(orphans):
        best_idx: Optional[int] = None
        best_flow = -1
        best_size = float("inf")
        best_key = ""

        for i, group in enumerate(groups):
            flow = sum(w for n, w in graph.get(orphan, {}).items() if n in group)
            key = _group_sort_key(group)

            if (
                flow > best_flow
                or (flow == best_flow and len(group) < best_size)
                or (flow == best_flow and len(group) == best_size and key < best_key)
            ):
                best_flow = flow
                best_size = len(group)
                best_key = key
                best_idx = i

        groups[best_idx].add(orphan)

    return groups


# ---------------------------------------------------------------------------
# Merge (connectivity-aware)
# ---------------------------------------------------------------------------


def _merge_to_target(
    groups: List[Set[str]],
    graph: Dict[str, Dict[str, int]],
    target_k: int,
) -> List[Set[str]]:
    """Merge groups down to *target_k*, preferring high-affinity merges.

    Picks the smallest group, merges it with the partner sharing the most
    inter-group flow weight. Ties: smallest partner, then lexicographic.
    """
    while len(groups) > target_k:
        # Find smallest group
        smallest_idx = min(
            range(len(groups)),
            key=lambda i: (len(groups[i]), _group_sort_key(groups[i])),
        )
        smallest = groups[smallest_idx]

        # Find best merge partner
        best_partner: Optional[int] = None
        best_flow = -1
        best_size = float("inf")
        best_key = ""

        for j in range(len(groups)):
            if j == smallest_idx:
                continue
            flow = _inter_group_weight(smallest, groups[j], graph)
            key = _group_sort_key(groups[j])

            if (
                flow > best_flow
                or (flow == best_flow and len(groups[j]) < best_size)
                or (
                    flow == best_flow and len(groups[j]) == best_size and key < best_key
                )
            ):
                best_flow = flow
                best_size = len(groups[j])
                best_key = key
                best_partner = j

        # Merge
        groups[best_partner] |= smallest
        groups.pop(smallest_idx)

    return groups


# ---------------------------------------------------------------------------
# Split (boundary-aware BFS + swap pass)
# ---------------------------------------------------------------------------


def _bfs_split(
    group: Set[str],
    graph: Dict[str, Dict[str, int]],
    boundary_edges: Set[frozenset],
) -> Tuple[Set[str], Set[str]]:
    """Split a group using BFS with boundary-aware traversal order.

    BFS from the highest-degree node. At each step, non-boundary edges
    are explored first so the BFS stays within the same trust zone as
    long as possible. Alternating BFS layers are assigned to each half.
    """
    if len(group) < 2:
        return group.copy(), set()

    # Start node: highest degree within group (ties: lexicographic)
    start = max(
        sorted(group),
        key=lambda n: _node_degree(n, graph, group),
    )

    # BFS with boundary-aware neighbor ordering
    visited: Dict[str, int] = {}
    queue: deque = deque([(start, 0)])

    while queue:
        node, layer = queue.popleft()
        if node in visited:
            continue
        visited[node] = layer

        # Sort neighbors: non-boundary edges first, then boundary edges
        # Within each category: lexicographic for determinism
        neighbors = [n for n in graph.get(node, {}) if n in group and n not in visited]
        non_boundary = sorted(
            n for n in neighbors if frozenset((node, n)) not in boundary_edges
        )
        boundary = sorted(
            n for n in neighbors if frozenset((node, n)) in boundary_edges
        )

        for neighbor in non_boundary + boundary:
            queue.append((neighbor, layer + 1))

    # Add disconnected assets (not reachable via BFS)
    max_layer = max(visited.values()) if visited else 0
    for node in sorted(group):
        if node not in visited:
            max_layer += 1
            visited[node] = max_layer

    # Assign alternating layers to halves
    half_a: Set[str] = set()
    half_b: Set[str] = set()
    for node, layer in visited.items():
        if layer % 2 == 0:
            half_a.add(node)
        else:
            half_b.add(node)

    # Ensure neither half is empty
    if not half_b and len(half_a) > 1:
        moved = min(half_a)
        half_a.remove(moved)
        half_b.add(moved)
    elif not half_a and len(half_b) > 1:
        moved = min(half_b)
        half_b.remove(moved)
        half_a.add(moved)

    return half_a, half_b


def _swap_pass(
    half_a: Set[str],
    half_b: Set[str],
    graph: Dict[str, Dict[str, int]],
) -> Tuple[Set[str], Set[str]]:
    """Single swap pass to reduce cut edges without worsening balance by > 1.

    For each node, if it has more flow connections to the other half than
    its own, move it (subject to balance constraint).
    """
    improved = True
    while improved:
        improved = False
        for node in sorted(half_a | half_b):
            if node in half_a:
                own, other = half_a, half_b
            else:
                own, other = half_b, half_a

            # Don't empty a half
            if len(own) <= 1:
                continue

            # Don't worsen balance beyond 1
            new_balance = abs((len(own) - 1) - (len(other) + 1))
            old_balance = abs(len(own) - len(other))
            if new_balance > max(old_balance, 1):
                continue

            edges_own = sum(w for n, w in graph.get(node, {}).items() if n in own)
            edges_other = sum(w for n, w in graph.get(node, {}).items() if n in other)

            if edges_other > edges_own:
                own.remove(node)
                other.add(node)
                improved = True

    return half_a, half_b


def _split_to_target(
    groups: List[Set[str]],
    graph: Dict[str, Dict[str, int]],
    boundary_edges: Set[frozenset],
    target_k: int,
) -> List[Set[str]]:
    """Split largest groups until we reach *target_k* partitions."""
    while len(groups) < target_k:
        # Find largest group (ties: lexicographic)
        largest_idx = max(
            range(len(groups)),
            key=lambda i: (len(groups[i]), _group_sort_key(groups[i])),
        )
        largest = groups[largest_idx]

        if len(largest) < 2:
            break

        half_a, half_b = _bfs_split(largest, graph, boundary_edges)
        half_a, half_b = _swap_pass(half_a, half_b, graph)

        groups[largest_idx] = half_a
        groups.append(half_b)

    return groups


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

# Sizing constants
MIN_ASSETS_TO_SPLIT = 7
MAX_PARTITIONS = 4
MIN_PARTITIONS = 2
ASSETS_PER_PARTITION = 5


def compute_partitions(
    asset_names: List[str],
    data_flows: list,
    trust_boundaries: list = None,
) -> List[List[str]]:
    """Partition assets into groups for parallel threat analysis.

    Uses flow-graph connected components as initial grouping, then merges
    or splits to reach a target partition count. Trust boundary edges are
    used as preferred cut lines during splits. All tie-breaking is
    lexicographic for full determinism.

    Args:
        asset_names: List of asset/entity name strings.
        data_flows: Objects with .source_entity and .target_entity attributes.
        trust_boundaries: Objects with .source_entity and .target_entity
            attributes representing trust zone crossings.

    Returns:
        List of sorted asset-name lists, one per partition.
        Partitions are sorted by their first member.
    """
    n = len(asset_names)
    asset_set = set(asset_names)

    if n < MIN_ASSETS_TO_SPLIT:
        return [sorted(asset_names)]

    target_k = min(
        MAX_PARTITIONS, max(MIN_PARTITIONS, math.ceil(n / ASSETS_PER_PARTITION))
    )

    # Build graphs
    flow_graph = _build_flow_graph(asset_set, data_flows or [])
    boundary_edges = _build_boundary_edges(asset_set, trust_boundaries or [])

    # Initial grouping: connected components
    components = _connected_components(asset_set, flow_graph)

    # Separate connected groups from orphans (single-node components with no edges)
    groups: List[Set[str]] = []
    orphans: Set[str] = set()
    for comp in components:
        if len(comp) == 1:
            node = next(iter(comp))
            if not graph_has_edges(node, flow_graph, asset_set):
                orphans.add(node)
                continue
        groups.append(comp)

    # Assign orphans to existing groups (or create one if no groups)
    groups = _assign_orphans(groups, orphans, flow_graph)

    # Balance to target
    groups = _merge_to_target(groups, flow_graph, target_k)
    groups = _split_to_target(groups, flow_graph, boundary_edges, target_k)

    # Sort for determinism
    return [sorted(g) for g in sorted(groups, key=lambda g: min(g))]


def graph_has_edges(
    node: str, graph: Dict[str, Dict[str, int]], scope: Set[str]
) -> bool:
    """Check if a node has any edges within scope."""
    return any(n in scope for n in graph.get(node, {}))
