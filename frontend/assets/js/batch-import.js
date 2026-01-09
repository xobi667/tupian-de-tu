// Excel批量导入 - 前端逻辑
// ========================================

// 全局状态
const state = {
    fileId: null,
    columns: [],
    products: [],
    filteredProducts: [],
    currentPage: 1,
    pageSize: 12,
    currentEditIndex: null,
    apiKey: (() => {
        const legacy = localStorage.getItem('api_key') || '';
        if (legacy) return legacy;
        try {
            return (window.ConfigManager ? (ConfigManager.getConfig().yunwu_api_key || '') : '');
        } catch {
            return '';
        }
    })()
};

// ========================================
// 初始化
// ========================================

document.addEventListener('DOMContentLoaded', () => {
    // 文件上传
    const fileInput = document.getElementById('fileInput');
    fileInput.addEventListener('change', handleFileSelect);

    // 拖拽上传
    const uploadArea = document.getElementById('uploadArea');
    uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        uploadArea.classList.add('border-blue-500', 'bg-blue-50');
    });
    uploadArea.addEventListener('dragleave', () => {
        uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
    });
    uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        uploadArea.classList.remove('border-blue-500', 'bg-blue-50');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadFile(files[0]);
        }
    });
});

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
    // 显示上传进度
    document.getElementById('uploadProgress').classList.remove('hidden');
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressText').textContent = '上传中...';

    const formData = new FormData();
    formData.append('file', file);

    try {
        const response = await fetch('/api/excel/upload', {
            method: 'POST',
            body: formData
        });

        const result = await response.json();

        if (result.success) {
            // 保存文件信息
            state.fileId = result.file_id;
            state.columns = result.columns;

            // 更新进度
            document.getElementById('progressBar').style.width = '100%';
            document.getElementById('progressText').textContent = '上传成功！';

            // 显示文件信息
            document.getElementById('fileName').textContent = result.filename;
            document.getElementById('fileStats').textContent =
                `共 ${result.total_rows} 行，${result.columns.length} 列`;
            document.getElementById('fileInfo').classList.remove('hidden');

            // 填充列名下拉框
            populateColumnSelects(result.columns);

            // 显示Step 2
            document.getElementById('step2').classList.remove('hidden');

            // 隐藏上传进度
            setTimeout(() => {
                document.getElementById('uploadProgress').classList.add('hidden');
            }, 1000);

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

function populateColumnSelects(columns) {
    const selects = ['skuidColumn', 'titleColumn', 'imageColumn', 'priceColumn'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">请选择...</option>';

        columns.forEach(column => {
            const option = document.createElement('option');
            option.value = column;
            option.textContent = column;
            select.appendChild(option);
        });

        // 智能匹配列名
        autoSelectColumn(select, column => {
            if (selectId === 'skuidColumn') {
                return /skuid|sku|商品id|产品id/i.test(column);
            } else if (selectId === 'titleColumn') {
                return /title|标题|名称|产品名/i.test(column);
            } else if (selectId === 'imageColumn') {
                return /image|图片|img|照片/i.test(column);
            } else if (selectId === 'priceColumn') {
                return /price|价格|售价/i.test(column);
            }
            return false;
        });
    });
}

function autoSelectColumn(select, matchFn) {
    const options = Array.from(select.options);
    const match = options.find(opt => matchFn(opt.value));
    if (match) {
        select.value = match.value;
    }
}

function clearFile() {
    state.fileId = null;
    state.columns = [];
    state.products = [];
    document.getElementById('fileInfo').classList.add('hidden');
    document.getElementById('step2').classList.add('hidden');
    document.getElementById('step3').classList.add('hidden');
    document.getElementById('fileInput').value = '';
}

// ========================================
// 解析Excel
// ========================================

async function parseExcel() {
    const mapping = {
        skuid_column: document.getElementById('skuidColumn').value,
        title_column: document.getElementById('titleColumn').value,
        image_column: document.getElementById('imageColumn').value,
        price_column: document.getElementById('priceColumn').value || null
    };

    // 验证必填字段
    if (!mapping.title_column || !mapping.image_column) {
        showToast('请至少选择标题列和图片列', 'error');
        return;
    }

    try {
        const response = await fetch('/api/excel/parse', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_id: state.fileId,
                mapping: mapping
            })
        });

        const result = await response.json();

        if (result.success) {
            state.products = result.data;
            state.filteredProducts = result.data;

            // 初始化商品状态
            state.products.forEach(p => {
                p.status = 'pending';
                p.new_title = '';
                p.new_image = '';
            });

            // 显示商品列表
            document.getElementById('totalCount').textContent = result.total;
            document.getElementById('step3').classList.remove('hidden');

            renderProductGrid();
            showToast(`成功解析 ${result.total} 个商品`, 'success');
        } else {
            throw new Error(result.detail || '解析失败');
        }
    } catch (error) {
        console.error('解析失败:', error);
        showToast('解析失败: ' + error.message, 'error');
    }
}

