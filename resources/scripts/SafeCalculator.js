/**
 * SafeCalculator com padrão Singleton e escopo isolado para neutralizar
 * riscos de Prototype Pollution e vazamentos de memória na análise de AST.
 */
class SafeCalculator {
  constructor() {
    if (SafeCalculator.instance) {
      return SafeCalculator.instance;
    }

    if (typeof window.math === 'undefined') {
      throw new Error('A biblioteca Math.js deve ser carregada antes do SafeCalculator.');
    }

    this.mathInstance = window.math.create(window.math.all, {});
    this.customScope = Object.freeze({
      e: Math.E,
      pi: Math.PI
    });

    SafeCalculator.instance = this;
  }

  normalizeExpression(rawInput) {
    if (!rawInput) return '';
    return rawInput
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/π/g, 'pi')
      .replace(/√\(([^)]+)\)/g, 'sqrt($1)')
      .replace(/√(\d+(\.\d+)?)/g, 'sqrt($1)')
      .replace(/\^/g, '^')
      .replace(/º/g, ' deg')
      .replace(/\bln\(/g, 'log(')
      .replace(/(\d+(?:\.\d+)?)%/g, '($1 / 100)')
      .replace(/(sin|cos|tan)\((\d+(\.\d+)?)\)/g, '$1($2 deg)')
      .trim();
  }

  evaluate(expressionStr) {
    if (!expressionStr || expressionStr.trim() === '') {
      return { success: true, result: '0' };
    }

    try {
      const sanitized = this.normalizeExpression(expressionStr);
      const parsedNode = this.mathInstance.parse(sanitized);

      // Bloqueia declarações de variáveis ou mutações maliciosas na AST
      parsedNode.traverse((node) => {
        if (
          node.type === 'AssignmentNode' ||
          node.type === 'FunctionAssignmentNode' ||
          node.type === 'AccessorNode' ||
          node.type === 'IndexNode'
        ) {
          throw new Error('Operações de atribuição ou mutação de membros são proibidas.');
        }
      });

      const compiled = parsedNode.compile();
      const output = compiled.evaluate(this.customScope);

      if (typeof output === 'function') {
        throw new Error('Expressão incompleta.');
      }

      const formatted = this.mathInstance.format(output, { precision: 12 });
      return { success: true, result: formatted };
    } catch (err) {
      return { success: false, error: err.message || 'Erro de sintaxe' };
    }
  }
}

window.SafeCalculator = SafeCalculator;
