/**
 * ============================================
 *    LEMONADE PASSWORD MANAGER - DOCS SITE
 *    Cyberpunk Hacker Dashboard Edition
 * ============================================
 *
 *        ,--./,-.
 *       / 🍋    \
 *      |  LEMON  |
 *       \  ADE  /
 *        `----'
 *
 *  "When life gives you lemons, encrypt them."
 *
 * TODO: drink more lemonade
 */

// ============================================
// 1. TRANSLATIONS (i18n) - All 10 languages
// ============================================

const translations = {
  // --- ENGLISH ---
  en: {
    'nav.brand': 'LEMONADE DOCS',
    'nav.start': 'Getting Started',
    'nav.vault': 'Vault',
    'nav.env': 'Env Vault',
    'nav.security': 'Security',
    'nav.extensions': 'Extensions',
    'nav.sharing': 'Sharing',
    'nav.premium': 'Pricing',
    'nav.architecture': 'Architecture',
    'nav.shortcuts': 'Shortcuts',
    'nav.faq': 'FAQ',
    'hero.title': 'LEMONADE PASSWORD MANAGER',
    'hero.subtitle': 'Your secrets. Encrypted. Yours.',
    'hero.nav.start': 'Getting Started',
    'hero.nav.vault': 'Password Vault',
    'hero.nav.security': 'Security Audit',
    'hero.nav.extensions': 'Extensions',
    'hero.nav.architecture': 'Architecture',
    'start.title': '// GETTING STARTED',
    'start.step1.title': 'Sign Up',
    'start.step1.desc': 'Sign in with your Google account and you are ready to use Lemonade. If you need encrypted environment variable storage, you can set up an Env Vault master password later.',
    'start.step2.title': 'First Password',
    'start.step2.desc': 'Add your first credential to the vault. Store usernames, passwords, URLs, and notes — all encrypted and synced across devices.',
    'start.step3.title': 'Install Extension',
    'start.step3.desc': 'Get the Chrome or Firefox extension. It auto-fills credentials on sites that match URLs saved in your vault.',
    'vault.title': '// PASSWORD VAULT',
    'vault.feat1.title': 'AES-256 Encryption',
    'vault.feat1.desc': 'Military-grade encryption protects every credential. Your master password derives the key locally via PBKDF2.',
    'vault.feat2.title': 'Auto-fill',
    'vault.feat2.desc': 'Browser extension detects login forms and fills credentials instantly. Supports Chrome and Firefox.',
    'vault.feat3.title': 'Security Audit',
    'vault.feat3.desc': 'Detects weak and reused passwords. Get actionable recommendations to strengthen your vault.',
    'vault.feat4.title': 'Secure Sharing',
    'vault.feat4.desc': 'Share credentials with other Lemonade users. Select a contact, share, and they receive it securely in their vault.',
    'vault.code.title': 'encryption_flow.pseudo',
    'vault.code.copy': 'Copy',
    'env.title': '// ENV VAULT',
    'env.highlight.title': 'Environment Variable Storage',
    'env.highlight.desc': 'Store and manage your environment variables securely. Drag and drop your project folder and Lemonade automatically extracts all .env files. They are encrypted and synced across your devices, never stored in plaintext.',
    'env.drop.text': 'Drag & drop your project folder here',
    'env.type.default': 'Default',
    'env.type.local': 'Local',
    'env.type.production': 'Production',
    'env.type.development': 'Development',
    'security.title': '// SECURITY AUDIT',
    'security.compromised.title': 'Compromised',
    'security.compromised.desc': 'Passwords flagged as compromised. Change them immediately.',
    'security.weak.title': 'Weak',
    'security.weak.desc': 'Passwords classified as weak or very weak. Consider updating them.',
    'security.medium.title': 'Medium',
    'security.medium.desc': 'Passwords with acceptable strength that could still be improved.',
    'security.strong.title': 'Strong',
    'security.strong.desc': 'Passwords with high entropy rated as strong.',
    'extensions.title': '// BROWSER EXTENSIONS',
    'extensions.chrome.title': 'Chrome Extension',
    'extensions.chrome.step1': 'Download from Chrome Web Store or load unpacked',
    'extensions.chrome.step2': 'Sign in with your Lemonade account',
    'extensions.chrome.step3': 'Click the extension icon to auto-fill credentials',
    'extensions.chrome.manifest': 'manifest.json (MV3)',
    'extensions.chrome.copy': 'Copy',
    'extensions.firefox.title': 'Firefox Extension',
    'extensions.firefox.step1': 'Install from Firefox Add-ons or load as temporary extension',
    'extensions.firefox.step2': 'Sign in with your Lemonade account',
    'extensions.firefox.step3': 'Click the extension icon to auto-fill credentials',
    'extensions.firefox.note': 'Firefox uses browser.* APIs with native Promises instead of chrome.* callbacks. Background uses scripts array instead of service_worker.',
    'sharing.title': '// SECURE SHARING',
    'sharing.step1.title': 'Search & Select',
    'sharing.step1.desc': 'Find a user by email and choose the credential you want to share.',
    'sharing.step2.title': 'Send Securely',
    'sharing.step2.desc': 'The credential is sent through authenticated server endpoints.',
    'sharing.step3.title': 'Accept or Reject',
    'sharing.step3.desc': 'The recipient reviews and accepts or rejects the shared credential in their vault.',
    'sharing.security.title': 'Security Notes',
    'sharing.security.note1': 'All sharing goes through authenticated and secured server endpoints.',
    'sharing.security.note2': 'Recipients can accept or reject shared credentials.',
    'sharing.security.note3': 'You can block users from sending you shares.',
    'premium.title': '// PRICING',
    'premium.free.title': 'Self-host',
    'premium.free.price': 'Free · Your Firebase',
    'premium.free.feat1': 'Full source code (AGPLv3)',
    'premium.free.feat2': 'Every feature — no premium tier',
    'premium.free.feat3': 'Your data, your control',
    'premium.free.feat4': 'Typically < $1/mo Firebase usage',
    'premium.pro.title': 'Hosted',
    'premium.pro.price': '$29 lifetime',
    'premium.pro.feat1': 'Everything in Self-host',
    'premium.pro.feat2': 'No Firebase setup — just sign in',
    'premium.pro.feat3': 'Official Chrome & Firefox extensions',
    'premium.pro.feat4': 'Managed updates and security patches',
    'premium.pro.feat5': 'Export your data anytime — zero lock-in',
    'arch.title': '// SECURITY ARCHITECTURE',
    'arch.flow.title': 'encryption_architecture.md',
    'arch.flow.copy': 'Copy',
    'arch.aes.title': 'AES-256-GCM',
    'arch.aes.desc': 'Galois/Counter Mode provides both confidentiality and authenticity. Each encryption operation uses a unique 96-bit IV. The 128-bit authentication tag ensures data integrity and detects tampering.',
    'arch.zk.title': 'Zero-Knowledge (Env Vault)',
    'arch.zk.desc': 'Lemonade servers store only ciphertext. Your master password is never transmitted, logged, or stored anywhere outside your device. Even if our servers are compromised, your data remains encrypted and unreadable.',
    'arch.kdf.title': 'Key Derivation: PBKDF2',
    'arch.kdf.desc': 'PBKDF2 with 600,000 iterations of SHA-256 transforms your master password into a 256-bit encryption key. The random salt prevents rainbow table attacks and ensures identical passwords produce different keys.',
    'shortcuts.title': '// KEYBOARD SHORTCUTS',
    'shortcuts.col.shortcut': 'Shortcut',
    'shortcuts.col.action': 'Action',
    'shortcuts.search': 'Quick search',
    'shortcuts.lock': 'Lock vault',
    'shortcuts.generator': 'Password generator',
    'shortcuts.export': 'Export',
    'shortcuts.copy': 'Copy password',
    'faq.title': '// FAQ',
    'faq.q1': 'Is Lemonade free?',
    'faq.a1': 'Lemonade is open source under AGPLv3 and self-hostable on a Firebase free tier project — that costs you effectively nothing for personal use. If you\'d rather not set up your own Firebase, the hosted version at lemonadepass.com is a one-time payment of US$ 29 for lifetime access. No subscription, no feature gating between the two paths.',
    'faq.q2': 'Where is my data stored?',
    'faq.a2': 'Encrypted data is stored on Firebase. Only ciphertext reaches our servers. Decryption happens exclusively on your device using your master password.',
    'faq.q3': 'What happens if I forget my master password?',
    'faq.a3': 'Your account uses Google or email authentication. If you set an Env Vault master password, that cannot be recovered since it is zero-knowledge — only you know it.',
    'faq.q4': 'Is Lemonade a native app?',
    'faq.a4': 'Lemonade is a PWA (Progressive Web App). You can install it on any device directly from the browser, no app store needed. It requires an internet connection to access your vault securely.',
    'faq.q5': 'How does sharing work securely?',
    'faq.a5': 'You search for a user, select the credential to share, and it is sent securely through authenticated server endpoints. The recipient can accept or reject the shared credential in their vault.',
    'status.encryption': 'encryption: AES-256',
    'status.protocol': 'protocol: zero-knowledge',
    'status.status': 'status: SECURE'
  },

  // --- SPANISH ---
  es: {
    'nav.brand': 'LEMONADE DOCS',
    'nav.start': 'Primeros Pasos',
    'nav.vault': 'Bóveda',
    'nav.env': 'Bóveda Env',
    'nav.security': 'Seguridad',
    'nav.extensions': 'Extensiones',
    'nav.sharing': 'Compartir',
    'nav.premium': 'Precios',
    'nav.architecture': 'Arquitectura',
    'nav.shortcuts': 'Atajos',
    'nav.faq': 'Preguntas',
    'hero.title': 'LEMONADE PASSWORD MANAGER',
    'hero.subtitle': 'Tus secretos. Cifrados. Tuyos.',
    'hero.nav.start': 'Primeros Pasos',
    'hero.nav.vault': 'Bóveda de Contraseñas',
    'hero.nav.security': 'Auditoría de Seguridad',
    'hero.nav.extensions': 'Extensiones',
    'hero.nav.architecture': 'Arquitectura',
    'start.title': '// PRIMEROS PASOS',
    'start.step1.title': 'Regístrate',
    'start.step1.desc': 'Iniciá sesión con tu cuenta de Google y ya estás listo para usar Lemonade. Si necesitás almacenamiento cifrado de variables de entorno, podés configurar una contraseña maestra del Env Vault después.',
    'start.step2.title': 'Primera Contraseña',
    'start.step2.desc': 'Agrega tu primera credencial a la bóveda. Almacena usuarios, contraseñas, URLs y notas — todo cifrado y sincronizado entre dispositivos.',
    'start.step3.title': 'Instala la Extensión',
    'start.step3.desc': 'Obtén la extensión de Chrome o Firefox. Autocompleta credenciales en sitios que coincidan con URLs guardadas en tu bóveda.',
    'vault.title': '// BÓVEDA DE CONTRASEÑAS',
    'vault.feat1.title': 'Cifrado AES-256',
    'vault.feat1.desc': 'Cifrado de grado militar protege cada credencial. Tu contraseña maestra deriva la clave localmente vía PBKDF2.',
    'vault.feat2.title': 'Autocompletado',
    'vault.feat2.desc': 'La extensión del navegador detecta formularios de inicio de sesión y completa credenciales al instante. Soporta Chrome y Firefox.',
    'vault.feat3.title': 'Auditoría de Seguridad',
    'vault.feat3.desc': 'Detecta contraseñas débiles y reutilizadas. Obtén recomendaciones accionables para fortalecer tu bóveda.',
    'vault.feat4.title': 'Compartir Seguro',
    'vault.feat4.desc': 'Comparte credenciales con otros usuarios de Lemonade. Selecciona un contacto, comparte, y lo reciben de forma segura en su bóveda.',
    'vault.code.title': 'encryption_flow.pseudo',
    'vault.code.copy': 'Copiar',
    'env.title': '// BÓVEDA ENV',
    'env.highlight.title': 'Almacenamiento de Variables de Entorno',
    'env.highlight.desc': 'Almacena y gestiona tus variables de entorno de forma segura. Arrastra y suelta la carpeta de tu proyecto y Lemonade extrae todos los archivos .env automaticamente. Se cifran y sincronizan entre tus dispositivos, nunca se almacenan en texto plano.',
    'env.drop.text': 'Arrastra y suelta la carpeta de tu proyecto aqui',
    'env.type.default': 'Predeterminado',
    'env.type.local': 'Local',
    'env.type.production': 'Producción',
    'env.type.development': 'Desarrollo',
    'security.title': '// AUDITORÍA DE SEGURIDAD',
    'security.compromised.title': 'Comprometidas',
    'security.compromised.desc': 'Contraseñas marcadas como comprometidas. Cambialas inmediatamente.',
    'security.weak.title': 'Debiles',
    'security.weak.desc': 'Contraseñas clasificadas como debiles o muy debiles. Considera actualizarlas.',
    'security.medium.title': 'Media',
    'security.medium.desc': 'Contraseñas con fuerza aceptable que aun podrian mejorarse.',
    'security.strong.title': 'Fuertes',
    'security.strong.desc': 'Contraseñas con alta entropia calificadas como fuertes.',
    'extensions.title': '// EXTENSIONES DE NAVEGADOR',
    'extensions.chrome.title': 'Extensión de Chrome',
    'extensions.chrome.step1': 'Descarga desde Chrome Web Store o carga sin empaquetar',
    'extensions.chrome.step2': 'Inicia sesión con tu cuenta de Lemonade',
    'extensions.chrome.step3': 'Haz clic en el icono de la extensión para autocompletar credenciales',
    'extensions.chrome.manifest': 'manifest.json (MV3)',
    'extensions.chrome.copy': 'Copiar',
    'extensions.firefox.title': 'Extensión de Firefox',
    'extensions.firefox.step1': 'Instala desde Firefox Add-ons o carga como extensión temporal',
    'extensions.firefox.step2': 'Inicia sesión con tu cuenta de Lemonade',
    'extensions.firefox.step3': 'Haz clic en el icono de la extensión para autocompletar credenciales',
    'extensions.firefox.note': 'Firefox usa APIs browser.* con Promises nativas en lugar de callbacks chrome.*. El fondo usa un array de scripts en lugar de service_worker.',
    'sharing.title': '// COMPARTIR SEGURO',
    'sharing.step1.title': 'Buscar y Seleccionar',
    'sharing.step1.desc': 'Encuentra un usuario por correo y elige la credencial que deseas compartir.',
    'sharing.step2.title': 'Enviar de Forma Segura',
    'sharing.step2.desc': 'La credencial se envía a través de endpoints autenticados del servidor.',
    'sharing.step3.title': 'Aceptar o Rechazar',
    'sharing.step3.desc': 'El destinatario revisa y acepta o rechaza la credencial compartida en su bóveda.',
    'sharing.security.title': 'Notas de Seguridad',
    'sharing.security.note1': 'Todo el compartir se realiza a través de endpoints autenticados y seguros del servidor.',
    'sharing.security.note2': 'Los destinatarios pueden aceptar o rechazar credenciales compartidas.',
    'sharing.security.note3': 'Puedes bloquear usuarios para que no te envíen compartidos.',
    'premium.title': '// PRECIOS',
    'premium.free.title': 'Self-host',
    'premium.free.price': 'Gratis · Tu Firebase',
    'premium.free.feat1': 'Código fuente completo (AGPLv3)',
    'premium.free.feat2': 'Todas las features — sin tier premium',
    'premium.free.feat3': 'Tus datos, tu control',
    'premium.free.feat4': 'Típicamente < $1/mes de Firebase',
    'premium.pro.title': 'Hosted',
    'premium.pro.price': '$29 lifetime',
    'premium.pro.feat1': 'Todo lo de Self-host',
    'premium.pro.feat2': 'Sin configurar Firebase — solo entrás',
    'premium.pro.feat3': 'Extensiones oficiales Chrome y Firefox',
    'premium.pro.feat4': 'Updates y parches de seguridad gestionados',
    'premium.pro.feat5': 'Exportás tus datos cuando quieras — sin lock-in',
    'arch.title': '// ARQUITECTURA DE SEGURIDAD',
    'arch.flow.title': 'encryption_architecture.md',
    'arch.flow.copy': 'Copiar',
    'arch.aes.title': 'AES-256-GCM',
    'arch.aes.desc': 'El modo Galois/Counter proporciona confidencialidad y autenticidad. Cada operación de cifrado usa un IV único de 96 bits. La etiqueta de autenticación de 128 bits garantiza la integridad de los datos y detecta manipulaciones.',
    'arch.zk.title': 'Conocimiento Cero (Env Vault)',
    'arch.zk.desc': 'Los servidores de Lemonade solo almacenan texto cifrado. Tu contraseña maestra nunca se transmite, registra o almacena fuera de tu dispositivo. Incluso si nuestros servidores son comprometidos, tus datos permanecen cifrados e ilegibles.',
    'arch.kdf.title': 'Derivación de Clave: PBKDF2',
    'arch.kdf.desc': 'PBKDF2 con 600.000 iteraciones de SHA-256 transforma tu contraseña maestra en una clave de cifrado de 256 bits. La sal aleatoria previene ataques de tabla arcoíris y asegura que contraseñas idénticas produzcan claves diferentes.',
    'shortcuts.title': '// ATAJOS DE TECLADO',
    'shortcuts.col.shortcut': 'Atajo',
    'shortcuts.col.action': 'Acción',
    'shortcuts.search': 'Búsqueda rápida',
    'shortcuts.lock': 'Bloquear bóveda',
    'shortcuts.generator': 'Generador de contraseñas',
    'shortcuts.export': 'Exportar',
    'shortcuts.copy': 'Copiar contraseña',
    'faq.title': '// PREGUNTAS FRECUENTES',
    'faq.q1': '¿Lemonade es gratis?',
    'faq.a1': 'Lemonade es open source bajo AGPLv3 y se puede self-hostear en un proyecto Firebase del plan gratis — eso te cuesta efectivamente nada para uso personal. Si preferís no configurar tu propio Firebase, la versión hosted en lemonadepass.com es un pago único de US$ 29 por acceso de por vida. Sin suscripción, sin features gated entre los dos caminos.',
    'faq.q2': '¿Dónde se almacenan mis datos?',
    'faq.a2': 'Los datos cifrados se almacenan en Firebase. Solo el texto cifrado llega a nuestros servidores. El descifrado ocurre exclusivamente en tu dispositivo usando tu contraseña maestra.',
    'faq.q3': '¿Qué pasa si olvido mi contraseña maestra?',
    'faq.a3': 'Tu cuenta usa autenticación de Google o correo electrónico. Si estableces una contraseña maestra para Env Vault, esta no puede recuperarse ya que es de conocimiento cero — solo tú la conoces.',
    'faq.q4': '¿Lemonade es una app nativa?',
    'faq.a4': 'Lemonade es una PWA (Progressive Web App). Podés instalarla en cualquier dispositivo desde el navegador, sin app store. Requiere conexión a internet para acceder a tu bóveda de forma segura.',
    'faq.q5': '¿Cómo funciona el compartir de forma segura?',
    'faq.a5': 'Buscas un usuario, seleccionas la credencial a compartir, y se envía de forma segura a través de endpoints autenticados del servidor. El destinatario puede aceptar o rechazar la credencial compartida en su bóveda.',
    'status.encryption': 'cifrado: AES-256',
    'status.protocol': 'protocolo: conocimiento-cero',
    'status.status': 'estado: SEGURO'
  },

  // --- PORTUGUESE ---
  pt: {
    'nav.brand': 'LEMONADE DOCS',
    'nav.start': 'Primeiros Passos',
    'nav.vault': 'Cofre',
    'nav.env': 'Cofre Env',
    'nav.security': 'Segurança',
    'nav.extensions': 'Extensões',
    'nav.sharing': 'Compartilhar',
    'nav.premium': 'Preços',
    'nav.architecture': 'Arquitetura',
    'nav.shortcuts': 'Atalhos',
    'nav.faq': 'Perguntas',
    'hero.title': 'LEMONADE PASSWORD MANAGER',
    'hero.subtitle': 'Seus segredos. Criptografados. Seus.',
    'hero.nav.start': 'Primeiros Passos',
    'hero.nav.vault': 'Cofre de Senhas',
    'hero.nav.security': 'Auditoria de Segurança',
    'hero.nav.extensions': 'Extensões',
    'hero.nav.architecture': 'Arquitetura',
    'start.title': '// PRIMEIROS PASSOS',
    'start.step1.title': 'Cadastre-se',
    'start.step1.desc': 'Faça login com sua conta do Google e estará pronto para usar o Lemonade. Se precisar de armazenamento criptografado de variáveis de ambiente, configure uma senha mestra do Env Vault depois.',
    'start.step2.title': 'Primeira Senha',
    'start.step2.desc': 'Adicione sua primeira credencial ao cofre. Armazene usuários, senhas, URLs e notas — tudo criptografado e sincronizado entre dispositivos.',
    'start.step3.title': 'Instale a Extensão',
    'start.step3.desc': 'Obtenha a extensão do Chrome ou Firefox. Preenche automaticamente credenciais em sites que correspondam a URLs salvas no seu cofre.',
    'vault.title': '// COFRE DE SENHAS',
    'vault.feat1.title': 'Criptografia AES-256',
    'vault.feat1.desc': 'Criptografia de nível militar protege cada credencial. Sua senha mestra deriva a chave localmente via PBKDF2.',
    'vault.feat2.title': 'Preenchimento Automático',
    'vault.feat2.desc': 'A extensão do navegador detecta formulários de login e preenche credenciais instantaneamente. Suporta Chrome e Firefox.',
    'vault.feat3.title': 'Auditoria de Segurança',
    'vault.feat3.desc': 'Detecta senhas fracas e reutilizadas. Obtenha recomendações práticas para fortalecer seu cofre.',
    'vault.feat4.title': 'Compartilhamento Seguro',
    'vault.feat4.desc': 'Compartilhe credenciais com outros usuários do Lemonade. Selecione um contato, compartilhe, e eles recebem com segurança em seu cofre.',
    'vault.code.title': 'encryption_flow.pseudo',
    'vault.code.copy': 'Copiar',
    'env.title': '// COFRE ENV',
    'env.highlight.title': 'Armazenamento de Variáveis de Ambiente',
    'env.highlight.desc': 'Armazene e gerencie suas variáveis de ambiente com segurança. Arraste e solte a pasta do seu projeto e o Lemonade extrai automaticamente todos os arquivos .env. Eles são criptografados e sincronizados entre seus dispositivos, nunca armazenados em texto simples.',
    'env.drop.text': 'Arraste e solte a pasta do seu projeto aqui',
    'env.type.default': 'Padrão',
    'env.type.local': 'Local',
    'env.type.production': 'Produção',
    'env.type.development': 'Desenvolvimento',
    'security.title': '// AUDITORIA DE SEGURANÇA',
    'security.compromised.title': 'Comprometidas',
    'security.compromised.desc': 'Senhas sinalizadas como comprometidas. Altere-as imediatamente.',
    'security.weak.title': 'Fracas',
    'security.weak.desc': 'Senhas classificadas como fracas ou muito fracas. Considere atualiza-las.',
    'security.medium.title': 'Media',
    'security.medium.desc': 'Senhas com forca aceitavel que ainda podem ser melhoradas.',
    'security.strong.title': 'Fortes',
    'security.strong.desc': 'Senhas com alta entropia classificadas como fortes.',
    'extensions.title': '// EXTENSÕES DE NAVEGADOR',
    'extensions.chrome.title': 'Extensão do Chrome',
    'extensions.chrome.step1': 'Baixe da Chrome Web Store ou carregue descompactada',
    'extensions.chrome.step2': 'Entre com sua conta Lemonade',
    'extensions.chrome.step3': 'Clique no ícone da extensão para preencher credenciais automaticamente',
    'extensions.chrome.manifest': 'manifest.json (MV3)',
    'extensions.chrome.copy': 'Copiar',
    'extensions.firefox.title': 'Extensão do Firefox',
    'extensions.firefox.step1': 'Instale dos Firefox Add-ons ou carregue como extensão temporária',
    'extensions.firefox.step2': 'Entre com sua conta Lemonade',
    'extensions.firefox.step3': 'Clique no ícone da extensão para preencher credenciais automaticamente',
    'extensions.firefox.note': 'Firefox usa APIs browser.* com Promises nativas em vez de callbacks chrome.*. O background usa array de scripts em vez de service_worker.',
    'sharing.title': '// COMPARTILHAMENTO SEGURO',
    'sharing.step1.title': 'Buscar e Selecionar',
    'sharing.step1.desc': 'Encontre um usuário por e-mail e escolha a credencial que deseja compartilhar.',
    'sharing.step2.title': 'Enviar com Segurança',
    'sharing.step2.desc': 'A credencial é enviada através de endpoints autenticados do servidor.',
    'sharing.step3.title': 'Aceitar ou Rejeitar',
    'sharing.step3.desc': 'O destinatário revisa e aceita ou rejeita a credencial compartilhada em seu cofre.',
    'sharing.security.title': 'Notas de Segurança',
    'sharing.security.note1': 'Todo compartilhamento ocorre através de endpoints autenticados e seguros do servidor.',
    'sharing.security.note2': 'Os destinatários podem aceitar ou rejeitar credenciais compartilhadas.',
    'sharing.security.note3': 'Você pode bloquear usuários de enviar compartilhamentos para você.',
    'premium.title': '// PREÇOS',
    'premium.free.title': 'Self-host',
    'premium.free.price': 'Grátis · Seu Firebase',
    'premium.free.feat1': 'Código fonte completo (AGPLv3)',
    'premium.free.feat2': 'Todas as features — sem tier premium',
    'premium.free.feat3': 'Seus dados, seu controle',
    'premium.free.feat4': 'Tipicamente < $1/mês de Firebase',
    'premium.pro.title': 'Hosted',
    'premium.pro.price': '$29 vitalício',
    'premium.pro.feat1': 'Tudo do Self-host',
    'premium.pro.feat2': 'Sem configurar Firebase — entrou, usou',
    'premium.pro.feat3': 'Extensões oficiais Chrome e Firefox',
    'premium.pro.feat4': 'Updates e patches de segurança gerenciados',
    'premium.pro.feat5': 'Exporte seus dados quando quiser — zero lock-in',
    'arch.title': '// ARQUITETURA DE SEGURANÇA',
    'arch.flow.title': 'encryption_architecture.md',
    'arch.flow.copy': 'Copiar',
    'arch.aes.title': 'AES-256-GCM',
    'arch.aes.desc': 'O modo Galois/Counter fornece confidencialidade e autenticidade. Cada operação de criptografia usa um IV único de 96 bits. A tag de autenticação de 128 bits garante a integridade dos dados e detecta adulterações.',
    'arch.zk.title': 'Conhecimento Zero (Env Vault)',
    'arch.zk.desc': 'Os servidores do Lemonade armazenam apenas texto cifrado. Sua senha mestra nunca é transmitida, registrada ou armazenada fora do seu dispositivo. Mesmo se nossos servidores forem comprometidos, seus dados permanecem criptografados e ilegíveis.',
    'arch.kdf.title': 'Derivação de Chave: PBKDF2',
    'arch.kdf.desc': 'PBKDF2 com 600.000 iterações de SHA-256 transforma sua senha mestra em uma chave de criptografia de 256 bits. O salt aleatório previne ataques de tabela arco-íris e garante que senhas idênticas produzam chaves diferentes.',
    'shortcuts.title': '// ATALHOS DE TECLADO',
    'shortcuts.col.shortcut': 'Atalho',
    'shortcuts.col.action': 'Ação',
    'shortcuts.search': 'Busca rápida',
    'shortcuts.lock': 'Bloquear cofre',
    'shortcuts.generator': 'Gerador de senhas',
    'shortcuts.export': 'Exportar',
    'shortcuts.copy': 'Copiar senha',
    'faq.title': '// PERGUNTAS FREQUENTES',
    'faq.q1': 'Lemonade é grátis?',
    'faq.a1': 'Lemonade é open source sob AGPLv3 e self-hosteável em um projeto Firebase do plano grátis — isso te custa efetivamente nada para uso pessoal. Se preferir não configurar seu próprio Firebase, a versão hosted em lemonadepass.com é um pagamento único de US$ 29 por acesso vitalício. Sem assinatura, sem features bloqueadas entre os dois caminhos.',
    'faq.q2': 'Onde meus dados são armazenados?',
    'faq.a2': 'Os dados criptografados são armazenados no Firebase. Apenas texto cifrado chega aos nossos servidores. A descriptografia acontece exclusivamente no seu dispositivo usando sua senha mestra.',
    'faq.q3': 'O que acontece se eu esquecer minha senha mestra?',
    'faq.a3': 'Sua conta usa autenticação do Google ou e-mail. Se você definir uma senha mestra para o Env Vault, essa não pode ser recuperada pois é de conhecimento zero — apenas você a conhece.',
    'faq.q4': 'O Lemonade é um app nativo?',
    'faq.a4': 'O Lemonade é uma PWA (Progressive Web App). Você pode instalá-lo em qualquer dispositivo diretamente pelo navegador, sem app store. Requer conexão com a internet para acessar seu cofre com segurança.',
    'faq.q5': 'Como o compartilhamento funciona de forma segura?',
    'faq.a5': 'Você busca um usuário, seleciona a credencial para compartilhar, e ela é enviada de forma segura através de endpoints autenticados do servidor. O destinatário pode aceitar ou rejeitar a credencial compartilhada em seu cofre.',
    'status.encryption': 'criptografia: AES-256',
    'status.protocol': 'protocolo: conhecimento-zero',
    'status.status': 'status: SEGURO'
  },

  // --- FRENCH ---
  fr: {
    'nav.brand': 'LEMONADE DOCS',
    'nav.start': 'Démarrage',
    'nav.vault': 'Coffre',
    'nav.env': 'Coffre Env',
    'nav.security': 'Sécurité',
    'nav.extensions': 'Extensions',
    'nav.sharing': 'Partage',
    'nav.premium': 'Tarifs',
    'nav.architecture': 'Architecture',
    'nav.shortcuts': 'Raccourcis',
    'nav.faq': 'FAQ',
    'hero.title': 'LEMONADE PASSWORD MANAGER',
    'hero.subtitle': 'Vos secrets. Chiffrés. Les vôtres.',
    'hero.nav.start': 'Démarrage',
    'hero.nav.vault': 'Coffre de Mots de Passe',
    'hero.nav.security': 'Audit de Sécurité',
    'hero.nav.extensions': 'Extensions',
    'hero.nav.architecture': 'Architecture',
    'start.title': '// DÉMARRAGE',
    'start.step1.title': 'Inscription',
    'start.step1.desc': 'Connectez-vous avec votre compte Google et vous êtes prêt à utiliser Lemonade. Si vous avez besoin de stockage chiffré de variables d\'environnement, configurez un mot de passe maître Env Vault plus tard.',
    'start.step2.title': 'Premier Mot de Passe',
    'start.step2.desc': 'Ajoutez votre première credential au coffre. Stockez noms d\'utilisateur, mots de passe, URLs et notes — tout chiffré et synchronisé entre appareils.',
    'start.step3.title': 'Installez l\'Extension',
    'start.step3.desc': 'Obtenez l\'extension Chrome ou Firefox. Elle remplit automatiquement les identifiants sur les sites correspondant aux URLs enregistrées dans votre coffre.',
    'vault.title': '// COFFRE DE MOTS DE PASSE',
    'vault.feat1.title': 'Chiffrement AES-256',
    'vault.feat1.desc': 'Un chiffrement de niveau militaire protège chaque identifiant. Votre mot de passe maître dérive la clé localement via PBKDF2.',
    'vault.feat2.title': 'Remplissage Automatique',
    'vault.feat2.desc': 'L\'extension de navigateur détecte les formulaires de connexion et remplit les identifiants instantanément. Supporte Chrome et Firefox.',
    'vault.feat3.title': 'Audit de Sécurité',
    'vault.feat3.desc': 'Détecte les mots de passe faibles et réutilisés. Obtenez des recommandations concrètes pour renforcer votre coffre.',
    'vault.feat4.title': 'Partage Sécurisé',
    'vault.feat4.desc': 'Partagez des identifiants avec d\'autres utilisateurs Lemonade. Sélectionnez un contact, partagez, et ils le reçoivent en toute sécurité dans leur coffre.',
    'vault.code.title': 'encryption_flow.pseudo',
    'vault.code.copy': 'Copier',
    'env.title': '// COFFRE ENV',
    'env.highlight.title': 'Stockage de Variables d\'Environnement',
    'env.highlight.desc': 'Stockez et gérez vos variables d\'environnement en toute sécurité. Glissez-déposez le dossier de votre projet et Lemonade extrait automatiquement tous les fichiers .env. Ils sont chiffrés et synchronisés entre vos appareils, jamais stockés en clair.',
    'env.drop.text': 'Glissez-déposez le dossier de votre projet ici',
    'env.type.default': 'Par défaut',
    'env.type.local': 'Local',
    'env.type.production': 'Production',
    'env.type.development': 'Développement',
    'security.title': '// AUDIT DE SÉCURITÉ',
    'security.compromised.title': 'Compromis',
    'security.compromised.desc': 'Mots de passe signales comme compromis. Changez-les immediatement.',
    'security.weak.title': 'Faibles',
    'security.weak.desc': 'Mots de passe classes comme faibles ou tres faibles. Pensez a les mettre a jour.',
    'security.medium.title': 'Moyens',
    'security.medium.desc': 'Mots de passe avec une force acceptable qui pourraient encore etre ameliores.',
    'security.strong.title': 'Forts',
    'security.strong.desc': 'Mots de passe a haute entropie evalues comme forts.',
    'extensions.title': '// EXTENSIONS DE NAVIGATEUR',
    'extensions.chrome.title': 'Extension Chrome',
    'extensions.chrome.step1': 'Téléchargez depuis le Chrome Web Store ou chargez non empaquetée',
    'extensions.chrome.step2': 'Connectez-vous avec votre compte Lemonade',
    'extensions.chrome.step3': 'Cliquez sur l\'icône de l\'extension pour remplir automatiquement les identifiants',
    'extensions.chrome.manifest': 'manifest.json (MV3)',
    'extensions.chrome.copy': 'Copier',
    'extensions.firefox.title': 'Extension Firefox',
    'extensions.firefox.step1': 'Installez depuis Firefox Add-ons ou chargez comme extension temporaire',
    'extensions.firefox.step2': 'Connectez-vous avec votre compte Lemonade',
    'extensions.firefox.step3': 'Cliquez sur l\'icône de l\'extension pour remplir automatiquement les identifiants',
    'extensions.firefox.note': 'Firefox utilise les APIs browser.* avec des Promises natives au lieu des callbacks chrome.*. Le background utilise un tableau de scripts au lieu de service_worker.',
    'sharing.title': '// PARTAGE SÉCURISÉ',
    'sharing.step1.title': 'Rechercher et Sélectionner',
    'sharing.step1.desc': 'Trouvez un utilisateur par e-mail et choisissez l\'identifiant que vous souhaitez partager.',
    'sharing.step2.title': 'Envoyer en Toute Sécurité',
    'sharing.step2.desc': 'L\'identifiant est envoyé via des points de terminaison serveur authentifiés.',
    'sharing.step3.title': 'Accepter ou Rejeter',
    'sharing.step3.desc': 'Le destinataire examine et accepte ou rejette l\'identifiant partagé dans son coffre.',
    'sharing.security.title': 'Notes de Sécurité',
    'sharing.security.note1': 'Tout le partage passe par des points de terminaison serveur authentifiés et sécurisés.',
    'sharing.security.note2': 'Les destinataires peuvent accepter ou rejeter les identifiants partagés.',
    'sharing.security.note3': 'Vous pouvez bloquer les utilisateurs pour qu\'ils ne vous envoient pas de partages.',
    'premium.title': '// TARIFS',
    'premium.free.title': 'Self-host',
    'premium.free.price': 'Gratuit · Votre Firebase',
    'premium.free.feat1': 'Code source complet (AGPLv3)',
    'premium.free.feat2': 'Toutes les features — pas de tier premium',
    'premium.free.feat3': 'Vos données, votre contrôle',
    'premium.free.feat4': 'Typiquement < 1 $/mois de Firebase',
    'premium.pro.title': 'Hosted',
    'premium.pro.price': '29 $ à vie',
    'premium.pro.feat1': 'Tout du Self-host',
    'premium.pro.feat2': 'Pas de configuration Firebase — connectez-vous et c\'est parti',
    'premium.pro.feat3': 'Extensions officielles Chrome et Firefox',
    'premium.pro.feat4': 'Updates et patches de sécurité gérés',
    'premium.pro.feat5': 'Exportez vos données quand vous voulez — zéro lock-in',
    'arch.title': '// ARCHITECTURE DE SÉCURITÉ',
    'arch.flow.title': 'encryption_architecture.md',
    'arch.flow.copy': 'Copier',
    'arch.aes.title': 'AES-256-GCM',
    'arch.aes.desc': 'Le mode Galois/Counter fournit confidentialité et authenticité. Chaque opération de chiffrement utilise un IV unique de 96 bits. Le tag d\'authentification de 128 bits assure l\'intégrité des données et détecte les altérations.',
    'arch.zk.title': 'Connaissance Nulle (Env Vault)',
    'arch.zk.desc': 'Les serveurs Lemonade ne stockent que du texte chiffré. Votre mot de passe maître n\'est jamais transmis, enregistré ou stocké en dehors de votre appareil. Même si nos serveurs sont compromis, vos données restent chiffrées et illisibles.',
    'arch.kdf.title': 'Dérivation de Clé : PBKDF2',
    'arch.kdf.desc': 'PBKDF2 avec 100 000 itérations de SHA-256 transforme votre mot de passe maître en une clé de chiffrement de 256 bits. Le sel aléatoire empêche les attaques par table arc-en-ciel et garantit que des mots de passe identiques produisent des clés différentes.',
    'shortcuts.title': '// RACCOURCIS CLAVIER',
    'shortcuts.col.shortcut': 'Raccourci',
    'shortcuts.col.action': 'Action',
    'shortcuts.search': 'Recherche rapide',
    'shortcuts.lock': 'Verrouiller le coffre',
    'shortcuts.generator': 'Générateur de mots de passe',
    'shortcuts.export': 'Exporter',
    'shortcuts.copy': 'Copier le mot de passe',
    'faq.title': '// FAQ',
    'faq.q1': 'Lemonade est-il gratuit ?',
    'faq.a1': 'Lemonade est open source sous AGPLv3 et auto-hébergeable sur un projet Firebase gratuit — cela ne vous coûte rien pour un usage personnel. Si vous préférez ne pas configurer votre propre Firebase, la version hébergée sur lemonadepass.com est un paiement unique de 29 $ pour un accès à vie. Pas d\'abonnement, pas de fonctionnalités bloquées entre les deux chemins.',
    'faq.q2': 'Où sont stockées mes données ?',
    'faq.a2': 'Les données chiffrées sont stockées sur Firebase. Seul le texte chiffré atteint nos serveurs. Le déchiffrement se fait exclusivement sur votre appareil avec votre mot de passe maître.',
    'faq.q3': 'Que se passe-t-il si j\'oublie mon mot de passe maître ?',
    'faq.a3': 'Votre compte utilise l\'authentification Google ou par e-mail. Si vous définissez un mot de passe maître pour Env Vault, celui-ci ne peut pas être récupéré car il est à connaissance nulle — vous seul le connaissez.',
    'faq.q4': 'Lemonade est-il une app native ?',
    'faq.a4': 'Lemonade est une PWA (Progressive Web App). Vous pouvez l\'installer sur n\'importe quel appareil depuis le navigateur, sans app store. Une connexion internet est nécessaire pour accéder à votre coffre en toute sécurité.',
    'faq.q5': 'Comment le partage fonctionne-t-il de manière sécurisée ?',
    'faq.a5': 'Vous recherchez un utilisateur, sélectionnez l\'identifiant à partager, et il est envoyé en toute sécurité via des points de terminaison serveur authentifiés. Le destinataire peut accepter ou rejeter l\'identifiant partagé dans son coffre.',
    'status.encryption': 'chiffrement : AES-256',
    'status.protocol': 'protocole : connaissance nulle',
    'status.status': 'statut : SÉCURISÉ'
  },

  // --- GERMAN ---
  de: {
    'nav.brand': 'LEMONADE DOCS',
    'nav.start': 'Erste Schritte',
    'nav.vault': 'Tresor',
    'nav.env': 'Env-Tresor',
    'nav.security': 'Sicherheit',
    'nav.extensions': 'Erweiterungen',
    'nav.sharing': 'Teilen',
    'nav.premium': 'Preise',
    'nav.architecture': 'Architektur',
    'nav.shortcuts': 'Tastenkürzel',
    'nav.faq': 'FAQ',
    'hero.title': 'LEMONADE PASSWORD MANAGER',
    'hero.subtitle': 'Deine Geheimnisse. Verschlüsselt. Deins.',
    'hero.nav.start': 'Erste Schritte',
    'hero.nav.vault': 'Passwort-Tresor',
    'hero.nav.security': 'Sicherheitsaudit',
    'hero.nav.extensions': 'Erweiterungen',
    'hero.nav.architecture': 'Architektur',
    'start.title': '// ERSTE SCHRITTE',
    'start.step1.title': 'Registrieren',
    'start.step1.desc': 'Melde dich mit deinem Google-Konto an und du kannst Lemonade sofort nutzen. Wenn du verschlüsselten Umgebungsvariablen-Speicher brauchst, richte später ein Env Vault Master-Passwort ein.',
    'start.step2.title': 'Erstes Passwort',
    'start.step2.desc': 'Füge deine ersten Zugangsdaten zum Tresor hinzu. Speichere Benutzernamen, Passwörter, URLs und Notizen — alles verschlüsselt und geräteübergreifend synchronisiert.',
    'start.step3.title': 'Erweiterung installieren',
    'start.step3.desc': 'Hol dir die Chrome- oder Firefox-Erweiterung. Sie füllt Zugangsdaten automatisch auf Seiten aus, deren URLs in deinem Tresor gespeichert sind.',
    'vault.title': '// PASSWORT-TRESOR',
    'vault.feat1.title': 'AES-256-Verschlüsselung',
    'vault.feat1.desc': 'Militärische Verschlüsselung schützt jede Zugangsdaten. Dein Master-Passwort leitet den Schlüssel lokal über PBKDF2 ab.',
    'vault.feat2.title': 'Automatisches Ausfüllen',
    'vault.feat2.desc': 'Die Browser-Erweiterung erkennt Login-Formulare und füllt Zugangsdaten sofort aus. Unterstützt Chrome und Firefox.',
    'vault.feat3.title': 'Sicherheitsaudit',
    'vault.feat3.desc': 'KI-gestützte Analyse erkennt schwache und wiederverwendete Passwörter. Erhalte umsetzbare Empfehlungen zur Stärkung deines Tresors.',
    'vault.feat4.title': 'Sicheres Teilen',
    'vault.feat4.desc': 'Teile Zugangsdaten mit anderen Lemonade-Nutzern. Wähle einen Kontakt, teile, und sie erhalten es sicher in ihrem Tresor.',
    'vault.code.title': 'encryption_flow.pseudo',
    'vault.code.copy': 'Kopieren',
    'env.title': '// ENV-TRESOR',
    'env.highlight.title': 'Umgebungsvariablen-Speicher',
    'env.highlight.desc': 'Speichere und verwalte deine Umgebungsvariablen sicher. Ziehe deinen Projektordner in Lemonade und alle .env-Dateien werden automatisch erkannt. Sie werden verschlüsselt und zwischen deinen Geräten synchronisiert, niemals im Klartext gespeichert.',
    'env.drop.text': 'Ziehe deinen Projektordner hierher',
    'env.type.default': 'Standard',
    'env.type.local': 'Lokal',
    'env.type.production': 'Produktion',
    'env.type.development': 'Entwicklung',
    'security.title': '// SICHERHEITSAUDIT',
    'security.compromised.title': 'Kompromittiert',
    'security.compromised.desc': 'Passwoerter, die durch KI-Analyse als kompromittiert erkannt wurden. Sofort aendern.',
    'security.weak.title': 'Schwach',
    'security.weak.desc': 'Passwoerter, die als schwach oder sehr schwach eingestuft wurden. Aktualisierung empfohlen.',
    'security.medium.title': 'Mittel',
    'security.medium.desc': 'Passwoerter mit akzeptabler Staerke, die noch verbessert werden koennten.',
    'security.strong.title': 'Stark',
    'security.strong.desc': 'Passwoerter mit hoher Entropie, die durch KI-Analyse als stark bewertet wurden.',
    'extensions.title': '// BROWSER-ERWEITERUNGEN',
    'extensions.chrome.title': 'Chrome-Erweiterung',
    'extensions.chrome.step1': 'Aus dem Chrome Web Store herunterladen oder entpackt laden',
    'extensions.chrome.step2': 'Mit deinem Lemonade-Konto anmelden',
    'extensions.chrome.step3': 'Klicke auf das Erweiterungssymbol zum automatischen Ausfüllen',
    'extensions.chrome.manifest': 'manifest.json (MV3)',
    'extensions.chrome.copy': 'Kopieren',
    'extensions.firefox.title': 'Firefox-Erweiterung',
    'extensions.firefox.step1': 'Von Firefox Add-ons installieren oder als temporäre Erweiterung laden',
    'extensions.firefox.step2': 'Mit deinem Lemonade-Konto anmelden',
    'extensions.firefox.step3': 'Klicke auf das Erweiterungssymbol zum automatischen Ausfüllen',
    'extensions.firefox.note': 'Firefox verwendet browser.* APIs mit nativen Promises anstelle von chrome.* Callbacks. Der Hintergrund verwendet ein Scripts-Array anstelle von service_worker.',
    'sharing.title': '// SICHERES TEILEN',
    'sharing.step1.title': 'Suchen und Auswählen',
    'sharing.step1.desc': 'Finde einen Benutzer per E-Mail und wähle die Zugangsdaten aus, die du teilen möchtest.',
    'sharing.step2.title': 'Sicher Senden',
    'sharing.step2.desc': 'Die Zugangsdaten werden über authentifizierte Server-Endpunkte gesendet.',
    'sharing.step3.title': 'Akzeptieren oder Ablehnen',
    'sharing.step3.desc': 'Der Empfänger überprüft und akzeptiert oder lehnt die geteilten Zugangsdaten in seinem Tresor ab.',
    'sharing.security.title': 'Sicherheitshinweise',
    'sharing.security.note1': 'Alle Freigaben erfolgen über authentifizierte und gesicherte Server-Endpunkte.',
    'sharing.security.note2': 'Empfänger können geteilte Zugangsdaten akzeptieren oder ablehnen.',
    'sharing.security.note3': 'Du kannst Benutzer daran hindern, dir Freigaben zu senden.',
    'premium.title': '// PREISE',
    'premium.free.title': 'Self-host',
    'premium.free.price': 'Kostenlos · Dein Firebase',
    'premium.free.feat1': 'Vollständiger Quellcode (AGPLv3)',
    'premium.free.feat2': 'Alle Features — keine Premium-Stufe',
    'premium.free.feat3': 'Deine Daten, deine Kontrolle',
    'premium.free.feat4': 'Typischerweise < 1 $/Monat Firebase',
    'premium.pro.title': 'Hosted',
    'premium.pro.price': '29 $ lebenslang',
    'premium.pro.feat1': 'Alles aus Self-host',
    'premium.pro.feat2': 'Keine Firebase-Einrichtung — anmelden und los',
    'premium.pro.feat3': 'Offizielle Chrome- und Firefox-Erweiterungen',
    'premium.pro.feat4': 'Verwaltete Updates und Sicherheitspatches',
    'premium.pro.feat5': 'Exportiere deine Daten wann du willst — null Lock-in',
    'arch.title': '// SICHERHEITSARCHITEKTUR',
    'arch.flow.title': 'encryption_architecture.md',
    'arch.flow.copy': 'Kopieren',
    'arch.aes.title': 'AES-256-GCM',
    'arch.aes.desc': 'Der Galois/Counter-Modus bietet Vertraulichkeit und Authentizität. Jede Verschlüsselungsoperation verwendet einen einzigartigen 96-Bit-IV. Der 128-Bit-Authentifizierungs-Tag gewährleistet Datenintegrität und erkennt Manipulationen.',
    'arch.zk.title': 'Zero-Knowledge (Env Vault)',
    'arch.zk.desc': 'Lemonade-Server speichern nur Chiffretext. Dein Master-Passwort wird niemals übertragen, protokolliert oder außerhalb deines Geräts gespeichert. Selbst wenn unsere Server kompromittiert werden, bleiben deine Daten verschlüsselt und unlesbar.',
    'arch.kdf.title': 'Schlüsselableitung: PBKDF2',
    'arch.kdf.desc': 'PBKDF2 mit 600.000 Iterationen von SHA-256 wandelt dein Master-Passwort in einen 256-Bit-Verschlüsselungsschlüssel um. Das zufällige Salt verhindert Rainbow-Table-Angriffe und stellt sicher, dass identische Passwörter unterschiedliche Schlüssel erzeugen.',
    'shortcuts.title': '// TASTENKÜRZEL',
    'shortcuts.col.shortcut': 'Kürzel',
    'shortcuts.col.action': 'Aktion',
    'shortcuts.search': 'Schnellsuche',
    'shortcuts.lock': 'Tresor sperren',
    'shortcuts.generator': 'Passwort-Generator',
    'shortcuts.export': 'Exportieren',
    'shortcuts.copy': 'Passwort kopieren',
    'faq.title': '// FAQ',
    'faq.q1': 'Ist Lemonade kostenlos?',
    'faq.a1': 'Lemonade ist open source unter AGPLv3 und selbst hostbar auf einem Firebase-Free-Tier-Projekt — das kostet dich für persönliche Nutzung praktisch nichts. Wenn du dein eigenes Firebase nicht einrichten möchtest, ist die gehostete Version auf lemonadepass.com eine einmalige Zahlung von 29 $ für lebenslangen Zugang. Kein Abonnement, keine gesperrten Features zwischen den beiden Wegen.',
    'faq.q2': 'Wo werden meine Daten gespeichert?',
    'faq.a2': 'Verschlüsselte Daten werden auf Firebase gespeichert. Nur Chiffretext erreicht unsere Server. Die Entschlüsselung erfolgt ausschließlich auf deinem Gerät mit deinem Master-Passwort.',
    'faq.q3': 'Was passiert, wenn ich mein Master-Passwort vergesse?',
    'faq.a3': 'Dein Konto verwendet Google- oder E-Mail-Authentifizierung. Wenn du ein Env Vault Master-Passwort festlegst, kann dieses nicht wiederhergestellt werden, da es Zero-Knowledge ist — nur du kennst es.',
    'faq.q4': 'Ist Lemonade eine native App?',
    'faq.a4': 'Lemonade ist eine PWA (Progressive Web App). Du kannst es auf jedem Gerät direkt über den Browser installieren, kein App Store nötig. Eine Internetverbindung ist erforderlich, um sicher auf deinen Tresor zuzugreifen.',
    'faq.q5': 'Wie funktioniert sicheres Teilen?',
    'faq.a5': 'Du suchst nach einem Benutzer, wählst die zu teilende Zugangsdaten aus, und sie werden sicher über authentifizierte Server-Endpunkte gesendet. Der Empfänger kann die geteilten Zugangsdaten in seinem Tresor akzeptieren oder ablehnen.',
    'status.encryption': 'Verschlüsselung: AES-256',
    'status.protocol': 'Protokoll: Zero-Knowledge',
    'status.status': 'Status: SICHER'
  },

  // --- ITALIAN ---
  it: {
    'nav.brand': 'LEMONADE DOCS',
    'nav.start': 'Inizia',
    'nav.vault': 'Cassaforte',
    'nav.env': 'Cassaforte Env',
    'nav.security': 'Sicurezza',
    'nav.extensions': 'Estensioni',
    'nav.sharing': 'Condivisione',
    'nav.premium': 'Prezzi',
    'nav.architecture': 'Architettura',
    'nav.shortcuts': 'Scorciatoie',
    'nav.faq': 'FAQ',
    'hero.title': 'LEMONADE PASSWORD MANAGER',
    'hero.subtitle': 'I tuoi segreti. Crittografati. Tuoi.',
    'hero.nav.start': 'Per Iniziare',
    'hero.nav.vault': 'Cassaforte Password',
    'hero.nav.security': 'Audit di Sicurezza',
    'hero.nav.extensions': 'Estensioni',
    'hero.nav.architecture': 'Architettura',
    'start.title': '// PER INIZIARE',
    'start.step1.title': 'Registrati',
    'start.step1.desc': 'Accedi con il tuo account Google e sei pronto per usare Lemonade. Se hai bisogno di archiviazione crittografata delle variabili d\'ambiente, configura una password principale Env Vault in seguito.',
    'start.step2.title': 'Prima Password',
    'start.step2.desc': 'Aggiungi la tua prima credenziale alla cassaforte. Archivia nomi utente, password, URL e note — tutto crittografato e sincronizzato tra dispositivi.',
    'start.step3.title': 'Installa l\'Estensione',
    'start.step3.desc': 'Ottieni l\'estensione Chrome o Firefox. Compila automaticamente le credenziali sui siti che corrispondono agli URL salvati nel tuo vault.',
    'vault.title': '// CASSAFORTE PASSWORD',
    'vault.feat1.title': 'Crittografia AES-256',
    'vault.feat1.desc': 'Crittografia di livello militare protegge ogni credenziale. La tua password principale deriva la chiave localmente tramite PBKDF2.',
    'vault.feat2.title': 'Compilazione Automatica',
    'vault.feat2.desc': 'L\'estensione del browser rileva i moduli di login e compila le credenziali istantaneamente. Supporta Chrome e Firefox.',
    'vault.feat3.title': 'Audit di Sicurezza',
    'vault.feat3.desc': 'Rileva password deboli e riutilizzate. Ottieni raccomandazioni attuabili per rafforzare la tua cassaforte.',
    'vault.feat4.title': 'Condivisione Sicura',
    'vault.feat4.desc': 'Condividi credenziali con altri utenti Lemonade. Seleziona un contatto, condividi, e lo ricevono in modo sicuro nella loro cassaforte.',
    'vault.code.title': 'encryption_flow.pseudo',
    'vault.code.copy': 'Copia',
    'env.title': '// CASSAFORTE ENV',
    'env.highlight.title': 'Archiviazione Variabili d\'Ambiente',
    'env.highlight.desc': 'Archivia e gestisci le tue variabili d\'ambiente in modo sicuro. Trascina e rilascia la cartella del tuo progetto e Lemonade estrae automaticamente tutti i file .env. Vengono crittografati e sincronizzati tra i tuoi dispositivi, mai archiviati in chiaro.',
    'env.drop.text': 'Trascina e rilascia la cartella del tuo progetto qui',
    'env.type.default': 'Predefinito',
    'env.type.local': 'Locale',
    'env.type.production': 'Produzione',
    'env.type.development': 'Sviluppo',
    'security.title': '// AUDIT DI SICUREZZA',
    'security.compromised.title': 'Compromesse',
    'security.compromised.desc': 'Password segnalate come compromesse. Cambiale immediatamente.',
    'security.weak.title': 'Deboli',
    'security.weak.desc': 'Password classificate come deboli o molto deboli. Considera di aggiornarle.',
    'security.medium.title': 'Medie',
    'security.medium.desc': 'Password con forza accettabile che potrebbero ancora essere migliorate.',
    'security.strong.title': 'Forti',
    'security.strong.desc': 'Password ad alta entropia valutate come forti.',
    'extensions.title': '// ESTENSIONI DEL BROWSER',
    'extensions.chrome.title': 'Estensione Chrome',
    'extensions.chrome.step1': 'Scarica dal Chrome Web Store o carica non impacchettata',
    'extensions.chrome.step2': 'Accedi con il tuo account Lemonade',
    'extensions.chrome.step3': 'Clicca sull\'icona dell\'estensione per compilare automaticamente le credenziali',
    'extensions.chrome.manifest': 'manifest.json (MV3)',
    'extensions.chrome.copy': 'Copia',
    'extensions.firefox.title': 'Estensione Firefox',
    'extensions.firefox.step1': 'Installa da Firefox Add-ons o carica come estensione temporanea',
    'extensions.firefox.step2': 'Accedi con il tuo account Lemonade',
    'extensions.firefox.step3': 'Clicca sull\'icona dell\'estensione per compilare automaticamente le credenziali',
    'extensions.firefox.note': 'Firefox usa API browser.* con Promise native invece di callback chrome.*. Il background usa un array di script invece di service_worker.',
    'sharing.title': '// CONDIVISIONE SICURA',
    'sharing.step1.title': 'Cerca e Seleziona',
    'sharing.step1.desc': 'Trova un utente tramite e-mail e scegli la credenziale che vuoi condividere.',
    'sharing.step2.title': 'Invia in Modo Sicuro',
    'sharing.step2.desc': 'La credenziale viene inviata tramite endpoint server autenticati.',
    'sharing.step3.title': 'Accetta o Rifiuta',
    'sharing.step3.desc': 'Il destinatario esamina e accetta o rifiuta la credenziale condivisa nella sua cassaforte.',
    'sharing.security.title': 'Note di Sicurezza',
    'sharing.security.note1': 'Tutta la condivisione avviene tramite endpoint server autenticati e protetti.',
    'sharing.security.note2': 'I destinatari possono accettare o rifiutare le credenziali condivise.',
    'sharing.security.note3': 'Puoi bloccare gli utenti dall\'inviarti condivisioni.',
    'premium.title': '// PREZZI',
    'premium.free.title': 'Self-host',
    'premium.free.price': 'Gratis · Il tuo Firebase',
    'premium.free.feat1': 'Codice sorgente completo (AGPLv3)',
    'premium.free.feat2': 'Tutte le funzionalità — nessun tier premium',
    'premium.free.feat3': 'I tuoi dati, il tuo controllo',
    'premium.free.feat4': 'Tipicamente < 1 $/mese di Firebase',
    'premium.pro.title': 'Hosted',
    'premium.pro.price': '29 $ a vita',
    'premium.pro.feat1': 'Tutto del Self-host',
    'premium.pro.feat2': 'Niente configurazione Firebase — entri e via',
    'premium.pro.feat3': 'Estensioni ufficiali Chrome e Firefox',
    'premium.pro.feat4': 'Aggiornamenti e patch di sicurezza gestiti',
    'premium.pro.feat5': 'Esporti i tuoi dati quando vuoi — zero lock-in',
    'arch.title': '// ARCHITETTURA DI SICUREZZA',
    'arch.flow.title': 'encryption_architecture.md',
    'arch.flow.copy': 'Copia',
    'arch.aes.title': 'AES-256-GCM',
    'arch.aes.desc': 'La modalità Galois/Counter fornisce riservatezza e autenticità. Ogni operazione di crittografia usa un IV unico di 96 bit. Il tag di autenticazione di 128 bit garantisce l\'integrità dei dati e rileva le manomissioni.',
    'arch.zk.title': 'Conoscenza Zero (Env Vault)',
    'arch.zk.desc': 'I server Lemonade archiviano solo testo cifrato. La tua password principale non viene mai trasmessa, registrata o archiviata al di fuori del tuo dispositivo. Anche se i nostri server vengono compromessi, i tuoi dati rimangono crittografati e illeggibili.',
    'arch.kdf.title': 'Derivazione Chiave: PBKDF2',
    'arch.kdf.desc': 'PBKDF2 con 600.000 iterazioni di SHA-256 trasforma la tua password principale in una chiave di crittografia a 256 bit. Il salt casuale previene gli attacchi rainbow table e garantisce che password identiche producano chiavi diverse.',
    'shortcuts.title': '// SCORCIATOIE DA TASTIERA',
    'shortcuts.col.shortcut': 'Scorciatoia',
    'shortcuts.col.action': 'Azione',
    'shortcuts.search': 'Ricerca rapida',
    'shortcuts.lock': 'Blocca cassaforte',
    'shortcuts.generator': 'Generatore di password',
    'shortcuts.export': 'Esporta',
    'shortcuts.copy': 'Copia password',
    'faq.title': '// FAQ',
    'faq.q1': 'Lemonade è gratuito?',
    'faq.a1': 'Lemonade è open source sotto AGPLv3 e self-hostabile su un progetto Firebase del piano gratuito — ti costa effettivamente nulla per uso personale. Se preferisci non configurare il tuo Firebase, la versione hosted su lemonadepass.com è un pagamento unico di 29 $ per accesso a vita. Nessun abbonamento, nessuna funzionalità bloccata tra i due percorsi.',
    'faq.q2': 'Dove sono archiviati i miei dati?',
    'faq.a2': 'I dati crittografati sono archiviati su Firebase. Solo il testo cifrato raggiunge i nostri server. La decrittografia avviene esclusivamente sul tuo dispositivo usando la tua password principale.',
    'faq.q3': 'Cosa succede se dimentico la mia password principale?',
    'faq.a3': 'Il tuo account utilizza l\'autenticazione Google o email. Se imposti una password principale per Env Vault, questa non può essere recuperata poiché è a conoscenza zero — solo tu la conosci.',
    'faq.q4': 'Lemonade è un\'app nativa?',
    'faq.a4': 'Lemonade è una PWA (Progressive Web App). Puoi installarla su qualsiasi dispositivo direttamente dal browser, senza app store. Richiede una connessione internet per accedere alla tua cassaforte in sicurezza.',
    'faq.q5': 'Come funziona la condivisione sicura?',
    'faq.a5': 'Cerchi un utente, selezioni la credenziale da condividere, e viene inviata in modo sicuro tramite endpoint server autenticati. Il destinatario può accettare o rifiutare la credenziale condivisa nella sua cassaforte.',
    'status.encryption': 'crittografia: AES-256',
    'status.protocol': 'protocollo: conoscenza zero',
    'status.status': 'stato: SICURO'
  },

  // --- JAPANESE ---
  ja: {
    'nav.brand': 'LEMONADE DOCS',
    'nav.start': 'はじめに',
    'nav.vault': '保管庫',
    'nav.env': 'Env保管庫',
    'nav.security': 'セキュリティ',
    'nav.extensions': '拡張機能',
    'nav.sharing': '共有',
    'nav.premium': '料金',
    'nav.architecture': 'アーキテクチャ',
    'nav.shortcuts': 'ショートカット',
    'nav.faq': 'よくある質問',
    'hero.title': 'LEMONADE PASSWORD MANAGER',
    'hero.subtitle': 'あなたの秘密。暗号化済み。あなたのもの。',
    'hero.nav.start': 'はじめに',
    'hero.nav.vault': 'パスワード保管庫',
    'hero.nav.security': 'セキュリティ監査',
    'hero.nav.extensions': '拡張機能',
    'hero.nav.architecture': 'アーキテクチャ',
    'start.title': '// はじめに',
    'start.step1.title': 'サインアップ',
    'start.step1.desc': 'Googleアカウントでサインインすれば、すぐにLemonadeを使えます。暗号化された環境変数ストレージが必要な場合は、後でEnv Vaultマスターパスワードを設定できます。',
    'start.step2.title': '最初のパスワード',
    'start.step2.desc': '最初の認証情報を保管庫に追加します。ユーザー名、パスワード、URL、メモを保存 — すべて暗号化されデバイス間で同期されます。',
    'start.step3.title': '拡張機能をインストール',
    'start.step3.desc': 'ChromeまたはFirefoxの拡張機能を入手してください。保管庫に保存されたURLと一致するサイトで認証情報を自動入力します。',
    'vault.title': '// パスワード保管庫',
    'vault.feat1.title': 'AES-256暗号化',
    'vault.feat1.desc': '軍事レベルの暗号化がすべての認証情報を保護します。マスターパスワードはPBKDF2を通じてローカルで鍵を導出します。',
    'vault.feat2.title': '自動入力',
    'vault.feat2.desc': 'ブラウザ拡張機能がログインフォームを検出し、認証情報を即座に入力します。ChromeとFirefoxに対応。',
    'vault.feat3.title': 'セキュリティ監査',
    'vault.feat3.desc': '弱いパスワードや再利用されたパスワードを検出します。vaultを強化するための実行可能な推奨事項を取得します。',
    'vault.feat4.title': '安全な共有',
    'vault.feat4.desc': '他のLemonadeユーザーと認証情報を共有します。連絡先を選択して共有すると、vaultで安全に受信されます。',
    'vault.code.title': 'encryption_flow.pseudo',
    'vault.code.copy': 'コピー',
    'env.title': '// ENV保管庫',
    'env.highlight.title': '環境変数ストレージ',
    'env.highlight.desc': '環境変数を安全に保存・管理します。プロジェクトフォルダをドラッグ＆ドロップすると、Lemonadeが自動的にすべての.envファイルを抽出します。暗号化されてデバイス間で同期され、平文で保存されることはありません。',
    'env.drop.text': 'プロジェクトフォルダをここにドラッグ＆ドロップ',
    'env.type.default': 'デフォルト',
    'env.type.local': 'ローカル',
    'env.type.production': 'プロダクション',
    'env.type.development': '開発',
    'security.title': '// セキュリティ監査',
    'security.compromised.title': '侵害済み',
    'security.compromised.desc': '侵害されたと判定されたパスワード。直ちに変更してください。',
    'security.weak.title': '弱い',
    'security.weak.desc': '弱いまたは非常に弱いと分類されたパスワード。更新を検討してください。',
    'security.medium.title': '中程度',
    'security.medium.desc': '許容可能な強度のパスワードですが、まだ改善の余地があります。',
    'security.strong.title': '強い',
    'security.strong.desc': '強いと評価された高エントロピーのパスワード。',
    'extensions.title': '// ブラウザ拡張機能',
    'extensions.chrome.title': 'Chrome拡張機能',
    'extensions.chrome.step1': 'Chrome Web Storeからダウンロードまたはアンパックでロード',
    'extensions.chrome.step2': 'Lemonadeアカウントでサインイン',
    'extensions.chrome.step3': '拡張機能アイコンをクリックして認証情報を自動入力',
    'extensions.chrome.manifest': 'manifest.json (MV3)',
    'extensions.chrome.copy': 'コピー',
    'extensions.firefox.title': 'Firefox拡張機能',
    'extensions.firefox.step1': 'Firefox Add-onsからインストールまたは一時的な拡張機能としてロード',
    'extensions.firefox.step2': 'Lemonadeアカウントでサインイン',
    'extensions.firefox.step3': '拡張機能アイコンをクリックして認証情報を自動入力',
    'extensions.firefox.note': 'Firefoxはchrome.*コールバックの代わりにネイティブPromise付きのbrowser.* APIを使用します。バックグラウンドはservice_workerの代わりにscripts配列を使用します。',
    'sharing.title': '// 安全な共有',
    'sharing.step1.title': '検索と選択',
    'sharing.step1.desc': 'メールでユーザーを見つけ、共有したい認証情報を選択します。',
    'sharing.step2.title': '安全に送信',
    'sharing.step2.desc': '認証情報は認証されたサーバーエンドポイントを通じて送信されます。',
    'sharing.step3.title': '承認または拒否',
    'sharing.step3.desc': '受信者はvaultで共有された認証情報を確認し、承認または拒否します。',
    'sharing.security.title': 'セキュリティノート',
    'sharing.security.note1': 'すべての共有は認証され保護されたサーバーエンドポイントを通じて行われます。',
    'sharing.security.note2': '受信者は共有された認証情報を承認または拒否できます。',
    'sharing.security.note3': 'ユーザーが共有を送信するのをブロックできます。',
    'premium.title': '// 料金',
    'premium.free.title': 'セルフホスト',
    'premium.free.price': '無料 · あなたの Firebase',
    'premium.free.feat1': '完全なソースコード（AGPLv3）',
    'premium.free.feat2': 'すべての機能 — プレミアム階層なし',
    'premium.free.feat3': 'あなたのデータ、あなたの管理',
    'premium.free.feat4': '通常 < 1 USドル/月の Firebase 使用料',
    'premium.pro.title': 'ホスティング',
    'premium.pro.price': '29 USドル生涯',
    'premium.pro.feat1': 'セルフホストのすべて',
    'premium.pro.feat2': 'Firebase 設定不要 — ログインしてすぐ使える',
    'premium.pro.feat3': '公式 Chrome および Firefox 拡張機能',
    'premium.pro.feat4': '管理されたアップデートとセキュリティパッチ',
    'premium.pro.feat5': 'いつでもデータをエクスポート — ロックインなし',
    'arch.title': '// セキュリティアーキテクチャ',
    'arch.flow.title': 'encryption_architecture.md',
    'arch.flow.copy': 'コピー',
    'arch.aes.title': 'AES-256-GCM',
    'arch.aes.desc': 'Galois/Counterモードは機密性と真正性の両方を提供します。各暗号化操作は固有の96ビットIVを使用します。128ビット認証タグがデータの整合性を保証し、改ざんを検出します。',
    'arch.zk.title': 'ゼロ知識（Env Vault）',
    'arch.zk.desc': 'Lemonadeサーバーは暗号文のみを保存します。マスターパスワードはデバイスの外に送信、記録、保存されることはありません。サーバーが侵害されても、データは暗号化されたまま読み取り不可能です。',
    'arch.kdf.title': '鍵導出: PBKDF2',
    'arch.kdf.desc': 'SHA-256の600,000回反復を持つPBKDF2がマスターパスワードを256ビット暗号化鍵に変換します。ランダムなソルトがレインボーテーブル攻撃を防ぎ、同一のパスワードが異なる鍵を生成することを保証します。',
    'shortcuts.title': '// キーボードショートカット',
    'shortcuts.col.shortcut': 'ショートカット',
    'shortcuts.col.action': 'アクション',
    'shortcuts.search': 'クイック検索',
    'shortcuts.lock': '保管庫をロック',
    'shortcuts.generator': 'パスワードジェネレーター',
    'shortcuts.export': 'エクスポート',
    'shortcuts.copy': 'パスワードをコピー',
    'faq.title': '// よくある質問',
    'faq.q1': 'Lemonade は無料ですか？',
    'faq.a1': 'Lemonade は AGPLv3 のオープンソースで、Firebase の無料プランプロジェクトでセルフホスティング可能です — 個人利用では実質的に無料です。ご自身の Firebase を設定したくない場合、lemonadepass.com のホスティング版は生涯アクセスで 29 USドルの一度払いです。サブスクリプションなし、2 つの道の間で機能制限なし。',
    'faq.q2': 'データはどこに保存されますか？',
    'faq.a2': '暗号化されたデータはFirebaseに保存されます。暗号文のみがサーバーに到達します。復号はマスターパスワードを使用してデバイス上でのみ行われます。',
    'faq.q3': 'マスターパスワードを忘れたらどうなりますか？',
    'faq.a3': 'あなたのアカウントはGoogleまたはメール認証を使用します。Env Vaultマスターパスワードを設定した場合、それはゼロ知識なので復元できません — あなただけが知っています。',
    'faq.q4': 'Lemonadeはネイティブアプリですか？',
    'faq.a4': 'LemonadeはPWA（Progressive Web App）です。ブラウザから直接どのデバイスにもインストールできます。アプリストア不要。vaultに安全にアクセスするにはインターネット接続が必要です。',
    'faq.q5': '安全な共有はどのように機能しますか？',
    'faq.a5': 'ユーザーを検索し、共有する認証情報を選択すると、認証されたサーバーエンドポイントを通じて安全に送信されます。受信者はvaultで共有された認証情報を承認または拒否できます。',
    'status.encryption': '暗号化: AES-256',
    'status.protocol': 'プロトコル: ゼロ知識',
    'status.status': 'ステータス: 安全'
  },

  // --- KOREAN ---
  ko: {
    'nav.brand': 'LEMONADE DOCS',
    'nav.start': '시작하기',
    'nav.vault': '보관함',
    'nav.env': 'Env 보관함',
    'nav.security': '보안',
    'nav.extensions': '확장 프로그램',
    'nav.sharing': '공유',
    'nav.premium': '가격',
    'nav.architecture': '아키텍처',
    'nav.shortcuts': '단축키',
    'nav.faq': 'FAQ',
    'hero.title': 'LEMONADE PASSWORD MANAGER',
    'hero.subtitle': '당신의 비밀. 암호화됨. 당신의 것.',
    'hero.nav.start': '시작하기',
    'hero.nav.vault': '비밀번호 보관함',
    'hero.nav.security': '보안 감사',
    'hero.nav.extensions': '확장 프로그램',
    'hero.nav.architecture': '아키텍처',
    'start.title': '// 시작하기',
    'start.step1.title': '가입',
    'start.step1.desc': 'Google 계정으로 로그인하면 바로 Lemonade를 사용할 수 있습니다. 암호화된 환경 변수 저장소가 필요하면 나중에 Env Vault 마스터 비밀번호를 설정하세요.',
    'start.step2.title': '첫 번째 비밀번호',
    'start.step2.desc': '보관함에 첫 번째 자격 증명을 추가하세요. 사용자 이름, 비밀번호, URL, 메모를 저장 — 모두 암호화되어 기기 간 동기화됩니다.',
    'start.step3.title': '확장 프로그램 설치',
    'start.step3.desc': 'Chrome 또는 Firefox 확장 프로그램을 설치하세요. 보관함에 저장된 URL과 일치하는 사이트에서 자격 증명을 자동 입력합니다.',
    'vault.title': '// 비밀번호 보관함',
    'vault.feat1.title': 'AES-256 암호화',
    'vault.feat1.desc': '군사 수준의 암호화가 모든 자격 증명을 보호합니다. 마스터 비밀번호는 PBKDF2를 통해 로컬에서 키를 파생합니다.',
    'vault.feat2.title': '자동 입력',
    'vault.feat2.desc': '브라우저 확장 프로그램이 로그인 양식을 감지하고 자격 증명을 즉시 입력합니다. Chrome과 Firefox를 지원합니다.',
    'vault.feat3.title': '보안 감사',
    'vault.feat3.desc': '약하거나 재사용된 비밀번호를 감지합니다. vault를 강화하기 위한 실행 가능한 권장 사항을 얻으세요.',
    'vault.feat4.title': '안전한 공유',
    'vault.feat4.desc': '다른 Lemonade 사용자와 자격 증명을 공유합니다. 연락처를 선택하여 공유하면 vault에서 안전하게 받습니다.',
    'vault.code.title': 'encryption_flow.pseudo',
    'vault.code.copy': '복사',
    'env.title': '// ENV 보관함',
    'env.highlight.title': '환경 변수 저장소',
    'env.highlight.desc': '환경 변수를 안전하게 저장하고 관리하세요. 프로젝트 폴더를 드래그 앤 드롭하면 Lemonade가 자동으로 모든 .env 파일을 추출합니다. 암호화되어 기기 간에 동기화되며, 평문으로 저장되지 않습니다.',
    'env.drop.text': '프로젝트 폴더를 여기에 드래그 앤 드롭하세요',
    'env.type.default': '기본',
    'env.type.local': '로컬',
    'env.type.production': '프로덕션',
    'env.type.development': '개발',
    'security.title': '// 보안 감사',
    'security.compromised.title': '손상됨',
    'security.compromised.desc': '손상된 것으로 표시된 비밀번호. 즉시 변경하세요.',
    'security.weak.title': '약함',
    'security.weak.desc': '약하거나 매우 약한 것으로 분류된 비밀번호. 업데이트를 고려하세요.',
    'security.medium.title': '보통',
    'security.medium.desc': '허용 가능한 강도의 비밀번호이지만 여전히 개선할 수 있습니다.',
    'security.strong.title': '강함',
    'security.strong.desc': '강한 것으로 평가된 높은 엔트로피의 비밀번호.',
    'extensions.title': '// 브라우저 확장 프로그램',
    'extensions.chrome.title': 'Chrome 확장 프로그램',
    'extensions.chrome.step1': 'Chrome Web Store에서 다운로드하거나 압축 해제하여 로드',
    'extensions.chrome.step2': 'Lemonade 계정으로 로그인',
    'extensions.chrome.step3': '확장 프로그램 아이콘을 클릭하여 자격 증명 자동 입력',
    'extensions.chrome.manifest': 'manifest.json (MV3)',
    'extensions.chrome.copy': '복사',
    'extensions.firefox.title': 'Firefox 확장 프로그램',
    'extensions.firefox.step1': 'Firefox Add-ons에서 설치하거나 임시 확장 프로그램으로 로드',
    'extensions.firefox.step2': 'Lemonade 계정으로 로그인',
    'extensions.firefox.step3': '확장 프로그램 아이콘을 클릭하여 자격 증명 자동 입력',
    'extensions.firefox.note': 'Firefox는 chrome.* 콜백 대신 네이티브 Promise가 있는 browser.* API를 사용합니다. 백그라운드는 service_worker 대신 스크립트 배열을 사용합니다.',
    'sharing.title': '// 안전한 공유',
    'sharing.step1.title': '검색 및 선택',
    'sharing.step1.desc': '이메일로 사용자를 찾고 공유할 자격 증명을 선택하세요.',
    'sharing.step2.title': '안전하게 전송',
    'sharing.step2.desc': '자격 증명은 인증된 서버 엔드포인트를 통해 전송됩니다.',
    'sharing.step3.title': '수락 또는 거부',
    'sharing.step3.desc': '수신자는 vault에서 공유된 자격 증명을 검토하고 수락하거나 거부합니다.',
    'sharing.security.title': '보안 참고 사항',
    'sharing.security.note1': '모든 공유는 인증되고 보호된 서버 엔드포인트를 통해 이루어집니다.',
    'sharing.security.note2': '수신자는 공유된 자격 증명을 수락하거나 거부할 수 있습니다.',
    'sharing.security.note3': '사용자가 공유를 보내는 것을 차단할 수 있습니다.',
    'premium.title': '// 가격',
    'premium.free.title': '셀프 호스트',
    'premium.free.price': '무료 · 당신의 Firebase',
    'premium.free.feat1': '완전한 소스 코드 (AGPLv3)',
    'premium.free.feat2': '모든 기능 — 프리미엄 계층 없음',
    'premium.free.feat3': '당신의 데이터, 당신의 제어',
    'premium.free.feat4': '일반적으로 월 < 1 달러의 Firebase 사용료',
    'premium.pro.title': '호스팅',
    'premium.pro.price': '29 달러 평생',
    'premium.pro.feat1': '셀프 호스트의 모든 기능',
    'premium.pro.feat2': 'Firebase 설정 불필요 — 로그인만 하면 됨',
    'premium.pro.feat3': '공식 Chrome 및 Firefox 확장 프로그램',
    'premium.pro.feat4': '관리되는 업데이트 및 보안 패치',
    'premium.pro.feat5': '언제든지 데이터 내보내기 — 잠금 없음',
    'arch.title': '// 보안 아키텍처',
    'arch.flow.title': 'encryption_architecture.md',
    'arch.flow.copy': '복사',
    'arch.aes.title': 'AES-256-GCM',
    'arch.aes.desc': 'Galois/Counter 모드는 기밀성과 진정성을 모두 제공합니다. 각 암호화 작업은 고유한 96비트 IV를 사용합니다. 128비트 인증 태그가 데이터 무결성을 보장하고 변조를 감지합니다.',
    'arch.zk.title': '제로 지식 (Env Vault)',
    'arch.zk.desc': 'Lemonade 서버는 암호문만 저장합니다. 마스터 비밀번호는 기기 외부로 전송, 기록 또는 저장되지 않습니다. 서버가 침해되더라도 데이터는 암호화되어 읽을 수 없습니다.',
    'arch.kdf.title': '키 파생: PBKDF2',
    'arch.kdf.desc': 'SHA-256의 600,000회 반복을 가진 PBKDF2가 마스터 비밀번호를 256비트 암호화 키로 변환합니다. 랜덤 솔트가 레인보우 테이블 공격을 방지하고 동일한 비밀번호가 다른 키를 생성하도록 보장합니다.',
    'shortcuts.title': '// 키보드 단축키',
    'shortcuts.col.shortcut': '단축키',
    'shortcuts.col.action': '동작',
    'shortcuts.search': '빠른 검색',
    'shortcuts.lock': '보관함 잠금',
    'shortcuts.generator': '비밀번호 생성기',
    'shortcuts.export': '내보내기',
    'shortcuts.copy': '비밀번호 복사',
    'faq.title': '// FAQ',
    'faq.q1': 'Lemonade는 무료인가요?',
    'faq.a1': 'Lemonade는 AGPLv3 하에 오픈 소스이며 Firebase 무료 티어 프로젝트에서 셀프 호스팅 가능합니다 — 개인 사용에는 실질적으로 무료입니다. 자신의 Firebase를 설정하지 않으려면 lemonadepass.com의 호스팅 버전은 평생 액세스를 위해 29 달러의 일회성 결제입니다. 구독 없음, 두 경로 간 기능 게이트 없음.',
    'faq.q2': '데이터는 어디에 저장되나요?',
    'faq.a2': '암호화된 데이터는 Firebase에 저장됩니다. 암호문만 서버에 도달합니다. 복호화는 마스터 비밀번호를 사용하여 기기에서만 수행됩니다.',
    'faq.q3': '마스터 비밀번호를 잊으면 어떻게 되나요?',
    'faq.a3': '귀하의 계정은 Google 또는 이메일 인증을 사용합니다. Env Vault 마스터 비밀번호를 설정한 경우 제로 지식이므로 복구할 수 없습니다 — 귀하만 알고 있습니다.',
    'faq.q4': 'Lemonade는 네이티브 앱인가요?',
    'faq.a4': 'Lemonade는 PWA(Progressive Web App)입니다. 브라우저에서 직접 어떤 기기에든 설치할 수 있으며 앱 스토어가 필요 없습니다. vault에 안전하게 접근하려면 인터넷 연결이 필요합니다.',
    'faq.q5': '안전한 공유는 어떻게 작동하나요?',
    'faq.a5': '사용자를 검색하고 공유할 자격 증명을 선택하면 인증된 서버 엔드포인트를 통해 안전하게 전송됩니다. 수신자는 vault에서 공유된 자격 증명을 수락하거나 거부할 수 있습니다.',
    'status.encryption': '암호화: AES-256',
    'status.protocol': '프로토콜: 제로 지식',
    'status.status': '상태: 안전'
  },

  // --- CHINESE ---
  zh: {
    'nav.brand': 'LEMONADE DOCS',
    'nav.start': '快速开始',
    'nav.vault': '保险库',
    'nav.env': 'Env保险库',
    'nav.security': '安全',
    'nav.extensions': '浏览器扩展',
    'nav.sharing': '共享',
    'nav.premium': '价格',
    'nav.architecture': '架构',
    'nav.shortcuts': '快捷键',
    'nav.faq': '常见问题',
    'hero.title': 'LEMONADE PASSWORD MANAGER',
    'hero.subtitle': '你的秘密。已加密。属于你。',
    'hero.nav.start': '快速开始',
    'hero.nav.vault': '密码保险库',
    'hero.nav.security': '安全审计',
    'hero.nav.extensions': '扩展程序',
    'hero.nav.architecture': '架构',
    'start.title': '// 快速开始',
    'start.step1.title': '注册',
    'start.step1.desc': '使用Google账户登录即可开始使用Lemonade。如果需要加密的环境变量存储，可以稍后设置Env Vault主密码。',
    'start.step2.title': '第一个密码',
    'start.step2.desc': '将你的第一个凭据添加到保险库。存储用户名、密码、URL和笔记 — 全部加密并在设备间同步。',
    'start.step3.title': '安装扩展程序',
    'start.step3.desc': '获取Chrome或Firefox扩展程序。它会在与保险库中保存的URL匹配的网站上自动填充凭据。',
    'vault.title': '// 密码保险库',
    'vault.feat1.title': 'AES-256加密',
    'vault.feat1.desc': '军事级加密保护每个凭据。你的主密码通过PBKDF2在本地派生密钥。',
    'vault.feat2.title': '自动填充',
    'vault.feat2.desc': '浏览器扩展检测登录表单并即时填充凭据。支持Chrome和Firefox。',
    'vault.feat3.title': '安全审计',
    'vault.feat3.desc': '检测弱密码和重复使用的密码。获取可操作的建议以加强您的vault。',
    'vault.feat4.title': '安全共享',
    'vault.feat4.desc': '与其他Lemonade用户共享凭据。选择联系人，共享，他们会在vault中安全接收。',
    'vault.code.title': 'encryption_flow.pseudo',
    'vault.code.copy': '复制',
    'env.title': '// ENV保险库',
    'env.highlight.title': '环境变量存储',
    'env.highlight.desc': '安全地存储和管理你的环境变量。拖放你的项目文件夹，Lemonade会自动提取所有.env文件。它们会被加密并在你的设备间同步，永远不会以明文存储。',
    'env.drop.text': '将项目文件夹拖放到这里',
    'env.type.default': '默认',
    'env.type.local': '本地',
    'env.type.production': '生产',
    'env.type.development': '开发',
    'security.title': '// 安全审计',
    'security.compromised.title': '已泄露',
    'security.compromised.desc': '被标记为已泄露的密码。请立即更改。',
    'security.weak.title': '弱',
    'security.weak.desc': '被分类为弱或非常弱的密码。建议更新。',
    'security.medium.title': '中等',
    'security.medium.desc': '强度可接受但仍可改进的密码。',
    'security.strong.title': '强',
    'security.strong.desc': '被评为强的高熵密码。',
    'extensions.title': '// 浏览器扩展',
    'extensions.chrome.title': 'Chrome扩展',
    'extensions.chrome.step1': '从Chrome Web Store下载或加载解压版',
    'extensions.chrome.step2': '使用Lemonade账户登录',
    'extensions.chrome.step3': '点击扩展图标自动填充凭据',
    'extensions.chrome.manifest': 'manifest.json (MV3)',
    'extensions.chrome.copy': '复制',
    'extensions.firefox.title': 'Firefox扩展',
    'extensions.firefox.step1': '从Firefox Add-ons安装或作为临时扩展加载',
    'extensions.firefox.step2': '使用Lemonade账户登录',
    'extensions.firefox.step3': '点击扩展图标自动填充凭据',
    'extensions.firefox.note': 'Firefox使用带有原生Promise的browser.* API代替chrome.*回调。后台使用脚本数组代替service_worker。',
    'sharing.title': '// 安全共享',
    'sharing.step1.title': '搜索和选择',
    'sharing.step1.desc': '通过电子邮件查找用户并选择要共享的凭据。',
    'sharing.step2.title': '安全发送',
    'sharing.step2.desc': '凭据通过经过身份验证的服务器端点发送。',
    'sharing.step3.title': '接受或拒绝',
    'sharing.step3.desc': '接收者在其vault中查看并接受或拒绝共享的凭据。',
    'sharing.security.title': '安全说明',
    'sharing.security.note1': '所有共享都通过经过身份验证和保护的服务器端点进行。',
    'sharing.security.note2': '接收者可以接受或拒绝共享的凭据。',
    'sharing.security.note3': '您可以阻止用户向您发送共享。',
    'premium.title': '// 价格',
    'premium.free.title': '自托管',
    'premium.free.price': '免费 · 您的 Firebase',
    'premium.free.feat1': '完整源代码（AGPLv3）',
    'premium.free.feat2': '所有功能 — 无高级层级',
    'premium.free.feat3': '您的数据，您的控制',
    'premium.free.feat4': '通常 < 1 美元/月 Firebase 使用费',
    'premium.pro.title': '托管',
    'premium.pro.price': '29 美元终身',
    'premium.pro.feat1': '自托管的所有功能',
    'premium.pro.feat2': '无需配置 Firebase — 登录即用',
    'premium.pro.feat3': '官方 Chrome 和 Firefox 扩展',
    'premium.pro.feat4': '托管更新和安全补丁',
    'premium.pro.feat5': '随时导出您的数据 — 零锁定',
    'arch.title': '// 安全架构',
    'arch.flow.title': 'encryption_architecture.md',
    'arch.flow.copy': '复制',
    'arch.aes.title': 'AES-256-GCM',
    'arch.aes.desc': 'Galois/Counter模式同时提供机密性和真实性。每次加密操作使用唯一的96位IV。128位认证标签确保数据完整性并检测篡改。',
    'arch.zk.title': '零知识（Env Vault）',
    'arch.zk.desc': 'Lemonade服务器只存储密文。你的主密码永远不会被传输、记录或存储在设备之外。即使服务器被入侵，你的数据仍然是加密且不可读的。',
    'arch.kdf.title': '密钥派生：PBKDF2',
    'arch.kdf.desc': 'PBKDF2使用600,000次SHA-256迭代将你的主密码转换为256位加密密钥。随机盐防止彩虹表攻击，确保相同的密码产生不同的密钥。',
    'shortcuts.title': '// 键盘快捷键',
    'shortcuts.col.shortcut': '快捷键',
    'shortcuts.col.action': '操作',
    'shortcuts.search': '快速搜索',
    'shortcuts.lock': '锁定保险库',
    'shortcuts.generator': '密码生成器',
    'shortcuts.export': '导出',
    'shortcuts.copy': '复制密码',
    'faq.title': '// 常见问题',
    'faq.q1': 'Lemonade 免费吗？',
    'faq.a1': 'Lemonade 是 AGPLv3 开源软件，可在 Firebase 免费层项目上自托管 — 个人使用基本免费。如果您不想配置自己的 Firebase，lemonadepass.com 上的托管版本是 29 美元的一次性付款，可终身使用。无订阅，两种途径之间无功能门控。',
    'faq.q2': '我的数据存储在哪里？',
    'faq.a2': '加密数据存储在Firebase上。只有密文到达我们的服务器。解密仅在你的设备上使用主密码进行。',
    'faq.q3': '如果我忘记了主密码怎么办？',
    'faq.a3': '您的账户使用Google或电子邮件认证。如果您设置了Env Vault主密码，那是零知识的，因此无法恢复 — 只有您知道。',
    'faq.q4': 'Lemonade是原生应用吗？',
    'faq.a4': 'Lemonade是PWA（渐进式Web应用）。您可以直接从浏览器安装到任何设备，无需应用商店。需要互联网连接才能安全访问您的vault。',
    'faq.q5': '安全共享是如何工作的？',
    'faq.a5': '您搜索用户，选择要共享的凭据，它通过经过身份验证的服务器端点安全发送。接收者可以在其vault中接受或拒绝共享的凭据。',
    'status.encryption': '加密：AES-256',
    'status.protocol': '协议：零知识',
    'status.status': '状态：安全'
  },

  // --- RUSSIAN ---
  ru: {
    'nav.brand': 'LEMONADE DOCS',
    'nav.start': 'Начало',
    'nav.vault': 'Хранилище',
    'nav.env': 'Env-хранилище',
    'nav.security': 'Безопасность',
    'nav.extensions': 'Расширения',
    'nav.sharing': 'Общий доступ',
    'nav.premium': 'Цены',
    'nav.architecture': 'Архитектура',
    'nav.shortcuts': 'Горячие клавиши',
    'nav.faq': 'ЧаВо',
    'hero.title': 'LEMONADE PASSWORD MANAGER',
    'hero.subtitle': 'Ваши секреты. Зашифрованы. Ваши.',
    'hero.nav.start': 'Начало',
    'hero.nav.vault': 'Хранилище паролей',
    'hero.nav.security': 'Аудит безопасности',
    'hero.nav.extensions': 'Расширения',
    'hero.nav.architecture': 'Архитектура',
    'start.title': '// НАЧАЛО РАБОТЫ',
    'start.step1.title': 'Регистрация',
    'start.step1.desc': 'Войдите с помощью аккаунта Google, и вы готовы использовать Lemonade. Если вам нужно зашифрованное хранение переменных окружения, настройте мастер-пароль Env Vault позже.',
    'start.step2.title': 'Первый пароль',
    'start.step2.desc': 'Добавьте первые учётные данные в хранилище. Храните имена пользователей, пароли, URL и заметки — всё зашифровано и синхронизировано между устройствами.',
    'start.step3.title': 'Установите расширение',
    'start.step3.desc': 'Установите расширение для Chrome или Firefox. Оно автоматически заполняет учётные данные на сайтах, URL которых сохранены в вашем хранилище.',
    'vault.title': '// ХРАНИЛИЩЕ ПАРОЛЕЙ',
    'vault.feat1.title': 'Шифрование AES-256',
    'vault.feat1.desc': 'Шифрование военного уровня защищает каждые учётные данные. Мастер-пароль выводит ключ локально через PBKDF2.',
    'vault.feat2.title': 'Автозаполнение',
    'vault.feat2.desc': 'Расширение браузера обнаруживает формы входа и мгновенно заполняет учётные данные. Поддерживает Chrome и Firefox.',
    'vault.feat3.title': 'Аудит безопасности',
    'vault.feat3.desc': 'Обнаруживает слабые и повторно используемые пароли. Получите практические рекомендации для укрепления вашего хранилища.',
    'vault.feat4.title': 'Безопасный общий доступ',
    'vault.feat4.desc': 'Делитесь учётными данными с другими пользователями Lemonade. Выберите контакт, поделитесь, и они получат это безопасно в своём хранилище.',
    'vault.code.title': 'encryption_flow.pseudo',
    'vault.code.copy': 'Копировать',
    'env.title': '// ENV-ХРАНИЛИЩЕ',
    'env.highlight.title': 'Хранение переменных окружения',
    'env.highlight.desc': 'Безопасно храните и управляйте переменными окружения. Перетащите папку проекта, и Lemonade автоматически извлечет все файлы .env. Они шифруются и синхронизируются между устройствами, никогда не хранятся в открытом виде.',
    'env.drop.text': 'Перетащите папку проекта сюда',
    'env.type.default': 'По умолчанию',
    'env.type.local': 'Локальный',
    'env.type.production': 'Продакшн',
    'env.type.development': 'Разработка',
    'security.title': '// АУДИТ БЕЗОПАСНОСТИ',
    'security.compromised.title': 'Скомпрометированные',
    'security.compromised.desc': 'Пароли, отмеченные как скомпрометированные. Немедленно измените их.',
    'security.weak.title': 'Слабые',
    'security.weak.desc': 'Пароли, классифицированные как слабые или очень слабые. Рекомендуется обновить.',
    'security.medium.title': 'Средние',
    'security.medium.desc': 'Пароли с приемлемой надежностью, которые еще можно улучшить.',
    'security.strong.title': 'Сильные',
    'security.strong.desc': 'Пароли с высокой энтропией, оцененные как сильные.',
    'extensions.title': '// РАСШИРЕНИЯ БРАУЗЕРА',
    'extensions.chrome.title': 'Расширение для Chrome',
    'extensions.chrome.step1': 'Скачайте из Chrome Web Store или загрузите распакованное',
    'extensions.chrome.step2': 'Войдите с вашим аккаунтом Lemonade',
    'extensions.chrome.step3': 'Нажмите на значок расширения для автозаполнения учётных данных',
    'extensions.chrome.manifest': 'manifest.json (MV3)',
    'extensions.chrome.copy': 'Копировать',
    'extensions.firefox.title': 'Расширение для Firefox',
    'extensions.firefox.step1': 'Установите из Firefox Add-ons или загрузите как временное расширение',
    'extensions.firefox.step2': 'Войдите с вашим аккаунтом Lemonade',
    'extensions.firefox.step3': 'Нажмите на значок расширения для автозаполнения учётных данных',
    'extensions.firefox.note': 'Firefox использует API browser.* с нативными Promise вместо обратных вызовов chrome.*. Фоновые скрипты используют массив scripts вместо service_worker.',
    'sharing.title': '// БЕЗОПАСНЫЙ ОБЩИЙ ДОСТУП',
    'sharing.step1.title': 'Поиск и выбор',
    'sharing.step1.desc': 'Найдите пользователя по email и выберите учётные данные для общего доступа.',
    'sharing.step2.title': 'Безопасная отправка',
    'sharing.step2.desc': 'Учётные данные отправляются через аутентифицированные серверные конечные точки.',
    'sharing.step3.title': 'Принять или отклонить',
    'sharing.step3.desc': 'Получатель проверяет и принимает или отклоняет общие учётные данные в своём хранилище.',
    'sharing.security.title': 'Заметки о безопасности',
    'sharing.security.note1': 'Весь общий доступ осуществляется через аутентифицированные и защищённые серверные конечные точки.',
    'sharing.security.note2': 'Получатели могут принимать или отклонять общие учётные данные.',
    'sharing.security.note3': 'Вы можете блокировать пользователей от отправки вам общего доступа.',
    'premium.title': '// ЦЕНЫ',
    'premium.free.title': 'Self-host',
    'premium.free.price': 'Бесплатно · Ваш Firebase',
    'premium.free.feat1': 'Полный исходный код (AGPLv3)',
    'premium.free.feat2': 'Все функции — нет премиум-уровня',
    'premium.free.feat3': 'Ваши данные, ваш контроль',
    'premium.free.feat4': 'Обычно < 1 $/мес Firebase',
    'premium.pro.title': 'Hosted',
    'premium.pro.price': '29 $ пожизненно',
    'premium.pro.feat1': 'Всё из Self-host',
    'premium.pro.feat2': 'Без настройки Firebase — зашли и работаете',
    'premium.pro.feat3': 'Официальные расширения Chrome и Firefox',
    'premium.pro.feat4': 'Управляемые обновления и патчи безопасности',
    'premium.pro.feat5': 'Экспортируйте данные когда захотите — никакого lock-in',
    'arch.title': '// АРХИТЕКТУРА БЕЗОПАСНОСТИ',
    'arch.flow.title': 'encryption_architecture.md',
    'arch.flow.copy': 'Копировать',
    'arch.aes.title': 'AES-256-GCM',
    'arch.aes.desc': 'Режим Galois/Counter обеспечивает конфиденциальность и подлинность. Каждая операция шифрования использует уникальный 96-битный IV. 128-битный тег аутентификации гарантирует целостность данных и обнаруживает подделку.',
    'arch.zk.title': 'Нулевое знание (Env Vault)',
    'arch.zk.desc': 'Серверы Lemonade хранят только шифротекст. Ваш мастер-пароль никогда не передаётся, не записывается и не хранится за пределами вашего устройства. Даже при компрометации серверов ваши данные остаются зашифрованными и нечитаемыми.',
    'arch.kdf.title': 'Выведение ключа: PBKDF2',
    'arch.kdf.desc': 'PBKDF2 со 100 000 итерациями SHA-256 преобразует мастер-пароль в 256-битный ключ шифрования. Случайная соль предотвращает атаки радужных таблиц и гарантирует, что одинаковые пароли создают разные ключи.',
    'shortcuts.title': '// ГОРЯЧИЕ КЛАВИШИ',
    'shortcuts.col.shortcut': 'Клавиша',
    'shortcuts.col.action': 'Действие',
    'shortcuts.search': 'Быстрый поиск',
    'shortcuts.lock': 'Заблокировать хранилище',
    'shortcuts.generator': 'Генератор паролей',
    'shortcuts.export': 'Экспорт',
    'shortcuts.copy': 'Копировать пароль',
    'faq.title': '// ЧАСТО ЗАДАВАЕМЫЕ ВОПРОСЫ',
    'faq.q1': 'Lemonade бесплатен?',
    'faq.a1': 'Lemonade — open source под AGPLv3 и self-hosted на проекте Firebase бесплатного уровня — для личного использования это вам ничего не стоит. Если вы предпочитаете не настраивать свой Firebase, hosted-версия на lemonadepass.com — единовременный платеж 29 $ за пожизненный доступ. Без подписки, никаких заблокированных функций между двумя путями.',
    'faq.q2': 'Где хранятся мои данные?',
    'faq.a2': 'Зашифрованные данные хранятся в Firebase. На наши серверы попадает только шифротекст. Расшифровка происходит исключительно на вашем устройстве с использованием мастер-пароля.',
    'faq.q3': 'Что произойдёт, если я забуду мастер-пароль?',
    'faq.a3': 'Ваша учётная запись использует аутентификацию Google или email. Если вы установите мастер-пароль Env Vault, его нельзя восстановить, так как это zero-knowledge — только вы его знаете.',
    'faq.q4': 'Lemonade — это нативное приложение?',
    'faq.a4': 'Lemonade — это PWA (прогрессивное веб-приложение). Вы можете установить его на любое устройство прямо из браузера, без магазина приложений. Для безопасного доступа к хранилищу требуется подключение к интернету.',
    'faq.q5': 'Как работает безопасный общий доступ?',
    'faq.a5': 'Вы ищете пользователя, выбираете учётные данные для общего доступа, и они безопасно отправляются через аутентифицированные серверные конечные точки. Получатель может принять или отклонить общие учётные данные в своём хранилище.',
    'status.encryption': 'шифрование: AES-256',
    'status.protocol': 'протокол: нулевое знание',
    'status.status': 'статус: ЗАЩИЩЁН'
  }
};

