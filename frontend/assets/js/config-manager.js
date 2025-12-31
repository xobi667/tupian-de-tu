/**
 * Config Manager - 云雾 API 配置管理
 * 负责 localStorage 的配置持久化和读写
 */

const CONFIG_KEY = 'xobi_api_config';

const DEFAULT_CONFIG = {
    yunwu_base_url: 'https://yunwu.ai',
    yunwu_api_key: '',
    gemini_flash_model: 'gemini-3-flash-preview',
    gemini_image_model: 'gemini-3-pro-image-preview'
};

const ConfigManager = {
    /**
     * 获取配置（合并默认值和存储值）
     */
    getConfig() {
        try {
            const stored = localStorage.getItem(CONFIG_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                return { ...DEFAULT_CONFIG, ...parsed };
            }
        } catch (e) {
            console.warn('[Config] Failed to load config:', e);
        }
        return { ...DEFAULT_CONFIG };
    },

    /**
     * 保存配置到 localStorage
     */
    saveConfig(config) {
        try {
            config.last_updated = new Date().toISOString();
            localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
            console.log('[Config] Configuration saved successfully');
            return true;
        } catch (e) {
            console.error('[Config] Failed to save config:', e);
            return false;
        }
    },

    /**
     * 清除配置
     */
    clearConfig() {
        try {
            localStorage.removeItem(CONFIG_KEY);
            console.log('[Config] Configuration cleared');
            return true;
        } catch (e) {
            console.error('[Config] Failed to clear config:', e);
            return false;
        }
    },

    /**
     * 检查配置是否完整（API key 是否已填写）
     */
    isConfigured() {
        const config = this.getConfig();
        return !!(config.yunwu_api_key && config.yunwu_api_key.trim().length > 0);
    },

    /**
     * 验证 API key 格式
     */
    validateApiKey(key) {
        if (!key || key.trim().length === 0) {
            return '请输入 API Key';
        }

        // 云雾 API key 通常以 yw- 或 sk- 开头
        if (!key.startsWith('yw-') && !key.startsWith('sk-')) {
            return '格式提示：云雾 API Key 通常以 yw- 或 sk- 开头';
        }

        if (key.length < 20) {
            return 'API Key 长度似乎不足，请检查';
        }

        return null; // 验证通过
    },

    /**
     * 获取配置摘要（用于 UI 显示）
     */
    getConfigSummary() {
        const config = this.getConfig();
        return {
            configured: this.isConfigured(),
            base_url: config.yunwu_base_url,
            flash_model: config.gemini_flash_model,
            image_model: config.gemini_image_model,
            api_key_preview: config.yunwu_api_key
                ? `${config.yunwu_api_key.substring(0, 8)}...`
                : '未配置'
        };
    }
};

// 暴露到全局作用域（供 settings.html 和其他页面使用）
window.ConfigManager = ConfigManager;
