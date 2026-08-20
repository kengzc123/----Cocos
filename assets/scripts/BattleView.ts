// ============================================================
// 战场模块：波次刷新 / 敌人 AI / 塔攻击 / 弹道与特效 / Boss 技能
// 战场区域 390×650，位于根节点 y+45（占 y -280..+370）
// 城堡位于战场内比例 (0.50, 0.79)，塔位散布四周
// ============================================================
import { Node, Graphics, Label, UITransform, Vec3, EventTouch, Layers, Prefab, instantiate } from 'cc';
import {
    G, TOWER_STATS, TOWER_POSITIONS, CASTLE_POS, ENEMY_TYPES,
    getTowerEffectiveStat, Enemy, Projectile, Particle,
    WAVE_PREP_MS, getStage, randInt, MONSTER_LEVEL_MUL,
    getMonsterStats, LEGACY_BY_TYPE, PoolEntry, MonsterStats,
} from './Config';
import { hexColor, makeNode, makeLabel, touchLocal } from './Theme';

export const BATTLE = {
    w: 390,
    h: 650,
    x: 0,
    y: 45,
};

export interface Beam {
    x1: number; y1: number; x2: number; y2: number;
    color: string;
    life: number;
}

export interface Ring {
    x: number; y: number;
    maxR: number;
    color: string;
    life: number;
}

export interface FloaterNode {
    node: Node;
    vy: number;
    life: number;
    maxLife: number;
}

export interface BattleApp {
    onTowerClick(char: string): void;
    onMapDragStart(char: string, e: EventTouch): void;
    onMapDragMove(e: EventTouch): void;
    onMapDragEnd(char: string, e: EventTouch): void;
    /** 字塔的序列帧预制体；null = 无，用代码绘制 */
    getTowerPrefab(char: string): Prefab | null;
    onWaveClear(): void;
    onLose(): void;
    onWaveChanged(): void;
    showTip(text: string, cls: 'error' | 'ok' | ''): void;
}

let enemyIdSeed = 1;

// 数值表类型 → 绘制色（Boss 用本局轮换 Boss 配色；敌人情报面板复用）
export const TABLE_TYPE_COLOR: Record<number, string> = {
    201: '#e57373', 202: '#64b5f6', 204: '#ba68c8', 205: '#ffb74d',
};
// buff 已导入未生效：每行只记一次日志
const buffLogged = new Set<number>();
// 数值表缺类型回退内置：每 (类型,等级) 只告警一次
const legacyWarned = new Set<number>();

export class BattleView {
    node: Node;
    private g: Graphics;
    private app: BattleApp;
    private towerLabelRoot: Node;
    private floaterRoot: Node;
    private castleLabel: Label;
    private castleHpLabel: Label;
    private waveInfoLabel: Label;
    private tipLabel: Label;
    private tipTimer = 0;
    private beams: Beam[] = [];
    private rings: Ring[] = [];
    private floaters: FloaterNode[] = [];
    private castleFlash = 0;
    // 内部游戏时钟（原生平台不保证 performance 可用）
    private timeMs = 0;

