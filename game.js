// ============================================================
// GAME.JS — DEFENSE & SURVIVAL
// ============================================================

const CONFIG = {
    DAY_DURATION: 180,
    NIGHT_DURATION: 45,
    PLAYER_SPEED: 700,
    PLAYER_RADIUS: 18,
    MAP_WIDTH: 7000,
    MAP_HEIGHT: 7000,
    COLLECT_DISTANCE: 70,
    BASE_MAX_HP: 100,
    BASE_RADIUS: 70,
    CRAFTING_INTERACTION_DISTANCE: 110
};

// ============================================================
// ESTADO DA PONTE DIREITA & ELEMENTOS DO RIO & PORTÃO DO TOPO
// ============================================================
const MADEIRAS_NECESSARIAS = 2;
let madeirasDepositadas = 0;
let ponteCompleta = false;
let portaoTopoAberto = false;

// Lógica de colisão do Rio Vertical (Margem Direita do Mapa)
function checarColisao(player) {
  const halfW = CONFIG.MAP_WIDTH / 2;
  const riverWorldX = halfW + 100;
  const riverWidth = 220;
  
  const riverMinX = riverWorldX - riverWidth / 2;
  const riverMaxX = riverWorldX + riverWidth / 2;

  // Se a ponte estiver completa e o jogador estiver na passagem da ponte
  const estaNaPonte = ponteCompleta && (player.y + player.altura >= -70 && player.y <= 70);

  const colidiuComRio = (
    player.x + player.largura > riverMinX &&
    player.x < riverMaxX
  );

  if (colidiuComRio && !estaNaPonte) {
    return true;
  }

  return false;
}

// ============================================================
// CATÁLOGO DE CRIAÇÃO
// ============================================================

const CRAFTABLE_TYPES = {
    axe: {
        id: "axe",
        name: "Machado de Madeira",
        category: "ferramentas",
        type: "tool",
        icon: "🪓",
        cost: { wood: 5, stone: 0 },
        desc: "Equipe na Hotbar para conseguir cortar árvores grandes."
    },
    pickaxe: {
        id: "pickaxe",
        name: "Picareta de Pedra",
        category: "ferramentas",
        type: "tool",
        icon: "⛏️",
        cost: { wood: 3, stone: 5 },
        desc: "Equipe na Hotbar para conseguir minar pedras grandes."
    },
    gate_key: {
        id: "gate_key",
        name: "Chave do Portão",
        category: "ferramentas",
        type: "tool",
        icon: "🔑",
        cost: { wood: 0, stone: 15, coal: 10, gold: 0, string: 0 },
        desc: "Chave artesanal para abrir o Portão do Topo. Requer Pedra e Carvão (Ouro e Linha em breve)."
    },
    fence: {
        id: "fence",
        name: "Cerca de Madeira",
        category: "normais",
        type: "building",
        cost: { wood: 10, stone: 0 },
        radius: 30,
        maxHp: 100,
        desc: "Barreira simples para bloquear o avanço dos inimigos."
    },
    ballista: {
        id: "ballista",
        name: "Balista Pesada",
        category: "normais",
        type: "building",
        cost: { wood: 25, stone: 15 },
        radius: 36,
        maxHp: 150,
        range: 320,
        damage: 22,
        fireRate: 1.2,
        desc: "Torre defensiva automatizada. Dispara virotes em inimigos próximos."
    },
    base_upgrade: {
        id: "base_upgrade",
        name: "Expansão de Território",
        category: "normais",
        type: "upgrade",
        icon: "📐",
        cost: { wood: 20, stone: 15 },
        desc: "Aumenta o raio da zona permitida para construir ao redor da base."
    }
};

const GAME_STATE = { MENU: "menu", PLAYING: "playing", GAME_OVER: "game_over" };
const TIME_STATE = { DAY: "day", NIGHT: "night" };

let gameState = GAME_STATE.MENU;
let timeState = TIME_STATE.DAY;
let phaseTimer = CONFIG.DAY_DURATION;
let nightNumber = 0;
let lastTimestamp = 0;
let currentCategory = "ferramentas";

let canvas = null;
let ctx = null;
let screenWidth = window.innerWidth;
let screenHeight = window.innerHeight;

let shakeIntensity = 0;
let currentShakeX = 0;
let currentShakeY = 0;

const keys = {};
const mouse = { x: 0, y: 0 };

let inventory = { wood: 0, stone: 0, berries: 10, coal: 0, gold: 0, string: 0 };
let selectedHotbarSlot = 0;
let hotbarItems = [null, null, null, null, null, null];

let world = {
    player: null,
    base: null,
    craftingTable: null,
    resources: [],
    enemies: [],
    buildings: [],
    projectiles: [],
    particles: [],
    floatingTexts: []
};

const camera = { x: 0, y: 0 };

let buildMode = false;
let selectedBuilding = null;
let buildMenuOpen = false;

function triggerScreenShake(intensity = 10) {
    shakeIntensity = Math.min(25, Math.max(shakeIntensity, intensity));
}

function distance(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    return Math.sqrt(dx * dx + dy * dy);
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function worldToScreen(x, y) {
    return { 
        x: x - camera.x + screenWidth / 2 + currentShakeX, 
        y: y - camera.y + screenHeight / 2 + currentShakeY 
    };
}

function screenToWorld(x, y) {
    return { 
        x: x - screenWidth / 2 + camera.x - currentShakeX, 
        y: y - screenHeight / 2 + camera.y - currentShakeY 
    };
}

function showMessage(text) {
    const box = document.getElementById("noticeBox");
    if (!box) return;
    box.textContent = text;
    box.style.opacity = "1";
    clearTimeout(box._timer);
    box._timer = setTimeout(() => { box.style.opacity = "0"; }, 3000);
}

function canBuildAt(x, y, newRadius = 32) {
    if (!world.base) return false;

    if (distance(x, y, world.base.x, world.base.y) > world.base.buildRadius) {
        return false;
    }

    if (distance(x, y, world.base.x, world.base.y) < world.base.radius + newRadius) return false;
    if (world.craftingTable && distance(x, y, world.craftingTable.x, world.craftingTable.y) < world.craftingTable.radius + newRadius) return false;
    if (world.player && distance(x, y, world.player.x, world.player.y) < world.player.radius + newRadius) return false;

    for (const b of world.buildings) {
        if (!b.dead && distance(x, y, b.x, b.y) < b.radius + newRadius) return false;
    }
    for (const r of world.resources) {
        if (!r.destroyed && distance(x, y, r.x, r.y) < r.radius + newRadius) return false;
    }
    return true;
}

function startPlayFromMenu() {
    const menuEl = document.getElementById("mainMenu");
    if (menuEl) menuEl.style.display = "none";
    startGame();
}

function openSubModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add("active");
}

function closeSubModal(id) {
    const el = document.getElementById(id);
    if (el) el.classList.remove("active");
}

// ============================================================
// TEXTO FLUTUANTE
// ============================================================

class FloatingText {
    constructor(x, y, text, color = "#ffffff") {
        this.x = x;
        this.y = y;
        this.text = text;
        this.color = color;
        this.life = 0.8;
        this.maxLife = 0.8;
        this.vy = -40;
    }

    update(dt) {
        this.y += this.vy * dt;
        this.life -= dt;
    }

    draw() {
        if (this.life <= 0) return;
        const pos = worldToScreen(this.x, this.y);
        ctx.save();
        ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1);
        ctx.fillStyle = this.color;
        ctx.font = "bold 18px sans-serif";
        ctx.textAlign = "center";
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 3.5;
        ctx.strokeText(this.text, pos.x, pos.y);
        ctx.fillText(this.text, pos.x, pos.y);
        ctx.restore();
    }
}

// ============================================================
// MESA DE CRIAÇÃO
// ============================================================

class CraftingTable {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.width = 42;
        this.height = 70;
        this.radius = 32;
    }

    draw() {
        const pos = worldToScreen(this.x, this.y);
        ctx.save();
        ctx.translate(pos.x, pos.y);

        ctx.fillStyle = "#11161b";
        ctx.fillRect(-this.width / 2, -this.height / 2, this.width, this.height);

        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 4;
        ctx.strokeRect(-this.width / 2, -this.height / 2, this.width, this.height);

        ctx.strokeStyle = "#3a4754";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-this.width / 2 + 6, -this.height / 4);
        ctx.lineTo(this.width / 2 - 6, -this.height / 4);
        ctx.moveTo(-this.width / 2 + 6, 0);
        ctx.lineTo(this.width / 2 - 6, 0);
        ctx.moveTo(-this.width / 2 + 6, this.height / 4);
        ctx.lineTo(this.width / 2 - 6, this.height / 4);
        ctx.stroke();

        ctx.restore();
    }
}

// ============================================================
// RECURSOS NATURAIS
// ============================================================

class ResourceNode {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type;
        
        if (type === 'tree') {
            this.hp = 3;
            this.radius = 24;
        } else if (type === 'stone') {
            this.hp = 4;
            this.radius = 20;
        } else if (type === 'bush') {
            this.hp = 2;
            this.radius = 18;
        } else if (type === 'twig') {
            this.hp = 1;
            this.radius = 10;
        } else if (type === 'small_stone') {
            this.hp = 1;
            this.radius = 10;
        } else if (type === 'coal') {
            this.hp = 4;
            this.radius = 20;
        }

