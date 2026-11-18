/**
 * ============================================================================
 * LambdaOS — Minimal Web OS Extensible via Embedded Lisp
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 2. VIRTUAL FILE SYSTEM (VFS) BACKED BY BACKEND API
// ----------------------------------------------------------------------------
class VirtualFileSystem {
  constructor() {
    this.files = {};
  }

  async load() {
    try {
      const res = await fetch('/api/files');
      const data = await res.json();
      return data.files;
    } catch (e) {
      console.error('VFS list failed', e);
      return [];
    }
  }

  async reset(notifyUser = true) {
    try {
      await fetch('/api/reset', { method: 'POST' });
      if (notifyUser && window.os) {
        window.os.notify('VFS Reset', 'Server-side VFS restored to factory defaults.');
      }
      location.reload();
    } catch (e) {
      console.error('VFS reset failed', e);
    }
  }

  normalizePath(path) {
    if (!path.startsWith('/')) path = '/' + path;
    return path.replace(/\/+/g, '/');
  }

  async read(path) {
    const p = this.normalizePath(path);
    try {
      const res = await fetch(`/api/files${p}`);
      if (!res.ok) throw new Error(`File not found: ${p}`);
      const data = await res.json();
      return data.content;
    } catch (e) {
      throw e;
    }
  }

  async write(path, content) {
    const p = this.normalizePath(path);
    try {
      await fetch(`/api/files${p}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      });
      window.dispatchEvent(new CustomEvent('vfs-changed', { detail: { path: p } }));
      return p;
    } catch (e) {
      console.error('VFS write failed', e);
      throw e;
    }
  }

  async rename(oldPath, newPath) {
    const oldP = this.normalizePath(oldPath);
    const newP = this.normalizePath(newPath);
    const content = await this.read(oldP);
    await this.write(newP, content);
    await this.delete(oldP);
    return newP;
  }

  async delete(path) {
    const p = this.normalizePath(path);
    try {
      await fetch(`/api/files${p}`, { method: 'DELETE' });
      window.dispatchEvent(new CustomEvent('vfs-changed', { detail: { path: p } }));
      return true;
    } catch (e) {
      console.error('VFS delete failed', e);
      return false;
    }
  }

  async list() {
    const res = await fetch('/api/files');
    const data = await res.json();
    return data.files.sort();
  }

  async snapshot() {
    const res = await fetch('/api/snapshot');
    const data = await res.json();
    return data.files;
  }

  async load(files) {
    if (!files) return;
    const res = await fetch('/api/snapshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ files })
    });
    return res.json();
  }
}

// ----------------------------------------------------------------------------
// 3. EMBEDDED LISP INTERPRETER (Tokenizer, Parser, Macros, Lexical Evaluator)
// ----------------------------------------------------------------------------
class LispSymbol {
  constructor(name) {
    this.name = name;
  }
  toString() {
    return this.name;
  }
}

const sym = (name) => new LispSymbol(name);
const isSym = (x, name = null) => x instanceof LispSymbol && (name === null || x.name === name);

class LispMacro {
  constructor(params, body, env) {
    this.params = params;
    this.body = body;
    this.env = env;
  }
}

class LispEnv {
  constructor(params = [], args = [], outer = null) {
    this.dict = Object.create(null);
    this.outer = outer;

    for (let i = 0; i < params.length; i++) {
      const p = params[i];
      if (isSym(p, '.') || isSym(p, '&')) {
        const restName = params[i + 1]?.name;
        if (restName) {
          this.dict[restName] = args.slice(i);
        }
        break;
      }
      if (p instanceof LispSymbol) {
        this.dict[p.name] = args[i] !== undefined ? args[i] : null;
      }
    }
  }

  find(varName) {
    if (varName in this.dict) return this;
    if (this.outer) return this.outer.find(varName);
    return null;
  }

  get(varName) {
    const env = this.find(varName);
    if (!env) throw new Error(`Unbound symbol: '${varName}'`);
    return env.dict[varName];
  }

  set(varName, value) {
    const env = this.find(varName);
    if (!env) throw new Error(`Cannot set! unbound symbol: '${varName}'`);
    env.dict[varName] = value;
    return value;
  }

  define(varName, value) {
    this.dict[varName] = value;
    return value;
  }
}

class LispInterpreter {
  constructor() {
    this.globalEnv = new LispEnv();
    this.installStdLib();
  }

  tokenize(source) {
    const tokens = [];
    let i = 0;
    while (i < source.length) {
      const ch = source[i];
      if (/\s/.test(ch)) { i++; continue; }
      if (ch === ';') { while (i < source.length && source[i] !== '\n') i++; continue; }
      if (ch === '(' || ch === ')' || ch === "'") { tokens.push(ch); i++; continue; }
      if (ch === '"') {
        let str = ''; i++;
        while (i < source.length && source[i] !== '"') {
          if (source[i] === '\\' && i + 1 < source.length) {
            const next = source[i + 1];
            if (next === 'n') str += '\n';
            else if (next === 't') str += '\t';
            else if (next === '"') str += '"';
            else if (next === '\\') str += '\\';
            else str += next;
            i += 2;
          } else { str += source[i++]; }
        }
        i++; tokens.push({ type: 'string', value: str });
        continue;
      }
      let atom = '';
      while (i < source.length && !/[\s();"]/.test(source[i])) { atom += source[i++]; }
      tokens.push(atom);
    }
    return tokens;
  }

  parseTokens(tokens) {
    if (tokens.length === 0) throw new Error('SyntaxError: Unexpected EOF');
    const token = tokens.shift();
    if (token === '(') {
      const list = [];
      while (tokens[0] !== ')') {
        if (tokens.length === 0) throw new Error('SyntaxError: Missing ")"');
        list.push(this.parseTokens(tokens));
      }
      tokens.shift(); return list;
    } else if (token === ')') {
      throw new Error('SyntaxError: Unexpected ")"');
    } else if (token === "'") {
      return [sym('quote'), this.parseTokens(tokens)];
    } else if (typeof token === 'object' && token.type === 'string') {
      return token.value;
    } else {
      return this.atom(token);
    }
  }

  atom(token) {
    if (token === '#t' || token === 'true') return true;
    if (token === '#f' || token === 'false') return false;
    if (token === 'nil' || token === 'null') return null;
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token)) return Number(token);
    return sym(token);
  }

  parseAll(source) {
    const tokens = this.tokenize(source);
    const exprs = [];
    while (tokens.length > 0) exprs.push(this.parseTokens(tokens));
    return exprs;
  }

  isTruthy(val) { return val !== false && val !== null && val !== undefined; }

  async _eval(x, env = this.globalEnv) {
    while (true) {
      if (x === null || typeof x === 'number' || typeof x === 'boolean' || typeof x === 'string') return x;
      if (x instanceof LispSymbol) return env.get(x.name);
      if (!Array.isArray(x)) return x;
      if (x.length === 0) return [];

      const [first, ...rest] = x;
      if (first instanceof LispSymbol) {
        switch (first.name) {
          case 'quote': return rest[0];
          case 'if': {
            const [test, conseq, alt] = rest;
            x = this.isTruthy(await this._eval(test, env)) ? conseq : (alt !== undefined ? alt : null);
            continue;
          }
          case 'and': {
            let result = true;
            for (const clause of rest) {
              result = await this._eval(clause, env);
              if (!this.isTruthy(result)) return result;
            }
            return result;
          }
          case 'or': {
            let result = false;
            for (const clause of rest) {
              result = await this._eval(clause, env);
              if (this.isTruthy(result)) return result;
            }
            return result;
          }
          case 'cond': {
            let matched = false;
            for (const clause of rest) {
              const [pred, ...body] = clause;
              if (isSym(pred, 'else') || this.isTruthy(await this._eval(pred, env))) {
                for (let i = 0; i < body.length - 1; i++) await this._eval(body[i], env);
                x = body[body.length - 1]; matched = true; break;
              }
            }
            if (!matched) return null;
            continue;
          }
          case 'define':
          case 'def': {
            const target = rest[0];
            if (Array.isArray(target)) {
              const [fnName, ...params] = target;
              return env.define(fnName.name, this.makeClosure(params, rest.slice(1), env));
            }
            return env.define(target.name, await this._eval(rest[1], env));
          }
          case 'defmacro': {
            const [macroName, params, ...body] = rest;
            return env.define(macroName.name, new LispMacro(params, body, env));
          }
          case 'set!': return env.set(rest[0].name, await this._eval(rest[1], env));
          case 'lambda':
          case 'fn': return this.makeClosure(rest[0], rest.slice(1), env);
          case 'let': {
            const [bindings, ...body] = rest;
            const letEnv = new LispEnv([], [], env);
            for (const pair of bindings) letEnv.define(pair[0].name, await this._eval(pair[1], letEnv));
            for (let i = 0; i < body.length - 1; i++) await this._eval(body[i], letEnv);
            x = body[body.length - 1]; env = letEnv; continue;
          }
          case 'begin':
          case 'do': {
            if (rest.length === 0) return null;
            for (let i = 0; i < rest.length - 1; i++) await this._eval(rest[i], env);
            x = rest[rest.length - 1]; continue;
          }
        }
      }

      const proc = await this._eval(first, env);
      if (proc instanceof LispMacro) {
        x = await this._eval(proc.body[proc.body.length - 1], new LispEnv(proc.params, rest, proc.env));
        continue;
      }
      const args = [];
      for (const arg of rest) args.push(await this._eval(arg, env));
      if (typeof proc === 'function') return await proc(...args);
      throw new Error(`TypeError: '${this.print(first)}' is not callable`);
    }
  }

  makeClosure(params, body, closureEnv) {
    const self = this;
    const fn = async function (...args) {
      const localEnv = new LispEnv(params, args, closureEnv);
      let result = null;
      for (let i = 0; i < body.length; i++) result = await self._eval(body[i], localEnv);
      return result;
    };
    fn.isLispClosure = true;
    return fn;
  }

  async evalString(source, env = this.globalEnv) {
    const exprs = this.parseAll(source);
    let result = null;
    for (const expr of exprs) result = await this._eval(expr, env);
    return result;
  }

  print(val) {
    if (val === null || val === undefined) return 'nil';
    if (val === true) return '#t';
    if (val === false) return '#f';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') return JSON.stringify(val);
    if (val instanceof LispSymbol) return val.name;
    if (Array.isArray(val)) return '(' + val.map((v) => this.print(v)).join(' ') + ')';
    if (typeof val === 'function') return val.isLispClosure ? '<lambda>' : '<native-fn>';
    return String(val);
  }

  installStdLib() {
    const g = this.globalEnv;
    g.define('+', (...args) => args.reduce((a, b) => a + b, 0));
    g.define('-', (a, ...rest) => (rest.length === 0 ? -a : rest.reduce((acc, v) => acc - v, a)));
    g.define('*', (...args) => args.reduce((a, b) => a * b, 1));
    g.define('/', (a, ...rest) => rest.length === 0 ? 1 / a : rest.reduce((acc, v) => acc / v, a));
    g.define('list', (...args) => args);
    g.define('car', (lst) => lst[0]);
    g.define('cdr', (lst) => lst.slice(1));
    g.define('str', (...args) => args.map(a => typeof a === 'string' ? a : this.print(a)).join(''));
    g.define('concat', (...args) => args.map(String).join(''));
    g.define('=', (a, b) => a === b);
    g.define('js-eval-math', (expr) => {
      try {
        const sanitized = String(expr).replace(/[^0-9+\-*/().%\s]/g, '');
        return sanitized ? Function(`"use strict"; return (${sanitized})`)() : '0';
      } catch { return 'Error'; }
    });
    g.define('hash', (...kv) => {
        const obj = {};
        for (let i = 0; i < kv.length; i += 2) obj[kv[i]] = kv[i+1];
        return obj;
    });
    g.define('<', (a, b) => a < b);
    g.define('<=', (a, b) => a <= b);
    g.define('>', (a, b) => a > b);
    g.define('>=', (a, b) => a >= b);

    g.define('map', async (fn, lst) => {
        const res = [];
        for (const item of lst) res.push(await fn(item));
        return res;
    });
    g.define('length', (seq) => (seq && typeof seq.length === 'number' ? seq.length : 0));
    g.define('slice', (s, start, end) => s.slice(start, end));
    g.define('filter', async (fn, lst) => {
        const res = [];
        for (const item of lst) {
            if (this.isTruthy(await fn(item))) res.push(item);
        }
        return res;
    });
    g.define('not', (a) => !this.isTruthy(a));
    g.define('append', (...lists) => lists.reduce((acc, l) => acc.concat(l), []));
    g.define('concat-str', (...args) => args.map(String).join(''));
  }
}

