import React, { useRef, useEffect, useState } from 'react';

// --- Simulation Constants (Defaults) ---
const CELL_SIZE = 4;
const NUM_SOURCES = 2;
const GROWTH_STEP = 1; // How many cells to grow per signal arrival
const DEFAULT_SIGNAL_INTERVAL = 30; // Frames between signal emissions
const DEFAULT_BRANCH_CHANCE = 0.15;
const DEFAULT_FADE_SPEED = 0.005; // Slow fade speed
const FLASH_DURATION_FRAMES = 15;
const MAX_BRANCH_ATTEMPTS = 5; // Reduce attempts to avoid hangs
const SOURCE_REGENERATION_DELAY = 120; // Increase delay
const MIN_PATH_LENGTH_FOR_BRANCHING = 5; // Increase slightly
const BRANCH_ADJACENCY_IMMUNITY_STEPS = 5;

// --- Colors (using your palette) ---
const SOURCE_COLOR = '#6366F1';
const BACKGROUND_COLOR = '#000000';
const GRID_COLOR = '#374151'; // Unused currently
const TENDRIL_COLOR = '#1E3A8A'; // Navy Blue
const SIGNAL_COLOR = '#F59E0B'; // Solar Amber for signal
const BRANCH_POINT_COLOR = '#FFFFFF'; // White for temp branch points
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

