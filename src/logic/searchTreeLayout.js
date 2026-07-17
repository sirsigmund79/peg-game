// ============================================================================
// searchTreeLayout.js
// ----------------------------------------------------------------------------
// Turns a small tree -- { nodes: Map<key, {depth}>, rootKey, primaryParent:
// Map<childKey, parentKey>, maxDepth } -- into 0-100 (x, y) positions for
// SearchTreeVisualizer.vue to draw as an SVG dendrogram, deliberately
// DEPTH-DOWN, BREADTH-ACROSS (y = how many moves deep a state is, x = how
// spread out the search fans out at that depth), since that's the exact
// pair of quantities the visualization exists to show at a glance. Used for
// the small real-sample graph built by workers/searchTreeExplorerWorker.js
// (see that file and SearchTreeVisualizer.vue).
//
// Positions are laid out entirely over `primaryParent`, so every node gets
// exactly one (x, y); any additional edges a caller wants to draw between
// two already-placed points (e.g. a transposition) are the caller's concern,
// not something layout itself needs to resolve.
//
// No Vue code lives here -- plain geometry, same convention as
// logic/boardLayout.js.
// ============================================================================

const MARGIN_PERCENT = 9;

/**
 * @param {{nodes: Map<string, {depth:number}>, rootKey: string, primaryParent: Map<string,string>, maxDepth: number}} tree
 * @returns {Map<string, {x:number, y:number}>}
 */
export function layoutSearchTreeDendrogram(tree) {
  const { nodes, rootKey, primaryParent, maxDepth } = tree;

  const children = new Map();
  for (const [childKey, parentKey] of primaryParent) {
    if (!children.has(parentKey)) children.set(parentKey, []);
    children.get(parentKey).push(childKey);
  }

  // Pass 1: give every LEAF an evenly-spaced horizontal slot (0..1), in
  // `primaryParent`'s own insertion (discovery) order -- a stable,
  // deterministic left-to-right order, never sorted or reshuffled.
  const leafSlot = new Map();
  let nextSlot = 0;
  (function collectLeaves(key) {
    const kids = children.get(key) ?? [];
    if (kids.length === 0) {
      leafSlot.set(key, nextSlot);
      nextSlot += 1;
      return;
    }
    for (const child of kids) collectLeaves(child);
  })(rootKey);
  const leafCount = Math.max(1, nextSlot);

  // Pass 2: every internal node's horizontal slot is the average of its
  // children's -- the classic "a parent centers itself over its subtree"
  // dendrogram rule, resolved bottom-up and memoized per key.
  const slot = new Map();
  function resolveSlot(key) {
    if (slot.has(key)) return slot.get(key);
    let value;
    if (leafSlot.has(key)) {
      value = leafCount > 1 ? leafSlot.get(key) / (leafCount - 1) : 0.5;
    } else {
      const kids = children.get(key) ?? [];
      value = kids.reduce((sum, child) => sum + resolveSlot(child), 0) / kids.length;
    }
    slot.set(key, value);
    return value;
  }
  resolveSlot(rootKey);

  const span = 100 - MARGIN_PERCENT * 2;
  const depthSpan = Math.max(1, maxDepth);
  const positions = new Map();
  for (const [key, node] of nodes) {
    positions.set(key, {
      x: MARGIN_PERCENT + resolveSlot(key) * span,
      y: MARGIN_PERCENT + (node.depth / depthSpan) * span,
    });
  }
  return positions;
}
