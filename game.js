const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const socket = io();

// Audio Context (Initialized on first interaction)
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

function initAudio() {
    if (!audioCtx) {
        audioCtx = new AudioContext();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

const sounds = {
    JUMP: () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(300, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    },
    SHOOT: () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(800, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(100, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    },
    POP: () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.05);
    },
    COLLECT: () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1000, audioCtx.currentTime);
        osc.frequency.setValueAtTime(1500, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.2);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
    },
    BOSS_HIT: () => {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(100, audioCtx.currentTime);
        osc.frequency.linearRampToValueAtTime(50, audioCtx.currentTime + 0.1);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    },
    BOSS_DIE: () => {
        // Noise buffer simulation with multiple oscillators
        for (let i = 0; i < 5; i++) {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(100 + Math.random() * 200, audioCtx.currentTime);
            osc.frequency.linearRampToValueAtTime(0, audioCtx.currentTime + 1.0);
            gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
            gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 1.0);
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.start();
            osc.stop(audioCtx.currentTime + 1.0);
        }
    }
};

function playSound(type) {
    if (audioCtx && sounds[type]) {
        sounds[type]();
    }
}

// Assets - Procedurally Generated
const spriteSheet = document.createElement('canvas');
spriteSheet.width = 128;
spriteSheet.height = 32 * 25; // Increased to ensure Row 20 (Candy) is visible
const spriteCtx = spriteSheet.getContext('2d');

function generateSprites() {
    function drawChar(row, color, isEnemy) {
        for (let col = 0; col < 4; col++) {
            const x = col * 32;
            const y = row * 32;
            spriteCtx.fillStyle = color;
            spriteCtx.fillRect(x + 8, y + 8, 16, 16);
            if (!isEnemy) {
                spriteCtx.fillRect(x + 4, y + 10, 4, 4);
                spriteCtx.fillRect(x + 4, y + 16, 4, 4);
                spriteCtx.fillStyle = 'white';
                spriteCtx.fillRect(x + 16, y + 10, 6, 6);
                spriteCtx.fillStyle = 'black';
                spriteCtx.fillRect(x + 20, y + 12, 2, 2);
            } else {
                spriteCtx.fillStyle = 'white';
                spriteCtx.fillRect(x + 10, y + 12, 5, 5);
                spriteCtx.fillRect(x + 18, y + 12, 5, 5);
                spriteCtx.fillStyle = 'red';
                spriteCtx.fillRect(x + 12, y + 14, 2, 2);
                spriteCtx.fillRect(x + 20, y + 14, 2, 2);
            }
            spriteCtx.fillStyle = color;
            if (col === 0) {
                spriteCtx.fillRect(x + 10, y + 24, 4, 4);
                spriteCtx.fillRect(x + 18, y + 24, 4, 4);
            } else if (col === 1) {
                spriteCtx.fillRect(x + 8, y + 24, 4, 4);
                spriteCtx.fillRect(x + 20, y + 22, 4, 4);
            } else if (col === 2) {
                spriteCtx.fillRect(x + 12, y + 22, 4, 4);
                spriteCtx.fillRect(x + 20, y + 24, 4, 4);
            } else {
                spriteCtx.fillRect(x + 8, y + 20, 6, 6);
                spriteCtx.fillRect(x + 20, y + 22, 2, 4);
            }
        }
    }

    // Generate 15 Player Rows (0-14)
    const colors = [
        '#00dd00', '#0055dd', '#dd0000', '#dd00dd', '#dddd00',
        '#00dddd', '#ff8800', '#ff88ff', '#aaaaaa', '#ffffff',
        '#005500', '#000088', '#880000', '#888800', '#008888'
    ];
    colors.forEach((color, i) => {
        drawChar(i, color, false);
    });

    // Enemy (Row 15 - Chaser)
    drawChar(15, '#dd00dd', true);
    // Enemy (Row 18 - Fearful)
    drawChar(18, '#00ffff', true);

    // Power-ups
    // Shoe (Row 19)
    const shoeRow = 19;
    spriteCtx.fillStyle = 'orange';
    spriteCtx.beginPath();
    spriteCtx.moveTo(8, shoeRow * 32 + 24);
    spriteCtx.lineTo(24, shoeRow * 32 + 24);
    spriteCtx.lineTo(24, shoeRow * 32 + 16);
    spriteCtx.lineTo(16, shoeRow * 32 + 16);
    spriteCtx.lineTo(16, shoeRow * 32 + 8);
    spriteCtx.lineTo(8, shoeRow * 32 + 8);
    spriteCtx.fill();

    // Candy (Row 20)
    const candyRow = 20;
    spriteCtx.fillStyle = 'pink';
    spriteCtx.fillRect(10, candyRow * 32 + 12, 12, 8);
    spriteCtx.beginPath();
    spriteCtx.moveTo(10, candyRow * 32 + 16);
    spriteCtx.lineTo(6, candyRow * 32 + 10);
    spriteCtx.lineTo(6, candyRow * 32 + 22);
    spriteCtx.fill();
    spriteCtx.beginPath();
    spriteCtx.moveTo(22, candyRow * 32 + 16);
    spriteCtx.lineTo(26, candyRow * 32 + 10);
    spriteCtx.lineTo(26, candyRow * 32 + 22);
    spriteCtx.fill();

    // Items (Row 16)
    const itemRow = 16;


    spriteCtx.strokeStyle = '#00ffff';
    spriteCtx.lineWidth = 2;
    spriteCtx.beginPath();
    spriteCtx.arc(16, itemRow * 32 + 16, 12, 0, Math.PI * 2);
    spriteCtx.stroke();
    spriteCtx.fillStyle = 'white';
    spriteCtx.fillRect(16 + 4, itemRow * 32 + 16 - 8, 4, 4);

    const ax = 3 * 32;
    const ay = itemRow * 32;
    spriteCtx.fillStyle = 'red';
    spriteCtx.beginPath();
    spriteCtx.arc(ax + 16, ay + 16, 10, 0, Math.PI * 2);
    spriteCtx.fill();
    spriteCtx.fillStyle = '#00ff00';
    spriteCtx.fillRect(ax + 14, ay + 4, 4, 4);

    // Blocks (Row 17)
    for (let c = 0; c < 4; c++) {
        const bx = c * 32;
        const by = 17 * 32;
        spriteCtx.fillStyle = '#555';
        spriteCtx.fillRect(bx, by, 32, 32);
        spriteCtx.strokeStyle = '#333';
        spriteCtx.lineWidth = 2;
        spriteCtx.strokeRect(bx, by, 32, 32);
        spriteCtx.fillStyle = '#777';
        spriteCtx.fillRect(bx + 4, by + 4, 24, 10);
        spriteCtx.fillRect(bx + 4, by + 18, 24, 10);
    }
}
generateSprites();

