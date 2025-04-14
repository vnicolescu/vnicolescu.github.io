import React, { useRef, useEffect, useState } from 'react';

// Simulation Constants (Defaults)
const CELL_SIZE = 4;
const NUM_SOURCES = 2;
const GROWTH_STEP = 1;
const PULSE_LENGTH = 3;
const DEFAULT_PULSE_GENERATION_INTERVAL = 30; // Default: ~2 Hz at 60fps
const DEFAULT_PULSE_ADVANCE_INTERVAL = 1; // Default: Doubled speed (was 2)
const DEFAULT_BRANCH_CHANCE = 0.15; // Slightly increased default
const DEFAULT_FADE_SPEED = 0.02;
const FLASH_DURATION_FRAMES = 15;

// Colors (using your palette)
const SOURCE_COLOR = '#6366F1'; // Indigo Flame from palette
const BACKGROUND_COLOR = '#000000'; // Changed to black for overlay effect
const GRID_COLOR = '#374151';
const TENDRIL_COLOR = '#1E3A8A'; // Changed to navy blue per user request
const PULSE_BRIGHT_COLOR = '#FFFFFF'; // Changed to white per user request
const PULSE_MID_COLOR = '#E5E7EB'; // Slightly dimmer white
const PULSE_DIM_COLOR = '#9CA3AF'; // Even dimmer white/gray
const FLASH_COLOR = '#FFFFFF';
const CONNECTION_COLOR = '#F59E0B'; // Solar Amber from palette
const FADING_COLOR = '#4B5563';

// --- NEW: Directional Definitions ---
// Order: TL, T, TR, L, R, BL, B, BR (indices 0-7)
const DIRECTIONS = [
  { dx: -1, dy: -1, index: 0, name: 'TL' }, { dx: 0, dy: -1, index: 1, name: 'T' }, { dx: 1, dy: -1, index: 2, name: 'TR' },
  { dx: -1, dy: 0, index: 3, name: 'L' }, /* Center placeholder */          { dx: 1, dy: 0, index: 4, name: 'R' },
  { dx: -1, dy: 1, index: 5, name: 'BL' }, { dx: 0, dy: 1, index: 6, name: 'B' }, { dx: 1, dy: 1, index: 7, name: 'BR' },
];

const getDirectionIndex = (dx, dy) => {
    // Ensure dx, dy are within [-1, 0, 1]
    const normDx = Math.sign(dx);
    const normDy = Math.sign(dy);
    if (normDx === 0 && normDy === 0) return -1; // Center
    const dir = DIRECTIONS.find(d => d.dx === normDx && d.dy === normDy);
    return dir ? dir.index : -1;
}

// Helper for weighted random selection
const weightedRandomSelect = (options) => { // options: [{ item: neighbor, weight: number }]
    const validOptions = options.filter(o => o.weight > 0);
    const totalWeight = validOptions.reduce((sum, option) => sum + option.weight, 0);

    if (totalWeight <= 0) {
        // If no positive weights, maybe fall back to uniform random chance among available?
        // Or just return null if truly no options
        if (options.length === 0) return null;
        // Fallback: pick random from original options if all weights were zero
        return options[Math.floor(Math.random() * options.length)].item;
    }

    let random = Math.random() * totalWeight;
    for (const option of validOptions) {
        if (random < option.weight) {
            return option.item;
        }
        random -= option.weight;
    }
    // Fallback for floating point issues
    return validOptions.length > 0 ? validOptions[validOptions.length - 1].item : null;
};

// Utility to get random integer
const getRandomInt = (max) => Math.floor(Math.random() * max);
// Utility for unique IDs
let tendrilCounter = 0;
const getUniqueTendrilId = (sourceId) => `t-${sourceId}-${tendrilCounter++}`;
let pulseCounter = 0;
const getUniquePulseId = () => `p-${pulseCounter++}`;

