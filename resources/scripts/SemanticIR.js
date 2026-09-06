/**
 * SemanticIR - Canonical Representation
 * Decouples semantic logic from visual layout.
 */

class SemanticIRBuilder {
  static createDefaultModel() {
    return {
      version: '1.4.0',
      domains: [],
      entities: [],
      relationships: [],
      hierarchies: [],
      functionalDependencies: []
    };
  }

  static createEntity(id, name, nature = 'REGULAR') {
    return {
      id,
      name,
      nature,
      attributes: []
    };
  }
  
  static createRelationship(id, name, degree = 2) {
    return {
      id,
      name,
      degree,
      roles: [],
      attributes: []
    };
  }
  
  static createAttribute(id, name, isIdentifying = false, domainRef = 'VARCHAR(255)') {
    return {
      id,
      name,
      isIdentifying,
      nature: 'ATOMIC',
      domainRef,
      cardinality: { min: 1, max: 1 }
    };
  }
  
  static createRole(id, roleName, entityRef, min = 0, max = 'N') {
    return {
      id,
      roleName,
      entityRef,
      cardinalityMin: min,
      cardinalityMax: max
    };
  }
}

window.SemanticIRBuilder = SemanticIRBuilder;
