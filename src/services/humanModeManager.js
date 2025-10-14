const database = require('./database');

class HumanModeManager {
    constructor() {
        this.localCache = new Map(); // Cache local para rendimiento
        this.initializeCache();
    }

    async initializeCache() {
        try {
            // Cargar todos los estados desde la BD al iniciar
            const states = await database.findAll('human_mode_states');
            states.forEach(state => {
                // Usar la columna 'mode' si existe, sino usar is_human_mode
                let mode = false;
                if (state.mode) {
                    mode = state.mode === 'ai' ? false : state.mode;
                } else if (state.is_human_mode) {
                    mode = 'human';
                }
                
                this.localCache.set(state.contact_id, {
                    mode: mode,
                    activatedAt: state.activated_at,
                    activatedBy: state.activated_by
                });
            });
            console.log(`✅ Cargados ${states.length} estados de modo humano desde BD`);
        } catch (error) {
            console.error('Error inicializando cache de modos humanos:', error);
        }
    }

    async setHumanMode(phone, isHumanMode, activatedBy = 'system') {
        const mode = isHumanMode ? 'human' : false;
        await this.setMode(phone, mode, activatedBy);
    }
    
    async setMode(phone, mode, activatedBy = 'system') {
        // mode puede ser: false (IA), 'human', o 'support'
        // Si mode es false o 'ai', convertir a false
        const normalizedMode = (mode === 'ai' || mode === false) ? false : mode;
        const isHumanMode = (normalizedMode === 'human' || normalizedMode === 'support');

        console.log(`🔄 setMode llamado: phone=${phone}, mode=${mode}, normalizedMode=${normalizedMode}, isHumanMode=${isHumanMode}`);

        // Actualizar cache local
        this.localCache.set(phone, {
            mode: normalizedMode,
            activatedAt: isHumanMode ? new Date() : null,
            activatedBy: isHumanMode ? activatedBy : null
        });

        // Actualizar en base de datos
        try {
            // Primero verificar si la columna 'mode' existe
            await this.ensureModeColumn();

            const existingState = await database.findOne('human_mode_states', 'contact_id = ?', [phone]);

            if (existingState) {
                await database.update('human_mode_states',
                    {
                        is_human_mode: isHumanMode,
                        mode: normalizedMode || 'ai',
                        activated_at: isHumanMode ? new Date() : null,
                        activated_by: isHumanMode ? activatedBy : null,
                        updated_at: new Date()
                    },
                    'contact_id = ?',
                    [phone]
                );
            } else {
                await database.insert('human_mode_states', {
                    contact_id: phone,
                    is_human_mode: isHumanMode,
                    mode: normalizedMode || 'ai',
                    activated_at: isHumanMode ? new Date() : null,
                    activated_by: isHumanMode ? activatedBy : null
                });
            }

            const modeText = normalizedMode === 'support' ? 'SOPORTE' : normalizedMode === 'human' ? 'HUMANO' : 'IA';
            console.log(`✅ Modo ${modeText} establecido exitosamente para ${phone} en BD y cache`);
        } catch (error) {
            console.error('❌ Error actualizando modo en BD:', error);
        }
    }

    async ensureModeColumn() {
        try {
            // Intentar agregar la columna 'mode' si no existe
            await database.query(`
                ALTER TABLE human_mode_states 
                ADD COLUMN IF NOT EXISTS mode VARCHAR(20) DEFAULT 'ai'
            `);
            
            // Agregar índice si no existe
            await database.query(`
                ALTER TABLE human_mode_states 
                ADD INDEX IF NOT EXISTS idx_mode (mode)
            `);
        } catch (error) {
            // Ignorar errores si la columna ya existe
            if (!error.message.includes('Duplicate column name')) {
                console.error('Error agregando columna mode:', error);
            }
        }
    }

    async isHumanMode(phone) {
        // Verificar cache local primero
        if (this.localCache.has(phone)) {
            const state = this.localCache.get(phone);
            const isHuman = state.mode === 'human' || state.mode === true;
            console.log(`🔍 isHumanMode(${phone}): cache=${JSON.stringify(state)}, result=${isHuman}`);
            return isHuman;
        }

        // Si no está en cache, buscar en BD
        try {
            const dbState = await database.findOne('human_mode_states', 'contact_id = ?', [phone]);
            if (dbState) {
                const isHuman = dbState.is_human_mode && dbState.is_human_mode !== 'support';
                this.localCache.set(phone, {
                    mode: isHuman ? 'human' : false,
                    activatedAt: dbState.activated_at,
                    activatedBy: dbState.activated_by
                });
                console.log(`🔍 isHumanMode(${phone}): from DB, result=${isHuman}`);
                return isHuman;
            }
        } catch (error) {
            console.error('Error verificando modo humano:', error);
        }

        console.log(`🔍 isHumanMode(${phone}): no cache/DB, result=false`);
        return false;
    }
    
