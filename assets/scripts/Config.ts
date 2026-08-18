// ============================================================
// 数据定义：按《文字塔防》原型策划需求文档（定版）配置
// 设计分辨率 390×844，所有距离/尺寸与原型像素值 1:1 对应
// ============================================================
import { Prefab, Node } from 'cc';

// ---------- 字体系 ----------

// 独体字（5 个，字根 + 低级塔）
export const SOURCE_CHARS = ['火', '水', '木', '日', '人'];

// 合成配方（11 个，均为两两合成，无三合一）
export const RECIPES: { result: string; parts: string[] }[] = [
    { result: '炎', parts: ['火', '火'] },
    { result: '冰', parts: ['水', '水'] },
    { result: '林', parts: ['木', '木'] },
    { result: '昌', parts: ['日', '日'] },
    { result: '从', parts: ['人', '人'] },
    { result: '炅', parts: ['火', '日'] },
    { result: '伙', parts: ['火', '人'] },
    { result: '沐', parts: ['水', '木'] },
    { result: '沓', parts: ['水', '日'] },
    { result: '杳', parts: ['木', '日'] },
    { result: '休', parts: ['木', '人'] },
];

// 结果字 → 字根（由配方表生成）
export const COMBINE_CHARS: Record<string, string[]> = {};
for (const r of RECIPES) COMBINE_CHARS[r.result] = r.parts;

// 全部合成字
export const COMBINE_LIST = Object.keys(COMBINE_CHARS);

// 字 → 是否独体字
export const isSourceChar = (c: string) => SOURCE_CHARS.includes(c);

// ---------- 独体字占位形状（俄罗斯方块式，[dr,dc] 相对锚点偏移） ----------
export type Shape = [number, number];
export const CHAR_SHAPES: Record<string, Shape[]> = {
    '火': [[0, 0], [0, 1]],            // 2 格（横）
    '水': [[0, 0], [1, 0]],            // 2 格（竖）
    '木': [[0, 0], [0, 1], [1, 0]],    // 3 格（L 形）
    '日': [[0, 0], [0, 1], [1, 0], [1, 1]], // 4 格（2×2）
    '人': [[0, 0], [0, 1], [1, 1]],    // 3 格（L 形镜像）
};

// ---------- 塔属性 ----------
// buffEffect: 0=无 1=中毒dot 2=全图冻结 3=攻速光环 4=减速
export interface TowerStat {
    attack: number;        // 攻击
    attackCd: number;      // 攻击冷却 ms
    attackFar: number;     // 射程
    aim: 'near' | 'far';   // 目标选择：最近/最远
    attackLock: number;    // 锁定目标数
    splash: number;        // 溅射半径（0=无）
    splashReduce: number;  // 溅射伤害百分比
    penetrate: number;     // 穿透额外目标数
    buffEffect: number;
    buffEffectPara: number; // 1:每秒最大生命% 2:冻结ms 3:攻速提升% 4:减速层数
    color: string;
    desc: string;
}

