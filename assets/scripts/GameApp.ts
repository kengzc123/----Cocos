// ============================================================
// 游戏主控：场景切换 / 游戏循环 / 物品操作 / 战场部署 / 拖拽管理 / 打造开关
// 界面层级（根节点子顺序）：
//   战场 → 锻造拦截层 → 顶栏 → 物品栏 → 打造盘 → 底栏 → 弹窗 → 主页
// ============================================================
import { _decorator, Component, Node, EventTouch, Graphics, Canvas, UITransform, Vec3, Camera, Prefab } from 'cc';
import {
    G, TOWER_STATS, TOWER_POSITIONS, MAX_LEVEL, resetStateForBattle,
    openingChars, ForgePiece, stageTotalWaves, registerStages, allStages,
    registerMonsters, monsterRowCount, saveStageCleared, nextStageId, getStage,
    StageCfg, loadProgress, unlockedStageId, setStageBaseFromRows, overrideStagesByEditor,
} from './Config';
import { loadTables, loadEnemyPrefabs } from './StageLoader';
import {
    hexColor, makeNode, makeLabel, fillRoundRect, strokeRoundRect, THEME, setTouchCamera,
} from './Theme';
import { BattleView, BattleApp } from './BattleView';
import { ItemBar, ItemBarApp } from './ItemBar';
import { ForgePanel, ForgeApp } from './ForgePanel';
import { Modals, ModalsApp } from './Modals';
import { TowerConfig } from './TowerConfig';
import { StageConfig } from './StageConfig';
import { MonsterRow } from './MonsterTableConfig';

const { ccclass, property } = _decorator;

