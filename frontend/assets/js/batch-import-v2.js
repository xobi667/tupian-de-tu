// Excel批量处理 V2 - 表格化界面
// ========================================

// 全局状态
const state = {
    fileId: null,
    fileName: '',
    columns: [],
    parseMapping: null,
    products: [],
    filteredProducts: [],
    selectedProducts: new Set(),
    currentPage: 1,
    pageSize: 20,
    apiKey: (() => {
        const legacy = localStorage.getItem('api_key') || '';
        if (legacy) return legacy;
        try {
            return (window.ConfigManager ? (ConfigManager.getConfig().yunwu_api_key || '') : '');
        } catch {
            return '';
        }
    })(),
    // 批量处理配置
    selectedPlatform: 'shein',
    selectedRatio: '1:1',
    // 批量处理控制
    batchProcessing: false,
    batchPaused: false,
    currentBatchIndex: 0,
    currentJobId: null
};

const STORAGE_KEYS = {
    session: 'xobi_excel_import_session_v2',
    currentProduct: 'current_product',
    pendingImageUpdate: 'xobi_excel_pending_image_update'
};

function safeJsonParse(value, fallback = null) {
    if (!value) return fallback;
    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function buildPersistedSession() {
    const searchInput = document.getElementById('searchInput');
    const statusFilter = document.getElementById('statusFilter');
    return {
        version: 1,
        savedAt: Date.now(),
        fileId: state.fileId,
        fileName: state.fileName,
        columns: Array.isArray(state.columns) ? state.columns : [],
        parseMapping: state.parseMapping || null,
        currentPage: state.currentPage,
        pageSize: state.pageSize,
        selectedPlatform: state.selectedPlatform,
        selectedRatio: state.selectedRatio,
        searchTerm: searchInput ? searchInput.value : '',
        statusFilter: statusFilter ? statusFilter.value : '',
        products: (state.products || []).map((p) => ({
            skuid: p.skuid || '',
            title: p.title || '',
            main_image: p.main_image || '',
            images: Array.isArray(p.images) ? p.images : [],
            price: p.price ?? '',
            category: p.category || '',
            _row_index: p._row_index ?? null,
            status: p.status || 'pending',
            new_title: p.new_title || '',
            new_image: p.new_image || '',
            selected: !!p.selected
        }))
    };
}

function persistSession() {
    try {
        const session = buildPersistedSession();
        if (!session.fileId) return;
        localStorage.setItem(STORAGE_KEYS.session, JSON.stringify(session));
    } catch (error) {
        console.warn('[ExcelImport] persistSession failed:', error);
    }
}

function restoreSessionIfAvailable() {
    const session = safeJsonParse(localStorage.getItem(STORAGE_KEYS.session));
    if (!session || session.version !== 1 || !session.fileId) return false;

    state.fileId = session.fileId;
    state.fileName = session.fileName || '';
    state.columns = Array.isArray(session.columns) ? session.columns : [];
    state.parseMapping = session.parseMapping || null;
    state.pageSize = Number(session.pageSize) || 20;
    state.currentPage = Number(session.currentPage) || 1;
    {
        const allowedPlatforms = new Set(['shein', 'amazon', 'tiktok', 'generic']);
        state.selectedPlatform = allowedPlatforms.has(session.selectedPlatform) ? session.selectedPlatform : 'shein';
    }
    state.selectedRatio = session.selectedRatio || '1:1';

    state.products = (session.products || []).map((p) => ({
        skuid: p.skuid || '',
        title: p.title || '',
        main_image: p.main_image || '',
        images: Array.isArray(p.images) ? p.images : [],
        price: p.price ?? '',
        category: p.category || '',
        _row_index: p._row_index ?? null,
        status: p.status || 'pending',
        new_title: p.new_title || '',
        new_image: p.new_image || '',
        selected: !!p.selected
    }));

    state.selectedProducts.clear();
    state.products.forEach((p) => {
        if (p.selected) state.selectedProducts.add(p);
    });

    // 还原筛选条件
    const searchTerm = (session.searchTerm || '').toLowerCase();
    const statusFilter = session.statusFilter || '';
    state.filteredProducts = state.products.filter((p) => {
        const matchSearch = !searchTerm ||
            (p.title || '').toLowerCase().includes(searchTerm) ||
            (p.skuid || '').toLowerCase().includes(searchTerm) ||
            (p.new_title || '').toLowerCase().includes(searchTerm);
        const matchStatus = !statusFilter || p.status === statusFilter;
        return matchSearch && matchStatus;
    });

    showTableSection();

    // 还原 UI 控件
    const searchInput = document.getElementById('searchInput');
    const statusFilterEl = document.getElementById('statusFilter');
    const pageSizeSelect = document.getElementById('pageSizeSelect');
    if (searchInput) searchInput.value = session.searchTerm || '';
    if (statusFilterEl) statusFilterEl.value = statusFilter;
    if (pageSizeSelect) pageSizeSelect.value = String(state.pageSize);

    const totalPages = Math.max(1, Math.ceil(state.filteredProducts.length / state.pageSize));
    state.currentPage = Math.min(state.currentPage, totalPages);

    renderTable();
    updateStatistics();
    showToast('已恢复上次导入的会话', 'info');
    return true;
}

function applyPendingImageUpdate() {
    const pending = safeJsonParse(localStorage.getItem(STORAGE_KEYS.pendingImageUpdate));
    if (!pending || !pending.new_image) return false;

    const rowIndex = pending._row_index ?? null;
    const skuid = pending.skuid || '';
    const newImage = pending.new_image;

    const target = state.products.find((p) => {
        if (rowIndex !== null && rowIndex !== undefined) return p._row_index === rowIndex;
        if (skuid) return p.skuid === skuid;
        return false;
    });

    if (!target) {
        localStorage.removeItem(STORAGE_KEYS.pendingImageUpdate);
        return false;
    }

    target.new_image = newImage;
    if (target.status !== 'processing') target.status = 'completed';

    localStorage.removeItem(STORAGE_KEYS.pendingImageUpdate);
    persistSession();

    // 重新渲染（保持当前筛选/分页）
    const searchTerm = (document.getElementById('searchInput')?.value || '').toLowerCase();
    const statusFilter = document.getElementById('statusFilter')?.value || '';

    state.filteredProducts = state.products.filter(p => {
        const matchSearch = !searchTerm ||
            p.title.toLowerCase().includes(searchTerm) ||
            (p.skuid && p.skuid.toLowerCase().includes(searchTerm)) ||
            (p.new_title && p.new_title.toLowerCase().includes(searchTerm));

        const matchStatus = !statusFilter || p.status === statusFilter;

        return matchSearch && matchStatus;
    });

    const totalPages = Math.max(1, Math.ceil(state.filteredProducts.length / state.pageSize));
    state.currentPage = Math.min(state.currentPage, totalPages);
    renderTable();
    showToast('主图已回填到列表', 'success');
    return true;
}

// ========================================
// 初始化
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', handleFileSelect);

    // 拖拽上传
    setupDragAndDrop();

    // 从本地恢复会话（用于“编辑图”往返）
    const restored = restoreSessionIfAvailable();
    if (restored) {
        applyPendingImageUpdate();
    }
});

