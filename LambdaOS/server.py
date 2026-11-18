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
    '/apps/api-docs.lisp': '; /apps/api-docs.lisp — API reference, plain Lisp\n(eval-file "/apps/gui.lisp")\n\n(gui-window "API Docs" 520 380\n  (el "div" (hash "class" "p-4 space-y-3 text-xs leading-relaxed selectable overflow-y-auto h-full")\n      (el "h2" (hash "class" "text-base font-bold text-white") "λ LambdaOS API Reference")\n      (gui-card "OS Primitives"\n        (el "ul" (hash "class" "space-y-1 font-mono text-[11px]")\n            (el "li" nil "(create-window title width height dom-el)")\n            (el "li" nil "(close-window win-id)")\n            (el "li" nil "(el tag attrs ...children)")\n            (el "li" nil "(on-click el fn) / (on-dblclick el fn) / (on-keydown el fn)")\n            (el "li" nil "(set-text! el str) / (set-html! el str) / (set-val! el str)")\n            (el "li" nil "(get-val el) / (el-value el)")\n            (el "li" nil "(fs-read path) / (fs-write path content)")\n            (el "li" nil "(fs-list) / (fs-list-dir dir) / (fs-parent-dir dir)")\n            (el "li" nil "(fs-delete path) / (fs-rename old new) / (fs-copy src dst)")\n            (el "li" nil "(eval-file path) / (eval-str code)")\n            (el "li" nil "(repl-run code) — evaluate in the Lisp REPL window")\n            (el "li" nil "(print . args) — prints to the run console")\n            (el "li" nil "(lisp-run-console title code) — run with output console")\n            (el "li" nil "(snapshot-vfs) → files / (load-vfs files)")\n            (el "li" nil "(notify title message)")\n            (el "li" nil "(add-desktop-icon label icon fn)")\n            (el "li" nil "(add-top-bar-widget id fn)")\n            (el "li" nil "(set-icon label icon-path [force]) — default icon from a .svg file in the VFS")\n            (el "li" nil "(desktop-icons) / (builtin-icon-names) / (icon-svg name [size])")\n            (el "li" nil "(get-setting key) / (set-setting! key value) / (del-setting! key)")\n            (el "li" nil "(refresh-desktop-icons)")\n            (el "li" nil "(fs-upload-browse! dirGetter on-done [ask-overwrite]) / (fs-upload-drop! el dirGetter on-done [ask-overwrite])")\n            (el "li" nil "  ask-overwrite is called as (ask-overwrite path) before overwriting; return truthy to overwrite, falsy to skip.")\n            (el "li" nil "(fs-snapshot-files!) → ((path bytes) ...) / (fs-download-snapshot!)")\n            (el "li" nil "(fs-download-file! path) — download a VFS file to the browser")\n            (el "li" nil "(fs-pick-restore! cb) / (fs-restore-drop! el cb) / (fs-do-restore!) — cb args: [count bytes paths...] or nil")))\n      (gui-card "GUI Library — /apps/gui.lisp"\n        (el "ul" (hash "class" "space-y-1 font-mono text-[11px]")\n            (el "li" nil "(eval-file \\"/apps/gui.lisp\\"), then use the gui-* functions:")\n            (el "li" nil "(gui-window title width height body) — themed window; body may be a kids list")\n            (el "li" nil "(gui-col & kids) / (gui-row & kids) — padded flex column / row (gui-app-root aliases gui-col)")\n            (el "li" nil "(gui-header & kids) / (gui-footer & kids) — bordered top / bottom bars")\n            (el "li" nil "(gui-section text) / (gui-label text) / (gui-status text)")\n            (el "li" nil "(gui-input value placeholder [extra-class])")\n            (el "li" nil "(gui-btn text variant on-click [extra-class])")\n            (el "li" nil "  variant: ghost accent mint danger amber emerald sky")\n            (el "li" nil "(gui-icon name size cls) / (gui-icon-html svg cls) / (gui-empty text)")\n            (el "li" nil "(gui-banner kind & kids) — kind: danger amber sky")\n            (el "li" nil "(gui-card title & kids) / (gui-drop-zone [extra-class] & kids)")\n            (el "li" nil "(gui-list) / (gui-list-clear! box) / (gui-list-row box text [icon])")\n            (el "li" nil "(gui-render! box items render-fn)")\n            (el "li" nil "Used by: editor, file-manager, upload-file, backup-vps, restore-vps, todo, repl, calculator, api-docs")))))\n',
    '/apps/backup-vps.lisp': '; /apps/backup-vps.lisp — Download a snapshot of the current VFS\n(eval-file "/apps/gui.lisp")\n(define cadr (fn (lst) (car (cdr lst))))\n(define fmt-bytes (fn (n)\n  (if (< n 1024) (concat (str n) " B")\n      (if (< n 1048576) (concat (str (floor (/ n 1024))) " KB")\n          (concat (str (floor (/ n 1048576))) " MB")))))\n(define sum-bytes (fn (pairs)\n  (if (= (length pairs) 0) 0\n      (+ (cadr (car pairs)) (sum-bytes (cdr pairs))))))\n\n(let ((summary (el "div" (hash "class" "text-[11px] text-emerald-300 font-mono truncate") "Loading..."))\n      (list-box (gui-list))\n      (download-btn (gui-btn "" "emerald" nil "w-full flex items-center justify-center gap-2"))\n      (refresh-btn (gui-btn "Refresh" "ghost" nil))\n      (root (el "div" (hash "class" "flex flex-col h-full bg-[#0c1019]")\n                (gui-header summary refresh-btn)\n                list-box\n                (gui-footer download-btn))))\n  (set-html! download-btn (concat (icon-svg "save" 14) " Download snapshot"))\n  (define refresh (fn ()\n    (set-text! summary "Loading...")\n    (let ((pairs (fs-snapshot-files!)))\n      (gui-list-clear! list-box)\n      (map (fn (pair)\n             (let ((p (car pair))\n                   (bytes (cadr pair))\n                   (row (el "div" (hash "class" "flex items-center justify-between gap-2 text-slate-300 px-1"))))\n               (append-child! row (el "span" (hash "class" "truncate") p))\n               (append-child! row (el "span" (hash "class" "text-os-muted shrink-0") (fmt-bytes bytes)))\n               (append-child! list-box row)))\n           pairs)\n      (set-text! summary (concat (str (length pairs)) " files · " (fmt-bytes (sum-bytes pairs)))))))\n  (on-click refresh-btn (fn () (refresh)))\n  (on-click download-btn (fn () (fs-download-snapshot!)))\n  (refresh)\n  (gui-window "Backup VFS" 440 460 root))\n',
    '/apps/calculator.lisp': '; /apps/calculator.lisp\n(eval-file "/apps/gui.lisp")\n\n(let ((expr "")\n      (display (el "div"\n                   (hash "class" "w-full bg-black/60 border border-slate-700 rounded-lg p-3 text-right font-mono text-xl text-sky-300 overflow-x-auto overflow-y-hidden mb-3 min-h-[48px]")\n                   "0")))\n\n  (define update-display\n    (fn (val)\n      (set! expr val)\n      (set-text! display (if (= expr "") "0" expr))))\n\n  (define press-key\n    (fn (ch)\n      (cond\n        ((= ch "C") (update-display ""))\n        ((= ch "⌫") (update-display (slice expr 0 (- (length expr) 1))))\n        ((= ch "=")\n         (let ((res (js-eval-math expr)))\n           (update-display (str res))))\n        (#t (update-display (concat expr ch))))))\n\n  (define make-btn\n    (fn (label accent)\n      (let ((cls (if accent\n                     "p-2.5 rounded-lg bg-sky-500/20 hover:bg-sky-500/35 text-sky-300 border border-sky-500/30 font-mono font-semibold text-sm transition cursor-pointer"\n                     "p-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 border border-slate-700 font-mono text-sm transition cursor-pointer")))\n        (let ((btn (el "button" (hash "class" cls) label)))\n          (on-click btn (fn () (press-key label)))\n          btn))))\n\n  (let ((keys (list "C" "(" ")" "/"\n                    "7" "8" "9" "*"\n                    "4" "5" "6" "-"\n                    "1" "2" "3" "+"\n                    "0" "." "⌫" "="))\n        (grid (el "div" (hash "class" "grid grid-cols-4 gap-2"))))\n\n    (map (fn (k)\n           (let ((is-op (or (= k "=") (= k "C") (= k "/") (= k "*") (= k "-") (= k "+"))))\n             (append-child! grid (make-btn k is-op))))\n         keys)\n\n    (let ((root (el "div" (hash "class" "p-4 flex flex-col h-full bg-slate-900/60")\n                    display\n                    grid)))\n      (gui-window "Lisp Calculator" 280 370 root))))\n',
    '/apps/download-file.lisp': '; /apps/download-file.lisp — Open the file manager and download the highlighted file.\n; Double-click a file (or select it and press the Download button) to download it to your browser.\n(eval-file "/apps/file-manager.lisp")\n\n(pick-file "Download File" (fn (sel) nil) "/" nil true)\n',
    '/apps/editor.lisp': '; /apps/editor.lisp — Open, edit, save & run any VFS file\n(eval-file "/apps/file-manager.lisp")\n(eval-file "/apps/gui.lisp")\n\n(let ((path-input (gui-input "noname" "noname or /path" "flex-1 font-mono text-xs text-white focus:border-os-accent"))\n      (textarea (el "textarea" (hash "class" "flex-1 bg-[#151a28] text-slate-100 p-2 font-mono text-xs focus:outline-none resize-none")))\n      (load-btn (gui-btn "Load" "ghost" nil))\n      (save-btn (gui-btn "Save" "mint" nil))\n      (run-btn (gui-btn "Run" "accent" nil)))\n  (define current-path\n    (fn ()\n      (let ((p (get-val path-input)))\n        (if (or (= p "") (= p "noname")) nil p))))\n  (define load-file\n    (fn (p)\n      (set-val! path-input p)\n      (set-val! textarea (fs-read p))))\n  (define do-load\n    (fn ()\n      (let ((p (current-path)))\n        (pick-file "Open File"\n          (fn (sel) (load-file sel))\n          (if p (fs-parent-dir p) "/")))))\n  (define do-save\n    (fn ()\n      (let ((p (current-path)))\n        (pick-file "Save File"\n          (fn (sel)\n            (set-val! path-input sel)\n            (fs-write sel (get-val textarea))\n            (notify "Editor" (concat "Saved to " sel)))\n          (if p (fs-parent-dir p) "/")\n          p))))\n  (define do-run\n    (fn ()\n      (lisp-run-console (concat "Run: " (get-val path-input)) (get-val textarea))))\n  (on-click load-btn do-load)\n  (on-click save-btn do-save)\n  (on-click run-btn do-run)\n  (on-keydown path-input (fn (e)\n    (if (= (event-key e) "Enter")\n        (if (current-path) (load-file (get-val path-input)) (notify "Editor" "Type a path or press Save to pick one."))\n        nil)))\n  (set-val! textarea "")\n  (gui-window "Lisp Editor" 560 380\n    (gui-col\n        (gui-row path-input load-btn save-btn run-btn)\n        textarea)))\n',
    '/apps/file-icons.lisp': '; /apps/file-icons.lisp — File & folder icons for the file manager (inline SVG)\n; Shared, side-effect-free icon library. Loaded by /apps/file-manager.lisp.\n; Edit this file to customize the icons. icon-folder / icon-file / icon-code\n; are raw SVG strings; (icon-for name is-dir) picks one per entry.\n(define icon-folder "<svg width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'#fbbf24\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z\'/></svg>")\n(define icon-file "<svg width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'#94a3b8\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><path d=\'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z\'/><polyline points=\'14 2 14 8 20 8\'/></svg>")\n(define icon-code "<svg width=\'16\' height=\'16\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'#7dd3fc\' stroke-width=\'2\' stroke-linecap=\'round\' stroke-linejoin=\'round\'><polyline points=\'16 18 22 12 16 6\'/><polyline points=\'8 6 2 12 8 18\'/></svg>")\n\n(define icon-for\n  (fn (name is-dir)\n    (if is-dir\n        icon-folder\n        (let ((ext (fs-ext name)))\n          (if (or (= ext "lisp") (= ext "js") (= ext "py") (= ext "json") (= ext "sh") (= ext "html") (= ext "css"))\n              icon-code\n              icon-file)))))\n',
    '/apps/file-manager.lisp': '; /apps/file-manager.lisp — Minimal VFS file manager / picker.\n; (pick-file title on-pick [start-dir] [select-target] [download?]) — calls on-pick with the chosen path.\n; dblclick a folder to enter it; dblclick a file calls on-pick (or downloads it when download? is truthy).\n; Rename doubles as Move: give it a full path, e.g. /apps/x.lisp -> /backup/x.lisp.\n(eval-file "/apps/file-icons.lisp")\n(eval-file "/apps/gui.lisp")\n\n(define cadr  (fn (lst) (car (cdr lst))))\n(define caddr (fn (lst) (car (cdr (cdr lst)))))\n(define starts-with (fn (s prefix)\n  (if (< (length s) (length prefix)) #f (= (slice s 0 (length prefix)) prefix))))\n\n(define pick-file\n  (fn (title on-pick start-dir select-target download?)\n    (let ((current-dir (if start-dir (fs-normalize-path start-dir) "/"))\n          (sel-path nil)\n          (sel-is-dir nil)\n          (sel-btn nil)\n          (list-box (gui-list))\n          (up-btn (gui-btn "↑ Up" "ghost" nil))\n          (refresh-btn (gui-btn "↻" "ghost" nil))\n          (location-input (gui-input "/" "" "bg-black/40 focus:border-os-accent"))\n          (new-file-btn (gui-btn "+ File" "accent" nil))\n          (new-folder-btn (gui-btn "+ Folder" "accent" nil))\n          (rename-btn (gui-btn "Rename" "amber" nil))\n          (delete-btn (gui-btn "Delete" "danger" nil))\n          (download-btn (gui-btn "⬇ Download" "accent" nil "font-semibold"))\n          (footer (if download? (gui-footer download-btn) (el "div" (hash "class" "hidden"))))\n          (root (list\n                    (gui-header up-btn refresh-btn (gui-label "Path:") location-input)\n                    (gui-header new-file-btn new-folder-btn rename-btn delete-btn)\n                    list-box\n                    footer)))\n      (define select\n        (fn (path is-dir btn)\n          (if sel-btn (remove-class sel-btn "bg-white/10") nil)\n          (add-class btn "bg-white/10")\n          (set! sel-btn btn)\n          (set! sel-path path)\n          (set! sel-is-dir is-dir)))\n      (define navigate\n        (fn (dir)\n          (if (starts-with dir "/")\n              (begin (set! current-dir (fs-normalize-path dir))\n                     (refresh))\n              (notify "File Manager" "Path must start with /"))))\n      (define refresh\n        (fn ()\n          (set-html! list-box "")\n          (set! sel-path nil)\n          (set! sel-is-dir nil)\n          (set! sel-btn nil)\n          (map (fn (entry)\n                 (let ((name (car entry))\n                       (path (cadr entry))\n                       (is-dir (caddr entry))\n                       (btn (el "button" (hash "class" "w-full text-left px-2 py-1 rounded hover:bg-white/10 text-slate-300 flex items-center gap-1.5"))))\n                   (append-child! btn (gui-icon-html (icon-for name is-dir) "w-4 shrink-0 flex items-center"))\n                   (append-child! btn (el "span" (hash "class" "truncate") name))\n                   (on-click btn (fn () (select path is-dir btn)))\n                   (on-dblclick btn (fn ()\n                     (if is-dir\n                         (navigate path)\n                         (if download?\n                             (begin (fs-download-file! path)\n                                    (notify "Download" (concat "Downloading " path)))\n                             (begin (on-pick path) (close-window win-id))))))\n                   (append-child! list-box btn)\n                   (if (and select-target (= path select-target))\n                       (select path is-dir btn)\n                       nil)))\n               (fs-list-dir current-dir))\n          (set-val! location-input current-dir)))\n      (define new-file\n        (fn ()\n          (let ((name (prompt "New file name:" "")))\n            (if (and name (not (= name "")))\n                (fs-write (fs-join current-dir name) "")\n                nil)\n            (refresh))))\n      (define new-folder\n        (fn ()\n          (let ((name (prompt "New folder name:" "")))\n            (if (and name (not (= name "")))\n                (fs-write (fs-join current-dir name ".keep") "")\n                nil)\n            (refresh))))\n      (define require-selection\n        (fn ()\n          (if (not sel-path) (notify "File Manager" "Select a file or folder first.") sel-path)))\n      (define rename-selected\n        (fn ()\n          (if (not (require-selection))\n              nil\n              (let ((dest (prompt "Rename or move to (full path):" sel-path)))\n                (if (and dest (not (= dest "")) (not (= dest sel-path)))\n                    (if sel-is-dir\n                        (let ((old-prefix (concat sel-path "/")))\n                          (map (fn (p) (fs-rename p (concat dest (slice p (length sel-path)))))\n                               (filter (fn (p) (starts-with p old-prefix)) (fs-list))))\n                        (fs-rename sel-path dest))\n                    nil)))\n          (refresh)))\n      (define delete-selected\n        (fn ()\n          (if (not (require-selection))\n              nil\n              (if (confirm (concat "Delete " sel-path "?"))\n                  (if sel-is-dir\n                      (map fs-delete\n                           (filter (fn (p) (starts-with p (concat sel-path "/"))) (fs-list)))\n                      (fs-delete sel-path))\n                  nil))\n          (refresh)))\n      (define download-selected\n        (fn ()\n          (if (not sel-path)\n              (notify "Download" "Select a file first.")\n              (if sel-is-dir\n                  (notify "Download" "Folders can\'t be downloaded — select a file.")\n                  (begin (fs-download-file! sel-path)\n                         (notify "Download" (concat "Downloading " sel-path)))))))\n      (on-click up-btn (fn () (navigate (fs-parent-dir current-dir))))\n      (on-click refresh-btn refresh)\n      (on-click new-file-btn new-file)\n      (on-click new-folder-btn new-folder)\n      (on-click rename-btn rename-selected)\n      (on-click delete-btn delete-selected)\n      (on-click download-btn download-selected)\n      (on-keydown location-input (fn (e)\n        (if (= (event-key e) "Enter")\n            (navigate (get-val location-input))\n            nil)))\n      (refresh)\n      (define win-id (gui-window title 460 400 root)))))\n',
    '/apps/gui.lisp': '; /apps/gui.lisp — Minimal GUI library for LambdaOS apps.\n; Load with: (eval-file "/apps/gui.lisp")\n; Side-effect free: defines only gui-* symbols.\n;\n; Window / layout:\n;   (gui-window title width height body)   — themed create-window wrapper\n;   (gui-col & kids)                       — flex column root with padding + gap\n;   (gui-row & kids)                       — horizontal row\n;   (gui-header & kids)                    — row with border-b (top bar)\n;   (gui-footer & kids)                    — row with border-t (bottom bar)\n;   (gui-section text)                     — uppercase muted section label\n;   (gui-label text)                      — plain muted inline label\n;\n; Widgets:\n;   (gui-input value placeholder extra-class?)  — themed monospace input\n;   (gui-btn text variant on-click [extra])     — themed button; variant:\n;       ghost accent mint danger amber emerald sky\n;   (gui-icon name size cls)               — builtin icon container div\n;   (gui-icon-html svg cls)                — raw-SVG icon container div\n;   (gui-banner kind & kids)               — colored banner row; kind: danger amber sky\n;   (gui-card title & kids)                — panel card with accent title\n;   (gui-drop-zone [extra-class] & kids)   — dashed drop-target container\n;   (gui-list)                             — flex-1 scrollable list container\n;   (gui-list-clear! box)                  — empty it\n;   (gui-list-row box text [icon])         — append a row; icon optional\n;   (gui-render! box items render-fn)      — clear box, then map render-fn over items\n;   (gui-empty text)                       — centered muted empty-state\n;   (gui-status text)                      — footer status line\n;   (gui-app-root kids...)                 — alias of gui-col\n\n(define gui-btn-variants\n  (hash "ghost"   "px-2 py-1 rounded bg-white/10 text-slate-300 text-[11px] hover:bg-white/20"\n        "accent"  "px-2 py-1 rounded bg-os-accent/20 text-os-accent text-[11px] font-semibold hover:bg-os-accent/30"\n        "mint"    "px-2 py-1 rounded bg-os-mint text-slate-950 text-[11px] font-semibold hover:opacity-90"\n        "danger"  "px-2 py-1 rounded bg-rose-500/20 text-rose-400 text-[11px] hover:bg-rose-500/30"\n        "amber"   "px-2 py-1 rounded bg-amber-500/20 text-amber-300 text-[11px] hover:bg-amber-500/30"\n        "emerald" "px-3 py-2 rounded bg-emerald-500/20 text-emerald-400 text-[11px] font-semibold hover:bg-emerald-500/30"\n        "sky"     "px-2 py-1 rounded bg-sky-500/20 text-sky-300 text-[11px] hover:bg-sky-500/30"))\n\n(define gui-btn-base "px-2 py-1 rounded bg-white/10 text-slate-300 text-[11px] hover:bg-white/20")\n\n(define gui-window\n  (fn (title width height body)\n    (create-window title width height\n      (el "div" (hash "class" "flex flex-col h-full bg-[#0c1019]") body))))\n\n(define gui-col\n  (fn (& kids)\n    (el "div" (hash "class" "flex flex-col h-full p-3 gap-2") kids)))\n(define gui-app-root gui-col)\n\n(define gui-row (fn (& kids)\n  (el "div" (hash "class" "flex items-center gap-2") kids)))\n\n(define gui-header (fn (& kids)\n  (el "div" (hash "class" "flex items-center gap-2 px-3 py-2 border-b border-os-border") kids)))\n\n(define gui-footer (fn (& kids)\n  (el "div" (hash "class" "flex items-center gap-2 p-3 border-t border-os-border") kids)))\n\n(define gui-label\n  (fn (text)\n    (let ((d (el "span" (hash "class" "text-[11px] text-os-muted"))))\n      (set-text! d text)\n      d)))\n\n(define gui-section\n  (fn (text)\n    (let ((d (el "div" (hash "class" "text-[10px] text-os-muted uppercase tracking-wider"))))\n      (set-text! d text)\n      d)))\n\n(define gui-input\n  (fn (value placeholder & args)\n    (let ((extra (car args)))\n      (el "input" (hash "class" (concat "flex-1 bg-[#0c1019] border border-os-border rounded px-2 py-1 font-mono text-[11px] text-emerald-300 focus:outline-none"\n                                        (if extra (concat " " extra) ""))\n                        "value" value\n                        "placeholder" placeholder)))))\n\n(define gui-btn\n  (fn (text variant on-click & args)\n    (let ((extra (car args)))\n      (let ((btn (el "button" (hash "class" (concat (or (hash-get gui-btn-variants variant) gui-btn-base)\n                                                    (if extra (concat " " extra) ""))))))\n        (set-text! btn text)\n        (if on-click (on-click btn on-click) nil)\n        btn))))\n\n(define gui-icon\n  (fn (name size cls)\n    (let ((d (el "div" (hash "class" cls))))\n      (set-html! d (icon-svg name size))\n      d)))\n\n(define gui-icon-html\n  (fn (svg cls)\n    (let ((d (el "div" (hash "class" cls))))\n      (set-html! d svg)\n      d)))\n\n(define gui-banner-variants\n  (hash "danger" "px-3 py-2 rounded border border-rose-500/30 bg-rose-500/10 text-rose-400 text-[11px] leading-snug flex items-center gap-2"\n        "amber"  "px-3 py-2 rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] leading-snug flex items-center gap-2"\n        "sky"    "px-3 py-2 rounded border border-sky-500/30 bg-sky-500/10 text-sky-300 text-[11px] leading-snug flex items-center gap-2"))\n\n(define gui-banner\n  (fn (kind & kids)\n    (el "div" (hash "class" (or (hash-get gui-banner-variants kind) (hash-get gui-banner-variants "sky"))) kids)))\n\n(define gui-card\n  (fn (title & kids)\n    (let ((box (el "div" (hash "class" "p-3 rounded-xl bg-white/[0.03] border border-os-border"))))\n      (append-child! box (el "h3" (hash "class" "font-mono text-os-accent font-semibold mb-1") title))\n      (map (fn (k) (append-child! box k)) kids)\n      box)))\n\n(define gui-drop-zone\n  (fn (extra & kids)\n    (el "div" (hash "class" (concat "border-2 border-dashed border-os-border rounded-lg h-24 flex flex-col items-center justify-center gap-1 text-slate-400 hover:border-os-accent hover:text-slate-200 transition-colors cursor-pointer select-none"\n                                    (if extra (concat " " extra) "")))\n        kids)))\n\n(define gui-list\n  (fn ()\n    (el "div" (hash "class" "flex-1 overflow-y-auto p-2 space-y-1 font-mono text-[11px]"))))\n\n(define gui-list-clear!\n  (fn (box)\n    (set-html! box "")\n    box))\n\n(define gui-list-row\n  (fn (box text & args)\n    (let ((row (el "div" (hash "class" "flex items-center gap-2 px-1 py-0.5 text-slate-300"))))\n      (if (car args)\n          (append-child! row (gui-icon (car args) 12 "w-4 shrink-0 text-sky-400"))\n          nil)\n      (append-child! row (el "span" (hash "class" "truncate") text))\n      (append-child! box row)\n      row)))\n\n(define gui-render!\n  (fn (box items render-fn)\n    (gui-list-clear! box)\n    (map (fn (item) (render-fn item)) items)))\n\n(define gui-empty\n  (fn (text)\n    (let ((d (el "div" (hash "class" "flex-1 flex items-center justify-center text-[11px] text-os-muted"))))\n      (set-text! d text)\n      d)))\n\n(define gui-status\n  (fn (text)\n    (let ((d (el "div" (hash "class" "px-2 py-1 border-t border-os-border text-[10px] text-os-muted font-mono"))))\n      (set-text! d text)\n      d)))\n\n(define gui-loaded true)\n',
    '/apps/repl.lisp': '; /apps/repl.lisp — A tiny Lisp REPL written in Lisp\n; Can be launched as an app (opens the window) and used as a library:\n;   (repl-run code) — evaluates code, records it in the history,\n;   opening the window on first use.\n(eval-file "/apps/gui.lisp")\n\n(define repl-out nil)\n(define repl-hist "")\n\n(define repl-append (fn (text)\n  (set! repl-hist (concat repl-hist text))\n  (if repl-out (set-text! repl-out repl-hist) nil)))\n\n(define repl-run (fn (code)\n  (repl-ensure-window)\n  (let ((res (eval-str-catch code)))\n    (if (hash-get res "ok")\n        (repl-append (concat "\\n> " code "\\n=> " (str (hash-get res "value")) "\\n"))\n        (repl-append (concat "\\n> " code "\\n✖ " (str (hash-get res "error")) "\\n"))))\n  nil))\n\n(define repl-ensure-window\n  (fn ()\n    (if repl-out\n        (set-text! repl-out repl-hist)\n        (let ((out (el "div" (hash "class" "flex-1 overflow-y-auto p-3 font-mono text-xs whitespace-pre-wrap text-slate-200 selectable")))\n              (input (el "textarea" (hash "class" "flex-1 h-24 bg-[#131826] border border-os-border text-white px-2 py-1 font-mono text-xs focus:outline-none resize-none placeholder:text-slate-600" "placeholder" "λ>")))\n              (btn (gui-btn "Eval" "mint" nil "self-stretch px-3 font-bold")))\n          (define do-eval\n            (fn ()\n              (let ((code (get-val input)))\n                (if (not (= code ""))\n                    (begin (repl-run code) (set-val! input ""))\n                    nil))))\n          (on-click btn do-eval)\n          (on-keydown input (fn (e)\n            (if (and (= (event-key e) "Enter") (event-shift? e))\n                (begin (event-prevent! e) (do-eval))\n                nil)))\n          (set! repl-out out)\n          (set-text! out repl-hist)\n          (gui-window "Lisp REPL" 460 340\n            (list out (gui-footer input btn)))))))\n\n; Open the window when launched as an app (eval-file from the desktop icon).\n; The editor also eval-files this, lazily, on first Run.\n(repl-ensure-window)\n',
    '/apps/restore-vps.lisp': '; /apps/restore-vps.lisp — Restore the VFS from a snapshot (REPLACES ALL FILES)\n(eval-file "/apps/gui.lisp")\n(define cadr (fn (lst) (car (cdr lst))))\n(define fmt-bytes (fn (n)\n  (if (< n 1024) (concat (str n) " B")\n      (if (< n 1048576) (concat (str (floor (/ n 1024))) " KB")\n          (concat (str (floor (/ n 1048576))) " MB")))))\n\n(let ((banner (el "div" (hash "class" "px-3 pt-3")\n                  (gui-banner "danger"\n                    (el "span" (hash "class" "w-5 h-5 shrink-0 rounded-full bg-rose-500 text-slate-950 text-[10px] font-bold flex items-center justify-center") "!")\n                    (el "span" (hash "class" "") "Restoring replaces EVERY file in the VFS, including /init.lisp and your edits."))))\n      (drop-zone (gui-drop-zone "mx-3 mt-2"))\n      (info (el "div" (hash "class" "px-3 pt-2 text-[11px] font-mono text-os-muted") "No snapshot loaded"))\n      (list-box (el "div" (hash "class" "flex-1 overflow-y-auto p-2 mx-3 my-1 rounded border border-os-border/60 font-mono text-[11px]")))\n      (status (el "div" (hash "class" "px-3 text-[10px] text-os-muted font-mono") "Download a backup first if you want to keep the current VFS."))\n      (restore-btn (gui-btn "Restore VFS (replace all files)" "danger" nil "w-full py-2 text-[12px] opacity-40 pointer-events-none")))\n  (append-child! drop-zone (gui-icon "restore" 22 "text-rose-300"))\n  (append-child! drop-zone (el "div" (hash "class" "text-[12px]") "Drop lambda_os_snapshot.json here or click to browse"))\n  (define enable (fn () (remove-class restore-btn "opacity-40") (remove-class restore-btn "pointer-events-none")))\n  (define disable (fn () (add-class restore-btn "opacity-40") (add-class restore-btn "pointer-events-none")))\n  (define on-picked (fn (result)\n    (if result\n        (let ((count (car result))\n              (bytes (cadr result))\n              (paths (cdr (cdr result))))\n          (gui-list-clear! list-box)\n          (map (fn (p) (gui-list-row list-box p)) paths)\n          (set-text! info (concat (str count) " files · " (fmt-bytes bytes)))\n          (set-text! status "Snapshot parsed — review the list, then click Restore.")\n          (enable))\n        (begin\n          (set-text! info "Invalid snapshot file")\n          (set-text! status "Expected a snapshot JSON object: { files: { path: content } }")\n          (disable)))))\n  (fs-restore-drop! drop-zone on-picked)\n  (on-click drop-zone (fn () (fs-pick-restore! on-picked)))\n  (on-click restore-btn (fn () (fs-do-restore!)))\n  (gui-window "Restore VFS" 440 500\n    (list banner drop-zone info list-box status (gui-footer restore-btn))))\n',
    '/apps/todo.lisp': '; /apps/todo.lisp — Persistent To-Do List App built in Lisp\n(eval-file "/apps/gui.lisp")\n\n(let ((items (list "Explore the Lisp REPL" "Edit /init.lisp" "Build a custom OS widget"))\n      (list-box (el "div" (hash "class" "flex-1 overflow-y-auto space-y-1.5 pr-1")))\n      (input (gui-input "" "Add a new task..." "rounded-lg")))\n\n  (define render-todos\n    (fn ()\n      (set-html! list-box "")\n      (map (fn (item)\n             (let ((row (el "div" (hash "class" "flex items-center justify-between bg-slate-800/70 border border-slate-700/80 rounded-lg px-3 py-2 text-xs text-slate-200")))\n                   (lbl (el "span" (hash "class" "truncate pr-2") item))\n                   (del (el "button" (hash "class" "text-rose-400 hover:text-rose-300 font-mono px-1.5 cursor-pointer") "✕")))\n               (on-click del (fn ()\n                               (set! items (filter (fn (x) (not (= x item))) items))\n                               (render-todos)))\n               (append-child! row lbl)\n               (append-child! row del)\n               (append-child! list-box row)))\n           items)))\n\n  (define add-todo\n    (fn ()\n      (let ((txt (get-val input)))\n        (if (not (= txt ""))\n            (begin\n              (set! items (append items (list txt)))\n              (set-val! input "")\n              (render-todos))\n            nil))))\n\n  (gui-window "Lisp To-Do List" 330 360\n    (gui-col\n        (gui-row input (gui-btn "Add" "emerald" add-todo "rounded-lg"))\n        list-box))\n  (render-todos))\n',
    '/apps/upload-file.lisp': '; /apps/upload-file.lisp — Drop files into the VFS (default /uploads).\n; Overwrite of an existing file is confirmed before writing.\n(eval-file "/apps/gui.lisp")\n\n(let ((dest (gui-input "/uploads" ""))\n      (clear-btn (gui-btn "Clear" "ghost" nil "ml-auto"))\n      (drop-zone (el "div" (hash "class" "border-2 border-dashed border-os-border rounded-lg h-28 flex flex-col items-center justify-center gap-1.5 text-slate-400 hover:border-os-accent hover:text-slate-200 transition-colors cursor-pointer select-none")))\n      (list-box (gui-list))\n      (status (gui-status "No files uploaded yet"))\n      (root (gui-col\n                (gui-row (gui-label "Destination:") dest)\n                drop-zone\n                (gui-row (gui-section "Uploaded") clear-btn)\n                list-box\n                status)))\n  (append-child! drop-zone (gui-icon "upload" 26 "text-sky-300"))\n  (append-child! drop-zone (el "div" (hash "class" "text-[12px]") "Drop files here or click to browse"))\n  (define report (fn (paths)\n    (map (fn (p) (gui-list-row list-box p "upload")) paths)\n    (set-text! status (concat (str (length paths)) " file(s) uploaded"))))\n  (define clear-list (fn ()\n    (gui-list-clear! list-box)\n    (set-text! status "No files uploaded yet")))\n  (define ask-overwrite (fn (p) (confirm (concat "Overwrite " p "?"))))\n  (fs-upload-drop! drop-zone (fn () (get-val dest)) report ask-overwrite)\n  (on-click drop-zone (fn () (fs-upload-browse! (fn () (get-val dest)) report ask-overwrite)))\n  (on-click clear-btn clear-list)\n  (gui-window "Upload File" 420 430 root))\n',
    '/icons/backup-vps.svg': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='7 10 12 15 17 10'/><line x1='12' y1='15' x2='12' y2='3'/></svg>\n",
    '/icons/calc.svg': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><rect x='4' y='2' width='16' height='20' rx='2'/><line x1='8' y1='6' x2='16' y2='6'/><line x1='8' y1='12' x2='8' y2='12'/><line x1='12' y1='12' x2='12' y2='12'/><line x1='16' y1='12' x2='16' y2='12'/><line x1='8' y1='16' x2='8' y2='16'/><line x1='12' y1='16' x2='12' y2='16'/><line x1='16' y1='16' x2='16' y2='16'/></svg>\n",
    '/icons/code.svg': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='16 18 22 12 16 6'/><polyline points='8 6 2 12 8 18'/></svg>\n",
    '/icons/docs.svg': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z'/><path d='M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z'/></svg>\n",
    '/icons/download.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>\n',
    '/icons/folder.svg': '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>\n',
    '/icons/restore-vps.svg': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4'/><polyline points='17 8 12 3 7 8'/><line x1='12' y1='3' x2='12' y2='15'/></svg>\n",
    '/icons/script.svg': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='9' y1='13' x2='15' y2='13'/><line x1='9' y1='17' x2='15' y2='17'/></svg>\n",
    '/icons/terminal.svg': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='4 17 10 11 4 5'/><line x1='12' y1='19' x2='20' y2='19'/></svg>\n",
    '/icons/todo.svg': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><polyline points='9 11 12 14 22 4'/><path d='M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11'/></svg>\n",
    '/icons/upload-file.svg': "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z'/><polyline points='14 2 14 8 20 8'/><line x1='12' y1='18' x2='12' y2='12'/><polyline points='9 15 12 12 15 15'/></svg>\n",
    '/init.lisp': '; /init.lisp — Executed automatically when LambdaOS boots!\n(eval-file "/apps/file-manager.lisp")\n\n(notify "λOS Booted" "init.lisp loaded from SQLite backend.")\n\n(add-desktop-icon "Calc" "calc"\n  (fn () (eval-file "/apps/calculator.lisp")))\n\n(add-desktop-icon "Todo" "todo"\n  (fn () (eval-file "/apps/todo.lisp")))\n\n(add-desktop-icon "Repl" "terminal"\n  (fn () (eval-file "/apps/repl.lisp")))\n\n(add-desktop-icon "Editor" "code"\n  (fn () (eval-file "/apps/editor.lisp")))\n\n(add-desktop-icon "API Docs" "docs"\n  (fn () (eval-file "/apps/api-docs.lisp")))\n\n(add-desktop-icon "Upload File" "upload"\n  (fn () (eval-file "/apps/upload-file.lisp")))\n\n(add-desktop-icon "Backup VFS" "save"\n  (fn () (eval-file "/apps/backup-vps.lisp")))\n(add-desktop-icon "Restore VFS" "restore"\n  (fn () (eval-file "/apps/restore-vps.lisp")))\n\n\n(add-desktop-icon "Download File" "download"\n  (fn () (eval-file "/apps/download-file.lisp")))\n\n(add-desktop-icon "Files" "folder"\n  (fn () (pick-file "File Manager"\n            (fn (sel) (notify "Files" (concat "Selected: " sel)))\n            "/")))\n\n; Script icons, declared as editable SVG files in the VFS.\n; Ensure-semantics: skipped when an icon association already exists in the DB\n; (i.e. you set a custom icon). Pass true to force overwrite.\n(set-icon "Calc" "/icons/calc.svg")\n(set-icon "Todo" "/icons/todo.svg")\n(set-icon "Repl" "/icons/terminal.svg")\n(set-icon "Editor" "/icons/code.svg")\n(set-icon "API Docs" "/icons/docs.svg")\n(set-icon "Download File" "/icons/download.svg")\n(set-icon "Files" "/icons/folder.svg")\n(set-icon "Upload File" "/icons/upload-file.svg")\n(set-icon "Backup VFS" "/icons/backup-vps.svg")\n(set-icon "Restore VFS" "/icons/restore-vps.svg")\n\n\n(let ((ticks 0))\n  (add-top-bar-widget "lisp-uptime"\n    (fn ()\n      (set! ticks (+ ticks 1))\n      (str "λ:" ticks "s"))))\n',
    '/myapps/y.lisp': '(+ 1 2)\n',
    '/myapps/z.lisp': '(+ 1 2 3)\n',
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
        conn.execute(
            """CREATE TABLE IF NOT EXISTS kv (
                 key TEXT PRIMARY KEY,
                 value TEXT
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


@app.hook('after_request')
def add_no_store_header():
    # LambdaOS is a live SPA talking to a local backend: never let the
    # browser heuristically cache API responses or the os.js bundle.
    response.headers['Cache-Control'] = 'no-store'


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


@app.get('/api/settings')
def api_settings_get_all():
    conn = get_db()
    try:
        rows = conn.execute('SELECT key, value FROM kv ORDER BY key').fetchall()
        return {'settings': {row['key']: row['value'] for row in rows}}
    finally:
        conn.close()


@app.get('/api/settings/<key>')
def api_settings_get(key):
    conn = get_db()
    try:
        row = conn.execute('SELECT value FROM kv WHERE key = ?', (key,)).fetchone()
        return {'key': key, 'value': row['value'] if row else None}
    finally:
        conn.close()


@app.put('/api/settings/<key>')
def api_settings_put(key):
    if not key or len(key) > 256:
        abort(400, 'Invalid key')
    try:
        data = request.json or {}
    except Exception:
        data = {}
    value = data.get('value')
    conn = get_db()
    try:
        conn.execute(
            'INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)',
            (key, None if value is None else str(value)),
        )
        conn.commit()
        return {'ok': True, 'key': key}
    finally:
        conn.close()


@app.delete('/api/settings/<key>')
def api_settings_delete(key):
    conn = get_db()
    try:
        conn.execute('DELETE FROM kv WHERE key = ?', (key,))
        conn.commit()
        return {'ok': True, 'key': key}
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


# Initialize the database at import time as well: idempotent (CREATE TABLE IF NOT EXISTS +
# INSERT OR IGNORE) and makes the app work under WSGI servers / test harnesses that
# never hit the __main__ block.
init_db()

if __name__ == '__main__':
    init_db()
    print(f'LambdaOS serving on http://localhost:{PORT}')
    app.run(host=HOST, port=PORT, debug=False, reloader=False)
