const bcrypt = require('bcrypt');
const database = require('./src/services/database');

async function resetPassword(email, newPassword) {
    try {
        await database.connect();

        // Verificar que el usuario existe
        const user = await database.findOne(
            'support_users',
            'email = ?',
            [email]
        );

        if (!user) {
            console.error(`❌ Usuario con email ${email} no encontrado`);
            await database.close();
            return;
        }

        // Generar hash de la nueva contraseña
        const passwordHash = await bcrypt.hash(newPassword, 10);

        // Actualizar contraseña
        await database.update(
            'support_users',
            { password_hash: passwordHash },
            'email = ?',
            [email]
        );

        // Invalidar todas las sesiones del usuario
        await database.delete('support_sessions', 'user_id = ?', [user.id]);

        console.log(`✅ Contraseña actualizada para ${email}`);
        console.log(`✅ Todas las sesiones activas han sido cerradas`);
        await database.close();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error:', error.message);
        await database.close();
        process.exit(1);
    }
}

// Verificar argumentos
const args = process.argv.slice(2);
if (args.length !== 2) {
    console.log('Uso: node reset-password.js <email> <nueva_contraseña>');
    console.log('Ejemplo: node reset-password.js admin@aloia.com NuevaPass123');
    process.exit(1);
}

const [email, newPassword] = args;

if (newPassword.length < 6) {
    console.error('❌ La contraseña debe tener al menos 6 caracteres');
    process.exit(1);
}

resetPassword(email, newPassword);