export const TOWER_STATS: Record<string, TowerStat> = {
    // —— 独体字：低级塔 ——
    '火': { attack: 10, attackCd: 500, attackFar: 280, aim: 'near', attackLock: 1, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 0, buffEffectPara: 0, color: '#ff6b6b', desc: '开局保底输出' },
    '水': { attack: 3, attackCd: 1000, attackFar: 200, aim: 'near', attackLock: 1, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 4, buffEffectPara: 1, color: '#42a5f5', desc: '减速' },
    '木': { attack: 5, attackCd: 1500, attackFar: 260, aim: 'far', attackLock: 1, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 1, buffEffectPara: 8, color: '#66bb6a', desc: '中毒' },
    '日': { attack: 5, attackCd: 650, attackFar: 240, aim: 'near', attackLock: 1, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 0, buffEffectPara: 0, color: '#ffd54f', desc: '均衡' },
    '人': { attack: 6, attackCd: 750, attackFar: 200, aim: 'near', attackLock: 1, splash: 0, splashReduce: 100, penetrate: 2, buffEffect: 0, buffEffectPara: 0, color: '#ff8a80', desc: '穿透2' },
    // —— 合成字：高级塔（数值整体高于独体字） ——
    '炎': { attack: 12, attackCd: 800, attackFar: 280, aim: 'near', attackLock: 1, splash: 35, splashReduce: 85, penetrate: 0, buffEffect: 0, buffEffectPara: 0, color: '#ff8a65', desc: '溅射' },
    '冰': { attack: 3, attackCd: 2000, attackFar: 9999, aim: 'far', attackLock: 0, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 2, buffEffectPara: 2000, color: '#29b6f6', desc: '全图冻结' },
    '林': { attack: 10, attackCd: 1200, attackFar: 260, aim: 'far', attackLock: 1, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 1, buffEffectPara: 12, color: '#2e9e44', desc: '强化中毒' },
    '昌': { attack: 8, attackCd: 900, attackFar: 260, aim: 'near', attackLock: 2, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 0, buffEffectPara: 0, color: '#f4d03f', desc: '锁定2' },
    '从': { attack: 8, attackCd: 800, attackFar: 240, aim: 'near', attackLock: 3, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 0, buffEffectPara: 0, color: '#ff6fa5', desc: '锁定3' },
    '炅': { attack: 12, attackCd: 700, attackFar: 280, aim: 'near', attackLock: 2, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 0, buffEffectPara: 0, color: '#ff8c2e', desc: '高攻锁定2' },
    '伙': { attack: 10, attackCd: 800, attackFar: 240, aim: 'near', attackLock: 1, splash: 0, splashReduce: 100, penetrate: 2, buffEffect: 0, buffEffectPara: 0, color: '#ff7d6b', desc: '强化穿透2' },
    '沐': { attack: 0, attackCd: 2000, attackFar: 0, aim: 'near', attackLock: 0, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 3, buffEffectPara: 15, color: '#26a69a', desc: '全塔攻速+15%' },
    '沓': { attack: 7, attackCd: 1300, attackFar: 9999, aim: 'near', attackLock: 1, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 4, buffEffectPara: 2, color: '#6fc0ff', desc: '全图减速' },
    '杳': { attack: 10, attackCd: 1100, attackFar: 350, aim: 'far', attackLock: 1, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 1, buffEffectPara: 12, color: '#b8d060', desc: '超远射程' },
    '休': { attack: 8, attackCd: 1000, attackFar: 240, aim: 'near', attackLock: 1, splash: 0, splashReduce: 100, penetrate: 0, buffEffect: 4, buffEffectPara: 2, color: '#8fd0a0', desc: '强化减速' },
};

// ---------- 塔的固定位置（战场内比例坐标，y 自顶向下） ----------
// 城堡位于 (0.50, 0.79)，塔位散布于城堡四周
export const TOWER_POSITIONS: Record<string, { x: number; y: number }> = {
    '火': { x: 0.32, y: 0.62 },
    '水': { x: 0.68, y: 0.62 },
    '人': { x: 0.50, y: 0.45 },
    '日': { x: 0.50, y: 0.28 },
    '木': { x: 0.32, y: 0.88 },
    '炎': { x: 0.68, y: 0.88 },
    '冰': { x: 0.18, y: 0.72 },
    '林': { x: 0.82, y: 0.72 },
    '昌': { x: 0.18, y: 0.38 },
    '从': { x: 0.82, y: 0.38 },
    '炅': { x: 0.06, y: 0.55 },
    '伙': { x: 0.94, y: 0.55 },
    '沐': { x: 0.06, y: 0.80 },
    '沓': { x: 0.94, y: 0.80 },
    '杳': { x: 0.24, y: 0.94 },
    '休': { x: 0.76, y: 0.94 },
};

// 城堡在战场内的比例位置
export const CASTLE_POS = { x: 0.50, y: 0.79 };

// ---------- 敌人 ----------
export interface EnemyTypeCfg {
    name: string;
    hp: number;
    atk: number;      // 整数
    speed: number;    // 位移/帧(60fps 基准)，运行时 ×60 px/s
    range: number;    // 停止并攻击城堡的距离
    color: string;
    size: number;
    isBoss: boolean;
    attackCd: number;
}

export const ENEMY_TYPES: Record<string, EnemyTypeCfg> = {
    'melee': { name: '近战小怪', hp: 10, atk: 2, speed: 0.8, range: 15, color: '#e57373', size: 8, isBoss: false, attackCd: 2000 },
    'ranged': { name: '远程小怪', hp: 8, atk: 2, speed: 0.6, range: 120, color: '#64b5f6', size: 7, isBoss: false, attackCd: 2000 },
    'boss': { name: 'Boss', hp: 100, atk: 10, speed: 0.5, range: 25, color: '#ff1744', size: 14, isBoss: true, attackCd: 2000 },
};

// 预制体扩展配置：EnemyConfig 组件转出的运行时形状（Boss 可带自定义名字/技能）
export interface EnemyCfgExt extends EnemyTypeCfg {
    bossName?: string;
    bossSkill?: 'splash' | 'pierce' | 'summon';
    prefab?: Prefab;  // 运行时：有预制体则实例化节点渲染（序列帧），否则 Graphics 画
}