// ----------------------------------------------------------------------------
// 4. WINDOW MANAGER & DESKTOP ENVIRONMENT
// ----------------------------------------------------------------------------
class LambdaOS {
  constructor() {
    this.vfs = new VirtualFileSystem();
    this.lisp = new LispInterpreter();
    this.windows = new Map();
    this.zCounter = 100;
    this.winCounter = 0;
    this.activeWindowId = null;
    this.intervals = new Map();
    this.customIcons = [];
    this.topBarWidgets = new Map();

    this.installOSPrimitives();
    this.bindUIEvents();
    this.startSystemClock();
    this.renderDesktopIcons();
  }

  async boot() {
    await this.bootInitScript();
  }

  installOSPrimitives() {
    const g = this.lisp.globalEnv;
    g.define('create-window', (title, width, height, content) => this.createWindow({ title, width, height, content }));
    g.define('close-window', (winId) => { const e = this.windows.get(winId); if (e) { e.el.remove(); this.windows.delete(winId); } });
    g.define('print', (...args) => {
      const text = args.map(a => (typeof a === 'string' ? a : this.lisp.print(a))).join(' ');
      if (typeof this._outputSink === 'function') this._outputSink(text);
      return text;
    });
    g.define('lisp-run-console', async (title, code) => {
      const log = document.createElement('div');
      log.className = 'h-full selectable bg-[#05070c] text-emerald-300 font-mono text-[11px] p-3 whitespace-pre-wrap overflow-auto leading-relaxed';
      const append = (text, cls) => {
        const line = document.createElement('div');
        if (cls) line.className = cls;
        line.textContent = String(text);
        log.appendChild(line);
        log.scrollTop = log.scrollHeight;
      };
      this.createWindow({ title: title || 'Run Output', width: 460, height: 320, content: log });
      append('$ ' + (title || 'script'), 'text-slate-500');
      const prevSink = this._outputSink || null;
      this._outputSink = (t) => append(t, 'text-slate-200');
      const t0 = performance.now();
      try {
        const exprs = this.lisp.parseAll(String(code));
        for (const expr of exprs) {
          append('λ> ' + this.lisp.print(expr), 'text-slate-400');
          const res = await this.lisp._eval(expr, this.lisp.globalEnv);
          append('⇒ ' + this.lisp.print(res), 'text-emerald-300');
        }
        append('done in ' + Math.round(performance.now() - t0) + 'ms', 'text-slate-500');
      } catch (err) {
        append('✖ ' + (err && err.message ? err.message : String(err)), 'text-rose-400');
      } finally {
        this._outputSink = prevSink;
      }
      return null;
    });
    g.define('notify', (title, msg) => { this.notify(title, msg); return true; });
    g.define('add-desktop-icon', (label, iconChar, fn) => { this.addDesktopIcon(label, iconChar, fn); return true; });
    g.define('add-top-bar-widget', (id, fn) => { this.addTopBarWidget(id, fn); return true; });
    g.define('fs-read', async (path) => await this.vfs.read(path));
    g.define('fs-write', async (path, content) => await this.vfs.write(path, content));
    g.define('fs-list', async () => await this.vfs.list());
    g.define('fs-list-dir', async (dir) => {
      const files = await this.vfs.list();
      const clean = !dir || dir === '/' ? '' : dir.replace(/\/+$/g, '');
      const prefix = clean ? clean + '/' : '/';
      const map = new Map();
      for (const p of files) {
        if (!p.startsWith(prefix)) continue;
        const rest = p.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash === -1) {
          map.set(rest, [rest, rest === p ? prefix + rest : p, false]);
        } else {
          const name = rest.slice(0, slash);
          if (!map.has(name)) map.set(name, [name, clean ? clean + '/' + name : '/' + name, true]);
        }
      }
      const items = Array.from(map.values());
      items.sort((a, b) => (b[2] - a[2]) || a[0].localeCompare(b[0]));
      return items;
    });
    g.define('fs-parent-dir', (dir) => {
      if (!dir || dir === '/') return '/';
      const parts = dir.replace(/\/+$/g, '').split('/').filter(Boolean);
      parts.pop();
      return '/' + parts.join('/');
    });
    g.define('fs-delete', async (path) => await this.vfs.delete(path));
    g.define('fs-rename', async (oldPath, newPath) => await this.vfs.rename(oldPath, newPath));
    g.define('fs-copy', async (src, dst) => {
      const content = await this.vfs.read(src);
      await this.vfs.write(dst, content);
      return dst;
    });
    g.define('fs-join', (...parts) => {
      const segs = parts.map(String).join('/').split('/').filter(s => s.length > 0);
      return '/' + segs.join('/');
    });
    g.define('fs-basename', (p) => {
      const s = String(p).replace(/\/+$/g, '');
      const i = s.lastIndexOf('/');
      return s.slice(i + 1);
    });
    g.define('fs-dirname', (p) => {
      const s = String(p).replace(/\/+$/g, '');
      const i = s.lastIndexOf('/');
      return i <= 0 ? '/' : s.slice(0, i);
    });
    g.define('prompt', (msg, def = '') => window.prompt(String(msg), String(def)));
    g.define('confirm', (msg) => window.confirm(String(msg)));
    g.define('add-class', (el, cls) => { el.classList.add(String(cls)); return el; });
    g.define('remove-class', (el, cls) => { el.classList.remove(String(cls)); return el; });
    g.define('on-dblclick', (el, fn) => { el.addEventListener('dblclick', fn); return el; });

