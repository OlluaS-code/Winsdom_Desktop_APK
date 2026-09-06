/**
 * Compilador SQL com ordenação causal de dependências (Kahn) e tratamento de ciclos.
 */
class SqlTranspiler {
  constructor(logicalModel) {
    this.logicalModel = JSON.parse(JSON.stringify(logicalModel));
    this.dialectMappings = {
      sqlite: {
        'INT': 'INTEGER',
        'BIGINT': 'INTEGER',
        'VARCHAR': 'TEXT',
        'DECIMAL': 'REAL',
        'BOOLEAN': 'INTEGER',
        'TIMESTAMP': 'TEXT'
      },
      postgres: {
        'INT': 'INTEGER',
        'BIGINT': 'BIGINT',
        'VARCHAR': 'VARCHAR',
        'DECIMAL': 'NUMERIC',
        'BOOLEAN': 'BOOLEAN',
        'TIMESTAMP': 'TIMESTAMP WITH TIME ZONE'
      },
      mysql: {
        'INT': 'INT',
        'BIGINT': 'BIGINT',
        'VARCHAR': 'VARCHAR',
        'DECIMAL': 'DECIMAL',
        'BOOLEAN': 'TINYINT(1)',
        'TIMESTAMP': 'DATETIME'
      }
    };
  }

  resolveDependencies() {
    const tables = this.logicalModel.tables;
    const inDegree = new Map();
    const adjList = new Map();
    const circularFKs = [];

    for (const table of tables) {
      inDegree.set(table.id, 0);
      adjList.set(table.id, []);
    }

    for (const table of tables) {
      const referencedTableIds = new Set();
      for (const col of table.columns) {
        if (col.isForeignKey && col.references && col.references.tableId !== table.id) {
          referencedTableIds.add(col.references.tableId);
        }
      }

      for (const refId of referencedTableIds) {
        if (adjList.has(refId)) {
          adjList.get(refId).push(table.id);
          inDegree.set(table.id, inDegree.get(table.id) + 1);
        }
      }
    }

    const queue = [];
    for (const [tableId, deg] of inDegree.entries()) {
      if (deg === 0) queue.push(tableId);
    }

    const orderedTableIds = [];

    while (queue.length > 0) {
      const u = queue.shift();
      orderedTableIds.push(u);

      for (const v of adjList.get(u)) {
        inDegree.set(v, inDegree.get(v) - 1);
        if (inDegree.get(v) === 0) {
          queue.push(v);
        }
      }
    }

    if (orderedTableIds.length < tables.length) {
      const remainingTableIds = tables
        .map(t => t.id)
        .filter(id => !orderedTableIds.includes(id));

      for (const tableId of remainingTableIds) {
        const table = tables.find(t => t.id === tableId);
        for (const col of table.columns) {
          if (col.isForeignKey && col.references) {
            circularFKs.push({
              sourceTable: table.name,
              columnName: col.name,
              targetTable: col.references.tableName,
              targetColumn: col.references.columnName
            });
            col.isDeferredFK = true;
          }
        }
        orderedTableIds.push(tableId);
      }
    }

    const orderedTables = orderedTableIds.map(id => tables.find(t => t.id === id));
    return { orderedTables, circularFKs };
  }

  mapDataType(abstractType, dialect) {
    const base = abstractType.toUpperCase();
    const map = this.dialectMappings[dialect];

    for (const [key, val] of Object.entries(map)) {
      if (base.startsWith(key)) {
        return base.replace(key, val);
      }
    }
    return base;
  }

