const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const analysis = fs.readFileSync(path.join(root, 'js/analysis.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'js/viewer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const THREE = require('../js/vendor/three.min.js');
for (const name of ['LineSegmentsGeometry', 'LineMaterial', 'LineSegments2']) {
    vm.runInNewContext(fs.readFileSync(path.join(root, 'js/vendor', name + '.js'), 'utf8'), { THREE, Float32Array });
}
const Papa = require('../js/vendor/papaparse.js');
function fn(source, name, indent = 12) {
    const prefix = ' '.repeat(indent), start = source.indexOf(prefix + 'function ' + name + '(');
    assert(start >= 0, name);
    const end = source.indexOf('\n' + prefix + '}', start);
    return source.slice(start, end + prefix.length + 2);
}
const loader = vm.createContext({ URL, document: { currentScript: { src: 'https://example.invalid/js/csv-loader.js' } }, window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'js/csv-loader.js'), 'utf8'), loader);
const api = loader.window.MocapCsv;
function ctx(names, values = {}, source = analysis, indent = 12) {
    const context = vm.createContext({ console, Float32Array, MocapCsv: api, escapeHtml: api.escapeHtml, ...values });
    vm.runInContext(names.map(name => fn(source, name, indent)).join('\n'), context);
    return context;
}
let checks = 0;
async function check(name, callback) { await callback(); checks++; console.log('PASS', name); }
const plain = value => JSON.parse(JSON.stringify(value));
const classList = (...initial) => {
    const values = new Set(initial);
    return { add: v => values.add(v), remove: v => values.delete(v), contains: v => values.has(v), toggle: (v, on) => on ? values.add(v) : values.delete(v) };
};
(async () => {
    await check('Coverage counts the full square and circle, including empty cells', () => {
        const c = ctx(['calculateCoverageWide']);
        const gridInfo = { gridMinX: -0.1, gridMinY: -0.1, rows: 2, cols: 2, gridSize: 0.1 };
        const r = c.calculateCoverageWide([[1, 1], [1, 1]], gridInfo, 'square', 10, 0, 0);
        assert.deepEqual(plain(r), { totalCells: 10000, reachedCells: 4, coverage: 0.04 });
        for (let i = 0; i < 100; i++) {
            const x = Math.sin(i) * 0.2, y = Math.cos(i) * 0.2, radius = 0.3 + i / 1000;
            let expected = 0;
            for (let row = -20; row <= 20; row++) for (let col = -20; col <= 20; col++) {
                const dx = -0.05 + col * 0.1 - x, dy = -0.05 + row * 0.1 - y;
                if (dx * dx + dy * dy <= radius * radius) expected++;
            }
            assert.equal(c.calculateCoverageWide([[1, 1], [1, 1]], gridInfo, 'circle', radius, x, y).totalCells, expected);
        }
    });
    await check('Heatmap counts actual sample times, deduplicates bodies and keeps maximum edge', () => {
        const c = ctx(['pointBounds', 'calculateHeatmapGridWide']);
        const samples = [0, 0.1, 0.2, 0.3].map(t => ({ t, x: 0, y: 0, z: 0 }));
        const result = c.calculateHeatmapGridWide({ a: samples, b: samples }, 0.1, 'X', 'Z');
        assert.equal(result.maxCount, 4);
        const edges = c.calculateHeatmapGridWide({ a: [{ t: 0, x: 0, z: 0 }, { t: 1, x: 1, z: 0 }] }, 1, 'X', 'Z');
        assert.equal(edges.maxCount, 2);
        const center = ctx(['calculateDataCenterWide'], { verticalAxisSelectWide: { value: 'Y' } });
        assert.deepEqual(plain(center.calculateDataCenterWide([{ x: 10, y: 20, z: 30 }])), { x: 10, y: -30 });
    });
    await check('Changing units reuses original data and missing XYZ never becomes zero', () => {
        const rows = [['0', '0', '1000', '2000', '3000'], ['1', '1', '2000', '', '4000']];
        const series = api.positionSeries(rows, { X: 2, Y: 3, Z: 4 }, 1000);
        assert.equal(series.length, 1);
        assert.equal(series.slice()[0].pos.X, 1);
        series.setFactor(1);
        assert.equal(series.slice()[0].pos.X, 1000);
        assert.equal(rows[0][2], '1000');
        const c = ctx(['calculateAveragePosition'], { fileDataStoreDistance: { rawData: [[0, 0, '', '', '']] } });
        assert.throws(() => c.calculateAveragePosition({ name: 'missing', xIndex: 2, yIndex: 3, zIndex: 4 }, 1, false, 'm'), /有効な座標/);
    });
    await check('Equal legend labels and timestamp gaps preserve both datasets and intervals', () => {
        const c = ctx(['sampleAllDataWide'], {
            fileDataStoreWide: { f: { rawData: [[0,0,1,0,0],[1,10,2,0,0],[2,10.1,3,0,0],[3,11,4,0,0]], rigidBodyInfo: { b: { xIndex: 2, yIndex: 3, zIndex: 4 } } } }
        });
        const selection = [{ filename: 'f', bodyName: 'b', label: 'same' }, { filename: 'f', bodyName: 'b', label: 'same' }];
        const result = c.sampleAllDataWide(selection, { mode: 'seconds', value: 1 }, 'm', false);
        assert.deepEqual(Object.keys(result), ['same', 'same (2)']);
        assert.deepEqual(plain(result.same.map(p => p.t)), [0, 10, 11]);
        c.fileDataStoreWide.f.rawData = [0, 0.1, 0.2, 0.3].map((t, i) => [i, t, 1, 0, 0]);
        const fractional = c.sampleAllDataWide(selection.slice(0, 1), { mode: 'seconds', value: 0.1 }, 'm', false);
        assert.deepEqual(plain(fractional.same.map(p => p.t)), [0, 0.1, 0.2, 0.3]);
    });
    await check('Even moving-average windows use exactly the requested samples', () => {
        const c = ctx(['applyMovingAverageFilter']);
        const points = Array.from({ length: 20 }, (_, x) => ({ x, y: x === 10 ? 10 : 0 }));
        const smoothed = c.applyMovingAverageFilter(points, 2);
        assert.equal(smoothed[9].y, 5);
        assert.equal(smoothed[10].y, 5);
        assert.equal(smoothed[8].y, 0);
        assert.equal(smoothed[11].y, 0);
    });
    await check('Exact one-turn, slow, reverse and stationary-start rotation periods work', () => {
        const c = ctx(['findRotationPeriodStd']);
        const angles = Array.from({ length: 361 }, (_, i) => i);
        assert.equal(c.findRotationPeriodStd(angles.map(a => a / 12), angles), 30);
        assert.equal(c.findRotationPeriodStd(angles.map(a => a / 12), angles.map(a => -a)), 30);
        assert.equal(c.findRotationPeriodStd([0,1,...angles.map(a => 2 + a / 12)], [0,0,...angles]), 30);
        assert.equal(c.findRotationPeriodStd([0,1,2], [0,90,180]), null);
    });
    await check('CSV names are text in HTML and formula escaping leaves numeric negatives numeric', () => {
        let rendered;
        const c = ctx(['displayRigidBodySelector'], {
            document: { createElement() { return {}; } }, rigidbodyListDiv: { appendChild(node) { rendered = node.innerHTML; } }
        });
        c.displayRigidBodySelector('file".csv', [{ name: '<img src=x onerror=alert(1)>' }]);
        assert(!rendered.includes('<img'));
        assert(rendered.includes('&lt;img'));
        assert(rendered.includes('file&quot;.csv'));
        const output = Papa.parse(Papa.unparse([{ name: '=1+1', velocity: -1.25 }], { escapeFormulae: true }), { header: true }).data;
        assert.equal(output[0].name, "'=1+1");
        assert.equal(output[0].velocity, '-1.25');
    });
    await check('3D worker honors all six Euler orders, markers and missing coordinates', () => {
        const holder = vm.createContext({});
        vm.runInContext(viewer.slice(0, viewer.indexOf('// 2. Main Logic')) + '\nthis.code = workerScript;', holder);
        for (const order of ['XYZ', 'YXZ', 'ZXY', 'ZYX', 'YZX', 'XZY']) {
            let result;
            const worker = vm.createContext({ self: { postMessage(msg) { if (msg.type === 'complete') result = msg; } } });
            vm.runInContext(holder.code, worker);
            const input = Papa.unparse([
                ['Rotation Type', order], [],
                ['', 'Type', ...Array(6).fill('Rigid Body'), ...Array(3).fill('Rigid Body Marker')],
                ['', 'Name', ...Array(6).fill('Body "A"'), ...Array(3).fill('Body "A":M')],
                ['', 'ID', ...Array(9).fill('1')],
                ['', '', 'Rotation', 'Rotation', 'Rotation', 'Position', 'Position', 'Position', 'Position', 'Position', 'Position'],
                ['Frame', 'Time (Seconds)', 'X','Y','Z','X','Y','Z','X','Y','Z'],
                [0,0,35,65,15,0,0,0,'','','']
            ], { header: false });
            worker.self.onmessage({ data: { type: 'chunk', text: input, isLast: true } });
            assert.equal(result.objects.length, 2);
            assert.equal(result.objects[0].name, 'Body "A"');
            assert.equal(result.objects[1].type, 'Marker');
            assert(Number.isNaN(result.positions[3]));
            const expected = new THREE.Quaternion().setFromEuler(new THREE.Euler(35*Math.PI/180,65*Math.PI/180,15*Math.PI/180,order)).toArray();
            expected.forEach((value, i) => assert(Math.abs(result.rotations[i] - value) < 1e-6, `${order} component ${i}: actual ${result.rotations[i]}, expected ${value}`));
        }
    });
    await check('Display decimation keeps extrema and endpoints; source samples remain intact', () => {
        const c = ctx(['chartDisplayPoints']);
        const points = Array.from({ length: 200000 }, (_, x) => ({ x, y: x === 54321 ? 1000 : x === 60000 ? -1000 : 0 }));
        const displayed = c.chartDisplayPoints(points);
        assert(displayed.length <= 6000);
        assert(displayed.includes(points[54321]) && displayed.includes(points[60000]));
        assert.equal(displayed[0], points[0]); assert.equal(displayed.at(-1), points.at(-1));
        assert.equal(points.length, 200000);
    });
    await check('Rigid-body markers sharing a parent ID keep their own coordinates', () => {
        const holder = vm.createContext({});
        vm.runInContext(viewer.slice(0, viewer.indexOf('// 2. Main Logic')) + '\nthis.code = workerScript;', holder);
        let result;
        const worker = vm.createContext({ self: { postMessage(msg) { if (msg.type === 'complete') result = msg; } } });
        vm.runInContext(holder.code, worker);
        const input = Papa.unparse([
            [], [],
            ['', 'Type', ...Array(3).fill('Rigid Body'), ...Array(6).fill('Rigid Body Marker')],
            ['', 'Name', ...Array(3).fill('body'), ...Array(3).fill('body:Marker 001'), ...Array(3).fill('body:Marker 002')],
            ['', 'ID', ...Array(9).fill('parent-id')],
            ['', '', ...Array(9).fill('Position')],
            ['Frame', 'Time (Seconds)', 'X','Y','Z','X','Y','Z','X','Y','Z'],
            [0,0,1,2,3,4,5,6,7,8,9]
        ], { header: false });
        worker.self.onmessage({ data: { type: 'chunk', text: input, isLast: true } });
        assert.equal(result.objects.length, 3);
        assert.deepEqual(Array.from(result.positions), [1,2,3,4,5,6,7,8,9]);
        assert.equal(result.objects[1].name, 'body:Marker 001');
        assert.equal(result.objects[2].name, 'body:Marker 002');
    });
    await check('Viewer colors distinguish 11 bodies regardless of interleaved markers and match trails and legend', () => {
        function element() { return { children: [], style: {}, classList: classList(), addEventListener() {}, appendChild(node) { this.children.push(node); } }; }
        const list = element();
        const c = ctx(['buildScene'], {
            THREE, scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), controls: { target: new THREE.Vector3() },
            renderer: { getSize(target) { return target.set(600, 400); } },
            document: { createElement: element }, objectListContainer: list, rightPanel: element(),
            seekBar: {}, timeTotalLabel: {}, objectCountLabel: {}, loadingOverlay: element(), controlPanel: element(), btnReset: element(),
            globalSettings: { rbOpacity: 0.5, markerOpacity: 0.5, trailOpacity: 0.5, rbTrailWidth: 3, markerTrailWidth: 1 },
            disposeSceneResources() {}, formatTime: String, applyFrameData() {}, updateSceneState() {}, togglePlayback() {}
        }, viewer, 8);
        let reference;
        for (const markerCount of [0, 1, 5, 7]) {
            list.children.length = 0;
            const objects = [];
            for (let i = 0; i < 11; i++) {
                objects.push({ name: 'body' + i, type: 'Rigid Body' });
                for (let m = 0; m < markerCount; m++) objects.push({ name: 'body' + i + ':Marker ' + m, type: 'Marker' });
            }
            const data = { objects, frameCount: 2, times: new Float32Array([0, 1]), positions: new Float32Array(objects.length * 6) };
            c.buildScene(data);
            const color = idx => c.playbackData.meshes[idx].children[0].material.color.getHexString();
            const colors = Array.from(c.playbackData.rigidBodyIndices, color);
            assert.equal(new Set(colors).size, 11);
            if (reference) assert.deepEqual(colors, reference);
            reference = colors;
            c.playbackData.rigidBodyIndices.forEach((idx, order) => {
                assert.equal(c.playbackData.trails[idx].material.color.getHexString(), colors[order]);
                assert.equal(list.children[order].children[1].style.backgroundColor, '#' + colors[order]);
                c.playbackData.objects[idx].childMarkers.forEach(m => {
                    assert.equal(color(m), colors[order]);
                    assert.equal(c.playbackData.trails[m].material.color.getHexString(), colors[order]);
                });
                if (markerCount > 1) assert.equal(c.playbackData.markerLineSegments[idx].material.color.getHexString(), colors[order]);
            });
        }
    });
    await check('Wide-area trajectories use one geometry type for short and long tracks together', () => {
        let scene;
        class CapturedScene extends THREE.Scene { constructor() { super(); scene = this; } }
        class Renderer { constructor() { this.domElement = {}; } setSize() {} render() {} dispose() {} }
        class Controls { constructor() { this.target = new THREE.Vector3(); } update() {} dispose() {} }
        const container = { clientWidth: 600, clientHeight: 600, appendChild() {} };
        const c = ctx(['draw3DTrajectory'], {
            THREE: { ...THREE, Scene: CapturedScene, WebGLRenderer: Renderer, OrbitControls: Controls },
            document: { getElementById() { return container; } }, disposeTrajectory3D() {}, syncTrajectoryVisibility() {},
            ResizeObserver: class { observe() {} }, requestAnimationFrame() {}
        });
        for (const lengths of [[2, 3], [2, 5001], [3000, 3000]]) {
            const data = Object.fromEntries(lengths.map((n, i) => [i, Array.from({ length: n }, (_, p) => ({ x: p / n, y: i, z: 0 }))]));
            c.draw3DTrajectory(data);
            const tracks = scene.children.filter(o => o.isMesh || (o.isLine && !o.isLineSegments));
            assert.equal(tracks.length, 2);
            assert(tracks.every(o => o.type === tracks[0].type));
            if (lengths.reduce((sum, n) => sum + n, 0) > 5000) {
                assert(tracks.every(o => o.isLine));
                tracks.forEach((o, i) => assert.equal(o.geometry.getAttribute('position').count, lengths[i]));
            } else assert(tracks.every(o => o.isMesh));
        }
    });
    await check('Repeated wide-area 3D views dispose resources, stop when hidden and resume', () => {
        const pending = new Map(); let id = 0, disposed = 0, disconnected = 0;
        const page = { classList: classList('active') }, view = { classList: classList() };
        const container = { clientWidth: 600, clientHeight: 600, appendChild(node) { node.parentNode = this; }, removeChild(node) { node.parentNode = null; } };
        class Renderer {
            constructor() { this.domElement = {}; } setSize() {} render() {} dispose() { disposed++; }
        }
        class Controls {
            constructor() { this.target = new THREE.Vector3(); } update() {} dispose() {}
        }
        const c = ctx(['syncTrajectoryVisibility', 'disposeTrajectory3D', 'draw3DTrajectory'], {
            trajectory3DSession: null,
            THREE: { ...THREE, WebGLRenderer: Renderer, OrbitControls: Controls },
            document: { hidden: false, getElementById(id) { return id === 'wide-area-analysis' ? page : id === 'trajectory-3d-view-wide' ? view : container; } },
            ResizeObserver: class { observe() {} disconnect() { disconnected++; } },
            requestAnimationFrame(callback) { pending.set(++id, callback); return id; }, cancelAnimationFrame(id) { pending.delete(id); }
        });
        const points = { body: [{ x: 0, y: 0, z: 0 }, { x: 1, y: 2, z: 3 }] };
        for (let i = 0; i < 10; i++) { c.draw3DTrajectory(points); assert.equal(pending.size, 1); }
        assert.equal(disposed, 9); assert.equal(disconnected, 9);
        page.classList.remove('active'); c.syncTrajectoryVisibility(); assert.equal(pending.size, 0);
        page.classList.add('active'); c.syncTrajectoryVisibility(); assert.equal(pending.size, 1);
        view.classList.add('hidden'); c.syncTrajectoryVisibility(); assert.equal(pending.size, 0);
        view.classList.remove('hidden'); c.syncTrajectoryVisibility(); assert.equal(pending.size, 1);
        c.disposeTrajectory3D(); assert.equal(pending.size, 0); assert.equal(disposed, 10);
    });
    await check('Local file copies use chunked fallback without creating a blocked worker', async () => {
        const previousReader = global.FileReader;
        global.FileReader = class {
            readAsText(input) {
                setImmediate(() => this.onload({ target: { result: fs.readFileSync(input.path).subarray(input.start, input.end).toString('utf8') } }));
            }
        };
        try {
            const context = vm.createContext({ URL, Blob, console,
                document: { currentScript: { src: 'file:///tmp/js/csv-loader.js' } },
                window: { Papa }, Worker: class { constructor() { throw new Error('unexpected worker'); } }
            });
            vm.runInContext(fs.readFileSync(path.join(root, 'js/csv-worker.js'), 'utf8'), context);
            vm.runInContext(fs.readFileSync(path.join(root, 'js/csv-loader.js'), 'utf8'), context);
            const p = path.join(root, 'testData/Take 2025-06-06 Normal Pad.csv');
            const localFile = { path: p, size: fs.statSync(p).size, slice(start, end) { return { path: p, start, end }; } };
            const rows = await new Promise((resolve, reject) => context.window.MocapCsv.parse(localFile, { complete: r => resolve(r.data), error: reject }));
            assert.equal(rows.storage.rowCount, 647);
        } finally { global.FileReader = previousReader; }
    });
    await check('SEO metadata, asset paths, single HTML and requested changelogs are consistent', () => {
        assert.equal((html.match(/<html\b/g) || []).length, 1);
        assert.equal((html.match(/軽微な不具合の修正とパフォーマンスの改善を行いました。/g) || []).length, 3);
        assert(html.includes('Antigravity、Codex）'));
        assert(html.includes('<link rel="canonical" href="https://minoru-s.github.io/mocap/">'));
        const data = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
        assert.equal(data.softwareVersion, '3.3.1'); assert.equal(data['@type'], 'WebApplication');
        assert(!data.aggregateRating && !data.review);
        const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
        for (const icon of manifest.icons) {
            const png = fs.readFileSync(path.join(root, icon.src));
            assert.equal(icon.sizes, png.readUInt32BE(16) + 'x' + png.readUInt32BE(20));
        }
        const shareIcon = fs.readFileSync(path.join(root, new URL(data.image).pathname.replace('/mocap/', '')));
        assert.equal(shareIcon.readUInt32BE(16), 512); assert.equal(shareIcon.readUInt32BE(20), 512);
        for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) {
            const url = match[1];
            if (/^(https?:|mailto:|data:|javascript:)/.test(url)) continue;
            assert(fs.existsSync(path.join(root, url)), 'missing local asset ' + url);
        }
        assert(fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8').includes('<loc>https://minoru-s.github.io/mocap/</loc>'));
    });
    await check('PWA upgrade reloads only this app, once; first installation does not reload', async () => {
        for (const update of [false, true]) {
            const handlers = {}, reloaded = [];
            const c = vm.createContext({ console: { log() {} },
                self: { registration: { scope: 'https://example.invalid/mocap/' }, addEventListener(type, cb) { handlers[type] = cb; }, clients: {
                    claim() {}, matchAll: async () => ['https://example.invalid/mocap/#data-analysis', 'https://example.invalid/other/'].map(url => ({ url, navigate() { reloaded.push(url); } }))
                } },
                caches: { keys: async () => update ? ['mp-pwa-cache-20260501'] : ['mocap-plus-cache-20261006-v3.3.1'], delete: async () => {} }
            });
            vm.runInContext(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), c);
            let complete; handlers.activate({ waitUntil(p) { complete = p; } }); await complete;
            assert.equal(reloaded.length, update ? 1 : 0);
            if (update) assert.equal(reloaded[0], 'https://example.invalid/mocap/#data-analysis');
        }
    });
    await check('Page navigation preserves analysis state and rejects non-page fragment IDs', () => {
        const pages = ['home', 'data-analysis', 'mocap-viewer', 'wide-area-analysis'].map(id => ({ id, classList: classList('page') }));
        const saved = { f: { parsed: true } };
        const events = [];
        const c = ctx(['showPage'], {
            pages, fileDataStore: saved,
            document: { getElementById: id => pages.find(p => p.id === id), querySelectorAll: () => [], body: { classList: classList() } },
            mobileTitle: null, mainContentArea: null, renderMath() {}, syncTrajectoryVisibility() {},
            window: { scrollTo() {}, dispatchEvent: event => events.push(event.detail?.pageId) },
            CustomEvent: class { constructor(type, options) { this.detail = options.detail; } }, Event: class {}, setTimeout() {}
        });
        for (const page of ['mocap-viewer', 'wide-area-analysis', 'data-analysis', 'loading']) c.showPage(page);
        assert.equal(c.fileDataStore, saved); assert.equal(c.fileDataStore.f.parsed, true);
        assert(pages.find(p => p.id === 'home').classList.contains('active'));
        assert.equal(events.at(-1), 'home');
    });
    await check('PDF export supplies a real image and always clears temporary rendering', async () => {
        const overlay = { classList: classList('hidden') };
        let image, saved = false, destroyed = false, removed = false;
        const canvas = { style: {}, width: 0, height: 0, toDataURL: () => 'data:image/png;base64,AA==', getContext: () => ({ save() {}, restore() {}, fillRect() {} }) };
        const c = vm.createContext({ console,
            chartInstances: { chart: { config: { type: 'scatter', data: {}, options: {} } } }, downloadOverlay: overlay,
            document: { getElementById(id) { return { value: id === 'export-width' ? '800' : '600' }; }, createElement() { return canvas; }, body: { appendChild() {}, removeChild() { removed = true; } } },
            Chart: class { destroy() { destroyed = true; } },
            window: { jspdf: { jsPDF: class { addImage(data) { image = data; } save() { saved = true; } } } },
            setTimeout(callback) { callback(); }, alert(message) { throw new Error(message); }
        });
        const start = analysis.indexOf('            async function handleDownload(');
        const end = analysis.indexOf('\n            }', start);
        vm.runInContext(analysis.slice(start, end + 14), c);
        await c.handleDownload('chart', 'pdf');
        assert.equal(image, 'data:image/png;base64,AA=='); assert(saved && destroyed && removed);
        assert(overlay.classList.contains('hidden'));
    });
    console.log(checks + ' stability checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
