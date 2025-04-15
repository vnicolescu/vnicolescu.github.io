import React, { useRef, useEffect, useState } from 'react';

// Simulation Constants (Defaults)
const CELL_SIZE = 4;
const NUM_SOURCES = 2;
const GROWTH_STEP = 1;
const PULSE_LENGTH = 3;
const DEFAULT_PULSE_GENERATION_INTERVAL = 12; // Changed default to 12 from screenshot
const DEFAULT_PULSE_ADVANCE_INTERVAL = 1; // Base interval (lower = faster base step)
const DEFAULT_PULSE_SPEED_FACTOR = 5; // Default speed factor (higher = faster effective speed)
const MAX_PULSE_SPEED_FACTOR = 50; // Allow much faster speeds
const DEFAULT_BRANCH_CHANCE = 0.15;
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

// --- RE-ADD: Directional Definitions & Helpers ---
// Order: TL, T, TR, L, R, BL, B, BR (indices 0-7)
const DIRECTIONS = [
  { dx: -1, dy: -1, index: 0, name: 'TL' }, { dx: 0, dy: -1, index: 1, name: 'T' }, { dx: 1, dy: -1, index: 2, name: 'TR' },
  { dx: -1, dy: 0, index: 3, name: 'L' }, /* Center placeholder */          { dx: 1, dy: 0, index: 4, name: 'R' },
  { dx: -1, dy: 1, index: 5, name: 'BL' }, { dx: 0, dy: 1, index: 6, name: 'B' }, { dx: 1, dy: 1, index: 7, name: 'BR' },
];

const getDirectionIndex = (dx, dy) => {
    const normDx = Math.sign(dx);
    const normDy = Math.sign(dy);
    if (normDx === 0 && normDy === 0) return -1; // Center
    const dir = DIRECTIONS.find(d => d.dx === normDx && d.dy === normDy);
    return dir ? dir.index : -1;
}

