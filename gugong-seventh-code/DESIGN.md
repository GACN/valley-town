# 《宫阙疑云：第七码》· 制作圣经与数据契约 v1

> 所有内容作者必须严格按本文件的 schema 与事实写 JSON。**不许改案件真相，不许改坐标锚点名，不许编造不存在的地点。**

## 0. 工程位置

- 游戏根目录：`/storage/emulated/0/Music/每日归档/2026-11/gugong/game/`
- 内容数据：`game/data/`（只写 `content_*.json` / 你被指定的文件名）
- 引擎：`game/js/`（**内容作者不要碰**）
- 资产：`game/assets/glb/`（11 个分区 GLB，已生成）
- 坐标：米，Z 向上，**+X=东，+Y=北**，原点=太和殿中心，Z=0 为广场地面
- 可行走层高度：广场 0、三台 8.13、内廷台基 3.0、城墙顶 9.9

## 1. 可引用地点锚点（**只能用这些 id，坐标不要自己写**）

见 `game/data/anchors.json`，可用 id：

```
wumen_in 午门门内广场      wumen_out 午门外          taihemen 太和门
taihemen_plaza 太和门广场   jinshui 内金水桥          taihedian_yuetai 太和殿月台
taihedian_front 太和殿前广场 zhonghedian 中和殿        baohedian 保和殿
santai_east 三台东侧        santai_west 三台西侧      qianqingmen 乾清门
qianqinggong 乾清宫         jiaotaidian 交泰殿        kunninggong 坤宁宫
yuhuayuan 御花园            qinandian 钦安殿          wanchunting 万春亭
qianqiuting 千秋亭          duixiushan 堆秀山         shenwumen 神武门
tower_ne/nw/se/sw 四角楼    wall_south_top 南城墙      corr_east/corr_west 东/西长街
huamen_e/huamen_w 东/西华门内  garden_east/garden_west 御花园东/西路
neiting_east_street / neiting_west_street 内廷东/西街
w6_ccg 长春宫 w6_cqg 承乾宫 w6_cxg 储秀宫 w6_xfg 咸福宫 w6_ysg 永寿宫 w6_ykg 翊坤宫
w6_tjg 太极殿 w6_jrg 景仁宫 w6_jyg 景阳宫 w6_yhg 永和宫 w6_yxg 延禧宫 w6_zcg 钟粹宫
wb_cng 慈宁宫 wb_fxd 奉先殿 wb_nsg 宁寿宫 wb_whg 文华殿 wb_wyg 武英殿 wb_yxd 咸安宫
```

分区 id（用于流式加载与区域开放）：`r00_world`（城墙/护城河/广场/金水桥/角楼/宫门）
`r01_wumen` `r02_taihemen` `r03_santai` `r04_neiting` `r05_yuhuayuan` `r06_shenwumen`
`r08_east_six` `r09_west_six` `r10_east_wings` `r11_west_wings`

**室内场景**：殿宇本体是实心外壳，进不去。以下地点有授权室内场景，交互点用 `interior` 字段：
`thd_hall` 太和殿、`zbd_hall` 中和殿、`bhd_hall` 保和殿、`qqg_hall` 乾清宫、`kng_hall` 坤宁宫、
`thm_hall` 太和门、`qqm_hall` 乾清门、`wumen_tower` 午门城楼、`tower_ne` 东北角楼、`tower_nw` 西北角楼、
`archive_ruins` 旧档案库（第八章，用 `wb_yxd` 咸安宫偏院内的地窖设定）、`secret_passage` 宫城暗道（第十一章）、
`tcm_hall` 太医院正堂、`barracks` 禁军值房、`yikun_store` 内库账房。

## 2. 案件真相（**唯一版本，任何角色台词不得与之矛盾**）

### 旧案：十五年前「丁卯档案库火」
- 主谋：掌印太监 **沈鹤龄**（时任内官监少监）。他借「内库岁修」名义把库银分成七条支线转出宫，方法是在账册里改动码位（每一册账对应一个码，七册互证）。这些人被称作「第七码」。
- 协同：时任内库库使 **裴廷芳**（裴景衡之父，伪造账册）、时任禁军副将 **韩崇山**（韩砚之父，负责用「封存文书」车队押运银子出宫）、太医院院判 **苏怀仁**（苏惟安之父，开出三名书吏的死亡证明）。
- 火是灭证：烧了档案库东庑，三名书吏被记为「失踪」。实际有一人逃出——**陆延**（现名「哑吏」，档案库老杂役，装哑）。
- 七份记录（《第七码》）分别藏在宫城七处，每份记录一码；凑齐七码可解出当年总账，也能解出沈鹤龄**至今仍在用「月例银」渠道洗钱**的账。

