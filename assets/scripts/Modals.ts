// ============================================================
// 弹窗：波次奖励三选一 / 结算 / 合成树
// 全屏遮罩 + 居中面板，设计分辨率 390×844
// ============================================================
import { Node, Graphics, EventTouch } from 'cc';
import {
    G, SOURCE_CHARS, COMBINE_CHARS, TOWER_STATS, ENHANCE_STATS, STAT_NAMES,
    ChooseOption, applyEnhanceChar, applyEnhanceGlobal, randomSourceChars,
} from './Config';
import {
    hexColor, makeNode, makeLabel, fillRoundRect, strokeRoundRect, THEME,
} from './Theme';

export interface ModalsApp {
    startNextWave(): void;
    backHome(): void;
    restartBattle(): void;
    startNextStage(): void;   // 进入下一关
    hasNextStage(): boolean;  // 当前关之后还有关卡
    refreshItemBar(): void;
    showTip(text: string, cls: 'error' | 'ok' | ''): void;
}

const SCREEN_W = 390;
const SCREEN_H = 844;

// 全屏遮罩（拦截穿透点击；onClose 提供时点击遮罩关闭）
function makeMask(root: Node, name: string, onClose?: () => void): Node {
    const n = makeNode(name, SCREEN_W, SCREEN_H);
    n.setParent(root);
    const g = n.addComponent(Graphics);
    g.fillColor = hexColor('#000000', 150);
    g.rect(-SCREEN_W / 2, -SCREEN_H / 2, SCREEN_W, SCREEN_H);
    g.fill();
    const swallow = (e: EventTouch) => { e.propagationStopped = true; };
    n.on(Node.EventType.TOUCH_START, swallow);
    n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
        e.propagationStopped = true;
        if (onClose) onClose();
    });
    return n;
}

function makePanelNode(parent: Node, name: string, w: number, h: number): Node {
    const n = makeNode(name, w, h);
    n.setParent(parent);
    const g = n.addComponent(Graphics);
    fillRoundRect(g, -w / 2, -h / 2, w, h, 12, hexColor(THEME.panel));
    strokeRoundRect(g, -w / 2, -h / 2, w, h, 12, hexColor(THEME.border), 2);
    // 面板吞掉触摸，避免穿透到底层遮罩（遮罩点击会关闭弹窗）
    const swallow = (e: EventTouch) => { e.propagationStopped = true; };
    n.on(Node.EventType.TOUCH_START, swallow);
    n.on(Node.EventType.TOUCH_END, swallow);
    return n;
}

export class Modals {
    private root: Node;
    private app: ModalsApp;

    private chooseRoot: Node;
    private resultRoot: Node;
    private combineRoot: Node;

    constructor(parent: Node, app: ModalsApp) {
        this.app = app;
        this.root = makeNode('modals', SCREEN_W, SCREEN_H);
        this.root.setParent(parent);
        this.root.setPosition(0, 0);

        for (const name of ['choose-overlay', 'result-overlay', 'combine-overlay']) {
            const n = makeNode(name, SCREEN_W, SCREEN_H);
            n.setParent(this.root);
            n.setPosition(0, 0);
            n.active = false;
            if (name === 'choose-overlay') this.chooseRoot = n;
            else if (name === 'result-overlay') this.resultRoot = n;
            else this.combineRoot = n;
        }
    }

    // ============================================================
    // 波次奖励：固定 5 随机独体字 + 三选一强化
    // ============================================================
    showChooseModal() {
        G.paused = true;
        // 第一部分：固定奖励 5 个随机独体字，替换物品栏（未部署的字被清空）
        const rewardChars = randomSourceChars(5);
        G.items = rewardChars.map(c => ({ char: c, level: 1 }));
        this.app.refreshItemBar();

        // 第二部分：三选一强化
        const heal = Math.round(G.castleMaxHP * 0.3);
        // 单塔强化：优先已部署塔，随机一个有效属性
        const placedList = Object.keys(G.placed);
        const pool = placedList.length > 0 ? placedList : Object.keys(TOWER_STATS);
        const tChar = pool[Math.floor(Math.random() * pool.length)];
        const eligStats = ENHANCE_STATS.filter(s => s === 'attackCd' || (TOWER_STATS[tChar] as any)[s] > 0);
        const stat = eligStats[Math.floor(Math.random() * eligStats.length)];
        const bigMult = stat === 'attackCd' ? 0.7 : 1.35;

        G.chooseOptions = [
            {
                type: 'heal', heal,
                title: '回 血',
                desc: `城堡恢复 ${heal} 点生命（上限的 30%）`,
            },
            {
                type: 'char', char: tChar, stat, mult: bigMult,
                title: `强化「${tChar}」· ${STAT_NAMES[stat]}`,
                desc: stat === 'attackCd' ? '攻速冷却 ×0.7（大幅加快）' : '该属性 ×1.35（大幅强化）',
            },
            {
                type: 'global', mult: 1.08, cdMult: 0.95,
                title: '全塔强化',
                desc: '所有塔全属性 +8%，攻速冷却 ×0.95',
            },
        ];

        this.chooseRoot.removeAllChildren();
        this.renderChoose(rewardChars);
        this.chooseRoot.active = true;
    }

