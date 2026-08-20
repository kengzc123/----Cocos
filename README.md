# 文字塔防 · Cocos 原型

基于《文字塔防·原型策划需求文档（定版）》实现的 Cocos Creator 塔防原型。
以汉字独体字为塔，拖入 5×5 打造盘按俄罗斯方块式占位合成高级字塔，抵御 5 波小怪保卫城堡。

- 引擎：Cocos Creator **3.8.0**（3.8.x 均可打开）
- 语言：TypeScript（全部 UI 用代码动态构建，无需任何美术资源）
- 分辨率：竖屏 390×844，与原型像素值 1:1 对应

## 运行方式

1. 打开 Cocos Dashboard → 项目 → 导入，选择本目录（`文字塔防Cocos/`）。
2. 首次导入后打开场景 `assets/Main.scene`。
3. 点击编辑器顶部 ▶ 预览（浏览器 / 模拟器均可）。

> 首次打开时编辑器会自动生成 `temp/`、`library/` 等目录，属正常现象。
> 若脚本未挂载，确认 Canvas 节点上存在 `GameApp` 组件（场景文件已内置）。

## 玩法操作

| 操作 | 行为 |
| --- | --- |
| 主页「开始战斗」 | 开局 5 个随机独体字（保证至少 1 个火） |
| 物品栏拖字到战场 | 部署为塔（场上同字唯一，高级替换低级并收回旧字） |
| 点击战场上的塔 | 收回物品栏 |
| 点击物品栏槽位 | 弹出菜单：合并升级（同名同级）/ 销毁 |
| 同名同级两个字拖到一起 | 合并升级（Lv1×2 → Lv2，最高 Lv4） |
| 底栏「打造」 | 打开打造盘（战斗暂停），盘内自带物品栏 |
| 拖独体字入 5×5 盘 | 按字形占位；无法落位时自动就近寻找 |
| 拖动盘内字块 | 盘内调整位置（连通判定实时重算） |
| 点击盘内字块 | 移出打造盘回物品栏 |
| 盘上「清」/「确认合成」 | 一键收回字块 / 合成全部可合成组合 |
| 点击打造盘外 | 关闭打造盘（盘上剩余字块保留） |
| 波次胜利 | 固定 5 个随机独体字 + 三选一强化（回血/单塔大强化/全塔小强化） |

## 合成规则

- **配方匹配**：盘上字块的字多重集与配方一致（与摆放顺序无关）。
- **形状连通**：参与合成的字块所占格子上下左右连成一片。
- **实时反馈**：每次摆放/移动立即重判，右上角提示首个结果与数量，涉及字块高亮。
- 11 个配方：炎(火火) 冰(水水) 林(木木) 昌(日日) 从(人人) 炅(火日) 伙(火人) 沐(水木) 沓(水日) 杳(木日) 休(木人)。

## 代码结构（assets/scripts/）

| 文件 | 职责 |
| --- | --- |
| `Config.ts` | 全部数据：字体系/形状/配方/塔属性/敌人/波次/Boss/强化/全局状态 G |
| `Theme.ts` | 主题色与 UI 构建工具（节点/标签/圆角矩形/按钮/触摸判定/形状缩略图） |
| `BattleView.ts` | 战场：波次刷新、敌人 AI、塔攻击（溅射/穿透/锁定/减速/中毒/冻结/光环）、弹道特效 |
| `ForgePanel.ts` | 打造盘：5×5 网格、字形占位、配方+连通合成判定、拖拽与落点预览 |
| `ItemBar.ts` | 物品栏：5 槽渲染、点击菜单（合并/销毁）、拖拽发起 |
| `Modals.ts` | 弹窗：波次奖励三选一、结算、合成树 |
| `GameApp.ts` | 主控：场景切换、游戏循环、物品/部署/合并、全部拖拽管理、打造开关、关卡配置注册 |
| `StageConfig.ts` | 关卡配置组件：检查器中编辑关卡（波次/怪物等级/小怪池/Boss/刷新节奏） |
| `MonsterTableConfig.ts` | 怪物数值表组件：检查器中编辑 monster.xlsx 行（类型×等级数值） |
| `EnemyConfig.ts` / `TowerConfig.ts` | 预制体组件：EnemyConfig 已可选（数值走怪物数值表，预制体仅外观）；TowerConfig 为字塔预制体数值 |

各模块通过 `App` 接口回调解耦（`BattleApp`/`ItemBarApp`/`ForgeApp`/`ModalsApp`），由 `GameApp` 统一实现。

数值均按策划文档定版配置：塔等级输出效率 2 的幂（Lv4≈8×Lv1）、怪物攻击全整数、城堡 100 血、10 个 Boss 按局轮换（溅射/穿透/召唤）。

## 关卡与怪物配置（数据源：策划 stage.xlsx / monster.xlsx）

> 手动配置的图文步骤见 [说明书/手动配置说明书.html](./说明书/手动配置说明书.html)（含跑通 30001/30002 的最少配置、日志对照与 FAQ）。

### 数据模型

