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
    if (score < 0) return; // Only ignore negative scores (if any)
    highScores.push({ name: name || 'Anonymous', score: score, date: new Date().toISOString() });
    highScores.sort((a, b) => b.score - a.score);
    highScores = highScores.slice(0, 50); // Keep Top 50
    saveHighScores();
    io.emit('highscores', highScores); // Broadcast update
}

// Initial Load
loadHighScores();

// Game Constants
const GRAVITY = 0.5;
const FRICTION = 0.8;
const JUMP_STRENGTH = -16;
const SPEED = 5;
const BUBBLE_SPEED = 6;
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Game State
const players = {};
const bubbles = [];
let enemies = [];
let items = []; // Power-ups
let lastEnemySpawn = 0;
let waveCount = 0;

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
            // Decision based on Type
            if (enemy.type === 'fearful') {
                enemy.aiState = 'FLEE';
            } else {
                enemy.aiState = 'CHASE';
            }
            enemy.reactionTimer = 10; // Reaction delay
        }

        // Cliff Detection (Patrol Only)
        // We need to know current platform bounds. Simple check: if not grounded next frame could fall.
        // But since we are separating physics, we can check "lookahead" here if grounded.
        if (enemy.grounded) {
            const lookAheadX = (enemy.direction === 1) ? enemy.x + enemy.width + 10 : enemy.x - 10;
            let aboutToFall = true;

            // Check against known platforms
            platforms.forEach(p => {
                if (lookAheadX >= p.x && lookAheadX <= p.x + p.width &&
                    enemy.y + enemy.height === p.y) { // Loosely check if on platform y level
                    aboutToFall = false;
                }
            });
            // Bottom boundary is safe
            if (enemy.y + enemy.height >= CANVAS_HEIGHT) aboutToFall = false;

            if (aboutToFall) {
                enemy.direction *= -1;
                enemy.dx = enemy.direction * PATROL_SPEED;
            }
        }

    } else if (enemy.aiState === 'CHASE') {
        if (!target || minDist > CHASE_RANGE * 1.5) {
            enemy.aiState = 'PATROL';
        } else {
            if (enemy.reactionTimer > 0) {
                enemy.reactionTimer--;
            } else {
                // Horizontal Chase
                if (target.x > enemy.x + 10) enemy.direction = 1;
                else if (target.x < enemy.x - 10) enemy.direction = -1;

                enemy.dx = enemy.direction * CHASE_SPEED;

                // Vertical Logic (Jump)
                if (enemy.grounded && target.y < enemy.y - 50) {
                    // Player is significantly above
                    enemy.dy = JUMP_STRENGTH;
                    enemy.grounded = false;
                }
            }
        }
    } else if (enemy.aiState === 'FLEE') {
        if (!target || minDist > CHASE_RANGE * 2) {
            enemy.aiState = 'PATROL';
        } else {
            // Panic Mode (Jumping over player)
            if (enemy.panicTimer > 0) {
                enemy.panicTimer--;
                // Maintain momentum
                enemy.dx = enemy.direction * CHASE_SPEED * 1.5;
            } else {
                // Normal Flee
                if (target.x > enemy.x) enemy.direction = -1;
                else enemy.direction = 1;

                enemy.dx = enemy.direction * CHASE_SPEED * 1.2;

                // Wall Detection & Panic Trigger
                const nearLeft = enemy.x < 40;
                const nearRight = enemy.x + enemy.width > CANVAS_WIDTH - 40;

                if ((enemy.direction === -1 && nearLeft) || (enemy.direction === 1 && nearRight)) {
                    // Running into a wall
                    if (enemy.grounded) {
                        enemy.dy = JUMP_STRENGTH * 1.1; // Jump high
                        enemy.grounded = false;

                        // If player is really close, Panic Jump OVER them
                        if (minDist < 150) {
                            enemy.direction *= -1; // Reverse direction (towards player)
                            enemy.dx = enemy.direction * CHASE_SPEED * 1.5; // Fast
                            enemy.panicTimer = 40; // Commit to this jump for ~0.6s
                        }
                    }
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
        maxScore: 0
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
    socket.on('join_game', (name) => {
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
        io.emit('state', { players, bubbles, enemies, items, platforms });
        socket.emit('highscores', highScores); // Send scores on join
    });

    socket.on('request_highscores', () => {
        socket.emit('highscores', highScores);
    });

    socket.on('disconnect', () => {
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
    });

    socket.on('input', (input) => {
        const player = players[socket.id];
        if (!player) return; // Ignore if not joined yet

        const currentSpeed = (player.speedBuff > 0) ? 6 : 4; // SPEED 4 or 6

        if (input.left) {
            player.dx = -currentSpeed;
            player.direction = -1;
        } else if (input.right) {
            player.dx = currentSpeed;
            player.direction = 1;
        } else {
            player.dx = 0;
        }

        if (input.up && player.grounded) {
            player.dy = -14; // Jump Strength Adjusted
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

// Game Loop (60 FPS)
setInterval(() => {
    try {
        // Update Players
        for (const id in players) {
            const p = players[id];

            // Physics
            p.dy += GRAVITY;
            p.y += p.dy;
            p.x += p.dx;

            // Friction decay if no input (simplified)
            p.dx *= 0.9;

            // Boundaries
            if (p.x < 0) p.x = 0;
            if (p.x + p.width > CANVAS_WIDTH) p.x = CANVAS_WIDTH - p.width;

            // Platforms
            p.grounded = false;
            platforms.forEach(platform => {
                if (p.x < platform.x + platform.width &&
                    p.x + p.width > platform.x &&
                    p.y < platform.y + platform.height &&
                    p.y + p.height > platform.y) {

                    if (p.dy > 0 && p.y + p.height - p.dy <= platform.y) {
                        p.grounded = true;
                        p.dy = 0;
                        p.y = platform.y - p.height;
                    }
                }
            });

            if (p.y > CANVAS_HEIGHT) {
                // Pit Death
                if (p.score < 500) {
                    // Game Over
                    io.to(id).emit('game_over', p.score);
                    updateHighScores(p.name, p.maxScore); // Save Max Score
                    delete players[id];

                    // Release slot
                    const slot = slots.find(s => s.color === p.color);
                    if (slot) slot.occupied = false;

                    continue; // Skip rest of loop for this player
                } else {
                    // Penalty and Respawn
                    p.x = 100;
                    p.y = 100;
                    p.dy = 0;
                    p.dx = 0;
                    p.invincible = 120; // 2 sec
                    p.score -= 500;
                    io.emit('sound', 'BOSS_HIT'); // Sound
                }
            }

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
                        // Boss takes damage
                        e.hp--;
                        bubbles.splice(i, 1); // Pop bubble
                        io.emit('sound', 'BOSS_HIT'); // Sound Event

                        if (e.hp <= 0) {
                            e.state = 'fruit';
                            e.dead = true;
                            io.emit('sound', 'BOSS_DIE'); // Sound Event

                            // Spawn massive loot
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
                        // Normal Enemy
                        e.state = 'trapped';
                        e.dy = -2;
                        bubbles.splice(i, 1);
                        io.emit('sound', 'POP'); // Sound Event
                        break;
                    }
                }
            }

            if (b.life <= 0 || b.y < -50) {
                if (bubbles[i] === b) bubbles.splice(i, 1); // Safety check
            }
        }

        // Update Enemies
        enemies.forEach(e => {
            if (e.state === 'normal') {
                updateEnemyAI(e);

                // Physics application after AI decision
                e.dy += GRAVITY;
                e.x += e.dx;
                e.y += e.dy;

                // Screen wrap (optional, or keep bound)
                if (e.x <= 0) {
                    e.x = 0;
                    e.dx *= -1;
                    e.direction = 1;
                }
                if (e.x + e.width >= CANVAS_WIDTH) {
                    e.x = CANVAS_WIDTH - e.width;
                    e.dx *= -1;
                    e.direction = -1;
                }

                // Platform Collision & AI Jumping
                let onPlatform = false;
                platforms.forEach(platform => {
                    if (e.x < platform.x + platform.width &&
                        e.x + e.width > platform.x &&
                        e.y < platform.y + platform.height &&
                        e.y + e.height > platform.y) {

                        if (e.dy > 0 && e.y + e.height - e.dy <= platform.y) {
                            e.dy = 0;
                            e.y = platform.y - e.height;
                            onPlatform = true;
                        }
                    }
                });

                if (e.y > CANVAS_HEIGHT) {
                    e.dead = true;
                }

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
                if (e.y > CANVAS_HEIGHT) {
                    e.dead = true;
                }
            }

            // Collision with Players
            for (const id in players) {
                const p = players[id];
                if (p.x < e.x + e.width && p.x + p.width > e.x &&
                    p.y < e.y + e.height && p.y + p.height > e.y) {

                } else if (e.state === 'trapped') {
                    e.state = 'fruit';
                    p.dy = -5;
                    p.score += 1000;
                    if (p.score > p.maxScore) p.maxScore = p.score;

                    // Spawn Power-up Chance (20%)
                    if (Math.random() < 0.2) {
                        const type = Math.random() < 0.5 ? 'SHOE' : 'CANDY';
                        items.push({
                            x: e.x,
                            y: e.y,
                            width: 32,
                            height: 32,
                            type: type,
                            id: Date.now()
                        });
                    }

                } else if (e.state === 'fruit') {
                    p.score += 500;
                    // Respawn logic handled by filtering
                    e.dead = true;
                    if (p.score > p.maxScore) p.maxScore = p.score;
                } else if (e.state === 'normal' && p.invincible === 0) {
                    if (p.score < 500) {
                        // Game Over
                        io.to(id).emit('game_over', p.score);
                        updateHighScores(p.name, p.maxScore); // Save Max Score
                        delete players[id];

                        // Release slot
                        const slot = slots.find(s => s.color === p.color);
                        if (slot) slot.occupied = false;

                        // Break handled by loop but good to ensure
                    } else {
                        // Penalty and Respawn
                        p.x = 100;
                        p.y = 100;
                        p.dy = 0;
                        p.invincible = 120; // 2 sec
                        p.score -= 500;
                    }
                }
            }
        }
        });

// Update Items
// Collision with players
items = items.filter(item => {
    let collected = false;
    for (const id in players) {
        const p = players[id];
        if (p.x < item.x + item.width && p.x + p.width > item.x &&
            p.y < item.y + item.height && p.y + p.height > item.y) {

            collected = true;
            io.emit('sound', 'COLLECT'); // Sound Event
            if (item.type === 'SHOE') p.speedBuff = 600; // 10s
            else if (item.type === 'CANDY') p.fireBuff = 600; // 10s
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

// Broadcast State
io.emit('state', { players, bubbles, enemies, items, platforms });

    } catch (err) {
    console.error('Game Loop Error:', err);
}
}, 1000 / 60);

http.listen(3000, () => {
    console.log('Listening on *:3000');
});
