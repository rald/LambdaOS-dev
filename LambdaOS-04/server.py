#!/usr/bin/env python3
"""LambdaOS backend — Bottle + SQLite3.

Serves the static frontend and persists the virtual filesystem
in SQLite (filesystem.db). Restores factory-default files at boot
via INSERT OR IGNORE (user edits are never overwritten).
"""
import json
import os
import sqlite3
from pathlib import Path

from bottle import Bottle, request, response, static_file, abort

ROOT = Path(__file__).resolve().parent
DB_PATH = ROOT / 'filesystem.db'
HOST = '0.0.0.0'
PORT = int(os.environ.get('PORT', 8080))

DEFAULT_LISP_FILES = {
    '/apps/api-docs.lisp': '; /apps/api-docs.lisp — API reference, plain Lisp\n(create-window "API Docs" 520 380\n  (el "div" (hash "class" "p-4 space-y-3 text-xs leading-relaxed selectable overflow-y-auto h-full")\n      (el "h2" (hash "class" "text-base font-bold text-white") "λ LambdaOS API Reference")\n      (el "div" (hash "class" "p-3 rounded-xl bg-white/[0.03] border border-os-border")\n          (el "h3" (hash "class" "font-mono text-os-accent font-semibold mb-1") "OS Primitives")\n          (el "ul" (hash "class" "space-y-1 font-mono text-[11px]")\n              (el "li" nil "(create-window title width height dom-el)")\n              (el "li" nil "(close-window win-id)")\n              (el "li" nil "(el tag attrs ...children)")\n              (el "li" nil "(on-click el fn) / (on-dblclick el fn) / (on-keydown el fn)")\n              (el "li" nil "(set-text! el str) / (set-html! el str) / (set-val! el str)")\n              (el "li" nil "(get-val el) / (el-value el)")\n              (el "li" nil "(fs-read path) / (fs-write path content)")\n              (el "li" nil "(fs-list) / (fs-list-dir dir) / (fs-parent-dir dir)")\n              (el "li" nil "(fs-delete path) / (fs-rename old new) / (fs-copy src dst)")\n              (el "li" nil "(eval-file path) / (eval-str code)")\n              (el "li" nil "(repl-run code) — evaluate in the Lisp REPL window")\n              (el "li" nil "(print . args) — prints to the run console")\n              (el "li" nil "(lisp-run-console title code) — run with output console")\n              (el "li" nil "(snapshot-vfs) → files / (load-vfs files)")\n              (el "li" nil "(notify title message)")\n              (el "li" nil "(add-desktop-icon label icon fn)")\n              (el "li" nil "(add-top-bar-widget id fn)")))))\n',
    '/apps/calculator.lisp': '; /apps/calculator.lisp\n(let ((expr "")\n      (display (el "div"\n                   (hash "class" "w-full bg-black/60 border border-slate-700 rounded-lg p-3 text-right font-mono text-xl text-sky-300 overflow-x-auto mb-3 min-h-[48px]")\n                   "0")))\n\n  (define update-display\n    (fn (val)\n      (set! expr val)\n      (set-text! display (if (= expr "") "0" expr))))\n\n  (define press-key\n    (fn (ch)\n      (cond\n        ((= ch "C") (update-display ""))\n        ((= ch "⌫") (update-display (slice expr 0 (- (length expr) 1))))\n        ((= ch "=")\n         (let ((res (js-eval-math expr)))\n           (update-display (str res))))\n        (#t (update-display (concat expr ch))))))\n\n  (define make-btn\n    (fn (label accent)\n      (let ((cls (if accent\n                     "p-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/35 text-sky-300 border border-sky-500/30 font-mono font-semibold text-sm transition cursor-pointer"\n                     "p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-sm transition cursor-pointer")))\n        (let ((btn (el "button" (hash "class" cls) label)))\n          (on-click btn (fn () (press-key label)))\n          btn))))\n\n  (let ((keys (list "C" "(" ")" "/"\n                    "7" "8" "9" "*"\n                    "4" "5" "6" "-"\n                    "1" "2" "3" "+"\n                    "0" "." "⌫" "="))\n        (grid (el "div" (hash "class" "grid grid-cols-4 gap-2"))))\n\n    (map (fn (k)\n           (let ((is-op (or (= k "=") (= k "C") (= k "/") (= k "*") (= k "-") (= k "+"))))\n             (append-child! grid (make-btn k is-op))))\n         keys)\n\n    (let ((root (el "div" (hash "class" "p-4 flex flex-col h-full bg-slate-900/60")\n                    display\n                    grid)))\n      (create-window "Lisp Calculator" 280 370 root))))\n',
    '/apps/editor.lisp': '; /apps/editor.lisp — Open, edit, save & run any VFS file\n(eval-file "/apps/file-manager.lisp")\n\n(let ((path-input (el "input" (hash "class" "bg-black/50 border border-slate-700 rounded px-2 py-1 text-xs text-white focus:outline-none flex-1 font-mono" "value" "noname" "placeholder" "noname or /path")))\n      (textarea (el "textarea" (hash "class" "flex-1 bg-[#0c1019] text-slate-100 p-2 font-mono text-xs focus:outline-none resize-none")))\n      (load-btn (el "button" (hash "class" "px-2 py-1 bg-white/10 text-xs rounded") "Load"))\n      (save-btn (el "button" (hash "class" "px-2 py-1 bg-os-mint text-slate-950 text-xs font-semibold rounded") "Save"))\n      (run-btn (el "button" (hash "class" "px-2 py-1 bg-os-accent/20 text-os-accent text-xs font-semibold rounded") "Run")))\n  (define current-path\n    (fn ()\n      (let ((p (get-val path-input)))\n        (if (or (= p "") (= p "noname")) nil p))))\n  (define load-file\n    (fn (p)\n      (set-val! path-input p)\n      (set-val! textarea (fs-read p))))\n  (define do-load\n    (fn ()\n      (pick-file "Open File"\n        (fn (p) (load-file p))\n        (fs-parent-dir (if (current-path) (current-path) "/")))))\n  (define do-save\n    (fn ()\n      (let ((p (current-path)))\n        (if p\n            (fs-write p (get-val textarea))\n            (pick-file "Save File"\n              (fn (sel)\n                (set-val! path-input sel)\n                (fs-write sel (get-val textarea)))\n              (fs-parent-dir (if (current-path) (current-path) "/")))))))\n  (define do-run\n    (fn ()\n      (lisp-run-console (concat "Run: " (get-val path-input)) (get-val textarea))))\n  (on-click load-btn do-load)\n  (on-click save-btn do-save)\n  (on-click run-btn do-run)\n  (on-keydown path-input (fn (e)\n    (if (= (event-key e) "Enter")\n        (if (current-path) (load-file (get-val path-input)) (notify "Editor" "Type a path or press Save to pick one."))\n        nil)))\n  (set-val! textarea "")\n  (create-window "Lisp Editor" 560 380\n    (el "div" (hash "class" "flex flex-col h-full bg-[#0c1019]")\n        (el "div" (hash "class" "p-2 border-b border-os-border flex gap-2 items-center")\n            path-input load-btn save-btn run-btn)\n        textarea)))\n',
    '/apps/file-manager.lisp': '; /apps/file-manager.lisp — Minimal VFS file manager / picker\n; (pick-file title on-pick [start-dir]) — calls on-pick with the chosen file path.\n\n(define cadr (fn (lst) (car (cdr lst))))\n(define caddr (fn (lst) (car (cdr (cdr lst)))))\n(define starts-with (fn (s prefix)\n  (if (< (length s) (length prefix)) #f\n      (= (slice s 0 (length prefix)) prefix))))\n(define nth (fn (n lst)\n  (if (= n 0) (car lst) (nth (- n 1) (cdr lst)))))\n\n(define pick-file\n  (fn (title on-pick start-dir)\n    (let ((current-dir (if start-dir (fs-normalize-path start-dir) "/"))\n          (history (list current-dir))\n          (history-index 0)\n          (sel-path nil)\n          (sel-is-dir nil)\n          (sel-btn nil)\n          (list-box (el "div" (hash "class" "flex-1 overflow-auto p-2 space-y-0.5 font-mono text-[11px]")))\n          (up-btn (el "button" (hash "class" "px-2 py-0.5 rounded bg-white/10 text-slate-300 text-xs hover:bg-white/20") "↑ Up"))\n          (back-btn (el "button" (hash "class" "px-2 py-0.5 rounded bg-white/10 text-slate-300 text-xs hover:bg-white/20") "◀ Back"))\n          (forward-btn (el "button" (hash "class" "px-2 py-0.5 rounded bg-white/10 text-slate-300 text-xs hover:bg-white/20") "Forward ▶"))\n          (home-btn (el "button" (hash "class" "px-2 py-0.5 rounded bg-white/10 text-slate-300 text-xs hover:bg-white/20") "⌂ Home"))\n          (location-input (el "input" (hash "class" "flex-1 bg-black/40 border border-os-border rounded px-2 py-0.5 text-xs text-white focus:outline-none focus:border-os-accent font-mono") "/"))\n          (new-file-btn (el "button" (hash "class" "px-2 py-0.5 rounded bg-os-accent/20 text-os-accent text-[11px]") "+ File"))\n          (new-folder-btn (el "button" (hash "class" "px-2 py-0.5 rounded bg-os-accent/20 text-os-accent text-[11px]") "+ Folder"))\n          (move-btn (el "button" (hash "class" "px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 text-[11px] hover:bg-sky-500/30") "Move"))\n          (rename-btn (el "button" (hash "class" "px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[11px] hover:bg-amber-500/30") "Rename"))\n          (delete-btn (el "button" (hash "class" "px-2 py-0.5 rounded bg-rose-500/20 text-rose-400 text-[11px] hover:bg-rose-500/30") "Delete"))\n          (refresh-btn (el "button" (hash "class" "px-2 py-0.5 rounded bg-white/10 text-slate-300 text-[11px] hover:bg-white/20") "↻"))\n          (root (el "div" (hash "class" "flex flex-col h-full bg-[#0c1019]")\n                    (el "div" (hash "class" "flex items-center gap-1.5 p-2 border-b border-os-border bg-[#131826]")\n                        back-btn forward-btn up-btn home-btn refresh-btn)\n                    (el "div" (hash "class" "flex items-center gap-1.5 px-2 py-1 border-b border-os-border bg-[#101521]")\n                        (el "span" (hash "class" "text-os-muted text-[11px] font-mono") "Path:")\n                        location-input)\n                    (el "div" (hash "class" "flex items-center gap-1.5 px-2 py-1 border-b border-os-border bg-[#131826]")\n                        new-file-btn new-folder-btn rename-btn move-btn delete-btn)\n                    list-box)))\n      (define select\n        (fn (path is-dir btn)\n          (if sel-btn (remove-class sel-btn "bg-white/10") nil)\n          (add-class btn "bg-white/10")\n          (set! sel-btn btn)\n          (set! sel-path path)\n          (set! sel-is-dir is-dir)))\n      (define navigate\n        (fn (dir)\n          (if (starts-with dir "/")\n              (begin\n                (set! history (append (slice history 0 (+ history-index 1)) (list dir)))\n                (set! history-index (+ history-index 1))\n                (set! current-dir dir)\n                (refresh))\n              (notify "File Manager" "Path must start with /"))))\n      (define refresh\n        (fn ()\n          (set-html! list-box "")\n          (set! sel-path nil)\n          (set! sel-is-dir nil)\n          (set! sel-btn nil)\n          (map (fn (entry)\n                 (let ((name (car entry))\n                       (path (cadr entry))\n                       (is-dir (caddr entry))\n                       (btn (el "button" (hash "class" "w-full text-left px-2 py-1 rounded truncate hover:bg-white/10 text-slate-300")\n                               (if is-dir (concat "📁 " name) (concat "📄 " name)))))\n                   (on-click btn (fn () (select path is-dir btn)))\n                   (on-dblclick btn (fn ()\n                     (if is-dir\n                         (navigate path)\n                         (begin (on-pick path) (close-window win-id)))))\n                   (append-child! list-box btn)))\n               (fs-list-dir current-dir))\n          (set-val! location-input current-dir)))\n      (define go-back\n        (fn ()\n          (if (> history-index 0)\n              (begin (set! history-index (- history-index 1))\n                     (set! current-dir (nth history-index history))\n                     (refresh))\n              nil)))\n      (define go-forward\n        (fn ()\n          (if (< history-index (- (length history) 1))\n              (begin (set! history-index (+ history-index 1))\n                     (set! current-dir (nth history-index history))\n                     (refresh))\n              nil)))\n      (define new-file\n        (fn ()\n          (let ((name (prompt "New file name:" "")))\n            (if (and name (not (= name "")))\n                (fs-write (fs-join current-dir name) "")\n                nil)\n            (refresh))))\n      (define new-folder\n        (fn ()\n          (let ((name (prompt "New folder name:" "")))\n            (if (and name (not (= name "")))\n                (fs-write (fs-join current-dir name ".keep") "")\n                nil)\n            (refresh))))\n      (define require-selection\n        (fn ()\n          (if (not sel-path) (notify "File Manager" "Select a file or folder first.") sel-path)))\n\n      (define rename-selected\n        (fn ()\n          (if (not (require-selection))\n              nil\n              (let ((new-name (prompt "Rename to:" (fs-basename sel-path))))\n                (if (and new-name (not (= new-name "")))\n                    (let ((new-path (fs-join (fs-parent-dir sel-path) new-name)))\n                      (if sel-is-dir\n                          (let ((old-prefix (concat sel-path "/")))\n                            (map (fn (p)\n                                   (let ((rel (slice p (length old-prefix))))\n                                     (fs-rename p (fs-join new-path rel))))\n                                 (filter (fn (p) (starts-with p old-prefix)) (fs-list))))\n                          (fs-rename sel-path new-path)))\n                    nil)))\n          (refresh)))\n\n      (define delete-selected\n        (fn ()\n          (if (not (require-selection))\n              nil\n              (if (confirm (concat "Delete " sel-path "?"))\n                  (if sel-is-dir\n                      (map fs-delete\n                           (filter (fn (p) (starts-with p (concat sel-path "/"))) (fs-list)))\n                      (fs-delete sel-path))\n                  nil))\n          (refresh)))\n\n      (define move-selected\n        (fn ()\n          (if (not sel-path)\n              (notify "File Manager" "Select a file or folder first.")\n              (let ((dest (prompt "Move to directory:" current-dir)))\n                (if (and dest (not (= dest "")))\n                    (let ((dest-dir (fs-normalize-path dest)))\n                      (if sel-is-dir\n                          (let ((old-prefix (concat sel-path "/"))\n                                (new-base (fs-join dest-dir (fs-basename sel-path))))\n                            (map (fn (p)\n                                   (let ((rel (slice p (length old-prefix))))\n                                     (fs-copy p (fs-join new-base rel))\n                                     (fs-delete p)))\n                                 (filter (fn (p) (starts-with p old-prefix)) (fs-list))))\n                          (fs-rename sel-path (fs-join dest-dir (fs-basename sel-path))))\n                      (refresh))\n                    nil)))))\n      (on-click back-btn go-back)\n      (on-click forward-btn go-forward)\n      (on-click up-btn (fn () (navigate (fs-parent-dir current-dir))))\n      (on-click home-btn (fn () (navigate "/")))\n      (on-click refresh-btn refresh)\n      (on-click new-file-btn new-file)\n      (on-click new-folder-btn new-folder)\n      (on-click move-btn move-selected)\n      (on-click rename-btn rename-selected)\n      (on-click delete-btn delete-selected)\n      (on-keydown location-input (fn (e)\n        (if (= (event-key e) "Enter")\n            (let ((p (fs-normalize-path (get-val location-input))))\n              (navigate p))\n            nil)))\n      (refresh)\n      (define win-id (create-window title 460 400 root)))))\n',
    '/apps/repl.lisp': '; /apps/repl.lisp — A tiny Lisp REPL written in Lisp\n; Can be launched as an app (opens the window) and used as a library:\n;   (repl-run code) — evaluates code, records it in the history,\n;   opening the window on first use.\n\n(define repl-out nil)\n(define repl-hist "")\n\n(define repl-append (fn (text)\n  (set! repl-hist (concat repl-hist text))\n  (if repl-out (set-text! repl-out repl-hist) nil)))\n\n(define repl-run (fn (code)\n  (repl-ensure-window)\n  (let ((res (eval-str-catch code)))\n    (if (hash-get res "ok")\n        (repl-append (concat "\\n> " code "\\n=> " (str (hash-get res "value")) "\\n"))\n        (repl-append (concat "\\n> " code "\\n✖ " (str (hash-get res "error")) "\\n"))))\n  nil))\n\n(define repl-ensure-window\n  (fn ()\n    (if repl-out\n        (set-text! repl-out repl-hist)\n        (let ((out (el "div" (hash "class" "flex-1 overflow-y-auto p-3 font-mono text-xs whitespace-pre-wrap text-slate-200 selectable")))\n              (input (el "textarea" (hash "class" "flex-1 h-24 bg-[#131826] border border-os-border text-white px-2 py-1 font-mono text-xs focus:outline-none resize-none placeholder:text-slate-600" "placeholder" "λ>")))\n              (btn (el "button" (hash "class" "px-3 bg-os-accent text-slate-950 text-xs font-bold rounded self-stretch") "Eval")))\n          (define do-eval\n            (fn ()\n              (let ((code (get-val input)))\n                (if (not (= code ""))\n                    (begin (repl-run code) (set-val! input ""))\n                    nil))))\n          (on-click btn do-eval)\n          (on-keydown input (fn (e)\n            (if (and (= (event-key e) "Enter") (event-shift? e))\n                (begin (event-prevent! e) (do-eval))\n                nil)))\n          (set! repl-out out)\n          (set-text! out repl-hist)\n          (create-window "Lisp REPL" 460 340\n            (el "div" (hash "class" "flex flex-col h-full bg-[#0c1019]")\n                out\n                (el "div" (hash "class" "p-2 border-t border-os-border flex gap-2 items-stretch")\n                    input btn)))))))\n\n; Open the window when launched as an app (eval-file from the desktop icon).\n; The editor also eval-files this, lazily, on first Run.\n(repl-ensure-window)\n',
    '/apps/todo.lisp': '; /apps/todo.lisp — Persistent To-Do List App built in Lisp\n(let ((items (list "Explore the Lisp REPL" "Edit /init.lisp" "Build a custom OS widget"))\n      (list-box (el "div" (hash "class" "flex-1 overflow-y-auto space-y-1.5 pr-1")))\n      (input (el "input" (hash "type" "text"\n                               "placeholder" "Add a new task..."\n                               "class" "flex-1 bg-black/50 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white focus:outline-none focus:border-sky-400"))))\n\n  (define render-todos\n    (fn ()\n      (set-html! list-box "")\n      (map (fn (item)\n             (let ((row (el "div" (hash "class" "flex items-center justify-between bg-slate-800/70 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200")))\n                   (lbl (el "span" (hash "class" "truncate pr-2") item))\n                   (del (el "button" (hash "class" "text-rose-400 hover:text-rose-300 font-mono px-1.5 cursor-pointer") "✕")))\n               (on-click del (fn ()\n                               (set! items (filter (fn (x) (not (= x item))) items))\n                               (render-todos)))\n               (append-child! row lbl)\n               (append-child! row del)\n               (append-child! list-box row)))\n           items)))\n\n  (define add-todo\n    (fn ()\n      (let ((txt (get-val input)))\n        (if (not (= txt ""))\n            (begin\n              (set! items (append items (list txt)))\n              (set-val! input "")\n              (render-todos))\n            nil))))\n\n  (let ((add-btn (el "button" (hash "class" "px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium cursor-pointer") "Add")))\n    (on-click add-btn add-todo)\n    (render-todos)\n    (let ((root (el "div" (hash "class" "p-4 flex flex-col h-full gap-3")\n                    (el "div" (hash "class" "flex gap-2") input add-btn)\n                    list-box)))\n      (create-window "Lisp To-Do List" 330 360 root))))\n',
    '/init.lisp': '; /init.lisp — Executed automatically when LambdaOS boots!\n(notify "λOS Booted" "init.lisp loaded from SQLite backend.")\n\n(add-desktop-icon "Calc" "🧮"\n  (fn () (eval-file "/apps/calculator.lisp")))\n\n(add-desktop-icon "Todo" "📝"\n  (fn () (eval-file "/apps/todo.lisp")))\n\n(add-desktop-icon "Repl" ">_"\n  (fn () (eval-file "/apps/repl.lisp")))\n\n(add-desktop-icon "Editor" "{}"\n  (fn () (eval-file "/apps/editor.lisp")))\n\n(add-desktop-icon "API Docs" "?"\n  (fn () (eval-file "/apps/api-docs.lisp")))\n\n\n(let ((ticks 0))\n  (add-top-bar-widget "lisp-uptime"\n    (fn ()\n      (set! ticks (+ ticks 1))\n      (str "λ:" ticks "s"))))\n',
    '/myapps/a.lisp': '(+ 2 3)\n',
    '/myapps/x.lisp': '(+ 2 3)\n(- 1 2)\n',
}


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = get_db()
    try:
        conn.execute(
            """CREATE TABLE IF NOT EXISTS files (
                 path TEXT PRIMARY KEY,
                 content TEXT NOT NULL DEFAULT ''
               )"""
        )
        for path, content in DEFAULT_LISP_FILES.items():
            conn.execute(
                'INSERT OR IGNORE INTO files (path, content) VALUES (?, ?)',
                (path, content),
            )
        conn.commit()
    finally:
        conn.close()


