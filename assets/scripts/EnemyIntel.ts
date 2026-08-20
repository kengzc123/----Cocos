// ============================================================
// 敌人情报：主页按钮打开，逐关浏览本关小怪 / Boss 数值
// 全屏遮罩 + 居中面板，设计分辨率 390×844
// 数值来源与战斗一致：getMonsterStats(type, level)，缺行走内置兜底提示
// ============================================================
import { Node, Graphics, EventTouch } from 'cc';
import { allStages, getStage, getMonsterStats, StageCfg, MonsterStats } from './Config';
import { hexColor, makeNode, makeLabel, fillRoundRect, strokeRoundRect, THEME } from './Theme';
import { TABLE_TYPE_COLOR } from './BattleView';

const SCREEN_W = 390;
const SCREEN_H = 844;

// 同一关卡内同一类型聚合一行（各波等级不同 → 数值取范围）
interface IntelRow {
    type: number;
    name: string;
    isBoss: boolean;
    lvMin: number;
    lvMax: number;
    blood: [number, number] | null;   // null = 数值表缺行
    attack: [number, number] | null;
    attackCd: [number, number] | null;
    attackFar: [number, number] | null;
    speed: [number, number] | null;   // 已换算 px/s
    waves: number[];
}

export class EnemyIntel {
    node: Node;
    private stageId = 0;

    constructor(parent: Node) {
        this.node = makeNode('enemy-intel', SCREEN_W, SCREEN_H);
        this.node.setParent(parent);
        this.node.setPosition(0, 0);
        this.node.active = false;
    }

    open(stageId?: number) {
        const stages = allStages();
        if (stages.length === 0) return;
        let idx = stageId != null ? stages.findIndex(s => s.stageId === stageId) : 0;
        if (idx < 0) idx = 0;
        this.stageId = stages[idx].stageId;
        this.render();
        this.node.active = true;
    }

    close() {
        this.node.active = false;
    }

    // 关卡切换（±1 / ±5）
    private turn(dir: number) {
        const stages = allStages();
        if (stages.length === 0) return;
        let idx = stages.findIndex(s => s.stageId === this.stageId);
        if (idx < 0) idx = 0;
        idx = Math.min(stages.length - 1, Math.max(0, idx + dir));
        this.stageId = stages[idx].stageId;
        this.render();
    }

    // ============================================================
    // 数据聚合
    // ============================================================
    private waveLevelOf(stage: StageCfg, wave: number): number {
        const e = stage.waveLevels.find(w => w.wave === wave);
        if (e) return e.level;
        const last = stage.waveLevels[stage.waveLevels.length - 1];
        return last ? last.level : 1;
    }

    private buildRow(stage: StageCfg, type: number, waves: number[], isBoss: boolean): IntelRow {
        const levels = waves.length > 0 ? waves.map(w => this.waveLevelOf(stage, w)) : [1];
        const lvMin = Math.min(...levels);
        const lvMax = Math.max(...levels);
        const statsList = levels.map(l => getMonsterStats(type, l)).filter((s): s is MonsterStats => s !== null);

        if (statsList.length === 0) {
            return {
                type, name: isBoss ? 'Boss' : `类型${type}`, isBoss,
                lvMin, lvMax,
                blood: null, attack: null, attackCd: null, attackFar: null, speed: null,
                waves,
            };
        }
        const rng = (get: (s: typeof statsList[number]) => number): [number, number] => {
            const vals = statsList.map(get);
            return [Math.min(...vals), Math.max(...vals)];
        };
        const name = statsList[0].name.replace(/\s*Lv\d+\s*$/, '').trim() || (isBoss ? 'Boss' : `类型${type}`);
        return {
            type, name, isBoss,
            lvMin, lvMax,
            blood: rng(s => s.blood),
            attack: rng(s => s.attack),
            attackCd: rng(s => s.attackCd),
            attackFar: rng(s => s.attackFar),
            speed: rng(s => Math.round(s.speed * 60)),
            waves,
        };
    }

