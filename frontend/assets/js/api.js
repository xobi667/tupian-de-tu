/**
 * API Wrapper for Xobi Backend
 */

const Api = {
    // 默认超时 120 秒
    timeout: 120000,

    async post(endpoint, body, isFormData = false) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const options = {
            method: 'POST',
            body: isFormData ? body : JSON.stringify(body),
            signal: controller.signal
        };

        if (!isFormData) {
            options.headers = { 'Content-Type': 'application/json' };
        }

        try {
            const res = await fetch(`${API_BASE}${endpoint}`, options);
            clearTimeout(timeoutId);

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: res.statusText }));
                const errorMsg = err.detail || `API Error ${res.status}`;
                throw new Error(errorMsg);
            }
            return await res.json();
        } catch (e) {
            clearTimeout(timeoutId);
            console.error('API Call Failed:', e);

            // 区分不同类型的错误
            let userMessage = e.message;
            if (e.name === 'AbortError') {
                userMessage = 'AI 响应超时，请稍后重试（云雾 API 可能繁忙）';
            } else if (e.message.includes('Failed to fetch')) {
                userMessage = '网络连接失败，请检查后端服务是否启动';
            }

            log('error', `请求失败: ${userMessage}`);
            // 不使用 alert，改用 log 在终端显示
            throw new Error(userMessage);
        }
    },

    async get(endpoint) {
        try {
            const res = await fetch(`${API_BASE}${endpoint}`);
            if (!res.ok) throw new Error(`API Error ${res.status}`);
            return await res.json();
        } catch (e) {
            log('error', `数据获取失败: ${e.message}`);
            throw e;
        }
    }
};
