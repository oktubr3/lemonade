
/*
 * This file runs in a Node context (it's NOT transpiled by Babel), so use only
 * the ES6 features that are supported by your Node version. https://node.green/
 * It is ESM: no require(), no __dirname without the shim below.
 */

// Configuration for your app
// https://v2.quasar.dev/quasar-cli-vite/quasar-config-js

// @quasar/app-vite 3 only accepts quasar.config.js (ESM) or .ts — it dropped
// .cjs, so this file is ESM and uses defineConfig instead of the old
// `configure` from quasar/wrappers.
import { defineConfig } from "@quasar/app-vite";
import path from "node:path";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";

// __dirname and require() do not exist in ESM.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));

export default defineConfig(function (/* ctx */) {
    return {
        // https://v2.quasar.dev/quasar-cli-vite/prefetch-feature
        // preFetch: true,

        // app boot file (/src/boot)
        // --> boot files are part of "main.js"
        // https://v2.quasar.dev/quasar-cli-vite/boot-files
        boot: ["i18n", "firebase", "register-directives"],

        // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#css
        css: ["app.scss"],

        // https://github.com/quasarframework/quasar/tree/dev/extras
        extras: [
            "roboto-font",
            "material-icons",
        ],

        // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#build
        build: {
            // @quasar/app-vite 3 shrank the default aliases to just '@' and
            // '#q-app'. These were provided by app-vite 2 and are used across
            // ~58 imports plus `~assets/` in templates, so they are restored
            // here rather than rewriting every call site.
            alias: {
                src: path.join(__dirname, "src"),
                app: __dirname,
                components: path.join(__dirname, "src/components"),
                layouts: path.join(__dirname, "src/layouts"),
                pages: path.join(__dirname, "src/pages"),
                assets: path.join(__dirname, "src/assets"),
                boot: path.join(__dirname, "src/boot"),
                stores: path.join(__dirname, "src/stores"),
            },

            target: {
                browser: [
                    "es2022",
                    "edge115",
                    "firefox115",
                    "chrome115",
                    "safari15",
                ],
                node: "node20",
            },

            vueRouterMode: "hash", // available values: 'hash', 'history'
            // vueRouterBase,
            // vueDevtools,
            // vueOptionsAPI: false,

            // rebuildCache: true, // rebuilds Vite/linter/etc cache on startup

            // publicPath: '/',
            // analyze: true,
            // OJO: en @quasar/app-vite 3 `build.env` NO es un mapa de variables,
            // es { clientPrefix, backendPrefix }. Pisarlo con variables sueltas
            // anula el prefijo y NINGUNA var de .env.local llega al cliente.
            //
            // Ademas app-vite 3 cambio el prefijo de cliente de VITE_ a QCLI_.
            // Este proyecto usa import.meta.env.VITE_FIREBASE_* en src/boot/firebase.js,
            // asi que sin esto Firebase arranca sin apiKey (auth/invalid-api-key)
            // y la app no carga. Se aceptan los dos prefijos.
            env: {
                clientPrefix: ["VITE_", "QCLI_"],
            },


            // ignorePublicFolder: true,
            // minify: false,
            // polyfillModulePreload: true,
            // distDir

            extendViteConf(viteConf) {
                // Version en runtime. Se define aca y no en build.rawDefine porque
                // ese camino no sustituyo el identificador en el bundle.
                viteConf.define = viteConf.define || {};
                viteConf.define.__APP_VERSION__ = JSON.stringify(pkg.version);

                viteConf.build = viteConf.build || {};
                viteConf.build.rollupOptions = viteConf.build.rollupOptions || {};
                viteConf.build.rollupOptions.output = viteConf.build.rollupOptions.output || {};
                viteConf.build.rollupOptions.output.manualChunks = (id) => {
                    if (id.includes("node_modules")) {
                        if (id.includes("firebase/firestore") || id.includes("@firebase/firestore")) return "firebase-firestore";
                        if (id.includes("firebase/auth") || id.includes("@firebase/auth")) return "firebase-auth";
                        if (id.includes("firebase/functions") || id.includes("@firebase/functions")) return "firebase-functions";
                        if (id.includes("firebase") || id.includes("@firebase")) return "firebase-core";
                        if (id.includes("quasar")) return "quasar";
                        if (id.includes("vue-i18n") || id.includes("@intlify")) return "i18n";
                        if (id.includes("qr-scanner")) return "qr-scanner";
                        if (id.includes("@simplewebauthn")) return "webauthn";
                        if (id.includes("pinia") || id.includes("vue-router") || id.match(/node_modules\/(@vue|vue)\//)) return "vue-core";
                    }
                };
                viteConf.build.chunkSizeWarningLimit = 800;
            },

            vitePlugins: [
                VueI18nPlugin({
                    include: [path.resolve(__dirname, "./src/i18n/**/*.json")],
                    runtimeOnly: true,
                }),
            ],
        },

        // Full list of options: https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#devServer
        devServer: {
            // https: true
            open: true, // opens browser window automatically
        },

        // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#framework
        framework: {
            config: {
                notify: {
                    /* look at QUASARCONFOPTIONS from the API card (bottom of page) */
                },
                dark: "auto", // or Boolean true/false
            },

            // iconSet: 'material-icons', // Quasar icon set
            // lang: 'en-US', // Quasar language pack

            // For special cases outside of where the auto-import strategy can have an impact
            // (like functional components as one of the examples),
            // you can manually specify Quasar components/directives to be available everywhere:
            //
            // components: [],
            // directives: [],

            // Quasar plugins
            plugins: ["Notify", "Dialog", "Dark", "Loading"],
        },

        // animations: 'all', // --- includes all animations
        // https://v2.quasar.dev/options/animations
        animations: [],

        // https://v2.quasar.dev/quasar-cli-vite/quasar-config-js#property-sourcefiles
        sourceFiles: {
          registerServiceWorker: 'src-pwa/register-service-worker',
          serviceWorker: 'src-pwa/custom-service-worker',
          pwaManifestFile: 'src-pwa/manifest.json',
        },

        // https://v2.quasar.dev/quasar-cli-vite/developing-ssr/configuring-ssr
        ssr: {
            // ssrPwaHtmlFilename: 'offline.html', // do NOT use index.html as name!
            // will mess up SSR

            // extendSSRWebserverConf (esbuildConf) {},
            // extendPackageJson (json) {},

            pwa: false,

            // manualStoreHydration: true,
            // manualPostHydrationTrigger: true,

            prodPort: 3000, // The default port that the production server should use
            // (gets superseded if process.env.PORT is specified at runtime)

            middlewares: [
                "render", // keep this as last one
            ],
        },

        // https://v2.quasar.dev/quasar-cli-vite/developing-pwa/configuring-pwa
        pwa: {
            workboxMode: "InjectManifest",
            injectPwaMetaTags: true,
            swFilename: "sw.js",
            manifestFilename: "manifest.json",
            useCredentialsForManifestTag: false,
            useFilenameHashes: true, // CRÍTICO: Force cache busting con hashes únicos

            extendInjectManifestOptions(cfg) {
                // Configuración para InjectManifest mode
                cfg.globIgnores = [
                    '**/*.map',
                    '**/node_modules/**',
                    '**/*.md',
                ];
                cfg.maximumFileSizeToCacheInBytes = 3 * 1024 * 1024; // 3MB max por archivo
            },

            extendManifestJson(json) {
                json.name = "Lemonade Password Manager";
                json.short_name = "Lemonade Pass";
                json.description = "Secure password manager with Firebase encryption";
                json.theme_color = "#F7DC6F";
                json.background_color = "#0D1117";
                json.categories = ["productivity", "security", "utilities"];
                json.orientation = "portrait-primary";
                json.lang = "es-ES";
                json.start_url = "/";
                json.scope = "/";
                json.display = "standalone";
                
                // CRÍTICO: Añadir versión para forzar actualizaciones del manifest
                json.version = pkg.version;
                json.version_name = `Lemonade ${pkg.version}`;
            }
        },

        // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-cordova-apps/configuring-cordova
        cordova: {
            // noIosLegacyBuildFlag: true, // uncomment only if you know what you are doing
        },

        // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-capacitor-apps/configuring-capacitor
        capacitor: {
            hideSplashscreen: true,
        },

        // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-electron-apps/configuring-electron
        electron: {
            // extendElectronMainConf (esbuildConf)
            // extendElectronPreloadConf (esbuildConf)

            // specify the debugging port to use for the Electron app when running in development mode
            inspectPort: 5858,

            bundler: "packager", // 'packager' or 'builder'

            packager: {
                // https://github.com/electron-userland/electron-packager/blob/master/docs/api.md#options
                // OS X / Mac App Store
                // appBundleId: '',
                // appCategoryType: '',
                // osxSign: '',
                // protocol: 'myapp://path',
                // Windows only
                // win32metadata: { ... }
            },

            builder: {
                // https://www.electron.build/configuration/configuration

                appId: "pass-manager",
            },
        },

        // Full list of options: https://v2.quasar.dev/quasar-cli-vite/developing-browser-extensions/configuring-bex
        bex: {
            contentScripts: ["my-content-script"],

            // extendBexScriptsConf (esbuildConf) {}
            // extendBexManifestJson (json) {}
        },
    };
});
