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
const { Pool } = require('pg');
const HIGHSCORE_FILE = path.join(__dirname, 'highscores.json');
let highScores = [];

// Database Connection
const pool = process.env.DATABASE_URL ? new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
}) : null;

if (pool) {
    console.log('Connected to PostgreSQL Database');
    pool.query(`
        CREATE TABLE IF NOT EXISTS highscores (
            id VARCHAR(50) PRIMARY KEY,
            name VARCHAR(50),
            score INTEGER,
            date TIMESTAMP
        );
    `).catch(err => console.error('Error creating table:', err));
} else {
    console.log('No Database URL found. Using local file system.');
}

function loadHighScores() {
    if (pool) {
        pool.query('SELECT * FROM highscores ORDER BY score DESC LIMIT 50')
            .then(res => {
                highScores = res.rows;
                io.emit('highscores', highScores);
            })
            .catch(err => console.error('Error loading highscores from DB:', err));
    } else {
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
}

function updateHighScores(name, score) {
    if (score < 0) return null;
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 5); // Unique ID
    const date = new Date().toISOString();

    if (pool) {
        // Optimistic update for immediate feedback
        highScores.push({ id, name: name || 'Anonymous', score, date });
        highScores.sort((a, b) => b.score - a.score);
        highScores = highScores.slice(0, 50);
        io.emit('highscores', highScores);

        // Async DB Update
        pool.query('INSERT INTO highscores (id, name, score, date) VALUES ($1, $2, $3, $4)', [id, name || 'Anonymous', score, date])
            .then(() => {
                // Refresh to ensure consistency
                loadHighScores();
            })
            .catch(err => console.error('Error saving score to DB:', err));
    } else {
        highScores.push({ id: id, name: name || 'Anonymous', score: score, date: date });
        highScores.sort((a, b) => b.score - a.score);
        highScores = highScores.slice(0, 50); // Keep Top 50
        try {
            fs.writeFileSync(HIGHSCORE_FILE, JSON.stringify(highScores, null, 2));
        } catch (err) {
            console.error('Error saving highscores locally:', err);
        }
        io.emit('highscores', highScores);
    }
    return id;
}

// Initial Load
loadHighScores();

// Game Constants
const GRAVITY = 0.5;
const FRICTION = 0.8;
const JUMP_STRENGTH = -18;
// const SPEED = 5; // Unused, logic in physics
const CANVAS_WIDTH = 800;
const CANVAS_HEIGHT = 600;

// Player Slots (Fixed Colors - 15 Variants)
const DEFAULT_COLORS = [
    '#00dd00', '#0055dd', '#dd0000', '#dd00dd', '#dddd00',
    '#00dddd', '#ff8800', '#ff88ff', '#aaaaaa', '#ffffff',
    '#005500', '#000088', '#880000', '#888800', '#008888'
];

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

// --- ROOM CLASS ---
class GameRoom {
    constructor(name, mode, speed) {
        this.name = name;
        this.mode = mode || 'COOP'; // 'COOP' or 'PVP'
        this.speedMode = speed || 'slow';

        // Timer settings
        this.tickRate = (this.speedMode === 'fast') ? 60 : 30;
        this.fixedStep = 1000 / this.tickRate;
        this.accumulator = 0;

        this.players = {};
        this.bubbles = [];
        this.enemies = [];
        this.items = [];
        this.waveCount = 0; // Starts at 0, spawnEnemies increments to 1
        this.gamePaused = false;

        this.currentMapIndex = 0;
        this.platforms = MAPS[0];

        // Slots
        this.slots = DEFAULT_COLORS.map((c, i) => ({ id: i, color: c, occupied: false }));

        console.log(`Room '${this.name}' created. Mode: ${this.mode}, Speed: ${this.speedMode}`);

        if (this.mode === 'COOP') {
            this.spawnEnemies();
        }
    }

