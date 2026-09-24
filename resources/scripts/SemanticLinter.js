/**
 * Linter Semântico e Detecção de Armadilhas Topológicas
 */
class SemanticLinter {
  constructor(modelIR) {
    this.model = modelIR;
    this.diagnostics = [];
  }

  runAllChecks() {
    this.diagnostics = [];
    this.checkEntities();
    this.checkCardinalityInvariants();
    this.checkFanTraps();
    this.checkChasmTraps();
    this.checkReferentialCycles();
    this.checkDisconnectedGraphs();
    this.checkCyclicInheritance();
    return this.diagnostics;
  }

  addDiagnostic(code, severity, message, targetId) {
    this.diagnostics.push({ code, severity, message, targetId, timestamp: Date.now() });
  }

  // 1. Auditoria de Entidades e Identificadores
  checkEntities() {
    const attributes = this.model.attributes || [];
    const edges = this.model.edges || [];

    for (const entity of this.model.entities) {
      if (entity.type !== 'weak') {
        const hasKey = attributes.some(a => a.parentId === entity.id && a.isKey);
        let isSubClass = false;
        if (this.model.hierarchies) {
           isSubClass = this.model.hierarchies.some(h => h.subEntityIds.includes(entity.id));
        }
        
        if (!hasKey && !isSubClass) {
          this.addDiagnostic(
            'LINT_E001', 'WARNING',
            `Entidade forte '${entity.name}' não possui atributo identificador primário.`,
            entity.id
          );
        }
      } else {
        // Entidade fraca
        const hasOwner = edges.some(edge => {
          const fromRel = this.model.relationships.some(r => r.id === edge.fromNodeId || r.id === edge.toNodeId);
          return (edge.fromNodeId === entity.id || edge.toNodeId === entity.id) && fromRel;
        });
        if (!hasOwner) {
          this.addDiagnostic(
            'LINT_E002', 'ERROR',
            `Entidade fraca '${entity.name}' deve possuir dependência com um relacionamento.`,
            entity.id
          );
        }
      }
    }
  }

  // 2. Paradoxos de Cardinalidade
  checkCardinalityInvariants() {
    const edges = this.model.edges || [];
    for (const edge of edges) {
      if (parseInt(edge.cardinalityMin) === 1 && edge.cardinalityMax === '0') {
        this.addDiagnostic(
          'LINT_C001', 'ERROR',
          `Paradoxo de cardinalidade na aresta: min (1) > max (0).`,
          edge.id
        );
      }
    }
  }

  // 3. Detecção de Fan Traps (1:N <- E -> 1:N)
  checkFanTraps() {
    const edges = this.model.edges || [];
    for (const entity of this.model.entities) {
      const incidentRelationships = this.model.relationships.filter(rel =>
        edges.some(edge => 
          (edge.fromNodeId === rel.id || edge.toNodeId === rel.id) &&
          (edge.fromNodeId === entity.id || edge.toNodeId === entity.id) &&
          edge.cardinalityMax === '1'
        )
      );

      if (incidentRelationships.length >= 2) {
        for (let i = 0; i < incidentRelationships.length; i++) {
          for (let j = i + 1; j < incidentRelationships.length; j++) {
            const r1 = incidentRelationships[i];
            const r2 = incidentRelationships[j];
            this.addDiagnostic(
              'TRAP_FAN', 'WARNING',
              `Possível Fan Trap centrada na entidade '${entity.name}' entre os relacionamentos '${r1.name}' e '${r2.name}'. A correlação entre os extremos pode ser ambígua.`,
              entity.id
            );
          }
        }
      }
    }
  }

  // 4. Detecção de Chasm Traps (Descontinuidade por min=0)
  checkChasmTraps() {
    const edges = this.model.edges || [];
    for (const rel of this.model.relationships) {
      const optionalRoles = edges.filter(edge => 
        (edge.fromNodeId === rel.id || edge.toNodeId === rel.id) &&
        parseInt(edge.cardinalityMin) === 0
      );
      if (optionalRoles.length >= 2) {
        this.addDiagnostic(
          'TRAP_CHASM', 'INFO',
          `Potencial Chasm Trap no relacionamento '${rel.name}': múltiplos caminhos de participação opcional (min=0). Navegações transitivas podem retornar vazias.`,
          rel.id
        );
      }
    }
  }

