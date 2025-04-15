import React, { useRef, useEffect, useState } from 'react';

// --- Simulation Constants (Defaults) ---
const CELL_SIZE = 4;
const NUM_SOURCES = 2;
const GROWTH_STEP = 1; // How many cells to grow per signal arrival
const DEFAULT_SIGNAL_INTERVAL = 30; // Frames between signal emissions
const DEFAULT_BRANCH_CHANCE = 0.15;
const DEFAULT_FADE_SPEED = 0.005; // Slow fade speed
const DEFAULT_PULSE_SPEED = 2; // Default cells per second pulse travels
const FLASH_DURATION_FRAMES = 15;
const MAX_BRANCH_ATTEMPTS = 5; // Reduce attempts to avoid hangs
const SOURCE_REGENERATION_DELAY = 120; // Increase delay
const MIN_PATH_LENGTH_FOR_BRANCHING = 5; // Increase slightly
const BRANCH_ADJACENCY_IMMUNITY_STEPS = 20; // Increased from 5 to 20
const MAX_CELL_AGE = 600; // Increased from 200 to 600 for longer color transition
const MIN_CONDUCTIVITY = 0.3; // Decreased from 0.5 to 0.3 for slower young cells
const MAX_CONDUCTIVITY = 3.0; // Increased from 2.0 to 3.0 for faster old cells
const PULSE_VISIBILITY = 2.5; // Controls how visible pulses are

// --- Colors (using your palette) ---
const SOURCE_COLOR = '#6366F1';
const BACKGROUND_COLOR = '#000000';
const GRID_COLOR = '#374151'; // Unused currently
const OLD_TENDRIL_COLOR = '#1E3A8A'; // Navy Blue for oldest segments
const YOUNG_TENDRIL_COLOR = '#F59E0B'; // Orange for newest growth
const SIGNAL_COLOR = '#FFFFFF'; // White for signal pulse
const BRANCH_POINT_COLOR = '#FFFFFF'; // White for temp branch points (could update this)
const FLASH_COLOR = '#FFFFFF';
const CONNECTION_COLOR = '#F59E0B';
const FADING_COLOR_INTERPOLATE = true; // Use color interpolation for fading

// --- Directions ---
// Absolute Directions (Indices 0-7)
const DIRECTIONS = [
  { dx: -1, dy: -1, index: 0, name: 'TL' }, { dx: 0, dy: -1, index: 1, name: 'T' }, { dx: 1, dy: -1, index: 2, name: 'TR' },
  { dx: -1, dy: 0, index: 3, name: 'L' }, /* Center */ { dx: 1, dy: 0, index: 4, name: 'R' },
  { dx: -1, dy: 1, index: 5, name: 'BL' }, { dx: 0, dy: 1, index: 6, name: 'B' }, { dx: 1, dy: 1, index: 7, name: 'BR' },
];
// Relative Directions (for UI and Logic)
const RELATIVE_DIRECTIONS = {
  FORWARD_LEFT: 'FL', FORWARD: 'F', FORWARD_RIGHT: 'FR',
  LEFT: 'L', RIGHT: 'R',
  BACKWARD_LEFT: 'BL', BACKWARD: 'B', BACKWARD_RIGHT: 'BR',
};
// Map Relative Direction Name to UI Grid Index (0-8, skipping center 4)
const RELATIVE_TO_UI_INDEX = {
  [RELATIVE_DIRECTIONS.FORWARD_LEFT]: 0, [RELATIVE_DIRECTIONS.FORWARD]: 1, [RELATIVE_DIRECTIONS.FORWARD_RIGHT]: 2,
  [RELATIVE_DIRECTIONS.LEFT]: 3, /* Center */ [RELATIVE_DIRECTIONS.RIGHT]: 5,
  [RELATIVE_DIRECTIONS.BACKWARD_LEFT]: 6, [RELATIVE_DIRECTIONS.BACKWARD]: 7, [RELATIVE_DIRECTIONS.BACKWARD_RIGHT]: 8,
};
// Map UI Grid Index back to Relative Direction Name
const UI_INDEX_TO_RELATIVE = Object.fromEntries(Object.entries(RELATIVE_TO_UI_INDEX).map(([k, v]) => [v, k]));

// --- Helper Functions ---
let tendrilCounter = 0;
const getUniqueTendrilId = (sourceId) => `t-${sourceId}-${tendrilCounter++}`;
const getRandomInt = (max) => Math.floor(Math.random() * max);

// Helper for hex parsing
const parseHex = (hex) => {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return [r, g, b];
};

// --- LocalStorage Helpers ---
const STORAGE_KEY = 'gameOfLifeSettings';

const loadSettingsFromLocalStorage = () => {
  try {
    const storedSettings = localStorage.getItem(STORAGE_KEY);
    if (storedSettings) {
      const parsed = JSON.parse(storedSettings);
      // Add validation/migration logic here if settings structure changes
      console.log("Loaded settings from localStorage:", parsed);
      return parsed;
    }
  } catch (error) {
    console.error("Error loading settings from localStorage:", error);
  }
  console.log("No valid settings found in localStorage, using defaults.");
  return null; // Return null if nothing valid found
};

const saveSettingsToLocalStorage = (settings) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    // console.log("Saved settings to localStorage:", settings); // Optional: log saving
  } catch (error) {
    console.error("Error saving settings to localStorage:", error);
  }
};

const getDirectionIndex = (dx, dy) => {
    const normDx = Math.sign(dx);
    const normDy = Math.sign(dy);
    if (normDx === 0 && normDy === 0) return -1;
    const dir = DIRECTIONS.find(d => d.dx === normDx && d.dy === normDy);
    return dir ? dir.index : -1;
};

const getLastMoveDirection = (tendril) => {
  const pathLength = tendril.path.length;
  if (pathLength < 2) return { dx: 0, dy: -1 }; // Default: Assume initial up
  const lastPoint = tendril.path[pathLength - 1];
  const prevPoint = tendril.path[pathLength - 2];
  return { dx: Math.sign(lastPoint.x - prevPoint.x), dy: Math.sign(lastPoint.y - prevPoint.y) };
};

// Converts a relative direction (like 'LEFT') to absolute {dx, dy} based on the tendril's last move
const relativeToAbsolute = (relDir, lastMoveDir) => {
  const { dx: lastDx, dy: lastDy } = lastMoveDir;
  if (lastDx === 0 && lastDy === 0) return { dx: 0, dy: -1 }; // Handle no movement case

  switch (relDir) {
      case RELATIVE_DIRECTIONS.FORWARD: return { dx: lastDx, dy: lastDy };
      case RELATIVE_DIRECTIONS.BACKWARD: return { dx: -lastDx, dy: -lastDy };
      case RELATIVE_DIRECTIONS.LEFT: return { dx: lastDy, dy: -lastDx }; // Rotate -90 deg
      case RELATIVE_DIRECTIONS.RIGHT: return { dx: -lastDy, dy: lastDx }; // Rotate +90 deg
      // Diagonals (ensure normalization if needed, but signs are enough for index lookup)
      case RELATIVE_DIRECTIONS.FORWARD_LEFT: return { dx: lastDx + lastDy, dy: lastDy - lastDx };
      case RELATIVE_DIRECTIONS.FORWARD_RIGHT: return { dx: lastDx - lastDy, dy: lastDy + lastDx };
      case RELATIVE_DIRECTIONS.BACKWARD_LEFT: return { dx: -lastDx + lastDy, dy: -lastDy - lastDx };
      case RELATIVE_DIRECTIONS.BACKWARD_RIGHT: return { dx: -lastDx - lastDy, dy: -lastDy + lastDx };
      default: return null;
  }
};

// Selects neighbor based on weights applied to relative directions
const weightedRandomSelect = (options) => {
  const validOptions = options.filter(o => o.weight > 0);
  const totalWeight = validOptions.reduce((sum, option) => sum + option.weight, 0);
  if (totalWeight <= 0) {
      return validOptions.length > 0 ? validOptions[Math.floor(Math.random() * validOptions.length)].item : null;
  }
  let random = Math.random() * totalWeight;
  for (const option of validOptions) {
      if (random < option.weight) return option.item;
      random -= option.weight;
  }
  return validOptions.length > 0 ? validOptions[validOptions.length - 1].item : null; // Fallback
};

// Utility to interpolate colors based on t (0-1)
const interpolateColors = (color1Hex, color2Hex, t) => {
    // Convert hex to RGB
    const parseHex = (hex) => {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [r, g, b];
    };

    const [r1, g1, b1] = parseHex(color1Hex);
    const [r2, g2, b2] = parseHex(color2Hex);

    // Interpolate RGB values
    const r = Math.round(r1 + (r2 - r1) * t);
    const g = Math.round(g1 + (g2 - g1) * t);
    const b = Math.round(b1 + (b2 - b1) * t);

    // Convert back to hex
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
};

