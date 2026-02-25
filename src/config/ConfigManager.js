const fs = require('fs');
const path = require('path');

class ConfigManager {
  constructor() {
    this.defaultPath = path.join(__dirname, 'default.json');
    this.serverPath = path.join(__dirname, 'server.json');
    this.config = {};
    this.load();
  }

  load() {
    const defaults = JSON.parse(fs.readFileSync(this.defaultPath, 'utf-8'));

    let overrides = {};
    if (fs.existsSync(this.serverPath)) {
      try {
        overrides = JSON.parse(fs.readFileSync(this.serverPath, 'utf-8'));
      } catch {
        console.warn('[Config] server.json corrupted, using defaults.');
      }
    }

    this.config = this._deepMerge(defaults, overrides);
  }

  save() {
    const defaults = JSON.parse(fs.readFileSync(this.defaultPath, 'utf-8'));
    const diff = this._deepDiff(defaults, this.config);

    const tmpPath = this.serverPath + '.tmp';
    fs.writeFileSync(tmpPath, JSON.stringify(diff, null, 2), 'utf-8');
    fs.renameSync(tmpPath, this.serverPath);
  }

  get(key) {
    const keys = key.split('.');
    let value = this.config;
    for (const k of keys) {
      if (value == null || typeof value !== 'object') return undefined;
      value = value[k];
    }
    return value;
  }

  set(key, value) {
    const keys = key.split('.');
    let obj = this.config;
    for (let i = 0; i < keys.length - 1; i++) {
      if (obj[keys[i]] == null || typeof obj[keys[i]] !== 'object') {
        obj[keys[i]] = {};
      }
      obj = obj[keys[i]];
    }

    const parsed = this._parseValue(value);
    obj[keys[keys.length - 1]] = parsed;
    this.save();
    return parsed;
  }

  reset(key) {
    const defaults = JSON.parse(fs.readFileSync(this.defaultPath, 'utf-8'));
    const keys = key.split('.');
    let defaultVal = defaults;
    for (const k of keys) {
      if (defaultVal == null) return undefined;
      defaultVal = defaultVal[k];
    }

    if (defaultVal === undefined) return undefined;
    this.set(key, defaultVal);
    return defaultVal;
  }

  _parseValue(value) {
    if (typeof value !== 'string') return value;
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value === 'null') return null;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }

  _deepMerge(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (
        source[key] &&
        typeof source[key] === 'object' &&
        !Array.isArray(source[key]) &&
        target[key] &&
        typeof target[key] === 'object' &&
        !Array.isArray(target[key])
      ) {
        result[key] = this._deepMerge(target[key], source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }

  _deepDiff(defaults, current) {
    const diff = {};
    for (const key of Object.keys(current)) {
      if (!(key in defaults)) {
        diff[key] = current[key];
      } else if (
        current[key] &&
        typeof current[key] === 'object' &&
        !Array.isArray(current[key]) &&
        defaults[key] &&
        typeof defaults[key] === 'object' &&
        !Array.isArray(defaults[key])
      ) {
        const nested = this._deepDiff(defaults[key], current[key]);
        if (Object.keys(nested).length > 0) diff[key] = nested;
      } else if (JSON.stringify(current[key]) !== JSON.stringify(defaults[key])) {
        diff[key] = current[key];
      }
    }
    return diff;
  }
}

module.exports = new ConfigManager();