// ========================================
// 商品列表渲染
// ========================================

function renderProductGrid() {
    const grid = document.getElementById('productGrid');
    const start = (state.currentPage - 1) * state.pageSize;
    const end = start + state.pageSize;
    const pageProducts = state.filteredProducts.slice(start, end);

    grid.innerHTML = '';

    pageProducts.forEach((product, index) => {
        const card = createProductCard(product, start + index);
        grid.appendChild(card);
    });

    renderPagination();
}

function createProductCard(product, index) {
    const card = document.createElement('div');
    card.className = 'border border-gray-200 rounded-lg p-4 hover:shadow-lg transition';

    // 状态徽章
    const statusBadge = product.status === 'completed'
        ? '<span class="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">已完成</span>'
        : '<span class="bg-yellow-100 text-yellow-800 text-xs px-2 py-1 rounded">待处理</span>';

    card.innerHTML = `
        <div class="relative">
            ${statusBadge}
            <!-- 商品图片 -->
            <div class="mt-2 aspect-square bg-gray-100 rounded-md overflow-hidden">
                <img src="/api/proxy-image?url=${encodeURIComponent(product.main_image)}"
                     alt="${product.title}"
                     class="w-full h-full object-cover"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22100%22 height=%22100%22><rect fill=%22%23ccc%22 width=%22100%22 height=%22100%22/><text x=%2250%25%22 y=%2250%25%22 text-anchor=%22middle%22 fill=%22%23999%22>无图片</text></svg>'">
            </div>

            <!-- 商品信息 -->
            <div class="mt-3">
                <p class="text-sm text-gray-600 truncate" title="${product.skuid || ''}">
                    ID: ${product.skuid || '无'}
                </p>
                <p class="mt-1 text-sm font-medium text-gray-900 line-clamp-2" title="${product.title}">
                    ${product.title}
                </p>
                ${product.price ? `<p class="mt-1 text-lg font-bold text-red-600">¥${product.price}</p>` : ''}

                ${product.new_title ? `
                    <div class="mt-2 p-2 bg-blue-50 rounded-md">
                        <p class="text-xs text-blue-600 font-semibold">新标题:</p>
                        <p class="text-sm text-gray-900 line-clamp-2">${product.new_title}</p>
                    </div>
                ` : ''}
            </div>

            <!-- 操作按钮 -->
            <div class="mt-3 flex space-x-2">
                <button onclick="openEditModal(${index})"
                        class="flex-1 bg-blue-600 text-white text-sm px-3 py-1.5 rounded hover:bg-blue-700">
                    改写标题
                </button>
                <button onclick="editImage(${index})"
                        class="flex-1 bg-purple-600 text-white text-sm px-3 py-1.5 rounded hover:bg-purple-700">
                    编辑主图
                </button>
            </div>
        </div>
    `;

    return card;
}

function renderPagination() {
    const pagination = document.getElementById('pagination');
    const totalPages = Math.ceil(state.filteredProducts.length / state.pageSize);

    if (totalPages <= 1) {
        pagination.innerHTML = '';
        return;
    }

    let html = '<div class="flex space-x-2">';

    // 上一页
    html += `
        <button onclick="changePage(${state.currentPage - 1})"
                ${state.currentPage === 1 ? 'disabled' : ''}
                class="px-3 py-1 rounded border ${state.currentPage === 1 ? 'bg-gray-100 text-gray-400' : 'bg-white hover:bg-gray-50'}">
            上一页
        </button>
    `;

    // 页码
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= state.currentPage - 1 && i <= state.currentPage + 1)) {
            html += `
                <button onclick="changePage(${i})"
                        class="px-3 py-1 rounded border ${i === state.currentPage ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50'}">
                    ${i}
                </button>
            `;
        } else if (i === state.currentPage - 2 || i === state.currentPage + 2) {
            html += '<span class="px-2">...</span>';
        }
    }

    // 下一页
    html += `
        <button onclick="changePage(${state.currentPage + 1})"
                ${state.currentPage === totalPages ? 'disabled' : ''}
                class="px-3 py-1 rounded border ${state.currentPage === totalPages ? 'bg-gray-100 text-gray-400' : 'bg-white hover:bg-gray-50'}">
            下一页
        </button>
    `;

    html += '</div>';
    pagination.innerHTML = html;
}