    constructor(parent: Node, app: BattleApp) {
        this.app = app;
        this.node = makeNode('battle-area', BATTLE.w, BATTLE.h);
        this.node.setParent(parent);
        this.node.setPosition(BATTLE.x, BATTLE.y);

        // 背景层
        const bg = makeNode('bg');
        bg.setParent(this.node);
        this.drawBackground(bg.addComponent(Graphics));

        // 动态绘制层
        const dyn = makeNode('dyn');
        dyn.setParent(this.node);
        this.g = dyn.addComponent(Graphics);

        // 塔文字层
        this.towerLabelRoot = makeNode('tower-labels');
        this.towerLabelRoot.setParent(this.node);

        // 飘字层
        this.floaterRoot = makeNode('floaters');
        this.floaterRoot.setParent(this.node);

        // 城堡文字
        const cp = this.castlePos();
        this.castleLabel = makeLabel(this.node, '堡', 20, '#ffffff');
        this.castleLabel.node.setPosition(cp.x, cp.y - 4);
        this.castleHpLabel = makeLabel(this.node, '100', 10, '#ffffff', false);
        this.castleHpLabel.node.setPosition(cp.x, cp.y + 22);

        // 波次倒计时
        this.waveInfoLabel = makeLabel(this.node, '', 18, '#ffffff');
        this.waveInfoLabel.node.setPosition(0, BATTLE.h / 2 - 26);
        this.waveInfoLabel.node.active = false;

        // 战场提示
        this.tipLabel = makeLabel(this.node, '', 12, '#ffffff', false);
        this.tipLabel.node.setPosition(0, BATTLE.h / 2 - 56);
        this.tipLabel.node.active = false;

        // 战场塔触摸：拖拽（合并/收回）/ 点击（收回）
        let dragChar: string | null = null;
        let dragging = false;
        let startUi = { x: 0, y: 0 };
        this.node.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
            const hit = this.towerHitAt(e);
            if (hit) {
                dragChar = hit;
                dragging = false;
                const ui = e.getUILocation();
                startUi.x = ui.x;
                startUi.y = ui.y;
            }
        });
        this.node.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
            if (!dragChar) return;
            if (!dragging) {
                const ui = e.getUILocation();
                if (Math.hypot(ui.x - startUi.x, ui.y - startUi.y) > 10) {
                    dragging = true;
                    this.app.onMapDragStart(dragChar, e);
                }
            } else {
                this.app.onMapDragMove(e);
            }
        });
        this.node.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            const c = dragChar;
            const wasDrag = dragging;
            dragChar = null;
            dragging = false;
            if (wasDrag) {
                this.app.onMapDragEnd(c!, e);
                return;
            }
            // 轻点：命中塔则收回
            const hit = this.towerHitAt(e);
            if (hit) this.app.onTowerClick(hit);
        });
        this.node.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => {
            const c = dragChar;
            const wasDrag = dragging;
            dragChar = null;
            dragging = false;
            // 拖出战场范围松手：按正常放置处理
            if (wasDrag) this.app.onMapDragEnd(c!, e);
        });
    }

    // ---------- 坐标 ----------
    castlePos(): { x: number; y: number } {
        return {
            x: -BATTLE.w / 2 + BATTLE.w * CASTLE_POS.x,
            y: BATTLE.h / 2 - BATTLE.h * CASTLE_POS.y,
        };
    }

    towerWorldPos(char: string): { x: number; y: number } {
        const p = TOWER_POSITIONS[char];
        return {
            x: -BATTLE.w / 2 + BATTLE.w * p.x,
            y: BATTLE.h / 2 - BATTLE.h * p.y,
        };
    }

    towerHitAt(e: EventTouch): string | null {
        if (!this.node.active) return null;
        const local = this.toLocal(e);
        let best: string | null = null;
        let bestD = 30;
        for (const char of Object.keys(G.placed)) {
            const pos = this.towerWorldPos(char);
            const d = Math.hypot(local.x - pos.x, local.y - pos.y);
            if (d < bestD) { bestD = d; best = char; }
        }
        return best;
    }

    toLocal(e: EventTouch): Vec3 {
        return touchLocal(e, this.node);
    }

    // 触摸点是否在战场内（部署判定）
    containsTouch(e: EventTouch): boolean {
        const local = this.toLocal(e);
        return Math.abs(local.x) <= BATTLE.w / 2 && Math.abs(local.y) <= BATTLE.h / 2;
    }

    private drawBackground(g: Graphics) {
        // 战场底色
        g.fillColor = hexColor('#101522');
        g.rect(-BATTLE.w / 2, -BATTLE.h / 2, BATTLE.w, BATTLE.h);
        g.fill();
        // 网格
        g.strokeColor = hexColor('#1b2236');
        g.lineWidth = 0.5;
        const gridSize = 40;
        for (let x = -BATTLE.w / 2 + gridSize; x < BATTLE.w / 2; x += gridSize) {
            g.moveTo(x, -BATTLE.h / 2);
            g.lineTo(x, BATTLE.h / 2);
        }
        for (let y = -BATTLE.h / 2 + gridSize; y < BATTLE.h / 2; y += gridSize) {
            g.moveTo(-BATTLE.w / 2, y);
            g.lineTo(BATTLE.w / 2, y);
        }
        g.stroke();
        // 塔位虚线圈（提示可部署位置）
        g.strokeColor = hexColor('#3a4666', 130);
        g.lineWidth = 1;
        for (const char of Object.keys(TOWER_POSITIONS)) {
            const p = this.towerWorldPos(char);
            g.circle(p.x, p.y, 14);
            g.stroke();
        }
    }

    // ---------- 波次（关卡表驱动：stage.xlsx） ----------
    startWave() {
        const stage = getStage(G.stageId);
        if (!stage) {
            this.app.showTip(`关卡 ${G.stageId} 未配置`, 'error');
            return;
        }
        G.waveActive = true;
        G.wavePreDelay = WAVE_PREP_MS;
        // 波计时在准备倒计时结束时启动（见 update）
        G.waveStartAt = 0;
        G.waveNextSpawnAt = 0;
        G.waveBossSpawned = false;
        this.app.onWaveChanged();
    }

    // 本波怪物等级（battleLevel 表参数 2）
    private waveLevel(): number {
        const stage = getStage(G.stageId);
        if (!stage) return 1;
        const e = stage.waveLevels.find(w => w.wave === G.wave + 1);
        return e ? e.level : 1;
    }

    startNextWave() {
        G.wave++;
        G.enemies = [];
        G.projectiles = [];
        G.particles = [];
        this.startWave();
    }

    // 刷怪：数值查怪物数值表 (type, level)；表缺该类型时回退内置 ENEMY_TYPES × 等级倍率
    private spawnEnemy(entry: PoolEntry, atX?: number, atY?: number, summonedBy?: number, level = 1, asBoss = false) {
        const stats = getMonsterStats(entry.type, level);
        let hp: number, atk: number, speed: number, range: number, isBoss: boolean, attackCd: number;
        if (stats) {
            hp = Math.max(1, stats.blood);
            atk = Math.max(1, stats.attack);
            speed = stats.speed;
            range = stats.attackFar;   // 像素，与战场逻辑坐标 1:1
            isBoss = stats.isBoss || asBoss;
            attackCd = Math.max(200, stats.attackCd);
            if ((stats.buffTarget || stats.buffEffect) && !buffLogged.has(stats.monsterId)) {
                buffLogged.add(stats.monsterId);
                console.log(`[buff] 未生效 type=${stats.type} lv=${stats.level} target=${stats.buffTarget} effect=${stats.buffEffect} para=${stats.buffEffectPara}`);
            }
        } else {
            const key = asBoss ? 'boss' : (LEGACY_BY_TYPE[entry.type] || 'melee');
            const base = ENEMY_TYPES[key];
            const mul = MONSTER_LEVEL_MUL[Math.min(Math.max(level, 1), 4)] || 1;
            hp = Math.max(1, Math.round(base.hp * mul));
            atk = Math.max(1, Math.round(base.atk * mul));
            speed = base.speed;
            range = base.range;
            isBoss = base.isBoss;
            attackCd = base.attackCd;
            if (!legacyWarned.has(entry.type * 100 + level)) {
                legacyWarned.add(entry.type * 100 + level);
                console.warn(`[monster] 数值表缺 类型${entry.type} Lv${level}，回退内置 ${key}×${mul}`);
            }
        }
        const margin = 18;
        let x = 0, y = 0;
        if (atX !== undefined && atY !== undefined) {
            x = atX; y = atY;
        } else {
            const edge = Math.floor(Math.random() * 4);
            switch (edge) {
                case 0: x = -BATTLE.w / 2 + margin + Math.random() * (BATTLE.w - 2 * margin); y = BATTLE.h / 2 - margin; break;
                case 1: x = BATTLE.w / 2 - margin; y = -BATTLE.h / 2 + margin + Math.random() * (BATTLE.h - 2 * margin); break;
                case 2: x = -BATTLE.w / 2 + margin + Math.random() * (BATTLE.w - 2 * margin); y = -BATTLE.h / 2 + margin; break;
                default: x = -BATTLE.w / 2 + margin; y = -BATTLE.h / 2 + margin + Math.random() * (BATTLE.h - 2 * margin); break;
            }
        }
        const e: Enemy = {
            id: enemyIdSeed++,
            type: String(entry.type),
            level,
            x, y,
            hp,
            maxHp: hp,
            atk,
            speed,
            range,
            color: isBoss ? G.bossDef.color : (TABLE_TYPE_COLOR[entry.type] || '#e57373'),
            size: isBoss ? 14 : 8,
            isBoss,
            attackCd,
            lastAttack: 0,
            frozen: 0,
            slow: null,
            dotDps: 0,
            dotUntil: 0,
            dotTimer: 0,
            summonedBy,
        };
        if (isBoss) {
            e.bossName = G.bossDef.name;
            e.bossSkill = G.bossDef.skill;
            e.summonTimer = 0;
        }
        // 外观渲染：有预制体则实例化（Animation PlayOnLoad 自动播放）；无则显示数值表名字（如 小近战怪 Lv1）
        if (entry.prefab) {
            const n = instantiate(entry.prefab);
            n.layer = Layers.Enum.UI_2D;
            n.setParent(this.node);
            n.setPosition(x, y);
            e.viewNode = n;
        } else {
            const n = new Node('enemy-label');
            n.layer = Layers.Enum.UI_2D;
            n.setParent(this.node);
            n.addComponent(UITransform);
            const lb = n.addComponent(Label);
            lb.string = stats ? stats.name : `类型${entry.type} Lv${level}`;
            lb.fontSize = isBoss ? 12 : 10;
            lb.lineHeight = (isBoss ? 12 : 10) + 2;
            lb.isBold = true;
            lb.color = hexColor(e.color);
            n.setPosition(x, y);
            e.viewNode = n;
        }
        G.enemies.push(e);
    }

    // ---------- 提示 ----------
    showTip(text: string, cls: 'error' | 'ok' | '') {
        this.tipLabel.string = text;
        this.tipLabel.color = hexColor(cls === 'error' ? '#ffb4b4' : cls === 'ok' ? '#a5f3a5' : '#ffffff');
        this.tipLabel.node.active = true;
        this.tipTimer = 1500;
    }

    // ---------- 主更新（dtMs 毫秒） ----------
    update(dtMs: number) {
        this.timeMs += dtMs;
        if (this.tipTimer > 0) {
            this.tipTimer -= dtMs;
            if (this.tipTimer <= 0) this.tipLabel.node.active = false;
        }
        if (this.castleFlash > 0) this.castleFlash -= dtMs;

        // 波次等待倒计时（约 10 秒准备时间），结束时启动本波计时
        if (G.waveActive && G.wavePreDelay > 0) {
            G.wavePreDelay -= dtMs;
            if (G.wavePreDelay > 0) return;
            G.wavePreDelay = 0;
            G.waveStartAt = this.timeMs;
            G.waveNextSpawnAt = this.timeMs;
        }

        // 关卡表驱动：刷新期内按随机间隔/数量从小怪池刷怪，到点插入 Boss
        if (G.waveActive && G.wavePreDelay <= 0) {
            const stage = getStage(G.stageId);
            if (stage) {
                const elapsed = this.timeMs - G.waveStartAt;
                const waveNo = G.wave + 1;
                const lv = this.waveLevel();
                if (elapsed < stage.spawnDurationMs && this.timeMs >= G.waveNextSpawnAt) {
                    const count = randInt(stage.monsterNum[0], stage.monsterNum[1]);
                    for (let i = 0; i < count && stage.monsterTypes.length > 0; i++) {
                        const type = stage.monsterTypes[Math.floor(Math.random() * stage.monsterTypes.length)];
                        this.spawnEnemy(type, undefined, undefined, undefined, lv);
                    }
                    G.waveNextSpawnAt = this.timeMs + randInt(stage.monsterCd[0], stage.monsterCd[1]);
                }
                const bossCfg = stage.bossWaves.find(b => b.wave === waveNo);
                if (bossCfg && !G.waveBossSpawned && elapsed >= stage.bossAtMs) {
                    G.waveBossSpawned = true;
                    this.spawnEnemy(bossCfg, undefined, undefined, undefined, lv, true);
                    const b = G.enemies[G.enemies.length - 1];
                    this.rings.push({ x: b.x, y: b.y, maxR: 60, color: '#ffe082', life: 400 });
                    this.addFloater(b.x, b.y + b.size + 10, (b.bossName || 'BOSS') + ' 出现', '#ffe082');
                }
            }
        }

        const now = this.timeMs;

        // 敌人更新
        const cp = this.castlePos();
        for (const enemy of G.enemies) {
            if (enemy.hp <= 0) continue;
            // 冻结：移动与攻击全部停止
            if (enemy.frozen > 0) {
                enemy.frozen -= dtMs;
                if (enemy.frozen < 0) enemy.frozen = 0;
                continue;
            }
            // 中毒
            if (enemy.dotDps > 0 && now < enemy.dotUntil) {
                enemy.dotTimer += dtMs;
                if (enemy.dotTimer >= 800) {
                    enemy.dotTimer = 0;
                    const dmg = Math.max(1, Math.round(enemy.dotDps * 0.8));
                    enemy.hp -= dmg;
                    this.addFloater(enemy.x, enemy.y + enemy.size + 4, '-' + dmg, '#7ce87c');
                }
            }
            // 移动 / 攻击城堡
            const dx = cp.x - enemy.x;
            const dy = cp.y - enemy.y;
            const dist = Math.hypot(dx, dy);
            if (dist > enemy.range + 14) {
                let factor = 1;
                if (enemy.slow && now < enemy.slow.until) {
                    factor = Math.max(0.4, 1 - 0.3 * enemy.slow.layers);
                } else {
                    enemy.slow = null;
                }
                const v = enemy.speed * 60 * factor * (dtMs / 1000);
                enemy.x += (dx / dist) * v;
                enemy.y += (dy / dist) * v;
            } else if (now - enemy.lastAttack > enemy.attackCd) {
                enemy.lastAttack = now;
                const dmg = Math.max(1, Math.round(enemy.atk * (1 - (G.damageReduce || 0) / 100)));
                G.castleHP -= dmg;
                this.castleFlash = 200;
                this.addParticle(cp.x, cp.y + 10, '#ff4444', 3);
                this.addFloater(cp.x + (Math.random() - 0.5) * 30, cp.y + 30, '-' + dmg, '#ff6b6b');
                if (enemy.isBoss && enemy.bossSkill === 'splash') {
                    this.rings.push({ x: cp.x, y: cp.y, maxR: 40, color: '#ff5252', life: 260 });
                }
                if (G.castleHP <= 0) {
                    G.castleHP = 0;
                    this.app.onLose();
                    return;
                }
            }
            // Boss 召唤技能
            if (enemy.isBoss && enemy.bossSkill === 'summon') {
                enemy.summonTimer = (enemy.summonTimer || 0) + dtMs;
                if (enemy.summonTimer >= 6000) {
                    const alive = G.enemies.filter(m => m.summonedBy === enemy.id && m.hp > 0).length;
                    if (alive < 3) {
                        enemy.summonTimer = 0;
                        this.spawnEnemy({ type: 201 }, enemy.x + (Math.random() - 0.5) * 40, enemy.y + (Math.random() - 0.5) * 40, enemy.id, enemy.level);
                        this.rings.push({ x: enemy.x, y: enemy.y, maxR: 26, color: '#b0ff6b', life: 240 });
                    } else {
                        enemy.summonTimer = 3000;
                    }
                }
            }
        }

        // 塔攻击
        for (const char of Object.keys(G.placed)) {
            if (!G.towerCooldowns[char]) G.towerCooldowns[char] = 0;
            G.towerCooldowns[char] -= dtMs;
            if (G.towerCooldowns[char] > 0) continue;

            const stats = TOWER_STATS[char];
            if (!stats || !TOWER_POSITIONS[char]) continue;
            const pos = this.towerWorldPos(char);

            // 冰：全图冻结 + 全体伤害
            if (stats.buffEffect === 2) {
                G.towerCooldowns[char] = getTowerEffectiveStat(char, 'attackCd');
                const dmg = getTowerEffectiveStat(char, 'attack');
                const freezeMs = getTowerEffectiveStat(char, 'buffEffectPara');
                for (const enemy of G.enemies) {
                    if (enemy.hp <= 0) continue;
                    enemy.frozen = freezeMs;
                    enemy.hp -= dmg;
                    this.addParticle(enemy.x, enemy.y, '#42a5f5', 2);
                    this.addFloater(enemy.x, enemy.y + enemy.size + 4, '-' + dmg, '#8ad8ff');
                }
                this.rings.push({ x: pos.x, y: pos.y, maxR: BATTLE.w, color: '#42a5f5', life: 300 });
                continue;
            }
            // 沐：攻速光环（在 getTowerEffectiveStat 中生效），不攻击
            if (stats.buffEffect === 3) {
                G.towerCooldowns[char] = getTowerEffectiveStat(char, 'attackCd');
                continue;
            }
            // 沐以外攻击力为 0 的情况同样跳过
            if (getTowerEffectiveStat(char, 'attack') <= 0) {
                G.towerCooldowns[char] = getTowerEffectiveStat(char, 'attackCd');
                continue;
            }

            const targets = this.findTargets(pos.x, pos.y, char);
            if (targets.length === 0) continue;
            G.towerCooldowns[char] = getTowerEffectiveStat(char, 'attackCd');

            const dmg = getTowerEffectiveStat(char, 'attack');
            // 穿透：直线光束，命中最多 1+穿透数 个敌人
            if (stats.penetrate > 0) {
                const t = targets[0];
                const len = Math.max(getTowerEffectiveStat(char, 'attackFar'), 60);
                const nd = Math.hypot(t.x - pos.x, t.y - pos.y) || 1;
                const ex = pos.x + (t.x - pos.x) / nd * len;
                const ey = pos.y + (t.y - pos.y) / nd * len;
                const hits = G.enemies.filter(e2 => e2.hp > 0 && this.distToSegment(e2.x, e2.y, pos.x, pos.y, ex, ey) < 13)
                    .sort((a, b) => Math.hypot(a.x - pos.x, a.y - pos.y) - Math.hypot(b.x - pos.x, b.y - pos.y))
                    .slice(0, 1 + stats.penetrate);
                for (const h of hits) this.damageEnemy(h, dmg, stats);
                this.beams.push({ x1: pos.x, y1: pos.y, x2: ex, y2: ey, color: stats.color, life: 110 });
                continue;
            }
            // 常规：每个锁定目标一发弹道
            for (const target of targets) {
                const p: Projectile = {
                    x: pos.x, y: pos.y,
                    target,
                    damage: dmg,
                    splash: getTowerEffectiveStat(char, 'splash'),
                    splashReduce: stats.splashReduce,
                    color: stats.color,
                    speed: 320,
                    buffEffect: stats.buffEffect,
                    buffEffectPara: getTowerEffectiveStat(char, 'buffEffectPara'),
                };
                G.projectiles.push(p);
                this.addParticle(pos.x, pos.y, stats.color, 1);
            }
        }

        // 弹道更新
        for (let i = G.projectiles.length - 1; i >= 0; i--) {
            const p = G.projectiles[i];
            if (p.target.hp <= 0) { G.projectiles.splice(i, 1); continue; }
            const dx = p.target.x - p.x;
            const dy = p.target.y - p.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 8) {
                const stats = { splash: p.splash, splashReduce: p.splashReduce, buffEffect: p.buffEffect, buffEffectPara: p.buffEffectPara, color: p.color } as any;
                this.damageEnemy(p.target, p.damage, stats);
                if (p.splash > 0) {
                    this.rings.push({ x: p.target.x, y: p.target.y, maxR: p.splash, color: p.color, life: 200 });
                    for (const enemy of G.enemies) {
                        if (enemy === p.target || enemy.hp <= 0) continue;
                        if (Math.hypot(enemy.x - p.target.x, enemy.y - p.target.y) < p.splash) {
                            this.damageEnemy(enemy, Math.round(p.damage * p.splashReduce / 100), stats, true);
                        }
                    }
                }
                G.projectiles.splice(i, 1);
            } else {
                const v = p.speed * (dtMs / 1000);
                p.x += (dx / dist) * v;
                p.y += (dy / dist) * v;
            }
        }

        // 粒子/光束/圆环
        for (let i = G.particles.length - 1; i >= 0; i--) {
            const p = G.particles[i];
            p.life -= dtMs;
            if (p.life <= 0) { G.particles.splice(i, 1); continue; }
            p.x += p.vx * (dtMs / 1000);
            p.y += p.vy * (dtMs / 1000);
            p.vy -= 60 * (dtMs / 1000);
        }
        for (let i = this.beams.length - 1; i >= 0; i--) {
            this.beams[i].life -= dtMs;
            if (this.beams[i].life <= 0) this.beams.splice(i, 1);
        }
        for (let i = this.rings.length - 1; i >= 0; i--) {
            this.rings[i].life -= dtMs;
            if (this.rings[i].life <= 0) this.rings.splice(i, 1);
        }

        // 飘字
        for (let i = this.floaters.length - 1; i >= 0; i--) {
            const f = this.floaters[i];
            f.life -= dtMs;
            if (f.life <= 0) {
                f.node.destroy();
                this.floaters.splice(i, 1);
                continue;
            }
            f.node.setPosition(f.node.position.x, f.node.position.y + f.vy * (dtMs / 1000));
        }

        // 清理死亡敌人（先销毁序列帧节点）
        for (const e of G.enemies) {
            if (e.hp <= 0 && e.viewNode) { e.viewNode.destroy(); e.viewNode = undefined; }
        }
        G.enemies = G.enemies.filter(e => e.hp > 0);

        // 波次结束判定：刷新时长结束 + 该波 Boss 已出场（若有）+ 场上清空
        if (G.waveActive && G.wavePreDelay <= 0) {
            const stage = getStage(G.stageId);
            if (stage) {
                const elapsed = this.timeMs - G.waveStartAt;
                const bossPending = stage.bossWaves.some(b => b.wave === G.wave + 1) && !G.waveBossSpawned;
                if (elapsed >= stage.spawnDurationMs && !bossPending && G.enemies.length === 0) {
                    G.waveActive = false;
                    if (G.bloodRegen > 0) {
                        G.castleHP = Math.min(G.castleMaxHP, G.castleHP + G.bloodRegen * 5);
                    }
                    this.app.onWaveClear();
                }
            }
        }
    }

    // 对目标造成伤害并附加特效（溅射伤害不再触发特效）
    private damageEnemy(enemy: Enemy, dmg: number, stats: { splash?: number; splashReduce?: number; buffEffect?: number; buffEffectPara?: number; color?: string }, isSplash = false) {
        if (enemy.hp <= 0 || dmg <= 0) return;
        enemy.hp -= dmg;
        this.addFloater(enemy.x, enemy.y + enemy.size + 4, '-' + dmg, stats.color || '#ffffff');
        if (!isSplash) {
            const now = this.timeMs;
            // 减速
            if (stats.buffEffect === 4 && stats.buffEffectPara > 0) {
                const layers = Math.min(2, Math.max(enemy.slow ? enemy.slow.layers : 0, stats.buffEffectPara));
                enemy.slow = { layers, until: now + 2000 };
            }
            // 中毒
            if (stats.buffEffect === 1 && stats.buffEffectPara > 0) {
                enemy.dotDps = Math.round(enemy.maxHp * stats.buffEffectPara / 100);
                enemy.dotUntil = now + 3000;
                enemy.dotTimer = 0;
            }
        }
    }

    private findTargets(tx: number, ty: number, char: string): Enemy[] {
        const stats = TOWER_STATS[char];
        const far = getTowerEffectiveStat(char, 'attackFar');
        const lock = Math.max(1, stats.attackLock > 0 ? stats.attackLock : 1);
        const inRange = G.enemies.filter(e => e.hp > 0 && Math.hypot(e.x - tx, e.y - ty) <= far);
        if (stats.aim === 'far') {
            inRange.sort((a, b) => Math.hypot(b.x - tx, b.y - ty) - Math.hypot(a.x - tx, a.y - ty));
        } else {
            inRange.sort((a, b) => Math.hypot(a.x - tx, a.y - ty) - Math.hypot(b.x - tx, b.y - ty));
        }
        return inRange.slice(0, lock);
    }

    private distToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
        const dx = x2 - x1, dy = y2 - y1;
        const lenSq = dx * dx + dy * dy;
        if (lenSq === 0) return Math.hypot(px - x1, py - y1);
        let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
    }

    addParticle(x: number, y: number, color: string, count: number) {
        for (let i = 0; i < count; i++) {
            const p: Particle = {
                x: x + (Math.random() - 0.5) * 14,
                y: y + (Math.random() - 0.5) * 14,
                vx: (Math.random() - 0.5) * 60,
                vy: 40 + Math.random() * 50,
                color,
                life: 320 + Math.random() * 180,
                maxLife: 500,
                size: 1.5 + Math.random() * 2,
            };
            G.particles.push(p);
        }
    }

    addFloater(x: number, y: number, text: string, colorHex: string) {
        if (this.floaters.length > 40) return;
        const n = new Node('floater');
        n.layer = Layers.Enum.UI_2D;
        n.setParent(this.floaterRoot);
        n.addComponent(UITransform);
        const lb = n.addComponent(Label);
        lb.string = text;
        lb.fontSize = 11;
        lb.lineHeight = 13;
        lb.isBold = true;
        lb.color = hexColor(colorHex);
        n.setPosition(x + (Math.random() - 0.5) * 8, y);
        this.floaters.push({ node: n, vy: 34, life: 550, maxLife: 550 });
    }

    // ---------- 渲染 ----------
    render() {
        const g = this.g;
        g.clear();
        const cp = this.castlePos();

        // 波次倒计时
        if (G.waveActive && G.wavePreDelay > 0) {
            const sec = Math.ceil(G.wavePreDelay / 1000);
            g.fillColor = hexColor('#000000', 130);
            g.rect(-BATTLE.w / 2, BATTLE.h / 2 - 40, BATTLE.w, 40);
            g.fill();
            this.waveInfoLabel.string = `第${G.wave + 1}波即将来临  ${sec}s`;
            this.waveInfoLabel.node.active = true;
        } else {
            this.waveInfoLabel.node.active = false;
        }

        // ===== 城堡 =====
        const castleR = 26;
        g.fillColor = hexColor('#3c4257');
        g.roundRect(cp.x - 26, cp.y - castleR - 8, 52, 16, 3);
        g.fill();
        g.fillColor = hexColor('#57617e');
        g.circle(cp.x, cp.y, castleR);
        g.fill();
        g.strokeColor = hexColor('#8a93a8');
        g.lineWidth = 2;
        g.stroke();
        // 城垛
        g.fillColor = hexColor('#6b7694');
        for (let i = -2; i <= 2; i++) {
            g.rect(cp.x + i * 10 - 3, cp.y + castleR - 2, 6, 6);
            g.fill();
        }
        // 血条
        const hpW = 46, hpH = 5;
        const hpR = G.castleHP / G.castleMaxHP;
        const hpY = cp.y + castleR + 12;
        g.fillColor = hexColor('#333333');
        g.rect(cp.x - hpW / 2, hpY, hpW, hpH);
        g.fill();
        g.fillColor = hexColor(hpR > 0.5 ? '#4caf50' : hpR > 0.25 ? '#ff9800' : '#f44336');
        g.rect(cp.x - hpW / 2, hpY, hpW * hpR, hpH);
        g.fill();
        this.castleHpLabel.string = `${Math.ceil(G.castleHP)}/${G.castleMaxHP}`;
        // 受击闪烁
        if (this.castleFlash > 0) {
            g.strokeColor = hexColor('#ff4444', 200);
            g.lineWidth = 3;
            g.circle(cp.x, cp.y, castleR + 5);
            g.stroke();
        }

        // ===== 塔 =====
        this.syncTowerLabels();
        for (const char of Object.keys(G.placed)) {
            const pos = this.towerWorldPos(char);
            const stats = TOWER_STATS[char];
            // 底座（序列帧预制体的塔不画底座）
            if (!this.app.getTowerPrefab(char)) {
                g.fillColor = hexColor('#000000', 100);
                g.circle(pos.x, pos.y, 15);
                g.fill();
                g.strokeColor = hexColor(stats.color);
                g.lineWidth = 2;
                g.circle(pos.x, pos.y, 13);
                g.stroke();
            }
            // 攻击范围（低透明度；超远射程不画满避免遮挡）
            const far = getTowerEffectiveStat(char, 'attackFar');
            if (far > 0 && far < 800) {
                g.strokeColor = hexColor(stats.color, 30);
                g.lineWidth = 1;
                g.circle(pos.x, pos.y, far);
                g.stroke();
            }
            // 沐光环标记
            if (stats.buffEffect === 3) {
                g.strokeColor = hexColor('#26a69a', 120);
                g.lineWidth = 2;
                g.circle(pos.x, pos.y, 19 + Math.sin(this.timeMs / 250) * 3);
                g.stroke();
            }
        }

        // ===== 敌人 =====
        for (const enemy of G.enemies) {
            if (enemy.hp <= 0) continue;
            const size = enemy.size;
            if (enemy.viewNode) {
                // 序列帧/名字文本节点：仅同步位置（血条/状态圈仍由 Graphics 绘制）
                enemy.viewNode.setPosition(enemy.x, enemy.y);
            } else {
                g.fillColor = hexColor(enemy.color);
                g.circle(enemy.x, enemy.y, size);
                g.fill();
            }
            // Boss 金圈指示（无论预制体/文本/圆点都显示）
            if (enemy.isBoss) {
                g.strokeColor = hexColor('#ffe082');
                g.lineWidth = 2;
                g.circle(enemy.x, enemy.y, size + 3);
                g.stroke();
            }
            const now = this.timeMs;
            if (enemy.frozen > 0) {
                g.strokeColor = hexColor('#42a5f5');
                g.lineWidth = 2;
                g.circle(enemy.x, enemy.y, size + 3);
                g.stroke();
            } else if (enemy.slow && now < enemy.slow.until) {
                g.strokeColor = hexColor('#80deea', 160);
                g.lineWidth = 1.5;
                g.circle(enemy.x, enemy.y, size + 2);
                g.stroke();
            }
            if (enemy.dotDps > 0 && now < enemy.dotUntil) {
                g.fillColor = hexColor('#7ce87c', 140);
                g.circle(enemy.x, enemy.y - size - 3, 2);
                g.fill();
            }
            // 血条
            const hpW = enemy.isBoss ? 34 : 18;
            const hpH = 3;
            const r = Math.max(0, enemy.hp / enemy.maxHp);
            const ehpY = enemy.y + size + 5;
            g.fillColor = hexColor('#333333');
            g.rect(enemy.x - hpW / 2, ehpY, hpW, hpH);
            g.fill();
            g.fillColor = hexColor(r > 0.5 ? '#4caf50' : '#ff9800');
            g.rect(enemy.x - hpW / 2, ehpY, hpW * r, hpH);
            g.fill();
        }

        // ===== 光束（穿透） =====
        for (const b of this.beams) {
            g.strokeColor = hexColor(b.color, Math.round(255 * b.life / 110));
            g.lineWidth = 2.5;
            g.moveTo(b.x1, b.y1);
            g.lineTo(b.x2, b.y2);
            g.stroke();
        }

        // ===== 弹道 =====
        for (const p of G.projectiles) {
            g.fillColor = hexColor(p.color);
            g.circle(p.x, p.y, 3);
            g.fill();
        }

        // ===== 扩散圆环（溅射/冻结/召唤） =====
        for (const ring of this.rings) {
            const t = 1 - ring.life / 300;
            g.strokeColor = hexColor(ring.color, Math.round(200 * (1 - t)));
            g.lineWidth = 2;
            g.circle(ring.x, ring.y, ring.maxR * Math.min(1, t * 1.4));
            g.stroke();
        }

        // ===== 粒子 =====
        for (const p of G.particles) {
            g.fillColor = hexColor(p.color, Math.round(255 * Math.max(0, p.life / p.maxLife)));
            g.circle(p.x, p.y, p.size);
            g.fill();
        }
    }

    // 同步塔文字节点（字 + 等级，等级变化实时刷新）
    private syncTowerLabels() {
        const wanted = Object.keys(G.placed);
        for (let i = this.towerLabelRoot.children.length - 1; i >= 0; i--) {
            const child = this.towerLabelRoot.children[i];
            if (!wanted.includes(child.name)) child.destroy();
        }
        for (const char of wanted) {
            let n: Node | undefined = this.towerLabelRoot.children.find(c => c.name === char);
            if (!n) {
                const pos = this.towerWorldPos(char);
                const stats = TOWER_STATS[char];
                // 优先用序列帧预制体（Animation PlayOnLoad 自动播放），否则文字 Label
                const prefab = this.app.getTowerPrefab(char);
                if (prefab) {
                    n = instantiate(prefab);
                    n.name = char;
                    n.layer = Layers.Enum.UI_2D;
                    n.setParent(this.towerLabelRoot);
                    n.setPosition(pos.x, pos.y);
                } else {
                    n = new Node(char);
                    n.layer = Layers.Enum.UI_2D;
                    n.setParent(this.towerLabelRoot);
                    n.addComponent(UITransform);
                    n.setPosition(pos.x, pos.y);
                    makeLabel(n, char, 18, stats.color);
                }
            }
            const lv = G.placed[char].level;
            let lvNode = n.children.find(c => c.name === 'lvlabel');
            if (lv > 1) {
                if (!lvNode) {
                    lvNode = new Node('lvlabel');
                    lvNode.layer = Layers.Enum.UI_2D;
                    lvNode.setParent(n);
                    lvNode.addComponent(UITransform);
                    lvNode.setPosition(0, -14);
                    makeLabel(lvNode, '', 9, '#ffffff', false);
                }
                const lb = lvNode.children.length ? lvNode.children[0].getComponent(Label) : null;
                if (lb) lb.string = 'Lv' + lv;
            } else if (lvNode) {
                lvNode.active = false;
            }
        }
    }

    // 清理动态视觉对象（重开局时）
    clearVisuals() {
        this.beams = [];
        this.rings = [];
        for (const f of this.floaters) f.node.destroy();
        this.floaters = [];
        // 清理怪物序列帧节点（重开局时）
        for (const e of G.enemies) {
            if (e.viewNode) { e.viewNode.destroy(); e.viewNode = undefined; }
        }
    }
}
