const database = require('./database');

class SystemConfigService {
    constructor() {
        this.cache = new Map();
        this.initializeCache();
    }

    async initializeCache() {
        try {
            const configs = await database.findAll('system_config');
            configs.forEach(config => {
                this.cache.set(config.config_key, config.config_value);
            });
            console.log(`✅ Cargadas ${configs.length} configuraciones del sistema`);
        } catch (error) {
            console.error('Error inicializando cache de configuración:', error);
        }
    }

    async getConfig(key, defaultValue = null) {
        // Intentar desde cache primero
        if (this.cache.has(key)) {
            return this.cache.get(key);
        }

        // Si no está en cache, buscar en BD
        try {
            const config = await database.findOne('system_config', 'config_key = ?', [key]);
            if (config) {
                this.cache.set(key, config.config_value);
                return config.config_value;
            }
        } catch (error) {
            console.error(`Error obteniendo configuración ${key}:`, error);
        }

        return defaultValue;
    }

    async setConfig(key, value, description = null) {
        try {
            const existing = await database.findOne('system_config', 'config_key = ?', [key]);

            if (existing) {
                await database.update(
                    'system_config',
                    {
                        config_value: value,
                        updated_at: new Date()
                    },
                    'config_key = ?',
                    [key]
                );
            } else {
                await database.insert('system_config', {
                    config_key: key,
                    config_value: value,
                    description: description
                });
            }

            // Actualizar cache
            this.cache.set(key, value);
            console.log(`✅ Configuración ${key} actualizada a: ${value}`);
            return true;
        } catch (error) {
            console.error(`Error actualizando configuración ${key}:`, error);
            return false;
        }
    }

    async getAllConfigs() {
        try {
            const configs = await database.findAll('system_config');
            const result = {};
            configs.forEach(config => {
                result[config.config_key] = {
                    value: config.config_value,
                    description: config.description
                };
            });
            return result;
        } catch (error) {
            console.error('Error obteniendo todas las configuraciones:', error);
            return {};
        }
    }

    // Métodos de conveniencia para configuraciones específicas
    async isGroupsAIEnabled() {
        const value = await this.getConfig('groups_ai_enabled', 'false');
        return value === 'true' || value === true;
    }

    async setGroupsAIEnabled(enabled) {
        return await this.setConfig('groups_ai_enabled', enabled ? 'true' : 'false');
    }

    async isIndividualAIEnabled() {
        const value = await this.getConfig('individual_ai_enabled', 'false');
        return value === 'true' || value === true;
    }

    async setIndividualAIEnabled(enabled) {
        return await this.setConfig('individual_ai_enabled', enabled ? 'true' : 'false');
    }

    // Sincronizar cache con BD
    async syncCache() {
        try {
            const configs = await database.findAll('system_config');
            this.cache.clear();
            configs.forEach(config => {
                this.cache.set(config.config_key, config.config_value);
            });
        } catch (error) {
            console.error('Error sincronizando cache de configuración:', error);
        }
    }
}

module.exports = new SystemConfigService();
