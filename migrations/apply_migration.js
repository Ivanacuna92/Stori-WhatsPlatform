#!/usr/bin/env node

/**
 * Script para aplicar la migración de soporte multimedia
 *
 * Uso: node migrations/apply_migration.js
 */

const database = require('../src/services/database');
const fs = require('fs');
const path = require('path');

async function applyMigration() {
    console.log('🔄 Iniciando migración de base de datos...');

    try {
        // Conectar a la base de datos
        await database.connect();
        console.log('✅ Conectado a la base de datos');

        // Leer el archivo SQL
        const sqlFilePath = path.join(__dirname, 'add_media_support.sql');
        const sql = fs.readFileSync(sqlFilePath, 'utf8');

        // Remover comentarios SQL
        const cleanedSQL = sql
            .split('\n')
            .filter(line => !line.trim().startsWith('--'))
            .join('\n');

        // Separar las sentencias SQL (por punto y coma)
        const statements = cleanedSQL
            .split(';')
            .map(s => s.trim())
            .filter(s => s.length > 0);

        console.log(`📝 Ejecutando ${statements.length} sentencias SQL...`);

        // Ejecutar cada sentencia
        for (let i = 0; i < statements.length; i++) {
            const statement = statements[i];
            try {
                console.log(`   [${i + 1}/${statements.length}] Ejecutando...`);
                await database.query(statement);
                console.log(`   ✅ Completado`);
            } catch (error) {
                // Si el error es porque la columna ya existe, es OK
                if (error.code === 'ER_DUP_FIELDNAME' || error.message.includes('Duplicate column')) {
                    console.log(`   ⚠️  La columna ya existe (se omite)`);
                } else if (error.code === 'ER_DUP_KEYNAME' || error.message.includes('Duplicate key')) {
                    console.log(`   ⚠️  El índice ya existe (se omite)`);
                } else {
                    throw error;
                }
            }
        }

        console.log('✅ Migración completada exitosamente');
        console.log('');
        console.log('📋 Resumen de cambios:');
        console.log('   - Se agregaron 5 columnas a conversation_logs:');
        console.log('     • media_type: Tipo de archivo (image, document, video, audio)');
        console.log('     • media_filename: Nombre del archivo guardado');
        console.log('     • media_mimetype: MIME type del archivo');
        console.log('     • media_url: URL del archivo');
        console.log('     • media_caption: Caption del archivo');
        console.log('   - Se creó índice idx_media_type para búsquedas optimizadas');
        console.log('');
        console.log('🎉 El sistema ahora soporta imágenes, PDFs y otros archivos multimedia');

        // Cerrar conexión
        await database.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error aplicando migración:', error.message);
        console.error('Detalles:', error);
        await database.close();
        process.exit(1);
    }
}

// Ejecutar migración
applyMigration();
