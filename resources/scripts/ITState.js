/**
 * Winsdom Data Modeler — Gerenciador de Catálogo e Separação Física de Projetos
 * - Limite rigoroso de até 5 projetos simultâneos.
 * - Cada projeto reside em seu próprio arquivo isolado: winsdom_it_project_<ID>.json.
 * - O catálogo (winsdom_it_catalog.json) atua como índice central.
 * - Migração atômica de dados legados (winsdom_it_state_model) sem perda de dados.
 * - Geração de nomes automáticos sequenciais ("Projeto 1", "Projeto 2", etc.) sem uso de prompt().
 */

const DefaultConceptualState = Object.freeze({
  entities: [],
  relationships: [],
  edges: [],
  attributes: [],
  hierarchies: []
});

const DefaultLogicalState = Object.freeze({
  tables: [],
  relationships: []
});

class ITStateManager {
  constructor() {
    this.legacyKey = 'winsdom_it_state_model';
    this.catalogKey = 'winsdom_it_catalog';
    this.catalog = { projects: [], activeId: null };
    this._saveTimer = null;
    this.MAX_PROJECTS = 5;
  }

  async _readData(key) {
    if (window.winsdom && window.winsdom.storageRead) {
      try {
        const res = await window.winsdom.storageRead(key);
        if (res && res.success && res.data) return res.data;
      } catch (err) {
        console.warn(`[ITState] Falha na leitura IPC do arquivo ${key}:`, err);
      }
    }
    const local = localStorage.getItem(key);
    return local ? JSON.parse(local) : null;
  }

  async _writeData(key, data) {
    if (window.winsdom && window.winsdom.storageWrite) {
      try {
        await window.winsdom.storageWrite(key, data);
      } catch (err) {
        console.warn(`[ITState] Falha na gravação IPC do arquivo ${key}:`, err);
      }
    }
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch (e) {
      // Ignora erro de cota excedida de localStorage
    }
  }

  async _deleteData(key) {
    localStorage.removeItem(key);
    if (window.winsdom && window.winsdom.storageDelete) {
      try {
        await window.winsdom.storageDelete(key);
      } catch (err) {
        console.warn(`[ITState] Falha na exclusão do arquivo físico ${key}:`, err);
      }
    }
  }

  async initCatalog() {
    let cat = await this._readData(this.catalogKey);

    // Caso não exista catálogo configurado, verificamos a existência de dados legados
    if (!cat || !Array.isArray(cat.projects) || cat.projects.length === 0) {
      const legacyData = await this._readData(this.legacyKey);

      if (legacyData && legacyData.conceptualModel && Array.isArray(legacyData.conceptualModel.entities) && legacyData.conceptualModel.entities.length > 0) {
        const id = crypto.randomUUID();
        cat = {
          projects: [{ id, name: "Projeto 1", lastModified: Date.now() }],
          activeId: id
        };
        // Move fisicamente o trabalho antigo para o arquivo exclusivo do novo ID
        await this._writeData(`winsdom_it_project_${id}`, legacyData);
        await this._writeData(this.catalogKey, cat);
        this.catalog = cat;
      } else {
        this.catalog = { projects: [], activeId: null };
        await this.createNewProject("Projeto 1");
        return;
      }
    } else {
      this.catalog = cat;
    }
  }

  async saveCatalog() {
    await this._writeData(this.catalogKey, this.catalog);
  }

  getNextDefaultProjectName() {
    const existingNames = new Set(this.catalog.projects.map(p => p.name.trim().toLowerCase()));
    for (let i = 1; i <= this.MAX_PROJECTS + 5; i++) {
      const candidate = `Projeto ${i}`;
      if (!existingNames.has(candidate.toLowerCase())) {
        return candidate;
      }
    }
    return `Projeto ${Date.now()}`;
  }

  async createNewProject(customName = null) {
    if (this.catalog.projects.length >= this.MAX_PROJECTS) {
      throw new Error(`Limite de ${this.MAX_PROJECTS} projetos atingido. Exclua um projeto antes de criar um novo.`);
    }

    const id = crypto.randomUUID();
    const name = (customName && customName.trim().length > 0) ? customName.trim() : this.getNextDefaultProjectName();
    const proj = { id, name, lastModified: Date.now() };

    this.catalog.projects.push(proj);
    this.catalog.activeId = id;

    const emptyState = {
      conceptualModel: JSON.parse(JSON.stringify(DefaultConceptualState)),
      logicalModel: JSON.parse(JSON.stringify(DefaultLogicalState))
    };

    await this._writeData(`winsdom_it_project_${id}`, emptyState);
    await this.saveCatalog();
    return id;
  }

  async deleteProject(id) {
    this.catalog.projects = this.catalog.projects.filter(p => p.id !== id);

    if (this.catalog.activeId === id) {
      this.catalog.activeId = this.catalog.projects.length > 0 ? this.catalog.projects[0].id : null;
    }

    await this._deleteData(`winsdom_it_project_${id}`);
    await this.saveCatalog();
  }

  async renameProject(id, newName) {
    const proj = this.catalog.projects.find(p => p.id === id);
    if (proj && newName && newName.trim()) {
      proj.name = newName.trim();
      proj.lastModified = Date.now();
      await this.saveCatalog();
    }
  }

  async setActiveProject(id) {
    const exists = this.catalog.projects.find(p => p.id === id);
    if (exists) {
      this.catalog.activeId = id;
      await this.saveCatalog();
    }
  }

  async load() {
    await this.initCatalog();

    if (!this.catalog.activeId && this.catalog.projects.length > 0) {
      this.catalog.activeId = this.catalog.projects[0].id;
      await this.saveCatalog();
    }

    if (this.catalog.activeId) {
      const state = await this._readData(`winsdom_it_project_${this.catalog.activeId}`);
      if (state) return state;
    }

    return null;
  }

  async save(state) {
    if (!this.catalog.activeId) return;

    const proj = this.catalog.projects.find(p => p.id === this.catalog.activeId);
    if (proj) {
      proj.lastModified = Date.now();
      if (Date.now() - (proj._lastSavedDate || 0) > 4000) {
        proj._lastSavedDate = Date.now();
        await this.saveCatalog();
      }
    }

    await this._writeData(`winsdom_it_project_${this.catalog.activeId}`, state);
  }
}

window.ITStateManager = ITStateManager;
window.DefaultConceptualState = DefaultConceptualState;
window.DefaultLogicalState = DefaultLogicalState;
