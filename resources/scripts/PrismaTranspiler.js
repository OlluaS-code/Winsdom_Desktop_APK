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
      for (const col of table.columns) {
        let type = this.mapPrismaType(col.dataType);
        let attributes = '';
        if (col.isPrimaryKey) attributes += ' @id @default(autoincrement())';
        if (col.isUnique && !col.isPrimaryKey) attributes += ' @unique';
        if (col.isForeignKey && col.references) {
          attributes += ` @relation(fields: [${col.name}], references: [${col.references.columnName}])`;
        }
        schema += `  ${col.name.padEnd(20)} ${type}${col.isNullable && !col.isPrimaryKey ? '?' : ''}${attributes}\n`;
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
