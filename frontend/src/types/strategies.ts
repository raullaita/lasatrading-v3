export type ParameterType = "int" | "float" | "string" | "boolean";

export interface ParameterSchema {
  type: ParameterType;
  default?: number | string | boolean;
  min?: number;
  max?: number;
  step?: number;
  description?: string;
}

export interface StrategyCatalogItem {
  name: string;
  display_name: string;
  description: string;
  category: string;
  parameters_schema: Record<string, ParameterSchema>;
}