export type FieldType =
  'text' | 'textarea' | 'radio' | 'select' | 'checkbox' | 'photo' | 'signature';

export interface FormField {
  type: FieldType;
  name: string;
  label: string;
  required: boolean;
  options?: readonly string[];
  help?: string;
}

export interface FormDefinition {
  key: string;
  version: number;
  title: string;
  description: string;
  schedule: 'daily' | 'weekly' | 'monthly';
  requiresGps: boolean;
  gpsFailureMode: 'block' | 'require-reason';
  requiresSignature: boolean;
  fields: readonly FormField[];
}