function setupDragAndDrop() {
    const uploadArea = document.getElementById('uploadArea');

    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = '#3b82f6';
    });

    uploadArea.addEventListener('dragleave', (e) => {
        e.currentTarget.style.borderColor = '#d1d5db';
    });

    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        e.currentTarget.style.borderColor = '#d1d5db';
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    });
}

// ========================================
// 文件上传
// ========================================

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        uploadFile(file);
    }
}

async function uploadFile(file) {
    document.getElementById('uploadProgress').classList.remove('hidden');
    document.getElementById('progressFill').style.width = '0%';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/excel/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            state.fileId = result.file_id;
            state.fileName = result.filename;
            state.columns = result.columns;

            document.getElementById('progressFill').style.width = '100%';
            document.getElementById('progressText').textContent = '上传成功！';

            document.getElementById('fileName').textContent = result.filename;
            document.getElementById('fileStats').textContent =
                `共 ${result.total_rows} 行，${result.columns.length} 列`;
            document.getElementById('fileInfo').classList.remove('hidden');

            setTimeout(() => {
                document.getElementById('uploadProgress').classList.add('hidden');
                autoParseExcel(result.columns);
            }, 500);

            showToast('文件上传成功！', 'success');
        } else {
            throw new Error(result.detail || '上传失败');
        }
    } catch (error) {
        console.error('上传失败:', error);
        showToast('上传失败: ' + error.message, 'error');
        document.getElementById('uploadProgress').classList.add('hidden');
    }
}

