// ============================================================
// 打造盘：战斗场景内弹窗（无标题）
// 布局：物品栏在上 / 合成提示右上 / 「清」左上 / 大「确认」底部
// 5×5 网格，俄罗斯方块式占位，配方匹配 + 形状连通 合成判定
// ============================================================
import { Node, Graphics, EventTouch, Vec3, UITransform } from 'cc';
import {
    G, CHAR_SHAPES, RECIPES, isSourceChar, TOWER_STATS,
    ForgePiece, Shape, ComboResult, Item,
} from './Config';
import {
    hexColor, makeNode, makeLabel, fillRoundRect, strokeRoundRect,
    touchInNode, touchLocal, THEME, makeShapeThumb,
} from './Theme';

export interface ForgeApp {
    requestClose(): void;
    onForgeItemDragStart(idx: number, e: EventTouch): void;
    onForgeItemDragMove(e: EventTouch): void;
    onForgeItemDragEnd(e: EventTouch): void;
    onForgeItemDragCancel(): void;
    onPieceDragStart(piece: ForgePiece, e: EventTouch): void;
    onPieceDragMove(e: EventTouch): void;
    onPieceDragEnd(e: EventTouch): void;
    onPieceDragCancel(): void;
    removeItemByIdx(idx: number): void;
    addItem(char: string, level: number): boolean;
    showTip(text: string, cls: 'error' | 'ok' | ''): void;
    refreshItemBar(): void;
}

const CELL = 50;
const GAP = 4;
const GRID_W = CELL * 5 + GAP * 4;   // 266
const PANEL_W = 370;
const PANEL_H = 434;
const ROW_SLOT_W = 64;
const ROW_SLOT_H = 56;

function getGridRowCol(idx: number) {
    return { r: Math.floor(idx / 5), c: idx % 5 };
}

// 多集匹配（只看每种字出现次数，与摆放顺序无关）
function multisetEqual(a: string[], b: string[]) {
    if (a.length !== b.length) return false;
    const ca: Record<string, number> = {}, cb: Record<string, number> = {};
    for (const x of a) ca[x] = (ca[x] || 0) + 1;
    for (const x of b) cb[x] = (cb[x] || 0) + 1;
    for (const k in ca) if (ca[k] !== (cb[k] || 0)) return false;
    return true;
}

// 多字块形状连通判定（上下左右相接成一片）
function piecesConnected(pieces: ForgePiece[]): boolean {
    if (pieces.length <= 1) return true;
    const cellSet = (p: ForgePiece) => {
        const s = new Set<number>();
        const { r, c } = getGridRowCol(p.anchorIdx);
        for (const [dr, dc] of p.shape) s.add((r + dr) * 5 + (c + dc));
        return s;
    };
    const cells = pieces.map(p => cellSet(p));
    const adj = (a: number, b: number) => {
        for (const ca of cells[a]) {
            const r = Math.floor(ca / 5), c = ca % 5;
            for (const [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]] as Shape[]) {
                const nr = r + dr, nc = c + dc;
                if (nr < 0 || nr >= 5 || nc < 0 || nc >= 5) continue;
                if (cells[b].has(nr * 5 + nc)) return true;
            }
        }
        return false;
    };
    const seen = new Set<number>([0]);
    const stack = [0];
    while (stack.length) {
        const cur = stack.pop()!;
        for (let j = 0; j < pieces.length; j++) {
            if (seen.has(j)) continue;
            if (adj(cur, j)) { seen.add(j); stack.push(j); }
        }
    }
    return seen.size === pieces.length;
}

export class ForgePanel {
    node: Node;
    private app: ForgeApp;
    private cellNodes: Node[] = [];
    private cellGs: Graphics[] = [];
    private cellLabels: (any | null)[] = [];
    private rowSlots: Node[] = [];
    private hintLabel: any;
    private highlightG: Graphics;
    // 拖拽状态
    private dragPiece: ForgePiece | null = null;
    private dragging = false;
    private startPos: Vec3 | null = null;
    private dragFromCell = -1;
    private rowDragIdx = -1;
    private rowDragging = false;
    private rowStartPos: Vec3 | null = null;

