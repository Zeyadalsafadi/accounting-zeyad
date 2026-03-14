import db from './client.js';

export function run(sql, params = []) {
  return db.prepare(sql).run(params);
}

export function get(sql, params = []) {
  return db.prepare(sql).get(params);
}

export function all(sql, params = []) {
  return db.prepare(sql).all(params);
}

export function transaction(callback, ...args) {
  const wrapped = db.transaction(callback);
  return wrapped(...args);
}

export function paginate({ page = 1, pageSize = 25 } = {}) {
  const safePage = Math.max(Number(page) || 1, 1);
  const safePageSize = Math.min(Math.max(Number(pageSize) || 25, 1), 100);

  return {
    limit: safePageSize,
    offset: (safePage - 1) * safePageSize,
    page: safePage,
    pageSize: safePageSize
  };
}