    g.define('fs-path-segments', (dir) => {
      const clean = String(dir || '/').replace(/^\/+|\/+$/g, '');
      const result = [['/', '/']];
      if (clean) {
        let acc = '';
        for (const p of clean.split('/').filter(Boolean)) {
          acc = acc + '/' + p;
          result.push([p, acc]);
        }
      }
      return result;
    });
    g.define('on-input', (el, fn) => { el.addEventListener('input', fn); return el; });
    g.define('str-includes?', (s, sub) => String(s).toLowerCase().includes(String(sub).toLowerCase()));
    g.define('set-class!', (el, cls) => { el.className = String(cls); return el; });

    g.define('event-ctrl?', (e) => !!(e && e.ctrlKey));
    g.define('event-meta?', (e) => !!(e && e.metaKey));
    g.define('fs-normalize-path', (p) => {
      let s = String(p || '/').trim();
      if (!s.startsWith('/')) s = '/' + s;
      s = s.replace(/\/{2,}/g, '/');
      if (s.length > 1) s = s.replace(/\/+$/g, '');
      return s || '/';
    });
    g.define('on-keydown', (el, fn) => { el.addEventListener('keydown', fn); return el; });
    g.define('event-key', (e) => (e && e.key) || '');
    g.define('event-shift?', (e) => !!(e && e.shiftKey));
    g.define('event-prevent!', (e) => { if (e && e.preventDefault) e.preventDefault(); return true; });
    g.define('snapshot-vfs', async () => {
      const files = await this.vfs.snapshot();
      return files;
    });
    g.define('load-vfs', async (files) => {
      await this.vfs.load(files);
    });
    g.define('eval-file', async (path) => await this.lisp.evalString(await this.vfs.read(path)));
    g.define('hash-get', (obj, key) => (obj && typeof obj === 'object' ? obj[key] : undefined));
    g.define('eval-str-catch', async (code) => {
      try {
        return { ok: true, value: await this.lisp.evalString(String(code)) };
      } catch (e) {
        return { ok: false, error: (e && e.message) ? e.message : String(e) };
      }
    });
    g.define('eval-str', async (code) => await this.lisp.evalString(String(code)));
    
