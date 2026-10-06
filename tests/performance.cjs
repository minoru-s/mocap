const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { Worker: NodeWorker } = require('node:worker_threads');
const root = path.resolve(__dirname, '..');
const Papa = require('../js/vendor/papaparse.js');
let workers = 0, peakWorkers = 0;
class BrowserWorker {
    constructor() {
        workers++;
        peakWorkers = Math.max(peakWorkers, workers);
        this.worker = new NodeWorker(path.join(__dirname, 'worker-adapter.cjs'));
        this.worker.on('message', data => this.onmessage?.({ data }));
        this.worker.on('error', error => this.onerror?.(error));
    }
    postMessage(message) { this.worker.postMessage(message); }
    terminate() { if (!this.terminated) { this.terminated = true; workers--; this.worker.terminate(); } }
}
const loader = vm.createContext({
    URL, Worker: BrowserWorker, console,
    document: { currentScript: { src: 'https://example.invalid/js/csv-loader.js' } },
    window: {}
});
vm.runInContext(fs.readFileSync(path.join(root, 'js/csv-loader.js'), 'utf8'), loader);
const api = loader.window.MocapCsv;
const file = p => ({ path: p, size: fs.statSync(p).size });
const load = (p, mode = 'position', progress) => new Promise((resolve, reject) => {
    api.parse(file(p), { mode, progress, complete: r => resolve(r.data), error: reject });
});
const analysis = fs.readFileSync(path.join(root, 'js/analysis.js'), 'utf8');
const viewer = fs.readFileSync(path.join(root, 'js/viewer.js'), 'utf8');
// Select a top-level function through its closing brace at the same indentation.
function fn(source, name, indent = 12) {
    const prefix = ' '.repeat(indent);
    const start = source.indexOf(prefix + 'function ' + name + '(');
    assert(start >= 0, 'missing function ' + name);
    const end = source.indexOf('\n' + prefix + '}', start);
    assert(end >= 0, 'missing closing brace ' + name);
    return source.slice(start, end + prefix.length + 2);
}
function analysisContext(names, extras = {}) {
    const context = vm.createContext({ console, MocapCsv: api, escapeHtml: api.escapeHtml, ...extras });
    vm.runInContext(names.map(name => fn(analysis, name)).join('\n'), context);
    return context;
}
const tests = [];
async function check(name, callback) {
    const start = performance.now();
    await callback();
    const result = { name, passed: true, milliseconds: Math.round(performance.now() - start) };
    tests.push(result);
    console.log('PASS', name, result.milliseconds + 'ms');
}
const plain = value => JSON.parse(JSON.stringify(value));
const large = path.join(root, 'testData', 'Take 2025-10-27 11.01.43 AM.csv');
const small = path.join(root, 'testData', 'Take 2025-06-06 Normal Pad.csv');
const metrics = {};