def seed_defaults(conn):
    for path, content in DEFAULT_LISP_FILES.items():
        conn.execute('INSERT OR REPLACE INTO files (path, content) VALUES (?, ?)', (path, content))


def all_rows(conn):
    return conn.execute('SELECT path, content FROM files ORDER BY path').fetchall()


app = Bottle()


@app.get('/api/files')
def api_list_files():
    conn = get_db()
    try:
        paths = [row['path'] for row in all_rows(conn)]
        return {'files': paths}
    finally:
        conn.close()


@app.get('/api/files/<filepath:path>')
def api_read_file(filepath):
    if not filepath.startswith('/'):
        filepath = '/' + filepath
    conn = get_db()
    try:
        row = conn.execute('SELECT content FROM files WHERE path = ?', (filepath,)).fetchone()
        if row is None:
            abort(404, 'File not found')
        return {'path': filepath, 'content': row['content']}
    finally:
        conn.close()


@app.put('/api/files/<filepath:path>')
def api_write_file(filepath):
    if not filepath.startswith('/'):
        filepath = '/' + filepath
    try:
        data = request.json or {}
    except Exception:
        data = {}
    content = data.get('content', '')
    conn = get_db()
    try:
        conn.execute(
            'INSERT OR REPLACE INTO files (path, content) VALUES (?, ?)',
            (filepath, content),
        )
        conn.commit()
        return {'ok': True, 'path': filepath}
    finally:
        conn.close()