// Age-based color calculation
const getColorFromAge = (age) => {
    const normalizedAge = Math.min(age / MAX_CELL_AGE, 1); // Cap at 1
    return interpolateColors(YOUNG_TENDRIL_COLOR, OLD_TENDRIL_COLOR, normalizedAge);
};

// Age-based conductivity calculation
const getConductivityFromAge = (age) => {
    const normalizedAge = Math.min(age / MAX_CELL_AGE, 1); // Cap at 1
    return MIN_CONDUCTIVITY + normalizedAge * (MAX_CONDUCTIVITY - MIN_CONDUCTIVITY);
};

// --- Main Component ---
const GameOfLifeCanvas = () => {
  const canvasRef = useRef(null);
  const gridRef = useRef([]);
  const sourcesRef = useRef([]);
  const tendrilsRef = useRef([]);
  const connectionsRef = useRef([]);
  const frameCountRef = useRef(0);
  const animationFrameIdRef = useRef(null);
  const lastSignalEmitTimeRef = useRef(0); // Add ref for time tracking
  const currentTimeRef = useRef(0); // Add ref for current frame time
  const [error, setError] = useState(null);
  const gridDimensions = useRef({ width: 0, height: 0 });

  // --- State for Simulation Parameters (with localStorage loading) ---
  const initialSettings = loadSettingsFromLocalStorage();

  const [signalFrequency, setSignalFrequency] = useState(initialSettings?.signalFrequency ?? 1.0); // Default 1 Hz
  const [branchChance, setBranchChance] = useState(initialSettings?.branchChance ?? 0.1); // 10% default
  const [fadeSpeed, setFadeSpeed] = useState(initialSettings?.fadeSpeed ?? DEFAULT_FADE_SPEED);
  const [pulseSpeed, setPulseSpeed] = useState(initialSettings?.pulseSpeed ?? DEFAULT_PULSE_SPEED); // Cells per second
  const [directionWeights, setDirectionWeights] = useState(initialSettings?.directionWeights ?? [0.8, 2.5, 0.8, 0.3, 0, 0.3, 0.1, 0.1, 0.1]);
  const sourceStatesRef = useRef({}); // Tracks regeneration status

  // Ref for current simulation parameters
  const simParamsRef = useRef({ signalFrequency, branchChance, fadeSpeed, pulseSpeed, directionWeights });
  useEffect(() => {
    const currentSettings = { signalFrequency, branchChance, fadeSpeed, pulseSpeed, directionWeights };
    simParamsRef.current = currentSettings;
    saveSettingsToLocalStorage(currentSettings);
  }, [signalFrequency, branchChance, fadeSpeed, pulseSpeed, directionWeights]);

  // --- Core Simulation Logic ---

  // Utility: Check bounds
  const isWithinBounds = (x, y) => {
    return x >= 0 && x < gridDimensions.current.width && y >= 0 && y < gridDimensions.current.height;
  };

  // Utility: Wrapper for safe execution
  const safeExecute = (fn, ...args) => {
    if (error) return null; // Don't execute if already in error state
    try { return fn(...args); }
    catch (e) {
      console.error("Simulation error:", e.message, e.stack);
      setError(`Runtime Error: ${e.message}`);
      return null;
    }
  };

  // Find tendril by ID
  const findTendrilById = (id) => tendrilsRef.current.find(t => t.id === id);

  // Get Neighbors (simplified, no adjacency radius needed here)
   const getNeighbors = (x, y, currentSourceId) => {
        const neighbors = { empty: [], collision: [], selfCollision: [] };
        const absoluteDirections = [
            [-1,-1], [0,-1], [1,-1],
            [-1, 0],         [1, 0],
            [-1, 1], [0, 1], [1, 1]
        ];

        for (const [dx, dy] of absoluteDirections) {
            const nx = x + dx;
            const ny = y + dy;

            if (!isWithinBounds(nx, ny)) continue;

            const cell = gridRef.current[ny]?.[nx];
            if (!cell) continue;

            if (cell.type === 'empty') {
                neighbors.empty.push({ x: nx, y: ny });
            } else if (cell.type === 'tendril' || cell.type === 'source') {
                if (cell.sourceId === currentSourceId) {
                    // Self-collision/overlap check happens later
                    neighbors.selfCollision.push({ x: nx, y: ny });
                } else {
                    // Collision with another source's tendril
                     const existingConnection = connectionsRef.current.some(conn =>
                        (conn.sourceId1 === currentSourceId && conn.sourceId2 === cell.sourceId) ||
                        (conn.sourceId1 === cell.sourceId && conn.sourceId2 === currentSourceId)
                    );
                    if (!existingConnection) {
                         neighbors.collision.push({ x: nx, y: ny, otherSourceId: cell.sourceId, otherTendrilId: cell.tendrilId });
                    }
                }
            }
        }
        return neighbors;
    };

  // Adjacency Check (more lenient for branches)
    const checkAdjacencyPenalty = (tendril, neighbor, currentHead, previousCell) => {
        const isBranch = tendril.isBranch || tendril.isRegenerated;
        const age = frameCountRef.current - (tendril.creation || 0);

        // Immunity for young branches - INCREASED from 5 to 20 (matches the constant)
        if (isBranch && age < BRANCH_ADJACENCY_IMMUNITY_STEPS) {
            // console.log(`Frame ${frameCountRef.current}: Branch ${tendril.id} has immunity from adjacency checks. Age: ${age}`);
            return false; // Young branches are immune to adjacency checks
        }

        // After immunity (or for main tendrils), check for problematic adjacency
        const adjacentCellsToCheck = [ [-1,-1], [0,-1], [1,-1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1] ];

        for (const [adjDx, adjDy] of adjacentCellsToCheck) {
            const checkX = neighbor.x + adjDx;
            const checkY = neighbor.y + adjDy;

            // Skip checking against the head or the cell just vacated
            if ((checkX === currentHead.x && checkY === currentHead.y) ||
                (previousCell && checkX === previousCell.x && checkY === previousCell.y)) continue;

            // Check if the adjacent cell is part of this tendril's path
            const isAdjacentToSelf = tendril.path.some(p => p.x === checkX && p.y === checkY);

            if (isAdjacentToSelf) {
                 // For branches after immunity, only immediate self-overlap counts
                 if (isBranch) {
                     if (checkX === neighbor.x && checkY === neighbor.y){
                         console.log(`Branch ${tendril.id} blocked by self-overlap at (${neighbor.x},${neighbor.y})`);
                         return true;
                     }
                     // More lenient for branches - we only really care about direct overlaps
                     return false;
                 } else {
                     // For main tendrils, be slightly more restrictive
                      console.log(`Main tendril ${tendril.id} blocked by adjacency at (${neighbor.x},${neighbor.y}) to (${checkX},${checkY})`);
                     return true;
                 }
            }
        }
        return false; // No penalty
    };


  // --- Signal Logic ---
    const emitSignal = () => {
        console.log(`Frame ${frameCountRef.current}: Emitting signal from sources...`);
        let emittedCount = 0;

        sourcesRef.current.forEach(source => {
            const rootTendrils = tendrilsRef.current.filter(t =>
                t.sourceId === source.id && t.path.length > 0 &&
                t.path[0].x === source.x && t.path[0].y === source.y &&
                (t.state === 'growing' || t.state === 'connected') && t.signalState === 'idle'
            );

            if (rootTendrils.length === 0) {
                console.log(`No active root tendrils for source ${source.id}`);
            } else {
                rootTendrils.forEach(tendril => {
                    console.log(`Emitting signal for Tendril ${tendril.id} from source ${source.id}. Path length: ${tendril.path.length}`);
                    tendril.signalState = 'propagating';
                    tendril.signalPosition = 0;
                    tendril.fractionalPos = 0;
                    emittedCount++;
                });
            }
        });

        // Log emission summary
        if (emittedCount > 0) {
            console.log(`Emitted signals for ${emittedCount} tendrils.`);
        } else {
            console.log(`WARNING: No signals were emitted!`);
        }
    };

    const propagateSignal = (deltaTime = 16.67) => { // Default to ~60 FPS if not specified
        const newlyReachedTips = new Set();
        const signalsToUpdate = [];
        const basePulseSpeed = simParamsRef.current.pulseSpeed; // Base speed in cells/second

        tendrilsRef.current.forEach(tendril => {
            if (tendril.signalState !== 'propagating') return;

            const currentSignalPos = tendril.signalPosition;
            const pathLength = tendril.path.length;

            if (currentSignalPos >= pathLength - 1) {
                // Already at the end
                signalsToUpdate.push({ tendrilId: tendril.id, nextState: 'reached_tip', nextPos: pathLength - 1 });
                newlyReachedTips.add(tendril.id);
                return;
            }

            // Get the current cell in the path
            const currentPathPoint = tendril.path[currentSignalPos];
            if (!currentPathPoint) return;

            // Get cell from grid to check its age
            const cell = gridRef.current[currentPathPoint.y]?.[currentPathPoint.x];
            if (!cell) return;

            // Calculate conductivity multiplier based on cell age
            const conductivity = getConductivityFromAge(cell.age);

            // Calculate how far signal should travel this frame
            // Adjusted speed multiplier for better visualization on different machines
            const cellsToTravel = basePulseSpeed * conductivity * (deltaTime / 1000);

            // Fractional position tracking for smooth movement
            const fractionalPos = tendril.fractionalPos || currentSignalPos;
            const newFractionalPos = fractionalPos + cellsToTravel;

            // Convert to integer position for actual rendering and checks
            const newIntPos = Math.floor(newFractionalPos);

            // Important! Check for branch points between the current position and the next position
            if (newIntPos > currentSignalPos) {
                // Check each point we're moving through for branch points
                for (let checkPos = currentSignalPos + 1; checkPos <= newIntPos && checkPos < pathLength; checkPos++) {
                    const checkPoint = tendril.path[checkPos];
                    if (!checkPoint) continue;

                    const gridCell = gridRef.current[checkPoint.y]?.[checkPoint.x];
                    if (gridCell?.isBranchPoint) {
                        // This is a branch point! Try to propagate to any branches
                        propagateSignalToBranches(tendril, checkPoint, checkPos);
                    }
                }
            }

            // Ensure we don't exceed path length
            const nextPos = Math.min(newIntPos, pathLength - 1);

            // Store fractional position for next frame's calculation
            const nextState = nextPos >= pathLength - 1 ? 'reached_tip' : 'propagating';

            signalsToUpdate.push({
                tendrilId: tendril.id,
                nextState: nextState,
                nextPos: nextPos,
                fractionalPos: newFractionalPos
            });

            if (nextState === 'reached_tip') {
                newlyReachedTips.add(tendril.id);
            }
        });

        // Helper function to propagate signals to branches
        function propagateSignalToBranches(tendril, branchPoint, positionInPath) {
            const gridCell = gridRef.current[branchPoint.y]?.[branchPoint.x];
            if (!gridCell || !gridCell.isBranchPoint) return;

            const allTendrilIds = (gridCell.tendrilId || '').split(',');
            console.log(`Found branch point at (${branchPoint.x},${branchPoint.y}) with tendril IDs: ${allTendrilIds.join(', ')}`);

            allTendrilIds.forEach(branchTendrilId => {
                // Skip propagating to self
                if (branchTendrilId === tendril.id) return;

                const branchTendril = findTendrilById(branchTendrilId);
                if (!branchTendril) return;

                // Skip if branch is not active or already has a signal
                if (branchTendril.state !== 'growing' && branchTendril.state !== 'connected') return;
                if (branchTendril.signalState !== 'idle') return;

                // Find where the branch point is in the branch's path
                const branchPointIndexInBranch = branchTendril.path.findIndex(p =>
                    p.x === branchPoint.x && p.y === branchPoint.y
                );

                if (branchPointIndexInBranch === -1) {
                    // Try approximate matching
                    const approximateIndex = branchTendril.path.findIndex(p =>
                        Math.abs(p.x - branchPoint.x) <= 1 && Math.abs(p.y - branchPoint.y) <= 1
                    );

                    if (approximateIndex !== -1) {
                        console.log(`Propagating signal to branch ${branchTendril.id} at approximate position ${approximateIndex}`);
                        branchTendril.signalState = 'propagating';
                        branchTendril.signalPosition = approximateIndex;
                        branchTendril.fractionalPos = approximateIndex;
                    }
                } else {
                    console.log(`Propagating signal to branch ${branchTendril.id} at position ${branchPointIndexInBranch}`);
                    branchTendril.signalState = 'propagating';
                    branchTendril.signalPosition = branchPointIndexInBranch;
                    branchTendril.fractionalPos = branchPointIndexInBranch;
                }
            });
        }

        // Apply all the signal updates
        signalsToUpdate.forEach(({ tendrilId, nextState, nextPos, fractionalPos }) => {
            const tendril = findTendrilById(tendrilId);
            if (tendril) {
                tendril.signalState = nextState;
                tendril.signalPosition = nextPos;
                tendril.fractionalPos = fractionalPos;
            }
        });

        return newlyReachedTips;
    };

  // --- Growth & Branching Logic ---
    const triggerGrowthAtTips = (tendrilIds) => {
        if (tendrilIds.size === 0) return;
        console.log(`Frame ${frameCountRef.current}: Triggering growth for tips:`, Array.from(tendrilIds));

        // Track tendril state changes for diagnostics
        let growthAttempts = 0;
        let successfulGrowth = 0;
        let blockedTips = 0;

        tendrilIds.forEach(tendrilId => {
            const tendril = findTendrilById(tendrilId);
            if (!tendril) return;

            // Verify tip can grow (must be in 'growing' state and have a signal at its tip)
            const isGrowing = tendril.state === 'growing';
            const hasSignalAtTip = tendril.signalState === 'reached_tip' &&
                                  tendril.signalPosition === tendril.path.length - 1;

            if (isGrowing && hasSignalAtTip) {
                growthAttempts++;
                console.log(`  -> Attempting growth for Tendril ${tendrilId}`);

                // Try to grow the tendril
                const prePathLength = tendril.path.length;
                safeExecute(tryGrowTendril, tendril);
                const postPathLength = tendril.path.length;

                if (postPathLength > prePathLength) {
                    // Growth succeeded
                    successfulGrowth++;
                } else if (tendril.state === 'blocked') {
                    // Growth was blocked
                    blockedTips++;
                }
            } else if (tendril) {
                console.log(`  -> Skipping growth for Tendril ${tendrilId}: isGrowing=${isGrowing}, hasSignalAtTip=${hasSignalAtTip}`);
            }

            // Always reset signal state after processing tip
            if (tendril) {
                 console.log(`  -> Resetting signal state for Tendril ${tendrilId} to idle`);
                 tendril.signalState = 'idle';
                 tendril.signalPosition = -1;
                 tendril.fractionalPos = -1;
            }
        });

        // Log summary
        console.log(`Growth summary: ${growthAttempts} attempts, ${successfulGrowth} successes, ${blockedTips} blocked.`);
    };

    const tryGrowTendril = (tendril) => {
        const gridUpdates = new Map();
        const newBranches = [];
        const currentHead = tendril.path[tendril.path.length - 1];
        const previousCell = tendril.path.length > 1 ? tendril.path[tendril.path.length - 2] : null;
        const currentWeights = simParamsRef.current.directionWeights;

        if (!currentHead || tendril.state !== 'growing') {
            return;
        }

        // Boundary check
        if (currentHead.x <= 0 || currentHead.x >= gridDimensions.current.width - 1 ||
            currentHead.y <= 0 || currentHead.y >= gridDimensions.current.height - 1) {
            tendril.state = 'blocked';
            return;
        }

        const neighbors = getNeighbors(currentHead.x, currentHead.y, tendril.sourceId);
        const validEmptyNeighbors = neighbors.empty.filter(n => !(previousCell && n.x === previousCell.x && n.y === previousCell.y));
        const nonSelfNeighbors = validEmptyNeighbors.filter(n => !tendril.path.some(p => p.x === n.x && p.y === n.y));

        // Prepare weighted neighbors
        const weightedNeighbors = nonSelfNeighbors.map(neighbor => {
            const dx = neighbor.x - currentHead.x;
            const dy = neighbor.y - currentHead.y;
            const lastMoveDir = getLastMoveDirection(tendril);
            let weight = 0;

            Object.entries(RELATIVE_DIRECTIONS).forEach(([key, relDir]) => {
                const absDir = relativeToAbsolute(relDir, lastMoveDir);
                if (absDir && Math.sign(dx) === Math.sign(absDir.dx) && Math.sign(dy) === Math.sign(absDir.dy)) {
                    const uiIndex = RELATIVE_TO_UI_INDEX[relDir];
                    if (uiIndex !== undefined && currentWeights[uiIndex] !== undefined) {
                        weight = currentWeights[uiIndex];
                    }
                }
            });

            // Apply momentum
            if ((tendril.isBranch || tendril.isRegenerated) && weight > 0) {
                 const momentumFactor = Math.min(2.0, 0.8 + (tendril.path.length / 20));
                 if (Math.sign(dx) === Math.sign(lastMoveDir.dx) && Math.sign(dy) === Math.sign(lastMoveDir.dy)) {
                     weight *= momentumFactor;
                 }
             }

            // Apply adjacency penalty
            if (weight > 0 && checkAdjacencyPenalty(tendril, neighbor, currentHead, previousCell)) {
                weight = 0;
                console.log(`Frame ${frameCountRef.current}: Tendril ${tendril.id} - Adjacency penalty applied to neighbor (${neighbor.x},${neighbor.y}).`);
            }

            return { item: neighbor, weight: weight };
        }).filter(n => n.weight > 0);


        if (weightedNeighbors.length === 0) {
            console.log(`     -> Tendril ${tendril.id} blocked (no valid weighted neighbors).`);
            tendril.state = 'blocked';
            return; // Blocked
        }

        const nextCell = weightedRandomSelect(weightedNeighbors);
        // console.log(`     -> Selected next cell:`, nextCell);
        if (!nextCell) {
            console.log(`     -> Tendril ${tendril.id} blocked (weighted selection failed).`);
            tendril.state = 'blocked';
            return; // Selection failed
        }

        // Check boundary for nextCell
        if (!isWithinBounds(nextCell.x, nextCell.y)) {
             console.log(`     -> Tendril ${tendril.id} blocked (next cell out of bounds).`);
             tendril.state = 'blocked';
             return;
        }

        // *** Perform the single growth step ***
        tendril.path.push(nextCell);
        const cellColor = getColorFromAge(0); // New cells start at age 0 (orange)
        const gridCellData = {
            type: 'tendril',
            color: cellColor,
            tendrilId: tendril.id,
            sourceId: tendril.sourceId,
            opacity: tendril.opacity,
            age: 0, // Start at age 0
            creationFrame: frameCountRef.current
        };
        gridUpdates.set(`${nextCell.y}-${nextCell.x}`, gridCellData);

        // --- Branching Check (AFTER successful growth step) ---
        const branchesCreated = attemptBranching(tendril, nextCell, weightedNeighbors, nextCell, gridUpdates); // Pass nextCell as new head
        if (branchesCreated.length > 0) {
            tendrilsRef.current.push(...branchesCreated); // Add new branches to main list
        }

         // Apply grid updates atomically (important!)
         gridUpdates.forEach((update, key) => {
             const [y, x] = key.split('-').map(Number);
             if (isWithinBounds(x,y) && gridRef.current[y]?.[x]) { // Check bounds again
                 gridRef.current[y][x] = { ...gridRef.current[y][x], ...update };
             }
         });
    };

    // Attempt Branching (refactored for clarity)
     const attemptBranching = (parentTendril, headCell, weightedNeighbors, growthCell, gridUpdates) => {
        const currentBranchChance = simParamsRef.current.branchChance;
        const meetsChance = Math.random() < currentBranchChance;
        const pathLengthOk = parentTendril.path.length > MIN_PATH_LENGTH_FOR_BRANCHING;
        const neighborsOk = weightedNeighbors.length > 1; // Need alternatives
        const stateOk = parentTendril.state === 'growing';

        if (!(stateOk && pathLengthOk && neighborsOk && meetsChance)) return [];

        let potentialBranchTargets = weightedNeighbors.filter(n =>
            !(n.item.x === growthCell.x && n.item.y === growthCell.y) // Exclude main growth direction
        );
        potentialBranchTargets.sort((a, b) => b.weight - a.weight);

        if (potentialBranchTargets.length === 0) return [];

        const newBranches = [];
        let attempts = 0;
        let branchCreated = false;
        const parentDirection = getLastMoveDirection(parentTendril);

        while (!branchCreated && attempts < Math.min(MAX_BRANCH_ATTEMPTS, potentialBranchTargets.length)) {
            const targetOption = potentialBranchTargets[attempts];
            const branchTarget = targetOption.item;
            let targetWeight = targetOption.weight; // We might adjust this
            attempts++;

            // Penalize directions too similar to parent
             const targetDx = Math.sign(branchTarget.x - headCell.x);
             const targetDy = Math.sign(branchTarget.y - headCell.y);
             const isSimilarDirection = (targetDx === parentDirection.dx && targetDy === parentDirection.dy);
             if (isSimilarDirection) {
                 targetWeight *= 0.3;
                 if(targetWeight < 0.1) continue; // Skip if weight becomes negligible
             }

            // Check for space
            const emptySpaceCount = countEmptySpaceAround(branchTarget.x, branchTarget.y);
            if (emptySpaceCount < 2) continue; // Need at least 2 empty neighbors

            // Create Branch
            const branchId = getUniqueTendrilId(parentTendril.sourceId);
            const branchTendril = {
                id: branchId, sourceId: parentTendril.sourceId,
                path: [headCell, branchTarget], // Start from parent head to target
                state: 'growing', signalState: 'idle', signalPosition: -1,
                opacity: 1, isBranch: true, parentId: parentTendril.id,
                creation: frameCountRef.current
            };
            newBranches.push(branchTendril);

            // Mark Grid
            gridUpdates.set(`${branchTarget.y}-${branchTarget.x}`, {
                type: 'tendril',
                color: getColorFromAge(0), // New branch cells start at age 0 (orange)
                tendrilId: branchId,
                sourceId: parentTendril.sourceId,
                opacity: 1,
                age: 0, // Start at age 0
                creationFrame: frameCountRef.current
            });

            // Mark Branch Point
            const bpCell = gridRef.current[headCell.y]?.[headCell.x];
            const existingIds = bpCell?.tendrilId ? bpCell.tendrilId.split(',') : [];
            if (!existingIds.includes(parentTendril.id)) existingIds.push(parentTendril.id); // Ensure parent is included
            if (!existingIds.includes(branchId)) existingIds.push(branchId); // Add branch

            gridUpdates.set(`${headCell.y}-${headCell.x}`, {
                ...(bpCell || {}), // Preserve existing cell data if possible
                type: 'tendril', color: BRANCH_POINT_COLOR,
                tendrilId: existingIds.join(','), sourceId: parentTendril.sourceId,
                isBranchPoint: true, branchTime: frameCountRef.current, branchVisibleDuration: 30,
                opacity: 1 // Ensure branch point is fully opaque initially
            });

            branchCreated = true; // Exit loop once a branch is made
        }
        return newBranches;
     };

    // Helper to count empty space
    const countEmptySpaceAround = (x, y) => {
      let emptyCount = 0;
      const directions = [[-1,-1], [0,-1], [1,-1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
      for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (isWithinBounds(nx, ny) && gridRef.current[ny]?.[nx]?.type === 'empty') {
          emptyCount++;
        }
      }
      return emptyCount;
    };

  // --- Fading, Connections, Regeneration, Path Verification ---
  // (Keep existing functions: fadeTendrils, updateConnections, checkSourcesForRegeneration, regenerateTendrilFromSource, verifyPathIntegrity, verifyTendrilConnectivity)
  // Make sure verifyTendrilConnectivity uses the component-scoped isWithinBounds

  // --- Initialization Logic (Missing Functions) ---

  const initializeGrid = (width, height) => {
    gridRef.current = Array.from({ length: height }, () =>
      Array.from({ length: width }, () => ({
        type: 'empty',
        color: BACKGROUND_COLOR,
        tendrilId: null,
        sourceId: null,
        opacity: 1,
        isBranchPoint: false,
        branchTime: 0,
        connectionState: 'none', // For connection points
        age: 0, // Add age tracking
        creationFrame: 0 // Track when cell was created
      }))
    );
  };

  const placeSources = (numSources, gridWidth, gridHeight) => {
    sourcesRef.current = [];
    const placedCoords = new Set();
    const minDistance = Math.max(gridWidth, gridHeight) / (numSources + 1); // Try to space them out

    for (let i = 0; i < numSources; i++) {
      let x, y, attempts = 0;
      let tooClose = true;
      do {
        x = getRandomInt(gridWidth);
        y = getRandomInt(gridHeight);
        tooClose = false;
        for (const src of sourcesRef.current) {
          const dist = Math.sqrt(Math.pow(x - src.x, 2) + Math.pow(y - src.y, 2));
          if (dist < minDistance) {
            tooClose = true;
            break;
          }
        }
        attempts++;
      } while (tooClose && attempts < 100); // Avoid infinite loops

      const coordKey = `${x}-${y}`;
      if (!placedCoords.has(coordKey)) {
        const sourceId = `s-${i}`;
        sourcesRef.current.push({ id: sourceId, x, y });
        if (isWithinBounds(x, y)) {
          gridRef.current[y][x] = {
            type: 'source',
            color: SOURCE_COLOR,
            sourceId: sourceId,
            opacity: 1,
            age: MAX_CELL_AGE, // Sources are at max age (they're established)
            creationFrame: frameCountRef.current
          };
        }
        placedCoords.add(coordKey);
        sourceStatesRef.current[sourceId] = { state: 'active', lastActivity: 0 };
      } else {
        i--; // Try again to place this source
      }
    }
  };

  const initializeTendrils = () => {
    tendrilsRef.current = [];
    tendrilCounter = 0; // Reset counter
    sourcesRef.current.forEach(source => {
        const tendrilId = getUniqueTendrilId(source.id);
        tendrilsRef.current.push({
            id: tendrilId,
            sourceId: source.id,
            path: [{ x: source.x, y: source.y }], // Start path at the source
            state: 'growing', // Initial state
            signalState: 'idle', // Wait for first signal
            signalPosition: -1,
            opacity: 1,
            isBranch: false,
            parentId: null,
            creation: frameCountRef.current,
        });
        if (isWithinBounds(source.x, source.y)) {
             gridRef.current[source.y][source.x].tendrilId = tendrilId; // Mark source cell
        }
    });
  };

  const initializeSimulation = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parentElement = canvas.parentElement;
    if (!parentElement) {
        console.error("Canvas parent element not found for sizing.");
        setError("Canvas parent element not found.");
        return;
    }
    const { clientWidth, clientHeight } = parentElement; // Use parent dimensions

    // Adjust for high DPI screens if necessary
    const dpr = window.devicePixelRatio || 1;
    canvas.width = clientWidth * dpr;
    canvas.height = clientHeight * dpr;

    // Get context AFTER setting width/height
    const context = canvas.getContext('2d');
    if (!context) {
        console.error("Failed to get 2D context during initialization.");
        setError("Failed to get canvas context during init.");
        return;
    }
    context.scale(dpr, dpr); // Scale context

    // Use scaled dimensions for drawing logic, unscaled for grid calculation
    canvas.style.width = `${clientWidth}px`;
    canvas.style.height = `${clientHeight}px`;

    const gridWidth = Math.floor(clientWidth / CELL_SIZE);
    const gridHeight = Math.floor(clientHeight / CELL_SIZE);
    gridDimensions.current = { width: gridWidth, height: gridHeight };

    console.log(`Initializing grid: ${gridWidth}x${gridHeight} cells`);

    initializeGrid(gridWidth, gridHeight);
    placeSources(NUM_SOURCES, gridWidth, gridHeight);
    initializeTendrils();
    connectionsRef.current = []; // Reset connections
    frameCountRef.current = 0; // Reset frame count
    setError(null); // Clear previous errors
  };

  // --- Fading Logic ---
  const fadeTendrils = () => {
      const currentFadeSpeed = simParamsRef.current.fadeSpeed;
      const tendrilsToRemove = new Set();
      let fadingCount = 0;
      let cellUpdatesCount = 0; // Track grid cell updates for perf monitoring

      // If there are no fading tendrils, exit early to save CPU
      const hasFadingTendrils = tendrilsRef.current.some(t => t.state === 'fading');
      if (!hasFadingTendrils) return;

      tendrilsRef.current.forEach(tendril => {
          if (tendril.state === 'fading') {
              fadingCount++;
              const oldOpacity = tendril.opacity;
              tendril.opacity -= currentFadeSpeed;

              // Log start of fading (first time its opacity drops)
              if (oldOpacity === 1 && tendril.opacity < 1) {
                  console.log(`Frame ${frameCountRef.current}: Starting to fade Tendril ${tendril.id}. Initial opacity: ${oldOpacity.toFixed(3)}`);
              }

              if (tendril.opacity <= 0) {
                  console.log(`Frame ${frameCountRef.current}: Removing faded Tendril ${tendril.id}`);
                  tendrilsToRemove.add(tendril.id);
              } else {
                  // Update grid opacity for fading tendril path
                  tendril.path.forEach(p => {
                      if (isWithinBounds(p.x, p.y)) {
                          const cell = gridRef.current[p.y][p.x];
                          if (cell) {
                              const cellTendrilIds = cell.tendrilId?.split(',') || [];

                              // IMPORTANT: Handle branch points differently
                              if (cellTendrilIds.length > 1) {
                                  // For cells with multiple tendrils (branch points), update only this tendril's impact
                                  const fadingIds = cellTendrilIds.filter(id => {
                                      const t = findTendrilById(id);
                                      return t && t.state === 'fading';
                                  });

                                  const nonFadingIds = cellTendrilIds.filter(id => {
                                      const t = findTendrilById(id);
                                      return t && t.state !== 'fading';
                                  });

                                  // If there are still visible tendrils at this point, don't fade the cell
                                  if (nonFadingIds.length > 0) {
                                      // Branch point remains visible - don't change cell opacity
                                      cellUpdatesCount++;
                                  } else if (fadingIds.length > 0) {
                                      // All tendrils at this point are fading - use the maximum opacity
                                      let maxOpacity = 0;
                                      fadingIds.forEach(id => {
                                          const t = findTendrilById(id);
                                          if (t) maxOpacity = Math.max(maxOpacity, t.opacity);
                                      });
                                      cell.opacity = maxOpacity;
                                      cellUpdatesCount++;
                                  }
                              } else if (cell.tendrilId && cell.tendrilId.includes(tendril.id)) {
                                  // Simple case: just one tendril owns this cell
                                  cell.opacity = tendril.opacity;
                                  cellUpdatesCount++;
                              }
                          }
                      }
                  });
              }
          }
      });

      if (fadingCount > 0) {
          console.log(`Frame ${frameCountRef.current}: Processing ${fadingCount} fading tendrils. Updated ${cellUpdatesCount} grid cells.`);
      }

      if (tendrilsToRemove.size > 0) {
          console.log(`Frame ${frameCountRef.current}: Removing ${tendrilsToRemove.size} fully faded tendrils from list.`);
          // Separate into branches and non-branches for logging
          const branchCount = tendrilsRef.current.filter(t => t.isBranch && tendrilsToRemove.has(t.id)).length;
          const mainCount = tendrilsToRemove.size - branchCount;
          console.log(`  Removed tendrils: ${mainCount} main, ${branchCount} branches`);

          tendrilsRef.current = tendrilsRef.current.filter(t => !tendrilsToRemove.has(t.id));

          // Clean up grid references (more robustly)
          for (let y = 0; y < gridDimensions.current.height; y++) {
              for (let x = 0; x < gridDimensions.current.width; x++) {
                  const cell = gridRef.current[y][x];
                  if (cell && cell.tendrilId) {
                      const ids = cell.tendrilId.split(',');
                      const remainingIds = ids.filter(id => !tendrilsToRemove.has(id));
                      if (remainingIds.length === 0) {
                           // If no tendrils left, reset cell
                            if (cell.type !== 'source') { // Don't reset sources
                                 gridRef.current[y][x] = { type: 'empty', color: BACKGROUND_COLOR, tendrilId: null, sourceId: null, opacity: 1 };
                             } else {
                                 // Reset tendril ID but keep source info
                                 cell.tendrilId = null;
                             }
                      } else if (remainingIds.length < ids.length) {
                           // Update cell with remaining tendrils
                          cell.tendrilId = remainingIds.join(',');
                          // Recalculate opacity based on remaining tendrils
                          let maxOpacity = 0;
                          remainingIds.forEach(id => {
                              const t = findTendrilById(id);
                              if(t) maxOpacity = Math.max(maxOpacity, t.opacity);
                          });
                          cell.opacity = maxOpacity;
                      }
                  }
              }
          }
      }
  };

  // --- Connection Logic ---
   const updateConnections = () => {
       connectionsRef.current.forEach(conn => {
           if (conn.state === 'flashing') {
               conn.flashProgress += 1;
               if (conn.flashProgress >= FLASH_DURATION_FRAMES) {
                   conn.state = 'stable'; // End flash
                   // Ensure connected cells remain highlighted
                   const cell1 = gridRef.current[conn.y1]?.[conn.x1];
                   const cell2 = gridRef.current[conn.y2]?.[conn.x2];
                   if(cell1 && cell1.type !== 'source') cell1.type = 'connection'; // Persist connection state visually
                   if(cell2 && cell2.type !== 'source') cell2.type = 'connection';
               }
           }
           // Update grid cells for stable connections too (could be overwritten)
           if(conn.state === 'stable') {
               const cell1 = gridRef.current[conn.y1]?.[conn.x1];
               const cell2 = gridRef.current[conn.y2]?.[conn.x2];
               if(cell1 && cell1.type !== 'source') cell1.type = 'connection';
               if(cell2 && cell2.type !== 'source') cell2.type = 'connection';
           }
       });
   };


  // --- Path Verification Logic ---
  const verifyTendrilConnectivity = (tendril, sourcePos, visited) => {
      if (!tendril || visited.has(tendril.id)) {
          console.log(`Frame ${frameCountRef.current}: VerifyConn - Tendril ${tendril?.id} already visited or null.`);
          return false; // Already checked or doesn't exist
      }
      visited.add(tendril.id);

      // Young tendrils are always considered connected for integrity check
      // This prevents premature disconnection of young branches
      const age = frameCountRef.current - (tendril.creation || 0);
      if (age < BRANCH_ADJACENCY_IMMUNITY_STEPS) {
          console.log(`Frame ${frameCountRef.current}: VerifyConn - Young tendril ${tendril.id} (age ${age}) automatically verified.`);
          return true;
      }

      // Base case: Tendril starts at the source
      if (tendril.path.length > 0 && tendril.path[0].x === sourcePos.x && tendril.path[0].y === sourcePos.y) {
          console.log(`Frame ${frameCountRef.current}: VerifyConn - Tendril ${tendril.id} VERIFIED as connected (starts at source).`);
          return true;
      }

      // Logging the check for clarity
      console.log(`Frame ${frameCountRef.current}: VerifyConn - Checking connectivity for tendril ${tendril.id}, state: ${tendril.state}, isSource: ${tendril.path[0].x === sourcePos.x && tendril.path[0].y === sourcePos.y}, isBranch: ${tendril.isBranch}, parent: ${tendril.parentId}`);

      // IMPORTANT: Check tendril state immediately. If it's already fading/blocked, it's not connected
      if (tendril.state === 'fading' || tendril.state === 'removed') {
          console.log(`Frame ${frameCountRef.current}: VerifyConn - Tendril ${tendril.id} is already ${tendril.state}, therefore not connected.`);
          return false;
      }

      // If it's blocked, we still consider it connected as long as it's not too old (give it a chance)
      if (tendril.state === 'blocked' && age < MAX_CELL_AGE/2) {
          console.log(`Frame ${frameCountRef.current}: VerifyConn - Blocked tendril ${tendril.id} still considered connected (age: ${age})`);
          return true;
      }

      // Recursive case: Check if parent is connected
      if (tendril.isBranch && tendril.parentId) {
          const parentTendril = findTendrilById(tendril.parentId);
          if (!parentTendril) {
              console.log(`Frame ${frameCountRef.current}: VerifyConn - Parent ${tendril.parentId} of ${tendril.id} not found. Not connected.`);
              return false; // Parent gone
          }

          // CHECK: Is the parent already marked as fading or removed?
          if (parentTendril.state === 'fading' || parentTendril.state === 'removed') {
              console.log(`Frame ${frameCountRef.current}: VerifyConn - Parent ${parentTendril.id} of ${tendril.id} is ${parentTendril.state}. Branch not connected.`);
              return false;
          }

          // Be more lenient with connected/blocked parents
          if (parentTendril.state === 'connected' || parentTendril.state === 'blocked') {
              if (age < MAX_CELL_AGE/2) {
                  console.log(`Frame ${frameCountRef.current}: VerifyConn - Branch ${tendril.id} connected to ${parentTendril.state} parent ${parentTendril.id} (age: ${age})`);
                  return true;
              }
          }

          // Check if branch point exists in parent path
          const branchPoint = tendril.path[0]; // This should be the connection point between parent and branch
          const parentContainsBranchPoint = parentTendril.path.some(p => p.x === branchPoint.x && p.y === branchPoint.y);

          if (!parentContainsBranchPoint) {
              // More lenient - allow approximate matches
              const approxMatch = parentTendril.path.some(p =>
                  Math.abs(p.x - branchPoint.x) <= 1 && Math.abs(p.y - branchPoint.y) <= 1
              );

              if (approxMatch) {
                  console.log(`Frame ${frameCountRef.current}: VerifyConn - Found approximate branch point match for ${tendril.id}`);
                  // Since parent approximately contains branch point, check if parent is connected
                  return verifyTendrilConnectivity(parentTendril, sourcePos, visited);
              }

              console.log(`Frame ${frameCountRef.current}: VerifyConn - Parent ${parentTendril.id} doesn't contain branch point (${branchPoint.x},${branchPoint.y}) for branch ${tendril.id}. Not connected.`);
              return false;
          }

          // Recursive call: Is the PARENT connected?
          console.log(`Frame ${frameCountRef.current}: VerifyConn - Recursively checking parent ${parentTendril.id} for branch ${tendril.id}`);
          const parentConnected = verifyTendrilConnectivity(parentTendril, sourcePos, visited);

          if (parentConnected) {
              console.log(`Frame ${frameCountRef.current}: VerifyConn - Parent ${parentTendril.id} is connected, so branch ${tendril.id} is connected.`);
          } else {
              console.log(`Frame ${frameCountRef.current}: VerifyConn - Parent ${parentTendril.id} is NOT connected, so branch ${tendril.id} is NOT connected.`);
          }

          return parentConnected;
      }

      // If we get here, this is not a branch OR it's a branch without a valid parent, but doesn't start at the source
      console.log(`Frame ${frameCountRef.current}: VerifyConn - Tendril ${tendril.id} is not a branch or has no parent, and didn't reach source. Not connected.`);
      return false;
  };

  const verifyPathIntegrity = () => {
      console.log(`Frame ${frameCountRef.current}: Verifying path integrity...`);
      const allTendrils = [...tendrilsRef.current]; // Copy array as it might be modified
      const sourcesMap = new Map(sourcesRef.current.map(s => [s.id, {x: s.x, y: s.y}]));
      let disconnectedCount = 0;
      let markedFadingCount = 0;

      // Track counts before
      const beforeGrowing = allTendrils.filter(t => t.state === 'growing').length;
      const beforeFading = allTendrils.filter(t => t.state === 'fading').length;

      // For tracking tendril states by connectivity result
      const connectivityResults = { connected: [], disconnected: [] };

      allTendrils.forEach(tendril => {
          // Only verify active tendrils (growing, connected, blocked)
          if (tendril.state === 'fading' || tendril.state === 'removed') return;

          const sourcePos = sourcesMap.get(tendril.sourceId);
          if (!sourcePos) {
               console.warn(`Tendril ${tendril.id} has missing source ${tendril.sourceId}. Marking for removal.`);
               tendril.state = 'fading';
               markedFadingCount++;
               disconnectedCount++; // Treat as disconnected
               connectivityResults.disconnected.push(tendril.id);
               return; // Skip if source doesn't exist
          }

          const visited = new Set(); // Reset visited set for each tendril verification chain
          const isConnected = verifyTendrilConnectivity(tendril, sourcePos, visited);

          if (isConnected) {
              // Store this tendril as connected for logging
              connectivityResults.connected.push(tendril.id);
          } else {
              console.log(`Frame ${frameCountRef.current}: Tendril ${tendril.id} (source ${tendril.sourceId}) failed integrity check. Path length: ${tendril.path.length}. Current state: ${tendril.state}. Marking for fade.`);
              tendril.state = 'fading';
              markedFadingCount++;
              disconnectedCount++;
              connectivityResults.disconnected.push(tendril.id);

               // Mark all tendrils visited during this failed check as fading
               visited.forEach(visitedId => {
                   const t = findTendrilById(visitedId);
                   if(t && t.state !== 'fading') {
                       console.log(`   Also marking ${visitedId} as fading due to disconnection.`);
                       t.state = 'fading';
                       markedFadingCount++;
                       connectivityResults.disconnected.push(visitedId);
                   }
               });
          }
      });

      // Track counts after
      const afterGrowing = tendrilsRef.current.filter(t => t.state === 'growing').length;
      const afterFading = tendrilsRef.current.filter(t => t.state === 'fading').length;

      // Log the results
      if (disconnectedCount > 0) {
          console.log(`Integrity check complete. Found ${disconnectedCount} disconnected tendrils. Marked ${markedFadingCount} as fading this check.`);
          console.log(`Growing tendrils: ${beforeGrowing} -> ${afterGrowing}, Fading tendrils: ${beforeFading} -> ${afterFading}`);
          console.log(`Disconnected tendrils: [${connectivityResults.disconnected.join(', ')}]`);
      } else if (allTendrils.length > 0) {
          console.log(`Frame ${frameCountRef.current}: All ${allTendrils.length} active tendrils verified as connected.`);
      }

      // Check for growth stoppage (if all tendrils are blocked or fading)
      const stillGrowing = tendrilsRef.current.some(t => t.state === 'growing');
      if (!stillGrowing && allTendrils.length > 0) {
          console.log(`Frame ${frameCountRef.current}: ⚠️ WARNING: NO MORE GROWING TENDRILS. All are blocked, fading, or connected.`);
      }
  };


    // Regenerate tendril (ensure it exists)
    const regenerateTendrilFromSource = (source) => {
        const tendrilId = getUniqueTendrilId(source.id);
        const newTendril = {
            id: tendrilId,
            sourceId: source.id,
            path: [{ x: source.x, y: source.y }],
            state: 'growing',
            signalState: 'idle',
            signalPosition: -1,
            opacity: 1,
            isBranch: false, // It's a root tendril
            isRegenerated: true, // Mark as regenerated
            parentId: null,
            creation: frameCountRef.current,
        };
        tendrilsRef.current.push(newTendril);

         // Update grid cell
         if (isWithinBounds(source.x, source.y)) {
             const cell = gridRef.current[source.y][source.x];
             if (cell) {
                 const existingIds = cell.tendrilId ? cell.tendrilId.split(',') : [];
                 if (!existingIds.includes(tendrilId)) {
                     existingIds.push(tendrilId);
                     cell.tendrilId = existingIds.join(',');
                 }
                 cell.opacity = 1; // Ensure source cell is visible
             }
         }
        sourceStatesRef.current[source.id] = { state: 'active', lastActivity: frameCountRef.current };
    };


     // Check and regenerate sources (ensure it exists)
     const checkSourcesForRegeneration = () => {
        const now = frameCountRef.current;
        sourcesRef.current.forEach(source => {
            const sourceState = sourceStatesRef.current[source.id];
            // Check if source is inactive (all its tendrils are gone/fading)
            const activeTendrils = tendrilsRef.current.some(t =>
                t.sourceId === source.id && (t.state === 'growing' || t.state === 'connected' || t.state === 'blocked')
            );

            if (!activeTendrils && sourceState.state !== 'regenerating') {
                // Start regeneration cooldown if not already regenerating
                if (!sourceState.cooldownStart) {
                    sourceState.cooldownStart = now;
                }

                // Check if cooldown finished
                if (now - sourceState.cooldownStart >= SOURCE_REGENERATION_DELAY) {
                    sourceState.state = 'regenerating'; // Mark as attempting to regenerate
                    regenerateTendrilFromSource(source);
                    sourceState.cooldownStart = null; // Reset cooldown timer
                }
            } else if (activeTendrils && sourceState.state !== 'active') {
                // If tendrils became active again (e.g., connection), reset state
                 sourceState.state = 'active';
                 sourceState.lastActivity = now;
                 sourceState.cooldownStart = null; // Cancel any cooldown
            } else if(activeTendrils) {
                 sourceState.lastActivity = now; // Update last activity if active
            }
        });
    };

    // Helper function to update cell ages periodically
    const updateCellAges = () => {
        // Only update every 5 frames to save performance - CHANGED from 10 to 5
        if (frameCountRef.current % 5 !== 0) return;

        // Count how many cells were updated
        let updatedCells = 0;

        // Update ages for all non-empty cells in the grid
        for (let y = 0; y < gridDimensions.current.height; y++) {
            for (let x = 0; x < gridDimensions.current.width; x++) {
                const cell = gridRef.current[y][x];
                if (cell && cell.type !== 'empty' && cell.age < MAX_CELL_AGE) {
                    // Increase by 1 for slower color transition (was 2)
                    cell.age += 1;

                    // Only update color if it's a tendril cell (not source/connection)
                    if (cell.type === 'tendril') {
                        cell.color = getColorFromAge(cell.age);
                    }

                    updatedCells++;
                }
            }
        }
    };

  // --- Animation Loop ---
   const render = (timestamp) => { // Receive high-resolution timestamp
        const canvas = canvasRef.current; // Add check for canvas existence
        if (!canvas || error) return;

        // Track time and calculate delta time
        const prevTime = currentTimeRef.current || timestamp;
        currentTimeRef.current = timestamp; // Store current time
        const deltaTime = timestamp - prevTime; // Time since last frame in ms

        safeExecute(() => {
            frameCountRef.current++;
            const { signalFrequency: currentSignalFrequency } = simParamsRef.current;

            // Calculate time-based interval - How often should signals be emitted (in ms)
            // Direct conversion from Hz to ms interval (no hidden multiplier)
            const intervalMilliseconds = 1000 / currentSignalFrequency;
            const elapsedSinceLastEmit = currentTimeRef.current - lastSignalEmitTimeRef.current;

            // 1. Emit Signal Periodically (Time-based)
            if (elapsedSinceLastEmit >= intervalMilliseconds) {
                const actualFreq = 1000 / elapsedSinceLastEmit;
                console.log(`Frame ${frameCountRef.current}: Emitting signal at effective freq: ${actualFreq.toFixed(2)} Hz (target: ${currentSignalFrequency.toFixed(2)} Hz)`);
                emitSignal();
                lastSignalEmitTimeRef.current = currentTimeRef.current; // Update last emit time
            }

            // Every 100 frames, log active tendril counts for debugging
            if (frameCountRef.current % 100 === 0) {
                const totalTendrils = tendrilsRef.current.length;
                const growingTendrils = tendrilsRef.current.filter(t => t.state === 'growing').length;
                const blockedTendrils = tendrilsRef.current.filter(t => t.state === 'blocked').length;
                const fadingTendrils = tendrilsRef.current.filter(t => t.state === 'fading').length;
                const connectedTendrils = tendrilsRef.current.filter(t => t.state === 'connected').length;

                console.log(`Frame ${frameCountRef.current}: TENDRIL STATS - Total: ${totalTendrils}, Growing: ${growingTendrils}, Blocked: ${blockedTendrils}, Fading: ${fadingTendrils}, Connected: ${connectedTendrils}`);
            }

            // 2. Propagate Existing Signals
            const newlyReachedTips = propagateSignal(deltaTime);
            // 3. Trigger Growth at Tips Reached This Frame
            triggerGrowthAtTips(newlyReachedTips);
            // 4. Update Fading, Connections, etc.
            fadeTendrils();
            updateConnections();
            // 5. Update cell ages
            updateCellAges();
            // 6. Verify Path Integrity Periodically
            if (frameCountRef.current % 20 === 0) { // More frequent check for debugging
                verifyPathIntegrity();
            }
            // 7. Draw Everything
            drawGridAndElements(); // Call draw function

            animationFrameIdRef.current = window.requestAnimationFrame(render); // Re-enable this line!
        });
    };

  // --- Drawing Logic ---
   const drawGridAndElements = () => {
        const canvas = canvasRef.current; // Get canvas ref
        if (!canvas) {
            console.warn("drawGridAndElements called before canvas ref was ready.");
            return; // Exit if canvas isn't ready
        }
        const context = canvas.getContext('2d'); // Get context *inside* the function
        if (!context || !gridRef.current?.length) {
            console.warn("drawGridAndElements called before context or grid was ready.");
            return; // Exit if context or grid isn't ready
        }

        // Get current dimensions for drawing, respecting DPR scaling
        const { width: canvasWidth, height: canvasHeight } = canvas;
        const dpr = window.devicePixelRatio || 1;
        // Use canvas element dimensions which should already account for DPR if set correctly in init

        context.clearRect(0, 0, canvasWidth, canvasHeight);

        // 1. Draw Grid Background & Static Elements
        for (let y = 0; y < gridDimensions.current.height; y++) {
            for (let x = 0; x < gridDimensions.current.width; x++) {
                const cell = gridRef.current[y][x];
                if (!cell) continue;

                let drawColor = BACKGROUND_COLOR; // Default to background

                if (cell.type === 'source') {
                     drawColor = SOURCE_COLOR;
                } else if (cell.type === 'connection') {
                     drawColor = cell.state === 'flashing' ? FLASH_COLOR : CONNECTION_COLOR;
                } else if (cell.type === 'tendril') {
                    // Use cell's color which is based on age
                    drawColor = cell.color;

                     if (cell.isBranchPoint) {
                         const branchAge = frameCountRef.current - (cell.branchTime || 0);
                         const branchVisibleDuration = cell.branchVisibleDuration || 30;
                         if (branchAge <= branchVisibleDuration) {
                             drawColor = BRANCH_POINT_COLOR; // Highlight phase
                         } else { // Transition phase - back to age-based color
                             drawColor = cell.color;
                         }
                     } else if (cell.opacity < 1 && FADING_COLOR_INTERPOLATE) {
                          // Interpolate color for fading non-branch points
                          const cellRgb = parseHex(cell.color);
                          const bgRgb = parseHex(BACKGROUND_COLOR);

                          const r = Math.round(cellRgb[0] * cell.opacity + bgRgb[0] * (1 - cell.opacity));
                          const g = Math.round(cellRgb[1] * cell.opacity + bgRgb[1] * (1 - cell.opacity));
                          const b = Math.round(cellRgb[2] * cell.opacity + bgRgb[2] * (1 - cell.opacity));
                          drawColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0')}`;
                      }
                }

                context.fillStyle = drawColor;
                context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }

        // 2. Draw Propagating Signals (Overlay) - Enhanced for visibility
        context.globalAlpha = 1.0;
        tendrilsRef.current.forEach(tendril => {
            if (tendril.signalState === 'propagating' && tendril.signalPosition >= 0 && tendril.signalPosition < tendril.path.length) {
                // Make signal more visible by drawing multiple cells (pulse head + tail)
                const signalCoord = tendril.path[tendril.signalPosition];

                // Draw the signal at current position with enhanced brightness
                if (isWithinBounds(signalCoord.x, signalCoord.y)) {
                    context.fillStyle = SIGNAL_COLOR; // White signal color
                    context.globalAlpha = Math.min(1.0, tendril.opacity * PULSE_VISIBILITY); // Brighter for better visibility
                    context.fillRect(signalCoord.x * CELL_SIZE, signalCoord.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);

                    // Draw signal "tail" with more cells for improved visibility
                    // Draw up to 4 cells behind the signal for a longer tail
                    let tailLength = Math.min(4, tendril.signalPosition);

                    for (let i = 1; i <= tailLength; i++) {
                        const tailPos = tendril.signalPosition - i;
                        const tailCoord = tendril.path[tailPos];
                        if (isWithinBounds(tailCoord.x, tailCoord.y)) {
                            // Decrease opacity gradually for tail effect (0.8, 0.6, 0.4, 0.2)
                            context.globalAlpha = Math.min(1.0, tendril.opacity * PULSE_VISIBILITY * (1 - i * 0.2));
                            context.fillRect(tailCoord.x * CELL_SIZE, tailCoord.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                        }
                    }
                }
            }
        });
        context.globalAlpha = 1.0; // Reset global alpha
    };

  // --- Initialization and Cleanup ---
   useEffect(() => {
    const canvas = canvasRef.current;

    if (!canvas) {
      setError("Failed to get canvas element.");
      return;
    }

    const initAndStart = () => {
      safeExecute(() => {
        initializeSimulation(); // This function now handles its own context fetching and error setting
        // If initializeSimulation encountered an error, the 'error' state will be set,
        // and the effect will re-run or subsequent checks will fail.

        // Proceed only if no error has been set so far.
        if (error) {
            console.warn("Initialization failed, skipping animation start.");
            return;
        }

        emitSignal(); // Start initial signal
        // Wrap render to potentially pass context if needed, or check within render
        animationFrameIdRef.current = window.requestAnimationFrame(render); // Start loop using the ref
      });
    };

    // Resize handler
     const handleResize = () => {
         window.cancelAnimationFrame(animationFrameIdRef.current); // Stop current loop using the ref
         console.log("Resizing, reinitializing...");
         initAndStart(); // Reinitialize and restart
     };

     window.addEventListener('resize', handleResize);
     initAndStart(); // Initial setup

    // Cleanup
    return () => {
      window.cancelAnimationFrame(animationFrameIdRef.current); // Use ref in cleanup
      window.removeEventListener('resize', handleResize);
      tendrilsRef.current = []; // Clear refs on unmount
      sourcesRef.current = [];
      connectionsRef.current = [];
      sourceStatesRef.current = {};
    };
  }, [error]); // Add error to dependency array to stop loop on error


  // --- UI Handler ---
   const handleWeightChange = (index, value) => {
    const newWeights = [...directionWeights];
    const numValue = Math.max(0, Number(value) || 0);
    // Ensure the array is long enough (should be 9 for the 3x3 grid)
    if (index < newWeights.length) {
         newWeights[index] = numValue;
         setDirectionWeights(newWeights);
    } else {
        console.error("Attempted to set weight out of bounds:", index);
    }
   };

  // --- JSX Return ---
  return (
    <div className="relative w-full h-screen bg-black flex flex-col items-center justify-center p-5">
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-800 text-white p-3 rounded shadow-lg z-50">
          <p className="font-bold mb-1">Simulation Error</p>
          <pre className="text-xs whitespace-pre-wrap">{error}</pre>
          <button
            className="mt-2 bg-red-600 hover:bg-red-700 px-3 py-1 rounded"
            onClick={() => window.location.reload()} // Simple reload for now
          >
            Restart Simulation
          </button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        id="gameOfLifeCanvas"
        className="border border-indigo-500 flex-grow"
        style={{ imageRendering: 'pixelated' }} // Sharper pixels
      >
        Your browser does not support the canvas element.
      </canvas>
       {/* Controls Container */}
       <div className={`absolute bottom-4 left-4 flex space-x-6 ${error ? 'hidden' : ''}`}> {/* Hide controls on error */}
           {/* Parameter Sliders */}
           <div className="bg-gray-800 bg-opacity-80 p-4 rounded text-white text-xs space-y-2 w-48">
                 {/* Signal Frequency Slider */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="signalFrequency" className="flex-1">Signal Freq:</label> {/* Shorten label */}
                   <input type="range" id="signalFrequency" min="0.2" max="4.0" step="0.1" value={signalFrequency} onChange={(e) => setSignalFrequency(Number(e.target.value))} className="w-20 mx-2" />
                   <span className="w-8 text-right">{signalFrequency.toFixed(1)} Hz</span> {/* Wider span */}
                 </div>

                 {/* Pulse Speed Slider */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="pulseSpeed" className="flex-1">Pulse Speed:</label>
                   <input type="range" id="pulseSpeed" min="0.5" max="10.0" step="0.5" value={pulseSpeed} onChange={(e) => setPulseSpeed(Number(e.target.value))} className="w-20 mx-2" />
                   <span className="w-8 text-right">{pulseSpeed.toFixed(1)}</span>
                 </div>

                 {/* Branch Chance Slider */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="branch" className="flex-1">Branch Chance:</label>
                   <input type="range" id="branch" min="0" max="0.5" step="0.01" value={branchChance} onChange={(e) => setBranchChance(Number(e.target.value))} className="w-20 mx-2" />
                   <span className="w-6 text-right">{(branchChance * 100).toFixed(0)}%</span>
                 </div>
                 {/* Fade Speed Slider */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="fade" className="flex-1">Fade Speed:</label>
                   <input type="range" id="fade" min="0.001" max="0.05" step="0.001" value={fadeSpeed} onChange={(e) => setFadeSpeed(Number(e.target.value))} className="w-20 mx-2" />
                   <span className="w-6 text-right">{fadeSpeed.toFixed(3)}</span>
                 </div>
           </div>
           {/* Directional Weights Grid */}
            <div className="bg-gray-800 bg-opacity-80 p-3 rounded text-white text-xs">
                <label className="block text-center mb-2 font-semibold">Growth Bias (Relative)</label>
                <div className="grid grid-cols-3 gap-1 w-32">
                   {[0, 1, 2, 3, -1, 5, 6, 7, 8].map((uiIndex) => { // Map UI indices
                     const relDir = UI_INDEX_TO_RELATIVE[uiIndex];
                     const isDisabled = uiIndex === 4; // Center is disabled
                     return isDisabled ? (
                       <div key="center" className="w-full h-8 flex items-center justify-center rounded bg-gray-600 text-gray-400 text-xs border border-gray-500"> • </div>
                     ) : (
                       <input
                         key={uiIndex}
                         type="number" min="0" step="0.1"
                         value={directionWeights[uiIndex] !== undefined ? directionWeights[uiIndex] : ''}
                         onChange={(e) => handleWeightChange(uiIndex, e.target.value)}
                         title={relDir || 'Unknown'}
                         className={`w-full h-8 p-1 text-center rounded bg-gray-700 text-white text-sm border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 hover:bg-gray-600`}
                       />
                     );
                   })}
                </div>
            </div>
       </div>
    </div>
  );
};

export default GameOfLifeCanvas;
