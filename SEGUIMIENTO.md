# Sistema de Seguimiento Automático

## Descripción

El sistema de seguimiento automático envía mensajes de follow-up a clientes que dejan de responder, con el objetivo de reactivar conversaciones y recuperar leads potenciales.

## Funcionamiento

### Inicio del Seguimiento

El seguimiento se activa automáticamente cuando:
- Un cliente deja de responder por **2 horas**
- La conversación tenía actividad previa (no es spam)
- No está en modo humano o soporte

### Intervalos de Seguimiento

Los mensajes se envían cada **24 horas**, con un máximo de **3 intentos**:

1. **Primer seguimiento** (24h después de inactividad)
   - Mensaje amigable recordando la conversación
   - Ofrece flexibilidad si no es buen momento

2. **Segundo seguimiento** (48h)
   - Refuerza el valor perdido (leads no atendidos)
   - Propone una llamada corta

3. **Tercer seguimiento** (72h)
   - Último mensaje respetando la decisión del cliente
   - Opción final antes de cerrar el seguimiento

### Detención del Seguimiento

El sistema **detiene automáticamente** el seguimiento cuando detecta:

#### 1. **Cliente Aceptó el Trato**
- Mostró interés genuino
- Quiere agendar reunión
- Acepta la propuesta

#### 2. **Cliente Rechazó el Trato**
- Dijo "no" explícitamente
- Ya encontró alternativa
- No le interesa el servicio

#### 3. **Cliente Frustrado/Enojado**
- Lenguaje agresivo
- Molesto por la insistencia
- Pide que dejen de escribir

#### 4. **Cliente Respondió**
- Cualquier respuesta del cliente cancela el seguimiento activo
- Se analiza el mensaje para determinar si debe reiniciarse

#### 5. **Máximo de Intentos Alcanzado**
- Después de 3 intentos sin respuesta
- Se envía mensaje final de despedida profesional

## Coordinación con Otros Sistemas

### Mensaje de 5 Minutos
- **No se envía** cuando hay seguimiento activo
- Solo aparece cuando **NO** hay seguimiento de 24 horas en progreso
- Evita saturar al cliente con mensajes duplicados

### Modo Humano/Soporte
- El seguimiento automático **NO se inicia** para usuarios en estos modos
- Si se activa modo humano durante un seguimiento, este continúa
- Los operadores humanos tienen control total

## Análisis de IA

El sistema usa inteligencia artificial para:
- Detectar intención del cliente (aceptar/rechazar/frustración)
- Analizar contexto de conversación
- Tomar decisiones automáticas de detención

## Base de Datos

### Tabla `follow_ups`
```sql
- user_id: Identificador único del usuario
- next_follow_up: Fecha/hora del próximo mensaje
- attempts: Número de intentos realizados (0-3)
- chat_id: ID del chat de WhatsApp
- started_at: Cuándo se inició el seguimiento
```

## Instalación

### 1. Crear la tabla en MySQL
```bash
mysql -u root -p whatspanel_db < migrations/001_create_follow_ups_table.sql
```

### 2. Verificar Integración
El servicio se inicia automáticamente cuando el bot se conecta a WhatsApp.

## Configuración

### Ajustar Intervalos
Edita `/src/services/followUpService.js`:

```javascript
this.followUpInterval = 24 * 60 * 60 * 1000; // 24 horas
this.maxAttempts = 3; // Máximo de intentos
```

### Ajustar Tiempo de Activación
```javascript
const twoHours = 2 * 60 * 60 * 1000; // Activar después de 2 horas
```

### Personalizar Mensajes
Los mensajes de seguimiento están en `getFollowUpMessage()`:

```javascript
const messages = [
    // Primer seguimiento
    `Hola de nuevo 👋...`,

    // Segundo seguimiento
    `Hola otra vez...`,

    // Tercer seguimiento
    `Último mensaje...`
];
```

## Logs y Monitoreo

Todos los eventos se registran en el sistema de logs:
- Inicio de seguimiento
- Envío de mensajes
- Detención por diferentes razones
- Análisis de respuestas

## Mejores Prácticas

1. **No seas agresivo**: Los mensajes están diseñados para ser respetuosos
2. **Respeta la decisión**: Después de 3 intentos, se detiene automáticamente
3. **Analiza resultados**: Monitorea qué mensajes generan más respuestas
4. **Ajusta según industria**: Los intervalos pueden variar según tu negocio

## Métricas Recomendadas

- Tasa de respuesta por intento (1°, 2°, 3°)
- Leads recuperados vs perdidos
- Análisis de frustración (¿molesta a los clientes?)
- ROI del seguimiento automático

## Desactivación

Para desactivar el servicio, comenta esta línea en `whatsappBot.js`:

```javascript
// followUpService.startFollowUpTimer(this.sock);
```

## Soporte

Si encuentras problemas:
1. Revisa los logs en `logs/`
2. Verifica que la tabla `follow_ups` exista
3. Confirma que el análisis de IA funciona correctamente
