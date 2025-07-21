/*
 * Eviction Platformer
 * A side-scrolling platformer game with gritty pixel art aesthetics. The player
 * runs through Newark-like streets, jumping over pits and dodging angry tenants.
 * Collect envelopes (eviction notices) to score points and shoot letters to
 * remove tenants. Written without any external libraries.
 */
const canvas = document.getElementById('gameCanvas');
const ctx    = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const livesEl = document.getElementById('lives');

// Game constants
const GRAVITY        = 0.5;      // gravity acceleration
const JUMP_VELOCITY  = -12;      // initial jump velocity
const WORLD_SPEED    = 3;        // pixels per frame (approx) scroll speed
const GROUND_HEIGHT  = 80;       // ground height in pixels
const HERO_SIZE      = 80;       // hero width and height on screen
const ENEMY_SIZE     = 80;       // enemy width and height
const ITEM_SIZE      = 50;       // size for envelopes
const LETTER_SIZE    = 20;       // size for thrown eviction letters

// Asset placeholders
const images = {};

// List of assets to load with their keys and paths
/*
 * List of assets used in the game. When uploading the project via the web
 * interface we placed all assets in the repository root rather than a
 * dedicated folder, so the src values here point directly at the image
 * filenames. If you organise your assets into a subfolder like `assets/`
 * you should update these paths accordingly.
 */
const assetList = [
  { key: 'bg',     src: 'bg_gritty.png' },
  { key: 'run1',   src: 'hero_run1.png' },
  { key: 'run2',   src: 'hero_run2.png' },
  { key: 'enemy',  src: 'enemy.png' },
  { key: 'letter', src: 'envelope.png' }
];

// Remove dark backgrounds from sprite images by thresholding low RGB values
function removeDarkBackground(img, threshold = 40) {
  const off = document.createElement('canvas');
  off.width = img.width;
  off.height = img.height;
  const octx = off.getContext('2d');
  octx.drawImage(img, 0, 0);
  const data = octx.getImageData(0, 0, off.width, off.height);
  const pixels = data.data;
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    // dark pixel if all channels below threshold
    if (r < threshold && g < threshold && b < threshold) {
      pixels[i + 3] = 0;
    }
  }
  octx.putImageData(data, 0, 0);
  const processed = new Image();
  processed.src = off.toDataURL();
  return processed;
}

// Load all assets and then start the game
function loadAssets() {
  const promises = assetList.map(item => new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      images[item.key] = img;
      resolve();
    };
    img.src = item.src;
  }));
  return Promise.all(promises).then(() => {
    /*
     * NOTE: When served via the file:// protocol modern browsers consider
     * images loaded from disk as cross‑origin. Attempting to access pixel
     * data via getImageData will "taint" the canvas and throw a security
     * error. To keep this sample self‑contained and runnable directly from
     * disk we skip the removeDarkBackground processing here. If you deploy
     * this game via a web server (e.g. using python -m http.server) you
     * can uncomment the following lines to remove the dark backgrounds
     * from the sprite images.
     */
    // images.run1 = removeDarkBackground(images.run1);
    // images.run2 = removeDarkBackground(images.run2);
    // images.enemy = removeDarkBackground(images.enemy);
    // images.letter = removeDarkBackground(images.letter);
  });
}

// Game state objects
const hero = {
  worldX: 0,      // horizontal position in world coordinates (not screen)
  x: 100,         // screen x coordinate stays relatively fixed
  y: canvas.height - GROUND_HEIGHT - HERO_SIZE, // screen y coordinate
  vy: 0,          // vertical velocity
  onGround: true,
  frameIndex: 0,  // for run animation
  frameTimer: 0,  // timer controlling frame switching
  lives: 3,
  score: 0
};
let cameraX = 0;
let lastTime = 0;
let gameOver = false;

// Lists for dynamic objects
const enemies  = [];
const envelopes = [];
const letters  = [];

