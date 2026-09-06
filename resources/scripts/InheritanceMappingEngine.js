/**
 * Algoritmo Polimórfico de Herança e Especialização
 */
class InheritanceMappingEngine {
  constructor(hierarchyIR, superEntity, subEntities, strategy = 'TPT') {
    this.hierarchy = hierarchyIR;
    this.superEntity = superEntity;
    this.subEntities = subEntities;
    this.strategy = strategy; // 'TPT' | 'TPH' | 'TPCC' | 'JSONB'
  }

  synthesize() {
    switch (this.strategy) {
      case 'TPH':
        return this.mapTablePerHierarchy();
      case 'TPCC':
        return this.mapTablePerConcreteClass();
      case 'JSONB':
        return this.mapJsonbHybrid();
      case 'TPT':
      default:
        return this.mapTablePerType();
    }
  }

  // Estratégia 1: TPT (Normalização Estrita 3FN)
  mapTablePerType() {
    const tables = [];
    const relationships = [];

    // Tabela da Superclasse
    const superTableId = crypto.randomUUID();
    const superPK = this.superEntity.attributes.find(a => a.isIdentifying) || {
      name: 'id', baseType: 'BIGINT'
    };

    const superColumns = this.superEntity.attributes.map(a => ({
      id: crypto.randomUUID(),
      name: a.name.toLowerCase(),
      dataType: a.domainRef || 'VARCHAR(255)',
      isPrimaryKey: Boolean(a.isIdentifying),
      isForeignKey: false,
      isNullable: !a.isIdentifying
    }));

    tables.push({
      id: superTableId,
      name: `tb_${this.superEntity.name.toLowerCase()}`,
      columns: superColumns
    });

    // Tabelas das Subclasses
    for (const sub of this.subEntities) {
      const subTableId = crypto.randomUUID();
      const fkColumnId = crypto.randomUUID();

      const subColumns = [
        {
          id: fkColumnId,
          name: superPK.name.toLowerCase(),
          dataType: superPK.baseType || 'BIGINT',
          isPrimaryKey: true,
          isForeignKey: true,
          isNullable: false,
          references: {
            tableId: superTableId,
            tableName: `tb_${this.superEntity.name.toLowerCase()}`,
            columnName: superPK.name.toLowerCase()
          }
        },
        ...sub.attributes.map(a => ({
          id: crypto.randomUUID(),
          name: a.name.toLowerCase(),
          dataType: a.domainRef || 'VARCHAR(255)',
          isPrimaryKey: false,
          isForeignKey: false,
          isNullable: false
        }))
      ];

      tables.push({
        id: subTableId,
        name: `tb_${sub.name.toLowerCase()}`,
        columns: subColumns
      });

      relationships.push({
        id: crypto.randomUUID(),
        sourceTableId: superTableId,
        targetTableId: subTableId,
        sourceColumnId: superColumns.find(c => c.isPrimaryKey).id,
        targetColumnId: fkColumnId,
        onDelete: 'CASCADE'
      });
    }

    return { tables, relationships };
  }

  // Estratégia 2: TPH (Tabela Única com Discriminador)
  mapTablePerHierarchy() {
    const tableId = crypto.randomUUID();
    const columns = [];

    // Colunas da Superclasse
    for (const a of this.superEntity.attributes) {
      columns.push({
        id: crypto.randomUUID(),
        name: a.name.toLowerCase(),
        dataType: a.domainRef || 'VARCHAR(255)',
        isPrimaryKey: Boolean(a.isIdentifying),
        isForeignKey: false,
        isNullable: !a.isIdentifying
      });
    }

    // Coluna Discriminadora Mandatória
    columns.push({
      id: crypto.randomUUID(),
      name: 'tipo_discriminador',
      dataType: 'VARCHAR(50)',
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: false
    });

    // Colunas das Subclasses (Obrigatoriamente Nullable para suportar outros subtipos)
    for (const sub of this.subEntities) {
      for (const a of sub.attributes) {
        columns.push({
          id: crypto.randomUUID(),
          name: `${sub.name.toLowerCase()}_${a.name.toLowerCase()}`,
          dataType: a.domainRef || 'VARCHAR(255)',
          isPrimaryKey: false,
          isForeignKey: false,
          isNullable: true
        });
      }
    }

    return {
      tables: [{
        id: tableId,
        name: `tb_${this.superEntity.name.toLowerCase()}`,
        columns
      }],
      relationships: []
    };
  }

  // Estratégia 3: TPCC (Tabela por Classe Concreta)
  mapTablePerConcreteClass() {
    const tables = [];
    const superAttrs = this.superEntity.attributes;

    for (const sub of this.subEntities) {
      const subTableId = crypto.randomUUID();
      const combinedAttrs = [...superAttrs, ...sub.attributes];

      const columns = combinedAttrs.map(a => ({
        id: crypto.randomUUID(),
        name: a.name.toLowerCase(),
        dataType: a.domainRef || 'VARCHAR(255)',
        isPrimaryKey: Boolean(a.isIdentifying),
        isForeignKey: false,
        isNullable: !a.isIdentifying
      }));

      tables.push({
        id: subTableId,
        name: `tb_${sub.name.toLowerCase()}`,
        columns
      });
    }

    return { tables, relationships: [] };
  }

  // Estratégia 4: Híbrido Semi-estruturado JSONB
  mapJsonbHybrid() {
    const tableId = crypto.randomUUID();
    const columns = this.superEntity.attributes.map(a => ({
      id: crypto.randomUUID(),
      name: a.name.toLowerCase(),
      dataType: a.domainRef || 'VARCHAR(255)',
      isPrimaryKey: Boolean(a.isIdentifying),
      isForeignKey: false,
      isNullable: !a.isIdentifying
    }));

    columns.push({
      id: crypto.randomUUID(),
      name: 'dados_especializados',
      dataType: 'JSONB',
      isPrimaryKey: false,
      isForeignKey: false,
      isNullable: false
    });

    return {
      tables: [{
        id: tableId,
        name: `tb_${this.superEntity.name.toLowerCase()}`,
        columns
      }],
      relationships: []
    };
  }
}

window.InheritanceMappingEngine = InheritanceMappingEngine;