    // 波次列表压缩：连续段 → "1~5"，离散 → "1,4"
    private wavesText(waves: number[]): string {
        if (waves.length === 0) return '-';
        const ws = [...waves].sort((a, b) => a - b);
        const segs: string[] = [];
        let start = ws[0], prev = ws[0];
        for (let i = 1; i <= ws.length; i++) {
            const cur = ws[i];
            if (cur !== prev + 1) {
                segs.push(start === prev ? `${start}` : `${start}~${prev}`);
                start = cur;
            }
            prev = cur;
        }
        return segs.join(',');
    }

    private rangeText(r: [number, number] | null, suffix = ''): string {
        if (!r) return '?';
        return (r[0] === r[1] ? `${r[0]}` : `${r[0]}~${r[1]}`) + suffix;
    }

    // ============================================================
    // 渲染
    // ============================================================
    private render() {
        this.node.removeAllChildren();
        const stage = getStage(this.stageId);
        if (!stage) {
            this.node.active = false;
            return;
        }

        // 全屏遮罩（点击关闭）
        const mask = makeNode('mask', SCREEN_W, SCREEN_H);
        mask.setParent(this.node);
        const mg = mask.addComponent(Graphics);
        mg.fillColor = hexColor('#000000', 150);
        mg.rect(-SCREEN_W / 2, -SCREEN_H / 2, SCREEN_W, SCREEN_H);
        mg.fill();
        const swallow = (e: EventTouch) => { e.propagationStopped = true; };
        mask.on(Node.EventType.TOUCH_START, swallow);
        mask.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            e.propagationStopped = true;
            this.close();
        });

        // 居中面板
        const panel = makeNode('intel-panel', 356, 720);
        panel.setParent(this.node);
        const pg = panel.addComponent(Graphics);
        fillRoundRect(pg, -178, -360, 356, 720, 12, hexColor(THEME.panel));
        strokeRoundRect(pg, -178, -360, 356, 720, 12, hexColor(THEME.border), 2);
        panel.on(Node.EventType.TOUCH_START, swallow);
        panel.on(Node.EventType.TOUCH_END, swallow);

        makeLabel(panel, '敌 人 情 报', 22, THEME.text).node.setPosition(0, 330);

        // 关卡导航
        const stages = allStages();
        const idx = stages.findIndex(s => s.stageId === this.stageId);
        const mkNav = (name: string, x: number, w: number, label: string, dir: number) => {
            const b = makeNode(name, w, 34);
            b.setParent(panel);
            b.setPosition(x, 292);
            const bg = b.addComponent(Graphics);
            fillRoundRect(bg, -w / 2, -17, w, 34, 8, hexColor('#2a3244'));
            strokeRoundRect(bg, -w / 2, -17, w, 34, 8, hexColor(THEME.border), 1);
            makeLabel(b, label, 14, THEME.text, false);
            b.on(Node.EventType.TOUCH_END, () => this.turn(dir));
        };
        mkNav('nav-prev5', -128, 40, '«', -5);
        mkNav('nav-prev1', -78, 40, '‹', -1);
        mkNav('nav-next1', 78, 40, '›', 1);
        mkNav('nav-next5', 128, 40, '»', 5);
        const idxLabel = makeLabel(panel, '', 13, THEME.accent);
        idxLabel.node.setPosition(0, 292);
        idxLabel.string = `第 ${idx + 1} / ${stages.length} 关`;

        // 关卡说明 + 概要
        makeLabel(panel, stage.note || `关卡 ${stage.stageId}`, 12, THEME.muted, false).node.setPosition(0, 262);
        const cd = stage.monsterCd;
        const num = stage.monsterNum;
        const summary = `共${stage.totalWaves}波 · 单批${num[0]}~${num[1]}只 · 批间隔${(cd[0] / 1000).toFixed(1)}~${(cd[1] / 1000).toFixed(1)}s`
            + ` · 出怪${stage.spawnDurationMs / 1000}s`;
        makeLabel(panel, summary, 10, THEME.muted, false).node.setPosition(0, 241);

        // 敌人行
        const allWaves = stage.waveLevels.map(w => w.wave);
        const mobRows = stage.monsterTypes.map(e => this.buildRow(stage, e.type, allWaves, false));
        const bossRows = stage.bossWaves.map(b => this.buildRow(stage, b.type, [b.wave], true));

        let y = 208;
        if (mobRows.length > 0) {
            makeLabel(panel, '本 关 小 怪', 13, THEME.text).node.setPosition(0, y);
            y -= 40;
            for (const row of mobRows) {
                this.renderRow(panel, row, stage, y);
                y -= 60;
            }
        }

        if (bossRows.length > 0) {
            makeLabel(panel, '本 关 Boss', 13, '#ff8a80').node.setPosition(0, y);
            y -= 40;
            for (const row of bossRows) {
                this.renderRow(panel, row, stage, y);
                y -= 60;
            }
        } else {
            makeLabel(panel, `本关无 Boss`, 11, THEME.muted, false).node.setPosition(0, y);
            y -= 22;
        }

        // 数据来源提示
        makeLabel(panel, '数值来自怪物数值表，与战斗内实际数值一致', 9, THEME.muted, false).node.setPosition(0, -296);

        // 关闭按钮
        const closeBtn = makeNode('close', 200, 46);
        closeBtn.setParent(panel);
        closeBtn.setPosition(0, -330);
        const cg = closeBtn.addComponent(Graphics);
        fillRoundRect(cg, -100, -23, 200, 46, 10, hexColor('#2a3f5c'));
        strokeRoundRect(cg, -100, -23, 200, 46, 10, hexColor(THEME.border), 1);
        makeLabel(closeBtn, '关 闭', 16, '#ffffff', false);
        closeBtn.on(Node.EventType.TOUCH_END, () => this.close());
    }

    private renderRow(panel: Node, row: IntelRow, stage: StageCfg, y: number) {
        const box = makeNode(`enemy-${row.type}${row.isBoss ? '-boss' : ''}`, 330, 56);
        box.setParent(panel);
        box.setPosition(0, y);
        const g = box.addComponent(Graphics);
        const fill = row.isBoss ? '#2e1a26' : '#131a2e';
        const border = row.isBoss ? '#e94560' : '#2c3a5c';
        fillRoundRect(g, -165, -28, 330, 56, 8, hexColor(fill));
        strokeRoundRect(g, -165, -28, 330, 56, 8, hexColor(border), 1);

        const color = row.isBoss ? '#ffd54f' : (TABLE_TYPE_COLOR[row.type] || '#dddddd');
        const lvText = row.lvMin === row.lvMax ? `Lv${row.lvMin}` : `Lv${row.lvMin}~${row.lvMax}`;
        const tag = row.isBoss ? 'Boss' : `类型${row.type}`;
        makeLabel(box, `${row.name}  ${lvText}`, 14, color).node.setPosition(0, 16);
        makeLabel(box, tag, 9, THEME.muted, false).node.setPosition(148, 16);

        if (row.blood) {
            const stats = `血 ${this.rangeText(row.blood)}  攻 ${this.rangeText(row.attack)}  射 ${this.rangeText(row.attackFar)}`
                + `  CD ${this.rangeText(row.attackCd, 's')}  速 ${this.rangeText(row.speed)}`;
            makeLabel(box, stats, 10, '#c5cbe0', false).node.setPosition(0, -4);
        } else {
            makeLabel(box, '数值表缺行，战斗内回退内置数值', 10, '#e0a458', false).node.setPosition(0, -4);
        }

        const waveInfo = `出现：第${this.wavesText(row.waves)}波`
            + (row.isBoss ? ` · 开波${stage.bossAtMs / 1000}s后` : '');
        makeLabel(box, waveInfo, 9, row.isBoss ? '#ff8a80' : THEME.accent, false).node.setPosition(0, -20);
    }
}