// Input Handling
const inputs = {
    left: false,
    right: false,
    up: false,
    shoot: false
};

// Login Logic
const loginOverlay = document.getElementById('login-overlay');
const usernameInput = document.getElementById('username');
const playBtn = document.getElementById('play-btn');

// Load saved name
const savedName = localStorage.getItem('player_name');
if (savedName) {
    usernameInput.value = savedName;
}


// Allow Enter key to start
// Allow Enter key to start (Handled globally now)
// usernameInput.addEventListener('keyup', ...);

playBtn.addEventListener('click', () => {
    const name = usernameInput.value.trim() || 'Joueur';
    localStorage.setItem('player_name', name);
    loginOverlay.style.display = 'none';
    initAudio();
    socket.emit('join_game', name);
    document.getElementById('quit-btn').style.display = 'block';
});

document.getElementById('quit-btn').addEventListener('click', () => {
    socket.emit('quit_game');
});

socket.on('game_over', (data) => {
    // Handle object vs legacy number
    const finalScore = (typeof data === 'object') ? data.score : data;
    const finalId = (typeof data === 'object') ? data.id : null;

    lastFinalScore = finalScore;
    lastFinalScoreId = finalId;

    // Re-render to ensure highlight is applied even if highscores arrived first
    if (lastReceivedScores.length > 0) {
        renderHighScores(lastReceivedScores);
    }

    highscoreOverlay.style.display = 'flex'; // Show Scores instead of Alert

    // Also show Login Overlay
    loginOverlay.style.display = 'flex';
    document.getElementById('quit-btn').style.display = 'none';
});

document.addEventListener('keydown', (e) => {
    // Audio Context is init on click now, but backup here just in case
    initAudio();

    if (e.code === 'ArrowLeft') inputs.left = true;
    if (e.code === 'ArrowRight') inputs.right = true;
    if (e.code === 'ArrowUp') {
        inputs.up = true;
        if (!e.repeat) playSound('JUMP');
    }
    if (e.code === 'Space') inputs.shoot = true;

    socket.emit('input', inputs);
    // Reset shoot immediately to avoid spam
    if (e.code === 'Space') {
        if (!e.repeat) playSound('SHOOT');
        inputs.shoot = false;
        setTimeout(() => socket.emit('input', inputs), 50);
    }
});

