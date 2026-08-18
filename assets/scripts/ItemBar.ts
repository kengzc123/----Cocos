// ============================================================
// 物品栏：5 槽渲染 + 点击菜单（合并升级/销毁）+ 拖拽发起
// 位于战场(-280)与底栏(-360)之间：390×78，中心 y=-320
// ============================================================
import { Node, Graphics, EventTouch, Vec3 } from 'cc';
import { G, TOWER_STATS, MAX_LEVEL, isSourceChar, Item } from './Config';
import {
    hexColor, makeNode, makeLabel, fillRoundRect, strokeRoundRect,
    touchInNode, makeShapeThumb, THEME,
} from './Theme';

export interface ItemBarApp {
    onItemBarDragStart(idx: number, e: EventTouch): void;
    onItemBarDragMove(e: EventTouch): void;
    onItemBarDragEnd(e: EventTouch): void;
    onItemBarDragCancel(): void;
    mergeItems(char: string, level: number): boolean;
    destroyItem(char: string, level: number): void;
    showTip(text: string, cls: 'error' | 'ok' | ''): void;
}

const BAR_W = 390;
const BAR_H = 78;
const SLOT_W = 70;
const SLOT_H = 72;
const SLOT_GAP = 4;

export class ItemBar {
    node: Node;
    private app: ItemBarApp;
    private slotNodes: Node[] = [];
    private menu: Node | null = null;
    private selectedIdx = -1;
    // 每槽拖拽状态
    private dragIdx = -1;
    private dragging = false;
    private startPos: Vec3 | null = null;

