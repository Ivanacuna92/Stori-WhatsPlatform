const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const logger = require('../services/logger');
const authService = require('../services/authService');
const mediaService = require('../services/mediaService');
const archiveService = require('../services/archiveService');
const { requireAuth, requireAdmin, requireSupportOrAdmin } = require('../middleware/auth');
const ViteExpress = require('vite-express');

class WebServer {
    constructor(port = 3000) {
        this.app = express();
        this.port = port;
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        this.app.use(cors({
            origin: true,
            credentials: true
        }));
        this.app.use(express.json());
        this.app.use(cookieParser());
        
        // En producción, servir archivos estáticos de React build
        if (process.env.NODE_ENV === 'production') {
            this.app.use(express.static(path.join(__dirname, '../../dist')));
        }
    }

    setupRoutes() {
        // ===== NO FAVICON =====
        this.app.get('/favicon.ico', (req, res) => res.status(204).end());

        // ===== HEALTH CHECK PARA PM2 Y MONITOREO =====
        this.app.get('/health', (req, res) => {
            const instanceManager = global.whatsappInstanceManager;
            const instances = instanceManager ? instanceManager.getInstances() : [];
            const connectedInstances = instances.filter(i => i.status === 'connected').length;

            const healthData = {
                status: 'ok',
                timestamp: new Date().toISOString(),
                uptime: process.uptime(),
                memory: {
                    used: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
                    total: Math.round(process.memoryUsage().heapTotal / 1024 / 1024),
                    unit: 'MB'
                },
                whatsapp: {
                    totalInstances: instances.length,
                    connected: connectedInstances,
                    instances: instances.map(i => ({ userId: i.userId, status: i.status }))
                }
            };

            // Notificar a PM2 que estamos listos
            if (process.send) {
                process.send('ready');
            }

            res.json(healthData);
        });

        // ===== RUTAS PÚBLICAS DE AUTENTICACIÓN =====
        
        // Endpoint para obtener código QR de WhatsApp
        this.app.get('/api/qr', (req, res) => {
            try {
                const bot = global.whatsappBot;
                if (!bot || !bot.currentQR) {
                    return res.json({ 
                        qr: null, 
                        message: 'No hay código QR disponible. El bot puede estar ya conectado o reiniciándose.' 
                    });
                }
                
                res.json({ 
                    qr: bot.currentQR,
                    message: 'Escanea este código con WhatsApp'
                });
            } catch (error) {
                console.error('Error obteniendo QR:', error);
                res.status(500).json({ error: 'Error obteniendo código QR' });
            }
        });
        
        // Endpoint para cerrar sesión y generar nuevo QR
        this.app.post('/api/logout', async (req, res) => {
            try {
                const bot = global.whatsappBot;
                if (!bot) {
                    return res.status(400).json({ 
                        success: false,
                        message: 'Bot no está inicializado' 
                    });
                }
                
                const result = await bot.logout();
                
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
        // Login
        this.app.post('/api/auth/login', async (req, res) => {
            try {
                const { email, password } = req.body;
                
                if (!email || !password) {
                    return res.status(400).json({ 
                        error: 'Email y contraseña son requeridos' 
                    });
                }

                const loginResult = await authService.login(email, password);
                
                // Establecer cookie httpOnly
                res.cookie('auth_token', loginResult.token, {
                    httpOnly: true,
                    secure: process.env.NODE_ENV === 'production',
                    sameSite: 'lax',
                    expires: loginResult.expiresAt
                });

                res.json({
                    success: true,
                    user: loginResult.user,
                    expiresAt: loginResult.expiresAt
                });
            } catch (error) {
                res.status(401).json({ 
                    error: 'Error de autenticación', 
                    message: error.message 
                });
            }
        });

        // Logout
        this.app.post('/api/auth/logout', async (req, res) => {
            try {
                const token = req.cookies?.auth_token;
                if (token) {
                    await authService.logout(token);
                }
                
                res.clearCookie('auth_token');
                res.json({ success: true });
            } catch (error) {
                console.error('Error en logout:', error);
                res.status(500).json({ error: 'Error cerrando sesión' });
            }
        });

        // Verificar sesión actual
        this.app.get('/api/auth/me', requireAuth, (req, res) => {
            res.json({
                user: req.user,
                expiresAt: req.sessionExpiresAt
            });
        });

        // ===== ENDPOINTS DE ARCHIVOS MULTIMEDIA (PÚBLICOS) =====

        // Servir archivo multimedia por tipo y nombre
        this.app.get('/api/media/:mediaType/:filename', async (req, res) => {
            try {
                const { mediaType, filename } = req.params;

                // Validar tipo de media
                const allowedTypes = ['images', 'documents', 'videos', 'audio'];
                if (!allowedTypes.includes(mediaType)) {
                    return res.status(400).json({ error: 'Tipo de media no válido' });
                }

                // Verificar si el archivo existe
                const exists = await mediaService.fileExists(mediaType, filename);
                if (!exists) {
                    return res.status(404).json({ error: 'Archivo no encontrado' });
                }

                // Leer el archivo
                const fileBuffer = await mediaService.readMedia(mediaType, filename);

                // Determinar MIME type
                const mimeType = mediaService.getMimeType(filename);

                // Establecer headers
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
                res.setHeader('Cache-Control', 'public, max-age=86400'); // Cache por 24 horas

                // Enviar archivo
                res.send(fileBuffer);
            } catch (error) {
                console.error('Error sirviendo archivo multimedia:', error);
                res.status(500).json({ error: 'Error al servir archivo' });
            }
        });

        // Descargar archivo multimedia
        this.app.get('/api/media/:mediaType/:filename/download', async (req, res) => {
            try {
                const { mediaType, filename } = req.params;

                // Validar tipo de media
                const allowedTypes = ['images', 'documents', 'videos', 'audio'];
                if (!allowedTypes.includes(mediaType)) {
                    return res.status(400).json({ error: 'Tipo de media no válido' });
                }

                // Verificar si el archivo existe
                const exists = await mediaService.fileExists(mediaType, filename);
                if (!exists) {
                    return res.status(404).json({ error: 'Archivo no encontrado' });
                }

                // Leer el archivo
                const fileBuffer = await mediaService.readMedia(mediaType, filename);

                // Determinar MIME type
                const mimeType = mediaService.getMimeType(filename);

                // Establecer headers para descarga
                res.setHeader('Content-Type', mimeType);
                res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

                // Enviar archivo
                res.send(fileBuffer);
            } catch (error) {
                console.error('Error descargando archivo multimedia:', error);
                res.status(500).json({ error: 'Error al descargar archivo' });
            }
        });

        // ===== TODAS LAS DEMÁS RUTAS REQUIEREN AUTENTICACIÓN =====
        this.app.use('/api', requireAuth);

        // API endpoint para obtener logs
        this.app.get('/api/logs/:date?', async (req, res) => {
            try {
                const date = req.params.date || null;
                const logs = await logger.getLogs(date);
                res.json(Array.isArray(logs) ? logs : []);
            } catch (error) {
                console.error('Error obteniendo logs:', error);
                res.status(500).json([]);
            }
        });

        // API endpoint para obtener fechas disponibles
        this.app.get('/api/dates', async (req, res) => {
            try {
                const dates = await logger.getAvailableDates();
                res.json(Array.isArray(dates) ? dates : []);
            } catch (error) {
                console.error('Error obteniendo fechas:', error);
                res.status(500).json([]);
            }
        });

        // API endpoint para estadísticas
        this.app.get('/api/stats/:date?', async (req, res) => {
            try {
                const date = req.params.date || null;
                const logs = await logger.getLogs(date);
                
                const stats = this.calculateStats(logs);
                res.json(stats);
            } catch (error) {
                console.error('Error obteniendo estadísticas:', error);
                res.status(500).json({ error: 'Error obteniendo estadísticas' });
            }
        });

        // API endpoint para conversaciones por usuario
        this.app.get('/api/conversations/:userId/:date?', async (req, res) => {
            try {
                const { userId, date } = req.params;
                const logs = await logger.getLogs(date);
                
                const userLogs = logs.filter(log => log.userId === userId);
                
                // Formatear mensajes para incluir mensajes de sistema
                const formattedLogs = userLogs.map(log => {
                    // Detectar mensajes de finalización de sesión
                    if (log.type === 'BOT' && log.message && log.message.includes('⏰') && log.message.includes('sesión')) {
                        return {
                            ...log,
                            type: 'SYSTEM',
                            isSessionEnd: true
                        };
                    }
                    return log;
                });
                
                res.json(formattedLogs);
            } catch (error) {
                console.error('Error obteniendo conversaciones:', error);
                res.status(500).json({ error: 'Error obteniendo conversaciones' });
            }
        });



        // Configurar multer para subida de archivos
        const upload = multer({
            storage: multer.memoryStorage(),
            limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB
            fileFilter: (req, file, cb) => {
                // Permitir multimedia para envío por WhatsApp
                if (
                    file.mimetype.startsWith('image/') ||
                    file.mimetype === 'application/pdf' ||
                    file.mimetype.includes('document') ||
                    file.mimetype.includes('officedocument')
                ) {
                    cb(null, true);
                } else {
                    cb(new Error('Tipo de archivo no permitido'));
                }
            }
        });


        // API endpoint para archivar conversación
        this.app.post('/api/archive-conversation', requireAuth, async (req, res) => {
            try {
                const { phone } = req.body;

                if (!phone) {
                    return res.status(400).json({
                        error: 'Phone is required',
                        details: 'Debe proporcionar el teléfono'
                    });
                }

                // Limpiar el número de teléfono
                const cleanPhone = phone.replace('@s.whatsapp.net', '').replace('@g.us', '');

                // Archivar conversación
                const userId = req.user?.id || null;
                await archiveService.archiveConversation(cleanPhone, userId);

                // Registrar el evento
                logger.log('SYSTEM', `Conversación archivada: ${cleanPhone}`, cleanPhone);

                res.json({
                    success: true,
                    message: 'Conversación archivada correctamente',
                    phone: cleanPhone
                });

            } catch (error) {
                console.error('Error archivando conversación:', error);
                res.status(500).json({
                    error: 'Error al archivar conversación',
                    details: error.message
                });
            }
        });

        // API endpoint para desarchivar conversación
        this.app.post('/api/unarchive-conversation', requireAuth, async (req, res) => {
            try {
                const { phone } = req.body;

                if (!phone) {
                    return res.status(400).json({
                        error: 'Phone is required',
                        details: 'Debe proporcionar el teléfono'
                    });
                }

                // Limpiar el número de teléfono
                const cleanPhone = phone.replace('@s.whatsapp.net', '').replace('@g.us', '');

                // Desarchivar conversación
                await archiveService.unarchiveConversation(cleanPhone);

                // Registrar el evento
                logger.log('SYSTEM', `Conversación desarchivada: ${cleanPhone}`, cleanPhone);

                res.json({
                    success: true,
                    message: 'Conversación desarchivada correctamente',
                    phone: cleanPhone
                });

            } catch (error) {
                console.error('Error desarchivando conversación:', error);
                res.status(500).json({
                    error: 'Error al desarchivar conversación',
                    details: error.message
                });
            }
        });

        // API endpoint para obtener conversaciones archivadas (filtradas por usuario)
        this.app.get('/api/archived-conversations', requireAuth, async (req, res) => {
            try {
                const userId = req.user.id;
                const archived = await archiveService.getArchivedConversationsByUser(userId);
                res.json(archived);
            } catch (error) {
                console.error('Error obteniendo conversaciones archivadas:', error);
                res.status(500).json({
                    error: 'Error obteniendo conversaciones archivadas',
                    details: error.message
                });
            }
        });

        // API endpoint para eliminar conversación (elimina los mensajes de los logs)
        this.app.post('/api/delete-conversation', async (req, res) => {
            try {
                const { phone } = req.body;

                if (!phone) {
                    return res.status(400).json({
                        error: 'Phone is required',
                        details: 'Debe proporcionar el teléfono'
                    });
                }

                // Limpiar el número de teléfono
                const cleanPhone = phone.replace('@s.whatsapp.net', '').replace('@g.us', '');

                // Eliminar mensajes de los logs
                await logger.deleteConversation(cleanPhone);

                // Registrar el evento
                logger.log('SYSTEM', `Conversación eliminada para ${cleanPhone}`, cleanPhone);

                res.json({
                    success: true,
                    message: 'Conversación eliminada correctamente',
                    phone: phone
                });

            } catch (error) {
                console.error('Error eliminando conversación:', error);
                res.status(500).json({
                    error: 'Error al eliminar conversación',
                    details: error.message
                });
            }
        });


        // API endpoint para enviar archivos multimedia
        this.app.post('/api/send-media', requireAuth, upload.single('file'), async (req, res) => {
            try {
                const { phone, caption } = req.body;
                const file = req.file;

                if (!phone) {
                    return res.status(400).json({
                        error: 'Phone is required',
                        details: 'Debe proporcionar el teléfono'
                    });
                }

                if (!file) {
                    return res.status(400).json({
                        error: 'File is required',
                        details: 'Debe adjuntar un archivo'
                    });
                }

                // Verificar si hay una instancia activa del bot
                if (!global.whatsappBot || !global.whatsappBot.sock) {
                    return res.status(503).json({
                        error: 'WhatsApp bot not available',
                        details: 'El bot de WhatsApp no está conectado'
                    });
                }

                // Guardar archivo usando mediaService
                const savedMedia = await mediaService.saveMedia(
                    file.buffer,
                    file.mimetype,
                    file.originalname
                );

                // Formatear el número de teléfono
                let formattedPhone = phone;
                if (!phone.includes('@')) {
                    formattedPhone = `${phone}@c.us`; // whatsapp-web.js usa @c.us
                }

                // Enviar archivo por WhatsApp
                let sentMsg;
                const mediaPath = savedMedia.filepath;

                // WPPConnect usa sendFile para archivos (imágenes y documentos)
                sentMsg = await global.whatsappBot.client.sendFile(
                    formattedPhone,
                    mediaPath,
                    file.originalname || savedMedia.filename,
                    caption || ''
                );

                const messageId = sentMsg?.id;

                // Registrar en logs
                const senderName = req.user ? req.user.name : 'Soporte';
                const cleanPhone = phone.replace('@c.us', '').replace('@g.us', '');
                const isGroup = phone.includes('@g.us') || formattedPhone.includes('@g.us');

                const mediaInfo = {
                    mediaType: savedMedia.mediaType,
                    filename: savedMedia.filename,
                    mimetype: savedMedia.mimetype,
                    url: savedMedia.url,
                    caption: caption || file.originalname
                };

                await logger.log(
                    'soporte',
                    caption || file.originalname || 'Archivo adjunto',
                    cleanPhone,
                    senderName,
                    isGroup,
                    null,
                    null,
                    messageId,
                    mediaInfo
                );

                res.json({
                    success: true,
                    message: 'Archivo enviado correctamente',
                    phone: phone,
                    mediaType: savedMedia.mediaType,
                    mediaUrl: savedMedia.url,
                    mimetype: savedMedia.mimetype,
                    caption: caption || file.originalname
                });

            } catch (error) {
                console.error('Error enviando archivo:', error);

                res.status(500).json({
                    error: 'Failed to send file',
                    details: error.message || 'Error interno del servidor'
                });
            }
        });

        // API endpoint para enviar mensajes
        this.app.post('/api/send-message', requireAuth, async (req, res) => {
            try {
                const { phone, message } = req.body;
                
                if (!phone || !message) {
                    return res.status(400).json({ 
                        error: 'Phone and message are required',
                        details: 'Debe proporcionar el teléfono y el mensaje'
                    });
                }
                
                // Verificar si hay una instancia activa del bot
                if (!global.whatsappBot) {
                    return res.status(503).json({ 
                        error: 'WhatsApp bot not available',
                        details: 'La instancia del bot no está disponible'
                    });
                }
                
                if (!global.whatsappBot.sock) {
                    return res.status(503).json({ 
                        error: 'WhatsApp client not connected',
                        details: 'El cliente de WhatsApp no está conectado. Por favor, escanee el código QR.'
                    });
                }
                
                // Formatear el número de teléfono para WhatsApp
                // Si ya tiene @, usar como está. Si no, determinar si es grupo o chat privado
                let formattedPhone = phone;
                if (!phone.includes('@')) {
                    // Por defecto asumir chat privado, pero esto debería venir del frontend
                    formattedPhone = `${phone}@c.us`; // whatsapp-web.js usa @c.us
                }

                // Enviar mensaje através del cliente de WhatsApp y capturar messageId
                // WPPConnect usa client.sendText para mensajes de texto
                const sentMsg = await global.whatsappBot.client.sendText(formattedPhone, message);
                const messageId = sentMsg?.id;

                // Registrar el mensaje enviado por el humano con el nombre del usuario
                const senderName = req.user ? req.user.name : 'Soporte';
                const cleanPhone = phone.replace('@c.us', '').replace('@g.us', '');
                const isGroup = phone.includes('@g.us') || formattedPhone.includes('@g.us');
                // Usar 'soporte' como role para la base de datos
                await logger.log('soporte', message, cleanPhone, senderName, isGroup, null, null, messageId);
                
                res.json({ 
                    success: true, 
                    message: 'Mensaje enviado correctamente',
                    phone: phone,
                    sentMessage: message
                });
                
            } catch (error) {
                console.error('Error enviando mensaje:', error);
                
                let errorMessage = 'Error interno del servidor';
                if (error.message.includes('Chat not found')) {
                    errorMessage = 'No se encontró el chat con este número';
                } else if (error.message.includes('not registered')) {
                    errorMessage = 'El número no está registrado en WhatsApp';
                } else if (error.message.includes('Session not authenticated')) {
                    errorMessage = 'El bot no está autenticado en WhatsApp';
                }
                
                res.status(500).json({ 
                    error: 'Failed to send message',
                    details: errorMessage,
                    originalError: error.message
                });
            }
        });


        // ===== ENDPOINTS DE WHATSAPP BAJO DEMANDA =====

        // Conectar WhatsApp - Inicia instancia solo cuando el usuario lo solicita
        this.app.post('/api/whatsapp/connect', requireAuth, async (req, res) => {
            try {
                const userId = req.user.id;
                const userName = req.user.name || req.user.email;
                const instanceManager = global.whatsappInstanceManager;

                if (!instanceManager) {
                    return res.status(503).json({ error: 'Instance manager no disponible' });
                }

                // Verificar si ya tiene una instancia activa
                const existingInstance = instanceManager.getInstance(userId);
                if (existingInstance && existingInstance.status !== 'disconnected') {
                    return res.json({
                        success: true,
                        message: 'Instancia ya existe',
                        status: existingInstance.status,
                        qr: existingInstance.qr || null
                    });
                }

                console.log(`🚀 Usuario ${userName} solicitó conectar WhatsApp`);

                // Iniciar instancia bajo demanda
                const instance = await instanceManager.startInstance(userId, userName);

                if (instance) {
                    res.json({
                        success: true,
                        message: 'Instancia iniciando, espera el código QR',
                        status: 'initializing'
                    });
                } else {
                    res.status(503).json({
                        success: false,
                        error: 'No se pudo iniciar la instancia (límite alcanzado)'
                    });
                }
            } catch (error) {
                console.error('Error conectando WhatsApp:', error);
                res.status(500).json({ error: 'Error iniciando conexión WhatsApp' });
            }
        });

        // Obtener estado de MI instancia de WhatsApp
        this.app.get('/api/whatsapp/status', requireAuth, (req, res) => {
            try {
                const userId = req.user.id;
                const instanceManager = global.whatsappInstanceManager;

                if (!instanceManager) {
                    return res.status(503).json({ error: 'Instance manager no disponible' });
                }

                const instance = instanceManager.getInstance(userId);

                if (!instance) {
                    return res.json({
                        connected: false,
                        status: 'not_started',
                        message: 'No hay instancia activa. Haz clic en Conectar para iniciar.'
                    });
                }

                res.json({
                    connected: instance.status === 'connected',
                    status: instance.status,
                    qr: instance.status === 'qr_ready' ? instance.qr : null,
                    phone: instance.phone || null
                });
            } catch (error) {
                console.error('Error obteniendo estado WhatsApp:', error);
                res.status(500).json({ error: 'Error obteniendo estado' });
            }
        });

        // Desconectar WhatsApp
        this.app.post('/api/whatsapp/disconnect', requireAuth, async (req, res) => {
            try {
                const userId = req.user.id;
                const instanceManager = global.whatsappInstanceManager;

                if (!instanceManager) {
                    return res.status(503).json({ error: 'Instance manager no disponible' });
                }

                await instanceManager.stopInstance(userId);

                res.json({
                    success: true,
                    message: 'WhatsApp desconectado'
                });
            } catch (error) {
                console.error('Error desconectando WhatsApp:', error);
                res.status(500).json({ error: 'Error desconectando' });
            }
        });

        // ===== ENDPOINTS DE DIAGNÓSTICO =====

        // Obtener estado de todas las instancias
        this.app.get('/api/diagnostic/instances', requireAdmin, (req, res) => {
            try {
                const instanceManager = global.whatsappInstanceManager;
                if (!instanceManager) {
                    return res.status(503).json({ error: 'Instance manager no disponible' });
                }

                const instances = instanceManager.getInstances();
                const reconnectQueue = Array.from(instanceManager.reconnectQueue.entries()).map(([userId, data]) => ({
                    userId,
                    scheduledAt: data.scheduledAt,
                    attemptNumber: data.attemptNumber,
                    timeRemaining: Math.max(0, (data.scheduledAt + instanceManager.calculateBackoffDelay(data.attemptNumber)) - Date.now())
                }));

                res.json({
                    instances,
                    reconnectQueue,
                    globalReconnectCount: instanceManager.globalReconnectCount,
                    maxGlobalReconnects: instanceManager.maxGlobalReconnects,
                    lastGlobalReconnectReset: instanceManager.lastGlobalReconnectReset,
                    globalReconnectWindow: instanceManager.globalReconnectWindow,
                    timeUntilGlobalReset: Math.max(0, (instanceManager.lastGlobalReconnectReset + instanceManager.globalReconnectWindow) - Date.now())
                });
            } catch (error) {
                console.error('Error obteniendo diagnóstico:', error);
                res.status(500).json({ error: 'Error obteniendo diagnóstico' });
            }
        });

        // Limpiar sesión corrupta de un usuario específico
        this.app.post('/api/diagnostic/clean-session/:userId', requireAdmin, async (req, res) => {
            try {
                const { userId } = req.params;
                const instanceManager = global.whatsappInstanceManager;

                if (!instanceManager) {
                    return res.status(503).json({ error: 'Instance manager no disponible' });
                }

                // Detener instancia si existe
                await instanceManager.stopInstance(parseInt(userId));

                // Limpiar archivos de sesión
                const fs = require('fs').promises;
                const path = require('path');
                const authPath = path.join(process.cwd(), 'auth_baileys', `user_${userId}`);

                try {
                    await fs.rm(authPath, { recursive: true, force: true });
                    console.log(`🧹 Sesión limpiada para usuario ${userId}`);
                } catch (err) {
                    console.log('No había sesión o ya fue eliminada');
                }

                res.json({
                    success: true,
                    message: `Sesión limpiada para usuario ${userId}. Puede reiniciar la instancia ahora.`
                });
            } catch (error) {
                console.error('Error limpiando sesión:', error);
                res.status(500).json({ error: 'Error limpiando sesión' });
            }
        });

        // Resetear contador global de reconexiones manualmente
        this.app.post('/api/diagnostic/reset-global-counter', requireAdmin, (req, res) => {
            try {
                const instanceManager = global.whatsappInstanceManager;
                if (!instanceManager) {
                    return res.status(503).json({ error: 'Instance manager no disponible' });
                }

                instanceManager.globalReconnectCount = 0;
                instanceManager.lastGlobalReconnectReset = Date.now();

                res.json({
                    success: true,
                    message: 'Contador global de reconexiones reseteado'
                });
            } catch (error) {
                console.error('Error reseteando contador:', error);
                res.status(500).json({ error: 'Error reseteando contador' });
            }
        });

        // Cancelar reconexión programada de un usuario
        this.app.post('/api/diagnostic/cancel-reconnect/:userId', requireAdmin, (req, res) => {
            try {
                const { userId } = req.params;
                const instanceManager = global.whatsappInstanceManager;

                if (!instanceManager) {
                    return res.status(503).json({ error: 'Instance manager no disponible' });
                }

                instanceManager.cancelScheduledReconnect(parseInt(userId));

                res.json({
                    success: true,
                    message: `Reconexión cancelada para usuario ${userId}`
                });
            } catch (error) {
                console.error('Error cancelando reconexión:', error);
                res.status(500).json({ error: 'Error cancelando reconexión' });
            }
        });

        // ===== ENDPOINTS MULTI-USUARIO E INSTANCIAS =====
        const multiUserEndpoints = require('./endpointsMultiUser');
        multiUserEndpoints(this.app, requireAuth, requireAdmin);

        // Servir React app para todas las rutas no-API (solo en producción)
        // IMPORTANTE: Este debe ser el último route handler
        if (process.env.NODE_ENV === 'production') {
            this.app.get('*', (req, res) => {
                // No capturar rutas API - dejar que express maneje el 404
                if (req.path.startsWith('/api/')) {
                    return res.status(404).json({ error: 'API endpoint not found' });
                }
                res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
            });
        }
    }

    calculateStats(logs) {
        const stats = {
            totalMessages: 0,
            userMessages: 0,
            botMessages: 0,
            errors: 0,
            uniqueUsers: new Set(),
            uniqueIndividuals: new Set(),
            uniqueGroups: new Set(),
            messagesByHour: {},
            averageResponseLength: 0
        };

        let totalResponseLength = 0;
        let responseCount = 0;

        // Verificar que logs sea un array
        if (!Array.isArray(logs)) {
            console.warn('calculateStats: logs no es un array', typeof logs);
            return {
                ...stats,
                uniqueUsers: stats.uniqueUsers.size,
                uniqueIndividuals: stats.uniqueIndividuals.size,
                uniqueGroups: stats.uniqueGroups.size
            };
        }

        logs.forEach(log => {
            if (log.type === 'USER') {
                stats.userMessages++;
                stats.totalMessages++;
                if (log.userId) {
                    stats.uniqueUsers.add(log.userId);
                    // Separar por tipo de chat
                    if (log.isGroup) {
                        stats.uniqueGroups.add(log.userId);
                    } else {
                        stats.uniqueIndividuals.add(log.userId);
                    }
                }
            } else if (log.type === 'BOT') {
                stats.botMessages++;
                stats.totalMessages++;
                totalResponseLength += log.message.length;
                responseCount++;
            } else if (log.type === 'ERROR') {
                stats.errors++;
            }

            // Agrupar por hora
            const hour = new Date(log.timestamp).getHours();
            stats.messagesByHour[hour] = (stats.messagesByHour[hour] || 0) + 1;
        });

        stats.uniqueUsers = stats.uniqueUsers.size;
        stats.uniqueIndividuals = stats.uniqueIndividuals.size;
        stats.uniqueGroups = stats.uniqueGroups.size;
        stats.averageResponseLength = responseCount > 0 ?
            Math.round(totalResponseLength / responseCount) : 0;

        return stats;
    }

    async start() {
        if (process.env.NODE_ENV === 'production') {
            // En producción, usar servidor Express normal
            this.app.listen(this.port, '0.0.0.0', () => {
                console.log(`📊 Servidor web de reportes en http://0.0.0.0:${this.port}`);
                logger.log('SYSTEM', `Servidor web iniciado en puerto ${this.port}`);
            });
        } else {
            // En desarrollo, usar ViteExpress
            ViteExpress.config({
                mode: 'development',
                viteConfigFile: path.join(__dirname, '../../vite.config.js')
            });

            ViteExpress.listen(this.app, this.port, () => {
                console.log(`📊 Servidor web con Vite en http://localhost:${this.port}`);
                logger.log('SYSTEM', `Servidor web con Vite iniciado en puerto ${this.port}`);
            });
        }
    }
}

module.exports = WebServer;