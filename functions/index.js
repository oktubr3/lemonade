const functions = require('firebase-functions');
const admin = require('firebase-admin');
const crypto = require('crypto');
const cors = require('cors');
const { defineSecret } = require('firebase-functions/params');
const { onSchedule } = require('firebase-functions/v2/scheduler');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const { Polar } = require('@polar-sh/sdk');
const { validateEvent, WebhookVerificationError } = require('@polar-sh/sdk/webhooks');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse
} = require('@simplewebauthn/server');
// TOTP generation using native Node.js crypto (replaces otplib)
function base32Decode(str) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const c of str.toUpperCase()) {
    const val = chars.indexOf(c);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function generateTOTP(secret, period = 30, digits = 6) {
  const key = base32Decode(secret);
  const time = Math.floor(Date.now() / 1000 / period);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigUInt64BE(BigInt(time));
  const hmac = crypto.createHmac('sha1', key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % Math.pow(10, digits);
  return code.toString().padStart(digits, '0');
}

// Configure CORS
const corsHandler = cors({
  origin: [
    'http://localhost:9000',
    'http://localhost:9001',
    'http://localhost:9200',
    'https://passmanager-d2b6d.web.app',
    'https://passmanager-d2b6d.firebaseapp.com',
    'https://app.lemonadepass.app',
    'https://lemonadepass.app'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
});

// Allowed origins for WebAuthn rpID resolution
const ALLOWED_ORIGINS = [
  'http://localhost:9000',
  'http://localhost:9001',
  'http://localhost:9200',
  'https://passmanager-d2b6d.web.app',
  'https://passmanager-d2b6d.firebaseapp.com',
  'https://app.lemonadepass.app',
  'https://lemonadepass.app'
];

// Initialize Firebase Admin
admin.initializeApp();
const db = admin.firestore();

// Helpers for FieldValue that work in emulators
const serverTimestamp = () => {
  if (admin.firestore.FieldValue) {
    return admin.firestore.FieldValue.serverTimestamp();
  }
  return new Date();
};

const deleteField = () => {
  if (admin.firestore.FieldValue) {
    return admin.firestore.FieldValue.delete();
  }
  return null;
};

const timestampFromDate = (date) => {
  if (admin.firestore.Timestamp) {
    return admin.firestore.Timestamp.fromDate(date);
  }
  return date;
};

const arrayUnion = (...elements) => {
  if (admin.firestore.FieldValue) {
    return admin.firestore.FieldValue.arrayUnion(...elements);
  }
  return elements;
};

// Encryption configuration
const encryptionKey = defineSecret('ENCRYPTION_KEY');

// Polar secrets (production)
const polarAccessToken = defineSecret('POLAR_ACCESS_TOKEN');
const polarProductId = defineSecret('POLAR_PRODUCT_ID');
const polarWebhookSecret = defineSecret('POLAR_WEBHOOK_SECRET');

// Helper: Detect if running in emulators
const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

// Log environment on startup
if (isEmulator()) {
  console.log('🍋 Running in EMULATOR mode - Using Polar SANDBOX');
} else {
  console.log('🍋 Running in PRODUCTION mode - Using Polar PRODUCTION');
}

// Helper: Get Polar configuration based on environment
const getPolarConfig = (accessTokenSecret) => {
  if (isEmulator()) {
    // In emulators: use SANDBOX variables from .env.local
    return {
      accessToken: process.env.POLAR_SANDBOX_ACCESS_TOKEN?.trim(),
      server: 'sandbox'
    };
  }
  // In production: use Firebase Secrets + production
  return {
    accessToken: accessTokenSecret.value()?.trim()
  };
};

const getPolarProductId = (productIdSecret) => {
  if (isEmulator()) {
    const sandboxId = process.env.POLAR_SANDBOX_PRODUCT_ID;
    console.log('🔍 Using SANDBOX Product ID:', sandboxId);
    return sandboxId?.trim();
  }
  return productIdSecret.value()?.trim();
};

const getPolarWebhookSecret = (webhookSecretSecret) => {
  if (isEmulator()) {
    return process.env.POLAR_SANDBOX_WEBHOOK_SECRET?.trim();
  }
  return webhookSecretSecret.value()?.trim();
};

const ALGORITHM = 'aes-256-gcm';
const AUTH_TAG_LENGTH = 16;

// Function to encrypt passwords
function encryptPassword(password, keyValue) {
  try {
    const iv = crypto.randomBytes(16);
    const key = Buffer.from(keyValue, 'hex');
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    
    let encrypted = cipher.update(password, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    
    return {
      encrypted: encrypted,
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    };
  } catch (error) {
    console.error('Error encrypting password:', error);
    throw new functions.https.HttpsError('internal', 'Encryption failed');
  }
}

// Function to decrypt passwords
function decryptPassword(encryptedData, keyValue) {
  try {
    const key = Buffer.from(keyValue, 'hex');
    const iv = Buffer.from(encryptedData.iv, 'hex');
    
    // Handle legacy CBC format
    if (!encryptedData.authTag) {
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    }
    
    // Handle new GCM format
    const authTag = Buffer.from(encryptedData.authTag, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('Error decrypting password:', error);
    throw new functions.https.HttpsError('internal', 'Decryption failed');
  }
}

// Function to sanitize inputs
function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  // Remove HTML tags and trim
  return input.replace(/<[^>]*>/g, '').trim();
}

// Function to validate URL
function isValidUrl(url) {
  if (!url) return true; // URL is optional
  try {
    const urlToTest = url.match(/^https?:\/\//) ? url : `https://${url}`;
    new URL(urlToTest);
    return true;
  } catch {
    return false;
  }
}

// Function to validate input data (for callable functions)
function validatePasswordEntry(data) {
  const required = ['title', 'password'];
  const missing = required.filter(field => !data[field]);
  
  if (missing.length > 0) {
    throw new functions.https.HttpsError('invalid-argument', `Missing required fields: ${missing.join(', ')}`);
  }
  
  if (data.password.length < 1 || data.password.length > 500) {
    throw new functions.https.HttpsError('invalid-argument', 'Password length must be between 1 and 500 characters');
  }
  
  return true;
}

// Function to validate input data (for HTTP functions)
function validatePasswordEntryHttp(data) {
  const required = ['title', 'password'];
  const missing = required.filter(field => !data[field]);
  
  if (missing.length > 0) {
    throw new Error(`Missing required fields: ${missing.join(', ')}`);
  }
  
  if (data.password.length < 1 || data.password.length > 500) {
    throw new Error('Password length must be between 1 and 500 characters');
  }
  
  return true;
}

// Function to create audit logs
async function createAuditLog(userId, action, details) {
  try {
    await db.collection('audit_logs').add({
      userId: userId,
      action: action,
      details: details,
      timestamp: serverTimestamp(),
      ip: details.ip || 'unknown'
    });
  } catch (error) {
    console.error('Error creating audit log:', error);
  }
}

// Rate limiting - store attempts in memory
const rateLimitStore = new Map();

// Function to implement rate limiting
function checkRateLimit(userId, action, maxAttempts = 10, windowMs = 60000) {
  const key = `${userId}:${action}`;
  const now = Date.now();
  
  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, { attempts: 1, resetTime: now + windowMs });
    return true;
  }
  
  const data = rateLimitStore.get(key);
  
  if (now > data.resetTime) {
    rateLimitStore.set(key, { attempts: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (data.attempts >= maxAttempts) {
    return false;
  }
  
  data.attempts++;
  return true;
}

async function checkRateLimitPersistent(subject, action, maxAttempts = 10, windowMs = 60000) {
  const safeSubject = String(subject || 'unknown').replace(/[^a-zA-Z0-9_.@-]/g, '_').slice(0, 120);
  const safeAction = String(action || 'action').replace(/[^a-zA-Z0-9_.@-]/g, '_').slice(0, 80);
  const ref = db.collection('rate_limits').doc(`${safeSubject}:${safeAction}`);
  const now = Date.now();

  try {
    return await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : null;
      const resetTime = data?.resetTime || 0;

      if (!data || now > resetTime) {
        tx.set(ref, { attempts: 1, resetTime: now + windowMs, updatedAt: serverTimestamp() });
        return true;
      }

      if ((data.attempts || 0) >= maxAttempts) {
        return false;
      }

      tx.update(ref, { attempts: (data.attempts || 0) + 1, updatedAt: serverTimestamp() });
      return true;
    });
  } catch (error) {
    console.error('Persistent rate limit error:', error);
    // Fail closed for sensitive endpoints.
    return false;
  }
}

async function requireAdminEmailFromRequest(req, res) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token) {
    res.status(401).json({ error: 'No token provided' });
    return null;
  }

  const decodedToken = await admin.auth().verifyIdToken(token);
  if (!isAdminEmail(decodedToken.email)) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }

  return decodedToken;
}

// Callable function to create password entry
exports.createPasswordEntry = functions.https.onCall(
  {
    secrets: [encryptionKey],
    cors: true
  },
  async (data, context) => {
    // Verify authentication
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    // Rate limiting
    if (!checkRateLimit(userId, 'create', 5)) {
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
    }

    try {
      // Validate data
      validatePasswordEntry(data);

      // Encrypt password
      const encryptedPassword = encryptPassword(data.password, encryptionKey.value());

      // Validate URL if provided
      if (data.url && !isValidUrl(data.url)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid URL');
      }

      // Prepare data to save
      const entryData = {
        title: sanitizeInput(data.title),
        username: sanitizeInput(data.username),
        password: encryptedPassword,
        url: sanitizeInput(data.url || ''),
        notes: encryptPassword(sanitizeInput(data.notes || ''), encryptionKey.value()),
        userId: userId,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      // Handle custom fields
      if (data.customFields && Array.isArray(data.customFields)) {
        entryData.customFields = data.customFields
          .slice(0, 10)  // Max 10 custom fields
          .map(field => ({
            label: sanitizeInput(String(field.label || '')).substring(0, 100),
            value: encryptPassword(String(field.value || ''), encryptionKey.value()),
            type: ['text', 'password', 'pin'].includes(field.type) ? field.type : 'text'
          }));
      }

      // Save to Firestore
      const docRef = await db.collection('password_entries').add(entryData);

      // Create audit log
      await createAuditLog(userId, 'CREATE_PASSWORD_ENTRY', {
        entryId: docRef.id,
        title: data.title,
        ip: context.rawRequest?.ip
      });

      return {
        success: true,
        entryId: docRef.id,
        message: 'Password entry created successfully'
      };

    } catch (error) {
      console.error('Error creating password entry:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', 'Failed to create password entry');
    }
  }
);

// Callable function to update password entry
exports.updatePasswordEntry = functions.https.onCall(
  { 
    secrets: [encryptionKey],
    cors: true
  },
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = context.auth.uid;
    const ALLOWED_UPDATE_FIELDS = ['title', 'username', 'password', 'url', 'notes', 'customFields', 'highlighted'];
    const { entryId, ...rawData } = data;
    const updateData = Object.fromEntries(Object.entries(rawData).filter(([k]) => ALLOWED_UPDATE_FIELDS.includes(k)));

    // Rate limiting
    if (!checkRateLimit(userId, 'update', 10)) {
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
    }
    
    if (!entryId) {
      throw new functions.https.HttpsError('invalid-argument', 'Entry ID is required');
    }
    
    try {
      // Verify that the entry belongs to the user
      const entryDoc = await db.collection('password_entries').doc(entryId).get();

      if (!entryDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Password entry not found');
      }

      if (entryDoc.data().userId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Access denied');
      }

      if (entryDoc.data().status === 'deleted') {
        throw new functions.https.HttpsError('failed-precondition', 'Cannot update a deleted entry');
      }

      // Validate URL if provided
      if (updateData.url && !isValidUrl(updateData.url)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid URL');
      }

      // Sanitize text fields
      if (updateData.title) updateData.title = sanitizeInput(updateData.title);
      if (updateData.username) updateData.username = sanitizeInput(updateData.username);
      if (updateData.url !== undefined) updateData.url = sanitizeInput(updateData.url);
      if (updateData.notes !== undefined) updateData.notes = encryptPassword(sanitizeInput(updateData.notes), encryptionKey.value());

      // Encrypt new password if provided
      if (updateData.password) {
        // Save current version to history before overwriting
        const currentData = entryDoc.data();
        if (currentData.password) {
          await db.collection('password_entries').doc(entryId)
            .collection('password_history')
            .add({
              password: currentData.password,
              changedAt: serverTimestamp(),
              changedBy: userId
            });
        }

        validatePasswordEntry({ ...entryDoc.data(), ...updateData });
        updateData.password = encryptPassword(updateData.password, encryptionKey.value());
      }

      // Handle custom fields
      if (updateData.customFields !== undefined) {
        if (Array.isArray(updateData.customFields)) {
          updateData.customFields = updateData.customFields
            .slice(0, 10)
            .map(field => ({
              label: sanitizeInput(String(field.label || '')).substring(0, 100),
              value: encryptPassword(String(field.value || ''), encryptionKey.value()),
              type: ['text', 'password', 'pin'].includes(field.type) ? field.type : 'text'
            }));
        } else {
          // If set to null/empty, remove custom fields
          updateData.customFields = deleteField();
        }
      }

      // Update document
      updateData.updatedAt = serverTimestamp();
      await db.collection('password_entries').doc(entryId).update(updateData);

      // Create audit log
      await createAuditLog(userId, 'UPDATE_PASSWORD_ENTRY', {
        entryId: entryId,
        updatedFields: Object.keys(updateData).filter(key => key !== 'updatedAt'),
        ip: context.rawRequest?.ip
      });

      return {
        success: true,
        message: 'Password entry updated successfully'
      };
      
    } catch (error) {
      console.error('Error updating password entry:', error);
      
      if (error instanceof functions.https.HttpsError) {
        throw error;
      }
      
      throw new functions.https.HttpsError('internal', 'Failed to update password entry');
    }
  }
);

// Callable function to get decrypted password entry
exports.getPasswordEntry = functions.https.onCall(
  { 
    secrets: [encryptionKey],
    cors: true
  },
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = context.auth.uid;
    const { entryId } = data;
    
    // Rate limiting
      if (!checkRateLimit(userId, 'read', 50) || !await checkRateLimitPersistent(userId, 'decryptPassword', 80, 60000)) {
        throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
      }
    
    if (!entryId) {
      throw new functions.https.HttpsError('invalid-argument', 'Entry ID is required');
    }
    
    try {
      // Get document
      const entryDoc = await db.collection('password_entries').doc(entryId).get();

      if (!entryDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Password entry not found');
      }

      const entryData = entryDoc.data();

      if (entryData.userId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Access denied');
      }

      // Decrypt password
      let decryptedPassword;

      if (entryData.password && typeof entryData.password === 'object' && entryData.password.encrypted) {
        decryptedPassword = decryptPassword(entryData.password, encryptionKey.value());
      } else if (typeof entryData.password === 'string') {
        // Legacy CryptoJS format. All entries were migrated; this should only
        // be reachable if a stale backup was restored. The LEGACY_SECRET_KEY
        // is no longer consulted — an admin must rerun migrateLegacyPasswords.
        console.error(`Legacy password format detected for entry ${entryDoc.id}. Run migrateLegacyPasswords.`);
        throw new functions.https.HttpsError('failed-precondition', 'Legacy password format detected. Admin must run migrateLegacyPasswords.');
      } else {
        throw new functions.https.HttpsError('internal', 'Invalid password format');
      }
      
      // Decrypt custom fields if present
      let customFields = [];
      if (entryData.customFields && Array.isArray(entryData.customFields)) {
        customFields = entryData.customFields.map(field => ({
          label: field.label,
          value: decryptPassword(field.value, encryptionKey.value()),
          type: field.type || 'text'
        }));
      }

      // Decrypt notes — handle legacy plain-text notes for backward compat
      const decryptedNotes = entryData.notes && typeof entryData.notes === 'object' && entryData.notes.iv
        ? decryptPassword(entryData.notes, encryptionKey.value())
        : (entryData.notes || '');

      // Create audit log
      await createAuditLog(userId, 'ACCESS_PASSWORD_ENTRY', {
        entryId: entryId,
        title: entryData.title,
        ip: context.rawRequest?.ip
      });

      return {
        ...entryData,
        notes: decryptedNotes,
        password: decryptedPassword,
        customFields,
        hasTotp: !!entryData.totpSecret,
        id: entryDoc.id
      };

    } catch (error) {
      console.error('Error getting password entry:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', 'Failed to get password entry');
    }
  }
);

// Callable function to delete password entry
exports.deletePasswordEntry = functions.https.onCall(
  { 
    secrets: [encryptionKey],
    cors: true
  },
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }
    
    const userId = context.auth.uid;
    const { entryId } = data;
    
    // Rate limiting
    if (!checkRateLimit(userId, 'delete', 10)) {
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
    }
    
    if (!entryId) {
      throw new functions.https.HttpsError('invalid-argument', 'Entry ID is required');
    }
    
    try {
      // Verify that the entry belongs to the user
      const entryDoc = await db.collection('password_entries').doc(entryId).get();

      if (!entryDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Password entry not found');
      }

      if (entryDoc.data().userId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Access denied');
      }

      if (entryDoc.data().status === 'deleted') {
        return { success: true, message: 'Entry is already in trash' };
      }

      // Soft delete - mark as deleted instead of removing
      await db.collection('password_entries').doc(entryId).update({
        deletedAt: serverTimestamp(),
        status: 'deleted'
      });

      // Create audit log
      await createAuditLog(userId, 'SOFT_DELETE_PASSWORD_ENTRY', {
        entryId: entryId,
        title: entryDoc.data().title,
        ip: context.rawRequest?.ip
      });

      return {
        success: true,
        message: 'Password entry moved to trash'
      };

    } catch (error) {
      console.error('Error deleting password entry:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', 'Failed to delete password entry');
    }
  }
);