    addPlayer(socketId, playerName) {
        let assignedSlot = this.slots.find(s => !s.occupied);
        if (!assignedSlot) {
            assignedSlot = { id: 0, color: '#00dd00' };
        } else {
            assignedSlot.occupied = true;
        }

        const newPlayer = {
            room: this.name,
            x: 100,
            y: 100,
            width: 32,
            height: 32,
            dx: 0,
            dy: 0,
            direction: 1,
            grounded: false,
            invincible: 180, // 3s immunity
            score: 0,
            maxScore: 0,
            name: playerName,
            color: assignedSlot.color,
            characterId: assignedSlot.id,
            id: socketId,
            speedBuff: 0,
            fireBuff: 0,
            lastShoot: 0,
            isPlaying: true, // Auto-start
            lives: 5,
            shield: 0,
            enemiesKilled: 0,
            inputs: { left: false, right: false, up: false, shoot: false }
        };

        this.players[socketId] = newPlayer;
        return newPlayer;
    }

    removePlayer(socketId) {
        const p = this.players[socketId];
        if (p) {
            const slot = this.slots.find(s => s.color === p.color);
            if (slot) slot.occupied = false;
            delete this.players[socketId];
        }

        // Reset Logic handled externally or check if empty
        if (Object.keys(this.players).length === 0) {
            // Room is empty, will be cleaned up
        }
    }

    resetGame() {
        this.waveCount = 0;
        this.enemies = [];
        this.bubbles = [];
        this.items = [];
        this.currentMapIndex = 0;
        this.platforms = MAPS[0];
        this.slots.forEach(s => s.occupied = false);

        // Re-occupy slots for connected players (if we kept them, but usually reset happens when empty)
        // If resetting while players are connected (e.g. manual reset?), we need to handle slots.
        // For now, assume this is called when empty or full restart. 
        // Logic below assumes connected players need re-slotting if this was a live reset.
        // But for "Empty Room Reset", it's fine.

        if (this.mode !== 'PVP') {
            this.spawnEnemies();
        }
    }

    spawnEnemies() {
        if (this.mode === 'PVP') return;
        this.waveCount++;
        this.enemies = [];

        const count = 3 + Math.floor(this.waveCount / 2);
        const baseSpeed = 2 + (this.waveCount * 0.2);

        // Map Evolution
        if (this.waveCount % 3 === 0) {
            this.currentMapIndex = (this.currentMapIndex + 1) % MAPS.length;
            this.platforms = MAPS[this.currentMapIndex];
            io.to(this.name).emit('map_update', this.platforms);

            // Teleport
            for (const id in this.players) {
                const p = this.players[id];
                p.x = 100; p.y = 100; p.dy = 0;
            }
        }

        // Boss Wave
        const isBossWave = (this.waveCount % 10 === 0);
        if (isBossWave) {
            this.enemies.push({
                x: 400 - 32, y: 100, width: 64, height: 64,
                dx: (Math.random() < 0.5 ? 1 : -1) * (baseSpeed * 0.8),
                dy: 0, direction: 1, state: 'normal', type: 'boss',
                hp: 20, maxHp: 20, panicTimer: 0, trappedTime: 0, id: Date.now()
            });
            // Minions
            for (let i = 0; i < 2; i++) {
                this.enemies.push({
                    x: Math.random() * (CANVAS_WIDTH - 100) + 50, y: 100, width: 32, height: 32,
                    dx: (Math.random() < 0.5 ? 1 : -1) * baseSpeed, dy: 0, direction: 1,
                    state: 'normal', type: 'chaser', id: Date.now() + i + 1
                });
            }
        } else {
            for (let i = 0; i < count; i++) {
                const dir = Math.random() < 0.5 ? 1 : -1;
                const type = Math.random() < 0.5 ? 'chaser' : 'fearful';
                this.enemies.push({
                    x: Math.random() * (CANVAS_WIDTH - 100) + 50,
                    y: 100,
                    width: 32, height: 32,
                    dx: dir * baseSpeed, dy: 0, direction: dir,
                    state: 'spawning', spawnTimer: 60 + (i * 30),
                    type: type, panicTimer: 0, trappedTime: 0, id: Date.now() + i
                });
            }
        }
    }