// Boss 专属技能（溅射/穿透/召唤），10 个按局数轮换，满一轮循环
export const BOSS_DEFS = [
    { name: '魔', skill: 'splash' as const, color: '#c62828' },
    { name: '兽', skill: 'summon' as const, color: '#6d4c41' },
    { name: '妖', skill: 'pierce' as const, color: '#7b1fa2' },
    { name: '鬼', skill: 'splash' as const, color: '#455a64' },
    { name: '怪', skill: 'summon' as const, color: '#2e7d32' },
    { name: '煞', skill: 'pierce' as const, color: '#37474f' },
    { name: '魅', skill: 'splash' as const, color: '#ad1457' },
    { name: '蛮', skill: 'summon' as const, color: '#4e342e' },
    { name: '傀', skill: 'pierce' as const, color: '#00695c' },
    { name: '罴', skill: 'splash' as const, color: '#bf360c' },
];

let bossRotation = 0;
export function nextBossDef() {
    const d = BOSS_DEFS[bossRotation % BOSS_DEFS.length];
    bossRotation++;
    return d;
}

// ---------- 波次配置（共 5 波，节奏为刷新间隔 ms） ----------
export const WAVE_CONFIG = [
    { enemies: [{ type: 'melee', count: 5 }], delay: 500 },
    { enemies: [{ type: 'melee', count: 5 }, { type: 'ranged', count: 3 }], delay: 400 },
    { enemies: [{ type: 'melee', count: 8 }, { type: 'ranged', count: 5 }], delay: 350 },
    { enemies: [{ type: 'melee', count: 10 }, { type: 'ranged', count: 8 }], delay: 300 },
    { enemies: [{ type: 'melee', count: 12 }, { type: 'ranged', count: 8 }, { type: 'boss', count: 1 }], delay: 250 },
];

export const TOTAL_WAVES = WAVE_CONFIG.length;
export const WAVE_PREP_MS = 10000; // 波次等待总时长约 10 秒

// ---------- 城堡 ----------
export const CASTLE_MAX_HP = 100;

// ---------- 等级与强化 ----------
export const MAX_LEVEL = 4;

// 等级综合输出效率按 2 的幂增长：攻击与攻速各分摊 √2 每级
export function levelMul(level: number) {
    return Math.pow(Math.SQRT2, level - 1);
}

export const ENHANCE_STATS = ['attack', 'attackFar', 'attackCd', 'splash', 'buffEffectPara'];
export const STAT_NAMES: Record<string, string> = {
    attack: '攻击', attackFar: '射程', attackCd: '攻速', splash: '溅射', buffEffectPara: '特效强度',
};

// ---------- 运行时实体 ----------
export interface Item {
    char: string;
    level: number;
}

export interface ForgePiece {
    char: string;
    anchorIdx: number;
    shape: Shape[];
}

export interface SlowState {
    layers: number;   // 减速层数（每层 -30% 移速，最多 2 层）
    until: number;    // 到期时间戳 ms
}

export interface Enemy {
    id: number;
    type: string;
    x: number;
    y: number;
    hp: number;
    maxHp: number;
    atk: number;
    speed: number;
    range: number;
    color: string;
    size: number;
    isBoss: boolean;
    attackCd: number;
    lastAttack: number;
    frozen: number;        // 剩余冻结 ms
    slow: SlowState | null;
    dotDps: number;        // 中毒每秒伤害
    dotUntil: number;
    dotTimer: number;
    // Boss 专属
    bossName?: string;
    bossSkill?: 'splash' | 'pierce' | 'summon';
    summonTimer?: number;
    summonedBy?: number;   // 召唤物标记
    viewNode?: Node;       // 运行时：序列帧渲染节点（无则 Graphics 画）
}

export interface Projectile {
    x: number;
    y: number;
    target: Enemy;
    damage: number;
    splash: number;
    splashReduce: number;
    color: string;
    speed: number;
    buffEffect: number;
    buffEffectPara: number;
}

export interface Particle {
    x: number;
    y: number;
    vx: number;
    vy: number;
    color: string;
    life: number;
    maxLife: number;
    size: number;
}

export interface Floater {
    x: number;
    y: number;
    text: string;
    color: string;
    life: number;
    maxLife: number;
    node: any; // Label 节点，由 BattleView 管理
}

export interface ComboResult {
    char: string;
    pieces: ForgePiece[];
    roots: string[];
}

