/**
 * Motor determinístico de síntese conceitual para relacional baseado na álgebra
 * formal de Peter Chen, Carlos Alberto Heuser e Elmasri & Navathe.
 */
class RelationalMappingEngine {
  constructor(conceptualModel, existingLogicalModel = null) {
    this.conceptual = JSON.parse(JSON.stringify(conceptualModel));
    this.existingLogical = existingLogicalModel ? JSON.parse(JSON.stringify(existingLogicalModel)) : null;
    this.logicalTables = new Map();
    this.logicalRelationships = [];
    this.entityToTableMap = new Map();
  }

  transform() {
    this.step1_mapStrongEntities();
    this.step2_mapWeakEntities();
    this.step3_mapOneToOneRelationships();
    this.step4_mapOneToManyRelationships();
    this.step5_mapManyToManyAndNaryRelationships();
    this.step6_mapMultivaluedAttributes();
    this.step7_mapSpecializations();

    for (const table of this.logicalTables.values()) {
      table.width = this.calculateTableWidth(table.name, table.columns);
      table.height = Math.max(120, 45 + table.columns.length * 28);
    }

    const result = {
      tables: Array.from(this.logicalTables.values()),
      relationships: this.logicalRelationships
    };

    if (this.existingLogical) {
      this.mergeOverrides(result);
    }
    return result;
  }

  mergeOverrides(result) {
    for (const table of result.tables) {
      const oldTable = this.existingLogical.tables.find(t => t.id === table.id);
      if (oldTable) {
        table.indexes = oldTable.indexes || [];
        for (const col of table.columns) {
          const oldCol = oldTable.columns.find(c => c.id === col.id);
          if (oldCol) {
            col.dataType = oldCol.dataType;
            col.defaultValue = oldCol.defaultValue;
          }
        }
      }
    }
    for (const rel of result.relationships) {
      const oldRel = this.existingLogical.relationships.find(r => r.id === rel.id);
      if (oldRel) {
        rel.onDelete = oldRel.onDelete || 'CASCADE';
        rel.onUpdate = oldRel.onUpdate || 'CASCADE';
      } else {
        rel.onDelete = 'CASCADE';
        rel.onUpdate = 'CASCADE';
      }
    }
  }

  generateUUID() {
    return crypto.randomUUID();
  }

  // Achatamento linear de atributos compostos (1FN)
  flattenAttributes(parentId) {
    const rawAttrs = this.conceptual.attributes.filter(a => a.parentId === parentId);
    let flattened = [];

    for (const attr of rawAttrs) {
      if (attr.type === 'derived') continue;
      if (attr.type === 'composite') {
        const subAttrs = this.flattenAttributes(attr.id).map(sub => ({
          ...sub,
          name: `${attr.name}_${sub.name}`
        }));
        flattened.push(...subAttrs);
      } else if (attr.type !== 'multivalued') {
        flattened.push(attr);
      }
    }
    return flattened;
  }

  calculateTableWidth(name, columns) {
    let maxLen = name.length;
    for (const c of columns) {
      const len = c.name.length + c.dataType.length + 5;
      if (len > maxLen) maxLen = len;
    }
    return Math.max(220, maxLen * 8.5 + 40);
  }

