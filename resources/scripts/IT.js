/**
 * Winsdom Data Modeler — Orquestrador Principal do Renderer (v2.3)
 * - Suporte a Modal dedicado com input de texto para nomeação de novos projetos.
 * - Troca atômica de contexto sem condições de corrida (clearTimeout preventivo).
 * - Drag individual de nós e edição inline no catálogo.
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
      this.selectedGroup = new Set();
      this.isSpacePressed = false;

      this.edgeMode = false;
      this.edgeSourceId = null;

      this._svgNodes = new Map();
      this._dragging = null;
      this._saveTimer = null;

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

    // ─── PAN & ZOOM E MARQUEE SELECTION ─────────────────
    initPanAndZoom() {
      let isPanning = false;
      let isMarquee = false;
      let startX = 0, startY = 0;
      let mStartX = 0, mStartY = 0;

      const ns = 'http://www.w3.org/2000/svg';
      this.marqueeRect = document.createElementNS(ns, 'rect');
      this.marqueeRect.setAttribute('fill', 'rgba(56, 189, 248, 0.15)');
      this.marqueeRect.setAttribute('stroke', '#38bdf8');
      this.marqueeRect.setAttribute('stroke-width', '1');
      this.marqueeRect.setAttribute('stroke-dasharray', '4');
      this.marqueeRect.style.display = 'none';
      this.marqueeRect.style.pointerEvents = 'none';
      this.viewportGroup.appendChild(this.marqueeRect);

      this.canvasViewport.addEventListener('pointerdown', (e) => {
        if (e.target.closest('.interactive-node')) {
          const nodeId = e.target.closest('.interactive-node').getAttribute('data-node-id');
          if (!this.selectedGroup.has(nodeId)) {
            if (!e.shiftKey) this.selectedGroup.clear();
            this.selectedGroup.add(nodeId);
          }
          return;
        }
        if (this.edgeMode) return;

        if (this.isSpacePressed) {
          isPanning = true;
          this.canvasViewport.style.cursor = 'grabbing';
          startX = e.clientX - this.tx;
          startY = e.clientY - this.ty;
        } else {
          isMarquee = true;
          const globalPoint = this.screenToGlobal(e.clientX, e.clientY);
          mStartX = globalPoint.x;
          mStartY = globalPoint.y;
          this.marqueeRect.setAttribute('x', mStartX);
          this.marqueeRect.setAttribute('y', mStartY);
          this.marqueeRect.setAttribute('width', '0');
          this.marqueeRect.setAttribute('height', '0');
          this.marqueeRect.style.display = 'block';
          this.deselectAll();
        }
        this.canvasViewport.setPointerCapture(e.pointerId);
      });

      this.canvasViewport.addEventListener('pointermove', (e) => {
        if (isPanning) {
          this.tx = e.clientX - startX;
          this.ty = e.clientY - startY;
          this.applyTransform();
        } else if (isMarquee) {
          const globalPoint = this.screenToGlobal(e.clientX, e.clientY);
          const x = Math.min(mStartX, globalPoint.x);
          const y = Math.min(mStartY, globalPoint.y);
          const w = Math.abs(globalPoint.x - mStartX);
          const h = Math.abs(globalPoint.y - mStartY);
          this.marqueeRect.setAttribute('x', x);
          this.marqueeRect.setAttribute('y', y);
          this.marqueeRect.setAttribute('width', w);
          this.marqueeRect.setAttribute('height', h);
        }
      });

      const stopPanOrMarquee = (e) => {
        if (isPanning) {
          isPanning = false;
          this.canvasViewport.style.cursor = this.isSpacePressed ? 'grab' : 'default';
        }
        if (isMarquee) {
          isMarquee = false;
          this.marqueeRect.style.display = 'none';

          const x = parseFloat(this.marqueeRect.getAttribute('x'));
          const y = parseFloat(this.marqueeRect.getAttribute('y'));
          const w = parseFloat(this.marqueeRect.getAttribute('width'));
          const h = parseFloat(this.marqueeRect.getAttribute('height'));

          if (w > 5 || h > 5) {
            const allItems = [
              ...this.conceptualModel.entities,
              ...this.conceptualModel.relationships,
              ...this.conceptualModel.attributes,
              ...(this.conceptualModel.hierarchies || [])
            ];
            for (const item of allItems) {
              const ix = item.x || 0;
              const iy = item.y || 0;
              const cx = ix + (item.width ? item.width / 2 : 45);
              const cy = iy + (item.height ? item.height / 2 : 25);

              if (cx >= x && cx <= x + w && cy >= y && cy <= y + h) {
                this.selectedGroup.add(item.id);
              }
            }
            this.render();
          }
        }
        try { this.canvasViewport.releasePointerCapture(e.pointerId); } catch (_) {}
      };

      this.canvasViewport.addEventListener('pointerup', stopPanOrMarquee);
      this.canvasViewport.addEventListener('pointercancel', stopPanOrMarquee);

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
      if (this.undoStack.length > 40) this.undoStack.shift();
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

    // ─── SELEÇÃO ──────────────────────────────────────────
    deselectAll() {
      this.selectedNodeId = null;
      this.selectedNodeType = null;
      this.selectedEdgeId = null;
      this.selectedGroup.clear();
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

    // ─── EVENTOS DE UI & PROJETOS ─────────────────────────
    bindEvents() {
      this.initProjectsUI();
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
      document.getElementById('btnAddHierarchy').addEventListener('click', () => this.addHierarchy());

      const bCheck = document.getElementById('bitemporalCheck');
      if (bCheck) bCheck.addEventListener('change', () => this.updateSqlView());

      // Drag Global sem reconstrução contínua da árvore DOM
      document.addEventListener('pointermove', (e) => {
        if (!this._dragging) return;
        const mouse = this.screenToGlobal(e.clientX, e.clientY);

        if (Array.isArray(this._dragging)) {
          this._dragging.forEach(item => {
            item.nodeData.x = mouse.x - item.offsetX;
            item.nodeData.y = mouse.y - item.offsetY;
            item.svgElement.setAttribute('transform', `translate(${item.nodeData.x}, ${item.nodeData.y})`);

            if (this.activeTab === 'logical') {
              this.updateLogicalEdgesForNode(item.nodeData.id);
            } else {
              this.updateEdgesForNode(item.nodeData.id);
            }
          });
          return;
        }

        this._dragging.nodeData.x = mouse.x - this._dragging.offsetX;
        this._dragging.nodeData.y = mouse.y - this._dragging.offsetY;
        this._dragging.svgElement.setAttribute('transform', `translate(${this._dragging.nodeData.x}, ${this._dragging.nodeData.y})`);

        if (this.activeTab === 'logical') {
          this.updateLogicalEdgesForNode(this._dragging.nodeData.id);
        } else {
          this.updateEdgesForNode(this._dragging.nodeData.id);
        }
      });

      document.addEventListener('pointerup', () => {
        if (this._dragging) {
          this._dragging = null;
          this.autoSave();
        }
      });
    }

    // ─── GERENCIAMENTO DE PROJETOS E MODAL NATIVO COM NOMEAÇÃO ───
    initProjectsUI() {
      const btnProjects = document.getElementById('btnProjects');
      const projectsModal = document.getElementById('projectsModal');
      const btnCloseProjects = document.getElementById('btnCloseProjects');
      const btnNewProject = document.getElementById('btnNewProject');

      const createModal = document.getElementById('createProjectModal');
      const btnCloseCreate = document.getElementById('btnCloseCreateProject');
      const btnCancelCreate = document.getElementById('btnCancelCreateProject');
      const btnConfirmCreate = document.getElementById('btnConfirmCreateProject');
      const inputName = document.getElementById('inputProjectName');
      const errorLabel = document.getElementById('createProjectError');

      btnProjects.addEventListener('click', () => {
        this.renderProjectsList();
        projectsModal.style.display = 'flex';
      });

      btnCloseProjects.addEventListener('click', () => {
        projectsModal.style.display = 'none';
      });

      // Abre o modal de digitação de nome
      btnNewProject.addEventListener('click', () => {
        if (this.stateManager.catalog.projects.length >= this.stateManager.MAX_PROJECTS) {
          alert(`Limite de ${this.stateManager.MAX_PROJECTS} projetos atingido. Exclua um antes de criar um novo.`);
          return;
        }

        // Sugere o próximo nome automático ("Projeto 2", etc.), permitindo alteração instantânea
        inputName.value = this.stateManager.getNextDefaultProjectName();
        errorLabel.style.display = 'none';
        errorLabel.textContent = '';
        createModal.style.display = 'flex';
        setTimeout(() => {
          inputName.focus();
          inputName.select();
        }, 50);
      });

      const closeCreateModal = () => {
        createModal.style.display = 'none';
        inputName.value = '';
        errorLabel.style.display = 'none';
      };

      btnCloseCreate.addEventListener('click', closeCreateModal);
      btnCancelCreate.addEventListener('click', closeCreateModal);

      const handleConfirmCreate = async () => {
        const nameVal = inputName.value.trim();
        if (!nameVal) {
          errorLabel.textContent = 'Por favor, informe um nome válido para o projeto.';
          errorLabel.style.display = 'block';
          inputName.focus();
          return;
        }

        try {
          clearTimeout(this._saveTimer);
          // Salva o projeto atualmente aberto antes de mudar
          await this.stateManager.save({ conceptualModel: this.conceptualModel, logicalModel: this.logicalModel });

          const newId = await this.stateManager.createNewProject(nameVal);
          await this.loadProject(newId);
          closeCreateModal();
          projectsModal.style.display = 'none';
        } catch (err) {
          errorLabel.textContent = err.message;
          errorLabel.style.display = 'block';
        }
      };

      btnConfirmCreate.addEventListener('click', handleConfirmCreate);
      inputName.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleConfirmCreate();
        } else if (e.key === 'Escape') {
          closeCreateModal();
        }
      });
    }

    renderProjectsList() {
      const list = document.getElementById('projectsList');
      const countLabel = document.getElementById('projectsCount');
      const btnNewProject = document.getElementById('btnNewProject');
      const catalog = this.stateManager.catalog;

      list.innerHTML = '';
      countLabel.textContent = `${catalog.projects.length}/${this.stateManager.MAX_PROJECTS} Projetos`;

      if (catalog.projects.length >= this.stateManager.MAX_PROJECTS) {
        btnNewProject.style.opacity = '0.5';
        btnNewProject.style.pointerEvents = 'none';
      } else {
        btnNewProject.style.opacity = '1';
        btnNewProject.style.pointerEvents = 'auto';
      }

      catalog.projects.forEach(p => {
        const item = document.createElement('div');
        item.style.cssText = 'display:flex; justify-content:space-between; align-items:center; background:#0f172a; padding:12px; border-radius:10px; border:1px solid #334155; transition:border-color 0.2s;';

        const date = new Date(p.lastModified).toLocaleString();
        const isActive = p.id === catalog.activeId;

        item.innerHTML = `
          <div style="flex:1; margin-right:12px;">
            <div style="display:flex; align-items:center; gap:8px;">
              <input type="text" value="${p.name}" class="proj-name-input" data-proj-id="${p.id}"
                style="background:transparent; border:1px solid transparent; color:${isActive ? '#38bdf8' : '#f8fafc'}; font-size:14px; font-weight:600; border-radius:4px; padding:2px 6px; outline:none; max-width:220px;">
              ${isActive ? '<span style="font-size:10px; background:#0369a1; padding:2px 6px; border-radius:10px; color:#fff; font-weight:700;">Ativo</span>' : ''}
            </div>
            <div style="font-size:11px; color:#64748b; margin-top:4px; padding-left:6px;">Modificado: ${date}</div>
          </div>
          <div style="display:flex; gap:6px;">
            ${!isActive ? `<button class="action-btn" style="background:#4f46e5; padding:6px 12px; font-size:11px;" onclick="window.appOpenProject('${p.id}')">Abrir</button>` : ''}
            <button class="action-btn" style="background:#e11d48; padding:6px 12px; font-size:11px;" onclick="window.appDeleteProject('${p.id}')">Excluir</button>
          </div>
        `;
        list.appendChild(item);
      });

      // Habilitar renomeação inline de projetos no catálogo
      list.querySelectorAll('.proj-name-input').forEach(input => {
        input.addEventListener('focus', () => {
          input.style.border = '1px solid #6366f1';
          input.style.background = '#1e293b';
        });
        input.addEventListener('blur', async () => {
          input.style.border = '1px solid transparent';
          input.style.background = 'transparent';
          const projId = input.dataset.projId;
          const val = input.value.trim();
          if (val) {
            await this.stateManager.renameProject(projId, val);
          }
        });
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') input.blur();
        });
      });

      // Funções seguras de troca e exclusão
      window.appOpenProject = async (id) => {
        clearTimeout(this._saveTimer);
        // Salva o projeto atualmente aberto antes de mudar
        await this.stateManager.save({ conceptualModel: this.conceptualModel, logicalModel: this.logicalModel });
        await this.loadProject(id);
        document.getElementById('projectsModal').style.display = 'none';
      };

      window.appDeleteProject = async (id) => {
        const proj = catalog.projects.find(p => p.id === id);
        const name = proj ? proj.name : 'o projeto';
        if (confirm(`Deseja realmente excluir permanentemente "${name}"? Os dados associados serão removidos do disco.`)) {
          clearTimeout(this._saveTimer);
          await this.stateManager.deleteProject(id);
          this.renderProjectsList();
          if (this.stateManager.catalog.activeId !== this.activeProjectId) {
            await this.loadProject(this.stateManager.catalog.activeId);
          }
        }
      };
    }

    async loadProject(id) {
      clearTimeout(this._saveTimer);
      this.activeProjectId = id;
      if (!id) {
        const newId = await this.stateManager.createNewProject("Projeto 1");
        await this.loadProject(newId);
        return;
      }

      await this.stateManager.setActiveProject(id);
      const state = await this.stateManager.load();

      if (state && state.conceptualModel) {
        this.conceptualModel = state.conceptualModel;
        this.logicalModel = state.logicalModel || { tables: [], relationships: [] };
      } else {
        this.conceptualModel = JSON.parse(JSON.stringify(window.DefaultConceptualState));
        this.logicalModel = JSON.parse(JSON.stringify(window.DefaultLogicalState));
      }

      // Limpeza estrita do histórico de Undo/Redo na alternância de projetos
      this.undoStack = [];
      this.redoStack = [];
      this.deselectAll();
      this.switchTab('conceptual');
    }

    bindKeyboard() {
      document.addEventListener('keydown', (e) => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;

        if (e.code === 'Space') {
          e.preventDefault();
          this.isSpacePressed = true;
          this.canvasViewport.style.cursor = 'grab';
        }

        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); this.undo(); }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); this.redo(); }
        if (e.key === 'Delete' || e.key === 'Backspace') {
          if (this.selectedNodeId) this.deleteSelectedNode();
          else if (this.selectedEdgeId) this.deleteSelectedEdge();
        }
        if (e.key === 'Escape') {
          this.edgeMode = false;
          this.edgeSourceId = null;
          this.canvasViewport.style.cursor = 'default';
          this.deselectAll();
        }
      });

      document.addEventListener('keyup', (e) => {
        if (e.code === 'Space') {
          this.isSpacePressed = false;
          this.canvasViewport.style.cursor = 'default';
        }
      });
    }

    // ─── TABS & COMPACTAÇÃO DE VIEW ───────────────────────
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

    addEntity(type) {
      this.pushSnapshot();
      const center = this.screenToGlobal(window.innerWidth / 2, window.innerHeight / 2);
      const entity = {
        id: crypto.randomUUID(),
        name: `Entidade_${this.conceptualModel.entities.length + 1}`,
        type,
        x: center.x - 80 + Math.random() * 40 - 20,
        y: center.y - 50 + Math.random() * 40 - 20,
        width: 160,
        height: 100
      };
      this.conceptualModel.entities.push(entity);
      this.render();
      this.selectNode(entity.id, 'entity');
    }

    addRelationship() {
      this.pushSnapshot();
      const center = this.screenToGlobal(window.innerWidth / 2, window.innerHeight / 2);
      const rel = {
        id: crypto.randomUUID(),
        name: `Rel_${this.conceptualModel.relationships.length + 1}`,
        x: center.x - 50 + Math.random() * 40 - 20,
        y: center.y - 35 + Math.random() * 40 - 20,
        width: 100,
        height: 70
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
        id: crypto.randomUUID(),
        parentId,
        name: `attr_${this.conceptualModel.attributes.filter(a => a.parentId === parentId).length + 1}`,
        type: 'simple',
        isKey: false,
        isPartialKey: false,
        dataType: 'VARCHAR(255)'
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

    addHierarchy() {
      if (!this.selectedNodeId) {
        alert('Selecione uma super-entidade antes de adicionar uma Hierarquia (ISA).');
        return;
      }
      const parentEntity = this.conceptualModel.entities.find(e => e.id === this.selectedNodeId);
      if (!parentEntity) {
        alert('Selecione uma entidade forte para ser a superclasse da especialização.');
        return;
      }
      this.pushSnapshot();
      const center = this.screenToGlobal(window.innerWidth / 2, window.innerHeight / 2);
      const hierarchy = {
        id: crypto.randomUUID(),
        superEntityId: parentEntity.id,
        subEntityIds: [],
        type: 'exclusive',
        strategy: 'TPT',
        x: parentEntity.x + 20,
        y: parentEntity.y + 140,
        width: 80,
        height: 50
      };
      if (!this.conceptualModel.hierarchies) this.conceptualModel.hierarchies = [];
      this.conceptualModel.hierarchies.push(hierarchy);
      this.render();
      this.selectNode(hierarchy.id, 'hierarchy');
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
          id: crypto.randomUUID(),
          fromNodeId: this.edgeSourceId,
          toNodeId: nodeId,
          cardinalityMin: 0,
          cardinalityMax: 'N'
        });
        this.edgeSourceId = null;
        this.edgeMode = false;
        this.canvasViewport.style.cursor = 'grab';
        this.render();
        return true;
      }
      return false;
    }

    deleteSelectedNode() {
      if (!this.selectedNodeId) return;
      this.pushSnapshot();
      const id = this.selectedNodeId;
      this.conceptualModel.entities = this.conceptualModel.entities.filter(e => e.id !== id);
      this.conceptualModel.relationships = this.conceptualModel.relationships.filter(r => r.id !== id);
      this.conceptualModel.edges = this.conceptualModel.edges.filter(e => e.fromNodeId !== id && e.toNodeId !== id);
      this.conceptualModel.attributes = this.conceptualModel.attributes.filter(a => a.parentId !== id);
      if (this.conceptualModel.hierarchies) {
        this.conceptualModel.hierarchies = this.conceptualModel.hierarchies.filter(h => h.id !== id && h.superEntityId !== id);
      }
      this.deselectAll();
    }

    deleteSelectedEdge() {
      if (!this.selectedEdgeId) return;
      this.pushSnapshot();
      this.conceptualModel.edges = this.conceptualModel.edges.filter(e => e.id !== this.selectedEdgeId);
      this.deselectAll();
    }

    showPropsForNode(id, type) {
      this.propsPanel.classList.add('visible');
      const node = this.findNodeById(id);
      if (!node) return;

      const attrs = this.conceptualModel.attributes.filter(a => a.parentId === id);
      this.propsTitle.textContent = type === 'entity' ? 'Propriedades da Entidade' : 'Propriedades do Relacionamento';

      let html = `<label>Nome</label><input type="text" id="propName" value="${node.name}" />`;
      if (type === 'entity') {
        html += `<label>Tipo</label><select id="propType">
          <option value="strong" ${node.type === 'strong' ? 'selected' : ''}>Forte</option>
          <option value="weak" ${node.type === 'weak' ? 'selected' : ''}>Fraca</option>
          <option value="associative" ${node.type === 'associative' ? 'selected' : ''}>Associativa</option>
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

      document.getElementById('propName').addEventListener('change', (e) => {
        this.pushSnapshot(); node.name = e.target.value; this.render();
      });

      const propType = document.getElementById('propType');
      if (propType) {
        propType.addEventListener('change', (e) => {
          this.pushSnapshot(); node.type = e.target.value; this.render();
        });
      }

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
      return (this.conceptualModel.entities && this.conceptualModel.entities.find(e => e.id === id)) ||
             (this.conceptualModel.relationships && this.conceptualModel.relationships.find(r => r.id === id)) ||
             (this.conceptualModel.hierarchies && this.conceptualModel.hierarchies.find(h => h.id === id)) ||
             (this.conceptualModel.attributes && this.conceptualModel.attributes.find(a => a.id === id));
    }

    executeTransformation() {
      const engine = new window.RelationalMappingEngine(this.conceptualModel);
      this.logicalModel = engine.transform();
    }

    updateSqlView() {
      if (this.logicalModel.tables.length === 0) this.executeTransformation();
      const dialect = this.dialectSelect.value;
      const bitemporal = document.getElementById('bitemporalCheck') ? document.getElementById('bitemporalCheck').checked : false;

      if (dialect === 'prisma') {
        this.sqlCodeOutput.value = window.PrismaTranspiler.compile(this.logicalModel);
      } else if (dialect === 'drizzle') {
        this.sqlCodeOutput.value = window.DrizzleTranspiler.compile(this.logicalModel);
      } else {
        const transpiler = new window.SqlTranspiler(this.logicalModel);
        this.sqlCodeOutput.value = transpiler.compile(dialect, { onDelete: 'CASCADE', onUpdate: 'CASCADE' }, bitemporal);
      }
    }

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
          return `<div class="linter-item"><div style="color:#cbd5e1;">${d.message}</div></div>`;
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

    renderConceptualModel() {
      const notation = this.notationSelect ? this.notationSelect.value : 'CHEN';
      this.projector.selectedEdgeId = this.selectedEdgeId;
      this.projector.selectedGroup = this.selectedGroup;
      this.projector.render(this.conceptualModel, notation);

      const nodes = this.nodesLayer.querySelectorAll('.interactive-node');
      nodes.forEach(g => {
        const nodeId = g.getAttribute('data-node-id');
        if (!nodeId) return;

        let nodeData = this.findNodeById(nodeId);
        let nodeType = 'entity';
        if (this.conceptualModel.relationships.some(r => r.id === nodeId)) nodeType = 'relationship';
        if (this.conceptualModel.attributes.some(a => a.id === nodeId)) nodeType = 'attribute';

        this._svgNodes.set(nodeId, g);

        g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          if (this.handleNodeClickForEdge(nodeId)) return;

          if (!this.selectedGroup.has(nodeId)) {
            if (!e.shiftKey) this.selectedGroup.clear();
            this.selectedGroup.add(nodeId);
          }

          this.selectedNodeId = nodeId;
          this.selectedNodeType = nodeType;
          this.showPropsForNode(nodeId, nodeType);

          // Atualização de destaques visuais sem destruir a árvore DOM
          this.nodesLayer.querySelectorAll('.interactive-node').forEach(node => {
            const id = node.getAttribute('data-node-id');
            const shape = node.querySelector('rect, polygon, ellipse');
            if (shape) {
              if (this.selectedGroup.has(id)) {
                shape.setAttribute('stroke', '#6366f1');
                shape.setAttribute('stroke-width', '3.5');
              } else {
                shape.setAttribute('stroke-width', '2');
              }
            }
          });

          const mouse = this.screenToGlobal(e.clientX, e.clientY);
          const dragItems = [];
          this.selectedGroup.forEach(id => {
            const nData = this.findNodeById(id);
            const el = this.nodesLayer.querySelector(`[data-node-id="${id}"]`);
            if (nData && el) {
              dragItems.push({
                nodeData: nData,
                svgElement: el,
                offsetX: mouse.x - (nData.x || 0),
                offsetY: mouse.y - (nData.y || 0)
              });
            }
          });
          this._dragging = dragItems;
        });
      });

      const edges = this.edgesLayer.querySelectorAll('g[data-edge-id]');
      edges.forEach(gEdge => {
        const edgeId = gEdge.getAttribute('data-edge-id');
        if (!edgeId) return;
        gEdge.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          this.selectEdge(edgeId);
        });
      });
    }

    updateEdgesForNode(nodeId) {
      for (const edge of this.conceptualModel.edges) {
        if (edge.fromNodeId !== nodeId && edge.toNodeId !== nodeId) continue;
        const gEdge = this.edgesLayer.querySelector(`g[data-edge-id="${edge.id}"]`);
        if (!gEdge) continue;

        const fromNode = this.findNodeById(edge.fromNodeId);
        const toNode = this.findNodeById(edge.toNodeId);
        if (!fromNode || !toNode) continue;

        const x1 = fromNode.x + (fromNode.width || 100) / 2;
        const y1 = fromNode.y + (fromNode.height || 70) / 2;
        const x2 = toNode.x + (toNode.width || 100) / 2;
        const y2 = toNode.y + (toNode.height || 70) / 2;

        const lines = gEdge.querySelectorAll('line');
        lines.forEach(l => {
          l.setAttribute('x1', x1); l.setAttribute('y1', y1);
          l.setAttribute('x2', x2); l.setAttribute('y2', y2);
        });

        const text = gEdge.querySelector('text');
        if (text) {
          text.setAttribute('x', (x1 + x2) / 2);
          text.setAttribute('y', (y1 + y2) / 2 - 8);
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
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', '#475569');
        path.setAttribute('stroke-width', '1.8');

        this.edgesLayer.appendChild(path);
      }

      for (const table of this.logicalModel.tables) {
        const g = document.createElementNS(ns, 'g');
        g.setAttribute('class', 'interactive-node');
        g.setAttribute('transform', `translate(${table.x}, ${table.y})`);
        g.setAttribute('data-node-id', table.id);

        const body = document.createElementNS(ns, 'rect');
        body.setAttribute('width', table.width);
        body.setAttribute('height', table.height);
        body.setAttribute('rx', '6');
        body.setAttribute('fill', '#0f172a');
        body.setAttribute('stroke', '#334155');
        body.setAttribute('stroke-width', '1.5');
        g.appendChild(body);

        const header = document.createElementNS(ns, 'rect');
        header.setAttribute('width', table.width);
        header.setAttribute('height', '32');
        header.setAttribute('rx', '6');
        header.setAttribute('fill', '#1e293b');
        g.appendChild(header);

        const title = document.createElementNS(ns, 'text');
        title.setAttribute('x', '12');
        title.setAttribute('y', '20');
        title.setAttribute('fill', '#f8fafc');
        title.setAttribute('font-size', '12');
        title.setAttribute('font-weight', '700');
        title.textContent = table.name.toUpperCase();
        g.appendChild(title);

        table.columns.forEach((col, idx) => {
          const cy = 40 + idx * 24;
          const ct = document.createElementNS(ns, 'text');
          ct.setAttribute('x', '26');
          ct.setAttribute('y', cy + 12);
          ct.setAttribute('fill', col.isPrimaryKey ? '#fde047' : '#e2e8f0');
          ct.setAttribute('font-size', '11');
          ct.setAttribute('font-family', 'monospace');
          ct.textContent = col.name;
          g.appendChild(ct);
        });

        g.addEventListener('pointerdown', (e) => {
          e.stopPropagation();
          const mouse = this.screenToGlobal(e.clientX, e.clientY);
          this._dragging = {
            svgElement: g,
            nodeData: table,
            offsetX: mouse.x - table.x,
            offsetY: mouse.y - table.y
          };
        });

        this.nodesLayer.appendChild(g);
      }
    }

    async loadInitialState() {
      const saved = await this.stateManager.load();
      if (saved && saved.conceptualModel && saved.conceptualModel.entities && saved.conceptualModel.entities.length > 0) {
        this.conceptualModel = saved.conceptualModel;
        if (saved.logicalModel) this.logicalModel = saved.logicalModel;
      } else {
        this.loadDemoState();
      }
      this.activeProjectId = this.stateManager.catalog.activeId;
      this.render();
    }

    autoSave() {
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => {
        this.stateManager.save({
          conceptualModel: this.conceptualModel,
          logicalModel: this.logicalModel
        });
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

    exportSvg() {
      const serializer = new XMLSerializer();
      const source = serializer.serializeToString(document.getElementById('svgRoot'));
      const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `winsdom_model_${Date.now()}.svg`;
      link.click();
      URL.revokeObjectURL(url);
    }
  }

  window.addEventListener('DOMContentLoaded', () => {
    new WinsdomDataModelerApp();
    
    // Listener para o menu nativo do Electron (Exportar para PDF)
    if (window.winsdom && window.winsdom.onExportPDF) {
      window.winsdom.onExportPDF(() => {
        const svg = document.getElementById('svgRoot');
        const viewport = document.getElementById('viewportGroup');
        
        if (!svg || !viewport) {
          window.print();
          return;
        }

        const originalTransform = viewport.getAttribute('transform');
        const originalViewBox = svg.getAttribute('viewBox');
        
        try {
          const bbox = viewport.getBBox();
          const padding = 40;
          svg.setAttribute('viewBox', `${bbox.x - padding} ${bbox.y - padding} ${bbox.width + padding * 2} ${bbox.height + padding * 2}`);
          viewport.setAttribute('transform', 'translate(0,0) scale(1)');
        } catch (e) {
          console.warn("Erro ao calcular BBox", e);
        }

        window.print();

        if (originalViewBox) {
          svg.setAttribute('viewBox', originalViewBox);
        } else {
          svg.removeAttribute('viewBox');
        }
        
        if (originalTransform) {
          viewport.setAttribute('transform', originalTransform);
        }
      });
    }
  });
})();
