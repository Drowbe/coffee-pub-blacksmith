// ==================================================================
// ===== REGENT CORE ================================================
// ==================================================================

import { MODULE, REGENT } from './const.js';
import { postConsoleAndNotification } from './api-core.js';
import { OpenAIAPI } from './api-openai.js';

// Optional: use Blacksmith's playSound when available (same repo path)
async function playSoundSafe(sound, volume = 0.5) {
    try {
        const core = await import('/modules/coffee-pub-blacksmith/scripts/api-core.js');
        if (core.playSound && (window.COFFEEPUB?.SOUNDPOP02 || sound)) {
            core.playSound(sound || window.COFFEEPUB?.SOUNDPOP02, volume ?? window.COFFEEPUB?.SOUNDVOLUMESOFT ?? 0.5);
        }
    } catch (_) {}
}

const TEMPLATE_CACHE_EXPIRATION = 5 * 60 * 1000; // 5 minutes
const templateCache = new Map();

export async function getCachedTemplate(templatePath) {
    const now = Date.now();
    if (templateCache.has(templatePath)) {
        const cached = templateCache.get(templatePath);
        if ((now - cached.timestamp) < TEMPLATE_CACHE_EXPIRATION) return cached.template;
    }
    try {
        const response = await fetch(templatePath);
        const templateText = await response.text();
        const template = Handlebars.compile(templateText);
        templateCache.set(templatePath, { template, timestamp: now });
        return template;
    } catch (error) {
        postConsoleAndNotification(MODULE.NAME, `Error loading template ${templatePath}`, error, false, false);
        throw error;
    }
}

export function generateFormattedDate(format) {
    const now = new Date();
    const year = now.getFullYear();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const hours = now.getHours() <= 12 ? now.getHours() : now.getHours() - 12;
    const minutes = now.getMinutes();
    const am_pm = now.getHours() >= 12 ? 'PM' : 'AM';
    const paddedHours = hours < 10 ? `0${hours}` : hours;
    const paddedMinutes = minutes < 10 ? `0${minutes}` : minutes;
    const formattedTime = `${paddedHours}:${paddedMinutes} ${am_pm}`;
    const formattedDate = `${year}-${month}-${day}`;
    if (format === 'time') return formattedTime;
    if (format === 'date') return formattedDate;
    return `${formattedDate} ${formattedTime}`;
}

export function cleanAndValidateJSON(str) {
    try {
        const parsed = JSON.parse(str);
        if (typeof parsed !== 'object' || parsed === null) return { isValid: false };
        const plainTextFields = ['journaltype', 'foldername', 'sceneparent', 'scenearea', 'sceneenvironment', 'scenelocation', 'scenetitle', 'prepencounter', 'contextintro'];
        const cardPlainTextFields = ['cardtitle', 'cardimagetitle', 'cardimage', 'carddescriptionprimary', 'carddescriptionsecondary'];
        const listFields = ['prepencounterdetails', 'preprewards', 'prepsetup', 'contextadditionalnarration', 'contextatmosphere', 'contextgmnotes'];
        for (const field of plainTextFields) {
            if (parsed[field]) parsed[field] = parsed[field].replace(/<[^>]*>/g, '').trim();
        }
        for (const field of listFields) {
            if (parsed[field]) {
                let content = parsed[field].replace(/<h[1-6]>.*?<\/h[1-6]>/g, '');
                if (!content.startsWith('<ul>')) content = '<ul>' + content;
                if (!content.endsWith('</ul>')) content = content + '</ul>';
                parsed[field] = content;
            }
        }
        const cleanOneCard = (c) => {
            if (!c || typeof c !== 'object') return c;
            for (const field of cardPlainTextFields) {
                if (c[field]) c[field] = c[field].replace(/<[^>]*>/g, '').trim();
            }
            if (c.cardimage) {
                const match = c.cardimage.match(/src="([^"]*)"/);
                c.cardimage = match ? match[1] : c.cardimage;
                if (c.cardimage === '<img src="" alt="">' || !c.cardimage) c.cardimage = '';
            }
            if (c.carddialogue) {
                if (c.carddialogue === '<h4></h4>' || !c.carddialogue.trim()) c.carddialogue = ' ';
                else c.carddialogue = c.carddialogue.replace(/<h[1-5]>.*?<\/h[1-5]>/g, '').replace(/<(?!\/?(?:h6|b)(?:>|\s[^>]*>))\/?[a-zA-Z][^>]*>/g, '').trim();
            }
            return c;
        };
        const sectionPlainTextFields = ['sectiontitle', 'sectionintro'];
        const cleanOneSection = (sec) => {
            if (!sec || typeof sec !== 'object') return sec;
            for (const field of sectionPlainTextFields) {
                if (sec[field]) sec[field] = sec[field].replace(/<[^>]*>/g, '').trim();
            }
            if (Array.isArray(sec.cards)) sec.cards = sec.cards.map(cleanOneCard);
            return sec;
        };
        if (Array.isArray(parsed.sections) && parsed.sections.length > 0) {
            parsed.sections = parsed.sections.map(cleanOneSection);
        } else {
            const rawCards = Array.isArray(parsed.cards) && parsed.cards.length > 0 ? parsed.cards : [{
                cardtitle: parsed.cardtitle, carddescriptionprimary: parsed.carddescriptionprimary, cardimagetitle: parsed.cardimagetitle,
                cardimage: parsed.cardimage, carddescriptionsecondary: parsed.carddescriptionsecondary, carddialogue: parsed.carddialogue
            }];
            parsed.sections = [cleanOneSection({ sectiontitle: parsed.sectiontitle ?? '', sectionintro: parsed.sectionintro ?? '', cards: rawCards.map(cleanOneCard) })];
        }
        return { isValid: true, cleaned: JSON.stringify(parsed, null, 2), parsed };
    } catch (e) {
        return { isValid: false };
    }
}

