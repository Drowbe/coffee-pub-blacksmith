// Import required modules
import { MODULE_ID } from './const.js';

export class SkillCheckDialog extends Application {
    constructor(data = {}) {
        super();
        this.actors = data.actors || [];
        this.skillName = data.skillName || 'inv'; // Default to investigation if not specified
        this.workspaceId = data.workspaceId || null;
        this.callback = data.callback || null;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            template: "modules/coffee-pub-blacksmith/templates/skill-check-window.hbs",
            id: "skill-check-dialog",
            title: "Configure Skill Check",
            width: 800,
            height: 600,
            classes: ['skill-check-dialog'],
            resizable: true
        });
    }

    getData() {
        // Get all skills from the system
        const skills = Object.entries(CONFIG.DND5E.skills).map(([id, data]) => ({
            id,
            name: game.i18n.localize(data.label),
            icon: "fas fa-check",
            selected: id === this.skillName
        }));

        return {
            actors: this.actors,
            skills
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Handle actor selection
        html.find('.actor-item').click(ev => {
            const item = ev.currentTarget;
            item.classList.toggle('selected');
        });

        // Handle skill selection
        html.find('.skill-item').click(ev => {
            const item = ev.currentTarget;
            html.find('.skill-item').removeClass('selected');
            item.classList.add('selected');
        });

        // Handle dice selection
        html.find('.dice-btn').click(ev => {
            const btn = ev.currentTarget;
            html.find('.dice-btn').removeClass('selected');
            btn.classList.add('selected');
        });

        // Handle search inputs
        html.find('input[name="search"]').on('input', ev => {
            const searchTerm = ev.target.value.toLowerCase();
            const isActorSearch = ev.target.closest('.dialog-column').querySelector('.actor-list');
            
            if (isActorSearch) {
                html.find('.actor-item').each((i, item) => {
                    const name = item.querySelector('.actor-name').textContent.toLowerCase();
                    item.style.display = name.includes(searchTerm) ? '' : 'none';
                });
            } else {
                html.find('.skill-item').each((i, item) => {
                    const name = item.querySelector('span').textContent.toLowerCase();
                    item.style.display = name.includes(searchTerm) ? '' : 'none';
                });
            }
        });

        // Handle filter buttons
        html.find('.filter-btn').click(ev => {
            const btn = ev.currentTarget;
            const filter = btn.dataset.filter;
            
            html.find('.filter-btn').removeClass('active');
            btn.classList.add('active');
            
            // Implement filter logic here
            this._filterActors(html, filter);
        });

        // Handle the roll button
        html.find('button[data-button="roll"]').click(ev => {
            const selectedActors = html.find('.actor-item.selected');
            const selectedSkill = html.find('.skill-item.selected');
            
            if (selectedActors.length === 0) {
                ui.notifications.warn("Please select at least one actor.");
                return;
            }
            
            if (selectedSkill.length === 0) {
                ui.notifications.warn("Please select a skill.");
                return;
            }

            // Get form data
            const dc = html.find('input[name="dc"]').val();
            const showDC = html.find('input[name="showDC"]').prop('checked');
            const rollMode = html.find('select[name="rollMode"]').val();
            const description = html.find('textarea[name="description"]').val();
            const label = html.find('input[name="label"]').val();
            const selectedDice = html.find('.dice-btn.selected').data('dice');

            selectedActors.each((i, actorItem) => {
                const actorId = actorItem.dataset.actorId;
                const skillId = selectedSkill[0].dataset.skill;
                
                if (this.callback) {
                    this.callback(actorId, skillId, {
                        dc: dc || null,
                        showDC,
                        rollMode,
                        description: description || null,
                        label: label || game.i18n.localize(CONFIG.DND5E.skills[skillId].label),
                        dice: selectedDice || 'd20'
                    });
                }
            });

            this.close();
        });

        // Handle the cancel button
        html.find('button[data-button="cancel"]').click(() => this.close());
    }

    _filterActors(html, filter) {
        const actorItems = html.find('.actor-item');
        
        switch (filter) {
            case 'selected':
                actorItems.each((i, item) => {
                    item.style.display = item.classList.contains('selected') ? '' : 'none';
                });
                break;
            case 'canvas':
                // Show only tokens on the canvas
                const canvasTokenIds = canvas.tokens.placeables.map(t => t.actor?.id);
                actorItems.each((i, item) => {
                    item.style.display = canvasTokenIds.includes(item.dataset.actorId) ? '' : 'none';
                });
                break;
            case 'party':
                // Show actors marked as party members
                actorItems.each((i, item) => {
                    const actor = game.actors.get(item.dataset.actorId);
                    item.style.display = actor?.hasPlayerOwner ? '' : 'none';
                });
                break;
            default:
                actorItems.show();
        }
    }
} 