// Fixed and enhanced weightedRandomSelect
const weightedRandomSelect = (options) => {
    if (!options || options.length === 0) {
        return null;
    }

    // Filter options with positive weights
    const validOptions = options.filter(o => o.weight > 0);

    if (validOptions.length === 0) {
        // Fall back to random selection from all options if no valid weights
        // console.log("weightedRandomSelect: No valid weights, falling back to random");
        return options[Math.floor(Math.random() * options.length)].item;
    }

    // Calculate total weight
    const totalWeight = validOptions.reduce((sum, option) => sum + option.weight, 0);

    // If total weight is 0 or less, return random item from valid options
    if (totalWeight <= 0) {
        // console.log("weightedRandomSelect: Total weight zero, falling back to random valid");
        return validOptions[Math.floor(Math.random() * validOptions.length)].item;
    }

    // Random number between 0 and totalWeight
    let random = Math.random() * totalWeight;

    // Find the selected item
    for (const option of validOptions) {
        if (random < option.weight) {
            return option.item;
        }
        random -= option.weight;
    }

    // Fallback to last valid option (should rarely happen)
    // console.log("weightedRandomSelect: Fallback to last valid item");
    return validOptions[validOptions.length - 1].item;
};
// --- End Re-added Helpers ---

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
  const [pulseSpeedFactor, setPulseSpeedFactor] = useState(DEFAULT_PULSE_SPEED_FACTOR); // NEW state for speed factor
  const [branchChance, setBranchChance] = useState(DEFAULT_BRANCH_CHANCE);
  const [fadeSpeed, setFadeSpeed] = useState(DEFAULT_FADE_SPEED);
  // NEW Default Weights from screenshot, adjusted L/R to 0.2
  const [directionWeights, setDirectionWeights] = useState([1, 1.5, 1, 0.2, 0.2, 0, 0, 0]);

  // Use refs to hold the current state values
  const simParamsRef = useRef({
    pulseGenerationInterval,
    pulseSpeedFactor, // Use speed factor in ref
    branchChance,
    fadeSpeed,
    directionWeights,
  });

  // Update refs whenever state changes
  useEffect(() => {
    simParamsRef.current = {
      pulseGenerationInterval,
      pulseSpeedFactor, // Update ref
      branchChance,
      fadeSpeed,
      directionWeights,
    };
    // Update dependencies
  }, [pulseGenerationInterval, pulseSpeedFactor, branchChance, fadeSpeed, directionWeights]);

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
                     console.log(`DEBUG: Initialized Tendril ${initialTendrilId} for Source ${sourceId} with path:`, [{ x, y }], 'state: growing');
                     gridRef.current[y][x].tendrilId = initialTendrilId; // Mark source cell with initial tendril ID
                 } else {
                    // console.warn(`Attempted to place source ${i} out of bounds at (${x}, ${y})`);
                 }
            }
        }
        console.log("DEBUG: Initialized Simulation with Sources:", sourcesRef.current.length, "Tendrils:", tendrilsRef.current.length);
    };


    // --- Simulation Logic ---

    // Function to find a tendril object by its ID
    const findTendrilById = (id) => tendrilsRef.current.find(t => t.id === id);

    // *** NEW: Spawn Pulses Periodically ***
    const spawnPulses = () => {
        // console.log('DEBUG: spawnPulses called'); // Keep this commented for less noise
        tendrilsRef.current.forEach(tendril => {
            // *** MODIFY LOG: Make branch check more explicit ***
            const isBranch = tendril.id.split('-')[0] === 't' && tendril.id.split('-').length > 2; // Basic check if ID looks like a branch
            console.log(`DEBUG: spawnPulses checking tendril ${tendril.id} (IsBranch: ${isBranch}), state: ${tendril.state}, path length: ${tendril.path.length}`);
            if (tendril.state === 'growing' || tendril.state === 'connected') {
                 const nearStartPulse = pulsesRef.current.some(p => p.tendrilId === tendril.id && p.position < PULSE_LENGTH);
                 if (!nearStartPulse) {
                     console.log(`DEBUG: Spawning pulse for tendril ${tendril.id}`);
                     pulsesRef.current.push({
                        id: getUniquePulseId(),
                        tendrilId: tendril.id,
                        position: 0,
                     });
                 }
            }
        });
    };

    // *** MODIFIED: Advance Pulses (incorporates speed factor directly) ***
    const advancePulses = () => {
        const pulsesToRemove = [];
        const growthTendrils = new Set();
        const currentSpeedFactor = simParamsRef.current.pulseSpeedFactor;
        // Calculate steps to advance based on factor
        const stepsToAdvance = Math.max(1, Math.floor(currentSpeedFactor));

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
                // Check if the cell the pulse IS CURRENTLY IN is still valid
                if (!gridCell) {
                    // Cell doesn't exist at all
                    tendril.state = 'fading';
                    tendril.opacity = Math.min(tendril.opacity, 0.1);
                    pulsesToRemove.push(index);
                    return;
                }

                // If it's a branch point, it might have multiple tendrilIds
                if (gridCell.isBranchPoint) {
                    // Check if this tendril's ID is still in the comma-separated list
                    const tendrilIds = gridCell.tendrilId.split(',');
                    if (!tendrilIds.includes(tendril.id)) {
                        // This tendril's ID is no longer in the list
                        tendril.state = 'fading';
                        tendril.opacity = Math.min(tendril.opacity, 0.1);
                        pulsesToRemove.push(index);
                        return;
                    }
                    // Otherwise, it's still valid
                }
                // Normal cell (not a branch point)
                else if ((gridCell.type !== 'tendril' && gridCell.type !== 'source') ||
                         gridCell.tendrilId !== tendril.id) {
                    // Path is broken where the pulse is!
                    tendril.state = 'fading';
                    tendril.opacity = Math.min(tendril.opacity, 0.1);
                    pulsesToRemove.push(index);
                    return;
                }
            } // else { pulse.position is 0, check might not be needed or possible }
            // --- End Disconnection Check ---

            // Advance position by calculated steps
            pulse.position += stepsToAdvance;

            // --- Check Pulse Position ---
            // Check if pulse reached or passed the end of the current path
            const endPositionIndex = tendril.path.length - 1;

            if (pulse.position >= endPositionIndex) {
                // Pulse is at or beyond the last known cell
                if (tendril.state === 'growing') {
                    // If the tendril is still growing, trigger growth attempt
                    growthTendrils.add(tendril.id);
                    // Don't remove the pulse yet, let tryGrowTendril extend the path
                }
                 // If pulse has gone *past* the valid end index, remove it
                 if (pulse.position >= tendril.path.length) {
                    // console.log(`Pulse ${pulse.id} went off end of tendril ${tendril.id} (pos ${pulse.position} >= len ${tendril.path.length}). Removing.`);
                    pulsesToRemove.push(index);
                }
                 // If tendril is NOT growing (e.g., connected, fading, blocked) and pulse reached end, remove it.
                 else if (tendril.state !== 'growing') {
                     // console.log(`Pulse ${pulse.id} reached end of non-growing tendril ${tendril.id}. Removing.`);
                     pulsesToRemove.push(index);
                 }
                 // Otherwise, if tendril is growing and pulse is exactly at the end, keep it for now.

            } // else: Pulse is still travelling along the path, do nothing extra
        });

        // Remove pulses
        for (let i = pulsesToRemove.length - 1; i >= 0; i--) {
            pulsesRef.current.splice(pulsesToRemove[i], 1);
        }

        // Trigger growth
        growthTendrils.forEach(tendrilId => {
            const tendril = findTendrilById(tendrilId);
            if (tendril) {
                tryGrowTendril(tendril);
            }
        });
    };

    // *** RENAMED/REFACTORED: Growth logic for a single tendril ***
    const tryGrowTendril = (tendril) => {
        const gridUpdates = new Map();
        const newBranches = [];
        const newlyConnectedSources = new Set();
        let currentHead = tendril.path[tendril.path.length - 1];
        let previousCell = tendril.path.length > 1 ? tendril.path[tendril.path.length - 2] : null;
        const currentWeights = simParamsRef.current.directionWeights;

        if (!currentHead) {
             // ... (handle missing head)
             return;
         }

        const neighbors = getNeighbors(currentHead.x, currentHead.y, gridWidth, gridHeight, tendril.sourceId);

        // Filter out the immediate previous cell
        const validEmptyNeighbors = neighbors.empty.filter(n =>
            !(previousCell && n.x === previousCell.x && n.y === previousCell.y)
        );

        // Filter out cells already in this tendril's path (direct overlap)
        const nonSelfNeighbors = validEmptyNeighbors.filter(n =>
            !tendril.path.some(p => p.x === n.x && p.y === n.y)
        );

         // Prepare neighbors with weights, adding adjacency check
         const weightedNeighbors = nonSelfNeighbors.map(neighbor => {
             const dx = neighbor.x - currentHead.x;
             const dy = neighbor.y - currentHead.y;
             const dirIndex = getDirectionIndex(dx, dy);
             let weight = (dirIndex !== -1 && currentWeights[dirIndex] !== undefined) ? currentWeights[dirIndex] : 0;

             // --- Adjacency Penalty Check ---
             if (weight > 0) { // Only check if it's a potential candidate
                const adjacentCellsToCheck = [
                    [-1, -1], [-1, 0], [-1, 1],
                    [ 0, -1],          [ 0, 1],
                    [ 1, -1], [ 1, 0], [ 1, 1]
                ];
                for (const [adjDx, adjDy] of adjacentCellsToCheck) {
                    const checkX = neighbor.x + adjDx;
                    const checkY = neighbor.y + adjDy;

                    // Is the adjacent cell part of the current tendril's path?
                    const isAdjacentToSelf = tendril.path.some(p => p.x === checkX && p.y === checkY);

                    // Exclude adjacency to the current head itself or the previous cell
                    const isAdjacentToHead = (checkX === currentHead.x && checkY === currentHead.y);
                    const isAdjacentToPrev = previousCell && (checkX === previousCell.x && checkY === previousCell.y);

                    if (isAdjacentToSelf && !isAdjacentToHead && !isAdjacentToPrev) {
                        // This neighbor cell is touching the tendril's body somewhere else!
                        // Force weight to 0 to prevent moving here.
                        // console.log(`Penalty applied to ${neighbor.x},${neighbor.y} due to adjacency with ${checkX},${checkY}`);
                        weight = 0;
                        break; // *** CORRECTED: Use break to exit inner loop only ***
                    }
                }
            }
             // --- End Adjacency Penalty Check ---

             return { item: neighbor, weight: weight };
         }).filter(n => n.weight > 0); // Filter again AFTER penalty applied

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
            // Apply connection grid updates immediately before returning
            gridUpdates.forEach((update, key) => {
                const [y, x] = key.split('-').map(Number);
                if (gridRef.current[y]?.[x]) {
                    if (gridRef.current[y][x].type !== 'connection' || update.type === 'connection') { // Allow connection to overwrite
                       gridRef.current[y][x] = { ...gridRef.current[y][x], ...update };
                    }
                }
            });
            return; // Exit function after handling collision
        }

        // --- Blocked Check ---
        if (weightedNeighbors.length === 0) {
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
            return; // Exit function if blocked
        }

        // Choose the next cell using weighted random selection
        const nextCell = weightedRandomSelect(weightedNeighbors);
        if (!nextCell) { // Handle case where selection might fail (should be rare)
            console.warn(`Weighted random selection failed for tendril ${tendril.id}, blocking.`);
            tendril.state = 'blocked';
            return;
        }

        // --- Branching Logic (Uses Weighted Selection) ---
        const currentBranchChance = simParamsRef.current.branchChance;
        const randomValue = Math.random();
        const meetsChance = randomValue < currentBranchChance;
        const pathLengthOk = tendril.path.length > 5;
        const neighborsOk = nonSelfNeighbors.length > 1;
        const stateOk = tendril.state === 'growing';

        // Log the conditions before the check
        if (stateOk) { // Only log for tendrils that *could* branch
            console.log(`Branch Check (Tendril ${tendril.id}):
                State: ${tendril.state} (OK: ${stateOk})
                Path Length: ${tendril.path.length} (OK: ${pathLengthOk})
                Non-Self Neighbors: ${nonSelfNeighbors.length} (OK: ${neighborsOk})
                Branch Chance: ${currentBranchChance}
                Random Value: ${randomValue.toFixed(3)}
                Meets Chance: ${meetsChance}
                Should Branch: ${stateOk && pathLengthOk && neighborsOk && meetsChance}`
            );
        }

        // Check if branching is geometrically possible and probabilistically triggered
        const shouldBranch = stateOk && pathLengthOk && neighborsOk && meetsChance;

        if (shouldBranch) {
            console.log(`--> ATTEMPTING branch for tendril ${tendril.id}`); // More visible log
            // Find potential branch targets among weighted neighbors (excluding the main growth target 'nextCell')
            const potentialBranchTargets = weightedNeighbors.filter(n => n.item.x !== nextCell.x || n.item.y !== nextCell.y);

            // console.log(`Found ${potentialBranchTargets.length} potential branch targets`); // Keep this commented for now

            if (potentialBranchTargets.length > 0) {
                // *** CORRECTED: Use weighted selection for branch target ***
                const branchTarget = weightedRandomSelect(potentialBranchTargets);
                if (branchTarget) { // Check if selection succeeded
                    const branchId = getUniqueTendrilId(tendril.sourceId);
                    // *** FIX: Correct branch path initialization ***
                    // The branch path should include the current head, then the branch target.
                    const currentPath = tendril.path; // Get the current path
                    const branchTendril = {
                        id: branchId,
                        sourceId: tendril.sourceId,
                        path: [...currentPath, branchTarget], // Start from full current path, add branch target
                        state: 'growing',
                        pulsePosition: 0,
                        opacity: 1,
                    };
                    // *** ADD LOG: Log the created branch object ***
                    console.log(`--> Creating Branch Object:`, JSON.stringify(branchTendril));
                    newBranches.push(branchTendril);

                    // CRITICAL FIX: Mark the branch's path on the grid
                    // First, add the branch target cell
                    gridUpdates.set(`${branchTarget.y}-${branchTarget.x}`, {
                        type: 'tendril',
                        color: TENDRIL_COLOR,
                        tendrilId: branchId,
                        sourceId: tendril.sourceId
                    });

                    // Since a branch visually appears at a single divergence point,
                    // We need to mark that one cell differently to make it visually distinct
                    // Find the point where branching occurs - it's the cell before branchTarget
                    const branchPoint = tendril.path[tendril.path.length - 1]; // The current head of the parent

                    // Mark this on the grid as a special cell that belongs to both tendrils
                    // This will help create a visual branch
                    gridUpdates.set(`${branchPoint.y}-${branchPoint.x}`, {
                        type: 'tendril',
                        color: '#FFFFFF', // Use a different color to highlight the branch point
                        tendrilId: `${tendril.id},${branchId}`, // Mark as belonging to both tendrils
                        sourceId: tendril.sourceId,
                        isBranchPoint: true
                    });

                    // CRITICAL FIX: Immediately add a pulse for the new branch to start its growth
                    // This ensures the branch starts growing right away
                    pulsesRef.current.push({
                        id: getUniquePulseId(),
                        tendrilId: branchId,
                        position: 0,
                    });

                    console.log(`SUCCESS: Tendril ${tendril.id} branched to ${branchId} towards ${branchTarget.x},${branchTarget.y}`); // Log success
                } else {
                     console.log(`Failed to select branch target for tendril ${tendril.id}`); // Log failure
                 }
            } else {
                 console.log(`No valid branch targets for tendril ${tendril.id}`); // Log no targets
             }
        }

        // Move to the chosen next cell
        let hasGrown = false;

        // Only proceed if a valid next cell was chosen
        if (nextCell) {
            currentHead = nextCell;
            hasGrown = true;
            const gridCellData = { type: 'tendril', color: TENDRIL_COLOR, tendrilId: tendril.id, sourceId: tendril.sourceId };
            gridUpdates.set(`${nextCell.y}-${nextCell.x}`, gridCellData);
            tendril.path.push(nextCell);
        } else {
            // If no next cell was found (e.g., blocked), handle it gracefully
            console.warn(`Tendril ${tendril.id} could not find a next cell to grow into.`);
            tendril.state = 'blocked'; // Mark as blocked if no growth possible
            return; // Stop further processing for this tendril in this step
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
        const numBranchesAdded = newBranches.length;
        if (numBranchesAdded > 0) {
            tendrilsRef.current.push(...newBranches);
            console.log(`Added ${numBranchesAdded} new branches. Total tendrils now: ${tendrilsRef.current.length}`);
        }

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
             // Only apply fading to tendrils explicitly marked for fading
             // or in terminal states like blocked or collided
             if (tendril.state === 'fading' || tendril.state === 'blocked' || tendril.state === 'collided') {
                // FIXED: Prevent too-fast fading of branch points by applying a smaller fade factor
                // This ensures branch points remain visible longer
                const fadeFactor = tendril.path.length > 5 ? currentFadeSpeed : currentFadeSpeed * 0.5;
                tendril.opacity -= fadeFactor;

                if (tendril.opacity <= 0) {
                    console.log(`Tendril ${tendril.id} faded completely. Removing.`);
                    tendrilsToRemove.push(index);
                    // Clear path from grid
                    tendril.path.forEach(p => {
                        const cellKey = `${p.y}-${p.x}`;
                        const currentCell = gridRef.current[p.y]?.[p.x];
                        // Don't remove cells that are sources or connections
                        if (currentCell && currentCell.tendrilId === tendril.id &&
                            currentCell.type !== 'source' &&
                            currentCell.type !== 'connection') {
                            // Don't clear branch points either - let them remain for other tendrils
                            if (!currentCell.isBranchPoint) {
                                gridUpdates.set(cellKey, {
                                    type: 'empty',
                                    color: BACKGROUND_COLOR,
                                    tendrilId: null,
                                    sourceId: null,
                                    connectionId: null
                                });
                            } else {
                                // For branch points, just remove this tendril's ID from the list
                                const tendrilIds = currentCell.tendrilId.split(',').filter(id => id !== tendril.id);
                                if (tendrilIds.length > 0) {
                                    gridUpdates.set(cellKey, {
                                        ...currentCell,
                                        tendrilId: tendrilIds.join(',')
                                    });
                                } else {
                                    // If no tendrils left using this branch point, clear it
                                    gridUpdates.set(cellKey, {
                                        type: 'empty',
                                        color: BACKGROUND_COLOR,
                                        tendrilId: null,
                                        sourceId: null,
                                        connectionId: null
                                    });
                                }
                            }
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

                // Handle branch points specially - mark them in a different color to make branches visible
                if (cell.isBranchPoint) {
                    context.fillStyle = '#FFFFFF'; // White for branch points
                    context.fillRect(x * CELL_SIZE, y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                    continue; // Skip normal processing for branch points
                }

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

                // Skip cells that don't exist, don't belong to this tendril, or are connections
                // Note: Handle cells that could belong to multiple tendrils (at branch points)
                if (!gridCell) continue; // Skip non-existent cells

                // For connections, we'll handle them separately
                if (gridCell.type === 'connection') continue;

                // For sources, always show them
                if (gridCell.type === 'source') {
                    // Continue with drawing
                }
                // For regular tendrils, check if this tendril ID is included
                else {
                    // The tendrilId might be a single ID or a comma-separated list at branch points
                    const tendrilIds = gridCell.tendrilId ? gridCell.tendrilId.split(',') : [];
                    if (!tendrilIds.includes(tendril.id)) {
                        continue; // Skip cells that don't belong to this tendril
                    }
                }

                let drawColor = gridCell.color;

                // Handle special drawing for branch points
                if (gridCell.isBranchPoint) {
                    drawColor = '#FFFFFF'; // White for branch points
                }
                // Regular tendril drawing logic
                else if (tendril.state === 'growing' && tendril.opacity > 0.1) {
                    const distanceFromEnd = pathLength - 1 - i;
                    if (distanceFromEnd === 0 && pathLength > 1) drawColor = PULSE_BRIGHT_COLOR;
                    else if (distanceFromEnd === 1 && pathLength > 2) drawColor = PULSE_MID_COLOR;
                    else if (distanceFromEnd === 2 && pathLength > 3) drawColor = PULSE_DIM_COLOR;
                }
                // Fading/blocked/collided state drawing
                else if (tendril.state === 'fading' || tendril.state === 'blocked' || tendril.state === 'collided') {
                    // Color is already set to FADING_COLOR by the fadeTendrils logic via gridUpdates
                    // We just need to respect the opacity
                }

                context.fillStyle = drawColor;
                context.fillRect(cellCoord.x * CELL_SIZE, cellCoord.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
            }
            context.globalAlpha = 1.0;
        });

        // *** NEW: 3. Draw Pulses (Leading Edge Orange) ***
        context.globalAlpha = 1.0;
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
                         // *** Corrected Pulse Color Logic ***
                         if (i === 0) pulseColor = CONNECTION_COLOR; // Leading edge is Orange/Amber
                         else if (i === 1) pulseColor = PULSE_BRIGHT_COLOR; // First trail segment is bright white
                         else pulseColor = PULSE_MID_COLOR; // Second trail segment is dimmer white/gray

                         context.globalAlpha = tendril.opacity;
                         context.fillStyle = pulseColor;
                         context.fillRect(cellCoord.x * CELL_SIZE, cellCoord.y * CELL_SIZE, CELL_SIZE, CELL_SIZE);
                         context.globalAlpha = 1.0;
                    }
                }
            }
        });
    };


    // --- Animation Loop (Using Pulse Speed Factor) ---
    const render = () => {
        if (!canvasRef.current) return;
        frameCountRef.current++;

        const { pulseGenerationInterval: currentGenInterval } = simParamsRef.current;

        // Spawn new pulses periodically
        const shouldSpawn = currentGenInterval > 0 && frameCountRef.current % Math.round(currentGenInterval) === 0;
        if (shouldSpawn) {
            console.log(`DEBUG: Frame ${frameCountRef.current}, Interval ${currentGenInterval}. Calling spawnPulses.`);
            spawnPulses();
            console.log('DEBUG: pulsesRef after spawn attempt:', JSON.stringify(pulsesRef.current));
        }

        // Update simulation state every frame
        advancePulses();
        fadeTendrils();
        updateConnections();

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

  // *** RE-ADD: Handler for weight changes ***
  const handleWeightChange = (index, value) => {
    const newWeights = [...directionWeights];
    const numValue = Math.max(0, Number(value) || 0);
    newWeights[index] = numValue;
    setDirectionWeights(newWeights);
  };

  return (
    <div className="relative w-full h-screen bg-black flex flex-col items-center justify-center p-5">
      <canvas
        ref={canvasRef}
        id="gameOfLifeCanvas"
        className="border border-indigo-500 flex-grow" // Added flex-grow
      >
        Your browser does not support the canvas element.
      </canvas>
       {/* Controls Container */}
       <div className="absolute bottom-4 left-4 flex space-x-6">
           {/* Parameter Sliders */}
           <div className="bg-gray-800 bg-opacity-80 p-4 rounded text-white text-xs space-y-2 w-48">
                 {/* Pulse Interval Slider (remains the same) */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="pulseGen" className="flex-1">Pulse Interval:</label>
                   <input type="range" id="pulseGen" min="5" max="120" step="1" value={pulseGenerationInterval} onChange={(e) => setPulseGenerationInterval(Number(e.target.value))} className="w-20 mx-2" />
                   <span className="w-6 text-right">{pulseGenerationInterval}</span>
                 </div>
                 {/* --- Modified Pulse Speed Slider --- */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="pulseSpeedFactor" className="flex-1">Pulse Speed:</label>
                   <input
                      type="range" id="pulseSpeedFactor"
                      min="1" max={MAX_PULSE_SPEED_FACTOR} step="1" // Use new range
                      value={pulseSpeedFactor}
                      onChange={(e) => setPulseSpeedFactor(Number(e.target.value))} // Update speed factor state
                      className="w-20 mx-2"
                   />
                   <span className="w-6 text-right">{pulseSpeedFactor}x</span> {/* Display factor */}
                 </div>
                 {/* Branch Chance Slider (remains the same) */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="branch" className="flex-1">Branch Chance:</label>
                   <input
                     type="range"
                     id="branch"
                     min="0"
                     max="0.5"
                     step="0.01"
                     value={branchChance}
                     onChange={(e) => {
                       const newValue = Number(e.target.value);
                       console.log("Slider: Branch chance changed to:", newValue); // Add log here
                       setBranchChance(newValue);
                     }}
                     className="w-20 mx-2"
                   />
                   <span className="w-6 text-right">{(branchChance * 100).toFixed(0)}%</span>
                 </div>
                 {/* Fade Speed Slider (remains the same) */}
                 <div className="flex items-center justify-between">
                   <label htmlFor="fade" className="flex-1">Fade Speed:</label>
                   <input type="range" id="fade" min="0.001" max="0.1" step="0.001" value={fadeSpeed} onChange={(e) => setFadeSpeed(Number(e.target.value))} className="w-20 mx-2" />
                   <span className="w-6 text-right">{fadeSpeed.toFixed(3)}</span>
                 </div>
           </div>

           {/* *** RE-ADD: Directional Weights Grid *** */}
            <div className="bg-gray-800 bg-opacity-80 p-3 rounded text-white text-xs">
                <label className="block text-center mb-2 font-semibold">Growth Bias</label>
                <div className="grid grid-cols-3 gap-1 w-32">
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
                         w-full h-8 p-1 text-center rounded bg-gray-700 text-white text-sm
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