  // 5. Ciclos de Deleção em Cascata
  checkReferentialCycles() {
    const adj = new Map();
    for (const ent of this.model.entities) adj.set(ent.id, []);

    const edges = this.model.edges || [];
    for (const rel of this.model.relationships) {
      const relEdges = edges.filter(e => e.fromNodeId === rel.id || e.toNodeId === rel.id);
      if (relEdges.length === 2) {
        const u = relEdges[0].fromNodeId === rel.id ? relEdges[0].toNodeId : relEdges[0].fromNodeId;
        const v = relEdges[1].fromNodeId === rel.id ? relEdges[1].toNodeId : relEdges[1].fromNodeId;
        
        // Very simplified direction inference
        if (adj.has(u)) adj.get(u).push(v);
        if (adj.has(v)) adj.get(v).push(u);
      }
    }

    const visited = new Set();
    const recStack = new Set();

    const dfs = (nodeId, parentNode, path) => {
      visited.add(nodeId);
      recStack.add(nodeId);

      for (const neighbor of adj.get(nodeId) || []) {
        if (neighbor === parentNode) continue;
        
        if (!visited.has(neighbor)) {
          if (dfs(neighbor, nodeId, [...path, neighbor])) return true;
        } else if (recStack.has(neighbor) && path.length > 2) {
          const entNames = path.map(id => {
            const e = this.model.entities.find(x => x.id === id);
            return e ? e.name : '?';
          }).join(' -> ');
          this.addDiagnostic(
            'LINT_CYCLE_CASCADE', 'ERROR',
            `Ciclo referencial detectado: ${entNames} -> ${neighbor}.`,
            nodeId
          );
          return true;
        }
      }
      recStack.delete(nodeId);
      return false;
    };

    for (const ent of this.model.entities) {
      if (!visited.has(ent.id)) dfs(ent.id, null, [ent.id]);
    }
  }

  // 6. Deteção de Subgrafos Desconexos (Disjoint-Set)
  checkDisconnectedGraphs() {
    const nodes = [...this.model.entities, ...this.model.relationships].map(n => n.id);
    if (nodes.length <= 1) return;
    
    const parent = new Map();
    nodes.forEach(n => parent.set(n, n));
    
    const find = (i) => {
      if (parent.get(i) === i) return i;
      const root = find(parent.get(i));
      parent.set(i, root);
      return root;
    };
    
    const union = (i, j) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) parent.set(rootI, rootJ);
    };

    const edges = this.model.edges || [];
    for (const edge of edges) {
      if (parent.has(edge.fromNodeId) && parent.has(edge.toNodeId)) {
        union(edge.fromNodeId, edge.toNodeId);
      }
    }

    const roots = new Set();
    for (const n of nodes) roots.add(find(n));

    if (roots.size > 1) {
      this.addDiagnostic(
        'LINT_DISCONNECTED', 'INFO',
        `Fragmentação detectada: O diagrama possui ${roots.size} subgrafos isolados que não se conectam entre si.`,
        null
      );
    }
  }

  // 7. Herança Cíclica (DFS Tricolor)
  checkCyclicInheritance() {
    const hierarchies = this.model.hierarchies || [];
    const adj = new Map();
    
    for (const h of hierarchies) {
      if (!adj.has(h.superEntityId)) adj.set(h.superEntityId, []);
      for (const sub of h.subEntityIds) {
        adj.get(h.superEntityId).push(sub);
      }
    }

    const colors = new Map(); // 0: Branco, 1: Cinza, 2: Preto
    
    const dfs = (node) => {
      colors.set(node, 1);
      for (const sub of (adj.get(node) || [])) {
        const c = colors.get(sub) || 0;
        if (c === 1) {
          this.addDiagnostic('LINT_CYCLE_INHERIT', 'ERROR', 'Ciclo de herança detectado.', node);
          return true;
        }
        if (c === 0 && dfs(sub)) return true;
      }
      colors.set(node, 2);
      return false;
    };

    for (const node of adj.keys()) {
      if (!colors.has(node)) dfs(node);
    }
  }
}

window.SemanticLinter = SemanticLinter;