    constructor(parent: Node, app: ForgeApp) {
        this.app = app;
        this.node = makePanelNode();
        this.node.setParent(parent);
        this.node.setPosition(0, 105); // 顶部区域，城堡保持可见
        this.node.active = false;

        buildPanelChrome(this.node, this);
        const gridInfo = buildGrid(this.node, this);
        this.cellNodes = gridInfo.cellNodes;
        this.cellGs = gridInfo.cellGs;
        this.cellLabels = gridInfo.cellLabels;
        this.rowSlots = buildItemRow(this.node, this);
        this.highlightG = gridInfo.highlightG;
        this.hintLabel = gridInfo.hintLabel;
    }

    // ---------- 开/关 ----------
    open() {
        this.node.active = true;
        this.evaluate();
        this.renderAll();
    }

    close() {
        // 盘上字块保留在打造盘（不清空、不收回）
        this.clearHighlight();
        this.node.active = false;
    }

    isOpen(): boolean {
        return this.node.active;
    }

    // 返回：请求主控关闭打造盘（恢复战场状态）
    requestClose() {
        this.app.requestClose();
    }

    // 一键清空：字块回到物品栏（放不下的留在盘上）
    clearBoard() {
        let returned = 0;
        for (const piece of [...G.forgePieces]) {
            if (this.app.addItem(piece.char, 1)) {
                this.removePieceRaw(piece);
                returned++;
            }
        }
        this.evaluate();
        this.renderAll();
        if (G.forgePieces.length > 0) {
            this.app.showTip('物品栏空间不足，部分字块留在打造盘', 'error');
        } else if (returned > 0) {
            this.app.showTip(`已清空打造盘，${returned} 个字回到物品栏`, 'ok');
        }
    }

    // ---------- 合成判定 ----------
    // 一次性扫描所有配方，返回盘上全部可合成组合（互不占用字块）
    detectCombinations(): ComboResult[] {
        const pieces = G.forgePieces;
        const combos: ComboResult[] = [];
        const used = new Set<number>();
        for (const { result, parts } of RECIPES) {
            const n = parts.length;
            while (true) {
                const chosen: number[] = [];
                const find = (start: number): boolean => {
                    if (chosen.length === n) {
                        const chars = chosen.map(pi => pieces[pi].char);
                        return multisetEqual(chars, parts) && piecesConnected(chosen.map(pi => pieces[pi]));
                    }
                    for (let i = start; i < pieces.length; i++) {
                        if (used.has(i) || chosen.includes(i)) continue;
                        chosen.push(i);
                        if (find(i + 1)) return true;
                        chosen.pop();
                    }
                    return false;
                };
                if (!find(0)) break;
                for (const i of chosen) used.add(i);
                combos.push({ char: result, pieces: chosen.map(pi => pieces[pi]), roots: parts });
            }
        }
        return combos;
    }

    evaluate() {
        G.forgeResults = this.detectCombinations() as any;
    }

    // ---------- 摆放 ----------
    canFit(shape: Shape[], idx: number, ignorePiece?: ForgePiece): boolean {
        const { r, c } = getGridRowCol(idx);
        for (const [dr, dc] of shape) {
            const nr = r + dr, nc = c + dc;
            if (nr < 0 || nr >= 5 || nc < 0 || nc >= 5) return false;
            const cellChar = G.forgeGrid[nr * 5 + nc];
            if (cellChar) {
                // 拖动自身字块时临时腾出原占用格
                if (ignorePiece && this.pieceCovers(ignorePiece, nr * 5 + nc)) continue;
                return false;
            }
        }
        return true;
    }

    private pieceCovers(piece: ForgePiece, cellIdx: number): boolean {
        const { r, c } = getGridRowCol(piece.anchorIdx);
        for (const [dr, dc] of piece.shape) {
            if ((r + dr) * 5 + (c + dc) === cellIdx) return true;
        }
        return false;
    }

    // 优先目标格，其次最近可用格
    findFittingAnchor(shape: Shape[], dropIdx: number, ignorePiece?: ForgePiece): number {
        if (dropIdx >= 0 && this.canFit(shape, dropIdx, ignorePiece)) return dropIdx;
        let best = -1;
        let bestD = Infinity;
        const dr0 = Math.floor(dropIdx / 5), dc0 = dropIdx % 5;
        for (let i = 0; i < 25; i++) {
            if (!this.canFit(shape, i, ignorePiece)) continue;
            const r = Math.floor(i / 5), c = i % 5;
            const d = (r - dr0) * (r - dr0) + (c - dc0) * (c - dc0);
            if (d < bestD) { bestD = d; best = i; }
        }
        return best;
    }

