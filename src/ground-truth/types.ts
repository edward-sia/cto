export interface SchemaField {
  name: string;
  type: string;
  required: boolean;
  description?: string;
}

export interface SchemaDefinition {
  name: string;
  fields: SchemaField[];
}

export interface ApiEndpoint {
  method: string;
  path: string;
  description: string;
}

export interface DomainFacts {
  domain: string;
  schemas?: SchemaDefinition[];
  apiEndpoints?: ApiEndpoint[];
  constraints: string[];
  knownAbsences: string[];
  rawContext?: string;
}
