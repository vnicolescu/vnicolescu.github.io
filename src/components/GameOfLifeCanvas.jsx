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

  // Use refs to hold the current state values for use inside animation frame
  const simParamsRef = useRef({
    pulseGenerationInterval,
    pulseAdvanceInterval,
    branchChance,
    fadeSpeed,
  });

  // Update refs whenever state changes
  useEffect(() => {
    simParamsRef.current = {
      pulseGenerationInterval,
      pulseAdvanceInterval,
      branchChance,
      fadeSpeed,
    };
  }, [pulseGenerationInterval, pulseAdvanceInterval, branchChance, fadeSpeed]);

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

    // *** NEW: Advance Pulses and Trigger Growth ***
    const advancePulses = () => {
        const pulsesToRemove = [];
        const growthTendrils = new Set(); // Tendrils that need to grow this step

        pulsesRef.current.forEach((pulse, index) => {
            const tendril = findTendrilById(pulse.tendrilId);
            if (!tendril || tendril.state === 'fading' || tendril.state === 'blocked' || tendril.state === 'collided') {
                // Remove pulse if its tendril is gone or dead
                pulsesToRemove.push(index);
                return;
            }

            pulse.position++;

            // Check if pulse reached the end of the current path
            if (pulse.position >= tendril.path.length -1 ) {
                 if (tendril.state === 'growing') { // Only grow if tendril is in growing state
                    growthTendrils.add(tendril.id); // Mark tendril for growth attempt
                 }
                 // Remove the pulse once it reaches the end (triggers growth or just finishes)
                 pulsesToRemove.push(index);
            } else if (pulse.position >= tendril.path.length) {
                 // Safety check: remove pulse if it somehow went past the end
                 pulsesToRemove.push(index);
            }
        });

        // Remove finished/orphaned pulses (iterate backwards)
        for (let i = pulsesToRemove.length - 1; i >= 0; i--) {
            pulsesRef.current.splice(pulsesToRemove[i], 1);
        }

        // Trigger growth attempts for marked tendrils
        growthTendrils.forEach(tendrilId => {
            const tendril = findTendrilById(tendrilId);
            if (tendril) {
                tryGrowTendril(tendril); // Call the (renamed/refactored) growth function
            }
        });
    };

    // *** RENAMED/REFACTORED: Growth logic for a single tendril ***
    const tryGrowTendril = (tendril) => {
        const gridUpdates = new Map();
        const newBranches = [];
        const newlyConnectedSources = new Set(); // Keep track locally for fading trigger
        let currentHead = tendril.path[tendril.path.length - 1];
        let previousCell = tendril.path.length > 1 ? tendril.path[tendril.path.length - 2] : null;
        let hasGrown = false;

        for (let step = 0; step < GROWTH_STEP; step++) {
             if (!currentHead || currentHead.x < 0 || currentHead.x >= gridWidth || currentHead.y < 0 || currentHead.y >= gridHeight) {
                 tendril.state = 'blocked'; break;
             }
            const neighbors = getNeighbors(currentHead.x, currentHead.y, gridWidth, gridHeight, tendril.sourceId);

            // Filter out the immediate previous cell to prevent immediate backtracking
            const validEmptyNeighbors = neighbors.empty.filter(n =>
                !(previousCell && n.x === previousCell.x && n.y === previousCell.y)
            );

            // Filter out cells that are part of this tendril's path (self-collision)
            const nonSelfNeighbors = validEmptyNeighbors.filter(n =>
                !tendril.path.some(p => p.x === n.x && p.y === n.y)
            );

            // Check for collision with other source tendrils first
            if (neighbors.collision.length > 0) {
                const collision = neighbors.collision[0];
                // TODO: Implement proper connection logic (flash, etc.)
                tendril.state = 'collided';
                 console.log(`Tendril ${tendril.id} collided with source ${collision.otherSourceId}`);
                 // Mark the other tendril as collided too, if found
                 const otherTendril = findTendrilById(collision.otherTendrilId);
                 if (otherTendril && otherTendril.state === 'growing') {
                     otherTendril.state = 'collided';
                 }
                 // Add connection
                 const connectionId = `c-${tendril.sourceId}-${collision.otherSourceId}`;
                 if (!connectionsRef.current.some(c => c.id === connectionId)) {
                      connectionsRef.current.push({
                           id: connectionId,
                           sourceId1: tendril.sourceId,
                           sourceId2: collision.otherSourceId,
                           path: [currentHead, {x: collision.x, y: collision.y}], // Simple path for now
                           state: 'flashing',
                           flashTimer: FLASH_DURATION_FRAMES,
                       });
                      // Mark colliding cells as connection points
                      gridUpdates.set(`${currentHead.y}-${currentHead.x}`, { type: 'connection', color: FLASH_COLOR, connectionId });
                      gridUpdates.set(`${collision.y}-${collision.x}`, { type: 'connection', color: FLASH_COLOR, connectionId });
                      newlyConnectedSources.add(tendril.sourceId);
                      newlyConnectedSources.add(collision.otherSourceId);
                 }
                break; // Stop growing this step after collision
            }

             // If no valid non-self neighbors are available, the tendril is blocked
             if (nonSelfNeighbors.length === 0) {
                // Check if blocked by self or just boundaries/other static elements
                 if (neighbors.empty.length > 0 && validEmptyNeighbors.length === 0) {
                     // Blocked by immediate backtrack prevention - allow stopping
                     tendril.state = 'blocked';
                 } else if (neighbors.empty.length > 0 && nonSelfNeighbors.length === 0) {
                      // Blocked specifically by its own path
                      tendril.state = 'blocked';
                      // console.log(`Tendril ${tendril.id} blocked by self`);
                 } else {
                     // Blocked by edges or other tendrils it can't connect to yet
                     tendril.state = 'blocked';
                     // console.log(`Tendril ${tendril.id} blocked (no empty neighbors)`);
                 }
                break;
            }

            // Choose the next cell from valid, non-self neighbors
            const nextCell = nonSelfNeighbors[getRandomInt(nonSelfNeighbors.length)];

            // Random chance to split/branch BEFORE moving to the chosen cell
            if (tendril.state === 'growing' && tendril.path.length > 5 && nonSelfNeighbors.length > 1 && Math.random() < simParamsRef.current.branchChance) {
                // Find a different valid neighbor to branch towards
                const branchNeighbors = nonSelfNeighbors.filter(n => n.x !== nextCell.x || n.y !== nextCell.y);
                if (branchNeighbors.length > 0) {
                    const branchTarget = branchNeighbors[getRandomInt(branchNeighbors.length)];
                    const branchId = getUniqueTendrilId(tendril.sourceId);
                    const branchTendril = {
                        id: branchId,
                        sourceId: tendril.sourceId,
                        path: [...tendril.path, branchTarget], // Start branch path from current head + branch target
                        state: 'growing',
                        pulsePosition: 0,
                        opacity: 1,
                    };
                    newBranches.push(branchTendril);
                    // Mark the branched cell on the grid
                    gridUpdates.set(`${branchTarget.y}-${branchTarget.x}`, { type: 'tendril', color: TENDRIL_COLOR, tendrilId: branchId, sourceId: tendril.sourceId });
                     console.log(`Tendril ${tendril.id} branched to ${branchId}`);
                }
            }

            // Move to the chosen next cell
            currentHead = nextCell;
            previousCell = tendril.path[tendril.path.length - 1]; // Update previous cell
            hasGrown = true;
            const gridCellData = { type: 'tendril', color: TENDRIL_COLOR, tendrilId: tendril.id, sourceId: tendril.sourceId };
            gridUpdates.set(`${nextCell.y}-${nextCell.x}`, gridCellData);
            tendril.path.push(nextCell);
        }

        // Apply grid updates for this tendril's growth
         gridUpdates.forEach((update, key) => {
            const [y, x] = key.split('-').map(Number);
            if (gridRef.current[y]?.[x]) {
                 // Don't overwrite existing connections with tendril updates from growth
                 if (gridRef.current[y][x].type !== 'connection') {
                    gridRef.current[y][x] = { ...gridRef.current[y][x], ...update };
                 }
            }
        });

        // Add any new branches created during growth
        tendrilsRef.current.push(...newBranches);

        // Trigger fading for connected sources
         if (newlyConnectedSources.size > 0) {
             tendrilsRef.current.forEach(t => {
                 if (newlyConnectedSources.has(t.sourceId) && t.state === 'growing') {
                     t.state = 'fading';
                 }
             });
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

        // *** NEW: 3. Draw Pulses (Overlay) ***
        context.globalAlpha = 1.0; // Pulses are full opacity
        pulsesRef.current.forEach(pulse => {
            const tendril = findTendrilById(pulse.tendrilId);
            if (!tendril || tendril.opacity <= 0) return; // Skip if tendril faded

            for (let i = 0; i < PULSE_LENGTH; i++) {
                const pulseSegmentPos = pulse.position - i;
                if (pulseSegmentPos >= 0 && pulseSegmentPos < tendril.path.length) {
                    const cellCoord = tendril.path[pulseSegmentPos];
                    // Boundary check
                    if (cellCoord.y < 0 || cellCoord.y >= gridHeight || cellCoord.x < 0 || cellCoord.x >= gridWidth) continue;
                    const gridCell = gridRef.current[cellCoord.y]?.[cellCoord.x];

                    // Only draw pulse over tendril/source cells, not connections/empty
                    if (gridCell && (gridCell.type === 'source' || gridCell.tendrilId === tendril.id) && gridCell.type !== 'connection') {
                         let pulseColor;
                         if (i === 0) pulseColor = PULSE_BRIGHT_COLOR; // Leading edge
                         else if (i === 1) pulseColor = PULSE_MID_COLOR;
                         else pulseColor = PULSE_DIM_COLOR; // i === 2

                         // Apply pulse opacity based on tendril opacity?
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


  return (
    <div className="relative w-full h-screen bg-black flex flex-col items-center justify-center p-5">
      <canvas
        ref={canvasRef}
        id="gameOfLifeCanvas"
        // Width/Height are set dynamically in useEffect/handleResize
        className="border border-indigo-500"
      >
        Your browser does not support the canvas element.
      </canvas>
      <div className="absolute bottom-4 left-4 bg-gray-800 bg-opacity-80 p-4 rounded text-white text-xs space-y-2">
        <div className="flex items-center space-x-2">
          <label htmlFor="pulseGen">Pulse Interval:</label>
          <input
            type="range" id="pulseGen" min="5" max="120" step="1"
            value={pulseGenerationInterval}
            onChange={(e) => setPulseGenerationInterval(Number(e.target.value))}
            className="w-24"
          />
          <span>{pulseGenerationInterval}</span>
        </div>
        <div className="flex items-center space-x-2">
          <label htmlFor="pulseAdv">Pulse Speed:</label>
          <input
             type="range" id="pulseAdv" min="1" max="10" step="1"
             value={pulseAdvanceInterval}
             onChange={(e) => setPulseAdvanceInterval(Number(e.target.value))}
             className="w-24"
          />
          <span>{pulseAdvanceInterval}</span>
        </div>
        <div className="flex items-center space-x-2">
          <label htmlFor="branch">Branch Chance:</label>
          <input
             type="range" id="branch" min="0" max="0.5" step="0.01"
             value={branchChance}
             onChange={(e) => setBranchChance(Number(e.target.value))}
             className="w-24"
          />
          <span>{(branchChance * 100).toFixed(0)}%</span>
        </div>
         <div className="flex items-center space-x-2">
           <label htmlFor="fade">Fade Speed:</label>
           <input
             type="range" id="fade" min="0.001" max="0.1" step="0.001"
             value={fadeSpeed}
             onChange={(e) => setFadeSpeed(Number(e.target.value))}
             className="w-24"
           />
           <span>{fadeSpeed.toFixed(3)}</span>
         </div>
      </div>
    </div>
  );
};

export default GameOfLifeCanvas;
