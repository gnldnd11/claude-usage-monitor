// A small DOM for tests: HTML parser, selectors and serializer, so the webview code runs without jsdom
// (no dependencies). Supports tags, attributes, text, comments, void and self-closing elements, raw
// style/script, selectors (tag #id .class [a] [a="v"] :not(...), descendant, comma), classList, hidden,
// disabled, title, textContent, innerHTML, children, closest, contains, bubbling events, click(), and a
// minimal focus model: activeElement, focus()/blur(), keys dispatched from the focused element with
// Enter's default action pressing a focused button (as Chromium does).
'use strict';
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);
const RAW = new Set(['style', 'script']);

function decode(s) {
  return s.replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (m, e) => {
    const l = e.toLowerCase();
    if (l === 'amp') return '&'; if (l === 'lt') return '<'; if (l === 'gt') return '>';
    if (l === 'quot') return '"'; if (l === 'apos') return "'"; if (l === 'nbsp') return ' ';
    return String.fromCodePoint(l[1] === 'x' ? parseInt(l.slice(2), 16) : parseInt(l.slice(1), 10));
  });
}
const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

class Text {
  constructor(t) { this.nodeType = 3; this.data = t; this.parentNode = null; }
  get textContent() { return this.data; }
}

function parseStyle(el, css) {
  for (const part of String(css || '').split(';')) {
    const i = part.indexOf(':'); if (i < 0) continue;
    const k = part.slice(0, i).trim().replace(/-([a-z])/g, (m, c) => c.toUpperCase());
    el.style[k] = part.slice(i + 1).trim();
  }
}

class Element {
  constructor(tag, attrs, doc) {
    this.nodeType = 1; this.localName = tag.toLowerCase(); this.tagName = tag.toUpperCase();
    this.attrs = attrs || {}; this.childNodes = []; this.parentNode = null; this.ownerDocument = doc;
    this.style = { setProperty() {}, removeProperty() {} };
    parseStyle(this, this.attrs.style);
    this._ls = {};
    this.clientWidth = 0; this.scrollWidth = 0; this.offsetWidth = 0; this.offsetHeight = 0;
  }
  get children() { return this.childNodes.filter((n) => n.nodeType === 1); }
  get firstElementChild() { return this.children[0] || null; }
  getAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k) ? this.attrs[k] : null; }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'style') parseStyle(this, v); }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return Object.prototype.hasOwnProperty.call(this.attrs, k); }
  get id() { return this.attrs.id || ''; }
  get className() { return this.attrs.class || ''; }
  set className(v) { this.attrs.class = String(v); }
  get classList() {
    const self = this;
    const list = () => (self.attrs.class || '').split(/\s+/).filter(Boolean);
    const set = (a) => { self.attrs.class = a.join(' '); };
    return {
      contains: (c) => list().includes(c),
      add: (...cs) => { const a = list(); cs.forEach((c) => { if (!a.includes(c)) a.push(c); }); set(a); },
      remove: (...cs) => set(list().filter((c) => !cs.includes(c))),
      toggle: (c, on) => { const has = list().includes(c); if (on === undefined) on = !has; if (on && !has) set(list().concat(c)); if (!on && has) set(list().filter((x) => x !== c)); return on; }
    };
  }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(v) { if (v) this.attrs.hidden = ''; else delete this.attrs.hidden; }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(v) { if (v) this.attrs.disabled = ''; else delete this.attrs.disabled; }
  get title() { return this.attrs.title || ''; }
  set title(v) { this.attrs.title = String(v); }
  get value() { return this.attrs.value || ''; }
  set value(v) { this.attrs.value = String(v); }
  get checked() { return this.hasAttribute('checked'); }
  set checked(v) { if (v) this.attrs.checked = ''; else delete this.attrs.checked; }
  get textContent() { return this.childNodes.map((n) => n.textContent).join(''); }
  set textContent(v) { this.childNodes.forEach((n) => { n.parentNode = null; }); this.childNodes = []; this.appendChild(new Text(String(v))); }
  get innerHTML() { return this.childNodes.map(serialize).join(''); }
  set innerHTML(html) { this.childNodes.forEach((n) => { n.parentNode = null; }); this.childNodes = []; parseInto(this, String(html), this.ownerDocument); }
  get content() { return this; } // <template>: good enough here
  appendChild(n) { if (n.parentNode) n.parentNode.removeChild(n); n.parentNode = this; this.childNodes.push(n); return n; }
  removeChild(n) { const i = this.childNodes.indexOf(n); if (i >= 0) this.childNodes.splice(i, 1); n.parentNode = null; return n; }
  querySelector(sel) { return queryAll(this, sel, true)[0] || null; }
  querySelectorAll(sel) { return queryAll(this, sel, false); }
  closest(sel) { const groups = parseSelector(sel); for (let e = this; e && e.nodeType === 1; e = e.parentNode) if (groups.some((g) => matchChain(e, g))) return e; return null; }
  matches(sel) { return parseSelector(sel).some((g) => matchChain(this, g)); }
  addEventListener(t, f) { (this._ls[t] = this._ls[t] || []).push(f); }
  removeEventListener(t, f) { this._ls[t] = (this._ls[t] || []).filter((x) => x !== f); }
  dispatchEvent(ev) {
    ev.target = ev.target || this;
    for (let cur = this; cur; cur = cur.parentNode) {
      ev.currentTarget = cur;
      for (const f of (cur._ls[ev.type] || []).slice()) f.call(cur, ev);
      if (ev._stop) break;
    }
    return !ev.defaultPrevented;
  }
  click() { if (this.disabled) return; this.dispatchEvent(makeEvent('click', {})); }
  focus() {
    if (this.disabled || this.hidden || !this.ownerDocument) return;
    this.ownerDocument.activeElement = this;
    (this.ownerDocument.focusLog = this.ownerDocument.focusLog || []).push(this.id || this.localName);
  }
  blur() { if (this.ownerDocument && this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = this.ownerDocument.body; }
  contains(n) { for (let c = n; c; c = c.parentNode) if (c === this) return true; return false; }
  getBoundingClientRect() { return { left: 0, top: 0, right: 0, bottom: 0, width: 0, height: 0 }; }
}

