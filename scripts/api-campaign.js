import { CampaignManager } from './manager-campaign.js';

export const CampaignAPI = {
    getCampaign: () => CampaignManager.getCampaign(),
    getCore: () => CampaignManager.getCore(),
    getGeography: () => CampaignManager.getGeography(),
    getParty: () => CampaignManager.getParty(),
    getRulebooks: () => CampaignManager.getCore().rulebooks,
    getJournalDefaults: () => CampaignManager.getJournalDefaults(),
    getPromptContext: () => CampaignManager.getPromptContext()
};