// 自动解析Excel（智能映射字段）
async function autoParseExcel(columns) {
    const mapping = {
        skuid_column: null,
        title_column: null,
        image_column: null,
        price_column: null
    };

    // 智能识别列名（Excel智能处理风格：SKUID/标题/图片/价格）
    (columns || []).forEach((col) => {
        if (!col) return;
        const text = String(col);
        if (!mapping.skuid_column && /skuid|sku|商品id|产品id/i.test(text)) {
            mapping.skuid_column = text;
        }
        if (!mapping.title_column && /title|标题|名称|产品名/i.test(text)) {
            mapping.title_column = text;
        }
        if (!mapping.image_column && /image|图片|img|照片/i.test(text)) {
            mapping.image_column = text;
        }
        if (!mapping.price_column && /price|价格|售价|折扣价/i.test(text)) {
            mapping.price_column = text;
        }
    });

    // Fallbacks（保持 Excel智能处理 行为）
    if (!mapping.title_column) mapping.title_column = (columns || [])[1] || (columns || [])[0] || null;
    if (!mapping.image_column) {
        mapping.image_column = (columns || []).find((c) => String(c).includes('图') || String(c).toLowerCase().includes('image')) || null;
    }

    state.parseMapping = mapping;

    try {
        const response = await fetch('/api/excel/parse', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_id: state.fileId,
                mapping: mapping
            })
        });

        const result = await response.json();

        if (result.success) {
            state.products = (result.data || []).map((p) => ({
                ...p,
                status: 'pending',
                new_title: '',
                new_image: '',
                selected: false
            }));
            state.filteredProducts = state.products;

            showTableSection();
            renderTable();
            updateStatistics();

            showToast(`成功导入 ${result.total} 个商品`, 'success');
            persistSession();
        } else {
            throw new Error(result.detail || '解析失败');
        }
    } catch (error) {
        console.error('解析失败:', error);
        showToast('解析失败: ' + error.message, 'error');
    }
}

function clearFile() {
    state.fileId = null;
    state.fileName = '';
    state.columns = [];
    state.parseMapping = null;
    state.products = [];
    state.selectedProducts.clear();
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('fileInput').value = '';
    localStorage.removeItem(STORAGE_KEYS.session);
}

function showUploadSection() {
    document.getElementById('uploadSection').classList.remove('hidden');
    document.getElementById('tableSection').classList.add('hidden');
    document.getElementById('stepIndicator').textContent = 'Step 1: 上传Excel';
}

function showTableSection() {
    document.getElementById('uploadSection').classList.add('hidden');
    document.getElementById('tableSection').classList.remove('hidden');
    document.getElementById('stepIndicator').textContent = 'Step 2: 编辑处理';
    document.getElementById('currentFileName').textContent = state.fileName;
}

// ========================================
// 表格渲染
// ========================================