    placePieceAt(char: string, idx: number): boolean {
        const shape = CHAR_SHAPES[char];
        if (!shape || !this.canFit(shape, idx)) return false;
        const { r, c } = getGridRowCol(idx);
        for (const [dr, dc] of shape) G.forgeGrid[(r + dr) * 5 + (c + dc)] = char;
        G.forgePieces.push({ char, anchorIdx: idx, shape });
        this.evaluate();
        this.renderAll();
        return true;
    }

    private removePieceRaw(piece: ForgePiece) {
        const pi = G.forgePieces.indexOf(piece);
        if (pi < 0) return;
        G.forgePieces.splice(pi, 1);
        const { r, c } = getGridRowCol(piece.anchorIdx);
        for (const [dr, dc] of piece.shape) G.forgeGrid[(r + dr) * 5 + (c + dc)] = null;
    }

    removePiece(piece: ForgePiece) {
        this.removePieceRaw(piece);
        this.evaluate();
        this.renderAll();
    }

    pieceAt(idx: number): ForgePiece | null {
        const { r, c } = getGridRowCol(idx);
        for (const piece of G.forgePieces) {
            const { r: pr, c: pc } = getGridRowCol(piece.anchorIdx);
            for (const [dr, dc] of piece.shape) {
                if (pr + dr === r && pc + dc === c) return piece;
            }
        }
        return null;
    }

    // 盘内调整位置：临时腾出原格寻找落点，找不到回退原位
    movePiece(piece: ForgePiece, dropIdx: number): boolean {
        const cand = dropIdx >= 0 ? this.findFittingAnchor(piece.shape, dropIdx, piece) : -1;
        if (cand < 0) return false;
        this.removePieceRaw(piece);
        const { r, c } = getGridRowCol(cand);
        for (const [dr, dc] of piece.shape) G.forgeGrid[(r + dr) * 5 + (c + dc)] = piece.char;
        piece.anchorIdx = cand;
        this.evaluate();
        this.renderAll();
        return true;
    }

    // 物品栏拖入/点击放入：从物品栏移除并按形状落位
    dropItemToGrid(char: string, itemIdx: number, cellIdx: number): boolean {
        if (!isSourceChar(char)) {
            this.app.showTip('合成字不能放入打造盘', 'error');
            return false;
        }
        const shape = CHAR_SHAPES[char];
        if (!shape) return false;
        const anchor = this.findFittingAnchor(shape, cellIdx >= 0 ? cellIdx : 12);
        if (anchor < 0) {
            this.app.showTip('打造盘放不下', 'error');
            return false;
        }
        this.app.removeItemByIdx(itemIdx);
        this.placePieceAt(char, anchor);
        return true;
    }

    // ---------- 确认合成（合成后保持弹窗打开，剩余组合留在盘上） ----------
    confirmForge() {
        const results: ComboResult[] = G.forgeResults || [];
        if (results.length === 0) {
            this.app.showTip('当前没有可合成的组合', 'error');
            return;
        }
        const freeSpace = 5 - G.items.length;
        const canMake = Math.min(results.length, freeSpace);
        if (canMake <= 0) {
            this.app.showTip('物品栏已满，无法合成', 'error');
            return;
        }
        const makeList = results.slice(0, canMake);
        const keepList = results.slice(canMake);
        for (const combo of makeList) {
            for (const piece of combo.pieces) this.removePieceRaw(piece);
        }
        for (const combo of makeList) {
            G.items.push({ char: combo.char, level: 1 });
        }
        this.evaluate();
        this.renderAll();
        this.app.refreshItemBar();
        if (keepList.length > 0) {
            this.app.showTip(`物品栏空间不足，已合成 ${canMake} 个，其余留在打造盘`, 'error');
        } else {
            const names = makeList.map(c => c.char).join('、');
            this.app.showTip(`合成成功：${names}`, 'ok');
        }
    }

    // ---------- 渲染 ----------
    renderAll() {
        this.renderGrid();
        this.renderItemRow();
        this.updateHint();
    }

