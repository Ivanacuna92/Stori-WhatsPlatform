const whatsappInstanceManager = require('./src/services/whatsappInstanceManager');
const WebServer = require('./src/web/server');
const config = require('./src/config/config');
const databaseInit = require('./src/services/databaseInit');
const database = require('./src/services/database');

// Exponer el manager globalmente para el servidor web
global.whatsappInstanceManager = whatsappInstanceManager;

// Crear instancia del servidor web
const webServer = new WebServer(config.webPort);

// Helper para delay
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Iniciar todas las instancias de WhatsApp para usuarios activos
async function startAllInstances() {
    try {
        console.log('🚀 Iniciando instancias de WhatsApp...');

        // Obtener todos los usuarios activos
        const users = await database.findAll(
            'support_users',
            'active = 1',
            []
        );

        console.log(`📱 Encontrados ${users.length} usuarios activos`);

        // Limpiar sesiones corruptas antes de iniciar
        console.log('🧹 Verificando y limpiando sesiones corruptas...');
        await cleanCorruptedSessions(users);

        // INICIALIZACIÓN SECUENCIAL con delays para evitar condiciones de carrera
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < users.length; i++) {
            const user = users[i];
            try {
                console.log(`[${i + 1}/${users.length}] Iniciando instancia para ${user.email}...`);

                const result = await whatsappInstanceManager.startInstance(
                    user.id,
                    user.name || user.email
                );

                if (result) {
                    console.log(`✅ Instancia iniciada para ${user.email}`);
                    successCount++;
                } else {
                    console.log(`⚠️  Instancia no pudo iniciarse para ${user.email} (límite global alcanzado)`);
                    failCount++;
                }

                // Delay de 2 segundos entre cada inicio para evitar sobrecarga
                if (i < users.length - 1) {
                    await delay(2000);
                }
            } catch (error) {
                console.error(`❌ Error iniciando instancia para ${user.email}:`, error.message);
                failCount++;

                // Delay más largo en caso de error para permitir recuperación
                if (i < users.length - 1) {
                    await delay(3000);
                }
            }
        }

        console.log(`✅ Inicialización completada: ${successCount} exitosas, ${failCount} fallidas`);
    } catch (error) {
        console.error('❌ Error iniciando instancias:', error);
    }
}

// Limpiar sesiones corruptas o con demasiados intentos fallidos
async function cleanCorruptedSessions(users) {
    const fs = require('fs').promises;
    const path = require('path');

    for (const user of users) {
        try {
            const authPath = path.join(process.cwd(), 'auth_baileys', `user_${user.id}`);

            // Verificar si existe la carpeta de autenticación
            try {
                await fs.access(authPath);

                // Verificar si hay archivos de sesión
                const files = await fs.readdir(authPath);

                // Si la carpeta está vacía o solo tiene archivos temporales, eliminarla
                if (files.length === 0 || files.every(f => f.startsWith('.'))) {
                    console.log(`🧹 Limpiando sesión vacía para usuario ${user.id}`);
                    await fs.rm(authPath, { recursive: true, force: true });
                }
            } catch (err) {
                // La carpeta no existe, no hacer nada
            }
        } catch (error) {
            console.error(`Error limpiando sesión para usuario ${user.id}:`, error.message);
        }
    }
}

// Iniciar aplicación
async function start() {
    try {
        // Inicializar base de datos
        await databaseInit.createTables();

        // Iniciar todas las instancias de WhatsApp
        await startAllInstances();

        // Iniciar servidor web
        webServer.start();
    } catch (error) {
        console.error('❌ Error iniciando aplicación:', error);
        process.exit(1);
    }
}

start().catch(console.error);

// Manejar cierre limpio
process.on('SIGINT', async () => {
    console.log('\n⏹️  Cerrando aplicación...');

    // Detener todas las instancias
    const instances = whatsappInstanceManager.getInstances();
    for (const instance of instances) {
        await whatsappInstanceManager.stopInstance(instance.userId);
    }

    process.exit(0);
});