function renderTable() {
    const tbody = document.getElementById('tableBody');
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    const pageProducts = state.filteredProducts.slice(start, end);

    tbody.innerHTML = '';

    pageProducts.forEach((product, idx) => {
        const globalIdx = start + idx;
        const row = createTableRow(product, globalIdx);
        tbody.appendChild(row);
    });

    renderPagination();
    updateStatistics();
}

function createTableRow(product, index) {
    const tr = document.createElement('tr');
    tr.className = product.selected ? 'selected' : '';
    tr.dataset.index = index;

    const displayImageUrl = product.new_image || product.main_image || '';
    const imageSrc = resolveImageSrc(displayImageUrl);

    const statusClass = `status-${product.status}`;
    const statusText = {
        'pending': '⏸️ 待处理',
        'processing': '⏳ 处理中',
        'completed': '✅ 已完成',
        'failed': '❌ 失败'
    }[product.status] || '⏸️ 待处理';

    tr.innerHTML = `
        <td>
            <input type="checkbox" ${product.selected ? 'checked' : ''}
                   onchange="toggleProductSelection(${index})">
        </td>
        <td title="${product.skuid || ''}">${truncate(product.skuid || '-', 15)}</td>
        <td>
            <img src="${imageSrc}"
                 class="thumbnail"
                 onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22><rect fill=%22%23ccc%22 width=%2260%22 height=%2260%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%23999%22 font-size=%2210%22>无图</text></svg>'"
                 onclick="previewImageByIndex(${index})">
        </td>
        <td title="${product.title}">${truncate(product.title, 40)}</td>
        <td>
            ${product.new_title ?
                `<span class="text-blue-600 font-medium" title="${product.new_title}">${truncate(product.new_title, 40)}</span>` :
                '<span class="text-gray-400">-</span>'
            }
        </td>
        <td>${product.price ? '¥' + product.price : '-'}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
        <td>
            <div class="flex space-x-1">
                <button onclick="editSingleTitle(${index})"
                        class="px-2 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded">
                    改写
                </button>
                <button onclick="editSingleImage(${index})"
                        class="px-2 py-1 text-xs bg-purple-100 hover:bg-purple-200 text-purple-700 rounded">
                    编辑图
                </button>
            </div>
        </td>
    `;

    return tr;
}

function truncate(str, maxLen) {
    if (!str) return '';
    return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

function normalizeImageUrl(url) {
    if (!url) return '';
    const str = String(url).trim();
    if (!str) return '';
    return str.includes(',') ? str.split(',')[0].trim() : str;
}

function isLocalOutputUrl(url) {
    return url.startsWith('/outputs/') || url.startsWith('outputs/');
}

function resolveImageSrc(url) {
    const normalized = normalizeImageUrl(url);
    if (!normalized) return '';
    if (isLocalOutputUrl(normalized) || normalized.startsWith('data:')) return normalized;
    return `/api/proxy-image?url=${encodeURIComponent(normalized)}`;
}

function previewImage(url) {
    const normalized = normalizeImageUrl(url);
    if (!normalized) return;
    const openUrl = (isLocalOutputUrl(normalized) || normalized.startsWith('data:'))
        ? normalized
        : `/api/proxy-image?url=${encodeURIComponent(normalized)}`;
    window.open(openUrl, '_blank');
}

function previewImageByIndex(index) {
    const product = state.filteredProducts[index];
    if (!product) return;
    const url = product.new_image || product.main_image || '';
    previewImage(url);
}

// ========================================
// 选择控制
// ========================================

function toggleProductSelection(index) {
    const product = state.filteredProducts[index];
    product.selected = !product.selected;

    if (product.selected) {
        state.selectedProducts.add(product);
    } else {
        state.selectedProducts.delete(product);
    }

    renderTable();
}

function toggleSelectAll() {
    const checkbox = document.getElementById('selectAllCheckbox');
    const checked = checkbox.checked;

    state.filteredProducts.forEach(p => {
        p.selected = checked;
        if (checked) {
            state.selectedProducts.add(p);
        } else {
            state.selectedProducts.delete(p);
        }
    });

    renderTable();
}

function selectAll() {
    state.filteredProducts.forEach(p => {
        p.selected = true;
        state.selectedProducts.add(p);
    });
    document.getElementById('selectAllCheckbox').checked = true;
    renderTable();
}

function selectNone() {
    state.filteredProducts.forEach(p => {
        p.selected = false;
        state.selectedProducts.delete(p);
    });
    document.getElementById('selectAllCheckbox').checked = false;
    renderTable();
}

// ========================================
// 筛选和搜索
// ========================================

function filterTable() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;

    state.filteredProducts = state.products.filter(p => {
        const matchSearch = !searchTerm ||
            p.title.toLowerCase().includes(searchTerm) ||
            (p.skuid && p.skuid.toLowerCase().includes(searchTerm)) ||
            (p.new_title && p.new_title.toLowerCase().includes(searchTerm));

        const matchStatus = !statusFilter || p.status === statusFilter;

        return matchSearch && matchStatus;
    });

    state.currentPage = 1;
    renderTable();
}

