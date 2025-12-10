const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const fs = require('fs');
const path = require('path');

app.use(express.static(path.join(__dirname, '/')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// High Score System
const HIGHSCORE_FILE = path.join(__dirname, 'highscores.json');
let highScores = [];

function loadHighScores() {
    if (fs.existsSync(HIGHSCORE_FILE)) {
        try {
            const data = fs.readFileSync(HIGHSCORE_FILE, 'utf8');
            highScores = JSON.parse(data);
        } catch (err) {
            console.error('Error reading highscores:', err);
            highScores = [];
        }
    } else {
        highScores = [];
    }
}

function saveHighScores() {
    try {
        fs.writeFileSync(HIGHSCORE_FILE, JSON.stringify(highScores, null, 2));
    } catch (err) {
        console.error('Error saving highscores:', err);
    }
}

function updateHighScores(name, score) {
    if (score < 0) return null;
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5); // Unique ID
    highScores.push({ id: id, name: name || 'Anonymous', score: score, date: new Date().toISOString() });
    highScores.sort((a, b) => b.score - a.score);
    highScores = highScores.slice(0, 50); // Keep Top 50
    saveHighScores();
    io.emit('highscores', highScores); // Broadcast update
    return id;
}

// Initial Load
loadHighScores();

// Game Constants
const GRAVITY = 0.5;
const FRICTION = 0.8;
const JUMP_STRENGTH = -18;
const SPEED = 5;
const BUBBLE_SPEED = 6;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;
const MAX_ENEMIES = 10; // Max enemies on screen

// Game State
const players = {};
let gamePaused = false; // Global Pause State
let bubbles = [];
let enemies = [];
let items = []; // Power-ups
let lastEnemySpawn = 0;
let waveCount = 1;

// Player Slots (Fixed Colors - 15 Variants)
const colors = [
    '#00dd00', '#0055dd', '#dd0000', '#dd00dd', '#dddd00',
    '#00dddd', '#ff8800', '#ff88ff', '#aaaaaa', '#ffffff',
    '#005500', '#000088', '#880000', '#888800', '#008888'
];
const slots = colors.map((c, i) => ({ id: i, color: c, occupied: false }));

// Map Layouts
const MAPS = [
    // 0: Classic
    [
        { x: 0, y: 550, width: 800, height: 50 },
        { x: 200, y: 400, width: 400, height: 20 },
        { x: 50, y: 250, width: 200, height: 20 },
        { x: 550, y: 250, width: 200, height: 20 }
    ],
    // 1: The Pit (Gap in middle)
    [
        { x: 0, y: 550, width: 300, height: 50 }, // Left base
        { x: 500, y: 550, width: 300, height: 50 }, // Right base
        { x: 100, y: 350, width: 100, height: 20 },
        { x: 600, y: 350, width: 100, height: 20 },
        { x: 250, y: 150, width: 300, height: 20 } // High Top
    ],
    // 2: Stairs
    [
        { x: 0, y: 550, width: 800, height: 50 },
        { x: 50, y: 450, width: 150, height: 20 },
        { x: 250, y: 350, width: 150, height: 20 },
        { x: 450, y: 250, width: 150, height: 20 },
        { x: 650, y: 150, width: 100, height: 20 }
    ]
];

let currentMapIndex = 0;
let platforms = MAPS[0];

// Initialize Enemies (Wave System)
function spawnEnemies() {
    waveCount++;
    enemies = [];

    // Scaling Logic
    const count = 3 + Math.floor(waveCount / 2); // Start 3, +1 every 2 waves
    const baseSpeed = 2 + (waveCount * 0.2); // Start 2.2, +0.2 per wave (Smoother)

    // Map Evolution (Every 3 waves)
    if (waveCount % 3 === 0) {
        currentMapIndex = (currentMapIndex + 1) % MAPS.length;
        platforms = MAPS[currentMapIndex];
        console.log(`Map switched to Type ${currentMapIndex}`);

        // Safe Teleport for all players on Map Switch
        for (const id in players) {
            const p = players[id];
            p.x = 100;
            p.y = 100;
            p.dy = 0;
        }
    }

    // Boss Wave (Every 10 waves)
    const isBossWave = (waveCount % 10 === 0);

    if (isBossWave) {
        console.log(`Spawning BOSS Wave ${waveCount}`);
        // Spawn 1 Boss
        enemies.push({
            x: 400 - 32, // Center
            y: 100,
            width: 64,  // Big
            height: 64, // Big
            dx: (Math.random() < 0.5 ? 1 : -1) * (baseSpeed * 0.8), // Slightly slower
            dy: 0,
            direction: 1,
            state: 'normal',
            type: 'boss',
            hp: 20,
            maxHp: 20,
            panicTimer: 0,
            trappedTime: 0,
            id: Date.now()
        });
        // Add minimal minions
        for (let i = 0; i < 2; i++) {
            enemies.push({
                x: Math.random() * (CANVAS_WIDTH - 100) + 50,
                y: 100,
                width: 32,
                height: 32,
                dx: (Math.random() < 0.5 ? 1 : -1) * baseSpeed,
                dy: 0,
                direction: 1,
                state: 'normal',
                type: 'chaser',
                id: Date.now() + i + 1
            });
        }
    } else {
        console.log(`Spawning Wave ${waveCount}: ${count} enemies, Speed ${baseSpeed.toFixed(1)}`);

        for (let i = 0; i < count; i++) {
            const dir = Math.random() < 0.5 ? 1 : -1;
            const type = Math.random() < 0.5 ? 'chaser' : 'fearful';
            enemies.push({
                x: Math.random() * (CANVAS_WIDTH - 100) + 50,
                y: 100,
                width: 32,
                height: 32,
                dx: dir * baseSpeed,
                dy: 0,
                direction: dir,
                state: 'normal',
                type: type, // 'chaser' or 'fearful'
                panicTimer: 0,
                trappedTime: 0,
                id: Date.now() + i
            });
        }
    }
}
// Enemy AI Logic
function updateEnemyAI(enemy) {
    if (!enemy.aiState) enemy.aiState = 'PATROL';
    if (!enemy.reactionTimer) enemy.reactionTimer = 0;
    if (!enemy.panicTimer) enemy.panicTimer = 0;

    const CHASE_RANGE = 200; // Reduced from 300
    const CHASE_SPEED = 2.0 + (waveCount * 0.2); // Reduced base from 2.5
    const PATROL_SPEED = 1.5 + (waveCount * 0.2); // Reduced base from 2.0

    // Find nearest player
    let target = null;
    let minDist = Infinity;

    for (const id in players) {
        const p = players[id];
        if (p.invincible > 0) continue; // Don't chase invincible players

        const dist = Math.sqrt(Math.pow(p.x - enemy.x, 2) + Math.pow(p.y - enemy.y, 2));
        if (dist < minDist) {
            minDist = dist;
            target = p;
        }
    }

    // State Transitions
    if (enemy.aiState === 'PATROL') {
        enemy.dx = enemy.direction * PATROL_SPEED;
        if (target && minDist < CHASE_RANGE) {
            enemy.aiState = 'CHASE';
        }
        // Random change direction
        if (Math.random() < 0.01) enemy.direction *= -1;

    } else if (enemy.aiState === 'CHASE') {
        if (target) {
            const dirToPlayer = Math.sign(target.x - enemy.x);
            // Reaction Delay (don't flip instantly)
            if (dirToPlayer !== Math.sign(enemy.dx)) {
                enemy.reactionTimer++;
                if (enemy.reactionTimer > 20) { // 20 frames delay
                    enemy.direction = dirToPlayer;
                    enemy.reactionTimer = 0;
                }
            } else {
                enemy.reactionTimer = 0;
            }
            enemy.dx = enemy.direction * CHASE_SPEED;

            // Jump if player is above
            if (target.y < enemy.y - 50 && enemy.grounded && Math.random() < 0.05) {
                enemy.dy = JUMP_STRENGTH;
                enemy.grounded = false;
            }
        }

        if (!target || minDist > CHASE_RANGE * 1.5) {
            enemy.aiState = 'PATROL';
        }
    }

    // Fearful Logic
    if (enemy.type === 'fearful' && target && minDist < 150) {
        enemy.aiState = 'FLEE';
        const dirAway = Math.sign(enemy.x - target.x);
        enemy.dx = dirAway * CHASE_SPEED * 1.2;
    }

    // Boss Unique Logic
    if (enemy.type === 'boss') {
        if (enemy.panicTimer > 0) {
            enemy.panicTimer--;
        } else {
            // Panic Jump Attack randomly
            if (Math.random() < 0.01 && enemy.grounded) {
                enemy.dy = JUMP_STRENGTH * 1.3;
                enemy.dx = (target ? Math.sign(target.x - enemy.x) : enemy.direction) * 5;
                enemy.panicTimer = 60; // Locked in jump
            }
        }
    } else {
        // Normal Jump Over Obstacles or Pits
        if (enemy.grounded) {
            // Look ahead
            const lookAheadX = enemy.x + (enemy.direction * 40);
            let platformAhead = false;
            platforms.forEach(p => {
                if (lookAheadX > p.x && lookAheadX < p.x + p.width &&
                    enemy.y + enemy.height === p.y) {
                    platformAhead = true;
                }
            });

            // If no platform ahead (pit) OR wall ahead (x approx boundary)
            if (!platformAhead || lookAheadX < 0 || lookAheadX > CANVAS_WIDTH) {
                if (Math.random() < 0.8) { // 80% chance to jump
                    enemy.dy = JUMP_STRENGTH;
                    enemy.grounded = false;
                } else {
                    enemy.direction *= -1; // Turn around
                }
            }
        }
    }
}

spawnEnemies();


// Helper to create new player object
function createNewPlayer(id, assignedSlot) {
    return {
        x: 100,
        y: 100,
        width: 32,
        height: 32,
        dx: 0,
        dy: 0,
        direction: 1,
        grounded: false,
        invincible: 0,
        score: 0,
        color: assignedSlot.color,
        characterId: assignedSlot.id,
        id: id,
        speedBuff: 0,
        fireBuff: 0,
        lastShoot: 0,
        lastShoot: 0,
        maxScore: 0,
        isPlaying: false,
        lives: 5, // Start with 5 lives
        enemiesKilled: 0,
        inputs: { left: false, right: false, up: false, shoot: false }
    };
}

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Assign Slot
    let assignedSlot = slots.find(s => !s.occupied);
    if (!assignedSlot) {
        // Fallback or Spectator (reuse slot 0 for safety but don't mark as occupied to avoid breaking)
        assignedSlot = { id: 0, color: '#00dd00' };
    } else {
        assignedSlot.occupied = true;
    }

    // Create new player
    players[socket.id] = createNewPlayer(socket.id, assignedSlot);

    // Wait for 'join_game' to spawn player
    socket.on('join_game', (data) => {
        // Handle migration from old client (sending string string) vs new (sending object)
        const name = (typeof data === 'object') ? data.name : data;
        const speed = (typeof data === 'object') ? data.speed : 'slow';

        // Update Game Speed based on preference (Last player wins logic for MVP)
        setGameSpeed(speed);

        // If player already exists (e.g., re-joining), update name and reset position
        if (players[socket.id]) {
            players[socket.id].name = name;
            players[socket.id].x = 100;
            players[socket.id].y = 100; // Spawn high (safer)
            players[socket.id].dx = 0;
            players[socket.id].dy = 0;
            players[socket.id].grounded = false;
            players[socket.id].invincible = 180; // 3 Seconds Immunity on Join
            players[socket.id].score = 0;
            players[socket.id].maxScore = 0;
            players[socket.id].speedBuff = 0;
            players[socket.id].fireBuff = 0;
            players[socket.id].lastShoot = 0;
            players[socket.id].lives = 5; // Reset Lives
            players[socket.id].enemiesKilled = 0;
            players[socket.id].inputs = { left: false, right: false, up: false, shoot: false };
            console.log(`Player ${socket.id} re-joined as ${name}`);
        } else {
            // Player object missing (e.g. was deleted on Game Over), recreate it
            let assignedSlot = slots.find(s => !s.occupied && s.color !== undefined);
            if (!assignedSlot) assignedSlot = { id: 0, color: '#00dd00' };
            else assignedSlot.occupied = true;

            players[socket.id] = createNewPlayer(socket.id, assignedSlot);
            players[socket.id].name = name;
            players[socket.id].invincible = 180;
            console.log(`Player ${socket.id} recreated after Game Over as ${name}`);
        }
        // Send initial state immediately
        players[socket.id].isPlaying = true;
        io.emit('state', { players, bubbles, enemies, items, platforms });
        socket.emit('highscores', highScores); // Send scores on join
    });

    socket.on('request_highscores', () => {
        socket.emit('highscores', highScores);
    });

    socket.on('quit_game', () => {
        const p = players[socket.id];
        if (p) {
            updateHighScores(p.name, p.score); // Save current Score
            io.to(socket.id).emit('game_over', p.score); // Tell client

            // Release slot
            const slot = slots.find(s => s.color === p.color);
            if (slot) slot.occupied = false;
        }
        delete players[socket.id];
        if (Object.keys(players).length === 0) {
            console.log('All players disconnected. Resetting game.');
            resetGame();
        }
        io.emit('state', { players, bubbles, enemies, items, platforms, gamePaused });
    });

    socket.on('disconnect', () => {
        try {
            console.log('User disconnected:', socket.id);
            const p = players[socket.id];
            if (p) {
                updateHighScores(p.name, p.maxScore); // Save Max Score
                const slot = slots.find(s => s.color === p.color);
                if (slot) slot.occupied = false;
            }
            delete players[socket.id];

            // Reset Game if Empty
            if (Object.keys(players).length === 0) {
                console.log('All players disconnected. Resetting game.');
                resetGame();
            }
        } catch (err) {
            console.error('Error in disconnect handler:', err);
        }
    });

    socket.on('toggle_pause', () => {
        gamePaused = !gamePaused;
        console.log(`Game Paused: ${gamePaused}`);
    });

    socket.on('input', (input) => {
        const player = players[socket.id];
        if (!player) return;

        // Update Persistent Input State
        player.inputs = input;

        // Handle Jump (Instant Impulse) - STILL PROCESSED HERE for responsiveness
        if (input.up && player.grounded) {
            player.dy = -16;
            player.grounded = false;
        }

        if (input.shoot) {
            const now = Date.now();
            const cooldown = (player.fireBuff > 0) ? 200 : 500;

            if (now - player.lastShoot > cooldown) {
                player.lastShoot = now;
                bubbles.push({
                    x: player.direction === 1 ? player.x + player.width : player.x - 32,
                    y: player.y,
                    width: 32,
                    height: 32,
                    dx: player.direction * 6,
                    dy: 0,
                    life: 180,
                    owner: socket.id
                });
            }
        }
    });
});