        this.maxHp = this.hp;
        this.destroyed = false;
    }

    hit() {
        if (this.destroyed) return;
        this.hp--;

        const particleColor = 
            this.type === 'tree' || this.type === 'twig' ? '#8b5a2b' :
            this.type === 'coal' ? '#2c2c2c' :
            this.type === 'stone' || this.type === 'small_stone' ? '#888' : '#e74c3c';
        
        createParticles(this.x, this.y, 4, particleColor);

        if (this.hp <= 0) {
            this.destroyed = true;

            if (this.type === 'tree') {
                inventory.wood += 8;
                world.floatingTexts.push(new FloatingText(this.x, this.y, "+8", "#2ecc71"));
                showMessage("+8 Madeiras coletadas!");
            } else if (this.type === 'stone') {
                inventory.stone += 6;
                world.floatingTexts.push(new FloatingText(this.x, this.y, "+6", "#bdc3c7"));
                showMessage("+6 Pedras coletadas!");
            } else if (this.type === 'bush') {
                inventory.berries += 5;
                world.floatingTexts.push(new FloatingText(this.x, this.y, "+5", "#e74c3c"));
                showMessage("+5 Frutas coletadas!");
            } else if (this.type === 'twig') {
                const amount = Math.floor(Math.random() * 3) + 1;
                inventory.wood += amount;
                world.floatingTexts.push(new FloatingText(this.x, this.y, `+${amount}`, "#2ecc71"));
                showMessage(`+${amount} Graveto(s) coletado(s)!`);
            } else if (this.type === 'small_stone') {
                const amount = Math.floor(Math.random() * 3) + 1;
                inventory.stone += amount;
                world.floatingTexts.push(new FloatingText(this.x, this.y, `+${amount}`, "#bdc3c7"));
                showMessage(`+${amount} Pedrinha(s) coletada(s)!`);
            } else if (this.type === 'coal') {
                inventory.coal += 4;
                world.floatingTexts.push(new FloatingText(this.x, this.y, "+4", "#4a4a4a"));
                showMessage("+4 Carvão coletado!");
            }
            updateHUD();
        }
    }

    draw() {
        if (this.destroyed) return;
        const pos = worldToScreen(this.x, this.y);

        ctx.save();
        if (this.type === 'tree') {
            ctx.fillStyle = "#5c3a21";
            ctx.fillRect(pos.x - 6, pos.y - 4, 12, 18);
            ctx.fillStyle = "#2ecc71";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y - 12, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#27ae60";
            ctx.beginPath();
            ctx.arc(pos.x - 5, pos.y - 16, this.radius * 0.6, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'stone') {
            ctx.fillStyle = "#7f8c8d";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#bdc3c7";
            ctx.beginPath();
            ctx.arc(pos.x - 4, pos.y - 4, this.radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'bush') {
            ctx.fillStyle = "#1abc9c";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#e74c3c";
            ctx.beginPath();
            ctx.arc(pos.x - 6, pos.y - 4, 4, 0, Math.PI * 2);
            ctx.arc(pos.x + 6, pos.y - 2, 4, 0, Math.PI * 2);
            ctx.arc(pos.x, pos.y + 6, 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'twig') {
            ctx.strokeStyle = "#8b5a2b";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(pos.x - 8, pos.y + 4);
            ctx.lineTo(pos.x + 8, pos.y - 4);
            ctx.moveTo(pos.x - 2, pos.y + 1);
            ctx.lineTo(pos.x + 2, pos.y - 6);
            ctx.stroke();
        } else if (this.type === 'small_stone') {
            ctx.fillStyle = "#95a5a6";
            ctx.beginPath();
            ctx.arc(pos.x - 3, pos.y, 4, 0, Math.PI * 2);
            ctx.arc(pos.x + 3, pos.y + 2, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#7f8c8d";
            ctx.beginPath();
            ctx.arc(pos.x - 3, pos.y - 1, 2, 0, Math.PI * 2);
            ctx.fill();
        } else if (this.type === 'coal') {
            // Corpo igual ao da pedra comum
            ctx.fillStyle = "#7f8c8d";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = "#95a5a6";
            ctx.beginPath();
            ctx.arc(pos.x - 4, pos.y - 4, this.radius * 0.5, 0, Math.PI * 2);
            ctx.fill();
            // Bolinhas escuras que representam o minério de carvão
            ctx.fillStyle = "#1c1c1c";
            ctx.beginPath();
            ctx.arc(pos.x - 7, pos.y + 3, 3.4, 0, Math.PI * 2);
            ctx.arc(pos.x + 5, pos.y - 3, 3, 0, Math.PI * 2);
            ctx.arc(pos.x + 2, pos.y + 8, 2.6, 0, Math.PI * 2);
            ctx.arc(pos.x - 2, pos.y - 9, 2.4, 0, Math.PI * 2);
            ctx.arc(pos.x + 8, pos.y + 6, 2.2, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
}

// ============================================================
// GERAÇÃO DE RECURSOS
// ============================================================

function generateResources() {
    world.resources = [];
    const bigTypes = ['tree', 'tree', 'stone', 'stone', 'bush'];
    const smallTypes = ['twig', 'twig', 'small_stone', 'small_stone'];
    const COAL_SPAWN_CHANCE = 0.15; // minério de carvão é raro: só uma fração das pedras grandes vira carvão

    const halfW = CONFIG.MAP_WIDTH / 2 - 80;
    const halfH = CONFIG.MAP_HEIGHT / 2 - 80;

    const cols = 14;
    const rows = 14;
    const cellW = (halfW * 2) / cols;
    const cellH = (halfH * 2) / rows;

    for (let c = 0; c < cols; c++) {
        for (let r = 0; r < rows; r++) {
            const cellMinX = -halfW + c * cellW;
            const cellMinY = -halfH + r * cellH;

            const itemsInCell = Math.floor(Math.random() * 4) + 4;

            for (let i = 0; i < itemsInCell; i++) {
                let x = cellMinX + Math.random() * cellW;
                let y = cellMinY + Math.random() * cellH;

                if (distance(x, y, 0, 0) > 140) {
                    const isBig = Math.random() < 0.5;
                    const pool = isBig ? bigTypes : smallTypes;
                    let type = pool[Math.floor(Math.random() * pool.length)];

                    // Minério de Carvão: nasce raramente no lugar de uma pedra grande comum
                    if (type === 'stone' && Math.random() < COAL_SPAWN_CHANCE) {
                        type = 'coal';
                    }

                    world.resources.push(new ResourceNode(x, y, type));
                }
            }
        }
    }
}

// ============================================================
// PROJÉTEIS & PARTÍCULAS
// ============================================================

class Projectile {
    constructor(x, y, targetX, targetY, damage) {
        this.x = x;
        this.y = y;
        this.speed = 420;
        this.damage = damage;
        this.dead = false;

        const angle = Math.atan2(targetY - y, targetX - x);
        this.vx = Math.cos(angle) * this.speed;
        this.vy = Math.sin(angle) * this.speed;
        this.angle = angle;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;

        for (const enemy of world.enemies) {
            if (!enemy.dead && distance(this.x, this.y, enemy.x, enemy.y) < enemy.radius + 6) {
                enemy.takeDamage(this.damage);
                this.dead = true;
                createParticles(this.x, this.y, 4, "#b8c0c5");
                break;
            }
        }

        if (distance(this.x, this.y, camera.x, camera.y) > 1000) this.dead = true;
    }

    draw() {
        const pos = worldToScreen(this.x, this.y);
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(this.angle);

        ctx.fillStyle = "#b8c0c5";
        ctx.fillRect(-8, -2, 16, 4);
        ctx.fillStyle = "#a06b45";
        ctx.fillRect(-6, -1, 12, 2);

        ctx.restore();
    }
}

class Particle {
    constructor(x, y, color = "#ffffff") {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 100;
        this.vy = (Math.random() - 0.5) * 100;
        this.life = 0.4 + Math.random() * 0.4;
        this.maxLife = this.life;
        this.size = 2 + Math.random() * 3;
        this.color = color;
    }

    update(dt) {
        this.x += this.vx * dt;
        this.y += this.vy * dt;
        this.life -= dt;
    }

    draw() {
        if (this.life <= 0) return;
        const pos = worldToScreen(this.x, this.y);
        ctx.save();
        ctx.globalAlpha = clamp(this.life / this.maxLife, 0, 1);
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function createParticles(x, y, amount = 5, color = "#ffffff") {
    for (let i = 0; i < amount; i++) world.particles.push(new Particle(x, y, color));
}

// ============================================================
// CONSTRUÇÕES
// ============================================================

class Building {
    constructor(x, y, type = "fence") {
        this.x = x;
        this.y = y;
        this.type = type;
        this.data = CRAFTABLE_TYPES[type] || CRAFTABLE_TYPES.fence;
        this.radius = this.data.radius || 30;
        this.maxHp = this.data.maxHp || 100;
        this.hp = this.maxHp;
        this.dead = false;
        this.hitFlash = 0;

        this.fireTimer = 0;
        this.rotation = 0;
    }

    takeDamage(amount) {
        if (this.dead) return;
        this.hp = Math.max(0, this.hp - amount);
        this.hitFlash = 0.15;
        if (this.hp <= 0) this.dead = true;
    }

    update(dt) {
        if (this.hitFlash > 0) this.hitFlash -= dt;

        if (this.type === "ballista" && !this.dead) {
            this.fireTimer -= dt;
            let target = null;
            let closestDist = this.data.range;

            for (const enemy of world.enemies) {
                if (enemy.dead) continue;
                const d = distance(this.x, this.y, enemy.x, enemy.y);
                if (d < closestDist) {
                    closestDist = d;
                    target = enemy;
                }
            }

            if (target) {
                this.rotation = Math.atan2(target.y - this.y, target.x - this.x);
                if (this.fireTimer <= 0) {
                    world.projectiles.push(new Projectile(this.x, this.y, target.x, target.y, this.data.damage));
                    this.fireTimer = this.data.fireRate;
                }
            }
        }
    }

    draw(isGhost = false, isValidGhost = true) {
        const pos = worldToScreen(this.x, this.y);
        ctx.save();

        if (isGhost) {
            ctx.globalAlpha = 0.65;
            ctx.fillStyle = isValidGhost ? "rgba(46, 204, 113, 0.4)" : "rgba(231, 76, 60, 0.4)";
            ctx.beginPath();
            ctx.arc(pos.x, pos.y, this.radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = isValidGhost ? "#2ecc71" : "#e74c3c";
            ctx.lineWidth = 2;
            ctx.stroke();
        }

        if (this.type === "fence") {
            ctx.fillStyle = this.hitFlash > 0 ? "#f07a62" : "#805333";
            ctx.fillRect(pos.x - 24, pos.y - 20, 8, 40);
            ctx.fillRect(pos.x + 16, pos.y - 20, 8, 40);

            ctx.fillStyle = "#a46a3e";
            ctx.fillRect(pos.x - 24, pos.y - 12, 48, 6);
            ctx.fillRect(pos.x - 24, pos.y + 6, 48, 6);
        } else if (this.type === "ballista") {
            ctx.translate(pos.x, pos.y);

            ctx.fillStyle = "#59636b";
            ctx.beginPath();
            ctx.arc(0, 0, 32, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#303840";
            ctx.lineWidth = 4;
            ctx.stroke();

            ctx.fillStyle = "#2e6bd1";
            ctx.fillRect(-10, 10, 20, 18);

            ctx.rotate(this.rotation);

            ctx.fillStyle = "#a06b45";
            ctx.fillRect(-12, -8, 24, 16);

            ctx.strokeStyle = "#d6c3a5";
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.arc(-8, 0, 22, -Math.PI / 2.5, Math.PI / 2.5);
            ctx.stroke();

            ctx.fillStyle = "#b8c0c5";
            ctx.fillRect(-2, -3, 20, 6);
        }

        ctx.restore();

        if (!isGhost && !this.dead) {
            const hpPercent = clamp(this.hp / this.maxHp, 0, 1);
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillRect(pos.x - 25, pos.y - this.radius - 12, 50, 5);
            ctx.fillStyle = "#55d66b";
            ctx.fillRect(pos.x - 25, pos.y - this.radius - 12, 50 * hpPercent, 5);
        }
    }
}

// ============================================================
// INIMIGOS
// ============================================================

class Enemy {
    constructor(x, y, type = "drone_triangle") {
        this.x = x;
        this.y = y;
        this.type = type;

        if (type === "drone_triangle") {
            this.radius = 16;
            this.speed = 85;
            this.hp = 35;
            this.damage = 6;
        } else if (type === "drone_sphere") {
            this.radius = 18;
            this.speed = 65;
            this.hp = 60;
            this.damage = 10;
        } else if (type === "heavy_knight") {
            this.radius = 22;
            this.speed = 45;
            this.hp = 140;
            this.damage = 18;
        } else if (type === "tracked_bomber") {
            this.radius = 24;
            this.speed = 55;
            this.hp = 80;
            this.damage = 70;
        }

        this.maxHp = this.hp;
        this.attackTimer = 0;
        this.dead = false;
        this.pulse = 0;
    }

    takeDamage(amount) {
        this.hp -= amount;
        if (this.hp <= 0) {
            this.dead = true;
            createParticles(this.x, this.y, 10, "#d63031");
        }
    }

    update(dt) {
        if (this.dead) return;
        this.attackTimer -= dt;
        this.pulse += dt * 5;

        let target = world.base;
        let closestDist = distance(this.x, this.y, world.base.x, world.base.y);

        for (const b of world.buildings) {
            if (!b.dead) {
                const d = distance(this.x, this.y, b.x, b.y);
                if (d < closestDist) {
                    closestDist = d;
                    target = b;
                }
            }
        }

        if (target) {
            const d = distance(this.x, this.y, target.x, target.y);
            if (d < this.radius + target.radius + 4) {
                if (this.type === "tracked_bomber") {
                    target.takeDamage(this.damage);
                    createParticles(this.x, this.y, 25, "#ff7675");
                    this.dead = true;
                } else if (this.attackTimer <= 0) {
                    target.takeDamage(this.damage);
                    this.attackTimer = 1.0;
                }
            } else {
                const angle = Math.atan2(target.y - this.y, target.x - this.x);
                this.x += Math.cos(angle) * this.speed * dt;
                this.y += Math.sin(angle) * this.speed * dt;
            }
        }
    }

    draw() {
        if (this.dead) return;
        const pos = worldToScreen(this.x, this.y);
        ctx.save();
        ctx.translate(pos.x, pos.y);

        if (this.type === "drone_triangle") {
            ctx.strokeStyle = "#ff0033";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 16, 14 + Math.sin(this.pulse)*2, 5, 0, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = "#b2bec3";
            ctx.beginPath();
            ctx.moveTo(0, 14);
            ctx.lineTo(-14, -14);
            ctx.lineTo(14, -14);
            ctx.closePath();
            ctx.fill();
            ctx.strokeStyle = "#2d3436";
            ctx.stroke();

            ctx.fillStyle = "#ff0033";
            ctx.beginPath();
            ctx.arc(0, -2, 4, 0, Math.PI * 2);
            ctx.fill();

        } else if (this.type === "drone_sphere") {
            ctx.strokeStyle = "#ff0033";
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.ellipse(0, 18, 16 + Math.sin(this.pulse)*2, 6, 0, 0, Math.PI * 2);
            ctx.stroke();

            ctx.fillStyle = "#b2bec3";
            ctx.beginPath();
            ctx.arc(0, 0, 16, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = "#2d3436";
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(-16, 0); ctx.lineTo(16, 0);
            ctx.moveTo(0, -16); ctx.lineTo(0, 16);
            ctx.stroke();

            ctx.fillStyle = "#ff0033";
            ctx.beginPath();
            ctx.arc(4, -2, 5, 0, Math.PI * 2);
            ctx.fill();

        } else if (this.type === "heavy_knight") {
            ctx.fillStyle = "#636e72";
            ctx.fillRect(-16, -18, 32, 36);
            ctx.strokeStyle = "#2d3436";
            ctx.lineWidth = 3;
            ctx.strokeRect(-16, -18, 32, 36);

            ctx.fillStyle = "#2d3436";
            ctx.fillRect(-22, -12, 6, 16);
            ctx.fillRect(16, -12, 6, 16);

            ctx.fillStyle = "#ff0033";
            ctx.fillRect(-12, -8, 24, 6);

        } else if (this.type === "tracked_bomber") {
            ctx.fillStyle = "#2d3436";
            ctx.fillRect(-18, 12, 36, 6);
            ctx.fillRect(-18, -18, 36, 6);

            ctx.fillStyle = "#b2bec3";
            ctx.fillRect(-14, -12, 28, 24);
            ctx.strokeStyle = "#2d3436";
            ctx.strokeRect(-14, -12, 28, 24);

            ctx.fillStyle = "#ff0033";
            ctx.fillRect(-10, -8, 20, 16);

            ctx.fillStyle = "#000000";
            ctx.beginPath();
            ctx.arc(0, 1, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillRect(-1, -5, 2, 3);
        }

        ctx.restore();

        const hpPercent = clamp(this.hp / this.maxHp, 0, 1);
        ctx.fillStyle = "rgba(0,0,0,0.6)";
        ctx.fillRect(pos.x - 18, pos.y - this.radius - 10, 36, 4);
        ctx.fillStyle = "#e74c3c";
        ctx.fillRect(pos.x - 18, pos.y - this.radius - 10, 36 * hpPercent, 4);
    }
}

// ============================================================
// JOGADOR E BASE
// ============================================================

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = CONFIG.PLAYER_RADIUS;
        this.largura = CONFIG.PLAYER_RADIUS * 2;
        this.altura = CONFIG.PLAYER_RADIUS * 2;
        this.speed = CONFIG.PLAYER_SPEED;
        this.isBlinking = false;
        this.nextBlinkTime = Date.now() + (Math.random() * 4000 + 3000);
        this.blinkEndTime = 0;

        this.swingTimer = 0;
        this.swingDuration = 0.18;
        this.harvestCooldown = 0;
    }

    swing() {
        this.swingTimer = this.swingDuration;
    }

    update(dt) {
        let dx = 0, dy = 0;
        if (keys["w"] || keys["arrowup"]) dy -= 1;
        if (keys["s"] || keys["arrowdown"]) dy += 1;
        if (keys["a"] || keys["arrowleft"]) dx -= 1;
        if (keys["d"] || keys["arrowright"]) dx += 1;

        if (this.swingTimer > 0) this.swingTimer -= dt;
        if (this.harvestCooldown > 0) this.harvestCooldown -= dt;

        const now = Date.now();
        if (!this.isBlinking && now >= this.nextBlinkTime) {
            this.isBlinking = true;
            this.blinkEndTime = now + 150;
        } else if (this.isBlinking && now >= this.blinkEndTime) {
            this.isBlinking = false;
            this.nextBlinkTime = now + (Math.random() * 4000 + 3000);
        }

        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > 0) {
            dx /= len;
            dy /= len;
            const nx = this.x + dx * this.speed * dt;
            const ny = this.y + dy * this.speed * dt;
            if (!this.collides(nx, this.y)) this.x = nx;
            if (!this.collides(this.x, ny)) this.y = ny;
        }
    }

    collides(x, y) {
        const halfW = CONFIG.MAP_WIDTH / 2;
        const halfH = CONFIG.MAP_HEIGHT / 2;

        const limitRight = ponteCompleta ? halfW + 400 : halfW;
        
        // Se o portão do topo estiver aberto e o jogador estiver alinhado com a passagem do portão
        const passaPeloPortaoTopo = portaoTopoAberto && Math.abs(x) <= 100;
        const limitTop = passaPeloPortaoTopo ? -halfH - 2000 : -halfH;

        if (x - this.radius < -halfW || x + this.radius > limitRight ||
            y - this.radius < limitTop || y + this.radius > halfH) {
            return true;
        }

        // Checagem de colisão com o Rio e Ponte sem parede invisível
        const dummyPlayer = {
            x: x - this.radius,
            y: y - this.radius,
            largura: this.largura,
            altura: this.altura
        };
        if (checarColisao(dummyPlayer)) {
            return true;
        }

        if (world.base && distance(x, y, world.base.x, world.base.y) < world.base.radius + this.radius) return true;
        if (world.craftingTable && distance(x, y, world.craftingTable.x, world.craftingTable.y) < world.craftingTable.radius + this.radius) return true;

        for (const r of world.resources) {
            if (!r.destroyed && distance(x, y, r.x, r.y) < r.radius + this.radius) {
                return true;
            }
        }

        for (const b of world.buildings) {
            if (!b.dead && distance(x, y, b.x, b.y) < b.radius + this.radius) return true;
        }

        return false;
    }

    draw() {
        const pos = worldToScreen(this.x, this.y);
        const activeItem = hotbarItems[selectedHotbarSlot];
        const angle = Math.atan2(mouse.y - pos.y, mouse.x - pos.x);

        ctx.save();
        ctx.translate(pos.x, pos.y);

        ctx.fillStyle = "#35d9df";
        ctx.beginPath();
        ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#0c2830";
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.rotate(angle);

        const handX = this.radius * 0.85;
        const handY = this.radius * 0.75;
        const handRadius = this.radius * 0.22;

        ctx.fillStyle = "#35d9df";
        ctx.beginPath();
        ctx.arc(handX, -handY, handRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#0c2830";
        ctx.lineWidth = 2;
        ctx.stroke();

        let swingOffset = 0;
        let swingRot = 0;
        if (this.swingTimer > 0) {
            const progress = 1 - (this.swingTimer / this.swingDuration);
            const swingFactor = Math.sin(progress * Math.PI);
            swingOffset = swingFactor * 14;
            swingRot = swingFactor * 0.6;
        }

        const rightHandX = handX + swingOffset;
        const rightHandY = handY;

        ctx.fillStyle = "#35d9df";
        ctx.beginPath();
        ctx.arc(rightHandX, rightHandY, handRadius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#0c2830";
        ctx.lineWidth = 2;
        ctx.stroke();

        const eyeX = this.radius * 0.5;
        const eyeY = this.radius * 0.35;

        if (this.isBlinking) {
            ctx.strokeStyle = "#0c2830";
            ctx.lineWidth = 2.5;
            ctx.lineCap = "round";

            ctx.beginPath();
            ctx.moveTo(eyeX - 3, -eyeY); ctx.lineTo(eyeX + 3, -eyeY);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(eyeX - 3, eyeY); ctx.lineTo(eyeX + 3, eyeY);
            ctx.stroke();
        } else {
            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(eyeX, -eyeY, 4.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#0c2830";
            ctx.beginPath(); ctx.arc(eyeX + 1.5, -eyeY, 2, 0, Math.PI * 2); ctx.fill();

            ctx.fillStyle = "#ffffff";
            ctx.beginPath(); ctx.arc(eyeX, eyeY, 4.5, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = "#0c2830";
            ctx.beginPath(); ctx.arc(eyeX + 1.5, eyeY, 2, 0, Math.PI * 2); ctx.fill();
        }

        if (activeItem && activeItem.icon) {
            ctx.save();
            ctx.translate(rightHandX, rightHandY);
            ctx.rotate(swingRot);

            ctx.fillStyle = "#8b5a2b";
            ctx.fillRect(-2, -12, 4, 16);
            ctx.strokeStyle = "#4a2e16";
            ctx.lineWidth = 1;
            ctx.strokeRect(-2, -12, 4, 16);

            ctx.font = "18px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(activeItem.icon, 0, -14);

            ctx.restore();
        }

        ctx.restore();
    }
}

class Base {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.radius = CONFIG.BASE_RADIUS;
        this.maxHp = CONFIG.BASE_MAX_HP;
        this.hp = this.maxHp;
        this.buildRadius = 300;
        this.upgradeLevel = 1;
    }

    takeDamage(amount) {
        if (gameState !== GAME_STATE.PLAYING) return;
        this.hp = Math.max(0, this.hp - amount);
        triggerScreenShake(amount * 1.5);
        createParticles(this.x, this.y, 8, "#e74c3c");
        if (this.hp <= 0) gameOver();
    }

    draw() {
        const pos = worldToScreen(this.x, this.y);
        ctx.save();
        ctx.fillStyle = "#a86f45";
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, this.radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "#30231d";
        ctx.lineWidth = 5;
        ctx.stroke();

        const hpPercent = clamp(this.hp / this.maxHp, 0, 1);
        const barWidth = 100;
        const barHeight = 10;
        const barX = pos.x - barWidth / 2;
        const barY = pos.y - this.radius - 22;

        ctx.fillStyle = "rgba(0, 0, 0, 0.8)";
        ctx.fillRect(barX - 2, barY - 2, barWidth + 4, barHeight + 4);

        ctx.fillStyle = hpPercent > 0.5 ? "#2ecc71" : hpPercent > 0.25 ? "#f1c40f" : "#e74c3c";
        ctx.fillRect(barX, barY, barWidth * hpPercent, barHeight);

        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1;
        ctx.strokeRect(barX, barY, barWidth, barHeight);

        ctx.restore();
    }
}

// ============================================================
// COLETA, REPARO DA PONTE E CONTROLE DE CRIAÇÃO
// ============================================================

function depositarMadeiras() {
    if (ponteCompleta) {
        showMessage("A ponte já está totalmente reparada!");
        return;
    }

    const falta = MADEIRAS_NECESSARIAS - madeirasDepositadas;
    const quantidadeEntregue = Math.min(inventory.wood, falta);

    if (quantidadeEntregue <= 0) {
        showMessage("Você precisa ter Madeira no inventário para depositar!");
        return;
    }

    madeirasDepositadas += quantidadeEntregue;
    inventory.wood -= quantidadeEntregue;

    const plaqueX = CONFIG.MAP_WIDTH / 2 - 60;
    const plaqueY = -140;
    world.floatingTexts.push(new FloatingText(plaqueX, plaqueY, `+${quantidadeEntregue} 🪵`, "#f1c40f"));

    if (madeirasDepositadas >= MADEIRAS_NECESSARIAS) {
        ponteCompleta = true;
        showMessage("🎉 Ponte reconstruída!");
    } else {
        showMessage(`Depositou ${quantidadeEntregue} madeiras! Falta: ${MADEIRAS_NECESSARIAS - madeirasDepositadas}`);
    }

    updateHUD();
}

function tryHarvestResource() {
    if (!world.player) return;
    if (world.player.harvestCooldown > 0) return;

    let closestNode = null;
    let closestDist = CONFIG.COLLECT_DISTANCE;

    for (const r of world.resources) {
        if (r.destroyed) continue;
        const d = distance(world.player.x, world.player.y, r.x, r.y);
        if (d < closestDist) {
            closestDist = d;
            closestNode = r;
        }
    }

    if (!closestNode) return;

    const activeItem = hotbarItems[selectedHotbarSlot];

    if (closestNode.type === "tree") {
        if (!activeItem || activeItem.id !== "axe") {
            showMessage("Equipe o Machado na Hotbar para cortar árvores!");
            return;
        }
    } else if (closestNode.type === "stone" || closestNode.type === "coal") {
        if (!activeItem || activeItem.id !== "pickaxe") {
            showMessage("Equipe a Picareta na Hotbar para minar rochas!");
            return;
        }
    }

    world.player.harvestCooldown = 0.70;
    world.player.swing();
    closestNode.hit();
}

function openConstructionMenu() {
    buildMenuOpen = true;
    const modal = document.getElementById("buildMenu");
    if (modal) modal.classList.add("active");
    renderBuildingList();
}

function closeBuildMenu() {
    buildMenuOpen = false;
    const modal = document.getElementById("buildMenu");
    if (modal) modal.classList.remove("active");
}

function filterCategory(category, evt) {
    currentCategory = category;
    document.querySelectorAll(".tab-btn").forEach(btn => btn.classList.remove("active"));
    if (evt && evt.target) evt.target.classList.add("active");
    renderBuildingList();
}

function renderBuildingList() {
    const list = document.getElementById("buildingList");
    if (!list) return;

    list.innerHTML = "";
    const items = Object.values(CRAFTABLE_TYPES).filter(item => item.category === currentCategory);

    if (items.length === 0) {
        list.innerHTML = `<div style="color: #a0aec0; text-align: center; grid-column: 1/-1; padding: 20px;">Nenhum item disponível nesta categoria.</div>`;
        return;
    }

    items.forEach(item => {
        const card = document.createElement("div");
        card.className = "building-card";
        card.onclick = () => selectCraftable(item.id);

        const costs = [];
        if (item.cost.wood) costs.push(`🪵 ${item.cost.wood}`);
        if (item.cost.stone) costs.push(`🪨 ${item.cost.stone}`);
        if (item.cost.coal) costs.push(`⚫ ${item.cost.coal}`);
        if (item.cost.gold !== undefined) costs.push(`🪙 ${item.cost.gold}`);
        if (item.cost.string !== undefined) costs.push(`🧵 ${item.cost.string}`);

        card.innerHTML = `
            <div class="card-title">${item.icon ? item.icon + " " : ""}${item.name}</div>
            <div class="card-desc">${item.desc}</div>
            <div class="card-cost-box">
                <strong>Custos:</strong> ${costs.join(" | ")}
            </div>
        `;
        list.appendChild(card);
    });
}

function selectCraftable(id) {
    const item = CRAFTABLE_TYPES[id];
    if (!item) return;

    const wCost = item.cost.wood || 0;
    const sCost = item.cost.stone || 0;
    const cCost = item.cost.coal || 0;
    const gCost = item.cost.gold || 0;
    const strCost = item.cost.string || 0;

    if (inventory.wood < wCost || inventory.stone < sCost || inventory.coal < cCost || (inventory.gold || 0) < gCost || (inventory.string || 0) < strCost) {
        showMessage("Recursos insuficientes!");
        return;
    }

    if (item.type === "tool") {
        const emptySlot = hotbarItems.findIndex(slot => slot === null);
        if (emptySlot === -1) {
            showMessage("Sua Hotbar está cheia!");
            return;
        }

        inventory.wood -= wCost;
        inventory.stone -= sCost;
        inventory.coal -= cCost;
        if (gCost) inventory.gold -= gCost;
        if (strCost) inventory.string -= strCost;

        hotbarItems[emptySlot] = { id: item.id, name: item.name, icon: item.icon };
        showMessage(`${item.name} criado e adicionado à Hotbar!`);
        updateHUD();
        closeBuildMenu();

    } else if (item.type === "building") {
        selectedBuilding = id;
        buildMode = true;
        closeBuildMenu();
        showMessage("Clique no chão para posicionar a estrutura!");

    } else if (item.type === "upgrade") {
        if (item.id === "base_upgrade") {
            if (!world.base) return;

            inventory.wood -= wCost;
            inventory.stone -= sCost;

            world.base.buildRadius += 100;
            world.base.upgradeLevel++;

            item.cost.wood = Math.floor(item.cost.wood * 1.8);
            item.cost.stone = Math.floor(item.cost.stone * 1.8);

            showMessage(`Raio da base expandido para ${world.base.buildRadius}px!`);
            updateHUD();
            closeBuildMenu();
        }
    }
}

function handleBuildClick() {
    if (!buildMode || !selectedBuilding) return;

    const config = CRAFTABLE_TYPES[selectedBuilding];
    if (!config || config.type !== "building") return;

    if (inventory.wood < config.cost.wood || inventory.stone < (config.cost.stone || 0)) {
        showMessage("Recursos insuficientes!");
        return;
    }

    const clickPos = screenToWorld(mouse.x, mouse.y);
    if (!canBuildAt(clickPos.x, clickPos.y, config.radius)) {
        if (world.base && distance(clickPos.x, clickPos.y, world.base.x, world.base.y) > world.base.buildRadius) {
            showMessage("Fora do raio de alcance da base!");
        } else {
            showMessage("Não é possível construir aqui!");
        }
        return;
    }

    inventory.wood -= config.cost.wood;
    inventory.stone -= config.cost.stone || 0;

    world.buildings.push(new Building(clickPos.x, clickPos.y, selectedBuilding));
    showMessage("Estrutura construída!");
    updateHUD();
}

function tryUnlockTopGate() {
    const halfH = CONFIG.MAP_HEIGHT / 2;
    if (portaoTopoAberto) {
        showMessage("O Portão do Topo já está aberto!");
        return;
    }

    const keyIndex = hotbarItems.findIndex(item => item && item.id === "gate_key");
    if (keyIndex !== -1) {
        hotbarItems[keyIndex] = null; // Removida a chave da hotbar ao usar
        portaoTopoAberto = true;
        showMessage("🔑 Você usou a Chave! O Portão se abriu e a neblina desapareceu!");
        world.floatingTexts.push(new FloatingText(0, -halfH, "PORTÃO DESBLOQUEADO!", "#2ecc71"));
        updateHUD();
    } else {
        showMessage("🔒 Portão Trancado! Fabrique a Chave do Portão (🔑) na Mesa de Criação.");
    }
}

function interact() {
    if (gameState !== GAME_STATE.PLAYING || !world.player) return;

    const halfW = CONFIG.MAP_WIDTH / 2;
    const halfH = CONFIG.MAP_HEIGHT / 2;
    const plaquePos = { x: halfW - 60, y: -140 };

    if (distance(world.player.x, world.player.y, 0, -halfH) <= 160) {
        tryUnlockTopGate();
    } else if (distance(world.player.x, world.player.y, plaquePos.x, plaquePos.y) <= CONFIG.CRAFTING_INTERACTION_DISTANCE) {
        depositarMadeiras();
    } else if (world.craftingTable && distance(world.player.x, world.player.y, world.craftingTable.x, world.craftingTable.y) <= CONFIG.CRAFTING_INTERACTION_DISTANCE) {
        openConstructionMenu();
    } else {
        tryHarvestResource();
    }
}

// ============================================================
// CICLO DE DIA E NOITE
// ============================================================

function spawnNightWave() {
    const types = ["drone_triangle", "drone_sphere", "heavy_knight", "tracked_bomber"];
    const count = 6 + nightNumber * 4;

    for (let i = 0; i < count; i++) {
        const angle = Math.random() * Math.PI * 2;
        const dist = 900 + Math.random() * 300;
        const x = Math.cos(angle) * dist;
        const y = Math.sin(angle) * dist;
        const enemyType = types[Math.floor(Math.random() * types.length)];
        world.enemies.push(new Enemy(x, y, enemyType));
    }
}

function updateTimeCycle(dt) {
    if (gameState !== GAME_STATE.PLAYING) return;
    phaseTimer -= dt;

    if (phaseTimer <= 0) {
        if (timeState === TIME_STATE.DAY) {
            timeState = TIME_STATE.NIGHT;
            nightNumber++;
            phaseTimer = CONFIG.NIGHT_DURATION;
            spawnNightWave();
            showMessage(`NOITE ${nightNumber}: Defenda sua base!`);
        } else {
            timeState = TIME_STATE.DAY;
            phaseTimer = CONFIG.DAY_DURATION;
            generateResources();
            showMessage(`DIA: Colete recursos e reforce sua defesa!`);
        }
    }

    const phaseEl = document.getElementById("phaseText");
    const timerEl = document.getElementById("timerText");

    if (phaseEl && timerEl) {
        const mins = Math.floor(phaseTimer / 60);
        const secs = Math.floor(phaseTimer % 60).toString().padStart(2, "0");
        timerEl.textContent = `${mins.toString().padStart(2, "0")}:${secs}`;

        if (timeState === TIME_STATE.DAY) {
            phaseEl.textContent = `☀️ Dia ${nightNumber + 1}`;
            phaseEl.style.color = "#f1c40f";
        } else {
            phaseEl.textContent = `🌙 Noite ${nightNumber}`;
            phaseEl.style.color = "#e74c3c";
        }
    }
}

// ============================================================
// RENDERIZAÇÃO DA HOTBAR
// ============================================================

function drawHotbar() {
    const numSlots = 6;
    const slotSize = 64;
    const slotGap = 10;
    const padding = 10;

    const containerWidth = numSlots * slotSize + (numSlots - 1) * slotGap + padding * 2;
    const containerHeight = slotSize + padding * 2;

    const startX = (screenWidth - containerWidth) / 2;
    const startY = screenHeight - containerHeight - 20;

    const topBarWidth = containerWidth * 0.85;
    const topBarHeight = 28;
    const topBarX = (screenWidth - topBarWidth) / 2;
    const topBarY = startY - topBarHeight - 8;

    ctx.fillStyle = "#d9d9d9";
    ctx.fillRect(topBarX, topBarY, topBarWidth, topBarHeight);

    ctx.fillStyle = "#000000";
    ctx.font = "bold 16px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("Vida da base", topBarX + topBarWidth / 2, topBarY + topBarHeight / 2);

    ctx.fillStyle = "#d9d9d9";
    ctx.fillRect(startX, startY, containerWidth, containerHeight);

    for (let i = 0; i < numSlots; i++) {
        const slotX = startX + padding + i * (slotSize + slotGap);
        const slotY = startY + padding;

        ctx.fillStyle = "#737373";
        ctx.fillRect(slotX, slotY, slotSize, slotSize);

        if (selectedHotbarSlot === i) {
            ctx.strokeStyle = "#1e88e5";
            ctx.lineWidth = 4;
            ctx.strokeRect(slotX, slotY, slotSize, slotSize);
        }

        const item = hotbarItems[i];
        if (item) {
            ctx.font = "26px sans-serif";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText(item.icon, slotX + slotSize / 2, slotY + slotSize / 2 + 6);
        }

        ctx.fillStyle = "#000000";
        ctx.font = "bold 28px sans-serif";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        ctx.fillText((i + 1).toString(), slotX + 6, slotY + 4);
    }
}

function checkHotbarClick(clickX, clickY) {
    const numSlots = 6;
    const slotSize = 64;
    const slotGap = 10;
    const padding = 10;

    const containerWidth = numSlots * slotSize + (numSlots - 1) * slotGap + padding * 2;
    const containerHeight = slotSize + padding * 2;

    const startX = (screenWidth - containerWidth) / 2;
    const startY = screenHeight - containerHeight - 20;

    if (clickX >= startX && clickX <= startX + containerWidth &&
        clickY >= startY && clickY <= startY + containerHeight) {
        
        for (let i = 0; i < numSlots; i++) {
            const slotX = startX + padding + i * (slotSize + slotGap);
            const slotY = startY + padding;

            if (clickX >= slotX && clickX <= slotX + slotSize &&
                clickY >= slotY && clickY <= slotY + slotSize) {
                selectedHotbarSlot = i;
                return true;
            }
        }
        return true;
    }
    return false;
}

// ============================================================
// TELA DE GAME OVER E REINÍCIO
// ============================================================

function drawGameOverScreen() {
    ctx.save();
    
    ctx.fillStyle = "rgba(15, 8, 12, 0.88)";
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    const panelW = Math.min(520, screenWidth - 40);
    const panelH = 340;
    const panelX = (screenWidth - panelW) / 2;
    const panelY = (screenHeight - panelH) / 2;

    ctx.fillStyle = "#161b22";
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, 16);
    ctx.fill();

    ctx.strokeStyle = "#ff3344";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.shadowColor = "#ff0033";
    ctx.shadowBlur = 15;
    ctx.fillStyle = "#ff2a4b";
    ctx.font = "900 46px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("BASE DESTRUÍDA", screenWidth / 2, panelY + 35);
    ctx.shadowBlur = 0;

    ctx.fillStyle = "#a0aec0";
    ctx.font = "16px sans-serif";
    ctx.fillText("Os robôs invasores dominaram o seu território.", screenWidth / 2, panelY + 95);

    ctx.strokeStyle = "#2d3748";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + 40, panelY + 130);
    ctx.lineTo(panelX + panelW - 40, panelY + 130);
    ctx.stroke();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 20px sans-serif";
    const nightText = nightNumber === 1 ? "1 noite corrida" : `${nightNumber} noites sobrevividas`;
    ctx.fillText(`📊 Resultado: ${nightText}`, screenWidth / 2, panelY + 155);

    const btnW = 260;
    const btnH = 50;
    const btnX = (screenWidth - btnW) / 2;
    const btnY = panelY + panelH - 85;

    const isHovering = mouse.x >= btnX && mouse.x <= btnX + btnW &&
                       mouse.y >= btnY && mouse.y <= btnY + btnH;

    ctx.fillStyle = isHovering ? "#ff4757" : "#e74c3c";
    ctx.beginPath();
    ctx.roundRect(btnX, btnY, btnW, btnH, 8);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 18px sans-serif";
    ctx.textBaseline = "middle";
    ctx.fillText("JOGAR NOVAMENTE", screenWidth / 2, btnY + btnH / 2);

    ctx.fillStyle = "#718096";
    ctx.font = "13px sans-serif";
    ctx.fillText("pressione 'R' ou clique para reiniciar", screenWidth / 2, panelY + panelH - 18);

    ctx.restore();
}

function checkGameOverButtonClick(clickX, clickY) {
    const panelH = 340;
    const panelY = (screenHeight - panelH) / 2;
    const btnW = 260;
    const btnH = 50;
    const btnX = (screenWidth - btnW) / 2;
    const btnY = panelY + panelH - 85;

    if (clickX >= btnX && clickX <= btnX + btnW &&
        clickY >= btnY && clickY <= btnY + btnH) {
        restartGame();
    }
}

function restartGame() {
    inventory = { wood: 0, stone: 0, berries: 10, coal: 0, gold: 0, string: 0 };
    selectedHotbarSlot = 0;
    hotbarItems = [null, null, null, null, null, null];
    madeirasDepositadas = 0;
    ponteCompleta = false;
    portaoTopoAberto = false;

    if (CRAFTABLE_TYPES.base_upgrade) {
        CRAFTABLE_TYPES.base_upgrade.cost = { wood: 20, stone: 15 };
    }

    world = {
        player: null,
        base: null,
        craftingTable: null,
        resources: [],
        enemies: [],
        buildings: [],
        projectiles: [],
        particles: [],
        floatingTexts: []
    };

    buildMode = false;
    selectedBuilding = null;
    closeBuildMenu();

    timeState = TIME_STATE.DAY;
    phaseTimer = CONFIG.DAY_DURATION;
    nightNumber = 0;

    startGame();
}

function gameOver() {
    gameState = GAME_STATE.GAME_OVER;
    triggerScreenShake(25);
    createParticles(world.base.x, world.base.y, 40, "#ff4757");
}

// ============================================================
// LOOP PRINCIPAL & RENDER
// ============================================================

function updateGame(dt) {
    if (shakeIntensity > 0) {
        shakeIntensity -= dt * 30;
        if (shakeIntensity < 0) shakeIntensity = 0;
        currentShakeX = (Math.random() - 0.5) * shakeIntensity;
        currentShakeY = (Math.random() - 0.5) * shakeIntensity;
    } else {
        currentShakeX = 0;
        currentShakeY = 0;
    }

    for (const pt of world.particles) pt.update(dt);
    world.particles = world.particles.filter(pt => pt.life > 0);

    if (gameState !== GAME_STATE.PLAYING) return;

    updateTimeCycle(dt);

    if (world.player) world.player.update(dt);
    for (const b of world.buildings) b.update(dt);
    for (const e of world.enemies) e.update(dt);
    for (const p of world.projectiles) p.update(dt);
    for (const ft of world.floatingTexts) ft.update(dt);

    world.buildings = world.buildings.filter(b => !b.dead);
    world.enemies = world.enemies.filter(e => !e.dead);
    world.projectiles = world.projectiles.filter(p => !p.dead);
    world.floatingTexts = world.floatingTexts.filter(ft => ft.life > 0);

    if (world.player) {
        camera.x += (world.player.x - camera.x) * 0.1;
        camera.y += (world.player.y - camera.y) * 0.1;
    }
}

function renderGame() {
    if (!ctx) return;

    ctx.clearRect(0, 0, screenWidth, screenHeight);

    if (gameState === GAME_STATE.MENU) {
        ctx.fillStyle = "#030838";
        ctx.fillRect(0, 0, screenWidth, screenHeight);
        return;     
    }

    ctx.fillStyle = "#7fd957";
    ctx.fillRect(0, 0, screenWidth, screenHeight);

    // ÁREA LIMITE DE CONSTRUÇÃO DA BASE
    if (world.base) {
        const basePos = worldToScreen(world.base.x, world.base.y);
        
        ctx.save();
        ctx.beginPath();
        ctx.arc(basePos.x, basePos.y, world.base.buildRadius, 0, Math.PI * 2);
        
        ctx.strokeStyle = "rgba(46, 204, 113, 0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 6]);
        ctx.stroke();
        
        ctx.fillStyle = "rgba(46, 204, 113, 0.04)";
        ctx.fill();
        
        ctx.restore();
    }

    if (timeState === TIME_STATE.DAY) {
        ctx.fillStyle = "rgba(255, 255, 220, 0.08)";
        ctx.fillRect(0, 0, screenWidth, screenHeight);
    }

    const halfW = CONFIG.MAP_WIDTH / 2;
    const halfH = CONFIG.MAP_HEIGHT / 2;
    const topLeft = worldToScreen(-halfW, -halfH);

    // ============================================================
    // 1. CAMADA DE NÉVOA (NO LADO DIREITO E NO TOPO)
    // ============================================================
    
    // NÉVOA SUPERIOR (TOPO) - Posicionada atrás do portão e muralha (desaparece ao abrir o portão)
    if (!portaoTopoAberto) {
        const topBorderPos = worldToScreen(0, -halfH);
        const topLimitY = topBorderPos.y - 45;
        if (topLimitY > -200) {
            ctx.save();
            ctx.beginPath();
            ctx.rect(0, 0, screenWidth, Math.max(0, topLimitY + 60));
            ctx.clip();

            ctx.fillStyle = "#080c12";
            ctx.fillRect(0, 0, screenWidth, Math.max(0, topLimitY));

            const time = Date.now() * 0.0008;
            for (let x = -80; x < screenWidth + 120; x += 80) {
                const offsetX = Math.sin(time * 1.2 + x * 0.04) * 25;
                const offsetY = Math.cos(time * 0.9 + x * 0.03) * 12;
                const radius = 150 + Math.sin(x * 0.08 + time) * 30;

                const py = topLimitY + offsetY;
                const px = x + offsetX;

                const grad = ctx.createRadialGradient(px, py, 10, px, py, radius);
                grad.addColorStop(0, "rgba(8, 12, 18, 1)");
                grad.addColorStop(0.5, "rgba(14, 20, 30, 0.85)");
                grad.addColorStop(0.8, "rgba(20, 28, 42, 0.4)");
                grad.addColorStop(1, "rgba(8, 12, 18, 0)");

                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(px, py, radius, 0, Math.PI * 2);
                ctx.fill();
            }
            ctx.restore();
        }
    }

    // (Névoa direita removida — rio e ponte agora são visíveis sem bloqueio)

    // ============================================================
    // 2. DESENHO DO RIO (ESTILO CARTOON ANIMADO) E DA PONTE
    // ============================================================
    const riverWorldX = halfW + 100;
    const riverWidth = 220;
    const riverPos = worldToScreen(riverWorldX, 0);

    const mapTopScreen = worldToScreen(0, -halfH - 600);
    const mapBottomScreen = worldToScreen(0, halfH + 600);
    const riverHeightScreen = mapBottomScreen.y - mapTopScreen.y;
    const riverLeft = riverPos.x - riverWidth / 2;
    const riverRight = riverPos.x + riverWidth / 2;
    const time = Date.now() * 0.001;

    ctx.save();

    // --- Margens de pedra e terra ---
    const bankWidth = 28;
    // Margem esquerda
    const bankGradL = ctx.createLinearGradient(riverLeft - bankWidth, 0, riverLeft, 0);
    bankGradL.addColorStop(0, "#6b8f3c");
    bankGradL.addColorStop(0.5, "#8b7355");
    bankGradL.addColorStop(1, "#6e5c3b");
    ctx.fillStyle = bankGradL;
    ctx.fillRect(riverLeft - bankWidth, mapTopScreen.y, bankWidth, riverHeightScreen);
    // Margem direita
    const bankGradR = ctx.createLinearGradient(riverRight, 0, riverRight + bankWidth, 0);
    bankGradR.addColorStop(0, "#6e5c3b");
    bankGradR.addColorStop(0.5, "#8b7355");
    bankGradR.addColorStop(1, "#6b8f3c");
    ctx.fillStyle = bankGradR;
    ctx.fillRect(riverRight, mapTopScreen.y, bankWidth, riverHeightScreen);

    // --- Água base com gradiente ---
    const waterGrad = ctx.createLinearGradient(riverLeft, 0, riverRight, 0);
    waterGrad.addColorStop(0, "#3498db");
    waterGrad.addColorStop(0.3, "#5dade2");
    waterGrad.addColorStop(0.5, "#85c1e9");
    waterGrad.addColorStop(0.7, "#5dade2");
    waterGrad.addColorStop(1, "#2e86c1");
    ctx.fillStyle = waterGrad;
    ctx.fillRect(riverLeft, mapTopScreen.y, riverWidth, riverHeightScreen);

    // --- Correntes de água animadas (linhas curvas fluindo) ---
    ctx.save();
    ctx.beginPath();
    ctx.rect(riverLeft, mapTopScreen.y, riverWidth, riverHeightScreen);
    ctx.clip();

    // Ondulações principais (correntes largas)
    for (let i = 0; i < 6; i++) {
        const streamX = riverLeft + 25 + i * 35;
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + Math.sin(time + i) * 0.04})`;
        ctx.lineWidth = 2.5 + Math.sin(time * 0.7 + i * 2) * 1;
        ctx.beginPath();
        for (let sy = mapTopScreen.y - 20; sy < mapBottomScreen.y + 20; sy += 6) {
            const wave = Math.sin((sy + time * 80) * 0.015 + i * 1.5) * 18;
            const wave2 = Math.cos((sy + time * 50) * 0.025 + i) * 8;
            if (sy === mapTopScreen.y - 20) {
                ctx.moveTo(streamX + wave + wave2, sy);
            } else {
                ctx.lineTo(streamX + wave + wave2, sy);
            }
        }
        ctx.stroke();
    }

    // Espuma / Reflexos brancos animados
    for (let i = 0; i < 18; i++) {
        const foamSeed = i * 347.7;
        const foamBaseY = ((foamSeed % riverHeightScreen) + mapTopScreen.y + time * 40) % riverHeightScreen + mapTopScreen.y;
        const foamX = riverLeft + 15 + (foamSeed * 1.3) % (riverWidth - 30);
        const foamW = 8 + Math.sin(foamSeed) * 6;
        const foamH = 3 + Math.sin(foamSeed * 0.5) * 2;
        const alpha = 0.15 + Math.sin(time * 2 + foamSeed) * 0.1;

        ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
        ctx.beginPath();
        ctx.ellipse(foamX, foamBaseY, foamW, foamH, Math.sin(foamSeed) * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    // Redemoinhos pequenos
    for (let i = 0; i < 5; i++) {
        const swirlSeed = i * 891.3;
        const swirlY = ((swirlSeed % riverHeightScreen) + mapTopScreen.y + time * 25) % riverHeightScreen + mapTopScreen.y;
        const swirlX = riverLeft + 30 + (swirlSeed * 0.7) % (riverWidth - 60);
        const swirlR = 6 + Math.sin(swirlSeed) * 3;

        ctx.strokeStyle = `rgba(255, 255, 255, ${0.12 + Math.sin(time * 3 + swirlSeed) * 0.06})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let a = 0; a < Math.PI * 3; a += 0.2) {
            const sr = swirlR * (a / (Math.PI * 3));
            const sx = swirlX + Math.cos(a + time * 2) * sr;
            const sy2 = swirlY + Math.sin(a + time * 2) * sr;
            if (a === 0) ctx.moveTo(sx, sy2); else ctx.lineTo(sx, sy2);
        }
        ctx.stroke();
    }

    ctx.restore(); // fim do clip da água

    // --- Pedras nas margens (decorativas) ---
    const rockPositions = [
        { side: 'L', yOff: 0.08 }, { side: 'R', yOff: 0.15 }, { side: 'L', yOff: 0.25 },
        { side: 'R', yOff: 0.35 }, { side: 'L', yOff: 0.45 }, { side: 'R', yOff: 0.55 },
        { side: 'L', yOff: 0.65 }, { side: 'R', yOff: 0.75 }, { side: 'L', yOff: 0.88 },
        { side: 'R', yOff: 0.95 }
    ];
    for (const rp of rockPositions) {
        const ry = mapTopScreen.y + riverHeightScreen * rp.yOff;
        const rx = rp.side === 'L' ? riverLeft - 10 - Math.random() * 6 : riverRight + 4 + Math.random() * 6;
        const rr = 7 + (rp.yOff * 17) % 8;
        // Corpo da pedra
        ctx.fillStyle = "#8a8a7a";
        ctx.beginPath();
        ctx.ellipse(rx, ry, rr, rr * 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        // Brilho
        ctx.fillStyle = "#b0b0a0";
        ctx.beginPath();
        ctx.ellipse(rx - rr * 0.2, ry - rr * 0.2, rr * 0.45, rr * 0.35, -0.3, 0, Math.PI * 2);
        ctx.fill();
    }

    // --- Tufos de grama/junco nas margens ---
    const grassPositions = [
        { side: 'L', yOff: 0.05 }, { side: 'R', yOff: 0.12 }, { side: 'L', yOff: 0.22 },
        { side: 'R', yOff: 0.32 }, { side: 'L', yOff: 0.42 }, { side: 'R', yOff: 0.52 },
        { side: 'L', yOff: 0.62 }, { side: 'R', yOff: 0.72 }, { side: 'L', yOff: 0.82 },
        { side: 'R', yOff: 0.92 }
    ];
    for (const gp of grassPositions) {
        const gy = mapTopScreen.y + riverHeightScreen * gp.yOff;
        const gx = gp.side === 'L' ? riverLeft - bankWidth + 8 : riverRight + bankWidth - 8;
        const sway = Math.sin(time * 1.5 + gp.yOff * 20) * 3;

        ctx.strokeStyle = "#3a7a2a";
        ctx.lineWidth = 2;
        for (let b = -1; b <= 1; b++) {
            ctx.beginPath();
            ctx.moveTo(gx + b * 3, gy + 6);
            ctx.quadraticCurveTo(gx + b * 5 + sway, gy - 10, gx + b * 2 + sway * 1.5, gy - 20);
            ctx.stroke();
        }
        // Junco/tabua (um caule com topo escuro)
        if (Math.abs(gp.yOff - 0.32) < 0.1 || Math.abs(gp.yOff - 0.72) < 0.1) {
            ctx.strokeStyle = "#5a4a2a";
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(gx, gy + 4);
            ctx.quadraticCurveTo(gx + sway * 0.8, gy - 14, gx + sway, gy - 28);
            ctx.stroke();
            ctx.fillStyle = "#4a3a1a";
            ctx.beginPath();
            ctx.ellipse(gx + sway, gy - 28, 3, 6, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // --- PONTE DE MADEIRA ---
    const bridgeY = riverPos.y;
    const bridgeH = 110;
    const bridgeLeft = riverLeft - 20;
    const bridgeRight = riverRight + 20;
    const bridgeMid = riverPos.x;

    if (ponteCompleta) {
        // Ponte completa — tábuas de madeira cobrindo toda a largura
        ctx.fillStyle = "#5c3a21";
        ctx.fillRect(bridgeLeft, bridgeY - bridgeH / 2, bridgeRight - bridgeLeft, bridgeH);

        // Tábuas individuais
        for (let py = bridgeY - bridgeH / 2 + 2; py < bridgeY + bridgeH / 2; py += 14) {
            ctx.fillStyle = (Math.floor((py - bridgeY) * 0.3) % 2 === 0) ? "#6b4427" : "#7a5533";
            ctx.fillRect(bridgeLeft + 4, py, bridgeRight - bridgeLeft - 8, 12);
            ctx.strokeStyle = "#3d2010";
            ctx.lineWidth = 1;
            ctx.strokeRect(bridgeLeft + 4, py, bridgeRight - bridgeLeft - 8, 12);
        }

        // Vigas verticais nas laterais
        ctx.fillStyle = "#4a2a14";
        ctx.fillRect(bridgeLeft, bridgeY - bridgeH / 2 - 6, 12, bridgeH + 12);
        ctx.fillRect(bridgeRight - 12, bridgeY - bridgeH / 2 - 6, 12, bridgeH + 12);

        // Corrimão superior e inferior
        ctx.strokeStyle = "#3d2010";
        ctx.lineWidth = 4;
        ctx.strokeRect(bridgeLeft, bridgeY - bridgeH / 2, bridgeRight - bridgeLeft, bridgeH);

    } else {
        // Ponte quebrada — dois lados com buraco no meio e tábuas flutuando

        const breakGap = 60;
        const leftEnd = bridgeMid - breakGap / 2;
        const rightStart = bridgeMid + breakGap / 2;

        // Lado esquerdo da ponte
        ctx.fillStyle = "#5c3a21";
        ctx.fillRect(bridgeLeft, bridgeY - bridgeH / 2, leftEnd - bridgeLeft, bridgeH);
        for (let py = bridgeY - bridgeH / 2 + 2; py < bridgeY + bridgeH / 2; py += 14) {
            ctx.fillStyle = (Math.floor((py - bridgeY) * 0.3) % 2 === 0) ? "#6b4427" : "#7a5533";
            ctx.fillRect(bridgeLeft + 4, py, leftEnd - bridgeLeft - 6, 12);
            ctx.strokeStyle = "#3d2010";
            ctx.lineWidth = 1;
            ctx.strokeRect(bridgeLeft + 4, py, leftEnd - bridgeLeft - 6, 12);
        }

        // Borda quebrada irregular (lado esquerdo)
        ctx.fillStyle = "#5c3a21";
        for (let py = bridgeY - bridgeH / 2; py < bridgeY + bridgeH / 2; py += 14) {
            const jag = Math.sin(py * 0.5) * 12 + 5;
            ctx.fillRect(leftEnd - 4, py, jag, 14);
        }

        // Lado direito da ponte
        ctx.fillStyle = "#5c3a21";
        ctx.fillRect(rightStart, bridgeY - bridgeH / 2, bridgeRight - rightStart, bridgeH);
        for (let py = bridgeY - bridgeH / 2 + 2; py < bridgeY + bridgeH / 2; py += 14) {
            ctx.fillStyle = (Math.floor((py - bridgeY) * 0.3) % 2 === 0) ? "#6b4427" : "#7a5533";
            ctx.fillRect(rightStart + 2, py, bridgeRight - rightStart - 6, 12);
            ctx.strokeStyle = "#3d2010";
            ctx.lineWidth = 1;
            ctx.strokeRect(rightStart + 2, py, bridgeRight - rightStart - 6, 12);
        }

        // Borda quebrada irregular (lado direito)
        ctx.fillStyle = "#5c3a21";
        for (let py = bridgeY - bridgeH / 2; py < bridgeY + bridgeH / 2; py += 14) {
            const jag = Math.sin(py * 0.7 + 2) * 10 + 4;
            ctx.fillRect(rightStart - jag, py, jag, 14);
        }

        // Vigas verticais laterais
        ctx.fillStyle = "#4a2a14";
        ctx.fillRect(bridgeLeft, bridgeY - bridgeH / 2 - 6, 12, bridgeH + 12);
        ctx.fillRect(bridgeRight - 12, bridgeY - bridgeH / 2 - 6, 12, bridgeH + 12);

        // Postes de suporte superiores (vigas horizontais)
        ctx.fillStyle = "#4a2a14";
        ctx.fillRect(bridgeLeft, bridgeY - bridgeH / 2 - 8, leftEnd - bridgeLeft + 10, 8);
        ctx.fillRect(rightStart - 10, bridgeY - bridgeH / 2 - 8, bridgeRight - rightStart + 10, 8);
        ctx.fillRect(bridgeLeft, bridgeY + bridgeH / 2, leftEnd - bridgeLeft + 10, 8);
        ctx.fillRect(rightStart - 10, bridgeY + bridgeH / 2, bridgeRight - rightStart + 10, 8);

        // Tábuas flutuando na água
        const floatingPlanks = [
            { dx: -15, dy: 8, w: 28, h: 6, rot: 0.3 },
            { dx: 10, dy: -12, w: 22, h: 5, rot: -0.5 },
            { dx: -5, dy: 20, w: 18, h: 5, rot: 0.8 },
        ];
        for (const plank of floatingPlanks) {
            const px = bridgeMid + plank.dx + Math.sin(time * 0.8 + plank.dx) * 5;
            const py = bridgeY + plank.dy + Math.cos(time * 0.6 + plank.dy) * 3;
            ctx.save();
            ctx.translate(px, py);
            ctx.rotate(plank.rot + Math.sin(time + plank.dx) * 0.15);
            ctx.fillStyle = "#5c3a21";
            ctx.fillRect(-plank.w / 2, -plank.h / 2, plank.w, plank.h);
            ctx.strokeStyle = "#3d2010";
            ctx.lineWidth = 1;
            ctx.strokeRect(-plank.w / 2, -plank.h / 2, plank.w, plank.h);
            ctx.restore();
        }
    }

    ctx.restore();

    // ============================================================
    // 3. MURALHA E PORTÃO DO TOPO (DUPLO DESLIZANTE)
    // ============================================================
    ctx.save();

    // Desenho da Muralha Externa
    ctx.strokeStyle = "#3a3d40";
    ctx.lineWidth = 26;
    ctx.strokeRect(topLeft.x, topLeft.y, CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);

    ctx.strokeStyle = "#8d99ae";
    ctx.lineWidth = 18;
    ctx.setLineDash([32, 12]);
    ctx.strokeRect(topLeft.x, topLeft.y, CONFIG.MAP_WIDTH, CONFIG.MAP_HEIGHT);
    ctx.setLineDash([]);

    // Dimensões do Vão do Portão
    const topGateWidth = 220;
    const topGateHeight = 65;
    const topGatePos = worldToScreen(0, -halfH);

    // Grama / Solo sob a passagem
    ctx.fillStyle = "#7fd957";
    ctx.fillRect(topGatePos.x - topGateWidth / 2 - 15, topGatePos.y - 25, topGateWidth + 30, 50);

    // Pilares laterais (Esquerda e Direita)
    const pillarW = 24;
    const pillarH = topGateHeight + 12;
    ctx.fillStyle = "#95a5a6";
    ctx.fillRect(topGatePos.x - topGateWidth / 2 - pillarW, topGatePos.y - topGateHeight / 2 - 6, pillarW, pillarH);
    ctx.fillRect(topGatePos.x + topGateWidth / 2, topGatePos.y - topGateHeight / 2 - 6, pillarW, pillarH);

    ctx.fillStyle = "#7f8c8d";
    ctx.fillRect(topGatePos.x - topGateWidth / 2 - pillarW - 4, topGatePos.y - topGateHeight / 2 - 10, pillarW + 8, 8);
    ctx.fillRect(topGatePos.x + topGateWidth / 2 - 4, topGatePos.y - topGateHeight / 2 - 10, pillarW + 8, 8);

    // Moldura de encaixe das folhas do portão
    ctx.fillStyle = "#2c3e50";
    ctx.fillRect(topGatePos.x - topGateWidth / 2, topGatePos.y - 12, topGateWidth, 24);
    ctx.strokeStyle = "#1a252f";
    ctx.lineWidth = 4;
    ctx.strokeRect(topGatePos.x - topGateWidth / 2, topGatePos.y - 12, topGateWidth, 24);

    // LÓGICA DAS DUAS FOLHAS DO PORTÃO (CADA UMA ABRE PELA METADE)
    const leafWidth = topGateWidth / 2; // Metade da largura total para cada lado
    const leafHeight = 24;
    const slideOffset = portaoTopoAberto ? leafWidth * 0.85 : 0; // Desloca para os lados se estiver aberto

    // --- Folha Esquerda ---
    const leftLeafX = (topGatePos.x - topGateWidth / 2) - slideOffset;
    ctx.fillStyle = "#4a5568";
    ctx.fillRect(leftLeafX, topGatePos.y - 12, leafWidth, leafHeight);
    ctx.strokeStyle = "#1a202c";
    ctx.lineWidth = 3;
    ctx.strokeRect(leftLeafX, topGatePos.y - 12, leafWidth, leafHeight);

    // Grades/Detalhes da Folha Esquerda
    ctx.strokeStyle = "#a0aec0";
    ctx.lineWidth = 3;
    for (let bx = leftLeafX + 10; bx < leftLeafX + leafWidth - 5; bx += 14) {
        ctx.beginPath();
        ctx.moveTo(bx, topGatePos.y - 10);
        ctx.lineTo(bx, topGatePos.y + 10);
        ctx.stroke();
    }

    // --- Folha Direita ---
    const rightLeafX = topGatePos.x + slideOffset;
    ctx.fillStyle = "#4a5568";
    ctx.fillRect(rightLeafX, topGatePos.y - 12, leafWidth, leafHeight);
    ctx.strokeStyle = "#1a202c";
    ctx.lineWidth = 3;
    ctx.strokeRect(rightLeafX, topGatePos.y - 12, leafWidth, leafHeight);

    // Grades/Detalhes da Folha Direita
    ctx.strokeStyle = "#a0aec0";
    ctx.lineWidth = 3;
    for (let bx = rightLeafX + 10; bx < rightLeafX + leafWidth - 5; bx += 14) {
        ctx.beginPath();
        ctx.moveTo(bx, topGatePos.y - 10);
        ctx.lineTo(bx, topGatePos.y + 10);
        ctx.stroke();
    }

    // Indicadores Visuais de Estado e Cadeado no Centro
    if (!portaoTopoAberto) {
        ctx.fillStyle = "#e74c3c";
        ctx.beginPath();
        ctx.arc(topGatePos.x, topGatePos.y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ffffff";
        ctx.font = "12px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("🔒", topGatePos.x, topGatePos.y);

        ctx.fillStyle = "#f39c12";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("PORTÃO TRANCADO (REQUER CHAVE 🔑)", topGatePos.x, topGatePos.y - 30);
    } else {
        ctx.fillStyle = "#2ecc71";
        ctx.font = "bold 13px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("PORTÃO ABERTO 🔓", topGatePos.x, topGatePos.y - 30);
    }

    ctx.restore();
    // ============================================================
    // 4. PLACA DE REQUISITOS (AO LADO DA PONTE)
    // ============================================================
    const plaqueWorldPos = { x: halfW - 60, y: -140 };
    const plaquePos = worldToScreen(plaqueWorldPos.x, plaqueWorldPos.y);

    ctx.save();
    ctx.fillStyle = "#5c3a21";
    ctx.fillRect(plaquePos.x - 4, plaquePos.y, 8, 22);

    ctx.fillStyle = "#8B4513";
    ctx.fillRect(plaquePos.x - 45, plaquePos.y - 30, 90, 32);
    ctx.strokeStyle = "#3d2817";
    ctx.lineWidth = 2;
    ctx.strokeRect(plaquePos.x - 45, plaquePos.y - 30, 90, 32);

    ctx.fillStyle = "#FFFFFF";
    ctx.font = "bold 12px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(ponteCompleta ? "PRONTO! 🪵" : `🪵 ${madeirasDepositadas}/${MADEIRAS_NECESSARIAS}`, plaquePos.x, plaquePos.y - 10);
    ctx.restore();

    for (const r of world.resources) r.draw();
    if (world.base) world.base.draw();
    if (world.craftingTable) world.craftingTable.draw();
    for (const b of world.buildings) b.draw();
    for (const e of world.enemies) e.draw();
    for (const p of world.projectiles) p.draw();
    for (const pt of world.particles) pt.draw();
    if (world.player) world.player.draw();
    for (const ft of world.floatingTexts) ft.draw();

    if (buildMode && selectedBuilding && gameState === GAME_STATE.PLAYING) {
        const previewPos = screenToWorld(mouse.x, mouse.y);
        const config = CRAFTABLE_TYPES[selectedBuilding];
        const isValid = config ? canBuildAt(previewPos.x, previewPos.y, config.radius) : false;

        const ghostBuilding = new Building(previewPos.x, previewPos.y, selectedBuilding);
        ghostBuilding.draw(true, isValid);
    }

    if (timeState === TIME_STATE.NIGHT && world.player && gameState === GAME_STATE.PLAYING) {
        ctx.save();
        const pPos = worldToScreen(world.player.x, world.player.y);
        const lightRadius = 240;

        const grad = ctx.createRadialGradient(pPos.x, pPos.y, 20, pPos.x, pPos.y, lightRadius);
        grad.addColorStop(0, "rgba(5, 8, 20, 0.0)");
        grad.addColorStop(0.5, "rgba(5, 8, 20, 0.7)");
        grad.addColorStop(1, "rgba(5, 8, 20, 0.95)");

        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, screenWidth, screenHeight);
        ctx.restore();
    }

    if (gameState === GAME_STATE.PLAYING) {
        drawHotbar();
    } else if (gameState === GAME_STATE.GAME_OVER) {
        drawGameOverScreen();
    }
}

function updateHUD() {
    const w = document.getElementById("woodText");
    if (w) w.textContent = inventory.wood;
    const s = document.getElementById("stoneText");
    if (s) s.textContent = inventory.stone;
    const b = document.getElementById("berryText");
    if (b) b.textContent = inventory.berries;
    const c = document.getElementById("coalText");
    if (c) c.textContent = inventory.coal;
    const g = document.getElementById("goldText");
    if (g) g.textContent = inventory.gold || 0;
    const str = document.getElementById("stringText");
    if (str) str.textContent = inventory.string || 0;
}

function startGame() {
    gameState = GAME_STATE.PLAYING;
    world.base = new Base(0, 0);
    world.craftingTable = new CraftingTable(110, 0);
    world.player = new Player(0, 130);

    generateResources();
    updateHUD();
    showMessage("Use o Clique Esquerdo perto da Mesa de Criação para fabricar itens!");
}

function gameLoop(timestamp) {
    let dt = (timestamp - lastTimestamp) / 1000;
    lastTimestamp = timestamp;
    dt = Math.min(dt, 0.05);

    updateGame(dt);
    renderGame();
    requestAnimationFrame(gameLoop);
}

function init() {
    canvas = document.getElementById("gameCanvas");
    ctx = canvas.getContext("2d");

    screenWidth = window.innerWidth;
    screenHeight = window.innerHeight;
    canvas.width = screenWidth;
    canvas.height = screenHeight;

    window.addEventListener("resize", () => {
        screenWidth = window.innerWidth;
        screenHeight = window.innerHeight;
        canvas.width = screenWidth;
        canvas.height = screenHeight;
    });

    window.addEventListener("keydown", e => {
        const key = e.key.toLowerCase();
        keys[key] = true;
        
        if (gameState === GAME_STATE.PLAYING) {
            if (key >= "1" && key <= "6") {
                selectedHotbarSlot = parseInt(key) - 1;
            }

            if (key === "escape") {
                buildMode = false;
                closeBuildMenu();
            }
        } else if (gameState === GAME_STATE.GAME_OVER) {
            if (key === "r") {
                restartGame();
            }
        }
    });

    window.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

    canvas.addEventListener("mousemove", e => {
        mouse.x = e.clientX;
        mouse.y = e.clientY;
    });

    canvas.addEventListener("mousedown", e => {
        if (e.button !== 0) return;

        if (gameState === GAME_STATE.PLAYING) {
            if (checkHotbarClick(e.clientX, e.clientY)) return;

            if (buildMode) {
                handleBuildClick();
            } else {
                interact();
            }
        } else if (gameState === GAME_STATE.GAME_OVER) {
            checkGameOverButtonClick(e.clientX, e.clientY);
        }
    });

    lastTimestamp = performance.now();
    requestAnimationFrame(gameLoop);
}

window.onload = init;
window.closeBuildMenu = closeBuildMenu;
window.filterCategory = filterCategory;
window.selectCraftable = selectCraftable;
window.startPlayFromMenu = startPlayFromMenu;
window.openSubModal = openSubModal;
window.closeSubModal = closeSubModal;