    renderGrid() {
        for (let i = 0; i < 25; i++) {
            const g = this.cellGs[i];
            g.clear();
            const char = G.forgeGrid[i];
            const forming = this.resultCovers(i);
            let bg = THEME.cellBg;
            let border = '#2c3148';
            if (char) { bg = THEME.cellFilledBg; border = '#46507a'; }
            if (forming) { bg = THEME.cellFormingBg; border = '#4ecdc4'; }
            fillRoundRect(g, -CELL / 2, -CELL / 2, CELL, CELL, 3, hexColor(bg));
            strokeRoundRect(g, -CELL / 2, -CELL / 2, CELL, CELL, 3, hexColor(border), forming ? 2 : 1);
            if (char) {
                if (!this.cellLabels[i]) {
                    this.cellLabels[i] = makeLabel(this.cellNodes[i], '', 26, '#dddddd');
                }
                const lb = this.cellLabels[i]!;
                lb.string = char;
                lb.color = hexColor(forming ? '#7ee8e0' : '#dddddd');
                lb.node.active = true;
            } else if (this.cellLabels[i]) {
                this.cellLabels[i]!.node.active = false;
            }
        }
    }

    private resultCovers(i: number): boolean {
        const r = Math.floor(i / 5), c = i % 5;
        for (const combo of (G.forgeResults as ComboResult[]) || []) {
            for (const piece of combo.pieces) {
                const { r: pr, c: pc } = getGridRowCol(piece.anchorIdx);
                for (const [dr, dc] of piece.shape) {
                    if (pr + dr === r && pc + dc === c) return true;
                }
            }
        }
        return false;
    }

    private updateHint() {
        const results: ComboResult[] = G.forgeResults || [];
        if (results.length) {
            const c = results[0].char;
            this.hintLabel.string = results.length > 1 ? `→「${c}」×${results.length}` : `→「${c}」`;
            this.hintLabel.color = hexColor('#4ecdc4');
        } else {
            this.hintLabel.string = G.forgePieces.length > 0 ? '无法合成' : '拖入独体字';
            this.hintLabel.color = hexColor(G.forgePieces.length > 0 ? '#ff9800' : '#8a93a8');
        }
    }

    renderItemRow() {
        for (let i = 0; i < 5; i++) {
            const slot = this.rowSlots[i];
            for (let j = slot.children.length - 1; j >= 0; j--) slot.children[j].destroy();
            const g = slot.getComponent(Graphics)!;
            g.clear();
            const item: Item | undefined = G.items[i];
            fillRoundRect(g, -ROW_SLOT_W / 2, -ROW_SLOT_H / 2, ROW_SLOT_W, ROW_SLOT_H, 4, hexColor(THEME.slotBg));
            strokeRoundRect(g, -ROW_SLOT_W / 2, -ROW_SLOT_H / 2, ROW_SLOT_W, ROW_SLOT_H, 4,
                hexColor(item ? (isSourceChar(item.char) ? '#4ecdc4' : '#ffd54f') : THEME.slotBorder), 1);
            if (!item) continue;
            const stats = TOWER_STATS[item.char];
            const colorHex = stats ? stats.color : '#dddddd';
            const chLb = makeLabel(slot, item.char, 22, colorHex);
            chLb.node.setPosition(0, 12);
            if (isSourceChar(item.char)) {
                const thumb = makeShapeThumb(item.char, 8, colorHex);
                if (thumb) {
                    thumb.setParent(slot);
                    thumb.setPosition(0, -14);
                }
            } else {
                const dLb = makeLabel(slot, '合成', 9, colorHex, false);
                dLb.node.setPosition(0, -14);
            }
            if (item.level > 1) {
                const lv = makeLabel(slot, 'Lv' + item.level, 10, '#ffffff', false);
                lv.node.setPosition(ROW_SLOT_W / 2 - 16, -ROW_SLOT_H / 2 + 10);
            }
        }
    }

    // 拖拽落点预览（绿色=可放，红色=不可放）
    showDropPreview(char: string, e: EventTouch) {
        this.clearHighlight();
        const shape = CHAR_SHAPES[char];
        if (!shape) return;
        const idx = this.cellIndexAt(e);
        if (idx < 0) return;
        const anchor = this.findFittingAnchor(shape, idx);
        if (anchor < 0) return;
        const ok = this.canFit(shape, idx);
        const color = ok ? '#4ecdc4' : '#e94560';
        const g = this.highlightG;
        const { r, c } = getGridRowCol(anchor);
        g.strokeColor = hexColor(color, 180);
        g.lineWidth = 2;
        for (const [dr, dc] of shape) {
            const nr = r + dr, nc = c + dc;
            const x = this.cellX(nc), y = this.cellY(nr);
            g.roundRect(x - CELL / 2 - 2, y - CELL / 2 - 2, CELL + 4, CELL + 4, 4);
            g.stroke();
        }
    }

