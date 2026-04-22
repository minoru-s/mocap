        // ==========================================
        // 1. Web Worker Code (Dynamic Blob Generation)
        // ==========================================
        const workerScript = `
            let isHeaderParsed = false;
            let dataStartIndex = -1;
            let objects = []; 
            let numObjects = 0;
            
            // 動的拡張バッファ
            let capacity = 10000;
            let frameCount = 0;
            let times = new Float32Array(capacity);
            let positions = null;
            let rotations = null;
            
            let leftover = '';
            let headerLines = [];

            function parseCSVLine(line) {
                const result = [];
                let current = '';
                let inQuotes = false;
                for (let i = 0; i < line.length; i++) {
                    const char = line[i];
                    if (char === '"') {
                        inQuotes = !inQuotes;
                    } else if (char === ',' && !inQuotes) {
                        result.push(current);
                        current = '';
                    } else {
                        current += char;
                    }
                }
                result.push(current);
                return result;
            }

            function resizeIfNeeded() {
                if (frameCount >= capacity) {
                    let newCapacity = capacity * 2;
                    let newTimes = new Float32Array(newCapacity);
                    newTimes.set(times);
                    times = newTimes;
                    
                    let newPos = new Float32Array(newCapacity * numObjects * 3);
                    newPos.set(positions);
                    positions = newPos;
                    
                    let newRot = new Float32Array(newCapacity * numObjects * 4);
                    newRot.set(rotations);
                    rotations = newRot;
                    
                    capacity = newCapacity;
                }
            }

            self.onmessage = function(e) {
                const msg = e.data;
                if (msg.type === 'chunk') {
                    processChunk(msg.text, msg.isLast);
                }
            };

            function processChunk(text, isLast) {
                const fullText = leftover + text;
                const lines = fullText.split(/\\r?\\n/);
                
                if (!isLast) {
                    leftover = lines.pop() || '';
                } else {
                    leftover = '';
                }

                let startIndex = 0;

                if (!isHeaderParsed) {
                    for (let i = 0; i < lines.length; i++) {
                        headerLines.push(parseCSVLine(lines[i]));
                        const row = headerLines[headerLines.length - 1];
                        
                        if (row.length >= 2) {
                            const c0 = row[0] ? row[0].trim() : '';
                            const c1 = row[1] ? row[1].trim() : '';
                            if (c0 === 'Frame' && (c1 === 'Time (Seconds)' || c1 === 'Time(Seconds)')) {
                                dataStartIndex = headerLines.length; 
                                startIndex = i + 1;
                                break;
                            }
                        }
                    }

                    if (dataStartIndex !== -1) {
                        let typeRowIdx = -1, nameRowIdx = -1, propRowIdx = -1, axisRowIdx = dataStartIndex - 1;
                        for (let i = 0; i < dataStartIndex - 1; i++) {
                            const row = headerLines[i];
                            if (!row || row.length < 1) continue;
                            
                            const c0 = row[0] ? row[0].trim() : '';
                            const c1 = row.length > 1 && row[1] ? row[1].trim() : '';
                            
                            if (c0 === 'Type' || c1 === 'Type') typeRowIdx = i;
                            if (c0 === 'Name' || c1 === 'Name') nameRowIdx = i;
                            if (row.includes('Position')) propRowIdx = i;
                        }

                        if (typeRowIdx === -1 || nameRowIdx === -1 || propRowIdx === -1) {
                            self.postMessage({ type: 'error', message: 'Motive CSVのヘッダ形式を認識できませんでした。' });
                            return;
                        }

                        const typeRow = headerLines[typeRowIdx];
                        const nameRow = headerLines[nameRowIdx];
                        const propRow = headerLines[propRowIdx];
                        const axisRow = headerLines[axisRowIdx];

                        const tempObjects = {};
                        for (let i = 0; i < typeRow.length; i++) {
                            const type = typeRow[i] ? typeRow[i].trim() : '';
                            if (type !== 'Rigid Body' && type !== 'Marker') continue;
                            
                            const name = nameRow[i] ? nameRow[i].trim() : '';
                            const prop = propRow[i] ? propRow[i].trim() : '';
                            const axis = axisRow[i] ? axisRow[i].trim().toUpperCase() : '';
                            
                            if (!tempObjects[name]) {
                                tempObjects[name] = { name: name, type: type, posIdx: {}, rotIdx: {} };
                            }
                            if (prop === 'Position') tempObjects[name].posIdx[axis] = i;
                            if (prop === 'Rotation') tempObjects[name].rotIdx[axis] = i;
                        }

                        objects = Object.values(tempObjects).filter(obj => 
                            obj.posIdx.X !== undefined && obj.posIdx.Y !== undefined && obj.posIdx.Z !== undefined
                        ).map(obj => {
                            obj.hasQuat = (obj.rotIdx.X !== undefined && obj.rotIdx.W !== undefined);
                            obj.hasEuler = (obj.rotIdx.X !== undefined && obj.rotIdx.W === undefined);
                            obj.hasRot = obj.hasQuat || obj.hasEuler;
                            return obj;
                        });

                        numObjects = objects.length;
                        if (numObjects === 0) {
                            self.postMessage({ type: 'error', message: '有効な剛体やマーカーが見つかりませんでした。' });
                            return;
                        }

                        positions = new Float32Array(capacity * numObjects * 3);
                        rotations = new Float32Array(capacity * numObjects * 4);
                        
                        isHeaderParsed = true;
                    } else {
                        startIndex = lines.length;
                    }
                }

                if (isHeaderParsed) {
                    for (let i = startIndex; i < lines.length; i++) {
                        if (!lines[i].trim()) continue;
                        
                        const row = parseCSVLine(lines[i]);
                        if (row.length < 2 || row[1] === '') continue;
                        
                        const time = parseFloat(row[1]);
                        if (isNaN(time)) continue;
                        
                        times[frameCount] = time;
                        
                        for (let objIdx = 0; objIdx < numObjects; objIdx++) {
                            const obj = objects[objIdx];
                            
                            let px = parseFloat(row[obj.posIdx.X]); px = isNaN(px) ? 0 : px;
                            let py = parseFloat(row[obj.posIdx.Y]); py = isNaN(py) ? 0 : py;
                            let pz = parseFloat(row[obj.posIdx.Z]); pz = isNaN(pz) ? 0 : pz;
                            
                            const pBase = (frameCount * numObjects + objIdx) * 3;
                            positions[pBase] = px;
                            positions[pBase + 1] = py;
                            positions[pBase + 2] = pz;
                            
                            let rx = 0, ry = 0, rz = 0, rw = 1;
                            if (obj.hasQuat) {
                                let vx = parseFloat(row[obj.rotIdx.X]); rx = isNaN(vx) ? 0 : vx;
                                let vy = parseFloat(row[obj.rotIdx.Y]); ry = isNaN(vy) ? 0 : vy;
                                let vz = parseFloat(row[obj.rotIdx.Z]); rz = isNaN(vz) ? 0 : vz;
                                let vw = parseFloat(row[obj.rotIdx.W]); rw = isNaN(vw) ? 1 : vw;
                            } else if (obj.hasEuler) {
                                let ex = parseFloat(row[obj.rotIdx.X]); ex = isNaN(ex) ? 0 : ex * Math.PI / 180;
                                let ey = parseFloat(row[obj.rotIdx.Y]); ey = isNaN(ey) ? 0 : ey * Math.PI / 180;
                                let ez = parseFloat(row[obj.rotIdx.Z]); ez = isNaN(ez) ? 0 : ez * Math.PI / 180;
                                let c1 = Math.cos(ex / 2), s1 = Math.sin(ex / 2);
                                let c2 = Math.cos(ey / 2), s2 = Math.sin(ey / 2);
                                let c3 = Math.cos(ez / 2), s3 = Math.sin(ez / 2);
                                rx = s1 * c2 * c3 + c1 * s2 * s3;
                                ry = c1 * s2 * c3 - s1 * c2 * s3;
                                rz = c1 * c2 * s3 + s1 * s2 * c3;
                                rw = c1 * c2 * c3 - s1 * s2 * s3;
                            }
                            
                            const rBase = (frameCount * numObjects + objIdx) * 4;
                            rotations[rBase] = rx;
                            rotations[rBase + 1] = ry;
                            rotations[rBase + 2] = rz;
                            rotations[rBase + 3] = rw;
                        }
                        
                        frameCount++;
                        resizeIfNeeded();
                    }
                }

                if (isLast) {
                    if (frameCount === 0) {
                        self.postMessage({ type: 'error', message: 'パース可能なデータが存在しませんでした。' });
                        return;
                    }
                    
                    const finalTimes = times.slice(0, frameCount);
                    const finalPos = positions.slice(0, frameCount * numObjects * 3);
                    const finalRot = rotations.slice(0, frameCount * numObjects * 4);
                    
                    self.postMessage({
                        type: 'complete',
                        objects: objects.map(o => ({name: o.name, type: o.type})),
                        frameCount: frameCount,
                        times: finalTimes,
                        positions: finalPos,
                        rotations: finalRot
                    }, [finalTimes.buffer, finalPos.buffer, finalRot.buffer]);
                } else {
                    self.postMessage({ type: 'progress_ack' }); 
                }
            }
        `;

        // ==========================================
        // 2. Main Logic & Three.js Setup
        // ==========================================
        let scene, camera, renderer, controls;
        let animationId;
        
        let playbackData = {
            objects: [],
            numObjects: 0,
            frameCount: 0,
            times: null,
            positions: null,
            rotations: null,
            meshes: [],
            trails: [],
            markerLineSegments: [],
            rigidBodyIndices: [], 
            markerIndices: [] 
        };

        // UI & Settings Global State
        const globalSettings = {
            rbSize: 1.0,
            rbOpacity: 0.5,
            markerSize: 1.0,
            markerOpacity: 1.0,
            trailWidth: 2,
            trailOpacity: 0.8
        };

        let isPlaying = false;
        let currentTime = 0;
        let duration = 0;
        let lastRealTime = 0;
        let currentFrameIdx = 0;

        const dropZoneContainer = document.getElementById('drop-zone-container');
        const fileInput = document.getElementById('file-input');
        const loadingOverlay = document.getElementById('loading-overlay');
        const loadingStatus = document.getElementById('loading-status');
        const progressPct = document.getElementById('progress-pct');
        const progressBar = document.getElementById('progress-bar');
        const errorDetails = document.getElementById('error-details');
        const controlPanel = document.getElementById('control-panel');
        const rightPanel = document.getElementById('right-panel');
        const objectListContainer = document.getElementById('object-list');
        const objectCountLabel = document.getElementById('object-count');
        const btnPlay = document.getElementById('btn-play');
        const iconPlay = document.getElementById('icon-play');
        const iconPause = document.getElementById('icon-pause');
        const seekBar = document.getElementById('seek-bar');
        const timeCurrentLabel = document.getElementById('time-current');
        const timeTotalLabel = document.getElementById('time-total');
        const playbackRateSelect = document.getElementById('playback-rate');
        const btnReset = document.getElementById('btn-reset');
        const noSelectionHint = document.getElementById('no-selection-hint');
        
        const toggleRb = document.getElementById('toggle-rb');
        const toggleMarker = document.getElementById('toggle-marker');
        const toggleUnassignedMarker = document.getElementById('toggle-unassigned-marker');
        const toggleRbTrail = document.getElementById('toggle-rb-trail');
        const toggleMarkerTrail = document.getElementById('toggle-marker-trail');
        const toggleTrailAll = document.getElementById('toggle-trail-all');
        const toggleAllRbs = document.getElementById('toggle-all-rbs');

        // Tabs
        const tabBtnList = document.getElementById('tab-btn-list');
        const tabBtnSettings = document.getElementById('tab-btn-settings');
        const tabContentList = document.getElementById('tab-content-list');
        const tabContentSettings = document.getElementById('tab-content-settings');

        const tooltip = document.getElementById('tooltip');
        const raycaster = new THREE.Raycaster();
        const mouse = new THREE.Vector2();

        initThreeJS();
        setupEventListeners();

        function initThreeJS() {
            const canvas = document.getElementById('three-canvas');
            const container = document.getElementById('playback-viewer');
            const w = container ? container.clientWidth : window.innerWidth;
            const h = container ? container.clientHeight : window.innerHeight;
            
            renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
            renderer.setSize(w, h);
            renderer.setPixelRatio(window.devicePixelRatio);

            scene = new THREE.Scene();
            scene.background = new THREE.Color(0x111827);

            camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 1000);
            camera.position.set(2, 2, 3);

            controls = new THREE.OrbitControls(camera, renderer.domElement);
            controls.enableDamping = true;
            controls.dampingFactor = 0.05;

            scene.add(new THREE.AmbientLight(0xffffff, 0.6));
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(10, 20, 10);
            scene.add(dirLight);

            const gridHelper = new THREE.GridHelper(10, 20, 0x4b5563, 0x374151);
            scene.add(gridHelper);

            window.addEventListener('resize', onWindowResize);
            animateLoop();
        }

        function onWindowResize() {
            const container = document.getElementById('playback-viewer');
            const w = container ? container.clientWidth : window.innerWidth;
            const h = container ? container.clientHeight : window.innerHeight;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }

        function animateLoop(time) {
            animationId = requestAnimationFrame(animateLoop);
            
            if (isPlaying && playbackData.frameCount > 0) {
                const delta = (time - lastRealTime) / 1000;
                const rate = parseFloat(playbackRateSelect.value);
                currentTime += delta * rate;
                
                if (currentTime >= duration) {
                    currentTime = duration;
                    togglePlayback(false);
                }
                
                seekBar.value = currentTime;
                timeCurrentLabel.textContent = formatTime(currentTime);
            }
            lastRealTime = time;

            if (playbackData.frameCount > 0) {
                applyFrameData(currentTime);
                handleRaycast();
            }

            controls.update();
            updateSceneState(); 
            renderer.render(scene, camera);
        }

        function formatTime(seconds) {
            const m = Math.floor(seconds / 60);
            const s = Math.floor(seconds % 60);
            const ms = Math.floor((seconds % 1) * 1000);
            return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
        }

        function setupEventListeners() {
            const dropZone = document.getElementById('drop-zone');
            dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('border-blue-500', 'bg-gray-800'); });
            dropZone.addEventListener('dragleave', () => dropZone.classList.remove('border-blue-500', 'bg-gray-800'));
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('border-blue-500', 'bg-gray-800');
                if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
            });

            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) handleFile(e.target.files[0]);
            });

            btnPlay.addEventListener('click', () => togglePlayback(!isPlaying));
            btnReset.addEventListener('click', resetApp);
            
            seekBar.addEventListener('input', (e) => {
                currentTime = parseFloat(e.target.value);
                timeCurrentLabel.textContent = formatTime(currentTime);
                applyFrameData(currentTime); 
            });
            
            seekBar.addEventListener('mousedown', () => { if(isPlaying) { this.wasPlaying = true; togglePlayback(false); } });
            seekBar.addEventListener('mouseup', () => { if(this.wasPlaying) { togglePlayback(true); this.wasPlaying = false;} });

            // トグルイベント
            toggleRb.addEventListener('change', updateSceneState);
            toggleMarker.addEventListener('change', updateSceneState);
            toggleUnassignedMarker.addEventListener('change', updateSceneState);
            toggleRbTrail.addEventListener('change', updateSceneState);
            toggleMarkerTrail.addEventListener('change', updateSceneState);
            toggleTrailAll.addEventListener('change', updateSceneState);
            
            toggleAllRbs.addEventListener('change', (e) => {
                const isChecked = e.target.checked;
                if (playbackData && playbackData.rigidBodyIndices) {
                    playbackData.rigidBodyIndices.forEach(idx => {
                        const cb = document.getElementById(`rb-cb-${idx}`);
                        if (cb) cb.checked = isChecked;
                    });
                    updateSceneState();
                }
            });

            // Tabs UI
            tabBtnList.addEventListener('click', () => {
                tabBtnList.classList.add('text-blue-400', 'border-blue-500', 'bg-gray-800/50');
                tabBtnList.classList.remove('text-gray-400', 'hover:text-gray-200', 'bg-gray-800/20', 'hover:bg-gray-800/50', 'border-transparent');
                
                tabBtnSettings.classList.add('text-gray-400', 'hover:text-gray-200', 'bg-gray-800/20', 'hover:bg-gray-800/50', 'border-transparent');
                tabBtnSettings.classList.remove('text-blue-400', 'border-blue-500', 'bg-gray-800/50');

                tabContentList.classList.remove('hidden');
                tabContentList.classList.add('flex');
                tabContentSettings.classList.add('hidden');
                tabContentSettings.classList.remove('flex');
            });

            tabBtnSettings.addEventListener('click', () => {
                tabBtnSettings.classList.add('text-blue-400', 'border-blue-500', 'bg-gray-800/50');
                tabBtnSettings.classList.remove('text-gray-400', 'hover:text-gray-200', 'bg-gray-800/20', 'hover:bg-gray-800/50', 'border-transparent');
                
                tabBtnList.classList.add('text-gray-400', 'hover:text-gray-200', 'bg-gray-800/20', 'hover:bg-gray-800/50', 'border-transparent');
                tabBtnList.classList.remove('text-blue-400', 'border-blue-500', 'bg-gray-800/50');

                tabContentSettings.classList.remove('hidden');
                tabContentSettings.classList.add('flex');
                tabContentList.classList.add('hidden');
                tabContentList.classList.remove('flex');
            });

            // Settings Sliders
            const settingKeys = ['rb-size', 'rb-opacity', 'marker-size', 'marker-opacity', 'trail-width', 'trail-opacity'];
            settingKeys.forEach(key => {
                const el = document.getElementById(`set-${key}`);
                const valEl = document.getElementById(`val-${key}`);
                el.addEventListener('input', (e) => {
                    const v = parseFloat(e.target.value);
                    valEl.textContent = key.includes('size') ? v.toFixed(1) + 'x' : (key === 'trail-width' ? v + 'px' : v.toFixed(1));
                    
                    const parts = key.split('-');
                    const objKey = parts[0] + parts[1].charAt(0).toUpperCase() + parts[1].slice(1);
                    globalSettings[objKey] = v;
                    
                    applySettingsToMaterials();
                });
            });

            // Raycaster Mouse Update
            window.addEventListener('pointermove', (event) => {
                const canvas = renderer.domElement;
                let rect = null;
                if (canvas) {
                    rect = canvas.getBoundingClientRect();
                    mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
                    mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
                } else {
                    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
                    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
                }
                tooltip.style.left = (event.clientX - (rect ? rect.left : 0) + 15) + 'px';
                tooltip.style.top = (event.clientY - (rect ? rect.top : 0) + 15) + 'px';
            });
            // Minimize/Maximize panel
            const _minimizeBtn = document.getElementById('minimize-panel-btn');
            const _maximizeBtn = document.getElementById('maximize-panel-btn');
            const _rightPanel = document.getElementById('right-panel');
            if (_minimizeBtn && _maximizeBtn && _rightPanel) {
                _minimizeBtn.addEventListener('click', () => {
                    _rightPanel.classList.remove('flex');
                    _rightPanel.classList.add('hidden');
                    _maximizeBtn.classList.remove('hidden');
                    _maximizeBtn.classList.add('flex');
                });
                _maximizeBtn.addEventListener('click', () => {
                    _rightPanel.classList.add('flex');
                    _rightPanel.classList.remove('hidden');
                    _maximizeBtn.classList.remove('flex');
                    _maximizeBtn.classList.add('hidden');
                });
            }

        }

        function togglePlayback(play) {
            isPlaying = play;
            if (isPlaying) {
                if (currentTime >= duration) currentTime = 0;
                lastRealTime = performance.now();
                iconPlay.classList.add('hidden');
                iconPause.classList.remove('hidden');
            } else {
                iconPlay.classList.remove('hidden');
                iconPause.classList.add('hidden');
            }
        }

        function showAppError(msg) {
            loadingStatus.textContent = 'エラーが発生しました';
            loadingStatus.classList.add('text-red-500');
            progressBar.classList.replace('bg-blue-500', 'bg-red-500');
            errorDetails.innerHTML = `<span class="font-bold text-red-400">詳細:</span> ${msg}`;
            btnReset.classList.remove('hidden');
        }

        function applySettingsToMaterials() {
            if (!playbackData || playbackData.numObjects === 0) return;

            playbackData.rigidBodyIndices.forEach(rbIdx => {
                const rbGroup = playbackData.meshes[rbIdx];
                if(rbGroup.children[0]) {
                    rbGroup.children[0].material.opacity = globalSettings.rbOpacity;
                }
                if(rbGroup.children[1]) {
                    rbGroup.children[1].material.opacity = Math.min(1.0, globalSettings.rbOpacity + 0.3); 
                }
                if(playbackData.trails[rbIdx]) {
                    playbackData.trails[rbIdx].material.opacity = globalSettings.trailOpacity;
                    playbackData.trails[rbIdx].material.linewidth = globalSettings.trailWidth;
                }
                
                if (playbackData.markerLineSegments[rbIdx]) {
                    playbackData.markerLineSegments[rbIdx].material.opacity = globalSettings.trailOpacity;
                    playbackData.markerLineSegments[rbIdx].material.linewidth = globalSettings.trailWidth; 
                }
            });

            playbackData.markerIndices.forEach(mIdx => {
                const mGroup = playbackData.meshes[mIdx];
                if(mGroup.children[0]) {
                    mGroup.children[0].material.opacity = globalSettings.markerOpacity;
                }
                if(playbackData.trails[mIdx]) {
                    playbackData.trails[mIdx].material.opacity = globalSettings.trailOpacity;
                    playbackData.trails[mIdx].material.linewidth = globalSettings.trailWidth;
                }
            });
            updateSceneState();
        }

        function handleRaycast() {
            if(!playbackData || playbackData.frameCount === 0) {
                tooltip.classList.add('hidden');
                return;
            }

            raycaster.setFromCamera(mouse, camera);
            const intersectables = [];
            playbackData.meshes.forEach(group => {
                if(group.visible && group.children.length > 0) {
                    intersectables.push(group.children[0]); // Box or Sphere
                }
            });
            
            const intersects = raycaster.intersectObjects(intersectables, false);
            
            if (intersects.length > 0) {
                const hitMesh = intersects[0].object;
                const hitGroup = hitMesh.parent;
                const idx = playbackData.meshes.indexOf(hitGroup);
                
                if (idx !== -1) {
                    const obj = playbackData.objects[idx];
                    const p = hitGroup.position;
                    const euler = new THREE.Euler().setFromQuaternion(hitGroup.quaternion, 'XYZ');
                    
                    const timeStr = formatTime(currentTime);
                    
                    tooltip.innerHTML = `
                        <div class="font-bold border-b border-gray-600 pb-1 mb-1 flex items-center justify-between gap-4">
                            <span>${obj.name}</span>
                            <span class="text-[10px] bg-gray-700 px-1.5 py-0.5 rounded text-gray-300 uppercase">${obj.type}</span>
                        </div>
                        <div class="text-xs text-gray-300 font-mono"><span class="text-gray-400">Time:</span> ${timeStr}</div>
                        <div class="text-xs text-gray-300 font-mono mt-1"><span class="text-gray-400">Pos:</span> X:${p.x.toFixed(3)} Y:${p.y.toFixed(3)} Z:${p.z.toFixed(3)}</div>
                        <div class="text-xs text-gray-300 font-mono"><span class="text-gray-400">Rot:</span> X:${(euler.x*180/Math.PI).toFixed(1)}° Y:${(euler.y*180/Math.PI).toFixed(1)}° Z:${(euler.z*180/Math.PI).toFixed(1)}°</div>
                    `;
                    tooltip.classList.remove('hidden');
                    return;
                }
            }
            tooltip.classList.add('hidden');
        }

        function handleFile(file) {
            if (!file.name.endsWith('.csv')) {
                showAppError('CSVファイルを選択してください。');
                dropZoneContainer.classList.add('hidden');
                loadingOverlay.classList.remove('hidden');
                return;
            }

            // 新しいファイル読み込み時に再生位置をリセット
            currentTime = 0;
            currentFrameIdx = 0;
            isPlaying = false;
            togglePlayback(false);
            toggleAllRbs.checked = false; // 全選択リセット
            noSelectionHint.classList.add('hidden');

            loadingStatus.textContent = 'ファイルを解析中...';
            loadingStatus.classList.remove('text-red-500');
            progressBar.classList.replace('bg-red-500', 'bg-blue-500');
            errorDetails.innerHTML = `💡 <span class="font-semibold text-gray-300">最適化技術:</span> 自前の高速CSVパーサとFloat32Arrayによるバッファリングを用いて、大容量データを安全かつ高速に処理しています。`;
            btnReset.classList.add('hidden');
            rightPanel.classList.remove('flex'); rightPanel.classList.add('hidden');

            dropZoneContainer.classList.add('hidden');
            loadingOverlay.classList.remove('hidden');
            progressPct.textContent = '0';
            progressBar.style.width = '0%';

            const blob = new Blob([workerScript], { type: 'application/javascript' });
            const workerUrl = URL.createObjectURL(blob);
            const worker = new Worker(workerUrl);

            const chunkSize = 1024 * 1024 * 2; 
            let offset = 0;
            const reader = new FileReader();

            worker.onmessage = function(e) {
                const msg = e.data;
                if (msg.type === 'progress_ack') {
                    const pct = Math.floor((offset / file.size) * 100);
                    progressPct.textContent = Math.min(pct, 100);
                    progressBar.style.width = Math.min(pct, 100) + '%';
                    readNextChunk();
                } else if (msg.type === 'complete') {
                    progressPct.textContent = '100';
                    progressBar.style.width = '100%';
                    setTimeout(() => {
                        buildScene(msg);
                        worker.terminate();
                        URL.revokeObjectURL(workerUrl); 
                    }, 100); 
                } else if (msg.type === 'error') {
                    showAppError(msg.message);
                    worker.terminate();
                    URL.revokeObjectURL(workerUrl);
                }
            };
            
            worker.onerror = function(err) {
                showAppError(`Worker内部エラー: ${err.message}`);
                worker.terminate();
                URL.revokeObjectURL(workerUrl);
            };

            function readNextChunk() {
                if (offset >= file.size) {
                    worker.postMessage({ type: 'chunk', text: '', isLast: true });
                    return;
                }
                const slice = file.slice(offset, offset + chunkSize);
                reader.readAsText(slice);
            }

            reader.onload = function(e) {
                const text = e.target.result;
                offset += chunkSize;
                const isLast = offset >= file.size;
                worker.postMessage({ type: 'chunk', text: text, isLast: isLast });
            };

            reader.onerror = function() {
                showAppError('ファイルの読み込み中にブラウザエラーが発生しました。');
            };

            readNextChunk(); 
        }

        function buildScene(data) {
            playbackData = data;
            playbackData.numObjects = data.objects.length;
            duration = data.times[data.frameCount - 1];
            
            seekBar.max = duration;
            seekBar.value = 0;
            timeTotalLabel.textContent = formatTime(duration);
            
            while(scene.children.length > 0){ 
                scene.remove(scene.children[0]); 
            }
            scene.add(new THREE.AmbientLight(0xffffff, 0.6));
            const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
            dirLight.position.set(10, 20, 10);
            scene.add(dirLight);

            const colors = [0x3b82f6, 0xef4444, 0x10b981, 0xf97316, 0x8b5cf6, 0xf59e0b, 0x14b8a6, 0xec4899];
            playbackData.meshes = [];
            playbackData.trails = [];
            playbackData.markerLineSegments = [];
            playbackData.rigidBodyIndices = [];
            playbackData.markerIndices = [];

            // 剛体とマーカーを分類し、親子関係を構築
            data.objects.forEach((obj, i) => {
                if (obj.type === 'Rigid Body') {
                    playbackData.rigidBodyIndices.push(i);
                    obj.childMarkers = [];
                } else {
                    playbackData.markerIndices.push(i);
                }
            });

            playbackData.markerIndices.forEach(idx => {
                const marker = data.objects[idx];
                let parentIdx = -1;
                for (let rbIdx of playbackData.rigidBodyIndices) {
                    const rbName = data.objects[rbIdx].name;
                    if (marker.name.startsWith(rbName + '_') || marker.name.startsWith(rbName + ':')) {
                        parentIdx = rbIdx;
                        break;
                    }
                }
                if (parentIdx === -1) {
                    for (let rbIdx of playbackData.rigidBodyIndices) {
                        const rbName = data.objects[rbIdx].name;
                        if (marker.name.startsWith(rbName)) {
                            parentIdx = rbIdx;
                            break;
                        }
                    }
                }
                playbackData.objects[idx].parentRbIdx = parentIdx;
                if (parentIdx !== -1) {
                    playbackData.objects[parentIdx].childMarkers.push(idx);
                }
            });

            const bbox = new THREE.Box3();

            for (let i = 0; i < data.positions.length; i += 3) {
                const x = data.positions[i];
                const y = data.positions[i+1];
                const z = data.positions[i+2];
                if (x !== 0 || y !== 0 || z !== 0) { 
                    bbox.expandByPoint(new THREE.Vector3(x, y, z));
                }
            }

            const size = new THREE.Vector3();
            bbox.getSize(size);
            const globalDim = Math.max(size.x, size.y, size.z, 0.1); 

            objectListContainer.innerHTML = '';
            rightPanel.classList.add('flex'); rightPanel.classList.remove('hidden');

            data.objects.forEach((obj, i) => {
                let colorHex;
                if (obj.type === 'Rigid Body') {
                    colorHex = colors[i % colors.length];
                } else if (obj.parentRbIdx !== -1) {
                    colorHex = colors[obj.parentRbIdx % colors.length];
                } else {
                    colorHex = colors[i % colors.length]; 
                }

                const color = new THREE.Color(colorHex);
                const group = new THREE.Group();
                
                if (obj.type === 'Rigid Body') {
                    const geometry = new THREE.BoxGeometry(1, 1, 1);
                    const material = new THREE.MeshStandardMaterial({ 
                        color: color, 
                        transparent: true, 
                        opacity: globalSettings.rbOpacity, 
                        roughness: 0.5 
                    });
                    const mesh = new THREE.Mesh(geometry, material);
                    group.add(mesh);
                    
                    const edges = new THREE.EdgesGeometry(geometry);
                    const edgeMat = new THREE.LineBasicMaterial({ 
                        color: color, 
                        transparent: true, 
                        opacity: Math.min(1.0, globalSettings.rbOpacity + 0.3) 
                    });
                    const edgeMesh = new THREE.LineSegments(edges, edgeMat);
                    group.add(edgeMesh);
                    
                    const axesHelper = new THREE.AxesHelper(1);
                    group.add(axesHelper);
                } else {
                    const geometry = new THREE.SphereGeometry(1, 16, 16);
                    const material = new THREE.MeshStandardMaterial({ 
                        color: color, 
                        roughness: 0.2,
                        transparent: true,
                        opacity: globalSettings.markerOpacity
                    });
                    const mesh = new THREE.Mesh(geometry, material);
                    group.add(mesh);
                }

                // 標準のTHREE.Lineによる軌跡の作成 (NaNで切断)
                const trailPoints = [];
                const step = Math.max(1, Math.floor(data.frameCount / 2000));
                let wasValid = false;
                
                for(let f = 0; f < data.frameCount; f += step) {
                    const pBase = (f * playbackData.numObjects + i) * 3;
                    const v = new THREE.Vector3(data.positions[pBase], data.positions[pBase+1], data.positions[pBase+2]);
                    
                    if(v.lengthSq() > 0.0001) {
                         trailPoints.push(v);
                         wasValid = true;
                    } else {
                        // トラッキングがロストした部分は線を切るためにNaNを入れる
                        if (wasValid) {
                            trailPoints.push(new THREE.Vector3(NaN, NaN, NaN));
                            wasValid = false;
                        }
                    }
                }
                
                const trailGeo = new THREE.BufferGeometry().setFromPoints(trailPoints);
                const trailMat = new THREE.LineBasicMaterial({ 
                    color: color, 
                    transparent: true, 
                    opacity: globalSettings.trailOpacity,
                    linewidth: globalSettings.trailWidth
                });
                
                const trailObj = new THREE.Line(trailGeo, trailMat);
                // 追従モードの計算用に保存
                trailObj.userData.step = step;
                trailObj.userData.maxPoints = trailPoints.length;

                scene.add(group);
                scene.add(trailObj);
                
                playbackData.meshes.push(group);
                playbackData.trails.push(trailObj);
            });

            // 剛体ごとにマーカー間を結ぶLineSegmentsを作成
            playbackData.rigidBodyIndices.forEach(rbIdx => {
                const obj = data.objects[rbIdx];
                const colorHex = colors[rbIdx % colors.length];
                const numMarkers = obj.childMarkers.length;
                
                if (numMarkers > 1) {
                    const maxLines = (numMarkers * (numMarkers - 1)) / 2;
                    const lineGeo = new THREE.BufferGeometry();
                    const positions = new Float32Array(maxLines * 2 * 3);
                    lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
                    const lineMat = new THREE.LineBasicMaterial({ 
                        color: colorHex, 
                        transparent: true, 
                        opacity: globalSettings.trailOpacity,
                        linewidth: globalSettings.trailWidth
                    });
                    const lineSegments = new THREE.LineSegments(lineGeo, lineMat);
                    scene.add(lineSegments);
                    playbackData.markerLineSegments[rbIdx] = lineSegments;
                }
            });

            playbackData.rigidBodyIndices.forEach(idx => {
                const obj = data.objects[idx];
                const colorHex = colors[idx % colors.length];
                
                const itemDiv = document.createElement('div');
                itemDiv.className = 'flex items-center gap-3 bg-gray-800/80 hover:bg-gray-700/80 p-2 rounded transition cursor-pointer';
                
                const checkbox = document.createElement('input');
                checkbox.type = 'checkbox';
                checkbox.checked = false; // デフォルト非表示
                checkbox.id = `rb-cb-${idx}`;
                checkbox.className = 'w-4 h-4 text-blue-600 bg-gray-900 border-gray-600 rounded focus:ring-blue-500 cursor-pointer shrink-0';
                
                itemDiv.addEventListener('click', (e) => {
                    if(e.target !== checkbox) {
                        checkbox.checked = !checkbox.checked;
                        updateSceneState();
                    }
                });
                checkbox.addEventListener('change', updateSceneState);

                const colorIndicator = document.createElement('div');
                colorIndicator.className = 'w-3 h-3 rounded-full flex-shrink-0';
                colorIndicator.style.backgroundColor = colorHex;

                const label = document.createElement('span');
                label.className = 'text-xs font-medium text-gray-200 truncate select-none flex-1';
                label.textContent = obj.name;
                label.title = obj.name;

                itemDiv.appendChild(checkbox);
                itemDiv.appendChild(colorIndicator);
                itemDiv.appendChild(label);
                objectListContainer.appendChild(itemDiv);
            });

            objectCountLabel.textContent = playbackData.rigidBodyIndices.length;

            if (!bbox.isEmpty()) {
                const center = new THREE.Vector3();
                bbox.getCenter(center);
                
                camera.position.set(center.x + globalDim, center.y + globalDim, center.z + globalDim);
                controls.target.copy(center);
                camera.near = globalDim * 0.001;
                camera.far = globalDim * 100;
                camera.updateProjectionMatrix();

                const gridSize = Math.ceil(globalDim * 2);
                const gridDivisions = 20;
                const gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x4b5563, 0x374151);
                
                const bottomY = bbox.min.y;
                gridHelper.position.set(center.x, bottomY - (globalDim * 0.05), center.z);
                scene.add(gridHelper);
            }

            applyFrameData(0);
            updateSceneState();

            loadingOverlay.classList.add('hidden');
            controlPanel.classList.remove('hidden');
            btnReset.classList.remove('hidden');
            
            togglePlayback(true);
        }

        const q1 = new THREE.Quaternion();
        const q2 = new THREE.Quaternion();

        function applyFrameData(time) {
            const { frameCount, times, positions, rotations, numObjects, meshes } = playbackData;
            
            if (time <= times[0]) {
                applyExactFrame(0);
                return;
            }
            if (time >= times[frameCount - 1]) {
                applyExactFrame(frameCount - 1);
                return;
            }

            while (currentFrameIdx < frameCount - 2 && times[currentFrameIdx + 1] <= time) {
                currentFrameIdx++;
            }
            while (currentFrameIdx > 0 && times[currentFrameIdx] > time) {
                currentFrameIdx--;
            }

            const idx1 = currentFrameIdx;
            const idx2 = currentFrameIdx + 1;
            const t1 = times[idx1];
            const t2 = times[idx2];
            const ratio = (t2 === t1) ? 0 : (time - t1) / (t2 - t1);

            for (let i = 0; i < numObjects; i++) {
                const group = meshes[i];
                
                const p1Idx = (idx1 * numObjects + i) * 3;
                const p2Idx = (idx2 * numObjects + i) * 3;
                
                const px = positions[p1Idx] + (positions[p2Idx] - positions[p1Idx]) * ratio;
                const py = positions[p1Idx+1] + (positions[p2Idx+1] - positions[p1Idx+1]) * ratio;
                const pz = positions[p1Idx+2] + (positions[p2Idx+2] - positions[p1Idx+2]) * ratio;
                
                group.position.set(px, py, pz);

                const r1Idx = (idx1 * numObjects + i) * 4;
                const r2Idx = (idx2 * numObjects + i) * 4;
                
                q1.set(rotations[r1Idx], rotations[r1Idx+1], rotations[r1Idx+2], rotations[r1Idx+3]);
                q2.set(rotations[r2Idx], rotations[r2Idx+1], rotations[r2Idx+2], rotations[r2Idx+3]);
                
                group.quaternion.slerpQuaternions(q1, q2, ratio);
            }
        }

        function applyExactFrame(idx) {
            const { positions, rotations, numObjects, meshes } = playbackData;
            for (let i = 0; i < numObjects; i++) {
                const group = meshes[i];
                
                const pIdx = (idx * numObjects + i) * 3;
                group.position.set(positions[pIdx], positions[pIdx+1], positions[pIdx+2]);
                
                const rIdx = (idx * numObjects + i) * 4;
                group.quaternion.set(rotations[rIdx], rotations[rIdx+1], rotations[rIdx+2], rotations[rIdx+3]);
            }
        }

        function updateSceneState() {
            if (!playbackData || playbackData.numObjects === 0) return;

            const showRb = toggleRb.checked;
            const showMarker = toggleMarker.checked;
            const showUnassignedMarker = toggleUnassignedMarker.checked;
            const showRbTrail = toggleRbTrail.checked;
            const showMarkerTrail = toggleMarkerTrail.checked;
            const isFollow = !toggleTrailAll.checked;

            const dist = camera.position.distanceTo(controls.target);
            const vFov = camera.fov * Math.PI / 180;
            const visibleHeight = 2 * Math.tan(vFov / 2) * dist;
            
            const rbScale = visibleHeight * 0.03 * globalSettings.rbSize; 
            const markerScale = visibleHeight * 0.003 * globalSettings.markerSize;

            let anySelected = false;

            playbackData.rigidBodyIndices.forEach(rbIdx => {
                const rbObj = playbackData.objects[rbIdx];
                const rbGroup = playbackData.meshes[rbIdx];
                
                const cb = document.getElementById(`rb-cb-${rbIdx}`);
                const isRbChecked = cb ? cb.checked : false;
                
                if (isRbChecked) anySelected = true;
                
                const rbIsMissing = rbGroup.position.lengthSq() < 0.0001;

                // 剛体の表示制御
                rbGroup.visible = isRbChecked && showRb && !rbIsMissing;
                if (rbGroup.children[0]) rbGroup.children[0].scale.set(rbScale, rbScale, rbScale);
                if (rbGroup.children[1]) rbGroup.children[1].scale.set(rbScale, rbScale, rbScale);
                if (rbGroup.children[2]) rbGroup.children[2].scale.set(rbScale * 1.2, rbScale * 1.2, rbScale * 1.2);

                // 剛体軌跡の表示制御
                if (playbackData.trails[rbIdx]) {
                    const trail = playbackData.trails[rbIdx];
                    trail.visible = isRbChecked && showRbTrail;
                    
                    if (isFollow) {
                        const count = Math.floor(currentFrameIdx / trail.userData.step) + 1;
                        trail.geometry.setDrawRange(0, count);
                    } else {
                        trail.geometry.setDrawRange(0, Infinity);
                    }
                }

                const validMarkerPositions = [];
                rbObj.childMarkers.forEach(mIdx => {
                    const mGroup = playbackData.meshes[mIdx];
                    const mIsMissing = mGroup.position.lengthSq() < 0.0001;
                    
                    // マーカーの表示制御
                    mGroup.visible = isRbChecked && showMarker && !mIsMissing;
                    if (mGroup.children[0]) {
                        mGroup.children[0].scale.set(markerScale, markerScale, markerScale);
                    }

                    // マーカー軌跡の表示制御
                    if (playbackData.trails[mIdx]) {
                        const mTrail = playbackData.trails[mIdx];
                        mTrail.visible = isRbChecked && showMarkerTrail;
                        
                        if (isFollow) {
                            const count = Math.floor(currentFrameIdx / mTrail.userData.step) + 1;
                            mTrail.geometry.setDrawRange(0, count);
                        } else {
                            mTrail.geometry.setDrawRange(0, Infinity);
                        }
                    }

                    if (!mIsMissing) {
                        validMarkerPositions.push(mGroup.position);
                    }
                });

                // マーカー間を結ぶ結線
                if (playbackData.markerLineSegments[rbIdx]) {
                    const lineObj = playbackData.markerLineSegments[rbIdx];
                    
                    if (!isRbChecked || !showMarker || rbIsMissing || validMarkerPositions.length < 2) {
                        lineObj.visible = false;
                    } else {
                        lineObj.visible = true;
                        const positions = lineObj.geometry.attributes.position.array;
                        let pIdx = 0;
                        for (let i = 0; i < validMarkerPositions.length; i++) {
                            for (let j = i + 1; j < validMarkerPositions.length; j++) {
                                const p1 = validMarkerPositions[i];
                                const p2 = validMarkerPositions[j];
                                positions[pIdx++] = p1.x; positions[pIdx++] = p1.y; positions[pIdx++] = p1.z;
                                positions[pIdx++] = p2.x; positions[pIdx++] = p2.y; positions[pIdx++] = p2.z;
                            }
                        }
                        lineObj.geometry.setDrawRange(0, pIdx / 3);
                        lineObj.geometry.attributes.position.needsUpdate = true;
                    }
                }
            });
            
            playbackData.markerIndices.forEach(mIdx => {
                if (playbackData.objects[mIdx].parentRbIdx === -1) {
                    const mGroup = playbackData.meshes[mIdx];
                    const mIsMissing = mGroup.position.lengthSq() < 0.0001;
                    
                    mGroup.visible = showMarker && showUnassignedMarker && !mIsMissing; 
                    if (mGroup.children[0]) mGroup.children[0].scale.set(markerScale, markerScale, markerScale);
                    
                    if (playbackData.trails[mIdx]) {
                        const trail = playbackData.trails[mIdx];
                        trail.visible = showMarkerTrail && showUnassignedMarker;
                        
                        if (isFollow) {
                            const count = Math.floor(currentFrameIdx / trail.userData.step) + 1;
                            trail.geometry.setDrawRange(0, count);
                        } else {
                            trail.geometry.setDrawRange(0, Infinity);
                        }
                    }
                }
            });

            // 剛体未選択ヒントの表示制御
            if (anySelected || showUnassignedMarker) {
                noSelectionHint.classList.add('opacity-0');
                setTimeout(() => { if(!anySelected && !showUnassignedMarker) noSelectionHint.classList.add('hidden'); }, 300);
            } else {
                noSelectionHint.classList.remove('hidden');
                setTimeout(() => noSelectionHint.classList.remove('opacity-0'), 10);
            }
        }

        function resetApp() {
            currentTime = 0;
            currentFrameIdx = 0;
            togglePlayback(false);
            toggleAllRbs.checked = false;
            tooltip.classList.add('hidden');
            noSelectionHint.classList.add('hidden');
            
            playbackData = { frameCount: 0 };
            while(scene.children.length > 0){ scene.remove(scene.children[0]); }
            const gridHelper = new THREE.GridHelper(10, 20, 0x4b5563, 0x374151);
            scene.add(gridHelper);
            
            controlPanel.classList.add('hidden');
            rightPanel.classList.remove('flex'); rightPanel.classList.add('hidden');
            objectListContainer.innerHTML = '';
            btnReset.classList.add('hidden');
            dropZoneContainer.classList.remove('hidden');
            fileInput.value = '';
            
            camera.position.set(2, 2, 3);
            controls.target.set(0, 0, 0);
            controls.update();
        }