// ========================================
// 分页
// ========================================

function renderPagination() {
    const total = state.filteredProducts.length;
    const totalPages = Math.ceil(total / state.pageSize);
    const start = (state.currentPage - 1) * state.pageSize + 1;
    const end = Math.min(state.currentPage * state.pageSize, total);

    document.getElementById('pageStart').textContent = total > 0 ? start : 0;
    document.getElementById('pageEnd').textContent = end;
    document.getElementById('pageTotal').textContent = total;

    const controls = document.getElementById('paginationControls');
    controls.innerHTML = '';

    if (totalPages <= 1) return;

    // 上一页
    controls.appendChild(createPageButton('上一页', state.currentPage - 1, state.currentPage === 1));

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
            controls.appendChild(createPageButton(i, i, false, i === state.currentPage));
        } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
            controls.appendChild(createPageButton('...', null, true));
        }
    }

    // 下一页
    controls.appendChild(createPageButton('下一页', state.currentPage + 1, state.currentPage === totalPages));
}

function createPageButton(text, page, disabled, active = false) {
    const button = document.createElement('button');
    button.textContent = text;
    button.className = `px-3 py-1 rounded border text-sm ${
        active ? 'bg-blue-600 text-white border-blue-600' :
        disabled ? 'bg-gray-100 text-gray-400 border-gray-200' :
        'bg-white hover:bg-gray-50 border-gray-300'
    }`;
    button.disabled = disabled;

    if (!disabled && page !== null) {
        button.onclick = () => changePage(page);
    }

    return button;
}

function changePage(page) {
    const totalPages = Math.ceil(state.filteredProducts.length / state.pageSize);
    if (page < 1 || page > totalPages) return;
    state.currentPage = page;
    renderTable();
    window.scrollTo(0, 0);
}

function changePageSize() {
    state.pageSize = parseInt(document.getElementById('pageSizeSelect').value);
    state.currentPage = 1;
    renderTable();
}

// ========================================
// 统计信息
// ========================================

function updateStatistics() {
    document.getElementById('totalCount').textContent = state.products.length;
    document.getElementById('selectedCount').textContent = state.selectedProducts.size;
    document.getElementById('processedCount').textContent =
        state.products.filter(p => p.status === 'completed').length;
}

// ========================================
// 批量标题改写
// ========================================

function showBatchTitleModal() {
    const selectedCount = state.selectedProducts.size;
    if (selectedCount === 0) {
        showToast('请先选择要处理的商品', 'error');
        return;
    }

    document.getElementById('batchTitleCount').textContent = selectedCount;
    document.getElementById('batchTitleModal').classList.add('active');
}

