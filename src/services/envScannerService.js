/**
 * Environment Scanner Service
 * Scans folders for .env files and groups them intelligently by project
 */

// Patrones de archivos a detectar
const ENV_FILE_PATTERNS = [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
    '.env.production',
    '.env.production.local',
    '.env.staging',
    '.env.test',
    '.env.example',
    '.env.sample'
];

// Additional credential files
const CREDENTIAL_FILES = [
    'credentials.json',
    '.npmrc',
    '.yarnrc',
    '.netrc',
    'config.json',
    'secrets.json',
    'serviceAccount.json',
    'service-account.json',
    'firebase-adminsdk.json',
    'privkey.pem',
    'private.key',
    'id_rsa',
    'id_ed25519'
];

// Partial patterns to detect legacy credential files
const CREDENTIAL_PATTERNS = [
    'firebase-adminsdk', 'serviceaccount', 'service-account',
    'privkey', 'privkeys', 'private-key', 'privatekey',
    'credentials', 'secrets', 'apikey', 'api-key', 'api_key'
];

const CREDENTIAL_EXTENSIONS = ['.json', '.pem', '.key', '.env', '.js'];

// ============================================
// AI ASSISTANT CONTEXT FILES
// ============================================

const AI_CONTEXT_FILES = {
    claude: {
        patterns: [
            'claude.md', 'CLAUDE.md',
            '.claude/settings.json', '.claude/settings.local.json',
            '.claude/commands/', '.claude/agents/',
            '.mcp.json', '.claudeignore'
        ],
        icon: '🤖',
        label: 'Claude Code'
    },
    cursor: {
        patterns: ['.cursorrules', '.cursorignore', '.cursor/rules/', '.cursor/mcp.json'],
        icon: '🖱️',
        label: 'Cursor'
    },
    copilot: {
        patterns: ['.github/copilot-instructions.md'],
        icon: '🐙',
        label: 'GitHub Copilot'
    },
    gemini: {
        patterns: ['GEMINI.md', '.gemini/GEMINI.md', '.gemini/styleguide.md', '.gemini/settings.json'],
        icon: '💎',
        label: 'Google Gemini'
    },
    windsurf: {
        patterns: ['.windsurfrules', '.windsurf/rules/', '.windsurf/mcp.json'],
        icon: '🏄',
        label: 'Windsurf'
    },
    aider: {
        patterns: ['.aider', '.aider.conf.yml', '.aider.model.settings.yml', '.aiderignore'],
        icon: '🔧',
        label: 'Aider'
    },
    cline: {
        patterns: ['.clinerules', '.cline'],
        icon: '📝',
        label: 'Cline'
    },
    roo: {
        patterns: ['.roomodes', '.roo/rules/'],
        icon: '🦘',
        label: 'Roo Code'
    },
    codex: {
        patterns: ['AGENTS.md', '.codex/'],
        icon: '🧠',
        label: 'OpenAI Codex'
    },
    continue_ai: {
        patterns: ['.continuerules', '.continueignore', '.continue/config.json', '.continue/config.yaml'],
        icon: '▶️',
        label: 'Continue'
    },
    taskmaster: {
        patterns: ['.taskmaster/config.json', '.taskmaster/'],
        icon: '📋',
        label: 'Taskmaster AI'
    },
    llms_txt: {
        patterns: ['llms.txt', 'llms-full.txt'],
        icon: '📄',
        label: 'LLMs.txt'
    }
};

/**
 * Checks if a file is an AI context file
 * @returns {{ isAiContext: boolean, aiTool: string|null, icon: string|null, label: string|null }}
 */
export function isAiContextFile(fileName, relativePath = '') {
    const fullPath = (relativePath || fileName).toLowerCase().replace(/\\/g, '/');
    const fileNameLower = fileName.toLowerCase();

    for (const [tool, config] of Object.entries(AI_CONTEXT_FILES)) {
        for (const pattern of config.patterns) {
            const normalizedPattern = pattern.toLowerCase();

            // Directory pattern (ends with /): matches any file inside
            if (normalizedPattern.endsWith('/')) {
                const dirPath = normalizedPattern.slice(0, -1);
                if (fullPath.includes(dirPath + '/')) {
                    return { isAiContext: true, aiTool: tool, icon: config.icon, label: config.label };
                }
                continue;
            }

            // Exact file name match
            if (fileNameLower === normalizedPattern || fileNameLower === normalizedPattern.split('/').pop()) {
                return { isAiContext: true, aiTool: tool, icon: config.icon, label: config.label };
            }

            // Match at the end of the full path
            if (fullPath.endsWith('/' + normalizedPattern) || fullPath === normalizedPattern) {
                return { isAiContext: true, aiTool: tool, icon: config.icon, label: config.label };
            }

            // For patterns with path (e.g.: .github/copilot-instructions.md)
            if (pattern.includes('/') && fullPath.includes(normalizedPattern)) {
                return { isAiContext: true, aiTool: tool, icon: config.icon, label: config.label };
            }
        }
    }

    // Additional check for .aider* files
    if (fileNameLower.startsWith('.aider')) {
        return { isAiContext: true, aiTool: 'aider', icon: AI_CONTEXT_FILES.aider.icon, label: AI_CONTEXT_FILES.aider.label };
    }

    return { isAiContext: false, aiTool: null, icon: null, label: null };
}

