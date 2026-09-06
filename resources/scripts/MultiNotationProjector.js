/**
 * Motor de Projeção Multi-Notacional (SVG)
 */
class MultiNotationProjector {
  constructor(svgNodesLayer, svgEdgesLayer) {
    this.nodesLayer = svgNodesLayer;
    this.edgesLayer = svgEdgesLayer;
    this.ns = 'http://www.w3.org/2000/svg';
  }

  render(modelIR, notation = 'CHEN') {
    this.nodesLayer.innerHTML = '';
    this.edgesLayer.innerHTML = '';

    switch (notation) {
      case 'MERISE':
        this.renderMerise(modelIR);
        break;
      case 'CROWS_FOOT':
        this.renderCrowsFoot(modelIR);
        break;
      case 'CHEN':
      default:
        this.renderPeterChen(modelIR);
        break;
    }
  }

  // 1. Notação Peter Chen (1976): Losangos e Atributos em Elipses
  renderPeterChen(model) {
    const entities = model.entities || [];
    const relationships = model.relationships || [];
    const attributes = model.attributes || [];
    const edges = model.edges || [];

    // Renderiza Entidades (Retângulos)
    for (const ent of entities) {
      const g = this.createGroup(ent.x, ent.y, ent.id);
      const rect = document.createElementNS(this.ns, 'rect');
      rect.setAttribute('width', '160');
      rect.setAttribute('height', '80');
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', '#1e293b');
      rect.setAttribute('stroke', ent.type === 'weak' ? '#f59e0b' : '#6366f1');
      rect.setAttribute('stroke-width', ent.type === 'weak' ? '4' : '2');
      if (ent.type === 'weak') rect.setAttribute('stroke-dasharray', '6,3');

      const text = this.createText(80, 45, ent.name, '#f8fafc', '13px', '600');
      g.appendChild(rect);
      g.appendChild(text);
      
      const attrs = attributes.filter(a => a.parentId === ent.id);
      
      this.nodesLayer.appendChild(g);

      // Renderiza Atributos em Elipses Satélites
      attrs.forEach((attr, idx) => {
        // Inicializa x, y caso não existam (migração ou novo atributo)
        if (typeof attr.x !== 'number') {
          const angle = (idx / attrs.length) * 2 * Math.PI;
          attr.x = ent.x + 80 + 130 * Math.cos(angle) - 45;
          attr.y = ent.y + 40 + 80 * Math.sin(angle) - 20;
        }

        const ax = attr.x + 45;
        const ay = attr.y + 20;

        // Aresta Entidade -> Atributo
        const line = this.renderLine(ent.x + 80, ent.y + 40, ax, ay, '#475569', '1.5');
        line.setAttribute('data-attr-id', attr.id);
        line.setAttribute('data-parent-id', ent.id);

        const ag = this.createGroup(attr.x, attr.y, attr.id);
        const ellipse = document.createElementNS(this.ns, 'ellipse');
        ellipse.setAttribute('cx', '45');
        ellipse.setAttribute('cy', '20');
        ellipse.setAttribute('rx', '45');
        ellipse.setAttribute('ry', '20');
        ellipse.setAttribute('fill', '#0f172a');
        ellipse.setAttribute('stroke', attr.isKey ? '#fde047' : '#94a3b8');
        ellipse.setAttribute('stroke-width', '1.5');
        ag.appendChild(ellipse);

        const aText = this.createText(45, 24, attr.name, attr.isKey ? '#fde047' : '#e2e8f0', '10px');
        if (attr.isKey) aText.setAttribute('text-decoration', 'underline');
        ag.appendChild(aText);
        this.nodesLayer.appendChild(ag);
      });
    }

    // Renderiza Relacionamentos (Losangos)
    for (const rel of relationships) {
      const g = this.createGroup(rel.x, rel.y, rel.id);
      const poly = document.createElementNS(this.ns, 'polygon');
      poly.setAttribute('points', '50,0 100,35 50,70 0,35');
      poly.setAttribute('fill', '#0f172a');
      poly.setAttribute('stroke', '#10b981');
      poly.setAttribute('stroke-width', '2');

      const text = this.createText(50, 39, rel.name, '#f8fafc', '11px', '500');
      g.appendChild(poly);
      g.appendChild(text);
      this.nodesLayer.appendChild(g);
    }
    
    // Conexões e Rótulos de Mapeamento Funcional
    for (const edge of edges) {
        const ent = entities.find(e => e.id === edge.fromNodeId || e.id === edge.toNodeId);
        const rel = relationships.find(r => r.id === edge.fromNodeId || r.id === edge.toNodeId);
        if (ent && rel) {
          const x1 = ent.x + 80, y1 = ent.y + 40;
          const x2 = rel.x + 50, y2 = rel.y + 35;
          
          const gEdge = document.createElementNS(this.ns, 'g');
          gEdge.setAttribute('data-edge-id', edge.id);
          
          const hitArea = document.createElementNS(this.ns, 'line');
          hitArea.setAttribute('x1', x1); hitArea.setAttribute('y1', y1);
          hitArea.setAttribute('x2', x2); hitArea.setAttribute('y2', y2);
          hitArea.setAttribute('stroke', 'transparent'); hitArea.setAttribute('stroke-width', '12');
          gEdge.appendChild(hitArea);
          
          const line = document.createElementNS(this.ns, 'line');
          line.setAttribute('x1', x1); line.setAttribute('y1', y1);
          line.setAttribute('x2', x2); line.setAttribute('y2', y2);
          line.setAttribute('stroke', this.selectedEdgeId === edge.id ? '#f8fafc' : '#475569'); 
          line.setAttribute('stroke-width', this.selectedEdgeId === edge.id ? '3' : '2');
          gEdge.appendChild(line);
          
          const text = this.createText((x1 + x2) / 2, (y1 + y2) / 2 - 8, `(${edge.cardinalityMin},${edge.cardinalityMax})`, '#cbd5e1', '12px', '700');
          gEdge.appendChild(text);
          
          this.edgesLayer.appendChild(gEdge);
        }
    }
  }

