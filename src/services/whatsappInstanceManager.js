const wppconnect = require('@wppconnect-team/wppconnect');
const database = require('./database');
const logger = require('./logger');
const aiService = require('./aiService');
const sessionManager = require('./sessionManager');
const promptLoader = require('./promptLoader');
const humanModeManager = require('./humanModeManager');
const followUpService = require('./followUpService');
const systemConfigService = require('./systemConfigService');
const path = require('path');
const fs = require('fs').promises;
const { exec } = require('child_process');

class WhatsAppInstanceManager {
    constructor() {
        this.instances = new Map(); // Map<supportUserId, instanceData>
        this.reconnectQueue = new Map(); // Map<supportUserId, queueData>
        this.globalReconnectCount = 0;
        this.maxGlobalReconnects = 10;
        this.lastGlobalReconnectReset = Date.now();
        this.globalReconnectWindow = 60000;
    }

    // Matar procesos zombie de Chrome del proyecto antes de iniciar
    async killZombieChrome() {
        return new Promise((resolve) => {
            const tokensPath = path.join(process.cwd(), 'tokens');
            const cmd = `pkill -f "user-data-dir=${tokensPath}" 2>/dev/null || true`;

            exec(cmd, (error, stdout, stderr) => {
                if (!error) {
                    console.log('🧹 Procesos zombie de Chrome limpiados');
                }
                // Esperar un momento para que los procesos terminen
                setTimeout(resolve, 1000);
            });
        });
    }

    // Obtener todas las instancias activas
    getInstances() {
        return Array.from(this.instances.entries()).map(([userId, data]) => ({
            userId,
            status: data.status,
            qr: data.qr,
            phone: data.phone,
            instanceName: data.instanceName
        }));
    }

    // Obtener instancia específica
    getInstance(supportUserId) {
        return this.instances.get(supportUserId);
    }

    // Resetear contador global si ha pasado el tiempo de ventana
    resetGlobalReconnectCountIfNeeded() {
        const now = Date.now();
        if (now - this.lastGlobalReconnectReset > this.globalReconnectWindow) {
            console.log('🔄 Reseteando contador global de reconexiones');
            this.globalReconnectCount = 0;
            this.lastGlobalReconnectReset = now;
        }
    }