/**
 * Parses an AI context file (saves full content)
 */
export function parseAiContextFile(content, fileName, aiTool) {
    const config = AI_CONTEXT_FILES[aiTool] || { icon: '📄', label: 'AI Context' };
    return {
        aiTool,
        content: content,
        preview: content.substring(0, 150).replace(/\n/g, ' ').trim() + (content.length > 150 ? '...' : ''),
        size: new Blob([content]).size,
        icon: config.icon,
        label: config.label
    };
}

/**
 * Parses the content of a .env file
 */
export function parseEnvContent(content) {
    const variables = [];
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();

        // Ignore empty lines and comments
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Parse KEY=value
        const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
        if (match) {
            const name = match[1];
            let value = match[2];

            // Remove quotes
            if ((value.startsWith('"') && value.endsWith('"')) ||
                (value.startsWith("'") && value.endsWith("'"))) {
                value = value.slice(1, -1);
            }

            variables.push({ name, value });
        }
    }

    return variables;
}

/**
 * Parses credentials from a JSON file
 */
function parseJsonCredentials(content, fileName) {
    try {
        const data = JSON.parse(content);
        const variables = [];

        // Recursive function to extract values
        function extractValues(obj, prefix = '') {
            for (const [key, value] of Object.entries(obj)) {
                const fullKey = prefix ? `${prefix}_${key}` : key;

                if (typeof value === 'string' || typeof value === 'number') {
                    // Only include if it looks like a credential
                    if (isLikelyCredential(key, String(value))) {
                        variables.push({
                            name: fullKey.toUpperCase().replace(/[^A-Z0-9]/g, '_'),
                            value: String(value)
                        });
                    }
                } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    extractValues(value, fullKey);
                }
            }
        }

        extractValues(data);
        return variables;
    } catch {
        return [];
    }
}

/**
 * Detects whether a value looks like a credential
 */
function isLikelyCredential(key, value) {
    const keyLower = key.toLowerCase();
    const sensitiveKeywords = [
        'key', 'secret', 'token', 'password', 'api', 'auth',
        'credential', 'private', 'cert', 'id', 'url', 'uri',
        'connection', 'database', 'db', 'host', 'user', 'pass'
    ];

    // Check by key name
    if (sensitiveKeywords.some(kw => keyLower.includes(kw))) {
        return true;
    }

    // Check by value pattern (long random strings)
    if (value.length > 20 && /^[A-Za-z0-9+/=_-]+$/.test(value)) {
        return true;
    }

    return false;
}

/**
 * Parses the content of .npmrc
 */
function parseNpmrc(content) {
    const variables = [];
    const lines = content.split('\n');

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) continue;

        // Look for tokens and auth
        if (trimmed.includes('_authToken=') || trimmed.includes('_auth=')) {
            const match = trimmed.match(/^(.+)=(.+)$/);
            if (match) {
                variables.push({
                    name: 'NPM_' + match[1].replace(/[^A-Za-z0-9]/g, '_').toUpperCase(),
                    value: match[2]
                });
            }
        }
    }

    return variables;
}

/**
 * Parses credentials from a JavaScript file (exports)
 * Detects patterns like: module.exports = { KEY: 'value' }, const ObjName = { KEY: 'value' }, etc.
 */
