import React, { useRef, useEffect, useState, useCallback } from 'react';

// --- Simulation Constants (Survival Focus) ---
const CELL_SIZE = 4;
const NUM_SOURCES = 2;
const GROWTH_STEP = 1; // Cells per growth event
const DEFAULT_SIGNAL_FREQUENCY = 1.0; // Hz
const DEFAULT_BRANCH_CHANCE = 0.10;
const DEFAULT_PULSE_SPEED = 2.0; // Base cells per second
const MAX_CELL_AGE = 1200; // Frames for full color/conductivity transition
const MIN_CONDUCTIVITY = 0.8;
const MAX_CONDUCTIVITY = 4.0;
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
const REABSORPTION_FADE_SPEED = 0.005; // Faster fade for reabsorbed tendrils - SLOWED DOWN
const STANDARD_FADE_SPEED = 0.002; // Slower fade for disconnected tendrils - SLOWED DOWN

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

// Helper for hex parsing with safety checks
const parseHex = (hex) => {
    if (!hex || typeof hex !== 'string' || hex.length < 7) {
        console.warn(`Invalid hex color: "${hex}", using fallback`);
        return [0, 0, 0]; // Black fallback
    }

    try {
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        return [
            isNaN(r) ? 0 : r,
            isNaN(g) ? 0 : g,
            isNaN(b) ? 0 : b
        ];
    } catch (err) {
        console.error("Error parsing hex color:", err, hex);
        return [0, 0, 0]; // Fallback to black
    }
};

