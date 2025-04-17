## [YYYY-MM-DD] Pulse-Limited Growth Refactor & Grid Sizing Fix

- Refactored GOLSurvival.jsx to implement pulse-limited, pulse-leads-growth mechanics:
  - Each tendril now tracks a `growthRemaining` counter, set to `GROWTH_FACTOR` at each pulse emission.
  - Growth is performed inline in `propagateSignal` as the signal reaches the tip, up to the quota per pulse.
  - The signal visually leads the tendril, and growth is capped per pulse.
  - Removed the old growth loop in `triggerGrowthAtTips` (now bypassed).
- Converted `tryGrowTendril` and `attemptBranching` to hoisted function declarations to resolve initialization order errors.
- Grid and canvas sizing now snap to the nearest even multiple of `CELL_SIZE` to ensure uniform cell thickness and avoid visual artefacts.
- Cleaned up the render loop to remove redundant growth triggers.
- Added/updated inline comments for clarity and maintainability.

Rationale: This update ensures tendril growth is visually and mechanically capped per pulse, fixes grid artefacts, and improves code clarity and robustness.
