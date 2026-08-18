// ============================================================
// UI 辅助：主题色 / 节点构建 / 通用控件
// 设计分辨率 390×844（竖屏），坐标 y 向上
// ============================================================
import { Node, Label, Graphics, UITransform, Color, Vec3, EventTouch, Layers, Camera } from 'cc';
import { CHAR_SHAPES } from './Config';

export const DESIGN_W = 390;
export const DESIGN_H = 844;

export const THEME = {
    bg: '#12121f',
    panel: '#1a1f35',
    border: '#2c3a5c',
    accent: '#4ecdc4',
    danger: '#e94560',
    text: '#eeeeee',
    muted: '#8a93a8',
    slotBg: '#141828',
    slotBorder: '#2c3148',
    towerColor: '#ffd54f',
    cellBg: '#161a2c',
    cellFilledBg: '#28304e',
    cellFormingBg: '#16424a',
};

export function hexColor(hex: string, alpha = 255): Color {
    const c = new Color();
    Color.fromHEX(c, hex);
    c.a = alpha;
    return c;
}

// 创建带 UITransform 的节点（UI_2D 层，可被 UI 相机渲染、可命中触摸）
export function makeNode(name: string, w = 0, h = 0): Node {
    const n = new Node(name);
    n.layer = Layers.Enum.UI_2D;
    const ut = n.addComponent(UITransform);
    if (w > 0) ut.width = w;
    if (h > 0) ut.height = h;
    return n;
}

// 创建 Label（系统字体，居中）
export function makeLabel(parent: Node, text: string, fontSize: number, colorHex: string, bold = true): Label {
    const n = new Node('label');
    n.layer = Layers.Enum.UI_2D;
    n.setParent(parent);
    n.addComponent(UITransform);
    const lb = n.addComponent(Label);
    lb.string = text;
    lb.fontSize = fontSize;
    lb.lineHeight = Math.round(fontSize * 1.2);
    lb.isBold = bold;
    lb.color = hexColor(colorHex);
    return lb;
}

export function fillRoundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number, color: Color) {
    const rr = Math.min(r, w / 2, h / 2);
    g.fillColor = color;
    g.roundRect(x, y, w, h, rr);
    g.fill();
}

export function strokeRoundRect(g: Graphics, x: number, y: number, w: number, h: number, r: number, color: Color, lineWidth = 2) {
    const rr = Math.min(r, w / 2, h / 2);
    g.strokeColor = color;
    g.lineWidth = lineWidth;
    g.roundRect(x, y, w, h, rr);
    g.stroke();
}

export function makePanel(name: string, w: number, h: number, bgHex: string, borderHex: string, radius = 8, borderWidth = 2): Node {
    const n = makeNode(name, w, h);
    const g = n.addComponent(Graphics);
    fillRoundRect(g, -w / 2, -h / 2, w, h, radius, hexColor(bgHex));
    strokeRoundRect(g, -w / 2, -h / 2, w, h, radius, hexColor(borderHex), borderWidth);
    return n;
}

// 按钮：圆角背景 + 文字 + 点击回调
export function makeButton(parent: Node, name: string, text: string, w: number, h: number,
    bgHex: string, fgHex: string, fontSize: number, onClick: () => void, radius = 8, bold = true): Node {
    const n = makeNode(name, w, h);
    n.setParent(parent);
    const g = n.addComponent(Graphics);
    fillRoundRect(g, -w / 2, -h / 2, w, h, radius, hexColor(bgHex));
    makeLabel(n, text, fontSize, fgHex, bold);
    n.on(Node.EventType.TOUCH_END, () => {
        onClick();
    });
    return n;
}

// 触摸相机：由 GameApp 注入，用于屏幕坐标 → 世界坐标的精确换算
// （getUILocation 与世界坐标在缩放环境下存在偏差，统一走相机换算）
let touchCam: Camera | null = null;
export function setTouchCamera(cam: Camera | null) {
    touchCam = cam;
}

export function touchWorldPos(e: EventTouch): Vec3 {
    if (touchCam) {
        const loc = e.getLocation();
        return touchCam.screenToWorld(new Vec3(loc.x, loc.y, 0));
    }
    const ui = e.getUILocation();
    return new Vec3(ui.x, ui.y, 0);
}

// 触摸点 → 节点局部坐标
export function touchLocal(e: EventTouch, node: Node): Vec3 {
    const ut = node.getComponent(UITransform)!;
    return ut.convertToNodeSpaceAR(touchWorldPos(e));
}

// 触摸点是否落在节点矩形内（世界包围盒）
export function touchInNode(e: EventTouch, node: Node): boolean {
    const ut = node.getComponent(UITransform);
    if (!ut) return false;
    return ut.getBoundingBoxToWorld().contains(touchWorldPos(e));
}

// 独体字形状缩略图（物品栏格子显示打造盘占位缩略图）
export function makeShapeThumb(char: string, cellSize: number, colorHex: string): Node | null {
    const shape = CHAR_SHAPES[char];
    if (!shape || !shape.length) return null;
    let minR = 99, maxR = -99, minC = 99, maxC = -99;
    for (const [dr, dc] of shape) {
        if (dr < minR) minR = dr;
        if (dr > maxR) maxR = dr;
        if (dc < minC) minC = dc;
        if (dc > maxC) maxC = dc;
    }
    const rows = maxR - minR + 1, cols = maxC - minC + 1;
    const gap = Math.max(1, Math.round(cellSize * 0.18));
    const owner = new Set(shape.map(([dr, dc]) => (dr - minR) * cols + (dc - minC)));
    const w = (cellSize + gap) * cols - gap;
    const h = (cellSize + gap) * rows - gap;
    const n = makeNode('thumb', w, h);
    const g = n.addComponent(Graphics);
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const x = -w / 2 + (cellSize + gap) * c;
            const y = h / 2 - (cellSize + gap) * r - cellSize;
            if (owner.has(r * cols + c)) {
                fillRoundRect(g, x, y, cellSize, cellSize, 2, hexColor(colorHex));
            } else {
                strokeRoundRect(g, x, y, cellSize, cellSize, 2, hexColor('#ffffff', 40), 1);
            }
        }
    }
    return n;
}
