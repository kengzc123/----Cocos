// ============================================================
// 游戏主控：场景切换 / 游戏循环 / 物品操作 / 战场部署 / 拖拽管理 / 打造开关
// 界面层级（根节点子顺序）：
//   战场 → 锻造拦截层 → 顶栏 → 物品栏 → 打造盘 → 底栏 → 弹窗 → 主页
// ============================================================
import { _decorator, Component, Node, EventTouch, Graphics, Canvas, UITransform, Vec3, Camera, Prefab } from 'cc';
import {
    G, TOWER_STATS, TOWER_POSITIONS, MAX_LEVEL, TOTAL_WAVES, resetStateForBattle,
    openingChars, ForgePiece, EnemyCfgExt,
} from './Config';
import {
    hexColor, makeNode, makeLabel, fillRoundRect, strokeRoundRect, THEME, setTouchCamera,
} from './Theme';
import { BattleView, BattleApp } from './BattleView';
import { ItemBar, ItemBarApp } from './ItemBar';
import { ForgePanel, ForgeApp } from './ForgePanel';
import { Modals, ModalsApp } from './Modals';
import { EnemyConfig } from './EnemyConfig';
import { TowerConfig } from './TowerConfig';

const { ccclass, property } = _decorator;

const SCREEN_W = 390;
const SCREEN_H = 844;

// 波次刷怪条目（检查器中编辑）：波数 + 怪物预制体 + 数量 + 刷新间隔
@ccclass('WaveEntry')
class WaveEntry {
    @property({ tooltip: '第几波（从 1 开始）' })
    wave = 1;

    @property({ type: Prefab, tooltip: '怪物预制体（根节点挂 EnemyConfig）' })
    prefab: Prefab = null!;

    @property({ tooltip: '数量' })
    count = 5;

    @property({ tooltip: '组内刷新间隔 ms' })
    delay = 400;
}

// 字塔预制体条目（检查器中编辑）：挂 TowerConfig（可再挂 Sprite+Animation 序列帧）
@ccclass('TowerPrefabEntry')
class TowerPrefabEntry {
    @property({ type: Prefab, tooltip: '塔预制体（根节点挂 TowerConfig）' })
    prefab: Prefab = null!;
}

@ccclass('GameApp')
export class GameApp extends Component implements BattleApp, ItemBarApp, ForgeApp, ModalsApp {

    private root!: Node;
    private cam!: Camera;
    private homeScene!: Node;
    private topBar!: Node;
    private bottomBar!: Node;
    private waveText!: ReturnType<typeof makeLabel>;
    private forgeBlocker!: Node;
    private forgeBtnLabel!: ReturnType<typeof makeLabel>;

    battle!: BattleView;
    itemBar!: ItemBar;
    forge!: ForgePanel;
    modals!: Modals;

    // 波次刷怪配置（编辑器检查器中编辑；为空时回退代码内 WAVE_CONFIG）
    @property({ type: [WaveEntry], tooltip: '波次刷怪配置：同波数可加多条=多组怪依次刷新；为空则用内置配置' })
    waveEntries: WaveEntry[] = [];

    // 字塔预制体配置（编辑器检查器中编辑；TowerConfig 数值覆盖内置，序列帧自动播放）
    @property({ type: [TowerPrefabEntry], tooltip: '字塔预制体：挂 TowerConfig（可加 Sprite+Animation 序列帧）' })
    towerPrefabs: TowerPrefabEntry[] = [];

    // 拖拽状态
    private drag: {
        kind: 'item' | 'forgeRow' | 'forgePiece' | 'mapTower';
        idx?: number;
        char?: string;
        level?: number;
        piece?: ForgePiece;
    } | null = null;
    private ghost: Node | null = null;

