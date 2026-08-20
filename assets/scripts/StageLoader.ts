// ============================================================
// 批量导入加载器：resources/stages.json + monsters.json → 注册基表
//   + resources/enemies/ 目录预制体按名绑定（201.prefab / 小近战怪.prefab）
// 优先级链：json 基表 → 编辑器同 id 覆盖 → 内置表
// ============================================================
import { resources, JsonAsset, Prefab } from 'cc';
import {
    MonsterStats, StageRawRow,
    registerMonsters, setStageBaseFromRows, registerEnemyPrefab, monsterTypeByName,
} from './Config';

export interface TableData {
    stageRows: StageRawRow[];
    monsters: MonsterStats[];
}

function loadJson(path: string): Promise<any> {
    return new Promise((resolve, reject) => {
        resources.load(path, JsonAsset, (err, asset) => {
            if (err || !asset) { reject(err || new Error(path)); return; }
            resolve((asset as JsonAsset).json);
        });
    });
}

// monsters.json 紧凑行 → MonsterStats
// [type, level, isBoss, attack, attackFar, attackCd, blood, speed, name, buffTarget, buffEffect, buffEffectPara]
function rowToStats(r: any[]): MonsterStats {
    const type = Math.max(1, Math.round(Number(r[0]) || 1));
    const level = Math.max(1, Math.round(Number(r[1]) || 1));
    return {
        monsterId: type * 100 + level,
        type,
        level,
        name: String(r[8] || `类型${type} Lv${level}`),
        isBoss: !!r[2],
        attack: Math.max(0, Number(r[3]) || 0),
        attackFar: Math.max(0, Number(r[4]) || 0),
        attackCd: Math.max(200, Number(r[5]) || 2000),
        blood: Math.max(1, Number(r[6]) || 1),
        speed: Math.max(0.1, Number(r[7]) || 1),
        buffTarget: r[9] ? String(r[9]) : undefined,
        buffEffect: Number(r[10]) || undefined,
        buffEffectPara: Number(r[11]) || undefined,
    };
}

// 加载导表 json（任一失败则整体 reject，调用方回退编辑器/内置）
export function loadTables(): Promise<TableData> {
    return Promise.all([loadJson('stages'), loadJson('monsters')]).then(([stages, monsters]) => {
        const stageRows: StageRawRow[] = (stages && stages.rows) || [];
        const monsterRows: any[][] = (monsters && monsters.rows) || [];
        if (stageRows.length === 0 || monsterRows.length === 0) {
            throw new Error('json 内容为空');
        }
        return { stageRows, monsters: monsterRows.map(rowToStats) };
    });
}

// resources/enemies/ 目录预制体按名注册：数字名 → 类型；中文名 → 数值表同名类型
export function loadEnemyPrefabs(): Promise<number> {
    return new Promise((resolve) => {
        resources.loadDir('enemies', Prefab, (err, assets) => {
            if (err || !assets || assets.length === 0) { resolve(0); return; }
            let bound = 0;
            for (const a of assets as Prefab[]) {
                const name = (a && a.name) || '';
                if (!name) continue;
                if (/^\d+$/.test(name)) {
                    registerEnemyPrefab(name, { type: parseInt(name, 10), prefab: a });
                    bound++;
                    continue;
                }
                const type = monsterTypeByName(name);
                if (type) {
                    registerEnemyPrefab(name, { type, prefab: a });
                    bound++;
                } else {
                    console.warn(`[prefab] enemies/${name}.prefab 与任何怪物类型/名称都不匹配，未绑定`);
                }
            }
            resolve(bound);
        });
    });
}
