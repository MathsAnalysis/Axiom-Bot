const fs = require('fs');
const path = require('path');
const config = require('../config/ConfigManager');

class I18n {
  constructor() {
    this.languages = {};
    this.currentLang = 'it';
    this._loadLanguages();
  }

  _loadLanguages() {
    const localesDir = __dirname;
    const files = fs.readdirSync(localesDir).filter((f) => f.endsWith('.json'));
    for (const file of files) {
      const lang = file.replace('.json', '');
      this.languages[lang] = JSON.parse(fs.readFileSync(path.join(localesDir, file), 'utf-8'));
    }
    this.currentLang = config.get('language') || 'it';
  }

  setLanguage(lang) {
    if (!this.languages[lang]) return false;
    this.currentLang = lang;
    config.set('language', lang);
    return true;
  }

  t(key, replacements = {}) {
    let text = this._resolve(key, this.currentLang);
    if (text === undefined) {
      text = this._resolve(key, 'en');
    }
    if (text === undefined) return key;

    for (const [placeholder, value] of Object.entries(replacements)) {
      text = text.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), String(value));
    }
    return text;
  }

  _resolve(key, lang) {
    const keys = key.split('.');
    let obj = this.languages[lang];
    for (const k of keys) {
      if (obj == null || typeof obj !== 'object') return undefined;
      obj = obj[k];
    }
    return typeof obj === 'string' ? obj : undefined;
  }
}

module.exports = new I18n();
