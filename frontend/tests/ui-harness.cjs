const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

function load(file, dependencies = {}) {
  const module = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  new Function('require', 'module', 'exports', code)(name => {
    if (!(name in dependencies)) throw new Error(`Unexpected dependency: ${name}`);
    return dependencies[name];
  }, module, module.exports);
  return module.exports;
}
// Execute actual components/hooks without a native runtime, storage or network.
function engine() {
  const slots = []; let cursor = 0; let effects = []; let focused = true;
  const same = (a, b) => a && a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
  const react = {
    Fragment: 'Fragment',
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = initial; return [slots[i], v => { slots[i] = typeof v === 'function' ? v(slots[i]) : v; }]; },
    useRef(initial) { const i = cursor++; return slots[i] ||= { current: initial }; },
    useCallback(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) slots[i] = { fn, deps }; return slots[i].fn; },
    useEffect(fn, deps) { const i = cursor++; if (!slots[i] || !same(slots[i].deps, deps)) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { deps, cleanup: fn() }; }); },
  };
  return { react,
    useFocusEffect(fn) { const i = cursor++; if (!slots[i] || slots[i].fn !== fn) effects.push(() => { slots[i]?.cleanup?.(); slots[i] = { focus: true, fn, cleanup: focused ? fn() : undefined }; }); },
    render(fn) { cursor = 0; effects = []; const tree = fn(); effects.forEach(f => f()); return tree; },
    blur() { focused = false; slots.filter(s => s?.focus).forEach(s => { s.cleanup?.(); s.cleanup = undefined; }); },
    focus() { focused = true; slots.filter(s => s?.focus).forEach(s => { s.cleanup = s.fn(); }); },
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));
const nodes = tree => !tree || typeof tree !== 'object' ? [] : Array.isArray(tree) ? tree.flatMap(nodes) : [tree, ...nodes(tree.props?.children)];
const text = tree => typeof tree === 'string' || typeof tree === 'number' ? String(tree) : Array.isArray(tree) ? tree.map(text).join('') : tree?.props ? text(tree.props.children) : '';
const button = (tree, label) => nodes(tree).find(n => n.type === 'TouchableOpacity' && text(n).includes(label));
const native = Object.fromEntries(['View', 'Text', 'ScrollView', 'TouchableOpacity', 'ActivityIndicator', 'Image', 'Modal'].map(n => [n, n]));
native.StyleSheet = { create: s => s };
native.Alert = { alert() {} };
const colors = new Proxy({}, { get: (_, name) => name });


module.exports = { load, engine, tick, nodes, text, button, native, colors };

