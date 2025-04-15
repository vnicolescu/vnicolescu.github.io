import React, { useRef, useEffect, useState, useCallback } from 'react';

// --- Simulation Constants (Survival Focus) ---
const CELL_SIZE = 4;
const NUM_SOURCES = 2;
const GROWTH_STEP = 1; // Cells per growth event
const DEFAULT_SIGNAL_FREQUENCY = 1.0; // Hz
const DEFAULT_BRANCH_CHANCE = 0.10;
const DEFAULT_PULSE_SPEED = 2.0; // Base cells per second
const MAX_CELL_AGE = 600; // Frames for full color/conductivity transition
const MIN_CONDUCTIVITY = 0.3;
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
  const [signalFrequency, setSignalFrequency] = useState(DEFAULT_SIGNAL_FREQUENCY);
  const [branchChance, setBranchChance] = useState(DEFAULT_BRANCH_CHANCE);
  const [pulseSpeed, setPulseSpeed] = useState(DEFAULT_PULSE_SPEED);
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
      // TODO: Implement logic to randomly spawn food pellets
      // Consider density, avoiding overlap with existing tendrils/sources
  }, []);

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
      // TODO: Implement growth for tendrils in the set
      // - Check source energy: if source.energy >= CELL_ENERGY_COST
      // - Deduct energy: source.energy -= CELL_ENERGY_COST
      // - Perform growth step (tryGrowTendril)
      // - Handle branching (attemptBranching)
  }, []);

  const tryGrowTendril = useCallback((tendril, source) => {
      // TODO: Implement single step growth logic
      // - Find valid neighbors using weighted random selection
      // - Check for food collision
      // - Update tendril path, grid state
      // - Return true if growth occurred, false otherwise
      return false; // Placeholder
  }, []);

  const attemptBranching = useCallback((parentTendril, source) => {
      // TODO: Implement probabilistic branching
      // - Check energy: source.energy >= CELL_ENERGY_COST
      // - Deduct energy: source.energy -= CELL_ENERGY_COST
      // - Create new branch tendril object, add to tendrilsRef Map
      // - Mark branch point on grid
  }, []);

  const handleFoodCollision = useCallback((tendril, foodCellCoord) => {
      // TODO: Implement logic when a tendril hits food
      // - Add energy to source: source.energy += FOOD_ENERGY_PER_CELL
      // - Remove food cell from pellet data and grid
      // - Trigger path optimization?
  }, []);

  const handleTendrilCollision = useCallback((tendril1, tendril2) => {
      // TODO: Implement logic when two tendrils meet
      // - Check if from different sources
      // - If different, trigger cooperation (merge sources, path optimization)
  }, []);

  const triggerPathOptimization = useCallback((sourceId1, sourceId2, connectionPoint) => {
      // TODO: Implement path optimization logic (potentially complex)
      // - Find shortest path (A* or similar) between source(s) and target
      // - Mark non-shortest path segments as 'reabsorbing'
  }, []);

  const updateFadingTendrils = useCallback(() => {
      // TODO: Implement fading for 'fading' and 'reabsorbing' states
      // - Decrease opacity based on state (standard vs reabsorption speed)
      // - If 'reabsorbing', return energy: source.energy += CELL_ENERGY_COST
      // - Remove tendril from tendrilsRef Map and grid when opacity <= 0
  }, []);

  const verifyPathIntegrity = useCallback(() => {
      // TODO: Implement simplified path integrity check
      // - Iterate tendrils Map
      // - For branches, check if parent exists in Map and parent.state isn't 'fading'/'reabsorbing'
      // - If check fails, set tendril.state = 'fading' (no energy change)
  }, []);

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
       if (Math.random() < FOOD_DENSITY * gridDimensions.current.width * gridDimensions.current.height) {
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
