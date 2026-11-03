/* 交互图表：读取 window.DATA，渲染 [data-chart] 容器为 SVG。
   悬停（或手机上点按）任意数据标记显示提示；颜色取自 CSS 变量，随深浅主题重绘。 */
(() => {
  const D = window.DATA;
  const NS = 'http://www.w3.org/2000/svg';
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const fmt = (v, d = 0) => Number(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });
  const sgn = (v, d = 2) => (v > 0 ? '+' : v < 0 ? '−' : '') + Math.abs(v).toFixed(d);
  const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const lin = (d0, d1, r0, r1) => v => r0 + (v - d0) / (d1 - d0) * (r1 - r0);
  const tip = (title, rows) => esc('<b>' + title + '</b>' + rows.map(r => `<div>${r[0]}　<span class="tv">${r[1]}</span></div>`).join(''));
  const T = (x, y, s, o = {}) => `<text x="${x}" y="${y}" fill="${o.fill || C.muted}" font-size="${o.size || 12}" text-anchor="${o.anchor || 'start'}"${o.weight ? ` font-weight="${o.weight}"` : ''}${o.mono ? ' class="mono"' : ''}${o.base ? ` dominant-baseline="${o.base}"` : ''}>${s}</text>`;
  let C = {};

  function palette() {
    C = { sky: css('--sky'), soft: css('--sky-soft'), wash: css('--sky-wash'), coral: css('--coral'), coralSoft: css('--coral-soft'),
      grey: css('--grey-mark'), ink: css('--ink'), ink2: css('--ink-2'), muted: css('--muted'), rule: css('--rule') };
  }
  function ticks(max, n = 4) {
    const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw)));
    const step = [1, 2, 2.5, 5, 10].map(m => m * p).find(s => s >= raw);
    const out = []; for (let v = 0; v <= max + 1e-9; v += step) out.push(+v.toFixed(6)); return out;
  }
  const hitStyle = `<style>.hitg .xh,.hitg .hl{opacity:0;transition:opacity .12s}.hitg:hover .xh,.hitg:hover .hl,.hitg.on .xh,.hitg.on .hl{opacity:1}.hitg:hover .bar,.hitg.on .bar{filter:brightness(1.08)}</style>`;

  /* ---------- 1. 折线 + 面积（月度订单） ---------- */
  function monthly(w) {
    const d = D.monthly, h = w < 520 ? 250 : 300, m = { l: 44, r: 12, t: 30, b: 28 };
    const X = i => m.l + (i + .5) * (w - m.l - m.r) / d.length, Y = lin(0, 8000, h - m.b, m.t), bw = (w - m.l - m.r) / d.length;
    let s = hitStyle + `<defs><linearGradient id="ga" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${C.sky}" stop-opacity=".28"/><stop offset="1" stop-color="${C.sky}" stop-opacity="0"/></linearGradient></defs>`;
    s += `<rect x="${X(12) - bw / 2}" y="${m.t - 10}" width="${X(19) - X(12) + bw}" height="${h - m.b - m.t + 10}" rx="10" fill="${C.wash}"/>`;
    s += T(X(15.5), m.t + 4, '2018：每月 6–7 千单', { anchor: 'middle', fill: C.ink2, size: 12 });
    ticks(8000, 4).forEach(v => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.rule}"/>` + T(m.l - 8, Y(v) + 4, fmt(v), { anchor: 'end', mono: 1, size: 11 }); });
    const pts = d.map((r, i) => [X(i), Y(r.orders)]);
    s += `<path d="M${pts[0][0]},${Y(0)} ${pts.map(p => 'L' + p.join(',')).join(' ')} L${pts.at(-1)[0]},${Y(0)}Z" fill="url(#ga)"/>`;
    s += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p.join(',')).join(' ')}" fill="none" stroke="${C.sky}" stroke-width="2.4" stroke-linejoin="round"/>`;
    d.forEach((r, i) => {
      if (i % (w < 520 ? 4 : 2) === 0) s += T(X(i), h - 8, r.month.replace('20', '').replace('-', '.'), { anchor: 'middle', mono: 1, size: 11 });
      s += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="3" fill="${C.sky}"/>`;
    });
    const bf = 10; s += T(pts[bf][0] - 10, pts[bf][1] - 12, '黑五 7,421', { anchor: 'end', fill: C.ink, weight: 700 });
    d.forEach((r, i) => {
      s += `<g class="hitg" data-tip="${tip(r.month, [['订单', fmt(r.orders)], ['买家', fmt(r.buyers)], ['GMV', 'R$ ' + fmt(r.gmv / 1e4, 1) + ' 万'], ['客单价', 'R$ ' + r.aov.toFixed(2)]])}">` +
        `<line class="xh" x1="${pts[i][0]}" x2="${pts[i][0]}" y1="${m.t - 6}" y2="${h - m.b}" stroke="${C.sky}" stroke-dasharray="3 3"/>` +
        `<circle class="hl" cx="${pts[i][0]}" cy="${pts[i][1]}" r="7" fill="${C.sky}" stroke="${css('--bg')}" stroke-width="3"/>` +
        `<rect x="${X(i) - bw / 2}" y="0" width="${bw}" height="${h}" fill="transparent"/></g>`;
    });
    return [s, h];
  }

  /* ---------- 2. 有正负的横条（增长拆解） ---------- */
  function growth(w) {
    const d = D.growth, rh = 46, m = { l: 86, r: 70, t: 8, b: 26 }, h = m.t + m.b + d.length * rh;
    const X = lin(-10, 150, m.l, w - m.r);
    let s = hitStyle;
    [0, 50, 100, 150].forEach(v => { s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${h - m.b}" stroke="${C.rule}"/>` + T(X(v), h - 8, v + '%', { anchor: 'middle', mono: 1, size: 11 }); });
    d.forEach((r, i) => {
      const y = m.t + i * rh + rh / 2, x0 = X(0), x1 = X(r.v), big = Math.abs(r.v) > 5;
      const fmtv = i === 1 ? v => v.toFixed(3) : i === 2 ? v => 'R$ ' + v.toFixed(2) : v => fmt(v);
      s += `<g class="hitg" data-tip="${tip(r.label, [['2017 年 1–8 月', fmtv(r.a)], ['2018 年 1–8 月', fmtv(r.b)], ['变化', sgn(r.v, 1) + '%']])}">`;
      s += T(m.l - 12, y + 4, r.label, { anchor: 'end', fill: C.ink2, size: 13 });
      s += `<rect class="bar" x="${Math.min(x0, x1)}" y="${y - 12}" width="${Math.max(3, Math.abs(x1 - x0))}" height="24" rx="6" fill="${big ? C.sky : C.grey}"/>`;
      s += T(Math.max(x0, x1) + 8, y + 5, sgn(r.v, 1) + '%', { fill: C.ink, weight: 700, mono: 1, size: 13 });
      s += `<rect x="0" y="${y - rh / 2}" width="${w}" height="${rh}" fill="transparent"/></g>`;
    });
    s += `<line x1="${X(0)}" x2="${X(0)}" y1="${m.t}" y2="${h - m.b}" stroke="${C.ink2}"/>`;
    return [s, h];
  }

  /* ---------- 3. 横向条形（品类复购、各州延迟） ---------- */
  function hbars(w, rows, o) {
    const rh = o.rh || 26, m = { l: o.ml || 76, r: o.mr || 54, t: 6, b: 24 }, h = m.t + m.b + rows.length * rh;
    const X = lin(0, o.max, m.l, w - m.r);
    let s = hitStyle;
    ticks(o.max, 4).forEach(v => { s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${h - m.b}" stroke="${C.rule}"/>` + T(X(v), h - 6, v + (o.unit || ''), { anchor: 'middle', mono: 1, size: 11 }); });
    if (o.ref != null) s += `<line x1="${X(o.ref)}" x2="${X(o.ref)}" y1="${m.t}" y2="${h - m.b}" stroke="${C.ink2}" stroke-dasharray="4 3"/>`;
    rows.forEach((r, i) => {
      const y = m.t + i * rh + rh / 2;
      s += `<g class="hitg" data-tip="${tip(r.label, o.tip(r))}">`;
      s += T(m.l - 10, y + 4, r.label, { anchor: 'end', fill: C.ink2, size: 12 });
      s += `<rect class="bar" x="${m.l}" y="${y - rh * .32}" width="${Math.max(2, X(r.v) - m.l)}" height="${rh * .64}" rx="4" fill="${o.color(r)}"/>`;
      const lx = (o.ref != null && X(r.v) < X(o.ref) + 4 && X(r.v) > X(o.ref) - 34) ? X(o.ref) + 5 : X(r.v) + 6;
      s += T(lx, y + 4, r.v.toFixed(1) + '%', { fill: C.ink2, mono: 1, size: 11 });
      s += `<rect x="0" y="${y - rh / 2}" width="${w}" height="${rh}" fill="transparent"/></g>`;
    });
    return [s, h];
  }
  const catRepeat = w => hbars(w, D.catRepeat, { max: 6, unit: '%', ref: D.repeatAvg, color: r => r.v > D.repeatAvg ? C.sky : C.soft,
    tip: r => [['首单用户', fmt(r.n)], ['复购率', r.v.toFixed(2) + '%'], ['相对平均', sgn(r.v - D.repeatAvg) + ' pp']] });
  const stateLate = w => hbars(w, D.state, { max: 20, unit: '%', ref: D.lateAvg, ml: 40, rh: 24, color: r => r.label === 'RJ' ? C.coral : r.label === 'SP' ? C.sky : C.soft,
    tip: r => [['订单', fmt(r.n)], ['延迟率', r.v.toFixed(1) + '%'], ['平均配送', r.days.toFixed(1) + ' 天'], ['平均评分', r.score.toFixed(2)]] });

  /* ---------- 4. 分组横条（RFM） ---------- */
  function rfm(w) {
    const d = D.rfm, rh = 54, m = { l: 86, r: 44, t: 6, b: 24 }, h = m.t + m.b + d.length * rh, X = lin(0, 50, m.l, w - m.r);
    let s = hitStyle;
    [0, 10, 20, 30, 40, 50].forEach(v => { s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${h - m.b}" stroke="${C.rule}"/>` + T(X(v), h - 6, v + '%', { anchor: 'middle', mono: 1, size: 11 }); });
    d.forEach((r, i) => {
      const y = m.t + i * rh + rh / 2, hl = r.label === '沉睡高价值';
      s += `<g class="hitg" data-tip="${tip(r.label, [['用户', fmt(r.n) + '（' + r.users.toFixed(1) + '%）'], ['GMV 占比', r.gmv.toFixed(1) + '%'], ['人均消费', 'R$ ' + r.avg.toFixed(1)], ['距上次购买', r.rec + ' 天']])}">`;
      s += T(m.l - 10, y + 4, r.label, { anchor: 'end', fill: hl ? C.ink : C.ink2, size: 12, weight: hl ? 700 : 0 });
      s += `<rect class="bar" x="${m.l}" y="${y - 17}" width="${X(r.users) - m.l}" height="14" rx="4" fill="${C.soft}"/>`;
      s += `<rect class="bar" x="${m.l}" y="${y + 1}" width="${X(r.gmv) - m.l}" height="14" rx="4" fill="${C.sky}"/>`;
      s += T(X(r.users) + 5, y - 6, r.users.toFixed(0) + '%', { mono: 1, size: 11 });
      s += T(X(r.gmv) + 5, y + 12, r.gmv.toFixed(0) + '%', { mono: 1, size: 11, fill: C.ink, weight: 700 });
      s += `<rect x="0" y="${y - rh / 2}" width="${w}" height="${rh}" fill="transparent"/></g>`;
    });
    return [s, h];
  }

  /* ---------- 5. 竖向条形（延迟与 1 星、所需天数） ---------- */
  function vbars(w, rows, o) {
    const h = w < 520 ? 270 : 300, m = { l: 40, r: 10, t: 26, b: o.sub ? 52 : 30 }, bw = (w - m.l - m.r) / rows.length;
    const Y = lin(0, o.max, h - m.b, m.t);
    let s = hitStyle;
    ticks(o.max, 4).forEach(v => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${C.rule}"/>` + T(m.l - 8, Y(v) + 4, v + (o.unit || ''), { anchor: 'end', mono: 1, size: 11 }); });
    if (o.ref != null) s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(o.ref)}" y2="${Y(o.ref)}" stroke="${C.coral}" stroke-dasharray="5 4" stroke-width="1.5"/>`;
    rows.forEach((r, i) => {
      const x = m.l + i * bw, cw = Math.min(bw * .56, 90), v = o.val(r);
      s += `<g class="hitg" data-tip="${tip(r.label, o.tip(r))}">`;
      s += `<rect class="bar" x="${x + (bw - cw) / 2}" y="${Y(v)}" width="${cw}" height="${Y(0) - Y(v)}" rx="7" fill="${o.color(r, i)}"/>`;
      s += T(x + bw / 2, Y(v) - 8, o.label(r), { anchor: 'middle', fill: C.ink, weight: 700, mono: 1, size: 13 });
      s += T(x + bw / 2, h - m.b + 18, (w < 480 && o.short) ? o.short[i] : r.label, { anchor: 'middle', fill: C.ink2, size: w < 420 ? 11 : 12 });
      if (o.sub) s += T(x + bw / 2, h - m.b + 36, o.sub(r, w < 480), { anchor: 'middle', size: 11 });
      s += `<rect x="${x}" y="0" width="${bw}" height="${h}" fill="transparent"/></g>`;
    });
    return [s, h];
  }
  const delay = w => vbars(w, D.delay, { max: 80, unit: '%', val: r => r.v, label: r => r.v.toFixed(1) + '%',
    color: (r, i) => [C.grey, C.coralSoft, C.coral, C.coral][i], sub: (r, n) => (n ? '' : '占订单 ') + r.share + '%', short: ['按时', '迟 1–3', '迟 4–7', '迟 7+'],
    tip: r => [['订单', fmt(r.n)], ['1 星占比', r.v.toFixed(1) + '%'], ['平均评分', r.score.toFixed(2)]] });
  const sampleSize = w => vbars(w, D.sampleSize, { max: 200, val: r => r.days, label: r => r.days + ' 天', ref: 22,
    color: (r, i) => i === 0 ? C.grey : C.sky, sub: (r, n) => (n ? '' : '每组 ') + (r.n / 1e4).toFixed(1) + ' 万人',
    tip: r => [['想检测的相对提升', r.label], ['每组样本', fmt(r.n)], ['所需天数', r.days + ' 天']] });

  /* ---------- 6. 双面板（月度延迟率 + 评分） ---------- */
  function monthlyLate(w) {
    const d = D.monthlyLate, h = w < 520 ? 330 : 360, m = { l: 40, r: 10, t: 18, b: 26 }, gap = 26;
    const ph = (h - m.t - m.b - gap) / 2, bw = (w - m.l - m.r) / d.length, X = i => m.l + (i + .5) * bw;
    const Y1 = lin(0, 20, m.t + ph, m.t), Y2 = lin(3.7, 4.4, h - m.b, h - m.b - ph);
    let s = hitStyle;
    [0, 10, 20].forEach(v => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y1(v)}" y2="${Y1(v)}" stroke="${C.rule}"/>` + T(m.l - 8, Y1(v) + 4, v + '%', { anchor: 'end', mono: 1, size: 11 }); });
    [3.8, 4.0, 4.2, 4.4].forEach(v => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y2(v)}" y2="${Y2(v)}" stroke="${C.rule}"/>` + T(m.l - 8, Y2(v) + 4, v.toFixed(1), { anchor: 'end', mono: 1, size: 11 }); });
    s += T(m.l, m.t - 6, '延迟率', { fill: C.ink2, size: 12 }) + T(m.l, h - m.b - ph - 8, '平均评分', { fill: C.ink2, size: 12 });
    const pts = d.map((r, i) => [X(i), Y2(r.score)]);
    s += `<path d="${pts.map((p, i) => (i ? 'L' : 'M') + p.join(',')).join(' ')}" fill="none" stroke="${C.sky}" stroke-width="2.2"/>`;
    d.forEach((r, i) => {
      const col = r.late >= 10 ? C.coral : r.late >= 6 ? C.coralSoft : C.grey;
      s += `<rect class="bar" x="${X(i) - bw * .32}" y="${Y1(r.late)}" width="${bw * .64}" height="${Y1(0) - Y1(r.late)}" rx="3" fill="${col}"/>`;
      if (r.late >= 10) s += T(X(i), Y1(r.late) - 5, Math.round(r.late) + '%', { anchor: 'middle', fill: C.ink, size: 11, mono: 1, weight: 700 });
      s += `<circle cx="${pts[i][0]}" cy="${pts[i][1]}" r="2.6" fill="${C.sky}"/>`;
      if (i % (w < 520 ? 4 : 2) === 0) s += T(X(i), h - 8, r.month.replace('20', '').replace('-', '.'), { anchor: 'middle', mono: 1, size: 11 });
      s += `<g class="hitg" data-tip="${tip(r.month, [['延迟率', r.late.toFixed(1) + '%'], ['平均评分', r.score.toFixed(2)], ['已签收订单', fmt(r.n)]])}">` +
        `<line class="xh" x1="${X(i)}" x2="${X(i)}" y1="${m.t}" y2="${h - m.b}" stroke="${C.sky}" stroke-dasharray="3 3"/>` +
        `<circle class="hl" cx="${pts[i][0]}" cy="${pts[i][1]}" r="6" fill="${C.sky}" stroke="${css('--bg')}" stroke-width="2"/>` +
        `<rect x="${X(i) - bw / 2}" y="0" width="${bw}" height="${h}" fill="transparent"/></g>`;
    });
    return [s, h];
  }

  /* ---------- 7. 森林图（A/B 效果与置信区间） ---------- */
  function forest(w) {
    const d = D.forest, rh = 34, narrow = w < 560, m = { l: 84, r: narrow ? 12 : 150, t: 30, b: 34 }, h = m.t + m.b + d.length * rh + 12;
    const X = lin(-1, 1.4, m.l, w - m.r);
    let s = hitStyle;
    s += `<rect x="${X(D.mde)}" y="${m.t - 22}" width="${X(1.4) - X(D.mde)}" height="${h - m.b - m.t + 22}" rx="8" fill="${C.wash}"/>`;
    s += T(X(D.mde) + 6, m.t - 8, narrow ? '可检测区' : '可检测的提升 ≥ ' + D.mde.toFixed(2) + ' pp', { fill: C.ink2, size: 11 });
    [-1, -.5, 0, .5, 1].forEach(v => { s += `<line x1="${X(v)}" x2="${X(v)}" y1="${m.t}" y2="${h - m.b}" stroke="${v === 0 ? C.ink2 : C.rule}"/>` + T(X(v), h - m.b + 18, (v > 0 ? '+' : '') + v, { anchor: 'middle', mono: 1, size: 11 }); });
    if (!narrow) s += T(w - 4, m.t - 8, '差异 [95% 区间]', { anchor: 'end', size: 11 });
    let y = m.t;
    d.forEach((r, i) => {
      if (i === 1 || i === 3) { s += `<line x1="${m.l - 70}" x2="${w - 4}" y1="${y + 6}" y2="${y + 6}" stroke="${C.rule}"/>`; y += 6; }
      const cy = y + rh / 2, c = r.main ? C.sky : C.muted;
      const rows = [['差异', sgn(r.d) + ' pp'], ['95% 区间', `[${sgn(r.lo)}, ${sgn(r.hi)}]`]];
      if (r.p != null) rows.push(['p 值', r.p.toFixed(3)], ['校正后 p', r.padj.toFixed(2)]);
      s += `<g class="hitg" data-tip="${tip(r.label, rows)}">`;
      s += T(m.l - 12, cy + 4, r.label, { anchor: 'end', fill: r.main ? C.ink : C.ink2, size: 12, weight: r.main ? 700 : 0 });
      s += `<line x1="${X(r.lo)}" x2="${X(r.hi)}" y1="${cy}" y2="${cy}" stroke="${c}" stroke-width="${r.main ? 4 : 2.5}" stroke-linecap="round"/>`;
      s += `<circle cx="${X(r.d)}" cy="${cy}" r="${r.main ? 7 : 5}" fill="${c}" stroke="${css('--bg')}" stroke-width="2"/>`;
      if (!narrow) s += T(w - 4, cy + 4, `${sgn(r.d)}  [${sgn(r.lo)}, ${sgn(r.hi)}]`, { anchor: 'end', mono: 1, size: 11, fill: r.main ? C.ink : C.muted, weight: r.main ? 700 : 0 });
      s += `<rect x="0" y="${y}" width="${w}" height="${rh}" fill="transparent"/></g>`;
      y += rh;
    });
    s += T(X(.2), h - 4, '新页面 − 旧页面（百分点）', { anchor: 'middle', size: 11 });
    return [s, h];
  }

  /* ---------- 8. 累计效果与置信带 ---------- */
  function cum(w) {
    const d = D.cum, h = w < 520 ? 250 : 280, m = { l: 44, r: 12, t: 14, b: 28 }, bw = (w - m.l - m.r) / d.length;
    const X = i => m.l + (i + .5) * bw, Y = lin(-1.3, 1.1, h - m.b, m.t), cl = v => Math.max(-1.3, Math.min(1.1, v));
    let s = hitStyle + `<defs><clipPath id="cc"><rect x="${m.l}" y="${m.t}" width="${w - m.l - m.r}" height="${h - m.t - m.b}"/></clipPath></defs>`;
    [-1, -.5, 0, .5, 1].forEach(v => { s += `<line x1="${m.l}" x2="${w - m.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="${v === 0 ? C.ink2 : C.rule}"/>` + T(m.l - 8, Y(v) + 4, (v > 0 ? '+' : '') + v, { anchor: 'end', mono: 1, size: 11 }); });
    const up = d.map((r, i) => X(i) + ',' + Y(cl(r.hi))), lo = d.map((r, i) => X(i) + ',' + Y(cl(r.lo))).reverse();
    s += `<g clip-path="url(#cc)"><path d="M${up.join(' L')} L${lo.join(' L')}Z" fill="${C.sky}" fill-opacity=".18"/>`;
    s += `<path d="${d.map((r, i) => (i ? 'L' : 'M') + X(i) + ',' + Y(r.d)).join(' ')}" fill="none" stroke="${C.sky}" stroke-width="2.4"/></g>`;
    d.forEach((r, i) => {
      if (i % (w < 520 ? 5 : 3) === 0) s += T(X(i), h - 8, r.day.replace('-', '.'), { anchor: 'middle', mono: 1, size: 11 });
      s += `<g class="hitg" data-tip="${tip('01.' + r.day.slice(3) + ' 累计', [['累计差异', sgn(r.d) + ' pp'], ['95% 区间', `[${sgn(r.lo)}, ${sgn(r.hi)}]`], ['累计 p 值', r.p.toFixed(2)], ['当日差异', sgn(r.daily) + ' pp']])}">` +
        `<line class="xh" x1="${X(i)}" x2="${X(i)}" y1="${m.t}" y2="${h - m.b}" stroke="${C.sky}" stroke-dasharray="3 3"/>` +
        `<circle class="hl" cx="${X(i)}" cy="${Y(r.d)}" r="6" fill="${C.sky}" stroke="${css('--bg')}" stroke-width="2"/>` +
        `<rect x="${X(i) - bw / 2}" y="0" width="${bw}" height="${h}" fill="transparent"/></g>`;
    });
    return [s, h];
  }

  /* ---------- 首页迷你图（无坐标轴） ---------- */
  function miniDelay(w) {
    const d = D.delay, h = 150, bw = w / d.length, Y = lin(0, 80, h - 22, 10);
    let s = hitStyle;
    d.forEach((r, i) => {
      const cw = Math.min(bw * .6, 54), x = i * bw + (bw - cw) / 2;
      s += `<g class="hitg" data-tip="${tip(r.label, [['1 星占比', r.v.toFixed(1) + '%'], ['平均评分', r.score.toFixed(2)]])}">`;
      s += `<rect class="bar" x="${x}" y="${Y(r.v)}" width="${cw}" height="${Y(0) - Y(r.v)}" rx="6" fill="${[C.grey, C.coralSoft, C.coral, C.coral][i]}"/>`;
      s += T(x + cw / 2, Y(r.v) - 6, r.v.toFixed(0) + '%', { anchor: 'middle', fill: C.ink, size: 11, mono: 1, weight: 700 });
      s += T(x + cw / 2, h - 4, ['按时', '迟 1–3', '迟 4–7', '迟 7+'][i], { anchor: 'middle', size: 11 });
      s += `<rect x="${i * bw}" y="0" width="${bw}" height="${h}" fill="transparent"/></g>`;
    });
    return [s, h];
  }
  function miniCI(w) {
    const r = D.forest[0], h = 110, X = lin(-1, 1.4, 10, w - 10), cy = 52;
    let s = hitStyle;
    s += `<rect x="${X(D.mde)}" y="10" width="${X(1.4) - X(D.mde)}" height="76" rx="8" fill="${C.wash}"/>`;
    s += T(X(D.mde) + 8, 26, '可检测区', { size: 11, fill: C.ink2 });
    s += `<line x1="${X(0)}" x2="${X(0)}" y1="10" y2="86" stroke="${C.ink2}"/>`;
    s += `<g class="hitg" data-tip="${tip('整体效果', [['差异', sgn(r.d) + ' pp'], ['95% 区间', `[${sgn(r.lo)}, ${sgn(r.hi)}]`]])}">`;
    s += `<line x1="${X(r.lo)}" x2="${X(r.hi)}" y1="${cy}" y2="${cy}" stroke="${C.sky}" stroke-width="5" stroke-linecap="round"/>`;
    s += `<circle cx="${X(r.d)}" cy="${cy}" r="8" fill="${C.sky}" stroke="${css('--bg')}" stroke-width="3"/>`;
    s += `<rect x="0" y="20" width="${w}" height="64" fill="transparent"/></g>`;
    [-1, 0, 1].forEach(v => { s += T(X(v), h - 6, (v > 0 ? '+' : '') + v + ' pp', { anchor: 'middle', mono: 1, size: 11 }); });
    return [s, h];
  }

  const R = { monthly, growth, catRepeat, rfm, delay, monthlyLate, stateLate, forest, cum, sampleSize, miniDelay, miniCI };

  /* ---------- 渲染与交互 ---------- */
  const tipEl = document.createElement('div'); tipEl.className = 'tip'; tipEl.setAttribute('role', 'status'); document.body.appendChild(tipEl);
  let onG = null;
  function place(e) {
    const pad = 14, r = tipEl.getBoundingClientRect();
    let x = e.clientX + pad, y = e.clientY - r.height - pad;
    if (x + r.width > innerWidth - 8) x = e.clientX - r.width - pad;
    if (y < 8) y = e.clientY + pad;
    tipEl.style.left = Math.max(8, x) + 'px'; tipEl.style.top = y + 'px';
  }
  function show(g, e) {
    if (onG && onG !== g) onG.classList.remove('on');
    onG = g; g.classList.add('on');
    tipEl.innerHTML = g.getAttribute('data-tip'); tipEl.classList.add('on'); place(e);
  }
  function hide() { if (onG) onG.classList.remove('on'); onG = null; tipEl.classList.remove('on'); }

  function render(el) {
    const w = Math.max(280, Math.round(el.clientWidth));
    const [body, h] = R[el.dataset.chart](w);
    el.innerHTML = `<svg viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${esc(el.dataset.label || '')}">${body}</svg>`;
  }
  function renderAll() { palette(); document.querySelectorAll('[data-chart]').forEach(render); }

  document.addEventListener('pointermove', e => {
    const g = e.target.closest && e.target.closest('.hitg');
    if (g) show(g, e); else if (e.pointerType === 'mouse') hide();
  });
  document.addEventListener('pointerdown', e => {
    const g = e.target.closest && e.target.closest('.hitg');
    if (g) show(g, e); else hide();
  });
  addEventListener('scroll', () => { if (onG) hide(); }, { passive: true });

  let t; addEventListener('resize', () => { clearTimeout(t); t = setTimeout(renderAll, 120); });
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', renderAll);
  new MutationObserver(renderAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(renderAll);
  renderAll();
  window.Charts = { renderAll };
})();
