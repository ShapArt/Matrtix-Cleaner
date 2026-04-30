'use strict';

function normalize(value) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().toLowerCase();
}

function looksLikeNumericId(value) {
  return /^-?\d{3,}$/.test(String(value || '').trim());
}

function makeUser(value, role = '', source = 'matrix') {
  const text = String(value == null ? '' : value).trim();
  const numeric = looksLikeNumericId(text);
  return {
    id: numeric ? text.replace(/^-/, '') : '',
    fio: numeric ? `Не найдено имя (ID ${text.replace(/^-/, '')})` : text,
    position: '',
    login: '',
    role,
    source,
    unresolved: numeric,
    display: numeric ? `Не найдено имя (ID ${text.replace(/^-/, '')})` : text,
  };
}

function uniqueUsers(values, role = '', source = 'matrix') {
  const seen = new Set();
  return (values || [])
    .map(value => makeUser(value, role, source))
    .filter(user => {
      const key = normalize(user.id || user.fio);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function resolveUser(input, users = []) {
  const key = normalize(input);
  if (!key) return null;
  return users.find(user => normalize(user.fio) === key || normalize(user.display) === key || normalize(user.id) === key)
    || makeUser(input, '', 'manual');
}

module.exports = {
  looksLikeNumericId,
  makeUser,
  resolveUser,
  uniqueUsers,
};
