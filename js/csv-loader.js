(function () {
    const workerUrl = new URL('csv-worker.js', document.currentScript.src);
    let queue = Promise.resolve();

    // A view over transferred numeric columns. Existing tools can inspect rows,
    // but no large array of CSV strings is retained in the UI thread.
    class CsvRows {
        constructor(storage, headerStart = 0, headerEnd = storage.headers.length, start = 0, end = storage.rowCount, indices = null) {
            Object.assign(this, { storage, headerStart, headerEnd, start, end, indices });
            this.headerLength = headerEnd - headerStart;
            this.length = this.headerLength + (indices ? indices.length : end - start);
            return new Proxy(this, {
                get(target, key, receiver) {
                    if (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key)) return target.row(Number(key));
                    return Reflect.get(target, key, receiver);
                }
            });
        }
        locate(index) {
            const logical = index - this.headerLength;
            const frame = this.indices ? this.indices[logical] : this.start + logical;
            let low = 0, high = this.storage.blocks.length - 1;
            while (low < high) {
                const mid = (low + high) >>> 1;
                if (frame >= this.storage.offsets[mid + 1]) low = mid + 1;
                else high = mid;
            }
            const block = this.storage.blocks[low];
            const local = frame - this.storage.offsets[low];
            return { block, local };
        }
        value(index, column) {
            if (index < 0 || index >= this.length) return undefined;
            if (index < this.headerLength) return this.storage.headers[this.headerStart + index][column];
            const offset = this.storage.columnOffsets[column];
            if (offset === undefined) return undefined;
            const { block, local } = this.locate(index);
            return block.columns[offset][local];
        }
        row(index) {
            if (index < 0 || index >= this.length) return undefined;
            if (index < this.headerLength) return this.storage.headers[this.headerStart + index];
            const { block, local } = this.locate(index);
            const row = [];
            row.length = this.storage.headers[this.storage.headers.length - 1].length;
            const offsets = this.storage.columnOffsets;
            return new Proxy(row, {
                get(target, key, receiver) {
                    if (typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key)) {
                        const offset = offsets[key];
                        return offset === undefined ? undefined : block.columns[offset][local];
                    }
                    return Reflect.get(target, key, receiver);
                }
            });
        }
        slice(start = 0, end = this.length) {
            start = Math.max(0, start < 0 ? this.length + start : Math.min(start, this.length));
            end = Math.max(start, Math.min(end < 0 ? this.length + end : end, this.length));
            if (end <= this.headerLength) return this.storage.headers.slice(this.headerStart + start, this.headerStart + end);
            if (start < this.headerLength) throw new Error('CSVヘッダーとデータの混在スライスは未対応です。');
            const from = start - this.headerLength, to = end - this.headerLength;
            return new CsvRows(this.storage, 0, 0, this.start + from, this.start + to, this.indices ? this.indices.subarray(from, to) : null);
        }
        filter(predicate) {
            const selected = [];
            for (let i = 0; i < this.length; i++) if (predicate(this.row(i), i)) selected.push(this.indices ? this.indices[i] : this.start + i);
            if (selected.length === this.length) return this;
            return new CsvRows(this.storage, 0, 0, 0, 0, Int32Array.from(selected));
        }
        map(callback) { return Array.from(this, callback); }
        forEach(callback) { for (let i = 0; i < this.length; i++) callback(this.row(i), i); }
        *[Symbol.iterator]() { for (let i = 0; i < this.length; i++) yield this.row(i); }
    }

    function run(payload, onProgress) {
        const task = () => new Promise((resolve, reject) => {
            let worker;
            if (workerUrl.protocol === 'file:') {
                // Browser restrictions prevent separate workers for file://.
                // FileReader still reads chunks asynchronously in local copies.
                let active = true;
                worker = {
                    terminate() { active = false; },
                    postMessage(payload) {
                        const process = window.MocapCsvProcessor(window.Papa, data => { if (active) worker.onmessage({ data }); });
                        process({ data: payload }).catch(error => { if (active) worker.onerror(error); });
                    }
                };
            } else {
                worker = new Worker(workerUrl);
            }
            const finish = (error, result) => {
                worker.terminate();
                if (error) reject(error); else resolve(result);
            };
            worker.onmessage = ({ data }) => {
                if (data.type === 'progress') { if (onProgress) onProgress(data); }
                else if (data.type === 'error') finish(new Error(data.message));
                else if (data.type === 'complete') {
                    if (data.blob) { finish(null, data.blob); return; }
                    data.offsets = [0];
                    for (const block of data.blocks) data.offsets.push(data.offsets[data.offsets.length - 1] + block.length);
                    data.columnOffsets = Object.create(null);
                    data.columnIndices.forEach((column, index) => { data.columnOffsets[column] = index; });
                    finish(null, new CsvRows(data));
                }
            };
            worker.onerror = event => finish(new Error(event.message || 'CSV読み込み処理に失敗しました。'));
            worker.postMessage(payload);
        });
        const pending = queue.then(task);
        queue = pending.catch(() => {});
        return pending;
    }

    function positionSeries(rows, axes, factor) {
        const value = rows.value ? (i, column) => rows.value(i, column) : (i, column) => parseFloat(rows[i][column]);
        const valid = [];
        for (let i = 0; i < rows.length; i++) {
            if (Number.isFinite(value(i, 1)) && ['X', 'Y', 'Z'].every(axis => Number.isFinite(value(i, axes[axis])))) valid.push(i);
        }
        const indices = Int32Array.from(valid);
        valid.length = 0;
        return {
            length: indices.length,
            setFactor(value) { factor = value; },
            coordinate(i, axis) { return value(indices[i], axes[axis]) / factor; },
            slice(start = 0, end = indices.length) {
                start = Math.max(0, start < 0 ? indices.length + start : Math.min(start, indices.length));
                end = Math.max(start, Math.min(end < 0 ? indices.length + end : end, indices.length));
                return Array.from({ length: end - start }, (_, i) => {
                    const index = indices[start + i];
                    return { time: value(index, 1), pos: { X: value(index, axes.X) / factor, Y: value(index, axes.Y) / factor, Z: value(index, axes.Z) / factor } };
                });
            }
        };
    }

    function detectLengthUnit(rows) {
        const headers = [];
        let start = 0;
        for (; start < Math.min(rows.length, 30); start++) {
            const row = rows[start];
            headers.push(row);
            if (row[0] === 'Frame' && row[1] === 'Time (Seconds)') { start++; break; }
        }
        for (const row of headers) {
            for (let i = 0; i < row.length - 1; i++) {
                if (String(row[i]).trim().toLowerCase() !== 'length units') continue;
                const label = String(row[i + 1]).trim();
                if (!label) continue;
                if (/^(m|meters?|metres?|メートル)$/i.test(label)) return { unit: 'm', source: 'header' };
                if (/^(mm|millimeters?|millimetres?|ミリメートル)$/i.test(label)) return { unit: 'mm', source: 'header' };
                // Do not replace an explicit but unsupported unit with a guess.
                return { unit: null, source: 'unsupported', label };
            }
        }

        const type = headers.find(row => row[1] === 'Type') || [];
        const property = headers.find(row => row.includes('Position')) || [];
        const axes = headers[headers.length - 1] || [];
        const bodies = [];
        for (let i = 2; i + 2 < type.length && bodies.length < 32; i++) {
            if (type[i] === 'Rigid Body' && property[i] === 'Position' && axes[i] === 'X' &&
                axes[i + 1] === 'Y' && axes[i + 2] === 'Z' &&
                type[i + 1] === type[i] && type[i + 2] === type[i] &&
                property[i + 1] === 'Position' && property[i + 2] === 'Position') bodies.push(i);
        }
        const value = rows.value ? (i, column) => rows.value(i, column) : (i, column) => parseFloat(rows[i][column]);
        const samples = [[], [], []];
        const count = Math.min(1024, rows.length - start);
        for (let sample = 0; sample < count; sample++) {
            const row = start + Math.round(sample * Math.max(0, rows.length - start - 1) / Math.max(1, count - 1));
            for (const column of bodies) {
                const point = [value(row, column), value(row, column + 1), value(row, column + 2)];
                if (!point.every(Number.isFinite)) continue;
                point.forEach((coordinate, axis) => samples[axis].push(coordinate));
            }
        }
        if (samples[0].length < 5) return { unit: null, source: 'unknown' };
        let span = 0;
        for (const values of samples) {
            values.sort((a, b) => a - b);
            span = Math.max(span, values[Math.floor((values.length - 1) * 0.95)] - values[Math.ceil((values.length - 1) * 0.05)]);
        }
        // Laboratory-sized recordings only: leave borderline/static recordings
        // unresolved. Percentiles reduce the influence of tracking outliers,
        // and the span is independent of the coordinate origin.
        const unit = span >= 100 ? 'mm' : span >= 0.1 && span <= 10 ? 'm' : null;
        return { unit, source: unit ? 'scale' : 'unknown', span };
    }

    window.MocapCsv = {
        parse(file, options) {
            run({ type: 'read', file, mode: options.mode || 'position' }, options.progress)
                .then(data => options.complete({ data }))
                .catch(error => { if (options.error) options.error(error); });
        },
        trim(file, start, end) { return run({ type: 'trim', file, start, end }); },
        escapeHtml(value) {
            return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
        },
        positionSeries,
        detectLengthUnit,
        CsvRows
    };
})();
