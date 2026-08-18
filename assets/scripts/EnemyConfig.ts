// ============================================================
// 怪物数据配置：挂载在预制体上，检查器中编辑数值
// 用法：场景里建空节点 → 添加本组件 → 填数据 → 拖到 Assets 存为预制体
//       再在 GameApp 的「波次刷怪配置」中引用该预制体
// ============================================================
import { _decorator, Component, Color, Enum } from 'cc';
import { EnemyCfgExt } from './Config';

const { ccclass, property } = _decorator;

export enum BossSkill {
    None = 0,
    Splash = 1,   // 溅射
    Pierce = 2,   // 穿透
    Summon = 3,   // 召唤
}
// 引擎属性系统要求的枚举包装
Enum(BossSkill);

@ccclass('EnemyConfig')
export class EnemyConfig extends Component {

    @property({ tooltip: '名称（显示/日志用）' })
    displayName = '小怪';

    @property({ tooltip: '生命值' })
    hp = 10;

    @property({ tooltip: '攻击力（对城堡每次伤害）' })
    atk = 2;

    @property({ tooltip: '移动速度' })
    speed = 0.8;

    @property({ tooltip: '射程（近战约15，远程120+）' })
    range = 15;

    @property({ tooltip: '攻击间隔 ms' })
    attackCd = 2000;

    @property({ tooltip: '体型大小（绘制半径）' })
    size = 8;

    @property({ tooltip: '颜色' })
    color = new Color('#e57373');

    @property({ tooltip: '是否 Boss' })
    isBoss = false;

    @property({ tooltip: 'Boss 名字（单个汉字，如 魔）' })
    bossName = '';

    @property({ type: BossSkill, tooltip: 'Boss 技能' })
    bossSkill: BossSkill = BossSkill.None;

    // 转为战场运行时配置
    toSpawnCfg(): EnemyCfgExt {
        const skillMap = ['splash', 'pierce', 'summon'] as const;
        return {
            name: this.displayName,
            hp: this.hp,
            atk: this.atk,
            speed: this.speed,
            range: this.range,
            color: '#' + this.color.toHEX(),
            size: this.size,
            isBoss: this.isBoss,
            attackCd: this.attackCd,
            bossName: this.isBoss && this.bossName ? this.bossName : undefined,
            bossSkill: (this.isBoss && this.bossSkill !== BossSkill.None
                ? skillMap[this.bossSkill - 1] : undefined) as EnemyCfgExt['bossSkill'],
        };
    }
}