### 现案：林照月之死（暴雨夜，宫城东北角楼）
- 林照月（24 岁，宫廷档案官）复核旧档发现码位异常，私下查了三个月，已拿到第一、第二码。
- **裴景衡**（现任监察使，裴廷芳之子）察觉她接近真相。他不能让旧案翻——父亲还在世，他自己的位置也建立在父亲的旧账上。
- 他命禁军千户 **孟淮**（裴家旧部）去角楼「劝她交出所查之物」。雨夜争执，孟淮在她转身时推了一把，她坠楼。**孟淮是实际动手者，裴景衡是主使。**
- 裴景衡随后做三件事：①伪造「失足」现场，把她手中一页残档换走；②把嫌疑引向当晚与她争执的**韩砚**（韩砚因父亲旧事被牵扯，与她争吵，但他没杀人，会后即回值房，有人证）；③主动找玩家（外来调查员）来查案，目的是借玩家的手**集齐七码**，再一网打尽并销毁。
- 韩砚当晚争执的真实原因：林照月发现押运车队记录有假（她查到韩崇山一栏），当面质问他，他以为她要毁他父亲名誉。他的不在场证明被**伪造的巡逻记录**覆盖（伪造者是孟淮，为了让韩砚的行程看起来正好在角楼附近——反向栽赃的第一步，但被玩家识破记录是伪造的，反而救了韩砚）。
- 太医院线：林照月死前一个月开始慢性中毒（乌头碱类，来自沈鹤龄余党怕她查账）。**苏惟安**（院判）被崔慎威逼篡改了她的就诊记录，他掩盖的是「中毒」，不是「杀人」；他本人不是凶手。（玩家要排除他。）
- 宫女 **阿蘅** 是林照月密友，替她传信，知道她「最后见的人不是韩砚」。她被崔慎威胁，前几章撒谎，信任足够后才说出真相。她是**关键证人**，第十二章会被灭口风险，玩家能否及时找到她决定隐藏结局。
- **裴景媛**（尚仪，裴景衡之妹）不知哥哥是主使，只知道「哥哥那晚不在值房」。她的证词是扳倒裴景衡的时间线证据，但她会保护哥哥到最后，需要信任任务才开口。

### 七码分布（每章一份，第九、十一章各一，第二章无码）
| 码 | 章 | 地点 | 藏法 |
|---|---|---|---|
| 一 | 第三章 | 太和殿 `thd_hall` | 匾额后夹层 |
| 二 | 第四章 | 东长街廊下 `corr_east` | 廊柱石础中空 |
| 三 | 第六章 | 万春亭 `wanchunting` | 亭顶藻井暗格 |
| 四 | 第九章 | 咸福宫 `w6_xfg` | 井壁砖缝 |
| 五 | 第九章 | 慈宁宫 `wb_cng` | 佛龛夹层 |
| 六 | 第十一章 | 宫城暗道 `secret_passage` | 石函 |
| 七 | 第十二章 | 阿蘅手中 | 她贴身藏着，需信任+及时赶到 |

## 3. 角色表（**id 固定，台词必须符合各自「知道什么/不知道什么」**）

