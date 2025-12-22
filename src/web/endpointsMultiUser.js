// Endpoints para gestión multi-usuario y multi-instancia
// Este archivo contiene todos los endpoints necesarios para el sistema multi-usuario

const authService = require('../services/authService');
const database = require('../services/database');

module.exports = function(app, requireAuth, requireAdmin) {

    // ===== ENDPOINTS DE GESTIÓN DE USUARIOS (SOLO ADMIN) =====

    // Obtener todos los usuarios
    app.get('/api/users', requireAdmin, async (req, res) => {
        try {
            const users = await authService.getAllUsers(req.user.id);
            res.json({ success: true, users });
        } catch (error) {
            console.error('Error obteniendo usuarios:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Crear nuevo usuario
    app.post('/api/users', requireAdmin, async (req, res) => {
        try {
            const { email, password, name, role } = req.body;

            if (!email || !password || !name) {
                return res.status(400).json({
                    error: 'Email, password y nombre son requeridos'
                });
            }

            const newUser = await authService.createUser(
                email,
                password,
                name,
                role || 'support',
                req.user.id
            );

            // Iniciar instancia de WhatsApp para el nuevo usuario
            const instanceManager = global.whatsappInstanceManager;
            await instanceManager.startInstance(newUser.id, newUser.name);

            res.json({
                success: true,
                user: newUser,
                message: 'Usuario creado exitosamente'
            });
        } catch (error) {
            console.error('Error creando usuario:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Actualizar usuario
    app.put('/api/users/:id', requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;
            const { name, role, active } = req.body;

            const updateData = {};
            if (name !== undefined) updateData.name = name;
            if (role !== undefined) updateData.role = role;
            if (active !== undefined) updateData.active = active;

            await database.update('support_users', updateData, 'id = ?', [id]);

            // Si se desactivó el usuario, detener su instancia
            if (active === false) {
                const instanceManager = global.whatsappInstanceManager;
                await instanceManager.stopInstance(parseInt(id));
            }
            // Si se activó, iniciar su instancia
            else if (active === true) {
                const user = await database.findOne('support_users', 'id = ?', [id]);
                const instanceManager = global.whatsappInstanceManager;
                await instanceManager.startInstance(parseInt(id), user.name);
            }

            res.json({
                success: true,
                message: 'Usuario actualizado exitosamente'
            });
        } catch (error) {
            console.error('Error actualizando usuario:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // Eliminar usuario
    app.delete('/api/users/:id', requireAdmin, async (req, res) => {
        try {
            const { id } = req.params;

            // No permitir eliminar al admin principal
            const user = await database.findOne('support_users', 'id = ?', [id]);
            if (user && user.email === 'admin@whatspanel.com') {
                return res.status(403).json({
                    error: 'No se puede eliminar el usuario admin principal'
                });
            }

            // Detener instancia del usuario
            const instanceManager = global.whatsappInstanceManager;
            await instanceManager.stopInstance(parseInt(id));

            // Eliminar usuario (cascade eliminará sesiones y asignaciones)
            await database.delete('support_users', 'id = ?', [id]);

            res.json({
                success: true,
                message: 'Usuario eliminado exitosamente'
            });
        } catch (error) {
            console.error('Error eliminando usuario:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ===== ENDPOINTS DE GESTIÓN DE INSTANCIAS DE WHATSAPP =====

    // Obtener QR de la instancia del usuario actual
    app.get('/api/my-instance/qr', requireAuth, async (req, res) => {
        try {
            const instanceManager = global.whatsappInstanceManager;
            const instance = instanceManager.getInstance(req.user.id);

            if (!instance) {
                return res.json({
                    qr: null,
                    status: 'not_found',
                    message: 'No hay instancia iniciada para este usuario'
                });
            }

            res.json({
                qr: instance.qr,
                status: instance.status,
                phone: instance.phone,
                message: instance.status === 'connected'
                    ? 'WhatsApp conectado'
                    : instance.qr
                        ? 'Escanea el código QR'
                        : 'Esperando código QR...'
            });
        } catch (error) {
            console.error('Error obteniendo QR:', error);
            res.status(500).json({ error: 'Error obteniendo código QR' });
        }
    });

    // Obtener estado de la instancia del usuario
    app.get('/api/my-instance/status', requireAuth, async (req, res) => {
        try {
            const instanceManager = global.whatsappInstanceManager;
            const instance = instanceManager.getInstance(req.user.id);

            if (!instance) {
                return res.json({
                    status: 'not_found',
                    connected: false
                });
            }

            res.json({
                status: instance.status,
                connected: instance.status === 'connected',
                phone: instance.phone,
                instanceName: instance.instanceName
            });
        } catch (error) {
            console.error('Error obteniendo estado:', error);
            res.status(500).json({ error: 'Error obteniendo estado' });
        }
    });

    // Cerrar sesión de WhatsApp del usuario actual
    app.post('/api/my-instance/logout', requireAuth, async (req, res) => {
        try {
            const instanceManager = global.whatsappInstanceManager;
            const result = await instanceManager.logoutInstance(req.user.id);

            if (result) {
                res.json({
                    success: true,
                    message: 'Sesión cerrada. Nuevo QR disponible en 2 segundos.'
                });
            } else {
                res.status(500).json({
                    success: false,
                    message: 'Error al cerrar sesión'
                });
            }
        } catch (error) {
            console.error('Error en logout:', error);
            res.status(500).json({
                success: false,
                error: 'Error al procesar logout'
            });
        }
    });

    // Obtener todas las instancias (solo admin)
    app.get('/api/instances', requireAdmin, async (req, res) => {
        try {
            const instanceManager = global.whatsappInstanceManager;
            const instances = instanceManager.getInstances();

            // Obtener información adicional de usuarios
            const instancesWithUsers = await Promise.all(
                instances.map(async (inst) => {
                    const user = await database.findOne('support_users', 'id = ?', [inst.userId]);
                    return {
                        ...inst,
                        user: user ? {
                            id: user.id,
                            name: user.name,
                            email: user.email,
                            role: user.role
                        } : null
                    };
                })
            );

            res.json({ success: true, instances: instancesWithUsers });
        } catch (error) {
            console.error('Error obteniendo instancias:', error);
            res.status(500).json({ error: error.message });
        }
    });

    // ===== ENDPOINTS DE CONTACTOS FILTRADOS POR USUARIO =====

    // Rate limit: máximo de conversaciones nuevas por usuario por día
    const DAILY_CONVERSATION_LIMIT = 150;

    // Agregar nuevo contacto (iniciar conversación)
    app.post('/api/my-contacts/add', requireAuth, async (req, res) => {
        try {
            const { phone, name } = req.body;
            const userId = req.user.id;

            if (!phone) {
                return res.status(400).json({ error: 'El número de teléfono es requerido' });
            }

            // Verificar rate limit: contar conversaciones iniciadas hoy por este usuario
            const todayCount = await database.query(`
                SELECT COUNT(*) as count FROM client_assignments
                WHERE support_user_id = ?
                AND DATE(created_at) = CURDATE()
            `, [userId]);

            const conversationsToday = todayCount[0]?.count || 0;

            if (conversationsToday >= DAILY_CONVERSATION_LIMIT) {
                return res.status(429).json({
                    error: `Límite diario alcanzado. Máximo ${DAILY_CONVERSATION_LIMIT} conversaciones nuevas por día.`,
                    limit: DAILY_CONVERSATION_LIMIT,
                    used: conversationsToday
                });
            }

            // Limpiar el número (solo dígitos)
            const cleanPhone = phone.replace(/\D/g, '');

            if (cleanPhone.length < 10) {
                return res.status(400).json({ error: 'Número de teléfono inválido' });
            }

            // Verificar si ya existe una asignación para este teléfono
            const existing = await database.findOne(
                'client_assignments',
                'client_phone = ?',
                [cleanPhone]
            );

            if (existing) {
                // Si ya existe pero está asignado a otro usuario
                if (existing.support_user_id !== userId) {
                    return res.status(400).json({
                        error: 'Este contacto ya está asignado a otro usuario'
                    });
                }
                // Si ya está asignado a este usuario, simplemente retornar éxito
                return res.json({
                    success: true,
                    message: 'Contacto ya existe',
                    phone: cleanPhone
                });
            }

            // Crear la asignación
            await database.insert('client_assignments', {
                client_phone: cleanPhone,
                support_user_id: userId,
                is_group: false,
                group_name: name || null,
                last_message_at: new Date()
            });

            // Establecer modo humano por defecto para nuevos contactos iniciados manualmente
            const humanModeManager = require('../services/humanModeManager');
            await humanModeManager.setMode(cleanPhone, 'human');

            res.json({
                success: true,
                message: 'Contacto agregado exitosamente',
                phone: cleanPhone
            });
        } catch (error) {
            console.error('Error agregando contacto:', error);
            res.status(500).json({ error: 'Error agregando contacto' });
        }
    });

    // Obtener contactos del usuario actual
    app.get('/api/my-contacts', requireAuth, async (req, res) => {
        try {
            const userId = req.user.id;

            // Obtener asignaciones del usuario
            const assignments = await database.findAll(
                'client_assignments',
                'support_user_id = ?',
                [userId],
                'last_message_at DESC'
            );

            // Obtener logs para cada cliente asignado
            const logger = require('../services/logger');
            const humanModeManager = require('../services/humanModeManager');

            const contacts = await Promise.all(
                assignments.map(async (assignment) => {
                    const logs = await logger.getLogsByClientPhone(assignment.client_phone);

                    // Agrupar mensajes
                    const messages = logs.map(log => ({
                        type: log.type || log.role?.toUpperCase(),
                        message: log.message,
                        timestamp: log.timestamp,
                        role: log.role,
                        status: log.status,
                        messageId: log.messageId,
                        userName: log.userName
                    }));

                    // Obtener modo actual (solo humano o soporte, sin IA) - DEBE SER AWAIT
                    const rawMode = await humanModeManager.getMode(assignment.client_phone);
                    const mode = rawMode === 'support' ? 'support' : 'human'; // Solo 2 modos posibles
                    const isHumanMode = mode === 'human';

                    return {
                        phone: assignment.client_phone,
                        name: assignment.group_name || assignment.client_phone,
                        isGroup: false, // Grupos desactivados
                        groupName: assignment.group_name,
                        messages: messages.reverse(), // Orden cronológico
                        totalMessages: messages.length,
                        userMessages: messages.filter(m => m.type === 'USER' || m.role === 'cliente').length,
                        botMessages: messages.filter(m => m.type === 'BOT' || m.role === 'bot').length,
                        lastActivity: assignment.last_message_at,
                        isHumanMode,
                        mode, // Siempre 'human' o 'support'
                        lastMessage: messages.length > 0 ? {
                            text: messages[messages.length - 1].message,
                            timestamp: messages[messages.length - 1].timestamp
                        } : null
                    };
                })
            );

            res.json(contacts);
        } catch (error) {
            console.error('Error obteniendo contactos del usuario:', error);
            res.status(500).json({ error: 'Error obteniendo contactos' });
        }
    });

    // Enviar mensaje desde la instancia del usuario actual
    app.post('/api/my-instance/send-message', requireAuth, async (req, res) => {
        try {
            console.log('📨 [SEND-MESSAGE] Inicio - Usuario:', req.user.id, req.user.email);
            console.log('📨 [SEND-MESSAGE] Body recibido:', JSON.stringify(req.body));

            const { phone, message } = req.body;

            if (!phone || !message) {
                console.log('❌ [SEND-MESSAGE] Falta phone o message');
                return res.status(400).json({
                    error: 'Phone and message are required'
                });
            }

            console.log('📨 [SEND-MESSAGE] Phone:', phone, 'Message length:', message.length);

            const instanceManager = global.whatsappInstanceManager;
            // Solo chats individuales (grupos desactivados)
            const chatId = `${phone}@s.whatsapp.net`;

            console.log('📨 [SEND-MESSAGE] ChatId formateado:', chatId);
            console.log('📨 [SEND-MESSAGE] Llamando instanceManager.sendMessage...');

            await instanceManager.sendMessage(req.user.id, chatId, message);

            console.log('✅ [SEND-MESSAGE] Mensaje enviado exitosamente');

            // Registrar el mensaje (isGroup siempre false)
            const logger = require('../services/logger');
            await logger.log('soporte', message, phone, req.user.name, false, req.user.id);

            console.log('✅ [SEND-MESSAGE] Mensaje registrado en logs');

            res.json({
                success: true,
                message: 'Mensaje enviado correctamente'
            });
        } catch (error) {
            console.error('❌ [SEND-MESSAGE] Error:', error.message);
            console.error('❌ [SEND-MESSAGE] Stack:', error.stack);
            res.status(500).json({
                error: 'Error enviando mensaje',
                details: error.message
            });
        }
    });

    // Verificar estado de conexión de WhatsApp
    app.get('/api/whatsapp-status', requireAuth, async (req, res) => {
        try {
            const instanceManager = global.whatsappInstanceManager;
            const instance = instanceManager.getInstance(req.user.id);

            res.json({
                connected: instance?.status === 'connected',
                status: instance?.status || 'not_found'
            });
        } catch (error) {
            console.error('Error verificando estado:', error);
            res.status(500).json({ connected: false });
        }
    });

    // Obtener configuración de AI
    app.get('/api/ai-config', requireAuth, async (req, res) => {
        try {
            const systemConfigService = require('../services/systemConfigService');
            const groupsAIEnabled = await systemConfigService.isGroupsAIEnabled();
            const individualAIEnabled = await systemConfigService.isIndividualAIEnabled();

            res.json({
                groupsAIEnabled,
                individualAIEnabled
            });
        } catch (error) {
            console.error('Error obteniendo configuración de AI:', error);
            res.status(500).json({ error: 'Error obteniendo configuración' });
        }
    });

    // Actualizar nombre de contacto
    app.put('/api/my-contacts/:phone/name', requireAuth, async (req, res) => {
        try {
            const { phone } = req.params;
            const { name } = req.body;
            const userId = req.user.id;

            if (!phone) {
                return res.status(400).json({ error: 'El teléfono es requerido' });
            }

            // Verificar que el contacto pertenece al usuario
            const assignment = await database.findOne(
                'client_assignments',
                'client_phone = ? AND support_user_id = ?',
                [phone, userId]
            );

            if (!assignment) {
                return res.status(404).json({ error: 'Contacto no encontrado' });
            }

            // Actualizar el nombre (null si está vacío para mostrar el teléfono)
            await database.update(
                'client_assignments',
                { group_name: name?.trim() || null },
                'client_phone = ? AND support_user_id = ?',
                [phone, userId]
            );

            res.json({
                success: true,
                message: 'Nombre actualizado correctamente',
                name: name?.trim() || null
            });
        } catch (error) {
            console.error('Error actualizando nombre de contacto:', error);
            res.status(500).json({ error: 'Error actualizando nombre' });
        }
    });
};