    updateHighScoresHelper(name, score) {
        updateHighScores(name, score);
    }

    updatePhysics() {
        if (this.gamePaused) return;

        // --- PLAYERS ---
        for (const id in this.players) {
            const p = this.players[id];
            if (!p.isPlaying) continue;

            p.dy += GRAVITY;
            p.y += p.dy;

            const currentSpeed = (p.speedBuff > 0) ? 6 : 4;
            if (p.inputs.left) { p.dx = -currentSpeed; p.direction = -1; }
            else if (p.inputs.right) { p.dx = currentSpeed; p.direction = 1; }
            else { p.dx *= 0.9; }
            p.x += p.dx;

            // Bounds
            if (p.x < 0) p.x = 0;
            if (p.x + p.width > CANVAS_WIDTH) p.x = CANVAS_WIDTH - p.width;

            // Pit Fall
            if (p.y > CANVAS_HEIGHT) {
                p.lives--;
                if (p.lives <= 0) {
                    const scoreId = updateHighScores(p.name, p.maxScore);
                    io.to(id).emit('game_over', { score: p.maxScore, id: scoreId });
                    this.removePlayer(id); // Simple remove, disconnect logic handles socket if needed
                    // Actually key is keeping socket in room, but removing from game logic
                    // For correct socket handling, we just set isPlaying false or delete?
                    // Existing logic deleted from object.
                    delete this.players[id];
                    // Logic for "Disconnect" also calls removePlayer.
                    // Here we just remove from game, but connection stays open until quit/refresh.
                    continue;
                } else {
                    p.x = 100; p.y = 100; p.dy = 0;
                }
            }

            // Platforms
            p.grounded = false;
            this.platforms.forEach(platform => {
                if (p.x < platform.x + platform.width && p.x + p.width > platform.x &&
                    p.y < platform.y + platform.height && p.y + p.height > platform.y) {
                    if (p.dy >= 0 && (p.y + p.height - p.dy) <= platform.y + 10) {
                        p.grounded = true; p.dy = 0; p.y = platform.y - p.height;
                    }
                }
            });

            if (p.invincible > 0) p.invincible--;

            // PVP Trapped
            if (p.state === 'trapped') {
                p.dy = -1;
                p.x += Math.sin(Date.now() / 200) * 0.5;
                if (p.y <= 0) p.y = 0;
                if (!p.trappedTimer) p.trappedTimer = 0;
                p.trappedTimer++;
                if (p.trappedTimer > 300) {
                    p.state = 'normal'; p.invincible = 180; p.trappedTimer = 0;
                }
                continue;
            }
        }

        // --- BUBBLES ---
        for (let i = this.bubbles.length - 1; i >= 0; i--) {
            const b = this.bubbles[i];
            b.x += b.dx; b.dx *= 0.90;
            if (Math.abs(b.dx) < 1) { b.dy = -1; b.dx = 0; b.x += Math.sin(Date.now() / 150) * 0.5; }
            b.y += b.dy;
            b.life--;

            // Bubble vs Enemy (COOP)
            if (this.mode !== 'PVP') {
                for (const e of this.enemies) {
                    if (e.state === 'normal' && b.x < e.x + e.width && b.x + b.width > e.x &&
                        b.y < e.y + e.height && b.y + b.height > e.y) {

                        if (e.type === 'boss') {
                            e.hp--; this.bubbles.splice(i, 1);
                            io.to(this.name).emit('sound', 'BOSS_HIT');
                            if (e.hp <= 0) {
                                e.state = 'fruit'; io.to(this.name).emit('sound', 'BOSS_DIE');
                                for (let k = 0; k < 5; k++) {
                                    this.items.push({
                                        x: e.x + Math.random() * 40, y: e.y + Math.random() * 40,
                                        width: 32, height: 32,
                                        type: Math.random() > 0.3 ? (Math.random() > 0.5 ? 'SHOE' : 'CANDY') : 'SHIELD',
                                        id: Date.now() + k
                                    });
                                }
                            }
                            break;
                        } else {
                            e.state = 'trapped'; e.dy = -2;
                            this.bubbles.splice(i, 1);
                            io.to(this.name).emit('sound', 'POP');
                            break;
                        }
                    }
                }
            }

            // PVP Collision
            if (this.mode === 'PVP' || this.mode === 'PVPVE') {
                for (const id in this.players) {
                    const p = this.players[id];
                    if (!p.isPlaying || p.state === 'trapped' || p.invincible > 0 || b.owner === id) continue;

                    if (b.x < p.x + p.width && b.x + b.width > p.x &&
                        b.y < p.y + p.height && b.y + b.height > p.y) {
                        p.state = 'trapped'; p.trappedTimer = 0; p.dy = -2; p.invincible = 0;
                        this.bubbles.splice(i, 1);
                        io.to(this.name).emit('sound', 'POP');
                        break;
                    }
                }
            }

            if (b.life <= 0 || b.y < -50) {
                if (this.bubbles[i] === b) this.bubbles.splice(i, 1);
            }
        }

        // --- ENEMIES (COOP) ---
        if (this.mode !== 'PVP') {
            this.enemies.forEach(e => {
                if (e.state === 'spawning') {
                    // Internal function call for AI needs context or simplified inline
                    // updateEnemyAI(e);
                    // Copying logic inline for self-contained class or define method
                    this.updateEnemyAI(e);
                    return;
                }

                if (e.state === 'normal') {
                    this.updateEnemyAI(e);
                    e.dy += GRAVITY; e.x += e.dx; e.y += e.dy;
                    if (e.x <= 0) { e.x = 0; e.dx *= -1; e.direction = 1; }
                    if (e.x + e.width >= CANVAS_WIDTH) { e.x = CANVAS_WIDTH - e.width; e.dx *= -1; e.direction = -1; }

                    let onPlatform = false;
                    this.platforms.forEach(platform => {
                        if (e.x < platform.x + platform.width && e.x + e.width > platform.x &&
                            e.y < platform.y + platform.height && e.y + e.height > platform.y) {
                            if (e.dy > 0 && e.y + e.height - e.dy <= platform.y + 10) {
                                e.dy = 0; e.y = platform.y - e.height; onPlatform = true;
                            }
                        }
                    });
                    if (e.y > CANVAS_HEIGHT) e.dead = true;
                    e.grounded = onPlatform;

                } else if (e.state === 'trapped') {
                    e.y -= 1; e.x += Math.sin(Date.now() / 200) * 0.5;
                    e.trappedTime++;
                    if (e.trappedTime > 300) { e.state = 'normal'; e.trappedTime = 0; }
                    if (e.y < 0) e.y = 0;
                } else if (e.state === 'fruit') {
                    e.dy += GRAVITY; e.y += e.dy;
                    this.platforms.forEach(platform => {
                        if (e.y + e.height > platform.y && e.y < platform.y + platform.height &&
                            e.x + e.width > platform.x && e.x < platform.x + platform.width) {
                            e.y = platform.y - e.height; e.dy = 0;
                        }
                    });
                    if (e.y > CANVAS_HEIGHT) e.dead = true;
                }

                // Player Collisions
                for (const id in this.players) {
                    const p = this.players[id];
                    if (!p.isPlaying) continue;
                    if (p.x < e.x + e.width && p.x + p.width > e.x &&
                        p.y < e.y + e.height && p.y + p.height > e.y) {

                        if (e.state === 'trapped') {
                            e.state = 'fruit'; p.dy = -5;
                            p.score += 1000;
                            if (p.score > p.maxScore) p.maxScore = p.score;
                            p.enemiesKilled++;
                            if (p.enemiesKilled % 5 === 0) p.lives++;
                            if (Math.random() < 0.5) {
                                this.items.push({
                                    x: e.x, y: e.y, width: 32, height: 32,
                                    type: Math.random() > 0.3 ? (Math.random() > 0.5 ? 'SHOE' : 'CANDY') : 'SHIELD',
                                    id: Date.now(), spawnTime: Date.now()
                                });
                            }
                        } else if (e.state === 'fruit') {
                            p.score += 500; if (e.type === 'boss') p.lives += 3; e.dead = true;
                            if (p.score > p.maxScore) p.maxScore = p.score;
                        } else if (e.state === 'normal' && p.invincible === 0) {
                            if (p.shield > 0) {
                                p.shield--; p.invincible = 120; io.to(this.name).emit('sound', 'POP');
                            } else {
                                p.lives--;
                                if (p.lives <= 0) {
                                    const scoreId = updateHighScores(p.name, p.maxScore);
                                    io.to(id).emit('game_over', { score: p.maxScore, id: scoreId });
                                    delete this.players[id];
                                } else {
                                    p.x = 100; p.y = 100; p.dy = 0; p.invincible = 120;
                                    io.to(this.name).emit('sound', 'BOSS_HIT');
                                }
                            }
                        }
                    }
                }
            });
            // Cleanup dead
            this.enemies = this.enemies.filter(e => !e.dead);

            if (this.mode !== 'PVP' && this.enemies.length === 0) {
                this.spawnEnemies();
            }
        }

        // --- ITEMS ---
        this.items = this.items.filter(item => {
            if (item.spawnTime && Date.now() - item.spawnTime < 1000) return true;
            let collected = false;
            for (const id in this.players) {
                const p = this.players[id];
                if (!p.isPlaying) continue;
                if (p.x < item.x + item.width && p.x + p.width > item.x &&
                    p.y < item.y + item.height && p.y + p.height > item.y) {
                    collected = true;
                    io.to(this.name).emit('sound', 'COLLECT');
                    if (item.type === 'SHOE') p.speedBuff = 600;
                    else if (item.type === 'CANDY') p.fireBuff = 600;
                    else if (item.type === 'SHIELD') p.shield = (p.shield || 0) + 1;
                }
            }
            return !collected;
        });

        // --- PVP ELIMINATION ---
        if (this.mode === 'PVP' || this.mode === 'PVPVE') {
            for (const idA in this.players) {
                for (const idB in this.players) {
                    if (idA === idB) continue;
                    const pA = this.players[idA];
                    const pB = this.players[idB];
                    if (!pA || !pB || !pA.isPlaying || !pB.isPlaying) continue;
                    if (pB.state !== 'trapped') continue;

                    if (pA.x < pB.x + pB.width && pA.x + pA.width > pB.x &&
                        pA.y < pB.y + pB.height && pA.y + pA.height > pB.y) {

                        pB.lives--; pB.state = 'normal'; pB.trappedTimer = 0;
                        if (pB.lives <= 0) {
                            const scoreId = updateHighScores(pB.name, pB.score);
                            io.to(idB).emit('game_over', { score: pB.score, id: scoreId });
                            delete this.players[idB];

                            // Win Check
                            const remaining = Object.values(this.players).filter(p => p.isPlaying);
                            if (remaining.length === 1) {
                                console.log(`Room ${this.name}: Winner is ${remaining[0].name}`);
                                // Could emit winner event
                            }
                        } else {
                            pB.x = Math.random() * (CANVAS_WIDTH - 100) + 50; pB.y = 100; pB.dy = 0; pB.invincible = 180;
                        }
                    }
                }
            }
        }

        // Check Buff Timers (Common)
        for (const id in this.players) {
            const p = this.players[id];
            if (p.speedBuff > 0) p.speedBuff--;
            if (p.fireBuff > 0) p.fireBuff--;
        }
    }