    constructor(parent: Node, app: ItemBarApp) {
        this.app = app;
        this.node = makeNode('item-bar', BAR_W, BAR_H);
        this.node.setParent(parent);
        this.node.setPosition(0, -320);

        const startX = -((SLOT_W * 5 + SLOT_GAP * 4) / 2) + SLOT_W / 2;
        for (let i = 0; i < 5; i++) {
            const slot = this.makeSlot(i);
            slot.setPosition(startX + i * (SLOT_W + SLOT_GAP), 0);
            this.node.addChild(slot);
            this.slotNodes.push(slot);
        }

        // 捕获阶段监听：点击菜单外任意处关闭菜单
        parent.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
            if (this.menu && !touchInNode(e, this.menu)) {
                this.closeMenu();
            }
        }, this, true);
    }

    private makeSlot(i: number): Node {
        const n = makeNode('slot' + i, SLOT_W, SLOT_H);
        n.addComponent(Graphics);
        n.on(Node.EventType.TOUCH_START, (e: EventTouch) => {
            this.dragIdx = i;
            this.dragging = false;
            const ui = e.getUILocation();
            this.startPos = new Vec3(ui.x, ui.y, 0);
        });
        n.on(Node.EventType.TOUCH_MOVE, (e: EventTouch) => {
            if (this.dragIdx !== i || !this.startPos) return;
            const ui = e.getUILocation();
            if (!this.dragging) {
                if (Math.hypot(ui.x - this.startPos.x, ui.y - this.startPos.y) > 10) {
                    if (G.items[i]) {
                        this.dragging = true;
                        this.closeMenu();
                        this.app.onItemBarDragStart(i, e);
                    }
                }
            } else {
                this.app.onItemBarDragMove(e);
            }
        });
        n.on(Node.EventType.TOUCH_END, (e: EventTouch) => {
            if (this.dragging) {
                this.dragging = false;
                this.dragIdx = -1;
                this.app.onItemBarDragEnd(e);
                return;
            }
            if (this.dragIdx === i) {
                this.dragIdx = -1;
                this.handleClick(i);
            }
        });
        n.on(Node.EventType.TOUCH_CANCEL, (e: EventTouch) => {
            if (this.dragging) {
                this.dragging = false;
                this.dragIdx = -1;
                // 拖出节点范围松手时引擎派发 CANCEL：按正常放置处理（坐标为最后触点位置）
                this.app.onItemBarDragEnd(e);
                return;
            }
            this.dragIdx = -1;
        });
        return n;
    }

    private drawSlotBg(n: Node, i: number, selected: boolean) {
        const g = n.getComponent(Graphics)!;
        g.clear();
        const filled = !!G.items[i];
        fillRoundRect(g, -SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 4, hexColor(THEME.slotBg));
        strokeRoundRect(g, -SLOT_W / 2, -SLOT_H / 2, SLOT_W, SLOT_H, 4,
            hexColor(selected ? THEME.accent : filled ? '#4a5578' : THEME.slotBorder),
            selected ? 2 : 1);
    }

    // 点击槽位：弹菜单（合并升级 / 销毁）
    private handleClick(i: number) {
        const item = G.items[i];
        if (!item) {
            this.closeMenu();
            return;
        }
        if (this.selectedIdx === i) {
            this.closeMenu();
            return;
        }
        this.closeMenu();
        this.selectedIdx = i;
        this.render();
        this.showMenu(i);
    }

    // ============================================================
    // 渲染
    // ============================================================
    render() {
        for (let i = 0; i < 5; i++) {
            const slot = this.slotNodes[i];
            for (let j = slot.children.length - 1; j >= 0; j--) {
                slot.children[j].destroy();
            }
            this.drawSlotBg(slot, i, this.selectedIdx === i);
            const item: Item | undefined = G.items[i];
            if (!item) continue;
            const stats = TOWER_STATS[item.char];
            const colorHex = stats ? stats.color : '#dddddd';
            // 字
            const chLb = makeLabel(slot, item.char, 22, colorHex);
            chLb.node.setPosition(0, 16);
            // 形状缩略（独体字）/ 合成标记
            if (isSourceChar(item.char)) {
                const thumb = makeShapeThumb(item.char, 8, colorHex);
                if (thumb) {
                    thumb.setParent(slot);
                    thumb.setPosition(0, -14);
                }
            } else {
                const dLb = makeLabel(slot, '合成', 10, colorHex, false);
                dLb.node.setPosition(0, -16);
            }
            // 等级角标
            if (item.level > 1) {
                const lv = makeLabel(slot, 'Lv' + item.level, 10, '#ffffff', false);
                lv.node.setPosition(SLOT_W / 2 - 16, -SLOT_H / 2 + 11);
            }
        }
    }

    // ============================================================
    // 物品菜单（合并升级 / 销毁）
    // ============================================================
    private showMenu(i: number) {
        this.closeMenu();
        const item = G.items[i];
        if (!item) return;
        const menu = makeNode('item-menu', 156, 38);
        menu.setParent(this.node);
        const slotX = this.slotNodes[i].position.x;
        menu.setPosition(Math.max(-BAR_W / 2 + 80, Math.min(BAR_W / 2 - 80, slotX)), SLOT_H / 2 + 24);
        const g = menu.addComponent(Graphics);
        fillRoundRect(g, -78, -19, 156, 38, 7, hexColor('#20263e'));
        strokeRoundRect(g, -78, -19, 156, 38, 7, hexColor(THEME.border), 1);

        const count = G.items.filter(it => it.char === item.char && it.level === item.level).length;
        let x = -78;
        const btnW = 78;
        if (count >= 2 && item.level < MAX_LEVEL) {
            const mergeBtn = makeNode('merge', btnW, 38);
            mergeBtn.setParent(menu);
            mergeBtn.setPosition(x + btnW / 2, 0);
            const mg = mergeBtn.addComponent(Graphics);
            fillRoundRect(mg, -btnW / 2 + 2, -17, btnW - 4, 34, 5, hexColor('#2a6f6a'));
            makeLabel(mergeBtn, `合并Lv${item.level + 1}`, 12, '#eafffb', false);
            mergeBtn.on(Node.EventType.TOUCH_END, () => {
                this.app.mergeItems(item.char, item.level);
                this.closeMenu();
            });
            x += btnW;
        }
        const delBtn = makeNode('del', btnW, 38);
        delBtn.setParent(menu);
        delBtn.setPosition(x + btnW / 2, 0);
        const dg = delBtn.addComponent(Graphics);
        fillRoundRect(dg, -btnW / 2 + 2, -17, btnW - 4, 34, 5, hexColor('#5a2a35'));
        makeLabel(delBtn, '销毁', 12, '#ffb4c0', false);
        delBtn.on(Node.EventType.TOUCH_END, () => {
            this.app.destroyItem(item.char, item.level);
            this.closeMenu();
        });

        this.menu = menu;
    }

    closeMenu() {
        if (this.menu) {
            this.menu.destroy();
            this.menu = null;
        }
        if (this.selectedIdx >= 0) {
            this.selectedIdx = -1;
            this.render();
        }
    }

    // 判断触摸落在哪个槽（拖拽合并判定用）
    slotIndexAt(e: EventTouch): number {
        for (let i = 0; i < this.slotNodes.length; i++) {
            if (touchInNode(e, this.slotNodes[i])) return i;
        }
        return -1;
    }
}
