/* 粒子云海：每个光点代表 40 笔 Olist 订单。
   加载时从四散汇聚成"订单量地平线"（2017.01 → 2018.08 的月度订单曲线），之后随气流缓慢浮动；
   指针划过像风一样把粒子吹开。用法：<canvas class="cover-canvas" data-shape="orders|band" data-density="1"> */
(() => {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const css = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();
  const orders = (window.DATA && DATA.monthly ? DATA.monthly.map(r => r.orders) : [787,1718,2617,2377,3640,3205,3946,4272,4227,4547,7421,5618,7187,6624,7168,6919,6833,6145,6233,6421]);
  const PER = 40;

  function hex(c) { // '#rrggbb' -> [r,g,b]
    c = c.replace('#', ''); if (c.length === 3) c = c.split('').map(x => x + x).join('');
    return [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
  }

  document.querySelectorAll('canvas.cover-canvas').forEach(cv => {
    const ctx = cv.getContext('2d');
    const shape = cv.dataset.shape || 'orders';
    const density = +(cv.dataset.density || 1);
    let geo = { base: 0, span: 0 }, W = 0, H = 0, P = [], t0 = performance.now(), mouse = { x: -9999, y: -9999, on: false }, raf = 0, visible = true;
    let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

    // 月度订单 -> 连续的地平线高度（余弦插值），返回 0..1
    const maxO = Math.max(...orders);
    function hAt(fx) {
      if (shape === 'twin') { const g = (c, k) => k * Math.exp(-Math.pow((fx - c) / .12, 2)); return .02 + g(.28, 1) + g(.72, 11.873 / 12.017); }
      if (shape === 'band') return .55 + .18 * Math.sin(fx * 7.1) * Math.sin(fx * 2.3 + 1) + .08 * Math.sin(fx * 17);
      const p = fx * (orders.length - 1), i = Math.min(orders.length - 2, Math.floor(p)), f = p - i, g = (1 - Math.cos(f * Math.PI)) / 2;
      return (orders[i] * (1 - g) + orders[i + 1] * g) / maxO;
    }

    function build() {
      const r = cv.getBoundingClientRect(), dpr = Math.min(devicePixelRatio || 1, 2);
      W = r.width; H = r.height; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      seed = 11; P = [];
      const total = shape === 'orders' ? Math.round(orders.reduce((a, b) => a + b, 0) / PER) : shape === 'twin' ? 1500 : 1400;
      const n = Math.round(total * density * Math.min(1, Math.max(.45, W / 1280)));
      const base = H * (shape === 'orders' ? .97 : .98), top = H * (+cv.dataset.top || (shape === 'orders' ? .46 : .2)), span = base - top;
      // 按高度加权采样横坐标，使粒子数与订单量成正比
      const cdf = [], S = 400; let acc = 0;
      for (let k = 0; k < S; k++) { acc += hAt(k / (S - 1)); cdf.push(acc); }
      for (let k = 0; k < n; k++) {
        const u = rnd() * acc; let lo = 0, hi = S - 1; while (lo < hi) { const m = (lo + hi) >> 1; if (cdf[m] < u) lo = m + 1; else hi = m; }
        const fx = (lo + rnd()) / S, h = hAt(Math.min(1, fx)) * span;
        const depth = Math.pow(rnd(), .42);                // 越靠近云顶越密
        const tx = fx * W, ty = base - h * depth + (rnd() - .5) * 6;
        P.push({ tx, ty, x: rnd() * W, y: rnd() * H * .9, vx: 0, vy: 0, r: .7 + Math.pow(rnd(), 2.4) * 2.6, a: .35 + rnd() * .65,
          ph: rnd() * 6.283, sp: .25 + rnd() * .5, delay: fx * .9 + rnd() * .35, top: depth > .9 });
      }
      geo = { base, span };
      if (reduce) P.forEach(p => { p.x = p.tx; p.y = p.ty; });
      t0 = performance.now();
    }

    function frame(now) {
      const t = (now - t0) / 1000;
      ctx.clearRect(0, 0, W, H);
      const [r1, g1, b1] = hex(css('--particle') || '#ffffff'), [r2, g2, b2] = hex(css('--particle-2') || '#bfe6ff');
      const glow = css('--particle-blend') === 'lighter';
      const [ri, gi, bi] = hex(css('--cover-ink') || '#ffffff'), ink = a => `rgba(${ri},${gi},${bi},${a})`;
      // 云层薄雾与发光轮廓：沿订单曲线，汇聚完成后渐显
      const form = reduce ? 1 : Math.min(1, Math.max(0, (t - .6) / 1.6));
      if (form > 0) {
        const pts = []; for (let k = 0; k <= 160; k++) { const fx = k / 160; pts.push([fx * W, geo.base - hAt(fx) * geo.span * .97 + (reduce ? 0 : Math.sin(t * .6 + fx * 9) * 2)]); }
        const g = ctx.createLinearGradient(0, geo.base - geo.span, 0, H);
        g.addColorStop(0, `rgba(${r1},${g1},${b1},${.30 * form})`); g.addColorStop(.55, `rgba(${r2},${g2},${b2},${.10 * form})`); g.addColorStop(1, `rgba(${r2},${g2},${b2},0)`);
        ctx.beginPath(); ctx.moveTo(0, H); pts.forEach(p => ctx.lineTo(p[0], p[1])); ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = g; ctx.fill();
        ctx.beginPath(); pts.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]));
        ctx.strokeStyle = `rgba(${r1},${g1},${b1},${.75 * form})`; ctx.lineWidth = 1.4; ctx.stroke();
        if (shape === 'twin') { // 两组转化率：几乎一样高
          const lab = [[.28, 'A 旧页面 12.02%'], [.72, 'B 新页面 11.87%']];
          ctx.font = '500 12px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center';
          const ys = lab.map(([fx]) => geo.base - hAt(fx) * geo.span * .97);
          ctx.strokeStyle = ink(.45 * form); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(.28 * W, ys[0] - 14); ctx.lineTo(.72 * W, ys[1] - 14); ctx.stroke(); ctx.setLineDash([]);
          lab.forEach(([fx, txt], i) => { ctx.fillStyle = `rgba(${r1},${g1},${b1},${form})`; ctx.beginPath(); ctx.arc(fx * W, ys[i], 3.5, 0, 6.283); ctx.fill(); ctx.fillStyle = ink(.9 * form); ctx.fillText(txt, fx * W, ys[i] - 22); });
          ctx.fillStyle = ink(.7 * form); ctx.fillText('p = 0.23', .5 * W, (ys[0] + ys[1]) / 2 - 22); ctx.textAlign = 'start';
        }
        if (shape === 'orders' && cv.dataset.peak !== '0') { // 峰值标注：黑五
          const fx = 10 / (orders.length - 1), px = fx * W, py = geo.base - hAt(fx) * geo.span * .97;
          ctx.fillStyle = `rgba(${r1},${g1},${b1},${form})`; ctx.beginPath(); ctx.arc(px, py, 3.5, 0, 6.283); ctx.fill();
          ctx.strokeStyle = ink(.45 * form); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(px, py - 8); ctx.lineTo(px, py - 34); ctx.stroke();
          ctx.font = '500 12px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'center'; ctx.fillStyle = ink(.9 * form); ctx.fillText('2017.11 · 7,421', px, py - 42); ctx.textAlign = 'start';
        }
      }
      ctx.globalCompositeOperation = glow ? 'lighter' : 'source-over';
      for (const p of P) {
        let gx = p.tx, gy = p.ty;
        if (!reduce) {
          gx += Math.sin(t * p.sp + p.ph + p.ty * .012) * 3.2;
          gy += Math.cos(t * p.sp * .8 + p.tx * .006) * 2.2;
          const k = Math.min(1, Math.max(0, (t - p.delay) / 1.2)), ease = k * k * (3 - 2 * k);
          const sx = .012 + .07 * ease;
          p.vx += (gx - p.x) * sx; p.vy += (gy - p.y) * sx;
          if (mouse.on) {
            const dx = p.x - mouse.x, dy = p.y - mouse.y, d2 = dx * dx + dy * dy, R = 110;
            if (d2 < R * R) { const d = Math.sqrt(d2) || 1, f = (1 - d / R) * 3.2; p.vx += dx / d * f; p.vy += dy / d * f; }
          }
          p.vx *= .82; p.vy *= .82; p.x += p.vx; p.y += p.vy;
        }
        const tw = .75 + .25 * Math.sin(t * 1.3 + p.ph);
        ctx.fillStyle = p.top ? `rgba(${r1},${g1},${b1},${p.a * tw})` : `rgba(${r2},${g2},${b2},${p.a * .8 * tw})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 6.283); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
      if (!reduce && visible) raf = requestAnimationFrame(frame);
    }

    function start() { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    const host = cv.parentElement;
    host.addEventListener('pointermove', e => { const r = cv.getBoundingClientRect(); mouse = { x: e.clientX - r.left, y: e.clientY - r.top, on: true }; });
    host.addEventListener('pointerleave', () => { mouse.on = false; });
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[0].isIntersecting; if (visible && !reduce) start(); }).observe(cv);
    let rt; addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => { build(); start(); }, 150); });
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (reduce) frame(performance.now()); });
    build(); start();
  });
})();