// HTTP function to create password entry (to avoid CORS)
exports.createPasswordEntryHttp = functions.https.onRequest(
  { secrets: [encryptionKey] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        // Verify method
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const data = req.body;

        // Rate limiting
        if (!checkRateLimit(userId, 'create', 5)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        // Validate data
        validatePasswordEntryHttp(data);

        // Encrypt password
        const encryptedPassword = encryptPassword(data.password, encryptionKey.value());

        // Validate URL if provided
        if (data.url && !isValidUrl(data.url)) {
          return res.status(400).json({ error: 'Invalid URL' });
        }

        // Prepare data to save
        const entryData = {
          title: sanitizeInput(data.title),
          username: sanitizeInput(data.username),
          password: encryptedPassword,
          url: sanitizeInput(data.url || ''),
          notes: encryptPassword(sanitizeInput(data.notes || ''), encryptionKey.value()),
          userId: userId,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        // Handle custom fields
        if (data.customFields && Array.isArray(data.customFields)) {
          entryData.customFields = data.customFields
            .slice(0, 10)  // Max 10 custom fields
            .map(field => ({
              label: sanitizeInput(String(field.label || '')).substring(0, 100),
              value: encryptPassword(String(field.value || ''), encryptionKey.value()),
              type: ['text', 'password', 'pin'].includes(field.type) ? field.type : 'text'
            }));
        }

        // Save to Firestore
        const docRef = await db.collection('password_entries').add(entryData);

        // Create audit log
        await createAuditLog(userId, 'CREATE_PASSWORD_ENTRY', {
          entryId: docRef.id,
          title: data.title,
          ip: req.ip
        });
        
        return res.json({ 
          success: true, 
          entryId: docRef.id,
          message: 'Password entry created successfully'
        });
        
      } catch (error) {
        console.error('Error creating password entry:', error);
        if (error.code === 'auth/id-token-expired') {
          return res.status(401).json({ error: 'Token expired' });
        }
        if (error.code === 'auth/argument-error') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// HTTP function to update password entry (to avoid CORS)
exports.updatePasswordEntryHttp = functions.https.onRequest(
  { secrets: [encryptionKey] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        // Verify method
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }
        
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const ALLOWED_UPDATE_FIELDS = ['title', 'username', 'password', 'url', 'notes', 'customFields', 'highlighted'];
        const { entryId, ...rawBody } = req.body;
        const updateData = Object.fromEntries(Object.entries(rawBody).filter(([k]) => ALLOWED_UPDATE_FIELDS.includes(k)));

        // Rate limiting
        if (!checkRateLimit(userId, 'update', 10)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        if (!entryId) {
          return res.status(400).json({ error: 'Entry ID is required' });
        }
        
        // Verify that the entry belongs to the user
        const entryDoc = await db.collection('password_entries').doc(entryId).get();

        if (!entryDoc.exists) {
          return res.status(404).json({ error: 'Password entry not found' });
        }

        if (entryDoc.data().userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (entryDoc.data().status === 'deleted') {
          return res.status(400).json({ error: 'Cannot update a deleted entry' });
        }

        // Validate URL if provided
        if (updateData.url && !isValidUrl(updateData.url)) {
          return res.status(400).json({ error: 'Invalid URL' });
        }

        // Sanitize text fields
        if (updateData.title) updateData.title = sanitizeInput(updateData.title);
        if (updateData.username) updateData.username = sanitizeInput(updateData.username);
        if (updateData.url !== undefined) updateData.url = sanitizeInput(updateData.url);
        if (updateData.notes !== undefined) updateData.notes = encryptPassword(sanitizeInput(updateData.notes), encryptionKey.value());

        // Encrypt new password if provided
        if (updateData.password) {
          // Save current version to history before overwriting
          const currentData = entryDoc.data();
          if (currentData.password) {
            await db.collection('password_entries').doc(entryId)
              .collection('password_history')
              .add({
                password: currentData.password,
                changedAt: serverTimestamp(),
                changedBy: userId
              });
          }

          validatePasswordEntryHttp({ ...entryDoc.data(), ...updateData });
          updateData.password = encryptPassword(updateData.password, encryptionKey.value());
        }

        // Handle custom fields
        if (updateData.customFields !== undefined) {
          if (Array.isArray(updateData.customFields)) {
            updateData.customFields = updateData.customFields
              .slice(0, 10)
              .map(field => ({
                label: sanitizeInput(String(field.label || '')).substring(0, 100),
                value: encryptPassword(String(field.value || ''), encryptionKey.value()),
                type: ['text', 'password', 'pin'].includes(field.type) ? field.type : 'text'
              }));
          } else {
            // If set to null/empty, remove custom fields
            updateData.customFields = deleteField();
          }
        }

        // Update document
        updateData.updatedAt = serverTimestamp();
        await db.collection('password_entries').doc(entryId).update(updateData);

        // Create audit log
        await createAuditLog(userId, 'UPDATE_PASSWORD_ENTRY', {
          entryId: entryId,
          updatedFields: Object.keys(updateData).filter(key => key !== 'updatedAt'),
          ip: req.ip
        });
        
        return res.json({ 
          success: true, 
          message: 'Password entry updated successfully'
        });
        
      } catch (error) {
        console.error('Error updating password entry:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// HTTP function to delete password entry (to avoid CORS)
exports.deletePasswordEntryHttp = functions.https.onRequest(
  { secrets: [encryptionKey] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        // Verify method
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }
        
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { entryId } = req.body;
        
        // Rate limiting
        if (!checkRateLimit(userId, 'delete', 10)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }
        
        if (!entryId) {
          return res.status(400).json({ error: 'Entry ID is required' });
        }
        
        // Verify that the entry belongs to the user
        const entryDoc = await db.collection('password_entries').doc(entryId).get();

        if (!entryDoc.exists) {
          return res.status(404).json({ error: 'Password entry not found' });
        }

        if (entryDoc.data().userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (entryDoc.data().status === 'deleted') {
          return res.json({ success: true, message: 'Entry is already in trash' });
        }

        // Soft delete - mark as deleted instead of removing
        await db.collection('password_entries').doc(entryId).update({
          deletedAt: serverTimestamp(),
          status: 'deleted'
        });

        // Create audit log
        await createAuditLog(userId, 'SOFT_DELETE_PASSWORD_ENTRY', {
          entryId: entryId,
          title: entryDoc.data().title,
          ip: req.ip
        });

        return res.json({
          success: true,
          message: 'Password entry moved to trash'
        });
        
      } catch (error) {
        console.error('Error deleting password entry:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// HTTP function to restore password entry from trash
exports.restorePasswordEntryHttp = functions.https.onRequest(
  { secrets: [] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        // Verify method
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { entryId } = req.body;

        // Rate limiting
        if (!checkRateLimit(userId, 'restore', 10)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        if (!entryId) {
          return res.status(400).json({ error: 'Entry ID is required' });
        }

        // Verify that the entry belongs to the user
        const entryDoc = await db.collection('password_entries').doc(entryId).get();

        if (!entryDoc.exists) {
          return res.status(404).json({ error: 'Password entry not found' });
        }

        if (entryDoc.data().userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        // Verify that the entry is in trash
        if (entryDoc.data().status !== 'deleted') {
          return res.status(400).json({ error: 'Entry is not in trash' });
        }

        // Restore entry - remove deletedAt and set status to active
        await db.collection('password_entries').doc(entryId).update({
          deletedAt: deleteField(),
          status: 'active'
        });

        // Create audit log
        await createAuditLog(userId, 'RESTORE_PASSWORD_ENTRY', {
          entryId: entryId,
          title: entryDoc.data().title,
          ip: req.ip
        });

        return res.json({
          success: true,
          message: 'Password entry restored successfully'
        });

      } catch (error) {
        console.error('Error restoring password entry:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// HTTP function to permanently delete a password entry from trash
exports.permanentDeletePasswordEntryHttp = functions.https.onRequest(
  { secrets: [] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        // Verify method
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { entryId } = req.body;

        // Rate limiting
        if (!checkRateLimit(userId, 'permanentDelete', 10)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        if (!entryId) {
          return res.status(400).json({ error: 'Entry ID is required' });
        }

        // Verify that the entry belongs to the user
        const entryDoc = await db.collection('password_entries').doc(entryId).get();

        if (!entryDoc.exists) {
          return res.status(404).json({ error: 'Password entry not found' });
        }

        if (entryDoc.data().userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        // Only entries in trash can be permanently deleted
        if (entryDoc.data().status !== 'deleted') {
          return res.status(400).json({ error: 'Only trash items can be permanently deleted' });
        }

        // Delete subcollections (password_history) if they exist
        const historySnapshot = await db.collection('password_entries').doc(entryId)
          .collection('password_history').get();
        if (!historySnapshot.empty) {
          const batch = db.batch();
          historySnapshot.docs.forEach(doc => batch.delete(doc.ref));
          await batch.commit();
        }

        // Delete document permanently
        await db.collection('password_entries').doc(entryId).delete();

        // Create audit log
        await createAuditLog(userId, 'PERMANENT_DELETE_PASSWORD_ENTRY', {
          entryId: entryId,
          title: entryDoc.data().title,
          ip: req.ip
        });

        return res.json({
          success: true,
          message: 'Password entry permanently deleted'
        });

      } catch (error) {
        console.error('Error permanently deleting password entry:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// HTTP function to get trash entries
exports.getTrashEntriesHttp = functions.https.onRequest(
  { secrets: [encryptionKey] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        // Verify method
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        // Rate limiting
        if (!checkRateLimit(userId, 'readTrash', 30)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        // Get deleted entries for the user
        const snapshot = await db.collection('password_entries')
          .where('userId', '==', userId)
          .where('status', '==', 'deleted')
          .get();

        const entries = snapshot.docs.map(doc => {
          const data = doc.data();
          const notes = data.notes && typeof data.notes === 'object' && data.notes.iv
            ? decryptPassword(data.notes, encryptionKey.value())
            : (data.notes || '');
          return {
            id: doc.id,
            title: data.title,
            username: data.username,
            url: data.url || '',
            notes,
            deletedAt: data.deletedAt,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          };
        });

        return res.json({
          success: true,
          entries: entries
        });

      } catch (error) {
        console.error('Error fetching trash entries:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// Scheduled function to purge trash entries after 30 days
exports.purgeTrash = onSchedule('every 24 hours', async () => {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const snapshot = await db.collection('password_entries')
    .where('status', '==', 'deleted')
    .where('deletedAt', '<=', timestampFromDate(thirtyDaysAgo))
    .get();

  if (snapshot.empty) {
    console.log('purgeTrash: No expired trash entries found');
    return;
  }

  // Process each document individually to guarantee no batch exceeds 500 operations
  let totalDeleted = 0;

  for (const doc of snapshot.docs) {
    const batch = db.batch();

    // Delete password_history subcollection docs before the parent
    const historySnapshot = await db.collection('password_entries').doc(doc.id)
      .collection('password_history').get();
    historySnapshot.docs.forEach(historyDoc => batch.delete(historyDoc.ref));

    // Delete the parent entry
    batch.delete(doc.ref);

    await batch.commit();
    totalDeleted++;
  }

  console.log(`purgeTrash: Permanently deleted ${totalDeleted} expired trash entries`);
});

// HTTP migration function to add status field to existing entries
exports.migrateAddStatusFieldHttp = functions.https.onRequest(
  { secrets: [] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        // Verify method
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        if (!isAdminEmail(decodedToken.email)) {
          return res.status(403).json({ error: 'Admin access required' });
        }
        const userId = decodedToken.uid;

        // Get user entries that lack the status field
        const snapshot = await db.collection('password_entries')
          .where('userId', '==', userId)
          .get();

        let updated = 0;
        let skipped = 0;
        const batchSize = 500;

        for (let i = 0; i < snapshot.docs.length; i += batchSize) {
          const batch = db.batch();
          const chunk = snapshot.docs.slice(i, i + batchSize);
          let batchHasUpdates = false;

          for (const doc of chunk) {
            const data = doc.data();
            if (!data.status) {
              batch.update(doc.ref, { status: 'active' });
              updated++;
              batchHasUpdates = true;
            } else {
              skipped++;
            }
          }

          if (batchHasUpdates) {
            await batch.commit();
          }
        }

        return res.json({
          success: true,
          message: `Migration complete: ${updated} entries updated, ${skipped} already had status field`
        });

      } catch (error) {
        console.error('Error migrating status field:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// HTTP function to get decrypted password entry (to avoid CORS)
exports.getPasswordEntryHttp = functions.https.onRequest(
  { secrets: [encryptionKey] },
  async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      // Verify method
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.split('Bearer ')[1];
      if (!token) {
        return res.status(401).json({ error: 'No token provided' });
      }
      
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { entryId } = req.body;
      
      // Rate limiting
      if (!checkRateLimit(userId, 'read', 50) || !await checkRateLimitPersistent(userId, 'decryptPasswordHttp', 80, 60000)) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      
      if (!entryId) {
        return res.status(400).json({ error: 'Entry ID is required' });
      }
      
      // Get document
      const entryDoc = await db.collection('password_entries').doc(entryId).get();

      if (!entryDoc.exists) {
        return res.status(404).json({ error: 'Password entry not found' });
      }

      const entryData = entryDoc.data();

      if (entryData.userId !== userId) {
        return res.status(403).json({ error: 'Access denied' });
      }

      // Decrypt password
      let decryptedPassword;

      if (entryData.password && typeof entryData.password === 'object' && entryData.password.encrypted) {
        decryptedPassword = decryptPassword(entryData.password, encryptionKey.value());
      } else if (typeof entryData.password === 'string') {
        // Legacy CryptoJS format. Migration retired LEGACY_SECRET_KEY use.
        console.error(`Legacy password format for entry ${entryDoc.id}. Admin must run migrateLegacyPasswords.`);
        decryptedPassword = '⚠️ Legacy password format. Admin must run migration.';
      } else {
        throw new Error('Invalid password format');
      }
      
      // Decrypt custom fields if present
      let customFields = [];
      if (entryData.customFields && Array.isArray(entryData.customFields)) {
        customFields = entryData.customFields.map(field => ({
          label: field.label,
          value: decryptPassword(field.value, encryptionKey.value()),
          type: field.type || 'text'
        }));
      }

      // Decrypt notes — handle legacy plain-text notes for backward compat
      const decryptedNotes = entryData.notes && typeof entryData.notes === 'object' && entryData.notes.iv
        ? decryptPassword(entryData.notes, encryptionKey.value())
        : (entryData.notes || '');

      // Create audit log
      await createAuditLog(userId, 'ACCESS_PASSWORD_ENTRY', {
        entryId: entryId,
        title: entryData.title,
        ip: req.ip
      });

      return res.json({
        ...entryData,
        notes: decryptedNotes,
        password: decryptedPassword,
        customFields,
        hasTotp: !!entryData.totpSecret,
        id: entryDoc.id
      });
      
    } catch (error) {
      console.error('Error getting password entry:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Callable function to get user audit logs
exports.getAuditLogs = functions.https.onCall({
  cors: true
}, async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  const userId = context.auth.uid;
  const { limit = 50, offset = 0 } = data;
  
  try {
    const logsQuery = await db.collection('audit_logs')
      .where('userId', '==', userId)
      .orderBy('timestamp', 'desc')
      .limit(limit)
      .offset(offset)
      .get();
    
    const logs = logsQuery.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    
    return { logs };
    
  } catch (error) {
    console.error('Error getting audit logs:', error);
    throw new functions.https.HttpsError('internal', 'Failed to get audit logs');
  }
});

// =============================================================================
// PASSWORD SECURITY CHECK - Using HaveIBeenPwned API (Real breach data)
// =============================================================================

/**
 * Check if password appears in data breaches using HaveIBeenPwned API
 * Uses k-anonymity: only first 5 chars of SHA-1 hash are sent to API
 * This is privacy-preserving and free to use
 */
async function checkPasswordInBreaches(password) {
  try {
    // Create SHA-1 hash of password
    const hash = crypto.createHash('sha1').update(password).digest('hex').toUpperCase();
    const prefix = hash.substring(0, 5);
    const suffix = hash.substring(5);

    // Query HaveIBeenPwned API with k-anonymity
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: {
        'User-Agent': 'LemonadePasswordManager',
        'Add-Padding': 'true' // Adds padding to prevent response length analysis
      }
    });

    if (!response.ok) {
      console.error('HIBP API error:', response.status);
      return { found: false, count: 0, error: true };
    }

    const text = await response.text();
    const lines = text.split('\n');

    // Check if our hash suffix is in the response
    for (const line of lines) {
      const [hashSuffix, count] = line.split(':');
      if (hashSuffix && hashSuffix.trim() === suffix) {
        return {
          found: true,
          count: parseInt(count.trim(), 10) || 1,
          error: false
        };
      }
    }

    return { found: false, count: 0, error: false };
  } catch (error) {
    console.error('Error checking HIBP:', error);
    return { found: false, count: 0, error: true };
  }
}

/**
 * Analyze password strength (simple algorithm, no AI needed)
 */
function analyzePasswordStrength(password) {
  const length = password.length;
  const hasUpperCase = /[A-Z]/.test(password);
  const hasLowerCase = /[a-z]/.test(password);
  const hasNumbers = /\d/.test(password);
  const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?`~]/.test(password);

  // Calculate strength score
  let score = 0;
  if (length >= 8) score++;
  if (length >= 12) score++;
  if (length >= 16) score++;
  if (hasUpperCase) score++;
  if (hasLowerCase) score++;
  if (hasNumbers) score++;
  if (hasSpecialChars) score++;

  // Check for common patterns (weakness indicators)
  const hasSequentialNumbers = /123|234|345|456|567|678|789|012/.test(password);
  const hasRepeatingChars = /(.)\1{2,}/.test(password);
  const hasKeyboardPattern = /qwerty|asdf|zxcv|qazwsx/i.test(password);

  if (hasSequentialNumbers) score--;
  if (hasRepeatingChars) score--;
  if (hasKeyboardPattern) score -= 2;

  // Determine security level
  let securityLevel;
  if (score <= 1) securityLevel = 'very_weak';
  else if (score <= 3) securityLevel = 'weak';
  else if (score <= 5) securityLevel = 'medium';
  else if (score <= 6) securityLevel = 'strong';
  else securityLevel = 'very_strong';

  // Build recommendations
  const recommendations = [];
  const vulnerabilities = [];

  if (length < 8) {
    recommendations.push('security.rec.minChars');
    vulnerabilities.push('security.vuln.tooShort');
  } else if (length < 12) {
    recommendations.push('security.rec.consider12');
  }

  if (!hasUpperCase) recommendations.push('security.rec.uppercase');
  if (!hasLowerCase) recommendations.push('security.rec.lowercase');
  if (!hasNumbers) recommendations.push('security.rec.numbers');
  if (!hasSpecialChars) recommendations.push('security.rec.special');

  if (hasSequentialNumbers) vulnerabilities.push('security.vuln.sequential');
  if (hasRepeatingChars) vulnerabilities.push('security.vuln.repeating');
  if (hasKeyboardPattern) vulnerabilities.push('security.vuln.keyboard');

  return {
    securityLevel,
    recommendations: recommendations.slice(0, 4),
    vulnerabilities: vulnerabilities.slice(0, 3),
    score
  };
}

/**
 * Main password security check endpoint
 * Checks against HaveIBeenPwned + analyzes strength
 */
exports.checkPasswordSecurity = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }

      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      // Rate limiting - max 30 checks per minute
      if (!await checkRateLimitPersistent(userId, 'password_security', 30, 60000)) {
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }

      const { password, title } = req.body;

      // Validate input
      if (!password || typeof password !== 'string') {
        return res.status(400).json({ error: 'Password is required' });
      }

      if (password.length > 256) {
        return res.status(400).json({ error: 'Password too long' });
      }

      // 1. Check if password appears in real data breaches (HaveIBeenPwned)
      const breachResult = await checkPasswordInBreaches(password);

      // 2. Analyze password strength
      const strengthAnalysis = analyzePasswordStrength(password);

      // 3. Build final result
      const isCompromised = breachResult.found;
      let { securityLevel, recommendations, vulnerabilities } = strengthAnalysis;

      // If found in breaches, override security level and add vulnerability
      if (isCompromised) {
        securityLevel = 'very_weak';
        vulnerabilities = [
          `security.vuln.breached:${breachResult.count}`,
          ...vulnerabilities
        ].slice(0, 4);
        recommendations = [
          'security.rec.changeNow',
          'security.rec.uniquePassword',
          ...recommendations
        ].slice(0, 4);
      }

      const analysisResult = {
        isCompromised,
        breachCount: breachResult.found ? breachResult.count : 0,
        securityLevel,
        recommendations,
        vulnerabilities,
        confidence: breachResult.error ? 0.7 : 1.0,
        checkedWith: breachResult.error ? 'strength-analysis' : 'haveibeenpwned'
      };

      // Create audit log
      await createAuditLog(userId, 'CHECK_PASSWORD_SECURITY', {
        title: title || 'Password Security Check',
        securityLevel: analysisResult.securityLevel,
        isCompromised: analysisResult.isCompromised,
        breachCount: analysisResult.breachCount,
        checkedWith: analysisResult.checkedWith,
        ip: req.ip,
      });

      return res.json({
        success: true,
        data: analysisResult,
      });
    } catch (error) {
      console.error('Error checking password security:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Health check endpoint
exports.healthCheck = functions.https.onRequest((req, res) => {
  return corsHandler(req, res, () => {
    res.json({ status: 'ok' });
  });
});

// Administrative function to migrate all password entries with updatedAt field
exports.migratePasswordEntries = functions.https.onCall(
  {
    secrets: [encryptionKey],
    cors: true
  },
  async (data, context) => {
    // Security: Only allow authenticated admin users
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userEmail = context.auth.token.email;
    if (!isAdminEmail(userEmail)) {
      throw new functions.https.HttpsError('permission-denied', 'Only administrators can run migration');
    }

    console.log(`Starting password entries migration by admin: ${userEmail}`);

    try {
      let batch = db.batch();
      const now = serverTimestamp();
      let processedCount = 0;
      let batchCount = 0;
      const BATCH_SIZE = 500; // Firestore batch limit

      // Get all password entries - we'll filter client-side for those without updatedAt
      // Firestore doesn't efficiently query for non-existent fields
      const snapshot = await db.collection('password_entries').get();

      // Filter entries that don't have updatedAt field
      const entriesToMigrate = snapshot.docs.filter(doc => {
        const data = doc.data();
        return !data.hasOwnProperty('updatedAt') || data.updatedAt === null || data.updatedAt === undefined;
      });

      if (entriesToMigrate.length === 0) {
        console.log('No entries found without updatedAt field');
        return {
          success: true,
          message: 'No entries need migration',
          processedCount: 0
        };
      }

      console.log(`Found ${entriesToMigrate.length} entries to migrate out of ${snapshot.size} total`);

      // Process entries in batches
      for (const doc of entriesToMigrate) {
        // Add updatedAt field to the document
        batch.update(doc.ref, {
          updatedAt: now,
          migratedAt: now // Track when migration happened
        });

        processedCount++;

        // Commit batch when it reaches the limit
        if (processedCount % BATCH_SIZE === 0) {
          await batch.commit();
          batchCount++;
          console.log(`Committed batch ${batchCount} (${processedCount} entries processed)`);
          
          // Create new batch for next set
          batch = db.batch();
        }
      }

      // Commit any remaining documents in the final batch
      if (processedCount % BATCH_SIZE !== 0) {
        await batch.commit();
        batchCount++;
        console.log(`Committed final batch ${batchCount}`);
      }

      // Create audit log
      await createAuditLog('SYSTEM', 'MIGRATE_PASSWORD_ENTRIES', {
        adminUser: userEmail,
        processedCount,
        batchCount,
        timestamp: new Date().toISOString()
      });

      console.log(`Migration completed successfully. Processed ${processedCount} entries in ${batchCount} batches`);

      return {
        success: true,
        message: `Successfully migrated ${processedCount} password entries`,
        processedCount,
        batchCount
      };

    } catch (error) {
      console.error('Migration failed:', error);
      throw new functions.https.HttpsError('internal', `Migration failed: ${error.message}`);
    }
  }
);

// HTTP version for easier testing/calling from external tools
exports.migratePasswordEntriesHttp = functions.https.onRequest(async (req, res) => {
  return corsHandler(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // Get the auth token from the request
      const authToken = req.headers.authorization?.replace('Bearer ', '');
      if (!authToken) {
        return res.status(401).json({ error: 'No authentication token provided' });
      }

      // Verify the token
      const decodedToken = await admin.auth().verifyIdToken(authToken);
      const userEmail = decodedToken.email;
      
      // Check admin permissions
      const adminEmails = ['mauroh@gmail.com']; // Add your admin emails here
      if (!adminEmails.includes(userEmail)) {
        return res.status(403).json({ error: 'Only administrators can run migration' });
      }

      console.log(`Starting HTTP password entries migration by admin: ${userEmail}`);

      let batch = db.batch();
      const now = serverTimestamp();
      let processedCount = 0;
      let batchCount = 0;
      const BATCH_SIZE = 500;

      // Get all password entries - we'll filter client-side for those without updatedAt
      // Firestore doesn't efficiently query for non-existent fields
      const snapshot = await db.collection('password_entries').get();

      // Filter entries that don't have updatedAt field
      const entriesToMigrate = snapshot.docs.filter(doc => {
        const data = doc.data();
        return !data.hasOwnProperty('updatedAt') || data.updatedAt === null || data.updatedAt === undefined;
      });

      if (entriesToMigrate.length === 0) {
        return res.json({
          success: true,
          message: 'No entries need migration',
          processedCount: 0
        });
      }

      console.log(`Found ${entriesToMigrate.length} entries to migrate out of ${snapshot.size} total`);

      // Process entries in batches
      for (const doc of entriesToMigrate) {
        batch.update(doc.ref, {
          updatedAt: now,
          migratedAt: now
        });

        processedCount++;

        if (processedCount % BATCH_SIZE === 0) {
          await batch.commit();
          batchCount++;
          console.log(`Committed batch ${batchCount} (${processedCount} entries processed)`);
          
          batch = db.batch();
        }
      }

      if (processedCount % BATCH_SIZE !== 0) {
        await batch.commit();
        batchCount++;
      }

      // Create audit log
      await createAuditLog('SYSTEM', 'MIGRATE_PASSWORD_ENTRIES_HTTP', {
        adminUser: userEmail,
        processedCount,
        batchCount,
        timestamp: new Date().toISOString()
      });

      console.log(`HTTP Migration completed. Processed ${processedCount} entries`);

      res.json({
        success: true,
        message: `Successfully migrated ${processedCount} password entries`,
        processedCount,
        batchCount
      });

    } catch (error) {
      console.error('HTTP Migration failed:', error);
      res.status(500).json({
        error: 'Migration failed',
        details: error.message
      });
    }
  });
});

// Admin-only migration: encrypt plaintext notes on existing password entries
exports.migratePasswordEntryNotes = functions.https.onRequest(
  { secrets: [encryptionKey] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      try {
        const authToken = req.headers.authorization?.replace('Bearer ', '');
        if (!authToken) return res.status(401).json({ error: 'No authentication token provided' });

        const decodedToken = await admin.auth().verifyIdToken(authToken);
        if (!isAdminEmail(decodedToken.email)) {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const snapshot = await db.collection('password_entries').get();
        const toMigrate = snapshot.docs.filter(doc => {
          const notes = doc.data().notes;
          return typeof notes === 'string' && notes.length > 0;
        });

        if (toMigrate.length === 0) {
          return res.json({ success: true, message: 'No entries need migration', migratedCount: 0 });
        }

        const BATCH_SIZE = 499;
        let batch = db.batch();
        let migratedCount = 0;
        let batchCount = 0;

        for (const doc of toMigrate) {
          const encrypted = encryptPassword(doc.data().notes, encryptionKey.value());
          batch.update(doc.ref, { notes: encrypted });
          migratedCount++;
          if (migratedCount % BATCH_SIZE === 0) {
            await batch.commit();
            batchCount++;
            batch = db.batch();
          }
        }

        if (migratedCount % BATCH_SIZE !== 0) {
          await batch.commit();
          batchCount++;
        }

        console.log(`Notes migration: ${migratedCount} entries encrypted by ${decodedToken.email}`);
        return res.json({ success: true, migratedCount, batchCount });
      } catch (error) {
        console.error('Notes migration failed:', error);
        return res.status(500).json({ error: 'Migration failed', details: error.message });
      }
    });
  }
);


// ============================================
// PASSWORD SHARING FUNCTIONS
// ============================================

// HTTP function to migrate all Auth users to the users collection
exports.migrateAllUsersHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      // Verify that the authenticated user is bootstrap admin
      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      if (!isAdminEmail(decodedToken.email)) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      // List all Firebase Auth users
      const listUsersResult = await admin.auth().listUsers(1000);
      const batch = db.batch();
      let count = 0;

      for (const userRecord of listUsersResult.users) {
        const userRef = db.collection('users').doc(userRecord.uid);
        batch.set(userRef, {
          uid: userRecord.uid,
          email: userRecord.email || '',
          displayName: userRecord.displayName || '',
          photoURL: userRecord.photoURL || '',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        }, { merge: true });
        count++;
      }

      await batch.commit();
      console.log(`Migrated ${count} users to users collection`);
      res.json({ success: true, message: `Migrated ${count} users`, count });

    } catch (error) {
      console.error('Error migrating users:', error);
      res.status(500).json({ error: 'Failed to migrate users', details: error.message });
    }
  });
});

// HTTP function to register/update user in users collection
// Called from the frontend when the user logs in
exports.registerUserHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const user = await admin.auth().getUser(decodedToken.uid);

      // Create or update the user document
      await db.collection('users').doc(user.uid).set({
        uid: user.uid,
        email: user.email || '',
        displayName: user.displayName || '',
        photoURL: user.photoURL || '',
        updatedAt: serverTimestamp()
      }, { merge: true });

      // Check inactive account lock: 0 passwords + 0 vault projects + account age > 90 days
      const settingsDoc = await db.collection('user_settings').doc(user.uid).get();
      const settingsData = settingsDoc.exists ? settingsDoc.data() : {};
      const isManuallyUnlocked = settingsData.accountUnlocked === true;
      const isAlreadyLocked = settingsData.accountLocked === true;

      if (isAlreadyLocked && !isManuallyUnlocked) {
        console.log(`Account already locked for user ${user.uid} (${user.email})`);
        res.json({ success: true, locked: true, message: 'Account locked' });
        return;
      }

      if (!isManuallyUnlocked) {
        const creationTime = new Date(user.metadata.creationTime);
        const daysSinceCreation = (Date.now() - creationTime.getTime()) / (1000 * 60 * 60 * 24);

        if (daysSinceCreation > 90) {
          const passwordsSnap = await db.collection('password_entries')
            .where('userId', '==', user.uid)
            .where('status', '==', 'active')
            .limit(1)
            .get();

          const vaultSnap = await db.collection('env_projects')
            .where('userId', '==', user.uid)
            .limit(1)
            .get();

          if (passwordsSnap.empty && vaultSnap.empty) {
            await db.collection('user_settings').doc(user.uid).set({
              accountLocked: true,
              accountLockedAt: serverTimestamp()
            }, { merge: true });

            console.log(`Account locked for inactive user ${user.uid} (${user.email})`);
            res.json({ success: true, locked: true, message: 'Account locked due to inactivity' });
            return;
          }
        }
      }

      console.log(`User ${user.uid} registered/updated in users collection`);
      res.json({ success: true, message: 'User registered' });

    } catch (error) {
      console.error('Error registering user:', error);
      res.status(500).json({ error: 'Failed to register user' });
    }
  });
});

// Callable function to get list of system users
exports.getSystemUsers = functions.https.onCall(
  { cors: true },
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    if (!await isUserAdmin(userId)) {
      throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    // Rate limiting
    if (!checkRateLimit(userId, 'getUsers', 20)) {
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
    }

    try {
      const usersSnapshot = await db.collection('users').get();
      const users = [];

      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        // For testing: include all users (including the current one)
        users.push({
          uid: doc.id,
          email: userData.email,
          displayName: userData.displayName,
          photoURL: userData.photoURL
        });
      });

      // Sort by displayName
      users.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));

      return { success: true, users };

    } catch (error) {
      console.error('Error getting system users:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get users');
    }
  }
);

// HTTP function to get system users
exports.getSystemUsersHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      if (!await checkRateLimitPersistent(userId, 'getUsers', 10, 60000)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      // Get blocked users for current user
      const blockedSnapshot = await db.collection('blocked_users')
        .where('blockerUserId', '==', userId)
        .get();
      const blockedByMe = new Set();
      blockedSnapshot.forEach(doc => blockedByMe.add(doc.data().blockedUserId));

      const { searchQuery } = req.body;

      if (searchQuery && searchQuery.length >= 5) {
        // Search mode: exact email match only (prevents user enumeration)
        const search = searchQuery.toLowerCase().trim();
        const usersSnapshot = await db.collection('users')
          .where('email', '==', search)
          .limit(1)
          .get();
        const users = [];

        usersSnapshot.forEach(doc => {
          if (doc.id === userId) return;
          if (blockedByMe.has(doc.id)) return;
          const userData = doc.data();
          users.push({
            uid: doc.id,
            email: userData.email,
            displayName: userData.displayName,
            photoURL: userData.photoURL
          });
        });

        res.json({ success: true, users, mode: 'search' });

      } else {
        // Recent contacts mode: last 5 users this user shared with
        const recentShares = await db.collection('shared_passwords')
          .where('fromUserId', '==', userId)
          .orderBy('createdAt', 'desc')
          .limit(20)
          .get();

        const seenUids = new Set();
        const recentUserIds = [];
        recentShares.forEach(doc => {
          const toUid = doc.data().toUserId;
          if (!seenUids.has(toUid) && toUid !== userId && !blockedByMe.has(toUid)) {
            seenUids.add(toUid);
            recentUserIds.push(toUid);
          }
        });

        const recentUsers = [];
        for (const uid of recentUserIds.slice(0, 5)) {
          const userDoc = await db.collection('users').doc(uid).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            recentUsers.push({
              uid: userDoc.id,
              email: userData.email,
              displayName: userData.displayName,
              photoURL: userData.photoURL
            });
          }
        }

        res.json({ success: true, users: recentUsers, mode: 'recent' });
      }

    } catch (error) {
      console.error('Error getting system users:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  });
});

// Callable function to share a password with another user
exports.sharePasswordEntry = functions.https.onCall(
  { secrets: [encryptionKey], cors: true },
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { entryId, toUserId } = data;

    // Rate limiting
    if (!await checkRateLimitPersistent(userId, 'share', 10)) {
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
    }

    if (!entryId || !toUserId) {
      throw new functions.https.HttpsError('invalid-argument', 'Entry ID and target user ID are required');
    }

    // Allowed for testing - sharing with oneself
    // if (userId === toUserId) {
    //   throw new functions.https.HttpsError('invalid-argument', 'Cannot share with yourself');
    // }

    try {
      // Verify that the entry exists and belongs to the user
      const entryDoc = await db.collection('password_entries').doc(entryId).get();

      if (!entryDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Password entry not found');
      }

      if (entryDoc.data().userId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Access denied');
      }

      if (entryDoc.data().status === 'deleted') {
        throw new functions.https.HttpsError('failed-precondition', 'Cannot share a deleted entry');
      }

      // Verify that the target user exists
      const toUserDoc = await db.collection('users').doc(toUserId).get();
      if (!toUserDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Target user not found');
      }

      // Verify that the recipient has not blocked the sender
      const blockCheck = await db.collection('blocked_users')
        .where('blockerUserId', '==', toUserId)
        .where('blockedUserId', '==', userId)
        .limit(1)
        .get();
      if (!blockCheck.empty) {
        throw new functions.https.HttpsError('permission-denied', 'Unable to share with this user');
      }

      // Get data of the sharing user
      const fromUserDoc = await db.collection('users').doc(userId).get();
      const fromUserData = fromUserDoc.exists ? fromUserDoc.data() : {};

      // Verify that no pending invitation already exists
      const existingShare = await db.collection('shared_passwords')
        .where('fromUserId', '==', userId)
        .where('toUserId', '==', toUserId)
        .where('originalEntryId', '==', entryId)
        .where('status', '==', 'pending')
        .get();

      if (!existingShare.empty) {
        throw new functions.https.HttpsError('already-exists', 'A pending invitation already exists for this password');
      }

      const entryData = entryDoc.data();

      // Create share record (the password is already encrypted)
      const shareData = {
        fromUserId: userId,
        fromUserName: fromUserData.displayName || fromUserData.email || 'User',
        fromUserEmail: fromUserData.email || '',
        fromUserPhoto: fromUserData.photoURL || '',
        toUserId: toUserId,
        originalEntryId: entryId,
        passwordData: {
          title: entryData.title || entryData.name || 'Untitled',
          username: entryData.username || '',
          password: entryData.password, // Already encrypted
          url: entryData.url || '',
          notes: entryData.notes || ''
        },
        status: 'pending',
        createdAt: serverTimestamp(),
        respondedAt: null
      };

      const shareRef = await db.collection('shared_passwords').add(shareData);

      // Create audit log
      await createAuditLog(userId, 'SHARE_PASSWORD_ENTRY', {
        entryId: entryId,
        shareId: shareRef.id,
        toUserId: toUserId,
        ip: context.rawRequest?.ip
      });

      return {
        success: true,
        shareId: shareRef.id,
        message: 'Password shared successfully'
      };

    } catch (error) {
      console.error('Error sharing password entry:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', 'Failed to share password entry');
    }
  }
);

// HTTP function to share password
exports.sharePasswordEntryHttp = functions.https.onRequest({ secrets: [encryptionKey] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { entryId, toUserId } = req.body;

      if (!await checkRateLimitPersistent(userId, 'share', 10)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      if (!entryId || !toUserId) {
        res.status(400).json({ error: 'Entry ID and target user ID are required' });
        return;
      }

      // Allowed for testing
      // if (userId === toUserId) {
      //   res.status(400).json({ error: 'Cannot share with yourself' });
      //   return;
      // }

      const entryDoc = await db.collection('password_entries').doc(entryId).get();

      if (!entryDoc.exists) {
        res.status(404).json({ error: 'Password entry not found' });
        return;
      }

      if (entryDoc.data().userId !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      if (entryDoc.data().status === 'deleted') {
        res.status(400).json({ error: 'Cannot share a deleted entry' });
        return;
      }

      const toUserDoc = await db.collection('users').doc(toUserId).get();
      if (!toUserDoc.exists) {
        res.status(404).json({ error: 'Target user not found' });
        return;
      }

      // Check if recipient has blocked the sender
      const blockCheck = await db.collection('blocked_users')
        .where('blockerUserId', '==', toUserId)
        .where('blockedUserId', '==', userId)
        .limit(1)
        .get();
      if (!blockCheck.empty) {
        res.status(400).json({ error: 'Unable to share with this user' });
        return;
      }

      const fromUserDoc = await db.collection('users').doc(userId).get();
      const fromUserData = fromUserDoc.exists ? fromUserDoc.data() : {};

      const existingShare = await db.collection('shared_passwords')
        .where('fromUserId', '==', userId)
        .where('toUserId', '==', toUserId)
        .where('originalEntryId', '==', entryId)
        .where('status', '==', 'pending')
        .get();

      if (!existingShare.empty) {
        res.status(409).json({ error: 'A pending invitation already exists for this password' });
        return;
      }

      const entryData = entryDoc.data();

      const shareData = {
        fromUserId: userId,
        fromUserName: fromUserData.displayName || fromUserData.email || 'User',
        fromUserEmail: fromUserData.email || '',
        fromUserPhoto: fromUserData.photoURL || '',
        toUserId: toUserId,
        originalEntryId: entryId,
        passwordData: {
          title: entryData.title || entryData.name || 'Untitled',
          username: entryData.username || '',
          password: entryData.password,
          url: entryData.url || '',
          notes: entryData.notes || ''
        },
        status: 'pending',
        createdAt: serverTimestamp(),
        respondedAt: null
      };

      const shareRef = await db.collection('shared_passwords').add(shareData);

      await createAuditLog(userId, 'SHARE_PASSWORD_ENTRY', {
        entryId: entryId,
        shareId: shareRef.id,
        toUserId: toUserId
      });

      res.json({ success: true, shareId: shareRef.id, message: 'Password shared successfully' });

    } catch (error) {
      console.error('Error sharing password:', error);
      res.status(500).json({ error: 'Failed to share password' });
    }
  });
});

// Callable function to get pending shared passwords
exports.getPendingSharedPasswords = functions.https.onCall(
  { cors: true },
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;

    if (!await checkRateLimitPersistent(userId, 'getPending', 30)) {
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
    }

    try {
      const pendingSnapshot = await db.collection('shared_passwords')
        .where('toUserId', '==', userId)
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .get();

      const pendingShares = [];

      pendingSnapshot.forEach(doc => {
        const data = doc.data();
        pendingShares.push({
          id: doc.id,
          fromUserName: data.fromUserName,
          fromUserEmail: data.fromUserEmail,
          fromUserPhoto: data.fromUserPhoto,
          passwordData: {
            title: data.passwordData.title,
            username: data.passwordData.username,
            url: data.passwordData.url
            // Do not include password or notes in the preview
          },
          createdAt: data.createdAt
        });
      });

      return { success: true, pendingShares };

    } catch (error) {
      console.error('Error getting pending shared passwords:', error);
      throw new functions.https.HttpsError('internal', 'Failed to get pending shares');
    }
  }
);

// HTTP function to get pending passwords
exports.getPendingSharedPasswordsHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      if (!await checkRateLimitPersistent(userId, 'getPending', 30)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      const pendingSnapshot = await db.collection('shared_passwords')
        .where('toUserId', '==', userId)
        .where('status', '==', 'pending')
        .orderBy('createdAt', 'desc')
        .get();

      const pendingShares = [];

      pendingSnapshot.forEach(doc => {
        const data = doc.data();
        pendingShares.push({
          id: doc.id,
          fromUserName: data.fromUserName,
          fromUserEmail: data.fromUserEmail,
          fromUserPhoto: data.fromUserPhoto,
          passwordData: {
            title: data.passwordData.title,
            username: data.passwordData.username,
            url: data.passwordData.url
          },
          createdAt: data.createdAt
        });
      });

      res.json({ success: true, pendingShares });

    } catch (error) {
      console.error('Error getting pending shares:', error);
      res.status(500).json({ error: 'Failed to get pending shares' });
    }
  });
});

// Callable function to accept a shared password
exports.acceptSharedPassword = functions.https.onCall(
  { secrets: [encryptionKey], cors: true },
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { shareId } = data;

    if (!await checkRateLimitPersistent(userId, 'acceptShare', 20)) {
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
    }

    if (!shareId) {
      throw new functions.https.HttpsError('invalid-argument', 'Share ID is required');
    }

    try {
      const shareDoc = await db.collection('shared_passwords').doc(shareId).get();

      if (!shareDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Shared password not found');
      }

      const shareData = shareDoc.data();

      if (shareData.toUserId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Access denied');
      }

      if (shareData.status !== 'pending') {
        throw new functions.https.HttpsError('failed-precondition', 'This share has already been processed');
      }

      // Create new password entry for the accepting user
      const newEntryData = {
        title: shareData.passwordData.title,
        username: shareData.passwordData.username,
        password: shareData.passwordData.password, // Already encrypted
        url: shareData.passwordData.url,
        notes: shareData.passwordData.notes,
        userId: userId,
        sharedFrom: shareData.fromUserId,
        sharedFromName: shareData.fromUserName,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const newEntryRef = await db.collection('password_entries').add(newEntryData);

      // Update the share as accepted
      await db.collection('shared_passwords').doc(shareId).update({
        status: 'accepted',
        respondedAt: serverTimestamp(),
        newEntryId: newEntryRef.id
      });

      // Create audit log
      await createAuditLog(userId, 'ACCEPT_SHARED_PASSWORD', {
        shareId: shareId,
        newEntryId: newEntryRef.id,
        fromUserId: shareData.fromUserId,
        ip: context.rawRequest?.ip
      });

      return {
        success: true,
        entryId: newEntryRef.id,
        message: 'Password accepted and added to your vault'
      };

    } catch (error) {
      console.error('Error accepting shared password:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', 'Failed to accept shared password');
    }
  }
);

// HTTP function to accept shared password
exports.acceptSharedPasswordHttp = functions.https.onRequest({ secrets: [encryptionKey] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { shareId } = req.body;

      if (!await checkRateLimitPersistent(userId, 'acceptShare', 20)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      if (!shareId) {
        res.status(400).json({ error: 'Share ID is required' });
        return;
      }

      const shareDoc = await db.collection('shared_passwords').doc(shareId).get();

      if (!shareDoc.exists) {
        res.status(404).json({ error: 'Shared password not found' });
        return;
      }

      const shareData = shareDoc.data();

      if (shareData.toUserId !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      if (shareData.status !== 'pending') {
        res.status(409).json({ error: 'This share has already been processed' });
        return;
      }

      const newEntryData = {
        title: shareData.passwordData.title,
        username: shareData.passwordData.username,
        password: shareData.passwordData.password,
        url: shareData.passwordData.url,
        notes: shareData.passwordData.notes,
        userId: userId,
        sharedFrom: shareData.fromUserId,
        sharedFromName: shareData.fromUserName,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const newEntryRef = await db.collection('password_entries').add(newEntryData);

      await db.collection('shared_passwords').doc(shareId).update({
        status: 'accepted',
        respondedAt: serverTimestamp(),
        newEntryId: newEntryRef.id
      });

      await createAuditLog(userId, 'ACCEPT_SHARED_PASSWORD', {
        shareId: shareId,
        newEntryId: newEntryRef.id,
        fromUserId: shareData.fromUserId
      });

      res.json({ success: true, entryId: newEntryRef.id, message: 'Password accepted' });

    } catch (error) {
      console.error('Error accepting shared password:', error);
      res.status(500).json({ error: 'Failed to accept shared password' });
    }
  });
});

// Callable function to reject a shared password
exports.rejectSharedPassword = functions.https.onCall(
  { cors: true },
  async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
    }

    const userId = context.auth.uid;
    const { shareId } = data;

    if (!await checkRateLimitPersistent(userId, 'rejectShare', 20)) {
      throw new functions.https.HttpsError('resource-exhausted', 'Rate limit exceeded. Please try again later.');
    }

    if (!shareId) {
      throw new functions.https.HttpsError('invalid-argument', 'Share ID is required');
    }

    try {
      const shareDoc = await db.collection('shared_passwords').doc(shareId).get();

      if (!shareDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Shared password not found');
      }

      const shareData = shareDoc.data();

      if (shareData.toUserId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Access denied');
      }

      if (shareData.status !== 'pending') {
        throw new functions.https.HttpsError('failed-precondition', 'This share has already been processed');
      }

      // Update the share as rejected
      await db.collection('shared_passwords').doc(shareId).update({
        status: 'rejected',
        respondedAt: serverTimestamp()
      });

      // Create audit log
      await createAuditLog(userId, 'REJECT_SHARED_PASSWORD', {
        shareId: shareId,
        fromUserId: shareData.fromUserId,
        ip: context.rawRequest?.ip
      });

      return {
        success: true,
        message: 'Shared password rejected'
      };

    } catch (error) {
      console.error('Error rejecting shared password:', error);

      if (error instanceof functions.https.HttpsError) {
        throw error;
      }

      throw new functions.https.HttpsError('internal', 'Failed to reject shared password');
    }
  }
);

// HTTP function to reject shared password
exports.rejectSharedPasswordHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { shareId } = req.body;

      if (!await checkRateLimitPersistent(userId, 'rejectShare', 20)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      if (!shareId) {
        res.status(400).json({ error: 'Share ID is required' });
        return;
      }

      const shareDoc = await db.collection('shared_passwords').doc(shareId).get();

      if (!shareDoc.exists) {
        res.status(404).json({ error: 'Shared password not found' });
        return;
      }

      const shareData = shareDoc.data();

      if (shareData.toUserId !== userId) {
        res.status(403).json({ error: 'Access denied' });
        return;
      }

      if (shareData.status !== 'pending') {
        res.status(409).json({ error: 'This share has already been processed' });
        return;
      }

      await db.collection('shared_passwords').doc(shareId).update({
        status: 'rejected',
        respondedAt: serverTimestamp()
      });

      await createAuditLog(userId, 'REJECT_SHARED_PASSWORD', {
        shareId: shareId,
        fromUserId: shareData.fromUserId
      });

      res.json({ success: true, message: 'Shared password rejected' });

    } catch (error) {
      console.error('Error rejecting shared password:', error);
      res.status(500).json({ error: 'Failed to reject shared password' });
    }
  });
});

// Block user (so they cannot share with you)
exports.blockUserHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { blockedUserId, shareId } = req.body;

      if (!await checkRateLimitPersistent(userId, 'blockUser', 10)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      if (!blockedUserId) {
        res.status(400).json({ error: 'Blocked user ID is required' });
        return;
      }

      if (userId === blockedUserId) {
        res.status(400).json({ error: 'Cannot block yourself' });
        return;
      }

      // Check if already blocked
      const existingBlock = await db.collection('blocked_users')
        .where('blockerUserId', '==', userId)
        .where('blockedUserId', '==', blockedUserId)
        .limit(1)
        .get();

      if (!existingBlock.empty) {
        res.json({ success: true, message: 'User already blocked' });
        return;
      }

      await db.collection('blocked_users').add({
        blockerUserId: userId,
        blockedUserId: blockedUserId,
        createdAt: serverTimestamp()
      });

      // If a shareId was provided, also reject that share
      if (shareId) {
        const shareDoc = await db.collection('shared_passwords').doc(shareId).get();
        if (shareDoc.exists && shareDoc.data().toUserId === userId && shareDoc.data().status === 'pending') {
          await db.collection('shared_passwords').doc(shareId).update({
            status: 'rejected',
            respondedAt: serverTimestamp()
          });
        }
      }

      await createAuditLog(userId, 'BLOCK_USER', {
        blockedUserId: blockedUserId,
        shareId: shareId || null
      });

      res.json({ success: true, message: 'User blocked successfully' });

    } catch (error) {
      console.error('Error blocking user:', error);
      res.status(500).json({ error: 'Failed to block user' });
    }
  });
});

// ============================================
// USER ADMINISTRATION FUNCTIONS
// ============================================

// List of administrator emails (loaded from environment variable)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);

// Helper to check if an email is admin
function isAdminEmail(email) {
  return ADMIN_EMAILS.includes(email?.toLowerCase());
}

// Helper to check if a user is admin based on their document
async function isUserAdmin(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) return false;
    return userDoc.data().role === 'admin';
  } catch (error) {
    console.error('Error checking admin status:', error);
    return false;
  }
}

// HTTP function to migrate existing users with role field
exports.migrateUserRolesHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const callerEmail = decodedToken.email;

      // Only admin can run migration
      if (!isAdminEmail(callerEmail)) {
        res.status(403).json({ error: 'Only administrators can run this migration' });
        return;
      }

      console.log(`Starting user roles migration by admin: ${callerEmail}`);

      const usersSnapshot = await db.collection('users').get();
      const batch = db.batch();
      let migratedCount = 0;
      let adminCount = 0;

      usersSnapshot.forEach(doc => {
        const userData = doc.data();
        const userEmail = userData.email?.toLowerCase();
        const newRole = isAdminEmail(userEmail) ? 'admin' : 'user';

        if (newRole === 'admin') adminCount++;

        batch.update(doc.ref, {
          role: newRole,
          roleUpdatedAt: serverTimestamp()
        });
        migratedCount++;
      });

      await batch.commit();

      // Create audit log
      await createAuditLog('SYSTEM', 'MIGRATE_USER_ROLES', {
        adminUser: callerEmail,
        migratedCount,
        adminCount,
        timestamp: new Date().toISOString()
      });

      console.log(`User roles migration completed. Migrated ${migratedCount} users, ${adminCount} admins`);

      res.json({
        success: true,
        message: `Migrated ${migratedCount} users (${adminCount} admins)`,
        migratedCount,
        adminCount
      });

    } catch (error) {
      console.error('Error migrating user roles:', error);
      res.status(500).json({ error: 'Failed to migrate user roles', details: error.message });
    }
  });
});

// HTTP function to get the current user's role
exports.getUserRoleHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;
      const userEmail = decodedToken.email;

      // Get user document
      const userDoc = await db.collection('users').doc(userId).get();

      let role = 'user';
      if (userDoc.exists && userDoc.data().role) {
        role = userDoc.data().role;
      } else if (isAdminEmail(userEmail)) {
        // If they have no role but are admin by email, assign it
        role = 'admin';
        await db.collection('users').doc(userId).update({
          role: 'admin',
          roleUpdatedAt: serverTimestamp()
        });
      }

      res.json({
        success: true,
        role,
        isAdmin: role === 'admin',
        email: userEmail
      });

    } catch (error) {
      console.error('Error getting user role:', error);
      res.status(500).json({ error: 'Failed to get user role' });
    }
  });
});

// HTTP function to get all users (admin only)
exports.adminGetUsersHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      // Verify admin
      const isAdmin = await isUserAdmin(userId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      if (!await checkRateLimitPersistent(userId, 'adminGetUsers', 60, 60000)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      // Rate limiting
      if (!await checkRateLimitPersistent(userId, 'adminGetUsers', 30)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      // Get all users
      const usersSnapshot = await db.collection('users').get();
      const users = [];

      // Get password count per user
      const passwordsSnapshot = await db.collection('password_entries').get();
      const passwordCountByUser = {};
      passwordsSnapshot.forEach(doc => {
        const data = doc.data();
        passwordCountByUser[data.userId] = (passwordCountByUser[data.userId] || 0) + 1;
      });

      // Get lock state from user_settings
      const settingsSnapshot = await db.collection('user_settings').get();
      const lockStateByUser = {};
      settingsSnapshot.forEach(doc => {
        const data = doc.data();
        lockStateByUser[doc.id] = {
          accountLocked: data.accountLocked === true,
          accountUnlocked: data.accountUnlocked === true,
          accountLockedAt: data.accountLockedAt || null,
          accountUnlockedAt: data.accountUnlockedAt || null
        };
      });

      for (const doc of usersSnapshot.docs) {
        const userData = doc.data();
        const lockState = lockStateByUser[doc.id] || {};
        users.push({
          uid: doc.id,
          email: userData.email || '',
          displayName: userData.displayName || '',
          photoURL: userData.photoURL || '',
          role: userData.role || 'user',
          createdAt: userData.createdAt,
          updatedAt: userData.updatedAt,
          lastLoginAt: userData.lastLoginAt || null,
          passwordCount: passwordCountByUser[doc.id] || 0,
          isDisabled: userData.isDisabled || false,
          accountLocked: lockState.accountLocked || false,
          accountUnlocked: lockState.accountUnlocked || false,
          accountLockedAt: lockState.accountLockedAt || null,
          accountUnlockedAt: lockState.accountUnlockedAt || null
        });
      }

      // Sort by email
      users.sort((a, b) => (a.email || '').localeCompare(b.email || ''));

      res.json({
        success: true,
        users,
        totalUsers: users.length
      });

    } catch (error) {
      console.error('Error getting users for admin:', error);
      res.status(500).json({ error: 'Failed to get users' });
    }
  });
});

// HTTP function to update a user (admin only)
exports.adminUpdateUserHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const adminUserId = decodedToken.uid;
      const adminEmail = decodedToken.email;

      // Verify admin
      const isAdmin = await isUserAdmin(adminUserId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      if (!await checkRateLimitPersistent(adminUserId, 'adminUpdateUser', 30, 60000)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      const { targetUserId, updates } = req.body;

      if (!targetUserId) {
        res.status(400).json({ error: 'Target user ID is required' });
        return;
      }

      // Verify that the target user exists
      const targetUserDoc = await db.collection('users').doc(targetUserId).get();
      if (!targetUserDoc.exists) {
        res.status(404).json({ error: 'User not found' });
        return;
      }

      const targetUserData = targetUserDoc.data();

      // Do not allow changing the role of the primary admin
      if (isAdminEmail(targetUserData.email) && updates.role && updates.role !== 'admin') {
        res.status(403).json({ error: 'Cannot change role of primary admin' });
        return;
      }

      // Allowed fields to update in users collection
      const allowedUpdates = {};
      if (updates.role !== undefined && ['admin', 'user', 'founder', 'premium', 'trial', 'suspended'].includes(updates.role)) {
        allowedUpdates.role = updates.role;
      }
      if (updates.isDisabled !== undefined) {
        allowedUpdates.isDisabled = !!updates.isDisabled;
      }
      if (updates.notes !== undefined) {
        allowedUpdates.adminNotes = sanitizeInput(updates.notes);
      }

      // Lock state changes live in user_settings
      const lockSettingsUpdate = {};
      if (updates.accountLocked === false) {
        lockSettingsUpdate.accountLocked = false;
        lockSettingsUpdate.accountUnlocked = true;
        lockSettingsUpdate.accountUnlockedAt = serverTimestamp();
        lockSettingsUpdate.accountUnlockedBy = adminUserId;
      } else if (updates.accountLocked === true) {
        lockSettingsUpdate.accountLocked = true;
        lockSettingsUpdate.accountUnlocked = false;
        lockSettingsUpdate.accountLockedAt = serverTimestamp();
        lockSettingsUpdate.accountLockedBy = adminUserId;
      }

      const hasUserUpdates = Object.keys(allowedUpdates).length > 0;
      const hasLockUpdates = Object.keys(lockSettingsUpdate).length > 0;

      if (!hasUserUpdates && !hasLockUpdates) {
        res.status(400).json({ error: 'No valid updates provided' });
        return;
      }

      if (hasUserUpdates) {
        allowedUpdates.updatedAt = serverTimestamp();
        allowedUpdates.updatedBy = adminUserId;
        await db.collection('users').doc(targetUserId).update(allowedUpdates);
      }

      if (hasLockUpdates) {
        await db.collection('user_settings').doc(targetUserId).set(lockSettingsUpdate, { merge: true });
      }

      // Create audit log
      await createAuditLog(adminUserId, 'ADMIN_UPDATE_USER', {
        targetUserId,
        targetEmail: targetUserData.email,
        updates: { ...allowedUpdates, ...lockSettingsUpdate },
        adminEmail,
        ip: req.ip
      });

      console.log(`Admin ${adminEmail} updated user ${targetUserData.email}:`, { ...allowedUpdates, ...lockSettingsUpdate });

      res.json({
        success: true,
        message: 'User updated successfully',
        updates: { ...allowedUpdates, ...lockSettingsUpdate }
      });

    } catch (error) {
      console.error('Error updating user:', error);
      res.status(500).json({ error: 'Failed to update user' });
    }
  });
});

// HTTP function to get system statistics (admin only)
exports.adminGetStatsHttp = functions.https.onRequest({ secrets: [] }, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      // Verify admin
      const isAdmin = await isUserAdmin(userId);
      if (!isAdmin) {
        res.status(403).json({ error: 'Admin access required' });
        return;
      }

      if (!await checkRateLimitPersistent(userId, 'adminGetStats', 40, 60000)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      // Rate limiting
      if (!await checkRateLimitPersistent(userId, 'adminGetStats', 20)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      // Get statistics
      const [usersSnapshot, passwordsSnapshot, sharedSnapshot, auditSnapshot] = await Promise.all([
        db.collection('users').get(),
        db.collection('password_entries').get(),
        db.collection('shared_passwords').get(),
        db.collection('audit_logs').orderBy('timestamp', 'desc').limit(100).get()
      ]);

      // Count users by role
      const roleCount = { admin: 0, user: 0, premium: 0, trial: 0, suspended: 0 };
      let disabledCount = 0;
      usersSnapshot.forEach(doc => {
        const data = doc.data();
        const role = data.role || 'user';
        roleCount[role] = (roleCount[role] || 0) + 1;
        if (data.isDisabled) disabledCount++;
      });

      // Count shares by status
      const shareCount = { pending: 0, accepted: 0, rejected: 0 };
      sharedSnapshot.forEach(doc => {
        const status = doc.data().status || 'pending';
        shareCount[status] = (shareCount[status] || 0) + 1;
      });

      // Recent activity (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      let recentActivityCount = 0;
      auditSnapshot.forEach(doc => {
        const timestamp = doc.data().timestamp?.toDate?.();
        if (timestamp && timestamp > sevenDaysAgo) {
          recentActivityCount++;
        }
      });

      res.json({
        success: true,
        stats: {
          users: {
            total: usersSnapshot.size,
            byRole: roleCount,
            disabled: disabledCount
          },
          passwords: {
            total: passwordsSnapshot.size
          },
          shares: {
            total: sharedSnapshot.size,
            byStatus: shareCount
          },
          activity: {
            recentActions: recentActivityCount,
            period: '7 days'
          }
        }
      });

    } catch (error) {
      console.error('Error getting admin stats:', error);
      res.status(500).json({ error: 'Failed to get stats' });
    }
  });
});
// ============================================
// POLAR - Subscription Management
// ============================================

// Create checkout URL for subscription
exports.createCheckoutUrl = functions.https.onRequest({
  secrets: [polarAccessToken, polarProductId]
}, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;
      const userEmail = decodedToken.email;

      // Check if user already has lifetime hosted access (includes legacy
      // 'premium' subscribers, founders, admins, and new one-time buyers).
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data() || {};
      if (['lifetime_hosted', 'premium', 'founder', 'admin'].includes(userData.role)) {
        res.status(400).json({ error: 'User already has lifetime hosted access' });
        return;
      }

      // Initialize Polar SDK (auto-detects sandbox vs production)
      const polar = new Polar(getPolarConfig(polarAccessToken));

      // Create checkout (successUrl changes based on environment)
      const successUrl = isEmulator()
        ? 'http://localhost:9000/#/settings?subscription=success'
        : 'https://app.lemonadepass.app/#/settings?subscription=success';

      const checkout = await polar.checkouts.create({
        products: [getPolarProductId(polarProductId)],
        customerEmail: userEmail,
        successUrl,
        metadata: {
          user_id: userId
        }
      });

      if (!checkout || !checkout.url) {
        console.error('No checkout URL returned:', checkout);
        res.status(500).json({ error: 'No checkout URL returned' });
        return;
      }

      res.json({ success: true, checkoutUrl: checkout.url });

    } catch (error) {
      console.error('Error creating checkout:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Get customer portal URL for subscription management
exports.getCustomerPortalUrl = functions.https.onRequest({
  secrets: [polarAccessToken]
}, (req, res) => {
  corsHandler(req, res, async () => {
    if (req.method === 'OPTIONS') {
      res.status(204).send('');
      return;
    }

    if (req.method !== 'POST') {
      res.status(405).send('Method Not Allowed');
      return;
    }

    try {
      // Verify authentication
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      // Get user's subscription info
      const userDoc = await db.collection('users').doc(userId).get();
      const userData = userDoc.data() || {};

      if (!userData.subscription || !userData.subscription.customerId) {
        res.status(404).json({ error: 'No active subscription found' });
        return;
      }

      // Initialize Polar SDK (auto-detects sandbox vs production)
      const polar = new Polar(getPolarConfig(polarAccessToken));

      // Get customer portal session
      const session = await polar.customerSessions.create({
        customerId: userData.subscription.customerId
      });

      if (!session || !session.customerPortalUrl) {
        console.error('No customer portal URL returned:', session);
        res.status(404).json({ error: 'Customer portal not available' });
        return;
      }

      res.json({ success: true, customerPortalUrl: session.customerPortalUrl });

    } catch (error) {
      console.error('Error getting customer portal URL:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  });
});

// Handle Polar webhooks
exports.handlePolarWebhook = functions.https.onRequest({
  secrets: [polarWebhookSecret]
}, async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  try {
    // Use rawBody for signature verification
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body));

    // Validate webhook using Polar SDK
    let event;
    if (isEmulator()) {
      // Skip signature validation in emulators for testing
      console.log('⚠️ EMULATOR: Skipping webhook signature validation');
      event = JSON.parse(rawBody.toString());
    } else {
      try {
        event = validateEvent(
          rawBody,
          req.headers,
          getPolarWebhookSecret(polarWebhookSecret)
        );
      } catch (error) {
        if (error instanceof WebhookVerificationError) {
          console.error('Invalid webhook signature');
          res.status(403).send('Invalid signature');
          return;
        }
        throw error;
      }
    }

    const eventType = event.type;
    const data = event.data;

    // Get user_id from metadata
    const userId = data.metadata?.user_id;

    console.log('Polar webhook received:', eventType, 'for user:', userId);

    // Handle different events
    switch (eventType) {
      case 'subscription.created':
      case 'subscription.updated':
      case 'subscription.active': {
        if (!userId) {
          console.log('No user_id in metadata, checking by customer email');
          // Try to find user by email if no user_id
          if (data.customer?.email) {
            const usersSnapshot = await db.collection('users')
              .where('email', '==', data.customer.email)
              .limit(1)
              .get();
            if (!usersSnapshot.empty) {
              const userDoc = usersSnapshot.docs[0];
              await userDoc.ref.update({
                role: 'premium',
                subscription: {
                  id: data.id,
                  status: data.status,
                  provider: 'polar',
                  customerId: data.customer?.id,
                  productId: data.productId,
                  currentPeriodEnd: data.currentPeriodEnd,
                  updatedAt: serverTimestamp()
                }
              });
              console.log(`User ${userDoc.id} upgraded to premium (by email)`);
            }
          }
          break;
        }

        await db.collection('users').doc(userId).update({
          role: 'premium',
          subscription: {
            id: data.id,
            status: data.status,
            provider: 'polar',
            customerId: data.customer?.id,
            productId: data.productId,
            currentPeriodEnd: data.currentPeriodEnd,
            updatedAt: serverTimestamp()
          }
        });
        console.log(`User ${userId} upgraded to premium`);
        break;
      }

      case 'subscription.canceled': {
        // User canceled but paid period is still active - keep premium until it expires
        if (!userId) {
          console.error('No user_id for cancellation event');
          break;
        }

        await db.collection('users').doc(userId).update({
          role: 'premium',
          subscription: {
            id: data.id,
            status: 'canceled',
            provider: 'polar',
            customerId: data.customer?.id,
            currentPeriodEnd: data.currentPeriodEnd ? new Date(data.currentPeriodEnd) : null,
            cancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }
        });
        console.log(`User ${userId} subscription canceled - premium until ${data.currentPeriodEnd}`);
        break;
      }

      case 'subscription.revoked': {
        // Immediately revoked (refund, fraud, etc.) - downgrade now
        if (!userId) {
          console.error('No user_id for revocation event');
          break;
        }

        await db.collection('users').doc(userId).update({
          role: 'user',
          subscription: {
            id: data.id,
            status: 'revoked',
            provider: 'polar',
            cancelledAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }
        });
        console.log(`User ${userId} subscription revoked - downgraded immediately`);
        break;
      }

      case 'checkout.created':
      case 'checkout.updated': {
        console.log(`Checkout ${eventType} for product ${data.productId}`);
        break;
      }

      // One-time payment events (new lifetime hosted SKU).
      case 'order.created':
        // Order placed but not necessarily paid yet — log only.
        console.log(`Order created ${data.id} for user ${userId}`);
        break;

      case 'order.paid':
      case 'order.updated': {
        // Polar emits order.paid (or sometimes order.updated with status="paid")
        // for one-time SKUs. Set the lifetime_hosted role.
        if (eventType === 'order.updated' && data.status !== 'paid') {
          console.log(`Order ${data.id} updated to status ${data.status} — no action`);
          break;
        }

        const targetUserId = userId || null;
        const targetEmail = data.customer?.email || null;

        const orderRecord = {
          id: data.id,
          status: data.status || 'paid',
          provider: 'polar',
          type: 'one_time',
          customerId: data.customer?.id || null,
          productId: data.productId || data.product?.id || null,
          amount: data.amount || data.totalAmount || null,
          currency: data.currency || null,
          paidAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        if (targetUserId) {
          await db.collection('users').doc(targetUserId).set({
            role: 'lifetime_hosted',
            subscription: orderRecord
          }, { merge: true });
          console.log(`User ${targetUserId} upgraded to lifetime_hosted (order ${data.id})`);
        } else if (targetEmail) {
          const usersSnapshot = await db.collection('users')
            .where('email', '==', targetEmail)
            .limit(1)
            .get();
          if (!usersSnapshot.empty) {
            const userDoc = usersSnapshot.docs[0];
            await userDoc.ref.set({
              role: 'lifetime_hosted',
              subscription: orderRecord
            }, { merge: true });
            console.log(`User ${userDoc.id} upgraded to lifetime_hosted by email (order ${data.id})`);
          } else {
            console.warn(`order.paid received for unknown user (email ${targetEmail}, order ${data.id})`);
          }
        } else {
          console.error(`order.paid received with no user_id or customer email (order ${data.id})`);
        }
        break;
      }

      case 'order.refunded': {
        // Refund — downgrade user back to 'user'.
        if (!userId) {
          console.error('No user_id for order.refunded');
          break;
        }
        await db.collection('users').doc(userId).set({
          role: 'user',
          subscription: {
            id: data.id,
            status: 'refunded',
            provider: 'polar',
            refundedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          }
        }, { merge: true });
        console.log(`User ${userId} downgraded — order ${data.id} refunded`);
        break;
      }

      default:
        console.log('Unhandled event:', eventType);
    }

    res.status(200).send('OK');

  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Internal error');
  }
});

// =============================================================================
// SCHEDULED: Expire canceled subscriptions
// =============================================================================

/**
 * Runs daily at midnight UTC. Finds users with canceled subscriptions
 * whose paid period has expired, and downgrades them to 'user'.
 */
exports.expireCanceledSubscriptions = onSchedule('every 24 hours', async () => {
  const now = new Date();
  const snapshot = await db.collection('users')
    .where('subscription.status', '==', 'canceled')
    .where('role', '==', 'premium')
    .get();

  let expired = 0;
  for (const userDoc of snapshot.docs) {
    const sub = userDoc.data().subscription;
    const periodEnd = sub?.currentPeriodEnd?.toDate?.() || (sub?.currentPeriodEnd ? new Date(sub.currentPeriodEnd) : null);

    if (periodEnd && periodEnd <= now) {
      await userDoc.ref.update({
        role: 'user',
        'subscription.status': 'expired',
        'subscription.updatedAt': serverTimestamp()
      });
      expired++;
      console.log(`User ${userDoc.id} premium expired - downgraded to user`);
    }
  }

  console.log(`Subscription cleanup: ${expired} expired out of ${snapshot.size} canceled`);
});

// =============================================================================
// TICKET SYSTEM - Support tickets for users
// =============================================================================

/**
 * Create a new support ticket
 * Requires authentication
 */
exports.createTicketHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const { subject, message } = req.body;

    if (!subject || !message) {
      res.status(400).json({ error: 'Subject y message son requeridos' });
      return;
    }

    if (subject.length > 200) {
      res.status(400).json({ error: 'Subject muy largo (max 200 caracteres)' });
      return;
    }

    if (message.length > 2000) {
      res.status(400).json({ error: 'Mensaje muy largo (max 2000 caracteres)' });
      return;
    }

    // Rate limiting: max 10 tickets per day per user
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const recentTickets = await db.collection('tickets')
      .where('userId', '==', userId)
      .where('createdAt', '>=', timestampFromDate(today))
      .get();

    if (recentTickets.size >= 10) {
      res.status(429).json({ error: 'Daily limit reached (10 tickets/day)' });
      return;
    }

    // Get user info
    const userRecord = await admin.auth().getUser(userId);
    const userName = userRecord.displayName || userRecord.email?.split('@')[0] || 'User';

    const now = serverTimestamp();
    const messageId = 'msg-' + Date.now();
    const ticketData = {
      userId,
      userEmail: userRecord.email || '',
      userName: userName,
      subject: sanitizeInput(subject),
      status: 'open',
      createdAt: now,
      updatedAt: now,
      closedAt: null,
      messages: [{
        id: messageId,
        content: sanitizeInput(message),
        senderId: userId,
        senderName: userName,
        isAdmin: false,
        createdAt: new Date().toISOString()
      }]
    };

    const docRef = await db.collection('tickets').add(ticketData);

    res.status(200).json({
      success: true,
      ticket: {
        id: docRef.id,
        ...ticketData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    });

    } catch (error) {
      console.error('Error creating ticket:', error);
      res.status(500).json({ error: 'Error creating ticket' });
    }
  });
});

/**
 * Get current user's tickets
 * Requires authentication
 */
exports.getMyTicketsHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    let ticketsSnap;
    try {
      // Try with orderBy (requires composite index)
      ticketsSnap = await db.collection('tickets')
        .where('userId', '==', userId)
        .orderBy('updatedAt', 'desc')
        .limit(50)
        .get();
    } catch (indexError) {
      // Fallback without orderBy if index doesn't exist yet
      console.warn('Index not ready, fetching without order:', indexError.message);
      ticketsSnap = await db.collection('tickets')
        .where('userId', '==', userId)
        .limit(50)
        .get();
    }

    const tickets = ticketsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    // Sort in memory if we fell back to unordered query
    tickets.sort((a, b) => {
      const dateA = a.updatedAt ? new Date(a.updatedAt) : new Date(0);
      const dateB = b.updatedAt ? new Date(b.updatedAt) : new Date(0);
      return dateB - dateA;
    });

    res.status(200).json({ tickets });

    } catch (error) {
      console.error('Error fetching tickets:', error);
      res.status(500).json({ error: 'Error obteniendo tickets' });
    }
  });
});

/**
 * Add message to a ticket
 * User can only message their own tickets, admin can message any
 */
exports.addTicketMessageHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const { ticketId, content } = req.body;

    if (!ticketId || !content) {
      res.status(400).json({ error: 'ticketId y content son requeridos' });
      return;
    }

    if (content.length > 2000) {
      res.status(400).json({ error: 'Mensaje muy largo (max 2000 caracteres)' });
      return;
    }

    // Get ticket
    const ticketRef = db.collection('tickets').doc(ticketId);
    const ticketSnap = await ticketRef.get();

    if (!ticketSnap.exists) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    const ticket = ticketSnap.data();

    // Check if admin
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const isAdmin = ['admin', 'founder'].includes(userData.role);

    // User can only message their own tickets
    if (ticket.userId !== userId && !isAdmin) {
      res.status(403).json({ error: 'No autorizado para este ticket' });
      return;
    }

    // Check if ticket is closed
    if (ticket.status === 'closed') {
      res.status(400).json({ error: 'Cannot reply to a closed ticket' });
      return;
    }

    // Get sender info
    const userRecord = await admin.auth().getUser(userId);
    const senderName = isAdmin ? 'Support' : (userRecord.displayName || userRecord.email?.split('@')[0] || 'User');
    const messageId = 'msg-' + Date.now();

    const newMessage = {
      id: messageId,
      content: sanitizeInput(content),
      senderId: userId,
      senderName: senderName,
      isAdmin,
      createdAt: new Date().toISOString()
    };

    await ticketRef.update({
      messages: arrayUnion(newMessage),
      updatedAt: serverTimestamp()
    });

    // Get updated ticket
    const updatedSnap = await ticketRef.get();

    res.status(200).json({
      success: true,
      ticket: {
        id: ticketId,
        ...updatedSnap.data()
      }
    });

    } catch (error) {
      console.error('Error adding message:', error);
      res.status(500).json({ error: 'Error sending message' });
    }
  });
});

/**
 * Close a ticket
 * User can close their own tickets, admin can close any
 */
exports.closeTicketHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    const { ticketId } = req.body;

    if (!ticketId) {
      res.status(400).json({ error: 'ticketId es requerido' });
      return;
    }

    // Get ticket
    const ticketRef = db.collection('tickets').doc(ticketId);
    const ticketSnap = await ticketRef.get();

    if (!ticketSnap.exists) {
      res.status(404).json({ error: 'Ticket no encontrado' });
      return;
    }

    const ticket = ticketSnap.data();

    // Check if admin
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const isAdmin = ['admin', 'founder'].includes(userData.role);

    // User can only close their own tickets
    if (ticket.userId !== userId && !isAdmin) {
      res.status(403).json({ error: 'No autorizado para este ticket' });
      return;
    }

    await ticketRef.update({
      status: 'closed',
      closedAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });

    // Get updated ticket
    const updatedSnap = await ticketRef.get();

    res.status(200).json({
      success: true,
      ticket: {
        id: ticketId,
        ...updatedSnap.data()
      }
    });

    } catch (error) {
      console.error('Error closing ticket:', error);
      res.status(500).json({ error: 'Error closing ticket' });
    }
  });
});

/**
 * [ADMIN] Get all tickets
 * Only for admin users
 */
exports.adminGetTicketsHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    // Check if admin
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const isAdmin = ['admin', 'founder'].includes(userData.role);

    if (!isAdmin) {
      res.status(403).json({ error: 'Acceso denegado' });
      return;
    }

    const ticketsSnap = await db.collection('tickets')
      .orderBy('updatedAt', 'desc')
      .limit(200)
      .get();

    const tickets = ticketsSnap.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));

    res.status(200).json({ tickets });

    } catch (error) {
      console.error('Error fetching all tickets:', error);
      res.status(500).json({ error: 'Error obteniendo tickets' });
    }
  });
});

/**
 * [ADMIN] Get count of open tickets
 * Only for admin users - used for badge notification
 */
exports.getOpenTicketsCountHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'No autorizado' });
      return;
    }

    const token = authHeader.split('Bearer ')[1];
    const decodedToken = await admin.auth().verifyIdToken(token);
    const userId = decodedToken.uid;

    // Check if admin
    const userDoc = await db.collection('users').doc(userId).get();
    const userData = userDoc.data() || {};
    const isAdmin = ['admin', 'founder'].includes(userData.role);

    if (!isAdmin) {
      res.status(403).json({ error: 'Acceso denegado' });
      return;
    }

    const openTicketsSnap = await db.collection('tickets')
      .where('status', '==', 'open')
      .count()
      .get();

      res.status(200).json({ count: openTicketsSnap.data().count });

    } catch (error) {
      console.error('Error counting tickets:', error);
      res.status(500).json({ error: 'Error contando tickets' });
    }
  });
});

// ====== WEBAUTHN / PASSKEYS ======

// Helper: resolve rpID and origin from request
const resolveWebAuthnConfig = (origin) => {
  if (!origin || !ALLOWED_ORIGINS.includes(origin)) {
    return null;
  }
  const url = new URL(origin);
  return {
    rpID: url.hostname,
    rpName: 'Lemonade Password Manager',
    origin: origin
  };
};

// 1) Generate registration options (requires auth)
exports.webauthnGetRegistrationOptionsHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const config = resolveWebAuthnConfig(req.headers.origin);
      if (!config) {
        res.status(400).json({ error: 'Invalid origin' });
        return;
      }

      // Get existing passkeys for excludeCredentials
      const existingCreds = await db.collection('webauthn_credentials')
        .where('userId', '==', userId)
        .get();

      const excludeCredentials = existingCreds.docs.map(doc => ({
        id: doc.data().credentialId,
        transports: doc.data().transports || []
      }));

      const userRecord = await admin.auth().getUser(userId);

      const options = await generateRegistrationOptions({
        rpName: config.rpName,
        rpID: config.rpID,
        userID: Buffer.from(userId),
        userName: userRecord.email || userId,
        userDisplayName: userRecord.displayName || userRecord.email || userId,
        attestationType: 'none',
        excludeCredentials,
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'required',
          userVerification: 'required'
        }
      });

      // Store challenge for verification (TTL 5 min)
      await db.collection('webauthn_challenges').add({
        challenge: options.challenge,
        userId: userId,
        type: 'registration',
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
      });

      res.status(200).json(options);
    } catch (error) {
      console.error('Error generating registration options:', error);
      res.status(500).json({ error: 'Error generating registration options' });
    }
  });
});

// 2) Verify registration response (requires auth)
exports.webauthnVerifyRegistrationHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const config = resolveWebAuthnConfig(req.headers.origin);
      if (!config) {
        res.status(400).json({ error: 'Invalid origin' });
        return;
      }

      // Find the challenge
      const challengeSnap = await db.collection('webauthn_challenges')
        .where('userId', '==', userId)
        .where('type', '==', 'registration')
        .orderBy('createdAt', 'desc')
        .limit(1)
        .get();

      if (challengeSnap.empty) {
        res.status(400).json({ error: 'No challenge found. Please try again.' });
        return;
      }

      const challengeDoc = challengeSnap.docs[0];
      const challengeData = challengeDoc.data();

      // Check expiry
      if (challengeData.expiresAt.toDate() < new Date()) {
        await challengeDoc.ref.delete();
        res.status(400).json({ error: 'Challenge expired. Please try again.' });
        return;
      }

      const { body, deviceName } = req.body;

      const verification = await verifyRegistrationResponse({
        response: body,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID
      });

      if (!verification.verified || !verification.registrationInfo) {
        res.status(400).json({ error: 'Verification failed' });
        return;
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

      // Store the credential
      await db.collection('webauthn_credentials').add({
        credentialId: credential.id,
        userId: userId,
        publicKey: Buffer.from(credential.publicKey).toString('base64'),
        counter: credential.counter,
        transports: credential.transports || [],
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        deviceName: deviceName || 'Unknown device',
        createdAt: serverTimestamp(),
        lastUsedAt: serverTimestamp()
      });

      // Delete used challenge
      await challengeDoc.ref.delete();

      res.status(200).json({ verified: true });
    } catch (error) {
      console.error('Error verifying registration:', error);
      res.status(500).json({ error: 'Error verifying registration' });
    }
  });
});

// 3) Generate authentication options (NO auth required - user is locked out)
exports.webauthnGetAuthenticationOptionsHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { userId } = req.body;
      if (!userId) {
        res.status(400).json({ error: 'userId is required' });
        return;
      }

      if (!await checkRateLimitPersistent(req.ip || req.headers['x-forwarded-for'] || 'unknown', 'webauthnOptions', 20, 60000)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      const config = resolveWebAuthnConfig(req.headers.origin);
      if (!config) {
        res.status(400).json({ error: 'Invalid origin' });
        return;
      }

      // Use discoverable credential flow — never send allowCredentials to avoid
      // leaking whether a userId has any registered passkeys.
      const options = await generateAuthenticationOptions({
        rpID: config.rpID,
        userVerification: 'required'
      });

      // Store challenge
      await db.collection('webauthn_challenges').add({
        challenge: options.challenge,
        userId: userId,
        type: 'authentication',
        createdAt: serverTimestamp(),
        expiresAt: new Date(Date.now() + 5 * 60 * 1000)
      });

      res.status(200).json(options);
    } catch (error) {
      console.error('Error generating authentication options:', error);
      res.status(500).json({ error: 'Error generating authentication options' });
    }
  });
});

// 4) Verify authentication response (NO auth required - returns custom token)
exports.webauthnVerifyAuthenticationHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const { body, userId } = req.body;
      if (!body || !userId) {
        res.status(400).json({ error: 'body and userId are required' });
        return;
      }

      const rateSubject = `${req.ip || req.headers['x-forwarded-for'] || 'unknown'}:${userId}`;
      if (!await checkRateLimitPersistent(rateSubject, 'webauthnVerify', 10, 60000)) {
        res.status(429).json({ error: 'Rate limit exceeded' });
        return;
      }

      const config = resolveWebAuthnConfig(req.headers.origin);
      if (!config) {
        res.status(400).json({ error: 'Invalid origin' });
        return;
      }

      // Extract challenge from clientDataJSON to find the exact stored challenge
      let clientChallenge;
      try {
        const clientDataJSON = JSON.parse(
          Buffer.from(body.response.clientDataJSON, 'base64url').toString('utf8')
        );
        clientChallenge = clientDataJSON.challenge;
      } catch {
        res.status(400).json({ error: 'Invalid authentication response' });
        return;
      }

      // Find the specific challenge by value and credential in parallel
      const [challengeSnap, credSnap] = await Promise.all([
        db.collection('webauthn_challenges')
          .where('userId', '==', userId)
          .where('type', '==', 'authentication')
          .where('challenge', '==', clientChallenge)
          .limit(1)
          .get(),
        db.collection('webauthn_credentials')
          .where('credentialId', '==', body.id)
          .where('userId', '==', userId)
          .limit(1)
          .get()
      ]);

      if (challengeSnap.empty) {
        res.status(400).json({ error: 'No challenge found. Please try again.' });
        return;
      }

      const challengeDoc = challengeSnap.docs[0];
      const challengeData = challengeDoc.data();

      // Check expiry
      if (challengeData.expiresAt.toDate() < new Date()) {
        await challengeDoc.ref.delete();
        res.status(400).json({ error: 'Challenge expired. Please try again.' });
        return;
      }

      if (credSnap.empty) {
        res.status(400).json({ error: 'Credential not found' });
        return;
      }

      const credDoc = credSnap.docs[0];
      const credData = credDoc.data();

      const verification = await verifyAuthenticationResponse({
        response: body,
        expectedChallenge: challengeData.challenge,
        expectedOrigin: config.origin,
        expectedRPID: config.rpID,
        credential: {
          id: credData.credentialId,
          publicKey: new Uint8Array(Buffer.from(credData.publicKey, 'base64')),
          counter: credData.counter,
          transports: credData.transports || []
        }
      });

      if (!verification.verified) {
        res.status(400).json({ error: 'Authentication failed' });
        return;
      }

      // Batch: update counter + delete challenge in one round-trip
      const batch = db.batch();
      batch.update(credDoc.ref, {
        counter: verification.authenticationInfo.newCounter,
        lastUsedAt: serverTimestamp()
      });
      batch.delete(challengeDoc.ref);

      // Run batch write and token generation in parallel
      const [, customToken] = await Promise.all([
        batch.commit(),
        admin.auth().createCustomToken(userId)
      ]);

      res.status(200).json({ verified: true, token: customToken });
    } catch (error) {
      console.error('Error verifying authentication:', error);
      res.status(500).json({ error: 'Error verifying authentication' });
    }
  });
});

// 5) Get user's passkeys (requires auth)
exports.webauthnGetPasskeysHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const credsSnap = await db.collection('webauthn_credentials')
        .where('userId', '==', userId)
        .orderBy('createdAt', 'desc')
        .get();

      const passkeys = credsSnap.docs.map(doc => ({
        id: doc.id,
        credentialId: doc.data().credentialId,
        deviceName: doc.data().deviceName,
        createdAt: doc.data().createdAt,
        lastUsedAt: doc.data().lastUsedAt
      }));

      res.status(200).json({ passkeys });
    } catch (error) {
      console.error('Error fetching passkeys:', error);
      res.status(500).json({ error: 'Error fetching passkeys' });
    }
  });
});

// 6) Remove a passkey (requires auth)
exports.webauthnRemovePasskeyHttp = functions.https.onRequest(async (req, res) => {
  corsHandler(req, res, async () => {
    try {
      if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
      }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return;
      }

      const token = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(token);
      const userId = decodedToken.uid;

      const { passkeyDocId } = req.body;
      if (!passkeyDocId) {
        res.status(400).json({ error: 'passkeyDocId is required' });
        return;
      }

      // Verify the passkey belongs to the user
      const passkeyDoc = await db.collection('webauthn_credentials').doc(passkeyDocId).get();
      if (!passkeyDoc.exists || passkeyDoc.data().userId !== userId) {
        res.status(404).json({ error: 'Passkey not found' });
        return;
      }

      await passkeyDoc.ref.delete();

      // Check remaining passkeys
      const remaining = await db.collection('webauthn_credentials')
        .where('userId', '==', userId)
        .count()
        .get();

      res.status(200).json({ removed: true, remainingCount: remaining.data().count });
    } catch (error) {
      console.error('Error removing passkey:', error);
      res.status(500).json({ error: 'Error removing passkey' });
    }
  });
});

// ==================== PASSWORD HISTORY ====================

exports.getPasswordHistoryHttp = functions.https.onRequest(
  { secrets: [encryptionKey], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        let decoded;
        try {
          decoded = await admin.auth().verifyIdToken(token);
        } catch (error) {
          return res.status(401).json({ error: 'Invalid token' });
        }
        const userId = decoded.uid;

        const { entryId } = req.body;
        if (!entryId) {
          return res.status(400).json({ error: 'entryId required' });
        }

        // Rate limiting
        if (!checkRateLimit(userId, 'readHistory', 20) || !await checkRateLimitPersistent(userId, 'readHistory', 30, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        // Verify ownership
        const entryDoc = await db.collection('password_entries').doc(entryId).get();
        if (!entryDoc.exists) {
          return res.status(404).json({ error: 'Entry not found' });
        }
        if (entryDoc.data().userId !== userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        // Fetch history
        const historySnap = await db.collection('password_entries').doc(entryId)
          .collection('password_history')
          .orderBy('changedAt', 'desc')
          .limit(20)
          .get();

        const history = historySnap.docs.map(doc => {
          const data = doc.data();
          let decryptedPassword;
          try {
            decryptedPassword = decryptPassword(data.password, encryptionKey.value());
          } catch (e) {
            decryptedPassword = '[Unable to decrypt]';
          }
          return {
            id: doc.id,
            password: decryptedPassword,
            changedAt: data.changedAt?.toDate?.()?.toISOString() || null
          };
        });

        // Audit log
        await createAuditLog(userId, 'VIEW_PASSWORD_HISTORY', { entryId });

        return res.json({ success: true, history });
      } catch (error) {
        console.error('Error fetching password history:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// ==================== REUSED PASSWORD DETECTION ====================

exports.checkReusedPasswordsHttp = functions.https.onRequest(
  { secrets: [encryptionKey], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        // Verify authentication
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        let decoded;
        try {
          decoded = await admin.auth().verifyIdToken(token);
        } catch (error) {
          return res.status(401).json({ error: 'Invalid token' });
        }
        const userId = decoded.uid;

        // Rate limiting
        if (!checkRateLimit(userId, 'checkReused', 5) || !await checkRateLimitPersistent(userId, 'checkReused', 10, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        // Get all active entries for user
        const snapshot = await db.collection('password_entries')
          .where('userId', '==', userId)
          .where('status', '==', 'active')
          .get();

        const passwordMap = {}; // decrypted password -> [entry IDs]

        snapshot.docs.forEach(doc => {
          const data = doc.data();
          try {
            const decrypted = decryptPassword(data.password, encryptionKey.value());
            if (!passwordMap[decrypted]) passwordMap[decrypted] = [];
            passwordMap[decrypted].push(doc.id);
          } catch (e) {
            // Skip entries that can't be decrypted
          }
        });

        // Only return groups with 2+ entries (reused)
        const reusedGroups = Object.values(passwordMap)
          .filter(group => group.length > 1);

        // Flatten to list of entry IDs that have reused passwords
        const reusedEntryIds = reusedGroups.flat();

        // Audit log
        await createAuditLog(userId, 'CHECK_REUSED_PASSWORDS', {
          totalEntries: snapshot.size,
          reusedCount: reusedEntryIds.length
        });

        return res.json({
          success: true,
          reusedEntryIds,
          reusedGroups
        });
      } catch (error) {
        console.error('Error checking reused passwords:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// ==================== SECURE NOTES ====================

// Create a new secure note
exports.createSecureNoteHttp = functions.https.onRequest(
  { secrets: [encryptionKey] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        if (!checkRateLimit(userId, 'createSecureNote', 5) || !await checkRateLimitPersistent(userId, 'createSecureNote', 15, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { title, content } = req.body;

        if (!title || typeof title !== 'string' || title.trim().length === 0) {
          return res.status(400).json({ error: 'Title is required' });
        }

        if (title.length > 200) {
          return res.status(400).json({ error: 'Title must be 200 characters or less' });
        }

        if (!content || typeof content !== 'string' || content.trim().length === 0) {
          return res.status(400).json({ error: 'Content is required' });
        }

        if (content.length > 50000) {
          return res.status(400).json({ error: 'Content must be 50000 characters or less' });
        }

        const encryptedContent = encryptPassword(content, encryptionKey.value());

        const noteData = {
          title: sanitizeInput(title),
          content: encryptedContent,
          userId: userId,
          status: 'active',
          deletedAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        };

        const docRef = await db.collection('secure_notes').add(noteData);

        await createAuditLog(userId, 'CREATE_SECURE_NOTE', {
          noteId: docRef.id,
          title: sanitizeInput(title),
          ip: req.ip
        });

        return res.json({
          success: true,
          noteId: docRef.id
        });

      } catch (error) {
        console.error('Error creating secure note:', error);
        if (error.code === 'auth/id-token-expired') {
          return res.status(401).json({ error: 'Token expired' });
        }
        if (error.code === 'auth/argument-error') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// List secure notes (no content decryption)
exports.getSecureNotesHttp = functions.https.onRequest(
  { secrets: [] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        if (!checkRateLimit(userId, 'listSecureNotes', 20)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const snapshot = await db.collection('secure_notes')
          .where('userId', '==', userId)
          .where('status', '==', 'active')
          .get();

        const notes = snapshot.docs.map(doc => {
          const data = doc.data();
          return {
            id: doc.id,
            title: data.title,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt
          };
        });

        await createAuditLog(userId, 'LIST_SECURE_NOTES', {
          count: notes.length,
          ip: req.ip
        });

        return res.json({
          success: true,
          notes
        });

      } catch (error) {
        console.error('Error listing secure notes:', error);
        if (error.code === 'auth/id-token-expired') {
          return res.status(401).json({ error: 'Token expired' });
        }
        if (error.code === 'auth/argument-error') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// Get a single secure note with decrypted content
exports.getSecureNoteHttp = functions.https.onRequest(
  { secrets: [encryptionKey] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { noteId } = req.body;

        if (!checkRateLimit(userId, 'readSecureNote', 20) || !await checkRateLimitPersistent(userId, 'readSecureNote', 60, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        if (!noteId) {
          return res.status(400).json({ error: 'Note ID is required' });
        }

        const noteDoc = await db.collection('secure_notes').doc(noteId).get();

        if (!noteDoc.exists) {
          return res.status(404).json({ error: 'Secure note not found' });
        }

        const noteData = noteDoc.data();

        if (noteData.userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const decryptedContent = decryptPassword(noteData.content, encryptionKey.value());

        await createAuditLog(userId, 'VIEW_SECURE_NOTE', {
          noteId: noteId,
          title: noteData.title,
          ip: req.ip
        });

        return res.json({
          success: true,
          note: {
            id: noteDoc.id,
            title: noteData.title,
            content: decryptedContent,
            createdAt: noteData.createdAt,
            updatedAt: noteData.updatedAt
          }
        });

      } catch (error) {
        console.error('Error getting secure note:', error);
        if (error.code === 'auth/id-token-expired') {
          return res.status(401).json({ error: 'Token expired' });
        }
        if (error.code === 'auth/argument-error') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// Update a secure note
exports.updateSecureNoteHttp = functions.https.onRequest(
  { secrets: [encryptionKey] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { noteId, title, content } = req.body;

        if (!checkRateLimit(userId, 'updateSecureNote', 10)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        if (!noteId) {
          return res.status(400).json({ error: 'Note ID is required' });
        }

        const noteDoc = await db.collection('secure_notes').doc(noteId).get();

        if (!noteDoc.exists) {
          return res.status(404).json({ error: 'Secure note not found' });
        }

        const noteData = noteDoc.data();

        if (noteData.userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (noteData.status !== 'active') {
          return res.status(400).json({ error: 'Cannot update a deleted note' });
        }

        const updateData = {
          updatedAt: serverTimestamp()
        };

        if (title !== undefined) {
          if (typeof title !== 'string' || title.trim().length === 0) {
            return res.status(400).json({ error: 'Title cannot be empty' });
          }
          if (title.length > 200) {
            return res.status(400).json({ error: 'Title must be 200 characters or less' });
          }
          updateData.title = sanitizeInput(title);
        }

        if (content !== undefined) {
          if (typeof content !== 'string' || content.trim().length === 0) {
            return res.status(400).json({ error: 'Content cannot be empty' });
          }
          if (content.length > 50000) {
            return res.status(400).json({ error: 'Content must be 50000 characters or less' });
          }
          updateData.content = encryptPassword(content, encryptionKey.value());
        }

        await db.collection('secure_notes').doc(noteId).update(updateData);

        await createAuditLog(userId, 'UPDATE_SECURE_NOTE', {
          noteId: noteId,
          title: noteData.title,
          ip: req.ip
        });

        return res.json({
          success: true
        });

      } catch (error) {
        console.error('Error updating secure note:', error);
        if (error.code === 'auth/id-token-expired') {
          return res.status(401).json({ error: 'Token expired' });
        }
        if (error.code === 'auth/argument-error') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// Soft delete a secure note
exports.deleteSecureNoteHttp = functions.https.onRequest(
  { secrets: [] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { noteId } = req.body;

        if (!checkRateLimit(userId, 'deleteSecureNote', 10)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        if (!noteId) {
          return res.status(400).json({ error: 'Note ID is required' });
        }

        const noteDoc = await db.collection('secure_notes').doc(noteId).get();

        if (!noteDoc.exists) {
          return res.status(404).json({ error: 'Secure note not found' });
        }

        const noteData = noteDoc.data();

        if (noteData.userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (noteData.status === 'deleted') {
          return res.json({ success: true, message: 'Note is already in trash' });
        }

        await db.collection('secure_notes').doc(noteId).update({
          status: 'deleted',
          deletedAt: serverTimestamp()
        });

        await createAuditLog(userId, 'SOFT_DELETE_SECURE_NOTE', {
          noteId: noteId,
          title: noteData.title,
          ip: req.ip
        });

        return res.json({
          success: true,
          message: 'Secure note moved to trash'
        });

      } catch (error) {
        console.error('Error deleting secure note:', error);
        if (error.code === 'auth/id-token-expired') {
          return res.status(401).json({ error: 'Token expired' });
        }
        if (error.code === 'auth/argument-error') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: error.message || 'Internal server error' });
      }
    });
  }
);

// Restore a secure note from trash
exports.restoreSecureNoteHttp = functions.https.onRequest(
  { secrets: [] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { noteId } = req.body;

        if (!checkRateLimit(userId, 'restoreSecureNote', 10)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        if (!noteId) {
          return res.status(400).json({ error: 'Note ID is required' });
        }

        const noteDoc = await db.collection('secure_notes').doc(noteId).get();

        if (!noteDoc.exists) {
          return res.status(404).json({ error: 'Secure note not found' });
        }

        const noteData = noteDoc.data();

        if (noteData.userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (noteData.status !== 'deleted') {
          return res.status(400).json({ error: 'Note is not in trash' });
        }

        await db.collection('secure_notes').doc(noteId).update({
          status: 'active',
          deletedAt: deleteField()
        });

        await createAuditLog(userId, 'RESTORE_SECURE_NOTE', {
          noteId: noteId,
          title: noteData.title,
          ip: req.ip
        });

        return res.json({
          success: true,
          message: 'Secure note restored successfully'
        });

      } catch (error) {
        console.error('Error restoring secure note:', error);
        if (error.code === 'auth/id-token-expired') {
          return res.status(401).json({ error: 'Token expired' });
        }
        if (error.code === 'auth/argument-error') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: error.message || 'Internal server error' });
      }
    });
  }
);

// Permanently delete a secure note
exports.permanentDeleteSecureNoteHttp = functions.https.onRequest(
  { secrets: [] },
  async (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { noteId } = req.body;

        if (!checkRateLimit(userId, 'permanentDeleteSecureNote', 10)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        if (!noteId) {
          return res.status(400).json({ error: 'Note ID is required' });
        }

        const noteDoc = await db.collection('secure_notes').doc(noteId).get();

        if (!noteDoc.exists) {
          return res.status(404).json({ error: 'Secure note not found' });
        }

        const noteData = noteDoc.data();

        if (noteData.userId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (noteData.status !== 'deleted') {
          return res.status(400).json({ error: 'Note must be in trash before permanent deletion' });
        }

        await db.collection('secure_notes').doc(noteId).delete();

        await createAuditLog(userId, 'PERMANENT_DELETE_SECURE_NOTE', {
          noteId: noteId,
          title: noteData.title,
          ip: req.ip
        });

        return res.json({
          success: true,
          message: 'Secure note permanently deleted'
        });

      } catch (error) {
        console.error('Error permanently deleting secure note:', error);
        if (error.code === 'auth/id-token-expired') {
          return res.status(401).json({ error: 'Token expired' });
        }
        if (error.code === 'auth/argument-error') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: error.message || 'Internal server error' });
      }
    });
  }
);

// ===================== TOTP Functions =====================

exports.saveTotpSecretHttp = functions.https.onRequest(
  { secrets: [encryptionKey], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { entryId, totpSecret } = req.body;

        if (!entryId) {
          return res.status(400).json({ error: 'entryId required' });
        }

        if (!totpSecret || typeof totpSecret !== 'string') {
          return res.status(400).json({ error: 'totpSecret required' });
        }

        // Validate base32 format (basic check)
        const base32Regex = /^[A-Z2-7]+=*$/i;
        const cleanSecret = totpSecret.replace(/[\s-]/g, '').toUpperCase();
        if (!base32Regex.test(cleanSecret)) {
          return res.status(400).json({ error: 'Invalid TOTP secret format' });
        }

        // Verify the secret works (generate a test code)
        try {
          generateTOTP(cleanSecret);
        } catch (e) {
          return res.status(400).json({ error: 'Invalid TOTP secret' });
        }

        // Rate limit
        if (!checkRateLimit(userId, 'saveTOTP', 10) || !await checkRateLimitPersistent(userId, 'saveTOTP', 20, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        // Verify ownership
        const entryDoc = await db.collection('password_entries').doc(entryId).get();
        if (!entryDoc.exists) {
          return res.status(404).json({ error: 'Entry not found' });
        }
        if (entryDoc.data().userId !== userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }
        if (entryDoc.data().status === 'deleted') {
          return res.status(400).json({ error: 'Cannot modify deleted entry' });
        }

        // Encrypt and save
        await db.collection('password_entries').doc(entryId).update({
          totpSecret: encryptPassword(cleanSecret, encryptionKey.value()),
          updatedAt: serverTimestamp()
        });

        await createAuditLog(userId, 'SAVE_TOTP_SECRET', { entryId });
        return res.json({ success: true });

      } catch (error) {
        console.error('Error saving TOTP secret:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

exports.getTotpCodeHttp = functions.https.onRequest(
  { secrets: [encryptionKey], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { entryId } = req.body;
        if (!entryId) {
          return res.status(400).json({ error: 'entryId required' });
        }

        // Rate limit (generous - codes refresh often)
        if (!checkRateLimit(userId, 'getTOTP', 60) || !await checkRateLimitPersistent(userId, 'getTOTP', 120, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        // Verify ownership
        const entryDoc = await db.collection('password_entries').doc(entryId).get();
        if (!entryDoc.exists) {
          return res.status(404).json({ error: 'Entry not found' });
        }
        if (entryDoc.data().userId !== userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        const entryData = entryDoc.data();
        if (!entryData.totpSecret) {
          return res.status(400).json({ error: 'No TOTP configured for this entry' });
        }

        // Decrypt secret and generate code
        const secret = decryptPassword(entryData.totpSecret, encryptionKey.value());
        const code = generateTOTP(secret);
        const timeRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);

        return res.json({ success: true, code, timeRemaining });

      } catch (error) {
        console.error('Error getting TOTP code:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

exports.removeTotpSecretHttp = functions.https.onRequest(
  { secrets: [], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { entryId } = req.body;

        if (!entryId) {
          return res.status(400).json({ error: 'entryId required' });
        }

        // Rate limit
        if (!checkRateLimit(userId, 'removeTOTP', 10) || !await checkRateLimitPersistent(userId, 'removeTOTP', 20, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        // Verify ownership
        const entryDoc = await db.collection('password_entries').doc(entryId).get();
        if (!entryDoc.exists) {
          return res.status(404).json({ error: 'Entry not found' });
        }
        if (entryDoc.data().userId !== userId) {
          return res.status(403).json({ error: 'Forbidden' });
        }

        await db.collection('password_entries').doc(entryId).update({
          totpSecret: deleteField(),
          updatedAt: serverTimestamp()
        });

        await createAuditLog(userId, 'REMOVE_TOTP_SECRET', { entryId });
        return res.json({ success: true });

      } catch (error) {
        console.error('Error removing TOTP secret:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

// =============================================================================
// EMERGENCY ACCESS - Trusted contacts with waiting period
// =============================================================================

const VALID_WAIT_PERIODS = [1, 3, 7, 14, 30];

/**
 * Add an emergency contact (grantor adds a trustee)
 * Creates an emergency_access document with status 'invited' or 'active'
 */
exports.addEmergencyContactHttp = functions.https.onRequest(
  { secrets: [], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        if (!checkRateLimit(userId, 'addEmergencyContact', 10) || !await checkRateLimitPersistent(userId, 'addEmergencyContact', 20, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { trusteeEmail, waitPeriodDays } = req.body;

        // Validate email format
        if (!trusteeEmail || typeof trusteeEmail !== 'string') {
          return res.status(400).json({ error: 'trusteeEmail is required' });
        }
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(trusteeEmail.trim())) {
          return res.status(400).json({ error: 'Invalid email format' });
        }

        // Validate wait period
        if (!VALID_WAIT_PERIODS.includes(waitPeriodDays)) {
          return res.status(400).json({ error: `waitPeriodDays must be one of: ${VALID_WAIT_PERIODS.join(', ')}` });
        }

        // Prevent adding yourself
        const grantorEmail = decodedToken.email || '';
        if (trusteeEmail.trim().toLowerCase() === grantorEmail.toLowerCase()) {
          return res.status(400).json({ error: 'You cannot add yourself as an emergency contact' });
        }

        // Check if contact already exists (not revoked)
        const existingSnapshot = await db.collection('emergency_access')
          .where('grantorId', '==', userId)
          .where('trusteeEmail', '==', trusteeEmail.trim().toLowerCase())
          .get();

        const activeExisting = existingSnapshot.docs.find(doc => doc.data().status !== 'revoked');
        if (activeExisting) {
          return res.status(409).json({ error: 'This contact already exists' });
        }

        // Look up trustee in users collection
        let trusteeId = null;
        const usersSnapshot = await db.collection('users')
          .where('email', '==', trusteeEmail.trim().toLowerCase())
          .limit(1)
          .get();

        if (!usersSnapshot.empty) {
          trusteeId = usersSnapshot.docs[0].id;
        }

        const status = trusteeId ? 'active' : 'invited';

        const docRef = await db.collection('emergency_access').add({
          grantorId: userId,
          trusteeEmail: trusteeEmail.trim().toLowerCase(),
          trusteeId: trusteeId,
          status: status,
          waitPeriodDays: waitPeriodDays,
          requestedAt: null,
          approvedAt: null,
          accessExpiresAt: null,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await createAuditLog(userId, 'ADD_EMERGENCY_CONTACT', {
          accessId: docRef.id,
          trusteeEmail: trusteeEmail.trim().toLowerCase(),
          waitPeriodDays,
          status,
          ip: req.ip
        });

        return res.json({
          success: true,
          accessId: docRef.id,
          message: 'Emergency contact added'
        });

      } catch (error) {
        console.error('Error adding emergency contact:', error);
        if (error.code === 'auth/id-token-expired') {
          return res.status(401).json({ error: 'Token expired' });
        }
        if (error.code === 'auth/argument-error') {
          return res.status(401).json({ error: 'Invalid token' });
        }
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

/**
 * Get emergency contacts (grantor lists their contacts)
 */
exports.getEmergencyContactsHttp = functions.https.onRequest(
  { secrets: [], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        if (!checkRateLimit(userId, 'getEmergencyContacts', 20)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const snapshot = await db.collection('emergency_access')
          .where('grantorId', '==', userId)
          .get();

        const contacts = snapshot.docs
          .filter(doc => doc.data().status !== 'revoked')
          .map(doc => {
            const data = doc.data();
            return {
              id: doc.id,
              trusteeEmail: data.trusteeEmail,
              trusteeId: data.trusteeId,
              status: data.status,
              waitPeriodDays: data.waitPeriodDays,
              requestedAt: data.requestedAt,
              createdAt: data.createdAt
            };
          });

        return res.json({ success: true, contacts });

      } catch (error) {
        console.error('Error getting emergency contacts:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

/**
 * Get emergency grantors (trustee lists who granted them access)
 */
exports.getEmergencyGrantorsHttp = functions.https.onRequest(
  { secrets: [], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;
        const userEmail = (decodedToken.email || '').toLowerCase();

        if (!checkRateLimit(userId, 'getEmergencyGrantors', 20)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        // Query by trusteeId (for contacts added after trustee had an account)
        const byIdSnapshot = await db.collection('emergency_access')
          .where('trusteeId', '==', userId)
          .get();

        // Query by trusteeEmail (for contacts added before trustee had an account)
        const byEmailSnapshot = userEmail
          ? await db.collection('emergency_access')
              .where('trusteeEmail', '==', userEmail)
              .get()
          : { docs: [] };

        // Merge and deduplicate
        const seen = new Set();
        const allDocs = [];

        for (const doc of [...byIdSnapshot.docs, ...byEmailSnapshot.docs]) {
          if (!seen.has(doc.id) && doc.data().status !== 'revoked') {
            seen.add(doc.id);
            allDocs.push(doc);
          }
        }

        // Look up grantor emails
        const grantors = [];
        for (const doc of allDocs) {
          const data = doc.data();
          let grantorEmail = '';
          try {
            const grantorUser = await admin.auth().getUser(data.grantorId);
            grantorEmail = grantorUser.email || '';
          } catch (e) {
            console.warn(`Could not look up grantor ${data.grantorId}:`, e.message);
          }

          grantors.push({
            id: doc.id,
            grantorId: data.grantorId,
            grantorEmail,
            status: data.status,
            waitPeriodDays: data.waitPeriodDays,
            requestedAt: data.requestedAt,
            approvedAt: data.approvedAt,
            accessExpiresAt: data.accessExpiresAt
          });
        }

        // Update trusteeId on any docs matched only by email
        for (const doc of byEmailSnapshot.docs) {
          const data = doc.data();
          if (!data.trusteeId && data.status === 'invited') {
            await doc.ref.update({
              trusteeId: userId,
              status: 'active',
              updatedAt: serverTimestamp()
            });
          } else if (!data.trusteeId) {
            await doc.ref.update({
              trusteeId: userId,
              updatedAt: serverTimestamp()
            });
          }
        }

        return res.json({ success: true, grantors });

      } catch (error) {
        console.error('Error getting emergency grantors:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

/**
 * Request emergency access (trustee requests access to grantor's passwords)
 */
exports.requestEmergencyAccessHttp = functions.https.onRequest(
  { secrets: [], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;
        const userEmail = (decodedToken.email || '').toLowerCase();

        if (!checkRateLimit(userId, 'requestEmergencyAccess', 5) || !await checkRateLimitPersistent(userId, 'requestEmergencyAccess', 10, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { accessId } = req.body;
        if (!accessId) {
          return res.status(400).json({ error: 'accessId is required' });
        }

        const docRef = db.collection('emergency_access').doc(accessId);
        const doc = await docRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: 'Emergency access document not found' });
        }

        const data = doc.data();

        // Verify trustee identity
        if (data.trusteeId !== userId && data.trusteeEmail !== userEmail) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (data.status !== 'active') {
          return res.status(400).json({ error: `Cannot request access: current status is '${data.status}'` });
        }

        await docRef.update({
          status: 'requesting',
          requestedAt: serverTimestamp(),
          updatedAt: serverTimestamp()
        });

        await createAuditLog(userId, 'REQUEST_EMERGENCY_ACCESS', {
          accessId,
          grantorId: data.grantorId,
          ip: req.ip
        });

        return res.json({
          success: true,
          message: `Access requested. Waiting period: ${data.waitPeriodDays} day(s)`
        });

      } catch (error) {
        console.error('Error requesting emergency access:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

/**
 * Approve emergency access (grantor approves immediately)
 */
exports.approveEmergencyAccessHttp = functions.https.onRequest(
  { secrets: [], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        if (!checkRateLimit(userId, 'approveEmergencyAccess', 10) || !await checkRateLimitPersistent(userId, 'approveEmergencyAccess', 20, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { accessId } = req.body;
        if (!accessId) {
          return res.status(400).json({ error: 'accessId is required' });
        }

        const docRef = db.collection('emergency_access').doc(accessId);
        const doc = await docRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: 'Emergency access document not found' });
        }

        const data = doc.data();

        if (data.grantorId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (data.status !== 'requesting') {
          return res.status(400).json({ error: `Cannot approve: current status is '${data.status}'` });
        }

        const now = new Date();
        const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        await docRef.update({
          status: 'approved',
          approvedAt: serverTimestamp(),
          accessExpiresAt: timestampFromDate(expiresAt),
          updatedAt: serverTimestamp()
        });

        await createAuditLog(userId, 'APPROVE_EMERGENCY_ACCESS', {
          accessId,
          trusteeEmail: data.trusteeEmail,
          ip: req.ip
        });

        return res.json({
          success: true,
          message: 'Emergency access approved. Access expires in 24 hours.'
        });

      } catch (error) {
        console.error('Error approving emergency access:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

/**
 * Deny emergency access (grantor denies, resets to active)
 */
exports.denyEmergencyAccessHttp = functions.https.onRequest(
  { secrets: [], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        if (!checkRateLimit(userId, 'denyEmergencyAccess', 10)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { accessId } = req.body;
        if (!accessId) {
          return res.status(400).json({ error: 'accessId is required' });
        }

        const docRef = db.collection('emergency_access').doc(accessId);
        const doc = await docRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: 'Emergency access document not found' });
        }

        const data = doc.data();

        if (data.grantorId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (data.status !== 'requesting') {
          return res.status(400).json({ error: `Cannot deny: current status is '${data.status}'` });
        }

        await docRef.update({
          status: 'active',
          requestedAt: null,
          updatedAt: serverTimestamp()
        });

        await createAuditLog(userId, 'DENY_EMERGENCY_ACCESS', {
          accessId,
          trusteeEmail: data.trusteeEmail,
          ip: req.ip
        });

        return res.json({
          success: true,
          message: 'Emergency access request denied'
        });

      } catch (error) {
        console.error('Error denying emergency access:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

/**
 * Revoke emergency contact (grantor removes a contact)
 */
exports.revokeEmergencyContactHttp = functions.https.onRequest(
  { secrets: [], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        if (!checkRateLimit(userId, 'revokeEmergencyContact', 10)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { accessId } = req.body;
        if (!accessId) {
          return res.status(400).json({ error: 'accessId is required' });
        }

        const docRef = db.collection('emergency_access').doc(accessId);
        const doc = await docRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: 'Emergency access document not found' });
        }

        const data = doc.data();

        if (data.grantorId !== userId) {
          return res.status(403).json({ error: 'Access denied' });
        }

        await docRef.update({
          status: 'revoked',
          updatedAt: serverTimestamp()
        });

        await createAuditLog(userId, 'REVOKE_EMERGENCY_CONTACT', {
          accessId,
          trusteeEmail: data.trusteeEmail,
          ip: req.ip
        });

        return res.json({
          success: true,
          message: 'Emergency contact revoked'
        });

      } catch (error) {
        console.error('Error revoking emergency contact:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

/**
 * Get emergency passwords (trustee reads grantor's passwords after approval)
 */
exports.getEmergencyPasswordsHttp = functions.https.onRequest(
  { secrets: [encryptionKey], cors: true },
  (req, res) => {
    return corsHandler(req, res, async () => {
      try {
        if (req.method !== 'POST') {
          return res.status(405).json({ error: 'Method not allowed' });
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return res.status(401).json({ error: 'Unauthorized' });
        }

        const token = authHeader.split('Bearer ')[1];
        if (!token) {
          return res.status(401).json({ error: 'No token provided' });
        }

        const decodedToken = await admin.auth().verifyIdToken(token);
        const userId = decodedToken.uid;
        const userEmail = (decodedToken.email || '').toLowerCase();

        if (!checkRateLimit(userId, 'getEmergencyPasswords', 10) || !await checkRateLimitPersistent(userId, 'getEmergencyPasswords', 20, 60000)) {
          return res.status(429).json({ error: 'Rate limit exceeded' });
        }

        const { accessId } = req.body;
        if (!accessId) {
          return res.status(400).json({ error: 'accessId is required' });
        }

        const docRef = db.collection('emergency_access').doc(accessId);
        const doc = await docRef.get();

        if (!doc.exists) {
          return res.status(404).json({ error: 'Emergency access document not found' });
        }

        const data = doc.data();

        // Verify trustee identity
        if (data.trusteeId !== userId && data.trusteeEmail !== userEmail) {
          return res.status(403).json({ error: 'Access denied' });
        }

        if (data.status !== 'approved') {
          return res.status(403).json({ error: 'Access not approved' });
        }

        // Check expiration
        if (!data.accessExpiresAt) {
          return res.status(403).json({ error: 'Access expiry not set' });
        }
        const now = new Date();
        const expiresAt = data.accessExpiresAt?.toDate ? data.accessExpiresAt.toDate() : new Date(data.accessExpiresAt);
        if (isNaN(expiresAt.getTime()) || now > expiresAt) {
          return res.status(403).json({ error: 'Access has expired' });
        }

        // Fetch all password entries for the grantor (excluding deleted)
        const entriesSnapshot = await db.collection('password_entries')
          .where('userId', '==', data.grantorId)
          .get();

        const passwords = [];
        for (const entryDoc of entriesSnapshot.docs) {
          const entryData = entryDoc.data();
          // Skip deleted entries (older entries may not have status field)
          if (entryData.status === 'deleted') continue;
          let decryptedPassword = '';

          try {
            if (entryData.password && typeof entryData.password === 'object' && entryData.password.encrypted) {
              decryptedPassword = decryptPassword(entryData.password, encryptionKey.value());
            } else if (typeof entryData.password === 'string') {
              // Legacy CryptoJS format. Migration retired LEGACY_SECRET_KEY use.
              console.error(`Legacy password format for entry ${entryDoc.id}.`);
              decryptedPassword = '[Legacy format — admin must run migrateLegacyPasswords]';
            }
          } catch (decryptError) {
            console.error(`Error decrypting password for entry ${entryDoc.id}:`, decryptError);
            decryptedPassword = '[Decryption error]';
          }

          const decryptedNotes = entryData.notes && typeof entryData.notes === 'object' && entryData.notes.iv
            ? decryptPassword(entryData.notes, encryptionKey.value())
            : (entryData.notes || '');

          passwords.push({
            id: entryDoc.id,
            title: entryData.title || '',
            username: entryData.username || '',
            password: decryptedPassword,
            url: entryData.url || '',
            notes: decryptedNotes
          });
        }

        await createAuditLog(userId, 'VIEW_EMERGENCY_PASSWORDS', {
          accessId,
          grantorId: data.grantorId,
          entriesCount: passwords.length,
          ip: req.ip
        });

        return res.json({ success: true, passwords });

      } catch (error) {
        console.error('Error getting emergency passwords:', error);
        return res.status(500).json({ error: 'Internal server error' });
      }
    });
  }
);

/**
 * Scheduled function: Auto-approve emergency access after waiting period expires
 * Runs every hour
 */
exports.autoApproveEmergencyAccess = onSchedule('every 1 hours', async () => {
  const snapshot = await db.collection('emergency_access')
    .where('status', '==', 'requesting')
    .get();

  if (snapshot.empty) {
    console.log('autoApproveEmergencyAccess: No pending requests');
    return;
  }

  const now = new Date();
  let autoApproved = 0;

  for (const doc of snapshot.docs) {
    const data = doc.data();
    const requestedAt = data.requestedAt?.toDate ? data.requestedAt.toDate() : new Date(data.requestedAt);
    const waitMs = data.waitPeriodDays * 24 * 60 * 60 * 1000;
    const approveAfter = new Date(requestedAt.getTime() + waitMs);

    if (now >= approveAfter) {
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await doc.ref.update({
        status: 'approved',
        approvedAt: timestampFromDate(now),
        accessExpiresAt: timestampFromDate(expiresAt),
        updatedAt: timestampFromDate(now)
      });

      autoApproved++;
      console.log(`Auto-approved emergency access ${doc.id} for trustee ${data.trusteeEmail}`);
    }
  }

  console.log(`autoApproveEmergencyAccess: ${autoApproved} auto-approved out of ${snapshot.size} requesting`);
});
