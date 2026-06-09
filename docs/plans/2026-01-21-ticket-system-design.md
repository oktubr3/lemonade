# Sistema de Tickets - Diseño

## Resumen

Sistema de soporte integrado en la app para que usuarios reporten problemas o sugerencias.

## Decisiones de Diseño

- **Vista usuario**: Sección "Soporte" en SettingsPage
- **Vista admin**: Tab "Tickets" en AdminUsersPage
- **Notificación**: Badge numérico en ítem "Admin" del drawer
- **Conversación**: Chat simple bidireccional
- **Categorías**: Ninguna (ultra simple)
- **Estados**: Solo open/closed

## Modelo de Datos

```javascript
// Collection: tickets
{
  id: "auto-generated",
  userId: "uid",
  userEmail: "user@email.com",
  userName: "Display Name",
  subject: "Título del ticket",
  status: "open" | "closed",
  createdAt: Timestamp,
  updatedAt: Timestamp,
  closedAt: Timestamp | null,
  messages: [
    {
      id: "msg-1",
      content: "Contenido del mensaje",
      senderId: "uid",
      senderName: "Nombre",
      isAdmin: false,
      createdAt: Timestamp
    }
  ]
}
```

## Cloud Functions

| Función | Acceso | Descripción |
|---------|--------|-------------|
| createTicketHttp | Usuario auth | Crear ticket |
| getMyTicketsHttp | Usuario auth | Mis tickets |
| addTicketMessageHttp | Usuario/Admin | Agregar mensaje |
| closeTicketHttp | Usuario/Admin | Cerrar ticket |
| adminGetTicketsHttp | Admin | Todos los tickets |
| getOpenTicketsCountHttp | Admin | Count para badge |

## Archivos a Crear/Modificar

- `src/composables/useTickets.js` - Lógica compartida
- `src/pages/SettingsPage.vue` - Agregar sección Soporte
- `src/pages/AdminUsersPage.vue` - Agregar tab Tickets
- `src/layouts/MainLayout.vue` - Badge en drawer
- `functions/index.js` - 6 nuevas Cloud Functions
- `src/i18n/*/index.js` - Traducciones

## Seguridad

- Autenticación requerida en todas las funciones
- Usuario solo ve/modifica sus tickets
- Admin verificado con check existente
- Rate limit: 10 tickets/día por usuario