  // PASSO 1: Entidades Regulares (Fortes) e Associativas
  step1_mapStrongEntities() {
    let strongEntities = this.conceptual.entities.filter(e => e.type === 'strong' || e.type === 'associative');

    for (const entity of strongEntities) {
      const tableId = entity.id; // Deterministic ID
      const flatAttrs = this.flattenAttributes(entity.id);

      const columns = flatAttrs.map(attr => ({
        id: attr.id, // Deterministic ID
        name: attr.name.toLowerCase(),
        dataType: attr.dataType || 'VARCHAR(255)',
        isPrimaryKey: Boolean(attr.isKey),
        isForeignKey: false,
        isNullable: !attr.isKey,
        isUnique: Boolean(attr.isKey)
      }));

      const table = {
        id: tableId,
        name: entity.name.toLowerCase(),
        originEntityId: entity.id,
        x: entity.x,
        y: entity.y,
        width: this.calculateTableWidth(entity.name, columns),
        height: Math.max(120, 45 + columns.length * 28),
        columns
      };

      this.logicalTables.set(tableId, table);
      this.entityToTableMap.set(entity.id, tableId);
    }
    
    // PASSO 1B: Mapeia as arestas diretas que conectam Entidades Normais a Entidades Associativas
    for (const edge of this.conceptual.edges) {
      const nodeA = this.conceptual.entities.find(e => e.id === edge.fromNodeId);
      const nodeB = this.conceptual.entities.find(e => e.id === edge.toNodeId);
      if (nodeA && nodeB) {
        // Encontra qual é a entidade associativa (lado N) e qual é a entidade regular (lado 1)
        let assoc = null;
        let regular = null;
        if (nodeA.type === 'associative' && nodeB.type !== 'associative') { assoc = nodeA; regular = nodeB; }
        else if (nodeB.type === 'associative' && nodeA.type !== 'associative') { assoc = nodeB; regular = nodeA; }
        
        if (assoc && regular) {
          const assocTableId = this.entityToTableMap.get(assoc.id);
          const regularTableId = this.entityToTableMap.get(regular.id);
          if (!assocTableId || !regularTableId) continue;
          
          const assocTable = this.logicalTables.get(assocTableId);
          const regularTable = this.logicalTables.get(regularTableId);
          const regularPKs = regularTable.columns.filter(c => c.isPrimaryKey);
          
          for (const pk of regularPKs) {
            const fkColId = `fk_assoc_${pk.id}_${assoc.id}`;
            const fkColName = `${regularTable.name}_${pk.name}`;
            
            if (!assocTable.columns.find(c => c.id === fkColId || c.name === fkColName)) {
              assocTable.columns.push({
                id: fkColId,
                name: fkColName,
                dataType: pk.dataType,
                isPrimaryKey: true, // FK forma a PK composta da associativa
                isForeignKey: true,
                isNullable: false,
                isUnique: false,
                references: {
                  tableId: regularTable.id,
                  tableName: regularTable.name,
                  columnName: pk.name
                }
              });
              
              // Atualiza height e width com a nova coluna
              assocTable.height = Math.max(120, 45 + assocTable.columns.length * 28);
              assocTable.width = this.calculateTableWidth(assocTable.name, assocTable.columns);
              
              this.logicalRelationships.push({
                id: `rel_assoc_${edge.id}_${pk.id}`,
                sourceTableId: regularTable.id,
                targetTableId: assocTable.id,
                sourceColumnId: pk.id,
                targetColumnId: fkColId,
                cardinalitySource: '1..1',
                cardinalityTarget: '0..N',
                onDelete: 'CASCADE', // Entidades associativas (fracas por definição de chave) colapsam se o nó ancorar for apagado
                onUpdate: 'CASCADE'
              });
            }
          }
        }
      }
    }
  }

  // PASSO 2: Entidades Fracas (Chave Composta Herdada da Proprietária)
  step2_mapWeakEntities() {
    const weakEntities = this.conceptual.entities.filter(e => e.type === 'weak');

    for (const weak of weakEntities) {
      const tableId = weak.id; // Deterministic
      const flatAttrs = this.flattenAttributes(weak.id);

      const incidentEdges = this.conceptual.edges.filter(
        ed => ed.fromNodeId === weak.id || ed.toNodeId === weak.id
      );

      let ownerEntityId = null;
      let relId = null;

      for (const edge of incidentEdges) {
        const otherNodeId = edge.fromNodeId === weak.id ? edge.toNodeId : edge.fromNodeId;
        const rel = this.conceptual.relationships.find(r => r.id === otherNodeId);
        if (rel) {
          const otherEdge = this.conceptual.edges.find(
            ed => (ed.fromNodeId === rel.id || ed.toNodeId === rel.id) &&
                  ed.fromNodeId !== weak.id && ed.toNodeId !== weak.id
          );
          if (otherEdge) {
            ownerEntityId = otherEdge.fromNodeId === rel.id ? otherEdge.toNodeId : otherEdge.fromNodeId;
            relId = rel.id;
            break;
          }
        }
      }

      const columns = flatAttrs.map(attr => ({
        id: attr.id, // Deterministic
        name: attr.name.toLowerCase(),
        dataType: attr.dataType || 'VARCHAR(255)',
        isPrimaryKey: Boolean(attr.isPartialKey || attr.isKey),
        isForeignKey: false,
        isNullable: false,
        isUnique: false
      }));

      if (ownerEntityId && this.entityToTableMap.has(ownerEntityId)) {
        const ownerTable = this.logicalTables.get(this.entityToTableMap.get(ownerEntityId));
        const ownerPKs = ownerTable.columns.filter(c => c.isPrimaryKey);

        for (const pk of ownerPKs) {
          const fkColumnId = `fk_${pk.id}_${weak.id}`;
          const fkColName = `${ownerTable.name}_${pk.name}`;
          columns.unshift({
            id: fkColumnId,
            name: fkColName,
            dataType: pk.dataType,
            isPrimaryKey: true,
            isForeignKey: true,
            isNullable: false,
            isUnique: false,
            references: {
              tableId: ownerTable.id,
              tableName: ownerTable.name,
              columnName: pk.name
            }
          });

          this.logicalRelationships.push({
            id: `rel_${relId}_${pk.id}`,
            sourceTableId: ownerTable.id,
            targetTableId: tableId,
            sourceColumnId: pk.id,
            targetColumnId: fkColumnId,
            cardinalitySource: '1..1',
            cardinalityTarget: '0..N',
            onDelete: 'CASCADE', // Entidades fracas colapsam se o nó ancorar for apagado
            onUpdate: 'CASCADE'
          });
        }
      }

      const table = {
        id: tableId,
        name: weak.name.toLowerCase(),
        originEntityId: weak.id,
        originRelationshipId: relId,
        x: weak.x,
        y: weak.y,
        width: 220,
        height: Math.max(120, 45 + columns.length * 28),
        columns
      };

      this.logicalTables.set(tableId, table);
      this.entityToTableMap.set(weak.id, tableId);
    }
  }

