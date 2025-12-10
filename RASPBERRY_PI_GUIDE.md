# 🍓 Guide de Déploiement sur Raspberry Pi

Ce guide vous explique comment héberger votre jeu *Bubble Bobble* sur un Raspberry Pi pour y jouer en réseau local (LAN) avec une latence minimale.

## 1. Prérequis sur le Raspberry Pi

Assurez-vous que votre Raspberry Pi est connecté à votre réseau (Wi-Fi ou Ethernet) et que vous y avez accès (via SSH ou écran/clavier).

### Installer Node.js
Le jeu a besoin de Node.js. Ouvrez un terminal sur votre Pi et lancez :

```bash
# Met à jour la liste des paquets
sudo apt update

# Installe Node.js et npm (version standard des dépôts)
sudo apt install nodejs npm -y

# Vérifie l'installation
node -v
npm -v
```

> [!NOTE]
> Si la version de Node.js est trop ancienne, vous pouvez utiliser `nvm` ou les dépôts NodeSource, mais la version par défaut de Raspberry Pi OS (souvent Node 18+) suffit généralement.

## 2. Installation du Jeu

### Option A : Via Git (Recommandé)
Si votre code est sur GitHub :
```bash
git clone <URL_DE_VOTRE_REPO> bubble-bobble
cd bubble-bobble
npm install
```

### Option B : Transfert manuel (SCP/SFTP)
Copiez le dossier du projet (sans `node_modules`) depuis votre PC vers le Pi (par exemple via FileZilla ou la commande `scp`).
Une fois copié, allez dans le dossier sur le Pi et lancez `npm install`.

## 3. Lancer le Jeu

### Méthode simple (Test)
```bash
node server.js
```
Le serveur démarrera sur le port 3000.
Vous verrez : `Listening on *:3000`

### Méthode Robuste (24/7 avec PM2)
Pour que le jeu tourne tout le temps, même après un redémarrage du Pi :

1.  Installer PM2 :
    ```bash
    sudo npm install -g pm2
    ```
2.  Lancer le jeu :
    ```bash
    pm2 start server.js --name "bubble-bobble"
    ```
3.  (Optionnel) Faire en sorte qu'il se lance au démarrage du Pi :
    ```bash
    pm2 startup
    pm2 save
    ```

## 4. Jouer depuis vos appareils

Trouvez l'adresse IP de votre Raspberry Pi :
```bash
hostname -I
```
Disons que c'est `192.168.1.50`.

Sur vos PC, téléphones ou tablettes connectés au même Wi-Fi, ouvrez le navigateur et tapez :
`http://192.168.1.50:3000`

🚀 **Profitez d'un jeu ultra-fluide avec 0 latence !**

## 5. Accès Public (Jouer depuis Internet)

Pour inviter des amis hors de chez vous à jouer, la méthode la plus sécurisée et la plus simple est d'utiliser un **Tunnel Cloudflare**.

### Pourquoi Cloudflare Tunnel ?
- **Sécurisé** : Pas besoin d'ouvrir de ports sur votre box internet.
- **Masqué** : Votre adresse IP personnelle reste cachée.
- **Gratuit** : L'offre gratuite est largement suffisante.

### Étape A : Avoir un Nom de Domaine
Il vous faut un nom de domaine (ex: `mon-super-jeu.com`). Si vous n'en avez pas, vous pouvez en acheter un pour quelques euros (sur OVH, Namecheap, etc.).
*Note : Cloudflare gère aussi les domaines si besoin.*

### Étape B : Configurer Cloudflare
1.  Créez un compte gratuit sur [Cloudflare](https://www.cloudflare.com/).
2.  Ajoutez votre domaine à Cloudflare (suivez leurs instructions pour changer les DNS).
3.  Allez dans **Zero Trust** (menu de gauche) > **Networks** > **Tunnels**.
4.  Cliquez sur **Create a Tunnel**.
5.  Choisissez **Cloudflared** (connector).
6.  Donnez un nom (ex: `bubble-pi`).

### Étape C : Installer l'agent sur le Raspberry Pi
Cloudflare vous donnera une commande à copier-coller pour votre OS (choisissez **Debian** et architecture **dom64** ou **arm64** selon votre Pi).

Exemple (ne copiez pas ça, prenez celle de votre tableau de bord) :
```bash
curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-arm64.deb
sudo dpkg -i cloudflared.deb
sudo cloudflared service install <VOTRE_TOKEN_SECRET>
```

### Étape D : Relier au Jeu
1.  Une fois l'agent connecté (vous le verrez "Healthy" sur le site Cloudflare).
2.  Dans l'interface Tunnel, allez dans l'onglet **Public Hostname**.
3.  Ajoutez un "Public Hostname" :
    - **Subdomain** : `jeu` (par exemple)
    - **Domain** : `votre-domaine.com`
    - **Service** : `http://localhost:3000`
4.  Sauvegardez.

### C'est fini !
Vos amis peuvent maintenant jouer en allant sur :
`https://jeu.votre-domaine.com`

Le trafic passera par Cloudflare, sera sécurisé en HTTPS, et arrivera directement sur votre Raspberry Pi !