// Language display names with flag emojis
const languageNames = {
  en: '\u{1F1FA}\u{1F1F8} English',
  es: '\u{1F1EA}\u{1F1F8} Espa\u00f1ol',
  pt: '\u{1F1E7}\u{1F1F7} Portugu\u00eas',
  fr: '\u{1F1EB}\u{1F1F7} Fran\u00e7ais',
  de: '\u{1F1E9}\u{1F1EA} Deutsch',
  it: '\u{1F1EE}\u{1F1F9} Italiano',
  ja: '\u{1F1EF}\u{1F1F5} \u65E5\u672C\u8A9E',
  ko: '\u{1F1F0}\u{1F1F7} \uD55C\uAD6D\uC5B4',
  zh: '\u{1F1E8}\u{1F1F3} \u4E2D\u6587',
  ru: '\u{1F1F7}\u{1F1FA} \u0420\u0443\u0441\u0441\u043A\u0438\u0439'
};


// ============================================
// 2. STATE
// ============================================

let currentLang = localStorage.getItem('lemonade-lang') || 'en';
let typingTimeout = null;

// TODO: drink more lemonade


// ============================================
// 3. i18n ENGINE
// ============================================

/**
 * Apply translations to all elements with [data-i18n] attribute
 * Also updates the language selector display
 */
