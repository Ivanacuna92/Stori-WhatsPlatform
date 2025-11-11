const database = require('./database');

class ArchiveService {
    /**
     * Archivar una conversación
     * @param {string} userId - Teléfono del contacto
     * @param {number} archivedBy - ID del usuario que archiva (opcional)
     * @returns {Promise<boolean>}
     */
    async archiveConversation(userId, archivedBy = null) {
        if (!userId) {
            throw new Error('userId es requerido');
        }

        try {
            // Verificar si ya está archivada
            const existing = await this.isArchived(userId);
            if (existing) {
                console.log(`Conversación ${userId} ya está archivada`);
                return true;
            }

            // Archivar
            await database.insert('archived_conversations', {
                user_id: userId,
                archived_by: archivedBy,
                archived_at: new Date()
            });

            console.log(`✅ Conversación archivada: ${userId}`);
            return true;
        } catch (error) {
            console.error('Error archivando conversación:', error);
            throw error;
        }
    }

    /**
     * Desarchivar una conversación
     * @param {string} userId - Teléfono del contacto
     * @returns {Promise<boolean>}
     */
    async unarchiveConversation(userId) {
        if (!userId) {
            throw new Error('userId es requerido');
        }

        try {
            await database.delete('archived_conversations', 'user_id = ?', [userId]);
            console.log(`✅ Conversación desarchivada: ${userId}`);
            return true;
        } catch (error) {
            console.error('Error desarchivando conversación:', error);
            throw error;
        }
    }

    /**
     * Verificar si una conversación está archivada
     * @param {string} userId - Teléfono del contacto
     * @returns {Promise<boolean>}
     */
    async isArchived(userId) {
        if (!userId) {
            return false;
        }

        try {
            const result = await database.findOne('archived_conversations', 'user_id = ?', [userId]);
            return result !== null;
        } catch (error) {
            console.error('Error verificando si está archivada:', error);
            return false;
        }
    }

    /**
     * Obtener todas las conversaciones archivadas
     * @returns {Promise<Array>}
     */
    async getArchivedConversations() {
        try {
            const archived = await database.query(
                'SELECT user_id, archived_at, archived_by FROM archived_conversations ORDER BY archived_at DESC'
            );
            return archived.map(row => ({
                userId: row.user_id,
                archivedAt: row.archived_at,
                archivedBy: row.archived_by
            }));
        } catch (error) {
            console.error('Error obteniendo conversaciones archivadas:', error);
            return [];
        }
    }

    /**
     * Obtener IDs de conversaciones archivadas (para filtrar)
     * @returns {Promise<Set>}
     */
    async getArchivedUserIds() {
        try {
            const archived = await database.query('SELECT user_id FROM archived_conversations');
            return new Set(archived.map(row => row.user_id));
        } catch (error) {
            console.error('Error obteniendo IDs archivados:', error);
            return new Set();
        }
    }

    /**
     * Obtener conversaciones con estado de archivado
     * @param {Array} conversations - Array de conversaciones
     * @returns {Promise<Array>} - Conversaciones con campo isArchived
     */
    async enrichWithArchiveStatus(conversations) {
        try {
            const archivedIds = await this.getArchivedUserIds();

            return conversations.map(conv => ({
                ...conv,
                isArchived: archivedIds.has(conv.phone || conv.userId)
            }));
        } catch (error) {
            console.error('Error enriqueciendo con estado de archivado:', error);
            return conversations.map(conv => ({ ...conv, isArchived: false }));
        }
    }

    /**
     * Alternar estado de archivado
     * @param {string} userId - Teléfono del contacto
     * @param {number} archivedBy - ID del usuario (opcional)
     * @returns {Promise<Object>}
     */
    async toggleArchive(userId, archivedBy = null) {
        const isCurrentlyArchived = await this.isArchived(userId);

        if (isCurrentlyArchived) {
            await this.unarchiveConversation(userId);
            return { archived: false, message: 'Conversación desarchivada' };
        } else {
            await this.archiveConversation(userId, archivedBy);
            return { archived: true, message: 'Conversación archivada' };
        }
    }
}

module.exports = new ArchiveService();