    updateEnemyAI(enemy) {
        // ... (AI Logic Copied from original, using 'this.players') ...
        if (!enemy.aiState) enemy.aiState = 'PATROL';
        if (!enemy.reactionTimer) enemy.reactionTimer = 0;
        if (!enemy.panicTimer) enemy.panicTimer = 0;

        const CHASE_RANGE = 200;
        const CHASE_SPEED = 2.0 + (this.waveCount * 0.2);
        const PATROL_SPEED = 1.5 + (this.waveCount * 0.2);

        let target = null;
        let minDist = Infinity;

        for (const id in this.players) {
            const p = this.players[id];
            if (p.invincible > 0) continue;
            const dist = Math.sqrt(Math.pow(p.x - enemy.x, 2) + Math.pow(p.y - enemy.y, 2));
            if (dist < minDist) { minDist = dist; target = p; }
        }

        if (enemy.state === 'spawning') {
            if (enemy.spawnTimer > 0) enemy.spawnTimer--;
            else enemy.state = 'normal';
            return;
        }

        if (enemy.aiState === 'PATROL') {
            enemy.dx = enemy.direction * PATROL_SPEED;
            if (target && minDist < CHASE_RANGE) enemy.aiState = 'CHASE';
            if (Math.random() < 0.01) enemy.direction *= -1;
        } else if (enemy.aiState === 'CHASE') {
            if (target) {
                const dirToPlayer = Math.sign(target.x - enemy.x);
                if (dirToPlayer !== Math.sign(enemy.dx)) {
                    enemy.reactionTimer++;
                    if (enemy.reactionTimer > 20) { enemy.direction = dirToPlayer; enemy.reactionTimer = 0; }
                } else { enemy.reactionTimer = 0; }
                enemy.dx = enemy.direction * CHASE_SPEED;

                if (target.y < enemy.y - 50 && enemy.grounded && Math.random() < 0.05) {
                    enemy.dy = JUMP_STRENGTH; enemy.grounded = false;
                }
            }
            if (!target || minDist > CHASE_RANGE * 1.5) enemy.aiState = 'PATROL';
        }

        if (enemy.type === 'fearful' && target && minDist < 150) {
            enemy.aiState = 'FLEE';
            const dirAway = Math.sign(enemy.x - target.x);
            enemy.dx = dirAway * CHASE_SPEED * 1.2;
        }

        if (enemy.type === 'boss') {
            if (enemy.panicTimer > 0) {
                enemy.panicTimer--;
            } else {
                if (Math.random() < 0.01 && enemy.grounded) {
                    enemy.dy = JUMP_STRENGTH * 1.3;
                    enemy.dx = (target ? Math.sign(target.x - enemy.x) : enemy.direction) * 5;
                    enemy.panicTimer = 60;
                }
            }
        } else {
            if (enemy.grounded) {
                const lookAheadX = enemy.x + (enemy.direction * 40);
                let platformAhead = false;
                this.platforms.forEach(p => {
                    if (lookAheadX > p.x && lookAheadX < p.x + p.width && enemy.y + enemy.height === p.y) platformAhead = true;
                });
                if (!platformAhead || lookAheadX < 0 || lookAheadX > CANVAS_WIDTH) {
                    if (Math.random() < 0.8) { enemy.dy = JUMP_STRENGTH; enemy.grounded = false; }
                    else { enemy.direction *= -1; }
                }
            }
        }
    }
}

