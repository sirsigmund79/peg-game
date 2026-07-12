// ============================================================================
// logic/attemptBoundary.js
// ----------------------------------------------------------------------------
// One question, answered in one place: when composables/useGame.js's reset()
// is called, did it just end a live attempt, or was the attempt already over?
//
// There are two Reset entry points in the UI that both call the same
// game.reset() (see components/Controls.vue and components/ResultFooter.vue):
//   - Controls' Reset only renders while the round is still live
//     (`v-if="!game.roundOver"`) -- pressing it IS the player giving up
//     mid-attempt, which ends that attempt.
//   - ResultFooter's Reset ("play again") only renders once the round is
//     already over -- that attempt already ended the moment the round
//     became unwinnable (see useGame.js's jump(), which records the
//     playthrough right then). This Reset just clears the board for a new
//     attempt; counting it again would double-count one playthrough as two.
//
// isGiveUpReset() must be called with `roundOverBeforeReset` read BEFORE
// reset() mutates any state -- it's the one signal that distinguishes the
// two cases above.
// ============================================================================

/**
 * @param {{roundOverBeforeReset: boolean, moveCount: number}} attempt
 *   - roundOverBeforeReset: whether the round had already reached a terminal
 *     state (no legal moves left) at the moment Reset was pressed
 *   - moveCount: how many moves had been made in the current attempt
 * @returns {boolean} true if this Reset ends a still-live attempt (a "give
 *   up") and should count as a playthrough; false if the attempt already
 *   ended (a "play again") or nothing happened yet (an idle Reset with no
 *   moves made -- not a meaningful attempt to end).
 */
export function isGiveUpReset({ roundOverBeforeReset, moveCount }) {
  return !roundOverBeforeReset && moveCount > 0;
}