function applyTranslations(lang) {
  currentLang = lang;
  const dict = translations[lang] || translations.en;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key] !== undefined) {
      // For code blocks, use textContent to preserve formatting
      if (el.tagName === 'CODE' || el.closest('pre')) {
        el.textContent = dict[key];
      } else {
        el.textContent = dict[key];
      }
    }
  });

  // Update language selector button text
  const langBtn = document.getElementById('lang-current');
  if (langBtn) {
    langBtn.textContent = languageNames[lang] || lang;
  }

  // Save preference
  localStorage.setItem('lemonade-lang', lang);

  // Restart typing effect with new language
  startTypingEffect();
}

/**
 * Build the language selector dropdown options
 */
function initLanguageSelector() {
  const dropdown = document.getElementById('lang-dropdown');
  if (!dropdown) return;

  dropdown.innerHTML = '';
  Object.entries(languageNames).forEach(([code, name]) => {
    const option = document.createElement('div');
    option.className = 'lang-option';
    option.textContent = name;
    option.dataset.lang = code;
    if (code === currentLang) option.classList.add('active');

    option.addEventListener('click', () => {
      // Update active state
      dropdown.querySelectorAll('.lang-option').forEach(o => o.classList.remove('active'));
      option.classList.add('active');

      applyTranslations(code);
      dropdown.classList.remove('show');
    });

    dropdown.appendChild(option);
  });

  // Toggle dropdown on button click
  const langBtn = document.getElementById('lang-current');
  if (langBtn) {
    langBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });
  }

  // Close dropdown on outside click
  document.addEventListener('click', () => {
    dropdown.classList.remove('show');
  });
}