// Timers for spawning
let enemySpawnTimer    = 0;
// Base interval (ms) between enemy spawns. Higher values mean fewer enemies.
const ENEMY_SPAWN_BASE = 3500;
let envelopeSpawnTimer = 0;
// Base interval (ms) between envelope spawns. Higher values mean fewer envelopes.
const ENVELOPE_SPAWN_BASE = 2500;

// Input state
const keys = {};
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  // Jump with Space or ArrowUp
  if (!gameOver && (e.code === 'Space' || e.code === 'ArrowUp')) {
    if (hero.onGround) {
      hero.vy = JUMP_VELOCITY;
      hero.onGround = false;
    }
  }
  // Shoot eviction letter with 'KeyE'
  if (!gameOver && e.code === 'KeyE') {
    shootLetter();
  }
});
document.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});

function shootLetter() {
  // spawn a letter at hero's worldX + some offset
  const letter = {
    x: hero.worldX + HERO_SIZE + 10,
    y: hero.y + HERO_SIZE / 2 - LETTER_SIZE / 2,
    width: LETTER_SIZE,
    height: LETTER_SIZE,
    speed: 8
  };
  letters.push(letter);
}

function spawnEnemy() {
  // Enemies spawn ahead of the camera
  const spawnX = cameraX + canvas.width + Math.random() * 600;
  const enemy = {
    x: spawnX,
    y: canvas.height - GROUND_HEIGHT - ENEMY_SIZE,
    width: ENEMY_SIZE,
    height: ENEMY_SIZE
  };
  enemies.push(enemy);
}

function spawnEnvelope() {
  const spawnX = cameraX + canvas.width + Math.random() * 400;
  const env = {
    x: spawnX,
    y: canvas.height - GROUND_HEIGHT - ITEM_SIZE - Math.random() * 120,
    width: ITEM_SIZE,
    height: ITEM_SIZE
  };
  envelopes.push(env);
}

function rectIntersect(aX, aY, aW, aH, bX, bY, bW, bH) {
  return (
    aX < bX + bW &&
    aX + aW > bX &&
    aY < bY + bH &&
    aY + aH > bY
  );
}

function update(dt) {
  if (gameOver) return;

  // Update camera and hero world position
  cameraX += WORLD_SPEED;
  hero.worldX += WORLD_SPEED;

  // Update vertical physics
  hero.vy += GRAVITY;
  hero.y += hero.vy;
  const groundY = canvas.height - GROUND_HEIGHT - HERO_SIZE;
  if (hero.y > groundY) {
    hero.y = groundY;
    hero.vy = 0;
    hero.onGround = true;
  }

  // Update run animation
  hero.frameTimer += dt;
  if (hero.frameTimer > 0.15) { // switch frames roughly every 0.15s
    hero.frameTimer = 0;
    hero.frameIndex = (hero.frameIndex + 1) % 2;
  }

  // Spawn enemies at intervals
  enemySpawnTimer += dt * 1000;
  if (enemySpawnTimer > ENEMY_SPAWN_BASE + Math.random() * 1000) {
    enemySpawnTimer = 0;
    spawnEnemy();
  }

  // Spawn envelopes at intervals
  envelopeSpawnTimer += dt * 1000;
  if (envelopeSpawnTimer > ENVELOPE_SPAWN_BASE + Math.random() * 800) {
    envelopeSpawnTimer = 0;
    spawnEnvelope();
  }

  // Update enemies and check for collisions with hero and letters
  for (let i = enemies.length - 1; i >= 0; i--) {
    const enemy = enemies[i];
    // Remove off-screen enemies
    if (enemy.x - cameraX + enemy.width < 0) {
      enemies.splice(i, 1);
      continue;
    }
    // Check collision with hero
    const enemyScreenX = enemy.x - cameraX;
    if (rectIntersect(hero.x, hero.y, HERO_SIZE, HERO_SIZE, enemyScreenX, enemy.y, enemy.width, enemy.height)) {
      // Remove enemy and reduce life
      enemies.splice(i, 1);
      hero.lives -= 1;
      updateUI();
      if (hero.lives <= 0) {
        gameOver = true;
      }
      continue;
    }
    // Check collision with letters
    for (let j = letters.length - 1; j >= 0; j--) {
      const letter = letters[j];
      const letterScreenX = letter.x - cameraX;
      if (rectIntersect(letterScreenX, letter.y, letter.width, letter.height, enemyScreenX, enemy.y, enemy.width, enemy.height)) {
        // Remove both and award points
        enemies.splice(i, 1);
        letters.splice(j, 1);
        hero.score += 20;
        updateUI();
        break;
      }
    }
  }

  // Update envelopes and check collisions with hero
  for (let i = envelopes.length - 1; i >= 0; i--) {
    const env = envelopes[i];
    if (env.x - cameraX + env.width < 0) {
      envelopes.splice(i, 1);
      continue;
    }
    const envScreenX = env.x - cameraX;
    if (rectIntersect(hero.x, hero.y, HERO_SIZE, HERO_SIZE, envScreenX, env.y, env.width, env.height)) {
      envelopes.splice(i, 1);
      hero.score += 10;
      updateUI();
    }
  }

  // Update letters positions
  for (let i = letters.length - 1; i >= 0; i--) {
    const letter = letters[i];
    letter.x += letter.speed;
    // remove if off screen
    if (letter.x - cameraX > canvas.width + 50) {
      letters.splice(i, 1);
    }
  }
}

