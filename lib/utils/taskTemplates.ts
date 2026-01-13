export type TaskTemplateKey = 'install' | 'measure' | 'defect';

export type TaskTemplateStep = {
  title: string;
  description?: string;
  isRequired: boolean;
};

export const TASK_TEMPLATES: Record<TaskTemplateKey, TaskTemplateStep[]> = {
  measure: [
    { title: 'Measure site', description: 'Take accurate measurements of the installation area', isRequired: true },
    { title: 'Record measurements', description: 'Document all measurements and notes', isRequired: true },
  ],
  install: [
    { title: 'Prepare site', description: 'Set up the work area and confirm access requirements', isRequired: true },
    { title: 'Complete primary work', description: 'Carry out the core installation or service tasks', isRequired: true },
    { title: 'Finalise and protect', description: 'Secure, seal, or protect the finished work', isRequired: true },
    { title: 'Cleanup', description: 'Clean up work area and dispose of waste materials', isRequired: false },
  ],
  defect: [
    { title: 'Assess defect', description: 'Confirm defect details and required actions', isRequired: true },
    { title: 'Perform repair', description: 'Complete the repair or remediation steps', isRequired: true },
    { title: 'Verify outcome', description: 'Verify the defect has been resolved', isRequired: true },
    { title: 'Cleanup', description: 'Clean up work area and dispose of waste materials', isRequired: false },
  ],
};