    // Calcular delay con backoff exponencial
    calculateBackoffDelay(attemptNumber) {
        const baseDelay = 3000;
        const maxDelay = 60000;
        const delay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), maxDelay);
        return delay;
    }

    // Agregar a cola de reconexión con backoff
    scheduleReconnect(supportUserId, instanceName, attemptNumber) {
        if (this.reconnectQueue.has(supportUserId)) {
            console.log(`⚠️  Usuario ${supportUserId} ya tiene una reconexión programada`);
            return;
        }

        const delay = this.calculateBackoffDelay(attemptNumber);
        console.log(`⏰ Reconexión programada para usuario ${supportUserId} en ${delay/1000}s (intento ${attemptNumber})`);

        const timeoutId = setTimeout(async () => {
            this.reconnectQueue.delete(supportUserId);
            await this.startInstance(supportUserId, instanceName);
        }, delay);

        this.reconnectQueue.set(supportUserId, {
            timeoutId,
            scheduledAt: Date.now(),
            attemptNumber
        });
    }

    // Cancelar reconexión programada
    cancelScheduledReconnect(supportUserId) {
        const queueData = this.reconnectQueue.get(supportUserId);
        if (queueData) {
            clearTimeout(queueData.timeoutId);
            this.reconnectQueue.delete(supportUserId);
            console.log(`❌ Reconexión cancelada para usuario ${supportUserId}`);
        }
    }

    // Crear/iniciar instancia para un usuario
    async startInstance(supportUserId, instanceName) {
        try {
            this.resetGlobalReconnectCountIfNeeded();

            if (this.globalReconnectCount >= this.maxGlobalReconnects) {
                console.log(`🛑 LÍMITE GLOBAL de reconexiones alcanzado (${this.globalReconnectCount}/${this.maxGlobalReconnects})`);
                console.log(`⏳ Esperando ${this.globalReconnectWindow/1000}s antes de permitir más reconexiones`);
                return null;
            }

            console.log(`🚀 Iniciando instancia WPPConnect para usuario ${supportUserId}...`);

            // Verificar si ya existe una instancia activa
            if (this.instances.has(supportUserId)) {
                const existing = this.instances.get(supportUserId);

                if (existing.status === 'connected') {
                    console.log(`✅ Instancia ya conectada para usuario ${supportUserId}`);
                    return existing;
                }

                if (existing.isReconnecting) {
                    console.log(`⏳ Instancia ya está reconectando para usuario ${supportUserId}`);
                    return existing;
                }

                if (this.reconnectQueue.has(supportUserId)) {
                    console.log(`⏳ Reconexión ya programada para usuario ${supportUserId}`);
                    return existing;
                }

                console.log(`🔄 Cerrando instancia desconectada para usuario ${supportUserId}`);
                await this.stopInstance(supportUserId);
            }

            // Datos de la instancia (se crearán antes de inicializar el cliente)
            const instanceData = {
                client: null,
                supportUserId,
                instanceName,
                status: 'disconnected',
                qr: null,
                phone: null,
                reconnectAttempts: 0,
                maxReconnectAttempts: 3,
                isReconnecting: false,
                hasBeenConnected: false,
                firstQrGenerated: false,
                qrRegenerationAttempts: 0,
                maxQrRegenerations: 10
            };

            this.instances.set(supportUserId, instanceData);

            // Crear cliente WPPConnect con session única por usuario
            const sessionPath = path.join(process.cwd(), 'tokens', `user_${supportUserId}`);
            const client = await wppconnect.create({
                session: `user_${supportUserId}`,
                headless: true,
                devtools: false,
                useChrome: true,
                debug: false,
                logQR: false,
                autoClose: 15000, // Cerrar automáticamente después de 15 segundos si no hay conexión
                browserArgs: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                // Forzar directorio específico para este usuario
                puppeteerOptions: {
                    userDataDir: sessionPath
                },
                // Capturar QR
                catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
                    if (!instanceData.firstQrGenerated) {
                        console.log(`📱 QR generado para usuario ${supportUserId} - Disponible en panel web`);
                        instanceData.firstQrGenerated = true;
                    }

                    instanceData.qr = base64Qr;
                    instanceData.status = 'qr_ready';

                    // Actualizar en BD
                    this.updateInstanceInDB(supportUserId, {
                        qr_code: base64Qr,
                        status: 'qr_ready',
                        last_qr_generated: new Date()
                    }).catch(err => console.error('Error actualizando QR en BD:', err));
                },
                // Configurar directorio de sesión
                folderNameToken: 'tokens',
                mkdirFolderToken: '',
                // Callbacks de estado
                statusFind: (statusSession, session) => {
                    console.log(`📊 Estado de sesión ${supportUserId}: ${statusSession}`);

                    if (statusSession === 'isLogged' || statusSession === 'qrReadSuccess') {
                        instanceData.status = 'connected';
                        instanceData.hasBeenConnected = true;
                        instanceData.firstQrGenerated = false;
                        instanceData.reconnectAttempts = 0;
                        instanceData.qrRegenerationAttempts = 0;

                        console.log(`✅ WhatsApp conectado para usuario ${supportUserId}`);

                        // Actualizar en BD
                        this.updateInstanceInDB(supportUserId, {
                            status: 'connected',
                            qr_code: null,
                            connected_at: new Date(),
                            last_activity: new Date()
                        }).catch(err => console.error('Error actualizando BD:', err));

                        logger.log('SYSTEM', `Bot iniciado para usuario ${supportUserId}`, supportUserId, instanceName);
                    } else if (statusSession === 'autocloseCalled' || statusSession === 'desconnectedMobile') {
                        instanceData.status = 'disconnected';
                        console.log(`❌ WhatsApp desconectado para usuario ${supportUserId}`);

                        this.updateInstanceInDB(supportUserId, {
                            status: 'disconnected'
                        }).catch(err => console.error('Error actualizando BD:', err));
                    }
                }
            });

            // Guardar referencia al cliente
            instanceData.client = client;

            // Obtener información del teléfono conectado
            try {
                const hostDevice = await client.getHostDevice();
                instanceData.phone = hostDevice.id.user;

                await this.updateInstanceInDB(supportUserId, {
                    phone_number: instanceData.phone
                });
            } catch (err) {
                console.log(`⚠️ No se pudo obtener número de teléfono para usuario ${supportUserId}`);
            }

            // Event: Mensaje recibido
            client.onMessage(async (message) => {
                await this.handleIncomingMessage(supportUserId, message);
            });

            // Event: ACK (confirmación de lectura/entrega)
            client.onAck(async (ack) => {
                await this.handleMessageAck(supportUserId, ack);
            });

            // Actualizar BD
            await this.updateInstanceInDB(supportUserId, {
                instance_name: instanceName,
                status: instanceData.status
            });

            return instanceData;
        } catch (error) {
            console.error(`Error iniciando instancia para usuario ${supportUserId}:`, error);

            // Si falla, remover de instances
            if (this.instances.has(supportUserId)) {
                this.instances.delete(supportUserId);
            }

            throw error;
        }
    }

    // Manejar ACK de mensajes
    async handleMessageAck(supportUserId, ack) {
        try {
            const messageId = ack.id?.id;
            if (!messageId) return;

            const userId = ack.to?.replace('@c.us', '');

            let status = null;

            // ACK states en WPPConnect:
            // 0 = ACK_ERROR
            // 1 = ACK_PENDING
            // 2 = ACK_SERVER (enviado)
            // 3 = ACK_DEVICE (entregado)
            // 4 = ACK_READ (leído)
            // 5 = ACK_PLAYED (reproducido)

            if (ack.ack === 4) {
                status = 'read';
                console.log('🔵 LEÍDO detectado - ACK 4');
            } else if (ack.ack === 3) {
                status = 'delivered';
                console.log('⚪ ENTREGADO detectado - ACK 3');
            } else if (ack.ack === 2) {
                status = 'sent';
                console.log('⚪ ENVIADO detectado - ACK 2');
            }

            if (status && messageId) {
                await logger.updateMessageStatus(messageId, status);
                console.log(`✅ Estado actualizado (Usuario ${supportUserId}): ${messageId} -> ${status}`);
            }
        } catch (error) {
            console.error('Error actualizando estado de mensaje:', error);
        }
    }

    // Manejar mensaje entrante
    async handleIncomingMessage(supportUserId, message) {
        try {
            // Ignorar mensajes propios
            if (message.isGroupMsg || message.fromMe) {
                return;
            }

            const instanceData = this.instances.get(supportUserId);
            if (!instanceData || !instanceData.client) return;

            const from = message.from;

            // Solo procesar mensajes de contactos individuales (@c.us)
            const isIndividualContact = from && from.endsWith('@c.us');

            if (!isIndividualContact) {
                let tipo = 'desconocido';
                if (from.endsWith('@g.us')) tipo = 'grupo';
                else if (from.includes('broadcast')) tipo = 'broadcast';
                else if (from.includes('status')) tipo = 'estado';

                console.log(`📛 Mensaje ignorado [${tipo}]: ${from}`);
                return;
            }

            console.log(`✅ Mensaje de contacto individual: ${from}`);

            const userId = from.replace('@c.us', '');
            const userName = message.sender.pushname || message.sender.name || userId;

            // Extraer contenido del mensaje
            let conversation = '';

            if (message.type === 'chat') {
                conversation = message.body || '';
            } else if (message.type === 'image' || message.type === 'document' || message.type === 'ptt' || message.type === 'video') {
                // Media messages - solo registrar que se recibió media
                conversation = message.caption || `[${message.type}]`;

                // TODO: Implementar descarga y guardado de media si es necesario
                // const mediaData = await message.downloadMedia();
            } else {
                console.log(`⚠️ Tipo de mensaje no soportado: ${message.type}`);
                return;
            }

            if (!conversation || conversation.trim() === '') {
                console.log('Mensaje ignorado - Sin contenido');
                return;
            }

            // VERIFICAR SI EL CLIENTE ESTÁ ASIGNADO A OTRO USUARIO DE SOPORTE
            const existingAssignment = await this.getClientAssignment(userId);

            if (existingAssignment && existingAssignment.support_user_id !== supportUserId) {
                console.log(`⏭️  Mensaje ignorado: Cliente ${userId} está asignado a usuario ${existingAssignment.support_user_id}, no a ${supportUserId}`);
                return;
            }

            // Log del mensaje
            await logger.log('cliente', conversation, userId, userName, false, supportUserId);

            // Asignar cliente a este usuario de soporte si no está asignado
            await this.assignClientToUser(userId, supportUserId, false, null);

            // YA NO HAY IA - Solo registrar el mensaje entrante
            await logger.log('SYSTEM', `Mensaje recibido de ${userName} (${userId}) - Esperando respuesta humana`, supportUserId);

            // Cancelar seguimiento si existe
            if (followUpService.hasActiveFollowUp(userId)) {
                await followUpService.cancelFollowUp(userId, 'Cliente respondió');
            }

        } catch (error) {
            console.error(`Error procesando mensaje (Usuario ${supportUserId}):`, error);
        }
    }

    // Procesar mensaje y generar respuesta (para futuro uso con IA)
    async processMessage(supportUserId, userId, userMessage, chatId) {
        await sessionManager.addMessage(userId, 'user', userMessage, chatId);

        const isGroup = chatId.endsWith('@g.us');
        const systemPrompt = promptLoader.getPrompt(isGroup);

        const messages = [
            { role: 'system', content: systemPrompt },
            ...(await sessionManager.getMessages(userId, chatId))
        ];

        const aiResponse = await aiService.generateResponse(messages);

        if (aiResponse.includes('{{ACTIVAR_SOPORTE}}')) {
            const cleanResponse = aiResponse.replace('{{ACTIVAR_SOPORTE}}', '').trim();
            await humanModeManager.setMode(userId, 'support');
            await sessionManager.updateSessionMode(userId, chatId, 'support');
            await sessionManager.addMessage(userId, 'assistant', cleanResponse, chatId);
            await logger.log('SYSTEM', `Modo SOPORTE activado automáticamente para ${userId}`, supportUserId);
            return cleanResponse;
        }

        await sessionManager.addMessage(userId, 'assistant', aiResponse, chatId);
        return aiResponse;
    }

    // Obtener asignación de cliente
    async getClientAssignment(clientPhone) {
        try {
            return await database.findOne(
                'client_assignments',
                'client_phone = ?',
                [clientPhone]
            );
        } catch (error) {
            console.error('Error obteniendo asignación de cliente:', error);
            return null;
        }
    }

    // Asignar cliente a usuario de soporte
    async assignClientToUser(clientPhone, supportUserId, isGroup = false, groupName = null) {
        try {
            const existingAssignment = await this.getClientAssignment(clientPhone);

            if (existingAssignment) {
                if (existingAssignment.support_user_id === supportUserId) {
                    await database.update(
                        'client_assignments',
                        { last_message_at: new Date() },
                        'id = ?',
                        [existingAssignment.id]
                    );
                    console.log(`✅ Actualizada última actividad para cliente ${clientPhone} (Usuario ${supportUserId})`);
                } else {
                    console.log(`⚠️  Cliente ${clientPhone} ya está asignado a usuario ${existingAssignment.support_user_id}`);
                }
            } else {
                await database.insert('client_assignments', {
                    client_phone: clientPhone,
                    support_user_id: supportUserId,
                    is_group: isGroup,
                    group_name: groupName,
                    last_message_at: new Date()
                });
                console.log(`✅ Cliente ${clientPhone} asignado a usuario ${supportUserId}`);
            }
        } catch (error) {
            console.error('Error asignando cliente a usuario:', error);
        }
    }

    // Detener instancia
    async stopInstance(supportUserId) {
        try {
            const instanceData = this.instances.get(supportUserId);
            if (!instanceData) return;

            console.log(`🛑 Deteniendo instancia para usuario ${supportUserId}...`);

            this.cancelScheduledReconnect(supportUserId);

            if (instanceData.client) {
                try {
                    await instanceData.client.close();
                } catch (err) {
                    console.log('Error cerrando cliente:', err.message);
                }
            }

            this.instances.delete(supportUserId);

            await this.updateInstanceInDB(supportUserId, {
                status: 'disconnected',
                qr_code: null
            });
        } catch (error) {
            console.error(`Error deteniendo instancia ${supportUserId}:`, error);
        }
    }

    // Limpiar sesión
    async clearSession(sessionName) {
        try {
            const tokensPath = path.join(process.cwd(), 'tokens', sessionName);
            await fs.rm(tokensPath, { recursive: true, force: true });
            console.log('Sesión eliminada correctamente');
        } catch (err) {
            console.log('No había sesión previa o ya fue eliminada');
        }
    }

    // Logout de instancia
    async logoutInstance(supportUserId) {
        try {
            const instanceData = this.instances.get(supportUserId);

            console.log(`🚪 Cerrando sesión de WhatsApp para usuario ${supportUserId}...`);

            // Si hay instancia activa, intentar cerrar el cliente
            if (instanceData && instanceData.client) {
                try {
                    await instanceData.client.logout();
                } catch (err) {
                    console.log('Error al hacer logout del cliente:', err.message);
                }
            }

            // Siempre limpiar la sesión guardada
            await this.clearSession(`user_${supportUserId}`);

            // Actualizar BD
            await this.updateInstanceInDB(supportUserId, {
                status: 'disconnected',
                qr_code: null,
                phone_number: null
            });

            // Obtener nombre de instancia de BD si no hay en memoria
            let instanceName = 'Usuario';
            if (instanceData) {
                instanceName = instanceData.instanceName;
            } else {
                const dbInstance = await this.getInstanceFromDB(supportUserId);
                if (dbInstance) {
                    instanceName = dbInstance.instance_name;
                }
            }

            // Reiniciar instancia
            console.log(`🔄 Reiniciando instancia para usuario ${supportUserId} en 2 segundos...`);
            setTimeout(() => this.startInstance(supportUserId, instanceName), 2000);
            return true;
        } catch (error) {
            console.error(`Error al cerrar sesión ${supportUserId}:`, error);
            throw error; // Lanzar error para que el endpoint lo capture
        }
    }

    // Actualizar datos de instancia en BD
    async updateInstanceInDB(supportUserId, data) {
        try {
            // Filtrar valores undefined (MySQL no acepta undefined, solo null)
            const cleanData = Object.fromEntries(
                Object.entries(data).map(([key, value]) => [key, value === undefined ? null : value])
            );

            const existing = await database.findOne(
                'whatsapp_instances',
                'support_user_id = ?',
                [supportUserId]
            );

            if (existing) {
                await database.update(
                    'whatsapp_instances',
                    cleanData,
                    'support_user_id = ?',
                    [supportUserId]
                );
            } else {
                await database.insert('whatsapp_instances', {
                    support_user_id: supportUserId,
                    ...cleanData
                });
            }
        } catch (error) {
            console.error('Error actualizando instancia en BD:', error);
        }
    }

    // Enviar mensaje desde una instancia específica
    async sendMessage(supportUserId, to, message) {
        console.log('📤 [INSTANCE-MANAGER] sendMessage - userId:', supportUserId, 'to:', to);

        const instanceData = this.instances.get(supportUserId);

        if (!instanceData) {
            console.log('❌ [INSTANCE-MANAGER] No se encontró instancia para usuario:', supportUserId);
            console.log('📋 [INSTANCE-MANAGER] Instancias disponibles:', Array.from(this.instances.keys()));
            throw new Error('Instancia no disponible');
        }

        if (!instanceData.client) {
            console.log('❌ [INSTANCE-MANAGER] Instancia sin cliente para usuario:', supportUserId);
            throw new Error('Instancia no disponible');
        }

        console.log('📤 [INSTANCE-MANAGER] Estado de instancia:', instanceData.status);

        if (instanceData.status !== 'connected') {
            console.log('❌ [INSTANCE-MANAGER] WhatsApp no conectado. Estado:', instanceData.status);
            throw new Error('WhatsApp no está conectado');
        }

        // WPPConnect usa @c.us para contactos individuales
        const chatId = to.includes('@') ? to : `${to}@c.us`;
        console.log('📤 [INSTANCE-MANAGER] ChatId final:', chatId);
        console.log('📤 [INSTANCE-MANAGER] Enviando mensaje...');

        const result = await instanceData.client.sendText(chatId, message);

        console.log('✅ [INSTANCE-MANAGER] Mensaje enviado exitosamente');
        return result;
    }

    // Enviar media desde una instancia específica
    async sendMedia(supportUserId, to, mediaPath, caption = '', mimetype = '') {
        const instanceData = this.instances.get(supportUserId);

        if (!instanceData || !instanceData.client) {
            throw new Error('Instancia no disponible');
        }

        if (instanceData.status !== 'connected') {
            throw new Error('WhatsApp no está conectado');
        }

        const chatId = to.includes('@') ? to : `${to}@c.us`;

        // WPPConnect maneja archivos directamente con sendFile
        const result = await instanceData.client.sendFile(
            chatId,
            mediaPath,
            {
                caption: caption,
                mimetype: mimetype
            }
        );

        return result;
    }

    // Obtener estado de instancia desde BD
    async getInstanceFromDB(supportUserId) {
        return await database.findOne(
            'whatsapp_instances',
            'support_user_id = ?',
            [supportUserId]
        );
    }
}

module.exports = new WhatsAppInstanceManager();