// ============================================
// 4. THEME TOGGLE (dark/light)
// ============================================

function initThemeToggle() {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;

  // Load saved preference (default: dark)
  const savedTheme = localStorage.getItem('lemonade-theme') || 'dark';
  if (savedTheme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  }
  updateThemeIcon(savedTheme);

  toggle.addEventListener('click', () => {
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const newTheme = isLight ? 'dark' : 'light';

    if (newTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    localStorage.setItem('lemonade-theme', newTheme);
    updateThemeIcon(newTheme);
  });
}

function updateThemeIcon(theme) {
  const toggle = document.getElementById('theme-toggle');
  if (!toggle) return;
  // Sun for dark mode (click to go light), Moon for light mode (click to go dark)
  toggle.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\u{1F319}';
  toggle.setAttribute('aria-label', theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode');
}


// ============================================
// 5. TYPING EFFECT
// ============================================

function startTypingEffect() {
  const el = document.getElementById('hero-subtitle');
  if (!el) return;

  // Clear any running animation
  if (typingTimeout) {
    clearTimeout(typingTimeout);
    typingTimeout = null;
  }

  const dict = translations[currentLang] || translations.en;
  const fullText = dict['hero.subtitle'] || '';
  el.textContent = '';
  el.classList.remove('blink-cursor');

  let i = 0;
  function typeChar() {
    if (i < fullText.length) {
      el.textContent += fullText[i];
      i++;
      typingTimeout = setTimeout(typeChar, 50 + Math.random() * 40);
    } else {
      // Done typing - add blinking cursor
      el.classList.add('blink-cursor');
    }
  }

  // Small initial delay for dramatic effect
  typingTimeout = setTimeout(typeChar, 300);
}


// ============================================
// 6. COPY CODE BLOCKS
// ============================================

function initCopyButtons() {
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Find the adjacent code element
      const codeBlock = btn.closest('.code-block, .code-container, pre')?.querySelector('code')
        || btn.parentElement.querySelector('code');

      if (!codeBlock) return;

      const text = codeBlock.textContent;
      navigator.clipboard.writeText(text).then(() => {
        const original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 2000);
      }).catch(() => {
        // Fallback for older browsers
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);

        const original = btn.textContent;
        btn.textContent = 'Copied!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = original;
          btn.classList.remove('copied');
        }, 2000);
      });
    });
  });
}