  compile(dialect = 'postgres', referentialActions = { onDelete: 'CASCADE', onUpdate: 'CASCADE' }, bitemporal = false) {
    const { orderedTables, circularFKs } = this.resolveDependencies();
    let ddl = `-- =============================================================================\n`;
    ddl += `-- Esquema Relacional DDL Gerado Automaticamente pelo Winsdom IT Module\n`;
    ddl += `-- Dialeto: ${dialect.toUpperCase()} | Data: ${new Date().toISOString()}\n`;
    if (bitemporal) ddl += `-- Extensão: Bitemporal (valid_from, valid_to)\n`;
    ddl += `-- =============================================================================\n\n`;

    if (dialect === 'sqlite') {
      ddl += `PRAGMA foreign_keys = OFF;\n\n`;
    }

    for (const table of orderedTables) {
      const qName = dialect === 'mysql' ? '`' + table.name + '`' : table.name;
      ddl += `CREATE TABLE ${qName} (\n`;
      const colDefs = [];
      const primaryKeys = [];

      let columns = [...table.columns];
      
      if (bitemporal) {
        columns.push({
          id: 'sys_valid_from',
          name: 'valid_from',
          dataType: 'TIMESTAMP',
          isPrimaryKey: false,
          isNullable: false,
          isUnique: false
        });
        columns.push({
          id: 'sys_valid_to',
          name: 'valid_to',
          dataType: 'TIMESTAMP',
          isPrimaryKey: false,
          isNullable: true,
          isUnique: false
        });
      }

      for (const col of columns) {
        const qCol = dialect === 'mysql' ? '`' + col.name + '`' : col.name;
        let colStr = `  ${qCol} `;

        if (col.isPrimaryKey && col.dataType.toUpperCase().includes('INT') && table.columns.filter(c => c.isPrimaryKey).length === 1 && !col.isForeignKey) {
          if (dialect === 'sqlite') {
            colStr += 'INTEGER PRIMARY KEY AUTOINCREMENT';
            colDefs.push(colStr);
            continue;
          } else if (dialect === 'postgres') {
            colStr += 'BIGSERIAL PRIMARY KEY';
            colDefs.push(colStr);
            continue;
          } else if (dialect === 'mysql') {
            colStr += 'BIGINT AUTO_INCREMENT';
          }
        } else {
          colStr += this.mapDataType(col.dataType, dialect);
        }

        if (!col.isNullable) colStr += ' NOT NULL';
        if (col.isUnique && !col.isPrimaryKey) colStr += ' UNIQUE';

        if (col.defaultValue) {
          const defVal = dialect === 'sqlite' && col.defaultValue.value === 'CURRENT_TIMESTAMP' ? '(datetime(\'now\'))' : col.defaultValue.value;
          colStr += ` DEFAULT ${defVal}`;
        }

        if (col.isForeignKey && !col.isDeferredFK && col.references) {
          const refTable = dialect === 'mysql' ? '`' + col.references.tableName + '`' : col.references.tableName;
          
          let onDelete = referentialActions.onDelete;
          let onUpdate = referentialActions.onUpdate;
          
          const rel = this.logicalModel.relationships.find(
            r => r.sourceTableId === col.references.tableId && 
                 r.targetTableId === table.id && 
                 r.targetColumnId === col.id
          );
          if (rel && rel.onDelete) onDelete = rel.onDelete;
          if (rel && rel.onUpdate) onUpdate = rel.onUpdate;

          colStr += ` REFERENCES ${refTable}(${col.references.columnName}) ON DELETE ${onDelete} ON UPDATE ${onUpdate}`;
        }

        if (col.isPrimaryKey) {
          primaryKeys.push(qCol);
        }

        colDefs.push(colStr);
      }

      if (primaryKeys.length > 0) {
        colDefs.push(`  PRIMARY KEY (${primaryKeys.join(', ')})`);
      }

      ddl += colDefs.join(',\n');
      ddl += dialect === 'mysql' ? '\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;\n\n' : '\n);\n\n';
    }

    if (circularFKs.length > 0 && dialect !== 'sqlite') {
      ddl += `-- Resolucao de Integridade Referencial para Dependencias Circulares\n`;
      for (const fk of circularFKs) {
        let onDelete = referentialActions.onDelete;
        let onUpdate = referentialActions.onUpdate;
        
        // table id e col id nao tao mapeados no fk, fk tem os nomes
        // busca no logical model relationships
        const rel = this.logicalModel.relationships.find(
          r => {
             const t = this.logicalModel.tables.find(tbl => tbl.id === r.targetTableId);
             const s = this.logicalModel.tables.find(tbl => tbl.id === r.sourceTableId);
             if(!t || !s) return false;
             return t.name === fk.sourceTable && s.name === fk.targetTable;
          }
        );
        if (rel && rel.onDelete) onDelete = rel.onDelete;
        if (rel && rel.onUpdate) onUpdate = rel.onUpdate;

        const constraintName = `fk_${fk.sourceTable}_${fk.columnName}`;
        ddl += `ALTER TABLE ${fk.sourceTable} ADD CONSTRAINT ${constraintName} `;
        ddl += `FOREIGN KEY (${fk.columnName}) REFERENCES ${fk.targetTable}(${fk.targetColumn}) `;
        ddl += `ON DELETE ${onDelete} ON UPDATE ${onUpdate};\n`;
      }
      ddl += '\n';
    }

    if (dialect === 'sqlite') {
      ddl += `PRAGMA foreign_keys = ON;\n`;
    }

    return ddl;
  }
}

window.SqlTranspiler = SqlTranspiler;
