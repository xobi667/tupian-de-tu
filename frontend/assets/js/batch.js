/**
 * Batch Mode Logic & Chat Integration
 */

let currentBatchId = null;
let batchPollTimer = null;

function initBatchMode() {
    // Excel 上传区域设置
    setupUploadArea('excel-upload', 'excel-input', async (file) => {
        log('info', '正在解析表格...');
        showLoading('AI 正在分析表格结构...');

        const formData = new FormData();
        formData.append('file', file);

        try {
            const data = await Api.post('/api/replace/batch/upload', formData, true);

            if (data.job_id) {
                currentBatchId = data.job_id;

                // 更新 UI 显示工作区
                document.getElementById('batch-upload-card').style.display = 'none';
                document.getElementById('batch-workspace').style.display = 'flex'; // Use flex for new layout
                document.getElementById('batch-count').textContent = data.total;

                // 渲染表格数据
                renderBatchTable(data.preview);

                log('success', `表格解析成功: 识别到 ${data.total} 个任务`);

                // 启用聊天功能
                enableBatchChat();

                // AI 欢迎消息
                addChatMessage('ai', `收到表格文件：${file.name}。\n我识别到了 ${data.total} 条数据。您可以检查一下表格内容，或者直接告诉我想要怎么修改生成需求（例如："把背景都改成白色简约风"）。`);

            }
        } catch (e) {
            // 错误已在 Api 处理
        } finally {
            hideLoading();
        }
    });
}

/**
 * 启用批量模式的聊天功能
 * 在上传 Excel 成功后调用
 */
function enableBatchChat() {
    const chatInput = document.getElementById('chat-input');
    const chatSendBtn = document.getElementById('chat-send-btn');
    const chatHint = document.getElementById('chat-hint');

    if (chatInput) chatInput.disabled = false;
    if (chatSendBtn) chatSendBtn.disabled = false;
    if (chatHint) chatHint.style.display = 'none';
}

function renderBatchTable(items) {
    const tbody = document.getElementById('batch-tbody');
    tbody.innerHTML = '';

    items.forEach(item => {
        const tr = document.createElement('tr');

        // Status Styling
        let badgeClass = 'status-pending';
        let statusText = item.status || 'Pending';
        if (statusText === 'success') badgeClass = 'status-success';
        if (statusText === 'failed') badgeClass = 'status-error';

        // Requirement Text
        const prompt = item.requirements || item.custom_text || '(智能自动)';

        tr.innerHTML = `
            <td>#${item.id}</td>
            <td style="font-weight:500;">${item.product_name || '-'}</td>
            <td title="${item.reference_image}" style="color:var(--text-secondary)">...${item.reference_image ? item.reference_image.slice(-10) : ''}</td>
            <td title="${item.product_image}" style="color:var(--text-secondary)">...${item.product_image ? item.product_image.slice(-10) : ''}</td>
            <td style="max-width:200px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${prompt}</td>
            <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
        `;
        tbody.appendChild(tr);
    });
}

async function startBatchJob(options = {}) {
    if (!currentBatchId) return;

    try {
        // 如果有全局提示词，先刷新一下表格展示
        if (options.global_prompt) {
            const jobData = await Api.get(`/api/replace/batch/${currentBatchId}`);
            if (jobData && jobData.items) {
                renderBatchTable(jobData.items);
            }
        }

        const data = await Api.post(`/api/replace/batch/start/${currentBatchId}`, {});
        if (data.status === 'started') {
            log('info', '批量任务已启动...');
            document.getElementById('batch-start-btn').disabled = true;
            document.getElementById('batch-start-btn').innerHTML = '⏳ 处理中...';

            addChatMessage('system', '任务已开始，正在后台处理中...');

            // Start Polling
            if (batchPollTimer) clearInterval(batchPollTimer);
            batchPollTimer = setInterval(pollStatus, 2000);
        }
    } catch (e) {
        addChatMessage('system', `启动失败: ${e.message}`);
    }
}

async function pollStatus() {
    if (!currentBatchId) return;
    try {
        const job = await Api.get(`/api/replace/batch/${currentBatchId}`);
        renderBatchTable(job.items);

        // Update stats or progress if needed

        if (job.status === 'completed' || job.status === 'failed') {
            clearInterval(batchPollTimer);
            log('success', `批量任务结束。成功: ${job.success_count}, 失败: ${job.failed_count}`);
            document.getElementById('batch-start-btn').disabled = false;
            document.getElementById('batch-start-btn').innerHTML = '🚀 再次开始';
            addChatMessage('ai', `任务处理完成！共成功处理 ${job.success_count} 张图片。结果已保存在 outputs 目录。`);
        }
    } catch (e) {
        console.error('Poll error', e);
    }
}
