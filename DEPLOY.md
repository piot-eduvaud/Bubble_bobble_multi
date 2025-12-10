# 🌐 Deployment Guide - Bubble Bobble Online

Follow these steps to host your game online so friends can join from anywhere!

## 🚀 Option 1: Render (Recommended for Best Performance)
Render is a modern cloud hosting platform. It has a generous free tier perfect for this project.

### Steps:
1.  **Push to GitHub**: Ensure your project is committed and pushed to a GitHub repository.
2.  **Sign Up**: Go to [render.com](https://render.com) and sign in with GitHub.
3.  **New Web Service**:
    *   Click "New +" -> "Web Service".
    *   Select your repository.
4.  **Configure**:
    *   **Name**: `bubble-bobble-online` (or unique name)
    *   **Environment**: `Node`
    *   **Build Command**: `npm install`
    *   **Start Command**: `node server.js`
5.  **Deploy**: Click "Create Web Service".
6.  **Done!**: Render will provide a URL like `https://bubble-bobble-xyz.onrender.com`. Share this with friends!

## ⚡ Option 2: Glitch (Fastest Setup)
Glitch allows you to code and deploy directly in the browser.

### Steps:
1.  **Go to Glitch**: [glitch.com](https://glitch.com).
2.  **New Project**: Click "New Project" -> "Import from GitHub".
3.  **Enter URL**: Paste your GitHub repository URL.
4.  **Wait**: Glitch will import and automatically install dependencies.
5.  **View**: Click "Share" -> "Live Site" to get your game URL.
    *   *Note*: Glitch puts apps to sleep after inactivity. It might take 10-20s to wake up when you visit the link.

## ⚠️ Important Notes
*   **Touch Controls**: The current game supports touch automatically via the virtual d-pad overlay (already implemented).
*   **Latency**: Since physics are server-authoritative, players far from the server might experience delay.
*   **Persistence**: On free tiers (Render/Glitch), `highscores.json` might be reset when the server restarts or "sleeps". For permanent storage, you'd need a database like MongoDB (Cloud Atlas).

## 🎮 How to Play
Share the URL!
*   **PC**: Arrow Keys + Space
*   **Mobile**: Touch controls appear automatically.
