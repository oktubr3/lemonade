//  router/index.js
import { route } from "quasar/wrappers";
import {
    createRouter,
    createMemoryHistory,
    createWebHistory,
    createWebHashHistory,
} from "vue-router";
import routes from "./routes";
import { getAuth, onAuthStateChanged } from "firebase/auth";

export default route(function ({ store /* , ssrContext */ }) {
    // app-vite 3 dejo de definir process.env.SERVER / VUE_ROUTER_MODE / VUE_ROUTER_BASE.
    // Quedaban en undefined y esto caia en hash por accidente — que es justo el modo
    // declarado en quasar.config.js. Se explicita para que deje de depender del azar.
    const createHistory = import.meta.env.SSR
        ? createMemoryHistory
        : createWebHashHistory;

    const Router = createRouter({
        scrollBehavior: () => ({ left: 0, top: 0 }),
        routes,
        history: createHistory(),
    });

    //
    Router.beforeEach((to, from, next) => {
        const auth = getAuth();

        if (!auth.currentUser) {
            // If there is no current user, check the auth state
            const unsubscribe = onAuthStateChanged(auth, (user) => {
                unsubscribe(); // Stop listening after getting the user state
                if (
                    to.matched.some((record) => record.meta.requiresAuth) &&
                    !user
                ) {
                    next({ name: "login" });
                } else {
                    next();
                }
            });
        } else {
            // If a user already exists, proceed normally
            if (
                to.matched.some((record) => record.meta.requiresAuth) &&
                !auth.currentUser
            ) {
                next({ name: "login" });
            } else {
                next();
            }
        }
    });

    return Router;
});
