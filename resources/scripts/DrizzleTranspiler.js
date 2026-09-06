/**
 * Transpilador ORM: Drizzle ORM
 */
class DrizzleTranspiler {
  static compile(logicalModel) {
    let code = `import { pgTable, serial, text, integer, numeric, boolean, timestamp } from 'drizzle-orm/pg-core';\n\n`;

    for (const table of logicalModel.tables) {
      code += `export const ${table.name} = pgTable('${table.name}', {\n`;
      for (const col of table.columns) {
        code += `  ${col.name}: ${this.mapDrizzleType(col)},\n`;
      }
      code += `});\n\n`;
    }
    return code;
  }

  static mapDrizzleType(col) {
    const u = col.dataType.toUpperCase();
    let stmt = '';
    if (col.isPrimaryKey) stmt = `serial('${col.name}').primaryKey()`;
    else if (u.includes('INT')) stmt = `integer('${col.name}')`;
    else if (u.includes('DECIMAL')) stmt = `numeric('${col.name}', { precision: 18, scale: 4 })`;
    else if (u.includes('BOOLEAN')) stmt = `boolean('${col.name}')`;
    else stmt = `text('${col.name}')`;

    if (!col.isNullable && !col.isPrimaryKey) stmt += '.notNull()';
    if (col.isUnique && !col.isPrimaryKey) stmt += '.unique()';
    if (col.isForeignKey && col.references) {
      stmt += `.references(() => ${col.references.tableName}.${col.references.columnName})`;
    }
    return stmt;
  }
}

window.DrizzleTranspiler = DrizzleTranspiler;
