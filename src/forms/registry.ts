import type { FormDefinition } from './types.js';

const dailyOpeningChecklist = {
  key: 'daily_opening_checklist',
  version: 1,
  title: 'Daily Opening Checklist',
  description: 'Confirm the restaurant is clean, safe, stocked, and ready for service.',
  schedule: 'daily',
  requiresGps: true,
  gpsFailureMode: 'require-reason',
  requiresSignature: true,
  fields: [
    { type: 'text', name: 'openingManager', label: 'Opening manager', required: true },
    {
      type: 'radio',
      name: 'floorsClean',
      label: 'Floors clean',
      options: ['Yes', 'No'],
      required: true,
    },
    {
      type: 'radio',
      name: 'equipmentReady',
      label: 'Equipment switched on and checked',
      options: ['Yes', 'No'],
      required: true,
    },
    {
      type: 'checkbox',
      name: 'fridgesChecked',
      label: 'Fridge temperatures recorded',
      required: true,
    },
    { type: 'textarea', name: 'notes', label: 'Notes or corrective actions', required: false },
    { type: 'photo', name: 'frontAreaPhoto', label: 'Front area photo', required: false },
    { type: 'signature', name: 'managerSignature', label: 'Manager signature', required: true },
  ],
} as const satisfies FormDefinition;

const basicTestChecklist = {
  key: 'basic_test_checklist',
  version: 1,
  title: 'Basic Test Checklist',
  description: 'A lightweight form for quickly verifying the app end to end in Docker.',
  schedule: 'daily',
  requiresGps: false,
  gpsFailureMode: 'require-reason',
  requiresSignature: false,
  fields: [
    { type: 'text', name: 'siteName', label: 'Site name', required: true },
    {
      type: 'radio',
      name: 'serviceReady',
      label: 'Service ready',
      options: ['Yes', 'No'],
      required: true,
    },
    {
      type: 'checkbox',
      name: 'musicOn',
      label: 'Background music on',
      required: false,
    },
    { type: 'textarea', name: 'notes', label: 'Notes', required: false },
  ],
} as const satisfies FormDefinition;

export const formRegistry = {
  [dailyOpeningChecklist.key]: dailyOpeningChecklist,
  [basicTestChecklist.key]: basicTestChecklist,
} as const;
export type FormKey = keyof typeof formRegistry;

export function getFormDefinition(key: string): FormDefinition | undefined {
  return formRegistry[key as FormKey];
}
