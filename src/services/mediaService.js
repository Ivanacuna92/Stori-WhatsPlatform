const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class MediaService {
    constructor() {
        this.mediaDir = path.join(process.cwd(), 'media');
        this.ensureMediaDirectory();
    }

    async ensureMediaDirectory() {
        try {
            await fs.mkdir(this.mediaDir, { recursive: true });
            await fs.mkdir(path.join(this.mediaDir, 'images'), { recursive: true });
            await fs.mkdir(path.join(this.mediaDir, 'documents'), { recursive: true });
            await fs.mkdir(path.join(this.mediaDir, 'videos'), { recursive: true });
            await fs.mkdir(path.join(this.mediaDir, 'audio'), { recursive: true });
        } catch (error) {
            console.error('Error creando directorios de media:', error);
        }
    }

    /**
     * Guarda un archivo multimedia
     * @param {Buffer} buffer - Buffer del archivo
     * @param {string} mimetype - MIME type del archivo
     * @param {string} originalName - Nombre original del archivo (opcional)
     * @returns {Promise<Object>} - Info del archivo guardado
     */
    async saveMedia(buffer, mimetype, originalName = null) {
        try {
            // Determinar el tipo de media y extensión
            const mediaInfo = this.getMediaInfo(mimetype, originalName);

            // Generar nombre único para el archivo
            const timestamp = Date.now();
            const hash = crypto.createHash('md5').update(buffer).digest('hex').substring(0, 8);
            const filename = `${timestamp}_${hash}${mediaInfo.extension}`;

            // Ruta completa donde guardar el archivo
            const subDir = path.join(this.mediaDir, mediaInfo.type);
            const filepath = path.join(subDir, filename);

            // Guardar el archivo
            await fs.writeFile(filepath, buffer);

            console.log(`📁 Archivo guardado: ${filename} (${mediaInfo.type})`);

            return {
                filename,
                filepath,
                mediaType: mediaInfo.type,
                mimetype,
                size: buffer.length,
                url: `/api/media/${mediaInfo.type}/${filename}`
            };
        } catch (error) {
            console.error('Error guardando archivo multimedia:', error);
            throw error;
        }
    }

    /**
     * Obtiene información sobre el tipo de media y extensión
     * @param {string} mimetype - MIME type
     * @param {string} originalName - Nombre original (opcional)
     * @returns {Object} - Info de media
     */
    getMediaInfo(mimetype, originalName) {
        let type = 'documents'; // Por defecto
        let extension = '';

        // Determinar tipo y extensión por MIME type
        if (mimetype.startsWith('image/')) {
            type = 'images';
            if (mimetype === 'image/jpeg') extension = '.jpg';
            else if (mimetype === 'image/png') extension = '.png';
            else if (mimetype === 'image/gif') extension = '.gif';
            else if (mimetype === 'image/webp') extension = '.webp';
            else extension = '.img';
        } else if (mimetype === 'application/pdf') {
            type = 'documents';
            extension = '.pdf';
        } else if (mimetype.startsWith('video/')) {
            type = 'videos';
            extension = '.mp4';
        } else if (mimetype.startsWith('audio/')) {
            type = 'audio';
            extension = '.mp3';
        } else if (mimetype.includes('document') || mimetype.includes('officedocument')) {
            type = 'documents';
            if (mimetype.includes('word')) extension = '.docx';
            else if (mimetype.includes('excel') || mimetype.includes('spreadsheet')) extension = '.xlsx';
            else if (mimetype.includes('presentation')) extension = '.pptx';
            else extension = '.doc';
        }

        // Si no se pudo determinar la extensión del MIME, intentar con el nombre
        if (!extension && originalName) {
            const ext = path.extname(originalName).toLowerCase();
            if (ext) extension = ext;
        }

        // Si aún no hay extensión, usar genérica
        if (!extension) extension = '.file';

        return { type, extension };
    }

    /**
     * Lee un archivo multimedia
     * @param {string} mediaType - Tipo de media (images, documents, etc)
     * @param {string} filename - Nombre del archivo
     * @returns {Promise<Buffer>} - Buffer del archivo
     */
    async readMedia(mediaType, filename) {
        try {
            const filepath = path.join(this.mediaDir, mediaType, filename);
            return await fs.readFile(filepath);
        } catch (error) {
            console.error('Error leyendo archivo multimedia:', error);
            throw error;
        }
    }

    /**
     * Verifica si un archivo existe
     * @param {string} mediaType - Tipo de media
     * @param {string} filename - Nombre del archivo
     * @returns {Promise<boolean>}
     */
    async fileExists(mediaType, filename) {
        try {
            const filepath = path.join(this.mediaDir, mediaType, filename);
            await fs.access(filepath);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * Elimina un archivo multimedia
     * @param {string} mediaType - Tipo de media
     * @param {string} filename - Nombre del archivo
     * @returns {Promise<boolean>}
     */
    async deleteMedia(mediaType, filename) {
        try {
            const filepath = path.join(this.mediaDir, mediaType, filename);
            await fs.unlink(filepath);
            console.log(`🗑️ Archivo eliminado: ${filename}`);
            return true;
        } catch (error) {
            console.error('Error eliminando archivo:', error);
            return false;
        }
    }

    /**
     * Obtiene el MIME type de un archivo basado en su extensión
     * @param {string} filename - Nombre del archivo
     * @returns {string} - MIME type
     */
    getMimeType(filename) {
        const ext = path.extname(filename).toLowerCase();
        const mimeTypes = {
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.gif': 'image/gif',
            '.webp': 'image/webp',
            '.pdf': 'application/pdf',
            '.doc': 'application/msword',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.xls': 'application/vnd.ms-excel',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            '.mp4': 'video/mp4',
            '.mp3': 'audio/mpeg',
            '.ogg': 'audio/ogg'
        };
        return mimeTypes[ext] || 'application/octet-stream';
    }
}

module.exports = new MediaService();