    showMovePreview(piece: ForgePiece, e: EventTouch) {
        this.clearHighlight();
        const idx = this.cellIndexAt(e);
        if (idx < 0) return;
        const anchor = this.findFittingAnchor(piece.shape, idx, piece);
        const g = this.highlightG;
        if (anchor < 0) {
            // 无处可放：红框提示
            g.strokeColor = hexColor('#e94560', 180);
            g.lineWidth = 2;
            const { r, c } = getGridRowCol(idx);
            const x = this.cellX(c), y = this.cellY(r);
            g.roundRect(x - CELL / 2 - 2, y - CELL / 2 - 2, CELL + 4, CELL + 4, 4);
            g.stroke();
            return;
        }
        g.strokeColor = hexColor('#4ecdc4', 180);
        g.lineWidth = 2;
        const { r, c } = getGridRowCol(anchor);
        for (const [dr, dc] of piece.shape) {
            const nr = r + dr, nc = c + dc;
            const x = this.cellX(nc), y = this.cellY(nr);
            g.roundRect(x - CELL / 2 - 2, y - CELL / 2 - 2, CELL + 4, CELL + 4, 4);
            g.stroke();
        }
    }

    clearHighlight() {
        this.highlightG.clear();
    }

    cellX(c: number) { return -GRID_W / 2 + CELL / 2 + c * (CELL + GAP); }
    cellY(r: number) { return GRID_W / 2 - CELL / 2 - r * (CELL + GAP); }

    // ---------- 命中检测 ----------
    panelContains(e: EventTouch): boolean {
        return touchInNode(e, this.node);
    }

    gridContains(e: EventTouch): boolean {
        const local = this.gridLocal(e);
        return Math.abs(local.x) <= GRID_W / 2 + 8 && Math.abs(local.y) <= GRID_W / 2 + 8;
    }

    private gridNode: Node | null = null;
    gridLocal(e: EventTouch): Vec3 {
        const node = this.gridNode || this.cellNodes[12].parent!;
        this.gridNode = node;
        return touchLocal(e, node);
    }

    cellIndexAt(e: EventTouch): number {
        const local = this.gridLocal(e);
        const c = Math.floor((local.x + GRID_W / 2) / (CELL + GAP));
        const r = Math.floor((GRID_W / 2 - local.y) / (CELL + GAP));
        if (r < 0 || r >= 5 || c < 0 || c >= 5) return -1;
        return r * 5 + c;
    }

    rowSlotIndexAt(e: EventTouch): number {
        for (let i = 0; i < this.rowSlots.length; i++) {
            if (touchInNode(e, this.rowSlots[i])) return i;
        }
        return -1;
    }

    // ---------- 内部拖拽状态机（供构建函数使用） ----------
    handleCellTouchStart(i: number, e: EventTouch) {
        const piece = this.pieceAt(i);
        if (!piece) return;
        this.dragPiece = piece;
        this.dragFromCell = i;
        this.dragging = false;
        const ui = e.getUILocation();
        this.startPos = new Vec3(ui.x, ui.y, 0);
    }

    handleCellTouchMove(i: number, e: EventTouch) {
        if (!this.dragPiece || this.dragFromCell !== i || !this.startPos) return;
        const ui = e.getUILocation();
        if (!this.dragging) {
            if (Math.hypot(ui.x - this.startPos.x, ui.y - this.startPos.y) > 10) {
                this.dragging = true;
                this.app.onPieceDragStart(this.dragPiece, e);
            }
        } else {
            this.app.onPieceDragMove(e);
        }
    }

    handleCellTouchEnd(i: number, e: EventTouch) {
        if (this.dragging) {
            this.dragging = false;
            this.dragPiece = null;
            this.dragFromCell = -1;
            this.app.onPieceDragEnd(e);
            return;
        }
        // 点击：移出打造盘回到物品栏
        const piece = this.pieceAt(i);
        if (piece) {
            if (this.app.addItem(piece.char, 1)) {
                this.removePiece(piece);
                this.app.refreshItemBar();
            } else {
                this.app.showTip('物品栏已满', 'error');
            }
        }
        this.dragPiece = null;
        this.dragFromCell = -1;
    }

