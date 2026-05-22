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

        // Matar procesos zombie de Chrome antes de iniciar
        await whatsappInstanceManager.killZombieChrome();

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

        // Filtrar solo usuarios que tienen sesión guardada
        const fs = require('fs');
        const path = require('path');
        const usersWithSession = [];

        for (const user of users) {
            const tokensPath = path.join(process.cwd(), 'tokens', `user_${user.id}`);
            try {
                // Verificar si existe la carpeta de tokens y tiene archivos
                if (fs.existsSync(tokensPath)) {
                    const files = fs.readdirSync(tokensPath);
                    if (files.length > 0 && !files.every(f => f.startsWith('.'))) {
                        usersWithSession.push(user);
                    } else {
                        console.log(`⏭️  Saltando ${user.email} - Sin sesión guardada`);
                    }
                } else {
                    console.log(`⏭️  Saltando ${user.email} - Sin sesión guardada`);
                }
            } catch (err) {
                console.log(`⏭️  Saltando ${user.email} - Error verificando sesión`);
            }
        }

        console.log(`🔑 Encontrados ${usersWithSession.length} usuarios con sesión guardada de ${users.length} totales`);

        // INICIALIZACIÓN SECUENCIAL con delays para evitar condiciones de carrera
        let successCount = 0;
        let failCount = 0;

        for (let i = 0; i < usersWithSession.length; i++) {
            const user = usersWithSession[i];
            try {
                console.log(`[${i + 1}/${usersWithSession.length}] Iniciando instancia para ${user.email}...`);

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

                // Delay de 1 segundo entre cada inicio (reducido porque ya tienen sesión)
                if (i < usersWithSession.length - 1) {
                    await delay(1000);
                }
            } catch (error) {
                console.error(`❌ Error iniciando instancia para ${user.email}:`, error.message);
                failCount++;

                // Delay más largo en caso de error para permitir recuperación
                if (i < usersWithSession.length - 1) {
                    await delay(2000);
                }
            }
        }

        console.log(`✅ Inicialización completada: ${successCount} exitosas, ${failCount} fallidas`);
        console.log(`ℹ️  ${users.length - usersWithSession.length} usuarios sin sesión fueron omitidos`);

        // Iniciar heartbeat para monitorear instancias
        whatsappInstanceManager.startHeartbeat();
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
            // WPPConnect guarda sesiones en tokens/user_{id}
            const tokensPath = path.join(process.cwd(), 'tokens', `user_${user.id}`);

            // Verificar si existe la carpeta de tokens
            try {
                await fs.access(tokensPath);

                // Verificar si hay archivos de sesión
                const files = await fs.readdir(tokensPath);

                // Si la carpeta está vacía o solo tiene archivos temporales, eliminarla
                if (files.length === 0 || files.every(f => f.startsWith('.'))) {
                    console.log(`🧹 Limpiando sesión vacía para usuario ${user.id}`);
                    await fs.rm(tokensPath, { recursive: true, force: true });
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

        // Iniciar servidor web
        await webServer.start();

        // Limpiar procesos zombie de Chrome al arrancar
        await whatsappInstanceManager.killZombieChrome();

        // Iniciar heartbeat para monitorear instancias (cuando se creen bajo demanda)
        whatsappInstanceManager.startHeartbeat();

        console.log('✅ Servidor listo - Instancias WhatsApp se inician bajo demanda al hacer login');

        // NO iniciar instancias automáticamente - se inician cuando el usuario hace login
    } catch (error) {
        console.error('❌ Error iniciando aplicación:', error);
        process.exit(1);
    }
}

start().catch(console.error);

// Manejar cierre limpio
process.on('SIGINT', async () => {
    console.log('\n⏹️  Cerrando aplicación...');

    // Detener heartbeat
    whatsappInstanceManager.stopHeartbeat();

    // Detener todas las instancias
    const instances = whatsappInstanceManager.getInstances();
    for (const instance of instances) {
        await whatsappInstanceManager.stopInstance(instance.userId);
    }

    process.exit(0);
});