const GameOfLifeCanvas = () => {
  const canvasRef = useRef(null);
  const gridRef = useRef([]);
  const sourcesRef = useRef([]);
  const tendrilsRef = useRef([]);
  const connectionsRef = useRef([]);
  const pulsesRef = useRef([]);
  const frameCountRef = useRef(0);

  // --- State for Simulation Parameters ---
  const [pulseGenerationInterval, setPulseGenerationInterval] = useState(DEFAULT_PULSE_GENERATION_INTERVAL);
  const [pulseAdvanceInterval, setPulseAdvanceInterval] = useState(DEFAULT_PULSE_ADVANCE_INTERVAL);
  const [branchChance, setBranchChance] = useState(DEFAULT_BRANCH_CHANCE);
  const [fadeSpeed, setFadeSpeed] = useState(DEFAULT_FADE_SPEED);
  // --- NEW: State for Directional Weights ---
  const [directionWeights, setDirectionWeights] = useState(Array(8).fill(1)); // Default weight of 1 for all 8 directions

  // Use refs to hold the current state values for use inside animation frame
  const simParamsRef = useRef({
    pulseGenerationInterval,
    pulseAdvanceInterval,
    branchChance,
    fadeSpeed,
    directionWeights, // Add weights to ref
  });

  // Update refs whenever state changes
  useEffect(() => {
    simParamsRef.current = {
      pulseGenerationInterval,
      pulseAdvanceInterval,
      branchChance,
      fadeSpeed,
      directionWeights, // Update ref
    };
  }, [pulseGenerationInterval, pulseAdvanceInterval, branchChance, fadeSpeed, directionWeights]);

  // Helper to get neighbors (Check for existing connections)
  const getNeighbors = (x, y, gridWidth, gridHeight, currentSourceId) => {
    const neighbors = { empty: [], collision: [], selfCollision: [] }; // Add selfCollision key
    const directions = [
        [-1, -1], [-1, 0], [-1, 1],
        [ 0, -1],          [ 0, 1],
        [ 1, -1], [ 1, 0], [ 1, 1]
    ];
    for (const [dx, dy] of directions) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < gridWidth && ny >= 0 && ny < gridHeight) {
            const cell = gridRef.current[ny]?.[nx];
            if (!cell) continue;

            if (cell.type === 'empty') {
                neighbors.empty.push({ x: nx, y: ny });
            } else if (cell.type === 'tendril' || cell.type === 'source') {
                if (cell.sourceId === currentSourceId) {
                    // Collision with self - check if it's the immediate predecessor later
                    neighbors.selfCollision.push({ x: nx, y: ny });
                } else {
                    // Collision with other source
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
    }
    return neighbors;
};

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext('2d');
    if (!context) return;

    // Initialize grid dimensions and reset state
    let gridWidth, gridHeight;
    let animationFrameId = null; // Declare animationFrameId here

    const initializeSimulation = () => {
        canvas.width = window.innerWidth - 40;
        canvas.height = window.innerHeight - 40;
        gridWidth = Math.floor(canvas.width / CELL_SIZE);
        gridHeight = Math.floor(canvas.height / CELL_SIZE);

        // Reset state for fresh start
        tendrilCounter = 0;
        pulseCounter = 0;
        frameCountRef.current = 0;
        gridRef.current = Array(gridHeight).fill(null).map(() =>
            Array(gridWidth).fill({ type: 'empty', color: BACKGROUND_COLOR })
        );
        sourcesRef.current = [];
        tendrilsRef.current = [];
        connectionsRef.current = [];
        pulsesRef.current = []; // Reset pulses

        // Initialize Sources and Initial Tendrils
        for (let i = 0; i < NUM_SOURCES; i++) {
            let x, y, attempts = 0;
            do {
                x = getRandomInt(gridWidth);
                y = getRandomInt(gridHeight);
                attempts++;
            } while (
                (gridRef.current[y]?.[x]?.type !== 'empty' ||
                 sourcesRef.current.some(s => Math.abs(s.x - x) < 10 && Math.abs(s.y - y) < 10)) && // Increased spacing
                 attempts < 100
            );

            if (attempts < 100) {
                 const sourceId = i;
                 // Ensure sources are not placed out of bounds
                 if (y >= 0 && y < gridHeight && x >= 0 && x < gridWidth) {
                     gridRef.current[y][x] = { type: 'source', color: SOURCE_COLOR, sourceId };
                     sourcesRef.current.push({ x, y, id: sourceId });
                     const initialTendrilId = getUniqueTendrilId(sourceId);
                     tendrilsRef.current.push({
                        id: initialTendrilId, sourceId: sourceId,
                        path: [{ x, y }], state: 'growing', pulsePosition: 0, opacity: 1,
                     });
                     gridRef.current[y][x].tendrilId = initialTendrilId; // Mark source cell with initial tendril ID
                 } else {
                    // console.warn(`Attempted to place source ${i} out of bounds at (${x}, ${y})`);
                 }
            }
        }
        console.log("Initialized Simulation with Sources:", sourcesRef.current.length);
    };


    // --- Simulation Logic ---

    // Function to find a tendril object by its ID
    const findTendrilById = (id) => tendrilsRef.current.find(t => t.id === id);

    // *** NEW: Spawn Pulses Periodically ***
    const spawnPulses = () => {
        tendrilsRef.current.forEach(tendril => {
            // Only spawn pulses for tendrils that are still growing or connected (pulses might still travel on connected paths visually)
            if (tendril.state === 'growing' || tendril.state === 'connected') {
                 // Prevent spawning too many pulses on very short/new tendrils?
                 // Only spawn if no other pulse is currently near the start?
                 const nearStartPulse = pulsesRef.current.some(p => p.tendrilId === tendril.id && p.position < PULSE_LENGTH);
                 if (!nearStartPulse) {
                     pulsesRef.current.push({
                        id: getUniquePulseId(),
                        tendrilId: tendril.id,
                        position: 0, // Start at the beginning of the path
                     });
                 }
            }
        });
    };

    // *** NEW: Advance Pulses and Trigger Growth (with Disconnection Check) ***
    const advancePulses = () => {
        const pulsesToRemove = [];
        const growthTendrils = new Set();

        pulsesRef.current.forEach((pulse, index) => {
            const tendril = findTendrilById(pulse.tendrilId);
            if (!tendril || tendril.state === 'fading' || tendril.state === 'blocked' || tendril.state === 'collided') {
                pulsesToRemove.push(index);
                return;
            }

            // --- Disconnection Check ---
            const currentPulseCoord = tendril.path[pulse.position];
            if (currentPulseCoord) {
                const gridCell = gridRef.current[currentPulseCoord.y]?.[currentPulseCoord.x];
                if (!gridCell || (gridCell.type !== 'tendril' && gridCell.type !== 'source') || gridCell.tendrilId !== tendril.id) {
                    // Path is broken where the pulse is!
                    console.log(`Tendril ${tendril.id} detected disconnection at pulse position ${pulse.position}. Triggering fade.`);
                    tendril.state = 'fading';
                    tendril.opacity = Math.min(tendril.opacity, 0.1); // Start fading fast
                    pulsesToRemove.push(index); // Remove this pulse
                    return; // Stop processing this pulse
                }
            }
            // --- End Disconnection Check ---

            pulse.position++;

            // Check if pulse reached the end
            if (pulse.position >= tendril.path.length - 1) {
                if (tendril.state === 'growing') {
                    growthTendrils.add(tendril.id);
                }
                pulsesToRemove.push(index);
            } else if (pulse.position >= tendril.path.length) {
                pulsesToRemove.push(index);
            }
        });

        // Remove finished/orphaned/disconnected pulses
        for (let i = pulsesToRemove.length - 1; i >= 0; i--) {
            pulsesRef.current.splice(pulsesToRemove[i], 1);
        }

        // Trigger growth attempts
        growthTendrils.forEach(tendrilId => {
            const tendril = findTendrilById(tendrilId);
            if (tendril) {
                tryGrowTendril(tendril);
            }
        });
    };

    // *** Growth logic for a single tendril (Uses Directional Weights) ***
    const tryGrowTendril = (tendril) => {
        const gridUpdates = new Map();
        const newBranches = [];
        const newlyConnectedSources = new Set();
        let currentHead = tendril.path[tendril.path.length - 1];
        let previousCell = tendril.path.length > 1 ? tendril.path[tendril.path.length - 2] : null;
        const currentWeights = simParamsRef.current.directionWeights; // Get weights from ref

        if (!currentHead) {
             console.warn(`Tendril ${tendril.id} has no head? Path:`, tendril.path);
             tendril.state = 'blocked';
             return;
         }

        // --- Growth Loop (only 1 step now) ---
        if (currentHead.x < 0 || currentHead.x >= gridWidth || currentHead.y < 0 || currentHead.y >= gridHeight) {
            tendril.state = 'blocked';
            return;
        }

        const neighbors = getNeighbors(currentHead.x, currentHead.y, gridWidth, gridHeight, tendril.sourceId);

        // --- Collision Check ---
        if (neighbors.collision.length > 0) {
            // ... (Collision logic remains the same)
             return; // Stop growth attempt after collision
        }

        // Filter out the immediate previous cell
        const validEmptyNeighbors = neighbors.empty.filter(n =>
            !(previousCell && n.x === previousCell.x && n.y === previousCell.y)
        );

        // Filter out cells already in this tendril's path
        const nonSelfNeighbors = validEmptyNeighbors.filter(n =>
            !tendril.path.some(p => p.x === n.x && p.y === n.y)
        );

         // Prepare neighbors with weights for weighted selection
         const weightedNeighbors = nonSelfNeighbors.map(neighbor => {
             const dx = neighbor.x - currentHead.x;
             const dy = neighbor.y - currentHead.y;
             const dirIndex = getDirectionIndex(dx, dy);
             const weight = (dirIndex !== -1 && currentWeights[dirIndex] !== undefined) ? currentWeights[dirIndex] : 0; // Default to 0 if direction invalid or weight missing
             return { item: neighbor, weight: weight };
         }).filter(n => n.weight > 0); // Only consider neighbors with positive weight

         // --- Blocked Check ---
         if (weightedNeighbors.length === 0) {
             // Blocked if no valid neighbors OR no valid neighbors with positive weight
             tendril.state = 'blocked';
             // console.log(`Tendril ${tendril.id} blocked (no valid weighted neighbors)`);
             return;
         }

        // --- Weighted Selection for Growth ---
        const nextCell = weightedRandomSelect(weightedNeighbors);
        if (!nextCell) { // Should not happen if weightedNeighbors.length > 0
             console.warn(`Weighted random selection failed for tendril ${tendril.id}`);
             tendril.state = 'blocked';
             return;
         }

        // --- Branching Logic (Uses Weighted Selection) ---
        if (tendril.state === 'growing' && tendril.path.length > 5 && weightedNeighbors.length > 1 && Math.random() < simParamsRef.current.branchChance) {
            // Find potential branch targets (neighbors other than the chosen nextCell)
            const potentialBranchTargets = weightedNeighbors.filter(n => n.item.x !== nextCell.x || n.item.y !== nextCell.y);

            if (potentialBranchTargets.length > 0) {
                const branchTarget = weightedRandomSelect(potentialBranchTargets); // Select branch target based on weights
                if (branchTarget) {
                    const branchId = getUniqueTendrilId(tendril.sourceId);
                    const branchTendril = {
                        id: branchId,
                        sourceId: tendril.sourceId,
                        path: [...tendril.path, branchTarget],
                        state: 'growing',
                        pulsePosition: 0,
                        opacity: 1,
                    };
                    newBranches.push(branchTendril);
                    gridUpdates.set(`${branchTarget.y}-${branchTarget.x}`, { type: 'tendril', color: TENDRIL_COLOR, tendrilId: branchId, sourceId: tendril.sourceId });
                    // console.log(`Tendril ${tendril.id} branched to ${branchId} towards ${branchTarget.x},${branchTarget.y}`);
                }
            }
        }

        // --- Apply Growth ---
        // Set grid data for the chosen next cell
        const gridCellData = { type: 'tendril', color: TENDRIL_COLOR, tendrilId: tendril.id, sourceId: tendril.sourceId };
        gridUpdates.set(`${nextCell.y}-${nextCell.x}`, gridCellData);
        // Add the cell to the tendril's path
        tendril.path.push(nextCell);
        // currentHead = nextCell; // Update head if GROWTH_STEP > 1 was used
        // previousCell = tendril.path[tendril.path.length - 2];

        // --- Apply Updates ---
        gridUpdates.forEach((update, key) => {
            const [y, x] = key.split('-').map(Number);
            if (gridRef.current[y]?.[x]) {
                 // Don't overwrite existing connections with tendril updates from growth
                 if (gridRef.current[y][x].type !== 'connection') {
                    gridRef.current[y][x] = { ...gridRef.current[y][x], ...update };
                 }
            }
        });
        tendrilsRef.current.push(...newBranches);
        if (newlyConnectedSources.size > 0) {
            // ... (fading logic, same)
        }
    };

    // --- Fading Logic Implementation (Rule #9) ---
    const fadeTendrils = () => {
        const tendrilsToRemove = [];
        const gridUpdates = new Map();
        const currentFadeSpeed = simParamsRef.current.fadeSpeed; // Use state value

        tendrilsRef.current.forEach((tendril, index) => {
             if (tendril.state === 'fading' || tendril.state === 'blocked' || tendril.state === 'collided') {
                tendril.opacity -= currentFadeSpeed;

                if (tendril.opacity <= 0) {
                    tendrilsToRemove.push(index);
                    // Clear path from grid
                    tendril.path.forEach(p => {
                        const cellKey = `${p.y}-${p.x}`;
                        const currentCell = gridRef.current[p.y]?.[p.x];
                        if (currentCell && currentCell.tendrilId === tendril.id && currentCell.type !== 'source' && currentCell.type !== 'connection') {
                            gridUpdates.set(cellKey, { type: 'empty', color: BACKGROUND_COLOR, tendrilId: null, sourceId: null, connectionId: null });
                        }
                    });
                } else {
                     // Update color on grid to indicate fading
                     tendril.path.forEach(p => {
                         const cellKey = `${p.y}-${p.x}`;
                         const currentCell = gridRef.current[p.y]?.[p.x];
                        if (currentCell && currentCell.tendrilId === tendril.id && currentCell.type === 'tendril') {
                             gridUpdates.set(cellKey, { ...currentCell, color: FADING_COLOR });
                        }
                     });
                }
            }
        });

         // Apply grid updates for fading/clearing atomically
        gridUpdates.forEach((update, key) => {
            const [y, x] = key.split('-').map(Number);
             if (gridRef.current[y]?.[x]) {
                 gridRef.current[y][x] = update;
            }
        });

        // Remove tendrils that have completely faded
        for (let i = tendrilsToRemove.length - 1; i >= 0; i--) {
            tendrilsRef.current.splice(tendrilsToRemove[i], 1);
        }
    };

    // --- Connection Update Logic (Flash Timer) ---
    const updateConnections = () => {
        const gridUpdates = new Map();
        connectionsRef.current.forEach(conn => {
            if (conn.state === 'flashing') {
                conn.flashTimer -= 1;
                if (conn.flashTimer <= 0) {
                    conn.state = 'connected';
                    conn.path.forEach(p => {
                        const cellKey = `${p.y}-${p.x}`;
                         const currentCell = gridRef.current[p.y]?.[p.x];
                         // Only update if it's still a connection cell (wasn't overwritten)
                         if (currentCell?.type === 'connection' && currentCell.connectionId === conn.id) {
                             gridUpdates.set(cellKey, { ...currentCell, color: CONNECTION_COLOR });
                         }
                    });
                }
            }
        });

        // Apply grid updates for connection state changes atomically
        gridUpdates.forEach((update, key) => {
            const [y, x] = key.split('-').map(Number);
            if (gridRef.current[y]?.[x]) {
                 gridRef.current[y][x] = { ...gridRef.current[y][x], ...update };
            }
        });
    };


    // --- Drawing Logic ---
    const drawGridAndElements = () => {
        if (!context || !gridRef.current?.length) return; // Ensure context and grid exist
        context.clearRect(0, 0, canvas.width, canvas.height);

        // 1. Draw Grid Background & Static Elements
        for (let y = 0; y < gridHeight; y++) {
            for (let x = 0; x < gridWidth; x++) {
                const cell = gridRef.current[y]?.[x];
                if (!cell) continue;
                context.fillStyle = cell.color;
                context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
        }

        // 2. Draw Tendrils (Overlaying Pulses and Fading)
        tendrilsRef.current.forEach(tendril => {
            const pathLength = tendril.path.length;
            if (tendril.opacity <= 0) return;

            context.globalAlpha = tendril.opacity;

            for (let i = 0; i < pathLength; i++) {
                const cellCoord = tendril.path[i];
                // Boundary check for coordinates
                if (cellCoord.y < 0 || cellCoord.y >= gridHeight || cellCoord.x < 0 || cellCoord.x >= gridWidth) continue;

                const gridCell = gridRef.current[cellCoord.y]?.[cellCoord.x];

                if (!gridCell || (gridCell.type !== 'source' && gridCell.tendrilId !== tendril.id) || gridCell.type === 'connection') {
                    continue;
                }

                let drawColor = gridCell.color;

                 if (tendril.state === 'growing' && tendril.opacity > 0.1) {
                    const distanceFromEnd = pathLength - 1 - i;
                    if (distanceFromEnd === 0 && pathLength > 1) drawColor = PULSE_BRIGHT_COLOR;
                    else if (distanceFromEnd === 1 && pathLength > 2) drawColor = PULSE_MID_COLOR;
                    else if (distanceFromEnd === 2 && pathLength > 3) drawColor = PULSE_DIM_COLOR;
                 } else if (tendril.state === 'fading' || tendril.state === 'blocked' || tendril.state === 'collided') {
                      // Color is already set to FADING_COLOR by the fadeTendrils logic via gridUpdates
                      // We just need to respect the opacity
                 }

                context.fillStyle = drawColor;
                context.fillRect(cellCoord.x * CELL_SIZE, cellCoord.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
             context.globalAlpha = 1.0;
        });

        // *** NEW: 3. Draw Pulses (Leading Edge Orange) ***
        context.globalAlpha = 1.0; // Pulses are full opacity
        pulsesRef.current.forEach(pulse => {
            const tendril = findTendrilById(pulse.tendrilId);
            if (!tendril || tendril.opacity <= 0) return;

            for (let i = 0; i < PULSE_LENGTH; i++) {
                const pulseSegmentPos = pulse.position - i;
                if (pulseSegmentPos >= 0 && pulseSegmentPos < tendril.path.length) {
                    const cellCoord = tendril.path[pulseSegmentPos];
                    if (cellCoord.y < 0 || cellCoord.y >= gridHeight || cellCoord.x < 0 || cellCoord.x >= gridWidth) continue;
                    const gridCell = gridRef.current[cellCoord.y]?.[cellCoord.x];

                    if (gridCell && (gridCell.type === 'source' || gridCell.tendrilId === tendril.id) && gridCell.type !== 'connection') {
                         let pulseColor;
                         if (i === 0) pulseColor = CONNECTION_COLOR; // Leading edge is Orange/Amber
                         else if (i === 1) pulseColor = PULSE_BRIGHT_COLOR; // Trail is White
                         else pulseColor = PULSE_MID_COLOR; // Trail gets dimmer (was PULSE_DIM_COLOR)

                         context.globalAlpha = tendril.opacity;
                         context.fillStyle = pulseColor;
                         context.fillRect(cellCoord.x * CELL_SIZE, cellCoord.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                         context.globalAlpha = 1.0;
                    }
                }
            }
        });
    };


    // --- Animation Loop ---
    // let animationFrameId = null; // Moved declaration up
    const render = () => {
        if (!canvasRef.current) return; // Stop if component unmounted
        frameCountRef.current++;

        // --- Simulation Steps ---
        const { pulseGenerationInterval: currentGenInterval, pulseAdvanceInterval: currentAdvanceInterval } = simParamsRef.current;

        // Spawn new pulses periodically using state value
        if (currentGenInterval > 0 && frameCountRef.current % Math.round(currentGenInterval) === 0) {
            spawnPulses();
        }
        // Advance existing pulses using state value
        if (currentAdvanceInterval > 0 && frameCountRef.current % Math.round(currentAdvanceInterval) === 0) {
             advancePulses();
        }
        // Update fading and connection states every frame
        fadeTendrils();
        updateConnections();

        // --- Drawing Step ---
        drawGridAndElements();

        animationFrameId = window.requestAnimationFrame(render);
    };

    // Add resize listener
    const handleResize = () => {
        // Stop existing animation loop before re-initializing
        if (animationFrameId) {
            window.cancelAnimationFrame(animationFrameId);
            animationFrameId = null; // Reset the ID
        }
        // Re-initialize simulation with new dimensions
        initializeSimulation();
        // Restart the animation loop
        if (canvasRef.current) { // Ensure canvas still exists
             render();
        }
    };

    window.addEventListener('resize', handleResize);

    // Initial setup
    initializeSimulation();
    render(); // Start the loop

    // Cleanup function
    return () => {
      if (animationFrameId) {
          window.cancelAnimationFrame(animationFrameId);
      }
      window.removeEventListener('resize', handleResize);
    };
  }, []); // Empty dependency array ensures this runs only once on mount

  // --- UI Elements (Added Directional Grid) ---

  const handleWeightChange = (index, value) => {
    const newWeights = [...directionWeights];
    // Ensure weight is a non-negative number
    const numValue = Math.max(0, Number(value) || 0);
    newWeights[index] = numValue;
    setDirectionWeights(newWeights);
  };

  return (
    <div className="relative w-full h-screen bg-black flex flex-col items-center justify-center p-5">
      <canvas
        ref={canvasRef}
        id="gameOfLifeCanvas"
        className="border border-indigo-500 flex-grow"
      >
        Your browser does not support the canvas element.
      </canvas>
      {/* Controls Container */}
      <div className="absolute bottom-4 left-4 flex space-x-6">
          {/* Parameter Sliders */}
          <div className="bg-gray-800 bg-opacity-80 p-4 rounded text-white text-xs space-y-2 w-48">
                {/* Pulse Interval Slider */}
                <div className="flex items-center justify-between">
                  <label htmlFor="pulseGen" className="flex-1">Pulse Interval:</label>
                  <input
                    type="range" id="pulseGen" min="5" max="120" step="1"
                    value={pulseGenerationInterval}
                    onChange={(e) => setPulseGenerationInterval(Number(e.target.value))}
                    className="w-20 mx-2"
                  />
                  <span className="w-6 text-right">{pulseGenerationInterval}</span>
                </div>
                 {/* Pulse Speed Slider */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="pulseAdv" className="flex-1">Pulse Speed:</label>
                   <input
                      type="range" id="pulseAdv" min="1" max="10" step="1"
                      value={pulseAdvanceInterval}
                      onChange={(e) => setPulseAdvanceInterval(Number(e.target.value))}
                      className="w-20 mx-2"
                   />
                   <span className="w-6 text-right">{pulseAdvanceInterval}</span>
                 </div>
                 {/* Branch Chance Slider */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="branch" className="flex-1">Branch Chance:</label>
                   <input
                      type="range" id="branch" min="0" max="0.5" step="0.01"
                      value={branchChance}
                      onChange={(e) => setBranchChance(Number(e.target.value))}
                      className="w-20 mx-2"
                   />
                   <span className="w-6 text-right">{(branchChance * 100).toFixed(0)}%</span>
                 </div>
                  {/* Fade Speed Slider */}
                  <div className="flex items-center justify-between">
                    <label htmlFor="fade" className="flex-1">Fade Speed:</label>
                    <input
                      type="range" id="fade" min="0.001" max="0.1" step="0.001"
                      value={fadeSpeed}
                      onChange={(e) => setFadeSpeed(Number(e.target.value))}
                      className="w-20 mx-2"
                    />
                    <span className="w-6 text-right">{fadeSpeed.toFixed(3)}</span>
                  </div>
            </div>

            {/* Directional Weights Grid */}
             <div className="bg-gray-800 bg-opacity-80 p-2 rounded text-white text-xs">
                 <label className="block text-center mb-1 font-semibold">Growth Bias</label>
                 <div className="grid grid-cols-3 gap-1 w-24">
                    {[0, 1, 2, 3, -1, 4, 5, 6, 7].map((dirIndex) => (
                      <input
                        key={dirIndex === -1 ? 'center' : DIRECTIONS[dirIndex].name}
                        type="number"
                        min="0"
                        step="0.1"
                        value={dirIndex === -1 ? '' : directionWeights[dirIndex]}
                        onChange={dirIndex === -1 ? undefined : (e) => handleWeightChange(dirIndex, e.target.value)}
                        disabled={dirIndex === -1}
                        title={dirIndex === -1 ? 'Center' : DIRECTIONS[dirIndex].name}
                        className={`
                          w-full h-6 p-0.5 text-center rounded bg-gray-700 text-white text-xs
                          border border-gray-600 focus:outline-none focus:ring-1 focus:ring-indigo-500
                          ${dirIndex === -1 ? 'bg-gray-600 cursor-not-allowed' : 'hover:bg-gray-600'}
                        `}
                      />
                    ))}
                 </div>
             </div>
        </div>
    </div>
  );
};

export default GameOfLifeCanvas;
