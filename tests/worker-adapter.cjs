// Browser-worker adapter for Node tests. Production code is loaded unchanged.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { parentPort } = require('node:worker_threads');
const root = path.resolve(__dirname, '..');
const context = vm.createContext({
    Blob, console,
    postMessage(message, transfer) { parentPort.postMessage(message, transfer); },
    importScripts(name) {
        vm.runInContext(fs.readFileSync(path.join(root, 'js', name), 'utf8'), context);
    },
    readSlice(input) {
        const fd = fs.openSync(input.path, 'r');
        const buffer = Buffer.alloc(input.end - input.start);
        fs.readSync(fd, buffer, 0, buffer.length, input.start);
        fs.closeSync(fd);
        return buffer.toString('utf8');
    }
});
vm.runInContext(`
    self = globalThis;
    class File {
        constructor(info) { this.path = info.path; this.size = info.size; }
        slice(start, end) { return { path: this.path, start, end }; }
    }
    class FileReaderSync { readAsText(input) { return readSlice(input); } }
`, context);
vm.runInContext(fs.readFileSync(path.join(root, 'js/csv-worker.js'), 'utf8'), context);
parentPort.on('message', message => {
    context.inputMessage = message;
    vm.runInContext('inputMessage.file = new File(inputMessage.file); self.onmessage({data: inputMessage});', context);
});