// Safe color interpolation
const interpolateColors = (color1Hex, color2Hex, t) => {
    try {
        // Ensure valid input colors with fallbacks
        const color1 = color1Hex && typeof color1Hex === 'string' ? color1Hex : '#000000';
        const color2 = color2Hex && typeof color2Hex === 'string' ? color2Hex : '#000000';

        // Ensure t is within 0-1 range
        const clampedT = Math.max(0, Math.min(1, t || 0));

        const [r1, g1, b1] = parseHex(color1);
        const [r2, g2, b2] = parseHex(color2);

        // Interpolate RGB values
        const r = Math.round(r1 + (r2 - r1) * clampedT);
        const g = Math.round(g1 + (g2 - g1) * clampedT);
        const b = Math.round(b1 + (b1 - b1) * clampedT);

        // Convert back to hex with safety checks
        return `#${Math.max(0, Math.min(255, r)).toString(16).padStart(2, '0')}${
            Math.max(0, Math.min(255, g)).toString(16).padStart(2, '0')}${
            Math.max(0, Math.min(255, b)).toString(16).padStart(2, '0')}`;
    } catch (err) {
        console.error("Error in color interpolation:", err);
        return "#000000"; // Return black as fallback
    }
};

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
  const [directionWeights, setDirectionWeights] = useState([
    0.8, 2.5, 0.8,  // Forward-left, Forward, Forward-right
    0.1, 0, 0.1,    // Left, Center, Right
    0, 0, 0         // Backward-left, Backward, Backward-right
  ]);
  // Maybe add controls for energy cost, food density later

  // --- IMPORTANT: Function declarations for functions used in circular dependencies ---
  // These need to be declared before they're used

  // Get Tendril by ID (O(1) lookup) - MUST BE DECLARED EARLY
  const getTendrilById = (id) => {
    if (!id) return null;
    return tendrilsRef.current && tendrilsRef.current.get ? tendrilsRef.current.get(id) : null;
  };

  // Get Source by ID - MUST BE DECLARED EARLY
  const getSourceById = (id) => {
    if (!id) return null;
    return sourcesRef.current && Array.isArray(sourcesRef.current) ?
      sourcesRef.current.find(s => s && s.id === id) : null;
  };

  // Check bounds - MUST BE DECLARED EARLY
  const isWithinBounds = (x, y) => {
    const dims = gridDimensions.current || { width: 0, height: 0 };
    return x >= 0 && x < dims.width && y >= 0 && y < dims.height;
  };

  // Handle Food Collision - MUST BE DECLARED EARLY
  const handleFoodCollision = (tendril, foodCellCoord) => {
    if (!tendril || !foodCellCoord || !gridRef.current) {
      console.warn('Invalid parameters in handleFoodCollision');
      return;
    }

    const source = getSourceById(tendril.sourceId);
    // Make sure the grid cell exists
    if (!isWithinBounds(foodCellCoord.x, foodCellCoord.y)) {
      console.warn(`Food coordinates out of bounds: (${foodCellCoord.x}, ${foodCellCoord.y})`);
      return;
    }

    const gridRow = gridRef.current[foodCellCoord.y];
    if (!gridRow) {
      console.warn(`Grid row ${foodCellCoord.y} doesn't exist`);
      return;
    }

    const foodCell = gridRow[foodCellCoord.x];
    if (!source || !foodCell || foodCell.type !== 'food' || !foodCell.foodPelletId) {
      console.warn(`Invalid food collision call: source=${source?.id}, cellType=${foodCell?.type}, pelletId=${foodCell?.foodPelletId}`);
      return;
    }

    const pelletId = foodCell.foodPelletId;
    const pellet = foodPelletsRef.current && foodPelletsRef.current.find ?
      foodPelletsRef.current.find(p => p && p.id === pelletId) : null;

    if (!pellet) {
      console.warn(`Food pellet ${pelletId} not found in foodPelletsRef.`);
      foodCell.type = 'empty';
      foodCell.color = BACKGROUND_COLOR;
      foodCell.foodPelletId = null;
      return;
    }

    const cellKey = `${foodCellCoord.x},${foodCellCoord.y}`;
    const foodData = pellet.cells && pellet.cells.get ? pellet.cells.get(cellKey) : null;

    if (!foodData) {
      console.warn(`Food cell (${cellKey}) not found in data for pellet ${pelletId}.`);
      foodCell.type = 'empty';
      foodCell.color = BACKGROUND_COLOR;
      foodCell.foodPelletId = null;
      return;
    }

    // 1. Add energy to source
    const energyGained = foodData.energy || 0;
    source.energy += energyGained;
    pellet.remainingEnergy -= energyGained;
    console.log(`%cTendril ${tendril.id} consumed food at (${foodCellCoord.x}, ${foodCellCoord.y}). Source ${source.id} gained ${energyGained} E. New total: ${source.energy.toFixed(0)} E.`, 'color: green; font-weight: bold');

    // 2. Update grid cell to become part of the tendril
    foodCell.type = 'tendril';
    foodCell.color = getColorFromAge(0);
    foodCell.tendrilId = tendril.id;
    foodCell.sourceId = tendril.sourceId;
    foodCell.foodPelletId = null;
    foodCell.creationFrame = frameCountRef.current || 0;

    // 3. Remove cell from pellet data
    if (pellet.cells && pellet.cells.delete) {
      pellet.cells.delete(cellKey);
    }

    // 4. Check if pellet is fully consumed
    if (pellet.cells && pellet.cells.size === 0) {
      console.log(`%cFood pellet ${pelletId} fully consumed.`, 'color: green');
      foodPelletsRef.current = foodPelletsRef.current.filter(p => p && p.id !== pelletId);
    }
  };

  // Handle Tendril Collision - MUST BE DECLARED EARLY
  const handleTendrilCollision = (tendril1, tendril2) => {
    if (!tendril1 || !tendril2 || !gridRef.current) return;

    if (tendril1.sourceId !== tendril2.sourceId) {
      console.log(`%cCollision detected: Tendril ${tendril1.id} (Source ${tendril1.sourceId}) and Tendril ${tendril2.id} (Source ${tendril2.sourceId})`, 'color: yellow');

      tendril1.state = 'blocked';
      tendril2.state = 'blocked';

      const collisionPoint = tendril1.path && tendril1.path.length ?
        tendril1.path[tendril1.path.length - 1] : null;

      if (collisionPoint && isWithinBounds(collisionPoint.x, collisionPoint.y)) {
        const gridRow = gridRef.current[collisionPoint.y];
        if (gridRow) {
          const cell = gridRow[collisionPoint.x];
          if (cell) {
            cell.isConnectionPoint = true;
          }
        }
      }
    }
  };

  // Ref for current simulation parameters
  const simParamsRef = useRef({ signalFrequency, branchChance, pulseSpeed, directionWeights });
  useEffect(() => {
    simParamsRef.current = { signalFrequency, branchChance, pulseSpeed, directionWeights };
  }, [signalFrequency, branchChance, pulseSpeed, directionWeights]);

  // --- Core Simulation Logic ---

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

  // --- Placeholder Functions (To be implemented) ---

  const initializeGrid = useCallback((width, height) => {
      try {
          console.log(`Initializing grid: ${width}x${height}`);
          if (!width || !height || width <= 0 || height <= 0) {
              console.error(`Invalid grid dimensions: ${width}x${height}`);
              throw new Error("Invalid grid dimensions");
          }

          // Create a full 2D array with predefined cell objects
          const newGrid = Array.from({ length: height }, (_, y) =>
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
              }))
          );

          // Set the grid reference
          gridRef.current = newGrid;

          console.log(`Grid initialized successfully: ${width}x${height} cells created.`);
          return true;
      } catch (err) {
          console.error("Grid initialization failed:", err);
          setError(`Grid initialization error: ${err.message || "Unknown error"}`);
          return false;
      }
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
      try {
          // Limit food pellets to a reasonable number
          const MAX_FOOD_PELLETS = 5; // Reduced from 10

          if (foodPelletsRef.current.length >= MAX_FOOD_PELLETS) {
              console.log(`Already have ${foodPelletsRef.current.length}/${MAX_FOOD_PELLETS} food pellets, skipping spawn`);
              return false;
          }

          const dims = gridDimensions.current || { width: 0, height: 0 };
          const gridWidth = dims.width;
          const gridHeight = dims.height;

          if (!gridWidth || !gridHeight || gridWidth < FOOD_PELLET_SIZE || gridHeight < FOOD_PELLET_SIZE) {
              console.log("Invalid grid dimensions for food placement");
              return false;
          }

          // Limit to smaller pellet size
          const EFFECTIVE_PELLET_SIZE = Math.min(FOOD_PELLET_SIZE, 4);

          console.log(`Food spawn attempt: Grid size: ${gridWidth}x${gridHeight}, Current pellets: ${foodPelletsRef.current.length}`);

          // Try several locations
          const attempts = 20;
          for (let i = 0; i < attempts; i++) {
              // Keep food away from edges
              const maxX = gridWidth - EFFECTIVE_PELLET_SIZE - 2;
              const maxY = gridHeight - EFFECTIVE_PELLET_SIZE - 2;

              // Make sure we have valid bounds
              if (maxX <= 2 || maxY <= 2) {
                  console.log("Grid too small for food placement");
                  return false;
              }

              // Choose position with margin from edges
              const startX = 2 + getRandomInt(maxX - 2);
              const startY = 2 + getRandomInt(maxY - 2);

              console.log(`Checking area at (${startX}, ${startY}) for food placement`);

              // Check if area is clear
              let areaClear = true;
              for (let y = startY; y < startY + EFFECTIVE_PELLET_SIZE; y++) {
                  for (let x = startX; x < startX + EFFECTIVE_PELLET_SIZE; x++) {
                      if (!isWithinBounds(x, y)) {
                          areaClear = false;
                          break;
                      }

                      const cell = gridRef.current[y][x];
                      if (!cell || cell.type !== 'empty') {
                          areaClear = false;
                          break;
                      }
                  }
                  if (!areaClear) break;
              }

              if (areaClear) {
                  console.log(`%c✅ FOUND CLEAR AREA FOR FOOD at (${startX}, ${startY})`, "color: lime");

                  // Create unique pellet ID
                  const pelletId = `food-${frameCountRef.current}-${startX}-${startY}`;
                  const pelletCells = new Map();
                  let totalPelletEnergy = 0;

                  // Mark all cells in the food pellet area
                  for (let y = startY; y < startY + EFFECTIVE_PELLET_SIZE; y++) {
                      for (let x = startX; x < startX + EFFECTIVE_PELLET_SIZE; x++) {
                          if (!gridRef.current[y] || !gridRef.current[y][x]) continue;

                          const cell = gridRef.current[y][x];
                          cell.type = 'food';
                          cell.color = FOOD_COLOR;
                          cell.foodPelletId = pelletId;
                          cell.opacity = 1;

                          // Store energy data
                          const cellEnergy = FOOD_ENERGY_PER_CELL;
                          const cellKey = `${x},${y}`;
                          pelletCells.set(cellKey, { energy: cellEnergy });
                          totalPelletEnergy += cellEnergy;
                      }
                  }

                  // Add to food pellets collection
                  foodPelletsRef.current.push({
                      id: pelletId,
                      x: startX,
                      y: startY,
                      size: EFFECTIVE_PELLET_SIZE,
                      initialEnergy: totalPelletEnergy,
                      remainingEnergy: totalPelletEnergy,
                      cells: pelletCells,
                      creationFrame: frameCountRef.current
                  });

                  console.log(`%c🍕 SPAWNED FOOD PELLET ${pelletId} at (${startX}, ${startY}) with ${totalPelletEnergy} energy!`, 'color: lime; font-weight: bold');

                  // Count food cells for verification
                  let foodCellCount = 0;
                  for (let y = 0; y < gridHeight; y++) {
                      for (let x = 0; x < gridWidth; x++) {
                          if (gridRef.current[y]?.[x]?.type === 'food') {
                              foodCellCount++;
                          }
                      }
                  }
                  console.log(`Total food cells in grid: ${foodCellCount}`);

                  return true; // Successfully placed food
              }
          }

          console.log("❌ Failed to find space for food after all attempts");
          return false;
      } catch (err) {
          console.error("Error spawning food pellet:", err);
          return false;
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
              // Specifically look for branch points that need signal propagation
              checkForBranchPoints(tendril, currentSignalPos, newIntPos);
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
  }, [isWithinBounds, getTendrilById]);

  // New helper function to check for branch points
  const checkForBranchPoints = (tendril, startPos, endPos) => {
      if (!tendril || !tendril.path || tendril.path.length < 2) return;

      // Check each position within the range for branch points
      for (let pos = startPos + 1; pos <= endPos && pos < tendril.path.length; pos++) {
          const point = tendril.path[pos];
          if (!point || !isWithinBounds(point.x, point.y)) continue;

          const cell = gridRef.current[point.y][point.x];
          if (!cell) continue;

          // If this is a branch point, propagate signals
          if (cell.isBranchPoint) {
              console.log(`Found branch point at (${point.x}, ${point.y}) while processing tendril ${tendril.id}`);
              // Use the external propagateSignalToBranches function
              propagateSignalToBranches(tendril, cell, point);
          }
      }
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
      // Make absolutely sure we're checking all 8 directions
      const directions = [
          [-1, -1], [0, -1], [1, -1],
          [-1, 0],           [1, 0],
          [-1, 1],  [0, 1],  [1, 1]
      ];

      for (const [dx, dy] of directions) {
          const nx = x + dx;
          const ny = y + dy;

          if (!isWithinBounds(nx, ny)) continue;

          const cell = gridRef.current[ny][nx];
          if (!cell) continue;

          // Debug individual cell
          if (cell.type === 'food') {
              console.log(`Found FOOD cell at (${nx},${ny}), pelletId: ${cell.foodPelletId}`);
          }

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
          console.log(`%cTendril ${tendril.id} blocked - insufficient energy (${source.energy.toFixed(1)})`, 'color: orange');
          return false;
      }

      const currentHead = tendril.path[tendril.path.length - 1];
      const previousCell = tendril.path.length > 1 ? tendril.path[tendril.path.length - 2] : null;

      if (!currentHead || !isWithinBounds(currentHead.x, currentHead.y)) {
          tendril.state = 'blocked';
          return false; // Blocked by boundary
      }

      const neighbors = getNeighbors(currentHead.x, currentHead.y, tendril.sourceId);
      console.log(`Tendril ${tendril.id} checking neighbors: empty=${neighbors.empty.length}, food=${neighbors.food.length}`);

      // --- Priority 1: Check for Food --- (Slime mold prioritizes food)
      if (neighbors.food.length > 0) {
          const foodTarget = neighbors.food[0]; // Target the first food cell found
          console.log(`%cTendril ${tendril.id} found food at (${foodTarget.x}, ${foodTarget.y})!`, 'color: lime; font-weight: bold');

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

          // Get current direction weights from sim parameters
          const currentWeights = simParamsRef.current.directionWeights || [
              0.8, 2.5, 0.8,  // Forward-left, Forward, Forward-right
              0.1, 0, 0.1,    // Left, Center, Right
              0, 0, 0         // Backward-left, Backward, Backward-right
          ];

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
      // Add more logging to debug branching
      try {
          // Check basic conditions
          if (parentTendril.state !== 'growing') {
              // console.log(`Branch skipped: ${parentTendril.id} not in growing state`);
              return false;
          }

          if (parentTendril.path.length < MIN_PATH_LENGTH_FOR_BRANCHING) {
              // console.log(`Branch skipped: ${parentTendril.id} too short (${parentTendril.path.length})`);
              return false;
          }

          // Randomize based on branch chance
          if (Math.random() >= simParamsRef.current.branchChance) {
              return false;
          }

          // Energy check
          if (source.energy < CELL_ENERGY_COST) {
              console.log(`Branching skipped for ${parentTendril.id} - insufficient energy (${source.energy})`);
              return false;
          }

          console.log(`Attempting to create branch from tendril ${parentTendril.id}`);

          // Get the tendril head and previous cell
          const pathLength = parentTendril.path.length;
          if (pathLength < 2) return false; // Need at least 2 cells

          const headCell = parentTendril.path[pathLength - 1];
          const previousCell = parentTendril.path[pathLength - 2];

          if (!headCell || !previousCell) {
              console.log(`Invalid head/previous cells in tendril ${parentTendril.id}`);
              return false;
          }

          // Find all empty neighbors of the head cell
          const neighbors = getNeighbors(headCell.x, headCell.y, parentTendril.sourceId);

          // Filter to just empty cells, excluding cells already in the path
          const validBranchTargets = neighbors.empty.filter(neighbor =>
              !parentTendril.path.some(pathPoint =>
                  pathPoint.x === neighbor.x && pathPoint.y === neighbor.y
              )
          );

          if (validBranchTargets.length === 0) {
              // console.log(`No valid branch targets for tendril ${parentTendril.id}`);
              return false;
          }

          // Pick a random direction for the branch
          const branchTarget = validBranchTargets[getRandomInt(validBranchTargets.length)];
          console.log(`Selected branch target at (${branchTarget.x}, ${branchTarget.y}) from ${validBranchTargets.length} options`);

          // Create the branch
          source.energy -= CELL_ENERGY_COST; // Deduct energy for the branch
          const branchId = getUniqueTendrilId(parentTendril.sourceId);

          // Create branch path starting from head cell
          const branchTendril = {
              id: branchId,
              sourceId: parentTendril.sourceId,
              path: [
                  // Include the head cell as branch point
                  { x: headCell.x, y: headCell.y },
                  // Add the branch target as first growth cell
                  { x: branchTarget.x, y: branchTarget.y }
              ],
              state: 'growing',
              signalState: 'idle',
              signalPosition: -1,
              fractionalPos: 0,
              opacity: 1,
              isBranch: true,
              parentId: parentTendril.id,
              creationFrame: frameCountRef.current,
          };

          // Add to tendrils collection
          tendrilsRef.current.set(branchId, branchTendril);
          console.log(`%cCreated branch ${branchId} from ${parentTendril.id}`, 'color: magenta; font-weight: bold');

          // Mark the branch point on the grid
          const headGridCell = gridRef.current[headCell.y][headCell.x];
          if (headGridCell) {
              headGridCell.isBranchPoint = true;

              // Add both tendril IDs to the cell
              const existingIds = (headGridCell.tendrilId || '').split(',').filter(Boolean);
              if (!existingIds.includes(parentTendril.id)) existingIds.push(parentTendril.id);
              if (!existingIds.includes(branchId)) existingIds.push(branchId);

              headGridCell.tendrilId = existingIds.join(',');
              console.log(`Branch point cell at (${headCell.x}, ${headCell.y}) marked with tendrils: ${headGridCell.tendrilId}`);
          }

          // Mark the branch target cell on the grid
          const branchGridCell = gridRef.current[branchTarget.y][branchTarget.x];
          if (branchGridCell) {
              branchGridCell.type = 'tendril';
              branchGridCell.color = getColorFromAge(0); // Young color
              branchGridCell.tendrilId = branchId;
              branchGridCell.sourceId = parentTendril.sourceId;
              branchGridCell.opacity = 1;
              branchGridCell.creationFrame = frameCountRef.current;
          }

          return true; // Branch created successfully
      } catch (err) {
          console.error("Error in attemptBranching:", err);
          return false;
      }
  }, [simParamsRef, getNeighbors, getTendrilById]);

  const triggerPathOptimization = useCallback((sourceId1, sourceId2, connectionPoint) => {
      // TODO: Implement path optimization logic (potentially complex)
      // - Find shortest path (A* or similar) between source(s) and target
      // - Mark non-shortest path segments as 'reabsorbing'
  }, []);

  const updateFadingTendrils = useCallback(() => {
      const tendrilsToRemove = new Set();
      let energyRecovered = 0; // Track recovered energy for logging
      let fadingCount = 0;
      let reabsorbingCount = 0;
      let debugFadingFull = frameCountRef.current % 300 === 0; // Detailed debug every 5 seconds

      // Count fading and reabsorbing tendrils
      tendrilsRef.current.forEach((tendril) => {
          if (tendril.state === 'fading') fadingCount++;
          if (tendril.state === 'reabsorbing') reabsorbingCount++;
      });

      if (debugFadingFull && (fadingCount > 0 || reabsorbingCount > 0)) {
          console.log(`%cFADING STATUS: ${fadingCount} fading, ${reabsorbingCount} reabsorbing tendrils`, 'color: purple');
      }

      tendrilsRef.current.forEach((tendril, tendrilId) => {
          if (tendril.state === 'fading' || tendril.state === 'reabsorbing') {
              const oldOpacity = tendril.opacity;
              const fadeSpeed = tendril.state === 'reabsorbing' ? REABSORPTION_FADE_SPEED : STANDARD_FADE_SPEED;
              tendril.opacity -= fadeSpeed;

              if (debugFadingFull && tendril.id.endsWith('0')) { // Just log a few samples
                  console.log(`Tendril ${tendril.id} opacity: ${oldOpacity.toFixed(3)} -> ${tendril.opacity.toFixed(3)}, fadeSpeed: ${fadeSpeed}`);
              }

              // For visual effect, update the grid cells' opacity
              if (tendril.opacity <= 0.05) {
                  // When nearly invisible, just remove it
                  tendrilsToRemove.add(tendrilId);

                  // If reabsorbing, recover energy
                  if (tendril.state === 'reabsorbing') {
                      const source = getSourceById(tendril.sourceId);
                      if (source) {
                          const cellsToRecover = Math.max(0, tendril.path.length - 1);
                          const recovered = cellsToRecover * CELL_ENERGY_COST;
                          source.energy += recovered;
                          energyRecovered += recovered;
                      }
                  }
              } else {
                  // Update cell opacities
                  tendril.path.forEach(point => {
                      if (isWithinBounds(point.x, point.y)) {
                          const cell = gridRef.current[point.y][point.x];
                          if (cell && cell.tendrilId && cell.tendrilId.includes(tendrilId)) {
                              // For multi-tendril cells, be careful about opacity
                              if (cell.tendrilId === tendrilId || cell.tendrilId.split(',')[0] === tendrilId) {
                                  cell.opacity = tendril.opacity;
                              }
                          }
                      }
                  });
              }
          }
      });

      if (tendrilsToRemove.size > 0) {
          console.log(`%cRemoving ${tendrilsToRemove.size} fully faded tendrils. Recovered ${energyRecovered.toFixed(0)} energy.`, 'color: gray');

          // Clear cells from grid
          tendrilsToRemove.forEach(tendrilId => {
              const tendril = tendrilsRef.current.get(tendrilId);
              if (!tendril) return;

              // Clear grid cells
              tendril.path.forEach(point => {
                  if (isWithinBounds(point.x, point.y)) {
                      const cell = gridRef.current[point.y][point.x];
                      if (cell && cell.tendrilId) {
                          const currentIds = cell.tendrilId.split(',');
                          const remainingIds = currentIds.filter(id => id !== tendrilId);

                          if (remainingIds.length === 0) {
                              // Reset cell to empty
                              if (cell.type !== 'source') { // Don't reset sources
                                  gridRef.current[point.y][point.x] = {
                                      type: 'empty',
                                      color: BACKGROUND_COLOR,
                                      tendrilId: null,
                                      sourceId: null,
                                      foodPelletId: null,
                                      opacity: 1,
                                      creationFrame: 0,
                                      isBranchPoint: false,
                                      isConnectionPoint: false
                                  };
                              } else {
                                  // Just clear the tendrilId for source cells
                                  cell.tendrilId = null;
                              }
                          } else {
                              // Update with remaining IDs
                              cell.tendrilId = remainingIds.join(',');
                              cell.isBranchPoint = remainingIds.length > 1;
                          }
                      }
                  }
              });

              // Remove from tendril map
              tendrilsRef.current.delete(tendrilId);
          });
      }
  }, [getSourceById, getTendrilById, isWithinBounds]);

  const verifyPathIntegrity = useCallback(() => {
       // First, check if any sources have run out of energy
       sourcesRef.current.forEach(source => {
           if (source.energy <= 0 && source.isActive) {
               // Mark source as inactive when energy is depleted
               source.isActive = false;
               console.log(`%cSource ${source.id} has run out of energy and is now inactive`, 'color: orange; font-weight: bold');

               // Mark all active tendrils from this source for fading
               let markedCount = 0;
               tendrilsRef.current.forEach((tendril) => {
                   if (tendril.sourceId === source.id &&
                       tendril.state !== 'fading' &&
                       tendril.state !== 'reabsorbing') {

                       tendril.state = 'fading';
                       markedCount++;
                   }
               });

               if (markedCount > 0) {
                   console.log(`Marked ${markedCount} tendrils for fading due to source energy depletion`);
               }
           }
       });

       // Log the current state of all tendrils periodically
       if (frameCountRef.current % 150 === 0) {
           const states = {};
           tendrilsRef.current.forEach((tendril) => {
               states[tendril.state] = (states[tendril.state] || 0) + 1;
           });
           console.log('Current tendril states:', states);
       }

       // Check branch integrity
       let changed = true;
       let markedThisPass = 0;
       const maxPasses = tendrilsRef.current.size;
       let passes = 0;

       while (changed && passes < maxPasses) {
           changed = false;
           markedThisPass = 0;

           tendrilsRef.current.forEach((tendril) => {
               // Only check active tendrils not already marked for fading
               if (tendril.state !== 'fading' && tendril.state !== 'reabsorbing') {

                   // Check branch parent connection
                   if (tendril.isBranch && tendril.parentId) {
                       const parentTendril = getTendrilById(tendril.parentId);
                       if (!parentTendril ||
                           parentTendril.state === 'fading' ||
                           parentTendril.state === 'reabsorbing') {

                           tendril.state = 'fading';
                           markedThisPass++;
                           changed = true;
                       }
                   }

                   // Check if main tendril has valid path to source
                   if (!tendril.isBranch) {
                       const source = getSourceById(tendril.sourceId);
                       if (!source || !source.isActive) {
                           tendril.state = 'fading';
                           markedThisPass++;
                           changed = true;
                       } else {
                           // Check if tendril path starts at source
                           const firstPoint = tendril.path[0];
                           if (!firstPoint || firstPoint.x !== source.x || firstPoint.y !== source.y) {
                               tendril.state = 'fading';
                               markedThisPass++;
                               changed = true;
                           }
                       }
                   }
               }
           });
           passes++;
       }

       if (markedThisPass > 0) {
           console.log(`%cPath Integrity: Marked ${markedThisPass} tendrils as fading (Pass ${passes})`, 'color: orange');
       }
  }, [getTendrilById, getSourceById]);

  const checkSourcesForRegeneration = useCallback(() => {
      // Only run regeneration logic if we have inactive sources
      const inactiveSources = sourcesRef.current.filter(s => !s.isActive);
      if (inactiveSources.length === 0) return;

      // Loop through inactive sources
      inactiveSources.forEach(source => {
          // If the source has accumulated enough energy from food consumption, regenerate it
          if (source.energy >= INITIAL_SOURCE_ENERGY * 0.25) { // Require 25% of initial energy to regenerate
              source.isActive = true;
              console.log(`%cSource ${source.id} regenerated with ${source.energy.toFixed(0)} energy!`, 'color: lime; font-weight: bold');

              // Create a new tendril from this source
              const tendrilId = getUniqueTendrilId(source.id);
              const newTendril = {
                  id: tendrilId,
                  sourceId: source.id,
                  path: [{ x: source.x, y: source.y }],
                  state: 'growing',
                  signalState: 'idle',
                  signalPosition: -1,
                  fractionalPos: 0,
                  opacity: 1,
                  isBranch: false,
                  parentId: null,
                  creationFrame: frameCountRef.current,
              };

              tendrilsRef.current.set(tendrilId, newTendril);

              // Mark the source cell as having this tendril
              if (isWithinBounds(source.x, source.y)) {
                  const cell = gridRef.current[source.y][source.x];
                  if (cell) {
                      cell.tendrilId = tendrilId;
                      cell.type = 'source'; // Ensure it's still marked as a source
                      cell.color = SOURCE_COLOR;
                      cell.opacity = 1;
                  }
              }
          }
          // If source has some energy but not enough to regenerate, log its progress
          else if (source.energy > 0) {
              if (frameCountRef.current % 300 === 0) { // Only log occasionally
                  const percentage = (source.energy / (INITIAL_SOURCE_ENERGY * 0.25) * 100).toFixed(0);
                  console.log(`Source ${source.id} has ${source.energy.toFixed(0)} energy (${percentage}% of needed energy for regeneration)`);
              }
          }
      });
  }, [isWithinBounds]);


  const drawGridAndElements = useCallback(() => {
       try {
           const canvas = canvasRef.current;
           if (!canvas) return;

           const context = canvas.getContext('2d');
           if (!context || !gridRef.current || !Array.isArray(gridRef.current) || gridRef.current.length === 0) {
               console.warn("Invalid grid or context in drawGridAndElements");
               return;
           }

           // Get grid dimensions safely
           const dims = gridDimensions.current || { width: 0, height: 0 };
           const gridHeight = gridRef.current.length;
           const gridWidth = gridRef.current[0]?.length || 0;

           if (gridWidth === 0 || gridHeight === 0) {
               console.warn("Grid has zero dimensions");
               return;
           }

           // Get canvas dimensions
           const canvasWidth = canvas.width;
           const canvasHeight = canvas.height;

           // Clear canvas
           context.clearRect(0, 0, canvasWidth, canvasHeight);

           // Count cell types occasionally
           if (frameCountRef.current % 120 === 0) {
               let cellCounts = { empty: 0, source: 0, tendril: 0, food: 0 };
               for (let y = 0; y < gridHeight; y++) {
                   if (!gridRef.current[y]) continue;
                   for (let x = 0; x < gridWidth; x++) {
                       const cellType = gridRef.current[y][x]?.type || 'empty';
                       cellCounts[cellType] = (cellCounts[cellType] || 0) + 1;
                   }
               }
               console.log(`Grid cell counts:`, cellCounts);
           }

           // Draw grid cells
           for (let y = 0; y < gridHeight; y++) {
               if (!gridRef.current[y] || !Array.isArray(gridRef.current[y])) continue;

               for (let x = 0; x < gridWidth; x++) {
                   const cell = gridRef.current[y][x];
                   if (!cell) continue;

                   // Default values if cells are incomplete
                   let drawColor = BACKGROUND_COLOR;
                   let cellOpacity = cell.opacity || 1.0;

                   // Skip empty cells for performance
                   if (cell.type === 'empty') continue;

                   // Handle different cell types
                   switch (cell.type) {
                       case 'source':
                           drawColor = SOURCE_COLOR;
                           break;

                       case 'food':
                           drawColor = FOOD_COLOR;
                           // Make food pulse slightly for visibility
                           const pulseAmount = Math.sin(frameCountRef.current * 0.1) * 0.3;
                           cellOpacity = 0.7 + (isNaN(pulseAmount) ? 0 : pulseAmount);

                           // Draw food with extra visibility
                           context.globalAlpha = cellOpacity;
                           context.fillStyle = drawColor;

                           // Draw slightly larger for better visibility
                           const foodSize = CELL_SIZE * 1.5;
                           const offset = (foodSize - CELL_SIZE) / 2;
                           context.fillRect(
                               x * CELL_SIZE - offset,
                               y * CELL_SIZE - offset,
                               foodSize, foodSize
                           );
                           continue; // Skip the standard drawing for food

                       case 'tendril': {
                           // Extract basic info safely
                           const tendrilIds = (cell.tendrilId || '').split(',').filter(Boolean);

                           // If we have no valid tendril IDs, treat as background
                           if (tendrilIds.length === 0) {
                               drawColor = BACKGROUND_COLOR;
                               cellOpacity = 0;
                               break;
                           }

                           // Get the first tendril (primary owner)
                           const tendril = getTendrilById(tendrilIds[0]);

                           if (tendril) {
                               // Base opacity from tendril
                               cellOpacity = tendril.opacity || 1.0;

                               // Calculate age and determine color
                               const creationFrame = cell.creationFrame || 0;
                               const age = calculateAge(creationFrame, frameCountRef.current);

                               if (tendril.state === 'reabsorbing') {
                                   // Use opacity for interpolation
                                   const t = tendril.opacity || 0;
                                   drawColor = interpolateColors(REABSORBING_COLOR_END, REABSORBING_COLOR_START, t);
                               } else if (tendril.state === 'fading') {
                                   drawColor = FADING_COLOR;
                               } else {
                                   // Normal growing/connected/blocked state
                                   drawColor = getColorFromAge(age);
                               }

                               // Highlight branch points
                               if (cell.isBranchPoint) {
                                   try {
                                       // Safety check for valid color
                                       if (typeof drawColor === 'string' && drawColor.startsWith('#')) {
                                           const [r, g, b] = parseHex(drawColor);

                                           // Brighten by 20% safely
                                           const brightenFactor = 1.2;
                                           const r2 = Math.min(255, Math.floor(r * brightenFactor));
                                           const g2 = Math.min(255, Math.floor(g * brightenFactor));
                                           const b2 = Math.min(255, Math.floor(b * brightenFactor));

                                           drawColor = `#${r2.toString(16).padStart(2, '0')}${
                                               g2.toString(16).padStart(2, '0')}${
                                               b2.toString(16).padStart(2, '0')}`;
                                       }
                                   } catch (colorErr) {
                                       console.error("Error brightening branch point:", colorErr);
                                       // Fall back to original color
                                   }
                               }
                           } else {
                               // Orphaned grid cell - display as background
                               drawColor = BACKGROUND_COLOR;
                               cellOpacity = 0;
                           }
                           break;
                       }
                   }

                   // Standard drawing for non-food cells
                   context.globalAlpha = cellOpacity;
                   context.fillStyle = drawColor;
                   context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
               }
           }

           // Reset global alpha
           context.globalAlpha = 1.0;

           // Draw signals
           context.fillStyle = SIGNAL_COLOR;
           tendrilsRef.current.forEach(tendril => {
               if (tendril && tendril.signalState === 'propagating' &&
                   tendril.signalPosition >= 0 &&
                   tendril.path && Array.isArray(tendril.path) &&
                   tendril.signalPosition < tendril.path.length) {

                   const signalCoord = tendril.path[tendril.signalPosition];
                   if (signalCoord && isWithinBounds(signalCoord.x, signalCoord.y)) {
                       // Draw signal with enhanced visibility
                       const opacity = Math.min(1.0, (tendril.opacity || 1.0) * PULSE_VISIBILITY);
                       context.globalAlpha = opacity;
                       context.fillRect(
                           signalCoord.x * CELL_SIZE,
                           signalCoord.y * CELL_SIZE,
                           CELL_SIZE, CELL_SIZE
                       );
                   }
               }
           });

           // Reset again
           context.globalAlpha = 1.0;

           // Draw energy info for sources
           if (sourcesRef.current && Array.isArray(sourcesRef.current)) {
               context.font = '12px monospace';
               sourcesRef.current.forEach((source, index) => {
                   if (source) {
                       const energyPercent = Math.floor(((source.energy || 0) / INITIAL_SOURCE_ENERGY) * 100);
                       const energyText = `S${index}: ${energyPercent}%`;

                       // Color based on energy level
                       if (source.isActive) {
                           if (energyPercent > 66) context.fillStyle = '#10B981'; // Green
                           else if (energyPercent > 33) context.fillStyle = '#F59E0B'; // Yellow
                           else context.fillStyle = '#EF4444'; // Red
                       } else {
                           context.fillStyle = '#6B7280'; // Gray
                       }

                       context.fillText(energyText, 10, 20 + index * 15);
                   }
               });
           }
       } catch (err) {
           console.error("Error in drawGridAndElements:", err);
       }
  }, [getTendrilById, isWithinBounds, calculateAge]);

  // --- Animation Loop ---
   const render = useCallback((timestamp) => {
       try {
           if (error) {
               console.error("Animation loop stopped due to error:", error);
               return;
           }

           const canvas = canvasRef.current;
           if (!canvas) {
               console.warn("Canvas reference not available in render loop");
               return;
           }

           // First time frame initialization log
           if (frameCountRef.current === 0) {
               console.log("%c🎮 GOLSurvival COMPONENT STARTED", "color: yellow; font-size: 16px; font-weight: bold");
           }

           const prevTime = currentTimeRef.current || timestamp;
           currentTimeRef.current = timestamp;
           const deltaTime = timestamp - prevTime;

           // Update frame counter
           frameCountRef.current++;

           // Performance logging
           if(frameCountRef.current % 300 === 0) {
               console.log(`%cFrame: ${frameCountRef.current} - DeltaTime: ${deltaTime.toFixed(2)}ms, FPS: ${(1000/deltaTime).toFixed(1)}`, 'color: gray');
           }

           // FOOD SPAWNING - Try every 2 seconds
           if (frameCountRef.current % 120 === 0) {
               try {
                   // Check if we already have a reasonable amount of food
                   const currentFoodPellets = foodPelletsRef.current.length;
                   // Count food cells
                   let foodCellCount = 0;
                   const dims = gridDimensions.current || { width: 0, height: 0 };

                   for (let y = 0; y < dims.height; y++) {
                       for (let x = 0; x < dims.width; x++) {
                           if (gridRef.current[y]?.[x]?.type === 'food') {
                               foodCellCount++;
                           }
                       }
                   }

                   console.log(`🍔 FOOD STATUS: ${currentFoodPellets} pellets, ${foodCellCount} cells`);

                   // Controlled food spawning, don't spawn if we have too much
                   if (currentFoodPellets < 3) {
                       console.log("Attempting food spawn...");
                       const success = spawnFoodPellets();
                       console.log(`Food spawn result: ${success ? 'SUCCESS' : 'FAILED'}`);
                   } else {
                       console.log("Skipping food spawn - already have sufficient food");
                   }
               } catch (foodErr) {
                   console.error("Error during food spawning:", foodErr);
               }
           }

           // Signal emission timing
           const currentParams = simParamsRef.current || { signalFrequency: 1.0 };
           const intervalMs = 1000 / (currentParams.signalFrequency || 1.0);
           const elapsedSinceLastEmit = currentTimeRef.current - lastSignalEmitTimeRef.current;

           // Main update steps with error handling
           try {
               // 1. Emit Signals when it's time
               if (elapsedSinceLastEmit >= intervalMs) {
                   emitSignal();
                   lastSignalEmitTimeRef.current = currentTimeRef.current;
               }
           } catch (signalErr) {
               console.error("Error emitting signals:", signalErr);
           }

           try {
               // 2. Propagate Signals
               const newlyReachedTips = propagateSignal(deltaTime) || new Set();

               // 3. Growth at tips
               triggerGrowthAtTips(newlyReachedTips);
           } catch (growthErr) {
               console.error("Error in propagation/growth:", growthErr);
           }

           try {
               // 4. Handle fading tendrils
               updateFadingTendrils();

               // 5. Path integrity checks (less frequent)
               if (frameCountRef.current % PATH_INTEGRITY_CHECK_INTERVAL === 0) {
                   verifyPathIntegrity();
               }
           } catch (updateErr) {
               console.error("Error in tendril updates:", updateErr);
           }

           // Draw the simulation
           try {
               drawGridAndElements();
           } catch (drawErr) {
               console.error("Error drawing simulation:", drawErr);
           }

           // Continue the animation loop
           animationFrameIdRef.current = window.requestAnimationFrame(render);

       } catch (mainErr) {
           console.error("Fatal error in render loop:", mainErr);
           setError(`Render error: ${mainErr.message || "Unknown error"}`);
           if (animationFrameIdRef.current) {
               window.cancelAnimationFrame(animationFrameIdRef.current);
               animationFrameIdRef.current = null;
           }
       }
   }, [error, emitSignal, propagateSignal, triggerGrowthAtTips, spawnFoodPellets,
      updateFadingTendrils, verifyPathIntegrity, drawGridAndElements]);


  // --- Initialization and Cleanup ---
  const initializeSimulation = useCallback(() => {
      console.log("Initializing simulation...");
      try {
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

          // Set up canvas with correct dimensions
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

          console.log(`Initializing grid: ${gridWidth}×${gridHeight}`);

          // Initialize grid with empty cells
          initializeGrid(gridWidth, gridHeight);
          // Place sources across the grid
          placeSources(NUM_SOURCES, gridWidth, gridHeight);
          // Create initial tendrils from sources
          initializeTendrils();

          setError(null); // Clear previous errors
          console.log("Simulation initialized successfully.");
          return true; // Indicate success
      } catch (err) {
          console.error("Initialization failed with error:", err);
          setError(`Initialization error: ${err.message || "Unknown error"}`);
          return false;
      }
  }, [initializeGrid, placeSources, initializeTendrils]);

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

  // Food spawning function
  const spawnFood = useCallback(() => {
    // Don't exceed max food
    if (foodCountRef.current >= simParamsRef.current.maxFood) {
      return;
    }

    const { width, height } = gridDimensions.current;

    // Random position within grid bounds
    const x = getRandomInt(width);
    const y = getRandomInt(height);

    const cell = gridRef.current[y]?.[x];

    if (cell && cell.type === 'empty') {
      cell.type = 'food';
      cell.creationFrame = frameCountRef.current;
      cell.color = FOOD_COLOR;
      foodCountRef.current++;

      // Debug logging
      console.log(`Food spawned at (${x}, ${y}), count: ${foodCountRef.current}`);
    }
  }, []);

  // Food count reference
  const foodCountRef = useRef(0);

  // --- NEW: Function to handle signal propagation at branch points ---
  const propagateSignalToBranches = useCallback((originTendril, branchCell, positionInPath) => {
      if (!branchCell || !branchCell.isBranchPoint || !branchCell.tendrilId) {
          console.warn("Invalid call to propagateSignalToBranches: Missing data.");
          return;
      }

      const allTendrilIds = branchCell.tendrilId.split(',');
      // console.log(`Propagating signal at branch point (${branchCell.x},${branchCell.y}). IDs: ${allTendrilIds.join(',')}`);

      allTendrilIds.forEach(branchTendrilId => {
          // Skip propagating back to the tendril the signal came from
          if (branchTendrilId === originTendril.id) return;

          const branchTendril = getTendrilById(branchTendrilId);
          if (!branchTendril) {
              console.warn(`Branch tendril ${branchTendrilId} not found during signal propagation.`);
              return;
          }

          // Only propagate to active, idle tendrils
          if (branchTendril.signalState !== 'idle' || (branchTendril.state !== 'growing' && branchTendril.state !== 'connected')) {
              return;
          }

          // Find where this branch point is in the branch's path
          // Use the actual branchCell coordinates for matching
          const branchPointCoords = { x: branchCell.x, y: branchCell.y }; // Need to ensure branchCell has coords or get them
          const branchPointIndexInBranch = branchTendril.path.findIndex(p => p.x === branchPointCoords.x && p.y === branchPointCoords.y);


          if (branchPointIndexInBranch === -1) {
               console.warn(`Branch point (${branchPointCoords.x}, ${branchPointCoords.y}) not found in path of branch ${branchTendril.id}. Cannot propagate signal.`);
              // Maybe add approximate matching later if needed
          } else {
              // console.log(`  -> Propagating signal to branch ${branchTendril.id} starting at index ${branchPointIndexInBranch}`);
              branchTendril.signalState = 'propagating';
              // Start signal propagation from the *next* cell in the branch path
              branchTendril.signalPosition = branchPointIndexInBranch + 1;
              branchTendril.fractionalPos = branchPointIndexInBranch + 1;
              // Ensure signal doesn't go out of bounds immediately
              if(branchTendril.signalPosition >= branchTendril.path.length) {
                 branchTendril.signalState = 'reached_tip'; // Mark as reached if branch is only 1 cell long past point
                 branchTendril.signalPosition = branchTendril.path.length - 1;
                 branchTendril.fractionalPos = branchTendril.path.length - 1;
              }
          }
      });
  }, [getTendrilById]); // Depends on getTendrilById

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
