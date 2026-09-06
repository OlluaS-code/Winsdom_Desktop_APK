/**
 * Motor determinístico de síntese conceitual para relacional baseado na álgebra
 * formal de Peter Chen, Carlos Alberto Heuser e Elmasri & Navathe.
 */
class RelationalMappingEngine {
  constructor(conceptualModel) {
    this.conceptual = JSON.parse(JSON.stringify(conceptualModel));
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

    return {
      tables: Array.from(this.logicalTables.values()),
      relationships: this.logicalRelationships
    };
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

  // PASSO 1: Entidades Regulares (Fortes) e Associativas
  step1_mapStrongEntities() {
    const strongEntities = this.conceptual.entities.filter(e => e.type === 'strong' || e.type === 'associative');

    for (const entity of strongEntities) {
      const tableId = this.generateUUID();
      const flatAttrs = this.flattenAttributes(entity.id);

      const columns = flatAttrs.map(attr => ({
        id: this.generateUUID(),
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
        width: 220,
        height: Math.max(120, 45 + columns.length * 28),
        columns
      };

      this.logicalTables.set(tableId, table);
      this.entityToTableMap.set(entity.id, tableId);
    }
  }

  // PASSO 2: Entidades Fracas (Chave Composta Herdada da Proprietária)
  step2_mapWeakEntities() {
    const weakEntities = this.conceptual.entities.filter(e => e.type === 'weak');

    for (const weak of weakEntities) {
      const tableId = this.generateUUID();
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
        id: this.generateUUID(),
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
          const fkColumnId = this.generateUUID();
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
            id: this.generateUUID(),
            sourceTableId: ownerTable.id,
            targetTableId: tableId,
            sourceColumnId: pk.id,
            targetColumnId: fkColumnId,
            cardinalitySource: '1..1',
            cardinalityTarget: '0..N'
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

        if (edges[1].cardinalityMin === 1 && edges[0].cardinalityMin === 0) {
          targetTable = tableB;
          sourceTable = tableA;
          isSourceNullable = false;
        }

        const sourcePKs = sourceTable.columns.filter(c => c.isPrimaryKey);
        for (const pk of sourcePKs) {
          const fkColId = this.generateUUID();
          targetTable.columns.push({
            id: fkColId,
            name: `${sourceTable.name}_${pk.name}`,
            dataType: pk.dataType,
            isPrimaryKey: false,
            isForeignKey: true,
            isNullable: isSourceNullable,
            isUnique: true,
            references: {
              tableId: sourceTable.id,
              tableName: sourceTable.name,
              columnName: pk.name
            }
          });

          this.logicalRelationships.push({
            id: this.generateUUID(),
            sourceTableId: sourceTable.id,
            targetTableId: targetTable.id,
            sourceColumnId: pk.id,
            targetColumnId: fkColId,
            cardinalitySource: '1..1',
            cardinalityTarget: '0..1'
          });
        }

        const relAttrs = this.conceptual.attributes.filter(a => a.parentId === rel.id);
        for (const attr of relAttrs) {
          targetTable.columns.push({
            id: this.generateUUID(),
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

          const pkColumns = tableOne.columns.filter(c => c.isPrimaryKey);

          for (const pk of pkColumns) {
            const fkColId = this.generateUUID();
            tableMany.columns.push({
              id: fkColId,
              name: `${tableOne.name}_${pk.name}`,
              dataType: pk.dataType,
              isPrimaryKey: false,
              isForeignKey: true,
              isNullable: edgeMany.cardinalityMin === 0,
              isUnique: false,
              references: {
                tableId: tableOne.id,
                tableName: tableOne.name,
                columnName: pk.name
              }
            });

            this.logicalRelationships.push({
              id: this.generateUUID(),
              sourceTableId: tableOne.id,
              targetTableId: tableMany.id,
              sourceColumnId: pk.id,
              targetColumnId: fkColId,
              cardinalitySource: edgeOne.cardinalityMin === 1 ? '1..1' : '0..1',
              cardinalityTarget: edgeMany.cardinalityMin === 1 ? '1..N' : '0..N'
            });
          }

          const relAttrs = this.conceptual.attributes.filter(a => a.parentId === rel.id);
          for (const attr of relAttrs) {
            tableMany.columns.push({
              id: this.generateUUID(),
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
        const assocTableId = this.generateUUID();
        const assocColumns = [];

        for (const edge of edges) {
          const participantId = edge.fromNodeId === rel.id ? edge.toNodeId : edge.fromNodeId;
          const participantTableId = this.entityToTableMap.get(participantId);
          if (!participantTableId) continue;
          const participantTable = this.logicalTables.get(participantTableId);

          const pks = participantTable.columns.filter(c => c.isPrimaryKey);
          for (const pk of pks) {
            const fkColId = this.generateUUID();
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
              id: this.generateUUID(),
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
            id: this.generateUUID(),
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

      const tableId = this.generateUUID();
      const columns = [];

      for (const pk of parentPKs) {
        const fkColId = this.generateUUID();
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
          id: this.generateUUID(),
          sourceTableId: parentTable.id,
          targetTableId: tableId,
          sourceColumnId: pk.id,
          targetColumnId: fkColId,
          cardinalitySource: '1..1',
          cardinalityTarget: '0..N'
        });
      }

      columns.push({
        id: this.generateUUID(),
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

  // PASSO 7: Especialização e Generalização (4 Estratégias)
  step7_mapSpecializations() {
    if (!this.conceptual.hierarchies || !window.InheritanceMappingEngine) return;

    for (const hier of this.conceptual.hierarchies) {
      const superEntity = this.conceptual.entities.find(e => e.id === hier.superEntityId);
      const subEntities = hier.subEntityIds.map(id => this.conceptual.entities.find(e => e.id === id)).filter(Boolean);
      
      if (!superEntity || subEntities.length === 0) continue;

      // Passa a estratégia escolhida ou o padrão TPT
      const strategy = hier.strategy || 'TPT';
      const inheritanceEngine = new window.InheritanceMappingEngine(hier, superEntity, subEntities, strategy);
      const { tables, relationships } = inheritanceEngine.synthesize();

      // O engine vai gerar novas tabelas que substituem ou complementam as antigas.
      // Neste modelo simplificado, vamos apenas mesclá-las no modelo lógico geral.
      // (Em uma implementação completa de TPH/TPCC a gente removeria as tabelas antigas daqui)
      for (const t of tables) {
        // Posicionamento simples
        t.x = superEntity.x;
        t.y = superEntity.y + 150;
        t.width = 220;
        t.height = Math.max(120, 45 + t.columns.length * 28);
        this.logicalTables.set(t.id, t);
      }

      for (const r of relationships) {
        this.logicalRelationships.push(r);
      }
    }
  }
}

window.RelationalMappingEngine = RelationalMappingEngine;
