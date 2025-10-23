// ================================================================== 
// ===== PERFORMANCE UTILITY =======================================
// ================================================================== 

import { MODULE } from './const.js';
import { postConsoleAndNotification } from './api-core.js';

/**
 * Performance monitoring utility for memory and resource tracking
 */
export class PerformanceUtility {
    
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
     * Get formatted memory display string for the menubar
     * @returns {string} Formatted memory usage string
     */
    static getMemoryDisplayString() {
        const clientMem = this.getClientMemoryInfo();
        
        if (!clientMem.available) {
            return "Memory N/A";
        }

        return clientMem.used;
    }

    /**
     * Get detailed tooltip information
     * @returns {string} HTML formatted tooltip
     */
    static getMemoryTooltip() {
        const memInfo = this.getMemoryInfo();
        
        let tooltip = "<div style='text-align: left;'>";
        tooltip += "<strong>Memory Usage</strong><br><br>";
        
        // Client memory
        tooltip += "<strong>Client Heap:</strong><br>";
        if (memInfo.client.available) {
            tooltip += `Used: ${memInfo.client.used}<br>`;
            tooltip += `Total: ${memInfo.client.total}<br>`;
            tooltip += `Limit: ${memInfo.client.limit}<br>`;
        } else {
            tooltip += "Unavailable<br>";
        }
        
        tooltip += "<br>";
        
        // Server memory
        tooltip += "<strong>Server Heap:</strong><br>";
        if (memInfo.server.available) {
            tooltip += `Used: ${memInfo.server.heapUsed}<br>`;
            tooltip += `Total: ${memInfo.server.heapTotal}<br>`;
            tooltip += `RSS: ${memInfo.server.rss}<br>`;
            tooltip += `External: ${memInfo.server.external}<br>`;
        } else {
            tooltip += "Unavailable<br>";
        }
        
        tooltip += "<br>";
        
        // GPU texture memory
        tooltip += "<strong>GPU Textures:</strong><br>";
        if (memInfo.gpu.available) {
            tooltip += `Memory: ${memInfo.gpu.approxMB}<br>`;
            tooltip += `Textures: ${memInfo.gpu.textureCount}<br>`;
        } else {
            tooltip += "Unavailable<br>";
        }
        
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
