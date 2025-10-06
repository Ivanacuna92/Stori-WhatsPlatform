const config = require('../config/config');
const logger = require('./logger');
const humanModeManager = require('./humanModeManager');
const database = require('./database');

class SessionManager {
    constructor() {
        this.localCache = new Map(); // Cache local para rendimiento
    }

    async getSession(userId, chatId = null) {
        // Verificar cache local primero
        if (this.localCache.has(userId)) {
            const session = this.localCache.get(userId);
            if (chatId) session.chatId = chatId;
            session.lastActivity = Date.now();
            return session;
        }

        try {
            // Buscar en base de datos
            const dbSession = await database.findOne('user_sessions', 'user_id = ?', [userId]);
            
            if (dbSession) {
                const session = {
                    messages: JSON.parse(dbSession.messages || '[]'),
                    lastActivity: Date.now(),
                    chatId: chatId,
                    mode: 'ai'
                };
                this.localCache.set(userId, session);
                
                // Actualizar última actividad en BD
                await database.update('user_sessions', 
                    { last_activity: new Date() }, 
                    'user_id = ?', 
                    [userId]
                );
                
                return session;
            } else {
                // Crear nueva sesión
                const session = {
                    messages: [],
                    lastActivity: Date.now(),
                    chatId: chatId,
                    mode: 'ai'
                };
                
                await database.insert('user_sessions', {
                    user_id: userId,
                    messages: '[]',
                    last_activity: new Date()
                });
                
                this.localCache.set(userId, session);
                return session;
            }
        } catch (error) {
            console.error('Error obteniendo sesión de BD:', error);
            // Fallback a cache local si hay error de BD
            const session = {
                messages: [],
                lastActivity: Date.now(),
                chatId: chatId,
                mode: 'ai'
            };
            this.localCache.set(userId, session);
            return session;
        }
    }

    async addMessage(userId, role, content, chatId = null) {
        const session = await this.getSession(userId, chatId);
        session.messages.push({ role, content, timestamp: new Date().toISOString() });
        session.lastActivity = Date.now();
        
        // Actualizar en cache local
        this.localCache.set(userId, session);
        
        // Actualizar en base de datos
        try {
            await database.update('user_sessions',
                {
                    messages: JSON.stringify(session.messages),
                    last_activity: new Date()
                },
                'user_id = ?',
                [userId]
            );
        } catch (error) {
            console.error('Error actualizando mensajes en BD:', error);
        }
    }

    async getMessages(userId, chatId = null) {
        const session = await this.getSession(userId, chatId);
        return session.messages.slice(-config.maxMessages);
    }

    async clearSession(userId) {
        // Limpiar cache local
        if (this.localCache.has(userId)) {
            this.localCache.get(userId).messages = [];
        }
        
        // Limpiar en base de datos
        try {
            await database.update('user_sessions',
                {
                    messages: '[]',
                    last_activity: new Date()
                },
                'user_id = ?',
                [userId]
            );
        } catch (error) {
            console.error('Error limpiando sesión en BD:', error);
        }
    }
    
    async updateSessionMode(userId, chatId, mode) {
        const session = await this.getSession(userId, chatId);
        session.mode = mode;
        session.lastActivity = Date.now();
        this.localCache.set(userId, session);
    }
    
    async getSessionMode(userId) {
        if (this.localCache.has(userId)) {
            return this.localCache.get(userId).mode || 'ai';
        }
        
        try {
            const dbSession = await database.findOne('user_sessions', 'user_id = ?', [userId]);
            if (dbSession) {
                return 'ai'; // Por defecto AI si existe sesión
            }
        } catch (error) {
            console.error('Error obteniendo modo de sesión:', error);
        }
        
        return 'ai';
    }

    async checkInactiveSessions(sock) {
        const now = Date.now();
        const followUpService = require('./followUpService');

        // Verificar sesiones en cache local
        for (const [userId, session] of this.localCache.entries()) {
            // Si está en modo humano o soporte, NO limpiar la sesión por inactividad
            const isHuman = await humanModeManager.isHumanMode(userId);
            const isSupport = await humanModeManager.isSupportMode(userId);

            if (isHuman || isSupport) {
                continue;
            }

            // Si hay seguimiento activo, NO enviar mensaje de 5 minutos
            if (followUpService.hasActiveFollowUp(userId)) {
                continue;
            }

            if (now - session.lastActivity > config.sessionTimeout && session.messages.length > 0) {
                // A los 5 minutos, iniciar seguimiento en lugar de finalizar sesión
                if (!followUpService.hasActiveFollowUp(userId)) {
                    await followUpService.startFollowUp(userId, session.chatId);
                    // No limpiar la sesión, el seguimiento la mantendrá
                    continue;
                }

                // Si ya hay seguimiento activo, no hacer nada (dejar que el seguimiento maneje)
            }
        }

        // Limpiar sesiones antiguas de la BD (más de 24 horas)
        try {
            await database.query(
                'DELETE FROM user_sessions WHERE last_activity < DATE_SUB(NOW(), INTERVAL 24 HOUR)'
            );
        } catch (error) {
            console.error('Error limpiando sesiones antiguas de BD:', error);
        }
    }

    startCleanupTimer(sock) {
        setInterval(() => {
            this.checkInactiveSessions(sock);
        }, config.checkInterval);
    }
    
    // Método para sincronizar cache con BD periódicamente
    async syncCacheWithDB() {
        for (const [userId, session] of this.localCache.entries()) {
            try {
                await database.update('user_sessions',
                    {
                        messages: JSON.stringify(session.messages),
                        last_activity: new Date(session.lastActivity)
                    },
                    'user_id = ?',
                    [userId]
                );
            } catch (error) {
                console.error(`Error sincronizando sesión ${userId}:`, error);
            }
        }
    }
    
    // Iniciar sincronización periódica
    startSyncTimer() {
        setInterval(() => {
            this.syncCacheWithDB();
        }, 30000); // Sincronizar cada 30 segundos
    }
}

module.exports = new SessionManager();