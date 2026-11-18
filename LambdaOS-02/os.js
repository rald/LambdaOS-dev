/**
 * ============================================================================
 * LambdaOS — Minimal Web OS Extensible via Embedded Lisp
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. DEFAULT VIRTUAL FILE SYSTEM (VFS) FILES
// ----------------------------------------------------------------------------
const DEFAULT_VFS = {
  '/init.lisp': `; /init.lisp — Executed automatically when LambdaOS boots!
; Customize your desktop environment, add widgets, or launch apps here.

(notify "λOS Booted" "init.lisp loaded successfully. Try editing /init.lisp!")

; Register a custom desktop shortcut created purely from Lisp
(add-desktop-icon "Calc.lisp" "🧮"
  (fn () (eval-file "/apps/calculator.lisp")))

; Add a live Lisp-powered status badge to the top bar
(let ((ticks 0))
  (add-top-bar-widget "lisp-uptime"
    (fn ()
      (set! ticks (+ ticks 1))
      (str "λ:" ticks "s"))))
`,

  '/apps/calculator.lisp': `; /apps/calculator.lisp — GUI Calculator built 100% in Lisp!
(let ((expr "")
      (display (el "div"
                   (hash "class" "w-full bg-black/60 border border-slate-700 rounded-lg p-3 text-right font-mono text-xl text-sky-300 overflow-x-auto mb-3 min-h-[48px]")
                   "0")))

  (define update-display
    (fn (val)
      (set! expr val)
      (set-text! display (if (= expr "") "0" expr))))

  (define press-key
    (fn (ch)
      (cond
        ((= ch "C") (update-display ""))
        ((= ch "⌫") (update-display (slice expr 0 (- (length expr) 1))))
        ((= ch "=")
         (let ((res (js-eval-math expr)))
           (update-display (str res))))
        (#t (update-display (concat expr ch))))))

  (define make-btn
    (fn (label accent)
      (let ((cls (if accent
                     "p-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/35 text-sky-300 border border-sky-500/30 font-mono font-semibold text-sm transition cursor-pointer"
                     "p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-sm transition cursor-pointer")))
        (let ((btn (el "button" (hash "class" cls) label)))
          (on-click btn (fn () (press-key label)))
          btn))))

  (let ((keys (list "C" "(" ")" "/"
                    "7" "8" "9" "*"
                    "4" "5" "6" "-"
                    "1" "2" "3" "+"
                    "0" "." "⌫" "="))
        (grid (el "div" (hash "class" "grid grid-cols-4 gap-2"))))

    (map (fn (k)
           (let ((is-op (or (= k "=") (= k "C") (= k "/") (= k "*") (= k "-") (= k "+"))))
             (append-child! grid (make-btn k is-op))))
         keys)

    (let ((root (el "div" (hash "class" "p-4 flex flex-col h-full bg-slate-900/60")
                    display
                    grid)))
      (create-window "Lisp Calculator" 280 370 root))))
`,

  '/apps/todo.lisp': `; /apps/todo.lisp — Persistent To-Do List App built in Lisp
(let ((items (list "Explore the Lisp REPL" "Edit /init.lisp" "Build a custom OS widget"))
      (list-box (el "div" (hash "class" "flex-1 overflow-y-auto space-y-1.5 pr-1")))
      (input (el "input" (hash "type" "text"
                               "placeholder" "Add a new task..."
                               "class" "flex-1 bg-black/50 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400"))))

  (define render-todos
    (fn ()
      (set-html! list-box "")
      (map (fn (item)
             (let ((row (el "div" (hash "class" "flex items-center justify-between bg-slate-800/70 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200")))
                   (lbl (el "span" (hash "class" "truncate pr-2") item))
                   (del (el "button" (hash "class" "text-rose-400 hover:text-rose-300 font-mono px-1.5 cursor-pointer") "✕")))
               (on-click del (fn ()
                               (set! items (filter (fn (x) (not (= x item))) items))
                               (render-todos)))
               (append-child! row lbl)
               (append-child! row del)
               (append-child! list-box row)))
           items)))

  (define add-todo
    (fn ()
      (let ((txt (get-val input)))
        (if (not (= txt ""))
            (begin
              (set! items (append items (list txt)))
              (set-val! input "")
              (render-todos))
            nil))))

  (let ((add-btn (el "button" (hash "class" "px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium cursor-pointer") "Add")))
    (on-click add-btn add-todo)
    (render-todos)
    (let ((root (el "div" (hash "class" "p-4 flex flex-col h-full gap-3")
                    (el "div" (hash "class" "flex gap-2") input add-btn)
                    list-box)))
      (create-window "Lisp To-Do List" 330 360 root))))
`,

  '/apps/clock-theme.lisp': `; /apps/clock-theme.lisp — Live Wallpaper & Theme Customizer
(let ((themes
       (list
         (list "Cyber Grid (Default)"
               "radial-gradient(circle at 18% 22%, rgba(56, 189, 248, 0.12) 0%, transparent 42%), radial-gradient(circle at 82% 78%, rgba(168, 85, 247, 0.10) 0%, transparent 45%), #090b10")
         (list "Plan 9 Rio Teal"
               "linear-gradient(135deg, #0d2b2e 0%, #09191f 50%, #061014 100%)")
         (list "Solar Flare Dusk"
               "radial-gradient(circle at 80% 20%, rgba(251, 113, 133, 0.18), transparent 45%), radial-gradient(circle at 20% 80%, rgba(251, 191, 36, 0.12), transparent 50%), #0d0a12")
         (list "Emerald Matrix"
               "radial-gradient(circle at 50% 50%, rgba(16, 185, 129, 0.14), transparent 65%), #050a08")))
      (container (el "div" (hash "class" "p-4 flex flex-col gap-2.5"))))

  (append-child! container
    (el "p" (hash "class" "text-xs text-slate-400 mb-1")
        "Click a preset below to dynamically update the desktop wallpaper via (set-wallpaper ...):"))

  (map (fn (pair)
         (let ((name (car pair))
               (bg (car (cdr pair)))
               (btn (el "button"
                        (hash "class" "w-full text-left px-3 py-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/90 border border-slate-700 text-xs text-slate-100 flex items-center justify-between transition cursor-pointer")
                        (el "span" (hash) name)
                        (el "span" (hash "class" "text-[10px] font-mono text-sky-400") "Apply →"))))
           (on-click btn (fn ()
                           (set-wallpaper bg)
                           (notify "Theme Updated" (concat "Applied: " name))))
           (append-child! container btn)))
       themes)

  (create-window "Wallpaper & Theme Switcher" 340 310 container))
`,

  '/notes/welcome.txt': `Welcome to LambdaOS!
Everything on this desktop can be inspected, modified, or created at runtime using Lisp.
Open the VFS Code Editor to inspect /init.lisp or any file inside /apps/.`
};

// ----------------------------------------------------------------------------
// 2. VIRTUAL FILE SYSTEM (VFS) BACKED BY LOCALSTORAGE
// ----------------------------------------------------------------------------
const VFS_STORAGE_KEY = 'lambda_os_vfs_v1';

class VirtualFileSystem {
  constructor() {
    this.files = {};
    this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(VFS_STORAGE_KEY);
      if (raw) {
        this.files = JSON.parse(raw);
      } else {
        this.reset(false);
      }
    } catch (e) {
      console.warn('VFS load failed, using defaults', e);
      this.files = { ...DEFAULT_VFS };
    }
  }

  save() {
    try {
      localStorage.setItem(VFS_STORAGE_KEY, JSON.stringify(this.files));
    } catch (e) {
      console.error('VFS save failed', e);
    }
  }

  reset(notifyUser = true) {
    this.files = { ...DEFAULT_VFS };
    this.save();
    if (notifyUser && window.os) {
      window.os.notify('VFS Reset', 'Virtual file system restored to factory defaults.');
    }
  }

  normalizePath(path) {
    if (!path.startsWith('/')) path = '/' + path;
    return path.replace(/\/+/g, '/');
  }

  read(path) {
    const p = this.normalizePath(path);
    if (!(p in this.files)) {
      throw new Error(`File not found: ${p}`);
    }
    return this.files[p];
  }

  write(path, content) {
    const p = this.normalizePath(path);
    this.files[p] = String(content);
    this.save();
    window.dispatchEvent(new CustomEvent('vfs-changed', { detail: { path: p } }));
    return p;
  }

  delete(path) {
    const p = this.normalizePath(path);
    if (p in this.files) {
      delete this.files[p];
      this.save();
      window.dispatchEvent(new CustomEvent('vfs-changed', { detail: { path: p } }));
      return true;
    }
    return false;
  }

  list() {
    return Object.keys(this.files).sort();
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

    // Support variadic parameters: (a b . rest) or (& rest)
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
      // Whitespace
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      // Comments starting with ;
      if (ch === ';') {
        while (i < source.length && source[i] !== '\n') i++;
        continue;
      }
      // Parens & quote sugar
      if (ch === '(' || ch === ')' || ch === "'") {
        tokens.push(ch);
        i++;
        continue;
      }
      // String literals
      if (ch === '"') {
        let str = '';
        i++; // skip opening quote
        while (i < source.length && source[i] !== '"') {
          if (source[i] === '\\' && i + 1 < source.length) {
            const next = source[i + 1];
            if (next === 'n') str += '\n';
            else if (next === 't') str += '\t';
            else if (next === '"') str += '"';
            else if (next === '\\') str += '\\';
            else str += next;
            i += 2;
          } else {
            str += source[i++];
          }
        }
        if (source[i] !== '"') throw new Error('SyntaxError: Unterminated string literal');
        i++; // skip closing quote
        tokens.push({ type: 'string', value: str });
        continue;
      }
      // Atoms (numbers, booleans, symbols)
      let atom = '';
      while (i < source.length && !/[\s();"]/.test(source[i])) {
        atom += source[i++];
      }
      tokens.push(atom);
    }
    return tokens;
  }

  parseTokens(tokens) {
    if (tokens.length === 0) {
      throw new Error('SyntaxError: Unexpected EOF while reading');
    }
    const token = tokens.shift();
    if (token === '(') {
      const list = [];
      while (tokens[0] !== ')') {
        if (tokens.length === 0) {
          throw new Error('SyntaxError: Missing closing parenthesis ")"');
        }
        list.push(this.parseTokens(tokens));
      }
      tokens.shift(); // pop ')'
      return list;
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
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(token)) {
      return Number(token);
    }
    return sym(token);
  }

  parseAll(source) {
    const tokens = this.tokenize(source);
    const exprs = [];
    while (tokens.length > 0) {
      exprs.push(this.parseTokens(tokens));
    }
    return exprs;
  }

  isTruthy(val) {
    return val !== false && val !== null && val !== undefined;
  }

  eval(x, env = this.globalEnv) {
    while (true) {
      // Self-evaluating primitives
      if (x === null || typeof x === 'number' || typeof x === 'boolean' || typeof x === 'string') {
        return x;
      }
      // Symbol lookup
      if (x instanceof LispSymbol) {
        return env.get(x.name);
      }
      // Non-array JS objects (DOM nodes, hashes, functions)
      if (!Array.isArray(x)) {
        return x;
      }
      // Empty list evaluates to empty list
      if (x.length === 0) {
        return [];
      }

      const [first, ...rest] = x;

      // Special Forms
      if (first instanceof LispSymbol) {
        switch (first.name) {
          case 'quote':
            return rest[0];

          case 'if': {
            const [test, conseq, alt] = rest;
            x = this.isTruthy(this.eval(test, env)) ? conseq : (alt !== undefined ? alt : null);
            continue; // Tail-call optimization
          }

          case 'cond': {
            let matched = false;
            for (const clause of rest) {
              if (!Array.isArray(clause) || clause.length < 2) {
                throw new Error('SyntaxError: Invalid cond clause');
              }
              const [pred, ...body] = clause;
              if (isSym(pred, 'else') || this.isTruthy(this.eval(pred, env))) {
                for (let i = 0; i < body.length - 1; i++) {
                  this.eval(body[i], env);
                }
                x = body[body.length - 1];
                matched = true;
                break;
              }
            }
            if (!matched) return null;
            continue;
          }

          case 'define':
          case 'def': {
            const target = rest[0];
            // Function shorthand: (define (add a b) (+ a b))
            if (Array.isArray(target)) {
              const [fnName, ...params] = target;
              const body = rest.slice(1);
              const fn = this.makeClosure(params, body, env);
              return env.define(fnName.name, fn);
            }
            const val = this.eval(rest[1], env);
            return env.define(target.name, val);
          }

          case 'defmacro': {
            const [macroName, params, ...body] = rest;
            const macro = new LispMacro(params, body, env);
            return env.define(macroName.name, macro);
          }

          case 'set!': {
            const [symNode, valExpr] = rest;
            const val = this.eval(valExpr, env);
            return env.set(symNode.name, val);
          }

          case 'lambda':
          case 'fn': {
            const [params, ...body] = rest;
            return this.makeClosure(params, body, env);
          }

          case 'let': {
            const [bindings, ...body] = rest;
            const letEnv = new LispEnv([], [], env);
            for (const pair of bindings) {
              if (!Array.isArray(pair) || pair.length !== 2) {
                throw new Error('SyntaxError: Invalid let binding');
              }
              letEnv.define(pair[0].name, this.eval(pair[1], letEnv));
            }
            for (let i = 0; i < body.length - 1; i++) {
              this.eval(body[i], letEnv);
            }
            x = body[body.length - 1];
            env = letEnv;
            continue;
          }

          case 'begin':
          case 'do': {
            if (rest.length === 0) return null;
            for (let i = 0; i < rest.length - 1; i++) {
              this.eval(rest[i], env);
            }
            x = rest[rest.length - 1];
            continue;
          }

          case 'and': {
            if (rest.length === 0) return true;
            for (let i = 0; i < rest.length - 1; i++) {
              const res = this.eval(rest[i], env);
              if (!this.isTruthy(res)) return false;
            }
            x = rest[rest.length - 1];
            continue;
          }

          case 'or': {
            if (rest.length === 0) return false;
            for (let i = 0; i < rest.length - 1; i++) {
              const res = this.eval(rest[i], env);
              if (this.isTruthy(res)) return res;
            }
            x = rest[rest.length - 1];
            continue;
          }
        }
      }

      // Procedure or Macro Invocation
      const proc = this.eval(first, env);

      // Macro expansion
      if (proc instanceof LispMacro) {
        const macroEnv = new LispEnv(proc.params, rest, proc.env);
        let expanded = null;
        for (const expr of proc.body) {
          expanded = this.eval(expr, macroEnv);
        }
        x = expanded;
        continue;
      }

      const args = rest.map((arg) => this.eval(arg, env));
      if (typeof proc === 'function') {
        return proc(...args);
      }
      throw new Error(`TypeError: '${this.print(first)}' is not a callable function`);
    }
  }

  makeClosure(params, body, closureEnv) {
    const self = this;
    const fn = function (...args) {
      const localEnv = new LispEnv(params, args, closureEnv);
      let result = null;
      for (let i = 0; i < body.length; i++) {
        result = self.eval(body[i], localEnv);
      }
      return result;
    };
    fn.isLispClosure = true;
    return fn;
  }

  evalString(source, env = this.globalEnv) {
    const exprs = this.parseAll(source);
    let result = null;
    for (const expr of exprs) {
      result = this.eval(expr, env);
    }
    return result;
  }

  print(val) {
    if (val === null) return 'nil';
    if (val === undefined) return 'nil';
    if (val === true) return '#t';
    if (val === false) return '#f';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'string') return JSON.stringify(val);
    if (val instanceof LispSymbol) return val.name;
    if (val instanceof LispMacro) return '<macro>';
    if (typeof val === 'function') return val.isLispClosure ? '<lambda>' : '<native-fn>';
    if (val instanceof HTMLElement) return `<dom:${val.tagName.toLowerCase()}>`;
    if (Array.isArray(val)) {
      return '(' + val.map((v) => this.print(v)).join(' ') + ')';
    }
    if (typeof val === 'object') {
      const entries = Object.entries(val).map(([k, v]) => `${JSON.stringify(k)} ${this.print(v)}`);
      return `(hash ${entries.join(' ')})`;
    }
    return String(val);
  }

  installStdLib() {
    const g = this.globalEnv;

    // Arithmetic
    g.define('+', (...args) => args.reduce((a, b) => a + b, 0));
    g.define('-', (a, ...rest) => (rest.length === 0 ? -a : rest.reduce((acc, v) => acc - v, a)));
    g.define('*', (...args) => args.reduce((a, b) => a * b, 1));
    g.define('/', (a, ...rest) => {
      if (rest.length === 0) return 1 / a;
      return rest.reduce((acc, v) => {
        if (v === 0) throw new Error('MathError: Division by zero');
        return acc / v;
      }, a);
    });
    g.define('mod', (a, b) => a % b);
    g.define('abs', Math.abs);
    g.define('floor', Math.floor);
    g.define('ceil', Math.ceil);
    g.define('round', Math.round);
    g.define('random', () => Math.random());

    // Comparisons & Logic
    g.define('=', (a, b) => a === b);
    g.define('eq?', (a, b) => a === b);
    g.define('<', (a, b) => a < b);
    g.define('>', (a, b) => a > b);
    g.define('<=', (a, b) => a <= b);
    g.define('>=', (a, b) => a >= b);
    g.define('not', (a) => !this.isTruthy(a));
    g.define('null?', (a) => a === null || (Array.isArray(a) && a.length === 0));
    g.define('list?', (a) => Array.isArray(a));
    g.define('number?', (a) => typeof a === 'number');
    g.define('string?', (a) => typeof a === 'string');

    // List Operations
    g.define('list', (...args) => args);
    g.define('cons', (a, b) => (Array.isArray(b) ? [a, ...b] : [a, b]));
    g.define('car', (lst) => {
      if (!Array.isArray(lst) || lst.length === 0) return null;
      return lst[0];
    });
    g.define('cdr', (lst) => {
      if (!Array.isArray(lst) || lst.length === 0) return [];
      return lst.slice(1);
    });
    g.define('nth', (lst, idx) => (Array.isArray(lst) ? lst[idx] ?? null : null));
    g.define('length', (seq) => (seq && typeof seq.length === 'number' ? seq.length : 0));
    g.define('append', (...lists) => lists.reduce((acc, l) => acc.concat(l), []));
    g.define('reverse', (lst) => [...lst].reverse());
    g.define('map', (fn, lst) => lst.map((item) => fn(item)));
    g.define('filter', (fn, lst) => lst.filter((item) => this.isTruthy(fn(item))));
    g.define('reduce', (fn, init, lst) => lst.reduce((acc, item) => fn(acc, item), init));
    g.define('range', (start, end) => {
      const out = [];
      for (let i = start; i < end; i++) out.push(i);
      return out;
    });

    // String Operations
    g.define('str', (...args) =>
      args.map((a) => (typeof a === 'string' ? a : this.print(a))).join('')
    );
    g.define('concat', (...args) => args.map(String).join(''));
    g.define('split', (s, sep) => String(s).split(sep));
    g.define('join', (lst, sep = '') => lst.join(sep));
    g.define('upper', (s) => String(s).toUpperCase());
    g.define('lower', (s) => String(s).toLowerCase());
    g.define('trim', (s) => String(s).trim());
    g.define('slice', (s, start, end) => s.slice(start, end));
    g.define('replace', (s, target, rep) => String(s).replaceAll(target, rep));

    // Hash Maps / Objects
    g.define('hash', (...kv) => {
      const obj = {};
      for (let i = 0; i < kv.length; i += 2) {
        obj[String(kv[i])] = kv[i + 1];
      }
      return obj;
    });
    g.define('hash-get', (obj, k, fallback = null) => (obj && k in obj ? obj[k] : fallback));
    g.define('hash-set!', (obj, k, v) => {
      obj[k] = v;
      return obj;
    });
    g.define('hash-keys', (obj) => Object.keys(obj || {}));

    // Safe math helper for Lisp calculator
    g.define('js-eval-math', (expr) => {
      try {
        const sanitized = String(expr).replace(/[^0-9+\-*/().%\s]/g, '');
        if (!sanitized.trim()) return '0';
        const val = Function(`"use strict"; return (${sanitized})`)();
        return Number.isFinite(val) ? val : 'Error';
      } catch {
        return 'Error';
      }
    });

    // Introspection
    g.define('env-keys', () => Object.keys(this.globalEnv.dict).sort());
    g.define('print', (...args) => {
      const msg = args.map((a) => (typeof a === 'string' ? a : this.print(a))).join(' ');
      console.log('[λOS]', msg);
      return msg;
    });
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

  // Bind Lisp OS & DOM Interop Primitives
  installOSPrimitives() {
    const g = this.lisp.globalEnv;

    // --- Window Management ---
    g.define('create-window', (title, width = 420, height = 320, content = '') => {
      return this.createWindow({ title: String(title), width, height, content });
    });
    g.define('close-window', (id) => this.closeWindow(id));
    g.define('focus-window', (id) => this.focusWindow(id));
    g.define('set-window-content', (id, content) => this.setWindowContent(id, content));
    g.define('list-windows', () => Array.from(this.windows.keys()));

    // --- DOM Construction & Manipulation ---
    g.define('el', (tag, attrs = {}, ...children) => {
      const node = document.createElement(String(tag));
      if (attrs && typeof attrs === 'object' && !Array.isArray(attrs)) {
        for (const [k, v] of Object.entries(attrs)) {
          if (k === 'class' || k === 'className') {
            node.className = String(v);
          } else if (k === 'style' && typeof v === 'object') {
            Object.assign(node.style, v);
          } else {
            node.setAttribute(k, String(v));
          }
        }
      }
      const appendItem = (c) => {
        if (c === null || c === undefined || c === false) return;
        if (Array.isArray(c)) {
          c.forEach(appendItem);
        } else if (c instanceof HTMLElement) {
          node.appendChild(c);
        } else {
          node.appendChild(document.createTextNode(String(c)));
        }
      };
      children.forEach(appendItem);
      return node;
    });

    g.define('append-child!', (parent, child) => {
      if (parent instanceof HTMLElement) {
        if (child instanceof HTMLElement) parent.appendChild(child);
        else if (child !== null && child !== undefined) {
          parent.appendChild(document.createTextNode(String(child)));
        }
      }
      return parent;
    });

    g.define('on-click', (el, fn) => {
      if (el instanceof HTMLElement && typeof fn === 'function') {
        el.addEventListener('click', (e) => {
          try {
            fn(e);
          } catch (err) {
            this.notify('Lisp Event Error', err.message, 'error');
          }
        });
      }
      return el;
    });

    g.define('on-input', (el, fn) => {
      if (el instanceof HTMLElement && typeof fn === 'function') {
        el.addEventListener('input', (e) => {
          try {
            fn(el.value, e);
          } catch (err) {
            this.notify('Lisp Event Error', err.message, 'error');
          }
        });
      }
      return el;
    });

    g.define('set-style!', (el, prop, val) => {
      if (el instanceof HTMLElement) el.style[prop] = String(val);
      return el;
    });

    g.define('set-text!', (el, txt) => {
      if (el instanceof HTMLElement) el.textContent = String(txt);
      return el;
    });

    g.define('set-html!', (el, html) => {
      if (el instanceof HTMLElement) el.innerHTML = String(html);
      return el;
    });

    g.define('get-val', (el) => (el && 'value' in el ? el.value : ''));
    g.define('set-val!', (el, val) => {
      if (el && 'value' in el) el.value = String(val);
      return el;
    });

    // --- Desktop Customization ---
    g.define('set-wallpaper', (cssBg) => {
      const root = document.getElementById('desktop-root');
      root.classList.remove('default-wallpaper');
      root.style.background = String(cssBg);
      return true;
    });

    g.define('notify', (title, msg, level = 'info') => {
      this.notify(String(title), String(msg), String(level));
      return true;
    });

    g.define('add-desktop-icon', (label, iconChar, fn) => {
      this.addDesktopIcon(String(label), String(iconChar), fn);
      return true;
    });

    g.define('add-top-bar-widget', (id, fn) => {
      this.addTopBarWidget(String(id), fn);
      return true;
    });

    // --- Virtual File System (VFS) ---
    g.define('fs-read', (path) => this.vfs.read(String(path)));
    g.define('fs-write', (path, content) => this.vfs.write(String(path), String(content)));
    g.define('fs-list', () => this.vfs.list());
    g.define('fs-delete', (path) => this.vfs.delete(String(path)));
    g.define('eval-file', (path) => {
      const code = this.vfs.read(String(path));
      return this.lisp.evalString(code);
    });
    g.define('eval-str', (code) => this.lisp.evalString(String(code)));

    // --- Timers ---
    g.define('set-interval', (fn, ms) => {
      const id = setInterval(() => {
        try {
          fn();
        } catch (err) {
          console.error('Lisp interval error:', err);
          clearInterval(id);
        }
      }, Number(ms));
      this.intervals.set(id, id);
      return id;
    });

    g.define('clear-interval', (id) => {
      clearInterval(id);
      this.intervals.delete(id);
      return true;
    });
  }

  // --------------------------------------------------------------------------
  // Desktop Icons & Top-Bar Widgets
  // --------------------------------------------------------------------------
  addDesktopIcon(label, iconChar, fn) {
    // Replace if label already exists
    this.customIcons = this.customIcons.filter((i) => i.label !== label);
    this.customIcons.push({ label, iconChar, fn });
    this.renderDesktopIcons();
  }

  renderDesktopIcons() {
    const container = document.getElementById('desktop-icons');
    container.innerHTML = '';

    const builtIns = [
      { label: 'Lisp REPL', iconChar: '>_', color: 'text-os-accent', action: () => this.openReplApp() },
      { label: 'Code Editor', iconChar: '{}', color: 'text-os-mint', action: () => this.openEditorApp('/init.lisp') },
      { label: 'API Docs', iconChar: '?', color: 'text-os-amber', action: () => this.openDocsApp() },
      { label: 'Todo.lisp', iconChar: '✓', color: 'text-purple-400', action: () => this.runVfsScript('/apps/todo.lisp') },
      { label: 'Themes.lisp', iconChar: '◈', color: 'text-pink-400', action: () => this.runVfsScript('/apps/clock-theme.lisp') },
    ];

    const allIcons = [
      ...builtIns,
      ...this.customIcons.map((c) => ({
        label: c.label,
        iconChar: c.iconChar,
        color: 'text-sky-300',
        action: () => {
          try {
            c.fn();
          } catch (err) {
            this.notify('Shortcut Error', err.message, 'error');
          }
        },
      })),
    ];

    for (const item of allIcons) {
      const btn = document.createElement('button');
      btn.className =
        'group flex flex-col items-center justify-center w-20 h-20 rounded-xl p-2 hover:bg-white/10 active:bg-white/15 border border-transparent hover:border-white/10 transition cursor-pointer';
      btn.innerHTML = `
        <div class="w-10 h-10 rounded-xl bg-[#131826]/90 border border-os-border group-hover:border-os-accent/50 flex items-center justify-center font-mono text-base font-bold ${item.color} shadow-lg mb-1.5 transition">
          ${item.iconChar}
        </div>
        <span class="text-[11px] font-medium text-slate-200 text-center leading-tight truncate w-full drop-shadow">${item.label}</span>
      `;
      btn.addEventListener('click', item.action);
      container.appendChild(btn);
    }
  }

  addTopBarWidget(id, fn) {
    const container = document.getElementById('custom-topbar-widgets');
    if (this.topBarWidgets.has(id)) {
      const old = this.topBarWidgets.get(id);
      clearInterval(old.timer);
      old.el.remove();
    }

    const badge = document.createElement('div');
    badge.className =
      'px-2 py-1 rounded-md bg-purple-500/15 border border-purple-500/30 font-mono text-[11px] text-purple-300';
    container.appendChild(badge);

    const refresh = () => {
      try {
        const val = fn();
        if (val instanceof HTMLElement) {
          badge.innerHTML = '';
          badge.appendChild(val);
        } else {
          badge.textContent = String(val);
        }
      } catch (err) {
        badge.textContent = `!err`;
      }
    };

    refresh();
    const timer = setInterval(refresh, 1000);
    this.topBarWidgets.set(id, { el: badge, timer });
  }

  // --------------------------------------------------------------------------
  // Window Management (Create, Drag, Resize, Focus, Min/Max/Close)
  // --------------------------------------------------------------------------
  createWindow({ id = null, title = 'Window', width = 460, height = 340, content = '' }) {
    const winId = id || `win-${++this.winCounter}`;
    if (this.windows.has(winId)) {
      this.focusWindow(winId);
      return winId;
    }

    const layer = document.getElementById('window-layer');
    const vw = window.innerWidth;
    const vh = window.innerHeight - 38;

    const w = Math.min(width, vw - 20);
    const h = Math.min(height, vh - 20);
    const offset = (this.windows.size % 7) * 26;
    const left = Math.max(12, Math.min(vw - w - 12, Math.floor((vw - w) / 2) + offset - 40));
    const top = Math.max(12, Math.min(vh - h - 12, Math.floor((vh - h) / 2) + offset - 30));

    const winEl = document.createElement('div');
    winEl.className = 'os-window pointer-events-auto';
    winEl.style.width = `${w}px`;
    winEl.style.height = `${h}px`;
    winEl.style.left = `${left}px`;
    winEl.style.top = `${top}px`;
    winEl.style.zIndex = ++this.zCounter;

    winEl.innerHTML = `
      <div class="win-titlebar h-9 px-3 bg-[#141926] border-b border-os-border/90 flex items-center justify-between cursor-move shrink-0">
        <div class="flex items-center gap-2 min-w-0">
          <span class="w-2 h-2 rounded-full bg-os-accent/80 shrink-0"></span>
          <span class="win-title-text text-xs font-medium text-slate-200 truncate">${this.escapeHtml(title)}</span>
        </div>
        <div class="flex items-center gap-1.5 shrink-0">
          <button class="win-min w-6 h-6 rounded hover:bg-white/10 text-os-muted hover:text-white flex items-center justify-center text-xs transition" title="Minimize">─</button>
          <button class="win-max w-6 h-6 rounded hover:bg-white/10 text-os-muted hover:text-white flex items-center justify-center text-xs transition" title="Maximize">□</button>
          <button class="win-close w-6 h-6 rounded hover:bg-rose-500/80 text-os-muted hover:text-white flex items-center justify-center text-xs transition" title="Close">✕</button>
        </div>
      </div>
      <div class="win-body flex-1 overflow-auto relative"></div>
      <div class="resize-handle" title="Resize"></div>
    `;

    const bodyEl = winEl.querySelector('.win-body');
    this.applyContentToElement(bodyEl, content);

    const state = {
      id: winId,
      title,
      el: winEl,
      bodyEl,
      minimized: false,
      maximized: false,
    };

    this.windows.set(winId, state);
    layer.appendChild(winEl);

    // Focus on click
    winEl.addEventListener('mousedown', () => this.focusWindow(winId));
    winEl.addEventListener('touchstart', () => this.focusWindow(winId), { passive: true });

    // Window Controls
    winEl.querySelector('.win-close').addEventListener('click', (e) => {
      e.stopPropagation();
      this.closeWindow(winId);
    });
    winEl.querySelector('.win-min').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMinimizeWindow(winId);
    });
    winEl.querySelector('.win-max').addEventListener('click', (e) => {
      e.stopPropagation();
      this.toggleMaximizeWindow(winId);
    });

    // Draggable Titlebar (Mouse + Touch)
    const titlebar = winEl.querySelector('.win-titlebar');
    this.makeDraggable(winEl, titlebar, state);

    // Resizable Handle (Mouse + Touch)
    const handle = winEl.querySelector('.resize-handle');
    this.makeResizable(winEl, handle, state);

    this.focusWindow(winId);
    this.renderTaskbar();
    return winId;
  }

  applyContentToElement(container, content) {
    container.innerHTML = '';
    if (content instanceof HTMLElement) {
      container.appendChild(content);
    } else if (content !== null && content !== undefined) {
      container.innerHTML = String(content);
    }
  }

  setWindowContent(winId, content) {
    const win = this.windows.get(winId);
    if (!win) return false;
    this.applyContentToElement(win.bodyEl, content);
    return true;
  }

  focusWindow(winId) {
    const win = this.windows.get(winId);
    if (!win) return;
    if (win.minimized) {
      win.minimized = false;
      win.el.style.display = 'flex';
    }
    this.windows.forEach((w) => w.el.classList.remove('focused'));
    win.el.classList.add('focused');
    win.el.style.zIndex = ++this.zCounter;
    this.activeWindowId = winId;
    document.getElementById('active-window-title').textContent = win.title;
    this.renderTaskbar();
  }

  toggleMinimizeWindow(winId) {
    const win = this.windows.get(winId);
    if (!win) return;
    win.minimized = !win.minimized;
    win.el.style.display = win.minimized ? 'none' : 'flex';
    if (!win.minimized) this.focusWindow(winId);
    else {
      document.getElementById('active-window-title').textContent = 'Desktop';
      this.renderTaskbar();
    }
  }

  toggleMaximizeWindow(winId) {
    const win = this.windows.get(winId);
    if (!win) return;
    win.maximized = !win.maximized;
    win.el.classList.toggle('maximized', win.maximized);
    this.focusWindow(winId);
  }

  closeWindow(winId) {
    const win = this.windows.get(winId);
    if (!win) return false;
    win.el.remove();
    this.windows.delete(winId);
    if (this.activeWindowId === winId) {
      this.activeWindowId = null;
      document.getElementById('active-window-title').textContent = 'Desktop';
    }
    this.renderTaskbar();
    return true;
  }

  renderTaskbar() {
    const bar = document.getElementById('taskbar-windows');
    bar.innerHTML = '';
    this.windows.forEach((win) => {
      const btn = document.createElement('button');
      const isFocused = this.activeWindowId === win.id && !win.minimized;
      btn.className = `px-2.5 py-1 rounded text-[11px] truncate max-w-[130px] border transition cursor-pointer ${
        isFocused
          ? 'bg-os-accent/20 border-os-accent/40 text-white font-medium'
          : 'bg-white/5 border-transparent text-os-muted hover:text-white hover:bg-white/10'
      }`;
      btn.textContent = win.title;
      btn.addEventListener('click', () => {
        if (isFocused) this.toggleMinimizeWindow(win.id);
        else this.focusWindow(win.id);
      });
      bar.appendChild(btn);
    });
  }

  makeDraggable(winEl, handle, state) {
    let dragging = false;
    let startX = 0, startY = 0, origLeft = 0, origTop = 0;

    const onStart = (clientX, clientY) => {
      if (state.maximized) return;
      dragging = true;
      startX = clientX;
      startY = clientY;
      origLeft = winEl.offsetLeft;
      origTop = winEl.offsetTop;
    };

    const onMove = (clientX, clientY) => {
      if (!dragging) return;
      const dx = clientX - startX;
      const dy = clientY - startY;
      const maxLeft = window.innerWidth - 60;
      const maxTop = window.innerHeight - 70;
      winEl.style.left = `${Math.max(-winEl.offsetWidth + 80, Math.min(maxLeft, origLeft + dx))}px`;
      winEl.style.top = `${Math.max(0, Math.min(maxTop, origTop + dy))}px`;
    };

    const onEnd = () => { dragging = false; };

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      onStart(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);

    handle.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!dragging) return;
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener('touchend', onEnd);
  }

  makeResizable(winEl, handle, state) {
    let resizing = false;
    let startX = 0, startY = 0, origW = 0, origH = 0;

    const onStart = (clientX, clientY) => {
      if (state.maximized) return;
      resizing = true;
      startX = clientX;
      startY = clientY;
      origW = winEl.offsetWidth;
      origH = winEl.offsetHeight;
    };

    const onMove = (clientX, clientY) => {
      if (!resizing) return;
      const newW = Math.max(240, origW + (clientX - startX));
      const newH = Math.max(180, origH + (clientY - startY));
      winEl.style.width = `${newW}px`;
      winEl.style.height = `${newH}px`;
    };

    const onEnd = () => { resizing = false; };

    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      onStart(e.clientX, e.clientY);
    });
    window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
    window.addEventListener('mouseup', onEnd);

    handle.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      const t = e.touches[0];
      onStart(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener('touchmove', (e) => {
      if (!resizing) return;
      const t = e.touches[0];
      onMove(t.clientX, t.clientY);
    }, { passive: true });
    window.addEventListener('touchend', onEnd);
  }

  // --------------------------------------------------------------------------
  // Notifications & Modal Dialogs
  // --------------------------------------------------------------------------
  notify(title, message, level = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    const borderAccent =
      level === 'error'
        ? 'border-rose-500/60 bg-[#1c1219]/95'
        : level === 'success'
        ? 'border-emerald-500/60 bg-[#101c1a]/95'
        : 'border-os-accent/50 bg-[#121724]/95';
    const titleColor =
      level === 'error'
        ? 'text-rose-400'
        : level === 'success'
        ? 'text-emerald-400'
        : 'text-os-accent';

    toast.className = `toast-enter pointer-events-auto border ${borderAccent} backdrop-blur-md rounded-xl p-3 shadow-2xl`;
    toast.innerHTML = `
      <div class="flex items-center justify-between mb-0.5">
        <span class="text-xs font-semibold ${titleColor}">${this.escapeHtml(title)}</span>
        <button class="text-os-muted hover:text-white text-xs ml-2">✕</button>
      </div>
      <p class="text-[11px] text-slate-300 leading-snug break-words">${this.escapeHtml(message)}</p>
    `;

    const dismiss = () => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(16px)';
      toast.style.transition = 'all 0.2s ease';
      setTimeout(() => toast.remove(), 200);
    };

    toast.querySelector('button').addEventListener('click', dismiss);
    container.appendChild(toast);
    setTimeout(dismiss, 4500);
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

  // --------------------------------------------------------------------------
  // 5. BUILT-IN SYSTEM APPS (REPL, VFS Code Editor, API Reference)
  // --------------------------------------------------------------------------
  openReplApp() {
    const winId = 'sys-repl';
    if (this.windows.has(winId)) {
      this.focusWindow(winId);
      return;
    }

    const root = document.createElement('div');
    root.className = 'flex flex-col h-full bg-[#0b0e16] font-mono text-xs';
    root.innerHTML = `
      <div class="flex items-center justify-between px-3 py-1.5 bg-[#121724] border-b border-os-border text-[11px] text-os-muted">
        <div class="flex items-center gap-2">
          <button data-tab="terminal" class="repl-tab px-2 py-0.5 rounded bg-os-accent/20 text-os-accent font-semibold">Interactive REPL</button>
          <button data-tab="scratchpad" class="repl-tab px-2 py-0.5 rounded hover:bg-white/5 text-os-muted">Multi-line Scratchpad</button>
        </div>
        <div class="flex items-center gap-2">
          <button id="repl-inspect-env" class="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300">Env Symbols</button>
          <button id="repl-clear" class="px-2 py-0.5 rounded bg-white/5 hover:bg-white/10 text-slate-300">Clear</button>
        </div>
      </div>

      <!-- Terminal View -->
      <div id="repl-terminal-view" class="flex-1 flex flex-col overflow-hidden">
        <div id="repl-history" class="flex-1 overflow-y-auto p-3 space-y-2 selectable">
          <div class="text-os-muted">LambdaOS Lisp Interpreter v1.0 — Type an S-expression below and press <span class="text-os-accent">Enter</span>.</div>
          <div class="text-os-muted/80">Try: <span class="text-emerald-300">(+ 1 2 3)</span>, <span class="text-emerald-300">(fs-list)</span>, or <span class="text-emerald-300">(eval-file "/apps/calculator.lisp")</span></div>
        </div>
        <div class="p-2.5 bg-[#101420] border-t border-os-border flex items-center gap-2">
          <span class="text-os-accent font-bold">λ&gt;</span>
          <input id="repl-input" type="text" placeholder="(map (fn (x) (* x x)) (list 1 2 3 4 5))" class="flex-1 bg-transparent text-white focus:outline-none" autocomplete="off" spellcheck="false" />
          <button id="repl-eval-btn" class="px-3 py-1 rounded bg-os-accent text-slate-950 font-semibold hover:bg-sky-300 transition">Eval</button>
        </div>
      </div>

      <!-- Scratchpad View -->
      <div id="repl-scratchpad-view" class="hidden flex-1 flex flex-col overflow-hidden">
        <textarea id="repl-scratch-area" class="flex-1 bg-transparent p-3 text-slate-200 focus:outline-none resize-none leading-relaxed" spellcheck="false">; Write multi-line Lisp expressions here and click Evaluate Buffer
(define greet
  (fn (who)
    (notify "Scratchpad" (concat "Greetings, " who "!"))))

(greet "Lisp Hacker")</textarea>
        <div class="p-2 bg-[#101420] border-t border-os-border flex items-center justify-between">
          <span id="scratch-status" class="text-[11px] text-os-muted">Ready</span>
          <button id="scratch-run-btn" class="px-3 py-1 rounded bg-os-mint text-slate-950 font-semibold hover:bg-emerald-300 transition">▶ Evaluate Buffer</button>
        </div>
      </div>
    `;

    this.createWindow({
      id: winId,
      title: 'Lisp REPL & Scratchpad',
      width: 560,
      height: 390,
      content: root,
    });

    const historyEl = root.querySelector('#repl-history');
    const inputEl = root.querySelector('#repl-input');
    const cmdHistory = [];
    let cmdIndex = -1;

    const appendLog = (html) => {
      const line = document.createElement('div');
      line.innerHTML = html;
      historyEl.appendChild(line);
      historyEl.scrollTop = historyEl.scrollHeight;
    };

    const runReplCode = (code) => {
      if (!code.trim()) return;
      cmdHistory.push(code);
      cmdIndex = cmdHistory.length;
      appendLog(`<div class="text-slate-400"><span class="text-os-accent font-bold">λ&gt;</span> ${this.escapeHtml(code)}</div>`);
      try {
        const res = this.lisp.evalString(code);
        appendLog(`<div class="text-emerald-300 pl-4">⇒ ${this.escapeHtml(this.lisp.print(res))}</div>`);
      } catch (err) {
        appendLog(`<div class="text-rose-400 pl-4">✖ ${this.escapeHtml(err.message)}</div>`);
      }
    };

    root.querySelector('#repl-eval-btn').addEventListener('click', () => {
      runReplCode(inputEl.value);
      inputEl.value = '';
    });

    inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        runReplCode(inputEl.value);
        inputEl.value = '';
      } else if (e.key === 'ArrowUp') {
        if (cmdIndex > 0) {
          cmdIndex--;
          inputEl.value = cmdHistory[cmdIndex];
        }
      } else if (e.key === 'ArrowDown') {
        if (cmdIndex < cmdHistory.length - 1) {
          cmdIndex++;
          inputEl.value = cmdHistory[cmdIndex];
        } else {
          cmdIndex = cmdHistory.length;
          inputEl.value = '';
        }
      }
    });

    root.querySelector('#repl-clear').addEventListener('click', () => {
      historyEl.innerHTML = '';
    });

    root.querySelector('#repl-inspect-env').addEventListener('click', () => {
      const keys = Object.keys(this.lisp.globalEnv.dict).sort();
      appendLog(
        `<div class="p-2 rounded bg-white/5 border border-os-border text-[11px] text-sky-300 leading-relaxed"><strong class="text-white">Bound Symbols (${keys.length}):</strong><br/>${this.escapeHtml(keys.join(', '))}</div>`
      );
    });

    // Tab Switching
    const termView = root.querySelector('#repl-terminal-view');
    const scratchView = root.querySelector('#repl-scratchpad-view');
    root.querySelectorAll('.repl-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        root.querySelectorAll('.repl-tab').forEach((t) => {
          t.className = 'repl-tab px-2 py-0.5 rounded hover:bg-white/5 text-os-muted';
        });
        tab.className = 'repl-tab px-2 py-0.5 rounded bg-os-accent/20 text-os-accent font-semibold';
        if (tab.dataset.tab === 'terminal') {
          termView.classList.remove('hidden');
          scratchView.classList.add('hidden');
        } else {
          termView.classList.add('hidden');
          scratchView.classList.remove('hidden');
        }
      });
    });

    // Scratchpad Evaluate
    root.querySelector('#scratch-run-btn').addEventListener('click', () => {
      const code = root.querySelector('#repl-scratch-area').value;
      const status = root.querySelector('#scratch-status');
      try {
        const res = this.lisp.evalString(code);
        status.className = 'text-[11px] text-emerald-400';
        status.textContent = `⇒ ${this.lisp.print(res)}`;
      } catch (err) {
        status.className = 'text-[11px] text-rose-400';
        status.textContent = `✖ ${err.message}`;
      }
    });

    setTimeout(() => inputEl.focus(), 50);
  }

  openEditorApp(initialPath = '/init.lisp') {
    const winId = 'sys-editor';
    if (this.windows.has(winId)) {
      this.focusWindow(winId);
      if (initialPath) this.editorSelectFile(initialPath);
      return;
    }

    const root = document.createElement('div');
    root.className = 'flex h-full bg-[#0c1019] text-xs';
    root.innerHTML = `
      <!-- Sidebar File Tree -->
      <div class="w-44 sm:w-52 bg-[#101521] border-r border-os-border flex flex-col shrink-0">
        <div class="px-3 py-2 border-b border-os-border flex items-center justify-between">
          <span class="font-mono text-[10px] uppercase tracking-wider text-os-muted font-semibold">VFS Explorer</span>
          <button id="vfs-new-file" title="New File" class="px-1.5 py-0.5 rounded bg-os-accent/20 hover:bg-os-accent/30 text-os-accent font-mono text-xs">+ File</button>
        </div>
        <div id="vfs-file-list" class="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-[11px]"></div>
      </div>

      <!-- Editor Main Pane -->
      <div class="flex-1 flex flex-col min-w-0">
        <div class="px-3 py-1.5 bg-[#131826] border-b border-os-border flex flex-wrap items-center justify-between gap-2">
          <div class="flex items-center gap-2 min-w-0">
            <span id="editor-current-path" class="font-mono text-os-accent font-semibold truncate">/init.lisp</span>
            <span id="editor-dirty-badge" class="hidden text-[10px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300">unsaved</span>
          </div>
          <div class="flex items-center gap-1.5">
            <button id="editor-delete-btn" class="px-2 py-1 rounded bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 font-medium transition">Delete</button>
            <button id="editor-save-btn" class="px-2.5 py-1 rounded bg-white/10 hover:bg-white/15 text-white font-medium transition">Save</button>
            <button id="editor-run-btn" class="px-3 py-1 rounded bg-os-mint hover:bg-emerald-300 text-slate-950 font-semibold transition flex items-center gap-1">
              <span>▶</span> Run in OS
            </button>
          </div>
        </div>

        <textarea id="editor-textarea" class="flex-1 w-full bg-[#090c13] p-3.5 font-mono text-xs text-slate-100 leading-relaxed focus:outline-none resize-none selectable" spellcheck="false"></textarea>

        <div id="editor-status-bar" class="px-3 py-1.5 bg-[#101420] border-t border-os-border font-mono text-[11px] text-os-muted truncate">
          Ready — Edit any .lisp script and click "Run in OS" to execute live.
        </div>
      </div>
    `;

    this.createWindow({
      id: winId,
      title: 'VFS Code Editor & File Manager',
      width: 680,
      height: 440,
      content: root,
    });

    let currentPath = initialPath;
    const fileListEl = root.querySelector('#vfs-file-list');
    const textarea = root.querySelector('#editor-textarea');
    const pathLabel = root.querySelector('#editor-current-path');
    const dirtyBadge = root.querySelector('#editor-dirty-badge');
    const statusBar = root.querySelector('#editor-status-bar');

    const renderFileTree = () => {
      fileListEl.innerHTML = '';
      const paths = this.vfs.list();
      for (const p of paths) {
        const btn = document.createElement('button');
        const active = p === currentPath;
        btn.className = `w-full text-left px-2.5 py-1.5 rounded-md truncate flex items-center gap-1.5 transition cursor-pointer ${
          active
            ? 'bg-os-accent/20 text-os-accent font-semibold'
            : 'text-slate-300 hover:bg-white/5'
        }`;
        const icon = p.endsWith('.lisp') ? 'λ' : '≡';
        btn.innerHTML = `<span class="opacity-75">${icon}</span><span class="truncate">${this.escapeHtml(p)}</span>`;
        btn.addEventListener('click', () => loadFile(p));
        fileListEl.appendChild(btn);
      }
    };

    const loadFile = (path) => {
      try {
        const content = this.vfs.read(path);
        currentPath = path;
        pathLabel.textContent = path;
        textarea.value = content;
        dirtyBadge.classList.add('hidden');
        renderFileTree();
      } catch (err) {
        statusBar.textContent = `Error: ${err.message}`;
      }
    };

    this.editorSelectFile = loadFile;

    textarea.addEventListener('input', () => {
      dirtyBadge.classList.remove('hidden');
    });

    // Tab key indentation support in editor
    textarea.addEventListener('keydown', (e) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = textarea.value.substring(0, start) + '  ' + textarea.value.substring(end);
        textarea.selectionStart = textarea.selectionEnd = start + 2;
        dirtyBadge.classList.remove('hidden');
      } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        saveCurrent();
      }
    });

    const saveCurrent = () => {
      this.vfs.write(currentPath, textarea.value);
      dirtyBadge.classList.add('hidden');
      statusBar.className = 'px-3 py-1.5 bg-[#101420] border-t border-os-border font-mono text-[11px] text-emerald-400 truncate';
      statusBar.textContent = `Saved ${currentPath} (${textarea.value.length} bytes)`;
      renderFileTree();
    };

    root.querySelector('#editor-save-btn').addEventListener('click', saveCurrent);

    root.querySelector('#editor-run-btn').addEventListener('click', () => {
      saveCurrent();
      try {
        const res = this.lisp.evalString(textarea.value);
        statusBar.className = 'px-3 py-1.5 bg-[#101420] border-t border-os-border font-mono text-[11px] text-emerald-400 truncate';
        statusBar.textContent = `Executed ${currentPath} ⇒ ${this.lisp.print(res)}`;
      } catch (err) {
        statusBar.className = 'px-3 py-1.5 bg-[#101420] border-t border-os-border font-mono text-[11px] text-rose-400 truncate';
        statusBar.textContent = `Lisp Error: ${err.message}`;
        this.notify('Lisp Execution Error', err.message, 'error');
      }
    });

    root.querySelector('#editor-delete-btn').addEventListener('click', () => {
      if (currentPath === '/init.lisp') {
        this.notify('Protected File', '/init.lisp cannot be deleted.', 'error');
        return;
      }
      this.confirmAction('Delete File', `Delete ${currentPath} from the Virtual File System?`, () => {
        this.vfs.delete(currentPath);
        loadFile('/init.lisp');
      });
    });

    // Inline New File creation bar
    root.querySelector('#vfs-new-file').addEventListener('click', () => {
      const existingPrompt = root.querySelector('#new-file-inline');
      if (existingPrompt) {
        existingPrompt.remove();
        return;
      }
      const bar = document.createElement('div');
      bar.id = 'new-file-inline';
      bar.className = 'p-1.5 border-b border-os-border bg-black/40 flex gap-1';
      bar.innerHTML = `
        <input type="text" placeholder="/apps/my-app.lisp" class="w-full bg-slate-900 border border-slate-700 rounded px-1.5 py-1 font-mono text-[11px] text-white focus:outline-none focus:border-os-accent" />
        <button class="px-2 py-1 rounded bg-os-accent text-slate-950 font-semibold text-[10px]">OK</button>
      `;
      fileListEl.parentElement.insertBefore(bar, fileListEl);
      const inp = bar.querySelector('input');
      inp.focus();

      const create = () => {
        let name = inp.value.trim();
        if (!name) return;
        if (!name.startsWith('/')) name = '/' + name;
        this.vfs.write(name, `; ${name}\n(notify "New App" "Hello from ${name}!")\n`);
        bar.remove();
        loadFile(name);
      };
      bar.querySelector('button').addEventListener('click', create);
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') create();
        if (e.key === 'Escape') bar.remove();
      });
    });

    loadFile(initialPath);
  }

  openDocsApp() {
    const winId = 'sys-docs';
    if (this.windows.has(winId)) {
      this.focusWindow(winId);
      return;
    }

    const examples = [
      {
        title: '1. Spawn a Custom Lisp Window',
        desc: 'Use (create-window title width height dom-el) and (el tag attrs ...children) to compose reactive GUIs.',
        code: `(let ((count 0)
    (lbl (el "div" (hash "class" "text-2xl font-mono text-sky-300 mb-3") "Count: 0"))
    (btn (el "button" (hash "class" "px-4 py-2 rounded-lg bg-sky-500 text-slate-950 font-semibold cursor-pointer") "Increment +1")))
(on-click btn (fn ()
                (set! count (+ count 1))
                (set-text! lbl (concat "Count: " (str count)))))
(create-window "Counter Demo" 260 180
  (el "div" (hash "class" "p-4 text-center") lbl btn)))`,
      },
      {
        title: '2. Macros with (defmacro)',
        desc: 'Define syntactic abstractions like (when cond body...) that expand before evaluation.',
        code: `(defmacro when (test . body)
(list 'if test (cons 'begin body) nil))

(when (> 10 3)
(notify "Macro Worked!" "10 is indeed greater than 3."))`,
      },
      {
        title: '3. Read & Write Virtual File System',
        desc: 'Persist data or generate new Lisp apps directly into localStorage VFS.',
        code: `(fs-write "/notes/lisp-test.txt" "Written from Lisp at runtime!")
(notify "VFS Read Back" (fs-read "/notes/lisp-test.txt"))`,
      },
    ];

    const root = document.createElement('div');
    root.className = 'p-4 space-y-4 text-xs leading-relaxed selectable overflow-y-auto h-full';

    root.innerHTML = `
      <div class="border-b border-os-border pb-3">
        <h2 class="text-base font-bold text-white flex items-center gap-2">
          <span class="text-os-accent font-mono">λ</span> LambdaOS Lisp &amp; OS Interop Reference
        </h2>
        <p class="text-os-muted mt-1">
          LambdaOS includes a lexically-scoped Lisp interpreter with tail-call optimization, macros, and direct bindings to the Window Manager, DOM, and Virtual File System.
        </p>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div class="p-3 rounded-xl bg-white/[0.03] border border-os-border">
          <h3 class="font-mono text-os-accent font-semibold mb-1.5">Special Forms</h3>
          <ul class="space-y-1 font-mono text-[11px] text-slate-300">
            <li><span class="text-white">(quote x)</span> or <span class="text-white">'x</span></li>
            <li><span class="text-white">(define sym val)</span> / <span class="text-white">(define (f x) ...)</span></li>
            <li><span class="text-white">(defmacro name (args) body)</span></li>
            <li><span class="text-white">(lambda (args) ...)</span> or <span class="text-white">(fn ...)</span></li>
            <li><span class="text-white">(if test then else)</span> / <span class="text-white">(cond ...)</span></li>
            <li><span class="text-white">(let ((x 1) (y 2)) body...)</span></li>
            <li><span class="text-white">(begin ...)</span> / <span class="text-white">(do ...)</span> / <span class="text-white">(set! x v)</span></li>
          </ul>
        </div>

        <div class="p-3 rounded-xl bg-white/[0.03] border border-os-border">
          <h3 class="font-mono text-os-mint font-semibold mb-1.5">OS &amp; DOM Primitives</h3>
          <ul class="space-y-1 font-mono text-[11px] text-slate-300">
            <li><span class="text-white">(create-window title w h el)</span></li>
            <li><span class="text-white">(close-window id)</span> / <span class="text-white">(list-windows)</span></li>
            <li><span class="text-white">(el tag attrs ...children)</span></li>
            <li><span class="text-white">(on-click el fn)</span> / <span class="text-white">(set-text! el s)</span></li>
            <li><span class="text-white">(set-wallpaper css)</span> / <span class="text-white">(notify t m)</span></li>
            <li><span class="text-white">(add-desktop-icon lbl icon fn)</span></li>
            <li><span class="text-white">(add-top-bar-widget id fn)</span></li>
            <li><span class="text-white">(fs-read p)</span> / <span class="text-white">(fs-write p c)</span> / <span class="text-white">(fs-list)</span></li>
          </ul>
        </div>
      </div>

      <div>
        <h3 class="font-semibold text-white mb-2">Interactive Runnable Examples</h3>
        <div id="docs-examples-container" class="space-y-3"></div>
      </div>
    `;

    const exContainer = root.querySelector('#docs-examples-container');
    examples.forEach((ex) => {
      const card = document.createElement('div');
      card.className = 'rounded-xl bg-[#0b0e16] border border-os-border overflow-hidden';
      card.innerHTML = `
        <div class="px-3 py-2 bg-[#131826] border-b border-os-border flex items-center justify-between">
          <div>
            <div class="font-semibold text-slate-100">${this.escapeHtml(ex.title)}</div>
            <div class="text-[11px] text-os-muted">${this.escapeHtml(ex.desc)}</div>
          </div>
          <button class="run-ex-btn shrink-0 px-2.5 py-1 rounded-lg bg-os-accent/20 hover:bg-os-accent/30 text-os-accent font-mono font-semibold text-[11px] transition cursor-pointer">
            ▶ Run
          </button>
        </div>
        <pre class="p-3 font-mono text-[11px] text-emerald-300 overflow-x-auto">${this.escapeHtml(ex.code)}</pre>
      `;
      card.querySelector('.run-ex-btn').addEventListener('click', () => {
        try {
          this.lisp.evalString(ex.code);
        } catch (err) {
          this.notify('Example Error', err.message, 'error');
        }
      });
      exContainer.appendChild(card);
    });

    this.createWindow({
      id: winId,
      title: 'Lisp OS API Reference & Guide',
      width: 620,
      height: 470,
      content: root,
    });
  }

  runVfsScript(path) {
    try {
      const code = this.vfs.read(path);
      this.lisp.evalString(code);
    } catch (err) {
      this.notify('Script Error', `${path}: ${err.message}`, 'error');
    }
  }

  // --------------------------------------------------------------------------
  // Boot & Global Events
  // --------------------------------------------------------------------------
  bootInitScript() {
    try {
      const initCode = this.vfs.read('/init.lisp');
      this.lisp.evalString(initCode);
    } catch (err) {
      this.notify('Boot Error (/init.lisp)', err.message, 'error');
    }
  }

  bindUIEvents() {
    // Launcher dropdown toggle
    const launcherBtn = document.getElementById('launcher-btn');
    const launcherMenu = document.getElementById('launcher-menu');

    launcherBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      launcherMenu.classList.toggle('hidden');
    });

    document.addEventListener('click', (e) => {
      if (!launcherMenu.contains(e.target) && e.target !== launcherBtn) {
        launcherMenu.classList.add('hidden');
      }
    });

    // Built-in app launchers
    document.querySelectorAll('[data-launch]').forEach((btn) => {
      btn.addEventListener('click', () => {
        launcherMenu.classList.add('hidden');
        const app = btn.dataset.launch;
        if (app === 'repl') this.openReplApp();
        if (app === 'editor') this.openEditorApp('/init.lisp');
        if (app === 'docs') this.openDocsApp();
      });
    });

    // Preloaded Lisp scripts in launcher
    document.querySelectorAll('[data-run-script]').forEach((btn) => {
      btn.addEventListener('click', () => {
        launcherMenu.classList.add('hidden');
        this.runVfsScript(btn.dataset.runScript);
      });
    });

    // Re-run /init.lisp
    document.getElementById('reboot-os-btn').addEventListener('click', () => {
      launcherMenu.classList.add('hidden');
      this.bootInitScript();
    });

    // Reset VFS
    document.getElementById('reset-os-btn').addEventListener('click', () => {
      launcherMenu.classList.add('hidden');
      this.confirmAction(
        'Reset Virtual File System?',
        'This will overwrite any changes made to /init.lisp and /apps/* in localStorage with the factory defaults.',
        () => {
          this.vfs.reset(true);
          if (this.windows.has('sys-editor') && this.editorSelectFile) {
            this.editorSelectFile('/init.lisp');
          }
        }
      );
    });

    // Global Quick REPL Overlay
    const overlay = document.getElementById('quick-repl-overlay');
    const overlayInput = document.getElementById('quick-repl-input');
    const overlayOut = document.getElementById('quick-repl-output');

    const toggleOverlay = (forceState = null) => {
      const isHidden = overlay.classList.contains('hidden');
      const shouldShow = forceState !== null ? forceState : isHidden;
      overlay.classList.toggle('hidden', !shouldShow);
      if (shouldShow) setTimeout(() => overlayInput.focus(), 30);
    };

    document.getElementById('toggle-overlay-repl').addEventListener('click', () => toggleOverlay());

    const evalOverlay = () => {
      const code = overlayInput.value.trim();
      if (!code) return;
      try {
        const res = this.lisp.evalString(code);
        overlayOut.className = 'mt-2 font-mono text-xs text-os-mint max-h-28 overflow-y-auto selectable';
        overlayOut.textContent = `⇒ ${this.lisp.print(res)}`;
      } catch (err) {
        overlayOut.className = 'mt-2 font-mono text-xs text-os-rose max-h-28 overflow-y-auto selectable';
        overlayOut.textContent = `✖ ${err.message}`;
      }
    };

    document.getElementById('quick-repl-run').addEventListener('click', evalOverlay);
    overlayInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') evalOverlay();
      if (e.key === 'Escape') toggleOverlay(false);
    });

    // Keyboard shortcut Alt+Space for Quick REPL
    window.addEventListener('keydown', (e) => {
      if (e.altKey && e.code === 'Space') {
        e.preventDefault();
        toggleOverlay();
      }
    });
  }

  startSystemClock() {
    const clockEl = document.getElementById('system-clock');
    const update = () => {
      const now = new Date();
      clockEl.textContent = now.toLocaleTimeString([], { hour12: false });
    };
    update();
    setInterval(update, 1000);
  }

  escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

// Boot LambdaOS on Window Load
window.addEventListener('load', () => {
  window.os = new LambdaOS();
  window.os.bootInitScript();
});