    // ============================================================
    // 初始化
    // ============================================================
    onLoad() {
        // 相机自愈：UI 相机必须是正交投影 + UI 优先级，否则触摸命中测试失效
        const canvasComp = this.node.getComponent(Canvas);
        let cam: Camera | null = (canvasComp && canvasComp.cameraComponent) || null;
        let camSrc = 'canvas.cameraComponent';
        if (!cam) {
            // Canvas 引用缺失时，从子节点找回相机
            const camNode = this.node.getChildByName('Camera');
            if (camNode) {
                cam = camNode.getComponent(Camera);
                camSrc = 'child-node';
            }
        }
        console.log('[drag-diag] onLoad cam =', cam ? camSrc : 'NULL');
        if (cam) {
            if (canvasComp && !canvasComp.cameraComponent) {
                canvasComp.cameraComponent = cam; // 补挂引用，触发 Canvas 相机对齐
            }
            this.cam = cam;
            cam.projection = 0;           // ProjectionType.ORTHO
            cam.priority = 1073741824;    // Priority.UI
            cam.near = 1;
            cam.far = 2000;
            cam.orthoHeight = SCREEN_H / 2;
            cam.visibility = 41943040;    // UI_2D | UI_3D
        }
        // 注入触摸相机：所有命中检测统一走屏幕坐标→世界坐标换算
        setTouchCamera(this.cam);

        // 合并编辑器塔配置：TowerConfig 数值/位置覆盖内置 TOWER_STATS / TOWER_POSITIONS
        for (const en of this.towerPrefabs) {
            if (!en.prefab) continue;
            const data = en.prefab.data as Node | null;
            const tc = data ? data.getComponent(TowerConfig) : null;
            if (!tc || !tc.charName) continue;
            TOWER_STATS[tc.charName] = tc.toStat();
            TOWER_POSITIONS[tc.charName] = { x: tc.posX, y: tc.posY };
        }

        this.root = makeNode('root', SCREEN_W, SCREEN_H);
        this.root.setParent(this.node);

        // 1. 战场（最底层）
        this.battle = new BattleView(this.root, this);

        // 2. 锻造拦截层（点击打造盘外：关闭锻造）
        this.forgeBlocker = makeNode('forge-blocker', SCREEN_W, SCREEN_H);
        this.forgeBlocker.setParent(this.root);
        this.forgeBlocker.setPosition(0, 0);
        this.forgeBlocker.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            if (this.forge.isOpen() && this.forge.panelContains(e)) return;
            this.closeForge();
        });
        this.forgeBlocker.active = false;

        // 3. 顶栏
        this.buildTopBar();

        // 4. 物品栏
        this.itemBar = new ItemBar(this.root, this);

        // 5. 打造盘
        this.forge = new ForgePanel(this.root, this);

        // 6. 底栏
        this.buildBottomBar();

        // 7. 弹窗
        this.modals = new Modals(this.root, this);

        // 8. 主页（最顶层）
        this.buildHomeScene();

        this.showBattleUI(false);
    }

    private buildTopBar() {
        this.topBar = makeNode('top-bar', SCREEN_W, 48);
        this.topBar.setParent(this.root);
        this.topBar.setPosition(0, 396);
        const g = this.topBar.addComponent(Graphics);
        fillRoundRect(g, -SCREEN_W / 2, -24, SCREEN_W, 48, 0, hexColor(THEME.panel));

        this.waveText = makeLabel(this.topBar, `第1波 / 共${this.totalWaves}波`, 16, THEME.text);
        this.waveText.node.setPosition(-100, 0);

        // 合成树按钮
        const combineBtn = makeNode('btn-combine', 84, 34);
        combineBtn.setParent(this.topBar);
        combineBtn.setPosition(98, 0);
        const cg = combineBtn.addComponent(Graphics);
        fillRoundRect(cg, -42, -17, 84, 34, 6, hexColor('#16213e'));
        strokeRoundRect(cg, -42, -17, 84, 34, 6, hexColor(THEME.accent), 1);
        makeLabel(combineBtn, '合成树', 14, THEME.accent, false);
        combineBtn.on(Node.EventType.TOUCH_END, () => {
            if (this.forge.isOpen()) this.closeForge();
            this.itemBar.closeMenu();
            this.modals.openCombineTree();
        });

        // 退出按钮
        const exitBtn = makeNode('btn-exit', 56, 34);
        exitBtn.setParent(this.topBar);
        exitBtn.setPosition(160, 0);
        const eg = exitBtn.addComponent(Graphics);
        fillRoundRect(eg, -28, -17, 56, 34, 6, hexColor('#1a2036'));
        strokeRoundRect(eg, -28, -17, 56, 34, 6, hexColor(THEME.border), 1);
        makeLabel(exitBtn, '退出', 14, THEME.muted, false);
        exitBtn.on(Node.EventType.TOUCH_END, () => {
            this.backHome();
        });
    }

    private buildBottomBar() {
        const bar = makeNode('bottom-bar', SCREEN_W, 62);
        bar.setParent(this.root);
        bar.setPosition(0, -391);
        this.bottomBar = bar;
        const g = bar.addComponent(Graphics);
        fillRoundRect(g, -SCREEN_W / 2, -31, SCREEN_W, 62, 0, hexColor(THEME.panel));

        const btn = makeNode('btn-forge', SCREEN_W, 62);
        btn.setParent(bar);
        const bg = btn.addComponent(Graphics);
        fillRoundRect(bg, -SCREEN_W / 2, -31, SCREEN_W, 62, 0, hexColor('#1f4a46'));
        strokeRoundRect(bg, -SCREEN_W / 2, -31, SCREEN_W, 62, 0, hexColor(THEME.accent), 1);
        this.forgeBtnLabel = makeLabel(btn, '打 造', 20, '#eafffb');
        btn.on(Node.EventType.TOUCH_END, () => {
            if (this.forge.isOpen()) {
                this.forge.confirmForge();
                this.itemBar.render();
            } else {
                this.openForge();
            }
        });
    }

    private buildHomeScene() {
        const n = makeNode('home-scene', SCREEN_W, SCREEN_H);
        n.setParent(this.root);
        n.setPosition(0, 0);
        const g = n.addComponent(Graphics);
        g.fillColor = hexColor(THEME.bg);
        g.rect(-SCREEN_W / 2, -SCREEN_H / 2, SCREEN_W, SCREEN_H);
        g.fill();

        makeLabel(n, '文 字 塔 防', 40, THEME.text).node.setPosition(0, 150);
        makeLabel(n, '汉字象形守卫 · 原型', 14, THEME.muted, false).node.setPosition(0, 108);

        const tips = [
            '· 拖字上阵：物品栏的字拖到战场即部署',
            '· 拖字入盘：独体字拖入打造盘，方块相连即可合成',
            '· 守住城堡 5 波进攻即可获胜',
        ];
        tips.forEach((t, i) => {
            makeLabel(n, t, 12, THEME.muted, false).node.setPosition(0, 40 - i * 24);
        });

        const startBtn = makeNode('btn-start', 220, 64);
        startBtn.setParent(n);
        startBtn.setPosition(0, -90);
        const bg = startBtn.addComponent(Graphics);
        fillRoundRect(bg, -110, -32, 220, 64, 14, hexColor('#1f4a46'));
        strokeRoundRect(bg, -110, -32, 220, 64, 14, hexColor(THEME.accent), 2);
        makeLabel(startBtn, '开 始 战 斗', 20, '#eafffb');
        startBtn.on(Node.EventType.TOUCH_END, () => {
            this.startBattle();
        });

        this.homeScene = n;
    }

    // ============================================================
    // 场景切换
    // ============================================================
    private showBattleUI(show: boolean) {
        this.battle.node.active = show;
        this.topBar.active = show;
        this.bottomBar.active = show;
        this.itemBar.node.active = show;
        if (!show) {
            this.forge.close();
            this.forgeBlocker.active = false;
            this.forgeBtnLabel.string = '打 造';
        }
    }

    startBattle() {
        this.homeScene.active = false;
        G.scene = 'battle';
        resetStateForBattle();
        this.battle.clearVisuals();
        this.showBattleUI(true);

        // 开局 5 个随机独体字（至少 1 个火塔）
        for (const c of openingChars()) {
            G.items.push({ char: c, level: 1 });
        }
        this.itemBar.render();
        this.updateWaveText();

        G.paused = false;
        this.battle.startWave();
    }

    backHome() {
        if (this.forge.isOpen()) this.closeForge();
        this.modals.closeAll();
        this.itemBar.closeMenu();
        G.scene = 'home';
        G.paused = false;
        G.gameOver = false;
        this.showBattleUI(false);
        this.homeScene.active = true;
    }

    restartBattle() {
        this.startBattle();
    }

    private updateWaveText() {
        this.waveText.string = `第${G.wave + 1}波 / 共${this.totalWaves}波`;
    }

    // 总波数：有编辑器配置取最大波数，否则用内置波数
    private get totalWaves(): number {
        if (!this.waveEntries.length) return TOTAL_WAVES;
        return Math.max(...this.waveEntries.map(en => en.wave), 0);
    }

    // ============================================================
    // 游戏循环
    // ============================================================
    update(dt: number) {
        if (G.scene !== 'battle') return;
        let dtMs = dt * 1000;
        if (dtMs > 100) dtMs = 100; // 防止大帧跳跃
        if (!G.paused && !G.gameOver) {
            this.battle.update(dtMs);
        }
        if (this.battle.node.active) {
            this.battle.render();
        }
    }

    // ============================================================
    // BattleApp 回调
    // ============================================================
    onTowerClick(char: string) {
        if (this.forge.isOpen()) return;
        const p = G.placed[char];
        if (!p) return;
        delete G.placed[char];
        delete G.towerCooldowns[char];
        if (this.addItem(char, p.level)) {
            this.battle.showTip(`「${char}」收回物品栏`, 'ok');
        } else {
            G.placed[char] = p; // 物品栏已满则回退
        }
    }

    onWaveClear() {
        this.modals.showChooseModal();
    }

    onLose() {
        this.modals.showResult(false);
    }

    onWaveChanged() {
        this.updateWaveText();
    }

    // 字塔序列帧预制体查找
    getTowerPrefab(char: string): Prefab | null {
        for (const en of this.towerPrefabs) {
            if (!en.prefab) continue;
            const data = en.prefab.data as Node | null;
            const tc = data ? data.getComponent(TowerConfig) : null;
            if (tc && tc.charName === char) return en.prefab;
        }
        return null;
    }

    // 波次刷怪组：读取预制体上的 EnemyConfig 数据（不实例化节点）
    getWaveGroups(wave: number): { type: string | EnemyCfgExt; count: number; delay: number }[] | null {
        if (!this.waveEntries.length) return null;
        const groups: { type: string | EnemyCfgExt; count: number; delay: number }[] = [];
        for (const en of this.waveEntries) {
            if (!en.prefab || en.wave !== wave + 1) continue;
            const data = en.prefab.data as Node | null;
            const ec = data ? data.getComponent(EnemyConfig) : null;
            if (!ec) continue; // 预制体没挂 EnemyConfig：跳过该条
            const cfg = ec.toSpawnCfg();
            cfg.prefab = en.prefab; // 带上预制体引用：刷怪时实例化序列帧节点
            groups.push({
                type: cfg,
                count: Math.max(1, Math.round(en.count)),
                delay: Math.max(50, en.delay),
            });
        }
        return groups.length ? groups : null;
    }

    // ============================================================
    // 物品操作（ItemBarApp / ForgeApp 共用）
    // ============================================================
    addItem(char: string, level: number): boolean {
        if (G.items.length >= 5) {
            this.showTip('物品栏已满', 'error');
            return false;
        }
        G.items.push({ char, level });
        this.itemBar.render();
        return true;
    }

    removeItemByIdx(idx: number) {
        if (idx < 0 || idx >= G.items.length) return;
        G.items.splice(idx, 1);
        this.itemBar.render();
    }

    destroyItem(char: string, level: number) {
        const idx = G.items.findIndex(i => i.char === char && i.level === level);
        if (idx >= 0) {
            G.items.splice(idx, 1);
            this.itemBar.render();
            this.showTip(`已销毁「${char}」Lv${level}`, '');
        }
    }

    mergeItems(char: string, level: number): boolean {
        if (level >= MAX_LEVEL) {
            this.showTip('已达最高等级', 'error');
            return false;
        }
        const i1 = G.items.findIndex(i => i.char === char && i.level === level);
        if (i1 < 0) return false;
        const i2 = G.items.findIndex((i, idx) => idx > i1 && i.char === char && i.level === level);
        if (i2 < 0) return false;
        G.items.splice(i2, 1);
        G.items.splice(i1, 1);
        G.items.push({ char, level: level + 1 });
        this.itemBar.render();
        this.showTip(`「${char}」合并为 Lv${level + 1}`, 'ok');
        return true;
    }

    refreshItemBar() {
        this.itemBar.render();
    }

    showTip(text: string, cls: 'error' | 'ok' | '') {
        this.battle.showTip(text, cls);
    }

    // ============================================================
    // 战场部署
    // ============================================================
    private deployChar(idx: number, char: string, level: number) {
        const placed = G.placed[char];
        if (placed) {
            if (level === placed.level) {
                // 同字同级：地图上直接合并升级
                if (level >= MAX_LEVEL) {
                    this.battle.showTip('已达最高等级', 'error');
                    return;
                }
                G.items.splice(idx, 1);
                G.placed[char] = { level: level + 1 };
                this.battle.showTip(`「${char}」Lv${level} → Lv${level + 1} 合并升级`, 'ok');
            } else if (level < placed.level) {
                this.battle.showTip(`场上已有「${char}」Lv${placed.level}，需更高等级`, 'error');
                return;
            } else {
                G.items.splice(idx, 1);
                G.items.push({ char, level: placed.level }); // 旧字收回物品栏
                G.placed[char] = { level };
                this.battle.showTip(`「${char}」Lv${placed.level} → Lv${level}，旧字已收回`, 'ok');
            }
        } else {
            G.items.splice(idx, 1);
            G.placed[char] = { level };
            this.battle.showTip(`「${char}」已部署`, 'ok');
        }
        this.itemBar.render();
    }

    // ============================================================
    // 打造开关
    // ============================================================
    openForge() {
        if (G.scene !== 'battle' || G.gameOver) return;
        if (this.modals.isCombineOpen()) this.modals.closeCombineTree();
        this.itemBar.closeMenu();
        G.paused = true;
        this.forgeBlocker.active = true;
        this.itemBar.node.active = false; // 打造盘内自带物品栏
        this.forge.open();
        this.forgeBtnLabel.string = '确认合成';
    }

    closeForge() {
        if (!this.forge.isOpen()) return;
        this.forge.close(); // 盘上字块保留在打造盘
        this.forgeBlocker.active = false;
        this.itemBar.node.active = true;
        this.itemBar.render();
        G.paused = false;
        this.forgeBtnLabel.string = '打 造';
    }

    // 打造盘「返回」按钮回调
    requestClose() {
        this.closeForge();
    }

    // ============================================================
    // ModalsApp 回调
    // ============================================================
    startNextWave() {
        if (G.wave + 1 >= this.totalWaves) {
            this.modals.showResult(true);
            return;
        }
        this.battle.startNextWave();
    }

    // ============================================================
    // 拖拽管理（ItemBar / ForgePanel 发起）
    // ============================================================
    private createGhost(char: string, level: number) {
        this.clearGhost();
        const g = makeNode('drag-ghost', 90, 90);
        g.setParent(this.root);
        const color = TOWER_STATS[char] ? TOWER_STATS[char].color : '#dddddd';
        makeLabel(g, char, 40, color);
        if (level > 1) {
            const lv = makeLabel(g, 'Lv' + level, 16, '#ffffff', false);
            lv.node.setPosition(0, -32);
        }
        this.ghost = g;
    }

    private moveGhost(e: EventTouch) {
        if (!this.ghost) return;
        const ut = this.root.getComponent(UITransform)!;
        const ui = e.getUILocation();
        let local: Vec3;
        // 路径 A：相机屏幕坐标 → 世界坐标（物理分辨率精确换算）
        if (this.cam) {
            try {
                const loc = e.getLocation();
                const world = new Vec3();
                this.cam.screenToWorld(new Vec3(loc.x, loc.y, 0), world);
                if (!world.equals(Vec3.ZERO)) {
                    local = ut.convertToNodeSpaceAR(world);
                    console.log('[drag-diag] cam',
                        'loc=', loc.x.toFixed(0), loc.y.toFixed(0),
                        'ui=', ui.x.toFixed(0), ui.y.toFixed(0),
                        'world=', world.x.toFixed(0), world.y.toFixed(0),
                        'local=', local.x.toFixed(0), local.y.toFixed(0));
                } else {
                    throw new Error('screenToWorld returned zero');
                }
            } catch (err) {
                local = ut.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
                console.log('[drag-diag] fallback ui=', ui.x.toFixed(0), ui.y.toFixed(0),
                    'local=', local.x.toFixed(0), local.y.toFixed(0), String(err));
            }
        } else {
            // 路径 B：UI 坐标（设计分辨率）直接转局部
            local = ut.convertToNodeSpaceAR(new Vec3(ui.x, ui.y, 0));
            console.log('[drag-diag] ui=', ui.x.toFixed(0), ui.y.toFixed(0),
                'local=', local.x.toFixed(0), local.y.toFixed(0));
        }
        this.ghost.setPosition(local.x, local.y);
    }

    private clearGhost() {
        if (this.ghost) {
            this.ghost.destroy();
            this.ghost = null;
        }
    }

    // ---- 物品栏拖拽 ----
    onItemBarDragStart(idx: number, e: EventTouch) {
        const item = G.items[idx];
        if (!item) return;
        this.drag = { kind: 'item', idx, char: item.char, level: item.level };
        this.createGhost(item.char, item.level);
        this.moveGhost(e);
    }

    onItemBarDragMove(e: EventTouch) {
        this.moveGhost(e);
    }

    onItemBarDragEnd(e: EventTouch) {
        const p = this.drag;
        this.clearGhost();
        this.drag = null;
        if (!p || p.kind !== 'item') return;
        const { idx, char, level } = p as { idx: number; char: string; level: number };

        // 1) 战场：部署
        const inBattle = this.battle.node.active;
        const contains = inBattle && this.battle.containsTouch(e);
        const local = this.battle.toLocal(e);
        console.log('[drop-diag] END char=', char,
            'active=', inBattle,
            'contains=', contains,
            'local=', local.x.toFixed(0), local.y.toFixed(0),
            '(need |x|<=195 && |y|<=325)');
        if (contains) {
            this.deployChar(idx, char, level);
            return;
        }
        // 2) 物品槽：同字同级合并升级
        const slot = this.itemBar.slotIndexAt(e);
        if (slot >= 0 && slot !== idx) {
            const target = G.items[slot];
            if (target && target.char === char && target.level === level) {
                this.mergeItems(char, level);
            }
        }
    }

    onItemBarDragCancel() {
        console.log('[drop-diag] CANCEL（触摸被打断，非正常松手）');
        this.clearGhost();
        this.drag = null;
    }

    // ---- 战场地图塔拖拽（合并升级 / 收回） ----
    onMapDragStart(char: string, e: EventTouch) {
        const p = G.placed[char];
        if (!p) return;
        this.drag = { kind: 'mapTower', char, level: p.level };
        this.createGhost(char, p.level);
        this.moveGhost(e);
    }

    onMapDragMove(e: EventTouch) {
        this.moveGhost(e);
    }

    onMapDragEnd(char: string, e: EventTouch) {
        const p = this.drag;
        this.clearGhost();
        this.drag = null;
        if (!p || p.kind !== 'mapTower' || p.char !== char) return;
        const placed = G.placed[char];
        if (!placed) return;

        // 落在物品栏槽位：同字同级 → 合并升级；空槽 → 收回
        const slot = this.itemBar.slotIndexAt(e);
        if (slot >= 0) {
            const target = G.items[slot];
            if (target && target.char === char && target.level === placed.level) {
                if (placed.level >= MAX_LEVEL) {
                    this.battle.showTip('已达最高等级', 'error');
                    return;
                }
                G.items[slot] = { char, level: placed.level + 1 };
                delete G.placed[char];
                delete G.towerCooldowns[char];
                this.itemBar.render();
                this.battle.showTip(`「${char}」合并为 Lv${placed.level + 1}`, 'ok');
                return;
            }
            if (!target && this.addItem(char, placed.level)) {
                delete G.placed[char];
                delete G.towerCooldowns[char];
                this.battle.showTip(`「${char}」收回物品栏`, 'ok');
            }
            return;
        }
        // 其他落点：塔回原位，不做处理
    }

    // ---- 打造盘物品行拖拽（独体字入盘） ----
    onForgeItemDragStart(idx: number, e: EventTouch) {
        const item = G.items[idx];
        if (!item) return;
        this.drag = { kind: 'forgeRow', idx, char: item.char, level: item.level };
        this.createGhost(item.char, item.level);
        this.moveGhost(e);
    }

    onForgeItemDragMove(e: EventTouch) {
        this.moveGhost(e);
        if (this.drag && this.drag.char) {
            this.forge.showDropPreview(this.drag.char, e);
        }
    }

    onForgeItemDragEnd(e: EventTouch) {
        const p = this.drag;
        this.clearGhost();
        this.drag = null;
        this.forge.clearHighlight();
        if (!p || p.kind !== 'forgeRow') return;
        if (this.forge.gridContains(e)) {
            const cell = this.forge.cellIndexAt(e);
            if (cell >= 0) {
                this.forge.dropItemToGrid(p.char!, p.idx!, cell);
            }
        }
    }

    onForgeItemDragCancel() {
        this.clearGhost();
        this.drag = null;
        this.forge.clearHighlight();
    }

    // ---- 打造盘内字块拖拽（调整位置） ----
    onPieceDragStart(piece: ForgePiece, e: EventTouch) {
        this.drag = { kind: 'forgePiece', piece };
        this.createGhost(piece.char, 1);
        this.moveGhost(e);
    }

    onPieceDragMove(e: EventTouch) {
        this.moveGhost(e);
        if (this.drag && this.drag.piece) {
            this.forge.showMovePreview(this.drag.piece, e);
        }
    }

    onPieceDragEnd(e: EventTouch) {
        const p = this.drag;
        this.clearGhost();
        this.drag = null;
        this.forge.clearHighlight();
        if (!p || p.kind !== 'forgePiece' || !p.piece) return;
        const piece = p.piece;

        // 1) 拖到物品行：同字同级合并升级，否则收回
        const slot = this.forge.rowSlotIndexAt(e);
        if (slot >= 0) {
            const target = G.items[slot];
            if (target && target.char === piece.char && target.level === 1 && 1 < MAX_LEVEL) {
                G.items[slot] = { char: piece.char, level: 2 };
                this.forge.removePiece(piece);
                this.itemBar.render();
                this.battle.showTip(`「${piece.char}」合并为 Lv2`, 'ok');
                return;
            }
            if (this.addItem(piece.char, 1)) {
                this.forge.removePiece(piece);
                this.battle.showTip(`「${piece.char}」收回物品栏`, 'ok');
            }
            return;
        }
        // 2) 盘内：调整位置
        if (this.forge.gridContains(e)) {
            const cell = this.forge.cellIndexAt(e);
            this.forge.movePiece(piece, cell);
        }
        // 3) 其他落点：字块保留原位
    }

    onPieceDragCancel() {
        this.clearGhost();
        this.drag = null;
        this.forge.clearHighlight();
    }
}