// ============================================
// 7. SCROLL REVEAL (IntersectionObserver)
// ============================================

function initScrollReveal() {
  const revealElements = document.querySelectorAll('.reveal');
  if (!revealElements.length) return;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        // Stagger cards in the same section
        const parent = entry.target.closest('.card-grid, .steps-grid, .faq-list, section');
        if (parent) {
          const siblings = Array.from(parent.querySelectorAll('.reveal'));
          const index = siblings.indexOf(entry.target);
          entry.target.style.transitionDelay = `${index * 100}ms`;
        }

        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // Only animate once
      }
    });
  }, {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  });

  revealElements.forEach(el => observer.observe(el));
}


// ============================================
// 8. FAQ ACCORDION
// ============================================

function initFaqAccordion() {
  document.querySelectorAll('.faq-toggle').forEach(toggle => {
    toggle.addEventListener('click', () => {
      const item = toggle.closest('.faq-item');
      if (!item) return;

      const isOpen = item.classList.contains('open');

      // Close all other items (optional: remove this for multi-open)
      document.querySelectorAll('.faq-item.open').forEach(openItem => {
        if (openItem !== item) {
          openItem.classList.remove('open');
        }
      });

      // Toggle current item
      item.classList.toggle('open', !isOpen);
    });
  });
}


