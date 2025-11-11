-- Agregar soporte para archivos multimedia en conversation_logs
ALTER TABLE conversation_logs
ADD COLUMN media_type VARCHAR(50) DEFAULT NULL COMMENT 'Tipo de archivo: image, document, video, audio',
ADD COLUMN media_filename VARCHAR(255) DEFAULT NULL COMMENT 'Nombre del archivo guardado',
ADD COLUMN media_mimetype VARCHAR(100) DEFAULT NULL COMMENT 'MIME type del archivo',
ADD COLUMN media_url VARCHAR(500) DEFAULT NULL COMMENT 'URL o ruta del archivo',
ADD COLUMN media_caption TEXT DEFAULT NULL COMMENT 'Caption del archivo multimedia';

-- Índice para búsquedas por tipo de media
CREATE INDEX idx_media_type ON conversation_logs(media_type);
