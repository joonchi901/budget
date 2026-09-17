/** Test-only metrics. SQL text, parameters and returned rows never leave the Worker. */
export function instrumentDatabase(database: D1Database) {
  const metrics = {
    queries: 0,
    maxBatch: 0,
    maxBindingBytes: 0,
    maxSqlBytes: 0,
    maxCompoundTerms: 0,
  };
  const originals = new WeakMap<D1PreparedStatement, D1PreparedStatement>();
  const encoder = new TextEncoder();
  const statement = (raw: D1PreparedStatement): D1PreparedStatement => {
    const wrapped = new Proxy(raw, {
      get(target, property) {
        if (property === 'bind')
          return (...args: unknown[]) => {
            for (const value of args)
              if (typeof value === 'string')
                metrics.maxBindingBytes = Math.max(
                  metrics.maxBindingBytes,
                  encoder.encode(value).byteLength,
                );
            return statement(target.bind(...args));
          };
        if (['all', 'run', 'first', 'raw'].includes(String(property)))
          return (...args: unknown[]) => {
            metrics.queries++;
            return Reflect.apply(Reflect.get(target, property), target, args);
          };
        const value = Reflect.get(target, property);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    originals.set(wrapped, raw);
    return wrapped;
  };
  const db = new Proxy(database, {
    get(target, property) {
      if (property === 'prepare')
        return (sql: string) => {
          metrics.maxSqlBytes = Math.max(metrics.maxSqlBytes, encoder.encode(sql).byteLength);
          metrics.maxCompoundTerms = Math.max(
            metrics.maxCompoundTerms,
            1 + (sql.match(/\bUNION\s+ALL\b/gi)?.length ?? 0),
          );
          return statement(target.prepare(sql));
        };
      if (property === 'batch')
        return (statements: D1PreparedStatement[]) => {
          metrics.queries += statements.length;
          metrics.maxBatch = Math.max(metrics.maxBatch, statements.length);
          return target.batch(statements.map((value) => originals.get(value) ?? value));
        };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  return { db, metrics };
}
