import { defineStore } from "pinia";
import { ref, computed } from "vue";
import { getAuth } from "firebase/auth";
import { collection, getDocs, query, where, doc, getDoc, setDoc, updateDoc, deleteDoc, writeBatch } from "firebase/firestore";
import { db } from "boot/firebase";
import { deriveAesKey, derivePasswordVerifier, deriveAesKeyRaw, derivePasswordVerifierRaw } from "src/utils/cryptoWorker";
import { onAppResume } from "src/utils/appResumeListeners";

export const useEnvVaultStore = defineStore("envVault", () => {
    // State
    const projects = ref([]);
    const variables = ref([]);
    const vaultSettings = ref(null);
    const isUnlocked = ref(false);
    const derivedKey = ref(null); // Key derived from the master password (in memory)
    const lastActivity = ref(Date.now());

    // Auto-lock options (in minutes, 0 = never)
    // labelKey is an i18n key; consumers should translate it at render time
    const AUTO_LOCK_OPTIONS = [
        { labelKey: 'envVault.autoLockOptions.neverThisSession', value: 0 },
        { labelKey: 'envVault.autoLockOptions.fiveMinutes', value: 5 },
        { labelKey: 'envVault.autoLockOptions.fifteenMinutes', value: 15 },
        { labelKey: 'envVault.autoLockOptions.thirtyMinutes', value: 30 },
        { labelKey: 'envVault.autoLockOptions.oneHour', value: 60 }
    ];

    const LEGACY_KDF_ITERATIONS = 100000;
    const CURRENT_KDF_ITERATIONS = 600000;
    const CURRENT_VERIFIER_VERSION = 3;

    // Auto-lock timeout configurable (safe default: 15 minutes)
    const autoLockMinutes = ref(15);

    // Session storage keys
    const SESSION_KEY = 'envVault_session';
    const SETTINGS_KEY = 'envVault_autoLock';

    // Initialize auto-lock from localStorage
    function initAutoLockSetting() {
        try {
            const saved = localStorage.getItem(SETTINGS_KEY);
            if (saved !== null) {
                autoLockMinutes.value = parseInt(saved, 10);
            } else {
                autoLockMinutes.value = 15;
            }
        } catch (e) {
            console.warn('Error reading auto-lock setting:', e);
        }
    }

    // Save auto-lock configuration
    function setAutoLockMinutes(minutes) {
        autoLockMinutes.value = minutes;
        try {
            localStorage.setItem(SETTINGS_KEY, minutes.toString());
        } catch (e) {
            console.warn('Error saving auto-lock setting:', e);
        }
    }

    // We do not persist the raw CryptoKey. A reload requires re-entering the master password.
    function saveSession(key) {
        void key;
        clearSession();
    }

    // Restore session from sessionStorage
    async function restoreSession() {
        try {
            const auth = getAuth();
            if (!auth.currentUser) return false;

            void auth;
            clearSession();
            return false;
        } catch (e) {
            console.warn('Error restoring session:', e);
            sessionStorage.removeItem(SESSION_KEY);
            return false;
        }
    }

    // Clear session
    function clearSession() {
        try {
            sessionStorage.removeItem(SESSION_KEY);
        } catch (e) {
            console.warn('Error clearing session:', e);
        }
    }

    // Token cache to avoid quota exceeded
    let tokenCache = {
        token: null,
        expires: 0,
        isRefreshing: false
    };

    // Invalidate cache when the app returns to the foreground (shared global listener)
    onAppResume(() => {
        tokenCache.token = null;
        tokenCache.expires = 0;
    });

    // Function to get cached tokens
    async function getCachedAuthToken() {
        const auth = getAuth();
        if (!auth.currentUser) {
            throw new Error("User not authenticated");
        }

        const now = Date.now();

        if (tokenCache.token && tokenCache.expires > now + 60000) {
            return tokenCache.token;
        }

        if (tokenCache.isRefreshing) {
            for (let i = 0; i < 50; i++) {
                await new Promise(resolve => setTimeout(resolve, 100));
                if (!tokenCache.isRefreshing && tokenCache.token) {
                    return tokenCache.token;
                }
            }
            throw new Error("Timeout waiting for token refresh");
        }

        try {
            tokenCache.isRefreshing = true;
            const token = await auth.currentUser.getIdToken(false);
            tokenCache.token = token;
            tokenCache.expires = now + (50 * 60 * 1000);
            return token;
        } catch (error) {
            if (error.code === 'auth/quota-exceeded') {
                throw new Error('Firebase Auth quota exceeded - try again later');
            }
            try {
                const refreshedToken = await auth.currentUser.getIdToken(true);
                tokenCache.token = refreshedToken;
                tokenCache.expires = now + (50 * 60 * 1000);
                return refreshedToken;
            } catch (refreshError) {
                throw refreshError;
            }
        } finally {
            tokenCache.isRefreshing = false;
        }
    }

    // Check if the vault is set up (has a master password)
    async function checkVaultSetup() {
        const auth = getAuth();
        if (!auth.currentUser) return false;

        // Initialize auto-lock configuration
        initAutoLockSetting();

        try {
            const settingsRef = doc(db, 'env_vault_settings', auth.currentUser.uid);
            const settingsDoc = await getDoc(settingsRef);

            if (settingsDoc.exists()) {
                vaultSettings.value = settingsDoc.data();

                // Try to restore existing session
                const restored = await restoreSession();
                if (restored) {
                    // Load projects if the session was restored
                    await fetchProjects();
                }

                return true;
            }
            return false;
        } catch (error) {
            console.error('Error checking vault setup:', error);
            return false;
        }
    }

    // Set up master password for the first time
    async function setupMasterPassword(password) {
        const auth = getAuth();
        if (!auth.currentUser) throw new Error("Not authenticated");

        try {
            // Generate random salt
            const salt = generateSalt();

            // Derive key with PBKDF2
            const key = await deriveKey(password, salt, CURRENT_KDF_ITERATIONS);

            // Strong verifier for future validation
            const passwordHash = await hashPassword(password, salt, CURRENT_KDF_ITERATIONS);

            // Save configuration
            const settingsRef = doc(db, 'env_vault_settings', auth.currentUser.uid);
            await setDoc(settingsRef, {
                passwordHash,
                salt,
                kdfIterations: CURRENT_KDF_ITERATIONS,
                verifierVersion: CURRENT_VERIFIER_VERSION,
                createdAt: new Date(),
                lastAccess: new Date()
            });

            vaultSettings.value = { passwordHash, salt, kdfIterations: CURRENT_KDF_ITERATIONS, verifierVersion: CURRENT_VERIFIER_VERSION };
            derivedKey.value = key;
            isUnlocked.value = true;
            lastActivity.value = Date.now();

            // Save session to persist across reloads
            saveSession(key);

            return true;
        } catch (error) {
            console.error('Error setting up master password:', error);
            throw error;
        }
    }

    // Unlock vault with password
    async function unlockVault(password) {
        const auth = getAuth();
        if (!auth.currentUser) throw new Error("Not authenticated");

        if (!vaultSettings.value) {
            await checkVaultSetup();
        }

        if (!vaultSettings.value) {
            throw new Error("Vault not configured");
        }

        try {
            const rawIter = vaultSettings.value.kdfIterations;
            const iterations = (Number.isInteger(rawIter) && rawIter >= 100000 && rawIter <= 10000000)
                ? rawIter
                : LEGACY_KDF_ITERATIONS;
            const verifierVersion = vaultSettings.value.verifierVersion || 1;

            // Try current HKDF verifier (v3)
            let passwordHash = await hashPassword(password, vaultSettings.value.salt, iterations);
            let useLegacyKey = false;
            let legacyIterations = iterations;

            if (passwordHash !== vaultSettings.value.passwordHash) {
                if (verifierVersion < 3) {
                    // Try v2: raw PBKDF2 bits as hex verifier
                    const v2hash = await hashPasswordRaw(password, vaultSettings.value.salt, iterations);
                    if (v2hash === vaultSettings.value.passwordHash) {
                        useLegacyKey = true;
                    } else {
                        // Try v1: SHA-256(password + salt)
                        const v1hash = await hashPasswordLegacy(password, vaultSettings.value.salt);
                        if (v1hash !== vaultSettings.value.passwordHash) {
                            throw new Error("Incorrect password");
                        }
                        useLegacyKey = true;
                        legacyIterations = LEGACY_KDF_ITERATIONS;
                    }
                } else {
                    throw new Error("Incorrect password");
                }
            }

            // Derive key: legacy raw-PBKDF2 for v1/v2 vaults, HKDF for v3
            const key = useLegacyKey
                ? await deriveKeyRaw(password, vaultSettings.value.salt, legacyIterations)
                : await deriveKey(password, vaultSettings.value.salt, iterations);

            derivedKey.value = key;
            isUnlocked.value = true;
            lastActivity.value = Date.now();

            // Save session to persist across reloads
            saveSession(key);

            // Update last access
            const settingsRef = doc(db, 'env_vault_settings', auth.currentUser.uid);
            await setDoc(settingsRef, { lastAccess: new Date() }, { merge: true });

            // Load projects
            await fetchProjects();

            // Transparently migrate to v3 separated keys (HKDF)
            if (useLegacyKey) {
                await upgradeToHkdfKeys(password, key);
            } else if (iterations < CURRENT_KDF_ITERATIONS) {
                await upgradeKdfIterations(password, key);
            }

            return true;
        } catch (error) {
            console.error('Error unlocking vault:', error);
            throw error;
        }
    }

    // Re-encrypts a user's env_context_files into an existing batch.
    // Used in all key migrations to keep atomicity.
    async function addContextFilesToBatch(uid, oldKey, newKey, batch) {
        const ctxCollection = collection(db, 'env_context_files');
        const ctxQuery = query(ctxCollection, where('userId', '==', uid));
        const ctxSnapshot = await getDocs(ctxQuery);
        await Promise.all(
            ctxSnapshot.docs.map(async (docSnap) => {
                const decrypted = await decryptValue(docSnap.data().encryptedContent, oldKey);
                const newEncrypted = await encryptValue(decrypted, newKey);
                batch.update(docSnap.ref, { encryptedContent: newEncrypted });
            })
        );
    }

    // Migrate vault v1/v2 (raw PBKDF2) to v3 (HKDF key separation).
    // Decrypts with the old key, generates new salt, re-encrypts with separated HKDF key.
    async function upgradeToHkdfKeys(password, oldKey) {
        try {
            const auth = getAuth();
            const variablesCollection = collection(db, 'env_variables');
            const q = query(variablesCollection, where('userId', '==', auth.currentUser.uid));
            const querySnapshot = await getDocs(q);

            const decryptedVars = await Promise.all(
                querySnapshot.docs.map(async (docSnap) => {
                    const decrypted = await decryptValue(docSnap.data().encryptedValue, oldKey);
                    return { ref: docSnap.ref, decrypted };
                })
            );

            const newSalt = generateSalt();
            const newKey = await deriveKey(password, newSalt, CURRENT_KDF_ITERATIONS);
            const newPasswordHash = await hashPassword(password, newSalt, CURRENT_KDF_ITERATIONS);

            const reencrypted = await Promise.all(
                decryptedVars.map(async (v) => ({
                    ref: v.ref,
                    newEncrypted: await encryptValue(v.decrypted, newKey),
                }))
            );

            const batch = writeBatch(db);
            for (const item of reencrypted) {
                batch.update(item.ref, { encryptedValue: item.newEncrypted });
            }
            await addContextFilesToBatch(auth.currentUser.uid, oldKey, newKey, batch);
            const settingsRef = doc(db, 'env_vault_settings', auth.currentUser.uid);
            batch.update(settingsRef, {
                passwordHash: newPasswordHash,
                salt: newSalt,
                kdfIterations: CURRENT_KDF_ITERATIONS,
                verifierVersion: CURRENT_VERIFIER_VERSION,
                updatedAt: new Date()
            });
            await batch.commit();

            vaultSettings.value = {
                ...vaultSettings.value,
                passwordHash: newPasswordHash,
                salt: newSalt,
                kdfIterations: CURRENT_KDF_ITERATIONS,
                verifierVersion: CURRENT_VERIFIER_VERSION
            };
            derivedKey.value = newKey;
            saveSession(newKey);
        } catch (error) {
            console.error('Error upgrading to HKDF keys:', error);
        }
    }

    // Migrate vault to the current PBKDF2 iterations (same password, new salt + key)
    async function upgradeKdfIterations(password, oldKey) {
        try {
            const auth = getAuth();
            const variablesCollection = collection(db, 'env_variables');
            const q = query(variablesCollection, where('userId', '==', auth.currentUser.uid));
            const querySnapshot = await getDocs(q);

            const decryptedVars = await Promise.all(
                querySnapshot.docs.map(async (docSnap) => {
                    const decrypted = await decryptValue(docSnap.data().encryptedValue, oldKey);
                    return { ref: docSnap.ref, decrypted };
                })
            );

            const newSalt = generateSalt();
            const newKey = await deriveKey(password, newSalt, CURRENT_KDF_ITERATIONS);
            const newPasswordHash = await hashPassword(password, newSalt, CURRENT_KDF_ITERATIONS);

            const reencrypted = await Promise.all(
                decryptedVars.map(async (v) => ({
                    ref: v.ref,
                    newEncrypted: await encryptValue(v.decrypted, newKey),
                }))
            );

            const batch = writeBatch(db);
            for (const item of reencrypted) {
                batch.update(item.ref, { encryptedValue: item.newEncrypted });
            }
            await addContextFilesToBatch(auth.currentUser.uid, oldKey, newKey, batch);
            const settingsRef = doc(db, 'env_vault_settings', auth.currentUser.uid);
            batch.update(settingsRef, {
                passwordHash: newPasswordHash,
                salt: newSalt,
                kdfIterations: CURRENT_KDF_ITERATIONS,
                verifierVersion: CURRENT_VERIFIER_VERSION,
                updatedAt: new Date()
            });
            await batch.commit();

            vaultSettings.value = {
                ...vaultSettings.value,
                passwordHash: newPasswordHash,
                salt: newSalt,
                kdfIterations: CURRENT_KDF_ITERATIONS,
                verifierVersion: CURRENT_VERIFIER_VERSION
            };
            derivedKey.value = newKey;
            saveSession(newKey);
        } catch (error) {
            // Non-blocking: the vault remains functional with the previous iterations
            console.error('Error upgrading KDF iterations:', error);
        }
    }

    // Lock vault
    function lockVault() {
        isUnlocked.value = false;
        derivedKey.value = null;
        projects.value = [];
        variables.value = [];
        clearSession();
    }

    // Change master password
    async function changeMasterPassword(currentPassword, newPassword) {
        const auth = getAuth();
        if (!auth.currentUser) throw new Error("Not authenticated");
        if (!isUnlocked.value) throw new Error("Vault not unlocked");

        try {
            // Verify current password
            const currentIterations = vaultSettings.value.kdfIterations || LEGACY_KDF_ITERATIONS;
            const currentHash = await hashPassword(currentPassword, vaultSettings.value.salt, currentIterations);
            if (currentHash !== vaultSettings.value.passwordHash) {
                const legacyHash = await hashPasswordLegacy(currentPassword, vaultSettings.value.salt);
                if (legacyHash !== vaultSettings.value.passwordHash) {
                    throw new Error("Current password is incorrect");
                }
            }

            // Get all variables to re-encrypt
            const variablesCollection = collection(db, "env_variables");
            const q = query(variablesCollection, where("userId", "==", auth.currentUser.uid));
            const querySnapshot = await getDocs(q);

            // Decrypt all variables in parallel (Web Crypto runs natively,
            // Promise.all lets the operations pipeline)
            const decryptedVars = await Promise.all(
                querySnapshot.docs.map(async (docSnap) => {
                    const data = docSnap.data();
                    const decrypted = await decryptValue(data.encryptedValue, derivedKey.value);
                    return { ref: docSnap.ref, data, decrypted };
                })
            );

            // Generate new salt and derive new key
            const newSalt = generateSalt();
            const newKey = await deriveKey(newPassword, newSalt, CURRENT_KDF_ITERATIONS);
            const newPasswordHash = await hashPassword(newPassword, newSalt, CURRENT_KDF_ITERATIONS);

            // Re-encrypt all variables with the new key in parallel
            const reencrypted = await Promise.all(
                decryptedVars.map(async (varItem) => ({
                    ref: varItem.ref,
                    newEncrypted: await encryptValue(varItem.decrypted, newKey),
                }))
            );
            const batch = writeBatch(db);
            for (const item of reencrypted) {
                batch.update(item.ref, { encryptedValue: item.newEncrypted });
            }
            await addContextFilesToBatch(auth.currentUser.uid, derivedKey.value, newKey, batch);

            // Update vault configuration
            const settingsRef = doc(db, 'env_vault_settings', auth.currentUser.uid);
            batch.update(settingsRef, {
                passwordHash: newPasswordHash,
                salt: newSalt,
                kdfIterations: CURRENT_KDF_ITERATIONS,
                verifierVersion: CURRENT_VERIFIER_VERSION,
                updatedAt: new Date()
            });

            await batch.commit();

            // Update local state
            vaultSettings.value = { ...vaultSettings.value, passwordHash: newPasswordHash, salt: newSalt, kdfIterations: CURRENT_KDF_ITERATIONS, verifierVersion: CURRENT_VERIFIER_VERSION };
            derivedKey.value = newKey;
            lastActivity.value = Date.now();

            // Save new session
            saveSession(newKey);

            return true;
        } catch (error) {
            console.error('Error changing master password:', error);
            throw error;
        }
    }

    // Check auto-lock
    function checkAutoLock() {
        // If autoLockMinutes is 0, never lock automatically
        if (autoLockMinutes.value === 0) return false;

        const timeoutMs = autoLockMinutes.value * 60 * 1000;
        if (isUnlocked.value && Date.now() - lastActivity.value > timeoutMs) {
            lockVault();
            return true;
        }
        return false;
    }

    // Actualizar actividad
    function updateActivity() {
        lastActivity.value = Date.now();
    }

    // Cargar proyectos
    async function fetchProjects() {
        const auth = getAuth();
        if (!auth.currentUser || !isUnlocked.value) return;

        try {
            const projectsCollection = collection(db, "env_projects");
            const q = query(projectsCollection, where("userId", "==", auth.currentUser.uid));
            const querySnapshot = await getDocs(q);

            projects.value = querySnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));

            updateActivity();
        } catch (error) {
            console.error('Error fetching projects:', error);
            throw error;
        }
    }

    // Cargar variables de un proyecto
    async function fetchProjectVariables(projectId) {
        const auth = getAuth();
        if (!auth.currentUser || !isUnlocked.value) return [];

        try {
            const variablesCollection = collection(db, "env_variables");
            const q = query(
                variablesCollection,
                where("userId", "==", auth.currentUser.uid),
                where("projectId", "==", projectId)
            );
            const querySnapshot = await getDocs(q);

            const projectVars = querySnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));

            updateActivity();
            return projectVars;
        } catch (error) {
            console.error('Error fetching variables:', error);
            throw error;
        }
    }

    // Obtener archivos de contexto IA de un proyecto
    async function fetchProjectAiContextFiles(projectId) {
        const auth = getAuth();
        if (!auth.currentUser || !isUnlocked.value) return [];

        try {
            const contextCollection = collection(db, "env_context_files");
            const q = query(
                contextCollection,
                where("userId", "==", auth.currentUser.uid),
                where("projectId", "==", projectId)
            );
            const querySnapshot = await getDocs(q);

            const contextFiles = querySnapshot.docs.map((doc) => ({
                id: doc.id,
                ...doc.data()
            }));

            updateActivity();
            return contextFiles;
        } catch (error) {
            console.error('Error fetching AI context files:', error);
            throw error;
        }
    }

    // Obtener contenido descifrado de archivo de contexto IA
    async function getDecryptedContextContent(contextFileId) {
        if (!isUnlocked.value || !derivedKey.value) {
            throw new Error("Vault not unlocked");
        }

        try {
            const contextRef = doc(db, "env_context_files", contextFileId);
            const contextDoc = await getDoc(contextRef);

            if (!contextDoc.exists()) {
                throw new Error("Archivo de contexto no encontrado");
            }

            const data = contextDoc.data();
            const decrypted = await decryptValue(data.encryptedContent, derivedKey.value);

            updateActivity();
            return decrypted;
        } catch (error) {
            console.error('Error decrypting context content:', error);
            throw error;
        }
    }

    // Eliminar archivo de contexto IA
    async function deleteAiContextFile(contextFileId, projectId) {
        const auth = getAuth();
        if (!auth.currentUser || !isUnlocked.value) {
            throw new Error("Vault not unlocked");
        }

        try {
            const contextRef = doc(db, "env_context_files", contextFileId);
            await deleteDoc(contextRef);

            // Actualizar contador en el proyecto
            const projectRef = doc(db, "env_projects", projectId);
            const projectDoc = await getDoc(projectRef);
            if (projectDoc.exists()) {
                const data = projectDoc.data();
                const newCount = Math.max(0, (data.aiContextFilesCount || 1) - 1);
                await updateDoc(projectRef, {
                    aiContextFilesCount: newCount,
                    hasAiContext: newCount > 0,
                    updatedAt: new Date()
                });
            }

            updateActivity();
            return true;
        } catch (error) {
            console.error('Error deleting AI context file:', error);
            throw error;
        }
    }

    // Importar proyectos escaneados
    async function importScannedProjects(scannedProjects) {
        const auth = getAuth();
        if (!auth.currentUser || !isUnlocked.value || !derivedKey.value) {
            throw new Error("Vault not unlocked");
        }

        try {
            const batch = writeBatch(db);
            const importedProjects = [];

            for (const project of scannedProjects) {
                // Crear proyecto
                const projectRef = doc(collection(db, "env_projects"));
                const aiContextFiles = project.aiContextFiles || [];
                const projectData = {
                    userId: auth.currentUser.uid,
                    name: project.name,
                    description: project.description || '',
                    icon: project.icon || '📦',
                    color: project.color || generateRandomColor(),
                    sourceFolder: project.sourceFolder,
                    envFilesCount: project.files.length,
                    variablesCount: project.files.reduce((acc, f) => acc + f.variables.length, 0),
                    aiContextFilesCount: aiContextFiles.length,
                    hasAiContext: aiContextFiles.length > 0,
                    createdAt: new Date(),
                    updatedAt: new Date()
                };
                batch.set(projectRef, projectData);

                // Encriptar variables y archivos de contexto en paralelo,
                // despues agregar al batch. Acelera imports grandes (100+ vars).
                const varEntries = await Promise.all(
                    project.files.flatMap((file) =>
                        file.variables.map(async (variable) => ({
                            ref: doc(collection(db, "env_variables")),
                            data: {
                                userId: auth.currentUser.uid,
                                projectId: projectRef.id,
                                fileName: file.name,
                                filePath: file.path || file.name,
                                variableName: variable.name,
                                encryptedValue: await encryptValue(variable.value, derivedKey.value),
                                category: detectCategory(variable.name),
                                isSecret: isSecretVariable(variable.name),
                                createdAt: new Date(),
                            },
                        }))
                    )
                );
                for (const entry of varEntries) batch.set(entry.ref, entry.data);

                const aiEntries = await Promise.all(
                    aiContextFiles.map(async (aiFile) => ({
                        ref: doc(collection(db, "env_context_files")),
                        data: {
                            userId: auth.currentUser.uid,
                            projectId: projectRef.id,
                            fileName: aiFile.name,
                            filePath: aiFile.path || aiFile.name,
                            aiTool: aiFile.aiTool,
                            encryptedContent: await encryptValue(aiFile.content, derivedKey.value),
                            fileSize: aiFile.size || 0,
                            contentPreview: aiFile.preview || '',
                            icon: aiFile.icon || '📄',
                            label: aiFile.label || 'AI Context',
                            createdAt: new Date(),
                        },
                    }))
                );
                for (const entry of aiEntries) batch.set(entry.ref, entry.data);

                importedProjects.push({ ...projectData, id: projectRef.id });
            }

            await batch.commit();

            // Actualizar lista local
            projects.value = [...projects.value, ...importedProjects];
            updateActivity();

            return importedProjects;
        } catch (error) {
            console.error('Error importing projects:', error);
            throw error;
        }
    }

    // Find existing project by name or sourceFolder
    function findExistingProject(projectNameOrSource) {
        const searchLower = projectNameOrSource.toLowerCase();
        return projects.value.find(p =>
            p.name.toLowerCase() === searchLower ||
            p.sourceFolder?.toLowerCase() === searchLower
        );
    }

    // Update existing project (merge variables)
    async function mergeProject(existingProjectId, incomingProject) {
        const auth = getAuth();
        if (!auth.currentUser || !isUnlocked.value || !derivedKey.value) {
            throw new Error("Vault not unlocked");
        }

        try {
            const batch = writeBatch(db);

            // Get existing variables
            const variablesCollection = collection(db, "env_variables");
            const q = query(
                variablesCollection,
                where("userId", "==", auth.currentUser.uid),
                where("projectId", "==", existingProjectId)
            );
            const existingVarsSnapshot = await getDocs(q);

            // Build a map of existing variables by name+file
            const existingVarsMap = new Map();
            existingVarsSnapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                const key = `${data.fileName}:${data.variableName}`;
                existingVarsMap.set(key, { id: docSnap.id, ref: docSnap.ref, data });
            });

            let addedCount = 0;
            let updatedCount = 0;

            // Encrypt all variables in parallel, then decide update vs set
            const varOps = await Promise.all(
                incomingProject.files.flatMap((file) =>
                    file.variables.map(async (variable) => ({
                        file,
                        variable,
                        key: `${file.name}:${variable.name}`,
                        encryptedValue: await encryptValue(variable.value, derivedKey.value),
                    }))
                )
            );
            for (const op of varOps) {
                if (existingVarsMap.has(op.key)) {
                    const existing = existingVarsMap.get(op.key);
                    batch.update(existing.ref, {
                        encryptedValue: op.encryptedValue,
                        updatedAt: new Date()
                    });
                    updatedCount++;
                } else {
                    const varRef = doc(collection(db, "env_variables"));
                    batch.set(varRef, {
                        userId: auth.currentUser.uid,
                        projectId: existingProjectId,
                        fileName: op.file.name,
                        filePath: op.file.path || op.file.name,
                        variableName: op.variable.name,
                        encryptedValue: op.encryptedValue,
                        category: detectCategory(op.variable.name),
                        isSecret: isSecretVariable(op.variable.name),
                        createdAt: new Date()
                    });
                    addedCount++;
                }
            }

            // Merge AI context files
            let aiAddedCount = 0;
            let aiUpdatedCount = 0;
            const aiContextFiles = incomingProject.aiContextFiles || [];

            if (aiContextFiles.length > 0) {
                // Get existing AI context files for this project
                const contextCollection = collection(db, "env_context_files");
                const contextQuery = query(
                    contextCollection,
                    where("userId", "==", auth.currentUser.uid),
                    where("projectId", "==", existingProjectId)
                );
                const existingContextSnapshot = await getDocs(contextQuery);

                const existingContextMap = new Map();
                existingContextSnapshot.docs.forEach(docSnap => {
                    const data = docSnap.data();
                    existingContextMap.set(data.filePath || data.fileName, { id: docSnap.id, ref: docSnap.ref, data });
                });

                const aiOps = await Promise.all(
                    aiContextFiles.map(async (aiFile) => ({
                        aiFile,
                        filePath: aiFile.path || aiFile.name,
                        encryptedContent: await encryptValue(aiFile.content, derivedKey.value),
                    }))
                );
                for (const op of aiOps) {
                    if (existingContextMap.has(op.filePath)) {
                        const existing = existingContextMap.get(op.filePath);
                        batch.update(existing.ref, {
                            encryptedContent: op.encryptedContent,
                            fileSize: op.aiFile.size || 0,
                            contentPreview: op.aiFile.preview || '',
                            aiTool: op.aiFile.aiTool,
                            icon: op.aiFile.icon || '📄',
                            label: op.aiFile.label || 'AI Context',
                            updatedAt: new Date()
                        });
                        aiUpdatedCount++;
                    } else {
                        const contextRef = doc(collection(db, "env_context_files"));
                        batch.set(contextRef, {
                            userId: auth.currentUser.uid,
                            projectId: existingProjectId,
                            fileName: op.aiFile.name,
                            filePath: op.filePath,
                            aiTool: op.aiFile.aiTool,
                            encryptedContent: op.encryptedContent,
                            fileSize: op.aiFile.size || 0,
                            contentPreview: op.aiFile.preview || '',
                            icon: op.aiFile.icon || '📄',
                            label: op.aiFile.label || 'AI Context',
                            createdAt: new Date()
                        });
                        aiAddedCount++;
                    }
                }
            }

            // Update project metadata
            const projectRef = doc(db, "env_projects", existingProjectId);
            const existingFileNames = new Set(existingVarsSnapshot.docs.map(d => d.data().fileName));
            const newFileNames = incomingProject.files.map(f => f.name).filter(name => !existingFileNames.has(name));
            const project = projects.value.find(p => p.id === existingProjectId);
            const newFilesCount = (project?.envFilesCount || 0) + newFileNames.length;
            const newVarsCount = existingVarsSnapshot.size + addedCount;
            const newAiCount = (project?.aiContextFilesCount || 0) + aiAddedCount;
            batch.update(projectRef, {
                variablesCount: newVarsCount,
                envFilesCount: newFilesCount,
                aiContextFilesCount: newAiCount,
                updatedAt: new Date()
            });

            await batch.commit();

            // Update local list
            const projectIndex = projects.value.findIndex(p => p.id === existingProjectId);
            if (projectIndex !== -1) {
                projects.value[projectIndex] = {
                    ...projects.value[projectIndex],
                    variablesCount: newVarsCount,
                    envFilesCount: newFilesCount,
                    aiContextFilesCount: newAiCount,
                    updatedAt: new Date()
                };
            }

            updateActivity();
            return { added: addedCount, updated: updatedCount };
        } catch (error) {
            console.error('Error merging project:', error);
            throw error;
        }
    }

    // Manually add variables to an existing project
    async function addVariablesToProject(projectId, fileName, variables) {
        const auth = getAuth();
        if (!auth.currentUser || !isUnlocked.value || !derivedKey.value) {
            throw new Error("Vault not unlocked");
        }

        try {
            // Get existing variables for the project
            const variablesCollection = collection(db, "env_variables");
            const q = query(
                variablesCollection,
                where("userId", "==", auth.currentUser.uid),
                where("projectId", "==", projectId)
            );
            const existingVarsSnapshot = await getDocs(q);

            // Build a map of existing variables by name+file
            const existingVarsMap = new Map();
            existingVarsSnapshot.docs.forEach(docSnap => {
                const data = docSnap.data();
                const key = `${data.fileName}:${data.variableName}`;
                existingVarsMap.set(key, { id: docSnap.id, ref: docSnap.ref, data });
            });

            const batch = writeBatch(db);
            let addedCount = 0;
            let updatedCount = 0;
            const existingFileNames = new Set(existingVarsSnapshot.docs.map(d => d.data().fileName));

            const varOps = await Promise.all(
                variables.map(async (variable) => ({
                    variable,
                    key: `${fileName}:${variable.name}`,
                    encryptedValue: await encryptValue(variable.value, derivedKey.value),
                }))
            );
            for (const op of varOps) {
                if (existingVarsMap.has(op.key)) {
                    const existing = existingVarsMap.get(op.key);
                    batch.update(existing.ref, {
                        encryptedValue: op.encryptedValue,
                        updatedAt: new Date()
                    });
                    updatedCount++;
                } else {
                    const varRef = doc(collection(db, "env_variables"));
                    batch.set(varRef, {
                        userId: auth.currentUser.uid,
                        projectId: projectId,
                        fileName: fileName,
                        filePath: fileName,
                        variableName: op.variable.name,
                        encryptedValue: op.encryptedValue,
                        category: detectCategory(op.variable.name),
                        isSecret: isSecretVariable(op.variable.name),
                        createdAt: new Date()
                    });
                    addedCount++;
                }
            }

            // Update project metadata
            const projectRef = doc(db, "env_projects", projectId);
            const newVarsCount = existingVarsSnapshot.size + addedCount;
            const isNewFile = !existingFileNames.has(fileName);
            const project = projects.value.find(p => p.id === projectId);
            const newFilesCount = isNewFile ? (project?.envFilesCount || 0) + 1 : project?.envFilesCount || 0;

            batch.update(projectRef, {
                variablesCount: newVarsCount,
                envFilesCount: newFilesCount,
                updatedAt: new Date()
            });

            await batch.commit();

            // Update local list
            const projectIndex = projects.value.findIndex(p => p.id === projectId);
            if (projectIndex !== -1) {
                projects.value[projectIndex] = {
                    ...projects.value[projectIndex],
                    variablesCount: newVarsCount,
                    envFilesCount: newFilesCount,
                    updatedAt: new Date()
                };
            }

            updateActivity();
            return { added: addedCount, updated: updatedCount };
        } catch (error) {
            console.error('Error adding variables to project:', error);
            throw error;
        }
    }

    // Replace existing project
    async function replaceProject(existingProjectId, incomingProject) {
        const auth = getAuth();
        if (!auth.currentUser || !isUnlocked.value || !derivedKey.value) {
            throw new Error("Vault not unlocked");
        }

        try {
            // Delete existing project
            await deleteProject(existingProjectId);

            // Import the new one
            const imported = await importScannedProjects([incomingProject]);
            return imported[0];
        } catch (error) {
            console.error('Error replacing project:', error);
            throw error;
        }
    }

    // Delete project
    async function deleteProject(projectId) {
        const auth = getAuth();
        if (!auth.currentUser || !isUnlocked.value) {
            throw new Error("Vault not unlocked");
        }

        try {
            const batch = writeBatch(db);

            // Delete project variables
            const variablesCollection = collection(db, "env_variables");
            const varsQuery = query(
                variablesCollection,
                where("userId", "==", auth.currentUser.uid),
                where("projectId", "==", projectId)
            );
            const varsSnapshot = await getDocs(varsQuery);
            varsSnapshot.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
            });

            // Delete project AI context files
            const contextCollection = collection(db, "env_context_files");
            const contextQuery = query(
                contextCollection,
                where("userId", "==", auth.currentUser.uid),
                where("projectId", "==", projectId)
            );
            const contextSnapshot = await getDocs(contextQuery);
            contextSnapshot.docs.forEach((docSnap) => {
                batch.delete(docSnap.ref);
            });

            // Delete project
            const projectRef = doc(db, "env_projects", projectId);
            batch.delete(projectRef);

            await batch.commit();

            // Update local list
            projects.value = projects.value.filter(p => p.id !== projectId);
            updateActivity();

            return true;
        } catch (error) {
            console.error('Error deleting project:', error);
            throw error;
        }
    }

    // Get decrypted value of a variable
    async function getDecryptedValue(variableId) {
        if (!isUnlocked.value || !derivedKey.value) {
            throw new Error("Vault not unlocked");
        }

        try {
            const varRef = doc(db, "env_variables", variableId);
            const varDoc = await getDoc(varRef);

            if (!varDoc.exists()) {
                throw new Error("Variable not found");
            }

            const data = varDoc.data();
            const decrypted = await decryptValue(data.encryptedValue, derivedKey.value);

            updateActivity();
            return decrypted;
        } catch (error) {
            console.error('Error decrypting value:', error);
            throw error;
        }
    }

    // Exportar proyecto como archivo .env
    async function exportProjectAsEnv(projectId) {
        if (!isUnlocked.value || !derivedKey.value) {
            throw new Error("Vault not unlocked");
        }

        try {
            const projectVars = await fetchProjectVariables(projectId);
            const project = projects.value.find(p => p.id === projectId);

            // Decrypt all variables in parallel, then group by file
            const decryptedPairs = await Promise.all(
                projectVars.map(async (variable) => ({
                    fileName: variable.fileName,
                    name: variable.variableName,
                    value: await decryptValue(variable.encryptedValue, derivedKey.value),
                }))
            );
            const fileGroups = {};
            for (const item of decryptedPairs) {
                if (!fileGroups[item.fileName]) {
                    fileGroups[item.fileName] = [];
                }
                fileGroups[item.fileName].push({
                    name: item.name,
                    value: item.value,
                });
            }

            updateActivity();
            return {
                projectName: project?.name || 'unknown',
                files: fileGroups
            };
        } catch (error) {
            console.error('Error exporting project:', error);
            throw error;
        }
    }

    // === CRYPTOGRAPHY FUNCTIONS ===

    // Generate random salt
    function generateSalt() {
        const array = new Uint8Array(16);
        crypto.getRandomValues(array);
        return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
    }

    // Derive HKDF v3 key (production).
    async function deriveKey(password, salt, iterations = CURRENT_KDF_ITERATIONS) {
        return deriveAesKey(password, salt, iterations);
    }

    // Derive raw PBKDF2 key (only for migration of v1/v2 vaults).
    async function deriveKeyRaw(password, salt, iterations) {
        return deriveAesKeyRaw(password, salt, iterations);
    }

    // Hash password with HKDF v3 (production).
    async function hashPassword(password, salt, iterations = CURRENT_KDF_ITERATIONS) {
        return derivePasswordVerifier(password, salt, iterations);
    }

    // Hash password raw PBKDF2 (only to verify v2 vaults during migration).
    async function hashPasswordRaw(password, salt, iterations) {
        return derivePasswordVerifierRaw(password, salt, iterations);
    }

    async function hashPasswordLegacy(password, salt) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password + salt);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(hashBuffer), b => b.toString(16).padStart(2, '0')).join('');
    }

    // Encrypt value
    async function encryptValue(value, key) {
        const encoder = new TextEncoder();
        const iv = crypto.getRandomValues(new Uint8Array(12));

        const encrypted = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            key,
            encoder.encode(value)
        );

        return {
            encrypted: Array.from(new Uint8Array(encrypted), b => b.toString(16).padStart(2, '0')).join(''),
            iv: Array.from(iv, b => b.toString(16).padStart(2, '0')).join('')
        };
    }

    // Decrypt value
    async function decryptValue(encryptedData, key) {
        const encrypted = new Uint8Array(encryptedData.encrypted.match(/.{2}/g).map(b => parseInt(b, 16)));
        const iv = new Uint8Array(encryptedData.iv.match(/.{2}/g).map(b => parseInt(b, 16)));

        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            encrypted
        );

        return new TextDecoder().decode(decrypted);
    }

    // === HELPER FUNCTIONS ===

    // Detect variable category
    function detectCategory(varName) {
        const name = varName.toUpperCase();
        if (name.includes('DATABASE') || name.includes('DB_') || name.includes('MONGO') || name.includes('POSTGRES') || name.includes('MYSQL') || name.includes('REDIS')) {
            return 'database';
        }
        if (name.includes('API') || name.includes('ENDPOINT') || name.includes('URL') || name.includes('URI')) {
            return 'api';
        }
        if (name.includes('AUTH') || name.includes('JWT') || name.includes('TOKEN') || name.includes('SECRET') || name.includes('PASSWORD') || name.includes('KEY')) {
            return 'auth';
        }
        if (name.includes('AWS') || name.includes('AZURE') || name.includes('GCP') || name.includes('CLOUD')) {
            return 'cloud';
        }
        if (name.includes('SMTP') || name.includes('MAIL') || name.includes('EMAIL')) {
            return 'email';
        }
        return 'config';
    }

    // Detect whether it's a secret
    function isSecretVariable(varName) {
        const secretPatterns = [
            /_KEY$/i, /_SECRET$/i, /_TOKEN$/i, /_PASSWORD$/i, /_PASS$/i,
            /_API_KEY$/i, /^API_KEY/i, /^AUTH_/i, /^JWT_/i, /^PRIVATE_/i,
            /_CREDENTIAL/i, /_CERT/i, /^SECRET_/i
        ];
        return secretPatterns.some(pattern => pattern.test(varName));
    }

    // Generate random color for projects
    // Update project icon
    async function updateProjectIcon(projectId, newIcon) {
        const auth = getAuth();
        if (!auth.currentUser || !isUnlocked.value) {
            throw new Error("Vault not unlocked");
        }

        try {
            const projectRef = doc(db, "env_projects", projectId);
            await updateDoc(projectRef, {
                icon: newIcon,
                updatedAt: new Date()
            });

            // Update local list
            const projectIndex = projects.value.findIndex(p => p.id === projectId);
            if (projectIndex !== -1) {
                projects.value[projectIndex] = {
                    ...projects.value[projectIndex],
                    icon: newIcon,
                    updatedAt: new Date()
                };
            }

            updateActivity();
        } catch (error) {
            console.error('Error updating project icon:', error);
            throw error;
        }
    }

    function generateRandomColor() {
        const colors = [
            '#F7DC6F', '#82E0AA', '#85C1E9', '#F8C471', '#D7BDE2',
            '#F1948A', '#AED6F1', '#A3E4D7', '#FAD7A0', '#D5DBDB'
        ];
        return colors[Math.floor(Math.random() * colors.length)];
    }

    // Computed
    const projectsCount = computed(() => projects.value.length);
    const totalVariables = computed(() =>
        projects.value.reduce((acc, p) => acc + (p.variablesCount || 0), 0)
    );

    return {
        // State
        projects,
        variables,
        vaultSettings,
        isUnlocked,
        lastActivity,
        autoLockMinutes,
        AUTO_LOCK_OPTIONS,

        // Actions
        checkVaultSetup,
        setupMasterPassword,
        unlockVault,
        lockVault,
        checkAutoLock,
        updateActivity,
        fetchProjects,
        fetchProjectVariables,
        fetchProjectAiContextFiles,
        importScannedProjects,
        deleteProject,
        deleteAiContextFile,
        getDecryptedValue,
        getDecryptedContextContent,
        exportProjectAsEnv,
        findExistingProject,
        mergeProject,
        replaceProject,
        addVariablesToProject,
        updateProjectIcon,
        changeMasterPassword,
        setAutoLockMinutes,

        // Computed
        projectsCount,
        totalVariables,

        // Helpers (for the scanner)
        detectCategory,
        isSecretVariable,
        generateRandomColor
    };
});
