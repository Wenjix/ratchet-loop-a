// Hand-drawn line quality as pre-jittered geometry: paths are displaced once with a
// seeded PRNG at module load (stable across renders, identical every run) and smoothed
// with Catmull-Rom → cubic béziers. No runtime filters — this is free at frame time.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function seedFrom(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash << 5) + hash + text.charCodeAt(i)) >>> 0;
  return hash;
}

// Displace each interior point perpendicular to the local tangent by ±amplitude.
export function jitter(points, { seed = 1, amplitude = 1.2 } = {}) {
  const rand = mulberry32(typeof seed === 'string' ? seedFrom(seed) : seed);
  return points.map(([x, y], i) => {
    if (i === 0 || i === points.length - 1) return [x, y];
    const [px, py] = points[i - 1];
    const [nx, ny] = points[i + 1];
    const tx = nx - px;
    const ty = ny - py;
    const len = Math.hypot(tx, ty) || 1;
    const offset = (rand() * 2 - 1) * amplitude;
    return [x + (-ty / len) * offset, y + (tx / len) * offset];
  });
}

// Catmull-Rom spline through the points, emitted as cubic béziers.
export function toPath(points, { close = false } = {}) {
  if (points.length < 2) return '';
  const pts = close ? [points[points.length - 1], ...points, points[0], points[1]] : [points[0], ...points, points[points.length - 1]];
  let d = `M ${pts[1][0].toFixed(2)} ${pts[1][1].toFixed(2)}`;
  for (let i = 1; i < pts.length - 2; i++) {
    const [x0, y0] = pts[i - 1];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[i + 2];
    const c1x = x1 + (x2 - x0) / 6;
    const c1y = y1 + (y2 - y0) / 6;
    const c2x = x2 - (x3 - x1) / 6;
    const c2y = y2 - (y3 - y1) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }
  if (close) d += ' Z';
  return d;
}

export function roughen(points, options = {}) {
  return toPath(jitter(points, options), options);
}

export function ellipsePoints(cx, cy, rx, ry, { startAngle = 0, endAngle = Math.PI * 2, segments = 64 } = {}) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const angle = startAngle + ((endAngle - startAngle) * i) / segments;
    points.push([cx + Math.cos(angle) * rx, cy + Math.sin(angle) * ry]);
  }
  return points;
}

export function linePoints([x1, y1], [x2, y2], segments = 16) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    points.push([x1 + ((x2 - x1) * i) / segments, y1 + ((y2 - y1) * i) / segments]);
  }
  return points;
}

// Sample a quadratic bézier — enough curvature control for garden paths.
export function quadPoints([x1, y1], [cx, cy], [x2, y2], segments = 24) {
  const points = [];
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = 1 - t;
    points.push([u * u * x1 + 2 * u * t * cx + t * t * x2, u * u * y1 + 2 * u * t * cy + t * t * y2]);
  }
  return points;
}

export function roundedRectPoints(x, y, width, height, radius = 6, perSide = 6) {
  const points = [];
  const corners = [
    [x + radius, y],
    [x + width - radius, y],
    [x + width, y + radius],
    [x + width, y + height - radius],
    [x + width - radius, y + height],
    [x + radius, y + height],
    [x, y + height - radius],
    [x, y + radius],
  ];
  for (let side = 0; side < 4; side++) {
    const [sx, sy] = corners[side * 2];
    const [ex, ey] = corners[side * 2 + 1];
    for (let i = 0; i < perSide; i++) {
      points.push([sx + ((ex - sx) * i) / perSide, sy + ((ey - sy) * i) / perSide]);
    }
    // corner arc approximated by its endpoint; jitter + smoothing rounds it off
    points.push([ex, ey]);
  }
  return points;
}