    async isSupportMode(phone) {
        // Por ahora, soporte se maneja como un tipo especial de modo humano
        // Podrías agregar un campo adicional en la BD para distinguirlo
        if (this.localCache.has(phone)) {
            const state = this.localCache.get(phone);
            const isSupport = state.mode === 'support';
            console.log(`🔍 isSupportMode(${phone}): cache=${JSON.stringify(state)}, result=${isSupport}`);
            return isSupport;
        }
        console.log(`🔍 isSupportMode(${phone}): no cache, result=false`);
        return false;
    }
    
    async getMode(phone) {
        if (this.localCache.has(phone)) {
            return this.localCache.get(phone).mode || false;
        }
        
        try {
            const dbState = await database.findOne('human_mode_states', 'contact_id = ?', [phone]);
            if (dbState) {
                // Usar la columna 'mode' si existe
                let mode = false;
                if (dbState.mode && dbState.mode !== 'ai') {
                    mode = dbState.mode;
                } else if (dbState.is_human_mode) {
                    mode = 'human';
                }
                
                this.localCache.set(phone, {
                    mode: mode,
                    activatedAt: dbState.activated_at,
                    activatedBy: dbState.activated_by
                });
                return mode;
            }
        } catch (error) {
            console.error('Error obteniendo modo:', error);
        }
        
        return false;
    }

    async getAllHumanStates() {
        try {
            // Primero obtener estados de la BD
            const states = await database.findAll('human_mode_states');
            const result = {};
            
            states.forEach(state => {
                // Usar la columna 'mode' si existe
                if (state.mode && state.mode !== 'ai') {
                    result[state.contact_id] = state.mode;
                } else if (state.is_human_mode) {
                    result[state.contact_id] = 'human';
                } else {
                    result[state.contact_id] = false;
                }
            });
            
            // Luego sobrescribir con cache local (que tiene los valores más actuales)
            this.localCache.forEach((value, key) => {
                if (value.mode !== undefined) {
                    result[key] = value.mode;
                }
            });
            
            return result;
        } catch (error) {
            console.error('Error obteniendo todos los estados:', error);
            // Retornar cache local como fallback
            const result = {};
            this.localCache.forEach((value, key) => {
                result[key] = value.mode;
            });
            return result;
        }
    }

    async removeContact(phone) {
        // Eliminar de cache local
        this.localCache.delete(phone);
        
        // Eliminar de base de datos
        try {
            await database.delete('human_mode_states', 'contact_id = ?', [phone]);
            console.log(`Contacto ${phone} eliminado de estados de modo humano`);
        } catch (error) {
            console.error('Error eliminando contacto de BD:', error);
        }
    }

    async getHumanModeContacts() {
        try {
            const states = await database.findAll('human_mode_states', 'is_human_mode = 1');
            return states.map(state => state.contact_id);
        } catch (error) {
            console.error('Error obteniendo contactos en modo humano:', error);
            // Fallback a cache local
            const contacts = [];
            this.localCache.forEach((value, key) => {
                if (value.mode === 'human' || value.mode === true) {
                    contacts.push(key);
                }
            });
            return contacts;
        }
    }
    
    async getSupportModeContacts() {
        // Por ahora retorna array vacío, podrías implementar lógica específica
        const contacts = [];
        this.localCache.forEach((value, key) => {
            if (value.mode === 'support') {
                contacts.push(key);
            }
        });
        return contacts;
    }

    async getAIModeContacts() {
        try {
            const states = await database.findAll('human_mode_states', 'is_human_mode = 0');
            return states.map(state => state.contact_id);
        } catch (error) {
            console.error('Error obteniendo contactos en modo IA:', error);
            // Fallback a cache local
            const contacts = [];
            this.localCache.forEach((value, key) => {
                if (!value.mode) {
                    contacts.push(key);
                }
            });
            return contacts;
        }
    }
    
    // Método para sincronizar cache con BD periódicamente
    async syncCacheWithDB() {
        try {
            const states = await database.findAll('human_mode_states');
            states.forEach(state => {
                // Usar la columna 'mode' si existe, sino usar is_human_mode
                let mode = false;
                if (state.mode) {
                    mode = state.mode === 'ai' ? false : state.mode;
                } else if (state.is_human_mode) {
                    mode = 'human';
                }
                
                this.localCache.set(state.contact_id, {
                    mode: mode,
                    activatedAt: state.activated_at,
                    activatedBy: state.activated_by
                });
            });
        } catch (error) {
            console.error('Error sincronizando cache de modos humanos:', error);
        }
    }
    
    // Iniciar sincronización periódica
    startSyncTimer() {
        setInterval(() => {
            this.syncCacheWithDB();
        }, 60000); // Sincronizar cada minuto
    }
}

module.exports = new HumanModeManager();