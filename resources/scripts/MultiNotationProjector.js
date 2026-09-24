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
      const isSelected = this.selectedGroup && this.selectedGroup.has(ent.id);
      const g = this.createGroup(ent.x, ent.y, ent.id);
      const rect = document.createElementNS(this.ns, 'rect');
      rect.setAttribute('width', '160');
      rect.setAttribute('height', '80');
      rect.setAttribute('rx', '4');
      rect.setAttribute('fill', '#1e293b');
      rect.setAttribute('stroke', isSelected ? '#f8fafc' : (ent.type === 'weak' ? '#f59e0b' : (ent.type === 'associative' ? '#059669' : '#6366f1')));
      rect.setAttribute('stroke-width', isSelected ? '3' : (ent.type === 'weak' ? '4' : '2'));
      if (ent.type === 'weak') rect.setAttribute('stroke-dasharray', '6,3');
      g.appendChild(rect);

      if (ent.type === 'associative') {
        const poly = document.createElementNS(this.ns, 'polygon');
        poly.setAttribute('points', '80,5 155,40 80,75 5,40');
        poly.setAttribute('fill', '#0f172a');
        poly.setAttribute('stroke', '#059669');
        poly.setAttribute('stroke-width', '1.5');
        g.appendChild(poly);
      }

      const text = this.createText(80, 45, ent.name, '#f8fafc', '13px', '600');
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
        const isSelectedAttr = this.selectedGroup && this.selectedGroup.has(attr.id);
        const ellipse = document.createElementNS(this.ns, 'ellipse');
        ellipse.setAttribute('cx', '45');
        ellipse.setAttribute('cy', '20');
        ellipse.setAttribute('rx', '45');
        ellipse.setAttribute('ry', '20');
        ellipse.setAttribute('fill', '#0f172a');
        ellipse.setAttribute('stroke', isSelectedAttr ? '#f8fafc' : (attr.isKey ? '#fde047' : '#94a3b8'));
        ellipse.setAttribute('stroke-width', isSelectedAttr ? '3' : '1.5');
        ag.appendChild(ellipse);

        const aText = this.createText(45, 24, attr.name, attr.isKey ? '#fde047' : '#e2e8f0', '10px');
        if (attr.isKey) aText.setAttribute('text-decoration', 'underline');
        ag.appendChild(aText);
        this.nodesLayer.appendChild(ag);
      });
    }

    // Renderiza Relacionamentos (Losangos)
    for (const rel of relationships) {
      const isSelected = this.selectedGroup && this.selectedGroup.has(rel.id);
      const g = this.createGroup(rel.x, rel.y, rel.id);
      const poly = document.createElementNS(this.ns, 'polygon');
      poly.setAttribute('points', '50,0 100,35 50,70 0,35');
      poly.setAttribute('fill', '#0f172a');
      poly.setAttribute('stroke', isSelected ? '#f8fafc' : '#10b981');
      poly.setAttribute('stroke-width', isSelected ? '3' : '2');

      const text = this.createText(50, 39, rel.name, '#f8fafc', '11px', '500');
      g.appendChild(poly);
      g.appendChild(text);
      this.nodesLayer.appendChild(g);
    }
    
    // Conexões e Rótulos de Mapeamento Funcional
    for (const edge of edges) {
        const fromNode = entities.find(e => e.id === edge.fromNodeId) || relationships.find(r => r.id === edge.fromNodeId);
        const toNode = entities.find(e => e.id === edge.toNodeId) || relationships.find(r => r.id === edge.toNodeId);
        
        if (fromNode && toNode) {
          const fromIsRel = !entities.find(e => e.id === fromNode.id);
          const toIsRel = !entities.find(e => e.id === toNode.id);
          
          const x1 = fromNode.x + (fromIsRel ? 50 : 80);
          const y1 = fromNode.y + (fromIsRel ? 35 : 40);
          const x2 = toNode.x + (toIsRel ? 50 : 80);
          const y2 = toNode.y + (toIsRel ? 35 : 40);
          
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
          text.setAttribute('paint-order', 'stroke');
          text.setAttribute('stroke', '#0f172a');
          text.setAttribute('stroke-width', '4');
          text.setAttribute('stroke-linecap', 'round');
          text.setAttribute('stroke-linejoin', 'round');
          text.classList.add('edge-label');
          gEdge.appendChild(text);
          
          this.edgesLayer.appendChild(gEdge);
        }
    }

    // Renderiza Hierarquias (Triângulo ISA)
    const hierarchies = model.hierarchies || [];
    for (const hier of hierarchies) {
      const g = this.createGroup(hier.x, hier.y, hier.id);
      const poly = document.createElementNS(this.ns, 'polygon');
      poly.setAttribute('points', '40,0 80,50 0,50');
      poly.setAttribute('fill', '#0f172a');
      poly.setAttribute('stroke', '#a78bfa');
      poly.setAttribute('stroke-width', '2');
      g.appendChild(poly);

      const text = this.createText(40, 35, hier.type === 'exclusive' ? 'd' : 'o', '#a78bfa', '14px', '700');
      g.appendChild(text);

      const isaLabel = this.createText(40, 65, 'ISA', '#a78bfa', '10px', '600');
      g.appendChild(isaLabel);
      this.nodesLayer.appendChild(g);

      // Linha da super-entidade para o topo do triângulo
      const parentEnt = entities.find(e => e.id === hier.superEntityId);
      if (parentEnt) {
        const line = this.renderLine(parentEnt.x + 80, parentEnt.y + 80, hier.x + 40, hier.y, '#a78bfa', '2');
        line.setAttribute('data-hier-parent', hier.id);
      }

      // Linhas do fundo do triângulo para cada sub-entidade
      for (let i = 0; i < (hier.subEntityIds || []).length; i++) {
        const childId = hier.subEntityIds[i];
        const childEnt = entities.find(e => e.id === childId);
        if (childEnt) {
          const spacing = 80 / (hier.subEntityIds.length + 1);
          const fromX = hier.x + spacing * (i + 1);
          const fromY = hier.y + 50;
          const line = this.renderLine(fromX, fromY, childEnt.x + 80, childEnt.y, '#a78bfa', '1.5');
          line.setAttribute('data-hier-child', hier.id);
          line.setAttribute('data-child-id', childId);
        }
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
      const isSelected = this.selectedGroup && this.selectedGroup.has(ent.id);
      const attrs = attributes.filter(a => a.parentId === ent.id);
      const h = Math.max(90, 36 + attrs.length * 18);
      const g = this.createGroup(ent.x, ent.y, ent.id);

      const rect = document.createElementNS(this.ns, 'rect');
      rect.setAttribute('width', '180');
      rect.setAttribute('height', h);
      rect.setAttribute('rx', '6');
      rect.setAttribute('fill', '#1e293b');
      rect.setAttribute('stroke', isSelected ? '#f8fafc' : (ent.type === 'associative' ? '#10b981' : '#38bdf8'));
      rect.setAttribute('stroke-width', isSelected ? '3' : '2');
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
      const isSelected = this.selectedGroup && this.selectedGroup.has(rel.id);
      const g = this.createGroup(rel.x, rel.y, rel.id);
      const ellipse = document.createElementNS(this.ns, 'ellipse');
      ellipse.setAttribute('cx', '55');
      ellipse.setAttribute('cy', '28');
      ellipse.setAttribute('rx', '55');
      ellipse.setAttribute('ry', '28');
      ellipse.setAttribute('fill', '#0f172a');
      ellipse.setAttribute('stroke', isSelected ? '#f8fafc' : '#f43f5e');
      ellipse.setAttribute('stroke-width', isSelected ? '3' : '2');
      g.appendChild(ellipse);

      const title = this.createText(55, 32, rel.name, '#f8fafc', '11px', '600');
      g.appendChild(title);
      this.nodesLayer.appendChild(g);
    }
    
    for (const edge of edges) {
        const fromNode = entities.find(e => e.id === edge.fromNodeId) || relationships.find(r => r.id === edge.fromNodeId);
        const toNode = entities.find(e => e.id === edge.toNodeId) || relationships.find(r => r.id === edge.toNodeId);
        
        if (fromNode && toNode) {
          const fromIsRel = !entities.find(e => e.id === fromNode.id);
          const toIsRel = !entities.find(e => e.id === toNode.id);
          
          const x1 = fromNode.x + (fromIsRel ? 55 : 90);
          const y1 = fromNode.y + (fromIsRel ? 28 : 45);
          const x2 = toNode.x + (toIsRel ? 55 : 90);
          const y2 = toNode.y + (toIsRel ? 28 : 45);
          
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
          text.setAttribute('paint-order', 'stroke');
          text.setAttribute('stroke', '#0f172a');
          text.setAttribute('stroke-width', '4');
          text.setAttribute('stroke-linecap', 'round');
          text.setAttribute('stroke-linejoin', 'round');
          text.classList.add('edge-label');
          gEdge.appendChild(text);
          
          this.edgesLayer.appendChild(gEdge);
        }
    }

    // Renderiza Hierarquias (Triângulo ISA) - Merise
    const hierarchies = model.hierarchies || [];
    for (const hier of hierarchies) {
      const g = this.createGroup(hier.x, hier.y, hier.id);
      const poly = document.createElementNS(this.ns, 'polygon');
      poly.setAttribute('points', '40,0 80,50 0,50');
      poly.setAttribute('fill', '#0f172a');
      poly.setAttribute('stroke', '#a78bfa');
      poly.setAttribute('stroke-width', '2');
      g.appendChild(poly);

      const text = this.createText(40, 35, hier.type === 'exclusive' ? 'd' : 'o', '#a78bfa', '14px', '700');
      g.appendChild(text);

      const isaLabel = this.createText(40, 65, 'ISA', '#a78bfa', '10px', '600');
      g.appendChild(isaLabel);
      this.nodesLayer.appendChild(g);

      const parentEnt = entities.find(e => e.id === hier.superEntityId);
      if (parentEnt) {
        const attrs = (model.attributes || []).filter(a => a.parentId === parentEnt.id);
        const parentH = Math.max(90, 36 + attrs.length * 18);
        const line = this.renderLine(parentEnt.x + 90, parentEnt.y + parentH, hier.x + 40, hier.y, '#a78bfa', '2');
        line.setAttribute('data-hier-parent', hier.id);
      }

      for (let i = 0; i < (hier.subEntityIds || []).length; i++) {
        const childId = hier.subEntityIds[i];
        const childEnt = entities.find(e => e.id === childId);
        if (childEnt) {
          const spacing = 80 / (hier.subEntityIds.length + 1);
          const fromX = hier.x + spacing * (i + 1);
          const fromY = hier.y + 50;
          const line = this.renderLine(fromX, fromY, childEnt.x + 90, childEnt.y, '#a78bfa', '1.5');
          line.setAttribute('data-hier-child', hier.id);
          line.setAttribute('data-child-id', childId);
        }
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