// Reset Game State
function resetGame() {
    waveCount = 0;
    enemies = [];
    bubbles = [];
    items = [];
    currentMapIndex = 0;
    platforms = MAPS[0];
    slots.forEach(s => s.occupied = false);
    spawnEnemies();
    io.emit('state', { players, bubbles, enemies, items, platforms });
}


// FIXED TIMESTEP GAME LOOP
let TICK_RATE = 30; // Default Slow (Gen X)
let FIXED_STEP = 1000 / TICK_RATE;
let lastTime = Date.now();
let accumulator = 0;

function setGameSpeed(speed) {
    if (speed === 'fast') {
        TICK_RATE = 60;
        console.log('Game Speed set to FAST (60 FPS) - Gen Z Mode');
    } else {
        TICK_RATE = 30;
        console.log('Game Speed set to NORMAL (30 FPS) - Gen X Mode');
    }
    FIXED_STEP = 1000 / TICK_RATE;
}

setInterval(() => {
    try {
        const now = Date.now();
        let frameTime = now - lastTime;
        lastTime = now;

        // Cap frameTime to prevent Spiral of Death on lag (max 100ms)
        if (frameTime > 100) frameTime = 100;

        accumulator += frameTime;

        while (accumulator >= FIXED_STEP) {
            updatePhysics();
            accumulator -= FIXED_STEP;
        }

        if (!gamePaused) {
            io.emit('state', { players, bubbles, enemies, items, platforms, gamePaused });
        }
    } catch (err) {
        console.error('Error in game loop:', err);
    }
}, 1000 / 60); // Wake up every 16ms to support up to 60fps logic

