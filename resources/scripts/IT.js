/**
 * Winsdom Data Modeler — Orquestrador Principal do Renderer (v2)
 * Corrigido: Drag individual sem re-render destrutivo, seleção de arestas, export PNG/PDF.
 */
(function () {
  'use strict';

  class WinsdomDataModelerApp {
    constructor() {
      this.scale = 1.0;
      this.tx = 0.0;
      this.ty = 0.0;
      this.minScale = 0.1;
      this.maxScale = 3.0;

      this.undoStack = [];
      this.redoStack = [];
      this.activeTab = 'conceptual';

      this.conceptualModel = {
        entities: [], relationships: [], edges: [], attributes: [], hierarchies: []
      };
      this.logicalModel = { tables: [], relationships: [] };

      this.selectedNodeId = null;
      this.selectedNodeType = null;
      this.selectedEdgeId = null;

      this.edgeMode = false;
      this.edgeSourceId = null;

      // Map de referências SVG por ID para patching direto
      this._svgNodes = new Map();
      this._dragging = null;

      this.router = new window.OrthogonalRouter(6, 24);
      this.stateManager = new window.ITStateManager();

      this.initDOMReferences();
      
      this.projector = new window.MultiNotationProjector(this.nodesLayer, this.edgesLayer);
      
      this.initPanAndZoom();
      this.bindEvents();
      this.bindKeyboard();
      this.loadInitialState();
    }

    initDOMReferences() {
      this.viewportGroup = document.getElementById('viewportGroup');
      this.canvasViewport = document.getElementById('canvasViewport');
      this.nodesLayer = document.getElementById('nodesLayer');
      this.edgesLayer = document.getElementById('edgesLayer');
      this.sqlPanel = document.getElementById('sqlPanel');
      this.sqlCodeOutput = document.getElementById('sqlCodeOutput');
      this.dialectSelect = document.getElementById('dialectSelect');
      this.notationSelect = document.getElementById('notationSelect');
      this.propsPanel = document.getElementById('propsPanel');
      this.propsTitle = document.getElementById('propsTitle');
      this.propsContent = document.getElementById('propsContent');
      this.tabConceptual = document.getElementById('tabConceptual');
      this.tabLogical = document.getElementById('tabLogical');
      this.tabSql = document.getElementById('tabSql');
      this.toolsAside = document.getElementById('conceptualTools');
    }

    // ─── PAN & ZOOM (só ativa quando NÃO arrastando nó) ──
    initPanAndZoom() {
      let isPanning = false;
      let startX = 0, startY = 0;

      this.canvasViewport.addEventListener('pointerdown', (e) => {
        // Se clicou em um nó interativo, não faz pan
        if (e.target.closest('.interactive-node')) return;
        if (this.edgeMode) return;

        isPanning = true;
        startX = e.clientX - this.tx;
        startY = e.clientY - this.ty;
        this.canvasViewport.setPointerCapture(e.pointerId);

        // Clicou no vazio: deseleciona tudo
        this.deselectAll();
      });

      this.canvasViewport.addEventListener('pointermove', (e) => {
        if (!isPanning) return;
        this.tx = e.clientX - startX;
        this.ty = e.clientY - startY;
        this.applyTransform();
      });

      const stopPan = (e) => {
        if (isPanning) {
          isPanning = false;
          try { this.canvasViewport.releasePointerCapture(e.pointerId); } catch (_) {}
        }
      };
      this.canvasViewport.addEventListener('pointerup', stopPan);
      this.canvasViewport.addEventListener('pointercancel', stopPan);

      this.canvasViewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        const newScale = Math.min(Math.max(this.scale * zoomFactor, this.minScale), this.maxScale);
        const rect = this.canvasViewport.getBoundingClientRect();
        const cx = e.clientX - rect.left;
        const cy = e.clientY - rect.top;
        this.tx = cx - (cx - this.tx) * (newScale / this.scale);
        this.ty = cy - (cy - this.ty) * (newScale / this.scale);
        this.scale = newScale;
        this.applyTransform();
      }, { passive: false });
    }

    applyTransform() {
      this.viewportGroup.setAttribute('transform', `matrix(${this.scale} 0 0 ${this.scale} ${this.tx} ${this.ty})`);
    }

    screenToGlobal(sx, sy) {
      const rect = this.canvasViewport.getBoundingClientRect();
      return { x: (sx - rect.left - this.tx) / this.scale, y: (sy - rect.top - this.ty) / this.scale };
    }

    // ─── UNDO / REDO ──────────────────────────────────────
    pushSnapshot() {
      this.undoStack.push(JSON.stringify(this.conceptualModel));
      if (this.undoStack.length > 50) this.undoStack.shift();
      this.redoStack = [];
    }

    undo() {
      if (this.undoStack.length === 0) return;
      this.redoStack.push(JSON.stringify(this.conceptualModel));
      this.conceptualModel = JSON.parse(this.undoStack.pop());
      this.render();
    }

    redo() {
      if (this.redoStack.length === 0) return;
      this.undoStack.push(JSON.stringify(this.conceptualModel));
      this.conceptualModel = JSON.parse(this.redoStack.pop());
      this.render();
    }

    // ─── SELECTION ────────────────────────────────────────
    deselectAll() {
      this.selectedNodeId = null;
      this.selectedNodeType = null;
      this.selectedEdgeId = null;
      this.propsPanel.classList.remove('visible');
      this.render();
    }

    selectNode(id, type) {
      this.selectedNodeId = id;
      this.selectedNodeType = type;
      this.selectedEdgeId = null;
      this.showPropsForNode(id, type);
      this.render();
    }

    selectEdge(edgeId) {
      this.selectedEdgeId = edgeId;
      this.selectedNodeId = null;
      this.selectedNodeType = null;
      this.showPropsForEdge(edgeId);
      this.render();
    }

    // ─── EVENTS ───────────────────────────────────────────
    bindEvents() {
      this.tabConceptual.addEventListener('click', () => this.switchTab('conceptual'));
      this.tabLogical.addEventListener('click', () => this.switchTab('logical'));
      this.tabSql.addEventListener('click', () => this.switchTab('sql'));
      
      if (this.notationSelect) {
        this.notationSelect.addEventListener('change', () => this.render());
      }

      document.getElementById('btnUndo').addEventListener('click', () => this.undo());
      document.getElementById('btnRedo').addEventListener('click', () => this.redo());
      document.getElementById('btnTransform').addEventListener('click', () => {
        this.executeTransformation();
        this.switchTab('logical');
      });
      this.dialectSelect.addEventListener('change', () => this.updateSqlView());
      document.getElementById('btnCopySql').addEventListener('click', () => {
        navigator.clipboard.writeText(this.sqlCodeOutput.value);
      });
      document.getElementById('btnExportSvg').addEventListener('click', () => this.exportSvg());

      document.getElementById('btnAddEntity').addEventListener('click', () => this.addEntity('strong'));
      document.getElementById('btnAddWeakEntity').addEventListener('click', () => this.addEntity('weak'));
      document.getElementById('btnAddRel').addEventListener('click', () => this.addRelationship());
      document.getElementById('btnAddAttribute').addEventListener('click', () => this.addAttributeToSelected());
      document.getElementById('btnAddEdge').addEventListener('click', () => this.toggleEdgeMode());
      
      const bCheck = document.getElementById('bitemporalCheck');
      if (bCheck) bCheck.addEventListener('change', () => this.updateSqlView());

      if (window.winsdom && window.winsdom.onMenuAction) {
        window.winsdom.onMenuAction((action) => {
          if (action === 'export-sql') this.switchTab('sql');
          if (action === 'export-svg') this.exportSvg();
          if (action === 'transform') { this.executeTransformation(); this.switchTab('logical'); }
        });
      }

      // Drag global: movimenta o nó sendo arrastado SEM re-render
      document.addEventListener('pointermove', (e) => {
        if (!this._dragging) return;
        const mouse = this.screenToGlobal(e.clientX, e.clientY);
        this._dragging.nodeData.x = mouse.x - this._dragging.offsetX;
        this._dragging.nodeData.y = mouse.y - this._dragging.offsetY;
        // Patch direto: só muda o transform do elemento arrastado
        this._dragging.svgElement.setAttribute('transform',
          `translate(${this._dragging.nodeData.x}, ${this._dragging.nodeData.y})`);
        
        // Atualiza apenas as arestas conectadas
        if (this.activeTab === 'logical') {
          this.updateLogicalEdgesForNode(this._dragging.nodeData.id);
        } else {
          this.updateEdgesForNode(this._dragging.nodeData.id);
        }
      });

      document.addEventListener('pointerup', (e) => {
        if (this._dragging) {
          this._dragging = null;
          this.autoSave();
        }
      });
    }

    bindKeyboard() {
      document.addEventListener('keydown', (e) => {
        // Ignorar se digitando em input/textarea
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.redo(); }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (this.selectedNodeId) this.deleteSelectedNode();
          else if (this.selectedEdgeId) this.deleteSelectedEdge();
        }
        if (e.key === 'Escape') {
          this.edgeMode = false;
          this.edgeSourceId = null;
          this.canvasViewport.style.cursor = 'grab';
          this.deselectAll();
        }
      });
    }

    // ─── TABS ─────────────────────────────────────────────
    switchTab(tab) {
      this.activeTab = tab;
      [this.tabConceptual, this.tabLogical, this.tabSql].forEach(t => t.classList.remove('active'));

      this.sqlPanel.classList.remove('visible');
      this.propsPanel.classList.remove('visible');

      if (tab === 'conceptual') {
        this.tabConceptual.classList.add('active');
        this.toolsAside.style.display = 'flex';
      } else if (tab === 'logical') {
        this.tabLogical.classList.add('active');
        this.toolsAside.style.display = 'none';
      } else if (tab === 'sql') {
        this.tabSql.classList.add('active');
        this.toolsAside.style.display = 'none';
        this.sqlPanel.classList.add('visible');
        this.updateSqlView();
      }
      this.render();
    }

    // ─── ADD OPERATIONS ───────────────────────────────────
    addEntity(type) {
      this.pushSnapshot();
      const center = this.screenToGlobal(window.innerWidth / 2, window.innerHeight / 2);
      const entity = {
        id: crypto.randomUUID(), name: `Entidade_${this.conceptualModel.entities.length + 1}`,
        type, x: center.x - 80 + Math.random() * 60 - 30, y: center.y - 50 + Math.random() * 60 - 30,
        width: 160, height: 100
      };
      this.conceptualModel.entities.push(entity);
      this.render();
      this.selectNode(entity.id, 'entity');
    }

    addRelationship() {
      this.pushSnapshot();
      const center = this.screenToGlobal(window.innerWidth / 2, window.innerHeight / 2);
      const rel = {
        id: crypto.randomUUID(), name: `Rel_${this.conceptualModel.relationships.length + 1}`,
        x: center.x - 50 + Math.random() * 60 - 30, y: center.y - 35 + Math.random() * 60 - 30,
        width: 100, height: 70
      };
      this.conceptualModel.relationships.push(rel);
      this.render();
      this.selectNode(rel.id, 'relationship');
    }

    addAttributeToSelected() {
      if (!this.selectedNodeId) return;
      this.pushSnapshot();
      const parentId = this.selectedNodeId;
      const attr = {
        id: crypto.randomUUID(), parentId,
        name: `attr_${this.conceptualModel.attributes.filter(a => a.parentId === parentId).length + 1}`,
        type: 'simple', isKey: false, isPartialKey: false, dataType: 'VARCHAR(255)'
      };
      this.conceptualModel.attributes.push(attr);
      this.render();
      this.showPropsForNode(parentId, this.selectedNodeType);
    }

    toggleEdgeMode() {
      this.edgeMode = !this.edgeMode;
      this.edgeSourceId = null;
      this.canvasViewport.style.cursor = this.edgeMode ? 'crosshair' : 'grab';
    }

    handleNodeClickForEdge(nodeId) {
      if (!this.edgeMode) return false;
      if (!this.edgeSourceId) {
        this.edgeSourceId = nodeId;
        return true;
      }
      if (this.edgeSourceId !== nodeId) {
        this.pushSnapshot();
        this.conceptualModel.edges.push({
          id: crypto.randomUUID(), fromNodeId: this.edgeSourceId, toNodeId: nodeId,
          cardinalityMin: 0, cardinalityMax: 'N'
        });
        this.edgeSourceId = null;
        this.edgeMode = false;
        this.canvasViewport.style.cursor = 'grab';
        this.render();
        return true;
      }
      return false;
    }

    // ─── DELETE ───────────────────────────────────────────
    deleteSelectedNode() {
      if (!this.selectedNodeId) return;
      this.pushSnapshot();
      const id = this.selectedNodeId;
      this.conceptualModel.entities = this.conceptualModel.entities.filter(e => e.id !== id);
      this.conceptualModel.relationships = this.conceptualModel.relationships.filter(r => r.id !== id);
      this.conceptualModel.edges = this.conceptualModel.edges.filter(e => e.fromNodeId !== id && e.toNodeId !== id);
      this.conceptualModel.attributes = this.conceptualModel.attributes.filter(a => a.parentId !== id);
      this.deselectAll();
    }

    deleteSelectedEdge() {
      if (!this.selectedEdgeId) return;
      this.pushSnapshot();
      this.conceptualModel.edges = this.conceptualModel.edges.filter(e => e.id !== this.selectedEdgeId);
      this.deselectAll();
    }

    // ─── PROPERTIES PANEL ─────────────────────────────────
    showPropsForNode(id, type) {
      this.propsPanel.classList.add('visible');
      const node = type === 'entity'
        ? this.conceptualModel.entities.find(e => e.id === id)
        : this.conceptualModel.relationships.find(r => r.id === id);
      if (!node) return;

      const attrs = this.conceptualModel.attributes.filter(a => a.parentId === id);
      this.propsTitle.textContent = type === 'entity' ? 'Propriedades da Entidade' : 'Propriedades do Relacionamento';

      let html = `<label>Nome</label><input type="text" id="propName" value="${node.name}" />`;
      if (type === 'entity') {
        html += `<label>Tipo</label><select id="propType">
          <option value="strong" ${node.type === 'strong' ? 'selected' : ''}>Forte</option>
          <option value="weak" ${node.type === 'weak' ? 'selected' : ''}>Fraca</option>
        </select>`;
      }

      html += `<h4 style="margin-top:8px;">Atributos</h4>`;
      for (const attr of attrs) {
        html += `<div class="attr-row" data-attr-id="${attr.id}">
          <input type="text" value="${attr.name}" class="attr-name" />
          <label style="font-size:10px;white-space:nowrap;display:flex;align-items:center;gap:2px;">
            <input type="checkbox" ${attr.isKey ? 'checked' : ''} class="attr-key" /> PK
          </label>
          <button class="small-btn btn-del attr-del">×</button>
        </div>`;
      }

      html += `<button class="small-btn btn-add" id="btnAddAttrInline" style="width:100%;margin-top:4px;">+ Atributo</button>`;
      html += `<button class="small-btn btn-del" id="btnDeleteNode" style="margin-top:12px;width:100%;">Excluir Elemento</button>`;

      this.propsContent.innerHTML = html;

      // Binds
      document.getElementById('propName').addEventListener('change', (e) => {
        this.pushSnapshot(); node.name = e.target.value; this.render();
      });
      const propType = document.getElementById('propType');
      if (propType) propType.addEventListener('change', (e) => {
        this.pushSnapshot(); node.type = e.target.value; this.render();
      });

      this.propsContent.querySelectorAll('.attr-name').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const attrId = e.target.closest('.attr-row').dataset.attrId;
          const attr = this.conceptualModel.attributes.find(a => a.id === attrId);
          if (attr) { this.pushSnapshot(); attr.name = e.target.value; this.render(); }
        });
      });
      this.propsContent.querySelectorAll('.attr-key').forEach(inp => {
        inp.addEventListener('change', (e) => {
          const attrId = e.target.closest('.attr-row').dataset.attrId;
          const attr = this.conceptualModel.attributes.find(a => a.id === attrId);
          if (attr) { this.pushSnapshot(); attr.isKey = e.target.checked; this.render(); }
        });
      });
      this.propsContent.querySelectorAll('.attr-del').forEach(btn => {
        btn.addEventListener('click', (e) => {
          const attrId = e.target.closest('.attr-row').dataset.attrId;
          this.pushSnapshot();
          this.conceptualModel.attributes = this.conceptualModel.attributes.filter(a => a.id !== attrId);
          this.render();
          this.showPropsForNode(id, type);
        });
      });

      document.getElementById('btnAddAttrInline').addEventListener('click', () => this.addAttributeToSelected());
      document.getElementById('btnDeleteNode').addEventListener('click', () => this.deleteSelectedNode());
    }

    showPropsForEdge(edgeId) {
      this.propsPanel.classList.add('visible');
      const edge = this.conceptualModel.edges.find(e => e.id === edgeId);
      if (!edge) return;

      this.propsTitle.textContent = 'Propriedades da Aresta';

      const fromNode = this.findNodeById(edge.fromNodeId);
      const toNode = this.findNodeById(edge.toNodeId);

      let html = `<label>De: <strong>${fromNode ? fromNode.name : '?'}</strong></label>`;
      html += `<label>Para: <strong>${toNode ? toNode.name : '?'}</strong></label>`;
      html += `<label style="margin-top:8px;">Cardinalidade Mínima</label>
        <select id="edgeMin">
          <option value="0" ${edge.cardinalityMin === 0 ? 'selected' : ''}>0</option>
          <option value="1" ${edge.cardinalityMin === 1 ? 'selected' : ''}>1</option>
        </select>`;
      html += `<label>Cardinalidade Máxima</label>
        <select id="edgeMax">
          <option value="1" ${edge.cardinalityMax === 1 ? 'selected' : ''}>1</option>
          <option value="N" ${edge.cardinalityMax === 'N' ? 'selected' : ''}>N</option>
        </select>`;
      html += `<button class="small-btn btn-del" id="btnDeleteEdge" style="margin-top:12px;width:100%;">Excluir Aresta</button>`;

      this.propsContent.innerHTML = html;

      document.getElementById('edgeMin').addEventListener('change', (e) => {
        this.pushSnapshot(); edge.cardinalityMin = parseInt(e.target.value); this.render();
      });
      document.getElementById('edgeMax').addEventListener('change', (e) => {
        this.pushSnapshot(); edge.cardinalityMax = e.target.value === 'N' ? 'N' : 1; this.render();
      });
      document.getElementById('btnDeleteEdge').addEventListener('click', () => this.deleteSelectedEdge());
    }

    findNodeById(id) {
      return this.conceptualModel.entities.find(e => e.id === id) ||
             this.conceptualModel.relationships.find(r => r.id === id);
    }

    // ─── TRANSFORMATION ───────────────────────────────────
    executeTransformation() {
      const engine = new window.RelationalMappingEngine(this.conceptualModel);
      this.logicalModel = engine.transform();
    }

    updateSqlView() {
      if (this.logicalModel.tables.length === 0) this.executeTransformation();
      const dialect = this.dialectSelect.value;
      const bitemporal = document.getElementById('bitemporalCheck') ? document.getElementById('bitemporalCheck').checked : false;
      
      if (dialect === 'prisma') {
        this.sqlCodeOutput.value = window.PrismaTranspiler.compile(this.logicalModel); // Optional: add bitemporal to prisma later
      } else if (dialect === 'drizzle') {
        this.sqlCodeOutput.value = window.DrizzleTranspiler.compile(this.logicalModel);
      } else {
        const transpiler = new window.SqlTranspiler(this.logicalModel);
        this.sqlCodeOutput.value = transpiler.compile(dialect, { onDelete: 'CASCADE', onUpdate: 'CASCADE' }, bitemporal);
      }
    }

    // ─── RENDERING ────────────────────────────────────────
    render() {
      const linter = new window.SemanticLinter(this.conceptualModel);
      const diagnostics = linter.runAllChecks();
      
      const panel = document.getElementById('linterPanel');
      const badge = document.getElementById('linterBadge');
      const list = document.getElementById('linterList');
      
      if (diagnostics && diagnostics.length > 0) {
        panel.classList.add('visible');
        badge.textContent = diagnostics.length;
        badge.style.background = diagnostics.some(d => d.severity === 'ERROR') ? '#f87171' : '#fbbf24';
        badge.style.color = '#000';
        
        list.innerHTML = diagnostics.map(d => {
          const colorClass = d.severity === 'ERROR' ? 'severity-error' : (d.severity === 'WARNING' ? 'severity-warning' : 'severity-info');
          const icon = d.severity === 'ERROR' ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>' : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>';
          return `<div class="linter-item"><div class="linter-icon ${colorClass}">${icon}</div><div style="color:#cbd5e1;">${d.message}</div></div>`;
        }).join('');
      } else {
        panel.classList.remove('visible');
      }

      this.nodesLayer.innerHTML = '';
      this.edgesLayer.innerHTML = '';
      this._svgNodes.clear();

      if (this.activeTab === 'conceptual') this.renderConceptualModel();
      else if (this.activeTab === 'logical') this.renderLogicalModel();

      this.autoSave();
    }

    // ─── RENDER CONCEITUAL ────────────────────────────────
    renderConceptualModel() {
      const notation = this.notationSelect ? this.notationSelect.value : 'chen';
      this.projector.render(this.conceptualModel, notation);

      // Reattach event listeners to nodes
      const nodes = this.nodesLayer.querySelectorAll('.interactive-node');
      nodes.forEach(g => {
        const nodeId = g.getAttribute('data-node-id');
        if (!nodeId) return;

        let nodeData = this.conceptualModel.entities.find(e => e.id === nodeId);
        let nodeType = 'entity';
        if (!nodeData) {
          nodeData = this.conceptualModel.relationships.find(r => r.id === nodeId);
          nodeType = 'relationship';
        }
        if (!nodeData && this.conceptualModel.attributes) {
          nodeData = this.conceptualModel.attributes.find(a => a.id === nodeId);
          nodeType = 'attribute';
        }
        if (!nodeData) return;

        this._svgNodes.set(nodeId, g);

        g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (this.handleNodeClickForEdge(nodeId)) return;
          this.selectedNodeId = nodeId;
          this.selectedNodeType = nodeType;
          this.showPropsForNode(nodeId, nodeType);
          this.render();
          
          const freshG = this.nodesLayer.querySelector(`[data-node-id="${nodeId}"]`);
          if (!freshG) return;
          const mouse = this.screenToGlobal(e.clientX, e.clientY);
          this._dragging = {
            svgElement: freshG, nodeData: nodeData,
            offsetX: mouse.x - nodeData.x, offsetY: mouse.y - nodeData.y
          };
        });
      });

      // Reattach event listeners to edges
      const edges = this.edgesLayer.querySelectorAll('g[data-edge-id]');
      edges.forEach(gEdge => {
        const edgeId = gEdge.getAttribute('data-edge-id');
        if (!edgeId) return;

        const edgeData = this.conceptualModel.edges.find(e => e.id === edgeId);
        if (!edgeData) return;

        const line = gEdge.querySelector('line:not([stroke="transparent"])');
        const hitArea = gEdge.querySelector('line[stroke="transparent"]');
        const text = gEdge.querySelector('text');

        if (line && hitArea && text) {
          this._svgNodes.set('edge_' + edgeId, { gEdge, line, hitArea, text, edge: edgeData });
        }

        gEdge.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this.selectEdge(edgeId);
        });
      });
    }

    // Atualiza APENAS as arestas conectadas a um nó (durante drag)
    updateEdgesForNode(nodeId) {
      // 1. Arestas normais (relacionamentos)
      for (const edge of this.conceptualModel.edges) {
        if (edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId) continue;

        const ref = this._svgNodes.get('edge_' + edge.id);
        if (!ref) continue;

        const fromNode = this.findNodeById(edge.fromNodeId);
        const toNode = this.findNodeById(edge.toNodeId);
        if (!fromNode || !toNode) continue;

        const x1 = fromNode.x + (fromNode.width || 100) / 2;
        const y1 = fromNode.y + (fromNode.height || 70) / 2;
        const x2 = toNode.x + (toNode.width || 100) / 2;
        const y2 = toNode.y + (toNode.height || 70) / 2;

        if (ref.line) {
          ref.line.setAttribute('x1', x1); ref.line.setAttribute('y1', y1);
          ref.line.setAttribute('x2', x2); ref.line.setAttribute('y2', y2);
        }
        if (ref.hitArea) {
          ref.hitArea.setAttribute('x1', x1); ref.hitArea.setAttribute('y1', y1);
          ref.hitArea.setAttribute('x2', x2); ref.hitArea.setAttribute('y2', y2);
        }
        if (ref.text) {
          ref.text.setAttribute('x', (x1 + x2) / 2);
          ref.text.setAttribute('y', (y1 + y2) / 2 - 8);
        }
      }

      // 2. Arestas de atributos (Notação Peter Chen)
      // Se arrastou um atributo, atualiza a aresta dele
      const attrLine = this.edgesLayer.querySelector(`line[data-attr-id="${nodeId}"]`);
      if (attrLine && this.conceptualModel.attributes) {
        const attr = this.conceptualModel.attributes.find(a => a.id === nodeId);
        if (attr) {
          attrLine.setAttribute('x2', attr.x + 45);
          attrLine.setAttribute('y2', attr.y + 20);
        }
      }

      // Se arrastou uma entidade, atualiza as arestas de todos os seus atributos
      const entAttrLines = this.edgesLayer.querySelectorAll(`line[data-parent-id="${nodeId}"]`);
      if (entAttrLines.length > 0) {
        const ent = this.findNodeById(nodeId);
        if (ent) {
          entAttrLines.forEach(line => {
            line.setAttribute('x1', ent.x + 80);
            line.setAttribute('y1', ent.y + 40);
          });
        }
      }
    }

    updateLogicalEdgesForNode(nodeId) {
      const obstacles = this.logicalModel.tables.map(t => ({ x: t.x, y: t.y, width: t.width, height: t.height }));
      for (const rel of this.logicalModel.relationships) {
        if (rel.sourceTableId !== nodeId && rel.targetTableId !== nodeId) continue;

        const path = this.edgesLayer.querySelector(`path[data-logical-edge="${rel.id}"]`);
        if (!path) continue;

        const src = this.logicalModel.tables.find(t => t.id === rel.sourceTableId);
        const tgt = this.logicalModel.tables.find(t => t.id === rel.targetTableId);
        if (!src || !tgt) continue;

        const si = src.columns.findIndex(c => c.id === rel.sourceColumnId);
        const ti = tgt.columns.findIndex(c => c.id === rel.targetColumnId);
        const srcY = src.y + 40 + Math.max(0, si) * 24 + 12;
        const tgtY = tgt.y + 40 + Math.max(0, ti) * 24 + 12;
        const left = src.x > tgt.x;

        const p1 = { x: left ? src.x : src.x + src.width, y: srcY, side: left ? 'left' : 'right' };
        const p2 = { x: left ? tgt.x + tgt.width : tgt.x, y: tgtY, side: left ? 'right' : 'left' };

        path.setAttribute('d', this.router.route(p1, p2, obstacles));
      }
    }

    // ─── RENDER LÓGICO ────────────────────────────────────
    renderLogicalModel() {
      const ns = 'http://www.w3.org/2000/svg';
      const obstacles = this.logicalModel.tables.map(t => ({ x: t.x, y: t.y, width: t.width, height: t.height }));

      for (const rel of this.logicalModel.relationships) {
        const src = this.logicalModel.tables.find(t => t.id === rel.sourceTableId);
        const tgt = this.logicalModel.tables.find(t => t.id === rel.targetTableId);
        if (!src || !tgt) continue;

        const si = src.columns.findIndex(c => c.id === rel.sourceColumnId);
        const ti = tgt.columns.findIndex(c => c.id === rel.targetColumnId);
        const srcY = src.y + 40 + Math.max(0, si) * 24 + 12;
        const tgtY = tgt.y + 40 + Math.max(0, ti) * 24 + 12;
        const left = src.x > tgt.x;

        const p1 = { x: left ? src.x : src.x + src.width, y: srcY, side: left ? 'left' : 'right' };
        const p2 = { x: left ? tgt.x + tgt.width : tgt.x, y: tgtY, side: left ? 'right' : 'left' };

        const path = document.createElementNS(ns, 'path');
        path.setAttribute('data-logical-edge', rel.id);
        path.setAttribute('d', this.router.route(p1, p2, obstacles));
        path.setAttribute('fill', 'none'); path.setAttribute('stroke', '#475569');
        path.setAttribute('stroke-width', '1.8');
        path.setAttribute('marker-start', 'url(#crowsfoot-one)');
        path.setAttribute('marker-end', 'url(#crowsfoot-many)');
        this.edgesLayer.appendChild(path);
      }

      for (const table of this.logicalModel.tables) {
        const g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'interactive-node');
        g.setAttribute('transform', `translate(${table.x}, ${table.y})`);
        g.setAttribute('data-node-id', table.id);

        const body = document.createElementNS(ns, 'rect');
        body.setAttribute('width', table.width); body.setAttribute('height', table.height);
        body.setAttribute('rx', '6'); body.setAttribute('fill', '#0f172a');
        body.setAttribute('stroke', '#334155'); body.setAttribute('stroke-width', '1.5');
        g.appendChild(body);

        const header = document.createElementNS(ns, 'rect');
        header.setAttribute('width', table.width); header.setAttribute('height', '32');
        header.setAttribute('rx', '6'); header.setAttribute('fill', '#1e293b');
        g.appendChild(header);

        const title = document.createElementNS(ns, 'text');
        title.setAttribute('x', '12'); title.setAttribute('y', '20');
        title.setAttribute('fill', '#f8fafc'); title.setAttribute('font-size', '12');
        title.setAttribute('font-weight', '700');
        title.textContent = table.name.toUpperCase();
        g.appendChild(title);

        table.columns.forEach((col, idx) => {
          const cy = 40 + idx * 24;
          if (col.isPrimaryKey) {
            const pk = document.createElementNS(ns, 'circle');
            pk.setAttribute('cx', '14'); pk.setAttribute('cy', cy + 8);
            pk.setAttribute('r', '4'); pk.setAttribute('fill', '#eab308');
            g.appendChild(pk);
          } else if (col.isForeignKey) {
            const fk = document.createElementNS(ns, 'rect');
            fk.setAttribute('x', '11'); fk.setAttribute('y', cy + 5);
            fk.setAttribute('width', '6'); fk.setAttribute('height', '6');
            fk.setAttribute('fill', '#38bdf8');
            g.appendChild(fk);
          }
          const ct = document.createElementNS(ns, 'text');
          ct.setAttribute('x', '26'); ct.setAttribute('y', cy + 12);
          ct.setAttribute('fill', col.isPrimaryKey ? '#fde047' : '#e2e8f0');
          ct.setAttribute('font-size', '11'); ct.setAttribute('font-family', 'monospace');
          ct.textContent = col.name;
          g.appendChild(ct);

          const tt = document.createElementNS(ns, 'text');
          tt.setAttribute('x', table.width - 12); tt.setAttribute('y', cy + 12);
          tt.setAttribute('text-anchor', 'end'); tt.setAttribute('fill', '#64748b');
          tt.setAttribute('font-size', '10'); tt.setAttribute('font-family', 'monospace');
          tt.textContent = col.dataType;
          g.appendChild(tt);
        });

        // Drag para tabelas lógicas
        g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          const mouse = this.screenToGlobal(e.clientX, e.clientY);
          this._dragging = {
            svgElement: g, nodeData: table,
            offsetX: mouse.x - table.x, offsetY: mouse.y - table.y
          };
        });

        this.nodesLayer.appendChild(g);
      }
    }

    // ─── PERSISTENCE ──────────────────────────────────────
    async loadInitialState() {
      const saved = await this.stateManager.load();
      if (saved && saved.conceptualModel && saved.conceptualModel.entities && saved.conceptualModel.entities.length > 0) {
        this.conceptualModel = saved.conceptualModel;
        if (saved.logicalModel) this.logicalModel = saved.logicalModel;
      } else {
        this.loadDemoState();
      }
      this.render();
    }

    autoSave() {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        this.stateManager.save({ conceptualModel: this.conceptualModel, logicalModel: this.logicalModel });
      }, 1000);
    }

    loadDemoState() {
      const idCli = crypto.randomUUID(), idPed = crypto.randomUUID(), idRel = crypto.randomUUID();
      this.conceptualModel.entities = [
        { id: idCli, name: 'Cliente', type: 'strong', x: 100, y: 150, width: 160, height: 100 },
        { id: idPed, name: 'Pedido', type: 'strong', x: 520, y: 150, width: 160, height: 100 }
      ];
      this.conceptualModel.relationships = [
        { id: idRel, name: 'Realiza', x: 320, y: 155, width: 120, height: 80 }
      ];
      this.conceptualModel.attributes = [
        { id: crypto.randomUUID(), parentId: idCli, name: 'id', type: 'simple', isKey: true, dataType: 'BIGINT' },
        { id: crypto.randomUUID(), parentId: idCli, name: 'nome', type: 'simple', isKey: false, dataType: 'VARCHAR(150)' },
        { id: crypto.randomUUID(), parentId: idPed, name: 'numero', type: 'simple', isKey: true, dataType: 'BIGINT' },
        { id: crypto.randomUUID(), parentId: idPed, name: 'valor_total', type: 'simple', isKey: false, dataType: 'DECIMAL(12,2)' }
      ];
      this.conceptualModel.edges = [
        { id: crypto.randomUUID(), fromNodeId: idCli, toNodeId: idRel, cardinalityMin: 0, cardinalityMax: 'N' },
        { id: crypto.randomUUID(), fromNodeId: idRel, toNodeId: idPed, cardinalityMin: 1, cardinalityMax: 1 }
      ];
    }

    // ─── EXPORT ───────────────────────────────────────────
    exportSvg() {
      const serializer = new XMLSerializer();
      const source = serializer.serializeToString(document.getElementById('svgRoot'));
      const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = `winsdom_model_${Date.now()}.svg`;
      link.click(); URL.revokeObjectURL(url);
    }
  }

  window.addEventListener('DOMContentLoaded', () => { new WinsdomDataModelerApp(); });
})();