@app.delete('/api/files/<filepath:path>')
def api_delete_file(filepath):
    if not filepath.startswith('/'):
        filepath = '/' + filepath
    conn = get_db()
    try:
        conn.execute('DELETE FROM files WHERE path = ?', (filepath,))
        conn.commit()
        return {'ok': True, 'path': filepath}
    finally:
        conn.close()


@app.post('/api/reset')
def api_reset():
    conn = get_db()
    try:
        conn.execute('DELETE FROM files')
        seed_defaults(conn)
        conn.commit()
        return {'ok': True, 'files': list(DEFAULT_LISP_FILES)}
    finally:
        conn.close()


@app.get('/api/snapshot')
def api_snapshot_get():
    conn = get_db()
    try:
        return {'files': {row['path']: row['content'] for row in all_rows(conn)}}
    finally:
        conn.close()


@app.post('/api/snapshot')
def api_snapshot_post():
    try:
        data = request.json or {}
    except Exception:
        data = {}
    files = data.get('files')
    if not isinstance(files, dict):
        abort(400, 'snapshot must be an object: {"files": {path: content}}')
    conn = get_db()
    try:
        conn.execute('DELETE FROM files')
        for path, content in files.items():
            if not isinstance(path, str) or not path.startswith('/'):
                continue
            conn.execute(
                'INSERT OR REPLACE INTO files (path, content) VALUES (?, ?)',
                (path, '' if content is None else str(content)),
            )
        conn.commit()
        return {'ok': True, 'count': len(files)}
    finally:
        conn.close()


