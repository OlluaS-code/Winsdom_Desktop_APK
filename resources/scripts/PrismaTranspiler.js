/**
 * Transpilador ORM: Prisma Schema
 */
class PrismaTranspiler {
  static compile(logicalModel) {
    let schema = `// Prisma Schema gerado automaticamente pelo Winsdom Modeler\n\n`;
    schema += `datasource db {\n  provider = "postgresql"\n  url      = env("DATABASE_URL")\n}\n\n`;
    schema += `generator client {\n  provider = "prisma-client-js"\n}\n\n`;

    for (const table of logicalModel.tables) {
      schema += `model ${this.capitalize(table.name)} {\n`;
      
      const pks = table.columns.filter(c => c.isPrimaryKey);
      const isComposite = pks.length > 1;

      for (const col of table.columns) {
        let type = this.mapPrismaType(col.dataType);
        let attributes = '';
        
        if (col.isPrimaryKey && !isComposite) {
           attributes += ' @id';
           if (type === 'Int' && !col.isForeignKey) attributes += ' @default(autoincrement())';
        }
        
        if (col.isUnique && !col.isPrimaryKey) attributes += ' @unique';
        
        schema += `  ${col.name.padEnd(20)} ${type}${col.isNullable && !col.isPrimaryKey ? '?' : ''}${attributes}\n`;
      }
      
      // Relation fields (Forward)
      const fks = table.columns.filter(c => c.isForeignKey && c.references);
      for (const fk of fks) {
        const refTable = this.capitalize(fk.references.tableName);
        const relName = `${table.name}_${fk.name}`;
        schema += `  rel_${fk.name.padEnd(16)} ${refTable} @relation("${relName}", fields: [${fk.name}], references: [${fk.references.columnName}])\n`;
      }

      // Relation fields (Inverse/Back-references)
      for (const otherTable of logicalModel.tables) {
        const incomingFks = otherTable.columns.filter(c => c.isForeignKey && c.references && c.references.tableId === table.id);
        for (const fk of incomingFks) {
          const relName = `${otherTable.name}_${fk.name}`;
          const isUnique = fk.isUnique || fk.isPrimaryKey;
          const arrayChar = isUnique ? '?' : '[]'; // 1:1 or 1:N
          schema += `  inv_${otherTable.name}_${fk.name.padEnd(10)} ${this.capitalize(otherTable.name)}${arrayChar} @relation("${relName}")\n`;
        }
      }

      if (isComposite) {
        schema += `\n  @@id([${pks.map(c => c.name).join(', ')}])\n`;
      }
      
      schema += `}\n\n`;
    }
    return schema;
  }

  static capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  static mapPrismaType(dt) {
    const u = dt.toUpperCase();
    if (u.includes('INT')) return 'Int';
    if (u.includes('VARCHAR') || u.includes('TEXT')) return 'String';
    if (u.includes('BOOLEAN')) return 'Boolean';
    if (u.includes('DECIMAL') || u.includes('NUMERIC')) return 'Decimal';
    if (u.includes('TIMESTAMP') || u.includes('DATE')) return 'DateTime';
    if (u.includes('JSON')) return 'Json';
    return 'String';
  }
}

window.PrismaTranspiler = PrismaTranspiler;
