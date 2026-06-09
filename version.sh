#!/bin/bash

# Script mejorado de versionado automático
# Uso: ./version.sh [patch|minor|major] o sin argumentos para auto-patch

VERSION_TYPE=${1:-patch}  # Default a patch si no se especifica

echo "🚀 Incrementando versión ($VERSION_TYPE)..."

# Hacer backup de la versión actual
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "📦 Versión actual: $CURRENT_VERSION"

# Incrementar versión con npm
npm version $VERSION_TYPE --no-git-tag-version

# Obtener nueva versión
NEW_VERSION=$(node -p "require('./package.json').version")
echo "✨ Nueva versión: $NEW_VERSION"

# Confirmar cambios
echo "🎯 Versión incrementada exitosamente de $CURRENT_VERSION → $NEW_VERSION"