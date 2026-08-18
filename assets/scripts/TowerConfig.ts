// ============================================================
// 塔数据配置：挂载在预制体上，检查器中编辑数值
// 用法：建空节点 → 挂本组件（可再加 Sprite+Animation 做序列帧外观）
//       → 拖到 Assets 存为预制体 → 在 GameApp 的「TowerPrefabs」中引用
// ============================================================
import { _decorator, Component, Color, Enum } from 'cc';
import { TowerStat } from './Config';

const { ccclass, property } = _decorator;

export enum AimMode {
    Near = 0,  // 最近目标
    Far = 1,   // 最远目标
}
Enum(AimMode);

export enum BuffEffect {
    None = 0,
    Poison = 1,   // 中毒
    Freeze = 2,   // 全图冻结
    Haste = 3,    // 攻速光环
    Slow = 4,     // 减速
}
Enum(BuffEffect);

@ccclass('TowerConfig')
export class TowerConfig extends Component {

    @property({ tooltip: '汉字（如 火、炎；同名会覆盖内置属性）' })
    charName = '火';

    @property({ tooltip: '战场内 X 比例位置（0-1）' })
    posX = 0.5;

    @property({ tooltip: '战场内 Y 比例位置（0-1，自顶向下）' })
    posY = 0.5;

    @property({ tooltip: '攻击力' })
    attack = 10;

    @property({ tooltip: '攻击冷却 ms' })
    attackCd = 500;

    @property({ tooltip: '射程' })
    attackFar = 280;

    @property({ type: AimMode, tooltip: '目标选择：最近/最远' })
    aim: AimMode = AimMode.Near;

    @property({ tooltip: '锁定目标数（0=按 buff 逻辑）' })
    attackLock = 1;

    @property({ tooltip: '溅射半径（0=无）' })
    splash = 0;

    @property({ tooltip: '溅射伤害百分比' })
    splashReduce = 100;

    @property({ tooltip: '穿透额外目标数' })
    penetrate = 0;

    @property({ type: BuffEffect, tooltip: '特效类型' })
    buffEffect: BuffEffect = BuffEffect.None;

    @property({ tooltip: '特效参数（1:每秒最大生命% 2:冻结ms 3:攻速% 4:减速层数）' })
    buffEffectPara = 0;

    @property({ tooltip: '颜色' })
    color = new Color('#ff6b6b');

    @property({ tooltip: '描述' })
    desc = '';

    // 转为运行时塔属性（写入 TOWER_STATS）
    toStat(): TowerStat {
        return {
            attack: this.attack,
            attackCd: this.attackCd,
            attackFar: this.attackFar,
            aim: this.aim === AimMode.Far ? 'far' : 'near',
            attackLock: this.attackLock,
            splash: this.splash,
            splashReduce: this.splashReduce,
            penetrate: this.penetrate,
            buffEffect: this.buffEffect,
            buffEffectPara: this.buffEffectPara,
            color: '#' + this.color.toHEX(),
            desc: this.desc,
        };
    }
}