function scrollToBottom() {
    const el = document.querySelector(`#${MODULE.ID}-output`);
    if (el) el.scrollTop = el.scrollHeight;
}

export async function buildQueryCard(question, queryWindow, queryContext = '') {
    const strQuestion = question;
    let strDisplayQuestion = question;
    let strAnswer = "";
    const strQueryContext = queryContext;
    const strDateStamp = generateFormattedDate();
    const templatePath = REGENT.WINDOW_QUERY_MESSAGE;
    const template = await getCachedTemplate(templatePath);

    if (strQueryContext) strDisplayQuestion = strQueryContext;

    let CARDDATA = {
        strDateStamp, blnProcessing: false, blnToolbar: false,
        strSpeakerIcon: "fa-helmet-battle", strHeaderStlye: "regent-message-header-question",
        strSpeakerName: game.user.name, strMessageIntro: "", strMessageContent: strDisplayQuestion
    };
    queryWindow.displayMessage(template(CARDDATA));
    scrollToBottom();
    await playSoundSafe(window.COFFEEPUB?.SOUNDPOP02, window.COFFEEPUB?.SOUNDVOLUMESOFT);

    CARDDATA = {
        strDateStamp, blnProcessing: true, blnToolbar: false,
        strSpeakerIcon: "fa-crystal-ball", strSpeakerName: "Regent",
        strMessageIntro: "Thinking...", strMessageContent: ""
    };
    queryWindow.displayMessage(template(CARDDATA));
    scrollToBottom();
    await playSoundSafe(window.COFFEEPUB?.SOUNDPOP01, window.COFFEEPUB?.SOUNDVOLUMESOFT);

    const openAIResponse = await OpenAIAPI.getOpenAIReplyAsHtml(strQuestion);
    const jsonCheck = cleanAndValidateJSON(openAIResponse.content || openAIResponse);
    strAnswer = jsonCheck.isValid ? jsonCheck.cleaned : (openAIResponse.content || openAIResponse);

    const messageId = Date.now();
    CARDDATA = {
        strDateStamp, blnProcessing: false, blnToolbar: true,
        strSpeakerIcon: "fa-crystal-ball", strHeaderStlye: "regent-message-header-answer",
        strSpeakerName: "Regent", strMessageIntro: "", strMessageContent: strAnswer,
        messageId, blnIsJSON: jsonCheck.isValid,
        tokenInfo: openAIResponse.usage ? `${openAIResponse.usage.total_tokens} Tokens` : null,
        cost: openAIResponse.cost ? openAIResponse.cost.toFixed(4) : null
    };
    queryWindow.displayMessage(template(CARDDATA));
    scrollToBottom();
    await playSoundSafe(window.COFFEEPUB?.SOUNDNOTIFICATION05, window.COFFEEPUB?.SOUNDVOLUMESOFT);
}

export async function buildButtonEventRegent(worksheet = 'default') {
    const { BlacksmithWindowQuery } = await import('./window-query.js');
    const queryWindow = new BlacksmithWindowQuery({}, worksheet);
    queryWindow.onFormSubmit = async (inputMessage, queryContext = '') => {
        await buildQueryCard(inputMessage, queryWindow, queryContext);
    };
    queryWindow.formTitle = REGENT.WINDOW_QUERY_TITLE;
    await playSoundSafe(window.COFFEEPUB?.SOUNDNOTIFICATION01, window.COFFEEPUB?.SOUNDVOLUMENORMAL);
    queryWindow.render(true);
    queryWindow.initialize();
}