function closeBatchTitleModal() {
    document.getElementById('batchTitleModal').classList.remove('active');
}

async function startBatchTitleRewrite() {
    const language = document.getElementById('batchLanguage').value;
    const style = document.getElementById('batchStyle').value;
    const maxLength = parseInt(document.getElementById('batchMaxLength').value);
    const requirements = (document.getElementById('batchTitleRequirements')?.value || '').trim();

    closeBatchTitleModal();
    showProgressModal();

    const selectedArray = Array.from(state.selectedProducts);
    state.currentBatchIndex = 0;
    state.batchProcessing = true;
    state.batchPaused = false;

    for (let i = 0; i < selectedArray.length; i++) {
        if (!state.batchProcessing) break;

        while (state.batchPaused) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        const product = selectedArray[i];
        state.currentBatchIndex = i;

        updateProgressBar(i, selectedArray.length);
        updateProgressList(i, product, 'processing');

        try {
            const response = await fetch('/api/title/rewrite', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': state.apiKey
                },
                body: JSON.stringify({
                    original_title: product.title,
                    language,
                    style,
                    requirements,
                    max_length: maxLength
                })
            });

            const result = await response.json();

            if (result.success) {
                product.new_title = result.new_title;
                product.status = 'completed';
                updateProgressList(i, product, 'completed');
            } else {
                product.status = 'failed';
                updateProgressList(i, product, 'failed', result.detail);
            }
        } catch (error) {
            product.status = 'failed';
            updateProgressList(i, product, 'failed', error.message);
        }

        renderTable();
    }

    updateProgressBar(selectedArray.length, selectedArray.length);
    state.batchProcessing = false;
    showToast('批量改写完成！', 'success');

    setTimeout(() => {
        closeProgressModal();
    }, 2000);
}

// ========================================
// 批量主图修改
// ========================================

function showBatchImageModal() {
    const selectedCount = state.selectedProducts.size;
    if (selectedCount === 0) {
        showToast('请先选择要处理的商品', 'error');
        return;
    }

    document.getElementById('batchImageCount').textContent = selectedCount;
    document.getElementById('batchImageModal').classList.add('active');

    // 默认选中 SHEIN
    selectPlatform(state.selectedPlatform || 'shein');
    selectRatio(state.selectedRatio || '1:1');
}

function closeBatchImageModal() {
    document.getElementById('batchImageModal').classList.remove('active');
}

function selectPlatform(platform) {
    state.selectedPlatform = platform;

    // 更新按钮状态
    document.querySelectorAll('.platform-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.platform === platform) {
            btn.classList.add('active');
        }
    });
}

function selectRatio(ratio) {
    state.selectedRatio = ratio;

    // 更新按钮状态
    document.querySelectorAll('.ratio-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.dataset.ratio === ratio) {
            btn.classList.add('active');
        }
    });
}

