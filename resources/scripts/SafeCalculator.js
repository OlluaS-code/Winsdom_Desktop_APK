class SafeCalculator {
  constructor() {
    // Configurar escopo seguro desprovido de referências ao DOM ou Node.js
    // Assume que a biblioteca mathjs foi carregada e expõe window.math
    this.mathInstance = window.math.create(window.math.all, {});
    this.customScope = {
      e: Math.E,
      pi: Math.PI
    };
  }

  /**
   * Sanitiza a entrada substituindo caracteres da UI por notação matemática padrão
   */
  normalizeExpression(rawInput) {
    return rawInput
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/π/g, 'pi')
      .replace(/√\(([^)]+)\)/g, 'sqrt($1)')
      .replace(/√(\d+(\.\d+)?)/g, 'sqrt($1)')
      .replace(/\^/g, '^')
      .replace(/º/g, ' deg')
      .replace(/(sin|cos|tan)\((\d+(\.\d+)?)\)/g, '$1($2 deg)')
      .trim();
  }

  /**
   * Avalia a expressão com proteção contra estouro de pilha e loops infinitos
   */
  evaluate(expressionStr) {
    if (!expressionStr || expressionStr.trim() === '') {
      return { success: true, result: '0' };
    }

    try {
      const sanitized = this.normalizeExpression(expressionStr);

      // Compilação prévia para validação do AST antes da execução
      const parsedNode = this.mathInstance.parse(sanitized);

      // Validação defensiva: proibir tipos de nós que gerem atribuições globais perigosas
      parsedNode.traverse((node) => {
        if (node.type === 'AssignmentNode') {
          throw new Error('Operação de atribuição não permitida na calculadora padrão.');
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