  // PASSO 3: Relacionamentos 1:1 com Regra da Participação Total
  step3_mapOneToOneRelationships() {
    for (const rel of this.conceptual.relationships) {
      const edges = this.conceptual.edges.filter(
        e => e.fromNodeId === rel.id || e.toNodeId === rel.id
      );

      if (edges.length === 2 && edges[0].cardinalityMax === 1 && edges[1].cardinalityMax === 1) {
        const nodeAId = edges[0].fromNodeId === rel.id ? edges[0].toNodeId : edges[0].fromNodeId;
        const nodeBId = edges[1].fromNodeId === rel.id ? edges[1].toNodeId : edges[1].fromNodeId;

        const tableAId = this.entityToTableMap.get(nodeAId);
        const tableBId = this.entityToTableMap.get(nodeBId);
        if (!tableAId || !tableBId) continue;

        const tableA = this.logicalTables.get(tableAId);
        const tableB = this.logicalTables.get(tableBId);

        let targetTable = tableA;
        let sourceTable = tableB;
        let isSourceNullable = edges[0].cardinalityMin === 0;
        let mutualTotal = false;

        if (edges[1].cardinalityMin === 1 && edges[0].cardinalityMin === 0) {
          targetTable = tableB;
          sourceTable = tableA;
          isSourceNullable = false;
        } else if (edges[0].cardinalityMin === 1 && edges[1].cardinalityMin === 1) {
          mutualTotal = true; // Paradoxo 1:1 - DEFERRABLE
          isSourceNullable = false;
        }

        const sourcePKs = sourceTable.columns.filter(c => c.isPrimaryKey);
        for (const pk of sourcePKs) {
          const fkColId = `fk_${pk.id}_${targetTable.id}`;
          targetTable.columns.push({
            id: fkColId,
            name: `${sourceTable.name}_${pk.name}`,
            dataType: pk.dataType,
            isPrimaryKey: false,
            isForeignKey: true,
            isDeferredFK: mutualTotal, // DEFERRABLE se participacao total mutua
            isNullable: isSourceNullable,
            isUnique: true,
            references: {
              tableId: sourceTable.id,
              tableName: sourceTable.name,
              columnName: pk.name
            }
          });

          this.logicalRelationships.push({
            id: `rel_11_${rel.id}_${pk.id}`,
            sourceTableId: sourceTable.id,
            targetTableId: targetTable.id,
            sourceColumnId: pk.id,
            targetColumnId: fkColId,
            cardinalitySource: '1..1',
            cardinalityTarget: '0..1',
            onDelete: isSourceNullable ? 'SET NULL' : 'RESTRICT', // Heuristica de risco fisico
            onUpdate: 'CASCADE'
          });
        }

        const relAttrs = this.conceptual.attributes.filter(a => a.parentId === rel.id);
        for (const attr of relAttrs) {
          targetTable.columns.push({
            id: attr.id,
            name: attr.name.toLowerCase(),
            dataType: attr.dataType || 'VARCHAR(255)',
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: true,
            isUnique: false
          });
        }
      }
    }
  }