function makeEvent(type, props) {
  return Object.assign({ type, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this._stop = true; } }, props);
}

function serialize(n) {
  if (n.nodeType === 3) return escText(n.data);
  const a = Object.keys(n.attrs).map((k) => (n.attrs[k] === '' ? ' ' + k : ' ' + k + '="' + escAttr(n.attrs[k]) + '"')).join('');
  if (VOID.has(n.localName)) return '<' + n.localName + a + '>';
  return '<' + n.localName + a + '>' + n.childNodes.map(serialize).join('') + '</' + n.localName + '>';
}

function parseInto(root, html, doc) {
  const stack = [root];
  const top = () => stack[stack.length - 1];
  let i = 0;
  const text = (t) => { if (t) top().appendChild(new Text(decode(t))); };
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt < 0) { text(html.slice(i)); break; }
    text(html.slice(i, lt));
    if (html.startsWith('<!--', lt)) { const e = html.indexOf('-->', lt); i = e < 0 ? html.length : e + 3; continue; }
    if (html[lt + 1] === '!') { i = html.indexOf('>', lt) + 1; continue; }
    if (html[lt + 1] === '/') {
      const e = html.indexOf('>', lt), tag = html.slice(lt + 2, e).trim().toLowerCase();
      for (let k = stack.length - 1; k > 0; k--) if (stack[k].localName === tag) { stack.length = k; break; }
      i = e + 1; continue;
    }
    // open tag with attributes (quoted values may hold '>')
    let j = lt + 1; const m = /^[A-Za-z][A-Za-z0-9-]*/.exec(html.slice(j)); if (!m) { text('<'); i = lt + 1; continue; }
    const tag = m[0]; j += tag.length;
    const attrs = {}; let selfClose = false;
    for (;;) {
      while (/\s/.test(html[j])) j++;
      if (html[j] === '>') { j++; break; }
      if (html[j] === '/' && html[j + 1] === '>') { selfClose = true; j += 2; break; }
      const an = /^[^\s=>/]+/.exec(html.slice(j)); if (!an) { j++; continue; }
      j += an[0].length; let val = '';
      while (/\s/.test(html[j])) j++;
      if (html[j] === '=') {
        j++; while (/\s/.test(html[j])) j++;
        const q = html[j];
        if (q === '"' || q === "'") { const e = html.indexOf(q, j + 1); val = html.slice(j + 1, e); j = e + 1; }
        else { const vm2 = /^[^\s>]+/.exec(html.slice(j)); val = vm2 ? vm2[0] : ''; j += val.length; }
      }
      attrs[an[0].toLowerCase()] = decode(val);
    }
    const el = new Element(tag, attrs, doc);
    top().appendChild(el);
    const lname = tag.toLowerCase();
    if (RAW.has(lname)) {
      const e = html.toLowerCase().indexOf('</' + lname, j);
      el.appendChild(new Text(html.slice(j, e < 0 ? html.length : e)));
      i = e < 0 ? html.length : html.indexOf('>', e) + 1; continue;
    }
    if (!selfClose && !VOID.has(lname)) stack.push(el);
    i = j;
  }
}

