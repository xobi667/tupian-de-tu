/**
 * Single Image Mode Logic
 */

let singleRefFile = null;
let singleProdFile = null;
let singleResultData = null;

function initSingleMode() {
    // 设置参考图上传区域
    setupUploadArea('ref-upload', 'ref-input', (file) => {
        singleRefFile = file;
        log('success', `参考图已就绪`);
        // 更新标签系统状态（如果标签模块已加载）
        if (typeof updateElementStatus === 'function') {
            updateElementStatus('ref-image', true);
        }
    });

    // 设置产品图上传区域
    setupUploadArea('prod-upload', 'prod-input', (file) => {
        singleProdFile = file;
        log('success', `产品图已就绪`);
        // 更新标签系统状态（如果标签模块已加载）
        if (typeof updateElementStatus === 'function') {
            updateElementStatus('prod-image', true);
        }
    });
}

async function startSingleGen() {
    console.log('[Xobi] startSingleGen called', { ref: singleRefFile, prod: singleProdFile });

    if (!singleRefFile || !singleProdFile) {
        // 在聊天框也显示提示
        if (typeof addChatMessage === 'function') {
            addChatMessage('system', '⚠️ 请先上传参考图和产品图');
        }
        alert('请先上传参考图和产品图');
        return;
    }

    showLoading('正在进行 AI 视觉分析与生成...');
    const btn = document.getElementById('single-start-btn');
    btn.disabled = true;

    const formData = new FormData();
    formData.append('reference_image', singleRefFile);
    formData.append('product_image', singleProdFile);

    const nameVal = document.getElementById('prod-name').value;
    const txtVal = document.getElementById('custom-text').value;

    formData.append('product_name', nameVal || '产品');
    if (txtVal) formData.append('custom_text', txtVal);

    // 添加画质和比例参数
    if (typeof getSelectedParams === 'function') {
        const params = getSelectedParams();
        formData.append('quality', params.quality);
        formData.append('aspect_ratio', params.ratio);
    }

    try {
        const data = await Api.post('/api/replace/single', formData, true);

        if (data.success && data.image_data) {
            singleResultData = data.image_data;
            const resArea = document.getElementById('single-result');
            resArea.innerHTML = `<img src="data:image/png;base64,${data.image_data}" style="border-radius:12px; max-height:100%;">`;
            resArea.classList.add('has-image');

            // 显示下载按钮
            const dlBtn = document.getElementById('single-dl-btn');
            dlBtn.style.display = 'inline-flex';

            log('success', '✅ 单图生成成功');

            // === 聊天反馈：生成完成 ===
            if (typeof addChatMessage === 'function') {
                addChatMessage('ai', '✅ 生成完毕！图片已显示在右侧，可点击下载按钮保存。');
            }
        } else {
            log('error', '生成返回异常');
            if (typeof addChatMessage === 'function') {
                addChatMessage('system', '❌ 生成失败，请重试');
            }
        }
    } catch (e) {
        // 聊天反馈：失败
        if (typeof addChatMessage === 'function') {
            addChatMessage('system', '❌ 生成出错：' + (e.message || '网络错误'));
        }
    } finally {
        hideLoading();
        btn.disabled = false;
    }
}

function downloadSingle() {
    if (!singleResultData) return;
    const a = document.createElement('a');
    a.href = `data:image/png;base64,${singleResultData}`;
    a.download = `xobi_single_${Date.now()}.png`;
    a.click();
}
