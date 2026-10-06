(function (global) {
    function createProcessor(Papa, send) {

const CHUNK_SIZE = 2 * 1024 * 1024;

function parseFile(file, onChunk) {
    return new Promise((resolve, reject) => {
        let failed = false;
        Papa.parse(file, {
            chunkSize: CHUNK_SIZE,
            chunk(results, parser) {
                try {
                    const error = results.errors.find(error => error.code !== 'UndetectableDelimiter');
                    if (error) throw new Error('CSV形式が不正です: ' + error.message);
                    onChunk(results.data, results.meta);
                }
                catch (error) { failed = true; parser.abort(); reject(error); }
            },
            complete() { if (!failed) resolve(); },
            error: reject
        });
    });
}

function findColumns(headers, mode) {
    const type = headers.find(row => row[1] === 'Type') || [];
    const property = headers.find(row => row.includes('Position') || row.includes('Rotation')) || [];
    const columns = [0, 1];
    for (let i = 2; i < type.length; i++) {
        const rigidBody = type[i] === 'Rigid Body';
        const marker = type[i] === 'Marker' || type[i] === 'Rigid Body Marker';
        const include = mode === 'rotation'
            ? rigidBody && property[i] === 'Rotation'
            : (rigidBody || (mode === 'distance' && marker)) && property[i] === 'Position';
        if (include) columns.push(i);
    }
    return columns;
}

async function read(file, mode) {
    const headers = [];
    const blocks = [];
    let columnIndices;
    let headerDone = false;
    let rowCount = 0;
    await parseFile(file, (rows, meta) => {
        let start = 0;
        if (!headerDone) {
            for (; start < rows.length; start++) {
                const row = rows[start];
                headers.push(row);
                if (row[0] === 'Frame' && row[1] === 'Time (Seconds)') {
                    headerDone = true;
                    columnIndices = findColumns(headers, mode);
                    start++;
                    break;
                }
                if (headers.length > 30) throw new Error('Motive CSVのヘッダーを認識できませんでした。');
            }
        }
        if (headerDone) {
            const valid = [];
            for (let i = start; i < rows.length; i++) {
                if (rows[i].length > 1 && Number.isFinite(parseFloat(rows[i][1]))) valid.push(rows[i]);
            }
            if (valid.length) {
                const columns = columnIndices.map(index => {
                    const values = new Float64Array(valid.length);
                    for (let i = 0; i < valid.length; i++) values[i] = parseFloat(valid[i][index]);
                    return values;
                });
                blocks.push({ length: valid.length, columns });
                rowCount += valid.length;
            }
        }
        send({ type: 'progress', cursor: meta.cursor, rows: rowCount });
    });
    if (!headerDone) throw new Error('Motive CSVのヘッダーを認識できませんでした。');
    const transfer = blocks.flatMap(block => block.columns.map(column => column.buffer));
    send({ type: 'complete', headers, columnIndices, blocks, rowCount }, transfer);
}

// Re-read the original file when exporting: preview data need not retain every
// marker/string column or a second complete copy of a large CSV.
async function trim(file, start, end) {
    const headers = [];
    const parts = [];
    let headerDone = false;
    let count = 0;
    await parseFile(file, rows => {
        const selected = [];
        for (const row of rows) {
            if (!headerDone) {
                headers.push(row);
                if (row[0] === 'Frame' && row[1] === 'Time (Seconds)') headerDone = true;
                continue;
            }
            const time = parseFloat(row[1]);
            if (time >= start && time <= end) {
                row[0] = ++count;
                row[1] = (time - start).toFixed(6);
                selected.push(row);
            }
        }
        if (selected.length) parts.push(Papa.unparse(selected, { header: false }) + '\r\n');
    });
    if (!count) throw new Error('選択範囲内にデータがありません。');
    for (const row of headers) {
        const index = row.indexOf('Total Exported Frames');
        if (index >= 0) row[index + 1] = String(count);
    }
    const header = Papa.unparse(headers, { header: false }) + '\r\n';
    send({ type: 'complete', blob: new Blob([header, ...parts], { type: 'text/csv;charset=utf-8;' }) });
}

return async ({ data }) => {
    try {
        if (data.type === 'read') await read(data.file, data.mode);
        else if (data.type === 'trim') await trim(data.file, data.start, data.end);
    } catch (error) {
        send({ type: 'error', message: error.message || String(error) });
    }
};

    }
    if (typeof document === 'undefined') {
        importScripts('./vendor/papaparse.js');
        global.onmessage = createProcessor(global.Papa, (message, transfer) => global.postMessage(message, transfer));
    } else {
        global.MocapCsvProcessor = createProcessor;
    }
})(typeof self === 'undefined' ? window : self);
