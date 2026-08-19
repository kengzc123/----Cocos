// ============================================================
// 关卡配置组件：在 Cocos Creator 检查器中编辑关卡（stage 表编辑器）
// 怪物数值一律查「怪物数值表」（GameApp.monsters / MonsterRow，对应 monster.xlsx）；
// 预制体仅作外观（可挂 Sprite+Animation 序列帧），不提供数值
// ============================================================
import { _decorator, Prefab, Node } from 'cc';
import { StageCfg, PoolEntry, registerEnemyPrefab } from './Config';

const { ccclass, property } = _decorator;

function prefabName(p: Prefab): string {
    return p.name || (p.data as Node | null)?.name || '';
}

// 波次-怪物等级条目（battleLevel 一对；等级对本波小怪与 Boss 同时生效）
@ccclass('WaveLevelEntry')
export class WaveLevelEntry {
    @property({ tooltip: '第几波（从 1 开始）' })
    wave = 1;

    @property({ tooltip: '该波怪物等级（查怪物数值表 (类型,等级) 行）' })
    level = 1;
}

// 小怪池条目（monsterType 一项）
@ccclass('MonsterPoolEntry')
export class MonsterPoolEntry {
    @property({ tooltip: '怪物类型（201/202/204/205 小怪；数值查怪物数值表）' })
    type = 201;

    @property({ type: Prefab, tooltip: '外观预制体（可选，纯外观）' })
    prefab: Prefab | null = null;
}

// 波次-Boss 条目（boss 表一对）
@ccclass('BossWaveEntry')
export class BossWaveEntry {
    @property({ tooltip: '第几波出 Boss（从 1 开始）' })
    wave = 5;

    @property({ tooltip: 'Boss 类型（211-220；数值查怪物数值表）' })
    type = 211;

    @property({ type: Prefab, tooltip: 'Boss 外观预制体（可选）' })
    prefab: Prefab | null = null;
}

@ccclass('StageConfig')
export class StageConfig {

    @property({ tooltip: '关卡 id（如 30001）' })
    stageId = 30001;

    @property({ tooltip: '备注' })
    note = '';

    @property({ type: [WaveLevelEntry], tooltip: '波次与怪物等级（共几波 = 条目数）' })
    battleLevels: WaveLevelEntry[] = [
        { wave: 1, level: 1 } as WaveLevelEntry,
        { wave: 2, level: 4 } as WaveLevelEntry,
        { wave: 3, level: 7 } as WaveLevelEntry,
        { wave: 4, level: 10 } as WaveLevelEntry,
        { wave: 5, level: 13 } as WaveLevelEntry,
    ];

    @property({ type: [MonsterPoolEntry], tooltip: '本关小怪池（类型 + 可选外观预制体）' })
    monsterPool: MonsterPoolEntry[] = [
        { type: 201, prefab: null } as MonsterPoolEntry,
    ];

    @property({ type: [BossWaveEntry], tooltip: 'Boss 出场：波次 + 类型 + 可选外观预制体' })
    bossWaves: BossWaveEntry[] = [
        { wave: 5, type: 211, prefab: null } as BossWaveEntry,
    ];

    @property({ tooltip: '单次生成小怪数：最小' })
    monsterNumMin = 2;

    @property({ tooltip: '单次生成小怪数：最大' })
    monsterNumMax = 3;

    @property({ tooltip: '两次生成间隔 ms：最小' })
    monsterCdMin = 1000;

    @property({ tooltip: '两次生成间隔 ms：最大' })
    monsterCdMax = 2000;

    @property({ tooltip: '每波小怪刷新持续时长（秒）' })
    spawnDurationSec = 30;

    @property({ tooltip: 'Boss 出场时刻（秒，相对本波开始；无 Boss 的波忽略）' })
    bossAtSec = 15;

    // 转为运行时关卡配置
    toCfg(): StageCfg {
        const numMin = Math.max(1, Math.round(this.monsterNumMin));
        const numMax = Math.max(numMin, Math.round(this.monsterNumMax));
        const cdMin = Math.max(100, Math.round(this.monsterCdMin));
        const cdMax = Math.max(cdMin, Math.round(this.monsterCdMax));
        const levels = (this.battleLevels || [])
            .map(e => ({ wave: Math.max(1, Math.round(e.wave)), level: Math.max(1, Math.round(e.level)) }));
        const monsterTypes: PoolEntry[] = (this.monsterPool || [])
            .map(e => ({ type: Math.max(1, Math.round(e.type)), prefab: e.prefab }))
            .filter(e => e.type > 0);
        if (monsterTypes.length === 0) monsterTypes.push({ type: 201 });
        return {
            stageId: Math.round(this.stageId),
            note: this.note || '',
            waveLevels: levels,
            totalWaves: levels.length,
            monsterTypes,
            bossWaves: (this.bossWaves || []).map(b => ({
                wave: Math.max(1, Math.round(b.wave)),
                type: Math.max(1, Math.round(b.type)),
                prefab: b.prefab,
            })),
            monsterNum: [numMin, numMax] as [number, number],
            monsterCd: [cdMin, cdMax] as [number, number],
            spawnDurationMs: Math.max(5, Math.round(this.spawnDurationSec)) * 1000,
            bossAtMs: Math.max(0, Math.round(this.bossAtSec)) * 1000,
        };
    }

    // 注册外观预制体（名称与策划表一致，表格 monsterType/boss 列将来可按名引用）
    registerPrefabs(): void {
        for (const e of this.monsterPool || []) {
            if (e && e.prefab) registerEnemyPrefab(prefabName(e.prefab), { type: e.type, prefab: e.prefab });
        }
        for (const b of this.bossWaves || []) {
            if (b && b.prefab) registerEnemyPrefab(prefabName(b.prefab), { type: b.type, prefab: b.prefab });
        }
    }
}
