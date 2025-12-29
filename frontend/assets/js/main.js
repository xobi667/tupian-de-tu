/**
 * Global Configuration & Utilities
 */

const API_BASE = 'http://localhost:8001';

// Tab Switching
function switchTab(mode) {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

    if (mode === 'single') {
        document.querySelector('[data-tab="single"]').classList.add('active');
        document.getElementById('single-tab').classList.add('active');
    } else {
        document.querySelector('[data-tab="batch"]').classList.add('active');
        document.getElementById('batch-tab').classList.add('active');
    }
}

// Global Logger
function log(type, msg) {
    const term = document.getElementById('terminal');
    if (!term) return;

    const d = document.createElement('div');
    d.className = `terminal-line log-${type}`;
    d.innerHTML = `<span style="opacity:0.5">[${new Date().toLocaleTimeString()}]</span> ${msg}`;
    term.appendChild(d);
    term.scrollTop = term.scrollHeight;
}

// Loading Spinner
function showLoading(txt = '处理中...') {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'flex';
        const txtEl = document.getElementById('loading-text');
        if (txtEl) txtEl.textContent = txt;
    }
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.style.display = 'none';
}

/**
 * 通用上传区域设置
 * @param {string} areaId - 容器元素 ID
 * @param {string} inputId - 隐藏文件输入框 ID
 * @param {function} callback - 文件选择后的回调函数(file, dataUrl)
 */
function setupUploadArea(areaId, inputId, callback) {
    const area = document.getElementById(areaId);
    const input = document.getElementById(inputId);

    if (!area || !input) return;

    // 标记是否已上传
    let hasUploaded = false;

    // === 使用捕获阶段拦截所有点击 ===
    area.addEventListener('click', (e) => {
        // 如果已上传，阻止所有点击（除了重新上传按钮）
        if (hasUploaded) {
            // 检查是否点击的是重新上传按钮
            if (e.target.classList.contains('reupload-btn')) {
                e.stopPropagation();
                hasUploaded = false;
                input.click();
                return;
            }
            // 其他点击全部阻止
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // 如果按住 Ctrl 键，不触发文件选择（用于标签功能）
        if (e.ctrlKey) {
            e.preventDefault();
            e.stopPropagation();
            return;
        }

        // 未上传且无 Ctrl：触发文件选择
        input.click();
    }, true);  // true = 捕获阶段

    // 文件输入变化
    input.onchange = (e) => handleFile(e.target.files[0]);

    // 拖拽悬停（未上传时才显示效果）
    area.ondragover = (e) => {
        e.preventDefault();
        if (!hasUploaded) {
            area.style.borderColor = 'var(--accent-color)';
            area.style.background = 'rgba(10, 132, 255, 0.1)';
        }
    };

    // 拖拽离开
    area.ondragleave = () => {
        area.style.borderColor = '';
        area.style.background = '';
    };

    // 拖拽放下（未上传时才处理）
    area.ondrop = (e) => {
        e.preventDefault();
        area.style.borderColor = '';
        area.style.background = '';
        if (hasUploaded) return;

        const file = e.dataTransfer.files[0];
        if (file) {
            input.files = e.dataTransfer.files;
            handleFile(file);
        }
    };

    /**
     * 处理选中的文件
     */
    function handleFile(file) {
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (ev) => {
            if (file.type.startsWith('image/')) {
                // 显示图片预览 + 重新上传按钮
                area.innerHTML = `
                    <img src="${ev.target.result}" style="max-width:100%; max-height:100%; border-radius:8px; pointer-events:none;">
                    <button class="reupload-btn">🔄 重新上传</button>
                `;
                hasUploaded = true;
                area.classList.add('has-image');
                area.style.cursor = 'default';
            } else {
                // 非图片文件
                area.innerHTML = `
                    <div class="placeholder-content">
                        <div class="icon-large">📄</div>
                        <div>${file.name}</div>
                        <button class="reupload-btn">🔄 重新选择</button>
                    </div>`;
                hasUploaded = true;
                area.classList.add('has-image');
            }

            callback(file, ev.target.result);
        }
        reader.readAsDataURL(file);
    }
}
