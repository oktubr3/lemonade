/**
 * Search utilities - multi-word search with accent normalization and relevance scoring
 */

export const normalizeText = (text) => {
    if (!text) return ''
    return text
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
}

export const matchesSearch = (searchText, searchableFields) => {
    if (!searchText) return false

    const searchWords = normalizeText(searchText)
        .split(/\s+/)
        .filter(w => w.length > 0)

    if (searchWords.length === 0) return false

    const combinedText = normalizeText(
        searchableFields
            .filter(Boolean)
            .join(' ')
    )

    return searchWords.every(word => combinedText.includes(word))
}

// Fast-path match contra texto ya normalizado (para evitar re-normalizar por iteracion).
export const matchesNormalized = (searchWords, normalizedCombinedText) => {
    if (!searchWords || searchWords.length === 0) return false
    return searchWords.every(word => normalizedCombinedText.includes(word))
}

export const splitSearchWords = (searchText) => {
    return normalizeText(searchText)
        .split(/\s+/)
        .filter(w => w.length > 0)
}

export const calculateSearchScore = (itemText, searchText) => {
    const normalizedItem = normalizeText(itemText)
    const normalizedSearch = normalizeText(searchText)
    const searchWords = normalizedSearch.split(/\s+/).filter(w => w.length > 0)

    if (searchWords.length === 0) return 0

    let score = 0

    if (normalizedItem.startsWith(normalizedSearch)) {
        score += 10000
    }

    const positions = []
    for (const word of searchWords) {
        const pos = normalizedItem.indexOf(word)
        if (pos === -1) return 0
        positions.push(pos)
    }

    if (positions[0] === 0) {
        score += 5000
    } else {
        score += Math.max(0, 1000 - positions[0] * 50)
    }

    let inOrder = true
    for (let i = 1; i < positions.length; i++) {
        if (positions[i] < positions[i - 1]) {
            inOrder = false
            break
        }
    }
    if (inOrder) {
        score += 2000
    }

    if (positions.length > 1) {
        const firstPos = Math.min(...positions)
        const lastPos = Math.max(...positions)
        const span = lastPos - firstPos
        score += Math.max(0, 1000 - span * 10)
    }

    let allWholeWords = true
    for (const word of searchWords) {
        const regex = new RegExp(`\\b${word}\\b`)
        if (!regex.test(normalizedItem)) {
            allWholeWords = false
            break
        }
    }
    if (allWholeWords) {
        score += 500
    }

    return score
}

export const sortByRelevance = (items, searchText, nameField = 'name') => {
    return [...items].sort((a, b) => {
        const aText = a[nameField] || ''
        const bText = b[nameField] || ''
        const aScore = calculateSearchScore(aText, searchText)
        const bScore = calculateSearchScore(bText, searchText)

        if (bScore !== aScore) {
            return bScore - aScore
        }

        return aText.localeCompare(bText)
    })
}
