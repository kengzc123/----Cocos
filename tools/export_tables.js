// ============================================================
// 文字塔防 导表工具
//   表格/stage.xlsx + 表格/monster.xlsx → assets/resources/{stages,monsters}.json
//   同时生成 导表报告.html（导入摘要 + 校验结果）
// 用法：node export_tables.js [--stage 路径] [--monster 路径] [--out 目录]
//   或双击项目根目录 导表.bat
// 校验失败（error）时不写出 json，退出码 1；warning 不阻塞
// ============================================================
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
function argOf(name, def) {
    const i = args.indexOf(name);
    return i >= 0 && args[i + 1] ? args[i + 1] : def;
}
const STAGE_XLSX = path.resolve(ROOT, argOf('--stage', path.join('表格', 'stage.xlsx')));
const MONSTER_XLSX = path.resolve(ROOT, argOf('--monster', path.join('表格', 'monster.xlsx')));
const OUT_DIR = path.resolve(ROOT, argOf('--out', path.join('assets', 'resources')));

const errors = [];
const warnings = [];
const err = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

// ---------- 读表：第 0 行列名 → 数据从第 2 行起（第 1 行是中文说明） ----------
function readSheet(file, sheetName) {
    if (!fs.existsSync(file)) throw new Error(`找不到表格文件：${file}`);
    const wb = XLSX.readFile(file);
    const ws = wb.Sheets[sheetName || wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
    const header = (rows[0] || []).map(s => String(s).trim());
    const col = {};
    header.forEach((h, i) => { if (h && !(h in col)) col[h] = i; });
    const data = [];
    for (let i = 2; i < rows.length; i++) {
        const r = rows[i];
        if (!r || r.every(c => c === '' || c === null || c === undefined)) continue;
        const obj = {};
        for (const h in col) obj[h] = r[col[h]];
        data.push(obj);
    }
    return data;
}

function toNum(v, def = 0) {
    const n = typeof v === 'number' ? v : parseFloat(String(v).trim());
    return isNaN(n) ? def : n;
}
function toStr(v) { return String(v === null || v === undefined ? '' : v).trim(); }

// ---------- monster 表 ----------
const monsterData = readSheet(MONSTER_XLSX, 'monster');
const monsters = [];          // 紧凑行 [type,level,isBoss,attack,attackFar,attackCd,blood,speed,name,buffTarget,buffEffect,buffEffectPara]
const monsterById = new Map(); // monsterId → {type,level,isBoss,name}
const typeLevelSet = new Set(); // "type:level"
const bossTypes = new Set();
const typeNames = new Map();  // 类型 → 名（去掉 Lv 后缀）

for (const r of monsterData) {
    const monsterId = toNum(r.monsterId);
    const type = toNum(r.monsterType);
    const level = toNum(r.level);
    const name = toStr(r.备注);
    const rowNo = monsterData.indexOf(r) + 3; // Excel 实际行号（表头2行）
    if (!type || !level) { err(`monster 表第 ${rowNo} 行：monsterType/level 非法（${r.monsterType},${r.level}）`); continue; }
    if (monsterId && monsterId !== type * 100 + level) {
        warn(`monster 表第 ${rowNo} 行：monsterId ${monsterId} ≠ type×100+level（${type * 100 + level}），按后者入库`);
    }
    if (monsterById.has(type * 100 + level)) { err(`monster 表第 ${rowNo} 行：monsterId ${type * 100 + level} 重复`); continue; }
    const isBoss = r.isBoss === true || toStr(r.isBoss).toLowerCase() === 'true';
    const entry = {
        type, level, isBoss, name: name || `类型${type} Lv${level}`,
        attack: toNum(r.attack), attackFar: toNum(r.attackFar), attackCd: toNum(r.attackCd),
        blood: toNum(r.blood), speed: toNum(r.speed),
    };
    if (entry.blood < 1) { err(`monster 表第 ${rowNo} 行（${entry.name}）：血量 ${entry.blood} 非法`); continue; }
    monsterById.set(type * 100 + level, entry);
    typeLevelSet.add(`${type}:${level}`);
    if (isBoss) bossTypes.add(type);
    if (!typeNames.has(type)) typeNames.set(type, entry.name.replace(/\s*Lv\d+\s*$/, '').trim());

    monsters.push([
        type, level, isBoss ? 1 : 0,
        entry.attack, entry.attackFar, entry.attackCd, entry.blood, entry.speed,
        entry.name, toStr(r.buffTarget), toNum(r.buffEffect), toNum(r.buffEffectPara),
    ]);
}

// 类型×等级连续性（1..max 无缺口）
{
    const byType = new Map();
    for (const e of monsterById.values()) {
        if (!byType.has(e.type)) byType.set(e.type, []);
        byType.get(e.type).push(e.level);
    }
    for (const [t, levels] of byType) {
        const max = Math.max(...levels);
        for (let l = 1; l <= max; l++) {
            if (!levels.includes(l)) warn(`monster 类型 ${t}（${typeNames.get(t) || ''}）缺 Lv${l} 行（运行时将就近向下取）`);
        }
    }
}

// ---------- stage 表 ----------
const stageData = readSheet(STAGE_XLSX, 'stage');
const stageRows = [];
const stageIds = new Set();

function parseNums(raw) {
    return toStr(raw).split(/[;,，；]/).map(s => parseFloat(s.trim())).filter(n => !isNaN(n));
}
function parseTokens(raw) {
    return toStr(raw).split(/[;,，；\s]/).map(s => s.trim()).filter(s => s.length > 0);
}

// Excel 千分位修复：设计者填 660,1320 时 Excel 可能吞掉逗号存成数字 6601320（三千位+剩余）
function fixThousandPair(cell, stageId, label) {
    if (typeof cell === 'number' && cell >= 100000) {
        const s = String(Math.round(cell));
        const min = parseInt(s.slice(0, 3), 10);
        const max = parseInt(s.slice(3), 10);
        if (min > 0 && max > min) {
            warn(`stage ${stageId}：${label} 单元格是数字 ${cell}（Excel 千分位吞了逗号），按 ${min},${max} 处理`);
            return `${min},${max}`;
        }
    }
    return cell;
}

for (const r of stageData) {
    const rowNo = stageData.indexOf(r) + 3;
    const stageId = toNum(r.stageId);
    if (!stageId) { err(`stage 表第 ${rowNo} 行：stageId 非法`); continue; }
    if (stageIds.has(stageId)) { err(`stage 表第 ${rowNo} 行：stageId ${stageId} 重复`); continue; }
    stageIds.add(stageId);

    // battleLevel：两两配对（波次,等级）
    const levels = parseNums(r.battleLevel);
    if (levels.length < 2 || levels.length % 2 !== 0) {
        err(`stage ${stageId}：battleLevel「${toStr(r.battleLevel)}」不是成对的 波次,等级`);
    }
    const waveLevels = [];
    for (let i = 0; i + 1 < levels.length; i += 2) waveLevels.push([levels[i], levels[i + 1]]);
    const levelVals = waveLevels.map(p => p[1]);
    for (const [w] of waveLevels) {
        if (w < 1 || w > waveLevels.length) warn(`stage ${stageId}：波次号 ${w} 超出总波数 ${waveLevels.length}`);
    }

    // monsterType 池：数字类型 or 名称
    const pool = parseTokens(r.monsterType);
    if (pool.length === 0) { err(`stage ${stageId}：monsterType 小怪池为空`); }
    for (const t of pool) {
        if (/^\d+$/.test(t) && bossTypes.has(parseInt(t, 10))) {
            err(`stage ${stageId}：小怪池含 Boss 类型 ${t}（Boss 应写在 boss 列）`);
        }
    }

    // boss：波次,类型
    const bossNums = parseNums(r.boss);
    const bossPairs = [];
    if (toStr(r.boss) !== '') {
        if (bossNums.length % 2 !== 0) err(`stage ${stageId}：boss「${toStr(r.boss)}」不是成对的 波次,类型`);
        for (let i = 0; i + 1 < bossNums.length; i += 2) {
            bossPairs.push([bossNums[i], bossNums[i + 1]]);
            const bt = bossNums[i + 1];
            const row = monsterById.get(bt * 100 + 1);
            if (!row && !bossTypes.has(bt)) err(`stage ${stageId}：boss 类型 ${bt} 在 monster 表不存在`);
            else if (!bossTypes.has(bt)) err(`stage ${stageId}：boss 类型 ${bt}（${row ? row.name : ''}）isBoss 不是 true`);
        }
    }

    // 引用覆盖：池内类型 × 各波等级 必须有行
    for (const t of pool) {
        if (!/^\d+$/.test(t)) continue; // 名称引用由运行时预制体注册表解析
        const type = parseInt(t, 10);
        for (const lv of levelVals) {
            if (!typeLevelSet.has(`${type}:${lv}`)) {
                warn(`stage ${stageId}：类型 ${type}（${typeNames.get(type) || ''}）缺 Lv${lv} 行（运行时就近向下取）`);
            }
        }
    }

    // monsterNum / monsterCd / time
    const nums = parseNums(r.monsterNum);
    const cdCell = fixThousandPair(r.monsterCd, stageId, 'monsterCd');
    const cds = parseNums(cdCell);
    const cdOut = typeof cdCell === 'string' && cdCell !== toStr(r.monsterCd) ? cdCell : r.monsterCd;
    const times = parseNums(r.time);
    if (nums.length < 2 || nums[0] < 1 || nums[1] < nums[0]) err(`stage ${stageId}：monsterNum「${toStr(r.monsterNum)}」非法（应为 最小,最大 且 ≥1）`);
    if (cds.length < 2 || cds[0] < 100 || cds[1] < cds[0]) err(`stage ${stageId}：monsterCd「${toStr(r.monsterCd)}」非法（应为 最小,最大 毫秒）`);
    if (times.length < 1 || times[0] < 5) err(`stage ${stageId}：time「${toStr(r.time)}」非法（时长秒 ≥5）`);
    if (bossPairs.length > 0 && times.length < 2) warn(`stage ${stageId}：有 Boss 但 time 只填了时长，Boss 将在默认 15 秒出场`);

    stageRows.push({
        stageId,
        note: toStr(r.备注),
        battleLevel: toStr(r.battleLevel),
        monsterType: toStr(r.monsterType),
        boss: toStr(r.boss),
        monsterNum: toStr(r.monsterNum),
        monsterCd: toStr(cdOut),
        time: toStr(r.time),
    });
}

// ---------- 汇总输出 ----------
function fmtTime(ts) {
    const d = new Date(ts);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
const exportedAt = Date.now();

console.log('====== 文字塔防 导表 ======');
console.log(`stage   ：${stageRows.length} 关（${stageRows[0] ? stageRows[0].stageId : '-'} ~ ${stageRows[stageRows.length - 1] ? stageRows[stageRows.length - 1].stageId : '-'}）`);
console.log(`monster ：${monsters.length} 行，类型 ${typeNames.size} 个（Boss ${bossTypes.size} 个：${[...bossTypes].join(',')}）`);
warnings.slice(0, 20).forEach(w => console.warn('  [warn]', w));
if (warnings.length > 20) console.warn(`  …共 ${warnings.length} 条 warning`);
errors.forEach(e => console.error('  [error]', e));

if (errors.length > 0) {
    console.error(`\n× 校验失败 ${errors.length} 条，未写出 json；请修正表格后重跑`);
    process.exit(1);
}

fs.mkdirSync(OUT_DIR, { recursive: true });
const stageJson = { version: 1, exportedAt, count: stageRows.length, rows: stageRows };
const monsterJson = { version: 1, exportedAt, count: monsters.length, rows: monsters };
const stagesPath = path.join(OUT_DIR, 'stages.json');
const monstersPath = path.join(OUT_DIR, 'monsters.json');
fs.writeFileSync(stagesPath, JSON.stringify(stageJson), 'utf8');
fs.writeFileSync(monstersPath, JSON.stringify(monsterJson), 'utf8');
console.log(`\n√ 已写出 ${path.relative(ROOT, stagesPath)}（${(fs.statSync(stagesPath).size / 1024).toFixed(1)} KB）`);
console.log(`√ 已写出 ${path.relative(ROOT, monstersPath)}（${(fs.statSync(monstersPath).size / 1024).toFixed(1)} KB）`);
console.log('  回到 Cocos Creator 等资源刷新后即可生效（优先级：json > 编辑器同 id 覆盖 > 内置表）');

// ---------- 导表报告 HTML ----------
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
const sampleStages = stageRows.slice(0, 10).map(s => `
<tr><td>${s.stageId}</td><td>${esc(s.note)}</td><td>${esc(s.battleLevel)}</td><td>${esc(s.monsterType)}</td><td>${esc(s.boss) || '—'}</td><td>${esc(s.monsterNum)}</td><td>${esc(s.monsterCd)}</td><td>${esc(s.time)}</td></tr>`).join('');
const typeRowsHtml = [...typeNames.entries()].map(([t, n]) => {
    const levels = [...monsterById.values()].filter(e => e.type === t).length;
    const boss = bossTypes.has(t);
    return `<tr><td>${t}</td><td>${esc(n)}</td><td>${boss ? 'Boss' : '小怪'}</td><td>${levels}</td></tr>`;
}).join('');
const warnHtml = warnings.length ? warnings.map(w => `<li>${esc(w)}</li>`).join('') : '<li class="ok">无</li>';

const html = `<!DOCTYPE html><html lang="zh"><head><meta charset="utf-8"><title>导表报告 · 文字塔防</title>
<style>
body{font-family:"Microsoft YaHei",sans-serif;background:#141822;color:#dfe6f3;margin:0;padding:32px}
h1{font-size:22px} h2{font-size:16px;margin-top:28px;color:#9fb3d9}
.meta{color:#8a93a8;font-size:13px}
table{border-collapse:collapse;width:100%;font-size:12.5px;margin-top:10px}
th,td{border:1px solid #2a3244;padding:6px 9px;text-align:left}
th{background:#1c2233;color:#aac4e8}
tr:nth-child(even) td{background:#181e2c}
.kpi{display:flex;gap:14px;margin-top:16px}
.kpi div{flex:1;background:#1c2233;border:1px solid #2a3244;border-radius:10px;padding:12px 16px}
.kpi b{font-size:22px;display:block;color:#4ecdc4}
.kpi span{font-size:12px;color:#8a93a8}
li{font-size:13px;line-height:1.7} .ok{color:#7ce8c8}
</style></head><body>
<h1>文字塔防 · 导表报告</h1>
<p class="meta">导出时间：${fmtTime(exportedAt)}　|　源表：表格/stage.xlsx、表格/monster.xlsx　|　产物：assets/resources/stages.json、monsters.json</p>
<div class="kpi">
<div><b>${stageRows.length}</b><span>关卡（${stageRows[0] ? stageRows[0].stageId : ''} ~ ${stageRows[stageRows.length - 1] ? stageRows[stageRows.length - 1].stageId : ''}）</span></div>
<div><b>${monsters.length}</b><span>怪物数值行</span></div>
<div><b>${typeNames.size}</b><span>怪物类型（Boss ${bossTypes.size}）</span></div>
<div><b>${warnings.length}</b><span>警告</span></div>
<div><b>0</b><span>错误</span></div>
</div>
<h2>怪物类型一览</h2><table><tr><th>类型</th><th>名称</th><th>定位</th><th>等级行数</th></tr>${typeRowsHtml}</table>
<h2>关卡抽样（前 10 关，全量见 stages.json）</h2>
<table><tr><th>stageId</th><th>备注</th><th>battleLevel</th><th>小怪池</th><th>boss</th><th>数量</th><th>间隔ms</th><th>time</th></tr>${sampleStages}</table>
<h2>警告（不阻塞导出）</h2><ul>${warnHtml}</ul>
<h2>优先级说明</h2>
<ul><li>运行时数据链：<b>stages.json / monsters.json</b>（本次导出）→ 编辑器同 id 覆盖（临时调参）→ 内置表</li>
<li>怪物外观预制体：放 <b>assets/resources/enemies/&lt;类型号或怪物名&gt;.prefab</b> 自动绑定（如 201.prefab、211.prefab）</li>
<li>buff 三列（buffTarget/buffEffect/buffEffectPara）已导入，暂不生效（战斗内打日志）</li></ul>
</body></html>`;
fs.writeFileSync(path.join(ROOT, '导表报告.html'), html, 'utf8');
console.log(`√ 已写出 导表报告.html`);