- **怪物数值表**（monster.xlsx，1400 行 = 14 类型 × 100 级，`monsterId = type×100+level`）：小怪 201/202/204/205，Boss 211-220。类型 203 已随旧表清理。
- **关卡表**（stage.xlsx，50 关）：`battleLevel` 的等级**对本波小怪与 Boss 同时生效**，运行时按 `(类型, 等级)` 查数值表取血/攻/速度/攻击范围。
- `attackFar` 按像素使用，与战场逻辑坐标 1:1；`speed` 运行时 ×60 px/s。
- buff 三列（buffTarget/buffEffect/buffEffectPara）**已导入暂不生效**，怪物刷新时打印 `[buff] 未生效 …` 日志。
- 数值表缺某 (类型,等级) 行 → 同类型**就近向下取**并告警；整个类型没配 → 回退内置 `ENEMY_TYPES` 数值（此时才用 `MONSTER_LEVEL_MUL` 倍率）。
- 怪物预制体（可选）**仅作外观**（序列帧），数值一律以数值表为准；预制体命名与策划表一致，表格 `monsterType`/`boss` 列可直接写预制体名。

### 方式一：编辑器配置（当前推荐，先手动配几条跑通）

场景 `Main.scene` 中选中挂 `GameApp` 的 Canvas 节点，检查器有两个数组：

**① 怪物数值表 `monsters`**（对应 monster.xlsx 行）——每行字段：type / level / displayName / isBoss / attack / attackFar(px) / attackCd(ms) / blood / speed / buff×3。运行 30001 需要 201 的 Lv1、4、7、10、13 各一行（缺行会就近取并告警）。

**② 关卡配置 `stages`**（对应 stage.xlsx 行）——每关字段：

| 字段 | 对应策划表列 | 说明 |
| --- | --- | --- |
| stageId / note | stageId / 备注 | 关卡 id 与备注 |
| battleLevels | battleLevel | 波次+怪物等级（**条目数 = 总波数**；等级查数值表） |
| monsterPool | monsterType | 小怪池：类型 id + 可选外观预制体 |
| bossWaves | boss | 波次 + Boss 类型（211-220）+ 可选外观预制体 |
| monsterNumMin/Max | monsterNum | 单次生成数量区间 |
| monsterCdMin/Max | monsterCd | 生成间隔区间 ms |
| spawnDurationSec / bossAtSec | time | 每波刷新时长 s / Boss 出场时刻 s |

配置非空时完全覆盖内置关卡表；启动日志 `[monster] 数值表 N 行` / `[stage] 编辑器关卡 …` 可确认生效。

### 方式二：内置表（Config.ts 的 STAGE_ROWS）

当前内置新表前 3 关（30001~30003）：

```ts
{
    stageId: 30001, note: '第1关，5波（引导关，无boss）',
    battleLevel: '1,1;2,4;3,7;4,10;5,13',   // 波次,怪物等级（分隔符容错）
    monsterType: '201',                     // 怪物池：类型 id 或预制体名
    boss: '',                               // 波次,Boss类型（空 = 无 Boss）
    monsterNum: '2,3',                      // 单次生成数量区间
    monsterCd: '1000,2000',                 // 生成间隔区间 ms
    time: '30',                             // 每波刷新时长 s / Boss 出场时刻 s（单值 = 无 Boss 时刻）
}
```

### 方式三：批量导入（xlsx → json，已实现）

策划表放 `表格/stage.xlsx`、`表格/monster.xlsx`（表头行 + 中文说明行 + 数据行）→ 双击项目根目录 **`导表.bat`**（或 `node tools/export_tables.js`）→ 生成：

- `assets/resources/stages.json` + `assets/resources/monsters.json`（运行时 `StageLoader` 自动预载注册）
- `导表报告.html`（导入摘要：关数/行数/类型/校验警告，双击查看）

导出前校验（错误阻塞导出、警告放行）：stageId/monsterId 唯一、battleLevel/boss 成对、monsterNum/monsterCd/time 合法、Boss 类型标记、小怪池不含 Boss、引用 (类型,等级) 覆盖（缺行警告）、Excel 千分位吞逗号自动修复（如 6601320 → 660,1320）。

优先级：**json 基表 > 编辑器同 id 覆盖（临时调参）> 内置表**。怪物外观预制体放 `assets/resources/enemies/<类型号或怪物名>.prefab` 自动按名绑定（如 `201.prefab`、`小近战怪.prefab`）。buff 三列（buffTarget/buffEffect/buffEffectPara）已导入暂不生效（战斗内打日志）。首次运行 bat 自动 `npm install`（依赖 SheetJS，已装于 `tools/node_modules`）。

### 运行逻辑

每波开始 10 秒准备 → 刷新期内按 `monsterCd` 区间随机间隔、每次 `monsterNum` 区间随机只数从怪物池随机刷小怪（数值查 `(类型, 波次等级)`）→ 到 `bossAt` 时刻插入该波 Boss → 刷新时长结束且 Boss 已出场且场上清空后波次结算。

## 原型已知简化（后期优化方向）

- 视觉全部为代码绘制（圆/矩形/文字），待接入「汉字象形」美术表现。
- 塔位为策划文档固定比例坐标，未做路径/地形系统。
- 无音效、无存档、无养成元游戏（定版已移除装备概念）。
- 敌人为边缘随机刷新直奔城堡，无寻路。
- 关卡表可用编辑器或内置数组（`STAGE_ROWS`）维护，后期可换 Excel/JSON 导表管线。
- `gen_project.js` 会重写 `Main.scene` 与全部 meta（uuid 会变），**编辑器里配好关卡/塔预制体后不要重跑**，仅新工程初始化时使用。