export interface ChooseOption {
    type: 'heal' | 'char' | 'global';
    title: string;
    desc: string;
    stat?: string;
    heal?: number;      // type=heal：恢复生命值
    char?: string;      // type=char：被强化的塔
    mult?: number;      // 数值倍率（>1 增强；攻速冷却 <1 更快）
    cdMult?: number;    // type=global：攻速冷却倍率
}

// ---------- 全局状态 ----------
export const G = {
    scene: 'home' as 'home' | 'battle',
    wave: 0,
    waveActive: false,
    castleHP: CASTLE_MAX_HP,
    castleMaxHP: CASTLE_MAX_HP,
    items: [] as Item[],
    forgeGrid: new Array<string | null>(25).fill(null),
    forgePieces: [] as ForgePiece[],
    forgeResults: [] as ComboResult[],
    chooseOptions: [] as ChooseOption[],
    enemies: [] as Enemy[],
    placed: {} as Record<string, { level: number }>,
    enhanceChar: {} as Record<string, Record<string, number>>,
    enhanceGlobal: {} as Record<string, number>,
    projectiles: [] as Projectile[],
    particles: [] as Particle[],
    paused: false,
    gameOver: false,
    towerCooldowns: {} as Record<string, number>,
    spawnQueue: [] as { type: string | EnemyCfgExt; delay: number }[],
    spawnTimer: 0,
    wavePreDelay: 0,
    bossDef: nextBossDef(),
    // 城堡配置保留参数（原型为 0）
    damageReduce: 0,
    bloodRegen: 0,
};

export function resetStateForBattle() {
    G.wave = 0;
    G.castleHP = CASTLE_MAX_HP;
    G.castleMaxHP = CASTLE_MAX_HP;
    G.items = [];
    G.placed = {};
    G.enemies = [];
    G.projectiles = [];
    G.particles = [];
    G.gameOver = false;
    G.paused = false;
    G.towerCooldowns = {};
    G.enhanceChar = {};
    G.enhanceGlobal = {};
    G.damageReduce = 0;
    G.bloodRegen = 0;
    G.spawnQueue = [];
    G.spawnTimer = 0;
    G.waveActive = false;
    G.wavePreDelay = 0;
    G.forgeGrid = new Array<string | null>(25).fill(null);
    G.forgePieces = [];
    G.forgeResults = [];
    G.chooseOptions = [];
    G.bossDef = nextBossDef();
}

// ---------- 强化 ----------
export function applyEnhanceChar(char: string, stat: string, mult: number) {
    if (!G.enhanceChar[char]) G.enhanceChar[char] = {};
    G.enhanceChar[char][stat] = (G.enhanceChar[char][stat] || 1) * mult;
}

export function applyEnhanceGlobal(stat: string, mult: number) {
    G.enhanceGlobal[stat] = (G.enhanceGlobal[stat] || 1) * mult;
}

// 塔有效属性（等级 ×2^((lv-1)) 输出效率分摊到攻击/攻速；强化按倍率相乘）
export function getTowerEffectiveStat(towerChar: string, statName: string): number {
    const base = TOWER_STATS[towerChar];
    if (!base) return 0;
    const placed = G.placed[towerChar];
    const level = (placed && placed.level) || 1;
    const lvMul = levelMul(level);
    const cMult = (G.enhanceChar[towerChar] && G.enhanceChar[towerChar][statName]) || 1;
    const gMult = (G.enhanceGlobal[statName]) || 1;
    const mult = cMult * gMult;

    if (statName === 'attack') return Math.max(0, Math.round(base.attack * lvMul * mult));
    if (statName === 'attackFar') return Math.round(base.attackFar * mult);
    if (statName === 'splash') return Math.round(base.splash * mult);
    if (statName === 'buffEffectPara') return Math.round(base.buffEffectPara * mult);
    if (statName === 'attackCd') {
        let cd = base.attackCd / lvMul;
        // 沐光环：全塔攻速 +15% × 沐等级（冷却缩短）
        if (G.placed['沐']) cd /= (1 + 0.15 * G.placed['沐'].level);
        return Math.max(200, cd * mult);
    }
    return (base as any)[statName] || 0;
}

// ---------- 工具 ----------
export function shuffle<T>(arr: T[]) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
}

// 随机生成 n 个独体字
export function randomSourceChars(n: number): string[] {
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
        out.push(SOURCE_CHARS[Math.floor(Math.random() * SOURCE_CHARS.length)]);
    }
    return out;
}

// 开局 5 个随机独体字（至少 1 个火塔）
export function openingChars(): string[] {
    const chars = ['火'];
    for (let i = 0; i < 4; i++) {
        chars.push(SOURCE_CHARS[Math.floor(Math.random() * SOURCE_CHARS.length)]);
    }
    shuffle(chars);
    return chars;
}
