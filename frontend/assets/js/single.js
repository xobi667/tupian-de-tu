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

async function startSingleGen(options = {}) {
    console.log('[Xobi] startSingleGen called', { ref: singleRefFile, prod: singleProdFile, options });

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
    // 优先使用传入的自定义提示词（来自 AI 解析），否则使用输入框的
    let txtVal = options.custom_prompt || document.getElementById('custom-text').value;

    // --- 文字层二次物理锁死 (参数锁) ---
    // 除非用户明确输入“文字：”等指令，否则绝对清空 Typography, 禁止 AI 自动生成背景词文字
    if (txtVal && !/(?:文字|文案|写上|显示|：)/.test(txtVal)) {
        console.log('[SECURE] 检测到无显式文字需求，已物理清空 Typography 以防污染');
        txtVal = "";
    }

    formData.append('product_name', nameVal || '产品');
    if (txtVal) formData.append('custom_text', txtVal);

    // 添加画质和比例参数
    let q = options.quality;
    let r = options.aspect_ratio;

    // 如果 AI 没给，从 UI 拿
    if (!q || !r) {
        if (typeof getSelectedParams === 'function') {
            const params = getSelectedParams();
            q = q || params.quality;
            r = r || params.ratio;
        }
    }

    formData.append('quality', q || '1K');
    formData.append('aspect_ratio', r || '1:1');

    try {
        // 增加 300s 超时控制（图片生成需要较长时间）
        const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('生成请求超时 (300s)，请检查 API 状态或稍后重试')), 300000)
        );

        const apiPromise = Api.post('/api/replace/single', formData, true);
        const data = await Promise.race([apiPromise, timeoutPromise]);

        if (data.success && data.image_data) {
            singleResultData = data.image_data;
            const resArea = document.getElementById('single-result');
            resArea.innerHTML = `<img src="data:image/png;base64,${data.image_data}" style="border-radius:12px; max-height:100%;">`;
            resArea.classList.add('has-image');

            // 显示下载按钮
            const dlBtn = document.getElementById('single-dl-btn');
            if (dlBtn) dlBtn.style.display = 'inline-flex';

            log('success', '✅ 单图生成成功');

            // === 保存到历史记录 ===
            const savePayload = options || {};
            const promptUsed = savePayload.custom_prompt || txtVal || '';
            if (typeof saveChatSession === 'function' && promptUsed) {
                saveChatSession(data.image_data, promptUsed, {
                    productName: document.getElementById('prod-name')?.value || '??????',
                    quality: getSelectedParams().quality,
                    aspect_ratio: getSelectedParams().ratio
                });
            } else {
            log('error', '生成返回异常');
            if (typeof addChatMessage === 'function') {
                addChatMessage('system', '❌ 生成失败：' + (data.error || '不明原因'));
            }
        }
    } catch (e) {
        log('error', `生成出错: ${e.message}`);
        // 聊天反馈：失败
        if (typeof addChatMessage === 'function') {
            addChatMessage('system', '❌ 生成超时或出错：' + (e.message || '网络错误'));
        }
        alert('生成超时或出错：' + e.message);
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
