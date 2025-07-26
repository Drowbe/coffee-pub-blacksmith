// Encounter Toolbar Module
import { MODULE_ID, BLACKSMITH } from './const.js';
import { postConsoleAndNotification } from './global.js';
import { getCachedTemplate } from './blacksmith.js';

export class EncounterToolbar {
    static init() {
        Hooks.on('renderJournalSheet', this._onRenderJournalSheet.bind(this));
    }

    static async _onRenderJournalSheet(app, html, data) {
        // Check if toolbar is enabled in settings
        if (!game.settings.get(MODULE_ID, 'enableEncounterToolbar')) return;
        
        // Only proceed if this is a journal page view
        const journalPageElement = html.find('.journal-page-content');
        if (!journalPageElement.length) return;

        // Look for metadata in the journal content
        const metadataDiv = journalPageElement.find('div[data-journal-metadata]');
        if (!metadataDiv.length) return;

        // Check if this is an encounter
        const journalType = metadataDiv.data('journal-type');
        if (journalType.toLowerCase() !== 'encounter') return;

        try {
            // Parse the metadata
            const encodedData = metadataDiv.data('journal-metadata');
            const metadata = JSON.parse(decodeURIComponent(encodedData));
            
            // Log the metadata for debugging
            postConsoleAndNotification("BLACKSMITH | Found encounter metadata:", metadata, false, true, false);

            // Check if we have monsters
            const hasMonsters = metadata.monsters && metadata.monsters.length > 0;
            
            // Determine difficulty class for styling
            let difficultyClass = '';
            if (metadata.difficulty) {
                const difficulty = metadata.difficulty.toLowerCase();
                if (difficulty.includes('easy')) difficultyClass = 'easy';
                else if (difficulty.includes('medium')) difficultyClass = 'medium';
                else if (difficulty.includes('hard')) difficultyClass = 'hard';
                else if (difficulty.includes('deadly')) difficultyClass = 'deadly';
            }

            // Get the template
            const templatePath = `modules/${MODULE_ID}/templates/encounter-toolbar.hbs`;
            const template = await getCachedTemplate(templatePath);
            
            // Prepare the data for the template
            const templateData = {
                journalId: app.document.id,
                hasMonsters,
                difficulty: metadata.difficulty,
                difficultyClass,
                autoCreateCombat: game.settings.get(MODULE_ID, 'autoCreateCombatForEncounters')
            };
            
            // Render the toolbar
            const toolbarHtml = template(templateData);
            
            // Insert the toolbar at the top of the journal content
            journalPageElement.prepend(toolbarHtml);
            
            // Add event listeners to the buttons
            this._addEventListeners(html, metadata);
            
        } catch (error) {
            console.error("BLACKSMITH | Error processing encounter metadata:", error);
        }
    }

    static _addEventListeners(html, metadata) {
        // Deploy monsters button
        html.find('.deploy-monsters').click(async (event) => {
            event.preventDefault();
            this._deployMonsters(metadata);
        });
        
        // Roll initiative button
        html.find('.roll-initiative').click(async (event) => {
            event.preventDefault();
            this._rollInitiative(metadata);
        });
        
        // Create combat button
        html.find('.create-combat').click(async (event) => {
            event.preventDefault();
            this._createCombat(metadata);
        });
    }

