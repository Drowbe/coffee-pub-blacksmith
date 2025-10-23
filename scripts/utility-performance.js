// ================================================================== 
// ===== PERFORMANCE UTILITY =======================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * Performance monitoring utility for memory and resource tracking
 */
export class PerformanceUtility {
    
    // Cache for memory values to avoid frequent API calls
    static _memoryCache = {
        data: null,
        lastUpdate: 0,
        updateInterval: 5000 // Default 5 seconds, will be updated from settings
    };
    
    /**
     * Get cached memory info or update if needed
     * @returns {Object} Memory stats object
     */
    static _getCachedMemoryInfo() {
        const now = Date.now();
        
        // Update interval from settings
        const pollIntervalSeconds = game.settings.get(MODULE.ID, 'menubarPerformancePollInterval') || 5;
        const pollIntervalMs = pollIntervalSeconds * 1000;
        
        // Return cached data if it's still fresh
        if (this._memoryCache.data && (now - this._memoryCache.lastUpdate) < pollIntervalMs) {
            return this._memoryCache.data;
        }
        
        // Update cache with fresh data
        this._memoryCache.data = this.getMemoryInfo();
        this._memoryCache.lastUpdate = now;
        
        return this._memoryCache.data;
    }
    
    /**
     * Get client-side memory information
     * @returns {Object} Memory stats object
     */
    static getClientMemoryInfo() {
        if (!performance.memory) {
            return {
                available: false,
                used: "Unavailable",
                total: "Unavailable",
                limit: "Unavailable",
                usedMB: 0,
                totalMB: 0,
                limitMB: 0
            };
        }

        const usedMB = performance.memory.usedJSHeapSize / 1048576;
        const totalMB = performance.memory.totalJSHeapSize / 1048576;
        const limitMB = performance.memory.jsHeapSizeLimit / 1048576;

        return {
            available: true,
            used: `${usedMB.toFixed(1)} MB`,
            total: `${totalMB.toFixed(1)} MB`,
            limit: `${limitMB.toFixed(1)} MB`,
            usedMB: usedMB,
            totalMB: totalMB,
            limitMB: limitMB
        };
    }

    /**
     * Get server-side memory information (if available)
     * @returns {Object} Memory stats object
     */
    static getServerMemoryInfo() {
        if (typeof process === "undefined" || !process.memoryUsage) {
            return {
                available: false,
                rss: "Unavailable",
                heapTotal: "Unavailable",
                heapUsed: "Unavailable",
                external: "Unavailable"
            };
        }

        const mem = process.memoryUsage();
        return {
            available: true,
            rss: `${(mem.rss / 1048576).toFixed(1)} MB`,
            heapTotal: `${(mem.heapTotal / 1048576).toFixed(1)} MB`,
            heapUsed: `${(mem.heapUsed / 1048576).toFixed(1)} MB`,
            external: `${(mem.external / 1048576).toFixed(1)} MB`
        };
    }

    /**
     * Get GPU texture memory information
     * @returns {Object} Texture memory stats object
     */
    static getGPUTextureMemoryInfo() {
        if (typeof PIXI === "undefined" || !PIXI.utils || !PIXI.utils.BaseTextureCache) {
            return {
                available: false,
                approxMB: "Unavailable",
                textureCount: 0
            };
        }

        const textures = Object.values(PIXI.utils.BaseTextureCache);
        let totalPixels = 0;
        let validTextures = 0;

        for (const texture of textures) {
            if (texture.valid) {
                totalPixels += texture.width * texture.height;
                validTextures++;
            }
        }

        const approxMB = (totalPixels * 4) / (1024 * 1024); // 4 bytes per pixel (RGBA)

        return {
            available: true,
            approxMB: `${approxMB.toFixed(1)} MB`,
            textureCount: validTextures,
            totalPixels: totalPixels
        };
    }

    /**
     * Get comprehensive memory information
     * @returns {Object} Complete memory stats
     */
    static getMemoryInfo() {
        const clientMem = this.getClientMemoryInfo();
        const serverMem = this.getServerMemoryInfo();
        const gpuMem = this.getGPUTextureMemoryInfo();

        return {
            client: clientMem,
            server: serverMem,
            gpu: gpuMem
        };
    }

    /**
     * Get formatted memory display string for the menubar (uses cache)
     * @returns {string} Formatted memory usage string
     */
    static getMemoryDisplayString() {
        const memInfo = this._getCachedMemoryInfo();
        const clientMem = memInfo.client;
        
        if (!clientMem.available) {
            return "Memory N/A";
        }

        return clientMem.used;
    }

    /**
     * Get detailed tooltip information (same as console output, uses cache)
     * @returns {string} HTML formatted tooltip
     */
    static getMemoryTooltip() {
        const memInfo = this._getCachedMemoryInfo();
        
        let tooltip = "<div style='text-align: left; font-family: monospace; font-size: 12px;'>";
        tooltip += "<strong>Memory Usage Information</strong><br><br>";
        
        // Client memory
        if (memInfo.client.available) {
            tooltip += `Client Heap:<br>`;
            tooltip += `  Used: ${memInfo.client.used}<br>`;
            tooltip += `  Total: ${memInfo.client.total}<br>`;
            tooltip += `  Limit: ${memInfo.client.limit}<br>`;
        } else {
            tooltip += "Client Heap: Unavailable<br>";
        }
        
        tooltip += "<br>";
        
        // Server memory
        if (memInfo.server.available) {
            tooltip += `Server Heap:<br>`;
            tooltip += `  Used: ${memInfo.server.heapUsed}<br>`;
            tooltip += `  Total: ${memInfo.server.heapTotal}<br>`;
            tooltip += `  RSS: ${memInfo.server.rss}<br>`;
            tooltip += `  External: ${memInfo.server.external}<br>`;
        } else {
            tooltip += "Server Heap: Unavailable<br>";
        }
        
        tooltip += "<br>";
        
        // GPU texture memory
        if (memInfo.gpu.available) {
            tooltip += `GPU Textures:<br>`;
            tooltip += `  Memory: ${memInfo.gpu.approxMB}<br>`;
            tooltip += `  Textures: ${memInfo.gpu.textureCount}<br>`;
        } else {
            tooltip += "GPU Textures: Unavailable<br>";
        }
        
        tooltip += "<br>";
        tooltip += "<em>Click to log detailed info to console</em>";
        tooltip += "</div>";
        
        return tooltip;
    }

    /**
     * Initialize performance monitoring (if needed for future enhancements)
     */
    static initialize() {
        postConsoleAndNotification(MODULE.NAME, "Performance Utility: Initialized", "", true, false);
    }
}
