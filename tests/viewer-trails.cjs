// Optional Node verification; the distributed browser app does not require Node.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/viewer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const THREE = require('../js/vendor/three.min.js');
for (const name of ['LineSegmentsGeometry', 'LineMaterial', 'LineSegments2']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js/vendor', name + '.js'), 'utf8'), { THREE, Float32Array });
}
function harness() {
    const nodes = new Map(), windowEvents = new Map(), pending = new Map();
    let next = 0;
    function element(id = '') {
        const handlers = new Map(), classes = new Set();
        const node = {
            style: {}, children: [], checked: false, value: '', clientWidth: 800, clientHeight: 600,
            classList: { add(v) { classes.add(v); }, remove(v) { classes.delete(v); }, contains(v) { return classes.has(v); }, replace(a, b) { classes.delete(a); classes.add(b); } },
            addEventListener(name, callback) { handlers.set(name, callback); },
            fire(name) { handlers.get(name)?.({ target: node }); },
            appendChild(child) { this.children.push(child); },
            setAttribute(name, value) { this[name] = value; }
        };
        let nodeId = '';
        Object.defineProperty(node, 'id', { get() { return nodeId; }, set(value) { nodeId = value; nodes.set(value, node); } });
        Object.defineProperty(node, 'innerHTML', { set() { node.children.length = 0; } });
        if (id) node.id = id;
        return node;
    }
    const document = { hidden: false, addEventListener() {}, createElement() { return element(); }, getElementById(id) { return nodes.get(id) || element(id); } };
    for (const input of html.matchAll(/<input\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const node = document.getElementById(input[1]);
        node.value = /\bvalue="([^"]*)"/.exec(input[0])?.[1] || '';
        node.checked = /\bchecked\b/.test(input[0]);
    }
    document.getElementById('mocap-viewer').classList.add('active');
    document.getElementById('playback-rate').value = '1';
    class Renderer {
        constructor(options) { this.domElement = options.canvas; this.size = new THREE.Vector2(); }
        setSize(w, h) { this.size.set(w, h); } getSize(target) { return target.copy(this.size); }
        setPixelRatio() {} render() {}
    }
    class Controls { constructor() { this.target = new THREE.Vector3(); } update() {} }
    const context = vm.createContext({
        console, Float32Array, Uint32Array, MocapCsv: { escapeHtml: String },
        THREE: { ...THREE, WebGLRenderer: Renderer, OrbitControls: Controls }, document,
        window: { devicePixelRatio: 2, addEventListener(name, cb) { windowEvents.set(name, cb); } },
        performance: { now() { return 0; } }, setTimeout(cb) { cb(); },
        requestAnimationFrame(cb) { pending.set(++next, cb); return next; }, cancelAnimationFrame(id) { pending.delete(id); }
    });
    vm.runInContext(source, context);
    return { context, nodes, pending, document, windowEvents, run(code) { return vm.runInContext(code, context); }, build(data) { context.fixture = data; vm.runInContext('buildScene(fixture)', context); } };
}
function fixture(frameCount = 6) {
    const objects = [{ name: 'body', type: 'Rigid Body' }, { name: 'body:M', type: 'Marker' }, { name: 'free', type: 'Marker' }, { name: 'missing', type: 'Marker' }];
    const positions = new Float32Array(frameCount * objects.length * 3), rotations = new Float32Array(frameCount * objects.length * 4);
    const times = new Float32Array(frameCount);
    for (let f = 0; f < frameCount; f++) {
        times[f] = f / 120;
        for (let i = 0; i < objects.length; i++) {
            const base = (f * objects.length + i) * 3;
            positions[base] = i === 3 || f === 3 ? NaN : f / 120;
            positions[base + 1] = i; positions[base + 2] = 0;
            rotations[(f * objects.length + i) * 4 + 3] = 1;
        }
    }
    return { objects, frameCount, times, positions, rotations };
}
let checks = 0;
function check(name, action) { action(); checks++; console.log('PASS', name); }
const h = harness();
h.build(fixture());
const data = () => h.run('playbackData');
check('Independent sliders initialize real width uniforms to body 3px and marker 0.5px', () => {
    assert.equal(h.nodes.get('set-rb-trail-width').value, '3');
    assert.equal(h.nodes.get('set-marker-trail-width').value, '0.5');
    data().trails.forEach((trail, i) => {
        assert.equal(trail.type, 'LineSegments2');
        assert.equal(trail.material.uniforms.linewidth.value, i === 0 ? 3 : 0.5);
        assert.deepEqual(trail.material.resolution.toArray(), [800, 600]);
    });
    assert(!html.includes('id="set-trail-width"'));
});
check('Changing either width updates existing GPU data without changing the other width', () => {
    const geometries = data().trails.map(trail => trail.geometry);
    const body = h.nodes.get('set-rb-trail-width'); body.value = '6'; body.fire('input');
    assert.equal(data().trails[0].material.uniforms.linewidth.value, 6);
    data().trails.slice(1).forEach(trail => assert.equal(trail.material.uniforms.linewidth.value, 0.5));
    const marker = h.nodes.get('set-marker-trail-width'); marker.value = '1.5'; marker.fire('input');
    assert.equal(data().trails[0].material.uniforms.linewidth.value, 6);
    data().trails.slice(1).forEach(trail => assert.equal(trail.material.uniforms.linewidth.value, 1.5));
    assert.equal(h.nodes.get('val-rb-trail-width').textContent, '6px');
    assert.equal(h.nodes.get('val-marker-trail-width').textContent, '1.5px');
    data().trails.forEach((trail, i) => assert.equal(trail.geometry, geometries[i]));
});
check('Missing frames remain gaps and all-missing objects have zero instances', () => {
    const trail = data().trails[0], start = trail.geometry.attributes.instanceStart, end = trail.geometry.attributes.instanceEnd;
    assert.deepEqual(Array.from(trail.userData.endFrames), [1, 2, 5]);
    assert.equal(start.count, 3);
    assert(Math.abs(start.getX(2) - 4 / 120) < 1e-7);
    assert(Math.abs(end.getX(2) - 5 / 120) < 1e-7);
    assert.equal(data().trails[3].geometry.attributes.instanceStart.count, 0);
    assert.equal(data().trails[3].geometry.instanceCount, 0);
});
check('Forward and backward seeks and full-trail mode select segment instances, preserving quad indices', () => {
    h.nodes.get('rb-cb-0').checked = true;
    h.nodes.get('toggle-marker-trail').checked = true;
    h.nodes.get('toggle-unassigned-marker').checked = true;
    for (const [frame, count] of [[1, 1], [5, 3], [2, 2], [3, 2], [4, 2], [0, 0]]) {
        h.run(`applyExactFrame(${frame}); updateSceneState();`);
        data().trails.slice(0, 3).forEach(trail => {
            assert.equal(trail.geometry.instanceCount, count);
            assert.equal(trail.geometry.index.count, 18);
            assert.equal(trail.geometry.drawRange.count, Infinity);
        });
    }
    const all = h.nodes.get('toggle-trail-all'); all.checked = true; all.fire('change');
    data().trails.slice(0, 3).forEach(trail => assert.equal(trail.geometry.instanceCount, 3));
    all.checked = false; all.fire('change');
    data().trails.slice(0, 3).forEach(trail => assert.equal(trail.geometry.instanceCount, 0));
});
check('Resizing and returning from another page keep widths in CSS pixels', () => {
    const container = h.nodes.get('playback-viewer'); container.clientWidth = 600; container.clientHeight = 400;
    h.windowEvents.get('resize')();
    data().trails.forEach(trail => assert.deepEqual(trail.material.resolution.toArray(), [600, 400]));
    h.windowEvents.get('mocap-pagechange')({ detail: { pageId: 'wide-area-analysis' } });
    assert.equal(h.pending.size, 0);
    container.clientWidth = 900; container.clientHeight = 300;
    h.windowEvents.get('resize')();
    data().trails.forEach(trail => assert.deepEqual(trail.material.resolution.toArray(), [600, 400]));
    h.windowEvents.get('mocap-pagechange')({ detail: { pageId: 'mocap-viewer' } });
    assert.equal(h.pending.size, 1);
    data().trails.forEach((trail, i) => {
        assert.deepEqual(trail.material.resolution.toArray(), [900, 300]);
        assert.equal(trail.material.linewidth, i === 0 ? 6 : 1.5);
    });
});
check('Replacing a file and clearing it dispose every thick-trail geometry and material', () => {
    let geometries = 0, materials = 0;
    data().trails.forEach(trail => {
        trail.geometry.addEventListener('dispose', () => geometries++);
        trail.material.addEventListener('dispose', () => materials++);
    });
    h.build(fixture());
    assert.equal(geometries, 4); assert.equal(materials, 4);
    data().trails.forEach(trail => {
        trail.geometry.addEventListener('dispose', () => geometries++);
        trail.material.addEventListener('dispose', () => materials++);
    });
    h.run('resetApp()');
    assert.equal(geometries, 8); assert.equal(materials, 8);
    assert.equal(data().trails.length, 0);
    h.build(fixture());
    assert.equal(data().trails[0].material.linewidth, 6);
    assert.equal(data().trails[1].material.linewidth, 1.5);
});
check('Long recordings retain the existing roughly 2000-point trail budget', () => {
    h.build(fixture(200000));
    data().trails.forEach(trail => assert(trail.geometry.attributes.instanceStart.count <= 2000));
});
if (process.argv[2]) check('Supplied CSV header and initial frames build body and marker trails at separate widths', () => {
    const fd = fs.openSync(process.argv[2], 'r'), buffer = Buffer.alloc(256 * 1024);
    const bytes = fs.readSync(fd, buffer); fs.closeSync(fd);
    const initial = buffer.subarray(0, bytes).toString('utf8').split('\n').slice(0, 9).join('\n');
    const holder = vm.createContext({});
    vm.runInContext(source.slice(0, source.indexOf('// 2. Main Logic')) + '\nthis.code = workerScript;', holder);
    let result;
    const worker = vm.createContext({ self: { postMessage(msg) { if (msg.type === 'complete') result = msg; else if (msg.type === 'error') throw Error(msg.message); } } });
    vm.runInContext(holder.code, worker);
    worker.self.onmessage({ data: { type: 'chunk', text: initial, isLast: true } });
    const supplied = harness(); supplied.build(result);
    const parsed = supplied.run('playbackData');
    parsed.rigidBodyIndices.forEach(idx => assert.equal(parsed.trails[idx].material.linewidth, 3));
    parsed.markerIndices.forEach(idx => assert.equal(parsed.trails[idx].material.linewidth, 0.5));
    console.log(JSON.stringify({ initialFrames: parsed.frameCount, rigidBodies: parsed.rigidBodyIndices.length, markers: parsed.markerIndices.length }));
});
console.log(checks + ' viewer trail checks passed');
