        document.addEventListener('DOMContentLoaded', () => {
            // --- Global Variables ---
            let modalChartInstance = null;

            // --- SPA Navigation ---
            const pages = document.querySelectorAll('.page');
            const mobileMenuBtn = document.getElementById('mobile-menu-btn');
            const mobileMenuOverlay = document.getElementById('mobile-menu-overlay');
            const mobileMenuContent = document.getElementById('mobile-menu-content');
            const mobileMenuCloseBtn = document.getElementById('mobile-menu-close-btn');
            const mobileNavLinks = document.getElementById('mobile-nav-links');
            const mobileTitle = document.getElementById('mobile-title');
            const mainContentArea = document.getElementById('main-content-area');

            function openMobileMenu() {
                if (!mobileMenuOverlay) return;
                document.body.classList.add('mobile-menu-open');
                mobileMenuOverlay.classList.remove('hidden');
                setTimeout(() => {
                    mobileMenuOverlay.classList.remove('opacity-0');
                    if (mobileMenuContent) mobileMenuContent.classList.remove('-translate-x-full');
                }, 10);
            }

            function closeMobileMenu() {
                if (!mobileMenuOverlay) return;
                document.body.classList.remove('mobile-menu-open');
                mobileMenuOverlay.classList.add('opacity-0');
                if (mobileMenuContent) mobileMenuContent.classList.add('-translate-x-full');
                setTimeout(() => {
                    mobileMenuOverlay.classList.add('hidden');
                }, 300);
            }

            function renderMath() {
                if (window.renderMathInElement) {
                    renderMathInElement(document.getElementById('algorithms'), {
                        delimiters: [
                            { left: '$$', right: '$$', display: true },
                            { left: '$', right: '$', display: false },
                            { left: '\\(', right: '\\)', display: false },
                            { left: '\\[', right: '\\]', display: true }
                        ],
                        throwOnError: false
                    });
                }
            }

            function showPage(pageId) {
                pages.forEach(page => {
                    page.classList.remove('active');
                });
                const targetPage = document.getElementById(pageId);
                if (targetPage) {
                    targetPage.classList.add('active');
                }

                document.querySelectorAll('.nav-link').forEach(link => {
                    const linkPageId = link.getAttribute('href').substring(1);
                    const isActive = linkPageId === pageId;
                    link.classList.toggle('active', isActive);

                    if (isActive) {
                        const titleText = link.querySelector('span')?.textContent || link.textContent.trim();
                        if (mobileTitle) mobileTitle.textContent = titleText;
                    }
                });
                window.scrollTo(0, 0);

                if (pageId === 'algorithms') {
                    renderMath();
                }

                // --- Theater Mode Control ---
                if (pageId === 'mocap-viewer') {
                    document.body.classList.add('theater-mode');
                    // Canvas resize might be needed when element becomes visible
                    setTimeout(() => window.dispatchEvent(new Event('resize')), 50);
                } else {
                    document.body.classList.remove('theater-mode');
                }
            }

            if (mobileMenuBtn) mobileMenuBtn.addEventListener('click', openMobileMenu);
            if (mobileMenuCloseBtn) mobileMenuCloseBtn.addEventListener('click', closeMobileMenu);
            if (mobileMenuOverlay) {
                mobileMenuOverlay.addEventListener('click', (e) => {
                    if (e.target === mobileMenuOverlay) closeMobileMenu();
                });
            }

            const allNavLinks = document.querySelectorAll('.nav-link, .nav-card');
            allNavLinks.forEach(link => {
                link.addEventListener('click', (e) => {
                    e.preventDefault();
                    const pageId = link.getAttribute('href').substring(1);
                    history.pushState(null, '', '#' + pageId);
                    showPage(pageId);
                    closeMobileMenu();
                });
            });

            window.addEventListener('popstate', () => {
                const pageId = window.location.hash ? window.location.hash.substring(1) : 'home';
                showPage(pageId);
            });

            const initialPage = window.location.hash ? window.location.hash.substring(1) : 'home';
            if (document.getElementById(initialPage)) {
                showPage(initialPage);
            } else {
                showPage('home');
            }

            // --- DATA ANALYSIS TOOL SCRIPT ---
            const fileDataStore = {};
            const chartInstances = {};
            let allInstantaneousVelocities = [];
            let lastProcessedData = [];

            const csvFileInput = document.getElementById('csv-files');
            const fileListDiv = document.getElementById('file-list');
            const clearFilesBtn = document.getElementById('clear-files-btn');
            const travelAxisSelect = document.getElementById('travel-axis');
            const verticalAxisSelect = document.getElementById('vertical-axis');
            const rigidbodySelectionSection = document.getElementById('rigidbody-selection-section');
            const rigidbodyListDiv = document.getElementById('rigidbody-list');
            const startAnalysisBtn = document.getElementById('start-analysis-btn');
            const resultsSection = document.getElementById('results-section');
            const loadingDiv = document.getElementById('loading');
            const downloadOverlay = document.getElementById('download-overlay');
            const filterVelocityCheckbox = document.getElementById('filter-velocity-checkbox');
            const filterRangeInputs = document.getElementById('filter-range-inputs');
            const recalculateAvgBtn = document.getElementById('recalculate-avg-btn');
            const redrawChartsBtn = document.getElementById('redraw-charts-btn');
            const loadingText = document.getElementById('loading-text');

            const lowpassFilterTypeSelect = document.getElementById('lowpass-filter-type');
            const lowpassStrengthInput = document.getElementById('lowpass-strength');
            const lowpassStrengthLabel = document.getElementById('lowpass-strength-label');
            const filterDescription = document.getElementById('filter-description');


            // --- Modal Elements ---
            const chartZoomModal = document.getElementById('chart-zoom-modal');
            const modalCloseBtn = document.getElementById('modal-close-btn');
            const modalChartCanvas = document.getElementById('modal-chart-canvas');

            // --- Low Pass Filter Helpers ---
            function applyMovingAverageFilter(dataPoints, windowSize) {
                if (windowSize <= 1 || dataPoints.length < windowSize) return dataPoints;

                const smoothedPoints = [];
                const halfWindow = Math.floor(windowSize / 2);

                for (let i = 0; i < dataPoints.length; i++) {
                    const start = Math.max(0, i - halfWindow);
                    const end = Math.min(dataPoints.length - 1, i + halfWindow);
                    let sumY = 0;
                    for (let j = start; j <= end; j++) {
                        sumY += dataPoints[j].y;
                    }
                    const avgY = sumY / (end - start + 1);
                    smoothedPoints.push({ x: dataPoints[i].x, y: avgY });
                }
                return smoothedPoints;
            }

            function applyGaussianFilter(dataPoints, sigma) {
                if (sigma <= 0 || dataPoints.length < 3) return dataPoints;

                const radius = Math.ceil(sigma * 3);
                const kernel = [];
                let kernelSum = 0;
                for (let i = -radius; i <= radius; i++) {
                    const val = Math.exp(-0.5 * (i / sigma) * (i / sigma));
                    kernel.push(val);
                    kernelSum += val;
                }
                for (let i = 0; i < kernel.length; i++) {
                    kernel[i] /= kernelSum;
                }

                const smoothedPoints = [];
                const halfKernel = Math.floor(kernel.length / 2);

                for (let i = 0; i < dataPoints.length; i++) {
                    let weightedSumY = 0;
                    for (let j = 0; j < kernel.length; j++) {
                        const dataIndex = i + j - halfKernel;
                        const clampedIndex = Math.max(0, Math.min(dataPoints.length - 1, dataIndex));
                        weightedSumY += dataPoints[clampedIndex].y * kernel[j];
                    }
                    smoothedPoints.push({ x: dataPoints[i].x, y: weightedSumY });
                }
                return smoothedPoints;
            }

            function rerenderCharts() {
                if (lastProcessedData && lastProcessedData.length > 0) {
                    renderAllCharts(lastProcessedData, travelAxisSelect.value, verticalAxisSelect.value);
                } else {
                    alert('先に解析を実行してください。');
                }
            }

            if (csvFileInput) {
                csvFileInput.addEventListener('change', (e) => handleFileSelect(e, 'data-analysis'));
                startAnalysisBtn.addEventListener('click', startAnalysis);
                if (clearFilesBtn) {
                    clearFilesBtn.addEventListener('click', () => clearAllFiles('data-analysis'));
                }

                lowpassFilterTypeSelect.addEventListener('change', (e) => {
                    const filterType = e.target.value;
                    if (filterType === 'none') {
                        lowpassStrengthInput.disabled = true;
                        lowpassStrengthLabel.innerHTML = '強度:';
                        filterDescription.textContent = 'フィルタを選択すると、強度を指定できます。';
                    } else if (filterType === 'moving-average') {
                        lowpassStrengthInput.disabled = false;
                        lowpassStrengthInput.value = 10;
                        lowpassStrengthInput.step = 1;
                        lowpassStrengthLabel.innerHTML = 'サンプル数:';
                        filterDescription.textContent = '移動平均のサンプル数（整数）を指定します。値が大きいほど滑らかになります。';
                    } else if (filterType === 'gaussian') {
                        lowpassStrengthInput.disabled = false;
                        lowpassStrengthInput.value = 2.0;
                        lowpassStrengthInput.step = 0.1;
                        lowpassStrengthLabel.innerHTML = 'σ値:';
                        filterDescription.innerHTML = '<b>σ値の目安:</b> 1.0-2.5(弱), 2.5-3.5(標準), 3.5-5.0(強)';
                    }
                });

                rigidbodyListDiv.addEventListener('change', (event) => {
                    if (event.target.classList.contains('rigidbody-checkbox')) {
                        const checkbox = event.target;
                        const itemContainer = checkbox.closest('.rigidbody-item-container');
                        const legendInputContainer = itemContainer.querySelector('.legend-input-container');
                        if (legendInputContainer) {
                            legendInputContainer.classList.toggle('hidden', !checkbox.checked);
                        }
                    }
                });

                fileListDiv.addEventListener('click', async (event) => {
                    const pasteBtn = event.target.closest('.paste-btn');
                    if (!pasteBtn) return;

                    try {
                        const text = await navigator.clipboard.readText();
                        const targetId = pasteBtn.dataset.targetId;
                        const targetInput = document.getElementById(targetId);
                        if (targetInput && !isNaN(parseFloat(text))) {
                            targetInput.value = parseFloat(text);
                        } else {
                            console.warn("Pasted content is not a valid number.");
                        }
                    } catch (err) {
                        console.error('Failed to read clipboard contents: ', err);
                        alert("クリップボードの読み取りに失敗しました。ブラウザの権限設定を確認してください。");
                    }
                });

                filterVelocityCheckbox.addEventListener('change', () => {
                    filterRangeInputs.classList.toggle('hidden', !filterVelocityCheckbox.checked);
                });
                recalculateAvgBtn.addEventListener('click', recalculateAverages);

                if (redrawChartsBtn) redrawChartsBtn.addEventListener('click', rerenderCharts);


                document.querySelectorAll('.style-btn').forEach(btn => btn.addEventListener('click', handleStyleChange));
                document.getElementById('download-velocity-csv').addEventListener('click', downloadVelocityCSV);
                document.querySelectorAll('.chart-label-input').forEach(input => {
                    input.addEventListener('input', updateAllChartLabels);
                });

                resultsSection.addEventListener('click', (event) => {
                    const button = event.target.closest('button');
                    if (!button) return;

                    if (button.classList.contains('zoom-btn')) {
                        handleZoom(button.dataset.chartId);
                    } else if (button.classList.contains('download-btn')) {
                        handleDownload(button.dataset.chartId, button.dataset.format);
                    }
                });
            }

            if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeZoomModal);
            if (chartZoomModal) chartZoomModal.addEventListener('click', (e) => { if (e.target === chartZoomModal) closeZoomModal(); });

            function handleZoom(chartId) {
                const originalChart = chartInstances[chartId];
                if (!originalChart) return;
                if (modalChartInstance) modalChartInstance.destroy();
                const modalChartOptions = JSON.parse(JSON.stringify(originalChart.options));
                modalChartOptions.maintainAspectRatio = false;
                modalChartOptions.plugins.title.font.size = 20;
                modalChartOptions.plugins.legend.labels.font.size = 14;
                modalChartOptions.scales.x.title.font.size = 16;
                modalChartOptions.scales.y.title.font.size = 16;
                modalChartOptions.scales.x.ticks.font.size = 14;
                modalChartOptions.scales.y.ticks.font.size = 14;
                modalChartInstance = new Chart(modalChartCanvas, { type: originalChart.config.type, data: originalChart.config.data, options: modalChartOptions });
                chartZoomModal.classList.remove('hidden');
            }

            function closeZoomModal() {
                if (modalChartInstance) { modalChartInstance.destroy(); modalChartInstance = null; }
                chartZoomModal.classList.add('hidden');
            }


            function clearAllFiles(tool) {
                if (tool === 'data-analysis') {
                    for (const key in fileDataStore) { delete fileDataStore[key]; }
                    fileListDiv.innerHTML = '';
                    rigidbodyListDiv.innerHTML = '';
                    rigidbodySelectionSection.classList.add('hidden');
                    resultsSection.classList.add('hidden');
                    csvFileInput.value = '';
                }
            }

            function handleFileSelect(event, tool) {
                const files = Array.from(event.target.files);
                if (files.length === 0) return;

                if (tool === 'data-analysis') {
                    rigidbodySelectionSection.classList.remove('hidden');

                    files.forEach(file => {
                        if (fileDataStore[file.name]) {
                            console.log(`File "${file.name}" is already loaded. Skipping.`);
                            return;
                        }

                        const fileId = `file-${file.name.replace(/[^a-zA-Z0-9]/g, '')}`;
                        const fileElement = document.createElement('div');
                        fileElement.className = 'bg-slate-50 p-2.5 rounded-md flex items-center justify-between border text-sm';
                        fileElement.innerHTML = `
                            <span class="text-slate-700 truncate pr-4">${file.name}</span>
                            <div class="flex items-center flex-shrink-0">
                                <label for="speed-${fileId}" class="text-xs text-slate-500 mr-2 whitespace-nowrap">基準速度(m/s):</label>
                                <div class="flex">
                                    <input type="number" id="speed-${fileId}" data-filename="${file.name}" class="reference-speed-input bg-white border border-slate-300 rounded-l-md w-20 p-1 text-right text-sm" step="0.1" value="1.0">
                                    <button type="button" class="paste-btn p-1.5 bg-slate-100 hover:bg-slate-200 border border-l-0 border-slate-300 rounded-r-md" data-target-id="speed-${fileId}" title="ペースト">
                                        <svg class="h-4 w-4 text-slate-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>
                                    </button>
                                </div>
                            </div>
                        `;
                        fileListDiv.appendChild(fileElement);
                        Papa.parse(file, {
                            complete: (results) => {
                                try {
                                    const rigidBodies = extractRigidBodies(results.data);
                                    fileDataStore[file.name] = { rawData: results.data, rigidBodies };
                                    displayRigidBodySelector(file.name, rigidBodies);
                                } catch (error) {
                                    alert(`ファイル "${file.name}" の解析中にエラーが発生しました: ${error.message}`);
                                }
                            },
                            error: (error) => alert(`ファイル "${file.name}" の読み込みに失敗しました: ${error.message}`)
                        });
                    });
                }
                event.target.value = '';
            }

            function extractRigidBodies(data) {
                let typeRowIndex = -1, nameRowIndex = -1, propertyRowIndex = -1, dataStartIndex = -1;
                for (let i = 0; i < 15 && i < data.length; i++) {
                    if (data[i][1] === 'Type') typeRowIndex = i;
                    if (data[i][1] === 'Name') nameRowIndex = i;
                    if (data[i][2] === 'Rotation' || data[i][2] === 'Position') propertyRowIndex = i;
                    if (data[i][0] === 'Frame' && data[i][1] === 'Time (Seconds)') dataStartIndex = i + 1;
                }
                if (typeRowIndex === -1 || nameRowIndex === -1 || propertyRowIndex === -1 || dataStartIndex === -1) throw new Error("CSVのヘッダー形式が不正です。");

                const [typeRow, nameRow, propertyRow] = [data[typeRowIndex], data[nameRowIndex], data[propertyRowIndex]];
                const rigidBodies = {};

                for (let i = 2; i < typeRow.length; i++) {
                    if (typeRow[i] === 'Rigid Body' && propertyRow[i] === 'Position') {
                        const name = nameRow[i];
                        if (!rigidBodies[name]) rigidBodies[name] = { name: name, posIndices: {} };
                        rigidBodies[name].posIndices = { X: i, Y: i + 1, Z: i + 2 };
                        i += 2;
                    }
                }

                const dataUnit = document.querySelector('input[name="data-unit"]:checked').value;
                const conversionFactor = dataUnit === 'mm' ? 1000 : 1;
                const actualData = data.slice(dataStartIndex).filter(row => row.length > 1 && row[1] !== '');
                Object.values(rigidBodies).forEach(body => {
                    body.data = actualData.map(row => ({
                        time: parseFloat(row[1]),
                        pos: {
                            X: parseFloat(row[body.posIndices.X]) / conversionFactor,
                            Y: parseFloat(row[body.posIndices.Y]) / conversionFactor,
                            Z: parseFloat(row[body.posIndices.Z]) / conversionFactor
                        }
                    })).filter(d => !isNaN(d.time) && !isNaN(d.pos.X));
                });
                return Object.values(rigidBodies);
            }

            function displayRigidBodySelector(filename, rigidBodies) {
                const fileGroupContainer = document.createElement('div');
                fileGroupContainer.className = 'mb-4';
                let listHTML = `<h3 class="text-md font-semibold text-slate-700 mb-2 border-b pb-2">[${filename}] の剛体</h3><div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-y-2 gap-x-4">`;
                if (rigidBodies.length === 0) {
                    listHTML += `<p class="text-slate-500 col-span-full text-sm">剛体データが見つかりませんでした。</p>`;
                } else {
                    rigidBodies.forEach(body => {
                        const defaultLabel = `${filename} - ${body.name}`;
                        listHTML += `
                        <div class="rigidbody-item-container">
                            <label class="flex items-center space-x-2 p-2 rounded-md hover:bg-slate-100 cursor-pointer w-full">
                                <input type="checkbox" class="rigidbody-checkbox form-checkbox h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" data-filename="${filename}" data-bodyname="${body.name}">
                                <span class="text-slate-800 text-sm">${body.name}</span>
                            </label>
                            <div class="legend-input-container hidden pl-7 mt-1">
                                <label class="text-xs text-slate-500">凡例名:</label>
                                <input type="text" class="legend-label-input mt-1 block w-full rounded-md shadow-sm p-1.5 text-sm border-slate-300 focus:ring-1 focus:ring-blue-500 focus:border-blue-500" data-filename="${filename}" data-bodyname="${body.name}" value="${defaultLabel}">
                            </div>
                        </div>`;
                    });
                }
                listHTML += `</div>`;
                fileGroupContainer.innerHTML = listHTML;
                rigidbodyListDiv.appendChild(fileGroupContainer);
            }

            function startAnalysis() {
                const travelAxis = travelAxisSelect.value;
                const verticalAxis = verticalAxisSelect.value;
                if (travelAxis === verticalAxis) {
                    alert('進行方向と鉛直方向は異なる軸を選択してください。');
                    return;
                }

                const motionDetectionSettings = {
                    multiplier: parseFloat(document.getElementById('motion-threshold-multiplier').value)
                };

                const selectedBodies = [];
                document.querySelectorAll('.rigidbody-checkbox:checked').forEach(cb => {
                    const filename = cb.dataset.filename;
                    const bodyName = cb.dataset.bodyname;
                    const labelInput = document.querySelector(`.legend-label-input[data-filename="${filename}"][data-bodyname="${bodyName}"]`);
                    const label = labelInput ? labelInput.value : `${filename} - ${bodyName}`;
                    selectedBodies.push({ filename, bodyName, label });
                });
                if (selectedBodies.length === 0) {
                    alert('解析する剛体を少なくとも1つ選択してください。');
                    return;
                }
                loadingText.textContent = '解析中...';
                loadingDiv.classList.remove('hidden');
                resultsSection.classList.add('hidden');
                setTimeout(() => {
                    try {
                        lastProcessedData = processAllBodies(selectedBodies, travelAxis, verticalAxis, motionDetectionSettings);
                        displayResults(lastProcessedData);
                        renderAllCharts(lastProcessedData, travelAxis, verticalAxis);
                        resultsSection.classList.remove('hidden');
                        setTimeout(() => resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                    } catch (error) {
                        console.error("解析エラー:", error);
                        alert(`解析中にエラーが発生しました: ${error.message}`);
                    } finally {
                        loadingDiv.classList.add('hidden');
                    }
                }, 50);
            }

            function recalculateAverages() {
                const useFilter = filterVelocityCheckbox.checked;
                const lowerBound = parseFloat(document.getElementById('filter-lower-bound').value);
                const upperBound = parseFloat(document.getElementById('filter-upper-bound').value);

                if (useFilter && (isNaN(lowerBound) || isNaN(upperBound))) {
                    alert('有効な除外範囲を入力してください。');
                    return;
                }

                const updatedData = lastProcessedData.map(bodyData => {
                    let newAvgVelocity;
                    if (useFilter) {
                        let filteredDistance = 0;
                        let filteredTime = 0;
                        for (let i = 1; i < bodyData.data.length; i++) {
                            const vel = bodyData.data[i].instVelocity;
                            if (vel < lowerBound || vel > upperBound) {
                                filteredDistance += (bodyData.data[i].distance - bodyData.data[i - 1].distance);
                                filteredTime += (bodyData.data[i].time - bodyData.data[i - 1].time);
                            }
                        }
                        newAvgVelocity = filteredTime > 0 ? filteredDistance / filteredTime : 0;
                    } else {
                        const totalTime = bodyData.data[bodyData.data.length - 1].time;
                        const totalDistance = bodyData.data[bodyData.data.length - 1].distance;
                        newAvgVelocity = totalTime > 0 ? totalDistance / totalTime : 0;
                    }

                    let newAvgSlipRate = 0;
                    const u = bodyData.referenceSpeed;
                    const v = newAvgVelocity;
                    if (u > 0 && v >= 0) {
                        newAvgSlipRate = (u > v) ? (1 - (v / u)) * 100 : (1 - (u / v)) * 100;
                    }

                    return { ...bodyData, avgVelocity: newAvgVelocity, avgSlipRate: newAvgSlipRate };
                });

                displayResults(updatedData);
            }

            function processAllBodies(selectedBodies, travelAxis, verticalAxis, motionDetectionSettings) {
                allInstantaneousVelocities = [];
                return selectedBodies.map(selection => {
                    const { filename, bodyName, label } = selection;
                    const body = fileDataStore[filename].rigidBodies.find(b => b.name === bodyName);
                    const referenceSpeedInput = document.querySelector(`input[data-filename="${filename}"]`);
                    if (!referenceSpeedInput) throw new Error(`基準速度の入力が見つかりません: ${filename}`);
                    const referenceSpeed = parseFloat(referenceSpeedInput.value);

                    if (!body || isNaN(referenceSpeed)) throw new Error(`データまたは基準速度が見つかりません: ${filename} - ${bodyName}`);

                    const motionRange = findMotionRange(body.data, travelAxis, motionDetectionSettings);
                    if (!motionRange) {
                        console.warn(`${label} の有効な動作が見つかりませんでした。スキップします。`);
                        return null;
                    }

                    let workingData = body.data.slice(motionRange.start, motionRange.end);
                    if (workingData.length < 2) return null;

                    const startTime = workingData[0].time;
                    const initialPos = workingData[0].pos;
                    const horizontalAxes = ['X', 'Y', 'Z'].filter(ax => ax !== verticalAxis);

                    workingData.forEach((d, i) => {
                        d.time = d.time - startTime;
                        const d_h1 = d.pos[horizontalAxes[0]] - initialPos[horizontalAxes[0]];
                        const d_h2 = d.pos[horizontalAxes[1]] - initialPos[horizontalAxes[1]];
                        d.distance = Math.sqrt(d_h1 ** 2 + d_h2 ** 2);
                        d.verticalDisp = d.pos[verticalAxis] - initialPos[verticalAxis];

                        const chartXAxisName = travelAxis;
                        const chartYAxisName = horizontalAxes.find(ax => ax !== travelAxis);
                        d.trajectory_x = d.pos[chartXAxisName] - initialPos[chartXAxisName];
                        d.trajectory_y = d.pos[chartYAxisName] - initialPos[chartYAxisName];

                        if (i === 0) { d.instVelocity = 0; } else {
                            const dt = d.time - workingData[i - 1].time;
                            const dd = d.distance - workingData[i - 1].distance;
                            d.instVelocity = dt > 0 ? dd / dt : 0;
                        }
                        const u = referenceSpeed, v = d.instVelocity;
                        if (u > 0 && v >= 0) d.slipRate = (u > v) ? (1 - (v / u)) * 100 : (1 - (u / v)) * 100;
                        else d.slipRate = 0;
                    });

                    const totalTime = workingData[workingData.length - 1].time;
                    const totalDistance = workingData[workingData.length - 1].distance;
                    const avgVelocity = totalTime > 0 ? totalDistance / totalTime : 0;

                    let avgSlipRate = 0;
                    if (referenceSpeed > 0 && avgVelocity >= 0) {
                        avgSlipRate = (referenceSpeed > avgVelocity) ? (1 - (avgVelocity / referenceSpeed)) * 100 : (1 - (referenceSpeed / avgVelocity)) * 100;
                    }

                    const n = workingData.length;
                    let velocitySampleVariance = 0, velocityUnbiasedVariance = 0;
                    if (n > 1) {
                        const velocityValues = workingData.map(d => d.instVelocity);
                        const meanVel = velocityValues.reduce((a, b) => a + b, 0) / n;
                        const sumOfSquares = velocityValues.map(v => (v - meanVel) ** 2).reduce((a, b) => a + b, 0);
                        velocitySampleVariance = sumOfSquares / n;
                        velocityUnbiasedVariance = sumOfSquares / (n - 1);
                    }

                    let slipRateSampleVariance = 0, slipRateUnbiasedVariance = 0;
                    const slipRateValues = workingData.map(d => d.slipRate).filter(sr => sr !== undefined && !isNaN(sr));
                    const m = slipRateValues.length;
                    if (m > 1) {
                        const meanSlip = slipRateValues.reduce((a, b) => a + b, 0) / m;
                        const sumOfSquares = slipRateValues.map(s => (s - meanSlip) ** 2).reduce((a, b) => a + b, 0);
                        slipRateSampleVariance = sumOfSquares / m;
                        slipRateUnbiasedVariance = sumOfSquares / (m - 1);
                    }

                    workingData.forEach(d => {
                        allInstantaneousVelocities.push({
                            "ファイル名": filename, "剛体名": bodyName, "凡例名": label, "時間 (s)": d.time.toFixed(3),
                            "距離 (m)": d.distance.toFixed(4), "微小速度 (m/s)": d.instVelocity.toFixed(4),
                            "スリップ率 (%)": d.slipRate.toFixed(2), "鉛直変位 (m)": d.verticalDisp.toFixed(4),
                        });
                    });
                    return { name: label, data: workingData, avgVelocity, avgSlipRate, velocitySampleVariance, velocityUnbiasedVariance, slipRateSampleVariance, slipRateUnbiasedVariance, referenceSpeed };
                }).filter(d => d !== null);
            }

            function findMotionRange(data, travelAxis, settings) {
                const pos = data.map(d => d.pos[travelAxis]);
                if (pos.length < 20) return { start: 0, end: pos.length };

                const overallMax = Math.max(...pos);
                const overallMin = Math.min(...pos);
                const overallRange = overallMax - overallMin;
                if (overallRange === 0) return null;

                const margin = overallRange * settings.multiplier;

                const initialValue = pos[0];
                const startLowerBound = initialValue - margin;
                const startUpperBound = initialValue + margin;
                let startIndex = 0;
                for (let i = 1; i < pos.length; i++) {
                    if (pos[i] < startLowerBound || pos[i] > startUpperBound) {
                        startIndex = i;
                        break;
                    }
                }
                if (startIndex === 0) { console.warn("動作開始が検出できませんでした。"); return null; }

                const finalValue = pos[pos.length - 1];
                const endLowerBound = finalValue - margin;
                const endUpperBound = finalValue + margin;

                let endIndex = pos.length;
                for (let i = pos.length - 1; i >= startIndex; i--) {
                    if (pos[i] < endLowerBound || pos[i] > endUpperBound) {
                        endIndex = i + 1;
                        break;
                    }
                }

                if (startIndex >= endIndex) { console.warn("有効な動作区間が見つかりませんでした (開始点が終了点以降)。"); return null; }
                return { start: startIndex, end: endIndex };
            }

            function displayResults(processedData) {
                const container = document.getElementById('average-velocities');
                container.innerHTML = '<h3 class="text-md font-semibold mb-3 text-slate-800">平均値・分散</h3>';
                const list = document.createElement('div');
                list.className = 'space-y-3';
                processedData.forEach(result => {
                    const item = document.createElement('div');
                    item.className = 'p-3 bg-slate-50/70 rounded-md border';
                    item.innerHTML = `
                        <div class="font-semibold text-sm text-blue-700">${result.name}</div>
                        <div class="mt-2 pl-2 text-sm text-slate-700 space-y-1">
                            <div>
                                平均速度: <span class="font-medium">${result.avgVelocity.toFixed(3)} m/s</span>
                                <span class="text-xs text-slate-500 ml-2">(標本分散 σ²: ${result.velocitySampleVariance.toFixed(5)} | 不偏分散 u²: ${result.velocityUnbiasedVariance.toFixed(5)})</span>
                            </div>
                            <div>
                                平均スリップ率: <span class="font-medium">${result.avgSlipRate.toFixed(2)} %</span>
                                 <span class="text-xs text-slate-500 ml-2">(標本分散 σ²: ${result.slipRateSampleVariance.toFixed(3)} | 不偏分散 u²: ${result.slipRateUnbiasedVariance.toFixed(3)})</span>
                            </div>
                        </div>
                         <div class="mt-2 pl-2 text-xs text-slate-500">(基準速度: ${result.referenceSpeed} m/s)</div>
                    `;
                    list.appendChild(item);
                });
                container.appendChild(list);
            }

            function renderAllCharts(processedData, travelAxis, verticalAxis) {
                Object.values(chartInstances).forEach(chart => { if (chart && chart.destroy) chart.destroy() });

                const filterType = lowpassFilterTypeSelect ? lowpassFilterTypeSelect.value : 'none';
                const filterStrength = lowpassStrengthInput ? parseFloat(lowpassStrengthInput.value) : 0;
                const isFiltered = filterType !== 'none';

                const horizontalAxes = ['X', 'Y', 'Z'].filter(ax => ax !== verticalAxis);
                const trajectoryYAxisName = horizontalAxes.find(ax => ax !== travelAxis);

                const initialLabels = {
                    'velocity': { id: 'velocity-chart', title: '速度 vs 距離', x: '距離 (m)', y: '速度 (m/s)' },
                    'slip': { id: 'slip-chart', title: 'スリップ率 vs 距離', x: '距離 (m)', y: 'スリップ率 (%)' },
                    'vertical': { id: 'vertical-chart', title: '鉛直変位 vs 距離', x: '距離 (m)', y: `鉛直変位 (${verticalAxis}軸) (m)` },
                    'trajectory': { id: 'trajectory-chart', title: '平面移動軌跡', x: `${travelAxis}軸 変位 (m)`, y: `${trajectoryYAxisName}軸 変位 (m)` }
                };

                const labelMapping = { 'v': 'velocity', 's': 'slip', 'z': 'vertical', 't': 'trajectory' };
                const prefixMapping = { 'velocity': 'v', 'slip': 's', 'vertical': 'z', 'trajectory': 't' };

                for (const [prefix, fullKey] of Object.entries(labelMapping)) {
                    const labels = initialLabels[fullKey];
                    const finalTitle = isFiltered ? `${labels.title} (ローパス適用)` : labels.title;
                    document.getElementById(`${prefix}-chart-title`).value = finalTitle;
                    document.getElementById(`${prefix}-chart-xlabel`).value = labels.x;
                    document.getElementById(`${prefix}-chart-ylabel`).value = labels.y;
                }

                const colors = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#f97316'];
                const pointStyles = ['circle', 'rect', 'cross', 'star', 'triangle', 'rectRot'];

                const datasets = processedData.map((result, index) => {
                    const color = colors[index % colors.length];
                    const style = pointStyles[index % pointStyles.length];
                    const base = {
                        label: result.name, borderColor: color, backgroundColor: color,
                        pointRadius: 3, pointStyle: style, showLine: true, tension: 0.1, borderWidth: 1.5
                    };

                    let velocityData = result.data.map(d => ({ x: d.distance, y: d.instVelocity }));
                    let slipData = result.data.map(d => ({ x: d.distance, y: d.slipRate }));
                    let verticalData = result.data.map(d => ({ x: d.distance, y: d.verticalDisp }));
                    const trajectoryData = result.data.map(d => ({ x: d.trajectory_x, y: d.trajectory_y }));

                    if (filterType === 'moving-average') {
                        velocityData = applyMovingAverageFilter(velocityData, filterStrength);
                        slipData = applyMovingAverageFilter(slipData, filterStrength);
                        verticalData = applyMovingAverageFilter(verticalData, filterStrength);
                    } else if (filterType === 'gaussian') {
                        velocityData = applyGaussianFilter(velocityData, filterStrength);
                        slipData = applyGaussianFilter(slipData, filterStrength);
                        verticalData = applyGaussianFilter(verticalData, filterStrength);
                    }

                    return {
                        velocity: { ...base, data: velocityData },
                        slip: { ...base, data: slipData },
                        vertical: { ...base, data: verticalData },
                        trajectory: { ...base, data: trajectoryData }
                    };
                });

                ['velocity', 'vertical'].forEach(key => {
                    const chartId = `${key}-chart`;
                    const chartData = datasets.map(d => d[key]);
                    const prefix = prefixMapping[key];
                    const title = document.getElementById(`${prefix}-chart-title`).value;
                    const xlabel = document.getElementById(`${prefix}-chart-xlabel`).value;
                    const ylabel = document.getElementById(`${prefix}-chart-ylabel`).value;
                    chartInstances[chartId] = new Chart(document.getElementById(chartId), {
                        type: 'scatter',
                        data: { datasets: chartData },
                        options: getChartOptions(ylabel, xlabel, title)
                    });
                });

                const slipChartId = 'slip-chart';
                const slipChartData = datasets.map(d => d.slip);
                const slipPrefix = prefixMapping['slip'];
                const slipTitle = document.getElementById(`${slipPrefix}-chart-title`).value;
                const slipXLabel = document.getElementById(`${slipPrefix}-chart-xlabel`).value;
                const slipYLabel = document.getElementById(`${slipPrefix}-chart-ylabel`).value;
                const slipChartOptions = getChartOptions(slipYLabel, slipXLabel, slipTitle);
                slipChartOptions.scales.y.min = 0;
                slipChartOptions.scales.y.max = 100;
                chartInstances[slipChartId] = new Chart(document.getElementById(slipChartId), {
                    type: 'scatter',
                    data: { datasets: slipChartData },
                    options: slipChartOptions
                });

                const trajectoryDatasets = datasets.map(d => d.trajectory);

                let minVal = Infinity, maxVal = -Infinity;
                trajectoryDatasets.forEach(dataset => {
                    dataset.data.forEach(point => {
                        minVal = Math.min(minVal, point.x, point.y);
                        maxVal = Math.max(maxVal, point.x, point.y);
                    });
                });
                const range = maxVal - minVal;
                const padding = range === 0 ? 1 : range * 0.1;
                const finalMin = minVal - padding;
                const finalMax = maxVal + padding;

                const trajectoryPrefix = prefixMapping['trajectory'];
                const trajectoryTitle = document.getElementById(`${trajectoryPrefix}-chart-title`).value;
                const trajectoryXLabel = document.getElementById(`${trajectoryPrefix}-chart-xlabel`).value;
                const trajectoryYLabel = document.getElementById(`${trajectoryPrefix}-chart-ylabel`).value;
                const trajectoryOptions = getChartOptions(trajectoryYLabel, trajectoryXLabel, trajectoryTitle);
                trajectoryOptions.scales.x.min = finalMin;
                trajectoryOptions.scales.x.max = finalMax;
                trajectoryOptions.scales.y.min = finalMin;
                trajectoryOptions.scales.y.max = finalMax;
                trajectoryOptions.aspectRatio = 1;

                chartInstances['trajectory-chart'] = new Chart(document.getElementById('trajectory-chart'), {
                    type: 'scatter',
                    data: { datasets: trajectoryDatasets },
                    options: trajectoryOptions
                });

                const currentStyle = document.querySelector('.style-btn.bg-blue-600');
                handleStyleChange({ target: currentStyle || document.getElementById('style-casual') });
            }

            function updateAllChartLabels() {
                const filterType = lowpassFilterTypeSelect.value;
                const isFiltered = filterType !== 'none';
                const suffix = isFiltered ? ' (ローパス適用)' : '';

                document.querySelectorAll('.chart-label-input').forEach(input => {
                    const chartId = input.dataset.chartId;
                    const labelType = input.dataset.labelType;
                    const chart = chartInstances[chartId];
                    if (!chart || !chart.options) return;

                    if (labelType === 'title') {
                        let baseTitle = input.value.replace(' (ローパス適用)', '');
                        chart.options.plugins.title.text = baseTitle + suffix;
                    }
                    if (labelType === 'x') chart.options.scales.x.title.text = input.value;
                    if (labelType === 'y') chart.options.scales.y.title.text = input.value;
                });
                Object.values(chartInstances).forEach(chart => chart.update('none'));
            }

            function getChartOptions(yLabel, xLabel, title) {
                return {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { title: { display: true, text: yLabel, font: { size: 13 } }, ticks: { font: { size: 12 } } },
                        x: { type: 'linear', position: 'bottom', title: { display: true, text: xLabel, font: { size: 13 } }, ticks: { font: { size: 12 } } }
                    },
                    plugins: {
                        legend: { position: 'top', labels: { usePointStyle: true, pointStyleWidth: 20, font: { size: 13 } } },
                        title: { display: true, text: title, font: { size: 16, weight: '600' } }
                    },
                    animation: { duration: 0 }
                };
            }

            function handleStyleChange(event) {
                if (!event || !event.target) return;
                const mode = event.target.id.includes('formal') ? 'formal' : 'casual';
                const casualBtn = document.getElementById('style-casual');
                const formalBtn = document.getElementById('style-formal');
                casualBtn.classList.toggle('bg-blue-600', mode === 'casual');
                casualBtn.classList.toggle('text-white', mode === 'casual');
                casualBtn.classList.toggle('bg-slate-200', mode === 'formal');
                casualBtn.classList.toggle('text-slate-700', mode === 'formal');
                formalBtn.classList.toggle('bg-blue-600', mode === 'formal');
                formalBtn.classList.toggle('text-white', mode === 'formal');
                formalBtn.classList.toggle('bg-slate-200', mode === 'casual');
                formalBtn.classList.toggle('text-slate-700', mode === 'casual');
                const isFormal = mode === 'formal';
                const formalStyles = { color: '#000', font: { weight: 'bold' } };
                const casualStyles = { color: '#334155', font: { weight: 'normal' } };
                const newStyles = isFormal ? formalStyles : casualStyles;

                Object.values(chartInstances).forEach(chart => {
                    if (!chart || !chart.options || !chart.options.plugins || !chart.options.scales) return;

                    chart.options.plugins.title.color = newStyles.color;
                    chart.options.plugins.title.font.weight = newStyles.font.weight;
                    chart.options.plugins.legend.labels.color = newStyles.color;
                    chart.options.scales.x.title.color = newStyles.color;
                    chart.options.scales.x.title.font.weight = newStyles.font.weight;
                    chart.options.scales.x.ticks.color = newStyles.color;
                    chart.options.scales.y.title.color = newStyles.color;
                    chart.options.scales.y.title.font.weight = newStyles.font.weight;
                    chart.options.scales.y.ticks.color = newStyles.color;

                    if (isFormal) {
                        chart.options.scales.x.grid.display = false;
                        chart.options.scales.y.grid.display = false;
                        chart.options.scales.x.border = { color: '#000', width: 2 };
                        chart.options.scales.y.border = { color: '#000', width: 2 };
                        chart.data.datasets.forEach(dataset => {
                            Object.assign(dataset, { borderColor: '#000', backgroundColor: 'rgba(0,0,0,0.1)', borderWidth: 1, pointRadius: 2.5 });
                        });
                    } else {
                        chart.options.scales.x.grid.display = true;
                        chart.options.scales.y.grid.display = true;
                        chart.options.scales.x.grid.color = '#e2e8f0';
                        chart.options.scales.y.grid.color = '#e2e8f0';
                        chart.options.scales.x.border = { color: '#cbd5e1' };
                        chart.options.scales.y.border = { color: '#cbd5e1' };

                        const colors = ['#10b981', '#ef4444', '#3b82f6', '#f59e0b', '#8b5cf6', '#f97316'];
                        chart.data.datasets.forEach((dataset, i) => {
                            const color = colors[i % colors.length];
                            Object.assign(dataset, { borderColor: color, backgroundColor: color, borderWidth: 1.5, pointRadius: 3 });
                        });
                    }
                    chart.update('none');
                });
            }

            function downloadVelocityCSV() {
                if (allInstantaneousVelocities.length === 0) {
                    alert('ダウンロードするデータがありません。');
                    return;
                }
                const csv = Papa.unparse(allInstantaneousVelocities);
                const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement('a');
                link.href = URL.createObjectURL(blob);
                link.setAttribute('download', 'instantaneous_velocities.csv');
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            async function handleDownload(chartId, format) {
                const chart = chartInstances[chartId];
                if (!chart) return;

                downloadOverlay.classList.remove('hidden');

                const exportWidth = document.getElementById('export-width').value;
                const exportHeight = document.getElementById('export-height').value;

                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = exportWidth;
                tempCanvas.height = exportHeight;

                tempCanvas.style.position = 'absolute';
                tempCanvas.style.left = '-9999px';
                tempCanvas.style.top = '0px';
                document.body.appendChild(tempCanvas);

                const tempChart = new Chart(tempCanvas, {
                    type: chart.config.type,
                    data: chart.config.data,
                    options: { ...chart.config.options, animation: false, responsive: false, maintainAspectRatio: false }
                });

                await new Promise(resolve => setTimeout(resolve, 500));

                try {
                    const canvas = await html2canvas(tempCanvas, { backgroundColor: '#FFFFFF', scale: 2 });

                    if (format === 'png') {
                        const image = canvas.toDataURL('image/png', 1.0);
                        const link = document.createElement('a');
                        link.href = image;
                        link.download = `${chartId}.png`;
                        document.body.appendChild(link);
                        link.click();
                        document.body.removeChild(link);
                    } else if (format === 'pdf') {
                        if (!window.jspdf || !window.jspdf.jsPDF) {
                            alert('PDF generation library (jsPDF) is not loaded.'); return;
                        }
                        const { jsPDF } = window.jspdf;
                        const pdf = new jsPDF({
                            orientation: canvas.width > canvas.height ? 'landscape' : 'portrait',
                            unit: 'px',
                            format: [canvas.width, canvas.height]
                        });
                        pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height);
                        pdf.save(`${chartId}.pdf`);
                    }
                } catch (e) {
                    console.error("Failed to generate download:", e);
                    alert("An error occurred during download. Please check the console.");
                } finally {
                    tempChart.destroy();
                    document.body.removeChild(tempCanvas);
                    downloadOverlay.classList.add('hidden');
                }
            }

            // --- STANDARD VELOCITY TOOL SCRIPT ---
            const fileInputStd = document.getElementById('csv-file-input-std');
            const fileNameDisplayStd = document.getElementById('file-name-display-std');
            const loadingIndicatorStd = document.getElementById('loading-indicator-std');
            const parametersSectionStd = document.getElementById('step-2-parameters-std');
            const resultsSectionStd = document.getElementById('step-3-results-std');
            const rigidbodyContainerStd = document.getElementById('rigidbody-radio-container-std');
            const radiusInputStd = document.getElementById('radius-input-std');
            const axisSelectStd = document.getElementById('axis-select-std');
            const calculateBtnStd = document.getElementById('calculate-btn-std');
            const resultDisplayStd = document.getElementById('result-display-std');
            const resultValueStd = document.getElementById('result-value-std');
            const copyBtnStd = document.getElementById('copy-btn-std');
            const errorDisplayStd = document.getElementById('error-display-std');

            let parsedCsvDataStd = null;

            if (fileInputStd) {
                fileInputStd.addEventListener('change', handleFileSelectStd);
                calculateBtnStd.addEventListener('click', handleCalculationStd);
                copyBtnStd.addEventListener('click', handleCopyStd);
            }

            function handleFileSelectStd(event) {
                const file = event.target.files[0];
                if (!file) return;

                fileNameDisplayStd.textContent = file.name;
                parametersSectionStd.classList.add('hidden');
                resultsSectionStd.classList.add('hidden');
                errorDisplayStd.classList.add('hidden');
                loadingIndicatorStd.classList.remove('hidden');

                Papa.parse(file, {
                    complete: (results) => {
                        try {
                            parseCsvAndSetupUIStd(results.data);
                        } catch (e) {
                            showErrorStd(`ファイル解析エラー: ${e.message}`);
                        } finally {
                            loadingIndicatorStd.classList.add('hidden');
                        }
                    },
                    error: (error) => {
                        showErrorStd(`CSVファイルの読み込みに失敗しました: ${error.message}`);
                        loadingIndicatorStd.classList.add('hidden');
                    }
                });
            }

            function parseCsvAndSetupUIStd(csvData) {
                let dataStartIndex = -1, propertyRowIndex = -1, nameRowIndex = -1, typeRowIndex = -1;

                for (let i = 0; i < Math.min(15, csvData.length); i++) {
                    if (csvData[i][0] === 'Frame' && csvData[i][1] === 'Time (Seconds)') dataStartIndex = i + 1;
                    if (csvData[i][2] === 'Rotation' || csvData[i][2] === 'Position') propertyRowIndex = i;
                    if (csvData[i][1] === 'Name') nameRowIndex = i;
                    if (csvData[i][1] === 'Type') typeRowIndex = i;
                }

                if (dataStartIndex === -1 || propertyRowIndex === -1 || nameRowIndex === -1 || typeRowIndex === -1) {
                    throw new Error("CSVのヘッダー形式がMotiveエクスポート形式と異なります。");
                }

                const headerInfo = { dataStartIndex, propertyRowIndex, nameRowIndex, typeRowIndex };
                const rigidBodies = extractRigidBodiesStd(csvData, headerInfo);
                if (Object.keys(rigidBodies).length === 0) {
                    throw new Error("ファイル内に有効な剛体(Rigid Body)データが見つかりませんでした。");
                }

                parsedCsvDataStd = {
                    headerInfo,
                    dataRows: csvData.slice(headerInfo.dataStartIndex),
                    rigidBodies
                };

                populateRigidBodyRadiosStd(Object.keys(rigidBodies));
                parametersSectionStd.classList.remove('hidden');
            }

            function extractRigidBodiesStd(csvData, headerInfo) {
                const rigidBodies = {};
                const typeRow = csvData[headerInfo.typeRowIndex];
                const nameRow = csvData[headerInfo.nameRowIndex];
                const propertyRow = csvData[headerInfo.propertyRowIndex];
                const dataHeaderRow = csvData[headerInfo.dataStartIndex - 1];

                for (let i = 2; i < typeRow.length; i++) {
                    if (typeRow[i] === 'Rigid Body' && propertyRow[i] === 'Rotation') {
                        const name = nameRow[i];
                        if (!rigidBodies[name]) {
                            rigidBodies[name] = { name: name, rotation: {} };
                        }
                        const axisName = dataHeaderRow[i];
                        rigidBodies[name].rotation[axisName] = i;
                    }
                }
                return rigidBodies;
            }

            function populateRigidBodyRadiosStd(bodyNames) {
                rigidbodyContainerStd.innerHTML = '';
                const keywords = ['wheel', 'tire'];
                let defaultIndex = 0;
                const firstMatchIndex = bodyNames.findIndex(name =>
                    keywords.some(keyword => name.toLowerCase().includes(keyword))
                );
                if (firstMatchIndex !== -1) { defaultIndex = firstMatchIndex; }
                bodyNames.forEach((name, index) => {
                    const id = `body-radio-std-${name.replace(/\s+/g, '-')}`;
                    const div = document.createElement('div');
                    div.className = 'flex items-center';
                    div.innerHTML = `
                        <input id="${id}" type="radio" value="${name}" name="rigidbody-select-std" class="rigidbody-radio-std h-4 w-4 text-blue-600 border-slate-300 focus:ring-blue-500" ${index === defaultIndex ? 'checked' : ''}>
                        <label for="${id}" class="ml-3 block text-sm text-slate-900">${name}</label>
                    `;
                    rigidbodyContainerStd.appendChild(div);
                });
            }

            function handleCalculationStd() {
                if (!parsedCsvDataStd) {
                    showErrorStd("先にファイルを解析してください。"); return;
                }
                resultsSectionStd.classList.add('hidden');
                resultDisplayStd.classList.add('hidden');
                errorDisplayStd.classList.add('hidden');

                const selectedRadio = document.querySelector('.rigidbody-radio-std:checked');
                if (!selectedRadio) {
                    showErrorStd("解析する剛体を選択してください。"); return;
                }
                const radiusCm = parseFloat(radiusInputStd.value);
                if (isNaN(radiusCm) || radiusCm <= 0) {
                    showErrorStd("半径には正の数値を入力してください。"); return;
                }
                const radiusM = radiusCm / 100.0;
                const selectedAxis = axisSelectStd.value;
                const selectedBodyName = selectedRadio.value;
                const rotationFormat = document.querySelector('input[name="rotation-format-std"]:checked').value;

                try {
                    const bodyInfo = parsedCsvDataStd.rigidBodies[selectedBodyName];
                    const timeData = [];
                    const angleData = [];

                    if (rotationFormat === 'quaternion') {
                        // Check if we have X, Y, Z, W
                        if (bodyInfo.rotation['X'] === undefined || bodyInfo.rotation['Y'] === undefined ||
                            bodyInfo.rotation['Z'] === undefined || bodyInfo.rotation['W'] === undefined) {
                            throw new Error("クウォータニオンデータ(X, Y, Z, W)が揃っていません。");
                        }

                        // We will use standard Euler order 'XYZ' for now, but really we just want the selected axis component.
                        // Assuming the user selected axis is the primary rotation axis.
                        // THREE.Euler order 'XYZ' -> rotates X, then Y, then Z.
                        // If selectedAxis is 'Y', we want the rotation around Y.
                        // However, decomposition depends on order.
                        // Let's assume standard 'XYZ' order is sufficient for simple wheel rotation.
                        // Or better, use an order where the selected axis is applied LAST to represent global rotation?
                        // Actually, for a single axis rotation, any valid order containing that axis should show the change.

                        const idxX = bodyInfo.rotation['X'];
                        const idxY = bodyInfo.rotation['Y'];
                        const idxZ = bodyInfo.rotation['Z'];
                        const idxW = bodyInfo.rotation['W'];

                        parsedCsvDataStd.dataRows.forEach(row => {
                            const t = parseFloat(row[1]);
                            const qx = parseFloat(row[idxX]);
                            const qy = parseFloat(row[idxY]);
                            const qz = parseFloat(row[idxZ]);
                            const qw = parseFloat(row[idxW]);

                            if (!isNaN(t) && !isNaN(qx) && !isNaN(qy) && !isNaN(qz) && !isNaN(qw)) {
                                timeData.push(t);
                                const q = new THREE.Quaternion(qx, qy, qz, qw);

                                // Select Euler order to avoid gimbal lock/clamping on the target axis.
                                // The middle axis in Tait-Bryan angles is often clamped to +/- 90 degrees.
                                // We ensure the selected axis is the first applied rotation (outermost in some conventions, or just consistent).
                                let eulerOrder = 'XYZ';
                                if (selectedAxis === 'Y') eulerOrder = 'YXZ';
                                else if (selectedAxis === 'Z') eulerOrder = 'ZXY';
                                else eulerOrder = 'XYZ'; // X is first

                                const euler = new THREE.Euler().setFromQuaternion(q, eulerOrder);

                                let angleVal = 0;
                                if (selectedAxis === 'X') angleVal = euler.x;
                                else if (selectedAxis === 'Y') angleVal = euler.y;
                                else if (selectedAxis === 'Z') angleVal = euler.z;

                                // Convert radians to degrees
                                angleData.push(angleVal * (180 / Math.PI));
                            }
                        });

                    } else {
                        // Euler (Degrees)
                        const rotationColumnIndex = bodyInfo.rotation[selectedAxis];
                        if (rotationColumnIndex === undefined) {
                            throw new Error(`選択された剛体に'${selectedAxis}'軸の回転データが存在しません。`);
                        }
                        parsedCsvDataStd.dataRows.forEach(row => {
                            const t = parseFloat(row[1]);
                            const a = parseFloat(row[rotationColumnIndex]);
                            if (!isNaN(t) && !isNaN(a)) {
                                timeData.push(t);
                                angleData.push(a);
                            }
                        });
                    }

                    if (timeData.length !== angleData.length || timeData.length < 2) {
                        throw new Error("有効な時間または角度データが不足しています。");
                    }

                    const unwrappedAngles = unwrapAnglesStd(angleData);
                    const period = findRotationPeriodStd(timeData, unwrappedAngles);

                    if (period === null) {
                        throw new Error("データ内で1回転以上の回転を検出できませんでした。回転軸の選択が間違っているか、データに乱れがある可能性があります。");
                    }
                    const omega = (2 * Math.PI) / period;
                    const velocity = radiusM * omega;
                    const velocityStr = velocity.toFixed(8);

                    resultValueStd.textContent = velocityStr;
                    copyBtnStd.dataset.copyValue = velocityStr;
                    resultDisplayStd.classList.remove('hidden');
                    resultsSectionStd.classList.remove('hidden');
                    setTimeout(() => resultsSectionStd.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);

                } catch (e) {
                    showErrorStd(`[${selectedBodyName}] ${e.message}`);
                }
            }

            function unwrapAnglesStd(angles) {
                const unwrapped = [angles[0]];
                let offset = 0;
                for (let i = 1; i < angles.length; i++) {
                    const diff = angles[i] - angles[i - 1];
                    if (diff > 180) { offset -= 360; }
                    else if (diff < -180) { offset += 360; }
                    unwrapped.push(angles[i] + offset);
                }
                return unwrapped;
            }

            function findRotationPeriodStd(times, unwrappedAngles) {
                let currentIndex = 0;

                // Try to find a valid rotation period by searching through the data
                while (currentIndex < unwrappedAngles.length - 10) {
                    // 1. Find start of motion relative to currentIndex
                    let motionStartIndex = -1;
                    const baseAngle = unwrappedAngles[currentIndex];

                    for (let i = currentIndex + 1; i < unwrappedAngles.length; i++) {
                        if (Math.abs(unwrappedAngles[i] - baseAngle) > 5) {
                            motionStartIndex = i;
                            break;
                        }
                    }

                    if (motionStartIndex === -1) return null; // No more motion found

                    // 2. Check if this motion looks valid (not just noise)
                    const sampleEndIndex = Math.min(motionStartIndex + 20, unwrappedAngles.length - 1);
                    const angleChange = unwrappedAngles[sampleEndIndex] - unwrappedAngles[motionStartIndex];

                    // If movement is too slow or just noise, skip and try again
                    if (Math.abs(angleChange) < 5) {
                        currentIndex = motionStartIndex;
                        continue;
                    }

                    // 3. Try to find the end of a 360 degree rotation
                    const direction = Math.sign(angleChange);
                    const targetAngle = unwrappedAngles[motionStartIndex] + (360 * direction);
                    let endIndex = -1;

                    for (let i = motionStartIndex + 1; i < unwrappedAngles.length; i++) {
                        if ((direction > 0 && unwrappedAngles[i] >= targetAngle) ||
                            (direction < 0 && unwrappedAngles[i] <= targetAngle)) {
                            endIndex = i;
                            break;
                        }
                    }

                    if (endIndex !== -1) {
                        // Found a valid rotation! Calculate period.
                        const T_start = times[motionStartIndex];
                        const angle_before = unwrappedAngles[endIndex - 1];
                        const angle_after = unwrappedAngles[endIndex];
                        const time_before = times[endIndex - 1];
                        const time_after = times[endIndex];

                        if (angle_after === angle_before) return time_after - T_start;

                        const fraction = (targetAngle - angle_before) / (angle_after - angle_before);
                        const T_end = time_before + fraction * (time_after - time_before);
                        return T_end - T_start;
                    }

                    // If we didn't find a full rotation, advance search to try finding a new start point
                    // We advance slightly past the motion start to see if a valid rotation starts later
                    currentIndex = motionStartIndex + 1;
                }

                return null;
            }

            function handleCopyStd() {
                const textToCopy = copyBtnStd.dataset.copyValue;
                if (!textToCopy) return;

                const textArea = document.createElement('textarea');
                textArea.value = textToCopy;
                document.body.appendChild(textArea);
                textArea.select();
                try {
                    document.execCommand('copy');
                    copyBtnStd.textContent = 'コピーしました！';
                    setTimeout(() => { copyBtnStd.textContent = '結果をコピー'; }, 2000);
                } catch (err) {
                    copyBtnStd.textContent = 'コピー失敗';
                }
                document.body.removeChild(textArea);
            }

            function showErrorStd(message) {
                errorDisplayStd.textContent = message;
                errorDisplayStd.classList.remove('hidden');
                resultsSectionStd.classList.remove('hidden');
                setTimeout(() => resultsSectionStd.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
            }

            // --- WIDE AREA ANALYSIS TOOL SCRIPT (kiseki) ---
            const csvFileInputWide = document.getElementById('csv-files-wide');
            const fileListAreaWide = document.getElementById('file-list-area-wide');
            const clearFilesBtnWide = document.getElementById('clear-files-btn-wide');

            // UI Elements for Sampling Settings
            const samplingModeSelectWide = document.getElementById('sampling-mode-wide');
            const samplingSecondsContainer = document.getElementById('sampling-seconds-container');
            const samplingFramesContainer = document.getElementById('sampling-frames-container');
            const samplingWarningWide = document.getElementById('sampling-warning-wide');
            const samplingRateInputWide = document.getElementById('sampling-rate-wide');
            const samplingFramesInputWide = document.getElementById('sampling-frames-wide');
            const invertZCheckboxWide = document.getElementById('invert-z-wide');

            const gridSizeInputWide = document.getElementById('heatmap-grid-size-wide');
            const verticalAxisSelectWide = document.getElementById('vertical-axis-wide');
            const rigidbodySelectionAreaWide = document.getElementById('rigidbody-selection-area-wide');
            const rigidbodyListContainerWide = document.getElementById('rigidbody-list-container-wide');
            const analyzeBtnWide = document.getElementById('analyze-btn-wide');
            const resultsCardWide = document.getElementById('results-card-wide');

            const showTrajectoryBtnWide = document.getElementById('show-trajectory-btn-wide');
            const showHeatmapBtnWide = document.getElementById('show-heatmap-btn-wide');
            const show3DTrajectoryBtnWide = document.getElementById('show-3d-trajectory-btn-wide');
            const trajectoryViewWide = document.getElementById('trajectory-view-wide');
            const heatmapViewWide = document.getElementById('heatmap-view-wide');
            const trajectory3DViewWide = document.getElementById('trajectory-3d-view-wide');
            const heatmapMaxValueWide = document.getElementById('heatmap-max-value-wide');

            const calculateCoverageBtnWide = document.getElementById('calculate-coverage-btn-wide');
            const coverageResultElWide = document.getElementById('coverage-result-wide');
            const areaShapeRadiosWide = document.querySelectorAll('input[name="area-shape-wide"]');
            const centerTypeRadiosWide = document.querySelectorAll('input[name="center-type-wide"]');
            const customCenterInputsWide = document.getElementById('custom-center-inputs-wide');
            const areaSizeLabelWide = document.getElementById('area-size-label-wide');
            const areaSizeInputWide = document.getElementById('area-size-wide');
            const centerXInputWide = document.getElementById('center-x-wide');
            const centerYInputWide = document.getElementById('center-y-wide');
            const centerXLabelWide = document.getElementById('center-x-label-wide');
            const centerYLabelWide = document.getElementById('center-y-label-wide');
            const dataUnitRadiosWide = document.querySelectorAll('input[name="data-unit-wide"]');
            const unitLabels = document.querySelectorAll('.unit-label');
            const coordinateUnitNote = document.getElementById('coordinate-unit-note');

            let trajectoryChartWide = null;
            let fileDataStoreWide = {};
            let lastSampledDataWide = null;
            let lastHeatmapGridWide = null;
            let is3DTrajectoryRendered = false;
            const heatmapTooltip = document.getElementById('heatmap-tooltip');
            const heatmapCanvas = document.getElementById('heatmap-canvas-wide');
            const heightInfoCheckboxWide = document.getElementById('height-info-checkbox-wide');

            heightInfoCheckboxWide.addEventListener('change', () => {
                if (lastSampledDataWide) {
                    const verticalAxis = verticalAxisSelectWide.value;
                    const axes = ['X', 'Y', 'Z'];
                    const horizontalAxes = axes.filter(ax => ax !== verticalAxis);
                    drawTrajectoryWide(lastSampledDataWide, horizontalAxes[0], horizontalAxes[1]);
                }
            });

            heatmapCanvas.addEventListener('mousemove', (event) => {
                if (!lastHeatmapGridWide || !lastHeatmapGridWide.gridInfo) return;

                const rect = heatmapCanvas.getBoundingClientRect();
                const x = event.clientX - rect.left;
                const y = event.clientY - rect.top;

                const { grid, gridInfo } = lastHeatmapGridWide;
                const { rows, cols } = gridInfo;
                const cellWidth = heatmapCanvas.width / cols;
                const cellHeight = heatmapCanvas.height / rows;

                const col = Math.floor(x / cellWidth);
                const row = rows - 1 - Math.floor(y / cellHeight);

                if (col >= 0 && col < cols && row >= 0 && row < rows) {
                    const count = grid[row][col];
                    heatmapTooltip.textContent = `カウント: ${count}`;
                    heatmapTooltip.style.left = `${event.clientX - rect.left + 10}px`;
                    heatmapTooltip.style.top = `${event.clientY - rect.top + 10}px`;
                    heatmapTooltip.classList.remove('hidden');
                } else {
                    heatmapTooltip.classList.add('hidden');
                }
            });

            heatmapCanvas.addEventListener('mouseout', () => {
                heatmapTooltip.classList.add('hidden');
            });

            csvFileInputWide.addEventListener('change', handleFileSelectWide);
            clearFilesBtnWide.addEventListener('click', clearAllFilesWide);
            analyzeBtnWide.addEventListener('click', analyzeDataWide);
            showTrajectoryBtnWide.addEventListener('click', () => switchViewWide('trajectory'));
            showHeatmapBtnWide.addEventListener('click', () => switchViewWide('heatmap'));
            show3DTrajectoryBtnWide.addEventListener('click', () => switchViewWide('3d-trajectory'));
            document.querySelectorAll('.download-btn-wide').forEach(btn => btn.addEventListener('click', handleDownloadWide));

            calculateCoverageBtnWide.addEventListener('click', calculateAndDisplayCoverageWide);
            areaShapeRadiosWide.forEach(radio => radio.addEventListener('change', (e) => {
                areaSizeLabelWide.textContent = e.target.value === 'circle' ? '半径' : '一辺の長さ';
            }));
            centerTypeRadiosWide.forEach(radio => radio.addEventListener('change', (e) => {
                customCenterInputsWide.classList.toggle('hidden', e.target.value === 'data');
            }));

            // Handle Sampling Mode Change
            samplingModeSelectWide.addEventListener('change', (e) => {
                const mode = e.target.value;
                samplingSecondsContainer.classList.add('hidden');
                samplingFramesContainer.classList.add('hidden');
                samplingWarningWide.classList.add('hidden');

                if (mode === 'seconds') {
                    samplingSecondsContainer.classList.remove('hidden');
                } else if (mode === 'frames') {
                    samplingFramesContainer.classList.remove('hidden');
                } else if (mode === 'none') {
                    samplingWarningWide.classList.remove('hidden');
                }
            });

            dataUnitRadiosWide.forEach(radio => radio.addEventListener('change', (e) => {
                const selectedUnit = e.target.value;
                unitLabels.forEach(label => label.textContent = selectedUnit);

                const gridSizeInput = document.getElementById('heatmap-grid-size-wide');
                const areaSizeInput = document.getElementById('area-size-wide');

                if (selectedUnit === 'm') {
                    gridSizeInput.value = (parseFloat(gridSizeInput.value) / 1000).toFixed(2);
                    gridSizeInput.step = 0.1;
                    areaSizeInput.value = (parseFloat(areaSizeInput.value) / 1000).toFixed(2);
                    areaSizeInput.step = 0.1;
                    coordinateUnitNote.textContent = "※ 座標は正規化せず、元データの値をそのまま使用しています。";
                } else { // mm
                    gridSizeInput.value = Math.round(parseFloat(gridSizeInput.value) * 1000);
                    gridSizeInput.step = 100;
                    areaSizeInput.value = Math.round(parseFloat(areaSizeInput.value) * 1000);
                    areaSizeInput.step = 100;
                    coordinateUnitNote.textContent = "※ 座標は正規化せず、元データの値をメートル単位に変換して使用しています。";
                }
            }));

            function handleFileSelectWide(event) {
                const files = Array.from(event.target.files);
                if (files.length === 0) return;

                loadingDiv.classList.remove('hidden');
                loadingText.textContent = "ファイルを読み込み中...";

                const filePromises = files.map(file => {
                    if (fileDataStoreWide[file.name]) {
                        console.log(`File ${file.name} is already loaded.`);
                        return Promise.resolve();
                    }
                    return new Promise((resolve, reject) => {
                        Papa.parse(file, {
                            complete: (results) => {
                                try {
                                    const { rigidBodyInfo, rawData: processedData } = parseHeaderWide(results.data);
                                    fileDataStoreWide[file.name] = {
                                        rawData: processedData,
                                        rigidBodyInfo: rigidBodyInfo
                                    };
                                    resolve();
                                } catch (error) {
                                    reject(new Error(`"${file.name}"の解析に失敗: ${error.message}`));
                                }
                            },
                            error: (err) => reject(new Error(`"${file.name}"の読み込みに失敗: ${err.message}`))
                        });
                    });
                });

                Promise.all(filePromises)
                    .then(() => {
                        updateFileAndRigidBodyUIWide();
                        analyzeBtnWide.disabled = false;
                    })
                    .catch(error => {
                        alert(error.message);
                    })
                    .finally(() => {
                        loadingDiv.classList.add('hidden');
                        csvFileInputWide.value = '';
                    });
            }

            function parseHeaderWide(data) {
                let typeRowIndex = -1, nameRowIndex = -1, propertyRowIndex = -1, dataHeaderRowIndex = -1;
                for (let i = 0; i < Math.min(20, data.length); i++) {
                    const row = data[i];
                    if (!row || row.length < 2) continue;
                    if (row[1] === 'Type') typeRowIndex = i;
                    if (row[1] === 'Name') nameRowIndex = i;
                    if (row.includes('Position') && row.includes('Rotation')) propertyRowIndex = i;
                    if (row[0] === 'Frame' && row[1] === 'Time (Seconds)') {
                        dataHeaderRowIndex = i;
                        break;
                    }
                }
                if ([typeRowIndex, nameRowIndex, propertyRowIndex, dataHeaderRowIndex].includes(-1)) {
                    throw new Error("OptiTrack CSVのヘッダー形式を認識できませんでした。");
                }

                const typeRow = data[typeRowIndex];
                const nameRow = data[nameRowIndex];
                const propertyRow = data[propertyRowIndex];
                const dataHeaderRow = data[dataHeaderRowIndex];
                const dataStartIndex = dataHeaderRowIndex + 1;

                let rigidBodyInfo = {};
                let nameCounts = {};

                for (let i = 2; i < typeRow.length; i++) {
                    if (typeRow[i] === 'Rigid Body' && propertyRow[i] === 'Position') {
                        // Check if this is the start of a triplet (X)
                        // This prevents processing Y and Z columns as new bodies
                        if (dataHeaderRow[i].toUpperCase() !== 'X') continue;

                        let rawName = nameRow[i];
                        let uniqueName = rawName;

                        // Handle duplicates by appending suffix
                        if (nameCounts[rawName]) {
                            uniqueName = `${rawName} (${nameCounts[rawName]})`;
                            nameCounts[rawName]++;
                        } else {
                            nameCounts[rawName] = 1;
                        }

                        if (rigidBodyInfo[uniqueName]) continue;
                        rigidBodyInfo[uniqueName] = { name: uniqueName, xIndex: -1, yIndex: -1, zIndex: -1 };
                        for (let j = 0; j < 3; j++) {
                            const colIndex = i + j;
                            // Check rawName for columns since CSV repeats it
                            if (colIndex >= dataHeaderRow.length || nameRow[colIndex] !== rawName || propertyRow[colIndex] !== 'Position') break;
                            const axis = dataHeaderRow[colIndex].toUpperCase();
                            if (axis === 'X') rigidBodyInfo[uniqueName].xIndex = colIndex;
                            else if (axis === 'Y') rigidBodyInfo[uniqueName].yIndex = colIndex;
                            else if (axis === 'Z') rigidBodyInfo[uniqueName].zIndex = colIndex;
                        }
                    }
                }

                Object.keys(rigidBodyInfo).forEach(name => {
                    const info = rigidBodyInfo[name];
                    if (info.xIndex === -1 || info.yIndex === -1 || info.zIndex === -1) {
                        console.warn(`剛体 "${name}" の座標(X,Y,Z)の一部が見つかりませんでした。この剛体は無視されます。`);
                        delete rigidBodyInfo[name];
                    }
                });

                const rawData = data.slice(dataStartIndex).filter(row => row.length > 1 && row[1] !== '');
                return { rigidBodyInfo, rawData };
            }

            function updateFileAndRigidBodyUIWide() {
                fileListAreaWide.innerHTML = Object.keys(fileDataStoreWide).map(filename =>
                    `<div class="bg-slate-50 p-2.5 rounded-md border text-sm flex justify-between items-center">
                        <span class="text-slate-700 truncate pr-4">${filename}</span>
                    </div>`
                ).join('');

                rigidbodyListContainerWide.innerHTML = Object.keys(fileDataStoreWide).map(filename => {
                    const info = fileDataStoreWide[filename];
                    if (Object.keys(info.rigidBodyInfo).length === 0) return '';
                    return `
                        <div>
                            <h4 class="font-semibold text-sm text-slate-800 mb-2 border-b pb-1">${filename}</h4>
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-4">
                                ${Object.keys(info.rigidBodyInfo).map(name => `
                                    <div class="rigidbody-item-container-wide">
                                        <label class="flex items-center space-x-2 p-2 rounded-md hover:bg-slate-100 cursor-pointer w-full">
                                            <input type="checkbox" class="rigidbody-checkbox-wide form-checkbox h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500" data-filename="${filename}" value="${name}" checked>
                                            <span class="text-slate-800 text-sm">${name}</span>
                                        </label>
                                        <div class="legend-input-container-wide pl-7 mt-1 hidden">
                                            <label class="text-xs text-slate-500">凡例名:</label>
                                            <input type="text" class="legend-label-input-wide mt-1 block w-full rounded-md shadow-sm p-1.5 text-sm border-slate-300 focus:ring-1 focus:ring-blue-500" data-filename="${filename}" data-bodyname="${name}" value="${filename} - ${name}">
                                        </div>
                                    </div>
                                `).join('')}
                            </div>
                        </div>
                    `;
                }).join('');

                rigidbodyListContainerWide.addEventListener('change', (event) => {
                    if (event.target.classList.contains('rigidbody-checkbox-wide')) {
                        const checkbox = event.target;
                        const itemContainer = checkbox.closest('.rigidbody-item-container-wide');
                        const legendInputContainer = itemContainer.querySelector('.legend-input-container-wide');
                        if (legendInputContainer) {
                            legendInputContainer.classList.toggle('hidden', !checkbox.checked);
                        }
                    }
                });

                document.querySelectorAll('.rigidbody-checkbox-wide:checked').forEach(checkbox => {
                    const itemContainer = checkbox.closest('.rigidbody-item-container-wide');
                    const legendInputContainer = itemContainer.querySelector('.legend-input-container-wide');
                    if (legendInputContainer) {
                        legendInputContainer.classList.remove('hidden');
                    }
                });

                rigidbodySelectionAreaWide.classList.toggle('hidden', Object.keys(fileDataStoreWide).length === 0);
                clearFilesBtnWide.classList.toggle('hidden', Object.keys(fileDataStoreWide).length === 0);
            }

            function clearAllFilesWide() {
                fileDataStoreWide = {};
                csvFileInputWide.value = '';
                updateFileAndRigidBodyUIWide();
                resultsCardWide.classList.add('hidden');
                analyzeBtnWide.disabled = true;
            }

            function analyzeDataWide() {
                const verticalAxis = verticalAxisSelectWide.value;
                const dataUnit = document.querySelector('input[name="data-unit-wide"]:checked').value;
                const selectedBodies = Array.from(document.querySelectorAll('.rigidbody-checkbox-wide:checked')).map(cb => {
                    const filename = cb.dataset.filename;
                    const bodyName = cb.value;
                    const legendInput = document.querySelector(`.legend-label-input-wide[data-filename="${filename}"][data-bodyname="${bodyName}"]`);
                    return {
                        filename: filename,
                        bodyName: bodyName,
                        label: legendInput ? legendInput.value : `${filename} - ${bodyName}`
                    };
                });

                if (selectedBodies.length === 0) { alert('解析する剛体を少なくとも1つ選択してください。'); return; }

                const samplingMode = samplingModeSelectWide.value;
                const invertZ = invertZCheckboxWide.checked;
                let samplingValue = 0;

                if (samplingMode === 'seconds') {
                    samplingValue = parseFloat(samplingRateInputWide.value);
                    if (isNaN(samplingValue) || samplingValue <= 0) { alert('データ取得間隔(秒)には正の数値を入力してください。'); return; }
                } else if (samplingMode === 'frames') {
                    samplingValue = parseInt(samplingFramesInputWide.value, 10);
                    if (isNaN(samplingValue) || samplingValue < 1) { alert('データ取得間隔(フレーム)には1以上の整数を入力してください。'); return; }
                }

                let gridSize = parseFloat(gridSizeInputWide.value);
                if (isNaN(gridSize) || gridSize <= 0) { alert('マス目のサイズには正の数値を入力してください。'); return; }

                if (dataUnit === 'mm') {
                    gridSize /= 1000;
                }

                // Handle 3D Button State
                if (samplingMode === 'none') {
                    show3DTrajectoryBtnWide.disabled = true;
                    show3DTrajectoryBtnWide.title = "ダウンサンプリングなしの場合は3D軌跡機能は使用できません";
                    show3DTrajectoryBtnWide.classList.add('opacity-50', 'cursor-not-allowed');
                } else {
                    show3DTrajectoryBtnWide.disabled = false;
                    show3DTrajectoryBtnWide.title = "";
                    show3DTrajectoryBtnWide.classList.remove('opacity-50', 'cursor-not-allowed');
                }

                loadingDiv.classList.remove('hidden');
                loadingText.textContent = "解析中...";
                is3DTrajectoryRendered = false; // Reset render flag

                setTimeout(() => {
                    try {
                        const axes = ['X', 'Y', 'Z'];
                        const horizontalAxes = axes.filter(ax => ax !== verticalAxis);
                        const hAxis1 = horizontalAxes[0];
                        const hAxis2 = horizontalAxes[1];

                        const samplingParams = { mode: samplingMode, value: samplingValue };
                        lastSampledDataWide = sampleAllDataWide(selectedBodies, samplingParams, dataUnit, invertZ);
                        drawTrajectoryWide(lastSampledDataWide, hAxis1, hAxis2);
                        // Defer 3D trajectory drawing until the tab is clicked
                        // draw3DTrajectory(lastSampledDataWide);
                        lastHeatmapGridWide = calculateHeatmapGridWide(lastSampledDataWide, gridSize, hAxis1, hAxis2, samplingParams);
                        heatmapMaxValueWide.textContent = lastHeatmapGridWide.maxCount;

                        const allPoints = [].concat(...Object.values(lastSampledDataWide));
                        const dataCenter = calculateDataCenterWide(allPoints);

                        if (dataUnit === 'mm') {
                            centerXInputWide.value = (dataCenter.x * 1000).toFixed(2);
                            centerYInputWide.value = (dataCenter.y * 1000).toFixed(2);
                        } else {
                            centerXInputWide.value = dataCenter.x.toFixed(2);
                            centerYInputWide.value = dataCenter.y.toFixed(2);
                        }

                        centerXLabelWide.textContent = `${hAxis1}:`;
                        centerYLabelWide.textContent = `${hAxis2}:`;

                        resultsCardWide.classList.remove('hidden');
                        switchViewWide('trajectory');
                        setTimeout(() => resultsCardWide.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
                    } catch (error) {
                        alert(`解析エラー: ${error.message}`);
                    } finally {
                        loadingDiv.classList.add('hidden');
                    }
                }, 50);
            }

            function sampleAllDataWide(selectedBodies, samplingParams, dataUnit, invertZ) {
                const result = {};
                selectedBodies.forEach(({ filename, bodyName, label }) => {
                    const uniqueKey = label;
                    result[uniqueKey] = [];
                    const { rawData, rigidBodyInfo } = fileDataStoreWide[filename];
                    const info = rigidBodyInfo[bodyName];
                    if (!info) return;

                    const mode = samplingParams.mode;
                    const val = samplingParams.value;

                    let nextSampleTime = 0;

                    for (let i = 0; i < rawData.length; i++) {
                        const row = rawData[i];
                        const time = parseFloat(row[1]);
                        if (isNaN(time)) continue;

                        let shouldSample = false;
                        if (mode === 'none') {
                            shouldSample = true;
                        } else if (mode === 'frames') {
                            // Raw data includes index, so i is index relative to start of data
                            // Actually rawData is sliced. i is 0-based index.
                            shouldSample = (i % val === 0);
                        } else { // seconds
                            if (time >= nextSampleTime) {
                                shouldSample = true;
                                nextSampleTime += val;
                            }
                        }

                        if (shouldSample) {
                            let x = parseFloat(row[info.xIndex]);
                            let y = parseFloat(row[info.yIndex]);
                            let z = parseFloat(row[info.zIndex]);

                            if (dataUnit === 'mm') {
                                x /= 1000;
                                y /= 1000;
                                z /= 1000;
                            }

                            if (invertZ) {
                                z = -z;
                            }

                            if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                                result[uniqueKey].push({ t: time, x: x, y: y, z: z });
                            }
                        }
                    }
                });
                return result;
            }

            function hexToRgb(hex) {
                let r = 0, g = 0, b = 0;
                if (hex.length == 4) {
                    r = "0x" + hex[1] + hex[1];
                    g = "0x" + hex[2] + hex[2];
                    b = "0x" + hex[3] + hex[3];
                } else if (hex.length == 7) {
                    r = "0x" + hex[1] + hex[2];
                    g = "0x" + hex[3] + hex[4];
                    b = "0x" + hex[5] + hex[6];
                }
                return { r: +r, g: +g, b: +b };
            }

            function rgbToHsl(r, g, b) {
                r /= 255, g /= 255, b /= 255;
                let max = Math.max(r, g, b), min = Math.min(r, g, b);
                let h, s, l = (max + min) / 2;
                if (max == min) {
                    h = s = 0; // achromatic
                } else {
                    let d = max - min;
                    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
                    switch (max) {
                        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
                        case g: h = (b - r) / d + 2; break;
                        case b: h = (r - g) / d + 4; break;
                    }
                    h /= 6;
                }
                return { h, s, l };
            }

            function hslToRgb(h, s, l) {
                let r, g, b;
                if (s == 0) {
                    r = g = b = l; // achromatic
                } else {
                    const hue2rgb = (p, q, t) => {
                        if (t < 0) t += 1;
                        if (t > 1) t -= 1;
                        if (t < 1 / 6) return p + (q - p) * 6 * t;
                        if (t < 1 / 2) return q;
                        if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
                        return p;
                    };
                    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
                    const p = 2 * l - q;
                    r = hue2rgb(p, q, h + 1 / 3);
                    g = hue2rgb(p, q, h);
                    b = hue2rgb(p, q, h - 1 / 3);
                }
                return `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
            }

            function getColorForHeight(value, min, max, baseColorHex) {
                const { r, g, b } = hexToRgb(baseColorHex);
                const { h, s } = rgbToHsl(r, g, b);

                if (min === max) {
                    return hslToRgb(h, s, 0.2); // Return a dark shade if no height difference
                }

                const ratio = (value - min) / (max - min);
                const lightness = 0.2 + ratio * 0.65; // Interpolate lightness from 20% to 85%

                return hslToRgb(h, s, lightness);
            }

            function drawTrajectoryWide(data, hAxis1, hAxis2) {
                const ctx = document.getElementById('trajectory-chart-wide').getContext('2d');
                const colors = ['#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899', '#6929c4', '#1192e8', '#005d5d', '#9f1853', '#fa4d56', '#570408', '#198038', '#002d9c', '#ee538b', '#b28600', '#009d9a', '#012749'];
                if (trajectoryChartWide) trajectoryChartWide.destroy();

                const legendContainer = document.getElementById('height-legend-wide');
                const showHeightInfo = document.getElementById('height-info-checkbox-wide').checked;
                let minHeight = Infinity;
                let maxHeight = -Infinity;
                let uniqueColors = new Set();

                if (showHeightInfo) {
                    const verticalAxis = verticalAxisSelectWide.value.toLowerCase();
                    Object.values(data).forEach(points => {
                        points.forEach(p => {
                            const height = p[verticalAxis];
                            if (height < minHeight) minHeight = height;
                            if (height > maxHeight) maxHeight = height;
                        });
                    });
                }

                const datasets = Object.keys(data).map((uniqueKey, index) => {
                    const baseColor = colors[index % colors.length];
                    uniqueColors.add(baseColor);
                    const baseProps = {
                        label: uniqueKey,
                        data: data[uniqueKey].map(p => ({ x: p[hAxis1.toLowerCase()], y: -p[hAxis2.toLowerCase()] })),
                        showLine: !showHeightInfo,
                        tension: 0.1,
                        borderWidth: showHeightInfo ? 1 : 2,
                    };

                    if (showHeightInfo) {
                        const verticalAxis = verticalAxisSelectWide.value.toLowerCase();
                        const pointColors = data[uniqueKey].map(p => getColorForHeight(p[verticalAxis], minHeight, maxHeight, baseColor));
                        return {
                            ...baseProps,
                            backgroundColor: pointColors,
                            borderColor: pointColors,
                            pointRadius: 3,
                        };
                    } else {
                        return {
                            ...baseProps,
                            borderColor: baseColor,
                            backgroundColor: baseColor,
                            pointRadius: 2,
                        };
                    }
                });

                if (showHeightInfo) {
                    legendContainer.classList.remove('hidden');
                    document.getElementById('height-legend-min-wide').textContent = minHeight.toFixed(2);
                    document.getElementById('height-legend-max-wide').textContent = maxHeight.toFixed(2);
                    const gradientEl = document.getElementById('height-legend-gradient-wide');

                    // Use the color of the first series for the legend gradient
                    const firstColor = [...uniqueColors][0];
                    if (firstColor) {
                        const dark = getColorForHeight(minHeight, minHeight, maxHeight, firstColor);
                        const light = getColorForHeight(maxHeight, minHeight, maxHeight, firstColor);
                        gradientEl.style.background = `linear-gradient(to right, ${dark}, ${light})`;
                    } else {
                        // Fallback for safety
                        gradientEl.style.background = 'linear-gradient(to right, #666, #ccc)';
                    }
                } else {
                    legendContainer.classList.add('hidden');
                }

                const allPoints = [].concat(...datasets.map(d => d.data));
                let scales = {};
                if (allPoints.length > 0) {
                    const allX = allPoints.map(p => p.x), allY = allPoints.map(p => p.y);
                    const minX = Math.min(...allX), maxX = Math.max(...allX);
                    const minY = Math.min(...allY), maxY = Math.max(...allY);
                    const rangeX = maxX - minX, rangeY = maxY - minY;
                    const maxRange = Math.max(rangeX, rangeY, 0.1) * 1.1;
                    const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
                    scales = {
                        x: { min: midX - maxRange / 2, max: midX + maxRange / 2, grid: { color: '#e2e8f0' }, title: { display: true, text: `${hAxis1}座標 (m)` } },
                        y: { min: midY - maxRange / 2, max: midY + maxRange / 2, grid: { color: '#e2e8f0' }, title: { display: true, text: `${hAxis2}座標 (m)` } }
                    };
                }
                trajectoryChartWide = new Chart(ctx, {
                    type: 'scatter', data: { datasets }, options: { responsive: true, maintainAspectRatio: true, plugins: { title: { display: true, text: '剛体の移動軌跡' }, legend: { display: !showHeightInfo, position: 'top' } }, scales: scales, aspectRatio: 1 }
                });
            }

            function draw3DTrajectory(data) {
                const container = document.getElementById('trajectory-3d-container-wide');
                if (!container) return;
                container.innerHTML = '';

                const scene = new THREE.Scene();
                scene.background = new THREE.Color(0xf1f5f9);

                const camera = new THREE.PerspectiveCamera(75, container.clientWidth / container.clientHeight, 0.1, 10000);
                const renderer = new THREE.WebGLRenderer({ antialias: true });
                renderer.setSize(container.clientWidth, container.clientHeight);
                container.appendChild(renderer.domElement);

                const controls = new THREE.OrbitControls(camera, renderer.domElement);
                controls.enableDamping = true;
                controls.dampingFactor = 0.05;

                // Add lights to the scene
                const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
                scene.add(ambientLight);
                const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
                directionalLight.position.set(50, 50, 50);
                scene.add(directionalLight);

                const colors = ['#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6', '#f59e0b', '#14b8a6', '#ec4899', '#6929c4', '#1192e8', '#005d5d', '#9f1853', '#fa4d56', '#570408', '#198038', '#002d9c', '#ee538b', '#b28600', '#009d9a', '#012749'];

                const allPoints = [].concat(...Object.values(data).map(arr => arr.map(p => new THREE.Vector3(p.x, p.y, p.z))));

                if (allPoints.length > 1) {
                    Object.values(data).forEach((pointsData, index) => {
                        const points = pointsData.map(p => new THREE.Vector3(p.x, p.y, p.z));
                        if (points.length < 2) return;

                        const curve = new THREE.CatmullRomCurve3(points);
                        const tubeGeometry = new THREE.TubeGeometry(curve, points.length * 2, 0.05, 8, false);
                        const tubeMaterial = new THREE.MeshStandardMaterial({
                            color: colors[index % colors.length],
                            metalness: 0.5,
                            roughness: 0.5
                        });
                        const tube = new THREE.Mesh(tubeGeometry, tubeMaterial);
                        scene.add(tube);
                    });

                    const boundingBox = new THREE.Box3().setFromPoints(allPoints);
                    const center = new THREE.Vector3();
                    boundingBox.getCenter(center);
                    const size = new THREE.Vector3();
                    boundingBox.getSize(size);

                    const maxDim = Math.max(size.x, size.y, size.z);
                    const fov = camera.fov * (Math.PI / 180);
                    const cameraDistance = Math.abs(maxDim / (2 * Math.tan(fov / 2)));

                    const offset = cameraDistance * 1.2;
                    camera.position.set(center.x, center.y, center.z + Math.max(offset, 5));

                    camera.near = cameraDistance / 100;
                    camera.far = cameraDistance * 100;
                    camera.updateProjectionMatrix();

                    controls.target.copy(center);
                    controls.update();

                    const gridHelper = new THREE.GridHelper(Math.ceil(maxDim * 1.5) || 10, 20, 0xcccccc, 0xcccccc);
                    gridHelper.position.y = boundingBox.min.y;
                    scene.add(gridHelper);

                } else {
                    camera.position.set(0, 5, 10);
                    controls.target.set(0, 0, 0);
                    const gridHelper = new THREE.GridHelper(20, 20, 0xcccccc, 0xcccccc);
                    scene.add(gridHelper);
                }

                function animate() {
                    requestAnimationFrame(animate);
                    controls.update();
                    renderer.render(scene, camera);
                }
                animate();

                const resizeObserver = new ResizeObserver(entries => {
                    if (entries.length === 0) return;
                    const { width, height } = entries[0].contentRect;
                    camera.aspect = width / height;
                    camera.updateProjectionMatrix();
                    renderer.setSize(width, height);
                });

                resizeObserver.observe(container);
            }

            function calculateHeatmapGridWide(data, gridSize, hAxis1, hAxis2) {
                const hAxis1Lower = hAxis1.toLowerCase();
                const hAxis2Lower = hAxis2.toLowerCase();
                const allPoints = [].concat(...Object.values(data));
                if (allPoints.length === 0) return { grid: [], maxCount: 0, gridInfo: null };

                const minX = Math.min(...allPoints.map(p => p[hAxis1Lower])), maxX = Math.max(...allPoints.map(p => p[hAxis1Lower]));
                const minY = Math.min(...allPoints.map(p => -p[hAxis2Lower])), maxY = Math.max(...allPoints.map(p => -p[hAxis2Lower]));
                const rangeX = maxX - minX, rangeY = maxY - minY;
                const maxRange = Math.max(rangeX, rangeY, 0.1);
                const midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;
                const gridMinX = midX - maxRange / 2, gridMinY = midY - maxRange / 2;
                const divisions = Math.ceil(maxRange / gridSize);
                const cols = Math.max(1, divisions), rows = Math.max(1, divisions);

                const grid = Array(rows).fill(0).map(() => Array(cols).fill(0));
                const timeSteps = {};
                const samplingRate = parseFloat(samplingRateInputWide.value);
                allPoints.forEach(p => {
                    const t = Math.floor(p.t / samplingRate);
                    if (!timeSteps[t]) timeSteps[t] = [];
                    timeSteps[t].push(p);
                });
                Object.values(timeSteps).forEach(pointsInStep => {
                    const visitedCells = new Set();
                    pointsInStep.forEach(point => {
                        const col = Math.floor((point[hAxis1Lower] - gridMinX) / gridSize);
                        const row = Math.floor((-point[hAxis2Lower] - gridMinY) / gridSize);
                        if (col >= 0 && col < cols && row >= 0 && row < rows) {
                            visitedCells.add(`${row}-${col}`);
                        }
                    });
                    visitedCells.forEach(cell => {
                        const [r, c] = cell.split('-').map(Number);
                        if (grid[r] !== undefined && grid[r][c] !== undefined) grid[r][c]++;
                    });
                });
                const maxCount = Math.max(0, ...[].concat(...grid));
                const gridInfo = { gridMinX, gridMinY, rows, cols, gridSize };
                return { grid, maxCount, gridInfo };
            }

            function drawHeatmapCanvasWide(grid, maxCount, hAxis1, hAxis2) {
                const canvas = document.getElementById('heatmap-canvas-wide');
                const container = document.getElementById('heatmap-container-wide');
                if (!container) return;
                const ctx = canvas.getContext('2d');
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const rows = grid.length;
                if (rows === 0 || grid[0].length === 0) return;
                const cols = grid[0].length;
                const cellWidth = canvas.width / cols, cellHeight = canvas.height / rows;
                if (maxCount > 0) {
                    for (let r = 0; r < rows; r++) {
                        for (let c = 0; c < cols; c++) {
                            const count = grid[r][c];
                            if (count > 0) {
                                const value = count / maxCount;
                                ctx.fillStyle = getColorForValueWide(value);
                                ctx.fillRect(c * cellWidth, (rows - 1 - r) * cellHeight, cellWidth + 1, cellHeight + 1);
                            }
                        }
                    }
                }
            }

            function getColorForValueWide(value) {
                // Blue -> Cyan -> Green -> Yellow -> Red
                const colors = [
                    { r: 0, g: 0, b: 255 }, // Blue
                    { r: 0, g: 255, b: 255 }, // Cyan
                    { r: 0, g: 255, b: 0 },   // Green
                    { r: 255, g: 255, b: 0 },   // Yellow
                    { r: 255, g: 0, b: 0 }    // Red
                ];

                const segment = 1 / (colors.length - 1);
                const index = Math.min(Math.floor(value / segment), colors.length - 2);
                const t = (value - (index * segment)) / segment;

                const r = colors[index].r + t * (colors[index + 1].r - colors[index].r);
                const g = colors[index].g + t * (colors[index + 1].g - colors[index].g);
                const b = colors[index].b + t * (colors[index + 1].b - colors[index].b);

                return `rgb(${r}, ${g}, ${b})`;
            }

            function switchViewWide(viewName) {
                trajectoryViewWide.classList.add('hidden');
                heatmapViewWide.classList.add('hidden');
                trajectory3DViewWide.classList.add('hidden');
                showTrajectoryBtnWide.classList.remove('active');
                showHeatmapBtnWide.classList.remove('active');
                show3DTrajectoryBtnWide.classList.remove('active');

                if (viewName === 'trajectory') {
                    trajectoryViewWide.classList.remove('hidden');
                    showTrajectoryBtnWide.classList.add('active');
                } else if (viewName === 'heatmap') {
                    heatmapViewWide.classList.remove('hidden');
                    showHeatmapBtnWide.classList.add('active');
                    if (lastHeatmapGridWide) {
                        const verticalAxis = verticalAxisSelectWide.value;
                        const axes = ['X', 'Y', 'Z'];
                        const horizontalAxes = axes.filter(ax => ax !== verticalAxis);
                        const hAxis1 = horizontalAxes[0];
                        const hAxis2 = horizontalAxes[1];
                        setTimeout(() => {
                            drawHeatmapCanvasWide(lastHeatmapGridWide.grid, lastHeatmapGridWide.maxCount, hAxis1, hAxis2);
                        }, 50);
                    }
                } else if (viewName === '3d-trajectory') {
                    trajectory3DViewWide.classList.remove('hidden');
                    show3DTrajectoryBtnWide.classList.add('active');
                    if (lastSampledDataWide && !is3DTrajectoryRendered) {
                        setTimeout(() => { // Use setTimeout to ensure the container is fully visible
                            draw3DTrajectory(lastSampledDataWide);
                            is3DTrajectoryRendered = true;
                        }, 50);
                    }
                }
            }

            function calculateDataCenterWide(allPoints) {
                if (allPoints.length === 0) return { x: 0, y: 0 };
                const sumX = allPoints.reduce((sum, p) => sum + p.x, 0);
                const sumY = allPoints.reduce((sum, p) => sum + p.y, 0);
                return { x: sumX / allPoints.length, y: sumY / allPoints.length };
            }

            function calculateAndDisplayCoverageWide() {
                if (!lastHeatmapGridWide || !lastHeatmapGridWide.gridInfo) {
                    alert('先にデータを解析してください。');
                    return;
                }

                const shape = document.querySelector('input[name="area-shape-wide"]:checked').value;
                const dataUnit = document.querySelector('input[name="data-unit-wide"]:checked').value;
                let size = parseFloat(areaSizeInputWide.value);
                if (isNaN(size) || size <= 0) {
                    alert('基準範囲のサイズには正の数値を入力してください。');
                    return;
                }

                let centerX, centerY;
                if (document.querySelector('input[name="center-type-wide"]:checked').value === 'custom') {
                    centerX = parseFloat(centerXInputWide.value);
                    centerY = parseFloat(centerYInputWide.value);
                    if (isNaN(centerX) || isNaN(centerY)) {
                        alert('中心座標には有効な数値を入力してください。');
                        return;
                    }
                } else {
                    const allPoints = [].concat(...Object.values(lastSampledDataWide));
                    const dataCenter = calculateDataCenterWide(allPoints);
                    centerX = dataCenter.x;
                    centerY = dataCenter.y;
                }

                if (dataUnit === 'mm') {
                    size /= 1000;
                    if (document.querySelector('input[name="center-type-wide"]:checked').value === 'custom') {
                        centerX /= 1000;
                        centerY /= 1000;
                    }
                }

                const { grid, gridInfo } = lastHeatmapGridWide;
                const { gridMinX, gridMinY, rows, cols, gridSize } = gridInfo;

                let totalCellsInArea = 0;
                let reachedCellsInArea = 0;

                for (let r = 0; r < rows; r++) {
                    for (let c = 0; c < cols; c++) {
                        const cellCenterX = gridMinX + (c + 0.5) * gridSize;
                        const cellCenterY = gridMinY + (r + 0.5) * gridSize;

                        const dx = cellCenterX - centerX;
                        const dy = cellCenterY - centerY;

                        let isInArea = false;
                        if (shape === 'circle') {
                            if ((dx * dx + dy * dy) <= (size * size)) {
                                isInArea = true;
                            }
                        } else { // square
                            if (Math.abs(dx) <= size / 2 && Math.abs(dy) <= size / 2) {
                                isInArea = true;
                            }
                        }

                        if (isInArea) {
                            totalCellsInArea++;
                            if (grid[r][c] > 0) {
                                reachedCellsInArea++;
                            }
                        }
                    }
                }

                const coverage = totalCellsInArea > 0 ? (reachedCellsInArea / totalCellsInArea) * 100 : 0;
                coverageResultElWide.textContent = coverage.toFixed(2);

                // Visualize the area on the heatmap
                switchViewWide('heatmap');
                setTimeout(() => {
                    drawHeatmapCanvasWide(grid, lastHeatmapGridWide.maxCount);
                    const canvas = document.getElementById('heatmap-canvas-wide');
                    const ctx = canvas.getContext('2d');

                    const canvasWidth = canvas.width;
                    const canvasHeight = canvas.height;
                    const totalGridWidth = cols * gridSize;
                    const totalGridHeight = rows * gridSize;

                    const canvasCenterX = ((centerX - gridMinX) / totalGridWidth) * canvasWidth;
                    const canvasCenterY = canvasHeight - (((centerY - gridMinY) / totalGridHeight) * canvasHeight);

                    ctx.strokeStyle = '#0d9488';
                    ctx.lineWidth = 2;
                    ctx.setLineDash([5, 5]);

                    if (shape === 'circle') {
                        const canvasRadius = (size / totalGridWidth) * canvasWidth;
                        ctx.beginPath();
                        ctx.arc(canvasCenterX, canvasCenterY, canvasRadius, 0, 2 * Math.PI);
                        ctx.stroke();
                    } else {
                        const canvasSide = (size / totalGridWidth) * canvasWidth;
                        ctx.strokeRect(canvasCenterX - canvasSide / 2, canvasCenterY - canvasSide / 2, canvasSide, canvasSide);
                    }
                    ctx.setLineDash([]);
                }, 100);
            }

            async function handleDownloadWide(event) {
                const { target, format } = event.target.dataset;
                const element = document.getElementById(target);
                if (!element) return;

                loadingDiv.classList.remove('hidden');
                loadingText.textContent = "画像を生成中...";

                await new Promise(resolve => setTimeout(resolve, 100));

                try {
                    const canvas = await html2canvas(element, { backgroundColor: '#ffffff', scale: 2 });
                    const image = canvas.toDataURL('image/png', 1.0);

                    if (format === 'png') {
                        const link = document.createElement('a');
                        link.href = image;
                        link.download = `${target}.png`;
                        link.click();
                    } else if (format === 'pdf') {
                        const { jsPDF } = window.jspdf;
                        const orientation = canvas.width > canvas.height ? 'landscape' : 'portrait';
                        const pdf = new jsPDF({ orientation, unit: 'px', format: [canvas.width, canvas.height] });
                        pdf.addImage(image, 'PNG', 0, 0, canvas.width, canvas.height);
                        pdf.save(`${target}.pdf`);
                    }
                } catch (error) {
                    console.error("Download failed:", error);
                    alert("画像の生成に失敗しました。");
                } finally {
                    loadingDiv.classList.add('hidden');
                }
            }

            // --- DISTANCE MEASUREMENT TOOL SCRIPT ---
            const csvFilesDistance = document.getElementById('csv-files-distance');
            const fileNameDistance = document.getElementById('file-name-distance');
            const analysisTypeDistanceRadios = document.querySelectorAll('input[name="analysis-type-distance"]');
            const samplingRateDistance = document.getElementById('sampling-rate-distance');
            const enableDownsamplingCheckbox = document.getElementById('enable-downsampling-distance');
            const samplingRateContainer = document.getElementById('sampling-rate-container-distance');
            const dataUnitDistanceRadios = document.querySelectorAll('input[name="data-unit-distance"]');
            const pairSelectionArea = document.getElementById('pair-selection-area');
            const pairListContainer = document.getElementById('pair-list-container');
            const addPairBtn = document.getElementById('add-pair-btn');
            const analyzeBtnDistance = document.getElementById('analyze-btn-distance');
            const resultsCardDistance = document.getElementById('results-card-distance');
            const resultsTableBodyDistance = document.getElementById('results-table-body-distance');

            let fileDataStoreDistance = null;
            let pairCount = 0;

            if (csvFilesDistance) {
                csvFilesDistance.addEventListener('change', handleFileSelectDistance);
                addPairBtn.addEventListener('click', addPairRow);
                analyzeBtnDistance.addEventListener('click', calculateDistance);
                analysisTypeDistanceRadios.forEach(radio => radio.addEventListener('change', updatePairSelectors));
                enableDownsamplingCheckbox.addEventListener('change', (e) => {
                    samplingRateContainer.classList.toggle('hidden', !e.target.checked);
                });
            }

            function handleFileSelectDistance(event) {
                const file = event.target.files[0];
                if (!file) return;

                fileNameDistance.textContent = file.name;
                loadingDiv.classList.remove('hidden');
                loadingText.textContent = "ファイルを読み込み中...";

                Papa.parse(file, {
                    complete: (results) => {
                        try {
                            fileDataStoreDistance = parseHeaderDistance(results.data);
                            pairSelectionArea.classList.remove('hidden');
                            // Initialize with one pair row if empty
                            if (pairCount === 0) addPairRow();
                            updatePairSelectors(); // Populate selectors
                        } catch (error) {
                            alert(`解析エラー: ${error.message}`);
                            fileDataStoreDistance = null;
                            pairSelectionArea.classList.add('hidden');
                        } finally {
                            loadingDiv.classList.add('hidden');
                        }
                    },
                    error: (error) => {
                        alert(`ファイルの読み込みに失敗しました: ${error.message}`);
                        loadingDiv.classList.add('hidden');
                    }
                });
            }

            function parseHeaderDistance(data) {
                // Robust parsing for both Rigid Bodies and Markers
                let typeRowIndex = -1, nameRowIndex = -1, propertyRowIndex = -1, dataHeaderRowIndex = -1;
                for (let i = 0; i < Math.min(20, data.length); i++) {
                    const row = data[i];
                    if (!row || row.length < 2) continue;
                    if (row[1] === 'Type') typeRowIndex = i;
                    if (row[1] === 'Name') nameRowIndex = i;
                    if (row.includes('Position')) propertyRowIndex = i;
                    if (row[0] === 'Frame' && row[1] === 'Time (Seconds)') {
                        dataHeaderRowIndex = i;
                        break;
                    }
                }

                if ([typeRowIndex, nameRowIndex, propertyRowIndex, dataHeaderRowIndex].includes(-1)) {
                    throw new Error("CSVのヘッダー形式を認識できませんでした。");
                }

                const typeRow = data[typeRowIndex];
                const nameRow = data[nameRowIndex];
                const propertyRow = data[propertyRowIndex];
                const dataHeaderRow = data[dataHeaderRowIndex];
                const dataStartIndex = dataHeaderRowIndex + 1;

                const objects = {
                    rigidBodies: [],
                    markers: []
                };

                for (let i = 2; i < typeRow.length; i++) {
                    // Check for Position property
                    if (propertyRow[i] !== 'Position') continue;

                    const type = typeRow[i];
                    const name = nameRow[i];

                    // Identify object end index (assuming X, Y, Z are contiguous)
                    // Check if we have X, Y, Z
                    let xIndex = -1, yIndex = -1, zIndex = -1;

                    for (let j = 0; j < 3; j++) {
                        if (i + j < dataHeaderRow.length) {
                            const axis = dataHeaderRow[i + j].toUpperCase();
                            if (axis === 'X') xIndex = i + j;
                            if (axis === 'Y') yIndex = i + j;
                            if (axis === 'Z') zIndex = i + j;
                        }
                    }

                    if (xIndex !== -1 && yIndex !== -1 && zIndex !== -1) {
                        const objData = { name: name, xIndex, yIndex, zIndex };
                        if (type === 'Rigid Body') {
                            if (!objects.rigidBodies.find(o => o.name === name)) {
                                objects.rigidBodies.push(objData);
                            }
                        } else if (type === 'Marker') {
                            // Try to find if this marker belongs to a rigid body.
                            // Motive sometimes puts "RigidBodyName:MarkerName" in the Name row, or puts RigidBody name in a separate row if exported differently.
                            // Based on standard motive export (CSV), Name row usually contains the full unique name.
                            // However, sometimes it's grouped.
                            // Let's assume the name in 'Name' row is unique enough or formatted as "RB:Marker".
                            // The user requested: "マーカー一覧では，マーカー名の前に剛体名を入れることにしてください"
                            // If the CSV structure has a specific row for ID or Rigid Body Parent, we might use it.
                            // But standard "Take" export usually flattens it or puts it in Name.
                            // Let's use the Name column as is, assuming it contains necessary info,
                            // OR check if there's a convention.

                            // If the name is just "Marker1" and it belongs to "Robot", often it's "Robot:Marker1".
                            // We will just store it. If we can deduce a prefix from previous columns or similar, we might.
                            // But parsing strictly from columns:

                            if (!objects.markers.find(o => o.name === name)) {
                                objects.markers.push(objData);
                            }
                        }
                        // Advance index to skip Y and Z
                        // Note: The loop increments by 1, so we don't need to skip manually if we just process when propertyRow[i] is 'Position' (usually aligned with X).
                        // Actually, propertyRow usually has 'Position' for X, Y, Z columns or just one merged cell?
                        // In CSV, usually: Type, Type, Type... | Name, Name, Name... | Position, Position, Position... | X, Y, Z, X, Y, Z...
                        // So propertyRow[i] is 'Position' for X, Y, and Z.
                        // We should process only if we are at X (start of triplet).
                        // We can detect if dataHeaderRow[i] is 'X'.

                    }
                }

                // Refined loop to ensure we only pick up the start of a triplet
                const uniqueObjects = { rigidBodies: [], markers: [] };
                for (let i = 2; i < typeRow.length; i++) {
                    if (propertyRow[i] === 'Position' && dataHeaderRow[i].toUpperCase() === 'X') {
                        const type = typeRow[i];
                        const name = nameRow[i];
                        const xIndex = i;
                        const yIndex = i + 1;
                        const zIndex = i + 2;

                        // Verify Y and Z exist
                        if (yIndex < dataHeaderRow.length && dataHeaderRow[yIndex].toUpperCase() === 'Y' &&
                            zIndex < dataHeaderRow.length && dataHeaderRow[zIndex].toUpperCase() === 'Z') {

                            const obj = { name, xIndex, yIndex, zIndex };
                            if (type === 'Rigid Body') {
                                if (!uniqueObjects.rigidBodies.find(o => o.name === name)) uniqueObjects.rigidBodies.push(obj);
                            } else if (type === 'Marker') {
                                if (!uniqueObjects.markers.find(o => o.name === name)) uniqueObjects.markers.push(obj);
                            }
                        }
                    }
                }

                // Filter out empty lines from raw data
                const rawData = data.slice(dataStartIndex).filter(row => row.length > 1 && row[1] !== '');

                return { objects: uniqueObjects, rawData };
            }

            function addPairRow() {
                if (pairCount >= 5) {
                    alert("最大5件まで選択できます。");
                    return;
                }
                pairCount++;

                const rowId = `pair-row-${Date.now()}`;
                const div = document.createElement('div');
                div.className = 'pair-row flex items-center space-x-4 p-3 bg-slate-50 border rounded-md';
                div.id = rowId;
                div.innerHTML = `
                    <span class="font-medium text-slate-500 text-sm w-6">#${pairCount}</span>
                    <div class="flex-1 grid grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">点A</label>
                            <select class="pair-select-a block w-full bg-white border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm max-w-xs"></select>
                        </div>
                        <div>
                            <label class="block text-xs text-slate-500 mb-1">点B</label>
                            <select class="pair-select-b block w-full bg-white border-slate-300 rounded-md shadow-sm py-2 px-3 focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 text-sm max-w-xs"></select>
                        </div>
                    </div>
                    <button type="button" class="text-red-500 hover:text-red-700" onclick="removePairRow('${rowId}')">
                        <svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clip-rule="evenodd" /></svg>
                    </button>
                `;
                pairListContainer.appendChild(div);

                // Populate the new selects if data is loaded
                if (fileDataStoreDistance) {
                    updateSelectOptions(div.querySelector('.pair-select-a'));
                    updateSelectOptions(div.querySelector('.pair-select-b'));
                }

                updateAnalyzeButtonState();
            }

            // Expose remove function to global scope
            window.removePairRow = function (rowId) {
                const row = document.getElementById(rowId);
                if (row) {
                    row.remove();
                    pairCount--;
                    // Renumber rows? Optional but looks nicer
                    document.querySelectorAll('#pair-list-container .pair-row').forEach((row, index) => {
                        row.querySelector('span').textContent = `#${index + 1}`;
                    });
                    updateAnalyzeButtonState();
                }
            };

            function updateAnalyzeButtonState() {
                analyzeBtnDistance.disabled = pairCount === 0 || !fileDataStoreDistance;
            }

            function updatePairSelectors() {
                if (!fileDataStoreDistance) return;
                document.querySelectorAll('.pair-select-a, .pair-select-b').forEach(select => {
                    updateSelectOptions(select);
                });
            }

            function updateSelectOptions(selectElement) {
                const type = document.querySelector('input[name="analysis-type-distance"]:checked').value;
                const objects = fileDataStoreDistance.objects;
                const list = type === 'marker' ? objects.markers : objects.rigidBodies;

                const currentValue = selectElement.value;
                selectElement.innerHTML = '<option value="">選択してください</option>';

                list.forEach(obj => {
                    const option = document.createElement('option');
                    option.value = obj.name;
                    option.textContent = obj.name;
                    selectElement.appendChild(option);
                });

                if (currentValue) selectElement.value = currentValue;
            }

            function calculateDistance() {
                if (!fileDataStoreDistance) return;

                const pairs = [];
                document.querySelectorAll('.pair-row').forEach(row => {
                    const selectA = row.querySelector('.pair-select-a');
                    const selectB = row.querySelector('.pair-select-b');
                    if (selectA.value && selectB.value) {
                        pairs.push({ a: selectA.value, b: selectB.value });
                    }
                });

                if (pairs.length === 0) {
                    alert("有効なペアが選択されていません。");
                    return;
                }

                const type = document.querySelector('input[name="analysis-type-distance"]:checked').value;
                const objectList = type === 'marker' ? fileDataStoreDistance.objects.markers : fileDataStoreDistance.objects.rigidBodies;
                const isDownsampling = enableDownsamplingCheckbox.checked;
                const samplingRate = isDownsampling ? parseFloat(samplingRateDistance.value) : 0;
                const dataUnit = document.querySelector('input[name="data-unit-distance"]:checked').value;

                loadingDiv.classList.remove('hidden');
                loadingText.textContent = "解析中...";

                setTimeout(() => {
                    try {
                        const results = pairs.map(pair => {
                            const objA = objectList.find(o => o.name === pair.a);
                            const objB = objectList.find(o => o.name === pair.b);

                            if (!objA || !objB) return null;

                            const avgA = calculateAveragePosition(objA, samplingRate, isDownsampling, dataUnit);
                            const avgB = calculateAveragePosition(objB, samplingRate, isDownsampling, dataUnit);

                            // Euclidean distance between averages
                            const distance = Math.sqrt(
                                Math.pow(avgA.x - avgB.x, 2) +
                                Math.pow(avgA.y - avgB.y, 2) +
                                Math.pow(avgA.z - avgB.z, 2)
                            );

                            return { pair, avgA, avgB, distance };
                        }).filter(r => r !== null);

                        displayDistanceResults(results);

                    } catch (e) {
                        console.error(e);
                        alert("計算中にエラーが発生しました。");
                    } finally {
                        loadingDiv.classList.add('hidden');
                    }
                }, 50);
            }

            function calculateAveragePosition(objInfo, samplingRate, isDownsampling, dataUnit) {
                const rawData = fileDataStoreDistance.rawData;
                let sumX = 0, sumY = 0, sumZ = 0;
                let count = 0;
                let nextSampleTime = -1; // Process first frame always

                for (const row of rawData) {
                    const time = parseFloat(row[1]);
                    if (isNaN(time)) continue;

                    if (!isDownsampling || time >= nextSampleTime) {
                        let x = parseFloat(row[objInfo.xIndex]);
                        let y = parseFloat(row[objInfo.yIndex]);
                        let z = parseFloat(row[objInfo.zIndex]);

                        if (!isNaN(x) && !isNaN(y) && !isNaN(z)) {
                            if (dataUnit === 'mm') {
                                x /= 1000;
                                y /= 1000;
                                z /= 1000;
                            }
                            sumX += x;
                            sumY += y;
                            sumZ += z;
                            count++;
                        }
                        if (isDownsampling) {
                            if (nextSampleTime === -1) nextSampleTime = time; // Initialize on first valid frame
                            nextSampleTime += samplingRate;
                        }
                    }
                }

                if (count === 0) return { x: 0, y: 0, z: 0 };
                return { x: sumX / count, y: sumY / count, z: sumZ / count };
            }

            function displayDistanceResults(results) {
                resultsTableBodyDistance.innerHTML = '';
                results.forEach(res => {
                    const tr = document.createElement('tr');
                    tr.innerHTML = `
                        <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-slate-900">
                            ${res.pair.a} <span class="text-slate-400 mx-1">↔</span> ${res.pair.b}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-700 font-bold">
                            ${res.distance.toFixed(4)}
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            (${res.avgA.x.toFixed(3)}, ${res.avgA.y.toFixed(3)}, ${res.avgA.z.toFixed(3)})
                        </td>
                        <td class="px-6 py-4 whitespace-nowrap text-sm text-slate-500">
                            (${res.avgB.x.toFixed(3)}, ${res.avgB.y.toFixed(3)}, ${res.avgB.z.toFixed(3)})
                        </td>
                    `;
                    resultsTableBodyDistance.appendChild(tr);
                });

                resultsCardDistance.classList.remove('hidden');
                resultsCardDistance.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }


            // --- DATA TRIMMING TOOL SCRIPT ---
            const csvFileTrimming = document.getElementById('csv-file-trimming');
            const fileNameTrimming = document.getElementById('file-name-trimming');
            const trimmingUI = document.getElementById('trimming-ui');
            const trimmingRigidbodySelect = document.getElementById('trimming-rigidbody-select');
            const trimmingDownsampleCheckbox = document.getElementById('trimming-downsample');
            const trimStartTimeInput = document.getElementById('trim-start-time');
            const trimEndTimeInput = document.getElementById('trim-end-time');
            const trimDurationInput = document.getElementById('trim-duration');
            const resetZoomTrimmingBtn = document.getElementById('reset-zoom-trimming');
            const exportTrimmedCsvBtn = document.getElementById('export-trimmed-csv');
            const chartCanvasX = document.getElementById('trim-chart-x');
            const chartCanvasY = document.getElementById('trim-chart-y');
            const chartCanvasZ = document.getElementById('trim-chart-z');

            let trimmingData = null; // { headerLines, rigidBodies: [...], rawData: [...] }
            let trimmingCharts = { x: null, y: null, z: null };
            let trimmingRange = { start: 0, end: 0 };
            let isTrimmingUpdating = false;
            let trimmingDragState = {
                active: false,
                element: null, // 'lineStart', 'lineEnd', 'box1'
                hovered: null,
                originX: 0,
                originStart: 0,
                originEnd: 0
            };

            if (csvFileTrimming) {
                csvFileTrimming.addEventListener('change', handleFileSelectTrimming);
                trimmingRigidbodySelect.addEventListener('change', updateTrimmingCharts);
                trimmingDownsampleCheckbox.addEventListener('change', updateTrimmingCharts);
                resetZoomTrimmingBtn.addEventListener('click', resetTrimmingZoom);
                exportTrimmedCsvBtn.addEventListener('click', exportTrimmedData);

                [trimStartTimeInput, trimEndTimeInput].forEach(input => {
                    input.addEventListener('change', () => {
                        const s = parseFloat(trimStartTimeInput.value);
                        const e = parseFloat(trimEndTimeInput.value);
                        if (!isNaN(s) && !isNaN(e) && s < e) {
                            updateTrimmingRange(s, e, true);
                        }
                    });
                });
            }

            function handleFileSelectTrimming(event) {
                const file = event.target.files[0];
                if (!file) return;

                fileNameTrimming.textContent = file.name;
                loadingDiv.classList.remove('hidden');
                loadingText.textContent = "ファイルを読み込み中...";

                Papa.parse(file, {
                    complete: (results) => {
                        try {
                            trimmingData = parseHeaderTrimming(results.data);
                            setupTrimmingUI();
                        } catch (error) {
                            alert(`解析エラー: ${error.message}`);
                        } finally {
                            loadingDiv.classList.add('hidden');
                        }
                    },
                    error: (error) => {
                        alert(`ファイルの読み込みに失敗しました: ${error.message}`);
                        loadingDiv.classList.add('hidden');
                    }
                });
            }

            function parseHeaderTrimming(data) {
                // Determine header structure
                let dataStartIndex = -1;
                for (let i = 0; i < Math.min(20, data.length); i++) {
                    if (data[i][0] === 'Frame' && data[i][1] === 'Time (Seconds)') {
                        dataStartIndex = i + 1;
                        break;
                    }
                }
                if (dataStartIndex === -1) throw new Error("Motive CSV形式として認識できませんでした。");

                const headerLines = data.slice(0, dataStartIndex);
                const rawData = data.slice(dataStartIndex).filter(row => row.length > 1 && row[1] !== ''); // Filter empty

                // Parse Rigid Bodies for selector
                // Assume Type row is at dataStartIndex - 5 (standard) or scan for "Type"
                let typeRowIndex = -1, nameRowIndex = -1;
                for (let i = 0; i < dataStartIndex; i++) {
                    if (data[i][1] === 'Type') typeRowIndex = i;
                    if (data[i][1] === 'Name') nameRowIndex = i;
                }

                const rigidBodies = [];
                const nameCounts = {};
                const parsedBodyData = {};

                // We need to find Position X, Y, Z for each rigid body
                let propertyRowIndex = -1;
                for (let i = 0; i < dataStartIndex; i++) {
                    if (data[i].includes('Position')) propertyRowIndex = i;
                }

                if (typeRowIndex !== -1 && nameRowIndex !== -1 && propertyRowIndex !== -1) {
                    const typeRow = data[typeRowIndex];
                    const nameRow = data[nameRowIndex];
                    const propRow = data[propertyRowIndex];
                    const headerRow = data[dataStartIndex - 1];

                    // Identify distinct rigid bodies (considering duplicates)
                    // We iterate columns and find the start of a RigidBody Position block
                    for (let i = 2; i < typeRow.length; i++) {
                        if (typeRow[i] === 'Rigid Body' && propRow[i] === 'Position') {
                            // Check if this is the start of a triplet X, Y, Z
                            const axis = headerRow[i].toUpperCase();
                            if (axis === 'X') {
                                // Found a position block start
                                let rawName = nameRow[i];

                                // Generate unique name
                                if (!nameCounts[rawName]) {
                                    nameCounts[rawName] = 0;
                                }
                                nameCounts[rawName]++;

                                let uniqueName = rawName;
                                if (nameCounts[rawName] > 1 || (nameRow.indexOf(rawName, i + 3) !== -1)) {
                                    // If count > 1 OR duplicates exist ahead
                                    uniqueName = `${rawName} (${nameCounts[rawName]})`;
                                }

                                // Store indices
                                const xIdx = i;
                                const yIdx = i + 1; // Assume contiguous X, Y, Z
                                const zIdx = i + 2;

                                // Verify Y and Z
                                if (headerRow[yIdx].toUpperCase() === 'Y' && headerRow[zIdx].toUpperCase() === 'Z') {
                                    rigidBodies.push(uniqueName);
                                    parsedBodyData[uniqueName] = { xIdx, yIdx, zIdx };

                                    // Skip processing Y and Z columns for this block
                                    // But loop increments by 1, so we just let it continue?
                                    // No, we should probably mark them handled or just rely on 'X' check.
                                    // The loop check `axis === 'X'` handles skipping Y and Z naturally.
                                }
                            }
                        }
                    }

                    // If we found duplicates but the first one didn't get a suffix (because we didn't know yet),
                    // we might want to retroactively fix?
                    // The above logic gives "Name (1)" only if it sees a second one?
                    // No, `nameCounts[rawName] > 1`. This check is only true for the 2nd instance onwards.
                    // To handle the first one correctly if duplicates exist:
                    // We need a two-pass approach.
                }

                // Second pass approach for better naming
                rigidBodies.length = 0; // Clear
                Object.keys(parsedBodyData).forEach(key => delete parsedBodyData[key]);

                const tempBodyLocations = []; // { rawName, xIdx }

                if (typeRowIndex !== -1 && nameRowIndex !== -1 && propertyRowIndex !== -1) {
                    const typeRow = data[typeRowIndex];
                    const nameRow = data[nameRowIndex];
                    const propRow = data[propertyRowIndex];
                    const headerRow = data[dataStartIndex - 1];

                    for (let i = 2; i < typeRow.length; i++) {
                        if (typeRow[i] === 'Rigid Body' && propRow[i] === 'Position' && headerRow[i].toUpperCase() === 'X') {
                            tempBodyLocations.push({ rawName: nameRow[i], xIdx: i });
                        }
                    }
                }

                // Count totals
                const totalCounts = {};
                tempBodyLocations.forEach(loc => {
                    totalCounts[loc.rawName] = (totalCounts[loc.rawName] || 0) + 1;
                });

                // Assign unique names
                const currentCounts = {};
                tempBodyLocations.forEach(loc => {
                    const rawName = loc.rawName;
                    let uniqueName = rawName;
                    if (totalCounts[rawName] > 1) {
                        currentCounts[rawName] = (currentCounts[rawName] || 0) + 1;
                        uniqueName = `${rawName} (${currentCounts[rawName]})`;
                    }

                    rigidBodies.push(uniqueName);
                    parsedBodyData[uniqueName] = {
                        xIdx: loc.xIdx,
                        yIdx: loc.xIdx + 1,
                        zIdx: loc.xIdx + 2
                    };
                });

                return { headerLines, rawData, rigidBodies, parsedBodyData };
            }

            function setupTrimmingUI() {
                trimmingUI.classList.remove('hidden');

                // Populate Rigid Body Selector
                trimmingRigidbodySelect.innerHTML = '<option value="all">すべて表示</option>';
                trimmingData.rigidBodies.forEach(name => {
                    const option = document.createElement('option');
                    option.value = name;
                    option.textContent = name;
                    trimmingRigidbodySelect.appendChild(option);
                });

                // Init Range
                if (trimmingData.rawData.length > 0) {
                    const startTime = parseFloat(trimmingData.rawData[0][1]);
                    const endTime = parseFloat(trimmingData.rawData[trimmingData.rawData.length - 1][1]);
                    trimmingRange = { start: startTime, end: endTime };
                    trimStartTimeInput.value = startTime;
                    trimEndTimeInput.value = endTime;
                    trimDurationInput.value = (endTime - startTime).toFixed(3);
                }

                updateTrimmingCharts();
            }

            function updateTrimmingCharts() {
                if (!trimmingData) return;

                const downsample = trimmingDownsampleCheckbox.checked;
                const targetBody = trimmingRigidbodySelect.value;
                const bodiesToPlot = targetBody === 'all' ? Object.keys(trimmingData.parsedBodyData) : [targetBody];

                const datasetsX = [];
                const datasetsY = [];
                const datasetsZ = [];

                const colors = ['#3b82f6', '#ef4444', '#10b981', '#f97316', '#8b5cf6'];

                bodiesToPlot.forEach((name, idx) => {
                    const indices = trimmingData.parsedBodyData[name];
                    if (!indices) return;

                    const color = colors[idx % colors.length];
                    const dataX = [];
                    const dataY = [];
                    const dataZ = [];

                    // Sampling
                    const step = downsample ? Math.max(1, Math.floor(trimmingData.rawData.length / 1000)) : 1;

                    for (let i = 0; i < trimmingData.rawData.length; i += step) {
                        const row = trimmingData.rawData[i];
                        const t = parseFloat(row[1]);
                        const x = parseFloat(row[indices.xIdx]);
                        const y = parseFloat(row[indices.yIdx]);
                        const z = parseFloat(row[indices.zIdx]);

                        if (!isNaN(t)) {
                            if (!isNaN(x)) dataX.push({ x: t, y: x });
                            if (!isNaN(y)) dataY.push({ x: t, y: y });
                            if (!isNaN(z)) dataZ.push({ x: t, y: z });
                        }
                    }

                    const common = {
                        label: name,
                        borderColor: color,
                        borderWidth: 1,
                        pointRadius: 0,
                        tension: 0,
                        fill: false
                    };

                    datasetsX.push({ ...common, data: dataX });
                    datasetsY.push({ ...common, data: dataY });
                    datasetsZ.push({ ...common, data: dataZ });
                });

                createTrimmingChart('x', chartCanvasX, datasetsX, 'X軸');
                createTrimmingChart('y', chartCanvasY, datasetsY, 'Y軸');
                createTrimmingChart('z', chartCanvasZ, datasetsZ, 'Z軸');
            }

            function createTrimmingChart(axis, canvas, datasets, title) {
                if (trimmingCharts[axis]) trimmingCharts[axis].destroy();

                const annotations = {
                    box1: {
                        type: 'box',
                        xMin: trimmingRange.start,
                        xMax: trimmingRange.end,
                        backgroundColor: 'rgba(0, 0, 255, 0.1)',
                        borderWidth: 0,
                        init: true,
                        xScaleID: 'x',
                        yScaleID: 'y',
                        z: -1,
                        enter: (ctx) => {
                            ctx.chart.canvas.style.cursor = 'move';
                            ctx.chart.options.plugins.zoom.pan.enabled = false;
                            trimmingDragState.hovered = 'box1';
                        },
                        leave: (ctx) => {
                            ctx.chart.canvas.style.cursor = 'default';
                            ctx.chart.options.plugins.zoom.pan.enabled = true;
                            trimmingDragState.hovered = null;
                        }
                    },
                    lineStart: {
                        type: 'line',
                        scaleID: 'x',
                        value: trimmingRange.start,
                        borderColor: 'rgb(0, 0, 255)',
                        borderWidth: 6,
                        label: { display: false },
                        z: 100,
                        enter: (ctx) => {
                            ctx.chart.canvas.style.cursor = 'ew-resize';
                            ctx.chart.options.plugins.zoom.pan.enabled = false;
                            trimmingDragState.hovered = 'lineStart';
                        },
                        leave: (ctx) => {
                            ctx.chart.canvas.style.cursor = 'default';
                            ctx.chart.options.plugins.zoom.pan.enabled = true;
                            trimmingDragState.hovered = null;
                        }
                    },
                    lineEnd: {
                        type: 'line',
                        scaleID: 'x',
                        value: trimmingRange.end,
                        borderColor: 'rgb(0, 0, 255)',
                        borderWidth: 6,
                        label: { display: false },
                        z: 100,
                        enter: (ctx) => {
                            ctx.chart.canvas.style.cursor = 'ew-resize';
                            ctx.chart.options.plugins.zoom.pan.enabled = false;
                            trimmingDragState.hovered = 'lineEnd';
                        },
                        leave: (ctx) => {
                            ctx.chart.canvas.style.cursor = 'default';
                            ctx.chart.options.plugins.zoom.pan.enabled = true;
                            trimmingDragState.hovered = null;
                        }
                    }
                };

                // Custom Plugin for Dragging
                const dragPlugin = {
                    id: 'trimmingDrag',
                    beforeEvent(chart, args) {
                        const event = args.event;

                        // Handle Drag Start
                        if (event.type === 'mousedown' || event.type === 'touchstart') {
                            if (trimmingDragState.hovered) {
                                trimmingDragState.active = true;
                                trimmingDragState.element = trimmingDragState.hovered;
                                trimmingDragState.originX = event.x;
                                trimmingDragState.originStart = trimmingRange.start;
                                trimmingDragState.originEnd = trimmingRange.end;
                                return false; // Stop other plugins (Zoom)
                            }
                        }

                        // Handle Drag Move
                        if (event.type === 'mousemove' || event.type === 'touchmove') {
                            if (trimmingDragState.active) {
                                const scale = chart.scales.x;
                                const valCurrent = scale.getValueForPixel(event.x);
                                const valOrigin = scale.getValueForPixel(trimmingDragState.originX);
                                const diff = valCurrent - valOrigin;

                                if (trimmingDragState.element === 'box1') {
                                    // Move entire range
                                    const newStart = trimmingDragState.originStart + diff;
                                    const newEnd = trimmingDragState.originEnd + diff;
                                    updateTrimmingRange(newStart, newEnd, true, axis);
                                } else if (trimmingDragState.element === 'lineStart') {
                                    // Resize Start
                                    const newStart = trimmingDragState.originStart + diff;
                                    if (newStart < trimmingDragState.originEnd) {
                                        updateTrimmingRange(newStart, trimmingDragState.originEnd, true, axis);
                                    }
                                } else if (trimmingDragState.element === 'lineEnd') {
                                    // Resize End
                                    const newEnd = trimmingDragState.originEnd + diff;
                                    if (newEnd > trimmingDragState.originStart) {
                                        updateTrimmingRange(trimmingDragState.originStart, newEnd, true, axis);
                                    }
                                }

                                return false; // Stop other plugins
                            }
                        }

                        // Handle Drag End
                        if (event.type === 'mouseup' || event.type === 'mouseout' || event.type === 'touchend') {
                            if (trimmingDragState.active) {
                                trimmingDragState.active = false;
                                chart.options.plugins.zoom.pan.enabled = true; // Restore pan
                                chart.canvas.style.cursor = 'default';
                            }
                        }
                    }
                };

                trimmingCharts[axis] = new Chart(canvas, {
                    type: 'line',
                    data: { datasets: datasets },
                    plugins: [dragPlugin],
                    options: {
                        events: ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove', 'mousedown', 'mouseup'],
                        responsive: true,
                        maintainAspectRatio: false,
                        animation: false,
                        interaction: {
                            mode: 'nearest',
                            axis: 'x',
                            intersect: false
                        },
                        scales: {
                            x: {
                                type: 'linear',
                                title: { display: false },
                                min: trimmingData.rawData.length > 0 ? parseFloat(trimmingData.rawData[0][1]) : 0,
                                max: trimmingData.rawData.length > 0 ? parseFloat(trimmingData.rawData[trimmingData.rawData.length - 1][1]) : 10
                            },
                            y: {
                                title: { display: true, text: title }
                            }
                        },
                        plugins: {
                            tooltip: { enabled: false }, // Disable tooltips
                            legend: { display: axis === 'x', labels: { boxWidth: 10 } },
                            zoom: {
                                zoom: {
                                    wheel: { enabled: true },
                                    pinch: { enabled: true },
                                    mode: 'x',
                                    onZoom: ({ chart }) => syncCharts(chart, axis)
                                },
                                pan: {
                                    enabled: true,
                                    mode: 'x',
                                    threshold: 10,
                                    onPan: ({ chart }) => syncCharts(chart, axis)
                                }
                            },
                            annotation: {
                                annotations: annotations,
                                interaction: {
                                    mode: 'nearest',
                                    axis: 'x',
                                    intersect: true
                                }
                            }
                        }
                    }
                });
            }

            function syncCharts(sourceChart, sourceAxis) {
                const min = sourceChart.scales.x.min;
                const max = sourceChart.scales.x.max;

                ['x', 'y', 'z'].forEach(ax => {
                    if (ax !== sourceAxis && trimmingCharts[ax]) {
                        trimmingCharts[ax].options.scales.x.min = min;
                        trimmingCharts[ax].options.scales.x.max = max;
                        trimmingCharts[ax].update('none');
                    }
                });
            }

            function updateTrimmingRange(start, end, updateCharts = true, sourceAxis = null) {
                if (isTrimmingUpdating) return;
                isTrimmingUpdating = true;

                // Validate
                const totalMin = parseFloat(trimmingData.rawData[0][1]);
                const totalMax = parseFloat(trimmingData.rawData[trimmingData.rawData.length - 1][1]);

                // Allow some flexibility but clamp eventually
                // start = Math.max(totalMin, start);
                // end = Math.min(totalMax, end);

                trimmingRange.start = start;
                trimmingRange.end = end;

                trimStartTimeInput.value = start.toFixed(3);
                trimEndTimeInput.value = end.toFixed(3);
                trimDurationInput.value = (end - start).toFixed(3);

                if (updateCharts) {
                    ['x', 'y', 'z'].forEach(ax => {
                        const chart = trimmingCharts[ax];
                        if (chart) {
                            // Update annotations
                            chart.options.plugins.annotation.annotations.box1.xMin = start;
                            chart.options.plugins.annotation.annotations.box1.xMax = end;
                            chart.options.plugins.annotation.annotations.lineStart.value = start;
                            chart.options.plugins.annotation.annotations.lineEnd.value = end;
                            chart.update('none');
                        }
                    });
                }

                isTrimmingUpdating = false;
            }

            function resetTrimmingZoom() {
                if (!trimmingData) return;
                const min = parseFloat(trimmingData.rawData[0][1]);
                const max = parseFloat(trimmingData.rawData[trimmingData.rawData.length - 1][1]);
                ['x', 'y', 'z'].forEach(ax => {
                    if (trimmingCharts[ax]) {
                        trimmingCharts[ax].options.scales.x.min = min;
                        trimmingCharts[ax].options.scales.x.max = max;
                        trimmingCharts[ax].update('none');
                    }
                });
            }

            function exportTrimmedData() {
                if (!trimmingData) return;

                const start = parseFloat(trimStartTimeInput.value);
                const end = parseFloat(trimEndTimeInput.value);

                if (start >= end) {
                    alert('開始時間は終了時間より前である必要があります。');
                    return;
                }

                // Filter data
                // We need to preserve header but re-index Frames and Times
                // Frame usually starts at 1? Or original?
                // Motive usually restarts frame count if we treat it as a new take, or keeps it.
                // User requirement: "Motiveと同様の形式で出力" "区間のデータだけを含めたCSV"
                // Usually trimming implies new take -> Frame 0/1, Time 0.

                // Let's re-index Frame to start from 1, Time to start from 0.

                const frameColIdx = 0; // "Frame"
                const timeColIdx = 1; // "Time (Seconds)"

                const trimmedRows = [];
                let newFrame = 0; // Will increment

                // Need to find the rows within range
                // Assumes rawData is sorted by time

                for (const row of trimmingData.rawData) {
                    const t = parseFloat(row[timeColIdx]);
                    if (t >= start && t <= end) {
                        // Clone row
                        const newRow = [...row];
                        newFrame++;
                        newRow[frameColIdx] = newFrame;
                        newRow[timeColIdx] = (t - start).toFixed(3); // Relative time
                        trimmedRows.push(newRow);
                    }
                }

                if (trimmedRows.length === 0) {
                    alert('選択範囲内にデータがありません。');
                    return;
                }

                // Construct CSV
                // Header lines
                const csvContent = [];
                // Original headers
                trimmingData.headerLines.forEach(line => {
                    csvContent.push(line.join(','));
                });

                // Data
                trimmedRows.forEach(row => {
                    csvContent.push(row.join(','));
                });

                const csvString = csvContent.join('\n');
                const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.setAttribute('href', url);
                link.setAttribute('download', `trimmed_${fileNameTrimming.textContent}`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            }

            if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                    navigator.serviceWorker.register('./service-worker.js')
                        .then(registration => {
                            console.log('Service Worker registered: ', registration);
                        })
                        .catch(error => {
                            console.log('Service Worker registration failed: ', error);
                        });
                });
            }

            // PWA Installation Logic
            let deferredPrompt;
            const pwaInstallBanner = document.getElementById('pwa-install-banner');
            const pwaInstallBtn = document.getElementById('pwa-install-btn');
            const pwaDismissBtn = document.getElementById('pwa-dismiss-btn');

            // Check if user previously dismissed the banner
            const hasDismissedPwaBanner = localStorage.getItem('mocap_plus_pwa_dismissed') === 'true';

            window.addEventListener('beforeinstallprompt', (e) => {
                // Prevent the mini-infobar from appearing on mobile
                e.preventDefault();
                // Stash the event so it can be triggered later.
                deferredPrompt = e;
                // Update UI notify the user they can install the PWA, only if not dismissed
                if (pwaInstallBanner && !hasDismissedPwaBanner) {
                    pwaInstallBanner.classList.remove('hidden');
                }
            });

            if (pwaDismissBtn) {
                pwaDismissBtn.addEventListener('click', () => {
                    if (pwaInstallBanner) {
                        pwaInstallBanner.classList.add('hidden');
                    }
                    // Save dismissal state
                    localStorage.setItem('mocap_plus_pwa_dismissed', 'true');
                });
            }

            if (pwaInstallBtn) {
                pwaInstallBtn.addEventListener('click', async () => {
                    if (!deferredPrompt) return;
                    // Show the install prompt
                    deferredPrompt.prompt();
                    // Wait for the user to respond to the prompt
                    const { outcome } = await deferredPrompt.userChoice;
                    console.log(`User response to the install prompt: ${outcome}`);
                    // We've used the prompt, and can't use it again, throw it away
                    deferredPrompt = null;
                    // Hide the banner
                    if (pwaInstallBanner) {
                        pwaInstallBanner.classList.add('hidden');
                    }
                });
            }

            // Optional: Hide banner if app is already installed
            window.addEventListener('appinstalled', (evt) => {
                console.log('INSTALL: Success');
                if (pwaInstallBanner) {
                    pwaInstallBanner.classList.add('hidden');
                }
                deferredPrompt = null;
            });

        });