// --- GLOBAL STATE ---
const rooms = {}; // Room Map: Name -> GameRoom

// Helper to get active public rooms
function getPublicRooms() {
    return Object.values(rooms)
        .filter(r => r.isPublic)
        .map(r => ({
            name: r.name,
            mode: r.mode,
            players: Object.keys(r.players).length
        }));
}

function broadcastRoomList() {
    const list = getPublicRooms();
    io.emit('room_list', list);
}

// Socket Handler
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);
    let currentRoom = null;

    // Send list on connect
    socket.emit('room_list', getPublicRooms());

    socket.on('join_game', (data) => {
        // Data: name, room, speed, mode, isPrivate
        const name = (typeof data === 'object') ? data.name : data;
        const roomName = (typeof data === 'object' && data.room) ? data.room : 'Arcade';
        const speed = (typeof data === 'object') ? data.speed : 'slow';
        const mode = (typeof data === 'object') ? data.mode : 'COOP';
        const isPrivate = (typeof data === 'object') ? data.isPrivate : false;

        socket.join(roomName);

        // Find or Create Room
        if (!rooms[roomName]) {
            rooms[roomName] = new GameRoom(roomName, mode, speed);
            rooms[roomName].isPublic = !isPrivate;
            broadcastRoomList(); // New Room
        }
        currentRoom = rooms[roomName];

        // Add Player
        const player = currentRoom.addPlayer(socket.id, name);
        console.log(`Player ${name} joined room ${roomName} (${currentRoom.mode})`);

        broadcastRoomList(); // Player Count Update

        // Initial Emit
        socket.emit('map_update', currentRoom.platforms);
        io.to(roomName).emit('state', {
            players: currentRoom.players,
            bubbles: currentRoom.bubbles,
            enemies: currentRoom.enemies,
            items: currentRoom.items
        });
        socket.emit('highscores', highScores);
    });

    socket.on('request_highscores', () => {
        socket.emit('highscores', highScores);
    });

    socket.on('disconnect', () => {
        if (currentRoom) {
            const p = currentRoom.players[socket.id];
            if (p) updateHighScores(p.name, p.maxScore);
            currentRoom.removePlayer(socket.id);

            // Cleanup Room if empty
            if (Object.keys(currentRoom.players).length === 0) {
                console.log(`Room ${currentRoom.name} is empty. Deleting.`);
                delete rooms[currentRoom.name];
            }
            broadcastRoomList();
        }
    });

    socket.on('input', (input) => {
        if (!currentRoom) return;
        const player = currentRoom.players[socket.id];
        if (!player) return;

        player.inputs = input;

        // Logic for Jump/Shoot (Instant actions)
        if (input.up && player.grounded) {
            player.dy = -16; player.grounded = false;
        }

        if (input.shoot) {
            const now = Date.now();
            const cooldown = (player.fireBuff > 0) ? 200 : 500;
            if (now - player.lastShoot > cooldown) {
                player.lastShoot = now;
                currentRoom.bubbles.push({
                    x: player.direction === 1 ? player.x + player.width : player.x - 32,
                    y: player.y, width: 32, height: 32,
                    dx: player.direction * 6, dy: 0, life: 180, owner: socket.id
                });
            }
        }
    });

    socket.on('toggle_pause', () => {
        if (currentRoom) {
            currentRoom.gamePaused = !currentRoom.gamePaused;
        }
    });

    socket.on('quit_game', () => {
        if (currentRoom) {
            const p = currentRoom.players[socket.id];
            if (p) {
                updateHighScores(p.name, p.score);
                io.to(socket.id).emit('game_over', p.score);
                currentRoom.removePlayer(socket.id);
            }
            if (Object.keys(currentRoom.players).length === 0) {
                delete rooms[currentRoom.name];
            }
            broadcastRoomList();
            currentRoom = null;
        }
    });

});

// Global Game Loop (Multi-Room)
let lastTimeGame = Date.now();

setInterval(() => {
    try {
        const now = Date.now();
        let frameTime = now - lastTimeGame;
        lastTimeGame = now;
        if (frameTime > 100) frameTime = 100;

        // Iterate over all active rooms
        for (const roomName in rooms) {
            const room = rooms[roomName];

            room.accumulator += frameTime;
            while (room.accumulator >= room.fixedStep) {
                room.updatePhysics();
                room.accumulator -= room.fixedStep;
            }

            if (!room.gamePaused) {
                io.to(roomName).emit('state', {
                    players: room.players,
                    bubbles: room.bubbles,
                    enemies: room.enemies,
                    items: room.items,
                    gamePaused: room.gamePaused
                });
            }
        }
    } catch (err) {
        console.error('Error in global game loop:', err);
    }
}, 1000 / 60);

// Port
const port = process.env.PORT || 3000;
http.listen(port, () => {
    console.log(`Listening on *:${port}`);
});
