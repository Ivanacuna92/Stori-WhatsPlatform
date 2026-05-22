const wppconnect = require('@wppconnect-team/wppconnect');
const config = require('../config/config');
const logger = require('../services/logger');
const mediaService = require('../services/mediaService');

class WhatsAppBot {
    constructor() {
        this.client = null;
        this.currentQR = null;
        this.isReady = false;
    }

    async start() {
        console.log('Iniciando bot de WhatsApp con WPPConnect...');

        try {
            // Crear cliente WPPConnect
            this.client = await wppconnect.create({
                session: 'main_bot',
                headless: true,
                devtools: false,
                useChrome: true,
                debug: false,
                logQR: false,
                browserArgs: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                    '--disable-accelerated-2d-canvas',
                    '--no-first-run',
                    '--no-zygote',
                    '--disable-gpu'
                ],
                // Capturar QR
                catchQR: (base64Qr, asciiQR, attempts, urlCode) => {
                    console.log('Escanea este código QR con WhatsApp:');
                    console.log('O visita: http://tu-servidor:3001/qr');
                    this.currentQR = base64Qr;
                    console.log(asciiQR); // Mostrar QR en terminal
                },
                // Configurar directorio de sesión
                folderNameToken: 'tokens',
                mkdirFolderToken: '',
                // Callbacks de estado
                statusFind: (statusSession, session) => {
                    console.log(`📊 Estado de sesión: ${statusSession}`);

                    if (statusSession === 'isLogged' || statusSession === 'qrReadSuccess') {
                        console.log('¡Bot de WhatsApp conectado y listo!');
                        this.currentQR = null;
                        this.isReady = true;
                        logger.log('SYSTEM', 'Bot iniciado correctamente con WPPConnect');
                    } else if (statusSession === 'autocloseCalled' || statusSession === 'desconnectedMobile') {
                        console.log('Cliente desconectado');
                        this.isReady = false;
                        logger.log('SYSTEM', 'Bot desconectado');
                    }
                }
            });

            // Event: Mensaje recibido
            this.client.onMessage(async (message) => {
                try {
                    // Ignorar mensajes de grupos y mensajes propios
                    if (message.isGroupMsg || message.fromMe) {
                        return;
                    }

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

                    console.log('✅ Mensaje de contacto individual:', from);

                    const userId = from.replace('@c.us', '');
                    const userName = message.sender.pushname || message.sender.name || userId;

                    // Detectar tipo de mensaje y extraer contenido
                    let conversation = '';
                    let mediaInfo = null;

                    if (message.type === 'chat') {
                        conversation = message.body || '';
                    } else if (message.type === 'image') {
                        try {
                            console.log('📸 Imagen detectada');
                            const mediaData = await message.downloadMedia();

                            if (mediaData) {
                                const buffer = Buffer.from(mediaData, 'base64');
                                const caption = message.caption || 'Imagen sin descripción';

                                // Guardar la imagen
                                const savedMedia = await mediaService.saveMedia(
                                    buffer,
                                    message.mimetype || 'image/jpeg',
                                    'image'
                                );

                                mediaInfo = {
                                    ...savedMedia,
                                    caption: caption
                                };

                                conversation = caption;
                                console.log(`✅ Imagen guardada: ${savedMedia.filename}`);
                            }
                        } catch (error) {
                            console.error('Error procesando imagen:', error);
                            conversation = '[Imagen - Error al procesar]';
                        }
                    } else if (message.type === 'document') {
                        try {
                            const allowedTypes = [
                                'application/pdf',
                                'application/msword',
                                'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                                'application/vnd.ms-excel',
                                'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
                            ];

                            if (allowedTypes.includes(message.mimetype)) {
                                console.log(`📄 Documento detectado: ${message.mimetype}`);
                                const mediaData = await message.downloadMedia();

                                if (mediaData) {
                                    const buffer = Buffer.from(mediaData, 'base64');
                                    const caption = message.caption || message.filename || 'Documento sin nombre';

                                    // Guardar el documento
                                    const savedMedia = await mediaService.saveMedia(
                                        buffer,
                                        message.mimetype,
                                        message.filename
                                    );

                                    mediaInfo = {
                                        ...savedMedia,
                                        caption: caption
                                    };

                                    conversation = caption;
                                    console.log(`✅ Documento guardado: ${savedMedia.filename}`);
                                }
                            } else {
                                console.log(`⚠️ Tipo de documento no soportado: ${message.mimetype}`);
                                conversation = `[Documento tipo ${message.mimetype} no soportado]`;
                            }
                        } catch (error) {
                            console.error('Error procesando documento:', error);
                            conversation = '[Documento - Error al procesar]';
                        }
                    } else {
                        console.log(`⚠️ Tipo de mensaje no soportado: ${message.type}`);
                        return;
                    }

                    // Ignorar mensajes vacíos
                    if (!conversation || conversation.trim() === '') {
                        console.log('Mensaje ignorado - Sin contenido');
                        return;
                    }

                    // Registrar el mensaje (con o sin archivo multimedia)
                    await logger.log('cliente', conversation, userId, userName, false, null, null, null, mediaInfo);

                    // Solo registrar el mensaje entrante
                    console.log(`📨 Mensaje recibido de ${userName} (${userId})`);

                } catch (error) {
                    await this.handleError(error, message);
                }
            });

            // Event: ACK (confirmación de lectura/entrega)
            this.client.onAck(async (ack) => {
                try {
                    const messageId = ack.id?.id;
                    if (!messageId) return;

                    const userId = ack.to?.replace('@c.us', '');

                    let status = null;

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
                        console.log(`✅ Estado actualizado: ${messageId} -> ${status} (Usuario: ${userId})`);
                    }
                } catch (error) {
                    console.error('Error actualizando estado de mensaje:', error);
                }
            });

        } catch (error) {
            console.error('Error iniciando bot:', error);
            logger.log('ERROR', 'Error iniciando bot: ' + error.message);
            throw error;
        }
    }

    async handleError(error, message) {
        console.error('Error procesando mensaje:', error);

        const from = message.from;
        const userId = from.replace('@c.us', '');

        let errorMessage = 'Lo siento, ocurrió un error. Inténtalo de nuevo.';

        if (error.message.includes('autenticación') || error.message.includes('API key')) {
            errorMessage = 'Error de configuración del bot. Por favor, contacta al administrador.';
        }

        try {
            await this.client.sendText(from, errorMessage);
            logger.log('ERROR', error.message, userId);
        } catch (sendError) {
            console.error('Error enviando mensaje de error:', sendError);
        }
    }

    async stop() {
        console.log('Cerrando bot...');
        if (this.client) {
            await this.client.close();
        }
    }

    async clearSession() {
        const fs = require('fs').promises;
        const path = require('path');
        const tokensPath = path.join(process.cwd(), 'tokens', 'main_bot');

        try {
            await fs.rm(tokensPath, { recursive: true, force: true });
            console.log('Sesión eliminada correctamente');
        } catch (err) {
            console.log('No había sesión previa o ya fue eliminada');
        }
    }

    async logout() {
        console.log('Cerrando sesión de WhatsApp...');
        try {
            if (this.client) {
                await this.client.logout();
            }

            await this.clearSession();

            // Reiniciar el bot para generar nuevo QR
            setTimeout(() => this.start(), 2000);
            return true;
        } catch (error) {
            console.error('Error al cerrar sesión:', error);
            return false;
        }
    }
}

module.exports = WhatsAppBot;