| id | 姓名 | 身份 | 关键秘密 | 不知道 |
|---|---|---|---|---|
| `pei_jingheng` | 裴景衡 | 监察使（委托人/主使） | 命孟淮去角楼；伪造现场；借玩家集码 | 陆延还活着 |
| `han_yan` | 韩砚 | 禁军统领（红鲱鱼） | 父亲韩崇山涉案；自己伪造过一次巡逻记录替父亲遮掩 | 真凶是谁 |
| `shen_heling` | 沈鹤龄 | 掌印太监（旧案主谋） | 七码总账仍在洗钱 | 玩家在查什么（前中期） |
| `su_weian` | 苏惟安 | 太医院院判 | 篡改林照月就诊记录（中毒） | 谁下的毒 |
| `a_heng` | 阿蘅 | 宫女（林照月密友/关键证人） | 林照月最后见的是孟淮 | 孟淮背后是谁 |
| `meng_huai` | 孟淮 | 禁军千户（实际动手者） | 推了林照月；伪造韩砚巡逻记录 | 玩家已怀疑他 |
| `lu_yan` | 陆延 | 档案库老吏「哑吏」 | 十五年前火灾真相、七码结构 | 七码现在何处 |
| `pei_jingyuan` | 裴景媛 | 尚仪（裴景衡之妹） | 哥哥那晚不在值房 | 哥哥是主使 |
| `gu_yun` | 顾昀 | 午门老门卒 | 当晚通行令牌数目不对 | 令牌是谁的 |
| `bai_shi` | 白氏 | 浣衣局管事 | 帮林照月洗过带血的袖口 | 血是谁的 |
| `cui_shen` | 崔慎 | 内官监少监（沈之心腹） | 威胁阿蘅、换走物证 | 玩家进度（后期才知） |
| `liu_yinv` | 柳医女 | 太医院医女 | 见过林照月被下毒的舌象 | 毒是谁下的 |
| `chang_ping` | 常平 | 巡夜人（第二章失踪） | 改巡逻路线的人给了他钱 | 给钱的人是谁 |
| `wang_fu` | 王福 | 膳房厨役 | 雨夜见到「穿禁军靴但不是禁军的人」 | 目击者身份 |
| `shen_yanqiu` | 沈砚秋 | 尚宫局女官（沈鹤龄养女） | 养父每月有一笔「月例」账外流水 | 那是洗钱 |
| `zhao_jiu` | 赵九 | 车马行头目 | 暗道运输路线 | 货是什么 |
| `ming_jing` | 明净 | 钦安殿道士 | 用卦象隐喻给线索 | 案件细节 |
| `a_luo` | 阿罗 | 小太监（玩家线人） | 宫里跑腿见闻 | 真假难辨，会传错话 |
| `chen_momo` | 陈嬷嬷 | 后宫老嬷嬷 | 各家族在宫中的利益关系 | 账目细节 |
| `zheng_e` | 郑锷 | 禁军副将 | 韩砚当夜行踪（真话） | 孟淮做了什么 |
| `he_qing` | 何清 | 档案库现任书吏 | 有一册账「对不上码」被调走 | 为什么 |
| `ashina` | 阿史那 | 胡商管事 | 宫外销赃渠道 | 宫内主使 |

## 4. JSON schema（**严格按此写，字段名不能变**）

### 4.1 `content_npcs.json`
```json
{
  "npcs": [{
    "id": "pei_jingheng",
    "name": "裴景衡",
    "title": "宫廷监察使",
    "faction": "监察司",
    "anchor": "qianqingmen",
    "home_anchor": "huamen_e",
    "robe": "#2b3a4a",
    "accent": "#c9a227",
    "trust0": 30,
    "knows": ["七码存在", "韩砚与死者争吵"],
    "hides": ["命孟淮赴角楼", "伪造现场"],
    "schedule": [
      {"from": 6, "to": 10, "anchor": "qianqingmen", "label": "在监察司值房"},
      {"from": 10, "to": 14, "anchor": "huamen_e", "label": "巡查东华门"},
      {"from": 14, "to": 19, "anchor": "taihemen_plaza", "label": "在广场见人"},
      {"from": 19, "to": 23, "anchor": "qianqingmen", "label": "回值房"}
    ],
    "lines": {
      "greet": ["……你来了。查得怎么样？"],
      "idle": ["宫里的雨，一年比一年冷。"],
      "press": ["有些事，知道得越多越危险。"]
    }
  }]
}
```
- `trust0` 0-100；`schedule` 覆盖 0-24 时，anchor 必须是锚点 id。
- `lines` 只需 2-4 条短句池，真正的对话在 `content_dialogue.json`。

### 4.2 `content_clues.json`
```json
{
  "clues": [{
    "id": "c_pass_token",
    "name": "多出来的通行令牌",
    "kind": "physical",
    "chapter": 2,
    "anchor": "wumen_in",
    "interior": null,
    "desc": "令牌编号超出一枚，且不是死者的。",
    "detail": "全长 120-260 字，写清它为什么重要。",
    "tags": ["令牌", "通行", "雨夜"],
    "implies": ["c_patrol_fake"],
    "weight": 3,
    "world_pos": null
  }]
}
```
- `kind`: `physical` 物证 / `document` 文书 / `testimony` 证词 / `scene` 现场痕迹 / `code` 第七码之一。
- `implies` 是「能推出什么」，用于线索关联板（引擎会用它们算推理）。
- 每章 5-8 条，全书 ≥70 条。
- `world_pos` 仅在需要精确摆放时给 `[x,y,z]`，否则留 null 用 anchor。

