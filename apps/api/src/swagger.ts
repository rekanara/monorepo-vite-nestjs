import { DocumentBuilder } from "@nestjs/swagger"

export function buildSwaggerConfig() {
  return new DocumentBuilder()
    .setTitle("Rekanara API")
    .setDescription(
      "Admin starter API: auth, RBAC, users, settings, notifications, announcements, audit, storage and webhooks."
    )
    .setVersion("1.0.0")
    .addServer("/", "Current host")
    .addBearerAuth(
      {
        type: "http",
        scheme: "bearer",
        bearerFormat: "JWT",
        description: "Access token from /api/v1/auth/login or refresh.",
      },
      "JWT-auth"
    )
    .addTag("Auth", "Login, refresh, recovery, invites and email verification")
    .addTag("Account", "Self-service profile, sessions and preferences")
    .addTag("Users", "Admin user management, import/export and soft delete")
    .addTag("Roles & Permissions", "Roles and permission catalog")
    .addTag("Audit Log", "Audited mutations and exports")
    .addTag("Notifications", "In-app notifications and FCM devices")
    .addTag("Announcements", "Draft/published announcements and images")
    .addTag("Attachments", "Private user attachments")
    .addTag("Settings", "Public branding and admin settings")
    .addTag("System", "Authenticated operational status")
    .addTag("Health", "Public liveness/readiness")
    .addTag("Webhooks", "External provider callbacks")
    .build()
}
