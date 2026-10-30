/**
 * dsh-cost-line, browser half.
 *
 * Adds three rows to the built-in Token usage dialog
 * (`dl[data-session-stats-usage]`, rendered by ui-chat's UsagePill):
 *
 *   费用       ≈ ¥2.71          — priced from the four token counts the dialog prints
 *   计价时段   高峰 / 空闲        — DeepSeek's Beijing-time peak window
 *   切换时间   今天 18:00 · 剩 1:12:34
 *
 * The dialog has no slot for extra rows, so this is a DOM augmentation: read
 * the `<dt>/<dd>` pairs the dialog already renders, price them, and append
 * pairs that inherit the dialog's own definition-list styling.
 *
 * Official table (CNY / 1M tokens, api-docs.deepseek.com/zh-cn/quick_start/pricing):
 *   deepseek-flash    hit 0.02/0.04 · miss 1/2   · output 4/8
 *   deepseek-v4-pro   hit 0.15/0.30 · miss 4.5/9 · output 13.5/27
 * Off-peak is half price. Peak = Beijing time, Mon–Fri (excluding statutory
 * holidays), 09:00–12:00 and 14:00–18:00.
 */
window.__ModuleLoader__.load({
  id: 'dsh-cost-row',
  factory(require) {
    /** Prices in CNY per one million tokens; `off` is the off-peak tier. */
    const PRICES = {
      'deepseek-flash': {
        cacheHit: { off: 0.02, peak: 0.04 },
        cacheMiss: { off: 1, peak: 2 },
        output: { off: 4, peak: 8 },
      },
      'deepseek-v4-pro': {
        cacheHit: { off: 0.15, peak: 0.3 },
        cacheMiss: { off: 4.5, peak: 9 },
        output: { off: 13.5, peak: 27 },
      },
    }

    /**
     * The stats dialog does not say which model produced the session, so the
     * price row is taken from the composer's model picker (`data-model-id` on
     * the trigger label), matched by name. That is still one row for the whole
     * session: a session that switched models is priced at whichever model is
     * selected now. `DEFAULT_MODEL` is the fallback when no picker is found or
     * the id matches nothing in the table.
     */
    const DEFAULT_MODEL = 'deepseek-flash'

    /**
     * Match a routed model id (gateway aliases included, e.g.
     * `auto/deepseek-v4.1-flash`) against the price table.
     * @returns the table key and whether the id was actually recognised.
     */
    function priceRowFor(modelId) {
      const id = String(modelId || '').toLowerCase()
      // Only DeepSeek routes get a confident row: a gateway alias such as
      // `auto/deepseek-v4.1-flash` still names the family, while an unrelated
      // `…-flash` id must not silently borrow DeepSeek prices.
      if (!id.includes('deepseek')) return { model: DEFAULT_MODEL, matched: false }
      if (id.includes('v4-pro') || id.includes('v4pro') || /(^|[/-])pro($|[/-])/.test(id)) {
        return { model: 'deepseek-v4-pro', matched: true }
      }
      if (id.includes('flash')) return { model: 'deepseek-flash', matched: true }
      return { model: DEFAULT_MODEL, matched: false }
    }

    /** The model id the composer currently shows, or null. */
    function currentModelId() {
      const labels = document.querySelectorAll('[data-model-id]')
      // Menu items carry the attribute too; the trigger sits inside a button.
      for (const el of labels) {
        if (el.closest('button') !== null) return el.getAttribute('data-model-id')
      }
      return labels.length > 0 ? labels[0].getAttribute('data-model-id') : null
    }

    /** Localized labels the dialog uses for each count (zh / en). */
    const LABELS = {
      uncached: ['未缓存输入', 'Uncached input'],
      cacheRead: ['缓存读取', 'Cached input'],
      cacheWrite: ['缓存写入', 'Cache write'],
      output: ['输出', 'Output'],
    }

    const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
    const DAY_MS = 86400000

    /** Beijing wall clock for one absolute instant, read through UTC fields. */
    function beijingParts(ms) {
      const d = new Date(ms + 8 * 3600000)
      return {
        weekday: d.getUTCDay(),
        year: d.getUTCFullYear(),
        month: d.getUTCMonth(),
        date: d.getUTCDate(),
        hour: d.getUTCHours(),
        minute: d.getUTCMinutes(),
        minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
      }
    }

    /** Absolute instant of a Beijing wall-clock time, `dayShift` days from today. */
    function beijingAt(nowMs, dayShift, hour, minute) {
      const p = beijingParts(nowMs)
      return Date.UTC(p.year, p.month, p.date + dayShift, hour, minute, 0) - 8 * 3600000
    }

    /**
     * Current tier and the instant it ends.
     * @returns peak flag, absolute end instant, and a "今天 18:00" style label.
     */
    function tierInfo(nowMs) {
      const p = beijingParts(nowMs)
      const weekday = p.weekday >= 1 && p.weekday <= 5
      const peak = weekday && ((p.minutes >= 540 && p.minutes < 720) || (p.minutes >= 840 && p.minutes < 1080))

      let dayShift
      let hour
      let minute
      if (peak && p.minutes < 720) {
        dayShift = 0
        hour = 12
        minute = 0
      } else if (peak) {
        dayShift = 0
        hour = 18
        minute = 0
      } else if (weekday && p.minutes < 540) {
        dayShift = 0
        hour = 9
        minute = 0
      } else if (weekday && p.minutes >= 720 && p.minutes < 840) {
        dayShift = 0
        hour = 14
        minute = 0
      } else {
        // Off-peak after the day's last peak: the next weekday 09:00.
        dayShift = 1
        let next = (p.weekday + 1) % 7
        while (next === 0 || next === 6) {
          dayShift += 1
          next = (next + 1) % 7
        }
        hour = 9
        minute = 0
      }

      const until = beijingAt(nowMs, dayShift, hour, minute)
      const target = beijingParts(until)
      const dayDiff = Math.round(
        (Date.UTC(target.year, target.month, target.date) - Date.UTC(p.year, p.month, p.date)) / DAY_MS,
      )
      const dayLabel = dayDiff === 0 ? '今天' : dayDiff === 1 ? '明天' : WEEKDAYS[target.weekday]
      const clock =
        String(target.hour).padStart(2, '0') + ':' + String(target.minute).padStart(2, '0')
      return { peak, until, label: `${dayLabel} ${clock}` }
    }

    /** "1:12:34", or "2天 16:12:34" past a day. */
    function formatRemaining(ms) {
      const total = Math.max(0, Math.floor(ms / 1000))
      const days = Math.floor(total / 86400)
      const hours = Math.floor((total % 86400) / 3600)
      const minutes = Math.floor((total % 3600) / 60)
      const seconds = total % 60
      const clock = `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      return days > 0 ? `${days}天 ${clock}` : clock
    }

    /** Parse "21,861,632 tok" / "1.2M tok" / "3 万" into a token count. */
    function parseCount(text) {
      const match = String(text).replace(/\s+/g, '').match(/([\d.,]+)([KkMm万亿])?/)
      if (match === null) return null
      const value = Number(match[1].replace(/,/g, ''))
      if (!Number.isFinite(value)) return null
      const scale = match[2]
      if (scale === 'K' || scale === 'k') return Math.round(value * 1e3)
      if (scale === 'M' || scale === 'm') return Math.round(value * 1e6)
      if (scale === '万') return Math.round(value * 1e4)
      if (scale === '亿') return Math.round(value * 1e8)
      return Math.round(value)
    }

    /** Read the dialog's `<dt>/<dd>` pairs into label/text records. */
    function readPairs(dl) {
      const pairs = []
      let label = ''
      for (const el of dl.children) {
        if (el.tagName === 'DT') label = (el.textContent || '').trim()
        else if (el.tagName === 'DD') pairs.push({ label, text: (el.textContent || '').trim() })
      }
      return pairs
    }

    /** Pick one count by its label, tolerating localized wording. */
    function byLabel(pairs, key) {
      const names = LABELS[key]
      const hit = pairs.find((pair) => names.some((name) => pair.label === name || pair.label.includes(name)))
      return hit === undefined ? null : parseCount(hit.text)
    }

    /** The four token counts the dialog prints, by label with a positional fallback. */
    function readCounts(dl) {
      // The cache-hit row prints a percentage; it carries no token count.
      const counts = readPairs(dl).filter((pair) => !pair.text.includes('%'))
      let uncached = byLabel(counts, 'uncached')
      let cacheRead = byLabel(counts, 'cacheRead')
      let cacheWrite = byLabel(counts, 'cacheWrite')
      let output = byLabel(counts, 'output')

      if (uncached === null || output === null) {
        const numbers = counts.map((pair) => parseCount(pair.text))
        if (numbers.length === 3) {
          uncached = numbers[0]
          cacheRead = numbers[1]
          cacheWrite = 0
          output = numbers[2]
        } else if (numbers.length === 4) {
          uncached = numbers[0]
          cacheRead = numbers[1]
          cacheWrite = numbers[2]
          output = numbers[3]
        } else {
          return null
        }
      }
      return { uncached: uncached || 0, cacheRead: cacheRead || 0, cacheWrite: cacheWrite || 0, output: output || 0 }
    }

    /** Format a CNY amount, keeping sub-cent sessions readable. */
    function formatCost(cost) {
      return cost >= 0.01 ? '≈ ¥' + cost.toFixed(2) : '≈ ¥' + cost.toFixed(4)
    }

    /** Find or create one appended row; returns the `<dd>` to write into. */
    function ensureRow(dl, key, labelText) {
      const existing = dl.querySelector(`dd[data-cost-line="${key}"]`)
      if (existing !== null) return existing
      const label = document.createElement('dt')
      label.dataset.costLine = `${key}-label`
      label.textContent = labelText
      const value = document.createElement('dd')
      value.dataset.costLine = key
      dl.append(label, value)
      return value
    }

    /** Price the dialog and paint all three rows. */
    function paint(dl, nowMs) {
      const counts = readCounts(dl)
      if (counts === null) return
      const tier = tierInfo(nowMs)
      const modelId = currentModelId()
      const row = priceRowFor(modelId)
      const prices = PRICES[row.model]
      const key = tier.peak ? 'peak' : 'off'
      const cost =
        (counts.uncached * prices.cacheMiss[key] +
          counts.cacheRead * prices.cacheHit[key] +
          counts.cacheWrite * prices.cacheMiss[key] +
          counts.output * prices.output[key]) /
        1e6

      const costRow = ensureRow(dl, 'cost', '费用')
      costRow.textContent = formatCost(cost)
      costRow.title =
        `按 ${row.model} 官方价（当前${tier.peak ? '高峰' : '空闲'}时段）估算` +
        (row.matched ? '' : `；模型 ${modelId ?? '未知'} 未在价目表内，按 Flash 价兜底`) +
        `；未缓存输入 ${counts.uncached.toLocaleString()} · 缓存读取 ${counts.cacheRead.toLocaleString()} · ` +
        `缓存写入 ${counts.cacheWrite.toLocaleString()} · 输出 ${counts.output.toLocaleString()}`

      const tierRow = ensureRow(dl, 'tier', '计价时段')
      tierRow.textContent = tier.peak ? '高峰' : '空闲'
      tierRow.title = tier.peak
        ? '北京时间工作日 9:00–12:00、14:00–18:00 为高峰；法定节假日未单独识别'
        : '空闲时段按高峰价的一半计费；周末全天为空闲'

      const untilRow = ensureRow(dl, 'until', '切换时间')
      untilRow.textContent = `${tier.label} · 剩 ${formatRemaining(tier.until - nowMs)}`
      untilRow.title = tier.peak ? '高峰结束，转为空闲价' : '空闲结束，转为高峰价'
    }

    return {
      apply(ctx) {
        let timer = 0
        const paintAll = () => {
          const nowMs = Date.now()
          for (const dl of document.querySelectorAll('dl[data-session-stats-usage]')) {
            try {
              paint(dl, nowMs)
            } catch {
              // A dialog shape this version does not understand must never
              // break the dialog itself.
            }
          }
        }
        // The transcript mutates constantly while streaming; coalesce scans.
        const schedule = () => {
          if (timer !== 0) return
          timer = window.setTimeout(() => {
            timer = 0
            paintAll()
          }, 150)
        }
        ctx.effect(() => {
          paintAll()
          const observer = new MutationObserver(schedule)
          observer.observe(document.body, { childList: true, subtree: true })
          // The countdown has to keep ticking while the dialog stays open.
          const ticker = window.setInterval(paintAll, 1000)
          return () => {
            observer.disconnect()
            window.clearInterval(ticker)
            if (timer !== 0) window.clearTimeout(timer)
          }
        })
      },
    }
  },
})
