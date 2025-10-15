const whatsappInstanceManager = require('./src/services/whatsappInstanceManager');
const WebServer = require('./src/web/server');
const config = require('./src/config/config');
const databaseInit = require('./src/services/databaseInit');
const database = require('./src/services/database');

// Exponer el manager globalmente para el servidor web
global.whatsappInstanceManager = whatsappInstanceManager;

// Crear instancia del servidor web
const webServer = new WebServer(config.webPort);

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

        // Iniciar instancia para cada usuario
        for (const user of users) {
            try {
                await whatsappInstanceManager.startInstance(
                    user.id,
                    user.name || user.email
                );
                console.log(`✅ Instancia iniciada para ${user.email}`);
            } catch (error) {
                console.error(`❌ Error iniciando instancia para ${user.email}:`, error.message);
            }
        }

        console.log('✅ Todas las instancias iniciadas');
    } catch (error) {
        console.error('❌ Error iniciando instancias:', error);
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