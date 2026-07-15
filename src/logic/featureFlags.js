// ============================================================================
// logic/featureFlags.js
// ----------------------------------------------------------------------------
// A homemade, deliberately dumb feature-flag mechanism: a hardcoded
// constant, not a remote/async system. To launch Ghost Outline for real
// players, flip this to `true` and deploy -- that IS the rollout mechanism.
// No PostHog Feature Flags product, no network round-trip, no "flags
// haven't loaded yet" race: this app's traffic doesn't need a gradual %
// rollout, and every player gets the same value the instant a build ships.
// ============================================================================

export const GHOST_OUTLINE_ENABLED = false;