function changePage(page) {
    const totalPages = Math.ceil(state.filteredProducts.length / state.pageSize);
    if (page < 1 || page > totalPages) return;
    state.currentPage = page;
    renderProductGrid();
    window.scrollTo(0, 0);
}

// ========================================
// 筛选和搜索
// ========================================

function filterProducts() {
    const searchTerm = document.getElementById('searchInput').value.toLowerCase();
    const statusFilter = document.getElementById('statusFilter').value;

    state.filteredProducts = state.products.filter(p => {
        const matchSearch = !searchTerm ||
            p.title.toLowerCase().includes(searchTerm) ||
            (p.skuid && p.skuid.toLowerCase().includes(searchTerm));

        const matchStatus = !statusFilter || p.status === statusFilter;

        return matchSearch && matchStatus;
    });

    state.currentPage = 1;
    renderProductGrid();
}

// ========================================
// 标题编辑
// ========================================

function openEditModal(index) {
    const product = state.filteredProducts[index];
    state.currentEditIndex = index;

    document.getElementById('originalTitle').textContent = product.title;
    document.getElementById('newTitle').value = product.new_title || '';
    document.getElementById('titleEditModal').classList.remove('hidden');
}

function closeEditModal() {
    document.getElementById('titleEditModal').classList.add('hidden');
    state.currentEditIndex = null;
}

async function generateNewTitle() {
    const originalTitle = document.getElementById('originalTitle').textContent;
    const language = document.getElementById('targetLanguage').value;
    const style = document.getElementById('titleStyle').value;
    const maxLength = parseInt(document.getElementById('maxLength').value);

    try {
        const response = await fetch('/api/title/rewrite', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': state.apiKey
            },
            body: JSON.stringify({
                original_title: originalTitle,
                language,
                style,
                max_length: maxLength
            })
        });

        const result = await response.json();

        if (result.success) {
            document.getElementById('newTitle').value = result.new_title;
            showToast('标题改写成功！', 'success');
        } else {
            throw new Error(result.detail || '改写失败');
        }
    } catch (error) {
        console.error('改写失败:', error);
        showToast('改写失败: ' + error.message, 'error');
    }
}

function saveNewTitle() {
    const newTitle = document.getElementById('newTitle').value.trim();
    if (!newTitle) {
        showToast('请输入新标题', 'error');
        return;
    }

    const product = state.filteredProducts[state.currentEditIndex];
    product.new_title = newTitle;
    product.status = 'completed';

    closeEditModal();
    renderProductGrid();
    showToast('标题已保存', 'success');
}

// ========================================
// 批量操作
// ========================================

async function batchRewriteTitles() {
    const pendingProducts = state.products.filter(p => !p.new_title);

    if (pendingProducts.length === 0) {
        showToast('所有商品已处理', 'info');
        return;
    }

    if (!confirm(`确定要批量改写 ${pendingProducts.length} 个商品的标题吗？`)) {
        return;
    }

    const language = document.getElementById('targetLanguage').value;
    const style = document.getElementById('titleStyle').value;
    const maxLength = parseInt(document.getElementById('maxLength').value);

    showToast(`开始批量处理 ${pendingProducts.length} 个标题...`, 'info');

    for (let i = 0; i < pendingProducts.length; i++) {
        const product = pendingProducts[i];

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
                    max_length: maxLength
                })
            });

            const result = await response.json();

            if (result.success) {
                product.new_title = result.new_title;
                product.status = 'completed';
            }
        } catch (error) {
            console.error(`商品 ${i+1} 处理失败:`, error);
        }

        // 更新进度
        if ((i + 1) % 10 === 0 || i === pendingProducts.length - 1) {
            renderProductGrid();
        }
    }

    showToast('批量处理完成！', 'success');
    renderProductGrid();
}

function editImage(index) {
    const product = state.filteredProducts[index];

    // 保存当前商品到localStorage
    localStorage.setItem('current_product', JSON.stringify({
        ...product,
        _batch_index: index
    }));

    // 跳转到单图编辑页面
    window.location.href = 'single.html?from=batch';
}

// ========================================
// 导出Excel
// ========================================

async function exportExcel() {
    try {
        const response = await fetch('/api/excel/export', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                file_id: state.fileId,
                data: state.products
            })
        });

        const result = await response.json();

        if (result.success) {
            // 触发下载
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

    // 根据类型设置颜色
    toast.className = `fixed bottom-4 right-4 px-6 py-3 rounded-lg shadow-lg ${
        type === 'success' ? 'bg-green-600' :
        type === 'error' ? 'bg-red-600' :
        type === 'info' ? 'bg-blue-600' :
        'bg-gray-900'
    } text-white`;

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}