function draw() {
  // Clear screen
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Draw repeating background
  const bg = images.bg;
  const bgScaleY = canvas.height / bg.height;
  const bgWidthScaled = bg.width * bgScaleY;
  // Use modulo arithmetic to tile background horizontally
  const offset = -(cameraX % bgWidthScaled);
  // Draw two backgrounds to cover entire canvas
  for (let i = 0; i < 3; i++) {
    ctx.drawImage(bg, offset + i * bgWidthScaled, 0, bgWidthScaled, canvas.height);
  }

  // Draw ground
  ctx.fillStyle = '#222';
  ctx.fillRect(0, canvas.height - GROUND_HEIGHT, canvas.width, GROUND_HEIGHT);

  // Draw hero
  const runFrame = hero.frameIndex === 0 ? images.run1 : images.run2;
  ctx.drawImage(runFrame, hero.x, hero.y, HERO_SIZE, HERO_SIZE);

  // Draw enemies
  for (const enemy of enemies) {
    const screenX = enemy.x - cameraX;
    // Flip enemy horizontally so it faces the hero (to the left)
    ctx.save();
    ctx.translate(screenX + enemy.width, enemy.y);
    ctx.scale(-1, 1);
    ctx.drawImage(images.enemy, 0, 0, enemy.width, enemy.height);
    ctx.restore();
  }

  // Draw envelopes (eviction notices)
  for (const env of envelopes) {
    const screenX = env.x - cameraX;
    ctx.drawImage(images.letter, screenX, env.y, env.width, env.height);
  }

  // Draw letters thrown by hero
  ctx.fillStyle = '#e7c26a';
  for (const letter of letters) {
    const screenX = letter.x - cameraX;
    ctx.drawImage(images.letter, screenX, letter.y, letter.width, letter.height);
  }

  // Draw game over overlay
  if (gameOver) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#fff';
    ctx.font = '36px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20);
    ctx.font = '24px Arial';
    ctx.fillText('Final Score: ' + hero.score, canvas.width / 2, canvas.height / 2 + 20);
    ctx.fillText('Reload page to play again', canvas.width / 2, canvas.height / 2 + 60);
  }
}

function updateUI() {
  scoreEl.textContent = hero.score;
  livesEl.textContent = hero.lives;
}

function gameLoop(timestamp) {
  const dt = (timestamp - lastTime) / 1000;
  lastTime = timestamp;
  update(dt);
  draw();
  requestAnimationFrame(gameLoop);
}

// Start game when assets are loaded
loadAssets().then(() => {
  updateUI();
  requestAnimationFrame(ts => {
    lastTime = ts;
    gameLoop(ts);
  });
});