@app.get('/api/snapshot/download')
def api_snapshot_download():
    conn = get_db()
    try:
        payload = {'files': {row['path']: row['content'] for row in all_rows(conn)}}
    finally:
        conn.close()
    body = json.dumps(payload, indent=2)
    response.content_type = 'application/json'
    response.set_header('Content-Disposition', 'attachment; filename="lambda_os_snapshot.json"')
    return body


@app.post('/api/snapshot/import')
def api_snapshot_import():
    upload = request.files.get('file')
    raw = None
    if upload is not None:
        raw = upload.file.read().decode('utf-8')
    else:
        raw = request.body.read().decode('utf-8') if request.body else None
    if not raw:
        abort(400, 'No snapshot file provided')
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        abort(400, 'Invalid JSON snapshot')
    files = data.get('files') if isinstance(data, dict) else None
    if not isinstance(files, dict):
        abort(400, 'Invalid snapshot format: expected {"files": {path: content}}')
    conn = get_db()
    try:
        conn.execute('DELETE FROM files')
        for path, content in files.items():
            if not isinstance(path, str) or not path.startswith('/'):
                continue
            conn.execute(
                'INSERT OR REPLACE INTO files (path, content) VALUES (?, ?)',
                (path, '' if content is None else str(content)),
            )
        conn.commit()
        return {'ok': True, 'count': len(files)}
    finally:
        conn.close()


@app.post('/api/upload')
def api_upload():
    upload = request.files.get('file')
    if upload is None:
        abort(400, 'No file uploaded')
    name = os.path.basename(upload.filename or 'upload.bin')
    path = '/uploads/' + name
    content = upload.file.read()
    try:
        text = content.decode('utf-8')
    except UnicodeDecodeError:
        text = content.hex()
    conn = get_db()
    try:
        conn.execute(
            'INSERT OR REPLACE INTO files (path, content) VALUES (?, ?)',
            (path, text),
        )
        conn.commit()
        return {'ok': True, 'path': path}
    finally:
        conn.close()


# Static frontend (after API routes so /api/* is never shadowed)
@app.get('/static/<filepath:path>')
def static_assets(filepath):
    return static_file(filepath, root=str(ROOT))


@app.get('/')
def index_page():
    return static_file('index.html', root=str(ROOT))


@app.get('/<filename:path>')
def static_catchall(filename):
    return static_file(filename, root=str(ROOT))


if __name__ == '__main__':
    init_db()
    print(f'LambdaOS serving on http://localhost:{PORT}')
    app.run(host=HOST, port=PORT, debug=False, reloader=False)
