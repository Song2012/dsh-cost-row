# dsh-cost-row

在 DeepSeek Harness 的「Token 用量」弹窗末尾加一行**人民币费用估算**。

弹窗本身只报 token 数（缓存命中 / 未缓存输入 / 缓存读取 / 输出），不告诉你这一场会话花了多少钱。这个插件把那四个数按官方价目表折算成金额，直接补在同一个弹窗里：

```
Token 用量        22,465,609 tok
缓存命中                    98%
未缓存输入          499,056 tok
缓存读取         21,861,632 tok
输出                104,921 tok
费用                  ≈ ¥2.71      ← 新增
计价时段                 高峰      ← 新增
切换时间  今天 18:00 · 剩 1:12:34   ← 新增，每秒走字
```

「切换时间」是当前计价时段的**结束时刻**（今天 / 明天 / 周几 + 具体钟点）和剩余倒计时，弹窗开着时每秒刷新，可以直接看出还有多久进入/退出高峰。

## 计算口径

全部取 DeepSeek 官方价目表（[api-docs.deepseek.com/zh-cn/quick_start/pricing](https://api-docs.deepseek.com/zh-cn/quick_start/pricing)），单位：人民币 / 百万 tokens。

| | deepseek-flash | deepseek-v4-pro |
|---|---|---|
| 输入·缓存命中（空闲 / 高峰） | 0.02 / 0.04 | 0.15 / 0.30 |
| 输入·缓存未命中（空闲 / 高峰） | 1 / 2 | 4.5 / 9 |
| 输出（空闲 / 高峰） | 4 / 8 | 13.5 / 27 |

- **峰谷判定**：北京时间周一至周五 09:00–12:00、14:00–18:00 为高峰，其余时段（含周末、法定节假日）为空闲，空闲价 = 高峰价的一半。判定只依赖绝对时间，不受本机时区影响。
- **公式**：`未缓存输入 × 未命中价 + 缓存读取 × 命中价 + 缓存写入 × 未命中价 + 输出 × 输出价`
- 金额保留两位小数；不足 1 分时保留四位。

## 安装

```sh
dsh plugin --profile desktop add link:/absolute/path/to/dsh-cost-row
```

装完**重启 DSH Desktop**（宿主在启动时读 profile），然后点输入框旁的 token 胶囊打开弹窗即可看到「费用」行。

## 卸载

```sh
dsh plugin --profile desktop remove dsh-cost-row
```

## 已知限制

- **整场会话按一个模型计价**：价格行取自输入框旁模型选择器当前的 `data-model-id`（含 `flash` → Flash 价，含 `v4-pro` → Pro 价），切模型后自动跟随。但弹窗里的四个数是整场汇总，**一场会话中途换过模型时，全部 token 会按当前模型计价**，可能高估或低估。
- **非 DeepSeek 模型按 Flash 价兜底**：`codex/gpt-6.1-sol` 这类 ID 不在官方价目表内，费用按 Flash 价算，费用行的 tooltip 会标注「未在价目表内」。
- **法定节假日未排除**：只按周一至周五判定高峰，中国的法定节假日调休不会被识别，那几天的费用会按高峰价高估（约 2 倍）。
- **缓存写入按未命中价计**：官方表里没有单独的缓存写入价，DeepSeek 的缓存写入本身按未命中输入计费。
- 依赖 `dl[data-session-stats-usage]` 与模型选择器的 `data-model-id` 两个 DOM 锚点；上游若改结构，费用行会静默不显示或退回 Flash 价，弹窗本身不受影响。

## 原理

纯浏览器侧：`MutationObserver` 盯着页面，发现弹窗的 `<dl data-session-stats-usage>` 后，读出已有的 `<dt>/<dd>` 数值，算好金额，追加一对 `<dt>费用</dt><dd>≈ ¥x.xx</dd>`，样式直接继承弹窗自带的定义列表，不改宿主任何代码。

## License

MIT
