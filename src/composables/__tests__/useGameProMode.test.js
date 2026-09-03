// ============================================================================
// composables/__tests__/useGameProMode.test.js
// ----------------------------------------------------------------------------
// Covers the one thing about Pro mode that can lie in public: `proRound`, the
// flag services/viral.js turns into the share text's "Pro mode — no Undo"
// line. Everything here drives the real game loop -- selectHole() twice per
// jump, exactly as a tap does -- rather than poking at state directly, since
// the whole question is what a sequence of player actions adds up to.
//
// The cases that matter are the dishonest ones: flipping the toggle after the
// fact must not buy a claim the board didn't earn, and an Undo must not be
// erasable by turning Pro on afterwards.
// ============================================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { useGame } from '../useGame.js';
import { useProMode } from '../useProMode.js';
import { getTodaysPuzzle } from '../../logic/daily.js';
import { findLegalMoves } from '../../logic/rules.js';

const { setEnabled } = useProMode();

/** Plays one legal jump the way a tap does. @returns {boolean} whether there was one to play. */
function playOneJump(game) {
  const [move] = findLegalMoves(game.state.masks, game.geometry.moves);
  if (!move) return false;
  game.selectHole(move.from);
  game.selectHole(move.to);
  return true;
}

/** Plays until the board has no legal move left, ending the round. */
function playToTheEnd(game) {
  // Bounded so a bug here fails as a failed expectation rather than a hang.
  for (let guard = 0; guard < 200; guard += 1) {
    if (!playOneJump(game)) return;
  }
  throw new Error('board never ran out of moves');
}

function freshGame() {
  return useGame(getTodaysPuzzle());
}

beforeEach(() => {
  window.localStorage.clear();
  setEnabled(false);
});

describe('useGame proRound', () => {
  it('is false for a round played with Undo available', () => {
    const game = freshGame();
    playToTheEnd(game);
    expect(game.roundOver).toBe(true);
    expect(game.proRound).toBe(false);
  });

  it('is true for a round played entirely in Pro mode', () => {
    setEnabled(true);
    const game = freshGame();
    playToTheEnd(game);
    expect(game.proRound).toBe(true);
  });

  it('is true when Pro is switched on after the board loads but before the first jump', () => {
    // The ordinary way anyone starts a Pro round: open the puzzle, flip the
    // switch, then play. Nothing may be decided before that first jump.
    const game = freshGame();
    setEnabled(true);
    playToTheEnd(game);
    expect(game.proRound).toBe(true);
  });

  it('is false when Pro is switched on part-way through', () => {
    const game = freshGame();
    playOneJump(game);
    setEnabled(true);
    playToTheEnd(game);
    expect(game.proRound).toBe(false);
  });

  it('is false when Pro is switched on only at the end, once the board is done', () => {
    const game = freshGame();
    playToTheEnd(game);
    setEnabled(true);
    expect(game.proRound).toBe(false);
  });

  it('stays true when Pro is switched off after the board is done', () => {
    // The round was played with no Undo available start to finish. Flipping
    // the switch on the result screen doesn't take that back.
    setEnabled(true);
    const game = freshGame();
    playToTheEnd(game);
    setEnabled(false);
    expect(game.proRound).toBe(true);
  });

  it('is false for a round that used Undo, however the toggle ends up', () => {
    const game = freshGame();
    playOneJump(game);
    playOneJump(game);
    game.undo();
    setEnabled(true);
    playToTheEnd(game);
    expect(game.proRound).toBe(false);
  });

  it('does not let an Undo be laundered by undoing all the way back', () => {
    const game = freshGame();
    playOneJump(game);
    game.undo();
    expect(game.state.moveCount).toBe(0); // back to a board that looks untouched
    setEnabled(true);
    playToTheEnd(game);
    expect(game.proRound).toBe(false);
  });

  it('gives a Reset attempt a clean slate', () => {
    const game = freshGame();
    playOneJump(game);
    game.undo();
    game.reset();
    setEnabled(true);
    playToTheEnd(game);
    expect(game.proRound).toBe(true);
  });

  it('re-reads the toggle on each Reset attempt rather than latching for the day', () => {
    setEnabled(true);
    const game = freshGame();
    playToTheEnd(game);
    expect(game.proRound).toBe(true);
    game.reset();
    setEnabled(false);
    playToTheEnd(game);
    expect(game.proRound).toBe(false);
  });

  it('reports the mode the board was played with after a reload, not the toggle', () => {
    setEnabled(true);
    playToTheEnd(freshGame());
    // A reload is a fresh useGame() over the same persisted round -- and the
    // player has since flipped the switch the other way.
    setEnabled(false);
    const resumed = freshGame();
    expect(resumed.roundOver).toBe(true);
    expect(resumed.proRound).toBe(true);
  });

  it('does not claim Pro on a resumed round that was not played in it', () => {
    playToTheEnd(freshGame());
    setEnabled(true);
    expect(freshGame().proRound).toBe(false);
  });
});