// --- selectors ---
function parseCompound(s) {
  const c = { tag: null, id: null, cls: [], attrs: [], not: [] };
  let i = 0;
  const m0 = /^[A-Za-z*][A-Za-z0-9-]*/.exec(s); if (m0) { if (m0[0] !== '*') c.tag = m0[0].toLowerCase(); i = m0[0].length; }
  while (i < s.length) {
    const ch = s[i];
    if (ch === '#') { const m = /^#([\w-]+)/.exec(s.slice(i)); c.id = m[1]; i += m[0].length; }
    else if (ch === '.') { const m = /^\.([\w-]+)/.exec(s.slice(i)); c.cls.push(m[1]); i += m[0].length; }
    else if (ch === '[') { const e = s.indexOf(']', i); const body = s.slice(i + 1, e); const m = /^([\w-]+)(?:="([^"]*)"|='([^']*)'|=([^\]]*))?$/.exec(body); c.attrs.push({ k: m[1], v: m[2] != null ? m[2] : m[3] != null ? m[3] : m[4] }); i = e + 1; }
    else if (s.startsWith(':not(', i)) { let depth = 0, k = i + 4; for (; k < s.length; k++) { if (s[k] === '(') depth++; else if (s[k] === ')') { depth--; if (depth === 0) break; } } c.not.push(parseCompound(s.slice(i + 5, k))); i = k + 1; }
    else throw new Error('selector not supported: ' + s);
  }
  return c;
}
function splitTop(s, sep) { const out = []; let depth = 0, cur = ''; for (const ch of s) { if (ch === '(' || ch === '[') depth++; if (ch === ')' || ch === ']') depth--; if (depth === 0 && sep.test(ch)) { if (cur.trim()) out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
const selCache = new Map();
function parseSelector(sel) {
  if (selCache.has(sel)) return selCache.get(sel);
  const groups = splitTop(sel, /,/).map((g) => splitTop(g, /\s/).map(parseCompound));
  selCache.set(sel, groups); return groups;
}
function matchCompound(e, c) {
  if (!e || e.nodeType !== 1) return false;
  if (c.tag && e.localName !== c.tag) return false;
  if (c.id && e.id !== c.id) return false;
  for (const k of c.cls) if (!e.classList.contains(k)) return false;
  for (const a of c.attrs) { if (!e.hasAttribute(a.k)) return false; if (a.v != null && e.attrs[a.k] !== a.v) return false; }
  for (const n of c.not) if (matchCompound(e, n)) return false;
  return true;
}
function matchChain(e, chain) {
  if (!matchCompound(e, chain[chain.length - 1])) return false;
  let k = chain.length - 2, cur = e.parentNode;
  while (k >= 0 && cur) { if (cur.nodeType === 1 && matchCompound(cur, chain[k])) k--; cur = cur.parentNode; }
  return k < 0;
}
function queryAll(root, sel, first) {
  const groups = parseSelector(sel), out = [];
  (function walk(n) {
    for (const c of n.childNodes) {
      if (c.nodeType !== 1) continue;
      if (groups.some((g) => matchChain(c, g))) { out.push(c); if (first) return true; }
      if (walk(c) && first) return true;
    }
    return false;
  })(root);
  return out;
}

function createDocument(html) {
  const doc = { _ls: {} };
  const root = new Element('#document', {}, doc);
  parseInto(root, html, doc);
  doc.root = root;
  doc.documentElement = root.querySelector('html');
  doc.body = root.querySelector('body');
  doc.getElementById = (id) => queryAll(root, '#' + id, true)[0] || null;
  doc.querySelector = (s) => root.querySelector(s);
  doc.querySelectorAll = (s) => root.querySelectorAll(s);
  doc.createElement = (t) => new Element(t, {}, doc);
  doc.addEventListener = (t, f) => { (doc._ls[t] = doc._ls[t] || []).push(f); };
  root.addEventListener = doc.addEventListener;
  doc.activeElement = doc.body;
  // A key press from the focused element (or opts.target), bubbling to document listeners. If nobody
  // prevents it, Enter and Space on a focused button press it, as the browser's default action does
  doc.pressKey = (key, opts) => {
    const target = (opts && opts.target) || doc.activeElement || doc.body;
    const ev = makeEvent('keydown', { key, target, repeat: !!(opts && opts.repeat) });
    target.dispatchEvent(ev);
    if (!ev.defaultPrevented && (key === 'Enter' || key === ' ') && target.localName === 'button') target.click();
    return ev;
  };
  doc.dispatchKey = (key, target) => doc.pressKey(key, { target: target || doc.body });
  root._ls = doc._ls; // clicks bubble up to document listeners too
  return doc;
}

module.exports = { createDocument, makeEvent };
