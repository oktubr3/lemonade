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
    const createHistory = process.env.SERVER
        ? createMemoryHistory
        : process.env.VUE_ROUTER_MODE === "history"
        ? createWebHistory
        : createWebHashHistory;

    const Router = createRouter({
        scrollBehavior: () => ({ left: 0, top: 0 }),
        routes,
        history: createHistory(process.env.VUE_ROUTER_BASE),
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