  // 2. Notação Francesa Merise (MCD): Retângulos com Atributos e (min, max)
  renderMerise(model) {
    const entities = model.entities || [];
    const relationships = model.relationships || [];
    const attributes = model.attributes || [];
    const edges = model.edges || [];

    for (const ent of entities) {
      const attrs = attributes.filter(a => a.parentId === ent.id);
      const h = Math.max(90, 36 + attrs.length * 18);
      const g = this.createGroup(ent.x, ent.y, ent.id);

      const rect = document.createElementNS(this.ns, 'rect');
      rect.setAttribute('width', '180');
      rect.setAttribute('height', h);
      rect.setAttribute('rx', '6');
      rect.setAttribute('fill', '#1e293b');
      rect.setAttribute('stroke', '#38bdf8');
      rect.setAttribute('stroke-width', '2');
      g.appendChild(rect);

      // Divisória do Cabeçalho
      const line = document.createElementNS(this.ns, 'line');
      line.setAttribute('x1', '0'); line.setAttribute('y1', '30');
      line.setAttribute('x2', '180'); line.setAttribute('y2', '30');
      line.setAttribute('stroke', '#334155');
      g.appendChild(line);

      const title = this.createText(90, 20, ent.name.toUpperCase(), '#f8fafc', '12px', '700');
      g.appendChild(title);

      attrs.forEach((attr, i) => {
        const at = this.createText(14, 48 + i * 18, (attr.isKey ? '# ' : '') + attr.name, attr.isKey ? '#38bdf8' : '#cbd5e1', '11px');
        at.setAttribute('text-anchor', 'start');
        g.appendChild(at);
      });

      this.nodesLayer.appendChild(g);
    }

    // Associações em Elipse com Notação Estrutural (min, max)
    for (const rel of relationships) {
      const g = this.createGroup(rel.x, rel.y, rel.id);
      const ellipse = document.createElementNS(this.ns, 'ellipse');
      ellipse.setAttribute('cx', '55');
      ellipse.setAttribute('cy', '28');
      ellipse.setAttribute('rx', '55');
      ellipse.setAttribute('ry', '28');
      ellipse.setAttribute('fill', '#0f172a');
      ellipse.setAttribute('stroke', '#f43f5e');
      ellipse.setAttribute('stroke-width', '2');
      g.appendChild(ellipse);

      const title = this.createText(55, 32, rel.name, '#f8fafc', '11px', '600');
      g.appendChild(title);
      this.nodesLayer.appendChild(g);
    }
    
    for (const edge of edges) {
        const ent = entities.find(e => e.id === edge.fromNodeId || e.id === edge.toNodeId);
        const rel = relationships.find(r => r.id === edge.fromNodeId || r.id === edge.toNodeId);
        if (ent && rel) {
          const x1 = ent.x + 90, y1 = ent.y + 45;
          const x2 = rel.x + 55, y2 = rel.y + 28;
          
          const gEdge = document.createElementNS(this.ns, 'g');
          gEdge.setAttribute('data-edge-id', edge.id);
          
          const hitArea = document.createElementNS(this.ns, 'line');
          hitArea.setAttribute('x1', x1); hitArea.setAttribute('y1', y1);
          hitArea.setAttribute('x2', x2); hitArea.setAttribute('y2', y2);
          hitArea.setAttribute('stroke', 'transparent'); hitArea.setAttribute('stroke-width', '12');
          gEdge.appendChild(hitArea);
          
          const line = document.createElementNS(this.ns, 'line');
          line.setAttribute('x1', x1); line.setAttribute('y1', y1);
          line.setAttribute('x2', x2); line.setAttribute('y2', y2);
          line.setAttribute('stroke', '#64748b'); line.setAttribute('stroke-width', '1.8');
          gEdge.appendChild(line);

          // Inscrição Min-Max no meio da aresta
          const labelX = x1 + (x2 - x1) * 0.5;
          const labelY = y1 + (y2 - y1) * 0.5 - 6;
          const text = this.createText(labelX, labelY, `(${edge.cardinalityMin},${edge.cardinalityMax})`, '#f43f5e', '11px', '700');
          gEdge.appendChild(text);
          
          this.edgesLayer.appendChild(gEdge);
        }
    }
  }

