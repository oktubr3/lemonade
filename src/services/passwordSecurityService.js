// Password Security Service - Uses Firebase Functions backend with Gemini AI
import { auth } from "boot/firebase";
import { FUNCTIONS_URL } from "../config/functions";

class PasswordSecurityService {
    constructor() {
        // Auto-detects emulators vs production
        this.functionsBaseUrl = FUNCTIONS_URL;
    }

    async getAuthToken() {
        const user = auth.currentUser;
        if (!user) {
            throw new Error('User not authenticated');
        }
        
        // Use the store's cache system to avoid quota exceeded
        // TODO: Implement cache here too or use the one from the store
        return await user.getIdToken(false); // Use false to avoid unnecessary refresh
    }

    async checkPasswordSecurity(password, title = "Password Entry", url = null) {
        try {
            const token = await this.getAuthToken();
            
            const response = await fetch(`${this.functionsBaseUrl}/checkPasswordSecurity`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ 
                    password: password,
                    title: title,
                    url: url // Include URL for better analysis
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Failed to check password security');
            }

            const result = await response.json();
            return result.data;
            
        } catch (error) {
            console.error('❌ Error checking password security:', error);
            
            // Fallback analysis - basic client-side check (incluyendo URL)
            const fallbackResult = this.fallbackPasswordAnalysis(password, url);
            return fallbackResult;
        }
    }

    // Basic fallback analysis when there is no connectivity to Gemini
    fallbackPasswordAnalysis(password, url = null) {
        const analysis = {
            isCompromised: false,
            securityLevel: 'unknown',
            recommendations: [],
            confidence: 0.5,
            checkedWith: 'fallback'
        };

        // Basic checks
        const length = password.length;
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasNumbers = /\d/.test(password);
        const hasSpecialChars = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

        // ULTRA CONSERVATIVE: Only the 5 most compromised passwords in the world
        const extremelyCommonPasswords = [
            '123456', 'password', '123456789', 'qwerty', '12345'
        ];

        // NEW LOGIC: Only mark as compromised if it has an associated URL/site AND is ultra common
        const hasUrlOrSite = url && url.trim().length > 0;
        
        if (extremelyCommonPasswords.includes(password.toLowerCase()) && password.length <= 9) {
            if (hasUrlOrSite) {
                analysis.isCompromised = true;
                analysis.securityLevel = 'very_weak';
                analysis.recommendations.push('security.rec.ultraCommonWithSite');
            } else {
                // Ultra common but has no associated URL - only mark as weak
                analysis.isCompromised = false;
                analysis.securityLevel = 'very_weak';
                analysis.recommendations.push('security.rec.ultraCommonNoSite');
            }
        }

        // Evaluate basic strength
        let strength = 0;
        if (length >= 8) strength++;
        if (length >= 12) strength++;
        if (hasUpperCase) strength++;
        if (hasLowerCase) strength++;
        if (hasNumbers) strength++;
        if (hasSpecialChars) strength++;

        if (!analysis.isCompromised) {
            if (strength <= 2) {
                analysis.securityLevel = 'weak';
                analysis.recommendations.push('security.rec.consider12');
            } else if (strength <= 4) {
                analysis.securityLevel = 'medium';
            } else {
                analysis.securityLevel = 'strong';
            }
        }

        // Specific recommendations
        if (length < 8) {
            analysis.recommendations.push('security.rec.minChars');
        }
        if (!hasUpperCase) {
            analysis.recommendations.push('security.rec.uppercase');
        }
        if (!hasLowerCase) {
            analysis.recommendations.push('security.rec.lowercase');
        }
        if (!hasNumbers) {
            analysis.recommendations.push('security.rec.numbers');
        }
        if (!hasSpecialChars) {
            analysis.recommendations.push('security.rec.special');
        }

        return analysis;
    }

    // Check if the backend service is available
    async isBackendAvailable() {
        try {
            const response = await fetch(`${this.functionsBaseUrl}/healthCheck`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            return response.ok;
        } catch (error) {
            console.warn('Backend health check failed:', error);
            return false;
        }
    }

    // Get security statistics for multiple passwords (with rate limiting)
    async getSecurityStats(passwords) {
        const results = [];
        const delay = 300; // 300ms between each check to avoid rate limiting

        // Process one password at a time to avoid overloading the API
        for (const passData of passwords) {
            try {
                const analysis = await this.checkPasswordSecurity(passData.password, passData.title);
                results.push({
                    id: passData.id,
                    title: passData.title,
                    ...analysis
                });
                
                // Small pause between checks
                if (results.length < passwords.length) {
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            } catch (error) {
                console.warn(`Error checking password for ${passData.title}:`, error.message);
                // Continue with the next password on error
                results.push({
                    id: passData.id,
                    title: passData.title,
                    isCompromised: false,
                    securityLevel: 'unknown',
                    recommendations: ['security.errorChecking'],
                    confidence: 0,
                    checkedWith: 'error'
                });
            }
        }

        const stats = {
            total: results.length,
            compromised: results.filter(r => r.isCompromised).length,
            weak: results.filter(r => r.securityLevel === 'weak' || r.securityLevel === 'very_weak').length,
            medium: results.filter(r => r.securityLevel === 'medium').length,
            strong: results.filter(r => r.securityLevel === 'strong').length,
            results: results
        };

        return stats;
    }
}

export default new PasswordSecurityService();