/**
 * Normalizador Axiomático (1FN..BCNF)
 */
class NormalizationEngine {
  constructor(attributes, dependencies) {
    this.attributes = new Set(attributes);
    this.dependencies = dependencies; // [{ lhs: ['id'], rhs: ['nome'] }]
  }

  // Cálculo de Fecho de Atributos X+
  computeClosure(attributeSubset, depList = this.dependencies) {
    let closure = new Set(attributeSubset);
    let changed = true;

    while (changed) {
      changed = false;
      for (const dep of depList) {
        const lhsIsSubset = dep.lhs.every(attr => closure.has(attr));
        if (lhsIsSubset) {
          for (const target of dep.rhs) {
            if (!closure.has(target)) {
              closure.add(target);
              changed = true;
            }
          }
        }
      }
    }
    return Array.from(closure);
  }

  // Identificação de Chaves Candidatas Mínimas
  findCandidateKeys() {
    const allAttrs = Array.from(this.attributes);
    const candidateKeys = [];
    
    const subsets = this.generateSubsets(allAttrs);
    subsets.sort((a, b) => a.length - b.length);

    for (const sub of subsets) {
      const closure = this.computeClosure(sub);
      if (closure.length === allAttrs.length) {
        const isMinimal = !candidateKeys.some(existingKey => 
          existingKey.every(k => sub.includes(k))
        );
        if (isMinimal) {
          candidateKeys.push(sub);
        }
      }
    }
    return candidateKeys;
  }

  generateSubsets(array) {
    return array.reduce(
      (subsets, value) => subsets.concat(subsets.map(set => [value, ...set])),
      [[]]
    ).filter(s => s.length > 0);
  }

  // Avaliação Formal de Nível de Forma Normal
  auditNormalForms() {
    const candidateKeys = this.findCandidateKeys();
    const primeAttributes = new Set(candidateKeys.flat());
    const violations = [];

    let is2NF = true;
    let is3NF = true;
    let isBCNF = true;

    for (const dep of this.dependencies) {
      const lhsClosure = this.computeClosure(dep.lhs);
      const isLhsSuperkey = this.attributes.size === lhsClosure.length;

      for (const target of dep.rhs) {
        if (dep.lhs.includes(target)) continue; // Trivial

        if (!isLhsSuperkey) {
          isBCNF = false;
          
          const isTargetPrime = primeAttributes.has(target);
          if (!isTargetPrime) {
            is3NF = false;

            for (const key of candidateKeys) {
              const isLhsStrictSubsetOfKey = dep.lhs.every(k => key.includes(k)) && dep.lhs.length < key.length;
              if (isLhsStrictSubsetOfKey) {
                is2NF = false;
                violations.push({
                  type: '2NF_VIOLATION',
                  description: `Atributo não-primo '${target}' tem dependência parcial da chave [${key.join(', ')}] via determinante [${dep.lhs.join(', ')}]`
                });
              }
            }

            if (is2NF) {
              violations.push({
                type: '3NF_VIOLATION',
                description: `Dependência transitiva: [${dep.lhs.join(', ')}] -> '${target}', onde o determinante não é superchave e o dependente não é primo.`
              });
            }
          }
        }
      }
    }

    return {
      candidateKeys,
      normalForm: !is2NF ? '1FN' : !is3NF ? '2FN' : !isBCNF ? '3FN' : 'BCNF',
      violations
    };
  }
}

window.NormalizationEngine = NormalizationEngine;
