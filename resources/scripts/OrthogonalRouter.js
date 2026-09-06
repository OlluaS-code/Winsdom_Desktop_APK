/**
 * Roteador geométrico ortogonal que conecta portas magnéticas de tabelas
 * prevenindo colisões com obstáculos e aplicando suavização Bézier aos vértices.
 */
class OrthogonalRouter {
  constructor(cornerRadius = 6, clearance = 24) {
    this.r = cornerRadius;
    this.clearance = clearance;
  }

  route(p1, p2, obstacles = []) {
    const rawWaypoints = this.calculateWaypoints(p1, p2, obstacles);
    return this.generateSmoothPath(rawWaypoints);
  }

  calculateWaypoints(p1, p2, obstacles) {
    const waypoints = [{ x: p1.x, y: p1.y }];

    const dx1 = p1.side === 'right' ? this.clearance : -this.clearance;
    const dx2 = p2.side === 'right' ? this.clearance : -this.clearance;

    const startX = p1.x + dx1;
    const startY = p1.y;
    const endX = p2.x + dx2;
    const endY = p2.y;

    waypoints.push({ x: startX, y: startY });

    const midX = (startX + endX) / 2;
    const verticalSegment = {
      x: midX,
      yMin: Math.min(startY, endY),
      yMax: Math.max(startY, endY)
    };

    // Detecção de colisão AABB
    const collision = obstacles.find(obs =>
      midX >= obs.x - 10 &&
      midX <= obs.x + obs.width + 10 &&
      verticalSegment.yMax >= obs.y - 10 &&
      verticalSegment.yMin <= obs.y + obs.height + 10
    );

    if (collision) {
      if (Math.abs(startY - collision.y) < Math.abs(startY - (collision.y + collision.height))) {
        const detourY = collision.y - this.clearance;
        waypoints.push({ x: startX, y: detourY });
        waypoints.push({ x: endX, y: detourY });
      } else {
        const detourY = collision.y + collision.height + this.clearance;
        waypoints.push({ x: startX, y: detourY });
        waypoints.push({ x: endX, y: detourY });
      }
    } else {
      waypoints.push({ x: midX, y: startY });
      waypoints.push({ x: midX, y: endY });
    }

    waypoints.push({ x: endX, y: endY });
    waypoints.push({ x: p2.x, y: p2.y });

    return this.simplifyPoints(waypoints);
  }

  simplifyPoints(points) {
    if (points.length <= 2) return points;
    const result = [points[0]];

    for (let i = 1; i < points.length - 1; i++) {
      const prev = result[result.length - 1];
      const curr = points[i];
      const next = points[i + 1];

      const isCollinearX = prev.x === curr.x && curr.x === next.x;
      const isCollinearY = prev.y === curr.y && curr.y === next.y;

      if (!isCollinearX && !isCollinearY) {
        result.push(curr);
      }
    }
    result.push(points[points.length - 1]);
    return result;
  }

  // Gera a instrução SVG D com curvas quadráticas nos cantos
  generateSmoothPath(points) {
    if (points.length < 2) return '';
    let d = `M ${points[0].x} ${points[0].y}`;

    for (let i = 1; i < points.length - 1; i++) {
      const pPrev = points[i - 1];
      const pCurr = points[i];
      const pNext = points[i + 1];

      const v1 = { x: pCurr.x - pPrev.x, y: pCurr.y - pPrev.y };
      const v2 = { x: pNext.x - pPrev.x, y: pNext.y - pPrev.y };

      const len1 = Math.hypot(v1.x, v1.y);
      const len2 = Math.hypot(v2.x, v2.y);

      const effectiveRadius = Math.min(this.r, len1 / 2, len2 / 2);

      const startCurve = {
        x: pCurr.x - (v1.x / len1) * effectiveRadius,
        y: pCurr.y - (v1.y / len1) * effectiveRadius
      };

      const endCurve = {
        x: pCurr.x + (v2.x / len2) * effectiveRadius,
        y: pCurr.y + (v2.y / len2) * effectiveRadius
      };

      d += ` L ${startCurve.x} ${startCurve.y}`;
      d += ` Q ${pCurr.x} ${pCurr.y}, ${endCurve.x} ${endCurve.y}`;
    }

    const lastPoint = points[points.length - 1];
    d += ` L ${lastPoint.x} ${lastPoint.y}`;

    return d;
  }
}

window.OrthogonalRouter = OrthogonalRouter;