document.addEventListener('keyup', (e) => {
    if (e.code === 'ArrowLeft') inputs.left = false;
    if (e.code === 'ArrowRight') inputs.right = false;
    if (e.code === 'ArrowUp') inputs.up = false;
    if (e.code === 'Space') inputs.shoot = false;
    socket.emit('input', inputs);
});

// Render Loop
let gameState = { players: {}, bubbles: [], enemies: [], platforms: [] };

// Update local state when server sends data
socket.on('state', (state) => {
    gameState.players = state.players;
    gameState.bubbles = state.bubbles;
    gameState.enemies = state.enemies;
    gameState.enemies = state.enemies;
    gameState.items = state.items;
    if (state.items && state.items.length > 0) console.log('Client received items:', state.items.length); // Debug Log
    if (state.platforms) gameState.platforms = state.platforms;
});

socket.on('sound', (type) => {
    playSound(type);
});

const closeHighscoreBtn = document.getElementById('close-highscore-btn');
const highscoreOverlay = document.getElementById('highscore-overlay');
const highscoreList = document.getElementById('highscore-list');
const highscoreBtn = document.getElementById('highscore-btn');

// Global Enter key for Login
document.addEventListener('keyup', (e) => {
    // Use getComputedStyle to check CSS state, not just inline style
    if (e.key === 'Enter' && window.getComputedStyle(loginOverlay).display !== 'none') {
        playBtn.click();
    }
});

highscoreBtn.addEventListener('click', () => {
    highscoreOverlay.style.display = 'flex';
    socket.emit('request_highscores');
});

closeHighscoreBtn.addEventListener('click', () => {
    highscoreOverlay.style.display = 'none';
    if (loginOverlay.style.display === 'flex') {
        usernameInput.focus();
    }
});

// Global variable for highlighting
let lastFinalScore = -1;
let lastFinalScoreId = null;
let lastReceivedScores = [];

function renderHighScores(scores) {
    highscoreList.innerHTML = '';
    const currentPlayerName = localStorage.getItem('player_name');

    scores.forEach((s, index) => {
        const li = document.createElement('li');
        li.innerHTML = `
            <span class="rank">#${index + 1}</span>
            <span class="name">${s.name}</span>
            <span class="score">${s.score}</span>
        `;

        // Check for highlight (Priority to ID, fallback to Name+Score)
        let isMatch = false;
        if (lastFinalScoreId && s.id === lastFinalScoreId) {
            isMatch = true;
        } else if (!lastFinalScoreId && lastFinalScore !== -1 && s.score === lastFinalScore && s.name === currentPlayerName) {
            isMatch = true; // Fallback
        }

        if (isMatch) {
            li.classList.add('highlight');
        }

        highscoreList.appendChild(li);
    });
}

socket.on('highscores', (scores) => {
    lastReceivedScores = scores;
    renderHighScores(scores);
});

