# Bubble Bobble Multiplayer Clone 🦖

A real-time multiplayer arcade platformer inspired by the classic Bubble Bobble. Built with Node.js, Socket.io, and HTML5 Canvas.

![Game Screenshot](https://raw.githubusercontent.com/piot-eduvaud/Bubble_bobble_multi/master/screenshot.png) *(Note: Add a screenshot to your repo named screenshot.png to make this appear!)*

## 🎮 Features
- **Multiplayer**: Play with friends in real-time.
- **Persistent High Scores**: Top 50 Global Leaderboard saved on the server.
- **Wave System**: Infinite waves with increasing difficulty and evolving maps.
- **Boss Fights**: every 10 waves.
- **Power-ups**: Collect items for speed and fire rate boosts.
- **Physics**: Server-authoritative physics (jump, gravity, collisions).

## 🕹️ Controls
- **Arrow Keys**: Move Left/Right
- **Up Arrow**: Jump
- **Space**: Shoot Bubble
- **Touch**: Virtual D-Pad automatically appears on mobile devices.

## 🛠️ Installation & Run Locally

1.  **Clone the repository**
    ```bash
    git clone https://github.com/piot-eduvaud/Bubble_bobble_multi.git
    cd Bubble_bobble_multi
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Start the Server**
    ```bash
    npm run start
    ```

4.  **Play**
    Open your browser and navigate to `http://localhost:3000`.

## 🌐 Deployment
See [DEPLOY.md](DEPLOY.md) for instructions on how to host this game online using Render or Glitch.

## Is it safe?
Yes! The game loop is protected against crashes, and player data (names/scores) is handled securely.

---
*Created as an educational project.*