async function startBatchImageGeneration() {
    const selectedCount = state.selectedProducts.size;
    if (selectedCount === 0) {
        showToast('请先选择要处理的商品', 'error');
        return;
    }

    const stylePreset = state.selectedPlatform || 'shein';
    const aspectRatio = state.selectedRatio || '1:1';
    const targetLanguage = (document.getElementById('batchImageLanguage')?.value || 'same').trim() || 'same';
    const requirements = (document.getElementById('batchImageRequirements')?.value || '').trim();
    const options = {
        replace_background: !!document.getElementById('optReplaceBackground')?.checked,
        change_angle: !!document.getElementById('optChangeAngle')?.checked,
        change_lighting: !!document.getElementById('optChangeLighting')?.checked,
        add_scene_props: !!document.getElementById('optAddProps')?.checked,
    };

    closeBatchImageModal();
    showProgressModal();

    const selectedArray = Array.from(state.selectedProducts);
    state.currentBatchIndex = 0;
    state.batchProcessing = true;
    state.batchPaused = false;
    state.currentJobId = null;

    // 构造风格仿写 items（后端接口：/api/style/batch/create-from-items）
    const items = [];
    selectedArray.forEach((product, i) => {
        const productImage = normalizeImageUrl(product.main_image || (product.images && product.images[0]) || '');
        if (!productImage) {
            product.status = 'failed';
            updateProgressList(i, product, 'failed', '缺少图片URL');
            return;
        }

        product.status = 'processing';
        updateProgressList(i, product, 'processing');

        items.push({
            id: product.skuid || String(i + 1),
            title: product.title || `item_${i + 1}`,
            subtitle: product.subtitle || '',
            image_url: productImage,
            _row_index: product._row_index ?? null
        });
    });

    if (items.length === 0) {
        state.batchProcessing = false;
        showToast('没有可处理的有效数据', 'error');
        return;
    }

    try {
        // 使用 Api 包装器（自动注入云雾配置头）
        const createResult = await Api.post('/api/style/batch/create-from-items', {
            items,
            style_preset: stylePreset,
            options,
            requirements,
            target_language: targetLanguage,
            aspect_ratio: aspectRatio,
            auto_start: true
        });

        if (!createResult || !createResult.job_id) {
            throw new Error('任务创建失败：未返回 job_id');
        }

        state.currentJobId = createResult.job_id;
        showToast(`已开始批量处理：${state.currentJobId}`, 'success');

        const total = selectedArray.length;

        const pollOnce = async () => {
            if (!state.batchProcessing || !state.currentJobId) return { done: true };
            if (state.batchPaused) return { done: false };

            const job = await Api.get(`/api/style/batch/${state.currentJobId}`);
            const jobItems = Array.isArray(job?.items) ? job.items : [];

            const byKey = new Map();
            jobItems.forEach((it, idx) => {
                const key = (it?._row_index !== undefined && it?._row_index !== null)
                    ? String(it._row_index)
                    : String(it?.id ?? idx);
                byKey.set(key, it);
            });

            selectedArray.forEach((product, idx) => {
                const key = (product._row_index !== undefined && product._row_index !== null)
                    ? String(product._row_index)
                    : String(product.skuid || idx);
                const it = byKey.get(key);
                if (!it) {
                    updateProgressList(idx, product, product.status || 'pending', product._error || null);
                    return;
                }

                const status = it.status === 'success'
                    ? 'completed'
                    : it.status === 'failed'
                        ? 'failed'
                        : it.status === 'processing'
                            ? 'processing'
                            : 'pending';

                product.status = status;
                if (status === 'completed' && it.output_url) {
                    product.new_image = it.output_url;
                }

                if (status === 'failed') {
                    product._error = it.error || '处理失败';
                }

                updateProgressList(idx, product, status, it.error || null);
            });

            const processed = selectedArray.filter(p => p.status === 'completed' || p.status === 'failed').length;
            updateProgressBar(processed, total);
            renderTable();
            updateStatistics();

            if (job?.status === 'completed' || processed >= total) {
                return { done: true };
            }
            return { done: false };
        };

        // 立即拉一次，然后轮询
        await pollOnce();
        while (state.batchProcessing) {
            if (state.batchPaused) {
                await new Promise(resolve => setTimeout(resolve, 200));
                continue;
            }
            const { done } = await pollOnce();
            if (done) break;
            await new Promise(resolve => setTimeout(resolve, 1500));
        }

        state.batchProcessing = false;
        showToast('批量处理完成！', 'success');
        persistSession();
        setTimeout(() => closeProgressModal(), 800);
    } catch (error) {
        console.error('批量处理失败:', error);
        state.batchProcessing = false;
        const message = error?.message || String(error);
        selectedArray.forEach((product) => {
            if (product?.status === 'processing') {
                product.status = 'failed';
                product._error = message;
            }
        });
        renderTable();
        updateStatistics();
        showToast('批量处理失败: ' + message, 'error');
    }
}

