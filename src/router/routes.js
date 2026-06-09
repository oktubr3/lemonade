//  router/routes.js
const routes = [
    {
        path: "/",
        component: () => import("layouts/MainLayout.vue"),
        children: [
            {
                path: "",
                component: () => import("pages/IndexPage.vue"),
                meta: { requiresAuth: true }, // ruta protegida
            },
            {
                path: "/login",
                name: "login",
                component: () => import("pages/LoginPage.vue"),
                meta: { requiresAuth: false },
            },
            {
                path: "/settings",
                name: "settings",
                component: () => import("pages/SettingsPage.vue"),
                meta: { requiresAuth: true },
            },
            {
                path: "/env-vault",
                name: "env-vault",
                component: () => import("pages/EnvVaultPage.vue"),
                meta: { requiresAuth: true },
            },
            {
                path: "/notes",
                name: "notes",
                component: () => import("pages/SecureNotesPage.vue"),
                meta: { requiresAuth: true },
            },
            {
                path: "/admin/users",
                name: "admin-users",
                component: () => import("pages/AdminUsersPage.vue"),
                meta: { requiresAuth: true, requiresAdmin: true },
            },
            // más rutas protegidas
        ],
    },
    // ruta para manejar errores 404
    {
        path: "/:catchAll(.*)*",
        component: () => import("pages/ErrorNotFound.vue"),
    },
];

export default routes;
