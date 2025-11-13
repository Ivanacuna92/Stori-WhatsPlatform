const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const multer = require('multer');
const logger = require('../services/logger');
const humanModeManager = require('../services/humanModeManager');
const salesManager = require('../services/salesManager');
const conversationAnalyzer = require('../services/conversationAnalyzer');
const authService = require('../services/authService');
const csvService = require('../services/csvService');
const systemConfigService = require('../services/systemConfigService');
const promptLoader = require('../services/promptLoader');
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

        // API endpoints para gestión de modo humano
        this.app.get('/api/human-states', async (req, res) => {
            try {
                const humanStates = await humanModeManager.getAllHumanStates();
                res.json(humanStates);
            } catch (error) {
                console.error('Error obteniendo estados humanos:', error);
                res.status(500).json({ error: 'Error obteniendo estados humanos' });
            }
        });

        this.app.post('/api/human-states', (req, res) => {
            try {
                const { phone, isHumanMode, mode } = req.body;
                
                if (!phone) {
                    return res.status(400).json({ error: 'Phone number is required' });
                }
                
                // Si se proporciona un modo específico (support, human, ai)
                if (mode) {
                    humanModeManager.setMode(phone, mode === 'ai' ? false : mode);
                    const modeText = mode === 'support' ? 'SOPORTE' : mode === 'human' ? 'HUMANO' : 'IA';
                    logger.log('SYSTEM', `Modo ${modeText} establecido para ${phone}`);
                    
                    res.json({ 
                        success: true, 
                        phone, 
                        mode,
                        isHumanMode: mode === 'human',
                        message: `Modo ${modeText} activado para ${phone}`
                    });
                } else {
                    // Compatibilidad con el método anterior
                    humanModeManager.setHumanMode(phone, isHumanMode);
                    logger.log('SYSTEM', `Modo ${isHumanMode ? 'HUMANO' : 'IA'} establecido para ${phone}`);
                    
                    res.json({ 
                        success: true, 
                        phone, 
                        isHumanMode,
                        message: `Modo ${isHumanMode ? 'HUMANO' : 'IA'} activado para ${phone}`
                    });
                }
            } catch (error) {
                console.error('Error actualizando estado humano:', error);
                res.status(500).json({ error: 'Error interno del servidor' });
            }
        });

        this.app.delete('/api/human-states/:phone', (req, res) => {
            try {
                const { phone } = req.params;
                humanModeManager.removeContact(phone);
                logger.log('SYSTEM', `Contacto ${phone} removido de gestión humana`);
                
                res.json({ 
                    success: true, 
                    message: `Contacto ${phone} removido`
                });
            } catch (error) {
                console.error('Error removiendo contacto:', error);
                res.status(500).json({ error: 'Error interno del servidor' });
            }
        });

        // API endpoint para obtener reportes con información de ventas
        this.app.get('/api/reports/:date?', async (req, res) => {
            try {
                let dateParam = req.params.date || 'all';
                let logs = [];
                
                // Manejar diferentes tipos de fecha
                if (dateParam === 'all') {
                    // Obtener TODOS los logs de la BD sin filtro de fecha
                    logs = await logger.getLogs(null, 10000); // null = sin filtro de fecha, 10000 = límite alto
                } else if (dateParam === 'month') {
                    // Obtener todos los logs del mes actual
                    const today = new Date();
                    const year = today.getFullYear();
                    const month = String(today.getMonth() + 1).padStart(2, '0');
                    
                    // Obtener todos los días del mes
                    const daysInMonth = new Date(year, today.getMonth() + 1, 0).getDate();
                    for (let day = 1; day <= daysInMonth; day++) {
                        const dateStr = `${year}-${month}-${String(day).padStart(2, '0')}`;
                        const dayLogs = await logger.getLogs(dateStr);
                        logs = logs.concat(dayLogs);
                    }
                } else if (dateParam === 'week') {
                    // Obtener logs de la última semana
                    const today = new Date();
                    for (let i = 0; i < 7; i++) {
                        const date = new Date(today);
                        date.setDate(date.getDate() - i);
                        const dateStr = date.toISOString().split('T')[0];
                        const dayLogs = await logger.getLogs(dateStr);
                        logs = logs.concat(dayLogs);
                    }
                } else if (dateParam === 'today') {
                    const date = new Date().toISOString().split('T')[0];
                    logs = await logger.getLogs(date);
                } else if (dateParam === 'yesterday') {
                    const yesterday = new Date();
                    yesterday.setDate(yesterday.getDate() - 1);
                    const date = yesterday.toISOString().split('T')[0];
                    logs = await logger.getLogs(date);
                } else {
                    // Fecha específica
                    logs = await logger.getLogs(dateParam);
                }
                const salesData = await salesManager.getAllSalesData();
                const humanStates = await humanModeManager.getAllHumanStates();
                
                // Agrupar conversaciones por usuario
                const conversationsByUser = {};
                
                logs.forEach(log => {
                    if (!log.userId) return;

                    // Obtener fecha del log
                    const logDate = new Date(log.timestamp).toISOString().split('T')[0];

                    if (!conversationsByUser[log.userId]) {
                        conversationsByUser[log.userId] = {
                            id: '',
                            telefono: log.userId,
                            fecha: logDate,
                            hora: '',
                            mensajes: 0,
                            posibleVenta: false,
                            ventaCerrada: false,
                            citaAgendada: false,
                            soporteActivado: false,
                            modoHumano: false,
                            isGroup: Boolean(log.isGroup),
                            conversacion: [],
                            primerMensaje: null,
                            ultimoMensaje: null
                        };
                    }
                    
                    const conv = conversationsByUser[log.userId];
                    
                    // Contar mensajes (incluir todos los tipos relevantes)
                    if (log.type === 'USER' || log.type === 'BOT' || log.type === 'HUMAN' || 
                        log.role === 'cliente' || log.role === 'bot' || log.role === 'soporte') {
                        conv.mensajes++;
                        conv.conversacion.push({
                            type: log.type,
                            role: log.role,
                            message: log.message,
                            timestamp: log.timestamp
                        });
                        
                        // Registrar primer y último mensaje
                        if (!conv.primerMensaje) {
                            conv.primerMensaje = log.timestamp;
                            conv.hora = new Date(log.timestamp).toLocaleTimeString('es-ES', {
                                hour: '2-digit',
                                minute: '2-digit'
                            });
                        }
                        conv.ultimoMensaje = log.timestamp;
                    }
                    
                    // Detectar si hubo soporte o modo humano
                    if (log.type === 'HUMAN' || log.role === 'soporte') {
                        conv.soporteActivado = true;
                    }
                    if (log.type === 'SYSTEM' && log.message && log.message.includes('Modo SOPORTE activado')) {
                        conv.soporteActivado = true;
                    }
                    if (log.type === 'SYSTEM' && log.message && log.message.includes('Modo HUMANO establecido')) {
                        conv.modoHumano = true;
                    }
                });
                
                // Generar reportes finales
                const reports = [];
                let idCounter = 1;
                
                for (const [userId, conv] of Object.entries(conversationsByUser)) {
                    // Generar ID único para la conversación usando la fecha real del log
                    const conversationId = salesManager.generateConversationId(userId, conv.fecha);
                    conv.id = `${conv.fecha}-${String(idCounter).padStart(3, '0')}`;
                    
                    // Obtener estado de ventas (AWAIT es crítico aquí)
                    const saleStatus = await salesManager.getSaleStatus(conversationId);
                    conv.posibleVenta = saleStatus.posibleVenta || false;
                    conv.ventaCerrada = saleStatus.ventaCerrada || saleStatus.analizadoIA || false;
                    conv.analizadoIA = saleStatus.analizadoIA || false;
                    conv.citaAgendada = saleStatus.citaAgendada || false;
                    
                    console.log(`Estado cargado para ${userId}:`, {
                        posibleVenta: conv.posibleVenta,
                        analizadoIA: conv.analizadoIA,
                        citaAgendada: conv.citaAgendada
                    });
                    
                    // Verificar estado actual de modo humano/soporte
                    const currentMode = humanModeManager.getMode(userId);
                    if (currentMode === 'support') {
                        conv.soporteActivado = true;
                    } else if (currentMode === 'human' || currentMode === true) {
                        conv.modoHumano = true;
                    }
                    
                    reports.push(conv);
                    idCounter++;
                }
                
                // Ordenar por hora de primer mensaje
                reports.sort((a, b) => {
                    if (a.primerMensaje && b.primerMensaje) {
                        return new Date(a.primerMensaje) - new Date(b.primerMensaje);
                    }
                    return 0;
                });
                
                res.json(reports);
            } catch (error) {
                console.error('Error generando reportes:', error);
                res.status(500).json({ error: 'Error interno del servidor' });
            }
        });

        // API endpoint para actualizar estado de venta
        this.app.post('/api/reports/sale-status', async (req, res) => {
            try {
                const { conversationId, phone, date, posibleVenta, ventaCerrada, citaAgendada, notas } = req.body;
                
                let id = conversationId;
                if (!id && phone && date) {
                    id = salesManager.generateConversationId(phone, date);
                }
                
                if (!id) {
                    return res.status(400).json({ error: 'Se requiere conversationId o phone y date' });
                }
                
                // Guardar en la base de datos usando setSaleStatus
                const result = await salesManager.setSaleStatus(id, {
                    posibleVenta,
                    ventaCerrada,
                    citaAgendada,
                    notas
                });
                
                res.json({ success: true, data: result });
            } catch (error) {
                console.error('Error actualizando estado de venta:', error);
                res.status(500).json({ error: 'Error interno del servidor' });
            }
        });

        // API endpoint para obtener estadísticas de ventas
        this.app.get('/api/sales-stats/:date?', (req, res) => {
            try {
                const date = req.params.date || null;
                const stats = salesManager.getSalesStats(date);
                res.json(stats);
            } catch (error) {
                console.error('Error obteniendo estadísticas de ventas:', error);
                res.status(500).json({ error: 'Error interno del servidor' });
            }
        });

        // API endpoint para analizar conversación con IA
        this.app.post('/api/analyze-conversation', async (req, res) => {
            try {
                const { messages } = req.body;
                
                if (!messages || !Array.isArray(messages)) {
                    return res.status(400).json({ error: 'Se requiere un array de mensajes' });
                }
                
                const analysis = await conversationAnalyzer.analyzeConversation(messages);
                res.json(analysis);
            } catch (error) {
                console.error('Error analizando conversación:', error);
                res.status(500).json({ error: 'Error interno del servidor' });
            }
        });

        // ===== ENDPOINTS DE GESTIÓN DE CSV (SOLO ADMIN) =====
        
        // Configurar multer para subida de archivos
        const upload = multer({
            storage: multer.memoryStorage(),
            limits: { fileSize: 10 * 1024 * 1024 }, // Límite de 10MB
            fileFilter: (req, file, cb) => {
                // Permitir CSV para uploads de naves
                if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
                    cb(null, true);
                }
                // Permitir multimedia para envío por WhatsApp
                else if (
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

        // Subir archivo CSV
        this.app.post('/api/csv/upload', requireAdmin, upload.single('csv'), async (req, res) => {
            try {
                if (!req.file) {
                    return res.status(400).json({ error: 'No se proporcionó archivo CSV' });
                }

                const result = await csvService.saveCSV(
                    req.file.originalname,
                    req.file.buffer.toString('utf8')
                );

                res.json(result);
            } catch (error) {
                console.error('Error subiendo CSV:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Listar archivos CSV subidos
        this.app.get('/api/csv/list', requireAdmin, async (req, res) => {
            try {
                const files = await csvService.listCSVFiles();
                res.json({ files });
            } catch (error) {
                console.error('Error listando CSVs:', error);
                res.status(500).json({ error: 'Error obteniendo lista de archivos' });
            }
        });

        // Eliminar archivo CSV
        this.app.delete('/api/csv/delete/:filename', requireAdmin, async (req, res) => {
            try {
                const result = await csvService.deleteCSV(req.params.filename);
                res.json(result);
            } catch (error) {
                console.error('Error eliminando CSV:', error);
                res.status(500).json({ error: error.message });
            }
        });

        // Descargar plantilla CSV
        this.app.get('/api/csv/template', (req, res) => {
            try {
                const templateContent = `Parque Industrial,Ubicación,Tipo,Ancho,Largo,Area (m2),Precio,Estado,Información Extra,Ventajas Estratégicas
Vernes,Carr. México - Qro,Nave Industrial,50,30,1500,750000,Disponible,Incluye oficinas administrativas,Acceso directo a autopistas principales
LuisOnorio,Av. Constituyentes,Micronave,25,20,500,350000,Pre-Venta,Cuenta con muelle de carga,Zona de alto flujo comercial`;

                res.setHeader('Content-Type', 'text/csv');
                res.setHeader('Content-Disposition', 'attachment; filename="plantilla_naves.csv"');
                res.send(templateContent);
            } catch (error) {
                console.error('Error descargando plantilla CSV:', error);
                res.status(500).json({ error: 'Error generando plantilla' });
            }
        });

        // Buscar en CSVs (endpoint interno para la IA)
        this.app.post('/api/csv/search', requireAuth, async (req, res) => {
            try {
                const { query } = req.body;
                if (!query) {
                    return res.status(400).json({ error: 'Query es requerido' });
                }

                const results = await csvService.searchInCSV(query);
                res.json({ results });
            } catch (error) {
                console.error('Error buscando en CSV:', error);
                res.status(500).json({ error: 'Error en la búsqueda' });
            }
        });

        // API endpoint para finalizar conversación
        this.app.post('/api/end-conversation', async (req, res) => {
            try {
                const { phone } = req.body;

                if (!phone) {
                    return res.status(400).json({
                        error: 'Phone is required',
                        details: 'Debe proporcionar el teléfono'
                    });
                }

                // Verificar si hay una instancia activa del bot
                if (!global.whatsappBot || !global.whatsappBot.sock) {
                    return res.status(503).json({
                        error: 'WhatsApp bot not available',
                        details: 'El bot de WhatsApp no está conectado'
                    });
                }

                // Formatear el número de teléfono para WhatsApp
                let formattedPhone = phone;
                if (!phone.includes('@')) {
                    formattedPhone = `${phone}@c.us`; // whatsapp-web.js usa @c.us
                }

                // Enviar mensaje de finalización
                const endMessage = '⏰ Tu sesión de conversación ha finalizado. Puedes escribirme nuevamente para iniciar una nueva conversación.';
                // WPPConnect usa client.sendText para mensajes de texto
                await global.whatsappBot.client.sendText(formattedPhone, endMessage);

                // Registrar el mensaje de finalización en los logs como mensaje del BOT
                const cleanPhone = phone.replace('@c.us', '').replace('@g.us', '');
                const isGroup = phone.includes('@g.us') || formattedPhone.includes('@g.us');
                logger.log('BOT', endMessage, cleanPhone, null, isGroup);

                // Limpiar la sesión
                const sessionManager = require('../services/sessionManager');
                sessionManager.clearSession(phone);

                // Cambiar a modo IA si estaba en modo humano
                humanModeManager.setMode(phone, false);

                // Registrar el evento
                logger.log('SYSTEM', `Conversación finalizada manualmente para ${phone}`, phone);

                res.json({
                    success: true,
                    message: 'Conversación finalizada correctamente',
                    phone: phone
                });

            } catch (error) {
                console.error('Error finalizando conversación:', error);
                res.status(500).json({
                    error: 'Error al finalizar conversación',
                    details: error.message
                });
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

        // API endpoint para obtener conversaciones archivadas
        this.app.get('/api/archived-conversations', requireAuth, async (req, res) => {
            try {
                const archived = await archiveService.getArchivedConversations();
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

                // Limpiar la sesión si existe
                const sessionManager = require('../services/sessionManager');
                sessionManager.clearSession(phone);

                // Cambiar a modo IA si estaba en modo humano
                humanModeManager.setMode(phone, false);

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

        // API endpoint para salir de un grupo
        this.app.post('/api/leave-group', async (req, res) => {
            try {
                const { phone } = req.body;

                if (!phone) {
                    return res.status(400).json({
                        error: 'Phone is required',
                        details: 'Debe proporcionar el ID del grupo'
                    });
                }

                // Verificar si hay una instancia activa del bot
                if (!global.whatsappBot || !global.whatsappBot.sock) {
                    return res.status(503).json({
                        error: 'WhatsApp bot not available',
                        details: 'El bot de WhatsApp no está conectado'
                    });
                }

                // Formatear el ID del grupo para WhatsApp
                let groupId = phone;
                if (!phone.includes('@')) {
                    groupId = `${phone}@g.us`;
                }

                // Verificar que sea un grupo
                if (!groupId.endsWith('@g.us')) {
                    return res.status(400).json({
                        error: 'Invalid group ID',
                        details: 'El ID proporcionado no es un grupo de WhatsApp'
                    });
                }

                // Salir del grupo usando Baileys
                await global.whatsappBot.sock.groupLeave(groupId);

                // Registrar el evento
                const cleanPhone = phone.replace('@g.us', '');
                logger.log('SYSTEM', `Bot salió del grupo ${cleanPhone}`, cleanPhone);

                // Limpiar la sesión del grupo
                const sessionManager = require('../services/sessionManager');
                sessionManager.clearSession(phone);

                // Eliminar de modo humano si existe
                humanModeManager.removeContact(phone);

                res.json({
                    success: true,
                    message: 'Bot salió del grupo correctamente',
                    groupId: phone
                });

            } catch (error) {
                console.error('Error saliendo del grupo:', error);
                res.status(500).json({
                    error: 'Error al salir del grupo',
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

        // ===== ENDPOINTS DE CONFIGURACIÓN DEL SISTEMA =====

        // Obtener todas las configuraciones
        this.app.get('/api/system-config', requireAuth, async (req, res) => {
            try {
                const configs = await systemConfigService.getAllConfigs();
                res.json(configs);
            } catch (error) {
                console.error('Error obteniendo configuraciones:', error);
                res.status(500).json({ error: 'Error obteniendo configuraciones' });
            }
        });

        // Obtener una configuración específica
        this.app.get('/api/system-config/:key', requireAuth, async (req, res) => {
            try {
                const { key } = req.params;
                const value = await systemConfigService.getConfig(key);
                res.json({ key, value });
            } catch (error) {
                console.error(`Error obteniendo configuración ${req.params.key}:`, error);
                res.status(500).json({ error: 'Error obteniendo configuración' });
            }
        });

        // Actualizar una configuración (solo admin)
        this.app.put('/api/system-config/:key', requireAdmin, async (req, res) => {
            try {
                const { key } = req.params;
                const { value } = req.body;

                if (value === undefined) {
                    return res.status(400).json({ error: 'Value is required' });
                }

                const success = await systemConfigService.setConfig(key, value);

                if (success) {
                    res.json({ success: true, key, value });
                } else {
                    res.status(500).json({ error: 'Error actualizando configuración' });
                }
            } catch (error) {
                console.error(`Error actualizando configuración ${req.params.key}:`, error);
                res.status(500).json({ error: 'Error actualizando configuración' });
            }
        });

        // Endpoint específico para toggle de IA en grupos
        this.app.post('/api/system-config/groups-ai-toggle', requireAdmin, async (req, res) => {
            try {
                const { enabled } = req.body;

                if (typeof enabled !== 'boolean') {
                    return res.status(400).json({ error: 'enabled debe ser un booleano' });
                }

                const success = await systemConfigService.setGroupsAIEnabled(enabled);

                if (success) {
                    logger.log('SYSTEM', `IA en grupos ${enabled ? 'activada' : 'desactivada'}`);
                    res.json({
                        success: true,
                        enabled,
                        message: `IA en grupos ${enabled ? 'activada' : 'desactivada'} correctamente`
                    });
                } else {
                    res.status(500).json({ error: 'Error actualizando configuración' });
                }
            } catch (error) {
                console.error('Error en toggle de IA en grupos:', error);
                res.status(500).json({ error: 'Error actualizando configuración' });
            }
        });

        // Endpoint específico para toggle de IA individual
        this.app.post('/api/system-config/individual-ai-toggle', requireAdmin, async (req, res) => {
            try {
                const { enabled } = req.body;

                if (typeof enabled !== 'boolean') {
                    return res.status(400).json({ error: 'enabled debe ser un booleano' });
                }

                const success = await systemConfigService.setIndividualAIEnabled(enabled);

                if (success) {
                    logger.log('SYSTEM', `IA individual ${enabled ? 'activada' : 'desactivada'}`);
                    res.json({
                        success: true,
                        enabled,
                        message: `IA individual ${enabled ? 'activada' : 'desactivada'} correctamente`
                    });
                } else {
                    res.status(500).json({ error: 'Error actualizando configuración' });
                }
            } catch (error) {
                console.error('Error en toggle de IA individual:', error);
                res.status(500).json({ error: 'Error actualizando configuración' });
            }
        });

        // ===== ENDPOINTS DE GESTIÓN DE PROMPTS =====

        // Obtener ambos prompts
        this.app.get('/api/prompts', requireAuth, async (req, res) => {
            try {
                const individualPrompt = promptLoader.load();
                const groupPrompt = promptLoader.loadGroupPrompt();

                res.json({
                    individual: individualPrompt,
                    group: groupPrompt
                });
            } catch (error) {
                console.error('Error obteniendo prompts:', error);
                res.status(500).json({ error: 'Error obteniendo prompts' });
            }
        });

        // Actualizar prompt individual (solo admin)
        this.app.put('/api/prompts/individual', requireAdmin, async (req, res) => {
            try {
                const { prompt } = req.body;

                if (!prompt || typeof prompt !== 'string') {
                    return res.status(400).json({ error: 'Prompt es requerido y debe ser un string' });
                }

                const success = promptLoader.update(prompt);

                if (success) {
                    logger.log('SYSTEM', 'Prompt individual actualizado');
                    res.json({
                        success: true,
                        message: 'Prompt individual actualizado correctamente'
                    });
                } else {
                    res.status(500).json({ error: 'Error actualizando prompt' });
                }
            } catch (error) {
                console.error('Error actualizando prompt individual:', error);
                res.status(500).json({ error: 'Error actualizando prompt' });
            }
        });

        // Actualizar prompt de grupos (solo admin)
        this.app.put('/api/prompts/group', requireAdmin, async (req, res) => {
            try {
                const { prompt } = req.body;

                if (!prompt || typeof prompt !== 'string') {
                    return res.status(400).json({ error: 'Prompt es requerido y debe ser un string' });
                }

                const success = promptLoader.updateGroupPrompt(prompt);

                if (success) {
                    logger.log('SYSTEM', 'Prompt de grupos actualizado');
                    res.json({
                        success: true,
                        message: 'Prompt de grupos actualizado correctamente'
                    });
                } else {
                    res.status(500).json({ error: 'Error actualizando prompt' });
                }
            } catch (error) {
                console.error('Error actualizando prompt de grupos:', error);
                res.status(500).json({ error: 'Error actualizando prompt' });
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