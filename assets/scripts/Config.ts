// ============================================================
// 数据定义：按《文字塔防》原型策划需求文档（定版）配置
// 设计分辨率 390×844，所有距离/尺寸与原型像素值 1:1 对应
// ============================================================
import { Prefab, Node, sys } from 'cc';

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

// ---------- 关卡表（数据源：策划 stage.xlsx，新增关卡在 STAGE_ROWS 加行） ----------
// ---------- 怪物数值表（数据源：策划 monster.xlsx，monsterId = type×100 + level） ----------
export interface MonsterStats {
    monsterId: number;    // type*100+level
    type: number;         // 201/202/204/205 小怪；211-220 Boss
    level: number;        // 1-100（battleLevel 按波次取）
    name: string;         // 备注
    isBoss: boolean;
    attack: number;       // 攻击力
    attackFar: number;    // 攻击范围（像素，与逻辑坐标 1:1）
    attackCd: number;     // 攻击冷却 ms
    blood: number;        // 血量
    speed: number;        // 移动速度（运行时 ×60 px/s）
    buffTarget?: string;  // 已导入未生效（仅日志）
    buffEffect?: number;  // 已导入未生效（仅日志）
    buffEffectPara?: number;
}

const monsterDB = new Map<number, MonsterStats>();
const monsterWarned = new Set<number>();

// 注册怪物数值行（编辑器 MonsterRow / 后续批量导入）
export function registerMonsters(list: MonsterStats[]) {
    for (const m of list) monsterDB.set(m.monsterId, m);
}

export function monsterRowCount(): number {
    return monsterDB.size;
}

// 查 (类型, 等级)：精确 → 同类型就近向下取（告警一次）→ null（调用方走内置兜底）
export function getMonsterStats(type: number, level: number): MonsterStats | null {
    const exact = monsterDB.get(type * 100 + level);
    if (exact) return exact;
    let best: MonsterStats | null = null;
    for (const m of monsterDB.values()) {
        if (m.type !== type || m.level > level) continue;
        if (!best || m.level > best.level) best = m;
    }
    if (best && !monsterWarned.has(type * 100 + level)) {
        monsterWarned.add(type * 100 + level);
        console.warn(`[monster] 类型${type} Lv${level} 无精确行，就近取 Lv${best.level}（${best.name}）`);
    }
    return best;
}

// 类型是否为 Boss（按数值表任一行判断）
export function monsterTypeIsBoss(type: number): boolean {
    for (const m of monsterDB.values()) if (m.type === type && m.isBoss) return true;
    return false;
}

// 数值表缺该类型时的内置兜底键（旧表 203 已清理）
export const LEGACY_BY_TYPE: Record<number, string> = { 201: 'melee', 202: 'ranged' };

// 怪物等级 → hp/atk 倍率（仅内置兜底路径使用；数值表路径用精确行）
export const MONSTER_LEVEL_MUL: Record<number, number> = { 1: 1, 2: 1.5, 3: 2.25, 4: 3.4 };

// 小怪池/Boss 引用条目：type 查数值表；prefab 仅外观（数值不读预制体）
export interface PoolEntry {
    type: number;
    prefab?: Prefab | null;
}

// 预制体名 → 池条目（编辑器注册；表格 monsterType/boss 列可直接写预制体名）
const enemyPrefabByName = new Map<string, PoolEntry>();
export function registerEnemyPrefab(name: string, entry: PoolEntry) {
    if (name) enemyPrefabByName.set(name, entry);
}

// 表格条目解析：数字 → 类型 id；名称 → 预制体注册表
function resolvePoolToken(token: string): PoolEntry | null {
    if (/^\d+$/.test(token)) return { type: parseInt(token, 10) };
    return enemyPrefabByName.get(token) || null;
}

export interface StageCfg {
    stageId: number;
    note: string;
    totalWaves: number;
    waveLevels: { wave: number; level: number }[];   // battleLevel：波次,等级（小怪与 Boss 共用）
    monsterTypes: PoolEntry[];                       // monsterType：本关小怪池
    bossWaves: { wave: number; type: number; prefab?: Prefab | null }[]; // boss：波次,类型
    monsterNum: [number, number];                    // 单次生成数量区间
    monsterCd: [number, number];                     // 两次生成间隔区间 ms
    spawnDurationMs: number;                         // time[0]：每波小怪刷新持续时长
    bossAtMs: number;                                // time[1]：boss 刷新时刻（相对波开始）
}

const STAGE_ROWS: {
    stageId: number; note: string; battleLevel: string; monsterType: string;
    boss: string; monsterNum: string; monsterCd: string; time: string;
}[] = [
    {
        stageId: 30001, note: '第1关，5波（引导关，无boss）',
        battleLevel: '1,1;2,4;3,7;4,10;5,13',
        monsterType: '201',
        boss: '',
        monsterNum: '2,3',
        monsterCd: '1000,2000',
        time: '30',
    },
    {
        stageId: 30002, note: '第2关，5波',
        battleLevel: '1,4;2,7;3,10;4,13;5,16',
        monsterType: '201',
        boss: '5,211',
        monsterNum: '2,3',
        monsterCd: '990,1980',
        time: '30,15',
    },
    {
        stageId: 30003, note: '第3关，5波',
        battleLevel: '1,7;2,10;3,13;4,16;5,19',
        monsterType: '201',
        boss: '5,212',
        monsterNum: '2,3',
        monsterCd: '980,1960',
        time: '30,15',
    },
];