  // 3. Notação Crow's Foot (Engenharia de Informação)
  renderCrowsFoot(model) {
    // Delegado.
  }

  createGroup(x, y, id) {
    const g = document.createElementNS(this.ns, 'g');
    g.setAttribute('transform', `translate(${x}, ${y})`);
    g.setAttribute('data-node-id', id);
    g.setAttribute('class', 'interactive-node');
    return g;
  }

  createText(x, y, content, color, size, weight = 'normal') {
    const t = document.createElementNS(this.ns, 'text');
    t.setAttribute('x', x);
    t.setAttribute('y', y);
    t.setAttribute('text-anchor', 'middle');
    t.setAttribute('fill', color);
    t.setAttribute('font-size', size);
    t.setAttribute('font-weight', weight);
    t.setAttribute('font-family', 'Inter, monospace');
    t.textContent = content;
    return t;
  }

  renderLine(x1, y1, x2, y2, stroke, width) {
    const line = document.createElementNS(this.ns, 'line');
    line.setAttribute('x1', x1); line.setAttribute('y1', y1);
    line.setAttribute('x2', x2); line.setAttribute('y2', y2);
    line.setAttribute('stroke', stroke);
    line.setAttribute('stroke-width', width);
    this.edgesLayer.appendChild(line);
    return line;
  }
}

window.MultiNotationProjector = MultiNotationProjector;