    static async _deployMonsters(metadata) {
        if (!metadata.monsters || !metadata.monsters.length) {
            ui.notifications.warn("No monsters found in this encounter.");
            return;
        }
        
        // Get the current scene
        const scene = game.scenes.active;
        if (!scene) {
            ui.notifications.error("No active scene available.");
            return;
        }
        
        // Ask the user where to place the monsters
        const position = await this._getTargetPosition();
        if (!position) return;
        
        // Get deployment pattern from settings
        const deploymentPattern = game.settings.get(MODULE_ID, 'encounterToolbarDeploymentPattern');
        
        // Deploy the monsters based on selected pattern
        const deployedTokens = [];
        const numMonsters = metadata.monsters.length;
        
        for (let i = 0; i < numMonsters; i++) {
            const monsterUUID = metadata.monsters[i];
            
            try {
                // Get the actor from the UUID
                const actor = await fromUuid(monsterUUID);
                if (!actor) {
                    console.error(`BLACKSMITH | Actor not found for UUID: ${monsterUUID}`);
                    continue;
                }
                
                // Calculate position based on deployment pattern
                let x, y;
                
                switch (deploymentPattern) {
                    case "circle":
                        const radius = Math.max(3, numMonsters); // Scale radius with number of monsters
                        const angle = (i / numMonsters) * Math.PI * 2;
                        x = position.x + Math.cos(angle) * radius;
                        y = position.y + Math.sin(angle) * radius;
                        break;
                        
                    case "line":
                        const offset = (i - (numMonsters - 1) / 2) * 1.5; // Spread evenly with 1.5 grid spacing
                        x = position.x + offset;
                        y = position.y;
                        break;
                        
                    case "random":
                        const range = Math.max(3, numMonsters / 2); // Scale range with number of monsters
                        x = position.x + (Math.random() * range * 2 - range);
                        y = position.y + (Math.random() * range * 2 - range);
                        break;
                        
                    default:
                        // Default to circle if unknown pattern
                        const defaultRadius = Math.max(3, numMonsters);
                        const defaultAngle = (i / numMonsters) * Math.PI * 2;
                        x = position.x + Math.cos(defaultAngle) * defaultRadius;
                        y = position.y + Math.sin(defaultAngle) * defaultRadius;
                }
                
                // Create the token
                const tokenData = await actor.getTokenData();
                tokenData.x = x;
                tokenData.y = y;
                
                // Add to scene
                const [token] = await scene.createEmbeddedDocuments("Token", [tokenData]);
                deployedTokens.push(token);
                
            } catch (error) {
                console.error(`BLACKSMITH | Error deploying monster: ${error}`);
            }
        }
        
        ui.notifications.info(`Deployed ${deployedTokens.length} monsters to the scene.`);
        
        // Auto-create combat if enabled in settings
        if (deployedTokens.length > 0 && game.settings.get(MODULE_ID, 'autoCreateCombatForEncounters')) {
            await this._createCombat(metadata);
        }
    }
    
    static async _getTargetPosition() {
        return new Promise((resolve) => {
            // Display message to user
            ui.notifications.info("Click on the canvas to place monsters.");
            
            // Create a temporary handler for canvas clicks
            const handler = (event) => {
                // Get the position
                const position = canvas.grid.getSnappedPosition(event.data.origin.x, event.data.origin.y);
                
                // Clean up listener
                canvas.app.renderer.plugins.interaction.off('click', handler);
                ui.notifications.info("Position selected.");
                
                // Resolve with the position
                resolve(position);
            };
            
            // Add the listener
            canvas.app.renderer.plugins.interaction.on('click', handler);
            
            // Add a way to cancel
            $(document).on('keydown.encounter-deploy', (event) => {
                if (event.key === "Escape") {
                    $(document).off('keydown.encounter-deploy');
                    canvas.app.renderer.plugins.interaction.off('click', handler);
                    ui.notifications.info("Deployment cancelled.");
                    resolve(null);
                }
            });
        });
    }
    
    static async _rollInitiative(metadata) {
        const combat = game.combat;
        if (!combat) {
            ui.notifications.warn("No active combat encounter. Create or activate a combat first.");
            return;
        }
        
        const tokens = combat.combatants
            .filter(c => !c.initiative)
            .map(c => c.token);
        
        if (!tokens.length) {
            ui.notifications.info("All combatants already have initiative.");
            return;
        }
        
        await combat.rollInitiative(tokens.map(t => t.id));
        ui.notifications.info("Initiative rolled for all monsters.");
    }
    
    static async _createCombat(metadata) {
        if (!game.user.isGM) {
            ui.notifications.warn("Only the GM can create combat encounters.");
            return;
        }
        
        // Check if there's already an active combat
        if (game.combat && game.combat.active) {
            const proceed = await Dialog.confirm({
                title: "Combat Already Active",
                content: "There is already an active combat. Do you want to create a new one instead?",
                yes: () => true,
                no: () => false
            });
            
            if (!proceed) return;
        }
        
        // Get tokens on the current scene
        const scene = game.scenes.active;
        if (!scene) {
            ui.notifications.error("No active scene available.");
            return;
        }
        
        // Create a new combat
        const combat = await Combat.create({scene: scene.id});
        
        // Add all tokens on the canvas to the combat
        const tokens = canvas.tokens.placeables.filter(t => t.inCombat === false);
        if (!tokens.length) {
            ui.notifications.warn("No tokens found on the canvas to add to combat.");
            return;
        }
        
        // Add tokens to combat
        await combat.createEmbeddedDocuments("Combatant", tokens.map(t => ({
            tokenId: t.id,
            hidden: t.document.hidden
        })));
        
        // Roll initiative
        await combat.rollAll();
        
        ui.notifications.info("Combat created and initiative rolled.");
    }
} 