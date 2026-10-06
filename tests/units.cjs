const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { Worker } = require('node:worker_threads');
const root = path.resolve(__dirname, '..');
class BrowserWorker {
    constructor() {
        this.worker = new Worker(path.join(__dirname, 'worker-adapter.cjs'));
        this.worker.on('message', data => this.onmessage?.({ data }));
        this.worker.on('error', error => this.onerror?.(error));
    }
    postMessage(data) { this.worker.postMessage(data); }
    terminate() { this.worker.terminate(); }
}
const loader = vm.createContext({ URL, Worker: BrowserWorker, document: { currentScript: { src: 'https://example.invalid/js/csv-loader.js' } }, window: {} });
vm.runInContext(fs.readFileSync(path.join(root, 'js/csv-loader.js'), 'utf8'), loader);
const api = loader.window.MocapCsv;
const analysis = fs.readFileSync(path.join(root, 'js/analysis.js'), 'utf8');
function fn(name) {
    const indent = ' '.repeat(12), start = analysis.indexOf(indent + 'function ' + name + '(');
    assert(start >= 0, name);
    const end = analysis.indexOf('\n' + indent + '}', start);
    return analysis.slice(start, end + indent.length + 2);
}
function context(names, extras = {}) {
    const c = vm.createContext({ console, MocapCsv: api, escapeHtml: api.escapeHtml, ...extras });
    vm.runInContext(names.map(fn).join('\n'), c);
    return c;
}
const plain = v => JSON.parse(JSON.stringify(v));
function fixture(unit, scale = 1, offset = 0) {
    return [
        unit ? ['Length Units', unit] : [], [],
        ['', 'Type', 'Rigid Body', 'Rigid Body', 'Rigid Body'],
        ['', 'Name', 'body', 'body', 'body'], ['', 'ID', '1', '1', '1'],
        ['', '', 'Position', 'Position', 'Position'],
        ['Frame', 'Time (Seconds)', 'X', 'Y', 'Z'],
        ...Array.from({ length: 101 }, (_, i) => [i, i / 120, offset + i / 20 * scale, 0, 0])
    ];
}
function unitUI(files) {
    return {
        fileDataStoreWide: files, autoUnitCheckboxWide: { checked: true }, selectedDataUnitWide: 'mm',
        dataUnitRadiosWide: [{ value: 'mm', checked: true }, { value: 'm', checked: false }],
        unitLabels: [{ textContent: 'mm' }], gridSizeInputWide: { value: '200' }, areaSizeInputWide: { value: '5000' },
        centerXInputWide: { value: '2500' }, centerYInputWide: { value: '-1000' }, coordinateUnitNote: {},
        unitDetectionNoteWide: {}, fileListAreaWide: {}
    };
}
function read(file) {
    return new Promise((resolve, reject) => api.parse({ path: file, size: fs.statSync(file).size }, { complete: r => resolve(r.data), error: reject }));
}
let checks = 0;
async function check(name, action) { await action(); checks++; console.log('PASS', name); }
(async () => {
    await check('Explicit Motive units override scale, offsets and small movements', () => {
        for (const unit of ['Meters', 'Metres', 'm', ' Meters ']) assert.deepEqual(plain(api.detectLengthUnit(fixture(unit, 1000, 1e6))), { unit: 'm', source: 'header' });
        for (const unit of ['Millimeters', 'Millimetres', 'mm']) assert.deepEqual(plain(api.detectLengthUnit(fixture(unit, 0.01))), { unit: 'mm', source: 'header' });
        assert.deepEqual(plain(api.detectLengthUnit(fixture('Centimeters', 1000))), { unit: null, source: 'unsupported', label: 'Centimeters' });
    });
    await check('Missing-unit estimates resist origin shifts and outliers; ambiguous or stationary data remain unresolved', () => {
        for (const offset of [0, 1e6]) assert.equal(api.detectLengthUnit(fixture(null, 1, offset)).unit, 'm');
        assert.equal(api.detectLengthUnit(fixture(null, 1000)).unit, 'mm');
        const noisy = fixture(null); noisy[50][2] = 1e7;
        assert.equal(api.detectLengthUnit(noisy).unit, 'm');
        for (const scale of [0, 0.001, 10]) assert.equal(api.detectLengthUnit(fixture(null, scale)).unit, null);
        const missing = fixture(null); missing.slice(7).forEach(row => { row[3] = ''; });
        assert.equal(api.detectLengthUnit(missing).unit, null);
    });
    await check('Mixed m/mm files share physical coordinates; manual mode overrides all files without changing input', () => {
        const make = unit => ({ rawData: [[0,0,unit === 'mm' ? 2500 : 2.5,0,0]], rigidBodyInfo: { b: { xIndex:2,yIndex:3,zIndex:4 } }, unitDetection: { unit, source: 'header' } });
        const files = { meters: make('m'), millimeters: make('mm') };
        const c = context(['sampleAllDataWide'], { fileDataStoreWide: files });
        const selected = Object.keys(files).map(filename => ({ filename, bodyName:'b', label:filename }));
        const automatic = c.sampleAllDataWide(selected, { mode:'none' }, 'm', false, true);
        assert.equal(automatic.meters[0].x, 2.5); assert.equal(automatic.millimeters[0].x, 2.5);
        const manual = c.sampleAllDataWide(selected, { mode:'none' }, 'mm', false, false);
        assert.equal(manual.meters[0].x, 0.0025); assert.equal(manual.millimeters[0].x, 2.5);
        assert.equal(files.millimeters.rawData[0][2], 2500);
    });
    await check('Automatic selection preserves grid, range and custom-center dimensions; manual choices remain in control', () => {
        const files = { one: { unitDetection: { unit:'m', source:'header' } } };
        const c = context(['setDataUnitWide','selectDetectedUnitWide','updateWideUnitInfo'], unitUI(files));
        c.selectDetectedUnitWide(); c.updateWideUnitInfo();
        assert.equal(c.selectedDataUnitWide, 'm');
        assert.equal(c.gridSizeInputWide.value, 0.2); assert.equal(c.areaSizeInputWide.value, 5);
        assert.equal(c.centerXInputWide.value, 2.5); assert.equal(c.centerYInputWide.value, -1);
        c.selectDetectedUnitWide(); assert.equal(c.gridSizeInputWide.value, 0.2);
        c.setDataUnitWide('mm'); assert.equal(c.gridSizeInputWide.value, 200);
        c.gridSizeInputWide.value = '0.05'; c.setDataUnitWide('m'); assert.equal(c.gridSizeInputWide.value, 0.00005);
        c.autoUnitCheckboxWide.checked = false; c.setDataUnitWide('mm'); c.selectDetectedUnitWide();
        assert.equal(c.selectedDataUnitWide, 'mm');
        files.two = { unitDetection: { unit:'mm', source:'header' } }; c.autoUnitCheckboxWide.checked = true;
        c.selectDetectedUnitWide(); c.updateWideUnitInfo(); assert.equal(c.selectedDataUnitWide, 'm');
        assert(c.unitDetectionNoteWide.textContent.includes('混在'));
        files['<img src=x onerror=alert(1)>'] = { unitDetection: { unit:null, source:'unknown' } };
        c.updateWideUnitInfo(); assert(!c.fileListAreaWide.innerHTML.includes('<img'));
        assert(c.unitDetectionNoteWide.textContent.includes('未判定'));
    });
    await check('Changing unit interpretation discards stale results and keeps the loaded files', () => {
        let disposed = 0, destroyed = 0;
        const files = { one:{ unitDetection:{ unit:'m',source:'header' } } };
        const hidden = new Set();
        const c = context(['invalidateUnitResultsWide'], {
            fileDataStoreWide:files, lastSampledDataWide:{ one:[{ x:1 }] }, lastHeatmapGridWide:{ grid:[[1]] },
            is3DTrajectoryRendered:true, trajectoryChartWide:{ destroy() { destroyed++; } },
            disposeTrajectory3D() { disposed++; }, resultsCardWide:{ classList:{ add(name) { hidden.add(name); } } }
        });
        c.invalidateUnitResultsWide();
        assert.equal(c.lastSampledDataWide, null); assert.equal(c.lastHeatmapGridWide, null);
        assert.equal(c.is3DTrajectoryRendered, false); assert(hidden.has('hidden'));
        assert.equal(c.fileDataStoreWide, files); assert.equal(disposed,1); assert.equal(destroyed,1);
        c.invalidateUnitResultsWide(); assert.equal(disposed,1); assert.equal(destroyed,1);
    });
    await check('Real millimeter CSV selects mm through the production chunk reader', async () => {
        const rows = await read(path.join(root, 'testData/Take 2025-06-06 Normal Pad.csv'));
        assert.deepEqual(plain(api.detectLengthUnit(rows)), { unit:'mm', source:'header' });
        const c = context(['parseHeaderWide']);
        assert.equal(Object.keys(c.parseHeaderWide(rows).rigidBodyInfo).length, 8);
    });
    if (process.argv[2]) await check('Supplied meter CSV loads, selects m and matches a numerically converted mm recording', async () => {
        const rows = await read(path.resolve(process.argv[2]));
        assert.deepEqual(plain(api.detectLengthUnit(rows)), { unit:'m', source:'header' });
        const c = context(['parseHeaderWide','sampleAllDataWide','setDataUnitWide','selectDetectedUnitWide'], unitUI({}));
        const parsed = c.parseHeaderWide(rows);
        c.fileDataStoreWide.recording = { ...parsed, unitDetection:api.detectLengthUnit(rows) };
        c.selectDetectedUnitWide(); assert.equal(c.selectedDataUnitWide, 'm'); assert.equal(c.gridSizeInputWide.value, 0.2);
        const selected = Object.keys(parsed.rigidBodyInfo).map(bodyName => ({ filename:'recording',bodyName,label:bodyName }));
        const sampled = c.sampleAllDataWide(selected, { mode:'seconds',value:0.1 }, 'm', false, true);
        const body = selected[0].bodyName, info = parsed.rigidBodyInfo[body];
        const reference = sampled[body].find(point => Number.isFinite(point.x)); assert(reference);
        const synthetic = { rawData:[[0,reference.t,reference.x*1000,reference.y*1000,reference.z*1000]], rigidBodyInfo:{ b:{ xIndex:2,yIndex:3,zIndex:4 } },unitDetection:{ unit:'mm',source:'header' } };
        c.fileDataStoreWide.mm = synthetic;
        const converted = c.sampleAllDataWide([{ filename:'mm',bodyName:'b',label:'mm' }], { mode:'none' }, 'm', false, true).mm[0];
        for (const axis of ['x','y','z']) assert(Math.abs(converted[axis]-reference[axis]) < 1e-12);
        console.log(JSON.stringify({ bytes:fs.statSync(process.argv[2]).size, frames:parsed.rawData.length, rigidBodies:selected.length, selectedUnit:c.selectedDataUnitWide }));
    });
    console.log(checks + ' unit checks passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