    private renderChoose(rewardChars: string[]) {
        makeMask(this.chooseRoot, 'mask');
        const panel = makePanelNode(this.chooseRoot, 'choose-panel', 356, 560);

        makeLabel(panel, '波 次 奖 励', 22, THEME.text).node.setPosition(0, 250);
        const tip1 = makeLabel(panel, '获得 5 个随机独体字（已放入物品栏）', 12, THEME.muted, false);
        tip1.node.setPosition(0, 218);

        // 5 个奖励字
        rewardChars.forEach((c, i) => {
            const box = makeNode('rc' + i, 46, 46);
            box.setParent(panel);
            box.setPosition(-144 + i * 72, 172);
            const bg = box.addComponent(Graphics);
            fillRoundRect(bg, -23, -23, 46, 46, 6, hexColor('#16213e'));
            strokeRoundRect(bg, -23, -23, 46, 46, 6, hexColor('#3a5a7c'), 1);
            makeLabel(box, c, 24, TOWER_STATS[c] ? TOWER_STATS[c].color : '#dddddd');
        });

        const tip2 = makeLabel(panel, '再选择一项强化：', 12, THEME.muted, false);
        tip2.node.setPosition(0, 122);

        G.chooseOptions.forEach((opt, i) => {
            const row = makeNode('opt' + i, 320, 92);
            row.setParent(panel);
            row.setPosition(0, 62 - i * 108);
            const g = row.addComponent(Graphics);
            fillRoundRect(g, -160, -46, 320, 92, 10, hexColor('#16213e'));
            strokeRoundRect(g, -160, -46, 320, 92, 10, hexColor('#33507a'), 1);
            makeLabel(row, opt.title, 16, THEME.accent).node.setPosition(0, 18);
            makeLabel(row, opt.desc, 11, THEME.muted, false).node.setPosition(0, -14);
            row.on(Node.EventType.TOUCH_END, () => this.selectChoose(i));
        });
    }

    private selectChoose(idx: number) {
        const opt: ChooseOption = G.chooseOptions[idx];
        if (opt.type === 'heal') {
            G.castleHP = Math.min(G.castleMaxHP, G.castleHP + (opt.heal || 0));
            this.app.showTip(`城堡恢复 ${opt.heal} 点生命`, 'ok');
        } else if (opt.type === 'char') {
            applyEnhanceChar(opt.char!, opt.stat!, opt.mult!);
            this.app.showTip(`「${opt.char}」${STAT_NAMES[opt.stat!]}已强化`, 'ok');
        } else {
            for (const s of ENHANCE_STATS) {
                applyEnhanceGlobal(s, s === 'attackCd' ? (opt.cdMult || 1) : (opt.mult || 1));
            }
            this.app.showTip('所有塔全属性 +8%', 'ok');
        }
        G.chooseOptions = [];
        this.chooseRoot.active = false;
        G.paused = false;
        this.app.startNextWave();
    }

    // ============================================================
    // 结算
    // ============================================================
    showResult(win: boolean) {
        G.paused = true;
        G.gameOver = true;
        this.resultRoot.removeAllChildren();
        makeMask(this.resultRoot, 'mask');
        const panel = makePanelNode(this.resultRoot, 'result-panel', 300, 280);

        const title = makeLabel(panel, win ? '胜 利' : '失 败', 34, win ? '#4ecdc4' : '#e94560');
        title.node.setPosition(0, 75);
        const sub = makeLabel(panel, win ? '城堡守卫成功！' : '城堡被攻破了…', 13, THEME.muted, false);
        sub.node.setPosition(0, 32);

        const mkBtn = (name: string, x: number, w: number, label: string, fill: string, stroke: string, onTap: () => void) => {
            const btn = makeNode(name, w, 56);
            btn.setParent(panel);
            btn.setPosition(x, -72);
            const g = btn.addComponent(Graphics);
            fillRoundRect(g, -w / 2, -28, w, 56, 12, hexColor(fill));
            strokeRoundRect(g, -w / 2, -28, w, 56, 12, hexColor(stroke), 2);
            makeLabel(btn, label, 17, '#ffffff');
            btn.on(Node.EventType.TOUCH_END, () => {
                this.resultRoot.active = false;
                onTap();
            });
        };

        if (win && this.app.hasNextStage()) {
            mkBtn('btn-next-stage', -60, 120, '下一关', '#2a6f6a', '#4ecdc4', () => this.app.startNextStage());
            mkBtn('btn-home', 70, 110, '主页', '#3a4055', '#8a93a8', () => this.app.backHome());
        } else {
            mkBtn(win ? 'btn-home' : 'btn-restart', 0, 220, win ? '返回主页' : '重新开始',
                win ? '#2a6f6a' : '#5a2a35', win ? '#4ecdc4' : '#e94560',
                () => win ? this.app.backHome() : this.app.restartBattle());
        }

        this.resultRoot.active = true;
    }