(async () => {
    let positionRows;
    await check('43 MB file is chunked; only position columns are retained', async () => {
        const progress = [];
        positionRows = await load(large, 'position', p => progress.push(p));
        assert.equal(positionRows.storage.rowCount, 55024);
        assert.equal(positionRows.storage.columnIndices.length, 5);
        assert(progress.length > 10);
        assert.equal(positionRows.length, 55031);
        const bytes = positionRows.storage.blocks.reduce((sum, block) => sum + block.columns.reduce((n, col) => n + col.byteLength, 0), 0);
        metrics.inputBytes = fs.statSync(large).size;
        metrics.positionBytes = bytes;
        assert.equal(bytes, 55024 * 5 * 8);
    });
    await check('All five analysis tools receive the same numeric input values', async () => {
        const full = Papa.parse(fs.readFileSync(small, 'utf8')).data;
        const headers = full.slice(0, 7);
        for (const mode of ['position', 'rotation', 'distance']) {
            const rows = await load(small, mode);
            assert.deepEqual(plain(rows.slice(0, 7)), headers);
            const numeric = rows.slice(7);
            const expected = full.slice(7).filter(row => row.length > 1 && Number.isFinite(parseFloat(row[1])));
            assert.equal(numeric.length, expected.length);
            for (let i = 0; i < expected.length; i++) {
                for (const column of rows.storage.columnIndices) assert(Object.is(numeric[i][column], parseFloat(expected[i][column])));
            }
            assert.equal(numeric.filter(row => row[1] !== '').length, expected.length);
            const c = analysisContext(['extractRigidBodies', 'parseHeaderWide', 'parseHeaderDistance', 'parseHeaderTrimming', 'extractRigidBodiesStd']);
            if (mode === 'position') {
                assert.equal(c.extractRigidBodies(rows).length, 8);
                assert.equal(Object.keys(c.parseHeaderWide(rows).rigidBodyInfo).length, 8);
                assert.equal(c.parseHeaderTrimming(rows).rigidBodies.length, 8);
            } else if (mode === 'rotation') {
                assert.equal(Object.keys(c.extractRigidBodiesStd(rows, { typeRowIndex: 2, nameRowIndex: 3, propertyRowIndex: 5, dataStartIndex: 7 })).length, 8);
            } else {
                const parsed = c.parseHeaderDistance(rows);
                assert.equal(parsed.objects.rigidBodies.length, 8);
                assert.equal(parsed.objects.markers.length, 53);
            }
        }
    });
    await check('Large CSV also loads rotation and distance-marker columns', async () => {
        const rotation = await load(large, 'rotation');
        assert.equal(rotation.storage.rowCount, 55024);
        assert.equal(rotation.storage.columnIndices.length, 6);
        const distance = await load(large, 'distance');
        assert.equal(distance.storage.rowCount, 55024);
        assert.equal(distance.storage.columnIndices.length, 401);
        assert.equal(distance[7][1], positionRows[7][1]);
    });
    await check('Repeated threshold changes leave original timestamps and results intact', async () => {
        const motion = Array.from({ length: 30 }, (_, i) => [i, i + 10, Math.max(0, Math.min(20, i - 5)), 0, 0]);
        const series = api.positionSeries(motion, { X: 2, Y: 3, Z: 4 }, 1);
        const selection = [{ filename: 'f', bodyName: 'body', label: 'body' }];
        const create = () => analysisContext(['findNamedInput', 'processAllBodies', 'findMotionRange'], {
            fileDataStore: { f: { rigidBodies: [{ name: 'body', data: series }] } },
            document: { querySelector() { return { value: 'm' }; }, querySelectorAll() { return [{ value: '1', dataset: { filename: 'f' } }]; } }, allInstantaneousVelocities: []
        });
        const ctx = create();
        const first = ctx.processAllBodies(selection, 'X', 'Y', { multiplier: 0.2 });
        const snapshot = plain(first);
        const rerun = ctx.processAllBodies(selection, 'X', 'Y', { multiplier: 0.001 });
        const fresh = create().processAllBodies(selection, 'X', 'Y', { multiplier: 0.001 });
        assert.deepEqual(plain(rerun), plain(fresh));
        assert.deepEqual(plain(first), snapshot);
        assert.equal(motion[0][1], 10);
    });
    await check('200,000 samples and more than 125,000 grid cells avoid argument limits', async () => {
        const ctx = analysisContext(['pointBounds', 'findMotionRange', 'calculateHeatmapGridWide'], { samplingRateInputWide: { value: '0.1' } });
        const data = Array.from({ length: 200000 }, (_, i) => ({ pos: { X: i / 100000 } }));
        const range = ctx.findMotionRange(data, 'X', { multiplier: 0.01 });
        assert(range.start > 0 && range.end < data.length);
        const points = data.map((_, i) => ({ x: i / 100000, y: 0, z: 0, t: i / 120 }));
        const grid = ctx.calculateHeatmapGridWide({ body: points }, 0.005, 'X', 'Z');
        assert(grid.grid.length * grid.grid[0].length > 125000);
        assert(grid.maxCount > 0);
        assert.throws(() => ctx.calculateHeatmapGridWide({ body: points }, 0.00001, 'X', 'Z'), /セル数/);
    });
    await check('Invalid files do not block queued reads; workers run one at a time', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocap-test-'));
        const bad = path.join(dir, 'bad.csv');
        fs.writeFileSync(bad, 'not,a,motive,csv\n');
        try {
            const results = await Promise.allSettled([load(bad), load(small), load(small, 'rotation')]);
            assert.equal(results[0].status, 'rejected');
            assert.equal(results[1].status, 'fulfilled');
            assert.equal(results[2].status, 'fulfilled');
            assert.equal(peakWorkers, 1);
            assert.equal(workers, 0);
        } finally { fs.rmSync(dir, { recursive: true }); }
    });
    await check('Trimming streams original columns, CSV quoting, precise time and frame count', async () => {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mocap-trim-test-'));
        const p = path.join(dir, 'quoted.csv');
        const rows = [
            ['Format Version', '1.23', 'Total Exported Frames', '3'], [],
            ['', 'Type', 'Rigid Body', 'Rigid Body', 'Rigid Body', 'Marker', 'Marker', 'Marker'],
            ['', 'Name', 'Body,"日本語"', 'Body,"日本語"', 'Body,"日本語"', 'M', 'M', 'M'],
            ['', 'ID', '1', '1', '1', '2', '2', '2'],
            ['', '', 'Position', 'Position', 'Position', 'Position', 'Position', 'Position'],
            ['Frame', 'Time (Seconds)', 'X', 'Y', 'Z', 'X', 'Y', 'Z'],
            ['0', '1.000000', '1', '2', '3', '10', '20', '30'],
            ['1', '1.008333', '4', '5', '6', '40', '50', '60'],
            ['2', '1.016667', '7', '8', '9', '70', '80', '90']
        ];
        fs.writeFileSync(p, Papa.unparse(rows, { header: false }));
        try {
            const blob = await api.trim(file(p), 1.008, 1.02);
            const output = Papa.parse(await blob.text()).data;
            assert.equal(output[0][3], '2');
            assert.deepEqual(output[3], rows[3]);
            assert.deepEqual(output[7], ['1', '0.000333', ...rows[8].slice(2)]);
            assert.deepEqual(output[8], ['2', '0.008667', ...rows[9].slice(2)]);
        } finally { fs.rmSync(dir, { recursive: true }); }
    });
    await check('3D viewer pauses away from its page and resumes without duplicate loops', async () => {
        let next = 0, rendered = 0;
        const scheduled = new Map();
        const classList = { add() {} };
        const context = vm.createContext({
            console, performance,
            animationId: null, viewerActive: false, lastRealTime: 0, currentTime: 0,
            document: { hidden: false, getElementById() { return { clientWidth: 900, clientHeight: 600 }; } },
            window: {}, tooltip: { classList },
            camera: { updateProjectionMatrix() {} }, renderer: { setSize() {}, render() { rendered++; } },
            controls: { update() {} }, scene: {}, isPlaying: false, playbackData: { frameCount: 0, trails: [] },
            requestAnimationFrame(callback) { scheduled.set(++next, callback); return next; },
            cancelAnimationFrame(id) { scheduled.delete(id); }, updateSceneState() {}
        });
        vm.runInContext(['syncViewerRendering', 'onWindowResize', 'animateLoop'].map(name => fn(viewer, name, 8)).join('\n'), context);
        context.syncViewerRendering();
        assert.equal(scheduled.size, 0);
        for (let i = 0; i < 25; i++) {
            context.viewerActive = true;
            context.syncViewerRendering(); context.syncViewerRendering();
            assert.equal(scheduled.size, 1);
            const [id, callback] = scheduled.entries().next().value;
            scheduled.delete(id); callback(performance.now());
            assert.equal(scheduled.size, 1);
            context.viewerActive = false;
            context.syncViewerRendering();
            assert.equal(scheduled.size, 0);
        }
        assert.equal(rendered, 25);
        context.viewerActive = true; context.document.hidden = true; context.syncViewerRendering();
        assert.equal(scheduled.size, 0);
        context.document.hidden = false; context.syncViewerRendering();
        assert.equal(scheduled.size, 1);
    });
    await check('Service worker only removes caches owned by this app', async () => {
        const handlers = {}, removed = [];
        const ctx = vm.createContext({
            console: { log() {} },
            self: { addEventListener(type, fn) { handlers[type] = fn; }, registration: { scope: 'https://example.invalid/mocap/' }, clients: { claim() {}, matchAll: async () => [] } },
            caches: { keys: async () => ['mp-pwa-cache-20260501', 'another-app', 'mocap-plus-cache-20261006-v3.3.1'], delete: async name => removed.push(name) }
        });
        vm.runInContext(fs.readFileSync(path.join(root, 'service-worker.js'), 'utf8'), ctx);
        let done; handlers.activate({ waitUntil(promise) { done = promise; } }); await done;
        assert.deepEqual(removed, ['mp-pwa-cache-20260501']);
    });
    console.log(JSON.stringify({ tests, metrics }, null, 2));
})().catch(error => { console.error(error); process.exitCode = 1; });
