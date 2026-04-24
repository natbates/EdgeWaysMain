export type TSNEProjection = { x: number; y: number };

const EPS = 1e-12;

function squaredDistance(a: number[], b: number[]): number {
  let sum = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i += 1) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return sum;
}

function gaussianPerplexity(
  distances: number[],
  targetPerplexity: number,
  maxIterations = 50,
): number[] {
  let beta = 1.0;
  let minBeta = -Infinity;
  let maxBeta = Infinity;

  const logPerplexity = Math.log(targetPerplexity);

  for (let iter = 0; iter < maxIterations; iter += 1) {
    const ps = distances.map(d => Math.exp(-d * beta));
    ps[0] = 0;
    const sumP = ps.reduce((sum, v) => sum + v, 0) + EPS;
    const normalized = ps.map(v => v / sumP);

    let entropy = 0;
    for (let j = 0; j < normalized.length; j += 1) {
      const p = normalized[j];
      if (p > 0) {
        entropy -= p * Math.log(p + EPS);
      }
    }

    const perp = entropy;
    if (Math.abs(perp - logPerplexity) < 1e-5) {
      return normalized;
    }

    if (perp > logPerplexity) {
      minBeta = beta;
      beta = maxBeta === Infinity ? beta * 2 : (beta + maxBeta) / 2;
    } else {
      maxBeta = beta;
      beta = minBeta === -Infinity ? beta / 2 : (beta + minBeta) / 2;
    }
  }

  const ps = distances.map(d => Math.exp(-d * beta));
  ps[0] = 0;
  const sumP = ps.reduce((sum, v) => sum + v, 0) + EPS;
  return ps.map(v => v / sumP);
}

function computeHighDimensionalAffinities(
  points: number[][],
  perplexity: number,
): number[][] {
  const n = points.length;

  const distances = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < i; j += 1) {
      const dist = squaredDistance(points[i], points[j]);
      distances[i][j] = dist;
      distances[j][i] = dist;
    }
  }

  const p = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    const row = distances[i];
    const pi = gaussianPerplexity(row, perplexity);
    for (let j = 0; j < n; j += 1) {
      p[i][j] = pi[j];
    }
  }

  const affinities = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      affinities[i][j] = (p[i][j] + p[j][i]) / (2 * n);
    }
  }

  return affinities;
}

function initializePositions(points: number[][]): TSNEProjection[] {
  return points.map(point => ({
    x: point[0] ?? Math.random() * 0.001,
    y: point[1] ?? Math.random() * 0.001,
  }));
}

function computeLowDimAffinities(coords: TSNEProjection[]): number[][] {
  const n = coords.length;
  const affinities = Array.from({ length: n }, () => new Array(n).fill(0));
  let sum = 0;
  for (let i = 0; i < n; i += 1) {
    for (let j = i + 1; j < n; j += 1) {
      const dx = coords[i].x - coords[j].x;
      const dy = coords[i].y - coords[j].y;
      const distSq = dx * dx + dy * dy;
      const value = 1 / (1 + distSq);
      affinities[i][j] = value;
      affinities[j][i] = value;
      sum += 2 * value;
    }
  }

  if (sum < EPS) {
    return affinities;
  }

  for (let i = 0; i < n; i += 1) {
    for (let j = 0; j < n; j += 1) {
      affinities[i][j] /= sum;
    }
  }

  return affinities;
}

export function computeTSNEProjection(
  points: number[][],
  perplexity = 20,
  iterations = 150,
): TSNEProjection[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [{ x: 0, y: 0 }];

  const n = points.length;
  const P = computeHighDimensionalAffinities(points, perplexity);
  const Y = initializePositions(points);
  const gains = Array.from({ length: n }, () => ({ x: 1, y: 1 }));
  const yIncs = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  const momentum = 0.8;
  const learningRate = 100;

  for (let iter = 0; iter < iterations; iter += 1) {
    const lowAffinities = computeLowDimAffinities(Y);
    const grads = Array.from({ length: n }, () => ({ x: 0, y: 0 }));

    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < n; j += 1) {
        if (i === j) continue;
        const pij = P[i][j];
        const qij = lowAffinities[i][j];
        const mult = 4 * (pij - qij) * qij;
        const dx = Y[i].x - Y[j].x;
        const dy = Y[i].y - Y[j].y;
        grads[i].x += mult * dx;
        grads[i].y += mult * dy;
      }
    }

    for (let i = 0; i < n; i += 1) {
      const grad = grads[i];
      const inc = yIncs[i];
      const gain = gains[i];

      gain.x =
        Math.sign(grad.x) !== Math.sign(inc.x) ? gain.x + 0.2 : gain.x * 0.8;
      gain.y =
        Math.sign(grad.y) !== Math.sign(inc.y) ? gain.y + 0.2 : gain.y * 0.8;
      gain.x = Math.max(0.01, Math.min(gain.x, 100));
      gain.y = Math.max(0.01, Math.min(gain.y, 100));

      inc.x = momentum * inc.x - learningRate * gain.x * grad.x;
      inc.y = momentum * inc.y - learningRate * gain.y * grad.y;

      Y[i].x += inc.x;
      Y[i].y += inc.y;
    }
  }

  return Y;
}