  // PASSO 4: Relacionamentos 1:N (Migração da PK do lado 1 para o lado N)
  step4_mapOneToManyRelationships() {
    for (const rel of this.conceptual.relationships) {
      const edges = this.conceptual.edges.filter(
        e => e.fromNodeId === rel.id || e.toNodeId === rel.id
      );

      if (edges.length === 2) {
        const edgeMany = edges.find(e => e.cardinalityMax === 'N');
        const edgeOne = edges.find(e => e.cardinalityMax === 1);

        if (edgeMany && edgeOne) {
          const entityManyId = edgeMany.fromNodeId === rel.id ? edgeMany.toNodeId : edgeMany.fromNodeId;
          const entityOneId = edgeOne.fromNodeId === rel.id ? edgeOne.toNodeId : edgeOne.fromNodeId;

          const tableManyId = this.entityToTableMap.get(entityManyId);
          const tableOneId = this.entityToTableMap.get(entityOneId);
          if (!tableManyId || !tableOneId) continue;

          const tableMany = this.logicalTables.get(tableManyId);
          const tableOne = this.logicalTables.get(tableOneId);
          const isNullable = edgeMany.cardinalityMin === 0;

          const sourcePKs = tableOne.columns.filter(c => c.isPrimaryKey);
          for (const pk of sourcePKs) {
            const fkColId = `fk_${pk.id}_${tableManyId}`;
            tableMany.columns.push({
              id: fkColId,
              name: `${tableOne.name}_${pk.name}`,
              dataType: pk.dataType,
              isPrimaryKey: false,
              isForeignKey: true,
              isNullable: isNullable,
              isUnique: false,
              references: {
                tableId: tableOne.id,
                tableName: tableOne.name,
                columnName: pk.name
              }
            });

            this.logicalRelationships.push({
              id: `rel_1n_${rel.id}_${pk.id}`,
              sourceTableId: tableOne.id,
              targetTableId: tableMany.id,
              sourceColumnId: pk.id,
              targetColumnId: fkColId,
              cardinalitySource: edgeOne.cardinalityMin === 1 ? '1..1' : '0..1',
              cardinalityTarget: edgeMany.cardinalityMin === 1 ? '1..N' : '0..N',
              onDelete: isNullable ? 'SET NULL' : 'RESTRICT', // Heuristica: previne erro de multiplas cascatas
              onUpdate: 'CASCADE'
            });
          }

          const relAttrs = this.conceptual.attributes.filter(a => a.parentId === rel.id);
          for (const attr of relAttrs) {
            tableMany.columns.push({
              id: attr.id,
              name: attr.name.toLowerCase(),
              dataType: attr.dataType || 'VARCHAR(255)',
              isPrimaryKey: false,
              isForeignKey: false,
              isNullable: true,
              isUnique: false
            });
          }
        }
      }
    }
  }

  // PASSO 5: Relacionamentos M:N e Ternários (Tabela Associativa)
  step5_mapManyToManyAndNaryRelationships() {
    for (const rel of this.conceptual.relationships) {
      const edges = this.conceptual.edges.filter(
        e => e.fromNodeId === rel.id || e.toNodeId === rel.id
      );

      const isBinaryMN = edges.length === 2 && edges[0].cardinalityMax === 'N' && edges[1].cardinalityMax === 'N';
      const isNary = edges.length > 2;

      if (isBinaryMN || isNary) {
        const assocTableId = rel.id; // Deterministic
        const assocColumns = [];

        for (const edge of edges) {
          const participantId = edge.fromNodeId === rel.id ? edge.toNodeId : edge.fromNodeId;
          const participantTableId = this.entityToTableMap.get(participantId);
          if (!participantTableId) continue;
          const participantTable = this.logicalTables.get(participantTableId);

          const pks = participantTable.columns.filter(c => c.isPrimaryKey);
          for (const pk of pks) {
            const fkColId = `fk_${pk.id}_${assocTableId}`;
            assocColumns.push({
              id: fkColId,
              name: `${participantTable.name}_${pk.name}`,
              dataType: pk.dataType,
              isPrimaryKey: true,
              isForeignKey: true,
              isNullable: false,
              isUnique: false,
              references: {
                tableId: participantTable.id,
                tableName: participantTable.name,
                columnName: pk.name
              }
            });

            this.logicalRelationships.push({
              id: `rel_mn_${rel.id}_${participantTable.id}_${pk.id}`,
              sourceTableId: participantTable.id,
              targetTableId: assocTableId,
              sourceColumnId: pk.id,
              targetColumnId: fkColId,
              cardinalitySource: '1..1',
              cardinalityTarget: '0..N'
            });
          }
        }

        const relAttrs = this.conceptual.attributes.filter(a => a.parentId === rel.id);
        for (const attr of relAttrs) {
          assocColumns.push({
            id: attr.id,
            name: attr.name.toLowerCase(),
            dataType: attr.dataType || 'VARCHAR(255)',
            isPrimaryKey: false,
            isForeignKey: false,
            isNullable: true,
            isUnique: false
          });
        }

        const table = {
          id: assocTableId,
          name: rel.name.toLowerCase(),
          originRelationshipId: rel.id,
          x: rel.x,
          y: rel.y,
          width: 220,
          height: Math.max(120, 45 + assocColumns.length * 28),
          columns: assocColumns
        };

        this.logicalTables.set(assocTableId, table);
      }
    }
  }