// Render Loop (Decoupled from network)
function render() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw Platforms
    gameState.platforms.forEach(p => {
        for (let x = p.x; x < p.x + p.width; x += 32) {
            ctx.drawImage(spriteSheet, 0, 17 * 32, 32, 32, x, p.y, 32, 32);
            if (p.height > 32) {
                ctx.fillStyle = '#222';
                ctx.fillRect(x, p.y + 32, 32, p.height - 32);
            }
        }
    });

    // Draw Players
    for (const id in gameState.players) {
        const p = gameState.players[id];
        if (p.invincible > 0 && p.invincible % 4 > 2) continue; // Blink

        // Sprite selection based on movement
        let col = 0; // Idle
        if (!p.grounded) col = 3; // Jump
        else if (Math.abs(p.dx) > 0.1) col = (Date.now() % 200 > 100) ? 1 : 2; // Walk

        // Determine Row based on CharacterId (Server Slot)
        const row = typeof p.characterId !== 'undefined' ? p.characterId : 0;

        ctx.save();
        ctx.translate(p.x + (p.direction === -1 ? p.width : 0), p.y);
        ctx.scale(p.direction, 1);

        ctx.drawImage(
            spriteSheet,
            col * 32, row * 32, 32, 32, // Source
            0, 0, 32, 32
        );
        ctx.restore();

        // Draw Tint for ID (Simple circle above head to identify P1/P2)
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x + 16, p.y - 10, 5, 0, Math.PI * 2);
        ctx.fill();

        // Score display handling moved to shared scoreboard below
    }

    // Shared Scoreboard (Top Left)
    const sortedPlayers = Object.values(gameState.players).sort((a, b) => b.score - a.score);
    let scoreY = 20;

    sortedPlayers.forEach((p, index) => {
        ctx.fillStyle = (p.id === socket.id) ? '#ffff00' : 'white'; // Highlight self
        ctx.font = '10px "Press Start 2P", monospace'; // Added monospace fallback

        let label = `P${(p.characterId || 0) + 1}`;
        // Optional: formatting score with leading zeros
        const scoreStr = p.score.toString().padStart(5, '0');

        ctx.fillText(`${label}: ${scoreStr}`, 10, scoreY);
        scoreY += 15;
    });

    // Draw Enemies
    // Draw Enemies
    gameState.enemies.forEach(e => {
        let row = 15; // Default Chaser
        if (e.type === 'fearful') row = 18;
        // Boss reuses Chaser sprite (15) but tinted Red in logic? Or just Red Tint via filter?
        // Actually sprite drawing is hardcoded colors in generateSprites.
        // Let's us Row 15 (Purple) but we can tint it or just rely on size.
        // Better: let's simply assume Row 15 is fine, but we scale it.

        let col = 0;
        if (e.state === 'normal') {
            col = (Date.now() % 400 > 200) ? 1 : 2;
        } else if (e.state === 'trapped') {
            col = 3;
        } else if (e.state === 'fruit') {
            row = 16; col = 3; // Apple
        }

        ctx.save();
        ctx.translate(e.x + (e.direction === -1 ? e.width : 0), e.y);
        ctx.scale(e.direction, 1);

        if (e.type === 'boss') {
            // Scale up for Boss (Sprite is 32x32, Boss is 64x64)
            // We need to draw it 2x size. 
            // Translate/Scale handles direction, but we need to scale context for size or just drawImage bigger.
            // Drawing bigger is easier.

            // To make it RED, we might need a separate sprite ROW or use a globalCompositionOperation 'source-in'.
            // For simplicity, let's just make it big and rely on the HP bar to distinguish.

            if (e.state === 'normal') {
                // Blink Red on hit (not easily tracked here without hit timer from server, skipping for now)
                ctx.drawImage(spriteSheet, col * 32, row * 32, 32, 32, 0, 0, 64, 64);
            }
        } else {
            // Normal Rendering
            if (e.state === 'trapped') {
                // Enemy
                ctx.drawImage(spriteSheet, 3 * 32, 15 * 32, 32, 32, 0, 0, 32, 32);
                // Bubble Overlay
                ctx.drawImage(spriteSheet, 0, 16 * 32, 32, 32, 0, 0, 32, 32);
            } else if (e.state === 'fruit') {
                ctx.drawImage(spriteSheet, 3 * 32, 16 * 32, 32, 32, 0, 0, 32, 32);
            } else {
                ctx.drawImage(spriteSheet, col * 32, row * 32, 32, 32, 0, 0, 32, 32);
            }
        }
        ctx.restore();

        // Boss HP Bar
        if (e.type === 'boss' && e.state === 'normal') {
            ctx.fillStyle = 'red';
            ctx.fillRect(e.x, e.y - 10, e.width, 5);
            ctx.fillStyle = '#0f0';
            const hpWidth = (e.hp / e.maxHp) * e.width;
            ctx.fillRect(e.x, e.y - 10, hpWidth, 5);
        }
    });

    // Draw Bubbles
    gameState.bubbles.forEach(b => {
        ctx.drawImage(spriteSheet, 0, 16 * 32, 32, 32, b.x, b.y, 32, 32);
    });

    // Draw Items (Power-ups)
    if (gameState.items) {
        gameState.items.forEach(i => {
            let row = 0;
            if (i.type === 'SHOE') row = 19;
            else if (i.type === 'CANDY') row = 20;

            // Bobbing animation
            const yOffset = Math.sin(Date.now() / 200) * 3;
            ctx.drawImage(spriteSheet, 0, row * 32, 32, 32, i.x, i.y + yOffset, 32, 32);
        });
    }

    requestAnimationFrame(render);
}

requestAnimationFrame(render);