    // ============================================================
    // 合成树
    // ============================================================
    openCombineTree() {
        if (G.gameOver) return;
        this.combineRoot.removeAllChildren();
        this.renderCombineTree();
        this.combineRoot.active = true;
    }

    closeCombineTree() {
        this.combineRoot.active = false;
    }

    isCombineOpen(): boolean {
        return this.combineRoot.active;
    }

    closeAll() {
        this.chooseRoot.active = false;
        this.resultRoot.active = false;
        this.combineRoot.active = false;
    }

    private renderCombineTree() {
        makeMask(this.combineRoot, 'mask', () => this.closeCombineTree());
        const panel = makePanelNode(this.combineRoot, 'combine-panel', 356, 660);

        makeLabel(panel, '合 成 配 方', 22, THEME.text).node.setPosition(0, 305);

        // 独体字
        const s1 = makeLabel(panel, '独体字（字根 · 低级塔）', 12, THEME.muted, false);
        s1.node.setPosition(0, 272);
        SOURCE_CHARS.forEach((c, i) => {
            const box = makeNode('s' + i, 44, 44);
            box.setParent(panel);
            box.setPosition(-132 + i * 66, 236);
            const bg = box.addComponent(Graphics);
            fillRoundRect(bg, -22, -22, 44, 44, 5, hexColor('#16213e'));
            strokeRoundRect(bg, -22, -22, 44, 44, 5, hexColor('#3a5a7c'), 1);
            makeLabel(box, c, 22, TOWER_STATS[c].color);
        });

        // 配方
        const s2 = makeLabel(panel, '两两合成 → 合成字（高级塔）', 12, THEME.muted, false);
        s2.node.setPosition(0, 192);

        let y = 158;
        for (const [res, roots] of Object.entries(COMBINE_CHARS)) {
            const row = makeNode('row-' + res, 320, 34);
            row.setParent(panel);
            row.setPosition(0, y);
            const g = row.addComponent(Graphics);
            fillRoundRect(g, -160, -17, 320, 34, 6, hexColor('#131a2e'));
            const mkBox = (char: string, x: number, isRes: boolean) => {
                const box = makeNode('c', 30, 30);
                box.setParent(row);
                box.setPosition(x, 0);
                const bg = box.addComponent(Graphics);
                fillRoundRect(bg, -15, -15, 30, 30, 4, hexColor(isRes ? '#2a3f2e' : '#16213e'));
                strokeRoundRect(bg, -15, -15, 30, 30, 4, hexColor(isRes ? '#ffd54f' : '#3a5a7c'), 1);
                makeLabel(box, char, 16, isRes ? '#ffd54f' : TOWER_STATS[char].color);
            };
            mkBox(roots[0], -110, false);
            makeLabel(row, '+', 14, THEME.muted, false).node.setPosition(-70, 0);
            mkBox(roots[1], -30, false);
            makeLabel(row, '=', 14, THEME.muted, false).node.setPosition(10, 0);
            mkBox(res, 50, true);
            const name = makeLabel(row, TOWER_STATS[res].desc, 11, THEME.muted, false);
            name.node.setPosition(130, 0);
            y -= 38;
        }

        // 关闭
        const closeBtn = makeNode('close', 200, 46);
        closeBtn.setParent(panel);
        closeBtn.setPosition(0, -300);
        const cg = closeBtn.addComponent(Graphics);
        fillRoundRect(cg, -100, -23, 200, 46, 10, hexColor('#2a3f5c'));
        strokeRoundRect(cg, -100, -23, 200, 46, 10, hexColor(THEME.border), 1);
        makeLabel(closeBtn, '关 闭', 16, '#ffffff', false);
        closeBtn.on(Node.EventType.TOUCH_END, () => this.closeCombineTree());
    }
}
