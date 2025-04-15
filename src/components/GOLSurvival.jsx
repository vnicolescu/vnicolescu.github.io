import React, { useRef, useEffect, useState, useCallback } from 'react';

// --- Simulation Constants (Survival Focus) ---
const CELL_SIZE = 4;
const NUM_SOURCES = 2;
const GROWTH_STEP = 1; // Cells per growth event
const DEFAULT_SIGNAL_FREQUENCY = 1.0; // Hz
const DEFAULT_BRANCH_CHANCE = 0.10;
const DEFAULT_PULSE_SPEED = 2.0; // Base cells per second
const MAX_CELL_AGE = 600; // Frames for full color/conductivity transition
const MIN_CONDUCTIVITY = 0.8;
const MAX_CONDUCTIVITY = 3.0;
const PULSE_VISIBILITY = 2.0; // Brightness multiplier
const PATH_INTEGRITY_CHECK_INTERVAL = 50; // Frames (less frequent)
const SOURCE_REGENERATION_DELAY = 150; // Frames
const MIN_PATH_LENGTH_FOR_BRANCHING = 5;

// --- NEW: Survival Mechanics Constants ---
const INITIAL_SOURCE_ENERGY = 500; // Starting energy units per source
const CELL_ENERGY_COST = 1; // Energy cost per cell grown/branched
const FOOD_PELLET_SIZE = 4; // NxN size
const FOOD_DENSITY = 0.0005; // Chance per cell per frame to spawn food
const FOOD_ENERGY_PER_CELL = 50; // Energy gained per food cell consumed
const REABSORPTION_FADE_SPEED = 0.01; // Faster fade for reabsorbed tendrils
const STANDARD_FADE_SPEED = 0.005; // Slower fade for disconnected tendrils

// --- Colors ---
const SOURCE_COLOR = '#6366F1'; // Indigo Flame
const BACKGROUND_COLOR = '#000000';
const OLD_TENDRIL_COLOR = '#1E3A8A'; // Navy Blue
const YOUNG_TENDRIL_COLOR = '#F59E0B'; // Solar Amber
const SIGNAL_COLOR = '#FFFFFF'; // White
const FOOD_COLOR = '#10B981'; // Emerald Green
const FADING_COLOR = '#4B5563'; // Gray for standard fade
const REABSORBING_COLOR_START = '#1E3A8A'; // Start reabsorb from old color
const REABSORBING_COLOR_END = '#F59E0B'; // Fade towards young color before disappearing

// --- Directions (Same as before) ---
const DIRECTIONS = [
  { dx: -1, dy: -1, index: 0, name: 'TL' }, { dx: 0, dy: -1, index: 1, name: 'T' }, { dx: 1, dy: -1, index: 2, name: 'TR' },
  { dx: -1, dy: 0, index: 3, name: 'L' }, /* Center */ { dx: 1, dy: 0, index: 4, name: 'R' },
  { dx: -1, dy: 1, index: 5, name: 'BL' }, { dx: 0, dy: 1, index: 6, name: 'B' }, { dx: 1, dy: 1, index: 7, name: 'BR' },
];
const RELATIVE_DIRECTIONS = {
  FORWARD_LEFT: 'FL', FORWARD: 'F', FORWARD_RIGHT: 'FR',
  LEFT: 'L', RIGHT: 'R',
  BACKWARD_LEFT: 'BL', BACKWARD: 'B', BACKWARD_RIGHT: 'BR',
};
const RELATIVE_TO_UI_INDEX = {
  [RELATIVE_DIRECTIONS.FORWARD_LEFT]: 0, [RELATIVE_DIRECTIONS.FORWARD]: 1, [RELATIVE_DIRECTIONS.FORWARD_RIGHT]: 2,
  [RELATIVE_DIRECTIONS.LEFT]: 3, /* Center */ [RELATIVE_DIRECTIONS.RIGHT]: 5,
  [RELATIVE_DIRECTIONS.BACKWARD_LEFT]: 6, [RELATIVE_DIRECTIONS.BACKWARD]: 7, [RELATIVE_DIRECTIONS.BACKWARD_RIGHT]: 8,
};
const UI_INDEX_TO_RELATIVE = Object.fromEntries(Object.entries(RELATIVE_TO_UI_INDEX).map(([k, v]) => [v, k]));

// --- Helper Functions ---
let tendrilCounter = 0;
const getUniqueTendrilId = (sourceId) => `t-${sourceId}-${tendrilCounter++}`;
const getRandomInt = (max) => Math.floor(Math.random() * max);
const parseHex = (hex) => { /* ... (implementation same as before) ... */ };
const interpolateColors = (color1Hex, color2Hex, t) => { /* ... (implementation same as before) ... */ };

// Age/Conductivity calculation (On Demand)
const calculateAge = (creationFrame, currentFrame) => Math.min(currentFrame - creationFrame, MAX_CELL_AGE);
const getColorFromAge = (age) => interpolateColors(YOUNG_TENDRIL_COLOR, OLD_TENDRIL_COLOR, age / MAX_CELL_AGE);
const getConductivityFromAge = (age) => MIN_CONDUCTIVITY + (age / MAX_CELL_AGE) * (MAX_CONDUCTIVITY - MIN_CONDUCTIVITY);

// --- LocalStorage Helpers (Optional, can add later) ---
// const STORAGE_KEY = 'golSurvivalSettings';
// const loadSettingsFromLocalStorage = () => { ... };
// const saveSettingsToLocalStorage = (settings) => { ... };