### 4.3 `content_quests.json`
```json
{
  "quests": [{
    "id": "q1_1",
    "type": "main",
    "chapter": 1,
    "title": "雨夜来客",
    "giver": "pei_jingheng",
    "summary": "一句话目标",
    "steps": [{
      "id": "q1_1_a",
      "text": "走到午门门内广场",
      "at": {"kind": "anchor", "anchor": "wumen_in", "radius": 12},
      "requires": [],
      "grants": ["flag:met_pei"],
      "hint": "从宫门进入后向北"
    }, {
      "id": "q1_1_b",
      "text": "与顾昀交谈",
      "at": {"kind": "npc", "npc": "gu_yun"},
      "requires": ["flag:met_pei"],
      "grants": ["clue:c_pass_token", "trust:gu_yun+10"]
    }]
  }]
}
```
- `at.kind`: `anchor` / `npc` / `interior` / `clue` / `deduce`
- `grants` 语法（引擎按此解析）：`flag:xxx`、`clue:id`、`trust:npc_id+N`、`unlock:region_id`、`chapter:N`、`ending:xxx`、`code:N`
- `requires` 语法：`flag:xxx`、`has_clue:id`、`trust:npc_id>=N`、`chapter>=N`、`deduce:id`
- 每个主线章节 3-5 个 quest，每 quest 2-6 步。支线 `type: "side"`，必须影响信任/证据/结局（禁止纯跑腿）。
- 支线 30 个以上，分布：宫门广场 3、外朝 4、内廷 4、御花园 4、东西六宫 6、外东/西路 5、城墙角楼 3、暗道/密室 2（可按剧情调整，但必须 ≥30）。

### 4.4 `content_dialogue.json`
```json
{
  "trees": {
    "pei_jingheng": {
      "start": "n_pei_1",
      "nodes": {
        "n_pei_1": {
          "who": "pei_jingheng",
          "text": "你终于来了。林照月的案子，宫里已经结了，可我不信。",
          "audio": "calm",
          "choices": [
            {"text": "你要我查什么？", "goto": "n_pei_2"},
            {"text": "她是自己失足的吗？", "goto": "n_pei_3", "if": ["has_clue:c_body_wound"]}
          ]
        },
        "n_pei_2": {
          "who": "pei_jingheng",
          "text": "……查她为什么死。别让禁军的人先开口。",
          "effects": ["flag:accepted_case"],
          "goto": null
        }
      }
    }
  }
}
```
- `if` 用和 `requires` 相同的语法。
- `effects` 用和 `grants` 相同的语法。
- 每个主要 NPC 至少 8 个节点；关键 NPC（8 名）≥ 20 个节点，含至少 1 个「信任分支」（`if: ["trust:xxx>=60"]`）与 1 个「指认分支」。
- 允许 `accuse` 节点类型：`{"text": "...", "accuse": "han_yan", "if": [...]}` 用于第十四章指控。

### 4.5 `content_chapters.json`
```json
{
  "chapters": [{
    "n": 1,
    "title": "雨夜宫门",
    "subtitle": "雨水把脚印冲掉了，可冲不掉令牌。",
    "open_regions": ["r01_wumen", "r02_taihemen"],
    "intro": "120-200 字的章节开场（第二人称，冷、克制、有画面）。",
    "beats": ["beat1_id", "beat2_id"],
    "quests": ["q1_1", "q1_2"],
    "code": null,
    "unlock_note": "本章解锁：午门、太和门广场自由探索"
  }]
}
```

### 4.6 `content_interiors.json`
```json
{
  "interiors": [{
    "id": "thd_hall",
    "name": "太和殿",
    "w": 60, "d": 33, "h": 18,
    "style": "imperial",
    "props": ["dragon_throne", "columns_row:6", "screen", "braziers", "desk", "archive_shelf"],
    "pois": [
      {"id": "thd_plaque", "name": "建极绥猷匾", "pos": [0, 8, 9], "clue": "c_code1", "text": "匾额背后有撬动的痕迹。"}
    ]
  }]
}
```
- 仅使用以下 props 关键词：`dragon_throne, columns_row:N, screen, braziers, desk, archive_shelf, bed, altar, banners, chests, lantern_row, map_table, medicine_cabinet, weapon_rack, well, stone_coffin, scroll_rack`

## 5. 写作要求

1. **中文，冷峻、克制、有画面**。禁止「欢迎来到」「让我们一起」这类现代解说腔；不要用「AI 感」排比。
2. 玩家是外来调查员（第二人称「你」）。
3. 台词要让玩家**自己动脑**：NPC 会撒谎、会绕、会反问；不许直接说出自己藏的秘密，除非信任足够。
4. 每条 clue 的 `desc` ≤ 40 字，`detail` 120-260 字，必须指出「它和哪件事矛盾」。
5. 数值：主线 quest 3-5/章；每章 5-8 clue；支线 ≥30 条全项目。
6. 时间线一致：案发在「三月初七暴雨夜」；林照月死了 11 天；十五年前是「丁卯年」。
7. 结局四种：`truth`（真相大白）/`wrong`（冤案）/`deal`（沉默交易）/`hidden`（隐藏结局）。第十四章 dialogue 必须能触发这四种。

## 6. 交付前自检

```bash
cd /storage/emulated/0/Music/每日归档/2026-11/gugong/game
python3 tools_validate_content.py
```
必须 `ALL_CONTENT_OK`，且不得改动别人的文件。
