# Guía de Soporte Multimedia

Esta aplicación ahora soporta el envío y recepción de archivos multimedia a través de WhatsApp.

## 📋 Tipos de Archivos Soportados

### Imágenes
- **Formatos**: JPG, JPEG, PNG, GIF, WebP
- **Visualización**: Se muestran inline en el chat con preview
- **Funcionalidad**: Click para ver en tamaño completo

### Documentos
- **Formatos**: PDF, Word (.doc, .docx), Excel (.xls, .xlsx), PowerPoint (.ppt, .pptx)
- **Visualización**: Botón de descarga con icono y nombre de archivo
- **Funcionalidad**: Click para descargar

## 🚀 Cómo Funciona

### Envío de Archivos desde el Panel Web

1. **Abrir panel de chat**
   - Seleccionar contacto desde la lista
   - Click en el botón 📎 (adjuntar) junto al input de mensaje

2. **Seleccionar archivo**
   - Elegir imagen (JPG, PNG, GIF, WebP) o documento (PDF, Word, Excel)
   - Se valida tipo y tamaño (máximo 10MB)
   - Aparece preview del archivo seleccionado

3. **Agregar descripción (opcional)**
   - Escribir texto en el campo de mensaje
   - La descripción se envía como caption del archivo

4. **Enviar**
   - Click en botón "Enviar"
   - El archivo se guarda en el servidor
   - Se envía por WhatsApp al contacto
   - Aparece en el chat con el archivo adjunto

### Recepción de Archivos

1. **Cliente envía archivo por WhatsApp**
   - El bot detecta automáticamente si es imagen o documento
   - Descarga el archivo usando Baileys
   - Guarda en carpeta `media/` organizada por tipo

2. **Almacenamiento**
   ```
   media/
   ├── images/       # Imágenes (JPG, PNG, GIF, WebP)
   ├── documents/    # PDFs y documentos Office
   ├── videos/       # Videos (preparado para futuro)
   └── audio/        # Audios (preparado para futuro)
   ```

3. **Base de Datos**
   - Se registra en `conversation_logs` con:
     - `media_type`: Tipo de archivo (images, documents, etc.)
     - `media_filename`: Nombre único generado
     - `media_mimetype`: Tipo MIME del archivo
     - `media_url`: URL para acceder al archivo
     - `media_caption`: Descripción o caption del archivo

4. **Visualización en Panel Web**
   - **Imágenes**: Thumbnail clickeable que abre modal con imagen completa
   - **PDFs/Documentos**: Tarjeta con icono, nombre y botón de descarga

### Filtrado de Mensajes

El bot ahora ignora completamente:
- Grupos de WhatsApp
- Canales (`@newsletter`)
- Broadcasts
- Estados
- Comunidades

Solo procesa mensajes de **contactos individuales** (@s.whatsapp.net).

## 🔧 Configuración Técnica

### Variables de Entorno

No se requieren variables adicionales. El sistema usa la configuración existente de base de datos.

### Migración de Base de Datos

La migración se aplica automáticamente con:

```bash
node migrations/apply_migration.js
```

Agrega 5 columnas a la tabla `conversation_logs`:
- `media_type`
- `media_filename`
- `media_mimetype`
- `media_url`
- `media_caption`

## 📡 Endpoints API

### Enviar Archivo
```
POST /api/send-media
```
**Headers**: Cookie con token de autenticación
**Body**: FormData con:
- `phone`: Número de teléfono del destinatario
- `file`: Archivo a enviar (imagen o documento)
- `caption`: (Opcional) Descripción del archivo

**Respuesta:**
```json
{
  "success": true,
  "message": "Archivo enviado correctamente",
  "phone": "1234567890",
  "mediaType": "images",
  "mediaUrl": "/api/media/images/1704567890_abc123.jpg",
  "mimetype": "image/jpeg",
  "caption": "Mi imagen"
}
```

### Servir Archivo
```
GET /api/media/:mediaType/:filename
```
- Sirve el archivo con headers apropiados
- Cache: 24 horas
- Content-Disposition: inline

### Descargar Archivo
```
GET /api/media/:mediaType/:filename/download
```
- Descarga el archivo
- Content-Disposition: attachment

**Ejemplo:**
```
GET /api/media/images/1704567890_abc123.jpg
GET /api/media/documents/1704567890_def456.pdf/download
```

## 🎨 Componentes Frontend

### MediaMessage.jsx
Componente React para renderizar archivos multimedia:
- Detecta tipo de archivo
- Muestra preview de imágenes
- Botones de descarga para documentos
- Modal para ver imágenes en tamaño completo

### ChatPanel.jsx (Actualizado)
- Importa y usa `MediaMessage`
- Detecta mensajes con `mediaType` y `mediaUrl`
- Muestra archivos multimedia en el flujo de conversación

## 🛡️ Seguridad

### Validaciones
- Solo procesa tipos de archivo permitidos
- Valida extensiones y MIME types
- Limita tamaño de archivos (configurado en multer)

### Almacenamiento
- Nombres únicos (timestamp + hash MD5)
- Organización por tipo de media
- No se suben archivos al repositorio (`.gitignore`)

## 📊 Logs y Monitoreo

Los archivos multimedia se registran en consola:
```
📸 Imagen detectada
✅ Imagen guardada: 1704567890_abc123.jpg
📄 Documento detectado: application/pdf
✅ Documento guardado: 1704567890_def456.pdf
```

## 🚫 Archivos NO Soportados

Si un cliente envía un archivo no soportado:
- Se registra en logs como "[Documento tipo X no soportado]"
- No se descarga ni almacena
- El mensaje se registra pero sin archivo adjunto

Tipos no soportados actualmente:
- Videos (preparado para futuro)
- Audios/Notas de voz (preparado para futuro)
- Stickers
- Ubicaciones
- Contactos

## 🔄 Mantenimiento

### Limpiar Archivos Antiguos
Los archivos multimedia no se eliminan automáticamente. Para liberar espacio:

```bash
# Eliminar archivos de más de 30 días
find media/ -type f -mtime +30 -delete
```

### Backup
Incluir carpeta `media/` en backups del servidor:

```bash
tar -czf backup.tar.gz media/ logs/ data/
```

## 🐛 Solución de Problemas

### Las imágenes no se muestran
1. Verificar que el archivo existe en `media/images/`
2. Revisar permisos de la carpeta `media/`
3. Verificar que `media_url` en BD es correcto

### Error al descargar PDF
1. Verificar que el endpoint `/api/media/documents/:filename/download` funciona
2. Revisar permisos de lectura en carpeta `media/documents/`
3. Verificar MIME type del archivo

### Archivos no se guardan
1. Verificar que las carpetas `media/*` existen
2. Revisar permisos de escritura
3. Verificar logs del servidor para errores de Baileys

## 📈 Mejoras Futuras

- [ ] Soporte para videos
- [ ] Soporte para notas de voz
- [ ] Compresión automática de imágenes
- [ ] Thumbnails optimizados
- [ ] Galería de imágenes enviadas
- [ ] Búsqueda de archivos por tipo
- [ ] Estadísticas de uso de archivos
