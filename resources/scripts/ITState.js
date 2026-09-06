/**
 * Validador e normalizador estrutural do estado conceitual e lógico do Winsdom Modeler.
 */

const DefaultConceptualState = {
  entities: [],
  relationships: [],
  edges: [],
  attributes: [],
  hierarchies: []
};

const DefaultLogicalState = {
  tables: [],
  relationships: []
};

class ITStateManager {
  constructor() {
    this.storageKey = 'winsdom_it_state_model';
  }

  async load() {
    if (window.winsdom && window.winsdom.storageRead) {
      const res = await window.winsdom.storageRead(this.storageKey);
      if (res && res.success && res.data) {
        return res.data;
      }
    }
    const local = localStorage.getItem(this.storageKey);
    return local ? JSON.parse(local) : null;
  }

  async save(state) {
    if (window.winsdom && window.winsdom.storageWrite) {
      await window.winsdom.storageWrite(this.storageKey, state);
    }
    localStorage.setItem(this.storageKey, JSON.stringify(state));
  }
}

window.ITStateManager = ITStateManager;
window.DefaultConceptualState = DefaultConceptualState;
window.DefaultLogicalState = DefaultLogicalState;
