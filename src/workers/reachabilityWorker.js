// ============================================================================
// workers/reachabilityWorker.js
// ----------------------------------------------------------------------------
// Answers one question, live, off the main thread: "from the board's CURRENT
// position, is a Genius result (matching this puzzle's par exactly) still
// reachable?" Backs the opt-in "Genius still reachable" indicator (see
// composables/useReachabilityIndicator.js) -- entirely optional, and only
// ever spun up when a player has turned that feature on.
//
// Unlike workers/puzzleAnalysisWorker.js (a one-shot worker, terminated
// after a single heavy admin-only analysis), this worker lives for an
// entire round: it's `init`-ed once with the board's move list and the
// puzzle's known par, builds ONE solver instance, and then answers many
// cheap `check` messages against it as the player moves -- each move
// removes pegs, which only ever shrinks the remaining search space, so the
// solver's memo (see logic/solver.js) makes each successive check cheaper
// than the last.
//
// It only needs a yes/no answer, not the true best-possible outcome, so
// `init` passes `targetFloor: targetTotal` -- the solver can stop searching
// a branch the instant it proves "par or better" is reachable, instead of
// continuing to look for something even better that this feature doesn't
// care about (see logic/solver.js's createSolver for the full explanation).
//
// Message protocol:
//   in:  { type: 'init', moves, cellCount, colorCount, targetTotal, nodeBudget }
//   in:  { type: 'check', masks, requestId }
//   out: { type: 'result', requestId, reachable, nodesVisited }
//   out: { type: 'unavailable', requestId }  -- this round's node budget is spent
//   out: { type: 'error', requestId, message }
// ============================================================================

import { createSolver, SolverBudgetExceededError } from '../logic/solver.js';

let solver = null;
let targetTotal = null;
// Once one `check` exceeds the round's node budget, every later call would
// immediately re-throw the same error (findBest's node counter never
// resets mid-round) -- so there's no point re-entering the solver at all;
// just answer 'unavailable' for the rest of this round.
let budgetExceeded = false;

self.onmessage = (event) => {
  const message = event.data;

  if (message.type === 'init') {
    solver = createSolver(message.moves, message.cellCount, {
      nodeBudget: message.nodeBudget,
      targetFloor: message.targetTotal,
    });
    targetTotal = message.targetTotal;
    budgetExceeded = false;
    return;
  }

  if (message.type === 'check') {
    const { masks, requestId } = message;

    if (!solver) {
      self.postMessage({ type: 'error', requestId, message: 'reachabilityWorker received a check before init.' });
      return;
    }

    if (budgetExceeded) {
      self.postMessage({ type: 'unavailable', requestId });
      return;
    }

    try {
      const { minPegs } = solver.findBest(masks);
      self.postMessage({ type: 'result', requestId, reachable: minPegs <= targetTotal, nodesVisited: solver.getNodesVisited() });
    } catch (error) {
      if (error instanceof SolverBudgetExceededError) {
        budgetExceeded = true;
        self.postMessage({ type: 'unavailable', requestId });
      } else {
        self.postMessage({ type: 'error', requestId, message: error.message });
      }
    }
  }
};
