import { MODULE } from './const.js';
import { getSettingSafely } from './api-core.js';

function getActorLevel(actor) {
    const system = actor?.system ?? {};
    const classEntries = Object.values(system.classes ?? {});
    if (classEntries.length > 0) {
        const total = classEntries.reduce((sum, cls) => sum + Number(cls?.levels ?? 0), 0);
        if (total > 0) return total;
    }
    const detailLevel = Number(system.details?.level ?? system.attributes?.level ?? 0);
    return Number.isFinite(detailLevel) && detailLevel > 0 ? detailLevel : null;
}

function getActorClasses(actor) {
    const system = actor?.system ?? {};
    const classEntries = Object.values(system.classes ?? {});
    if (classEntries.length > 0) {
        return classEntries
            .map(cls => cls?.name || cls?.label || cls?.identifier || '')
            .filter(Boolean);
    }
    const fallback = system.details?.class ?? system.details?.archetype ?? '';
    return fallback ? [fallback] : [];
}

function getSelectedRulebookIds() {
    const configuredCount = getSettingSafely(MODULE.ID, 'numRulebooks', 0) ?? 0;
    const ids = [];
    for (let i = 1; i <= configuredCount; i++) {
        const id = getSettingSafely(MODULE.ID, `rulebookCompendium${i}`, 'none');
        if (id && id !== 'none') ids.push(id);
    }
    return ids;
}

function getSelectedPartyActorIds() {
    const configuredSize = getSettingSafely(MODULE.ID, 'defaultPartySize', 0) ?? 0;
    const ids = [];
    for (let i = 1; i <= configuredSize; i++) {
        const id = getSettingSafely(MODULE.ID, `partyMember${i}`, 'none');
        if (id && id !== 'none') ids.push(id);
    }
    return ids;
}

export class CampaignManager {
    static initialize() {
        return true;
    }

    static getCore() {
        const customRulebooks = getSettingSafely(MODULE.ID, 'defaultRulebooks', '') || '';
        const selectedRulebookIds = getSelectedRulebookIds();
        const compendiums = selectedRulebookIds
            .map(id => game.packs.get(id))
            .filter(Boolean)
            .map(pack => {
                const packageLabel = pack.metadata.packageLabel || pack.metadata.package || pack.metadata.packageName || '';
                const label = packageLabel ? `${packageLabel}: ${pack.metadata.label}` : pack.metadata.label;
                return {
                    id: pack.metadata.id,
                    label,
                    package: packageLabel,
                    type: pack.metadata.type
                };
            });

        return {
            name: getSettingSafely(MODULE.ID, 'defaultCampaignName', '') || '',
            rulesVersion: getSettingSafely(MODULE.ID, 'rulesVersion', '2024') || '2024',
            customRulebooks,
            rulebooks: {
                configuredCount: getSettingSafely(MODULE.ID, 'numRulebooks', 0) ?? 0,
                compendiums
            }
        };
    }

    static getGeography() {
        return {
            realm: getSettingSafely(MODULE.ID, 'defaultCampaignRealm', '') || '',
            region: getSettingSafely(MODULE.ID, 'defaultCampaignRegion', '') || '',
            site: getSettingSafely(MODULE.ID, 'defaultCampaignSite', '') || '',
            area: getSettingSafely(MODULE.ID, 'defaultCampaignArea', '') || ''
        };
    }

    static getParty() {
        const configuredSize = getSettingSafely(MODULE.ID, 'defaultPartySize', 0) ?? 0;
        const members = getSelectedPartyActorIds()
            .map(id => game.actors.get(id))
            .filter(Boolean)
            .map(actor => {
                const level = getActorLevel(actor);
                const classes = getActorClasses(actor);
                return {
                    id: actor.id,
                    uuid: actor.uuid,
                    name: actor.name,
                    img: actor.img,
                    actorType: actor.type,
                    level,
                    className: classes.join(', ') || null,
                    classes
                };
            });

        const levels = members.map(member => member.level).filter(level => Number.isFinite(level));
        const averageLevel = levels.length > 0
            ? Number((levels.reduce((sum, level) => sum + level, 0) / levels.length).toFixed(1))
            : null;

        return {
            name: getSettingSafely(MODULE.ID, 'defaultPartyName', 'Adventurers') || 'Adventurers',
            configuredSize,
            memberCount: members.length,
            members,
            summary: {
                averageLevel,
                levels,
                classNames: [...new Set(members.flatMap(member => member.classes).filter(Boolean))]
            }
        };
    }

    static getJournalDefaults() {
        return {
            narrative: {
                folder: getSettingSafely(MODULE.ID, 'defaultNarrativeFolder', 'New Narratives') || 'New Narratives',
                cardImage: getSettingSafely(MODULE.ID, 'narrativeDefaultCardImage', 'none') || 'none',
                imagePath: getSettingSafely(MODULE.ID, 'narrativeDefaultImagePath', '') || ''
            },
            encounter: {
                folder: getSettingSafely(MODULE.ID, 'encounterFolder', 'Encounters') || 'Encounters',
                cardImage: getSettingSafely(MODULE.ID, 'encounterDefaultCardImage', 'none') || 'none',
                imagePath: getSettingSafely(MODULE.ID, 'encounterDefaultImagePath', '') || ''
            }
        };
    }

    static getCampaign() {
        return {
            core: this.getCore(),
            geography: this.getGeography(),
            party: this.getParty(),
            journal: this.getJournalDefaults()
        };
    }

    static getRulebooksText() {
        const core = this.getCore();
        const parts = [
            ...core.rulebooks.compendiums.map(compendium => compendium.label),
            core.customRulebooks
        ].filter(Boolean);
        return parts.join(', ');
    }

    static getPartyMakeupText() {
        const party = this.getParty();
        if (party.members.length === 0) return '';
        return party.members
            .map(member => {
                const parts = [member.name];
                if (member.className) parts.push(`(${member.className}${member.level ? ` ${member.level}` : ''})`);
                else if (member.level) parts.push(`(Level ${member.level})`);
                return parts.join(' ');
            })
            .join(', ');
    }

    static getPromptContext() {
        const campaign = this.getCampaign();
        const legacyPartyLevel = getSettingSafely(MODULE.ID, 'defaultPartyLevel', '') || '';
        const legacyPartyMakeup = getSettingSafely(MODULE.ID, 'defaultPartyMakeup', '') || '';
        return {
            campaignName: campaign.core.name,
            rulesVersion: campaign.core.rulesVersion,
            rulebooks: this.getRulebooksText(),
            partySize: String(campaign.party.memberCount || campaign.party.configuredSize || ''),
            partyLevel: campaign.party.summary.averageLevel != null ? String(campaign.party.summary.averageLevel) : String(legacyPartyLevel || ''),
            partyMakeup: this.getPartyMakeupText() || legacyPartyMakeup,
            realm: campaign.geography.realm,
            region: campaign.geography.region,
            site: campaign.geography.site,
            area: campaign.geography.area,
            narrativeFolder: campaign.journal.narrative.folder,
            narrativeCardImage: campaign.journal.narrative.cardImage,
            narrativeImagePath: campaign.journal.narrative.imagePath,
            encounterFolder: campaign.journal.encounter.folder,
            encounterCardImage: campaign.journal.encounter.cardImage,
            encounterImagePath: campaign.journal.encounter.imagePath
        };
    }
}