    handleCellTouchCancel(e: EventTouch) {
        if (this.dragging) {
            this.dragging = false;
            this.dragPiece = null;
            this.dragFromCell = -1;
            // 拖出节点范围松手时引擎派发 CANCEL：按正常放置处理
            this.app.onPieceDragEnd(e);
            return;
        }
        // 点击但松手滑出格子（引擎转成 CANCEL）：按按下时的格子回收
        const i = this.dragFromCell;
        if (i >= 0) {
            const piece = this.pieceAt(i);
            if (piece) {
                if (this.app.addItem(piece.char, 1)) {
                    this.removePiece(piece);
                    this.app.refreshItemBar();
                } else {
                    this.app.showTip('物品栏已满', 'error');
                }
            }
        }
        this.dragPiece = null;
        this.dragFromCell = -1;
    }

    handleRowTouchStart(i: number, e: EventTouch) {
        this.rowDragIdx = i;
        this.rowDragging = false;
        const ui = e.getUILocation();
        this.rowStartPos = new Vec3(ui.x, ui.y, 0);
    }

    handleRowTouchMove(i: number, e: EventTouch) {
        if (this.rowDragIdx !== i || !this.rowStartPos) return;
        if (!G.items[i]) return;
        const ui = e.getUILocation();
        if (!this.rowDragging) {
            if (Math.hypot(ui.x - this.rowStartPos.x, ui.y - this.rowStartPos.y) > 10) {
                this.rowDragging = true;
                this.app.onForgeItemDragStart(i, e);
            }
        } else {
            this.app.onForgeItemDragMove(e);
        }
    }

    handleRowTouchEnd(i: number, e: EventTouch) {
        if (this.rowDragging) {
            this.rowDragging = false;
            this.rowDragIdx = -1;
            this.app.onForgeItemDragEnd(e);
            return;
        }
        // 点击：独体字直接放入打造盘
        const item = G.items[i];
        if (item) {
            if (isSourceChar(item.char)) {
                this.dropItemToGrid(item.char, i, 12);
                this.app.refreshItemBar();
            } else {
                this.app.showTip('合成字不能放入打造盘', 'error');
            }
        }
        this.rowDragIdx = -1;
    }

    handleRowTouchCancel(e: EventTouch) {
        if (this.rowDragging) {
            this.rowDragging = false;
            this.rowDragIdx = -1;
            // 拖出节点范围松手时引擎派发 CANCEL：按正常放置处理
            this.app.onForgeItemDragEnd(e);
            return;
        }
        this.rowDragIdx = -1;
    }
}

// ============================================================
// 面板构建（独立函数，保持构造器简洁）
// ============================================================
function makePanelNode(): Node {
    const n = makeNode('forge-panel', PANEL_W, PANEL_H);
    const g = n.addComponent(Graphics);
    fillRoundRect(g, -PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 10, hexColor('#1a2036', 245));
    strokeRoundRect(g, -PANEL_W / 2, -PANEL_H / 2, PANEL_W, PANEL_H, 10, hexColor('#4ecdc4'), 2);
    return n;
}

