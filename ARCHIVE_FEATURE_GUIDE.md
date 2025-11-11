# 📦 Guía de Funcionalidad de Archivado de Conversaciones

Esta funcionalidad permite archivar conversaciones para mantener el panel organizado sin perder el historial.

## 📋 Tabla de Contenidos
- [Instalación](#instalación)
- [Cómo Usar](#cómo-usar)
- [Arquitectura](#arquitectura)
- [API Endpoints](#api-endpoints)
- [Componentes](#componentes)

---

## 🚀 Instalación

### 1. Ejecutar Migración de Base de Datos

**IMPORTANTE:** Debes ejecutar manualmente el siguiente SQL en tu base de datos:

```sql
-- Ejecuta el contenido del archivo:
-- migrations/add_archived_conversations.sql
```

O copia y pega este SQL:

```sql
CREATE TABLE IF NOT EXISTS archived_conversations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL COMMENT 'Teléfono del contacto',
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP COMMENT 'Fecha de archivado',
    archived_by INT DEFAULT NULL COMMENT 'ID del usuario que archivó',
    INDEX idx_user_id (user_id),
    UNIQUE KEY unique_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### 2. Reiniciar el Servidor

```bash
npm run dev
```

---

## 💡 Cómo Usar

### Archivar una Conversación

1. **Abrir conversación**
   - Selecciona el contacto desde la lista

2. **Acceder al menú**
   - Click en el botón ⋮ (tres puntos) en la esquina superior derecha

3. **Archivar**
   - Click en "Archivar conversación"
   - La conversación desaparece de la lista principal

### Ver Conversaciones Archivadas

1. **Toggle de archivados**
   - En la lista de contactos, verás un botón "Archivadas (N)"
   - Click para ver solo las conversaciones archivadas

2. **Ver todas**
   - Click en "Ver activos" para volver a la lista principal

### Desarchivar una Conversación

1. **Abrir archivadas**
   - Click en "Archivadas (N)"

2. **Seleccionar conversación**
   - Click en la conversación que quieres desarchivar

3. **Desarchivar**
   - Click en ⋮ → "Desarchivar"
   - La conversación vuelve a la lista principal

---

## 🏗️ Arquitectura

### Backend

#### **Servicio de Archivado** (`src/services/archiveService.js`)
```javascript
archiveConversation(userId, archivedBy)  // Archivar
unarchiveConversation(userId)            // Desarchivar
isArchived(userId)                       // Verificar estado
getArchivedConversations()               // Obtener archivados
getArchivedUserIds()                     // IDs archivados (Set)
toggleArchive(userId, archivedBy)        // Alternar estado
```

#### **Tabla de Base de Datos**
```sql
archived_conversations
├── id (INT, PK, AUTO_INCREMENT)
├── user_id (VARCHAR(100), UNIQUE, INDEX)
├── archived_at (TIMESTAMP)
└── archived_by (INT, FK a users.id)
```

### Frontend

#### **Componentes Actualizados**

1. **ContactsList.jsx**
   - Toggle de archivados con contador
   - Filtrado automático según estado
   - Carga de archivados desde API

2. **ChatPanel.jsx**
   - Botón "Archivar conversación" en menú ⋮
   - Cambia dinámicamente a "Desarchivar" si está archivado
   - Recarga lista después de archivar

3. **API Service** (`src/services/api.js`)
   ```javascript
   archiveConversation(phone)
   unarchiveConversation(phone)
   getArchivedConversations()
   ```

---

## 📡 API Endpoints

### POST `/api/archive-conversation`
Archivar una conversación.

**Headers:** Cookie con token de autenticación

**Body:**
```json
{
  "phone": "1234567890"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Conversación archivada correctamente",
  "phone": "1234567890"
}
```

### POST `/api/unarchive-conversation`
Desarchivar una conversación.

**Headers:** Cookie con token de autenticación

**Body:**
```json
{
  "phone": "1234567890"
}
```

**Respuesta:**
```json
{
  "success": true,
  "message": "Conversación desarchivada correctamente",
  "phone": "1234567890"
}
```

### GET `/api/archived-conversations`
Obtener lista de conversaciones archivadas.

**Headers:** Cookie con token de autenticación

**Respuesta:**
```json
[
  {
    "userId": "1234567890",
    "archivedAt": "2025-01-15T10:30:00.000Z",
    "archivedBy": 1
  }
]
```

---

## 🎨 Interfaz de Usuario

### Lista de Contactos

```
┌─────────────────────────────────────────┐
│ Conversaciones      [Archivadas (3)]    │
│ ├─ Buscar...                            │
│                                          │
│ ┌──────────────────────────────────┐   │
│ │ 👤 1234567890                    │   │
│ │    Último mensaje...             │   │
│ └──────────────────────────────────┘   │
│                                          │
│ ┌──────────────────────────────────┐   │
│ │ 👤 0987654321                    │   │
│ │    Otro mensaje...               │   │
│ └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
```

### Menú de Opciones

```
┌─────────────────────────────────┐
│ 📦 Archivar conversación        │
│ 🗑️  Eliminar conversación        │
│ 🚪 Salir del grupo (si aplica)  │
└─────────────────────────────────┘
```

---

## 🔄 Flujo de Trabajo

### Archivar
```
Usuario click "Archivar"
         ↓
POST /api/archive-conversation
         ↓
INSERT INTO archived_conversations
         ↓
contacto.isArchived = true
         ↓
Conversación se oculta de lista
```

### Desarchivar
```
Usuario click "Desarchivar"
         ↓
POST /api/unarchive-conversation
         ↓
DELETE FROM archived_conversations
         ↓
contacto.isArchived = false
         ↓
Conversación vuelve a lista
```

### Visualización
```
Carga inicial
         ↓
GET /api/my-contacts + GET /api/archived-conversations
         ↓
Marcar contactos como isArchived
         ↓
Filtrar según showArchived
         ↓
Mostrar solo activos o archivados
```

---

## 🛡️ Seguridad

- ✅ **Autenticación requerida**: Todos los endpoints requieren `requireAuth`
- ✅ **Usuario registrado**: Se guarda `archived_by` para auditoría
- ✅ **Validación de teléfono**: Limpieza de números antes de guardar
- ✅ **Unique constraint**: Un contacto solo puede estar archivado una vez

---

## 📊 Datos Persistidos

### Base de Datos
```
archived_conversations table:
- Historial de archivados
- Fecha de archivado
- Usuario que archivó
```

### Frontend (Estado)
```javascript
- archivedUserIds: Set<string>   // IDs archivados
- showArchived: boolean           // Toggle estado
- contact.isArchived: boolean     // Por contacto
```

---

## 🔧 Personalización

### Cambiar Comportamiento

#### Auto-desarchivar al recibir mensaje
En `src/bot/whatsappBot.js`, agregar:
```javascript
// Al recibir mensaje
if (await archiveService.isArchived(userId)) {
  await archiveService.unarchiveConversation(userId);
  logger.log('SYSTEM', `Conversación desarchivada por nuevo mensaje: ${userId}`);
}
```

#### Archivar automáticamente después de X días
Crear un cron job:
```javascript
// src/services/autoArchive.js
const archiveOldConversations = async (daysInactive = 30) => {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysInactive);

  // Buscar conversaciones inactivas
  // Archivar automáticamente
};
```

---

## 🐛 Solución de Problemas

### Las conversaciones archivadas no se ocultan
1. Verificar que la tabla `archived_conversations` existe
2. Revisar logs del servidor para errores en API
3. Verificar que `getArchivedConversations()` retorna datos

### El contador muestra 0 pero hay archivados
1. Verificar que `archivedUserIds` se está actualizando
2. Revisar `loadContacts()` en `ContactsList.jsx`
3. Check console del navegador para errores

### Error al archivar
1. Verificar autenticación del usuario
2. Revisar permisos de la base de datos
3. Check unique constraint (puede estar duplicado)

---

## 📈 Mejoras Futuras

- [ ] Búsqueda en archivados
- [ ] Archivar múltiples conversaciones a la vez
- [ ] Categorías de archivado (resuelto, pendiente, etc.)
- [ ] Auto-archivar por inactividad
- [ ] Estadísticas de archivados
- [ ] Exportar archivados a CSV
- [ ] Desarchivar automáticamente al recibir nuevo mensaje

---

## ✅ Checklist de Implementación

- [x] Crear tabla `archived_conversations`
- [x] Servicio de archivado backend
- [x] Endpoints API (archive, unarchive, get)
- [x] Funciones en api.js frontend
- [x] Botón archivar en ChatPanel
- [x] Toggle en ContactsList
- [x] Filtrado por estado archivado
- [x] Contador de archivados
- [x] Documentación

---

## 📝 Notas

- Las conversaciones archivadas **mantienen todo su historial** de mensajes
- Archivar **NO elimina** ningún dato
- El archivado es **reversible** en cualquier momento
- Los usuarios pueden ver sus propios archivados
- Admin puede ver todos los archivados

---

**¡Listo para usar!** 🎉

Para comenzar, simplemente ejecuta la migración SQL y reinicia el servidor.
