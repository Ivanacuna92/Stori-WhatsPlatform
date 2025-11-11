-- ====================================================
-- MIGRACIÓN: Sistema de Archivado de Conversaciones
-- ====================================================
-- Fecha: 2025
-- Descripción: Agregar tabla para gestionar conversaciones archivadas

-- Crear tabla para conversaciones archivadas
CREATE TABLE IF NOT EXISTS archived_conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL COMMENT 'Teléfono del contacto',
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de archivado',
    archived_by INT DEFAULT NULL COMMENT 'ID del usuario que archivó (de users table)',
    INDEX idx_user_id (user_id),
    UNIQUE KEY unique_user_id (user_id) COMMENT 'Un contacto solo puede estar archivado una vez'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Conversaciones archivadas - mantiene el historial de qué conversaciones están archivadas';

-- Verificar que se creó correctamente
SELECT 'Tabla archived_conversations creada exitosamente' AS status;