const SCREEN_W = 390;
const SCREEN_H = 844;

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
    private homeStageLabel!: ReturnType<typeof makeLabel>;
    private homeGrid!: Node;
    private homePageLabel!: ReturnType<typeof makeLabel>;
    private homePageIdx = 0;
    private selectedStageId = 30001;

    battle!: BattleView;
    itemBar!: ItemBar;
    forge!: ForgePanel;
    modals!: Modals;

    // 字塔预制体配置（编辑器检查器中编辑；TowerConfig 数值覆盖内置，序列帧自动播放）
    @property({ type: [TowerPrefabEntry], tooltip: '字塔预制体：挂 TowerConfig（可加 Sprite+Animation 序列帧）' })
    towerPrefabs: TowerPrefabEntry[] = [];

    // 关卡配置（编辑器检查器中编辑；非空时覆盖 Config.ts 内置关卡表）
    @property({ type: [StageConfig], tooltip: '关卡配置：逐关编辑波次/怪物等级/小怪池/Boss/刷新节奏；为空则用内置表' })
    stages: StageConfig[] = [];

    // 怪物数值表（monster.xlsx 对应；先手动配几条跑通，后续批量导入）
    @property({ type: [MonsterRow], tooltip: '怪物数值表：每行 = (类型,等级) 数值；缺行就近向下取，缺类型回退内置' })
    monsters: MonsterRow[] = [];

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
        // 怪物数值表注册（monster.xlsx 对应；手动配置跑通后再批量导入）
        registerMonsters(this.monsters.map(m => m.toStats()));
        console.log(`[monster] 数值表 ${monsterRowCount()} 行` + (this.monsters.length === 0 ? '（未配置，怪物回退内置数值）' : ''));

        // 编辑器关卡配置注册（非空时覆盖内置 STAGE_ROWS；外观预制体按名注册供表格引用）
        if (this.stages.length > 0) {
            for (const s of this.stages) s.registerPrefabs();
            const list = this.stages.map(s => s.toCfg());
            registerStages(list);
            console.log(`[stage] 编辑器关卡 ${list.length} 关：${list.map(s => s.stageId).join(', ')}`);
        } else {
            console.log('[stage] 编辑器未配置关卡，使用内置表：', allStages().map(s => s.stageId).join(', '));
        }

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
        this.selectedStageId = unlockedStageId();
        this.buildHomeScene();

        this.showBattleUI(false);
        this.rebuildHomeStageGrid();
        this.refreshHomeStageLabel();

        // 9. 批量导入（resources json 由「导表.bat」生成；未导入时回退编辑器/内置表）
        this.startImport();
    }

    // 异步加载导表 json：成功后设为基表，编辑器手动配置按 id 覆盖回填；失败静默回退
    private startImport() {
        loadTables().then(data => {
            setStageBaseFromRows(data.stageRows);                    // json 关卡基表
            if (this.stages.length > 0) {
                overrideStagesByEditor(this.stages.map(s => s.toCfg())); // 手动关卡覆盖同 id（临时调参）
            }
            registerMonsters(data.monsters);                          // json 怪物基表
            registerMonsters(this.monsters.map(m => m.toStats()));    // 手动行覆盖同 id（临时调参）
            console.log(`[import] json 生效：${data.stageRows.length} 关 + ${data.monsters.length} 行怪物数值`
                + `（编辑器覆盖 ${this.stages.length} 关 / ${this.monsters.length} 行）`);
            return loadEnemyPrefabs().then(bound => {
                if (bound > 0) console.log(`[import] enemies/ 预制体绑定 ${bound} 个`);
                this.selectedStageId = unlockedStageId();
                this.rebuildHomeStageGrid();   // 关卡表从内置 3 关变为 json N 关，刷新主页网格
                this.refreshHomeStageLabel();
            });
        }).catch(() => {
            console.log('[import] 未找到导表 json（assets/resources/stages.json / monsters.json），'
                + '使用编辑器/内置数据；批量导入请双击项目根目录「导表.bat」');
        });
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

        makeLabel(n, '文 字 塔 防', 34, THEME.text).node.setPosition(0, 250);
        makeLabel(n, '汉字象形守卫 · 原型', 12, THEME.muted, false).node.setPosition(0, 218);
        makeLabel(n, '拖字上阵 · 拖字入盘合成 · 守住城堡', 11, THEME.muted, false).node.setPosition(0, 196);

        // 关卡选择面板
        const panel = makeNode('stage-panel', 350, 330);
        panel.setParent(n);
        panel.setPosition(0, -5);
        const pg = panel.addComponent(Graphics);
        fillRoundRect(pg, -175, -165, 350, 330, 12, hexColor(THEME.panel));
        strokeRoundRect(pg, -175, -165, 350, 330, 12, hexColor(THEME.border), 2);

        makeLabel(panel, '选择关卡', 15, THEME.text).node.setPosition(0, 138);
        this.homePageLabel = makeLabel(panel, '', 11, THEME.muted, false);
        this.homePageLabel.node.setPosition(0, 112);

        this.homeGrid = makeNode('stage-grid', 350, 210);
        this.homeGrid.setParent(panel);
        this.homeGrid.setPosition(0, 0);

        // 分页按钮
        const mkPageBtn = (name: string, x: number, label: string, onTap: () => void) => {
            const b = makeNode(name, 64, 36);
            b.setParent(panel);
            b.setPosition(x, -138);
            const bg2 = b.addComponent(Graphics);
            fillRoundRect(bg2, -32, -18, 64, 36, 10, hexColor('#2a3244'));
            strokeRoundRect(bg2, -32, -18, 64, 36, 10, hexColor(THEME.border), 1);
            makeLabel(b, label, 14, THEME.text);
            b.on(Node.EventType.TOUCH_END, onTap);
        };
        mkPageBtn('page-prev', -60, '‹ 上一页', () => this.turnHomeStagePage(-1));
        mkPageBtn('page-next', 60, '下一页 ›', () => this.turnHomeStagePage(1));
        makeLabel(panel, '带锁图标 = 需先通过前一关解锁', 10, THEME.muted, false).node.setPosition(0, -108);

        // 选中关卡提示 + 开始按钮
        const stageLabel = makeLabel(n, '', 13, THEME.accent, false);
        stageLabel.node.setPosition(0, -205);

        const startBtn = makeNode('btn-start', 220, 56);
        startBtn.setParent(n);
        startBtn.setPosition(0, -252);
        const bg = startBtn.addComponent(Graphics);
        fillRoundRect(bg, -110, -28, 220, 56, 14, hexColor('#1f4a46'));
        strokeRoundRect(bg, -110, -28, 220, 56, 14, hexColor(THEME.accent), 2);
        makeLabel(startBtn, '开 始 战 斗', 18, '#eafffb');
        startBtn.on(Node.EventType.TOUCH_END, () => {
            this.startBattle(this.selectedStageId);
        });

        this.homeStageLabel = stageLabel;
        this.homeScene = n;
    }

    // 主页关卡网格（backHome/初始化/翻页时重建）
    private rebuildHomeStageGrid() {
        if (!this.homeGrid) return;
        this.homeGrid.removeAllChildren();
        const stages = allStages();
        if (stages.length === 0) return;

        const cleared = loadProgress();
        const clearedIdx = stages.findIndex(s => s.stageId === cleared);
        const unlockedCount = (clearedIdx < 0 ? 0 : clearedIdx + 1) + 1; // 已通关数 + 当前解锁关
        const PER_PAGE = 15, COLS = 5;
        const pages = Math.max(1, Math.ceil(stages.length / PER_PAGE));
        this.homePageIdx = Math.min(this.homePageIdx, pages - 1);
        this.homePageLabel.string = `第 ${this.homePageIdx + 1} / ${pages} 页 · 已通关 ${Math.max(0, unlockedCount - 1)} / ${stages.length}`;

        const CELL_W = 62, CELL_H = 58, GAP_X = 8, GAP_Y = 8;
        const gridW = COLS * CELL_W + (COLS - 1) * GAP_X;
        const start = this.homePageIdx * PER_PAGE;

        for (let i = 0; i < PER_PAGE; i++) {
            const idx = start + i;
            if (idx >= stages.length) break;
            const stage = stages[idx];
            const col = i % COLS, row = Math.floor(i / COLS);
            const x = -gridW / 2 + CELL_W / 2 + col * (CELL_W + GAP_X);
            const y = (PER_PAGE / COLS / 2 - 0.5) * (CELL_H + GAP_Y) - row * (CELL_H + GAP_Y);
            this.makeStageCell(this.homeGrid, stage, idx, idx < unlockedCount, idx <= clearedIdx && clearedIdx >= 0, x, y, CELL_W, CELL_H);
        }
    }

    private makeStageCell(parent: Node, stage: StageCfg, idx: number, unlocked: boolean, cleared: boolean, x: number, y: number, w: number, h: number) {
        const cell = makeNode(`stage-${stage.stageId}`, w, h);
        cell.setParent(parent);
        cell.setPosition(x, y);
        const g = cell.addComponent(Graphics);
        const selected = stage.stageId === this.selectedStageId;

        let fill = '#262b38', border = '#3a4055', nameColor = '#5a6378';
        if (unlocked) {
            fill = cleared ? '#233c33' : '#1f4a46';
            border = cleared ? '#4ecdc4' : THEME.accent;
            nameColor = cleared ? '#9fe8de' : '#eafffb';
        }
        fillRoundRect(g, -w / 2, -h / 2, w, h, 8, hexColor(fill));
        strokeRoundRect(g, -w / 2, -h / 2, w, h, 8, hexColor(border), selected ? 3 : 1);
        if (selected) { // 选中高亮外圈
            strokeRoundRect(g, -w / 2 - 3, -h / 2 - 3, w + 6, h + 6, 10, hexColor('#ffe082'), 2);
        }

        const shortName = (stage.note || '').split('，')[0] || `第${idx + 1}关`;
        makeLabel(cell, shortName, 13, nameColor).node.setPosition(0, 8);
        if (cleared) {
            makeLabel(cell, '✓ 已通关', 9, '#7ce8c8', false).node.setPosition(0, -12);
        } else if (!unlocked) {
            // 锁图标（锁环圆 + 锁身矩形，复用同一 Graphics）
            g.strokeColor = hexColor('#8a93a8');
            g.lineWidth = 2;
            g.circle(0, -8, 5);
            g.stroke();
            fillRoundRect(g, -7, -20, 14, 11, 2, hexColor('#5a6378'));
        } else {
            makeLabel(cell, '未通关', 9, '#c8b06a', false).node.setPosition(0, -12);
        }

        if (unlocked) {
            cell.on(Node.EventType.TOUCH_END, () => {
                this.selectedStageId = stage.stageId;
                this.rebuildHomeStageGrid();
                this.refreshHomeStageLabel();
            });
        }
    }

    private turnHomeStagePage(dir: number) {
        const stages = allStages();
        const pages = Math.max(1, Math.ceil(stages.length / 15));
        this.homePageIdx = (this.homePageIdx + dir + pages) % pages;
        this.rebuildHomeStageGrid();
    }

    // 主页关卡标签（backHome/初始化时刷新）
    private refreshHomeStageLabel() {
        if (!this.homeStageLabel) return;
        const stage = getStage(this.selectedStageId);
        this.homeStageLabel.string = `当前关卡：${stage ? (stage.note || stage.stageId) : this.selectedStageId}`;
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

    startBattle(stageId?: number) {
        this.homeScene.active = false;
        G.scene = 'battle';
        resetStateForBattle();
        if (stageId) G.stageId = stageId; // 缺省 = 最新解锁关
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
        this.selectedStageId = unlockedStageId(); // 回主页默认选中最新解锁关
        this.rebuildHomeStageGrid();
        this.refreshHomeStageLabel();
        this.homeScene.active = true;
    }

    restartBattle() {
        this.startBattle(G.stageId); // 重打当前关
    }

    private updateWaveText() {
        this.waveText.string = `第${G.wave + 1}波 / 共${this.totalWaves}波`;
    }

    // 总波数：读关卡表（stage.xlsx 数据源）
    private get totalWaves(): number {
        return stageTotalWaves(G.stageId);
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
            saveStageCleared(G.stageId); // 记录通关进度（下一关解锁）
            this.modals.showResult(true);
            return;
        }
        this.battle.startNextWave();
    }

    // 下一关（胜利结算按钮）
    startNextStage() {
        const next = nextStageId(G.stageId);
        if (next) this.startBattle(next);
        else this.backHome();
    }

    hasNextStage(): boolean {
        return nextStageId(G.stageId) !== null;
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