    // File Transfer Primitives
    g.define('fs-download', async (path) => {
      const content = await this.vfs.read(path);
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop();
      a.click();
      URL.revokeObjectURL(url);
    });

    g.define('fs-upload-dialog', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = async (event) => {
          const content = event.target.result;
          const path = '/uploads/' + file.name;
          await this.vfs.write(path, content);
          this.notify('File Uploaded', `Saved to ${path}`);
        };
        reader.readAsText(file);
      };
      input.click();
    });

    g.define('el', (tag, attrs, ...children) => {
      const node = document.createElement(tag);
      if (attrs) for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') node.className = v; else node.setAttribute(k, v);
      }
      children.flat().forEach(c => node.appendChild(c instanceof HTMLElement ? c : document.createTextNode(String(c))));
      return node;
    });
    g.define('el-value', (el) => el.value);
    g.define('on-click', (el, fn) => { el.addEventListener('click', fn); return el; });
    g.define('set-text!', (el, txt) => { el.textContent = String(txt); return el; });
    g.define('set-html!', (el, html) => { el.innerHTML = String(html); return el; });
    g.define('get-val', (el) => (el && 'value' in el ? el.value : ''));
    g.define('set-val!', (el, val) => { if (el && 'value' in el) el.value = String(val); return el; });
    g.define('append-child!', (parent, child) => { parent.appendChild(child instanceof HTMLElement ? child : document.createTextNode(String(child))); return parent; });
  }

  addDesktopIcon(label, iconChar, fn) {
    this.customIcons.push({ label, iconChar, fn });
    this.renderDesktopIcons();
  }

  async renderDesktopIcons() {
    const container = document.getElementById('desktop-icons');
    container.innerHTML = '';
    const items = [
      { label: 'Upload File', iconChar: '⇡', color: 'text-os-amber', action: () => this.lisp.globalEnv.get('fs-upload-dialog')() },
      { label: 'Backup VFS', iconChar: '💾', color: 'text-emerald-400', action: () => this.downloadSnapshot() },
      { label: 'Restore VFS', iconChar: '📂', color: 'text-rose-400', action: () => this.uploadSnapshot() },
      ...this.customIcons.map(i => ({ ...i, color: 'text-sky-300', action: () => {
        try { return Promise.resolve(i.fn()).catch(err => this.notify('Error', err.message)); } catch (err) { this.notify('Error', err.message); }
      } }))
    ];
    const seen = new Set();
    const uniqueItems = items.filter(i => {
      if (seen.has(i.label)) return false;
      seen.add(i.label);
      return true;
    });
    for (const item of uniqueItems) {
      const btn = document.createElement('button');
      btn.className = 'desktop-icon flex flex-col items-center w-20 h-20 p-2 hover:bg-white/10 rounded-xl transition cursor-pointer';
      btn.innerHTML = `<div class="w-10 h-10 bg-[#131826] border border-os-border flex items-center justify-center font-mono text-base font-bold ${item.color} rounded-xl mb-1.5">${item.iconChar}</div>
                       <span class="text-[11px] text-slate-200 truncate w-full">${item.label}</span>`;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const wasSelected = btn.classList.contains('desktop-icon-selected');
        container.querySelectorAll('.desktop-icon-selected').forEach(el => el.classList.remove('desktop-icon-selected'));
        if (!wasSelected) btn.classList.add('desktop-icon-selected');
      });
      btn.addEventListener('dblclick', item.action);
      container.appendChild(btn);
    }
  }

  addTopBarWidget(id, fn) {
    const badge = document.createElement('div');
    badge.className = 'px-2 py-1 rounded-md bg-purple-500/15 border border-purple-500/30 font-mono text-[11px] text-purple-300';
    document.getElementById('custom-topbar-widgets').appendChild(badge);
    const refresh = async () => { try { badge.textContent = String(await fn()); } catch { badge.textContent = '!err'; } };
    setInterval(refresh, 1000); refresh();
  }

  createWindow({ title, width = 400, height = 300, content = '' }) {
    const winId = `win-${++this.winCounter}`;
    const winEl = document.createElement('div');
    winEl.className = 'os-window pointer-events-auto';
    winEl.style.width = `${width}px`; winEl.style.height = `${height}px`;
    winEl.style.left = '100px'; winEl.style.top = '100px';
    winEl.style.zIndex = ++this.zCounter;
    winEl.innerHTML = `<div class="win-titlebar h-9 px-3 bg-[#141926] border-b border-os-border flex items-center justify-between cursor-move shrink-0">
                        <span class="text-xs font-medium text-slate-200">${title}</span>
                        <button class="win-close px-2 text-os-muted hover:text-white">✕</button>
                      </div>
                      <div class="win-body flex-1 overflow-auto relative p-2"></div>`;
    winEl.querySelector('.win-close').addEventListener('click', () => { winEl.remove(); this.windows.delete(winId); });
    const body = winEl.querySelector('.win-body');
    if (content instanceof HTMLElement) body.appendChild(content); else body.innerHTML = content;
    document.getElementById('window-layer').appendChild(winEl);
    this.windows.set(winId, { el: winEl });
    this.makeDraggable(winEl, winEl.querySelector('.win-titlebar'));
    return winId;
  }

  makeDraggable(win, handle) {
    let dragging = false, startX = 0, startY = 0, origX = 0, origY = 0;
    const move = (e) => {
      if (!dragging) return;
      win.style.left = `${origX + (e.clientX - startX)}px`;
      win.style.top = `${origY + (e.clientY - startY)}px`;
    };
    const up = () => {
      dragging = false;
      window.removeEventListener('mousemove', move);
      window.removeEventListener('mouseup', up);
    };
    handle.addEventListener('mousedown', (e) => {
      if (e.button !== 0 || e.target.closest('.win-close')) return;
      dragging = true; startX = e.clientX; startY = e.clientY;
      origX = win.offsetLeft; origY = win.offsetTop;
      win.style.zIndex = ++this.zCounter;
      e.preventDefault();
      window.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    });
  }

  notify(title, message) {
    const toast = document.createElement('div');
    toast.className = 'toast-enter pointer-events-auto border border-os-accent/50 bg-[#121724]/95 backdrop-blur-md rounded-xl p-3 shadow-2xl mb-2';
    toast.innerHTML = `<div class="text-xs font-semibold text-os-accent">${title}</div><p class="text-[11px] text-slate-300">${message}</p>`;
    document.getElementById('toast-container').appendChild(toast);
    setTimeout(() => toast.remove(), 4000);
  }

  async openReplApp() {
    const root = document.createElement('div');
    root.className = 'flex flex-col h-full bg-[#0b0e16] font-mono text-xs';
    root.innerHTML = `<div id="repl-history" class="flex-1 overflow-y-auto p-3 space-y-1 selectable"></div>
                      <div class="p-2 bg-[#101420] border-t border-os-border flex gap-2">
                        <span class="text-os-accent font-bold">λ&gt;</span>
                        <input id="repl-input" class="flex-1 bg-transparent text-white focus:outline-none" autocomplete="off"/>
                      </div>`;
    this.createWindow({ title: 'Lisp REPL', width: 500, height: 350, content: root });
    const hist = root.querySelector('#repl-history'), inp = root.querySelector('#repl-input');
    inp.onkeydown = async (e) => {
      if (e.key === 'Enter') {
        const code = inp.value; inp.value = '';
        hist.innerHTML += `<div class="text-slate-400">λ&gt; ${code}</div>`;
        try {
          const res = await this.lisp.evalString(code);
          hist.innerHTML += `<div class="text-emerald-300">⇒ ${this.lisp.print(res)}</div>`;
        } catch (err) { hist.innerHTML += `<div class="text-rose-400">✖ ${err.message}</div>`; }
        hist.scrollTop = hist.scrollHeight;
      }
    };
  }

  openFileManager(mode = 'open', currentPath = '') {
    return new Promise(async (resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm';
      overlay.innerHTML = `
        <div class="bg-[#131826] border border-os-border rounded-2xl shadow-2xl w-full max-w-lg h-96 flex flex-col">
          <div class="p-2 border-b border-os-border flex justify-between items-center">
            <span class="font-mono text-xs uppercase text-os-muted">${mode === 'save' ? 'Save File' : 'Open File'}</span>
            <button class="fm-close px-2 text-slate-400 hover:text-white">✕</button>
          </div>
          ${mode === 'save' ? `<div class="p-2 border-b border-os-border"><input id="fm-path" class="w-full bg-black/40 border border-os-border rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-os-accent" value="${currentPath}" /></div>` : ''}
          <div id="fm-list" class="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-[11px]"></div>
          <div class="p-2 border-t border-os-border flex justify-end gap-2">
            <button class="fm-cancel px-3 py-1 rounded bg-white/10 text-white text-xs">Cancel</button>
            ${mode === 'save' ? `<button id="fm-save" class="px-3 py-1 rounded bg-os-mint text-slate-950 text-xs font-bold">Save</button>` : ''}
          </div>
        </div>`;
      document.body.appendChild(overlay);

      const finish = (p) => { overlay.remove(); resolve(p); };
      overlay.querySelector('.fm-close').onclick = () => finish(null);
      overlay.querySelector('.fm-cancel').onclick = () => finish(null);
      overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(null); });

      const listEl = overlay.querySelector('#fm-list');
      const files = await this.vfs.list();
      for (const f of files) {
        const btn = document.createElement('button');
        btn.className = 'w-full text-left px-2 py-1 rounded truncate hover:bg-white/5 text-slate-300';
        btn.textContent = f;
        btn.onclick = () => {
          if (mode === 'save') {
            overlay.querySelector('#fm-path').value = f;
          } else {
            finish(f);
          }
        };
        listEl.appendChild(btn);
      }

      if (mode === 'save') {
        overlay.querySelector('#fm-save').onclick = () => {
          const p = overlay.querySelector('#fm-path').value.trim();
          finish(p || null);
        };
      }
    });
  }

  async openEditorApp(path = '/init.lisp') {
    const root = document.createElement('div');
    root.className = 'flex h-full bg-[#0c1019]';
    root.innerHTML = `<div class="w-44 bg-[#101521] border-r border-os-border flex flex-col shrink-0">
                        <div class="p-2 border-b border-os-border flex items-center justify-between">
                          <span class="font-mono text-[10px] uppercase text-os-muted">Files</span>
                          <button id="ed-new" class="px-2 py-0.5 text-[10px] rounded bg-os-accent/20 text-os-accent">+ New</button>
                        </div>
                        <div id="ed-file-list" class="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-[11px]"></div>
                      </div>
                      <div class="flex-1 flex flex-col min-w-0">
                        <div class="p-2 border-b border-os-border flex justify-between bg-[#131826] gap-2">
                          <span id="ed-path" class="text-os-accent font-mono text-xs truncate">${path}</span>
                          <div class="flex gap-2">
                            <button id="ed-load" class="px-2 py-1 bg-white/10 text-white text-xs rounded">Load</button>
                            <button id="ed-save" class="px-3 py-1 bg-os-mint text-slate-950 text-xs font-bold rounded">Save</button>
                            <button id="ed-run" class="px-2 py-1 bg-os-accent/20 text-os-accent text-xs font-semibold rounded">Run</button>
                            <button id="ed-dl" class="px-2 py-1 bg-white/10 text-white text-xs rounded">Download</button>
                            <button id="ed-rename" class="px-2 py-1 bg-white/10 text-white text-xs rounded">Rename</button>
                          </div>
                        </div>
                        <textarea id="ed-area" class="flex-1 bg-transparent text-slate-100 p-2 font-mono text-xs focus:outline-none resize-none"></textarea>
                      </div>`;
    this.createWindow({ title: 'Editor', width: 680, height: 440, content: root });

    const fileList = root.querySelector('#ed-file-list');
    const pathLabel = root.querySelector('#ed-path');
    const area = root.querySelector('#ed-area');

    const renderList = async () => {
      fileList.innerHTML = '';
      const paths = await this.vfs.list();
      for (const p of paths) {
        const btn = document.createElement('button');
        btn.className = 'w-full text-left px-2 py-1 rounded truncate bg-white/5 hover:bg-white/10 text-slate-300';
        btn.textContent = p;
        btn.onclick = () => loadPath(p);
        fileList.appendChild(btn);
      }
    };

    const loadPath = async (p) => {
      try {
        path = p;
        pathLabel.textContent = p;
        area.value = await this.vfs.read(p);
        await renderList();
      } catch (e) {
        this.notify('Error', e.message);
      }
    };

    root.querySelector('#ed-new').onclick = async () => {
      const name = prompt('New file path (e.g. /apps/my.lisp)');
      if (!name) return;
      const p = name.startsWith('/') ? name : '/' + name;
      await this.vfs.write(p, '; new file\n');
      await loadPath(p);
    };

    root.querySelector('#ed-rename').onclick = async () => {
      const newName = prompt('Rename to:', path);
      if (!newName || newName === path) return;
      try {
        const newPath = await this.vfs.rename(path, newName);
        await loadPath(newPath);
        this.notify('Success', `Renamed to ${newPath}`);
      } catch (e) {
        this.notify('Error', e.message);
      }
    };

    root.querySelector('#ed-load').onclick = async () => {
      const p = await this.openFileManager('open', path);
      if (p) await loadPath(p);
    };

    root.querySelector('#ed-save').onclick = async () => {
      const p = await this.openFileManager('save', path);
      if (!p) return;
      path = p;
      pathLabel.textContent = p;
      await this.vfs.write(p, area.value);
      this.notify('Success', `Saved ${p}`);
      await renderList();
    };

    root.querySelector('#ed-run').onclick = async () => {
      try {
        await this.lisp.evalString(area.value);
        this.notify('Run', 'Code executed.');
      } catch (e) {
        this.notify('Error', e.message);
      }
    };

    root.querySelector('#ed-dl').onclick = () => {
      const blob = new Blob([area.value], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = path.split('/').pop() || 'file.lisp';
      a.click();
      URL.revokeObjectURL(url);
    };

    await loadPath(path);
  }

  async runVfsScript(path) {
    try { await this.lisp.evalString(await this.vfs.read(path)); }
    catch(e) { this.notify('Script Error', e.message); }
  }

  async snapshotVfs() {
    const files = await this.vfs.snapshot();
    return files;
  }

  async loadVfsSnapshot(files) {
    await this.vfs.load(files);
    location.reload();
  }

  downloadSnapshot() {
    this.vfs.snapshot().then(files => {
      const blob = new Blob([JSON.stringify({ files }, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'lambda_os_snapshot.json';
      a.click();
      URL.revokeObjectURL(url);
      this.notify('Snapshot', 'VFS snapshot downloaded.');
    }).catch(e => this.notify('Error', e.message));
  }

  uploadSnapshot() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const data = JSON.parse(event.target.result);
          if (!data.files) throw new Error('Invalid snapshot format');
          await this.loadVfsSnapshot(data.files);
          this.notify('Snapshot', 'VFS restored from snapshot.');
        } catch (err) {
          this.notify('Snapshot Error', err.message);
        }
      };
      reader.readAsText(file);
    };
    input.click();
  }

  async bootInitScript() {
    try { await this.lisp.evalString(await this.vfs.read('/init.lisp')); }
    catch(e) { this.notify('Boot Error', e.message); }
  }

  bindUIEvents() {
    const menu = document.getElementById('launcher-menu');
    document.getElementById('launcher-btn').onclick = (e) => {
      e.stopPropagation();
      menu.classList.toggle('hidden');
    };
    document.addEventListener('click', (e) => {
      if (!e.target.closest || !e.target.closest('.desktop-icon')) {
        document.querySelectorAll('.desktop-icon-selected').forEach(el => el.classList.remove('desktop-icon-selected'));
      }
    });
    document.addEventListener('click', (e) => {
      if (!menu.contains(e.target) && e.target.id !== 'launcher-btn') {
        menu.classList.add('hidden');
      }
    });

    document.querySelectorAll('[data-launch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        menu.classList.add('hidden');
        const app = btn.dataset.launch;
        if (app === 'repl') this.openReplApp();
        if (app === 'editor') this.openEditorApp('/init.lisp');
      });
    });

    document.querySelectorAll('[data-run-script]').forEach((btn) => {
      btn.addEventListener('click', () => {
        menu.classList.add('hidden');
        this.runVfsScript(btn.dataset.runScript);
      });
    });

    const rebootBtn = document.getElementById('reboot-os-btn');
    if (rebootBtn) {
      rebootBtn.addEventListener('click', () => {
        menu.classList.add('hidden');
        this.bootInitScript();
      });
    }

    const resetBtn = document.getElementById('reset-os-btn');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        menu.classList.add('hidden');
        this.confirmAction('Reset VFS', 'Overwrite all VFS files with factory defaults?', () => this.vfs.reset());
      });
    }
  }

  confirmAction(title, body, onConfirm) {
    const backdrop = document.getElementById('os-modal-backdrop');
    document.getElementById('os-modal-title').textContent = title;
    document.getElementById('os-modal-body').textContent = body;
    backdrop.classList.remove('hidden');

    const cancelBtn = document.getElementById('os-modal-cancel');
    const confirmBtn = document.getElementById('os-modal-confirm');
    const cleanup = () => {
      backdrop.classList.add('hidden');
      cancelBtn.replaceWith(cancelBtn.cloneNode(true));
      confirmBtn.replaceWith(confirmBtn.cloneNode(true));
    };
    document.getElementById('os-modal-cancel').addEventListener('click', cleanup);
    document.getElementById('os-modal-confirm').addEventListener('click', () => {
      cleanup();
      onConfirm();
    });
  }

  startSystemClock() {
    const clock = document.getElementById('system-clock');
    setInterval(() => clock.textContent = new Date().toLocaleTimeString([], { hour12: false }), 1000);
  }
}

window.addEventListener('load', async () => {
  window.os = new LambdaOS();
  await window.os.boot();
});