// --- Main Component ---
const GameOfLifeCanvas = () => {
  const canvasRef = useRef(null);
  const gridRef = useRef([]);
  const sourcesRef = useRef([]);
  const tendrilsRef = useRef([]);
  const connectionsRef = useRef([]);
  const frameCountRef = useRef(0);
  const animationFrameIdRef = useRef(null);
  const [error, setError] = useState(null);
  const gridDimensions = useRef({ width: 0, height: 0 });

  // --- State for Simulation Parameters ---
  const [signalInterval, setSignalInterval] = useState(DEFAULT_SIGNAL_INTERVAL);
  const [branchChance, setBranchChance] = useState(DEFAULT_BRANCH_CHANCE);
  const [fadeSpeed, setFadeSpeed] = useState(DEFAULT_FADE_SPEED);
  // Default weights prioritize Forward, then Forward-Diagonals, then Sides
  const [directionWeights, setDirectionWeights] = useState([0.8, 2.5, 0.8, 0.3, 0, 0.3, 0.1, 0.1, 0.1]); // Index 4 is center
  const sourceStatesRef = useRef({}); // Tracks regeneration status

  // Ref for current simulation parameters
  const simParamsRef = useRef({ signalInterval, branchChance, fadeSpeed, directionWeights });
  useEffect(() => {
    simParamsRef.current = { signalInterval, branchChance, fadeSpeed, directionWeights };
  }, [signalInterval, branchChance, fadeSpeed, directionWeights]);

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

        // Immunity for young branches
        if (isBranch && age < BRANCH_ADJACENCY_IMMUNITY_STEPS) return false;

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
                         return true;
                     }
                 } else {
                     // For main tendrils, be slightly more restrictive
                     return true;
                 }
            }
        }
        return false; // No penalty
    };


  // --- Signal Logic ---
    const emitSignal = () => {
        sourcesRef.current.forEach(source => {
            const rootTendrils = tendrilsRef.current.filter(t =>
                t.sourceId === source.id && t.path.length > 0 &&
                t.path[0].x === source.x && t.path[0].y === source.y &&
                (t.state === 'growing' || t.state === 'connected') && t.signalState === 'idle'
            );
            rootTendrils.forEach(tendril => {
                tendril.signalState = 'propagating';
                tendril.signalPosition = 0;
            });
        });
    };

    const propagateSignal = () => {
        const newlyReachedTips = new Set();
        const signalsToUpdate = [];

        tendrilsRef.current.forEach(tendril => {
            if (tendril.signalState !== 'propagating') return;

            const currentSignalPos = tendril.signalPosition;
            const nextSignalPos = currentSignalPos + 1;
            const endPositionIndex = tendril.path.length - 1;

            if (nextSignalPos > endPositionIndex) {
                signalsToUpdate.push({ tendrilId: tendril.id, nextState: 'reached_tip', nextPos: endPositionIndex });
                newlyReachedTips.add(tendril.id);
            } else {
                signalsToUpdate.push({ tendrilId: tendril.id, nextState: 'propagating', nextPos: nextSignalPos });
            }
        });

        signalsToUpdate.forEach(({ tendrilId, nextState, nextPos }) => {
            const tendril = findTendrilById(tendrilId);
            if (tendril) {
                tendril.signalState = nextState;
                tendril.signalPosition = nextPos;

                if (nextState === 'propagating') {
                    const currentCellCoord = tendril.path[nextPos];
                    if (currentCellCoord) {
                        const gridCell = gridRef.current[currentCellCoord.y]?.[currentCellCoord.x];
                        if (gridCell?.isBranchPoint) {
                            const allIds = (gridCell.tendrilId || '').split(',');
                            allIds.forEach(id => {
                                if (id === tendril.id) return;
                                const branchTendril = findTendrilById(id);
                                if (branchTendril && branchTendril.signalState === 'idle' && (branchTendril.state === 'growing' || branchTendril.state === 'connected')) {
                                    const branchStartIndex = branchTendril.path.findIndex(p => p.x === currentCellCoord.x && p.y === currentCellCoord.y);
                                    if (branchStartIndex !== -1) {
                                        branchTendril.signalState = 'propagating';
                                        branchTendril.signalPosition = branchStartIndex;
                                    }
                                }
                            });
                        }
                    }
                }
            }
        });
        return newlyReachedTips;
    };

  // --- Growth & Branching Logic ---
    const triggerGrowthAtTips = (tendrilIds) => {
        if (tendrilIds.size === 0) return;
        tendrilIds.forEach(tendrilId => {
            const tendril = findTendrilById(tendrilId);
            if (tendril && tendril.state === 'growing') {
                safeExecute(tryGrowTendril, tendril);
            } else if (tendril) {
            }
            // Always reset signal state after processing tip
            if (tendril) {
                 tendril.signalState = 'idle';
                 tendril.signalPosition = -1;
            }
        });
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
            }

            return { item: neighbor, weight: weight };
        }).filter(n => n.weight > 0);


        if (weightedNeighbors.length === 0) {
            tendril.state = 'blocked';
            return; // Blocked
        }

        const nextCell = weightedRandomSelect(weightedNeighbors);
        if (!nextCell) {
            tendril.state = 'blocked';
            return; // Selection failed
        }

        // Check boundary for nextCell
        if (!isWithinBounds(nextCell.x, nextCell.y)) {
             tendril.state = 'blocked';
             return;
        }

        // *** Perform the single growth step ***
        tendril.path.push(nextCell);
        const gridCellData = { type: 'tendril', color: TENDRIL_COLOR, tendrilId: tendril.id, sourceId: tendril.sourceId, opacity: tendril.opacity };
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
            gridUpdates.set(`${branchTarget.y}-${branchTarget.x}`, { type: 'tendril', color: TENDRIL_COLOR, tendrilId: branchId, sourceId: parentTendril.sourceId, opacity: 1 });
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
          gridRef.current[y][x] = { type: 'source', color: SOURCE_COLOR, sourceId: sourceId, opacity: 1 };
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

      tendrilsRef.current.forEach(tendril => {
          if (tendril.state === 'fading') {
              tendril.opacity -= currentFadeSpeed;
              if (tendril.opacity <= 0) {
                  tendrilsToRemove.add(tendril.id);
              } else {
                  // Update grid opacity for fading tendril path
                  tendril.path.forEach(p => {
                      if (isWithinBounds(p.x, p.y)) {
                          const cell = gridRef.current[p.y][p.x];
                           if (cell && cell.tendrilId?.includes(tendril.id)) { // Check if this tendril is part of the cell
                             cell.opacity = Math.min(cell.opacity, tendril.opacity); // Use the minimum opacity if shared
                         }
                      }
                  });
              }
          }
      });

      if (tendrilsToRemove.size > 0) {
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
      if (!tendril || visited.has(tendril.id)) return false; // Already checked or doesn't exist
      visited.add(tendril.id);

      // Base case: Tendril starts at the source
      if (tendril.path.length > 0 && tendril.path[0].x === sourcePos.x && tendril.path[0].y === sourcePos.y) {
          return true;
      }

      // Recursive case: Check if parent is connected
      if (tendril.isBranch && tendril.parentId) {
          const parentTendril = findTendrilById(tendril.parentId);
          if (!parentTendril) return false; // Parent gone

          // Check if branch point exists in parent path
          const branchPoint = tendril.path[0]; // Branch starts one step after parent head
          const parentContainsBranchPoint = parentTendril.path.some(p => p.x === branchPoint.x && p.y === branchPoint.y);

          if (parentContainsBranchPoint) {
              return verifyTendrilConnectivity(parentTendril, sourcePos, visited); // Check parent's connection
          }
      }

      return false; // Not connected
  };

  const verifyPathIntegrity = () => {
      const allTendrils = [...tendrilsRef.current]; // Copy array as it might be modified
      const sourcesMap = new Map(sourcesRef.current.map(s => [s.id, {x: s.x, y: s.y}]));
      let disconnectedCount = 0;

      allTendrils.forEach(tendril => {
          // Only verify active tendrils (growing, connected, blocked)
          if (tendril.state === 'fading' || tendril.state === 'removed') return;

          const sourcePos = sourcesMap.get(tendril.sourceId);
          if (!sourcePos) {
               console.warn(`Tendril ${tendril.id} has missing source ${tendril.sourceId}. Marking for removal.`);
               tendril.state = 'fading';
               disconnectedCount++;
               return; // Skip if source doesn't exist
          }

          const visited = new Set(); // Reset visited set for each tendril verification chain
          const isConnected = verifyTendrilConnectivity(tendril, sourcePos, visited);

          if (!isConnected) {
              tendril.state = 'fading';
              disconnectedCount++;

               // Mark all tendrils visited during this failed check as fading
               visited.forEach(visitedId => {
                   const t = findTendrilById(visitedId);
                   if(t && t.state !== 'fading') {
                       t.state = 'fading';
                   }
               });
          }
      });
      if (disconnectedCount > 0) {
           console.log(`Integrity check complete. Found ${disconnectedCount} disconnected tendrils.`);
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


  // --- Animation Loop ---
   const render = () => {
        console.log(`Render loop frame: ${frameCountRef.current}`);
        const canvas = canvasRef.current; // Add check for canvas existence
        if (!canvas || error) return;

        safeExecute(() => {
            frameCountRef.current++;
            const { signalInterval: currentSignalInterval } = simParamsRef.current;

            // 1. Emit Signal Periodically
            if (frameCountRef.current % Math.round(currentSignalInterval) === 0) {
                emitSignal();
            }
            // 2. Propagate Existing Signals
            const newlyReachedTips = propagateSignal();
            // 3. Trigger Growth at Tips Reached This Frame
            triggerGrowthAtTips(newlyReachedTips);
            // 4. Update Fading, Connections, etc.
            fadeTendrils();
            updateConnections();
            // 5. Verify Path Integrity Periodically
            if (frameCountRef.current % 60 === 0) { // Less frequent check
                verifyPathIntegrity();
            }
            // 6. Draw Everything
            drawGridAndElements(); // Call draw function
            // Continue animation
            // Note: The animationFrameId should be the one from the useEffect scope
            // If we need to ensure it continues, we might need to manage it slightly differently
            // For now, assume the main loop started in useEffect handles continuation
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
                const cell = gridRef.current[y]?.[x];
                if (!cell) continue;

                let drawColor = BACKGROUND_COLOR; // Default to background

                if (cell.type === 'source') {
                     drawColor = SOURCE_COLOR;
                } else if (cell.type === 'connection') {
                     drawColor = cell.state === 'flashing' ? FLASH_COLOR : CONNECTION_COLOR;
                } else if (cell.type === 'tendril') {
                    // Base color is tendril color unless faded or branch point
                    drawColor = TENDRIL_COLOR;
                     if (cell.isBranchPoint) {
                         const branchAge = frameCountRef.current - (cell.branchTime || 0);
                         const branchVisibleDuration = cell.branchVisibleDuration || 30;
                         if (branchAge <= branchVisibleDuration) {
                             drawColor = BRANCH_POINT_COLOR; // Highlight phase
                         } else { // Transition phase
                              const transitionProgress = Math.min(1, (branchAge - branchVisibleDuration) / 20);
                              const r = Math.round(255 * (1 - transitionProgress) + parseInt(TENDRIL_COLOR.slice(1, 3), 16) * transitionProgress);
                              const g = Math.round(255 * (1 - transitionProgress) + parseInt(TENDRIL_COLOR.slice(3, 5), 16) * transitionProgress);
                              const b = Math.round(255 * (1 - transitionProgress) + parseInt(TENDRIL_COLOR.slice(5, 7), 16) * transitionProgress);
                              drawColor = `rgb(${r}, ${g}, ${b})`;
                         }
                     } else if (cell.opacity < 1 && FADING_COLOR_INTERPOLATE) {
                          // Interpolate color for fading non-branch points
                          const baseColor = parseInt(TENDRIL_COLOR.slice(1), 16);
                          const bgColor = parseInt(BACKGROUND_COLOR.slice(1), 16);
                          const baseR = (baseColor >> 16) & 255; const baseG = (baseColor >> 8) & 255; const baseB = baseColor & 255;
                          const bgR = (bgColor >> 16) & 255; const bgG = (bgColor >> 8) & 255; const bgB = bgColor & 255;
                          const r = Math.round(baseR * cell.opacity + bgR * (1 - cell.opacity));
                          const g = Math.round(baseG * cell.opacity + bgG * (1 - cell.opacity));
                          const b = Math.round(baseB * cell.opacity + bgB * (1 - cell.opacity));
                          drawColor = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).padStart(6, '0')}`;
                      } else if (cell.opacity < 1) {
                           drawColor = FADING_COLOR; // Fallback non-interpolated fade color
                      }
                }

                context.fillStyle = drawColor;
                context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }

         // 2. Draw Propagating Signals (Overlay)
         context.globalAlpha = 1.0;
         tendrilsRef.current.forEach(tendril => {
             if (tendril.signalState === 'propagating' && tendril.signalPosition >= 0 && tendril.signalPosition < tendril.path.length) {
                 const signalCoord = tendril.path[tendril.signalPosition];
                 if (isWithinBounds(signalCoord.x, signalCoord.y)) {
                     context.fillStyle = SIGNAL_COLOR;
                     context.globalAlpha = tendril.opacity; // Use tendril opacity
                     context.fillRect(signalCoord.x * CELL_SIZE, signalCoord.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
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
                 {/* Signal Interval Slider */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="signalInterval" className="flex-1">Signal Interval:</label>
                   <input type="range" id="signalInterval" min="5" max="120" step="1" value={signalInterval} onChange={(e) => setSignalInterval(Number(e.target.value))} className="w-20 mx-2" />
                   <span className="w-6 text-right">{signalInterval}</span>
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