// --- Main Component ---
const GOLSurvival = () => {
  const canvasRef = useRef(null);
  const gridRef = useRef([]);
  const sourcesRef = useRef([]); // Array of source objects { id, x, y, energy, isActive, ... }
  const tendrilsRef = useRef(new Map()); // Use Map for O(1) lookup
  const foodPelletsRef = useRef([]); // Array of food pellet objects { id, x, y, cells: Map<string, { energy }> }
  const connectionsRef = useRef([]); // Array of connection objects (if needed)
  const frameCountRef = useRef(0);
  const animationFrameIdRef = useRef(null);
  const lastSignalEmitTimeRef = useRef(0);
  const currentTimeRef = useRef(0);
  const [error, setError] = useState(null);
  const gridDimensions = useRef({ width: 0, height: 0 });

  // --- State for Simulation Parameters ---
  const [signalFrequency, setSignalFrequency] = useState(1.5); // Default 1.5 Hz
  const [branchChance, setBranchChance] = useState(DEFAULT_BRANCH_CHANCE);
  const [pulseSpeed, setPulseSpeed] = useState(7.0); // Increased default speed again to 7.0
  const [directionWeights, setDirectionWeights] = useState([0.8, 2.5, 0.8, 0.3, 0, 0.3, 0.1, 0.1, 0.1]);
  // Maybe add controls for energy cost, food density later

  // Ref for current simulation parameters
  const simParamsRef = useRef({ signalFrequency, branchChance, pulseSpeed, directionWeights });
  useEffect(() => {
    simParamsRef.current = { signalFrequency, branchChance, pulseSpeed, directionWeights };
    // saveSettingsToLocalStorage(simParamsRef.current); // If using localStorage
  }, [signalFrequency, branchChance, pulseSpeed, directionWeights]);


  // --- Core Simulation Logic ---

  // Utility: Check bounds
  const isWithinBounds = useCallback((x, y) => {
      return x >= 0 && x < gridDimensions.current.width && y >= 0 && y < gridDimensions.current.height;
  }, []); // Empty dependency array as gridDimensions ref changes don't trigger re-renders

  // Utility: Safe execution wrapper
  const safeExecute = useCallback((fn, context, ...args) => {
    if (error) return null;
    try {
      return fn.apply(context, args);
    } catch (e) {
      console.error(`Simulation error in ${fn.name || 'anonymous function'}:`, e.message, e.stack);
      setError(`Runtime Error: ${e.message}`);
      if (animationFrameIdRef.current) {
        window.cancelAnimationFrame(animationFrameIdRef.current);
        animationFrameIdRef.current = null;
      }
      return null;
    }
  }, [error]); // Depends on error state

  // Get Tendril by ID (O(1) lookup)
  const getTendrilById = useCallback((id) => tendrilsRef.current.get(id), []);

  // Get Source by ID
  const getSourceById = useCallback((id) => sourcesRef.current.find(s => s.id === id), []);

  // --- Placeholder Functions (To be implemented) ---

  const initializeGrid = useCallback((width, height) => {
      console.log(`Initializing grid: ${width}x${height}`);
      gridRef.current = Array.from({ length: height }, (_, y) =>
          Array.from({ length: width }, (_, x) => ({
              type: 'empty', // 'empty', 'source', 'tendril', 'food'
              color: BACKGROUND_COLOR,
              tendrilId: null, // Can be single ID or comma-separated for branch points
              sourceId: null, // ID of the originating source
              foodPelletId: null, // ID of the food pellet this cell belongs to
              opacity: 1,
              isBranchPoint: false,
              isConnectionPoint: false, // For source-source connections
              creationFrame: 0, // Frame when the cell became non-empty (for age calculation)
              // Add other potential states: e.g., energy level for food
          }))
      );
      console.log("Grid initialized.");
  }, []);

  const placeSources = useCallback((numSources, gridWidth, gridHeight) => {
      console.log(`Placing ${numSources} sources...`);
      sourcesRef.current = [];
      const placedCoords = new Set();
      const minDistance = Math.max(gridWidth, gridHeight) / (numSources + 1); // Simple spacing heuristic

      for (let i = 0; i < numSources; i++) {
          let x, y, attempts = 0;
          let tooClose = true;
          do {
              x = getRandomInt(gridWidth);
              y = getRandomInt(gridHeight);
              tooClose = sourcesRef.current.some(src =>
                  Math.sqrt(Math.pow(x - src.x, 2) + Math.pow(y - src.y, 2)) < minDistance
              );
              attempts++;
          } while (tooClose && attempts < 100);

          const coordKey = `${x}-${y}`;
          if (!placedCoords.has(coordKey)) {
              const sourceId = `s-${i}`;
              const newSource = {
                  id: sourceId,
                  x, y,
                  energy: INITIAL_SOURCE_ENERGY,
                  isActive: true, // Can this source emit signals?
                  lastActivityFrame: 0, // For regeneration logic
                  state: 'active', // 'active', 'inactive', 'regenerating'
              };
              sourcesRef.current.push(newSource);

              if (isWithinBounds(x, y)) {
                  const cell = gridRef.current[y][x];
                  cell.type = 'source';
                  cell.color = SOURCE_COLOR;
                  cell.sourceId = sourceId;
                  cell.creationFrame = frameCountRef.current; // Treat source placement time as creation
              }
              placedCoords.add(coordKey);
          } else {
              i--; // Retry placing this source
          }
      }
      console.log(`Placed ${sourcesRef.current.length} sources.`);
  }, [isWithinBounds]);

  const initializeTendrils = useCallback(() => {
      console.log("Initializing tendrils...");
      tendrilsRef.current.clear();
      tendrilCounter = 0;
      sourcesRef.current.forEach(source => {
          const tendrilId = getUniqueTendrilId(source.id);
          const newTendril = {
              id: tendrilId,
              sourceId: source.id,
              path: [{ x: source.x, y: source.y }],
              state: 'growing', // 'growing', 'blocked', 'fading', 'reabsorbing', 'connected'
              signalState: 'idle', // 'idle', 'propagating', 'reached_tip'
              signalPosition: -1, // Index in path
              fractionalPos: 0, // For smooth signal movement
              opacity: 1,
              isBranch: false,
              parentId: null,
              creationFrame: frameCountRef.current,
          };
          tendrilsRef.current.set(tendrilId, newTendril);

          if (isWithinBounds(source.x, source.y)) {
              gridRef.current[source.y][source.x].tendrilId = tendrilId; // Mark source cell with initial tendril
          }
      });
      console.log(`Initialized ${tendrilsRef.current.size} tendrils.`);
  }, [isWithinBounds]);

  const spawnFoodPellets = useCallback(() => {
      // console.log("Attempting to spawn food..."); // Log entry
      // Simple probability check for spawning *a* pellet this frame - REMOVED from here, check done in render loop
      // if (Math.random() >= FOOD_DENSITY * gridDimensions.current.width * gridDimensions.current.height) {
      //     return;
      // }

      const gridWidth = gridDimensions.current.width;
      const gridHeight = gridDimensions.current.height;
      if (!gridWidth || !gridHeight) return; // Ensure grid dimensions are valid

      const attempts = 10; // Try a few times to find a spot

      for (let i = 0; i < attempts; i++) {
          const startX = getRandomInt(gridWidth - FOOD_PELLET_SIZE);
          const startY = getRandomInt(gridHeight - FOOD_PELLET_SIZE);

          // Check if the area is clear
          let areaClear = true;
          for (let y = startY; y < startY + FOOD_PELLET_SIZE; y++) {
              for (let x = startX; x < startX + FOOD_PELLET_SIZE; x++) {
                  // Ensure check is within bounds before accessing grid
                  if (!isWithinBounds(x, y) || gridRef.current[y]?.[x]?.type !== 'empty') {
                      areaClear = false;
                      break;
                  }
              }
              if (!areaClear) break;
          }

          if (areaClear) {
              // console.log(`%cFound clear area at (${startX}, ${startY}) after ${i+1} attempts. Placing food.`, 'color: green');
              // Place the food pellet
              const pelletId = `food-${frameCountRef.current}-${startX}-${startY}`;
              const pelletCells = new Map();
              let totalPelletEnergy = 0;

              for (let y = startY; y < startY + FOOD_PELLET_SIZE; y++) {
                  for (let x = startX; x < startX + FOOD_PELLET_SIZE; x++) {
                      const cell = gridRef.current[y][x];
                      cell.type = 'food';
                      cell.color = FOOD_COLOR;
                      cell.foodPelletId = pelletId;
                      cell.opacity = 1;
                      // Store energy per cell? Or just track total? Let's do per cell for now.
                      const cellEnergy = FOOD_ENERGY_PER_CELL; // Could randomize this slightly
                      pelletCells.set(`${x},${y}`, { energy: cellEnergy });
                      totalPelletEnergy += cellEnergy;
                  }
              }

              foodPelletsRef.current.push({
                  id: pelletId,
                  x: startX, y: startY,
                  size: FOOD_PELLET_SIZE,
                  initialEnergy: totalPelletEnergy,
                  remainingEnergy: totalPelletEnergy,
                  cells: pelletCells, // Map of "x,y" -> { energy }
              });

              console.log(`Spawned Food Pellet ${pelletId} at (${startX}, ${startY}) with ${totalPelletEnergy} energy.`);
              return; // Stop after successfully placing one pellet per call
          }
      }
  }, [isWithinBounds]);

  const emitSignal = useCallback(() => {
      // console.log(`Frame ${frameCountRef.current}: Emitting signals...`);
      let emittedCount = 0;
      sourcesRef.current.forEach(source => {
          // Only emit from active sources with energy
          if (!source.isActive || source.energy <= 0 || source.state !== 'active') {
              return;
          }

          // Find root tendrils (starting at the source) belonging to this source
          tendrilsRef.current.forEach(tendril => {
              if (tendril.sourceId === source.id &&
                  tendril.path.length > 0 &&
                  tendril.path[0].x === source.x &&
                  tendril.path[0].y === source.y &&
                  (tendril.state === 'growing' || tendril.state === 'connected') && // Can propagate if growing or stable
                  tendril.signalState === 'idle')
              {
                  // console.log(`  Emitting for Tendril ${tendril.id} from Source ${source.id}`);
                  tendril.signalState = 'propagating';
                  tendril.signalPosition = 0;
                  tendril.fractionalPos = 0;
                  emittedCount++;
              }
          });
      });
      // if (emittedCount > 0) console.log(`  Emitted ${emittedCount} signals.`);

  }, []); // Dependencies: getSourceById? Maybe not needed if sourcesRef is up-to-date

  const propagateSignal = useCallback((deltaTime) => {
      const newlyReachedTips = new Set();
      const signalsToUpdate = []; // Store updates to apply after iteration
      const basePulseSpeed = simParamsRef.current.pulseSpeed;

      tendrilsRef.current.forEach((tendril, tendrilId) => {
          if (tendril.signalState !== 'propagating') return;

          const currentSignalPos = tendril.signalPosition;
          const pathLength = tendril.path.length;

          if (currentSignalPos >= pathLength - 1) {
              // Signal already at the tip, mark for processing
              signalsToUpdate.push({ tendrilId, nextState: 'reached_tip', nextPos: pathLength - 1, fractionalPos: pathLength -1 });
              newlyReachedTips.add(tendrilId);
              return;
          }

          const currentPathPoint = tendril.path[currentSignalPos];
          if (!currentPathPoint || !isWithinBounds(currentPathPoint.x, currentPathPoint.y)) {
              console.warn(`Signal for ${tendrilId} at invalid position (${currentPathPoint?.x}, ${currentPathPoint?.y}). Stopping signal.`);
              signalsToUpdate.push({ tendrilId, nextState: 'idle', nextPos: -1, fractionalPos: -1 }); // Reset signal
              return;
          }

          const cell = gridRef.current[currentPathPoint.y]?.[currentPathPoint.x];
          if (!cell || cell.type === 'empty') {
               console.warn(`Signal for ${tendrilId} on invalid grid cell type: ${cell?.type} at (${currentPathPoint.x}, ${currentPathPoint.y}). Stopping signal.`);
               signalsToUpdate.push({ tendrilId, nextState: 'idle', nextPos: -1, fractionalPos: -1 }); // Reset signal
              return; // Cell doesn't exist or is empty
          }

          // Calculate conductivity based on cell age
          const age = calculateAge(cell.creationFrame, frameCountRef.current);
          const conductivity = getConductivityFromAge(age);
          const cellsToTravel = basePulseSpeed * conductivity * (deltaTime / 1000);

          const currentFractionalPos = tendril.fractionalPos ?? currentSignalPos; // Fallback if undefined
          const newFractionalPos = currentFractionalPos + cellsToTravel;
          const newIntPos = Math.floor(newFractionalPos);

          // Check for branch points between current and new integer position
          if (newIntPos > currentSignalPos) {
              for (let checkPos = currentSignalPos + 1; checkPos <= newIntPos && checkPos < pathLength; checkPos++) {
                  const checkPoint = tendril.path[checkPos];
                  if (!checkPoint || !isWithinBounds(checkPoint.x, checkPoint.y)) continue;

                  const gridCell = gridRef.current[checkPoint.y]?.[checkPoint.x];
                  if (gridCell?.isBranchPoint) {
                      // Found a branch point, attempt to propagate signal to branches
                      propagateSignalToBranches(tendril, gridCell, checkPoint);
                  }
              }
          }

          const nextPos = Math.min(newIntPos, pathLength - 1);
          const nextState = nextPos >= pathLength - 1 ? 'reached_tip' : 'propagating';

          signalsToUpdate.push({
              tendrilId: tendril.id,
              nextState: nextState,
              nextPos: nextPos,
              fractionalPos: newFractionalPos // Store precise fractional position
          });

          if (nextState === 'reached_tip') {
              newlyReachedTips.add(tendril.id);
          }
      });

      // Apply all updates after iterating through the map
      signalsToUpdate.forEach(({ tendrilId, nextState, nextPos, fractionalPos }) => {
          const tendril = getTendrilById(tendrilId);
          if (tendril) {
              tendril.signalState = nextState;
              tendril.signalPosition = nextPos;
              tendril.fractionalPos = fractionalPos;
          }
      });

      return newlyReachedTips;
  }, [isWithinBounds, getTendrilById]); // Added dependencies

   // Helper for propagateSignal
   const propagateSignalToBranches = (propagatingTendril, branchGridCell, branchPointCoords) => {
       if (!branchGridCell?.isBranchPoint || !branchGridCell.tendrilId) return;

       const allTendrilIdsAtPoint = branchGridCell.tendrilId.split(',');

       allTendrilIdsAtPoint.forEach(branchTendrilId => {
           if (branchTendrilId === propagatingTendril.id) return; // Don't propagate back to self

           const branchTendril = getTendrilById(branchTendrilId);

           // Check if branch is valid, ready for signal, and not the parent trying to signal back immediately
           if (branchTendril &&
               (branchTendril.state === 'growing' || branchTendril.state === 'connected') &&
               branchTendril.signalState === 'idle' &&
               branchTendril.parentId !== propagatingTendril.id) // Prevent parent signaling child immediately after child signals parent? (May need refinement)
           {
               // Find the index of the branch point within the branch's path
               const branchPointIndexInBranch = branchTendril.path.findIndex(p =>
                   p.x === branchPointCoords.x && p.y === branchPointCoords.y
               );

               if (branchPointIndexInBranch !== -1) {
                   // Start signal propagation from this point in the branch
                   // console.log(`  -> Propagating signal from ${propagatingTendril.id} to branch ${branchTendril.id} at index ${branchPointIndexInBranch}`);
                   branchTendril.signalState = 'propagating';
                   branchTendril.signalPosition = branchPointIndexInBranch;
                   branchTendril.fractionalPos = branchPointIndexInBranch; // Start fractional pos here
               } else {
                    // This might happen if the branch point isn't perfectly aligned in the path data
                    // Could add approximate matching later if needed
                    console.warn(`Branch point (${branchPointCoords.x},${branchPointCoords.y}) not found in path of branch ${branchTendril.id}. Signal not propagated to branch.`);
               }
           }
       });
   };

  const triggerGrowthAtTips = useCallback((tendrilIds) => {
      if (!tendrilIds || tendrilIds.size === 0) return;
      // console.log(`Frame ${frameCountRef.current}: Triggering growth for ${tendrilIds.size} tips...`);

      tendrilIds.forEach(tendrilId => {
          const tendril = getTendrilById(tendrilId);
          if (!tendril) return;

          // Reset signal state regardless of whether growth happens
          tendril.signalState = 'idle';
          tendril.signalPosition = -1;
          tendril.fractionalPos = -1;

          // Check tendril state and if signal was actually at the tip
          const canPotentiallyGrow = tendril.state === 'growing' || tendril.state === 'connected'; // Allow growth if connected too
          if (!canPotentiallyGrow) {
              console.log(`%c-> Growth skipped for Tendril ${tendrilId}: state is ${tendril.state}`, 'color: orange'); // Added log
              return;
          }

          // Find the source
          const source = getSourceById(tendril.sourceId);
          if (!source || !source.isActive || source.energy <= 0) {
              console.log(`%c-> Growth skipped for Tendril ${tendrilId}: Source ${source?.id} inactive or out of energy (${source?.energy?.toFixed(0)} E)`, 'color: orange'); // Added log
              tendril.state = 'blocked'; // Block if out of energy
              return;
          }

          // --- Attempt Growth ---
          // console.log(`  -> Attempting growth for Tendril ${tendrilId} (Source Energy: ${source.energy.toFixed(0)})`);
          const grew = tryGrowTendril(tendril, source); // Pass source for energy check

          // --- Attempt Branching (only if growth occurred) ---
          if (grew && tendril.state === 'growing') { // Ensure tendril is still growing after the attempt
               attemptBranching(tendril, source); // Pass source for energy check
          }
      });
  }, [getTendrilById, getSourceById /* Add tryGrowTendril, attemptBranching dependencies later */]);

  // Helper: Get Neighbors (adapted for survival)
  const getNeighbors = (x, y, currentSourceId) => {
      const neighbors = { empty: [], food: [], selfCollision: [], otherCollision: [] };
      const absoluteDirections = DIRECTIONS.map(d => [d.dx, d.dy]);

      for (const [dx, dy] of absoluteDirections) {
          const nx = x + dx;
          const ny = y + dy;

          if (!isWithinBounds(nx, ny)) continue;

          const cell = gridRef.current[ny]?.[nx];
          if (!cell) continue;

          switch (cell.type) {
              case 'empty':
                  neighbors.empty.push({ x: nx, y: ny });
                  break;
              case 'food':
                  neighbors.food.push({ x: nx, y: ny, foodPelletId: cell.foodPelletId });
                  break;
              case 'tendril':
              case 'source': // Treat source cells like tendril cells for collision
                  if (cell.sourceId === currentSourceId) {
                      neighbors.selfCollision.push({ x: nx, y: ny });
                  } else {
                      neighbors.otherCollision.push({ x: nx, y: ny, otherSourceId: cell.sourceId, otherTendrilId: cell.tendrilId });
                  }
                  break;
          }
      }
      return neighbors;
  };

  // Helper: Weighted Random Selection (same as before, simplified call)
  const weightedRandomSelect = (options) => {
    const totalWeight = options.reduce((sum, option) => sum + option.weight, 0);
    if (totalWeight <= 0) return null;
    let random = Math.random() * totalWeight;
    for (const option of options) {
        if (random < option.weight) return option.item;
        random -= option.weight;
    }
    return options.length > 0 ? options[options.length - 1].item : null; // Fallback
  };

  // Helper: Get Last Move Direction (same as before)
  const getLastMoveDirection = (tendril) => {
    const pathLength = tendril.path.length;
    if (pathLength < 2) return { dx: 0, dy: -1 }; // Default: Assume initial up
    const lastPoint = tendril.path[pathLength - 1];
    const prevPoint = tendril.path[pathLength - 2];
    return { dx: Math.sign(lastPoint.x - prevPoint.x), dy: Math.sign(lastPoint.y - prevPoint.y) };
  };

  // Helper: Relative to Absolute Direction (same as before)
  const relativeToAbsolute = (relDir, lastMoveDir) => {
    const { dx: lastDx, dy: lastDy } = lastMoveDir;
    if (lastDx === 0 && lastDy === 0) return { dx: 0, dy: -1 };
    switch (relDir) {
        case RELATIVE_DIRECTIONS.FORWARD: return { dx: lastDx, dy: lastDy };
        case RELATIVE_DIRECTIONS.BACKWARD: return { dx: -lastDx, dy: -lastDy };
        case RELATIVE_DIRECTIONS.LEFT: return { dx: lastDy, dy: -lastDx };
        case RELATIVE_DIRECTIONS.RIGHT: return { dx: -lastDy, dy: lastDx };
        case RELATIVE_DIRECTIONS.FORWARD_LEFT: return { dx: lastDx + lastDy, dy: lastDy - lastDx };
        case RELATIVE_DIRECTIONS.FORWARD_RIGHT: return { dx: lastDx - lastDy, dy: lastDy + lastDx };
        case RELATIVE_DIRECTIONS.BACKWARD_LEFT: return { dx: -lastDx + lastDy, dy: -lastDy - lastDx };
        case RELATIVE_DIRECTIONS.BACKWARD_RIGHT: return { dx: -lastDx - lastDy, dy: -lastDy + lastDx };
        default: return null;
    }
  };

  // TODO: Adjacency Penalty Check (Need to adapt from previous version if desired)
  const checkAdjacencyPenalty = (tendril, neighbor, currentHead, previousCell) => {
     // Simplified: No penalty for now to reduce complexity. Implement later if needed.
     return false;
  };

  const tryGrowTendril = useCallback((tendril, source) => {
      if (tendril.state !== 'growing' && tendril.state !== 'connected') return false;
      if (source.energy < CELL_ENERGY_COST) {
          tendril.state = 'blocked'; // Block if source can't afford growth
          // console.log(`Tendril ${tendril.id} blocked - insufficient energy.`);
          return false;
      }

      const currentHead = tendril.path[tendril.path.length - 1];
      const previousCell = tendril.path.length > 1 ? tendril.path[tendril.path.length - 2] : null;
      const currentWeights = simParamsRef.current.directionWeights;

      if (!currentHead || !isWithinBounds(currentHead.x, currentHead.y)) {
          tendril.state = 'blocked';
          return false; // Blocked by boundary
      }

      const neighbors = getNeighbors(currentHead.x, currentHead.y, tendril.sourceId);

      // --- Priority 1: Check for Food --- (Slime mold prioritizes food)
      if (neighbors.food.length > 0) {
          const foodTarget = neighbors.food[0]; // Target the first food cell found
          // console.log(`Tendril ${tendril.id} moving towards food at (${foodTarget.x}, ${foodTarget.y})`);

          // Consume source energy for the move
          source.energy -= CELL_ENERGY_COST;
          // Move onto food cell
          tendril.path.push({ x: foodTarget.x, y: foodTarget.y });
          // Handle the consequences of eating the food
          handleFoodCollision(tendril, foodTarget);
          tendril.state = 'growing'; // Continue growing from food cell
          return true; // Growth occurred (onto food)
      }

      // --- Priority 2: Check for Collision with Other Sources --- (Cooperation trigger)
      if (neighbors.otherCollision.length > 0) {
           const collisionTarget = neighbors.otherCollision[0];
           const otherTendril = collisionTarget.otherTendrilId ? getTendrilById(collisionTarget.otherTendrilId.split(',')[0]) : null;

           if(otherTendril) {
               // Consume energy for the move
               source.energy -= CELL_ENERGY_COST;
               // Move to the collision point
               tendril.path.push({ x: collisionTarget.x, y: collisionTarget.y });
               // Handle the collision/connection
               handleTendrilCollision(tendril, otherTendril);
               tendril.state = 'connected'; // State changes upon connection
               return true; // Growth occurred (connection)
           }
      }

      // --- Priority 3: Normal Growth (Weighted Random Empty Cell) ---
      const validEmptyNeighbors = neighbors.empty.filter(n =>
          !(previousCell && n.x === previousCell.x && n.y === previousCell.y) && // Don't move back immediately
          !tendril.path.some(p => p.x === n.x && p.y === n.y) // Avoid immediate self-overlap
      );

      if (validEmptyNeighbors.length === 0) {
          tendril.state = 'blocked'; // No valid empty space
          // console.log(`Tendril ${tendril.id} blocked - no valid empty neighbors.`);
          return false;
      }

      // Enhanced Collision Check: Look at neighbors of the potential next cell
      const isCollisionRisky = (targetCell) => {
          const targetNeighbors = getNeighbors(targetCell.x, targetCell.y, tendril.sourceId);
          // Check if any neighbor of the target cell (excluding the current head) is already part of this tendril's path
          return targetNeighbors.selfCollision.some(neighbor => {
               const isCurrentHead = neighbor.x === currentHead.x && neighbor.y === currentHead.y;
               return !isCurrentHead;
          });
      };

      const weightedNeighbors = validEmptyNeighbors.map(neighbor => {
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

          // Apply adjacency penalty if implemented and desired
          if (weight > 0 && checkAdjacencyPenalty(tendril, neighbor, currentHead, previousCell)) {
              weight = 0;
          }
          return { item: neighbor, weight };
      }).filter(n => n.weight > 0);

      // Filter out neighbors that pose a high collision risk (adjacent to self)
      const safeWeightedNeighbors = weightedNeighbors.filter(option => !isCollisionRisky(option.item));

      if (safeWeightedNeighbors.length === 0) {
          // If only risky neighbors are left, maybe pick one anyway or block?
          // For now, let's block if only risky options remain.
          // console.log(`Tendril ${tendril.id} blocked - only risky neighbors available.`);
          tendril.state = 'blocked';
          return false;
          // Alternative: const nextCell = weightedRandomSelect(weightedNeighbors); // Pick from original list
      }

      const nextCell = weightedRandomSelect(safeWeightedNeighbors);
      if (!nextCell) {
          tendril.state = 'blocked'; // Selection failed
          // console.log(`Tendril ${tendril.id} blocked - weighted selection failed.`);
          return false;
      }

      // *** Perform the growth step ***
      source.energy -= CELL_ENERGY_COST; // Deduct energy *before* adding cell
      tendril.path.push(nextCell);
      tendril.state = 'growing'; // Ensure state is growing

      // Update grid
      const gridCell = gridRef.current[nextCell.y][nextCell.x];
      gridCell.type = 'tendril';
      gridCell.color = getColorFromAge(0); // Start with young color
      gridCell.tendrilId = tendril.id;
      gridCell.sourceId = tendril.sourceId;
      gridCell.opacity = 1;
      gridCell.creationFrame = frameCountRef.current;

      return true; // Growth occurred

  }, [isWithinBounds, simParamsRef, handleFoodCollision, handleTendrilCollision, getTendrilById /* Add more deps */]);

  const attemptBranching = useCallback((parentTendril, source) => {
      if (parentTendril.state !== 'growing' || // Can only branch from growing tendril
          parentTendril.path.length < MIN_PATH_LENGTH_FOR_BRANCHING ||
          Math.random() >= simParamsRef.current.branchChance) {
          return; // Conditions not met
      }

      if (source.energy < CELL_ENERGY_COST) {
          // console.log(`Branching skipped for ${parentTendril.id} - insufficient energy.`);
          return; // Not enough energy to create branch cell
      }

      const headCell = parentTendril.path[parentTendril.path.length - 1];
      const previousCell = parentTendril.path[parentTendril.path.length - 2];

      // Find alternative valid neighbors (excluding the one just grown into if possible)
      // Reuse neighbor calculation, but focus on alternatives
      const neighbors = getNeighbors(previousCell.x, previousCell.y, parentTendril.sourceId); // Check neighbors of the cell *before* the head
      const validEmptyNeighbors = neighbors.empty.filter(n =>
          !(n.x === headCell.x && n.y === headCell.y) && // Exclude the cell just grown into
          !parentTendril.path.some(p => p.x === n.x && p.y === n.y) // Avoid immediate overlap
      );

      if (validEmptyNeighbors.length === 0) return; // No alternative spots to branch into

      // Simplified branching: just pick one random valid neighbor
      // TODO: Could reintroduce weighting if desired
      const branchTarget = validEmptyNeighbors[getRandomInt(validEmptyNeighbors.length)];

      // *** Create the branch ***
      source.energy -= CELL_ENERGY_COST; // Deduct energy for the new branch cell

      const branchId = getUniqueTendrilId(parentTendril.sourceId);
      const branchTendril = {
          id: branchId,
          sourceId: parentTendril.sourceId,
          path: [headCell, branchTarget], // Branch starts from parent's head
          state: 'growing',
          signalState: 'idle', // Start idle
          signalPosition: -1,
          fractionalPos: 0,
          opacity: 1,
          isBranch: true,
          parentId: parentTendril.id,
          creationFrame: frameCountRef.current,
      };
      tendrilsRef.current.set(branchId, branchTendril);
      // console.log(`  -> Branched: ${branchId} from ${parentTendril.id}`);

      // Update Grid for the new branch cell
      const branchGridCell = gridRef.current[branchTarget.y][branchTarget.x];
      branchGridCell.type = 'tendril';
      branchGridCell.color = getColorFromAge(0);
      branchGridCell.tendrilId = branchId;
      branchGridCell.sourceId = parentTendril.sourceId;
      branchGridCell.opacity = 1;
      branchGridCell.creationFrame = frameCountRef.current;

      // Mark the Branch Point on the parent's head cell
      const headGridCell = gridRef.current[headCell.y][headCell.x];
      headGridCell.isBranchPoint = true;
      const existingIds = headGridCell.tendrilId ? headGridCell.tendrilId.split(',') : [];
      if (!existingIds.includes(parentTendril.id)) existingIds.push(parentTendril.id);
      if (!existingIds.includes(branchId)) existingIds.push(branchId);
      headGridCell.tendrilId = existingIds.join(',');
      // Optionally add temporary visual cue for branch point in draw function

  }, [simParamsRef, getTendrilById /* Add more deps */ ]);

  const handleFoodCollision = useCallback((tendril, foodCellCoord) => {
      const source = getSourceById(tendril.sourceId);
      const foodCell = gridRef.current[foodCellCoord.y]?.[foodCellCoord.x];

      if (!source || !foodCell || foodCell.type !== 'food' || !foodCell.foodPelletId) {
          console.warn(`Invalid food collision call: source=${source?.id}, cellType=${foodCell?.type}, pelletId=${foodCell?.foodPelletId}`);
          return; // Invalid state
      }

      const pelletId = foodCell.foodPelletId;
      const pellet = foodPelletsRef.current.find(p => p.id === pelletId);
      if (!pellet) {
          console.warn(`Food pellet ${pelletId} not found in foodPelletsRef.`);
          // Clean up orphaned food cell on grid?
          foodCell.type = 'empty';
          foodCell.color = BACKGROUND_COLOR;
          foodCell.foodPelletId = null;
          return;
      }

      const cellKey = `${foodCellCoord.x},${foodCellCoord.y}`;
      const foodData = pellet.cells.get(cellKey);

      if (!foodData) {
           console.warn(`Food cell (${cellKey}) not found in data for pellet ${pelletId}.`);
           // Cell already consumed? Mark as empty on grid just in case.
           foodCell.type = 'empty';
           foodCell.color = BACKGROUND_COLOR;
           foodCell.foodPelletId = null;
           return;
      }

      // 1. Add energy to source
      const energyGained = foodData.energy;
      source.energy += energyGained;
      pellet.remainingEnergy -= energyGained;
      console.log(`Tendril ${tendril.id} consumed food at (${foodCellCoord.x}, ${foodCellCoord.y}). Source ${source.id} gained ${energyGained} E. New total: ${source.energy.toFixed(0)} E.`);

      // 2. Update grid cell to become part of the tendril
      foodCell.type = 'tendril';
      foodCell.color = getColorFromAge(0); // Becomes a new tendril cell
      foodCell.tendrilId = tendril.id; // Assign tendril ID
      foodCell.sourceId = tendril.sourceId;
      foodCell.foodPelletId = null; // No longer food
      foodCell.creationFrame = frameCountRef.current; // Treat as new cell for age

      // 3. Remove cell from pellet data
      pellet.cells.delete(cellKey);

      // Optional: Check if pellet is fully consumed
      if (pellet.cells.size === 0) {
          console.log(`Food pellet ${pelletId} fully consumed.`);
          foodPelletsRef.current = foodPelletsRef.current.filter(p => p.id !== pelletId);
          // TODO: Potentially trigger signal emission from this location later
          // Mark the location? Create a temporary 'food source' object?
      }

      // TODO: Trigger path optimization after consuming food?
      // triggerPathOptimization(source.id, null, foodCellCoord); // Pass null for second source ID

  }, [getSourceById]); // Dependencies

  const handleTendrilCollision = useCallback((tendril1, tendril2) => {
      // Basic collision handling: block both tendrils involved
      if (!tendril1 || !tendril2) return;

      // Only handle collisions between tendrils from different sources for now
      if (tendril1.sourceId !== tendril2.sourceId) {
          console.log(`%cCollision detected: Tendril ${tendril1.id} (Source ${tendril1.sourceId}) and Tendril ${tendril2.id} (Source ${tendril2.sourceId})`, 'color: yellow');
          // Block both tendrils - prevents further growth into each other
          tendril1.state = 'blocked';
          tendril2.state = 'blocked';

          // Mark the grid cell as a potential connection point (visualisation TBD)
          const collisionPoint = tendril1.path[tendril1.path.length - 1]; // Collision happens at tendril1's new head
          if (isWithinBounds(collisionPoint.x, collisionPoint.y)) {
              const cell = gridRef.current[collisionPoint.y][collisionPoint.x];
              if (cell) {
                  cell.isConnectionPoint = true; // Add a flag
                  // Maybe change color temporarily later in draw function
              }
          }

          // TODO: Implement cooperation logic later (merge energy, path optimization)
      }
      // Note: Collisions between tendrils of the *same* source are not explicitly handled here
      // and might still overlap depending on growth timing.
  }, [isWithinBounds]);

  const triggerPathOptimization = useCallback((sourceId1, sourceId2, connectionPoint) => {
      // TODO: Implement path optimization logic (potentially complex)
      // - Find shortest path (A* or similar) between source(s) and target
      // - Mark non-shortest path segments as 'reabsorbing'
  }, []);

  const updateFadingTendrils = useCallback(() => {
      const tendrilsToRemove = new Set();
      let energyRecovered = 0; // Track recovered energy for logging

      tendrilsRef.current.forEach((tendril, tendrilId) => {
          if (tendril.state === 'fading' || tendril.state === 'reabsorbing') {
              const fadeSpeed = tendril.state === 'reabsorbing' ? REABSORPTION_FADE_SPEED : STANDARD_FADE_SPEED;
              tendril.opacity -= fadeSpeed;

              if (tendril.opacity <= 0) {
                  tendrilsToRemove.add(tendrilId);

                  // If reabsorbing, recover energy before removal
                  if (tendril.state === 'reabsorbing') {
                      const source = getSourceById(tendril.sourceId);
                      if (source) {
                          // Path includes the starting point, so length - 1 is the number of grown cells
                          const cellsToRecover = Math.max(0, tendril.path.length - 1);
                          const recovered = cellsToRecover * CELL_ENERGY_COST;
                          source.energy += recovered;
                          energyRecovered += recovered;
                           // console.log(`Reabsorbed ${tendril.id} (${cellsToRecover} cells). Recovered ${recovered.toFixed(0)} E for source ${source.id}. New total: ${source.energy.toFixed(0)} E.`);
                      }
                  }
              }
          }
      });

      if (tendrilsToRemove.size > 0) {
          // console.log(`%cupdateFadingTendrils: Removing ${tendrilsToRemove.size} tendrils. Recovered ${energyRecovered.toFixed(0)} E.`, 'color: gray');
          // console.log(`Removing ${tendrilsToRemove.size} faded/reabsorbed tendrils. Recovered ${energyRecovered.toFixed(0)} E from reabsorption.`);

          // --- Grid Cleanup --- Need to be careful with shared cells (branch points)
          const cellsToReset = new Map(); // Track cells potentially needing reset (key: "x,y")

          tendrilsToRemove.forEach(tendrilId => {
              const removedTendril = tendrilsRef.current.get(tendrilId);
              if (!removedTendril) return;

              // Add all cells in the removed path to the potential reset list
              removedTendril.path.forEach(p => {
                  const key = `${p.x},${p.y}`;
                  if (!cellsToReset.has(key)) {
                      cellsToReset.set(key, new Set());
                  }
                  cellsToReset.get(key).add(removedTendril.id);
              });

              // Actually remove from the Map
              tendrilsRef.current.delete(tendrilId);
          });

          // Now process the grid cells that were part of removed tendrils
          cellsToReset.forEach((removedIdsOnCell, key) => {
              const [x, y] = key.split(',').map(Number);
              if (!isWithinBounds(x, y)) return;

              const cell = gridRef.current[y][x];
              if (!cell || cell.type === 'empty' || cell.type === 'source') return; // Skip empty/source cells

              if (cell.tendrilId) {
                  const currentIds = cell.tendrilId.split(',');
                  // Filter out IDs that were just removed
                  const remainingIds = currentIds.filter(id => !removedIdsOnCell.has(id));

                  if (remainingIds.length === 0) {
                      // No tendrils left on this cell, reset it to empty
                      gridRef.current[y][x] = {
                          type: 'empty',
                          color: BACKGROUND_COLOR,
                          tendrilId: null,
                          sourceId: null,
                          foodPelletId: null,
                          opacity: 1,
                          isBranchPoint: false,
                          isConnectionPoint: false,
                          creationFrame: 0,
                      };
                  } else {
                      // Update the cell with the remaining tendril IDs
                      cell.tendrilId = remainingIds.join(',');
                      // Recalculate opacity/state? Maybe just leave it based on one of the remaining?
                      const firstRemainingTendril = getTendrilById(remainingIds[0]);
                      cell.opacity = firstRemainingTendril ? firstRemainingTendril.opacity : 1;
                      cell.isBranchPoint = remainingIds.length > 1; // Still a branch point if >1 left
                  }
              } else {
                   // Cell had no tendril ID but was in a path? Reset just in case.
                   gridRef.current[y][x] = {
                       type: 'empty',
                       color: BACKGROUND_COLOR,
                       tendrilId: null, sourceId: null, foodPelletId: null,
                       opacity: 1, isBranchPoint: false, isConnectionPoint: false, creationFrame: 0,
                   };
              }
          });
      }
  }, [getSourceById, getTendrilById, isWithinBounds]);

  const verifyPathIntegrity = useCallback(() => {
       // More robust check: Iteratively mark disconnected branches
       let changed = true;
       let markedThisPass = 0;
       const maxPasses = tendrilsRef.current.size; // Safety break
       let passes = 0;

       while (changed && passes < maxPasses) {
           changed = false;
           markedThisPass = 0;
           tendrilsRef.current.forEach((tendril) => {
               // Only check active branches not already marked
               if (tendril.isBranch && tendril.parentId && tendril.state !== 'fading' && tendril.state !== 'reabsorbing') {
                   const parentTendril = getTendrilById(tendril.parentId);
                   if (!parentTendril || parentTendril.state === 'fading' || parentTendril.state === 'reabsorbing') {
                       tendril.state = 'fading';
                       markedThisPass++;
                       changed = true;
                   }
               }
               // Also check root tendrils - if blocked for too long? (Optional enhancement)
           });
           passes++;
       }

       // if (markedThisPass > 0 || passes > 1) {
       //     console.log(`Path Integrity: Marked ${markedThisPass} branches as fading. Completed in ${passes} passes.`);
       // }
  }, [getTendrilById]);

  const checkSourcesForRegeneration = useCallback(() => {
      // TODO: Implement source regeneration logic if all its tendrils are gone
  }, []);


  const drawGridAndElements = useCallback(() => {
       const canvas = canvasRef.current;
       if (!canvas) return;
       const context = canvas.getContext('2d');
       if (!context || !gridRef.current?.length) return;

       const { width: canvasWidth, height: canvasHeight } = canvas;
       context.clearRect(0, 0, canvasWidth, canvasHeight);

       // 1. Draw Grid Cells (Tendrils, Sources, Food)
       for (let y = 0; y < gridDimensions.current.height; y++) {
           for (let x = 0; x < gridDimensions.current.width; x++) {
               const cell = gridRef.current[y][x];
               if (!cell || cell.type === 'empty') continue;

               let drawColor = BACKGROUND_COLOR;
               let cellOpacity = cell.opacity;

               switch (cell.type) {
                   case 'source':
                       drawColor = SOURCE_COLOR;
                       break;
                   case 'tendril': {
                       const tendril = cell.tendrilId ? getTendrilById(cell.tendrilId.split(',')[0]) : null; // Get first tendril for state info
                       if (tendril) {
                           cellOpacity = tendril.opacity; // Base opacity from tendril
                           const age = calculateAge(cell.creationFrame, frameCountRef.current);

                           if (tendril.state === 'reabsorbing') {
                               // Interpolate color for reabsorbing
                               const t = tendril.opacity; // Opacity goes 1 -> 0
                               drawColor = interpolateColors(REABSORBING_COLOR_END, REABSORBING_COLOR_START, t);
                           } else if (tendril.state === 'fading') {
                               drawColor = FADING_COLOR; // Simple fade color
                           } else {
                               // Normal growing/connected/blocked state - use age color
                               drawColor = getColorFromAge(age);
                               if (cell.isBranchPoint /* && shouldHighlightBranchPoint */) {
                                   // Optional: Highlight branch points temporarily
                                   // drawColor = BRANCH_POINT_COLOR;
                               }
                           }
                       } else {
                           // Orphaned grid cell? Should be cleaned up. Draw as background.
                           drawColor = BACKGROUND_COLOR;
                           cellOpacity = 0;
                       }
                       break;
                   }
                   case 'food':
                       drawColor = FOOD_COLOR;
                       break;
                   // Add cases for connection points etc. if needed
               }

               context.globalAlpha = cellOpacity;
               context.fillStyle = drawColor;
               context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
           }
       }
       context.globalAlpha = 1.0; // Reset global alpha

       // 2. Draw Propagating Signals (Overlay)
       context.fillStyle = SIGNAL_COLOR;
       tendrilsRef.current.forEach(tendril => {
           if (tendril.signalState === 'propagating' && tendril.signalPosition >= 0 && tendril.signalPosition < tendril.path.length) {
               const signalCoord = tendril.path[tendril.signalPosition];
               if (isWithinBounds(signalCoord.x, signalCoord.y)) {
                   // Enhanced visibility (draw brighter/larger or with tail)
                   context.globalAlpha = Math.min(1.0, tendril.opacity * PULSE_VISIBILITY);
                   context.fillRect(signalCoord.x * CELL_SIZE, signalCoord.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                   // TODO: Implement tail effect if desired
               }
           }
       });
       context.globalAlpha = 1.0;

       // 3. Draw UI Info (e.g., Energy Levels)
       context.font = '12px Inter';
       context.fillStyle = 'white';
       sourcesRef.current.forEach((source, index) => {
           const text = `Source ${source.id}: ${source.energy.toFixed(0)} E`;
           context.fillText(text, 10, 20 + index * 15);
       });

  }, [getTendrilById, isWithinBounds]); // Add dependencies as needed

  // --- Animation Loop ---
   const render = useCallback((timestamp) => {
       if (error) {
           console.error("Animation loop stopped due to error.");
           return;
       }
       const canvas = canvasRef.current;
       if (!canvas) return;

       const prevTime = currentTimeRef.current || timestamp;
       currentTimeRef.current = timestamp;
       const deltaTime = timestamp - prevTime;

       // Log deltaTime occasionally for performance check
       if(frameCountRef.current % 60 === 0) { console.log(`DeltaTime: ${deltaTime.toFixed(2)}ms`); }

       safeExecute(frameCountRef, () => { frameCountRef.current++; });

       const currentSimParams = simParamsRef.current;
       const intervalMilliseconds = 1000 / currentSimParams.signalFrequency;
       const elapsedSinceLastEmit = currentTimeRef.current - lastSignalEmitTimeRef.current;

       // --- Update Step ---
       // 1. Emit Signals (Time-based)
       if (elapsedSinceLastEmit >= intervalMilliseconds) {
           safeExecute(null, emitSignal);
           lastSignalEmitTimeRef.current = currentTimeRef.current;
       }

       // 2. Propagate Signals
       const newlyReachedTips = safeExecute(null, propagateSignal, deltaTime) || new Set();

       // 3. Trigger Growth & Check Collisions at Tips
       safeExecute(null, triggerGrowthAtTips, newlyReachedTips);

       // 4. Spawn Food Periodically/Randomly
       // Increased probability: 2% chance per frame to attempt spawning
       if (Math.random() < 0.02) {
          safeExecute(null, spawnFoodPellets);
       }

       // 5. Update Fading/Reabsorbing Tendrils
       safeExecute(null, updateFadingTendrils);

       // 6. Path Integrity Check (Periodically)
       if (frameCountRef.current % PATH_INTEGRITY_CHECK_INTERVAL === 0) {
           safeExecute(null, verifyPathIntegrity);
       }

       // 7. Source Regeneration Check
        safeExecute(null, checkSourcesForRegeneration);

       // --- Draw Step ---
       safeExecute(null, drawGridAndElements);

       // Continue loop
       animationFrameIdRef.current = window.requestAnimationFrame(render);

   }, [error, /* Add other state/prop dependencies if needed */ ]);


  // --- Initialization and Cleanup ---
  const initializeSimulation = useCallback(() => {
      console.log("Initializing simulation...");
      const canvas = canvasRef.current;
      if (!canvas) {
          console.error("Canvas element not found during initialization.");
          setError("Canvas element not found.");
          return false;
      }
      const parentElement = canvas.parentElement;
      if (!parentElement) {
           console.error("Canvas parent element not found for sizing.");
           setError("Canvas parent element not found.");
           return false;
       }
      const { clientWidth, clientHeight } = parentElement;

      const dpr = window.devicePixelRatio || 1;
      canvas.width = clientWidth * dpr;
      canvas.height = clientHeight * dpr;
      canvas.style.width = `${clientWidth}px`;
      canvas.style.height = `${clientHeight}px`;

      const context = canvas.getContext('2d');
       if (!context) {
           console.error("Failed to get 2D context during initialization.");
           setError("Failed to get canvas context during init.");
           return false;
       }
      context.scale(dpr, dpr);

      const gridWidth = Math.floor(clientWidth / CELL_SIZE);
      const gridHeight = Math.floor(clientHeight / CELL_SIZE);
      gridDimensions.current = { width: gridWidth, height: gridHeight };

      frameCountRef.current = 0;
      lastSignalEmitTimeRef.current = 0;
      currentTimeRef.current = 0;
      tendrilsRef.current.clear();
      sourcesRef.current = [];
      foodPelletsRef.current = [];
      connectionsRef.current = [];
      setError(null); // Clear previous errors

      // Perform initialization steps using safeExecute
       if (!safeExecute(null, initializeGrid, gridWidth, gridHeight)) return false;
       if (!safeExecute(null, placeSources, NUM_SOURCES, gridWidth, gridHeight)) return false;
       if (!safeExecute(null, initializeTendrils)) return false;

      console.log("Simulation initialized successfully.");
      return true; // Indicate success
  }, [initializeGrid, placeSources, initializeTendrils]); // Add dependencies

  useEffect(() => {
      console.log("GOLSurvival component mounted.");
      if (initializeSimulation()) {
          console.log("Starting animation loop.");
           // Start initial signal emit slightly delayed to allow drawing first frame?
           setTimeout(() => safeExecute(null, emitSignal), 50);
          animationFrameIdRef.current = window.requestAnimationFrame(render);
      } else {
          console.error("Initialization failed, animation loop not started.");
      }

      // Resize handler
      const handleResize = () => {
          console.log("Resizing detected...");
          if (animationFrameIdRef.current) {
              window.cancelAnimationFrame(animationFrameIdRef.current);
              animationFrameIdRef.current = null; // Clear the ref
          }
          if (initializeSimulation()) {
              console.log("Restarting animation loop after resize.");
               setTimeout(() => safeExecute(null, emitSignal), 50);
              animationFrameIdRef.current = window.requestAnimationFrame(render);
          } else {
              console.error("Re-initialization after resize failed.");
          }
      };

      window.addEventListener('resize', handleResize);

      // Cleanup
      return () => {
          console.log("GOLSurvival component unmounting.");
          if (animationFrameIdRef.current) {
              window.cancelAnimationFrame(animationFrameIdRef.current);
          }
          window.removeEventListener('resize', handleResize);
          tendrilsRef.current.clear();
          sourcesRef.current = [];
          foodPelletsRef.current = [];
          connectionsRef.current = [];
      };
  }, [initializeSimulation, render, safeExecute, emitSignal]); // Add dependencies


  // --- UI Handler ---
  const handleWeightChange = useCallback((index, value) => {
     const newWeights = [...directionWeights];
     const numValue = Math.max(0, Number(value) || 0);
     if (index >= 0 && index < 9 && index !== 4) { // Ensure valid index (0-8, excluding center 4)
          newWeights[index] = numValue;
          setDirectionWeights(newWeights);
     } else {
         console.error("Attempted to set weight out of bounds or for center:", index);
     }
  }, [directionWeights]); // Depends on directionWeights state


  // --- JSX Return ---
  return (
    <div className="relative w-full h-screen bg-black flex flex-col items-center justify-center p-5">
      {error && (
        <div className="absolute top-4 left-4 right-4 bg-red-800 text-white p-3 rounded shadow-lg z-50 max-w-md mx-auto">
          <p className="font-bold mb-1">Simulation Error</p>
          <pre className="text-xs whitespace-pre-wrap break-words">{error}</pre>
          <button
            className="mt-2 bg-red-600 hover:bg-red-700 px-3 py-1 rounded text-sm"
            onClick={() => {
              setError(null); // Clear error
              // Attempt re-initialization - might need full reload depending on error
              if (initializeSimulation()) {
                 setTimeout(() => safeExecute(null, emitSignal), 50);
                 animationFrameIdRef.current = window.requestAnimationFrame(render);
              }
            }}
          >
            Try Restart
          </button>
        </div>
      )}
      <canvas
        ref={canvasRef}
        id="golSurvivalCanvas"
        className="border border-indigo-500 flex-grow"
        style={{ imageRendering: 'pixelated' }} // Keep pixels sharp
      >
        Your browser does not support the canvas element.
      </canvas>

       {/* Controls Container */}
       <div className={`absolute bottom-4 left-4 flex space-x-6 ${error ? 'hidden' : ''}`}>
           {/* Parameter Sliders */}
           <div className="bg-gray-800 bg-opacity-80 p-4 rounded text-white text-xs space-y-2 w-48 shadow-lg">
                <div className="flex items-center justify-between">
                   <label htmlFor="signalFrequency" className="flex-1 mr-1">Signal Freq:</label>
                   <input type="range" id="signalFrequency" min="0.1" max="5.0" step="0.1" value={signalFrequency} onChange={(e) => setSignalFrequency(Number(e.target.value))} className="w-20 mx-1 flex-shrink-0 h-4 appearance-none bg-gray-600 rounded slider-thumb" />
                   <span className="w-8 text-right ml-1">{signalFrequency.toFixed(1)} Hz</span>
                 </div>
                 <div className="flex items-center justify-between">
                   <label htmlFor="pulseSpeed" className="flex-1 mr-1">Pulse Speed:</label>
                   <input type="range" id="pulseSpeed" min="0.5" max="10.0" step="0.5" value={pulseSpeed} onChange={(e) => setPulseSpeed(Number(e.target.value))} className="w-20 mx-1 flex-shrink-0 h-4 appearance-none bg-gray-600 rounded slider-thumb" />
                   <span className="w-8 text-right ml-1">{pulseSpeed.toFixed(1)}</span>
                 </div>
                 <div className="flex items-center justify-between">
                   <label htmlFor="branch" className="flex-1 mr-1">Branch %:</label>
                   <input type="range" id="branch" min="0" max="0.5" step="0.01" value={branchChance} onChange={(e) => setBranchChance(Number(e.target.value))} className="w-20 mx-1 flex-shrink-0 h-4 appearance-none bg-gray-600 rounded slider-thumb" />
                   <span className="w-8 text-right ml-1">{(branchChance * 100).toFixed(0)}%</span>
                 </div>
                {/* Removed Fade Speed slider - now have standard/reabsorbing */}
           </div>

           {/* Directional Weights Grid */}
            <div className="bg-gray-800 bg-opacity-80 p-3 rounded text-white text-xs shadow-lg">
                <label className="block text-center mb-2 font-semibold">Growth Bias</label>
                <div className="grid grid-cols-3 gap-1 w-32">
                   {[0, 1, 2, 3, -1, 5, 6, 7, 8].map((uiIndex) => {
                     const relDir = UI_INDEX_TO_RELATIVE[uiIndex];
                     const isDisabled = uiIndex === 4;
                     return isDisabled ? (
                       <div key="center" className="w-full h-8 flex items-center justify-center rounded bg-gray-600 text-gray-400 text-xs border border-gray-500"> • </div>
                     ) : (
                       <input
                         key={uiIndex}
                         type="number" min="0" step="0.1"
                         value={directionWeights[uiIndex] !== undefined ? directionWeights[uiIndex] : ''}
                         onChange={(e) => handleWeightChange(uiIndex, e.target.value)}
                         title={relDir || 'Center'}
                         className={`w-full h-8 p-1 text-center rounded bg-gray-700 text-white text-sm border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500 hover:bg-gray-600`}
                       />
                     );
                   })}
                </div>
            </div>
           {/* TODO: Add display for total energy, active tendrils, etc. */}
       </div>
    </div>
  );
};

export default GOLSurvival;