// "1,1;2,1;4,2,5,2" → [[1,1],[2,1],[4,2],[5,2]]；逗号/分号（含全角）混用容错，两两配对
function parsePairs(raw: string): [number, number][] {
    const nums = raw.split(/[;,，；]/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
    const out: [number, number][] = [];
    for (let i = 0; i + 1 < nums.length; i += 2) out.push([nums[i], nums[i + 1]]);
    return out;
}

function parseNums(raw: string): number[] {
    return raw.split(/[;,，；]/).map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

// 按分隔符拆出字符串条目（怪物类型/boss 支持数字 id 或预制体名）
function parseTokens(raw: string): string[] {
    return raw.split(/[;,，；\s]/).map(s => s.trim()).filter(s => s.length > 0);
}

function rowToStage(row: typeof STAGE_ROWS[number]): StageCfg {
    const pairs = parsePairs(row.battleLevel);
    const nums = parseNums(row.monsterNum);
    const cds = parseNums(row.monsterCd);
    const times = parseNums(row.time);
    return {
        stageId: row.stageId,
        note: row.note,
        waveLevels: pairs.map(([wave, level]) => ({ wave, level })),
        totalWaves: pairs.length,
        monsterTypes: parseTokens(row.monsterType)
            .map(t => resolvePoolToken(t))
            .filter((t): t is PoolEntry => !!t && !monsterTypeIsBoss(t.type)),
        bossWaves: parsePairs(row.boss).map(([wave, type]) => ({ wave, type })),
        monsterNum: [nums[0] || 1, Math.max(nums[0] || 1, nums[1] || nums[0] || 1)],
        monsterCd: [cds[0] || 1000, Math.max(cds[0] || 1000, cds[1] || cds[0] || 1000)],
        spawnDurationMs: (times[0] || 30) * 1000,
        bossAtMs: (times[1] || 15) * 1000,
    };
}

// 内置关卡表（策划 stage.xlsx 首版数据；编辑器配置非空时被覆盖）
const STAGES: StageCfg[] = STAGE_ROWS.map(rowToStage);

// 运行时关卡表（编辑器 StageConfig 注册后替换内置表）
let stageTable: StageCfg[] = STAGES;

// 注册编辑器配置的关卡（非空时完全替换内置表）
export function registerStages(list: StageCfg[]) {
    if (list.length > 0) stageTable = list;
}

export function allStages(): readonly StageCfg[] {
    return stageTable;
}

export function getStage(stageId: number): StageCfg | null {
    return stageTable.find(s => s.stageId === stageId) || null;
}

export function firstStageId(): number {
    return stageTable.length > 0 ? stageTable[0].stageId : 30001;
}

// 关卡进度（sys.localStorage 三端通用，后期可换云端存档）
const PROGRESS_KEY = 'wztd_progress_v1';

export function loadProgress(): number { // 已通关的最高 stageId（0 = 一关未通）
    const raw = sys.localStorage.getItem(PROGRESS_KEY);
    const n = raw ? parseInt(raw, 10) : 0;
    return isNaN(n) ? 0 : n;
}

export function saveStageCleared(stageId: number) {
    const cur = loadProgress();
    if (stageId > cur) {
        sys.localStorage.setItem(PROGRESS_KEY, String(stageId));
    }
}

// 下一个关卡 id（按关卡表顺序；已过最后一关返回 null）
export function nextStageId(stageId: number): number | null {
    const idx = stageTable.findIndex(s => s.stageId === stageId);
    if (idx < 0 || idx + 1 >= stageTable.length) return null;
    return stageTable[idx + 1].stageId;
}

// 最新可进关卡：已通关关的下一关；未通关过则第一关
export function unlockedStageId(): number {
    const cleared = loadProgress();
    if (!cleared) return firstStageId();
    return nextStageId(cleared) ?? cleared;
}

export function stageTotalWaves(stageId: number): number {
    return getStage(stageId)?.totalWaves || 5;
}

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
    level: number;
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
    stageId: 30001,
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
    // 波次运行时（stage 表驱动）
    wavePreDelay: 0,
    waveStartAt: 0,
    waveNextSpawnAt: 0,
    waveBossSpawned: false,
    bossDef: nextBossDef(),
    // 城堡配置保留参数（原型为 0）
    damageReduce: 0,
    bloodRegen: 0,
};

export function resetStateForBattle() {
    G.wave = 0;
    G.stageId = unlockedStageId();
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
    G.waveActive = false;
    G.wavePreDelay = 0;
    G.waveStartAt = 0;
    G.waveNextSpawnAt = 0;
    G.waveBossSpawned = false;
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

// [min, max] 闭区间随机整数
export function randInt(min: number, max: number): number {
    return min + Math.floor(Math.random() * (max - min + 1));
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