  // PASSO 6: Atributos Multivalorados (Tabelas Satélites Dedicadas)
  step6_mapMultivaluedAttributes() {
    const multiAttrs = this.conceptual.attributes.filter(a => a.type === 'multivalued');

    for (const attr of multiAttrs) {
      const parentTableId = this.entityToTableMap.get(attr.parentId);
      if (!parentTableId) continue;

      const parentTable = this.logicalTables.get(parentTableId);
      const parentPKs = parentTable.columns.filter(c => c.isPrimaryKey);

      const tableId = attr.id;
      const columns = [];

      for (const pk of parentPKs) {
        const fkColId = `fk_${pk.id}_${attr.id}`;
        columns.push({
          id: fkColId,
          name: `${parentTable.name}_${pk.name}`,
          dataType: pk.dataType,
          isPrimaryKey: true,
          isForeignKey: true,
          isNullable: false,
          isUnique: false,
          references: {
            tableId: parentTable.id,
            tableName: parentTable.name,
            columnName: pk.name
          }
        });

        this.logicalRelationships.push({
          id: `rel_mv_${attr.id}_${pk.id}`,
          sourceTableId: parentTable.id,
          targetTableId: tableId,
          sourceColumnId: pk.id,
          targetColumnId: fkColId,
          cardinalitySource: '1..1',
          cardinalityTarget: '0..N',
          onDelete: 'CASCADE', // Tabela multivalorada é fraca
          onUpdate: 'CASCADE'
        });
      }

      columns.push({
        id: `val_${attr.id}`,
        name: attr.name.toLowerCase(),
        dataType: attr.dataType || 'VARCHAR(255)',
        isPrimaryKey: true,
        isForeignKey: false,
        isNullable: false,
        isUnique: false
      });

      const table = {
        id: tableId,
        name: `${parentTable.name}_${attr.name.toLowerCase()}`,
        x: parentTable.x + 250,
        y: parentTable.y + 40,
        width: 220,
        height: Math.max(120, 45 + columns.length * 28),
        columns
      };

      this.logicalTables.set(tableId, table);
    }
  }

  step7_mapSpecializations() {
    if (!this.conceptual.hierarchies) return;

    for (const hier of this.conceptual.hierarchies) {
      const superTableId = this.entityToTableMap.get(hier.superEntityId);
      if (!superTableId) continue;
      
      const superTable = this.logicalTables.get(superTableId);
      const superPKs = superTable.columns.filter(c => c.isPrimaryKey);

      for (const subId of hier.subEntityIds) {
        const subTableId = this.entityToTableMap.get(subId);
        if (!subTableId) continue;
        const subTable = this.logicalTables.get(subTableId);

        // Adiciona a PK da superclasse como PK/FK na subclasse (estratégia TPT)
        for (const pk of superPKs) {
          const fkColId = `fk_hier_${pk.id}_${subTable.id}`;
          
          if (!subTable.columns.find(c => c.id === fkColId)) {
            let colName = pk.name;
            if (subTable.columns.find(c => c.name.toLowerCase() === colName.toLowerCase())) {
              colName = `id_${superTable.name.toLowerCase()}`;
            }

            subTable.columns.unshift({
              id: fkColId,
              name: colName, // Previne colisão se a subclasse já tinha um atributo com este nome
              dataType: pk.dataType,
              isPrimaryKey: true,
              isForeignKey: true,
              isNullable: false,
              isUnique: false,
              references: {
                tableId: superTable.id,
                tableName: superTable.name,
                columnName: pk.name
              }
            });

            this.logicalRelationships.push({
              id: `rel_hier_${hier.id}_${subTable.id}_${pk.id}`,
              sourceTableId: superTable.id,
              targetTableId: subTable.id,
              sourceColumnId: pk.id,
              targetColumnId: fkColId,
              cardinalitySource: '1..1',
              cardinalityTarget: '0..1',
              onDelete: 'CASCADE', // TPT exige cascata estrutural
              onUpdate: 'CASCADE'
            });
          }
        }
      }
    }
  }
}

window.RelationalMappingEngine = RelationalMappingEngine;