// ========================================
// 单个编辑
// ========================================

function editSingleTitle(index) {
    const product = state.filteredProducts[index];

    const newTitle = prompt('请输入新标题：', product.new_title || product.title);
    if (newTitle !== null && newTitle.trim()) {
        product.new_title = newTitle.trim();
        product.status = 'completed';
        renderTable();
        showToast('标题已更新', 'success');
    }
}

function editSingleImage(index) {
    const product = state.filteredProducts[index];
    const url = product?.new_image || product?.main_image || '';
    if (!url) {
        showToast('没有可预览的图片', 'error');
        return;
    }
    previewImage(url);
}

// ========================================
// 进度控制
// ========================================

function showProgressModal() {
    document.getElementById('progressModal').classList.add('active');
    document.getElementById('progressList').innerHTML = '';
}

function closeProgressModal() {
    document.getElementById('progressModal').classList.remove('active');
}

function updateProgressBar(current, total) {
    const percent = Math.round((current / total) * 100);
    document.getElementById('batchProgressFill').style.width = percent + '%';
    document.getElementById('batchProgressText').textContent = `${percent}% (${current}/${total})`;
}

function updateProgressList(index, product, status, error = null) {
    const list = document.getElementById('progressList');
    let item = list.querySelector(`[data-index="${index}"]`);

    if (!item) {
        item = document.createElement('div');
        item.dataset.index = index;
        item.className = 'p-2 bg-gray-50 rounded text-sm';
        list.appendChild(item);
    }

    const statusIcon = {
        'processing': '⏳',
        'completed': '✅',
        'failed': '❌'
    }[status] || '⏸️';

    item.innerHTML = `
        <span>${statusIcon} ${truncate(product.title, 30)}</span>
        ${error ? `<span class="text-red-600 text-xs ml-2">${error}</span>` : ''}
    `;

    // 自动滚动到最新
    item.scrollIntoView({ behavior: 'smooth', block: 'end' });
}

function pauseBatchProcess() {
    state.batchPaused = true;
    document.getElementById('pauseBtn').classList.add('hidden');
    document.getElementById('resumeBtn').classList.remove('hidden');
}

function resumeBatchProcess() {
    state.batchPaused = false;
    document.getElementById('pauseBtn').classList.remove('hidden');
    document.getElementById('resumeBtn').classList.add('hidden');
}

function cancelBatchProcess() {
    state.batchProcessing = false;
    state.batchPaused = false;
    closeProgressModal();
    showToast('批量处理已取消', 'info');
}

// ========================================
// 其他操作
// ========================================

function clearNewTitles() {
    if (!confirm('确定要清除所有新标题吗？')) return;

    state.products.forEach(p => {
        p.new_title = '';
        if (p.status === 'completed') p.status = 'pending';
    });

    renderTable();
    showToast('新标题已清除', 'success');
}

async function exportExcel() {
    try {
        const response = await fetch('/api/excel/export', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                file_id: state.fileId,
                data: state.products,
                format: 'csv',
                overwrite: {
                    title_column: state.parseMapping?.title_column || null,
                    image_column: state.parseMapping?.image_column || null
                }
            })
        });

        const result = await response.json();

        if (result.success) {
            window.location.href = result.download_url;
            showToast('导出成功！', 'success');
        } else {
            throw new Error(result.detail || '导出失败');
        }
    } catch (error) {
        console.error('导出失败:', error);
        showToast('导出失败: ' + error.message, 'error');
    }
}

// ========================================
// 工具函数
// ========================================

function showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    const toastMessage = document.getElementById('toastMessage');

    toastMessage.textContent = message;
    toast.classList.remove('hidden');

    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg z-50 ${
        type === 'success' ? 'bg-green-600' :
        type === 'error' ? 'bg-red-600' :
        type === 'info' ? 'bg-blue-600' :
        'bg-gray-900'
    } text-white`;

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
