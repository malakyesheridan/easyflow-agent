type RenderResult = {
  rendered: string;
  missing: string[];
};

function getValueByPath(source: Record<string, any>, path: string): unknown {
  const parts = path.split('.');
  let current: any = source;
  for (const part of parts) {
    if (!current || typeof current !== 'object') return undefined;
    current = current[part];
  }
  return current;
}

export function renderTemplate(template: string, variables: Record<string, any>): RenderResult {
  const missing: string[] = [];
  const rendered = template.replace(/{{\s*([a-zA-Z0-9_.]+)\s*}}/g, (match, path) => {
    const value = getValueByPath(variables, path);
    if (value === undefined || value === null) {
      missing.push(path);
      return match;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return String(value);
    }
    return JSON.stringify(value);
  });

  return { rendered, missing };
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderEmailHtml(body: string): string {
  const escaped = escapeHtml(body);
  const withBreaks = escaped.replace(/\r\n|\r|\n/g, '<br />');
  return `
    <div style="font-family: Arial, sans-serif; font-size: 14px; line-height: 1.6; color: #1f2937;">
      ${withBreaks}
    </div>
  `.trim();
}