function buildPanelChrome(panel: Node, self: ForgePanel) {
    // 「返回」按钮：左上（关闭打造盘，字块保留在盘上）
    const backBtn = makeNode('btn-back', 52, 26);
    backBtn.setParent(panel);
    backBtn.setPosition(-PANEL_W / 2 + 88, PANEL_H / 2 - 88);
    const bg2 = backBtn.addComponent(Graphics);
    fillRoundRect(bg2, -26, -13, 52, 26, 5, hexColor('#232b48'));
    strokeRoundRect(bg2, -26, -13, 52, 26, 5, hexColor('#5a6a9a'), 1);
    makeLabel(backBtn, '返回', 13, '#cfd6ea', false);
    backBtn.on(Node.EventType.TOUCH_END, () => self.requestClose());

    // 「清」按钮：左上
    const clearBtn = makeNode('btn-clear', 46, 26);
    clearBtn.setParent(panel);
    clearBtn.setPosition(-PANEL_W / 2 + 33, PANEL_H / 2 - 88);
    const cg = clearBtn.addComponent(Graphics);
    fillRoundRect(cg, -23, -13, 46, 26, 5, hexColor('#3a2230'));
    strokeRoundRect(cg, -23, -13, 46, 26, 5, hexColor('#e94560'), 1);
    makeLabel(clearBtn, '清', 15, '#ff9fb0', false);
    clearBtn.on(Node.EventType.TOUCH_END, () => self.clearBoard());

    // 确认按钮：底部（大）
    const confirmBtn = makeNode('btn-confirm', 240, 48);
    confirmBtn.setParent(panel);
    confirmBtn.setPosition(0, -PANEL_H / 2 + 34);
    const cfg2 = confirmBtn.addComponent(Graphics);
    fillRoundRect(cfg2, -120, -24, 240, 48, 10, hexColor('#2a6f6a'));
    strokeRoundRect(cfg2, -120, -24, 240, 48, 10, hexColor('#4ecdc4'), 2);
    makeLabel(confirmBtn, '确 认 合 成', 20, '#eafffb');
    confirmBtn.on(Node.EventType.TOUCH_END, () => {
        self.confirmForge();
    });
}

interface GridBuildInfo {
    cellNodes: Node[];
    cellGs: Graphics[];
    cellLabels: (any | null)[];
    highlightG: Graphics;
    hintLabel: any;
}

function buildGrid(panel: Node, self: ForgePanel): GridBuildInfo {
    const gridRoot = makeNode('grid', GRID_W, GRID_W);
    gridRoot.setParent(panel);
    // 网格中心：物品栏行与工具行之下
    const gridCenterY = PANEL_H / 2 - 8 - 56 - 6 - 24 - 8 - GRID_W / 2 + 4;
    gridRoot.setPosition(0, gridCenterY);

    const cellNodes: Node[] = [];
    const cellGs: Graphics[] = [];
    const cellLabels: (any | null)[] = [];

    for (let i = 0; i < 25; i++) {
        const { r, c } = getGridRowCol(i);
        const cell = makeNode('cell' + i, CELL, CELL);
        cell.setParent(gridRoot);
        cell.setPosition(self.cellX(c), self.cellY(r));
        cellGs.push(cell.addComponent(Graphics));
        cellNodes.push(cell);
        cellLabels.push(null);
        const idx = i;
        cell.on(Node.EventType.TOUCH_START, (e: EventTouch) => self.handleCellTouchStart(idx, e));
        cell.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => self.handleCellTouchMove(idx, e));
        cell.on(Node.EventType.TOUCH_END, (e: EventTouch) => self.handleCellTouchEnd(idx, e));
        cell.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => self.handleCellTouchCancel(e));
    }

    // 落点预览层
    const hl = makeNode('highlight', GRID_W, GRID_W);
    hl.setParent(gridRoot);
    hl.setPosition(0, 0);
    const highlightG = hl.addComponent(Graphics);

    // 合成提示：右上
    const hintLabel = makeLabel(panel, '', 17, '#4ecdc4');
    hintLabel.node.setPosition(PANEL_W / 2 - 76, PANEL_H / 2 - 88);

    return { cellNodes, cellGs, cellLabels, highlightG, hintLabel };
}

function buildItemRow(panel: Node, self: ForgePanel): Node[] {
    const row = makeNode('item-row', PANEL_W - 12, ROW_SLOT_H);
    row.setParent(panel);
    row.setPosition(0, PANEL_H / 2 - 8 - ROW_SLOT_H / 2 - 2);
    const slots: Node[] = [];
    for (let i = 0; i < 5; i++) {
        const x = -(PANEL_W - 12) / 2 + ROW_SLOT_W / 2 + 4 + i * (ROW_SLOT_W + 6);
        const slot = makeNode('row-slot' + i, ROW_SLOT_W, ROW_SLOT_H);
        slot.setParent(row);
        slot.setPosition(x, 0);
        slot.addComponent(Graphics);
        const idx = i;
        slot.on(Node.EventType.TOUCH_START, (e: EventTouch) => self.handleRowTouchStart(idx, e));
        slot.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => self.handleRowTouchMove(idx, e));
        slot.on(Node.EventType.TOUCH_END, (e: EventTouch) => self.handleRowTouchEnd(idx, e));
        slot.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => self.handleRowTouchCancel(e));
        slots.push(slot);
    }
    return slots;
}