// ============================================
// 9. SMOOTH SCROLL
// ============================================

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"], [data-scroll-to]').forEach(link => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href')?.replace('#', '')
        || link.dataset.scrollTo;
      const target = document.getElementById(targetId);

      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth', block: 'start' });

        // Close mobile menu if open
        const mobileMenu = document.getElementById('mobile-menu');
        if (mobileMenu) mobileMenu.classList.remove('open');
        const hamburger = document.getElementById('hamburger');
        if (hamburger) hamburger.classList.remove('open');
      }
    });
  });
}


// ============================================
// 10. MOBILE MENU
// ============================================

function initMobileMenu() {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  if (!hamburger || !mobileMenu) return;

  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    mobileMenu.classList.toggle('open');
  });

  // Close menu when clicking a link
  mobileMenu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      hamburger.classList.remove('open');
      mobileMenu.classList.remove('open');
    });
  });
}


// ============================================
// 11. EASTER EGG: KONAMI CODE
// "When life gives you lemons, hack the matrix"
// ============================================

function initKonamiCode() {
  const konamiSequence = [
    'ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown',
    'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight',
    'KeyB', 'KeyA'
  ];
  let konamiIndex = 0;

  document.addEventListener('keydown', (e) => {
    if (e.code === konamiSequence[konamiIndex]) {
      konamiIndex++;
      if (konamiIndex === konamiSequence.length) {
        konamiIndex = 0;
        triggerMatrixRain();
      }
    } else {
      konamiIndex = 0;
    }
  });
}