function parseJsCredentials(content, fileName) {
    const variables = [];
    // If the file already has a credential-related name (privkeys, secrets, etc), include ALL variables
    const fileNameLower = fileName.toLowerCase();
    const isTrustedFile = CREDENTIAL_PATTERNS.some(p => fileNameLower.includes(p));

    // Helper to extract key-value pairs from an object
    function extractFromObject(objectContent) {
        const keyValueRegex = /(\w+)\s*:\s*['"`]([^'"`]*)['"`]/g;
        let match;
        while ((match = keyValueRegex.exec(objectContent)) !== null) {
            const key = match[1];
            const value = match[2];
            // Include if it's a trusted file or looks like a credential
            if (isTrustedFile || isLikelyCredential(key, value)) {
                if (!variables.some(v => v.name === key.toUpperCase())) {
                    variables.push({
                        name: key.toUpperCase(),
                        value: value
                    });
                }
            }
        }
    }

    // Pattern 1: module.exports = { key: 'value' } - exported objects
    const moduleExportMatch = content.match(/(?:module\.exports|exports)\s*=\s*\{([\s\S]*)\}/);
    if (moduleExportMatch) {
        extractFromObject(moduleExportMatch[1]);
    }

    // Pattern 2: const/let/var ObjName = { key: 'value', ... } - objects assigned to variables
    // This captures: const PrivateKeys = { AWS_KEY: 'xxx', ... }
    const objectVarMatch = content.match(/(?:const|let|var)\s+\w+\s*=\s*\{([\s\S]*)\}/);
    if (objectVarMatch) {
        extractFromObject(objectVarMatch[1]);
    }

    // Pattern 3: exports.KEY = 'value' or module.exports.KEY = 'value'
    const directExportRegex = /(?:module\.)?exports\.(\w+)\s*=\s*['"`]([^'"`]*)['"`]/g;
    let directMatch;
    while ((directMatch = directExportRegex.exec(content)) !== null) {
        const key = directMatch[1];
        const value = directMatch[2];
        if (isTrustedFile || isLikelyCredential(key, value)) {
            if (!variables.some(v => v.name === key.toUpperCase())) {
                variables.push({
                    name: key.toUpperCase(),
                    value: value
                });
            }
        }
    }

    // Pattern 4: const/let/var KEY = 'value' (loose variables with a string value)
    const varRegex = /(?:const|let|var)\s+(\w+)\s*=\s*['"`]([^'"`]*)['"`]/g;
    let varMatch;
    while ((varMatch = varRegex.exec(content)) !== null) {
        const key = varMatch[1];
        const value = varMatch[2];
        if (isTrustedFile || isLikelyCredential(key, value)) {
            if (!variables.some(v => v.name === key.toUpperCase())) {
                variables.push({
                    name: key.toUpperCase(),
                    value: value
                });
            }
        }
    }

    return variables;
}

/**
 * Generates a random color for the project
 */
function generateProjectColor() {
    const colors = [
        '#F7DC6F', '#82E0AA', '#85C1E9', '#F8C471', '#D7BDE2',
        '#F1948A', '#AED6F1', '#A3E4D7', '#FAD7A0', '#D5DBDB'
    ];
    return colors[Math.floor(Math.random() * colors.length)];
}

/**
 * Generates an icon based on the file contents
 */
function detectProjectIcon(files) {
    // Analyze the content of the variables to detect the project type
    for (const file of files) {
        for (const variable of file.variables) {
            const name = variable.name.toLowerCase();
            if (name.includes('firebase') || name.includes('gcp')) return '🔥';
            if (name.includes('aws') || name.includes('amazon') || name.includes('s3')) return '☁️';
            if (name.includes('stripe') || name.includes('payment')) return '💳';
            if (name.includes('database') || name.includes('postgres') || name.includes('mysql') || name.includes('mongo')) return '🗄️';
            if (name.includes('redis') || name.includes('cache')) return '⚡';
            if (name.includes('sendgrid') || name.includes('mailgun') || name.includes('smtp')) return '📧';
            if (name.includes('twilio') || name.includes('sms')) return '📱';
            if (name.includes('openai') || name.includes('anthropic') || name.includes('gemini')) return '🤖';
        }
    }

    // Check by file name
    for (const file of files) {
        const name = file.name.toLowerCase();
        if (name.includes('firebase') || name.includes('serviceaccount')) return '🔥';
        if (name === '.npmrc' || name === '.yarnrc') return '📦';
    }

    return '🔐';
}

/**
 * Checks if a file is an environment configuration file
 */
function isEnvFile(fileName) {
    const name = fileName.toLowerCase();

    // .env files always
    if (name.startsWith('.env')) return true;

    // Exact matches
    if (CREDENTIAL_FILES.map(f => f.toLowerCase()).includes(name)) return true;

    // Partial matches (name contains the pattern)
    if (CREDENTIAL_PATTERNS.some(p => name.includes(p))) {
        // Check that it has a valid extension or no extension
        const hasValidExt = CREDENTIAL_EXTENSIONS.some(ext => name.endsWith(ext));
        const hasNoExt = !name.includes('.') || name.startsWith('.');
        return hasValidExt || hasNoExt;
    }

    return false;
}

/**
 * Extracts the project name from the file path
 * Looks for the project root folder (where the .env lives)
 */
function extractProjectFromPath(relativePath) {
    if (!relativePath) return null;

    const parts = relativePath.split('/').filter(Boolean);

    // If there's only a file without path, there is no project
    if (parts.length <= 1) return null;

    // The root folder is the first component of the path
    // E.g.: "my-project/src/.env" -> "my-project"
    // E.g.: "my-project/.env.local" -> "my-project"
    return parts[0];
}

/**
 * Processes files from a folder and intelligently groups them into projects
 * Returns { projects, aiContextFiles } separating env files and AI context files
 */
export async function scanFilesFromFolder(fileList) {
    const projects = new Map(); // projectName -> project data
    const processedFiles = [];
    const processedAiContextFiles = []; // AI context files

    // First pass: filter and read config and AI context files
    for (const file of fileList) {
        const fileName = file.name;
        const relativePath = file._relativePath || file.webkitRelativePath || '';

        // Determine the project
        let projectName = file._projectName;
        if (!projectName) {
            projectName = extractProjectFromPath(relativePath);
        }
        if (!projectName) {
            projectName = 'Mi Proyecto';
        }

        // Check if it's an AI context file
        const aiCheck = isAiContextFile(fileName, relativePath);
        if (aiCheck.isAiContext) {
            try {
                const content = await readFileContent(file);
                const parsed = parseAiContextFile(content, fileName, aiCheck.aiTool);
                processedAiContextFiles.push({
                    name: fileName,
                    path: relativePath || fileName,
                    projectName,
                    ...parsed
                });
            } catch (error) {
                console.warn(`Error reading AI context file ${fileName}:`, error);
            }
            continue; // Do not process as env file
        }

        // Check if it's an env config file
        if (!isEnvFile(fileName)) continue;

        // Read file content
        try {
            const content = await readFileContent(file);
            let variables = [];

            const fileNameLower = fileName.toLowerCase();
            if (fileNameLower.startsWith('.env')) {
                variables = parseEnvContent(content);
            } else if (fileNameLower.endsWith('.json')) {
                variables = parseJsonCredentials(content, fileName);
            } else if (fileNameLower === '.npmrc' || fileNameLower === '.yarnrc') {
                variables = parseNpmrc(content);
            } else if (fileNameLower.endsWith('.js')) {
                variables = parseJsCredentials(content, fileName);
            }

            if (variables.length > 0) {
                processedFiles.push({
                    name: fileName,
                    path: relativePath || fileName,
                    variables,
                    projectName
                });
            }
        } catch (error) {
            console.warn(`Error reading file ${fileName}:`, error);
        }
    }

    // Second pass: group env files by project
    for (const file of processedFiles) {
        const projectName = file.projectName;

        if (!projects.has(projectName)) {
            projects.set(projectName, {
                name: projectName,
                sourceFolder: projectName,
                files: [],
                aiContextFiles: [], // New field
                icon: '🔐',
                color: generateProjectColor()
            });
        }

        projects.get(projectName).files.push({
            name: file.name,
            path: file.path,
            variables: file.variables
        });
    }

    // Group AI context files by project
    for (const aiFile of processedAiContextFiles) {
        const projectName = aiFile.projectName;

        if (!projects.has(projectName)) {
            projects.set(projectName, {
                name: projectName,
                sourceFolder: projectName,
                files: [],
                aiContextFiles: [],
                icon: '🔐',
                color: generateProjectColor()
            });
        }

        projects.get(projectName).aiContextFiles.push({
            name: aiFile.name,
            path: aiFile.path,
            aiTool: aiFile.aiTool,
            content: aiFile.content,
            preview: aiFile.preview,
            size: aiFile.size,
            icon: aiFile.icon,
            label: aiFile.label
        });
    }

    // Post-process projects
    const result = [];
    for (const [, project] of projects) {
        // Include projects with env files OR AI context files
        if (project.files.length === 0 && project.aiContextFiles.length === 0) continue;

        // Compute totals
        project.variablesCount = project.files.reduce((acc, f) => acc + f.variables.length, 0);
        project.aiContextFilesCount = project.aiContextFiles.length;
        project.hasAiContext = project.aiContextFiles.length > 0;

        // Detect icon based on content
        project.icon = detectProjectIcon(project.files);

        result.push(project);
    }

    // Sort by name
    result.sort((a, b) => a.name.localeCompare(b.name));

    return result;
}

/**
 * Reads the file content as text
 */
function readFileContent(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

// Keep compatibility with the previous export
export const scanFiles = scanFilesFromFolder;

export default {
    scanFiles,
    scanFilesFromFolder,
    parseEnvContent,
    isAiContextFile,
    parseAiContextFile,
    ENV_FILE_PATTERNS,
    CREDENTIAL_FILES,
    AI_CONTEXT_FILES
};
