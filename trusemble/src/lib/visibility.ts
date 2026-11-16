/** What the public site may show. Contact details are never selected by public queries. */
export function includeDemo(): boolean {
  return process.env.PUBLIC_INCLUDE_DEMO === 'true';
}

/** SQL fragment restricting a table to publishable rows. */
export function publicRows(alias = ''): string {
  const a = alias ? alias + '.' : '';
  return `${a}published = 1 AND ${a}archived = 0` + (includeDemo() ? '' : ` AND ${a}verification != 'demo'`);
}

/** Same for tables without a `published` flag (programs, awards). */
export function publicVerified(alias = ''): string {
  const a = alias ? alias + '.' : '';
  return `${alias ? a + 'archived = 0' : 'archived = 0'}` + (includeDemo() ? '' : ` AND ${a}verification != 'demo'`);
}
