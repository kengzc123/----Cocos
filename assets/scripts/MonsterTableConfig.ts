// ============================================================
// 怪物数值表组件：在 Cocos Creator 检查器中手动配置 monster.xlsx 行
// 用法：场景里选中挂 GameApp 的节点 → 「怪物数值表」数组中加行
//       每行 = (类型, 等级) 一条数值；monsterId 自动 = type×100+level
// 关卡按 battleLevel 的等级查对应行；缺行时同类型就近向下取并告警
// buff 三列已导入暂不生效（刷新时打日志）
// ============================================================
import { _decorator } from 'cc';
import { MonsterStats } from './Config';

const { ccclass, property } = _decorator;

@ccclass('MonsterRow')
export class MonsterRow {

    @property({ tooltip: '怪物类型（monster 表 monsterType：201/202/204/205 小怪，211-220 Boss）' })
    type = 201;

    @property({ tooltip: '怪物等级 1-100（关卡 battleLevel 按波次取等级）' })
    level = 1;

    @property({ tooltip: '备注名（如 小近战怪 Lv1）' })
    displayName = '小近战怪 Lv1';

    @property({ tooltip: '是否 Boss' })
    isBoss = false;

    @property({ tooltip: '攻击力' })
    attack = 2;

    @property({ tooltip: '攻击范围（像素，与战场逻辑坐标 1:1）' })
    attackFar = 10;

    @property({ tooltip: '攻击冷却 ms' })
    attackCd = 2000;

    @property({ tooltip: '血量' })
    blood = 10;

    @property({ tooltip: '移动速度（运行时 ×60 px/s）' })
    speed = 3;

    @property({ tooltip: 'buff 目标（已导入未生效，仅日志）' })
    buffTarget = '';

    @property({ tooltip: 'buff 效果类型（已导入未生效，仅日志）' })
    buffEffect = 0;

    @property({ tooltip: 'buff 效果参数（已导入未生效，仅日志）' })
    buffEffectPara = 0;

    toStats(): MonsterStats {
        const type = Math.max(1, Math.round(this.type));
        const level = Math.max(1, Math.round(this.level));
        return {
            monsterId: type * 100 + level,
            type,
            level,
            name: this.displayName || `类型${type} Lv${level}`,
            isBoss: !!this.isBoss,
            attack: Math.max(0, this.attack),
            attackFar: Math.max(0, this.attackFar),
            attackCd: Math.max(200, this.attackCd),
            blood: Math.max(1, this.blood),
            speed: Math.max(0.1, this.speed),
            buffTarget: this.buffTarget || undefined,
            buffEffect: this.buffEffect || undefined,
            buffEffectPara: this.buffEffectPara || undefined,
        };
    }
}