function updatePhysics() {
    if (gamePaused) return;

    // Update Players
    for (const id in players) {
        const p = players[id];
        if (!p.isPlaying) continue;

        // Physics (Fixed Step - No scaling needed for standard gravity)
        p.dy += GRAVITY;
        p.y += p.dy;

        // Horizontal
        const currentSpeed = (p.speedBuff > 0) ? 6 : 4;
        if (p.inputs && p.inputs.left) {
            p.dx = -currentSpeed;
            p.direction = -1;
        } else if (p.inputs && p.inputs.right) {
            p.dx = currentSpeed;
            p.direction = 1;
        } else {
            p.dx *= 0.9;
        }
        p.x += p.dx;

        // Boundaries
        if (p.x < 0) p.x = 0;
        if (p.x + p.width > CANVAS_WIDTH) p.x = CANVAS_WIDTH - p.width;

        // Pit Fall
        if (p.y > CANVAS_HEIGHT) {
            p.lives--;
            if (p.lives <= 0) {
                const scoreId = updateHighScores(p.name, p.maxScore);
                io.to(id).emit('game_over', { score: p.maxScore, id: scoreId });
                delete players[id];
                const slot = slots.find(s => s.color === p.color);
                if (slot) slot.occupied = false;
                continue;
            } else {
                p.x = 100;
                p.y = 100;
                p.dy = 0;
            }
        }

        // Platforms
        p.grounded = false;
        platforms.forEach(platform => {
            if (p.x < platform.x + platform.width &&
                p.x + p.width > platform.x &&
                p.y < platform.y + platform.height &&
                p.y + p.height > platform.y) {

                // Standard collision check (Robust at Fixed Step)
                if (p.dy >= 0 && (p.y + p.height - p.dy) <= platform.y + 10) {
                    p.grounded = true;
                    p.dy = 0;
                    p.y = platform.y - p.height;
                }
            }
        });

        if (p.invincible > 0) p.invincible--;
    }

    // Update Bubbles
    for (let i = bubbles.length - 1; i >= 0; i--) {
        const b = bubbles[i];
        b.x += b.dx;
        b.dx *= 0.90;
        if (Math.abs(b.dx) < 1) {
            b.dy = -1;
            b.dx = 0;
            b.x += Math.sin(Date.now() / 150) * 0.5;
        }
        b.y += b.dy;
        b.life--;

        // Bubble vs Enemy
        for (const e of enemies) {
            if (e.state === 'normal' &&
                b.x < e.x + e.width && b.x + b.width > e.x &&
                b.y < e.y + e.height && b.y + b.height > e.y) {

                if (e.type === 'boss') {
                    e.hp--;
                    bubbles.splice(i, 1);
                    io.emit('sound', 'BOSS_HIT');

                    if (e.hp <= 0) {
                        e.state = 'fruit';
                        io.emit('sound', 'BOSS_DIE');
                        for (let k = 0; k < 5; k++) {
                            items.push({
                                x: e.x + Math.random() * 40,
                                y: e.y + Math.random() * 40,
                                width: 32,
                                height: 32,
                                type: Math.random() > 0.5 ? 'SHOE' : 'CANDY',
                                id: Date.now() + k
                            });
                        }
                    }
                    break;
                } else {
                    e.state = 'trapped';
                    e.dy = -2;
                    bubbles.splice(i, 1);
                    io.emit('sound', 'POP');
                    break;
                }
            }
        }

        if (b.life <= 0 || b.y < -50) {
            if (bubbles[i] === b) bubbles.splice(i, 1);
        }
    }

    // Update Enemies
    enemies.forEach(e => {
        if (e.state === 'normal') {
            updateEnemyAI(e);

            e.dy += GRAVITY;
            e.x += e.dx;
            e.y += e.dy;

            if (e.x <= 0) { e.x = 0; e.dx *= -1; e.direction = 1; }
            if (e.x + e.width >= CANVAS_WIDTH) { e.x = CANVAS_WIDTH - e.width; e.dx *= -1; e.direction = -1; }

            let onPlatform = false;
            platforms.forEach(platform => {
                if (e.x < platform.x + platform.width &&
                    e.x + e.width > platform.x &&
                    e.y < platform.y + platform.height &&
                    e.y + e.height > platform.y) {

                    if (e.dy > 0 && e.y + e.height - e.dy <= platform.y + 10) {
                        e.dy = 0;
                        e.y = platform.y - e.height;
                        onPlatform = true;
                    }
                }
            });

            if (e.y > CANVAS_HEIGHT) { e.dead = true; }
            e.grounded = onPlatform;

        } else if (e.state === 'trapped') {
            e.y -= 1;
            e.x += Math.sin(Date.now() / 200) * 0.5;
            e.trappedTime++;
            if (e.trappedTime > 300) {
                e.state = 'normal';
                e.trappedTime = 0;
            }
            if (e.y < 0) e.y = 0;
        } else if (e.state === 'fruit') {
            e.dy += GRAVITY;
            e.y += e.dy;
            platforms.forEach(platform => {
                if (e.y + e.height > platform.y && e.y < platform.y + platform.height &&
                    e.x + e.width > platform.x && e.x < platform.x + platform.width) {
                    e.y = platform.y - e.height;
                    e.dy = 0;
                }
            });
            if (e.y > CANVAS_HEIGHT) { e.dead = true; }
        }

        // Collision with Players
        for (const id in players) {
            const p = players[id];
            if (!p.isPlaying) continue;
            if (p.x < e.x + e.width && p.x + p.width > e.x &&
                p.y < e.y + e.height && p.y + p.height > e.y) {

                if (e.state === 'trapped') {
                    e.state = 'fruit';
                    p.dy = -5;
                    p.score += 1000;
                    if (p.score > p.maxScore) p.maxScore = p.score;
                    p.enemiesKilled++;
                    if (p.enemiesKilled % 5 === 0) p.lives++;

                    if (Math.random() < 0.5) {
                        items.push({
                            x: e.x, y: e.y, width: 32, height: 32,
                            type: Math.random() < 0.5 ? 'SHOE' : 'CANDY',
                            id: Date.now(), spawnTime: Date.now()
                        });
                    }

                } else if (e.state === 'fruit') {
                    p.score += 500;
                    if (e.type === 'boss') p.lives += 3;
                    e.dead = true;
                    if (p.score > p.maxScore) p.maxScore = p.score;
                } else if (e.state === 'normal' && p.invincible === 0) {
                    p.lives--;
                    if (p.lives <= 0) {
                        const scoreId = updateHighScores(p.name, p.maxScore);
                        io.to(id).emit('game_over', { score: p.maxScore, id: scoreId });
                        delete players[id];
                        const slot = slots.find(s => s.color === p.color);
                        if (slot) slot.occupied = false;
                    } else {
                        p.x = 100; p.y = 100; p.dy = 0; p.invincible = 120;
                        io.emit('sound', 'BOSS_HIT');
                    }
                }
            }
        }
    });

    // Update Items
    items = items.filter(item => {
        if (item.spawnTime && Date.now() - item.spawnTime < 1000) return true;
        let collected = false;
        for (const id in players) {
            const p = players[id];
            if (!p.isPlaying) continue;
            if (p.x < item.x + item.width && p.x + p.width > item.x &&
                p.y < item.y + item.height && p.y + p.height > item.y) {

                collected = true;
                io.emit('sound', 'COLLECT');
                if (item.type === 'SHOE') p.speedBuff = 600;
                else if (item.type === 'CANDY') p.fireBuff = 600;
            }
        }
        return !collected;
    });

    // Verify Buffer Timers
    for (const id in players) {
        const p = players[id];
        if (p.speedBuff > 0) p.speedBuff--;
        if (p.fireBuff > 0) p.fireBuff--;
    }

    // Cleanup Dead Enemies & Respawn
    const initialCount = enemies.length;
    enemies = enemies.filter(e => !e.dead);
    if (enemies.length === 0 && initialCount > 0) {
        setTimeout(spawnEnemies, 2000);
    }
}

const PORT = process.env.PORT || 3000;
http.listen(PORT, () => {
    console.log(`Listening on *:${PORT}`);
});
