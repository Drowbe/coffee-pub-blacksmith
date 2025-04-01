// Import required modules
import { MODULE_ID } from './const.js';

export class SkillCheckDialog extends Application {
    constructor(data = {}, options = {}) {
        super(options);
        this.data = data;
        this.callback = data.callback;
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            id: 'skill-check-dialog',
            template: 'modules/coffee-pub-blacksmith/templates/skill-check-window.hbs',
            title: 'Configure Skill Check',
            width: 800,
            height: 600,
            classes: ['coffee-pub-blacksmith', 'skill-check-dialog']
        });
    }

    getData() {
        // Get all available skills
        const skills = [
            { id: 'acr', name: 'Acrobatics', icon: 'fas fa-running' },
            { id: 'ani', name: 'Animal Handling', icon: 'fas fa-paw' },
            { id: 'arc', name: 'Arcana', icon: 'fas fa-hat-wizard' },
            { id: 'ath', name: 'Athletics', icon: 'fas fa-dumbbell' },
            { id: 'dec', name: 'Deception', icon: 'fas fa-theater-masks' },
            { id: 'his', name: 'History', icon: 'fas fa-book-open' },
            { id: 'ins', name: 'Insight', icon: 'fas fa-eye' },
            { id: 'itm', name: 'Intimidation', icon: 'fas fa-angry' },
            { id: 'inv', name: 'Investigation', icon: 'fas fa-search' },
            { id: 'med', name: 'Medicine', icon: 'fas fa-notes-medical' },
            { id: 'nat', name: 'Nature', icon: 'fas fa-leaf' },
            { id: 'prc', name: 'Perception', icon: 'fas fa-eye' },
            { id: 'prf', name: 'Performance', icon: 'fas fa-theater-masks' },
            { id: 'per', name: 'Persuasion', icon: 'fas fa-comments' },
            { id: 'rel', name: 'Religion', icon: 'fas fa-pray' },
            { id: 'slt', name: 'Sleight of Hand', icon: 'fas fa-hand-sparkles' },
            { id: 'ste', name: 'Stealth', icon: 'fas fa-user-ninja' },
            { id: 'sur', name: 'Survival', icon: 'fas fa-campground' }
        ];

        return {
            actors: this.data.actors,
            skills,
            selectedSkill: this.data.skillName
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        // Add click handler for actor selection
        html.find('.actor-item').click(event => {
            html.find('.actor-item').removeClass('selected');
            $(event.currentTarget).addClass('selected');
        });

        // Add click handler for skill selection
        html.find('.skill-item').click(event => {
            html.find('.skill-item').removeClass('selected');
            $(event.currentTarget).addClass('selected');
        });

        // Add filter button handlers
        html.find('.filter-btn').click(event => {
            const filter = event.currentTarget.dataset.filter;
            this._handleFilterClick(html, filter);
        });

        // Add search handlers
        html.find('input[name="search"]').on('input', event => {
            const input = event.currentTarget;
            const searchTerm = input.value.toLowerCase();
            const isActorSearch = input.closest('.dialog-column').querySelector('h2').textContent === 'Selected Players';
            
            if (isActorSearch) {
                this._filterActors(html, searchTerm);
            } else {
                this._filterSkills(html, searchTerm);
            }
        });

        // Add button handlers
        html.find('.dialog-button[data-button="roll"]').click(event => {
            const selectedActor = html.find('.actor-item.selected');
            const selectedSkill = html.find('.skill-item.selected');
            
            if (!selectedActor.length) {
                ui.notifications.warn("Please select a character first.");
                return;
            }
            
            if (!selectedSkill.length) {
                ui.notifications.warn("Please select a skill first.");
                return;
            }

            const actorId = selectedActor.data('actorId');
            const skillId = selectedSkill.data('skill');
            if (this.callback) this.callback(actorId, skillId);
            this.close();
        });

        html.find('.dialog-button[data-button="cancel"]').click(() => this.close());
    }

    _handleFilterClick(html, filter) {
        // Remove active class from all filter buttons
        const filterButtons = html.find('.filter-btn');
        filterButtons.removeClass('active');
        
        // Add active class to clicked button
        const clickedButton = html.find(`.filter-btn[data-filter="${filter}"]`);
        if (clickedButton.length) clickedButton.addClass('active');

        // Get all actor items
        const actorItems = html.find('.actor-list .actor-item');
        
        // Show all actors first
        actorItems.show();

        // Apply filter
        switch (filter) {
            case 'selected':
                // Show only actors that correspond to selected tokens
                const selectedTokenIds = canvas.tokens.controlled.map(t => t.actor?.id).filter(id => id);
                actorItems.each((i, item) => {
                    const actorId = $(item).data('actorId');
                    if (!selectedTokenIds.includes(actorId)) {
                        $(item).hide();
                    }
                });
                break;

            case 'canvas':
                // Show only actors that have tokens on the canvas
                const canvasTokenIds = canvas.tokens.placeables
                    .filter(t => t.actor?.type === 'character')
                    .map(t => t.actor.id);
                actorItems.each((i, item) => {
                    const actorId = $(item).data('actorId');
                    if (!canvasTokenIds.includes(actorId)) {
                        $(item).hide();
                    }
                });
                break;

            case 'party':
                // Show only actors that are in the party (have player owners)
                actorItems.each((i, item) => {
                    const actorId = $(item).data('actorId');
                    const actor = game.actors.get(actorId);
                    if (!actor?.hasPlayerOwner) {
                        $(item).hide();
                    }
                });
                break;

            default:
                // Show all actors first
                actorItems.show();
                break;
        }
    }

    _filterActors(html, searchTerm) {
        const actorItems = html.find('.actor-list .actor-item');
        actorItems.each((i, item) => {
            const $item = $(item);
            const actorName = $item.find('.actor-name').text().toLowerCase();
            const actorInfo = $item.find('.actor-info').text().toLowerCase();
            
            if (actorName.includes(searchTerm) || actorInfo.includes(searchTerm)) {
                $item.show();
            } else {
                $item.hide();
            }
        });
    }

    _filterSkills(html, searchTerm) {
        const skillItems = html.find('.skills-list .skill-item');
        skillItems.each((i, item) => {
            const $item = $(item);
            const skillName = $item.find('span').text().toLowerCase();
            
            if (skillName.includes(searchTerm)) {
                $item.show();
            } else {
                $item.hide();
            }
        });
    }
} 