/**
 * Matrix rain effect with lemons, binary, and hex characters
 * Runs for 3 seconds then fades out
 * Because every password manager needs a matrix mode
 */
function triggerMatrixRain() {
  // Don't stack multiple instances
  if (document.getElementById('matrix-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'matrix-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
    z-index: 99999; pointer-events: none; overflow: hidden;
    background: rgba(0, 0, 0, 0.85);
  `;
  document.body.appendChild(overlay);

  const canvas = document.createElement('canvas');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  overlay.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  const columns = Math.floor(canvas.width / 20);
  const drops = new Array(columns).fill(1);

  // Lemon-yellow matrix palette
  const chars = ['\u{1F34B}', '0', '1', 'A', 'B', 'C', 'D', 'E', 'F',
    '0', '1', '0', '1', 'F', 'F', 'A', '8', '3'];

  function drawMatrix() {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.fillStyle = '#FFE135'; // Lemon yellow
    ctx.font = '16px monospace';

    for (let i = 0; i < drops.length; i++) {
      const char = chars[Math.floor(Math.random() * chars.length)];
      ctx.fillText(char, i * 20, drops[i] * 20);

      if (drops[i] * 20 > canvas.height && Math.random() > 0.975) {
        drops[i] = 0;
      }
      drops[i]++;
    }
  }

  const interval = setInterval(drawMatrix, 50);

  // Remove after 3 seconds
  setTimeout(() => {
    clearInterval(interval);
    overlay.style.transition = 'opacity 0.5s';
    overlay.style.opacity = '0';
    setTimeout(() => overlay.remove(), 500);
  }, 3000);
}


// ============================================
// 12. STATUS BAR
// ============================================

function initStatusBar() {
  // Status bar content is already in HTML with data-i18n attributes
  // No need to rebuild it, translations will be applied automatically
  // This function is kept for backwards compatibility but does nothing
}


// ============================================
// 13. LEMON LOGO INTERACTIVITY
// ============================================

function initLemonLogo() {
  const logo = document.querySelector('.lemon-logo, #lemon-logo');
  if (!logo) return;

  let clickCount = 0;

  logo.addEventListener('click', () => {
    clickCount++;
    // After 5 rapid clicks, do something fun
    if (clickCount >= 5) {
      clickCount = 0;
      logo.style.filter = `hue-rotate(${Math.random() * 360}deg)`;
      setTimeout(() => { logo.style.filter = ''; }, 1500);
    }

    // Reset click count after 2 seconds of no clicking
    setTimeout(() => { clickCount = 0; }, 2000);
  });
}


// ============================================
// 14. INITIALIZATION
// When life gives you lemons, initialize them
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  // Theme (must be first for visual consistency)
  initThemeToggle();

  // i18n
  initLanguageSelector();
  applyTranslations(currentLang);

  // UI Components
  initCopyButtons();
  initScrollReveal();
  initFaqAccordion();
  initSmoothScroll();
  initMobileMenu();
  initStatusBar();
  initLemonLogo();

  // Easter eggs (the best part)
  initKonamiCode();

  // Log a friendly message for curious devs
  console.log(
    '%c\u{1F34B} Lemonade Password Manager %cv2.2.4',
    'color: #FFE135; font-size: 16px; font-weight: bold;',
    'color: #888; font-size: 12px;'
  );
  console.log('%cYour secrets are safe with us.', 'color: #0f0; font-family: monospace;');
});
